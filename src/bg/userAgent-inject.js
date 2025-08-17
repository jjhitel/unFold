'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';

const { extractHostname } = util;
const UA_HEADER = 'user-agent';

function setOrAddUAHeader(headers, ua) {
    const uaHeader = headers.find(h => h.name.toLowerCase() === UA_HEADER);
    if (uaHeader) {
        uaHeader.value = ua;
    } else {
        headers.push({
            name: 'User-Agent',
            value: ua
        });
    }
}

function generateContentScript(ua) {
    const rv = (ua.match(/rv:(\d+)/) || [])[1] || '0';
    return `
      (function(){
        try {
          const UA = ${JSON.stringify(ua)};
          const def = (obj, key, val) => { try { Object.defineProperty(obj, key, { get: () => val, configurable: true }); } catch(e){} };
          def(Navigator.prototype, "userAgent", UA);
          def(Navigator.prototype, "appVersion", "5.0 (" + UA + ")");
          def(Navigator.prototype, "platform", "Linux x86_64");
          def(Navigator.prototype, "vendor", "");
          def(Navigator.prototype, "oscpu", "X11; Linux x86_64");
          def(Navigator.prototype, "product", "Gecko");
          def(Navigator.prototype, "productSub", "20100101");
          def(Navigator.prototype, "maxTouchPoints", 0);
          if (!("userAgentData" in Navigator.prototype)) {
            const uad = { brands: [{ brand: "Firefox", version: "${rv}" }], mobile: false, platform: "Linux" };
            def(Navigator.prototype, "userAgentData", uad);
          }
        } catch(e) {}
      })();
    `;
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
    const headers = details.requestHeaders || [];
    setOrAddUAHeader(headers, state.desktopUA);
    try {
        if (details.type === 'main_frame' && details.frameId === 0 && tabId !== browser.tabs.TAB_ID_NONE) {
            void browser.tabs.executeScript(tabId, {
                allFrames: true,
                runAt: 'document_start',
                matchAboutBlank: true,
                code: generateContentScript(state.desktopUA)
            });
        }
    } catch (e) {}
    return {
        requestHeaders: headers
    };
}
