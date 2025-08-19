'use strict';
import { util } from '../common/utils.js';
import { StateManager } from './stateManager.js';
import { CLIENT_HINTS_HEADERS, shimUA } from './ua-inject.js';
import { updateBadge } from './controller.js';

const { log } = util;
export const RELOAD_TIMES = new Map();
const TAB_RULE_IDS = new Map();

function showAlertInPage(message) {
    if (document.getElementById('unfold-alerter-host'))
        return;

    const host = document.createElement('div');
    host.id = 'unfold-alerter-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({
        mode: 'open'
    });

    const style = document.createElement('style');
    style.textContent = `
        .banner {
            position: fixed; top: 0; left: 0; width: 100%;
            background-color: #FFA500;
            color: white;
            padding: 4px 0;
            font-family: sans-serif; font-size: 13px; font-weight: 500;
            z-index: 2147483647;
            text-align: center;
            opacity: 0;
            transform: translateY(-100%);
            transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
        }
    `;

    const banner = document.createElement('div');
    banner.className = 'banner';

    const bannerText = document.createElement('span');
    bannerText.className = 'banner-text';
    bannerText.textContent = message;

    banner.appendChild(bannerText);
    shadow.appendChild(style);
    shadow.appendChild(banner);

    requestAnimationFrame(() => {
        banner.style.opacity = '1';
        banner.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => host.remove(), 300);
    }, 4000);
}

function isSafeToReload(tabId) {
    return !StateManager.isFormDirty(tabId);
}

function getEffectiveWidth(msg) {
    const vw = msg.vvWidth || msg.innerWidth || 0;
    const sw = msg.screenWidth || 0;
    return (vw && sw) ? Math.min(vw, sw) : (vw || sw);
}

function getFoldState(width, tabId) {
    const state = StateManager.getState();
    const prevWide = StateManager.isDesktopPreferred(tabId);
    const HYSTERESIS_PX = 100;
    const thresholdUp = state.threshold;
    const thresholdDown = Math.max(100, thresholdUp - HYSTERESIS_PX);
    return prevWide ? (width >= thresholdDown) : (width >= thresholdUp);
}

async function handleAutoRefresh(tabId, changed) {
    const state = StateManager.getState();
    if (!changed || !state.autoRefresh || (state.mode !== 'autoDeny' && state.mode !== 'autoAllow')) {
        return;
    }

    const last = RELOAD_TIMES.get(tabId) || 0;
    const now = Date.now();
    if (now - last > 1200) {
        RELOAD_TIMES.set(tabId, now);
        if (isSafeToReload(tabId)) {
            try {
                await browser.tabs.reload(tabId);
            } catch (e) {
                log('Tab reload failed', e);
            }
        } else {
            log(`Auto-refresh blocked for tab ${tabId} due to a dirty form.`);
            const message = browser.i18n.getMessage('notification_reloadBlocked_message');
            try {
                await browser.scripting.executeScript({
                    target: {
                        tabId
                    },
                    injectImmediately: true,
                    world: "MAIN",
                    func: showAlertInPage,
                    args: [message]
                });
            } catch (e) {
                log('Failed to show in-page alert:', e);
            }
        }
    }
}

export async function onViewportMessage(msg, sender) {
    const tabId = sender.tab.id;
    const effectiveWidth = getEffectiveWidth(msg);
    const isNowWide = getFoldState(effectiveWidth, tabId);

    const changed = StateManager.updateTabWidth(tabId, isNowWide);
    await handleAutoRefresh(tabId, changed);
    await updateBadge(tabId, isNowWide);
    await refreshTabRules(tabId);
}

async function applyUAShim(tabId) {
    const state = StateManager.getState();
    try {
        await browser.scripting.executeScript({
            target: {
                tabId,
                allFrames: state.compatMode,
            },
            injectImmediately: true,
            world: 'MAIN',
            func: shimUA,
            args: [state.desktopUA],
        });
    } catch (e) {}
}

function buildHeaderRule(tabId, state) {
    return {
        id: tabId * 1000 + 1,
        priority: 1,
        action: {
            type: 'modifyHeaders',
            requestHeaders: [
                { header: 'user-agent', operation: 'set', value: state.desktopUA },
                ...CLIENT_HINTS_HEADERS.map((h) => ({ header: h, operation: 'remove' })),
            ],
        },
        condition: {
            tabIds: [tabId],
            resourceTypes: state.compatMode
                ? ['main_frame', 'sub_frame', 'xmlhttprequest']
                : ['main_frame', 'xmlhttprequest'],
        },
    };
}

function buildRedirectRules(tabId, state, isDesktop) {
    const bucket = isDesktop ? state.desktopRedirectRules : state.mobileRedirectRules;
    const rules = [];
    let offset = 2;
    for (const r of bucket) {
        if (!r || !r.to)
            continue;
        const baseId = tabId * 1000 + offset;
        const caseSensitive = r.re.flags.includes('i') ? false : true;
        if (r.to.includes('{SCHEME}')) {
            for (const scheme of ['http', 'https']) {
                rules.push({
                    id: tabId * 1000 + offset,
                    priority: 1,
                    action: {
                        type: 'redirect',
                        regexSubstitution: r.to.replace(/\{SCHEME\}/g, scheme),
                    },
                    condition: {
                        regexFilter: r.re.source.replace('https?', scheme),
                        isUrlFilterCaseSensitive: caseSensitive,
                        tabIds: [tabId],
                        resourceTypes: ['main_frame', 'sub_frame'],
                    },
                });
                offset++;
            }
        } else {
            rules.push({
                id: baseId,
                priority: 1,
                action: { type: 'redirect', regexSubstitution: r.to },
                condition: {
                    regexFilter: r.re.source,
                    isUrlFilterCaseSensitive: caseSensitive,
                    tabIds: [tabId],
                    resourceTypes: ['main_frame', 'sub_frame'],
                },
            });
            offset++;
        }
    }
    return rules;
}

export async function refreshTabRules(tabId) {
    const existing = TAB_RULE_IDS.get(tabId) || [];
    if (existing.length) {
        await browser.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existing,
        });
    }
    const state = StateManager.getState();
    if (state.mode === 'off') {
        TAB_RULE_IDS.set(tabId, []);
        return;
    }
    const isDesktop = state.mode === 'always' || StateManager.isDesktopPreferred(tabId);
    const rules = [];
    const ids = [];

    if (isDesktop) {
        const headerRule = buildHeaderRule(tabId, state);
        rules.push(headerRule);
        ids.push(headerRule.id);
        await applyUAShim(tabId);
    }

    if (state.urlRedirect) {
        const redirectRules = buildRedirectRules(tabId, state, isDesktop);
        rules.push(...redirectRules);
        ids.push(...redirectRules.map((r) => r.id));
    }

    if (rules.length) {
        await browser.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
    TAB_RULE_IDS.set(tabId, ids);
}

export async function refreshAllRules() {
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
        await refreshTabRules(t.id);
    }
}

export async function clearTabRules(tabId) {
    const existing = TAB_RULE_IDS.get(tabId);
    if (existing && existing.length) {
        await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing });
        TAB_RULE_IDS.delete(tabId);
    }
}
