'use strict';
import { util } from './utils.js';
import { uiStore } from './storage.js';
import { C } from './constants.js';

export function showSaved() {
    const activePanel = document.querySelector('.tabpanel:not([hidden])');
    if (!activePanel)
        return;

    const el = activePanel.querySelector('.status-indicator');
    if (!el)
        return;

    el.textContent = browser.i18n.getMessage("options_savedStatus") || 'Saved.';
    el.classList.add('visible');

    setTimeout(() => {
        el.classList.remove('visible');
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

async function saveSetting(key, value) {
    try {
        await uiStore.set({
            [key]: value
        });
        await browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        });
        showSaved();
    } catch (e) {
        util.log(`[FD] Failed to save setting ${key}:`, e);
    }
}

export function bindCheckbox(elementId, settingKey) {
    const el = util.$id(elementId);
    if (el) {
        el.addEventListener('change', (e) => saveSetting(settingKey, e.target.checked));
    }
}

export function bindSelect(elementId, settingKey, callback) {
    const el = util.$id(elementId);
    if (el) {
        el.addEventListener('change', (e) => {
            saveSetting(settingKey, e.target.value);
            if (callback)
                callback(e.target.value);
        });
    }
}

export function bindTextInput(elementId, settingKey, debounceMs = 200) {
    const el = util.$id(elementId);
    if (el) {
        const debouncedSave = util.debounce((value) => saveSetting(settingKey, value), debounceMs);
        el.addEventListener('input', (e) => debouncedSave(e.target.value));
    }
}
