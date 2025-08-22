'use strict';
import debounce from 'just-debounce-it';
import { C } from '../common/constants.js';

(function () {
    try {
        if (window.top !== window) {
            return;
        }

        let isFormDirty = false;

        const setDirty = () => {
            if (!isFormDirty) {
                isFormDirty = true;
                browser.runtime.sendMessage({
                    type: C.MSG_FORM_DIRTY_STATUS,
                    isDirty: true
                }).catch(() => {});
            }
        };

        const setClean = () => {
            if (isFormDirty) {
                isFormDirty = false;
                browser.runtime.sendMessage({
                    type: C.MSG_FORM_DIRTY_STATUS,
                    isDirty: false
                }).catch(() => {});
            }
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
                outerWidth: window.outerWidth,
                outerHeight: window.outerHeight,
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

        document.addEventListener('input', (e) => {
            const target = e.target;
            let length = 0;

            if (target.matches('input, textarea')) {
                length = target.value.length;
            } else if (target.matches('[contenteditable]')) {
                length = target.textContent.length;
            } else {
                return;
            }

            if (length >= 100) {
                setDirty();
            } else {
                setClean();
            }
        }, {
            capture: true,
            passive: true
        });

        document.addEventListener('submit', setClean, {
            capture: true,
            passive: true
        });
        window.addEventListener('beforeunload', setClean, {
            capture: true,
            passive: true
        });

        browser.runtime.onMessage.addListener((msg) => {
            if (msg.type === C.MSG_VIEWPORT_CHECK) {
                send();
            }
        });

    } catch (e) {}
})();
