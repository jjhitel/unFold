(function () {
    'use strict';
    const FD_POPUP = FD.popup;
    const $id = FD.util.$id;

    function updateListButtonsVisibility(mode) {
        const modeStr = String(mode || '').toLowerCase();
        const actionRow = $id('main-action-row');
        const btnDeny = $id('btnDeny');
        const btnAllow = $id('btnAllow');

        if (!actionRow || !btnDeny || !btnAllow)
            return;

        btnDeny.style.display = 'none';
        btnAllow.style.display = 'none';

        let isListButtonVisible = false;

        if (modeStr === 'autodeny' || modeStr === 'always') {
            btnDeny.style.display = 'block';
            isListButtonVisible = true;
        } else if (modeStr === 'autoallow') {
            btnAllow.style.display = 'block';
            isListButtonVisible = true;
        }

        actionRow.classList.toggle('settings-only', !isListButtonVisible);
    }

    function bindSwitch(elId, storageKey, onSave) {
        const el = $id(elId);
        if (!el)
            return;

        el.addEventListener('click', async() => {
            const willOn = !el.classList.contains('on');
            await(onSave ? onSave(willOn) : FD_POPUP.save({
                    [storageKey]: willOn
                }));
        });
    }

    async function initListButtons() {
        const btnDeny = $id('btnDeny');
        const btnAllow = $id('btnAllow');
        const info = await FD_POPUP.getActiveHttpTab();

        if (!info) {
            if (btnDeny)
                btnDeny.disabled = true;
            if (btnAllow)
                btnAllow.disabled = true;
            return;
        }

        const listStatus = await browser.runtime.sendMessage({
            type: FD.constants.MSG_CHECK_LIST_HOST,
            host: info.host,
        }).catch(() => null);

        if (!listStatus)
            return;

        const { inDeny, inAllow } = listStatus;

        if (btnDeny) {
            btnDeny.disabled = false;
            btnDeny.textContent = inDeny ? browser.i18n.getMessage('popup_removeFromDenylist') : browser.i18n.getMessage('popup_addToDenylist');
            btnDeny.onclick = async() => {
                await(inDeny ? FD_POPUP.removeCurrentHostFromList('denylistText') : FD_POPUP.addCurrentHostToList('denylistText'));
            };
        }
        if (btnAllow) {
            btnAllow.disabled = false;
            btnAllow.textContent = inAllow ? browser.i18n.getMessage('popup_removeFromAllowlist') : browser.i18n.getMessage('popup_addToAllowlist');
            btnAllow.onclick = async() => {
                await(inAllow ? FD_POPUP.removeCurrentHostFromList('allowlistText') : FD_POPUP.addCurrentHostFromList('allowlistText'));
            };
        }
    }

    async function syncAllUI() {
        const settings = await FD_POPUP.load(['mode', 'autoRefresh', 'urlRedirect']);
        const mode = settings.mode || 'autoDeny';

        FD_POPUP.setOn($id('switch'), mode !== 'off');
        FD_POPUP.setOn($id('toggle-autoRefresh'), settings.autoRefresh ?? true);
        FD_POPUP.setOn($id('toggle-urlRedirect'), settings.urlRedirect ?? false);

        updateListButtonsVisibility(mode);
        await initListButtons();
    }

    function bindStorageMirror() {
        browser.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                syncAllUI();
            }
        });
    }

    FD_POPUP.initPopupUI = async() => {
        if (FD.util && FD.util.localizePage) {
            FD.util.localizePage();
        }

        bindSwitch('switch', null, (willOn) => FD_POPUP.setModeOn(willOn));
        bindSwitch('toggle-autoRefresh', 'autoRefresh');
        bindSwitch('toggle-urlRedirect', 'urlRedirect');

        const btnOptions = $id('btnOptions');
        if (btnOptions) {
            btnOptions.addEventListener('click', () => FD_POPUP.openOptions());
        }

        bindStorageMirror();
        await syncAllUI();
    };
})();
