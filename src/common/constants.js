(function () {
    'use strict';
    if (!globalThis.FD)
        globalThis.FD = {};
    const C = {

        KEY_MODE: 'mode',
        KEY_LAST_MODE: 'lastNonOffMode',
        KEY_AUTO_REFRESH: 'autoRefresh',
        KEY_URL_REDIRECT: 'urlRedirect',
        KEY_DENYLIST: 'denylistText',
        KEY_ALLOWLIST: 'allowlistText',
        KEY_THRESHOLD: 'threshold',
        KEY_DESKTOP_UA: 'desktopUA',
        KEY_DESKTOP_RULES: 'desktopRegexText',
        KEY_MOBILE_RULES: 'mobileRegexText',
        KEY_REMOTE_DESKTOP_RULE: 'desktopRedirectRule',
        KEY_REMOTE_MOBILE_RULE: 'mobileRedirectRule',
        KEY_DEBUG_MODE: 'debugMode',
        KEY_AUTO_UPDATE_PERIOD: 'autoUpdatePeriod',
        KEY_REMOTE_SELECTED_RULES: 'selectedRemoteRules',
        KEY_REMOTE_LAST_UPDATED: 'remoteRulesLastUpdated',
        KEY_ZOOM_LEVEL: 'zoomLevel',

        KEY_RULE_LAST_MODIFIED: (id) => `${id}::lastModified`,

        DEFAULT_MODE: 'autoDeny',
        DEFAULT_THRESHOLD: 600,
        DEFAULT_DESKTOP_UA: 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
        DEFAULT_AUTO_REFRESH: true,
        DEFAULT_URL_REDIRECT: false,
        DEFAULT_DEBUG_MODE: false,
        DEFAULT_AUTO_UPDATE_PERIOD: 1440,
        DEFAULT_ZOOM_LEVEL: 100,

        MSG_VIEWPORT_UPDATE: 'FOLD_DESKTOP_VIEWPORT',
        MSG_VIEWPORT_CHECK: 'FOLD_DESKTOP_VIEWPORT_CHECK',
        MSG_SETTINGS_UPDATE: 'FOLD_DESKTOP_SETTINGS_UPDATE',
        MSG_OPEN_OPTIONS: 'FD_OPEN_OPTIONS_TAB',
        MSG_UPDATE_REMOTE_RULES: 'FD_UPDATE_REMOTE_RULES',
        MSG_CHECK_LIST_HOST: 'FD_CHECK_LIST_HOST'
    };
    globalThis.FD.constants = C;
})();
