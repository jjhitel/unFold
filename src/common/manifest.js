(function () {
    if (!globalThis.FD)
        globalThis.FD = {};
    try {
        const mf = browser.runtime.getManifest ? browser.runtime.getManifest() : {};
        FD.manifest = mf || {};
        FD.VERSION = (mf && mf.version) || "";
    } catch (e) {
        FD.manifest = {};
        FD.VERSION = "";
    }
})();
