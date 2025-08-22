'use strict';
import { util } from '../common/utils.js';
import { StateManager } from './stateManager.js';
import { onBeforeSendHeaders } from './ua-inject.js';
import { onBeforeRequest } from './url-redirect.js';
import { updateBadge } from './controller.js';
import { C } from '../common/constants.js';

const { log } = util;
const state = StateManager.getState();
export const RELOAD_TIMES = new Map();
let isUAListenerRegistered = false;
let isRedirectListenerRegistered = false;

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

function getEffectiveWidth(msg) {
    const widths = [msg.vvWidth, msg.innerWidth, msg.outerWidth, msg.screenWidth]
    .filter(w => typeof w === 'number' && w > 0);
    return widths.length ? Math.min(...widths) : 0;
}

function getFoldState(width, tabId) {
    const prevWide = StateManager.isDesktopPreferred(tabId);
    const HYSTERESIS_PX = 100;
    const thresholdUp = state.threshold;
    const thresholdDown = Math.max(100, thresholdUp - HYSTERESIS_PX);
    return prevWide ? (width >= thresholdDown) : (width >= thresholdUp);
}

async function handleAutoRefresh(tabId, changed) {
    if (!changed || !state.autoRefresh || (state.mode !== C.MODE_AUTO_DENY && state.mode !== C.MODE_AUTO_ALLOW)) {
        return;
    }

    const last = RELOAD_TIMES.get(tabId) || 0;
    const now = Date.now();
    if (now - last > C.RELOAD_COOLDOWN) {
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

export async function onViewportMessage(msg, sender) {
    const tabId = sender.tab.id;
    const effectiveWidth = getEffectiveWidth(msg);
    const isNowWide = getFoldState(effectiveWidth, tabId);

    const changed = StateManager.updateTabWidth(tabId, isNowWide);
    await handleAutoRefresh(tabId, changed);
    await updateBadge(tabId, isNowWide);
}

export function registerListeners({
    patterns,
    shouldRegisterUA,
    shouldRegisterRedirect
}) {
    if (!patterns || patterns.length === 0)
        return;

    const blockingOptions = ["blocking", "requestHeaders"];
    if (browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty('EXTRA_HEADERS')) {
        blockingOptions.push('extraHeaders');
    }

    if (shouldRegisterUA && !isUAListenerRegistered) {
        const headerListenerTypes = state.compatMode ?
            ["main_frame", "sub_frame", "xmlhttprequest"] :
            ["main_frame", "xmlhttprequest"];
        browser.webRequest.onBeforeSendHeaders.addListener(
            onBeforeSendHeaders, {
            urls: patterns,
            types: headerListenerTypes
        }, blockingOptions);
        isUAListenerRegistered = true;
        log('UA injection listener registered.');
    }

    if (shouldRegisterRedirect && !isRedirectListenerRegistered) {
        const requestListenerTypes = state.compatMode ? ["main_frame", "sub_frame"] : ["main_frame"];
        browser.webRequest.onBeforeRequest.addListener(
            onBeforeRequest, {
            urls: patterns,
            types: requestListenerTypes
        }, ["blocking"]);
        isRedirectListenerRegistered = true;
        log('URL redirect listener registered.');
    }
    log('Web request listeners registered. Compat Mode:', state.compatMode, 'Patterns:', patterns);
}

export function unregisterListeners() {
    if (isUAListenerRegistered) {
        browser.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
        isUAListenerRegistered = false;
    }
    if (isRedirectListenerRegistered) {
        browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
        isRedirectListenerRegistered = false;
    }
    log('Web request listeners unregistered');
}
