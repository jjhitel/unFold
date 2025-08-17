'use strict';
import '../common/env.js';
import { initialize as initializeStateManager, StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { registerListeners, unregisterListeners } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';

const { log } = util;

async function refreshListeners() {
    unregisterListeners();
    const state = StateManager.getState();
    if (state.mode !== 'off') {
        const patterns = getTargetHostPatterns();
        registerListeners(patterns);
    }
}

async function boot() {
    await initializeStateManager();
    await updateAllBadges();
    await createUpdateAlarm();
    await refreshListeners();

    log('unFold background script booted.');
    const state = StateManager.getState();
    if (state.mode !== 'off') {
        registerListeners();
    }
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local')
        return;

    if (changes.mode) {
        refreshListeners();
    }

    if (changes.denylistText || changes.allowlistText) {
        log('Host list changed, refreshing listeners...');
        refreshListeners();
    }

    if (changes.autoUpdatePeriod) {
        createUpdateAlarm();
    }
});

boot();
