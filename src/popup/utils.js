'use strict';
import { uiStore } from '../common/store.js';
import { util } from '../common/utils.js';

export function setOn(elOrId, on) {
    const el = typeof elOrId === 'string' ? util.$id(elOrId) : elOrId;
    if (el) {
        el.classList.toggle('on', !!on);
    }
};

export async function load(keys) {
    try {
        return await uiStore.get(keys);
    } catch (e) {
        console.error('[FD] Popup failed to load from storage:', e);
        return {};
    }
};

export async function save(obj) {
    try {
        await uiStore.set(obj);
        await browser.runtime.sendMessage({
            type: 'FOLD_DESKTOP_SETTINGS_UPDATE'
        });
    } catch (e) {
        console.error('[FD] Popup failed to save to storage:', e);
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
        console.error('[FD] Failed to open options tab directly:', e);
    }

    try {
        window.close();
    } catch (e) {
        console.error('[FD] Failed to close popup:', e);
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
            host: new URL(t.url).hostname
        };
    } catch (e) {
        console.error('[FD] Failed to get active tab:', e);
        return null;
    }
};
