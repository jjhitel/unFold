'use strict';
import { util } from './utils.js';

const DEFAULT_MAX_SIZE = 50;
const CACHE_PREFIX = 'cache::';
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

export const Cache = {
    _cache: new Map(),
    _maxSize: DEFAULT_MAX_SIZE,

    async get(key) {
        try {
            const item = this._cache.get(key);
            if (!item)
                return null;
            if (Date.now() > item.expires) {
                this.remove(key);
                return null;
            }

            this._cache.delete(key);
            this._cache.set(key, item);

            return item.data;
        } catch (e) {
            console.error(`[FD Cache] Failed to get item for key: ${key}`, e);
            return null;
        }
    },

    async set(key, data, ttl = DEFAULT_TTL, forceNoPersist = false) {
        const item = {
            data,
            expires: Date.now() + ttl,
        };
        try {
            if (this._cache.size >= this._maxSize) {
                const oldestKey = this._cache.keys().next().value;
                this._cache.delete(oldestKey);
            }

            this._cache.set(key, item);

            if (!forceNoPersist) {
                await browser.storage.local.set({
                    [CACHE_PREFIX + key]: item
                });
            }
        } catch (e) {
            console.error(`[FD Cache] Failed to set item for key: ${key}`, e);
        }
    },

    async remove(key) {
        try {
            this._cache.delete(key);
            await browser.storage.local.remove(CACHE_PREFIX + key);
        } catch (e) {
            console.error(`[FD Cache] Failed to remove item for key: ${key}`, e);
        }
    },

    async cleanup() {
        try {
            const allItems = await browser.storage.local.get(null);
            const keysToRemove = [];

            for (const key in allItems) {
                if (key.startsWith(CACHE_PREFIX)) {
                    const item = allItems[key];
                    if (!item.expires || Date.now() > item.expires) {
                        keysToRemove.push(key);
                    }

                    this._cache.set(key.replace(CACHE_PREFIX, ''), item);
                }
            }

            if (keysToRemove.length > 0) {
                await browser.storage.local.remove(keysToRemove);
                util.log(`Cache cleanup: Removed ${keysToRemove.length} expired items.`);
            }
        } catch (e) {
            console.error('[FD Cache] Cleanup failed:', e);
        }
    },
    getSize() {
        return this._cache.size;
    }
}
