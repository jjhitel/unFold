'use strict';
import { util } from './utils.js';
import { uiStore } from './store.js';
import { C } from './constants.js';

export function showSaved(id) {
    const el = util.$id(id);
    if (!el)
        return;
    const originalText = el.textContent;

    el.textContent = browser.i18n.getMessage("options_savedStatus") || 'Saved.';
    setTimeout(() => {
        if (el)
            el.textContent = originalText;
    }, 1500);
};

export function setSmallStatus(id, msg, ms = 2000) {
    const el = util.$id(id);
    if (!el)
        return;
    el.textContent = msg;
    if (ms > 0) {
        setTimeout(() => {
            if (el)
                el.textContent = '';
        }, ms);
    }
};

export function setOn(elOrId, on) {
    const el = typeof elOrId === 'string' ? util.$id(elOrId) : elOrId;
    if (el) {
        el.classList.toggle('on', !!on);
    }
};

export async function getActiveHttpTab() {
    try {
        const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true
        });
        const t = tabs?.[0];
        if (!t || !t.url || !/^https?:\/\//i.test(t.url)) {
            return null;
        }
        return {
            tab: t,
            url: t.url,
            host: util.extractHostname(t.url)
        };
    } catch (e) {
        util.log('[FD] Failed to get active tab:', e);
        return null;
    }
};

export async function openOptions(hash) {
    try {
        const url = browser.runtime.getURL(`src/options/options.html${hash || ''}`);
        await browser.tabs.create({
            url,
            active: true
        });
    } catch (e) {
        util.log('[FD] Failed to open options tab directly:', e);
    }

    try {
        window.close();
    } catch (e) {
        util.log('[FD] Failed to close popup:', e);
    }
};

export async function save(obj) {
    try {
        await uiStore.set(obj);
        await browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        });
    } catch (e) {
        util.log('[FD] Popup failed to save to storage:', e);
    }
};
