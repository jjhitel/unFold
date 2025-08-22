'use strict';
import './msg-handler.js';
import { StateManager, cleanupTabState, shouldApplyTransformation } from './stateManager.js';
import { util } from '../common/utils.js';
import { Cache } from '../common/cache.js';
import { onViewportMessage, RELOAD_TIMES } from './net.js';
import { clearRedirectGuard } from './url-redirect.js';
import { C } from '../common/constants.js';

const { log, extractHostname } = util;
const ALARM_NAME = C.ALARM_REMOTE_RULES_UPDATE;

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
    const catalogCacheKey = C.KEY_REMOTE_CATALOG;
    let catalog = await Cache.get(catalogCacheKey);
    if (!catalog) {
        const catalogURL = browser.runtime.getURL(C.FILE_REMOTE_RULES_JSON);
        catalog = await fetch(catalogURL).then(r => r.json()).catch(() => []);
        await Cache.set(catalogCacheKey, catalog, C.CACHE_REMOTE_CATALOG_TTL);
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
            delayInMinutes: C.ALARM_DELAY_MINUTES,
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

        const isHttp = /^https?:\/\//i.test(url);
        const isDesktop = shouldApplyTransformation(tabId, url);

        if (!isHttp) {
            text = isDesktop ? "!" : "X";
            color = isDesktop ? "#EF4444" : "#9CA3AF";
        } else if (state.mode === "off") {
            text = isDesktop ? "!" : "X";
            color = isDesktop ? "#EF4444" : "#9CA3AF";
        } else if (state.mode === "always") {
            text = isDesktop ? "D" : "!";
            color = "#EF4444";
        } else {
            text = isDesktop ? "D" : "M";
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
        clearRedirectGuard?.(tabId);
        await StateManager.updateFormDirty(tabId, false);
        await StateManager.loadInitialTabState(tabId);
        try {
            const tab = await browser.tabs.get(tabId).catch(() => null);
            if (tab && tab.url && tab.url.startsWith('http')) {
                await browser.tabs.sendMessage(tabId, {
                    type: C.MSG_VIEWPORT_CHECK
                });
            }
        } catch (e) {
            log('Failed to send viewport check message on committed', e);
        }
    });
}

browser.alarms.onAlarm.addListener(async(alarm) => {
    if (alarm.name === ALARM_NAME) {
        log('Triggering scheduled remote rules update...');
        await updateCheckedRemoteRules();
    }
});
