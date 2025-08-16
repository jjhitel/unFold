'use strict';

const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

try {
    if (window.top !== window)
        return;

    const C = globalThis.FD?.constants || {
        MSG_VIEWPORT_UPDATE: "FOLD_DESKTOP_VIEWPORT",
        MSG_VIEWPORT_CHECK: "FOLD_DESKTOP_VIEWPORT_CHECK"
    };

    const readW = () => {
        const vv = (window.visualViewport && window.visualViewport.width) || 0;
        const iw = window.innerWidth || 0;
        const cw = (document.documentElement && document.documentElement.clientWidth) || 0;
        return Math.round(vv || iw || cw || 0);
    };

    const readH = () => {
        const vv = (window.visualViewport && window.visualViewport.height) || 0;
        const ih = window.innerHeight || 0;
        const ch = (document.documentElement && document.documentElement.clientHeight) || 0;
        return Math.round(vv || ih || ch || 0);
    };

    const send = () => {
        browser.runtime.sendMessage({
            type: C.MSG_VIEWPORT_UPDATE,
            vvWidth: readW(),
            vvHeight: readH(),
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            screenWidth: (window.screen && window.screen.width) || 0,
            screenHeight: (window.screen && window.screen.height) || 0
        }).catch(() => {});
    };

    const debouncedSend = debounce(send, 160);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', send, {
            once: true
        });
    } else {
        send();
    }
    setTimeout(send, 300);

    window.addEventListener("resize", debouncedSend, {
        passive: true
    });
    window.addEventListener("orientationchange", debouncedSend, {
        passive: true
    });
    window.addEventListener("pageshow", (e) => {
        if (e.persisted)
            setTimeout(send, 60);
    }, {
        passive: true
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden)
            debouncedSend();
    });

    browser.runtime.onMessage.addListener((msg) => {
        if (msg.type === C.MSG_VIEWPORT_CHECK) {
            send();
        }
    });

} catch (e) {
}
