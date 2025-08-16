'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';

const { log } = util;
const REDIRECT_GUARD = new Map();
const REDIRECT_LIMIT = {
    windowMs: 2000,
    max: 2
};

function shouldRedirect(tabId, from, to) {
    from = String(from || '').replace(/\/+$/, '');
    to = String(to || '').replace(/\/+$/, '');
    if (!from || !to || from === to)
        return false;
    const now = Date.now();
    let g = REDIRECT_GUARD.get(tabId) || {
        ts: 0,
        count: 0,
        lastFrom: "",
        lastTo: ""
    };
    if (g.lastFrom === to && g.lastTo === from)
        return false;
    if (now - g.ts > REDIRECT_LIMIT.windowMs) {
        g = {
            ts: now,
            count: 0
        };
    }
    g.count += 1;
    g.lastFrom = from;
    g.lastTo = to;
    REDIRECT_GUARD.set(tabId, g);
    return g.count <= REDIRECT_LIMIT.max;
}

export async function onBeforeRequest(details) {
    const { tabId, url } = details;
    const state = StateManager.getState();
    if (!state.urlRedirect || state.mode === 'off' || !/^https?:/i.test(url)) {
        return {};
    }
    const isMobile = StateManager.isMobilePreferred(tabId);
    const bucket = isMobile ? state.mobileRedirectRules : state.desktopRedirectRules;
    if (bucket.length === 0)
        return {};
    for (const rule of bucket) {
        try {
            if (!rule.re.test(url))
                continue;
            const to = url.replace(rule.re, rule.to);
            if (to && to !== url && shouldRedirect(tabId, url, to)) {
                log('Redirecting', {
                    from: url,
                    to
                });
                return {
                    redirectUrl: to
                };
            }
            if (to && to !== url) {
                log('Redirect suppressed (loop/limit)', {
                    from: url,
                    to
                });
            }
        } catch (e) {
            log('Redirect rule error', String(e));
        }
    }
    return {};
}

export function clearRedirectGuard(tabId) {
    REDIRECT_GUARD.delete(tabId);
}
