(async function () {
    'use strict';
    const stateManager = FD.state;
    const { log } = FD.util;
    const { registerListeners, unregisterListeners } = FD.net;
    const C = FD.constants;

    async function boot() {
        await stateManager.initialize();
        await FD.updateAllBadges();
        await FD.createUpdateAlarm();

        log('unFold background script booted.');
        const state = stateManager.getState();
        if (state.mode !== 'off') {
            registerListeners();
        }
    }

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.mode) {
            const mode = changes.mode.newValue;
            if (mode === 'off') {
                unregisterListeners();
            } else {
                registerListeners();
            }
        }
        if (area === 'local' && changes.autoUpdatePeriod) {
            FD.createUpdateAlarm();
        }
    });

    boot();
})();
