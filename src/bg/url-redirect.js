'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { parse as tldtsParse } from 'tldts';

const { log } = util;
const REDIRECT_GUARD = new Map();
const REDIRECT_LIMIT = {
    windowMs: 2000,
    maxRedirects: 5
};
const RULE_CACHE = new Map();
const CACHE_SIZE = 1000;

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

export async function onBeforeRequest(details) {
    const { tabId, url } = details;
    if (tabId === browser.tabs.TAB_ID_NONE) {
        return {};
    }
    const state = StateManager.getState();
    if (!state.urlRedirect || state.mode === 'off' || !/^https?:/i.test(url)) {
        return {};
    }

    const isMobile = StateManager.isMobilePreferred(tabId);
    const cacheKey = `${tabId}:${isMobile ? 'm' : 'd'}:${url}`;
    if (RULE_CACHE.has(cacheKey)) {
        const cachedResult = RULE_CACHE.get(cacheKey);
        RULE_CACHE.delete(cacheKey);
        RULE_CACHE.set(cacheKey, cachedResult);
        if (cachedResult !== null) {
            log('Redirect from cache:', {
                from: url,
                to: cachedResult
            });
            return {
                redirectUrl: cachedResult
            };
        }
        return {};
    }

    const bucket = isMobile ? state.mobileRedirectRules : state.desktopRedirectRules;

    let redirectUrl = null;
    if (bucket.length > 0) {
        for (const rule of bucket) {
            try {
                const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                const matched = rule.re.test(url);
                const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
                if (dt > 12) {
                    log('Redirect rule too slow; skipped', {
                        re: String(rule.re),
                        elapsedMs: dt
                    });
                    continue;
                }
                if (!matched)
                    continue;
                continue;
                const scheme = new URL(url).protocol.replace(':', '');
                const to = url.replace(
                        rule.re,
                        String(rule.to || '').replace(/\{SCHEME\}/g, scheme));
                if (to && to !== url && shouldRedirect(tabId, url, to)) {
                    redirectUrl = to;
                    log('Redirecting', {
                        from: url,
                        to
                    });
                    break;
                }
            } catch (e) {
                log('Redirect rule error', String(e));
            }
        }
    }

    if (RULE_CACHE.size >= CACHE_SIZE) {
        const oldestKey = RULE_CACHE.keys().next().value;
        RULE_CACHE.delete(oldestKey);
    }
    RULE_CACHE.set(cacheKey, redirectUrl);

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
