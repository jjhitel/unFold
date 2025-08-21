'use strict';

import { C } from './constants.js';
import debounce from 'just-debounce-it';
import escapeStringRegexp from 'escape-string-regexp';
import { parse as tldtsParse } from 'tldts';
const Utils = {};

function getTimestamp() {
    try {
        return new Date().toTimeString().slice(0, 8);
    } catch {
        return "00:00:00";
    }
}

Utils.log = (tag, payload) => {
    try {
        if (!globalThis.FD_ENV?.DEBUG)
            return;
        if (payload !== undefined)
            console.log(`[FD][${getTimestamp()}] ${tag}`, payload);
        else
            console.log(`[FD][${getTimestamp()}] ${tag}`);
    } catch {}
};

Utils.normalizeList = (multiline) => {
    const seen = new Set();
    const out = [];
    for (const raw of String(multiline || '').split(/\r?\n/)) {
        const trimmed = raw.trim();
        if (!trimmed)
            continue;
        if (!seen.has(trimmed)) {
            seen.add(trimmed);
            out.push(trimmed);
        }
    }
    return out;
};

Utils.normalizeHostnames = (multiline) => {
    const lines = Utils.normalizeList(multiline);
    const seen = new Set();
    const out = [];

    for (const line of lines) {
        let hostCandidate = line.split(/(\s*->\s*|\s*=>\s*|\s+)/)[0];

        const pathIndex = hostCandidate.indexOf('/');
        if (pathIndex !== -1) {
            hostCandidate = hostCandidate.substring(0, pathIndex);
        }

        if (hostCandidate && !seen.has(hostCandidate)) {
            seen.add(hostCandidate);
            out.push(hostCandidate);
        }
    }
    return out;
};

Utils.debounce = debounce;

Utils.escapeRegExp = (s) => {
    const str = String(s ?? '');
    return typeof RegExp.escape === 'function'
     ? RegExp.escape(str)
     : escapeStringRegexp(str);
};

Utils.extractHostname = (url) => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname;
    } catch (e) {
        try {
            const p = tldtsParse(url);
            return p && p.hostname ? p.hostname : null;
        } catch {
            return null;
        }
    }
};

Utils.localizePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const msg = browser.i18n.getMessage(key);
        if (msg && el.textContent !== msg) {
            el.textContent = msg;
        }
    });
    const uiLang = browser.i18n.getUILanguage();
    document.documentElement.lang = uiLang;
    document.documentElement.dir = browser.i18n.getMessage('@@bidi_dir');
};

Utils.$ = (sel, root = document) => root.querySelector(sel);
Utils.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
Utils.$id = (id) => document.getElementById(id);
Utils.getRuleLastModifiedKey = (id) => `${id}${C.KEY_RULE_LAST_MODIFIED_PREFIX}`;

export {
    Utils as util
};
