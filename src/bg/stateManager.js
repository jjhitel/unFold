'use strict';
import { util } from '../common/utils.js';
import { compileRules } from '../common/rule-compiler.js';
import { C } from '../common/constants.js';
import { HNTrieContainer } from '../common/hntrie.js';

const { log, normalizeList, debounce } = util;
let _prevDenyText = null, _prevAllowText = null;
let _prevDesktopRulesText = null, _prevMobileRulesText = null;

const denylistTrie = new HNTrieContainer();
const allowlistTrie = new HNTrieContainer();
let denylistTrieRoot = 0;
let allowlistTrieRoot = 0;

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
    desktopRedirectRules: [],
    mobileRedirectRules: [],
    isWideByTab: new Map(),
    stickyMobileByTab: new Map(),
    lastKnownWide: undefined,
};

export async function getTargetHostPatterns() {
    const { denylistText = '', allowlistText = '' } = await browser.storage.local.get(['denylistText', 'allowlistText']);
    const hosts = new Set();

    const addHostsFromString = (text) => {
        if (!text)
            return;
        for (const host of normalizeList(text)) {
            hosts.add(host);
        }
    };

    addHostsFromString(denylistText);
    addHostsFromString(allowlistText);

    if (hosts.size === 0) {
        return ["<all_urls>"];
    }

    const patterns = [];
    for (const host of hosts) {
        const domain = host.startsWith('*.') ? host.substring(1) : host;
        patterns.push(`*://${domain}/*`);
        patterns.push(`*://*.${domain}/*`);
    }

    return [...new Set(patterns)];
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
        state.isWideByTab.set(tabId, isWide);
        state.lastKnownWide = isWide;
        try {
            browser.sessions.setTabValue(tabId, 'fd_isWide', !!isWide);
        } catch (e) {
            log('setTabValue(isWide) failed', e);
        }
        return prev !== isWide;
    },
    updateStickyMobile: async(tabId, sticky) => {
        if (sticky) {
            state.stickyMobileByTab.set(tabId, true);
        } else {
            state.stickyMobileByTab.delete(tabId);
        }
        try {
            await browser.sessions.setTabValue(tabId, 'fd_stickyMobile', !!sticky);
        } catch (e) {
            log('setTabValue(stickyMobile) failed', e);
        }
    },
    loadInitialTabState: async(tabId) => {
        try {
            const w = await browser.sessions.getTabValue(tabId, 'fd_isWide');
            if (typeof w === 'boolean')
                state.isWideByTab.set(tabId, w);
            const s = await browser.sessions.getTabValue(tabId, 'fd_stickyMobile');
            if (s === true)
                state.stickyMobileByTab.set(tabId, true);
            else
                state.stickyMobileByTab.delete(tabId);
        } catch (e) {}
    },
    isHostInDenylist: (host) => {
        if (!host || denylistTrieRoot === 0)
            return false;
        return denylistTrie.setNeedle(host).matches(denylistTrieRoot) !== -1;
    },
    isHostInAllowlist: (host) => {
        if (!host || allowlistTrieRoot === 0)
            return false;
        return allowlistTrie.setNeedle(host).matches(allowlistTrieRoot) !== -1;
    },
};

export async function updateRules(data) {
    try {
        const g = data || await browser.storage.local.get(['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule']);
        const desktopRulesText = ((g.desktopRegexText || '') + '\n' + (g.desktopRedirectRule || '')).trim();
        const mobileRulesText = ((g.mobileRegexText || '') + '\n' + (g.mobileRedirectRule || '')).trim();

        let desktopRules = state.desktopRedirectRules || [];
        let mobileRules = state.mobileRedirectRules || [];

        if (desktopRulesText !== _prevDesktopRulesText) {
            desktopRules = compileRules(desktopRulesText);
            state.desktopRedirectRules = desktopRules;
            _prevDesktopRulesText = desktopRulesText;
        }
        if (mobileRulesText !== _prevMobileRulesText) {
            mobileRules = compileRules(mobileRulesText);
            state.mobileRedirectRules = mobileRules;
            _prevMobileRulesText = mobileRulesText;
        }

        const totalDesktopLines = desktopRulesText.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).length;
        const totalMobileLines = mobileRulesText.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).length;

        log('Redirect rules compiled', {
            desktop: desktopRules.length,
            mobile: mobileRules.length,
            totalDesktopLines,
            totalMobileLines
        });
    } catch (e) {
        console.error('[FD] Failed to compile redirect rules:', e);
    }
}
export async function updateLists(data) {
    try {
        const d = data || await browser.storage.local.get(['denylistText', 'allowlistText']);
        const denyText = d.denylistText || '';
        const allowText = d.allowlistText || '';
        if (denyText !== _prevDenyText) {
            _prevDenyText = denyText;
            denylistTrie.reset();
            denylistTrieRoot = denylistTrie.createTrie();
            for (const host of normalizeList(denyText))
                denylistTrie.setNeedle(host).add(denylistTrieRoot);
        }
        if (allowText !== _prevAllowText) {
            _prevAllowText = allowText;
            allowlistTrie.reset();
            allowlistTrieRoot = allowlistTrie.createTrie();
            for (const host of normalizeList(allowText))
                allowlistTrie.setNeedle(host).add(allowlistTrieRoot);
        }
        log('Deny/Allow Tries updated');
    } catch (e) {
        console.error('[FD] Failed to update lists:', e);
    }
}

async function buildDynamicDesktopUA() {
    try {
        const info = await browser.runtime.getBrowserInfo();
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

async function normalizeThreshold(v) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return C.DEFAULT_THRESHOLD;
    return Math.max(100, Math.min(5000, Math.round(n)));
}

export async function initialize() {
    await refreshAllSettings();
}
