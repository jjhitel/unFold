'use strict';
import { uiStore } from '../common/store.js';
import { C } from '../common/constants.js';
import { util } from '../common/utils.js';
import { showSaved, setSmallStatus } from '../common/ui-utils.js';
import { refreshTabVisibility } from './ui.js';

const $id = (id) => document.getElementById(id);

const MAX_RULES_PER_TYPE = 500;
const MAX_TOTAL_LENGTH = 15000;

const ID_MAP = {
    [C.KEY_MODE]: 'mode',
    [C.KEY_THRESHOLD]: 'threshold',
    [C.KEY_DESKTOP_UA]: 'ua',
    [C.KEY_AUTO_REFRESH]: 'autoRefresh',
    [C.KEY_URL_REDIRECT]: 'urlRedirect',
    [C.KEY_DEBUG_MODE]: 'debugMode',
    [C.KEY_AUTO_UPDATE_PERIOD]: 'autoUpdatePeriod',
    [C.KEY_ZOOM_LEVEL]: 'zoomLevel',
    [C.KEY_LITE_MODE]: 'liteMode',
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
    [C.KEY_LITE_MODE]: C.DEFAULT_LITE_MODE,
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

    if (typeof DEFAULTS[key] === 'number') {
        value = Number(value) || DEFAULTS[key];
    }

    await uiStore.set({
        [key]: value
    });
    browser.runtime.sendMessage({
        type: C.MSG_SETTINGS_UPDATE
    }).catch(() => {});
    showSaved('status');
};

async function saveAndShow(data, statusId) {
    await uiStore.set(data);
    showSaved(statusId);
}

export const saveUrlRules = () => {
    const desktopText = $id('desktopRegexText').value;
    const mobileText = $id('mobileRegexText').value;

    const desktopLines = desktopText.split(/\r?\n/);
    const mobileLines = mobileText.split(/\r?\n/);

    if (desktopLines.length > MAX_RULES_PER_TYPE || mobileLines.length > MAX_RULES_PER_TYPE) {
        setSmallStatus('status-url', `Error: Rule count cannot exceed ${MAX_RULES_PER_TYPE} per type.`, 5000);
        return;
    }

    if ((desktopText.length + mobileText.length) > MAX_TOTAL_LENGTH) {
        setSmallStatus('status-url', `Error: Total rule length cannot exceed ${MAX_TOTAL_LENGTH} characters.`, 5000);
        return;
    }

    saveAndShow({
        [C.KEY_DESKTOP_RULES]: util.normalizeList(desktopText).join('\n'),
        [C.KEY_MOBILE_RULES]: util.normalizeList(mobileText).join('\n')
    }, 'status-url');
};

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
