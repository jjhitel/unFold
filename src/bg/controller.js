'use strict';
import { StateManager, cleanupTabState, updateRules, updateLists } from './stateManager.js';
import { util } from '../common/utils.js';
import { Cache } from '../common/cache.js';
import { onViewportMessage, RELOAD_TIMES, registerListeners, unregisterListeners } from './net.js';
import { handleMessage } from './msg-handler.js';
import { clearRedirectGuard } from './url-redirect.js';
import { C } from '../common/constants.js';

const { log, extractHostname } = util;
const ALARM_NAME = 'remote-rules-update';

async function fetchAndCacheRule(url) {
    const cached = await Cache.get(url);

    const headers = {};
    if (cached?.lastModified)
        headers['If-Modified-Since'] = cached.lastModified;
    if (cached?.etag)
        headers['If-None-Match'] = cached.etag;

    try {
        const res = await fetch(url, {
            cache: 'no-store',
            headers
        });
        if (res.status === 304 && cached) {
            return cached;
        }
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);

        const text = await res.text();

        if (cached && cached.text === text) {
            log(`Content for ${url} is the same, no date update needed.`);
            return cached;
        }

        const ruleData = {
            text,
            lastModified: res.headers.get('Last-Modified') || new Date().toISOString(),
            etag: res.headers.get('ETag') || res.headers.get('last-modified') || ''
        };
        await Cache.set(url, ruleData);
        return ruleData;
    } catch (e) {
        util.log(`Failed to fetch rule from ${url}`, String(e));
        return cached || null;
    }
}

export async function updateCheckedRemoteRules() {
    const { selectedRemoteRules } = await browser.storage.local.get({
        selectedRemoteRules: []
    });
    if (selectedRemoteRules.length === 0) {
        log('No remote rules selected. Skipping update.');
        return;
    }
    const catalogCacheKey = 'remoteCatalog';
    let catalog = await Cache.get(catalogCacheKey);
    if (!catalog) {
        const catalogURL = browser.runtime.getURL('rules.json');
        catalog = await fetch(catalogURL).then(r => r.json()).catch(() => []);
        await Cache.set(catalogCacheKey, catalog, 3 * 60 * 60 * 1000); // cache for 3 hours
    }
    if (!catalog || catalog.length === 0) {
        log('Failed to load remote rules catalog.');
        return;
    }
    log('Starting remote rules update...');

    const ruleUpdates = selectedRemoteRules.map(async id => {
        const ruleMeta = catalog.find(item => item.id === id);
        if (!ruleMeta)
            return null;

        try {
            const ruleData = await fetchAndCacheRule(ruleMeta.url);
            if (!ruleData)
                return null;

            const textKey = ruleMeta.kind === 'mobile' ? 'mobileRedirectRule' : 'desktopRedirectRule';
            const dateKey = util.getRuleLastModifiedKey(ruleMeta.id);
            await browser.storage.local.set({
                [textKey]: ruleData.text,
                [dateKey]: ruleData.lastModified
            });
            return true;
        } catch (e) {
            log(`Failed to update rule: ${ruleMeta.name}`, e);
            return false;
        }
    });

    const results = await Promise.all(ruleUpdates);
    if (results.some(r => r === true)) {
        await browser.storage.local.set({
            remoteRulesLastUpdated: Date.now()
        });
        log('Remote rules update finished successfully.');
    }
}

export async function createUpdateAlarm() {
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

async function _updateBadge(tabId) {
    try {
        const state = StateManager.getState();
        if (!state)
            return;
        let text = "";
        let color = "#9CA3AF";
        const tab = await browser.tabs.get(tabId);
        const url = tab?.url || '';

        if (!/^https?:\/\//i.test(url)) {
            text = "X";
            color = "#9CA3AF";
            await Promise.all([
                    browser.action.setBadgeText({
                        tabId,
                        text
                    }),
                    browser.action.setBadgeBackgroundColor({
                        tabId,
                        color
                    })
                ]);
            return;
        }

        const host = extractHostname(url);

        const isDenied = (state.mode !== 'autoAllow') && StateManager.isHostInDenylist(host);
        if (state.mode === "off" || isDenied) {
            text = "X";
            color = "#9CA3AF";
        } else if (state.mode === "always") {
            text = "D";
            color = "#EF4444";
        } else if (state.mode === "autoDeny" || state.mode === "autoAllow") {
            const isWide = StateManager.isDesktopPreferred(tabId);
            text = isWide ? "D" : "M";
            color = "#10B981";
        }
        await browser.action.setBadgeText({
            tabId,
            text
        });
        await browser.action.setBadgeBackgroundColor({
            tabId,
            color
        });
    } catch (e) {}
}

export const updateBadge = util.debounce(_updateBadge, 150);

export async function updateAllBadges() {
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
    await StateManager.loadInitialTabState(tabId);
    await updateBadge(tabId);
    try {
        const tab = await browser.tabs.get(tabId).catch(() => null);
        if (!tab)
            return;
        if (tab && tab.url && tab.url.startsWith('http')) {
            await browser.tabs.sendMessage(tabId, {
                type: C.MSG_VIEWPORT_CHECK
            });
        }
    } catch (e) {
        log('Failed to send viewport check message', e);
    }
});

