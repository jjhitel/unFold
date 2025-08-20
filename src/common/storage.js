'use strict';
import { util } from './utils.js';
import { C } from './constants.js';
import { showSaved, setSmallStatus, getActiveHttpTab, save as saveToUiUtils } from './ui-utils.js';
import { refreshTabVisibility } from '../options/ui.js';

const S = {};

S.get = async function (keys) {
    try {
        return await browser.storage.local.get(keys || null);
    } catch (e) {
        util.log("store.get error", e);
        return {};
    }
};
S.set = async function (obj) {
    try {
        await browser.storage.local.set(obj || {});
        return true;
    } catch (e) {
        util.log("store.set error", e);
        return false;
    }
};
S.remove = async function (keys) {
    try {
        await browser.storage.local.remove(keys);
        return true;
    } catch (e) {
        util.log("store.remove error", e);
        return false;
    }
};
S.clear = async function () {
    try {
        await browser.storage.local.clear();
        return true;
    } catch (e) {
        util.log("store.clear error", e);
        return false;
    }
};

export const uiStore = S;

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
    [C.KEY_COMPAT_MODE]: 'compatMode',
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
    [C.KEY_COMPAT_MODE]: C.DEFAULT_COMPAT_MODE,
};

export async function loadSettings() {
    const cfg = await S.get(null);
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

    await S.set({
        [key]: value
    });
    browser.runtime.sendMessage({
        type: C.MSG_SETTINGS_UPDATE
    }).catch(() => {});
    showSaved();
};

async function saveAndShow(data, messageType) {
    await S.set(data);
    if (messageType) {
        try {
            await browser.runtime.sendMessage({
                type: messageType
            });
        } catch (e) {
            util.log("Failed to send immediate update message", e);
        }
    }
    showSaved();
}

export const saveUrlRules = async() => {
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

    await saveAndShow({
        [C.KEY_DESKTOP_RULES]: util.normalizeList(desktopText).join('\n'),
        [C.KEY_MOBILE_RULES]: util.normalizeList(mobileText).join('\n')
    }, C.MSG_RULES_UPDATED);
};

export const saveDenylist = async() => await saveAndShow({
    [C.KEY_DENYLIST]: util.normalizeHostnames($id('denylistText').value).join('\n')
}, C.MSG_RULES_UPDATED);

export const saveAllowlist = async() => await saveAndShow({
    [C.KEY_ALLOWLIST]: util.normalizeHostnames($id('allowlistText').value).join('\n')
}, C.MSG_RULES_UPDATED);

export function bindStorageMirror() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local')
            return;
        loadSettings();
        const mode = $id('mode')?.value || C.DEFAULT_MODE;
        refreshTabVisibility(mode);
    });
};

export const loadRemoteSelections = async() => (await S.get(C.KEY_REMOTE_SELECTED_RULES))?.[C.KEY_REMOTE_SELECTED_RULES] || [];
export const saveRemoteSelections = (arr) => S.set({
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

    showSaved();

    await saveAndShow({
        [C.KEY_REMOTE_SELECTED_RULES]: next
    }, C.MSG_UPDATE_REMOTE_RULES);
};

export async function setModeOn(on) {
    const cur = await S.get(['mode', 'lastNonOffMode']);
    let mode = cur.mode || C.DEFAULT_MODE;
    let last = cur.lastNonOffMode || (mode !== 'off' ? mode : C.DEFAULT_MODE);

    if (on) {
        const newMode = (last === 'off') ? C.DEFAULT_MODE : last;
        await saveToUiUtils({
            mode: newMode,
            lastNonOffMode: newMode
        });
    } else {
        if (mode !== 'off')
            last = mode;
        await saveToUiUtils({
            mode: 'off',
            lastNonOffMode: last
        });
    }
};

export async function addCurrentHostToList(listKey) {
    const info = await getActiveHttpTab();
    if (!info)
        return false;

    const cur = await S.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];
    lines.push(info.host);

    const final = util.normalizeList(lines.join('\n')).join('\n');
    await S.set({
        [listKey]: final
    });
    return true;
};

export async function removeCurrentHostFromList(listKey) {
    const info = await getActiveHttpTab();
    if (!info)
        return false;

    const cur = await S.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];

    const hostLower = info.host.toLowerCase();
    const finalLines = lines.filter(line => line.trim().toLowerCase() !== hostLower);

    const final = finalLines.join('\n');
    await S.set({
        [listKey]: final
    });
    return true;
};
