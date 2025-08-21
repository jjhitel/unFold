'use strict';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { getActiveHttpTab, openOptions, save, setOn, bindSetting } from '../common/ui-utils.js';
import { uiStore } from '../common/storage.js';
import * as storage from '../common/storage.js';
import { C } from '../common/constants.js';

const elements = {};

function initElements() {
    elements.modeSwitch = util.$id('switch');
    elements.autoRefreshToggle = util.$id('toggle-autoRefresh');
    elements.urlRedirectToggle = util.$id('toggle-urlRedirect');
    elements.btnDeny = util.$id('btnDeny');
    elements.btnAllow = util.$id('btnAllow');
    elements.btnOptions = util.$id('btnOptions');
    elements.mainActionRow = util.$id('main-action-row');
}

function updateListButtonsVisibility(mode) {
    const modeStr = String(mode || '').toLowerCase();

    if (!elements.mainActionRow || !elements.btnDeny || !elements.btnAllow)
        return;

    elements.btnDeny.style.display = 'none';
    elements.btnAllow.style.display = 'none';

    let isListButtonVisible = false;

    if (modeStr === 'autodeny' || modeStr === 'always') {
        elements.btnDeny.style.display = 'block';
        isListButtonVisible = true;
    } else if (modeStr === 'autoallow') {
        elements.btnAllow.style.display = 'block';
        isListButtonVisible = true;
    }

    elements.mainActionRow.classList.toggle('settings-only', !isListButtonVisible);
}

async function initListButtons() {
    const info = await getActiveHttpTab();

    if (!info) {
        if (elements.btnDeny)
            elements.btnDeny.disabled = true;
        if (elements.btnAllow)
            elements.btnAllow.disabled = true;
        return;
    }

    const listStatus = await browser.runtime.sendMessage({
        type: C.MSG_CHECK_LIST_HOST,
        host: info.host,
    }).catch(() => null);

    if (!listStatus)
        return;

    const { inDeny, inAllow } = listStatus;

    if (elements.btnDeny) {
        elements.btnDeny.disabled = false;
        elements.btnDeny.textContent = inDeny ? browser.i18n.getMessage('popup_removeFromDenylist') : browser.i18n.getMessage('popup_addToDenylist');
        elements.btnDeny.onclick = async() => {
            await(inDeny ? storage.removeCurrentHostFromList(C.KEY_DENYLIST) : storage.addCurrentHostToList(C.KEY_DENYLIST));
        };
    }
    if (elements.btnAllow) {
        elements.btnAllow.disabled = false;
        elements.btnAllow.textContent = inAllow ? browser.i18n.getMessage('popup_removeFromAllowlist') : browser.i18n.getMessage('popup_addToAllowlist');
        elements.btnAllow.onclick = async() => {
            await(inAllow ? storage.removeCurrentHostFromList(C.KEY_ALLOWLIST) : storage.addCurrentHostToList(C.KEY_ALLOWLIST));
        };
    }
}

async function syncAllUI() {
    const settings = await uiStore.get(['mode', 'autoRefresh', 'urlRedirect']);
    const mode = settings.mode || C.DEFAULT_MODE;

    setOn(elements.modeSwitch, mode !== 'off');
    setOn(elements.autoRefreshToggle, settings.autoRefresh ?? true);
    setOn(elements.urlRedirectToggle, settings.urlRedirect ?? false);

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
    initElements();

    bindSetting('switch', null, 200, willOn => storage.setModeOn(willOn));

    for (const id of['toggle-autoRefresh', 'toggle-urlRedirect']) {
        bindSetting(id);
    }

    if (elements.btnOptions) {
        elements.btnOptions.addEventListener('click', () => openOptions());
    }

    bindStorageMirror();
    await syncAllUI();
};
