'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { C } from '../common/constants.js';

const { extractHostname } = util;
const UA_HEADER = 'user-agent';
const CLIENT_HINTS_HEADERS = ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version', 'sec-ch-ua-model'];

function headersToBag(headers) {
    const bag = new Map();
    for (let i = 0; i < headers.length; i++)
        bag.set(headers[i].name.toLowerCase(), i);
    return {
        set(name, value) {
            const lname = name.toLowerCase();
            const idx = bag.get(lname);
            if (idx != null)
                headers[idx].value = value;
            else {
                headers.push({
                    name,
                    value
                });
                bag.set(lname, headers.length - 1);
            }
        },
        remove(name) {
            const lname = name.toLowerCase();
            const idx = bag.get(lname);
            if (idx != null) {
                headers.splice(idx, 1);
                bag.delete(lname);
            }
        },
    };
}

function shimUA(ua) {
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
    const state = StateManager.getState();
    if (state.mode === 'off')
        return {};
    const host = extractHostname(url);
    const isDesktop = (state.mode === 'always') || StateManager.isDesktopPreferred(tabId);
    if (!isDesktop)
        return {};
    if (state.mode === 'autoAllow' && !StateManager.isHostInAllowlist(host))
        return {};
    if (state.mode !== 'autoAllow' && StateManager.isHostInDenylist(host))
        return {};
    if (!state.liteMode && (details.type === 'sub_frame' || details.type === 'xmlhttprequest')) {
        const topUrl = details.documentUrl || details.originUrl || details.initiator || '';
        const topHost = extractHostname(topUrl) || host;
        const isThirdParty = (topHost && host) ? (topHost !== host) : false;
        if (isThirdParty && !state.veryAggressiveUA) {
            return {};
        }
    }

    const headers = details.requestHeaders || [];
    const bag = headersToBag(headers);

    CLIENT_HINTS_HEADERS.forEach(header => bag.remove(header));

    setOrAddUAHeader(headers, state.desktopUA);
    if (state.debugMode) {
        try {
            console.debug('[FD] UA applied:', state.desktopUA);
        } catch {}
    }
    try {
        if (details.type === 'main_frame' && details.frameId === 0 && tabId !== browser.tabs.TAB_ID_NONE) {
            browser.scripting.executeScript({
                target: {
                    tabId,
                    allFrames: !state.liteMode
                },
                injectImmediately: true,
                world: "MAIN",
                func: shimUA,
                args: [state.desktopUA]
            }).catch(() => {});
        }
    } catch (e) {}
    return {
        requestHeaders: headers
    };
}
