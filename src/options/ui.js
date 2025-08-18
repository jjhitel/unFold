'use strict';
import { uiStore, saveUrlRules, saveDenylist, saveAllowlist, loadRemoteCatalog, loadRemoteSelections, toggleRemoteRule } from '../common/storage.js';
import { setSmallStatus, bindCheckbox, bindSelect, bindTextInput, showSaved } from '../common/ui-utils.js';
import { activateTab } from './tabs.js';
import { util } from '../common/utils.js';
import { C } from '../common/constants.js';

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
    const res = await uiStore.get('remoteRulesLastUpdated');
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

function bindCaptureButtons() {
    let foldedWidth = 0;
    let unfoldedWidth = 0;
    const statusEl = $id('cal-status');

    const renderStatus = () => {
        let msg = '';
        if (foldedWidth > 0) {
            msg += `${browser.i18n.getMessage('options_cal_folded')}: ${foldedWidth}px `;
        }
        if (unfoldedWidth > 0) {
            msg += `${browser.i18n.getMessage('options_cal_unfolded')}: ${unfoldedWidth}px`;
        }
        statusEl.textContent = msg;
    };

    $id('captureFolded')?.addEventListener('click', () => {
        foldedWidth = window.innerWidth;
        renderStatus();
    });

    $id('captureUnfolded')?.addEventListener('click', () => {
        unfoldedWidth = window.innerWidth;
        renderStatus();
    });

    $id('calcThreshold')?.addEventListener('click', () => {
        if (foldedWidth > 0 && unfoldedWidth > 0) {
            const threshold = Math.round((foldedWidth + unfoldedWidth) / 2);
            $id('threshold').value = threshold;
            saveSingleSetting('threshold', threshold);
            setSmallStatus('cal-status', `Threshold calculated: ${threshold}px`);
        } else {
            setSmallStatus('cal-status', 'Please capture both folded and unfolded widths.');
        }
    });

    $id('resetCaptures')?.addEventListener('click', () => {
        foldedWidth = 0;
        unfoldedWidth = 0;
        renderStatus();
    });

    renderStatus();
}

export function initUIBindings() {
    $id('btn-url-save')?.addEventListener('click', saveUrlRules);
    $id('save-denylist')?.addEventListener('click', saveDenylist);
    $id('save-allowlist')?.addEventListener('click', saveAllowlist);

    bindSelect('mode', 'mode', (value) => {
        updateModeDescription();
        refreshTabVisibility(value);
    });
    bindCheckbox('autoRefresh', 'autoRefresh');
    bindCheckbox('urlRedirect', 'urlRedirect');
    bindCheckbox('debugMode', 'debugMode');
    bindCheckbox('liteMode', 'liteMode');

    const uaInput = $id('ua');
    if (uaInput) {
        const debouncedSave = util.debounce(async(value) => {
            await uiStore.set({
                desktopUA: value,
                uaDynamic: false
            });
            browser.runtime.sendMessage({
                type: C.MSG_SETTINGS_UPDATE
            }).catch(() => {});
        }, 300);
        uaInput.addEventListener('input', (e) => debouncedSave(e.target.value));
    }

    bindTextInput('threshold', 'threshold', 300);
    bindTextInput('zoomLevel', 'zoomLevel', 300);
    bindSelect('autoUpdatePeriod', 'autoUpdatePeriod');

    $id('resetUA')?.addEventListener('click', async() => {
        try {
            const info = await browser.runtime.getBrowserInfo();
            const ver = String(info?.version || '');
            const m = ver.match(/^(\d+)(?:\.(\d+))?/);
            const major = m?.[1] ?? '141';
            const minor = m?.[2] ?? '0';
            const v = `${major}.${minor}`;
            const dyn = `Mozilla/5.0 (X11; Linux x86_64; rv:${v}) Gecko/20100101 Firefox/${v}`;
            $id('ua').value = dyn;
            await browser.storage.local.set({
                desktopUA: dyn,
                uaDynamic: true,
                lastBrowserVersion: v
            });
        } catch {
            const fallback = 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0';
            $id('ua').value = fallback;
            await browser.storage.local.set({
                desktopUA: fallback,
                uaDynamic: true
            });
        }
    });

    const bindResetThreshold = (id) => {
        const el = $id(id);
        if (!el)
            return;
        el.addEventListener('click', async() => {
            const def = Number(C.DEFAULT_THRESHOLD);
            $id('threshold').value = String(def);
            await uiStore.set({
                threshold: def
            });
            browser.runtime.sendMessage({
                type: C.MSG_SETTINGS_UPDATE
            }).catch(() => {});
        });
    };
    bindResetThreshold('resetThreshold');
    bindCaptureButtons();

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
                uiStore.get(null)
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
