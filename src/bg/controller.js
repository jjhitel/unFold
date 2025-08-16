(function () {
    'use strict';
    const stateManager = FD.state;
    const { log, extractHostname } = FD.util;
    const Cache = FD.cache;
    const ALARM_NAME = 'remote-rules-update';
    const C = FD.constants;

    async function fetchAndCacheRule(url) {
        const cached = await Cache.get(url);
        if (cached)
            return cached;
        try {
            const res = await fetch(url, {
                cache: 'no-cache'
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const lastModified = res.headers.get('Last-Modified') || new Date().toISOString();
            const ruleData = {
                text,
                lastModified
            };
            await Cache.set(url, ruleData);
            return ruleData;
        } catch (e) {
            log(`Failed to fetch rule from ${url}`, e);
            return null;
        }
    }

    async function updateCheckedRemoteRules() {
        const { selectedRemoteRules } = await browser.storage.local.get({
            selectedRemoteRules: []
        });
        if (selectedRemoteRules.length === 0) {
            log('No remote rules selected. Skipping update.');
            return;
        }
        const catalogURL = browser.runtime.getURL('src/options/rules.json');
        const catalog = await fetch(catalogURL).then(r => r.json()).catch(() => []);
        if (catalog.length === 0) {
            log('Failed to load remote rules catalog.');
            return;
        }
        log('Starting remote rules update...');
        let updated = false;
        for (const id of selectedRemoteRules) {
            const ruleMeta = catalog.find(item => item.id === id);
            if (!ruleMeta)
                continue;
            try {
                const ruleData = await fetchAndCacheRule(ruleMeta.url);
                if (!ruleData)
                    continue;
                const textKey = ruleMeta.kind === 'mobile' ? 'mobileRedirectRule' : 'desktopRedirectRule';
                const dateKey = `${ruleMeta.id}::lastModified`;
                await browser.storage.local.set({
                    [textKey]: ruleData.text,
                    [dateKey]: ruleData.lastModified
                });
                updated = true;
            } catch (e) {
                log(`Failed to update rule: ${ruleMeta.name}`, e);
            }
        }
        if (updated) {
            await browser.storage.local.set({
                remoteRulesLastUpdated: Date.now()
            });
            log('Remote rules update finished.');
        }
    }

    async function createUpdateAlarm() {
        const { autoUpdatePeriod } = await browser.storage.local.get({
            autoUpdatePeriod: 1440
        });
        await browser.alarms.clear(ALARM_NAME);
        if (autoUpdatePeriod > 0) {
            browser.alarms.create(ALARM_NAME, {
                delayInMinutes: 5,
                periodInMinutes: Number(autoUpdatePeriod)
            });
            log(`Update alarm created. Interval: ${autoUpdatePeriod} minutes.`);
        } else {
            log('Auto-update alarm cleared.');
        }
    }

    async function updateBadge(tabId) {
        try {
            const state = stateManager.getState();
            if (!state)
                return;
            let text = "";
            let color = "#9CA3AF";
            const tab = await browser.tabs.get(tabId);
            const host = tab?.url ? extractHostname(tab.url) : "";
            const isDenied = (state.mode !== 'autoAllow') && stateManager.isHostInDenylist(host);
            if (state.mode === "off" || isDenied) {
                text = "X";
                color = "#9CA3AF";
            } else if (state.mode === "always") {
                text = "D";
                color = "#EF4444";
            } else if (state.mode === "autoDeny" || state.mode === "autoAllow") {
                const isWide = stateManager.isDesktopPreferred(tabId);
                text = isWide ? "D" : "M";
                color = "#10B981";
            }
            await browser.browserAction.setBadgeText({
                tabId,
                text
            });
            await browser.browserAction.setBadgeBackgroundColor({
                tabId,
                color
            });
        } catch (e) {}
    }

    async function initAllBadges() {
        try {
            const tabs = await browser.tabs.query({});
            for (const t of tabs) {
                await updateBadge(t.id);
            }
        } catch {}
    }

    browser.tabs.onActivated.addListener(async({
            tabId
        }) => {
        await stateManager.loadInitialTabState(tabId);
        await updateBadge(tabId);
    });

    browser.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading') {
            await updateBadge(tabId);
        }
        if (changeInfo.status === 'complete' && tab.url) {
            FD.net.clearRedirectGuard?.(tabId);
        }
    });

    browser.tabs.onRemoved.addListener((tabId) => {
        FD.net.clearRedirectGuard?.(tabId);
        FD.net.RELOAD_TIMES.delete(tabId);
        stateManager.getState().isWideByTab.delete(tabId);
        stateManager.getState().stickyMobileByTab.delete(tabId);
    });

    if (browser.webNavigation && browser.webNavigation.onCommitted) {
        browser.webNavigation.onCommitted.addListener(async(details) => {
            if (details.frameId !== 0)
                return;
            const { tabId } = details;
            await stateManager.loadInitialTabState(tabId);
            const state = stateManager.getState();
            if (state.mode === 'autoDeny') {
                const isWide = state.isWideByTab.get(tabId);
                if (isWide === false) {
                    await stateManager.updateStickyMobile(tabId, true);
                } else if (isWide === true) {
                    await stateManager.updateStickyMobile(tabId, false);
                }
            } else {
                await stateManager.updateStickyMobile(tabId, false);
            }
        });
    }

    browser.runtime.onMessage.addListener((msg, sender) => {
        if (!msg || !msg.type)
            return;
        switch (msg.type) {
        case C.MSG_VIEWPORT_UPDATE:
            if (sender.tab) {
                FD.net.onViewportMessage(msg, sender);
            }
            break;
        case C.MSG_OPEN_OPTIONS:
            const url = browser.runtime.getURL(`src/options/options.html${msg.hash || ''}`);
            browser.tabs.create({
                url,
                active: true
            });
            break;
        case C.MSG_SETTINGS_UPDATE:
            initAllBadges();
            break;
        case C.MSG_UPDATE_REMOTE_RULES:
            updateCheckedRemoteRules();
            break;
        default:
            break;
        }
    });

    browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            log('Triggering scheduled remote rules update...');
            updateCheckedRemoteRules();
        }
    });

    if (!globalThis.FD)
        globalThis.FD = {};
    FD.updateBadge = updateBadge;
    FD.updateAllBadges = initAllBadges;
    FD.createUpdateAlarm = createUpdateAlarm;
})();
