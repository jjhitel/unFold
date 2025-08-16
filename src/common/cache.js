/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
(function () {
    'use strict';
    if (!globalThis.FD)
        globalThis.FD = {};

    const CACHE_PREFIX = 'cache::';
    const DEFAULT_TTL = 24 * 60 * 60 * 1000;

    const Cache = {

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
        }
    };

    FD.cache = Cache;
})();
