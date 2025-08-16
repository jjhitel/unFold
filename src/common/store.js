(function () {
    if (!globalThis.FD)
        globalThis.FD = {};
    const S = {};

    S.get = async function (keys) {
        try {
            return await browser.storage.local.get(keys || null);
        } catch (e) {
            FD.log("store.get error", e);
            return {};
        }
    };
    S.set = async function (obj) {
        try {
            await browser.storage.local.set(obj || {});
            return true;
        } catch (e) {
            FD.log("store.set error", e);
            return false;
        }
    };
    S.remove = async function (keys) {
        try {
            await browser.storage.local.remove(keys);
            return true;
        } catch (e) {
            FD.log("store.remove error", e);
            return false;
        }
    };
    S.clear = async function () {
        try {
            await browser.storage.local.clear();
            return true;
        } catch (e) {
            FD.log("store.clear error", e);
            return false;
        }
    };

    if (!FD.uiStore)
        FD.uiStore = S;
})();