browser.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        await updateBadge(tabId);
    }
    if (changeInfo.status === 'complete' && tab.url) {
        clearRedirectGuard?.(tabId);
    }
});

browser.tabs.onRemoved.addListener((tabId) => {
    clearRedirectGuard?.(tabId);
    RELOAD_TIMES.delete(tabId);
    cleanupTabState(tabId).catch(() => {});
    StateManager.getState().isWideByTab.delete(tabId);
    StateManager.getState().stickyMobileByTab.delete(tabId);
    StateManager.getState().formDirtyByTab.delete(tabId);
});

if (browser.webNavigation && browser.webNavigation.onCommitted) {
    browser.webNavigation.onCommitted.addListener(async(details) => {
        if (details.frameId !== 0)
            return;
        const { tabId } = details;
        await StateManager.loadInitialTabState(tabId);
        const state = StateManager.getState();
        if (state.mode === 'autoDeny') {
            const isWide = state.isWideByTab.get(tabId);
            if (isWide === false) {
                await StateManager.updateStickyMobile(tabId, true);
            } else if (isWide === true) {
                await StateManager.updateStickyMobile(tabId, false);
            }
        } else {
            await StateManager.updateStickyMobile(tabId, false);
        }
    });
}

browser.webNavigation.onCompleted.addListener(async(details) => {
    if (details.frameId === 0) {
        const { tabId, url } = details;
        const state = await StateManager.getState();
        if (state.mode === 'autoDeny' || state.mode === 'autoAllow') {
            const isWide = StateManager.isWideByUrl(url);
            const currentState = StateManager.isDesktopPreferred(tabId);
            if (isWide !== currentState) {
                log(`[webNavigation.onCompleted] Syncing state for tab ${tabId}. Expected: ${isWide}, Current: ${currentState}`);
                await StateManager.updateDesktopPreferred(tabId, isWide);
                await updateBadge(tabId);
            }
        }
    }
});

browser.runtime.onMessage.addListener(async(msg, sender) => {
    if (!msg || !msg.type)
        return;
    switch (msg.type) {
    case C.MSG_VIEWPORT_UPDATE:
    case C.MSG_VIEWPORT_CHECK:
        if (sender.tab) {
            onViewportMessage(msg, sender);
        }
        break;
    case C.MSG_FORM_DIRTY_STATUS:
        if (sender.tab) {
            StateManager.updateFormDirty(sender.tab.id, msg.isDirty);
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
        updateAllBadges();
        break;
    case C.MSG_UPDATE_REMOTE_RULES:
        try {
            const catalogURL = browser.runtime.getURL('rules.json');
            const catalog = await fetch(catalogURL).then(r => r.json()).catch(() => []);
            const { selectedRemoteRules } = await browser.storage.local.get({
                selectedRemoteRules: []
            });
            const newSelection = new Set(selectedRemoteRules);
            const keysToRemove = [];

            for (const ruleMeta of catalog) {
                if (!newSelection.has(ruleMeta.id)) {
                    const key = ruleMeta.kind === 'mobile' ? C.KEY_REMOTE_MOBILE_RULE : C.KEY_REMOTE_DESKTOP_RULE;
                    keysToRemove.push(key);
                }
            }

            if (keysToRemove.length > 0) {
                await browser.storage.local.remove(keysToRemove);
            }

            await updateCheckedRemoteRules();
            await updateRules();
            await Cache.clear();
            log('Remote rules toggled, state updated, and cache cleared.');
        } catch (e) {
            log('Error handling remote rule update:', e);
        }
        break;
    case C.MSG_CHECK_LIST_HOST:
        if (msg.host) {
            return Promise.resolve({
                inDeny: StateManager.isHostInDenylist(msg.host),
                inAllow: StateManager.isHostInAllowlist(msg.host),
            });
        }
        break;
    case C.MSG_RULES_UPDATED:
        await Promise.all([
                updateRules(),
                updateLists(),
                Cache.clear()
            ]);
        log('Rules, lists, and cache updated on demand.');
        return true;
    default:
        break;
    }
});

browser.alarms.onAlarm.addListener(async(alarm) => {
    if (alarm.name === ALARM_NAME) {
        log('Triggering scheduled remote rules update...');
        await updateCheckedRemoteRules();
    }
});
