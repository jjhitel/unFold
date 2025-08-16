(function () {
    'use strict';
    const { log } = FD.util;
    const stateManager = FD.state;
    const RELOAD_TIMES = new Map();
    let isListenersRegistered = false;
    async function onViewportMessage(msg, sender) {
        const tabId = sender.tab.id;
        const state = stateManager.getState();
        const vw = msg.vvWidth || msg.innerWidth || 0;
        const sw = msg.screenWidth || 0;
        const w = (vw && sw) ? Math.min(vw, sw) : (vw || sw);
        const isNowWide = w >= state.threshold;
        const changed = stateManager.updateTabWidth(tabId, isNowWide);
        if (changed && state.autoRefresh && (state.mode === 'autoDeny' || state.mode === 'autoAllow')) {
            const last = RELOAD_TIMES.get(tabId) || 0;
            const now = Date.now();
            if (now - last > 1200) {
                RELOAD_TIMES.set(tabId, now);
                try {
                    await browser.tabs.reload(tabId);
                } catch (e) {
                    log('Tab reload failed', e);
                }
            }
        }
        FD.updateBadge(tabId);
    }
    function registerListeners() {
        if (isListenersRegistered)
            return;
        browser.webRequest.onBeforeSendHeaders.addListener(
            FD.net.onBeforeSendHeaders, {
            urls: ["<all_urls>"]
        },
            ["blocking", "requestHeaders"]);
        browser.webRequest.onBeforeRequest.addListener(
            FD.net.onBeforeRequest, {
            urls: ["http://*/*", "https://*/*"],
            types: ["main_frame"]
        },
            ["blocking"]);
        isListenersRegistered = true;
        log('Web request listeners registered');
    }
    function unregisterListeners() {
        if (!isListenersRegistered)
            return;
        browser.webRequest.onBeforeSendHeaders.removeListener(FD.net.onBeforeSendHeaders);
        browser.webRequest.onBeforeRequest.removeListener(FD.net.onBeforeRequest);
        isListenersRegistered = false;
        log('Web request listeners unregistered');
    }
    if (!globalThis.FD)
        globalThis.FD = {};
    if (!FD.net)
        FD.net = {};
    FD.net.onViewportMessage = onViewportMessage;
    FD.net.RELOAD_TIMES = RELOAD_TIMES;
    FD.net.registerListeners = registerListeners;
    FD.net.unregisterListeners = unregisterListeners;
})();
