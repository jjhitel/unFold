(function () {
    'use strict';

    const FD = (window.FD = window.FD || {});

    FD.$id = (id) => document.getElementById(id);

    FD.showSaved = function (id) {
        const el = FD.$id(id);
        if (!el)
            return;
        const originalText = el.textContent;

        el.textContent = browser.i18n.getMessage("options_savedStatus") || 'Saved.';
        setTimeout(() => {
            if (el)
                el.textContent = originalText;
        }, 1500);
    };

    FD.setSmallStatus = function (id, msg, ms = 2000) {
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

    FD.storage = {
        get: (keys) => browser.storage.local.get(keys),
        set: (obj) => browser.storage.local.set(obj),
        remove: (keys) => browser.storage.local.remove(keys),
    };

})();
