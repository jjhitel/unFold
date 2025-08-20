'use strict';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { getActiveHttpTab, openOptions, save, setOn, bindSetting } from '../common/ui-utils.js';
import { uiStore } from '../common/storage.js';
import * as storage from '../common/storage.js';
import { C } from '../common/constants.js';

const $id = util.$id;

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

async function initListButtons() {
    const btnDeny = $id('btnDeny');
    const btnAllow = $id('btnAllow');
    const info = await getActiveHttpTab();

    if (!info) {
        if (btnDeny)
            btnDeny.disabled = true;
        if (btnAllow)
            btnAllow.disabled = true;
        return;
    }

    const listStatus = await browser.runtime.sendMessage({
        type: C.MSG_CHECK_LIST_HOST,
        host: info.host,
    }).catch(() => null);

    if (!listStatus)
        return;

    const { inDeny, inAllow } = listStatus;

    if (btnDeny) {
        btnDeny.disabled = false;
        btnDeny.textContent = inDeny ? browser.i18n.getMessage('popup_removeFromDenylist') : browser.i18n.getMessage('popup_addToDenylist');
        btnDeny.onclick = async() => {
            await(inDeny ? storage.removeCurrentHostFromList(C.KEY_DENYLIST) : storage.addCurrentHostToList(C.KEY_DENYLIST));
        };
    }
    if (btnAllow) {
        btnAllow.disabled = false;
        btnAllow.textContent = inAllow ? browser.i18n.getMessage('popup_removeFromAllowlist') : browser.i18n.getMessage('popup_addToAllowlist');
        btnAllow.onclick = async() => {
            await(inAllow ? storage.removeCurrentHostFromList(C.KEY_ALLOWLIST) : storage.addCurrentHostToList(C.KEY_ALLOWLIST));
        };
    }
}

async function syncAllUI() {
    const settings = await uiStore.get(['mode', 'autoRefresh', 'urlRedirect']);
    const mode = settings.mode || C.DEFAULT_MODE;

    setOn($id('switch'), mode !== 'off');
    setOn($id('toggle-autoRefresh'), settings.autoRefresh ?? true);
    setOn($id('toggle-urlRedirect'), settings.urlRedirect ?? false);

    updateListButtonsVisibility(mode);
    await initListButtons();
}

const syncAllUIdebounced = debounce(syncAllUI, 50);

function bindStorageMirror() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            syncAllUIdebounced();
        }
    });
}

export async function initPopupUI() {
    util.localizePage();

    bindSetting('switch', null, 200, (willOn) => storage.setModeOn(willOn));
    bindSetting('toggle-autoRefresh', C.KEY_AUTO_REFRESH);
    bindSetting('toggle-urlRedirect', C.KEY_URL_REDIRECT);

    const btnOptions = $id('btnOptions');
    if (btnOptions) {
        btnOptions.addEventListener('click', () => openOptions());
    }

    bindStorageMirror();
    await syncAllUI();
};
