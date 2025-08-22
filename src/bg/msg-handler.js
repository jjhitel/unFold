'use strict';
import { StateManager, updateRules, updateLists } from './stateManager.js';
import { util } from '../common/utils.js';
import { Cache } from '../common/cache.js';
import { onViewportMessage } from './net.js';
import { updateAllBadges, updateCheckedRemoteRules } from './controller.js';
import { C } from '../common/constants.js';

const { log } = util;

export async function handleMessage(msg, sender) {
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
        await Promise.all([updateRules(), updateLists()]);
        await Cache.clear();
        log('Rules, lists, and cache updated on demand.');
        return true;
    default:
        break;
    }
}

browser.runtime.onMessage.addListener(handleMessage);
