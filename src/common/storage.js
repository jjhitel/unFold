'use strict';
import { util } from './utils.js';
import { C } from './constants.js';

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
    return S.get(null);
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
};

export const saveUrlRules = async(desktopText, mobileText) => {
    const desktopLines = desktopText.split(/\r?\n/);
    const mobileLines = mobileText.split(/\r?\n/);

    const MAX_RULES_PER_TYPE = 500;
    const MAX_TOTAL_LENGTH = 15000;
    if (desktopLines.length > MAX_RULES_PER_TYPE || mobileLines.length > MAX_RULES_PER_TYPE) {
        throw new Error(`Error: Rule count cannot exceed ${MAX_RULES_PER_TYPE} per type.`);
    }
    if ((desktopText.length + mobileText.length) > MAX_TOTAL_LENGTH) {
        throw new Error(`Error: Total rule length cannot exceed ${MAX_TOTAL_LENGTH} characters.`);
    }

    await S.set({
        [C.KEY_DESKTOP_RULES]: util.normalizeList(desktopText).join('\n'),
        [C.KEY_MOBILE_RULES]: util.normalizeList(mobileText).join('\n')
    });
};

export const saveDenylist = async(text) => {
    await S.set({
        [C.KEY_DENYLIST]: util.normalizeList(text).join('\n')
    });
};

export const saveAllowlist = async(text) => {
    await S.set({
        [C.KEY_ALLOWLIST]: util.normalizeList(text).join('\n')
    });
};

export async function setModeOn(on) {
    const cur = await S.get(['mode', 'lastNonOffMode']);
    let mode = cur.mode || C.DEFAULT_MODE;
    let last = cur.lastNonOffMode || (mode !== 'off' ? mode : C.DEFAULT_MODE);

    if (on) {
        const newMode = (last === 'off') ? C.DEFAULT_MODE : last;
        await S.set({
            mode: newMode,
            lastNonOffMode: newMode
        });
    } else {
        if (mode !== 'off')
            last = mode;
        await S.set({
            mode: 'off',
            lastNonOffMode: last
        });
    }
};

export const loadRemoteSelections = async() => (await S.get(C.KEY_REMOTE_SELECTED_RULES))?.[C.KEY_REMOTE_SELECTED_RULES] || [];
export const saveRemoteSelections = (arr) => S.set({
    [C.KEY_REMOTE_SELECTED_RULES]: arr
});

export async function toggleRemoteRule(ruleId, checked) {
    const sel = await loadRemoteSelections();
    const next = checked ? [...new Set([...sel, ruleId])] : sel.filter(id => id !== ruleId);
    await saveRemoteSelections(next);
};

export async function addCurrentHostToList(listKey, host) {
    const cur = await S.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];
    lines.push(host);

    const final = util.normalizeList(lines.join('\n')).join('\n');
    await S.set({
        [listKey]: final
    });
};

export async function removeCurrentHostFromList(listKey, host) {
    const cur = await S.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];

    const hostLower = host.toLowerCase();
    const finalLines = lines.filter(line => line.trim().toLowerCase() !== hostLower);

    const final = finalLines.join('\n');
    await S.set({
        [listKey]: final
    });
};

export async function loadRemoteCatalog() {
    try {
        const response = await fetch(browser.runtime.getURL('rules.json'));
        return await response.json();
    } catch (e) {
        console.error('[FD] Failed to load remote catalog:', e);
        return [];
    }
};
