'use strict';
import { util } from './utils.js';

const CACHE_PREFIX = 'cache::';
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

export const Cache = {

    async get(key) {
        const cacheKey = CACHE_PREFIX + key;
        try {
            const result = await browser.storage.local.get(cacheKey);
            const item = result[cacheKey];
            if (!item)
                return null;

            if (Date.now() < item.expires) {
                return item.data;
            }

            await this.remove(key);
            return null;
        } catch (e) {
            console.error(`[FD Cache] Failed to get item for key: ${key}`, e);
            return null;
        }
    },

    async set(key, data, ttl = DEFAULT_TTL) {
        const cacheKey = CACHE_PREFIX + key;
        const item = {
            data: data,
            expires: Date.now() + ttl,
        };
        try {
            await browser.storage.local.set({
                [cacheKey]: item
            });
        } catch (e) {
            console.error(`[FD Cache] Failed to set item for key: ${key}`, e);
        }
    },

    async remove(key) {
        const cacheKey = CACHE_PREFIX + key;
        try {
            await browser.storage.local.remove(cacheKey);
        } catch (e) {
            console.error(`[FD Cache] Failed to remove item for key: ${key}`, e);
        }
    },

    async cleanup() {
        try {
            const allItems = await browser.storage.local.get(null);
            const now = Date.now();
            const keysToRemove = [];

            for (const key in allItems) {
                if (key.startsWith(CACHE_PREFIX)) {
                    const item = allItems[key];
                    if (!item.expires || now > item.expires + DEFAULT_TTL) {
                        keysToRemove.push(key);
                    }
                }
            }

            if (keysToRemove.length > 0) {
                await browser.storage.local.remove(keysToRemove);
                util.log(`Cache cleanup: Removed ${keysToRemove.length} expired items.`);
            }
        } catch (e) {
            console.error('[FD Cache] Cleanup failed:', e);
        }
    }
};
