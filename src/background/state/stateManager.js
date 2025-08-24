'use strict';
import { util } from '../../shared/utils.js';
import { C } from '../../shared/constants.js';
import { RuleManager, updateRules as ruleUpdateRules, updateLists as ruleUpdateLists, normalizeHost } from '../rules/ruleManager.js';
import { UAManager } from '../ua/uaManager.js';
const { log, normalizeList } = util;
let __hydrated = false;
let __hydrating = null;

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
    desktopRedirectRules: {
        all: [],
        hostMap: new Map(),
        generic: []
    },
    mobileRedirectRules: {
        all: [],
        hostMap: new Map(),
        generic: []
    },
    customDesktopRedirectRules: {
        all: [],
        hostMap: new Map(),
        generic: []
    },
    customMobileRedirectRules: {
        all: [],
        hostMap: new Map(),
        generic: []
    },
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
    ensureHydrated: async() => {
        if (__hydrated)
            return;
        if (__hydrating)
            return __hydrating;
        __hydrating = (async() => {
            await refreshAllSettings();
            __hydrated = true;
            __hydrating = null;
        })();
        return __hydrating;
    },
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
        const hadPrev = state.isWideByTab.has(tabId);
        const prev = state.isWideByTab.get(tabId);
        state.isWideByTab.set(tabId, isWide);
        state.lastKnownWide = isWide;
        return hadPrev ? (prev !== isWide) : false;
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

export async function refreshGeneralSettings(settings) {
    try {
        const s = settings || await browser.storage.local.get(null);
        const { dynamicUA, determinedUA } = await UAManager.resolve(s);
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
    __hydrated = true;
}

export function invalidate() {
    __hydrated = false;
}
