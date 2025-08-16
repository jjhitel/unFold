'use strict';
import { uiStore } from '../common/store.js';
import { C } from '../common/constants.js';
import { util } from '../common/utils.js';
import { showSaved } from './utils.js';
import { refreshTabVisibility } from './ui.js';

const $id = (id) => document.getElementById(id);

const ID_MAP = {
    [C.KEY_MODE]: 'mode',
    [C.KEY_THRESHOLD]: 'threshold',
    [C.KEY_DESKTOP_UA]: 'ua',
    [C.KEY_AUTO_REFRESH]: 'autoRefresh',
    [C.KEY_URL_REDIRECT]: 'urlRedirect',
    [C.KEY_DEBUG_MODE]: 'debugMode',
    [C.KEY_AUTO_UPDATE_PERIOD]: 'autoUpdatePeriod',
    [C.KEY_ZOOM_LEVEL]: 'zoomLevel',
};

export const DEFAULTS = {
    [C.KEY_MODE]: C.DEFAULT_MODE,
    [C.KEY_THRESHOLD]: C.DEFAULT_THRESHOLD,
    [C.KEY_DESKTOP_UA]: C.DEFAULT_DESKTOP_UA,
    [C.KEY_AUTO_REFRESH]: C.DEFAULT_AUTO_REFRESH,
    [C.KEY_URL_REDIRECT]: C.DEFAULT_URL_REDIRECT,
    [C.KEY_DEBUG_MODE]: C.DEFAULT_DEBUG_MODE,
    [C.KEY_AUTO_UPDATE_PERIOD]: C.DEFAULT_AUTO_UPDATE_PERIOD,
    [C.KEY_ZOOM_LEVEL]: C.DEFAULT_ZOOM_LEVEL,
};

export async function loadSettings() {
    const cfg = await uiStore.get(null);
    for (const key in DEFAULTS) {
        const elId = ID_MAP[key] || key;
        const el = $id(elId);
        if (!el)
            continue;
        const value = cfg[key] ?? DEFAULTS[key];
        if (el.type === 'checkbox') {
            el.checked = !!value;
        } else {
            el.value = value;
        }
    }
    $id('desktopRegexText').value = cfg[C.KEY_DESKTOP_RULES] || '';
    $id('mobileRegexText').value = cfg[C.KEY_MOBILE_RULES] || '';
    $id('denylistText').value = cfg[C.KEY_DENYLIST] || '';
    $id('allowlistText').value = cfg[C.KEY_ALLOWLIST] || '';
};

export async function saveSingleSetting(key, value) {
    if (typeof key !== 'string')
        return;
    await uiStore.set({
        [key]: value
    });
    browser.runtime.sendMessage({
        type: C.MSG_SETTINGS_UPDATE
    }).catch(() => {});
    showSaved('status');
};

export async function saveSettings() {
    const val = {};
    for (const key in DEFAULTS) {
        const elId = ID_MAP[key] || key;
        const el = $id(elId);
        if (!el)
            continue;
        if (el.type === 'checkbox') {
            val[key] = el.checked;
        } else if (el.type === 'number') {
            val[key] = Number(el.value) || DEFAULTS[key];
        } else {
            val[key] = el.value;
        }
    }
    await uiStore.set(val);
    browser.runtime.sendMessage({
        type: C.MSG_SETTINGS_UPDATE
    }).catch(() => {});
    showSaved('status');
};

async function saveAndShow(data, statusId) {
    await uiStore.set(data);
    showSaved(statusId);
}

export const saveUrlRules = () => saveAndShow({
    [C.KEY_DESKTOP_RULES]: util.normalizeList($id('desktopRegexText').value).join('\n'),
    [C.KEY_MOBILE_RULES]: util.normalizeList($id('mobileRegexText').value).join('\n')
}, 'status-url');

export const saveDenylist = () => saveAndShow({
    [C.KEY_DENYLIST]: util.normalizeList($id('denylistText').value).join('\n')
}, 'status-denylist');

export const saveAllowlist = () => saveAndShow({
    [C.KEY_ALLOWLIST]: util.normalizeList($id('allowlistText').value).join('\n')
}, 'status-allowlist');

export function bindStorageMirror() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local')
            return;
        loadSettings();
        const mode = $id('mode')?.value || C.DEFAULT_MODE;
        refreshTabVisibility(mode);
    });
};

export const loadRemoteSelections = async() => (await uiStore.get(C.KEY_REMOTE_SELECTED_RULES))?.[C.KEY_REMOTE_SELECTED_RULES] || [];
export const saveRemoteSelections = (arr) => uiStore.set({
    [C.KEY_REMOTE_SELECTED_RULES]: arr
});

export async function loadRemoteCatalog() {
    try {
        const response = await fetch(browser.runtime.getURL('rules.json'));
        return await response.json();
    } catch (e) {
        console.error('[FD] Failed to load remote catalog:', e);
        return [];
    }
};

export async function toggleRemoteRule(ruleMeta, checked) {
    const sel = await loadRemoteSelections();
    const next = checked ? [...new Set([...sel, ruleMeta.id])] : sel.filter(id => id !== ruleMeta.id);
    await saveRemoteSelections(next);
    browser.runtime.sendMessage({
        type: C.MSG_UPDATE_REMOTE_RULES
    }).catch(() => {});
};
