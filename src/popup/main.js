'use strict';
import { initPopupUI } from './ui.js';

const boot = () => {
    initPopupUI();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
