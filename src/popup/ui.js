'use strict';
import { util } from '../common/utils.js';
import * as popup from './utils.js';
import * as storage from './storage.js';
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

function bindSwitch(elId, storageKey, onSave) {
    const el = $id(elId);
    if (!el)
        return;

    el.addEventListener('click', async() => {
        const willOn = !el.classList.contains('on');
        await(onSave ? onSave(willOn) : popup.save({
                [storageKey]: willOn
            }));
    });
}

async function initListButtons() {
    const btnDeny = $id('btnDeny');
    const btnAllow = $id('btnAllow');
    const info = await popup.getActiveHttpTab();

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
    const settings = await popup.load(['mode', 'autoRefresh', 'urlRedirect']);
    const mode = settings.mode || C.DEFAULT_MODE;

    popup.setOn($id('switch'), mode !== 'off');
    popup.setOn($id('toggle-autoRefresh'), settings.autoRefresh ?? true);
    popup.setOn($id('toggle-urlRedirect'), settings.urlRedirect ?? false);

    updateListButtonsVisibility(mode);
    await initListButtons();
}

const syncAllUIdebounced = util.debounce(syncAllUI, 50);

function bindStorageMirror() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            syncAllUIdebounced();
        }
    });
}

export async function initPopupUI() {
    util.localizePage();

    bindSwitch('switch', null, (willOn) => storage.setModeOn(willOn));
    bindSwitch('toggle-autoRefresh', 'autoRefresh');
    bindSwitch('toggle-urlRedirect', 'urlRedirect');

    const btnOptions = $id('btnOptions');
    if (btnOptions) {
        btnOptions.addEventListener('click', () => popup.openOptions());
    }

    bindStorageMirror();
    await syncAllUI();
};
