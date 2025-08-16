'use strict';

export function showSaved(id) {
    const el = document.getElementById(id);
    if (!el)
        return;
    const originalText = el.textContent;

    el.textContent = browser.i18n.getMessage("options_savedStatus") || 'Saved.';
    setTimeout(() => {
        if (el)
            el.textContent = originalText;
    }, 1500);
};

export function setSmallStatus(id, msg, ms = 2000) {
    const el = document.getElementById(id);
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

export const storage = {
    get: (keys) => browser.storage.local.get(keys),
    set: (obj) => browser.storage.local.set(obj),
    remove: (keys) => browser.storage.local.remove(keys),
};
