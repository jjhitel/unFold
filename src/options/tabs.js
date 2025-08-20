'use strict';

export function activateTab(name) {

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));

    const tabToActivate = document.querySelector(`.tab[data-tab="${name}"]`);
    const panelToShow = document.getElementById(`tab-${name}`);

    if (tabToActivate && panelToShow) {
        if (tabToActivate.style.display === 'none') {
            activateTab('main');
            return;
        }
        tabToActivate.classList.add('active');
        showTabPanel(panelToShow);
    } else {
        document.querySelector('.tab[data-tab="main"]')?.classList.add('active');
        showTabPanel(document.getElementById('tab-main'));
    }

    try {
        history.replaceState(null, '', '#' + name);
    } catch (e) {}
}

function showTabPanel(panel) {
    if (!panel)
        return;
    const container = document.getElementById('tab-container');
    if (container) {
        container.scrollLeft = panel.offsetLeft;
    }
}

function initSwipe() {
    const container = document.getElementById('tab-container');
    let startX,
    endX;

    if (!container)
        return;

    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    });

    container.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        const diff = endX - startX;
        const swipeThreshold = 50;
        if (Math.abs(diff) < swipeThreshold) {
            return;
        }

        const tabs = Array.from(document.querySelectorAll('.tab'))
            .filter(t => t.style.display !== 'none');
        if (tabs.length <= 1)
            return;

        const activeTabButton = document.querySelector('.tab.active');
        const activeTabIndex = tabs.indexOf(activeTabButton);
        if (activeTabIndex === -1)
            return;

        let nextTabIndex = activeTabIndex;
        if (diff > 0) {
            nextTabIndex = Math.max(0, activeTabIndex - 1);
        } else {
            nextTabIndex = Math.min(tabs.length - 1, activeTabIndex + 1);
        }

        const nextTabName = tabs[nextTabIndex]?.getAttribute('data-tab');
        if (nextTabName) {
            activateTab(nextTabName);
        }
    });
}

document.querySelector('.tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) {
        e.preventDefault();
        const name = btn.getAttribute('data-tab') || 'main';
        activateTab(name);
    }
});

(function init() {
    const hash = (location.hash || '#main').replace(/^#/, '');
    const validTabs = ['main', 'url', 'denylist', 'allowlist'];
    const initialTab = validTabs.includes(hash) ? hash : 'main';
    activateTab(initialTab);
    initSwipe();
})();
