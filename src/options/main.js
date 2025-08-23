'use strict';
import '../shared/env.js';
import { util } from '../shared/utils.js';
import { loadSettings, bindStorageMirror } from '../shared/storage.js';
import { initUIBindings, renderRemoteRulesTable, refreshTabVisibility } from './ui.js';
import './tabs.js';

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

async function boot() {
    util.localizePage();
    await loadSettings();
    initUIBindings();
    bindStorageMirror();

    await renderRemoteRulesTable();

    const mode = document.getElementById('mode')?.value || 'autoDeny';
    refreshTabVisibility(mode);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

window.addEventListener('focus', () => {
    util.localizePage();
});

