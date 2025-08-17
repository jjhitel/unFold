'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';

const { log } = util;
const REDIRECT_GUARD = new Map();
const REDIRECT_LIMIT = {
    windowMs: 2000,
    maxRedirects: 5
};

function normalize(u) {
    try {
        const url = new URL(u);
        return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
    } catch {
        return String(u || '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '');
    }
}

function shouldRedirect(tabId, from, to) {
    from = normalize(from);
    to = normalize(to);

    const now = Date.now();
    let history = REDIRECT_GUARD.get(tabId) || [];

    history = history.filter(item => now - item.ts < REDIRECT_LIMIT.windowMs);

    if (history.some(item => item.url === to)) {
        log('Redirect suppressed (loop detected in history)', {
            from: from,
            to: to
        });
        return false;
    }

    if (history.length >= REDIRECT_LIMIT.maxRedirects) {
        log('Redirect suppressed (limit exceeded)', {
            from: from,
            to: to
        });
        return false;
    }

    history.push({
        url: to,
        ts: now
    });
    REDIRECT_GUARD.set(tabId, history);

    return true;
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
            const scheme = new URL(url).protocol.replace(':', '');
            const to = url.replace(
                    rule.re,
                    String(rule.to || '').replace(/\{SCHEME\}/g, scheme));
            if (to && to !== url && shouldRedirect(tabId, url, to)) {
                log('Redirecting', {
                    from: url,
                    to
                });
                return {
                    redirectUrl: to
                };
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
