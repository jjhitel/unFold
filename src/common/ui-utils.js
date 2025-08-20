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
const BINDING_MAP = {
    'mode': C.KEY_MODE,
    'autoRefresh': C.KEY_AUTO_REFRESH,
    'urlRedirect': C.KEY_URL_REDIRECT,
    'threshold': C.KEY_THRESHOLD,
    'autoUpdatePeriod': C.KEY_AUTO_UPDATE_PERIOD,
    'debugMode': C.KEY_DEBUG_MODE,
    'compatMode': C.KEY_COMPAT_MODE,
};

export function bindSetting(elementId, settingKey = null, debounceMs = 200, callback) {
    const el = util.$id(elementId);
    if (!el)
        return;

    const key = settingKey || BINDING_MAP[elementId];

    const saveAndNotify = async value => {
        await uiStore.set({
            [key]: value
        });
        await browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        });
        showSaved();
        if (callback)
            callback(value);
    };

    const debouncedSave = util.debounce(saveAndNotify, debounceMs);

    el.addEventListener('input', e => debouncedSave(e.target.value));
};
