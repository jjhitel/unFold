(function () {
    'use strict';

    const boot = () => {
        if (FD && FD.popup && FD.popup.initPopupUI) {
            FD.popup.initPopupUI();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
