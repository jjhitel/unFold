(function () {
    'use strict';
    const FD = (window.FD = window.FD || {});
    const $id = FD.$ = (id) => document.getElementById(id);
    const Cache = FD.cache;
    const C = FD.constants;
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
    FD.DEFAULTS = {
        [C.KEY_MODE]: C.DEFAULT_MODE,
        [C.KEY_THRESHOLD]: C.DEFAULT_THRESHOLD,
        [C.KEY_DESKTOP_UA]: C.DEFAULT_DESKTOP_UA,
        [C.KEY_AUTO_REFRESH]: C.DEFAULT_AUTO_REFRESH,
        [C.KEY_URL_REDIRECT]: C.DEFAULT_URL_REDIRECT,
        [C.KEY_DEBUG_MODE]: C.DEFAULT_DEBUG_MODE,
        [C.KEY_AUTO_UPDATE_PERIOD]: C.DEFAULT_AUTO_UPDATE_PERIOD,
        [C.KEY_ZOOM_LEVEL]: C.DEFAULT_ZOOM_LEVEL,
    };
    FD.loadSettings = async function () {
        const cfg = await FD.uiStore.get(null);
        for (const key in FD.DEFAULTS) {
            const elId = ID_MAP[key] || key;
            const el = $id(elId);
            if (!el)
                continue;
            const value = cfg[key] ?? FD.DEFAULTS[key];
            if (el.type === 'checkbox') {
                el.checked = !!value;
            } else {
                el.value = value;
            }
        }
        const desktopRegexEl = $id('desktopRegexText');
        if (desktopRegexEl)
            desktopRegexEl.value = cfg[C.KEY_DESKTOP_RULES] || '';
        const mobileRegexEl = $id('mobileRegexText');
        if (mobileRegexEl)
            mobileRegexEl.value = cfg[C.KEY_MOBILE_RULES] || '';
        const denylistEl = $id('denylistText');
        if (denylistEl)
            denylistEl.value = cfg[C.KEY_DENYLIST] || '';
        const allowlistEl = $id('allowlistText');
        if (allowlistEl)
            allowlistEl.value = cfg[C.KEY_ALLOWLIST] || '';
    };
    FD.saveSingleSetting = async function (key, value) {
        if (typeof key !== 'string')
            return;
        await FD.uiStore.set({
            [key]: value
        });
        browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        }).catch(() => {});
        FD.showSaved('status');
    };
    FD.saveSettings = async function () {
        const val = {};
        for (const key in FD.DEFAULTS) {
            const elId = ID_MAP[key] || key;
            const el = $id(elId);
            if (!el)
                continue;
            if (el.type === 'checkbox') {
                val[key] = el.checked;
            } else if (el.type === 'number') {
                val[key] = Number(el.value) || FD.DEFAULTS[key];
            } else {
                val[key] = el.value;
            }
        }
        await FD.uiStore.set(val);
        browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        }).catch(() => {});
        FD.showSaved('status');
    };
    async function saveAndShow(data, statusId) {
        await FD.uiStore.set(data);
        FD.showSaved(statusId);
    }
    FD.saveUrlRules = () => saveAndShow({
        [C.KEY_DESKTOP_RULES]: FD.util.normalizeList($id('desktopRegexText').value).join('\n'),
        [C.KEY_MOBILE_RULES]: FD.util.normalizeList($id('mobileRegexText').value).join('\n')
    }, 'status-url');
    FD.saveDenylist = () => saveAndShow({
        [C.KEY_DENYLIST]: FD.util.normalizeList($id('denylistText').value).join('\n')
    }, 'status-denylist');
    FD.saveAllowlist = () => saveAndShow({
        [C.KEY_ALLOWLIST]: FD.util.normalizeList($id('allowlistText').value).join('\n')
    }, 'status-allowlist');
    FD.bindStorageMirror = function () {
        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local')
                return;
            FD.loadSettings();
            const mode = $id('mode')?.value || C.DEFAULT_MODE;
            FD.refreshTabVisibility(mode);
        });
    };
    FD.loadRemoteSelections = async() => (await FD.uiStore.get(C.KEY_REMOTE_SELECTED_RULES))?.[C.KEY_REMOTE_SELECTED_RULES] || [];
    FD.saveRemoteSelections = (arr) => FD.uiStore.set({
        [C.KEY_REMOTE_SELECTED_RULES]: arr
    });
    FD.loadRemoteCatalog = async() => {
        try {
            const response = await fetch(browser.runtime.getURL('src/options/rules.json'));
            return await response.json();
        } catch (e) {
            console.error('[FD] Failed to load remote catalog:', e);
            return [];
        }
    };
    FD.toggleRemoteRule = async function (ruleMeta, checked) {
        const sel = await FD.loadRemoteSelections();
        const next = checked ? [...new Set([...sel, ruleMeta.id])] : sel.filter(id => id !== ruleMeta.id);
        await FD.saveRemoteSelections(next);
        browser.runtime.sendMessage({
            type: C.MSG_UPDATE_REMOTE_RULES
        }).catch(() => {});
    };
})();
