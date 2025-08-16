'use strict';

if (!globalThis.FD_ENV) {
    globalThis.FD_ENV = {
        DEBUG: false
    };
}

function getTimestamp() {
    try {
        return new Date().toTimeString().slice(0, 8);
    } catch {
        return "00:00:00";
    }
}

function logMessage(tag, payload) {
    if (!globalThis.FD_ENV?.DEBUG) {
        return;
    }
    try {
        if (payload !== undefined) {
            console.log(`[FD][${getTimestamp()}] ${tag}`, payload);
        } else {
            console.log(`[FD][${getTimestamp()}] ${tag}`);
        }
    } catch {}
}

globalThis.FD_LOG = logMessage;

globalThis.FD_SET_DEBUG = function (on) {
    try {
        globalThis.FD_ENV.DEBUG = !!on;
    } catch {}
};
