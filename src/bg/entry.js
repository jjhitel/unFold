'use strict';
import { initialize as initializeStateManager, StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { registerListeners, unregisterListeners } from './net.js';
import { createUpdateAlarm, updateAllBadges } from './controller.js';

const { log } = util;

async function boot() {
    await initializeStateManager();
    await updateAllBadges();
    await createUpdateAlarm();

    log('unFold background script booted.');
    const state = StateManager.getState();
    if (state.mode !== 'off') {
        registerListeners();
    }
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mode) {
        const mode = changes.mode.newValue;
        const oldMode = changes.mode.oldValue;
        if (mode === 'off' && oldMode !== 'off') {
            unregisterListeners();
        } else if (mode !== 'off' && oldMode === 'off') {
            registerListeners();
        }
    }
    if (area === 'local' && changes.autoUpdatePeriod) {
        createUpdateAlarm();
    }
});

boot();
