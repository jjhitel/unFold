'use strict';
import { util } from '../common/utils.js';
import { uiStore } from '../common/store.js';
import { C } from '../common/constants.js';
import { getActiveHttpTab } from '../common/ui-utils.js';

export async function setModeOn(on) {
    const cur = await uiStore.get(['mode', 'lastNonOffMode']);
    let mode = cur.mode || C.DEFAULT_MODE;
    let last = cur.lastNonOffMode || (mode !== 'off' ? mode : C.DEFAULT_MODE);

    if (on) {
        const newMode = (last === 'off') ? C.DEFAULT_MODE : last;
        await popup.save({
            mode: newMode,
            lastNonOffMode: newMode
        });
    } else {
        if (mode !== 'off')
            last = mode;
        await popup.save({
            mode: 'off',
            lastNonOffMode: last
        });
    }
};

export async function addCurrentHostToList(listKey) {
    const info = await getActiveHttpTab();
    if (!info)
        return false;

    const cur = await uiStore.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];
    lines.push(info.host);

    const final = util.normalizeList(lines.join('\n')).join('\n');
    await uiStore.set({
        [listKey]: final
    });
    return true;
};

export async function removeCurrentHostFromList(listKey) {
    const info = await getActiveHttpTab();
    if (!info)
        return false;

    const cur = await uiStore.get([listKey]);
    const text = String(cur[listKey] || '').trim();
    const lines = text ? text.split(/\r?\n/) : [];

    const hostLower = info.host.toLowerCase();
    const finalLines = lines.filter(line => line.trim().toLowerCase() !== hostLower);

    const final = finalLines.join('\n');
    await uiStore.set({
        [listKey]: final
    });
    return true;
};
