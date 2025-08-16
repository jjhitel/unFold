(function () {
    'use strict';

    const FD = (window.FD = window.FD || {});
    FD.popup = {};

    FD.popup.setOn = (elOrId, on) => {
        const el = typeof elOrId === 'string' ? FD.util.$id(elOrId) : elOrId;
        if (el) {
            el.classList.toggle('on', !!on);
        }
    };

    FD.popup.load = async(keys) => {
        try {
            return await FD.uiStore.get(keys);
        } catch (e) {
            console.error('[FD] Popup failed to load from storage:', e);
            return {};
        }
    };

    FD.popup.save = async(obj) => {
        try {
            await FD.uiStore.set(obj);
            await browser.runtime.sendMessage({
                type: 'FOLD_DESKTOP_SETTINGS_UPDATE'
            });
        } catch (e) {
            console.error('[FD] Popup failed to save to storage:', e);
        }
    };

    FD.popup.openOptions = async(hash) => {
        try {
            const url = browser.runtime.getURL(`src/options/options.html${hash || ''}`);
            await browser.tabs.create({
                url,
                active: true
            });
        } catch (e) {
            console.error('[FD] Failed to open options tab directly:', e);
        }

        try {
            window.close();
        } catch (e) {
            console.error('[FD] Failed to close popup:', e);
        }
    };

    FD.popup.getActiveHttpTab = async() => {
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
                host: new URL(t.url).hostname
            };
        } catch (e) {
            console.error('[FD] Failed to get active tab:', e);
            return null;
        }
    };

    FD.popup.dedup = (arr) => {
        return [...new Set((arr || []).map(v => String(v || '').trim()).filter(Boolean))];
    };
})();
