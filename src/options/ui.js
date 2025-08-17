'use strict';
import { saveSettings, saveSingleSetting, DEFAULTS, saveUrlRules, saveDenylist, saveAllowlist, loadRemoteCatalog, loadRemoteSelections, toggleRemoteRule } from './storage.js';
import { storage, setSmallStatus } from './utils.js';
import { activateTab } from './tabs.js';
import { util } from '../common/utils.js';

const $id = (id) => document.getElementById(id);
const { debounce } = util;

const MODE_DESCRIPTIONS = {
    off: "options_modeDesc_off",
    autoDeny: "options_modeDesc_autoDeny",
    autoAllow: "options_modeDesc_autoAllow",
    always: "options_modeDesc_always"
};

function updateModeDescription() {
    const mode = $id('mode')?.value || 'off';
    const descEl = $id('mode-description');
    if (descEl) {
        const msgKey = MODE_DESCRIPTIONS[mode];
        descEl.textContent = browser.i18n.getMessage(msgKey) || '';
    }
}

export function refreshTabVisibility(mode) {
    const showUrl = mode !== 'off';
    const showDeny = mode === 'autoDeny' || mode === 'always';
    const showAllow = mode === 'autoAllow';
    document.querySelector('.tab[data-tab="url"]').style.display = showUrl ? '' : 'none';
    document.querySelector('.tab[data-tab="denylist"]').style.display = showDeny ? '' : 'none';
    document.querySelector('.tab[data-tab="allowlist"]').style.display = showAllow ? '' : 'none';
    const curTabButton = document.querySelector('.tab.active');
    if (curTabButton && curTabButton.style.display === 'none') {
        activateTab('main');
    }
};

async function displayLastUpdated() {
    const el = $id('last-updated');
    if (!el)
        return;
    const res = await storage.get('remoteRulesLastUpdated');
    const ts = res?.remoteRulesLastUpdated;
    if (ts) {
        const date = new Date(ts);
        const formatted = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        el.textContent = browser.i18n.getMessage('options_redirect_lastUpdated', formatted);
    } else {
        el.textContent = browser.i18n.getMessage('options_redirect_lastUpdatedNever');
    }
}

function checkPlatformCompatibility() {
    const isAndroid = navigator.userAgent.includes("Android");
    const zoomRow = $id('zoomLevelRow');
    if (isAndroid && zoomRow) {
        zoomRow.style.display = 'none';
    }
}

export function initUIBindings() {
    $id('save')?.addEventListener('click', saveSettings);
    $id('autoRefresh')?.addEventListener('change', (e) => saveSingleSetting('autoRefresh', e.target.checked));
    $id('urlRedirect')?.addEventListener('change', (e) => saveSingleSetting('urlRedirect', e.target.checked));
    $id('debugMode')?.addEventListener('change', (e) => saveSingleSetting('debugMode', e.target.checked));
    $id('autoUpdatePeriod')?.addEventListener('change', (e) => saveSingleSetting('autoUpdatePeriod', Number(e.target.value)));
    $id('zoomLevel')?.addEventListener('change', (e) => saveSingleSetting('zoomLevel', Number(e.target.value)));
    $id('resetUA')?.addEventListener('click', () => {
        $id('ua').value = DEFAULTS.desktopUA;
    });
    $id('resetThreshold')?.addEventListener('click', () => {
        $id('threshold').value = String(DEFAULTS.threshold);
    });
    $id('btn-url-save')?.addEventListener('click', saveUrlRules);
    $id('save-denylist')?.addEventListener('click', saveDenylist);
    $id('save-allowlist')?.addEventListener('click', saveAllowlist);

    const modeDropdown = $id('mode');
    if (modeDropdown) {
        modeDropdown.addEventListener('change', () => {
            updateModeDescription();
            refreshTabVisibility(modeDropdown.value);
        });
    }

    updateModeDescription();
    displayLastUpdated();
    checkPlatformCompatibility();
};

export async function renderRemoteRulesTable() {
    const tbody = document.getElementById('remote-rules');
    if (!tbody)
        return;

    tbody.innerHTML = '';
    const [catalog, selected, storedData] = await Promise.all([
                loadRemoteCatalog(),
                loadRemoteSelections(),
                storage.get(null)
            ]);
    for (const item of catalog) {
        const tr = tbody.insertRow();
        const tdUse = tr.insertCell();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.includes(item.id);
        tdUse.appendChild(cb);
        cb.addEventListener('change', () => toggleRemoteRule(item, cb.checked));

        const tdName = tr.insertCell();
        tdName.innerHTML = `<div class="rule-name">${item.name}</div><div class="rule-desc">${item.desc || ''}</div>`;

        const tdType = tr.insertCell();
        tdType.textContent = (item.kind === 'mobile') ? 'Mobile' : 'Desktop';

        const tdUpd = tr.insertCell();
        const lastModKey = `${item.id}::lastModified`;
        const iso = storedData[lastModKey] || '';
        tdUpd.textContent = iso ? new Date(iso).toISOString().slice(0, 10) : 'N/A';
        tdUpd.title = iso;
    }

    const btn = document.getElementById('btn-remote-update');
    if (btn && !btn.fdBound) {
        btn.fdBound = true;
        btn.addEventListener('click', async() => {
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
