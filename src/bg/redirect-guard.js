'use strict';
import { util } from '../common/utils.js';
import { parse as tldtsParse } from 'tldts';

const { log } = util;

const WINDOW_MS = 2500;
const MAX_TOTAL_HOPS = 10;
const MAX_SAME_TARGET = 2;

const history = new Map();

function now() {
    return Date.now();
}

function normalizeForLoop(u) {
    try {
        const url = new URL(u);
        return url.origin + url.pathname;
    } catch {
        return u;
    }
}

function etld1(u) {
    try {
        const p = tldtsParse(u);
        if (!p || !p.domain)
            return null;
        return p.publicSuffix ? `${p.domain}.${p.publicSuffix}` : p.domain;
    } catch {
        return null;
    }
}

export function clearGuardForTab(tabId) {
    history.delete(tabId);
}

export function shouldBlockRedirect(tabId, fromUrl, toUrl) {
    const t = now();
    const fromNorm = normalizeForLoop(fromUrl);
    const toNorm = normalizeForLoop(toUrl);

    if (fromNorm === toNorm) {
        return {
            block: true,
            reason: 'noop-redirect'
        };
    }

    const bucket = history.get(tabId) || [];
    const recent = bucket.filter(e => t - e.t <= WINDOW_MS);

    if (recent.length >= MAX_TOTAL_HOPS) {
        history.set(tabId, [...recent, {
                    t,
                    fromNorm,
                    toNorm,
                    fromURL: fromUrl,
                    toURL: toUrl
                }
            ]);
        return {
            block: true,
            reason: 'too-many-hops'
        };
    }

    const sameTargetCount = recent.filter(e => e.toNorm === toNorm).length;
    if (sameTargetCount >= MAX_SAME_TARGET) {
        history.set(tabId, [...recent, {
                    t,
                    fromNorm,
                    toNorm,
                    fromURL: fromUrl,
                    toURL: toUrl
                }
            ]);
        return {
            block: true,
            reason: 'same-target-repeats'
        };
    }

    const last = recent[recent.length - 1];
    if (last && last.fromNorm === toNorm && last.toNorm === fromNorm) {
        return {
            block: true,
            reason: 'ping-pong'
        };
    }

    if (last) {
        const lf = etld1(last.fromURL),
        lt = etld1(last.toURL);
        const cf = etld1(fromUrl),
        ct = etld1(toUrl);
        if (lf && lt && cf && ct) {
            if (lf === ct && lt === cf) {
                return {
                    block: true,
                    reason: 'host-ping-pong'
                };
            }
        }
    }

    history.set(tabId, [...recent, {
                t,
                fromNorm,
                toNorm,
                fromURL: fromUrl,
                toURL: toUrl
            }
        ]);
    return {
        block: false
    };
}
