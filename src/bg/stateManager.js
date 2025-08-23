'use strict';
import { util } from '../common/utils.js';
import { C } from '../common/constants.js';
import { RuleManager, updateRules as ruleUpdateRules, updateLists as ruleUpdateLists, normalizeHost } from './ruleManager.js';
const { log, normalizeList } = util;

const state = {
    mode: C.DEFAULT_MODE,
    threshold: C.DEFAULT_THRESHOLD,
    desktopUA: C.DEFAULT_DESKTOP_UA,
    uaDynamic: C.DEFAULT_UA_DYNAMIC,
    runtimeUA: C.DEFAULT_DESKTOP_UA,
    autoRefresh: C.DEFAULT_AUTO_REFRESH,
    urlRedirect: C.DEFAULT_URL_REDIRECT,
    debugMode: C.DEFAULT_DEBUG_MODE,
    autoUpdatePeriod: C.DEFAULT_AUTO_UPDATE_PERIOD,
    zoomLevel: C.DEFAULT_ZOOM_LEVEL,
    compatMode: C.DEFAULT_COMPAT_MODE,
    veryAggressiveUA: C.DEFAULT_VERY_AGGRESSIVE_UA,
    desktopRedirectRules: [],
    mobileRedirectRules: [],
    customDesktopRedirectRules: [],
    customMobileRedirectRules: [],
    isWideByTab: new Map(),
    formDirtyByTab: new Map(),
    lastKnownWide: false,
};

export async function getTargetHostPatterns() {
    const { mode, allowlistText = '' } = await browser.storage.local.get(['mode', 'allowlistText']);

    if (mode === 'autoAllow') {
        const rawHosts = normalizeList(allowlistText);
        if (rawHosts.length === 0) {
            return [];
        }
        const patterns = new Set();
        for (const h of rawHosts) {
            const domain = normalizeHost(h);
            if (!domain)
                continue;
            patterns.add(`*://${domain}/*`);
            patterns.add(`*://*.${domain}/*`);
        }
        return Array.from(patterns);
    }

    return ["http://*/*", "https://*/*"];
}

export const StateManager = {
    getState: () => state,
    get: (key) => state[key],
    isDesktopPreferred: (tabId) => {
        const wide = state.isWideByTab.get(tabId);
        if (wide === true)
            return true;
        if (wide === false)
            return false;
        return state.lastKnownWide !== false;
    },
    isMobilePreferred: (tabId) => !StateManager.isDesktopPreferred(tabId),
    updateTabWidth: (tabId, isWide) => {
        const prev = state.isWideByTab.get(tabId);
        const prevEffective = (typeof prev === 'boolean')
         ? prev
         : (typeof state.lastKnownWide === 'boolean' ? state.lastKnownWide : undefined);
        state.isWideByTab.set(tabId, isWide);
        state.lastKnownWide = isWide;
        return (typeof prevEffective === 'boolean') ? (prevEffective !== isWide) : false;
    },
    updateFormDirty: async(tabId, isDirty) => {
        if (isDirty) {
            state.formDirtyByTab.set(tabId, true);
        } else {
            state.formDirtyByTab.delete(tabId);
        }
    },
    isFormDirty: (tabId) => {
        return state.formDirtyByTab.get(tabId) === true;
    },

    isHostInDenylist: (host) => RuleManager.isHostInDenylist(host),
    isHostInAllowlist: (host) => RuleManager.isHostInAllowlist(host),
};

export function cleanupTabState(tabId) {
    StateManager.getState().isWideByTab.delete(tabId);
    StateManager.getState().formDirtyByTab.delete(tabId);
}

export async function updateRules(data) {
    return ruleUpdateRules(state, data);
}

export async function updateLists(data) {
    return ruleUpdateLists(data);
}

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

function _determineEffectiveUA(s, dynamicUA) {
    const rawUaDyn = s[C.KEY_UA_DYNAMIC];
    let uaDynamic = toBool(rawUaDyn, C.DEFAULT_UA_DYNAMIC);
    const storedUA = typeof s[C.KEY_DESKTOP_UA] === 'string' ? s[C.KEY_DESKTOP_UA].trim() : '';

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

async function _persistUAChanges(s, dynamicUA, determinedUA) {
    const { uaDynamic, storedUA, hasCustomUA } = determinedUA;
    const lastStoredVersion = s[C.KEY_LAST_BROWSER_VERSION];

    if (uaDynamic) {
        const needsPersist = (storedUA !== dynamicUA.ua) || (lastStoredVersion !== dynamicUA.version) || (s[C.KEY_UA_DYNAMIC] !== true);
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

export async function refreshGeneralSettings(settings) {
    try {
        const s = settings || await browser.storage.local.get(null);
        const dynamicUA = await buildDynamicDesktopUA();

        const determinedUA = _determineEffectiveUA(s, dynamicUA);
        state.desktopUA = determinedUA.desktopUA;
        state.uaDynamic = determinedUA.uaDynamic;
        state.runtimeUA = dynamicUA.ua;

        state.mode = s[C.KEY_MODE] ?? C.DEFAULT_MODE;
        state.threshold = s[C.KEY_THRESHOLD] ?? C.DEFAULT_THRESHOLD;
        state.debugMode = s[C.KEY_DEBUG_MODE] ?? C.DEFAULT_DEBUG_MODE;
        state.autoRefresh = s[C.KEY_AUTO_REFRESH] ?? C.DEFAULT_AUTO_REFRESH;
        state.urlRedirect = s[C.KEY_URL_REDIRECT] ?? C.DEFAULT_URL_REDIRECT;
        state.autoUpdatePeriod = s[C.KEY_AUTO_UPDATE_PERIOD] ?? C.DEFAULT_AUTO_UPDATE_PERIOD;
        state.zoomLevel = s[C.KEY_ZOOM_LEVEL] ?? C.DEFAULT_ZOOM_LEVEL;
        state.compatMode = s[C.KEY_COMPAT_MODE] ?? C.DEFAULT_COMPAT_MODE;
        state.veryAggressiveUA = s[C.KEY_VERY_AGGRESSIVE_UA] ?? C.DEFAULT_VERY_AGGRESSIVE_UA;

        await _persistUAChanges(s, dynamicUA, determinedUA);

        if (state.threshold !== s[C.KEY_THRESHOLD]) {
            await browser.storage.local.set({
                [C.KEY_THRESHOLD]: state.threshold
            });
        }

        if (globalThis.FD_ENV)
            globalThis.FD_ENV.DEBUG = state.debugMode;
        log('General settings refreshed (UA mode:', state.uaDynamic ? 'dynamic' : 'static', ')', {
            desktopUA: state.desktopUA
        });

    } catch (e) {
        console.error('[FD] Failed to refresh general settings:', e);
    }
}
async function refreshAllSettings() {
    await refreshGeneralSettings();
    await updateLists();
    await updateRules();
    log('All settings refreshed');
}

export async function initialize() {
    await refreshAllSettings();
}
