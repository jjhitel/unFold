'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { parseDomain, fromUrl, NO_HOSTNAME, ParseResultType } from 'parse-domain';

const { log } = util;
const REDIRECT_GUARD = new Map();
const REDIRECT_LIMIT = {
    windowMs: 2000,
    maxRedirects: 5
};

function etld1(urlString, {
    icannOnly = true
} = {}) {
    const hostname = fromUrl(urlString);
    if (hostname === NO_HOSTNAME)
        return null;
    const res = parseDomain(hostname);
    if (res.type !== ParseResultType.Listed)
        return null;
    const base = icannOnly ? res.icann : res;
    if (!base.domain || base.topLevelDomains.length === 0)
        return null;
    return `${base.domain}.${base.topLevelDomains.join('.')}`;
}

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
    try {
        const fromUrl = new URL(from);
        const toUrl = new URL(to);

        if (fromUrl.protocol === 'https:' && toUrl.protocol === 'http:') {
            log('Redirect blocked (HTTPS to HTTP downgrade)', {
                from,
                to
            });
            return false;
        }

        const fromSite = etld1(from, {
            icannOnly: true
        });
        const toSite = etld1(to, {
            icannOnly: true
        });
        if (!fromSite || !toSite || fromSite !== toSite) {
            log('Redirect blocked (cross-origin target)', {
                from,
                to
            });
            return false;
        }

    } catch (e) {
        log('Invalid URL for redirection safety check', e);
        return false;
    }

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
