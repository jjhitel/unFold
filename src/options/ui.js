(function () {
    'use strict';
    const FD = (window.FD = window.FD || {});
    const $id = FD.$ = (id) => document.getElementById(id);
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
    FD.refreshTabVisibility = function (mode) {
        const showUrl = mode !== 'off';
        const showDeny = mode === 'autoDeny' || mode === 'always';
        const showAllow = mode === 'autoAllow';
        document.querySelector('.tab[data-tab="url"]').style.display = showUrl ? '' : 'none';
        document.querySelector('.tab[data-tab="denylist"]').style.display = showDeny ? '' : 'none';
        document.querySelector('.tab[data-tab="allowlist"]').style.display = showAllow ? '' : 'none';
        const curTabButton = document.querySelector('.tab.active');
        if (curTabButton && curTabButton.style.display === 'none') {
            window.activateTab('main');
        }
    };
    async function displayLastUpdated() {
        const el = $id('last-updated');
        if (!el)
            return;
        const res = await FD.storage.get('remoteRulesLastUpdated');
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
        const zoomDesc = $id('zoomLevelDesc');
        if (isAndroid) {
            if (zoomRow) {
                zoomRow.style.display = 'none';
            }
            if (zoomDesc) {
                zoomDesc.textContent = browser.i18n.getMessage('options_zoomLevelDesc_mobile');
            }
        } else {
            if (zoomDesc) {
                zoomDesc.textContent = browser.i18n.getMessage('options_zoomLevelDesc');
            }
        }
    }
    FD.bindCaptureCalculator = function () {};
    FD.initUIBindings = function () {
        $id('save')?.addEventListener('click', () => FD.saveSettings());
        $id('autoRefresh')?.addEventListener('change', (e) => FD.saveSingleSetting('autoRefresh', e.target.checked));
        $id('urlRedirect')?.addEventListener('change', (e) => FD.saveSingleSetting('urlRedirect', e.target.checked));
        $id('debugMode')?.addEventListener('change', (e) => FD.saveSingleSetting('debugMode', e.target.checked));
        $id('autoUpdatePeriod')?.addEventListener('change', (e) => FD.saveSingleSetting('autoUpdatePeriod', Number(e.target.value)));
        $id('zoomLevel')?.addEventListener('change', (e) => FD.saveSingleSetting('zoomLevel', Number(e.target.value)));
        $id('resetUA')?.addEventListener('click', () => {
            if ($id('ua'))
                $id('ua').value = FD.DEFAULTS.desktopUA;
        });
        $id('resetThreshold')?.addEventListener('click', () => {
            if ($id('threshold'))
                $id('threshold').value = String(FD.DEFAULTS.threshold);
        });
        $id('btn-url-save')?.addEventListener('click', () => FD.saveUrlRules());
        $id('save-denylist')?.addEventListener('click', () => FD.saveDenylist());
        $id('save-allowlist')?.addEventListener('click', () => FD.saveAllowlist());
        const modeDropdown = $id('mode');
        if (modeDropdown) {
            modeDropdown.addEventListener('change', () => {
                updateModeDescription();
                FD.refreshTabVisibility(modeDropdown.value);
            });
        }
        FD.bindCaptureCalculator();
        updateModeDescription();
        displayLastUpdated();
        checkPlatformCompatibility();
    };
    FD.renderRemoteRulesTable = async function () {
        const table = document.getElementById('remote-rules-table');
        const tbody = document.getElementById('remote-rules');
        if (!table || !tbody)
            return;
        const thead = table.querySelector('thead');
        if (thead) {
            thead.querySelector('[data-i18n="options_rules_use"]').textContent = browser.i18n.getMessage("options_rules_use");
            thead.querySelector('[data-i18n="options_rules_name"]').textContent = browser.i18n.getMessage("options_rules_name");
            thead.querySelector('[data-i18n="options_rules_type"]').textContent = browser.i18n.getMessage("options_rules_type");
            thead.querySelector('[data-i18n="options_rules_header_updated"]').textContent = browser.i18n.getMessage("options_rules_header_updated");
        }
        tbody.innerHTML = '';
        const [catalog, selected, storedData] = await Promise.all([
                    FD.loadRemoteCatalog(),
                    FD.loadRemoteSelections(),
                    FD.storage.get(null)
                ]);
        for (const item of catalog) {
            const tr = tbody.insertRow();
            const tdUse = tr.insertCell();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selected.includes(item.id);
            tdUse.appendChild(cb);
            cb.addEventListener('change', () => FD.toggleRemoteRule(item, cb.checked));
            const tdName = tr.insertCell();
            const ruleNameDiv = document.createElement('div');
            ruleNameDiv.className = 'rule-name';
            ruleNameDiv.textContent = item.name;
            const ruleDescDiv = document.createElement('div');
            ruleDescDiv.className = 'rule-desc';
            ruleDescDiv.textContent = item.desc || '';
            tdName.appendChild(ruleNameDiv);
            tdName.appendChild(ruleDescDiv);
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
                FD.setSmallStatus('status-remote', browser.i18n.getMessage('options_rules_status_updating'), 0);
                try {
                    await browser.runtime.sendMessage({
                        type: 'FD_UPDATE_REMOTE_RULES'
                    });
                } catch (e) {
                    FD.setSmallStatus('status-remote', `Error: ${e.message}`);
                }
            });
        }
    };
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local')
            return;
        if (changes.remoteRulesLastUpdated) {
            displayLastUpdated();
            FD.setSmallStatus('status-remote', browser.i18n.getMessage('options_rules_status_updated'));
            if ($id('remote-rules'))
                FD.renderRemoteRulesTable();
        }
    });
})();
