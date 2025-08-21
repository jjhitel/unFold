'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { parse as tldtsParse } from 'tldts';
import { Cache } from '../common/cache.js';

const { log } = util;
const REDIRECT_GUARD = new Map();
const REDIRECT_LIMIT = {
    windowMs: 2000,
    maxRedirects: 5
};

function etld1(urlString) {
    try {
        const p = tldtsParse(urlString);
        if (!p || !p.domain)
            return null;
        return p.publicSuffix ? `${p.domain}.${p.publicSuffix}` : p.domain;
    } catch {
        return null;
    }
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

    history = history.filter(item => (now - item.ts) < REDIRECT_LIMIT.windowMs);

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

function processRules(url, tabId, rules) {
    for (const rule of rules) {
        try {
            if (rule.prefix && !url.startsWith(rule.prefix)) continue;
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
                return to;
            }
        } catch (e) {
            log('Redirect rule error', String(e));
        }
    }
    return null;
}

export async function onBeforeRequest(details) {
    const { tabId, url } = details;
    const state = StateManager.getState();
    if (!state.urlRedirect || state.mode === 'off' || !/^https?:/i.test(url)) {
        return {};
    }

    const host = util.extractHostname(url);

    const isDenied = (state.mode === 'autoDeny' || state.mode === 'always') && StateManager.isHostInDenylist(host);

    const isEffectivelyMobile = StateManager.isMobilePreferred(tabId) || isDenied;

    let redirectUrl = null;

    const customBucket = isEffectivelyMobile ? state.customMobileRedirectRules : state.customDesktopRedirectRules;
    if (customBucket.length > 0) {
        redirectUrl = processRules(url, tabId, customBucket);
    }

    if (!redirectUrl && !isDenied) {
        const remoteBucket = isEffectivelyMobile ? state.mobileRedirectRules : state.desktopRedirectRules;
        if (remoteBucket.length > 0) {
            redirectUrl = processRules(url, tabId, remoteBucket);
        }
    }

    const cacheKey = `${tabId}:${isEffectivelyMobile ? 'm' : 'd'}:${url}`;
    await Cache.set(cacheKey, redirectUrl);

    if (redirectUrl) {
        return {
            redirectUrl: redirectUrl
        };
    }

    return {};
}

export function clearRedirectGuard(tabId) {
    REDIRECT_GUARD.delete(tabId);
}
