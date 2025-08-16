(function () {
    'use strict';

    function activateTab(name) {

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tabpanel').forEach(p => p.hidden = true);

        const tabToActivate = document.querySelector(`.tab[data-tab="${name}"]`);
        const panelToShow = document.getElementById(`tab-${name}`);

        if (tabToActivate && panelToShow) {
            if (tabToActivate.style.display === 'none') {

                activateTab('main');
                return;
            }
            tabToActivate.classList.add('active');
            panelToShow.hidden = false;
        } else {

            document.querySelector('.tab[data-tab="main"]')?.classList.add('active');
            document.getElementById('tab-main')?.removeAttribute('hidden');
        }

        try {
            history.replaceState(null, '', '#' + name);
        } catch (e) {}
    }

    window.activateTab = activateTab;

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
    })();

})();
