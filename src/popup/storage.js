(function () {
    'use strict';
    const FD_POPUP = FD.popup;

    FD_POPUP.setModeOn = async(on) => {
        const cur = await FD_POPUP.load(['mode', 'lastNonOffMode']);
        let mode = cur.mode || 'autoDeny';
        let last = cur.lastNonOffMode || (mode !== 'off' ? mode : 'autoDeny');

        if (on) {
            const newMode = (last === 'off') ? 'autoDeny' : last;
            await FD_POPUP.save({
                mode: newMode,
                lastNonOffMode: newMode
            });
        } else {
            if (mode !== 'off')
                last = mode;
            await FD_POPUP.save({
                mode: 'off',
                lastNonOffMode: last
            });
        }
    };

    FD_POPUP.addCurrentHostToList = async(listKey) => {
        const info = await FD_POPUP.getActiveHttpTab();
        if (!info)
            return false;

        const cur = await FD_POPUP.load([listKey]);
        const text = String(cur[listKey] || '').trim();
        const lines = text ? text.split(/\r?\n/) : [];
        lines.push(info.host);

        const final = FD_POPUP.dedup(lines).join('\n');
        await FD_POPUP.save({
            [listKey]: final
        });
        return true;
    };

    FD_POPUP.removeCurrentHostFromList = async(listKey) => {
        const info = await FD_POPUP.getActiveHttpTab();
        if (!info)
            return false;

        const cur = await FD_POPUP.load([listKey]);
        const text = String(cur[listKey] || '').trim();
        const lines = text ? text.split(/\r?\n/) : [];

        const hostLower = info.host.toLowerCase();
        const finalLines = lines.filter(line => line.trim().toLowerCase() !== hostLower);

        const final = finalLines.join('\n');
        await FD_POPUP.save({
            [listKey]: final
        });
        return true;
    };
})();
