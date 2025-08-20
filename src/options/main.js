'use strict';
import '../common/env.js';
import { util } from '../common/utils.js';
import { loadSettings, DEFAULTS } from '../common/storage.js';
import { initUIBindings, renderRemoteRulesTable, refreshTabVisibility } from './ui.js';
import './tabs.js';
import { C } from '../common/constants.js';

try {
    const mf = browser.runtime.getManifest();
    const v = mf?.version || '';
    const iconEl = document.getElementById('ext-icon');
    if (iconEl)
        iconEl.src = browser.runtime.getURL('res/icons/icon96.png');

    const versionEl = document.getElementById('version-display');
    if (versionEl)
        versionEl.textContent = v ? `v${v}` : '';
} catch (e) {}

async function renderSettings(cfg) {
    const $id = (id) => document.getElementById(id);
    for (const key in DEFAULTS) {
        const el = $id(key);
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
    const mode = $id('mode')?.value || DEFAULTS[C.KEY_MODE];
    refreshTabVisibility(mode);
}

function bindStorageMirror() {
    browser.storage.onChanged.addListener(util.debounce(async(changes, area) => {
            if (area !== 'local')
                return;
            const newSettings = await loadSettings();
            renderSettings(newSettings);
        }, 100));
};

async function boot() {
    util.localizePage();
    const settings = await loadSettings();
    renderSettings(settings);
    initUIBindings();
    bindStorageMirror();

    await renderRemoteRulesTable();

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

window.addEventListener('focus', () => {
    util.localizePage();
});
