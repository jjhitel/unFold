'use strict';
import { util } from '../common/utils.js';
import { C } from '../common/constants.js';

const { log } = util;

async function withTimeout(promise, ms) {
    return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
        ]);
}

async function buildDynamicDesktopUA() {
    try {
        const info = await withTimeout(browser.runtime.getBrowserInfo(), 150);
        const ver = String(info?.version || '');
        const m = ver.match(/^(\d+)(?:\.(\d+))?/);
        const major = m?.[1] ?? '141';
        const minor = m?.[2] ?? '0';
        const v = `${major}.${minor}`;
        return {
            ua: `Mozilla/5.0 (X11; Linux x86_64; rv:${v}) Gecko/20100101 Firefox/${v}`,
            version: v
        };
    } catch {
        return {
            ua: C.DEFAULT_DESKTOP_UA,
            version: '141.0'
        };
    }
}

function toBool(v, fallback = false) {
    if (typeof v === 'boolean')
        return v;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true')
            return true;
        if (s === 'false')
            return false;
    }
    return fallback;
}

function determineEffectiveUA(settings, dynamicUA) {
    const rawUaDyn = settings[C.KEY_UA_DYNAMIC];
    let uaDynamic = toBool(rawUaDyn, C.DEFAULT_UA_DYNAMIC);
    const storedUA = typeof settings[C.KEY_DESKTOP_UA] === 'string' ? settings[C.KEY_DESKTOP_UA].trim() : '';

    const keyMissing = (rawUaDyn === undefined);
    const hasCustomUA = !!storedUA && storedUA !== C.DEFAULT_DESKTOP_UA && storedUA !== dynamicUA.ua;

    if (keyMissing && hasCustomUA) {
        uaDynamic = false;
    }

    const desktopUA = (uaDynamic === false && hasCustomUA) ? storedUA : dynamicUA.ua;

    return {
        desktopUA,
        uaDynamic,
        storedUA,
        hasCustomUA
    };
}

async function persistUAChanges(settings, dynamicUA, determinedUA) {
    const { uaDynamic, storedUA, hasCustomUA } = determinedUA;
    const lastStoredVersion = settings[C.KEY_LAST_BROWSER_VERSION];

    if (uaDynamic) {
        const needsPersist = (storedUA !== dynamicUA.ua) || (lastStoredVersion !== dynamicUA.version) || (settings[C.KEY_UA_DYNAMIC] !== true);
        if (needsPersist) {
            await browser.storage.local.set({
                [C.KEY_DESKTOP_UA]: dynamicUA.ua,
                [C.KEY_UA_DYNAMIC]: true,
                [C.KEY_LAST_BROWSER_VERSION]: dynamicUA.version
            });
        }
    } else if (!hasCustomUA && storedUA) {
        await browser.storage.local.set({
            [C.KEY_UA_DYNAMIC]: false
        });
    }
}

export const UAManager = {
    resolve: async(settings) => {
        const dynamicUA = await buildDynamicDesktopUA();
        const determinedUA = determineEffectiveUA(settings, dynamicUA);
        await persistUAChanges(settings, dynamicUA, determinedUA);
        log('UA settings resolved', {
            desktopUA: determinedUA.desktopUA,
            uaDynamic: determinedUA.uaDynamic
        });
        return {
            dynamicUA,
            determinedUA
        };
    }
};
