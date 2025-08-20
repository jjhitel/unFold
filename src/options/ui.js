'use strict';
import { uiStore, saveUrlRules, saveDenylist, saveAllowlist, loadRemoteCatalog, loadRemoteSelections, toggleRemoteRule } from '../common/storage.js';
import { setSmallStatus, bindSetting } from '../common/ui-utils.js';
import { activateTab } from './tabs.js';
import { util } from '../common/utils.js';
import debounce from 'just-debounce-it';
import { C } from '../common/constants.js';

const $id = (id) => document.getElementById(id);

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
    const toggle = (name, show) => {
        const tab = document.querySelector(`.tab[data-tab="${name}"]`);
        const panel = document.getElementById(`tab-${name}`);
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
    const el = $id('last-updated');
    if (!el)
        return;
    const res = await uiStore.get('remoteRulesLastUpdated');
    const ts = res?.remoteRulesLastUpdated;
    if (ts) {
        const date = new Date(ts);
        const formatted = `${date.toLocaleString()}`;
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
    $id('btn-url-save')?.addEventListener('click', saveUrlRules);
    $id('save-denylist')?.addEventListener('click', saveDenylist);
    $id('save-allowlist')?.addEventListener('click', saveAllowlist);
    $id('captureUnfolded')?.addEventListener('click', async() => {
        const recommendedThreshold = window.screen.width - 30;
        $id('threshold').value = recommendedThreshold;
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
            await uiStore.set({
                desktopUA: dyn,
                uaDynamic: true,
                lastBrowserVersion: v
            });
        } catch {
            const fallback = 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0';
            $id('ua').value = fallback;
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
    const tbody = document.getElementById('remote-rules');
    if (!tbody)
        return;

    while (tbody.firstChild) {
        tbody.removeChild(tbody.firstChild);
    }
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
