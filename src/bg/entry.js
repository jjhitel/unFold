'use strict';
import '../common/env.js';
import { initialize as initializeStateManager, StateManager, getTargetHostPatterns, refreshGeneralSettings, updateLists, updateRules } from './stateManager.js';
import { util } from '../common/utils.js';
import { registerListeners, unregisterListeners } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';

const { log, debounce } = util;

async function refreshListeners() {
    unregisterListeners();
    const state = StateManager.getState();
    if (state.mode !== 'off') {
        const patterns = await getTargetHostPatterns();
        registerListeners(patterns);
    }
}

async function boot() {
    await initializeStateManager();
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

    if (settingsChanged)
        await refreshGeneralSettings();
    if (listsChanged)
        await updateLists();
    if (rulesChanged)
        await updateRules();

    if (needsListenerRefresh) {
        log('Settings changed, refreshing listeners...');
        await refreshListeners();
    }

    if (changes.autoUpdatePeriod) {
        await createUpdateAlarm();
    }
}, 250);

browser.storage.onChanged.addListener(handleStorageChange);

boot();
