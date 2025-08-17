'use strict';
import { util } from '../common/utils.js';
import { compileRules } from '../common/rule-compiler.js';
import { C } from '../common/constants.js';
import { HNTrieContainer } from '../common/hntrie.js';

const { log, normalizeList, debounce } = util;
const denylistTrie = new HNTrieContainer();
const allowlistTrie = new HNTrieContainer();
let denylistTrieRoot = 0;
let allowlistTrieRoot = 0;

const state = {
    mode: C.DEFAULT_MODE,
    threshold: C.DEFAULT_THRESHOLD,
    desktopUA: C.DEFAULT_DESKTOP_UA,
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

async function updateRules(data) {
    try {
        const g = data || await browser.storage.local.get(['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule']);
        const desktopRulesText = (g.desktopRegexText || '') + '\n' + (g.desktopRedirectRule || '');
        const mobileRulesText = (g.mobileRegexText || '') + '\n' + (g.mobileRedirectRule || '');
        const desktopRules = compileRules(desktopRulesText);
        const mobileRules = compileRules(mobileRulesText);

        const totalDesktopLines = desktopRulesText.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).length;
        const totalMobileLines = mobileRulesText.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).length;

        log('Redirect rules compiled', {
            desktop: {
                total: totalDesktopLines,
                compiled: desktopRules.length
            },
            mobile: {
                total: totalMobileLines,
                compiled: mobileRules.length
            }
        });

        state.desktopRedirectRules = desktopRules;
        state.mobileRedirectRules = mobileRules;

    } catch (e) {
        console.error('[FD] Failed to compile redirect rules:', e);
    }
}
async function updateLists(data) {
    try {
        const d = data || await browser.storage.local.get(['denylistText', 'allowlistText']);
        denylistTrie.reset();
        denylistTrieRoot = denylistTrie.createTrie();
        const denylist = normalizeList(d.denylistText);
        for (const host of denylist) {
            denylistTrie.setNeedle(host).add(denylistTrieRoot);
        }
        allowlistTrie.reset();
        allowlistTrieRoot = allowlistTrie.createTrie();
        const allowlist = normalizeList(d.allowlistText);
        for (const host of allowlist) {
            allowlistTrie.setNeedle(host).add(allowlistTrieRoot);
        }
        log('Deny/Allow Tries updated');
    } catch (e) {
        console.error('[FD] Failed to update lists:', e);
    }
}
async function refreshGeneralSettings(settings) {
    try {
        const s = settings || await browser.storage.local.get(null);
        const defaults = {
            [C.KEY_MODE]: C.DEFAULT_MODE,
            [C.KEY_THRESHOLD]: C.DEFAULT_THRESHOLD,
            [C.KEY_DESKTOP_UA]: C.DEFAULT_DESKTOP_UA,
            [C.KEY_AUTO_REFRESH]: C.DEFAULT_AUTO_REFRESH,
            [C.KEY_URL_REDIRECT]: C.DEFAULT_URL_REDIRECT,
            [C.KEY_DEBUG_MODE]: C.DEFAULT_DEBUG_MODE,
            [C.KEY_AUTO_UPDATE_PERIOD]: C.DEFAULT_AUTO_UPDATE_PERIOD,
            [C.KEY_ZOOM_LEVEL]: C.DEFAULT_ZOOM_LEVEL,
        };
        for (const key in defaults) {
            state[key] = s[key] ?? defaults[key];
        }
        if (globalThis.FD_ENV)
            globalThis.FD_ENV.DEBUG = state.debugMode;
        log('General settings refreshed');
    } catch (e) {
        console.error('[FD] Failed to refresh general settings:', e);
    }
}
async function refreshAllSettings() {
    const [settings, lists, rules] = await Promise.all([
                browser.storage.local.get(null),
                browser.storage.local.get(['denylistText', 'allowlistText']),
                browser.storage.local.get(['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule'])
            ]);
    await refreshGeneralSettings(settings);
    await updateLists(lists);
    await updateRules(rules);
    log('All settings refreshed');
}

export async function initialize() {
    await refreshAllSettings();
}

const handleStorageChange = debounce((changes, area) => {
    if (area !== 'local')
        return;
    const listKeys = ['denylistText', 'allowlistText'];
    const ruleKeys = ['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule'];
    const changedKeys = Object.keys(changes);
    let settingsChanged = false;
    let listsChanged = false;
    let rulesChanged = false;
    for (const key of changedKeys) {
        if (listKeys.includes(key)) {
            listsChanged = true;
        } else if (ruleKeys.includes(key)) {
            rulesChanged = true;
        } else {
            state[key] = changes[key].newValue;
            settingsChanged = true;
        }
    }
    if (settingsChanged) {
        if (globalThis.FD_ENV)
            globalThis.FD_ENV.DEBUG = state.debugMode;
        log('General settings updated selectively from storage change');
    }
    if (listsChanged)
        updateLists();
    if (rulesChanged)
        updateRules();
}, 250);

browser.storage.onChanged.addListener(handleStorageChange);
