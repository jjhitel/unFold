'use strict';
import { util } from '../common/utils.js';
import { StateManager } from './stateManager.js';
import { onBeforeSendHeaders } from './ua-inject.js';
import { onBeforeRequest } from './url-redirect.js';
import { updateBadge } from './controller.js';

const { log } = util;
export const RELOAD_TIMES = new Map();
let isListenersRegistered = false;

function showAlertInPage(message) {
    if (document.getElementById('unfold-alerter-host'))
        return;

    const host = document.createElement('div');
    host.id = 'unfold-alerter-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({
        mode: 'open'
    });

    const style = document.createElement('style');
    style.textContent = `
        .banner {
            position: fixed; top: 0; left: 0; width: 100%;
            background-color: #FFA500;
            color: white;
            padding: 4px 0;
            font-family: sans-serif; font-size: 13px; font-weight: 500;
            z-index: 2147483647;
            text-align: center;
            opacity: 0;
            transform: translateY(-100%);
            transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
        }
    `;

    const banner = document.createElement('div');
    banner.className = 'banner';

    const bannerText = document.createElement('span');
    bannerText.className = 'banner-text';
    bannerText.textContent = message;

    banner.appendChild(bannerText);
    shadow.appendChild(style);
    shadow.appendChild(banner);

    requestAnimationFrame(() => {
        banner.style.opacity = '1';
        banner.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => host.remove(), 300);
    }, 4000);
}

function isSafeToReload(tabId) {
    return !StateManager.isFormDirty(tabId);
}

export async function onViewportMessage(msg, sender) {
    const tabId = sender.tab.id;
    const state = StateManager.getState();
    const vw = msg.vvWidth || msg.innerWidth || 0;
    const sw = msg.screenWidth || 0;
    const w = (vw && sw) ? Math.min(vw, sw) : (vw || sw);

    const prevWide = StateManager.isDesktopPreferred(tabId);
    const HYSTERESIS_PX = 100;
    const thresholdUp = state.threshold;
    const thresholdDown = Math.max(100, thresholdUp - HYSTERESIS_PX);

    const isNowWide = prevWide ? (w >= thresholdDown) : (w >= thresholdUp);
    const changed = StateManager.updateTabWidth(tabId, isNowWide);

    if (changed && state.autoRefresh && (state.mode === 'autoDeny' || state.mode === 'autoAllow')) {
        const last = RELOAD_TIMES.get(tabId) || 0;
        const now = Date.now();
        if (now - last > 1200) {
            RELOAD_TIMES.set(tabId, now);
            if (isSafeToReload(tabId)) {
                try {
                    await browser.tabs.reload(tabId);
                } catch (e) {
                    log('Tab reload failed', e);
                }
            } else {
                log(`Auto-refresh blocked for tab ${tabId} due to a dirty form.`);
                const message = browser.i18n.getMessage('notification_reloadBlocked_message');
                try {
                    await browser.scripting.executeScript({
                        target: {
                            tabId
                        },
                        injectImmediately: true,
                        world: "MAIN",
                        func: showAlertInPage,
                        args: [message]
                    });
                } catch (e) {
                    log('Failed to show in-page alert:', e);
                }
            }
        }
    }
    await updateBadge(tabId);
}

export function registerListeners(urlPatterns) {
    if (isListenersRegistered || !urlPatterns || urlPatterns.length === 0)
        return;

    const state = StateManager.getState();
    const headerListenerTypes = state.liteMode
         ? ["main_frame", "xmlhttprequest"]
         : ["main_frame", "sub_frame", "xmlhttprequest"];

    browser.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeaders, {
        urls: urlPatterns,
        types: headerListenerTypes
    },
        ["blocking", "requestHeaders"]);
    browser.webRequest.onBeforeRequest.addListener(
        onBeforeRequest, {
        urls: urlPatterns,
        types: ["main_frame", "sub_frame"]
    },
        ["blocking"]);
    isListenersRegistered = true;
    log('Web request listeners registered for patterns:', urlPatterns, 'Lite Mode:', state.liteMode);
}

export function unregisterListeners() {
    if (!isListenersRegistered)
        return;
    browser.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
    isListenersRegistered = false;
    log('Web request listeners unregistered');
}
