'use strict';

import { util } from '../common/utils.js';
import { compileRules } from '../common/rule-compiler.js';
import HNTrieContainer from '@gorhill/ubo-core/js/hntrie.js';
import { parse as tldtsParse } from 'tldts';

const { log, normalizeList } = util;

let _prevDenyText = null, _prevAllowText = null;
let _prevDesktopRulesText = null, _prevMobileRulesText = null;
let _prevRemoteDesktopRulesText = null, _prevRemoteMobileRulesText = null;

const denylistTrie = new HNTrieContainer();
const allowlistTrie = new HNTrieContainer();
let denylistTrieRoot = 0;
let allowlistTrieRoot = 0;

export function normalizeHost(host) {
    const h = String(host || '').trim().toLowerCase().replace(/^\*\./, '');
    if (!h)
        return '';
    try {
        const p = tldtsParse(h, {
            allowPrivateDomains: true
        });
        if (p && p.domain) {
            return p.domain;
        }
    } catch {}
    return h.replace(/^www\./, '');
}

function trieCreate(tc) {
    if (typeof tc.createOne === 'function')
        return tc.createOne();
    if (typeof tc.createTrie === 'function')
        return tc.createTrie();
    throw new Error('HNTrieContainer: no createOne/createTrie');
}
function trieAdd(tc, root, host) {
    if (typeof tc.add === 'function' && tc.add.length >= 2)
        return tc.add(root, host);
    if (typeof tc.addJS === 'function' && typeof tc.setNeedle === 'function') {
        tc.setNeedle(host);
        return tc.addJS(root);
    }
    if (typeof tc.add === 'function' && tc.add.length === 1 && typeof tc.setNeedle === 'function') {
        tc.setNeedle(host);
        return tc.add(root);
    }
    throw new Error('HNTrieContainer: no add/addJS(+setNeedle)');
}
function trieMatches(tc, root, host) {
    if (typeof tc.matches === 'function' && tc.matches.length >= 2)
        return tc.matches(root, host);
    if (typeof tc.matchesJS === 'function' && typeof tc.setNeedle === 'function') {
        tc.setNeedle(host);
        return tc.matchesJS(root);
    }
    if (typeof tc.matches === 'function' && tc.matches.length === 1 && typeof tc.setNeedle === 'function') {
        tc.setNeedle(host);
        return tc.matches(root);
    }
    return -1;
}

export function isHostInDenylist(host) {
    if (!host || denylistTrieRoot === 0)
        return false;
    return trieMatches(denylistTrie, denylistTrieRoot, host) !== -1;
}

export function isHostInAllowlist(host) {
    if (!host || allowlistTrieRoot === 0)
        return false;
    return trieMatches(allowlistTrie, allowlistTrieRoot, host) !== -1;
}

function compileAndMapRules(rulesText) {
    const allRules = compileRules(rulesText);
    const hostMap = new Map();
    const genericRules = [];

    for (const rule of allRules) {
        if (rule.host) {
            const specificHost = rule.host.toLowerCase();
            if (!hostMap.has(specificHost)) {
                hostMap.set(specificHost, []);
            }
            hostMap.get(specificHost).push(rule);
        } else {
            genericRules.push(rule);
        }
    }
    return {
        all: allRules,
        hostMap,
        generic: genericRules
    };
}

export async function updateRules(state, data) {
    try {
        const g = data || await browser.storage.local.get(['desktopRegexText', 'mobileRegexText', 'desktopRedirectRule', 'mobileRedirectRule']);

        const customDesktopRulesText = (g.desktopRegexText || '').trim();
        const customMobileRulesText = (g.mobileRegexText || '').trim();
        const remoteDesktopRulesText = (g.desktopRedirectRule || '').trim();
        const remoteMobileRulesText = (g.mobileRedirectRule || '').trim();

        if (customDesktopRulesText !== _prevDesktopRulesText) {
            state.customDesktopRedirectRules = compileAndMapRules(customDesktopRulesText);
            _prevDesktopRulesText = customDesktopRulesText;
        }
        if (customMobileRulesText !== _prevMobileRulesText) {
            state.customMobileRedirectRules = compileAndMapRules(customMobileRulesText);
            _prevMobileRulesText = customMobileRulesText;
        }

        if (remoteDesktopRulesText !== _prevRemoteDesktopRulesText) {
            state.desktopRedirectRules = compileAndMapRules(remoteDesktopRulesText);
            _prevRemoteDesktopRulesText = remoteDesktopRulesText;
        }

        if (remoteMobileRulesText !== _prevRemoteMobileRulesText) {
            state.mobileRedirectRules = compileAndMapRules(remoteMobileRulesText);
            _prevRemoteMobileRulesText = remoteMobileRulesText;
        }

        log('Redirect rules compiled and mapped', {
            customDesktop: state.customDesktopRedirectRules.all.length,
            customMobile: state.customMobileRedirectRules.all.length,
            remoteDesktop: state.desktopRedirectRules.all.length,
            remoteMobile: state.mobileRedirectRules.all.length
        });
    } catch (e) {
        console.error('[FD] Failed to compile redirect rules:', e);
    }
}

export async function updateLists(data) {
    try {
        const d = data || await browser.storage.local.get(['denylistText', 'allowlistText']);
        const denyText = d.denylistText || '';
        const allowText = d.allowlistText || '';
        if (denyText !== _prevDenyText) {
            _prevDenyText = denyText;
            denylistTrie.reset();
            denylistTrieRoot = trieCreate(denylistTrie);
            for (const host of normalizeList(denyText)) {
                const domain = normalizeHost(host);
                if (domain)
                    trieAdd(denylistTrie, denylistTrieRoot, domain);
            }
        }
        if (allowText !== _prevAllowText) {
            _prevAllowText = allowText;
            allowlistTrie.reset();
            allowlistTrieRoot = trieCreate(allowlistTrie);
            for (const host of normalizeList(allowText)) {
                const domain = normalizeHost(host);
                if (domain)
                    trieAdd(allowlistTrie, allowlistTrieRoot, domain);
            }
        }
        log('Deny/Allow Tries updated');
    } catch (e) {
        console.error('[FD] Failed to update lists:', e);
    }
}

export const RuleManager = {
    isHostInDenylist,
    isHostInAllowlist,
    updateRules,
    updateLists
};
