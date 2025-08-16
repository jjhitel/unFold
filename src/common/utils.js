'use strict';

const Utils = {};

Utils.log = (tag, payload) => {
    try {
        if (!globalThis.FD_ENV?.DEBUG)
            return;
        const ts = new Date().toTimeString().slice(0, 8);
        if (payload !== undefined) {
            console.log(`[FD][${ts}] ${tag}`, payload);
        } else {
            console.log(`[FD][${ts}] ${tag}`);
        }
    } catch {}
};

Utils.normalizeList = (multiline) => {
    const seen = new Set();
    const out = [];
    for (const raw of String(multiline || '').split(/\r?\n/)) {
        const v = raw.trim().toLowerCase();
        if (!v || seen.has(v))
            continue;
        seen.add(v);
        out.push(v);
    }
    return out;
};

Utils.escapeRegExp = (s) => {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

Utils.extractHostname = (url) => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
};

Utils.debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
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

export {
    Utils as util
};
