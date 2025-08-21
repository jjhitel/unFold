'use strict';
import { uiStore, saveUrlRules, saveDenylist, saveAllowlist, loadRemoteCatalog, loadRemoteSelections, toggleRemoteRule } from '../common/storage.js';
import { setSmallStatus, bindSetting } from '../common/ui-utils.js';
import { activateTab } from './tabs.js';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { C } from '../common/constants.js';

const MODE_DESCRIPTIONS = {
    off: "options_modeDesc_off",
    autoDeny: "options_modeDesc_autoDeny",
    autoAllow: "options_modeDesc_autoAllow",
    always: "options_modeDesc_always"
};

const elements = {};

function initElements() {
    elements.modeSelect = util.$id('mode');
    elements.modeDescription = util.$id('mode-description');
    elements.btnUrlSave = util.$id('btn-url-save');
    elements.saveDenylist = util.$id('save-denylist');
    elements.saveAllowlist = util.$id('save-allowlist');
    elements.captureUnfolded = util.$id('captureUnfolded');
    elements.thresholdInput = util.$id('threshold');
    elements.uaInput = util.$id('ua');
    elements.resetUa = util.$id('resetUA');
    elements.zoomLevelRow = util.$id('zoomLevelRow');
    elements.lastUpdatedEl = util.$id('last-updated');
    elements.remoteRulesTableBody = util.$id('remote-rules');
    elements.btnRemoteUpdate = util.$id('btn-remote-update');
    elements.statusRemote = util.$id('status-remote');
}

function updateModeDescription() {
    const mode = elements.modeSelect?.value || 'off';
    if (elements.modeDescription) {
        const msgKey = MODE_DESCRIPTIONS[mode];
        elements.modeDescription.textContent = browser.i18n.getMessage(msgKey) || '';
    }
}

export function refreshTabVisibility(mode) {
    const showUrl = mode !== 'off';
    const showDeny = mode === 'autoDeny' || mode === 'always';
    const showAllow = mode === 'autoAllow';
    const toggle = (name, show) => {
        const tab = document.querySelector(`.tab[data-tab="${name}"]`);
        const panel = util.$id(`tab-${name}`);
        if (tab)
            tab.style.display = show ? '' : 'none';
        if (panel)
            panel.style.display = show ? '' : 'none';
    };
    toggle('url', showUrl);
    toggle('denylist', showDeny);
    toggle('allowlist', showAllow);
    const curTabButton = document.querySelector('.tab.active');
    if (curTabButton && curTabButton.style.display === 'none') {
        activateTab('main');
    }
};

async function displayLastUpdated() {
    if (!elements.lastUpdatedEl)
        return;
    const res = await uiStore.get('remoteRulesLastUpdated');
    const ts = res?.remoteRulesLastUpdated;
    if (ts) {
        const date = new Date(ts);
        const formatted = `${date.toLocaleString()}`;
        elements.lastUpdatedEl.textContent = browser.i18n.getMessage('options_redirect_lastUpdated', formatted);
    } else {
        elements.lastUpdatedEl.textContent = browser.i18n.getMessage('options_redirect_lastUpdatedNever');
    }
}

function checkPlatformCompatibility() {
    const isAndroid = navigator.userAgent.includes("Android");
    if (isAndroid && elements.zoomLevelRow) {
        elements.zoomLevelRow.style.display = 'none';
    }
}

