'use strict';
import { StateManager } from './stateManager.js';
import { util } from '../common/utils.js';
import { parse as tldtsParse } from 'tldts';
import { Cache } from '../common/cache.js';
import { normalizeHost } from './ruleManager.js';
import { shouldBlockRedirect } from './redirect-guard.js';

const { log } = util;

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

function shouldRedirect(tabId, fromUrl, toUrl) {
    try {
        if (fromUrl.protocol === 'https:' && toUrl.protocol === 'http:') {
            log('Redirect blocked (HTTPS to HTTP downgrade)', {
                from: fromUrl.href,
                to: toUrl.href
            });
            return false;
        }

        const fromSite = etld1(fromUrl.href, {
            icannOnly: true
        });
        const toSite = etld1(toUrl.href, {
            icannOnly: true
        });
        if (!fromSite || !toSite || fromSite !== toSite) {
            log('Redirect blocked (cross-origin target)', {
                from: fromUrl.href,
                to: toUrl.href
            });
            return false;
        }

    } catch (e) {
        log('Invalid URL for redirection safety check', e);
        return false;
    }

    return true;
}

function processRules(url, urlObj, tabId, rulesData, host) {
    const hostSpecificRules = rulesData.hostMap.get(host) || [];
    const relevantRules = [...hostSpecificRules, ...rulesData.generic];

    if (relevantRules.length === 0)
        return null;

    for (const rule of relevantRules) {
        try {
            if (rule.prefix && !url.startsWith(rule.prefix))
                continue;
            if (!rule.re.test(url))
                continue;

            const scheme = urlObj.protocol.replace(':', '');
            const to = url.replace(
                    rule.re,
                    String(rule.to || '').replace(/\{SCHEME\}/g, scheme));

            if (to && to !== url) {
                const toUrlObj = new URL(to);
                if (shouldRedirect(tabId, urlObj, toUrlObj)) {
                    log('Redirecting', {
                        from: url,
                        to,
                        rule: rule.re.source
                    });
                    return to;
                }
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

    let urlObj;
    try {
        urlObj = new URL(url);
    } catch {
        return {};
    }

    const host = util.extractHostname(url);
    if (!host)
        return {};

    const lowerCaseHost = host.toLowerCase();

    const isDenied = (state.mode === 'autoDeny' || state.mode === 'always') && StateManager.isHostInDenylist(host);
    const isEffectivelyMobile = StateManager.isMobilePreferred(tabId) || isDenied;

    let redirectUrl = null;

    const customBucket = isEffectivelyMobile ? state.customMobileRedirectRules : state.customDesktopRedirectRules;
    if (customBucket.all.length > 0) {
        redirectUrl = processRules(url, urlObj, tabId, customBucket, lowerCaseHost);
    }

    if (!redirectUrl && !isDenied) {
        const remoteBucket = isEffectivelyMobile ? state.mobileRedirectRules : state.desktopRedirectRules;
        if (remoteBucket.all.length > 0) {
            redirectUrl = processRules(url, urlObj, tabId, remoteBucket, lowerCaseHost);
        }
    }

    const cacheKey = `${tabId}:${isEffectivelyMobile ? 'm' : 'd'}:${url}`;
    await Cache.set(cacheKey, redirectUrl);

    if (redirectUrl) {
        const guard = shouldBlockRedirect(tabId, url, redirectUrl);
        if (guard.block) {
            log('[redirect-guard] blocked:', guard.reason, 'tab=', tabId, 'from=', url, 'to=', redirectUrl);
            return {};
        }
        return {
            redirectUrl
        };
    }

    return {};
}
