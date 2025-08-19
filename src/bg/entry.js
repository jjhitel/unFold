'use strict';
import '../common/env.js';
import { initialize as initializeStateManager, StateManager, refreshGeneralSettings, updateLists, updateRules } from './stateManager.js';
import { util } from '../common/utils.js';
import { refreshAllRules } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';
import { Cache } from '../common/cache.js';

const { log, debounce } = util;

async function refreshRules() {
    await refreshAllRules();
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
    await updateAllBadges();
    await createUpdateAlarm();
    await refreshRules();

    log('unFold background script booted.');
}

const handleStorageChange = debounce(async(changes, area) => {
    if (area !== 'local')
        return;

    const changedKeys = Object.keys(changes);
    const listKeys = ['denylistText', 'allowlistText'];
    const ruleKeys = ['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule'];

    let needsRuleRefresh = false;

    let settingsChanged = false;
    let listsChanged = false;
    let rulesChanged = false;

    for (const key of changedKeys) {
        if (listKeys.includes(key)) {
            listsChanged = true;
            needsRuleRefresh = true;
        } else if (ruleKeys.includes(key)) {
            rulesChanged = true;
            needsRuleRefresh = true;
        } else {
            settingsChanged = true;
            if (key === 'mode') {
                needsRuleRefresh = true;
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

    if (needsRuleRefresh) {
        log('Settings changed, refreshing rules...');
        await refreshRules();
    }

    if (changes.autoUpdatePeriod) {
        await createUpdateAlarm();
    }
}, 250);

browser.storage.onChanged.addListener(handleStorageChange);

boot();
