(async function () {
    'use strict';

    const FD = (window.FD = window.FD || {});
    const $ = FD.$;

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
        FD.util.localizePage();
        await FD.loadSettings();
        FD.initUIBindings();
        FD.bindStorageMirror();
        if (FD.renderRemoteRulesTable) {
            await FD.renderRemoteRulesTable();
        }

        const mode = $('mode')?.value || 'autoDeny';
        if (FD.refreshTabVisibility) {
            FD.refreshTabVisibility(mode);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
