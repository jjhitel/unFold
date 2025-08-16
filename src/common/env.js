(function () {
    if (!globalThis.FD_ENV)
        globalThis.FD_ENV = {
            DEBUG: false
        };
    function getTimestamp() {
        try {
            return new Date().toTimeString().slice(0, 8)
        } catch {
            return "00:00:00"
        }
    }
    function logMessage(tag, payload) {
        if (!globalThis.FD_ENV || !globalThis.FD_ENV.DEBUG)
            return;
        try {
            payload !== undefined ? console.log(`[FD][${getTimestamp()}] ${tag}`, payload)
             : console.log(`[FD][${getTimestamp()}] ${tag}`);
        } catch {}
    }
    globalThis.FD_LOG = logMessage;
    globalThis.FD_SET_DEBUG = function (on) {
        try {
            globalThis.FD_ENV.DEBUG = !!on
        } catch {}
    };
    if (!globalThis.FD)
        globalThis.FD = {};
    FD.env = globalThis.FD_ENV;
    FD.log = globalThis.FD_LOG;
    FD.setDebug = globalThis.FD_SET_DEBUG;
})();
