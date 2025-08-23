'use strict';
import '../common/env.js';
import { initialize as initializeStateManager, StateManager, getTargetHostPatterns, refreshGeneralSettings, updateLists, updateRules } from './stateManager.js';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { registerListeners, unregisterListeners } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';
import { Cache } from '../common/cache.js';
import { C } from '../common/constants.js';

const { log } = util;

export async function initBackground() {
    await boot();
}

async function refreshListeners() {
    unregisterListeners();
    const state = StateManager.getState();
    const shouldRegisterUA = state.mode !== 'off';
    const hasRedirectRules = state.desktopRedirectRules.length > 0 ||
        state.mobileRedirectRules.length > 0 ||
        state.customDesktopRedirectRules.length > 0 ||
        state.customMobileRedirectRules.length > 0;
    const shouldRegisterRedirect = state.urlRedirect && hasRedirectRules;

    if (shouldRegisterUA || shouldRegisterRedirect) {
        const patterns = await getTargetHostPatterns();
        if (patterns.length > 0) {
            registerListeners({
                patterns,
                shouldRegisterUA,
                shouldRegisterRedirect
            });
        }
    }
}

async function boot() {
    await Cache.cleanup();
    await initializeStateManager();
    const tabs = await browser.tabs.query({});
    await updateAllBadges();
    await createUpdateAlarm();
    await refreshListeners();

    log('unFold background script booted.');
}

const handleStorageChange = debounce(async(changes, area) => {
    if (area !== 'local')
        return;

    const changedKeys = Object.keys(changes);
    const listKeys = [C.KEY_DENYLIST, C.KEY_ALLOWLIST];
    const ruleKeys = [C.KEY_DESKTOP_RULES, C.KEY_MOBILE_RULES, C.KEY_REMOTE_DESKTOP_RULE, C.KEY_REMOTE_MOBILE_RULE];
    const generalKeys = [C.KEY_MODE, C.KEY_URL_REDIRECT, C.KEY_AUTO_REFRESH, C.KEY_THRESHOLD, C.KEY_DESKTOP_UA, C.KEY_UA_DYNAMIC, C.KEY_LAST_BROWSER_VERSION, C.KEY_DEBUG_MODE, C.KEY_AUTO_UPDATE_PERIOD, C.KEY_ZOOM_LEVEL, C.KEY_COMPAT_MODE, C.KEY_VERY_AGGRESSIVE_UA];

    let settingsChanged = false;
    let listsChanged = false;
    let rulesChanged = false;
    let needsListenerRefresh = false;
    let needsCacheClear = false;

    for (const key of changedKeys) {
        if (listKeys.includes(key)) {
            if (changes[key].oldValue !== changes[key].newValue) {
                listsChanged = true;
                needsListenerRefresh = true;
            }
        } else if (ruleKeys.includes(key) || key.startsWith(C.KEY_RULE_LAST_MODIFIED_PREFIX)) {
            if (changes[key].oldValue !== changes[key].newValue) {
                rulesChanged = true;
                needsCacheClear = true;
            }
        } else if (generalKeys.includes(key)) {
            if (changes[key].oldValue !== changes[key].newValue) {
                settingsChanged = true;
                if ([C.KEY_MODE, C.KEY_URL_REDIRECT, C.KEY_COMPAT_MODE, C.KEY_DESKTOP_UA, C.KEY_UA_DYNAMIC].includes(key)) {
                    needsListenerRefresh = true;
                }
                if ([C.KEY_MODE, C.KEY_URL_REDIRECT, C.KEY_COMPAT_MODE].includes(key)) {
                    needsCacheClear = true;
                }
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

    if (needsCacheClear) {
        log('Clearing cache due to a relevant settings change.');
        await Cache.clear();
    }

    if (needsListenerRefresh) {
        log('Settings changed, refreshing listeners...');
        await refreshListeners();
    }

    if (changes.autoUpdatePeriod) {
        await createUpdateAlarm();
    }
}, C.DEBOUNCE_MS_MEDIUM);

browser.storage.onChanged.addListener(handleStorageChange);

boot();