export function initUIBindings() {
    initElements();

    elements.btnUrlSave?.addEventListener('click', saveUrlRules);
    elements.saveDenylist?.addEventListener('click', saveDenylist);
    elements.saveAllowlist?.addEventListener('click', saveAllowlist);
    elements.captureUnfolded?.addEventListener('click', async() => {
        const recommendedThreshold = window.screen.width - 30;
        if (elements.thresholdInput) {
            elements.thresholdInput.value = recommendedThreshold;
        }
        await uiStore.set({
            threshold: recommendedThreshold
        });
        browser.runtime.sendMessage({
            type: C.MSG_SETTINGS_UPDATE
        }).catch(() => {});
    });

    for (const id of['mode', 'autoRefresh', 'urlRedirect', 'debugMode', 'compatMode', 'threshold', 'autoUpdatePeriod']) {
        const callback = id === 'mode' ? value => {
            updateModeDescription();
            refreshTabVisibility(value);
        }
         : null;
        bindSetting(id, null, 200, callback);
    }

    if (elements.uaInput) {
        const debouncedSave = util.debounce(async(value) => {
            await uiStore.set({
                desktopUA: value,
                uaDynamic: false
            });
            browser.runtime.sendMessage({
                type: C.MSG_SETTINGS_UPDATE
            }).catch(() => {});
        }, 300);
        elements.uaInput.addEventListener('input', (e) => debouncedSave(e.target.value));
    }

    elements.resetUa?.addEventListener('click', async() => {
        try {
            const info = await browser.runtime.getBrowserInfo();
            const ver = String(info?.version || '');
            const m = ver.match(/^(\d+)(?:\.(\d+))?/);
            const major = m?.[1] ?? '141';
            const minor = m?.[2] ?? '0';
            const v = `${major}.${minor}`;
            const dyn = `Mozilla/5.0 (X11; Linux x86_64; rv:${v}) Gecko/20100101 Firefox/${v}`;
            if (elements.uaInput) {
                elements.uaInput.value = dyn;
            }
            await uiStore.set({
                desktopUA: dyn,
                uaDynamic: true,
                lastBrowserVersion: v
            });
        } catch {
            const fallback = 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0';
            if (elements.uaInput) {
                elements.uaInput.value = fallback;
            }
            await uiStore.set({
                desktopUA: fallback,
                uaDynamic: true
            });
        }
    });
    updateModeDescription();
    displayLastUpdated();
    checkPlatformCompatibility();
};

export async function renderRemoteRulesTable() {
    if (!elements.remoteRulesTableBody)
        return;

    while (elements.remoteRulesTableBody.firstChild) {
        elements.remoteRulesTableBody.removeChild(elements.remoteRulesTableBody.firstChild);
    }
    const [catalog, selected, storedData] = await Promise.all([
                loadRemoteCatalog(),
                loadRemoteSelections(),
                uiStore.get(null)
            ]);
    for (const item of catalog) {
        const tr = elements.remoteRulesTableBody.insertRow();
        const tdUse = tr.insertCell();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.includes(item.id);
        tdUse.appendChild(cb);
        cb.addEventListener('change', () => toggleRemoteRule(item, cb.checked));

        const tdName = tr.insertCell();
        const nameDiv = document.createElement('div');
        nameDiv.className = 'rule-name';
        nameDiv.textContent = item.name;

        const descDiv = document.createElement('div');
        descDiv.className = 'rule-desc';
        descDiv.textContent = item.desc || '';

        tdName.appendChild(nameDiv);
        tdName.appendChild(descDiv);

        const tdType = tr.insertCell();
        tdType.textContent = (item.kind === 'mobile') ? 'Mobile' : 'Desktop';

        const tdUpd = tr.insertCell();
        const lastModKey = util.getRuleLastModifiedKey(item.id);
        const iso = storedData[lastModKey] || '';
        tdUpd.textContent = iso ? new Date(iso).toISOString().slice(0, 10) : 'N/A';
        tdUpd.title = iso;
    }

    if (elements.btnRemoteUpdate && !elements.btnRemoteUpdate.fdBound) {
        elements.btnRemoteUpdate.fdBound = true;
        elements.btnRemoteUpdate.addEventListener('click', async() => {
            setSmallStatus('status-remote', browser.i18n.getMessage('options_rules_status_updating'), 0);
            try {
                await browser.runtime.sendMessage({
                    type: 'FD_UPDATE_REMOTE_RULES'
                });
            } catch (e) {
                setSmallStatus('status-remote', `Error: ${e.message}`);
            }
        });
    }
};

const handleStorageChange = debounce((changes, area) => {
    if (area !== 'local')
        return;
    if (changes.remoteRulesLastUpdated) {
        displayLastUpdated();
        setSmallStatus('status-remote', browser.i18n.getMessage('options_rules_status_updated'));
        renderRemoteRulesTable();
    }
}, 100);

browser.storage.onChanged.addListener(handleStorageChange);
