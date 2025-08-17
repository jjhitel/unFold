'use strict';
import { util } from '../common/utils.js';
import { StateManager } from './stateManager.js';
import { onBeforeSendHeaders } from './userAgent-inject.js';
import { onBeforeRequest } from './url-redirect.js';
import { updateBadge } from './controller.js';

const { log } = util;
export const RELOAD_TIMES = new Map();
let isListenersRegistered = false;

export async function onViewportMessage(msg, sender) {
    const tabId = sender.tab.id;
    const state = StateManager.getState();
    const vw = msg.vvWidth || msg.innerWidth || 0;
    const sw = msg.screenWidth || 0;
    const w = (vw && sw) ? Math.min(vw, sw) : (vw || sw);
    const isNowWide = w >= state.threshold;
    const changed = StateManager.updateTabWidth(tabId, isNowWide);

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
    await updateBadge(tabId);
}

export function registerListeners() {
    if (isListenersRegistered)
        return;
    browser.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeaders, {
        urls: ["http://*/*", "https://*/*"],
        types: ["main_frame", "xmlhttprequest"]
    },
        ["blocking", "requestHeaders"]);
    browser.webRequest.onBeforeRequest.addListener(
        onBeforeRequest, {
        urls: ["http://*/*", "https://*/*"],
        types: ["main_frame"]
    },
        ["blocking"]);
    isListenersRegistered = true;
    log('Web request listeners registered');
}

export function unregisterListeners() {
    if (!isListenersRegistered)
        return;
    browser.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
    isListenersRegistered = false;
    log('Web request listeners unregistered');
}
