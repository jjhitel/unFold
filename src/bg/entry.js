'use strict';
import '../common/env.js';
import { initialize as initializeStateManager, StateManager, getTargetHostPatterns, refreshGeneralSettings, updateLists, updateRules } from './stateManager.js';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { registerListeners, unregisterListeners } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';
import { Cache } from '../common/cache.js';

const { log } = util;

export async function initBackground() {
    try {
        await rotateSessionNamespace();
    } catch {}
    await boot();
}

async function refreshListeners() {
    unregisterListeners();
    const state = StateManager.getState();
    if (state.mode !== 'off') {
        const patterns = await getTargetHostPatterns();
        if (patterns.length > 0) {
            registerListeners(patterns);
        }
    }
}

async function cleanupStaleTabData() {
    try {
        const allStorage = await browser.storage.local.get(null);
        const tabKeys = Object.keys(allStorage).filter(k => k.startsWith('tab:'));
        if (tabKeys.length === 0)
            return;

        const openTabs = await browser.tabs.query({});
        const openTabIds = new Set(openTabs.map(t => t.id));

        const staleKeys = tabKeys.filter(key => {
            const parts = key.split(':');
            if (parts.length < 2)
                return false;
            const tabId = parseInt(parts[1], 10);
            return !isNaN(tabId) && !openTabIds.has(tabId);
        });

        if (staleKeys.length > 0) {
            await browser.storage.local.remove(staleKeys);
            log(`Cleaned up stale data for ${staleKeys.length} keys from closed tabs.`);
        }
    } catch (e) {
        log('Error during stale tab data cleanup:', e);
    }
}

async function boot() {
    await Cache.cleanup();
    await cleanupStaleTabData();
    await initializeStateManager();
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.map(t => StateManager.loadInitialTabState(t.id)));
    await updateAllBadges();
    await createUpdateAlarm();
    await refreshListeners();

    log('unFold background script booted.');
}

const handleStorageChange = debounce(async(changes, area) => {
    if (area !== 'local')
        return;

    const changedKeys = Object.keys(changes);
    const listKeys = ['denylistText', 'allowlistText'];
    const ruleKeys = ['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule'];

    let needsListenerRefresh = false;

    let settingsChanged = false;
    let listsChanged = false;
    let rulesChanged = false;

    for (const key of changedKeys) {
        if (listKeys.includes(key)) {
            listsChanged = true;
            needsListenerRefresh = true;
        } else if (ruleKeys.includes(key)) {
            rulesChanged = true;
        } else {
            settingsChanged = true;
            if (key === 'mode') {
                needsListenerRefresh = true;
            }
        }
    }

    const updatePromises = [];
    if (settingsChanged)
        updatePromises.push(refreshGeneralSettings());
    if (listsChanged)
        updatePromises.push(updateLists());
    if (rulesChanged)
        updatePromises.push(updateRules());

    await Promise.all(updatePromises);
    await updateAllBadges();

    if (needsListenerRefresh) {
        log('Settings changed, refreshing listeners...');
        await refreshListeners();
    }

    if (changes.autoUpdatePeriod) {
        await createUpdateAlarm();
    }
}, 250);

browser.storage.onChanged.addListener(handleStorageChange);

browser.runtime.onInstalled.addListener(async (info) => {
    try { await rotateSessionNamespace(); } catch {}
});

boot();
