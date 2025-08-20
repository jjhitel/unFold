'use strict';
import { util } from './utils.js';
import QuickLRU from 'quick-lru';

const DEFAULT_MAX_SIZE = 50;
const CACHE_PREFIX = 'cache::';
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

const lruCache = new QuickLRU({
    maxSize: DEFAULT_MAX_SIZE,
    maxAge: DEFAULT_TTL
});

export const Cache = Object.freeze({
    _lru: lruCache,
    async get(key, ttl = DEFAULT_TTL) {
        let item = this._lru.get(key);
        if (item) {
            return item.data;
        }
        const storageKey = CACHE_PREFIX + key;
        const result = await browser.storage.local.get(storageKey).catch(() => null);
        if (result && result[storageKey]) {
            item = result[storageKey];
            if (Date.now() < item.expires) {
                this._lru.set(key, item, {
                    maxAge: item.expires - Date.now()
                });
                return item.data;
            } else {
                this.remove(key);
            }
        }
        return null;
    },
    async set(key, data, ttl = DEFAULT_TTL, forceNoPersist = false) {
        const expires = Date.now() + ttl;
        const item = {
            data,
            expires
        };
        this._lru.set(key, item, {
            maxAge: ttl
        });
        if (!forceNoPersist) {
            await browser.storage.local.set({
                [CACHE_PREFIX + key]: item
            }).catch((e) => {
                util.log(`[FD Cache] Failed to persist item for key: ${key}`, e);
            });
        }
    },
    async remove(key) {
        this._lru.delete(key);
        await browser.storage.local.remove(CACHE_PREFIX + key).catch((e) => {
            util.log(`[FD Cache] Failed to remove item from storage for key: ${key}`, e);
        });
    },
    async clear() {
        this._lru.clear();
        const allItems = await browser.storage.local.get(null).catch(() => ({}));
        const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(CACHE_PREFIX));
        if (keysToRemove.length > 0) {
            await browser.storage.local.remove(keysToRemove).catch(() => {});
            util.log(`Cache: Cleared ${keysToRemove.length} items from storage.`);
        }
    },
    async cleanup() {
        try {
            const allStorageItems = await browser.storage.local.get(null).catch(() => ({}));
            const expiredKeys = [];
            for (const key in allStorageItems) {
                if (key.startsWith(CACHE_PREFIX)) {
                    const item = allStorageItems[key];
                    if (item.expires && Date.now() > item.expires) {
                        expiredKeys.push(key);
                    }
                }
            }
            if (expiredKeys.length > 0) {
                await browser.storage.local.remove(expiredKeys).catch(() => {});
                util.log(`Cache cleanup: Removed ${expiredKeys.length} expired items from storage.`);
            }
        } catch (e) {
            console.error('[FD Cache] Cleanup failed:', e);
        }
    },
    getSize() {
        return this._lru.size;
    }
});
