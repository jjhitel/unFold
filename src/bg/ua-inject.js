'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { Headers } from 'headers-polyfill';

const { extractHostname } = util;
const UA_HEADER = 'user-agent';
const CLIENT_HINTS_HEADERS = [
    'sec-ch-ua', 'sec-ch-ua-mobile',
    'sec-ch-ua-platform', 'sec-ch-ua-platform-version',
    'sec-ch-ua-model', 'sec-ch-ua-arch', 'sec-ch-ua-bitness',
    'sec-ch-ua-full-version', 'sec-ch-ua-full-version-list'
];

function setOrAddUAHeader(headers, ua) {
    headers.set('User-Agent', ua);
}

function shimUA(ua) {
    if (window.FD_UA_SHIMMED) {
        return;
    }
    window.FD_UA_SHIMMED = true;

    const rv = (ua.match(/rv:(\d+)/) || [])[1] || '0';
    const isWin = /Windows NT/i.test(ua);
    const isLinux = /Linux|X11/i.test(ua);
    const platform = isWin ? "Win32" : (isLinux ? "Linux x86_64" : "Linux x86_64");
    const oscpu = isWin ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64";
    const platformName = isWin ? "Windows" : "Linux";

    const def = (obj, key, val) => {
        try {
            Object.defineProperty(obj, key, {
                get: () => val,
                configurable: true
            });
        } catch (e) {}
    };

    def(Navigator.prototype, "userAgent", ua);
    def(Navigator.prototype, "appVersion", "5.0 (" + ua + ")");
    def(Navigator.prototype, "platform", platform);
    def(Navigator.prototype, "vendor", "");
    def(Navigator.prototype, "oscpu", oscpu);
    def(Navigator.prototype, "product", "Gecko");
    def(Navigator.prototype, "productSub", "20100101");
    def(Navigator.prototype, "maxTouchPoints", 0);

    const uad = {
        brands: [{
                brand: "Firefox",
                version: rv
            }
        ],
        mobile: false,
        platform: platformName,
        getHighEntropyValues: async(hints) => {
            const values = {
                "architecture": "x86",
                "bitness": "64",
                "model": "",
                "platformVersion": "",
                "uaFullVersion": rv,
            };
            return values;
        }
    };
    def(Navigator.prototype, "userAgentData", uad);
}

export async function onBeforeSendHeaders(details) {
    const { tabId, url } = details;
    if (tabId === browser.tabs.TAB_ID_NONE || !/^https?:/i.test(url)) {
        return {};
    }
    const state = StateManager.getState();
    if (state.mode === 'off')
        return {};
    const host = extractHostname(url);
    if (state.mode === 'autoDeny' || state.mode === 'always') {
        if (StateManager.isHostInDenylist(host)) {
            return {};
        }
    } else if (state.mode === 'autoAllow') {
        if (!StateManager.isHostInAllowlist(host)) {
            return {};
        }
    }
    const isDesktop = (state.mode === 'always') || StateManager.isDesktopPreferred(tabId);
    if (!isDesktop)
        return {};
    if (state.compatMode && (details.type === 'sub_frame' || details.type === 'xmlhttprequest')) {
        const host = extractHostname(url);
        const topUrl = details.documentUrl || details.originUrl || details.initiator || '';
        const topHost = extractHostname(topUrl) || host;
        const isThirdParty = (topHost && host) ? (topHost !== host) : false;
        if (isThirdParty && !state.veryAggressiveUA) {
            return {};
        }
    }

    const headers = new Headers();
    (details.requestHeaders || []).forEach(({
            name,
            value
        }) => headers.set(name, value));

    CLIENT_HINTS_HEADERS.forEach(header => headers.delete(header));

    setOrAddUAHeader(headers, state.desktopUA);
    if (state.debugMode) {
        try {
            console.debug('[FD] UA applied:', state.desktopUA);
        } catch {}
    }

    if (state.compatMode) {
        try {
            if (details.type === 'main_frame' && details.frameId === 0 && tabId !== browser.tabs.TAB_ID_NONE) {
                browser.scripting.executeScript({
                    target: {
                        tabId,
                        allFrames: true
                    },
                    injectImmediately: true,
                    world: "MAIN",
                    func: shimUA,
                    args: [state.desktopUA]
                }).catch((e) => {
                    log(`Failed to inject UA shim script into tab ${tabId}.`, e.message);
                });
            }
        } catch (e) {
            log(`Error executing script for UA shim in tab ${tabId}.`, e);
        }
    }

    const resultHeaders = [];
    headers.forEach((value, name) => {
        resultHeaders.push({
            name,
            value
        });
    });
    return {
        requestHeaders: resultHeaders
    };
}
