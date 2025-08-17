'use strict';

export const C = {
    KEY_MODE: 'mode',
    KEY_LAST_MODE: 'lastNonOffMode',
    KEY_AUTO_REFRESH: 'autoRefresh',
    KEY_URL_REDIRECT: 'urlRedirect',
    KEY_DENYLIST: 'denylistText',
    KEY_ALLOWLIST: 'allowlistText',
    KEY_THRESHOLD: 'threshold',
    KEY_DESKTOP_UA: 'desktopUA',
    KEY_UA_DYNAMIC: 'uaDynamic',
    KEY_LAST_BROWSER_VERSION: 'lastBrowserVersion',
    KEY_DESKTOP_RULES: 'desktopRegexText',
    KEY_MOBILE_RULES: 'mobileRegexText',
    KEY_REMOTE_DESKTOP_RULE: 'desktopRedirectRule',
    KEY_REMOTE_MOBILE_RULE: 'mobileRedirectRule',
    KEY_DEBUG_MODE: 'debugMode',
    KEY_AUTO_UPDATE_PERIOD: 'autoUpdatePeriod',
    KEY_REMOTE_SELECTED_RULES: 'selectedRemoteRules',
    KEY_REMOTE_LAST_UPDATED: 'remoteRulesLastUpdated',
    KEY_ZOOM_LEVEL: 'zoomLevel',
    KEY_LITE_MODE: 'liteMode',

    KEY_RULE_LAST_MODIFIED_PREFIX: '::lastModified',

    DEFAULT_MODE: 'autoDeny',
    DEFAULT_THRESHOLD: 600,
    DEFAULT_DESKTOP_UA: 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
    DEFAULT_UA_DYNAMIC: true,
    DEFAULT_AUTO_REFRESH: true,
    DEFAULT_URL_REDIRECT: false,
    DEFAULT_DEBUG_MODE: false,
    DEFAULT_AUTO_UPDATE_PERIOD: 1440,
    DEFAULT_ZOOM_LEVEL: 100,
    DEFAULT_LITE_MODE: false,

    MSG_VIEWPORT_UPDATE: 'FOLD_DESKTOP_VIEWPORT',
    MSG_VIEWPORT_CHECK: 'FOLD_DESKTOP_VIEWPORT_CHECK',
    MSG_SETTINGS_UPDATE: 'FOLD_DESKTOP_SETTINGS_UPDATE',
    MSG_OPEN_OPTIONS: 'FD_OPEN_OPTIONS_TAB',
    MSG_UPDATE_REMOTE_RULES: 'FD_UPDATE_REMOTE_RULES',
    MSG_CHECK_LIST_HOST: 'FD_CHECK_LIST_HOST'
};
