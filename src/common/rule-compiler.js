/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

import { util } from './utils.js';
import safeRegex from 'safe-regex';

function isSafeRegex(pattern) {
    return safeRegex(pattern);
}

function parseRegexLine(line, lineNum) {
    const raw = (line ?? "").trim();
    if (!raw || /^(#|\/\/|;)/.test(raw))
        return null;

    const unquote = (s) => {
        if (!s)
            return "";
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            return s.slice(1, -1);
        }
        return s;
    };

    const simpleMatch = raw.match(/^(.*?)\s*(?:->|=>|→)\s*(.*)$/);
    if (simpleMatch) {
        const from = simpleMatch[1].trim();
        let to = simpleMatch[2].trim() || '';
        if (!from) {
            util.log(`[RULE:L${lineNum}] Invalid redirect syntax: no source pattern`);
            return null;
        }

        if (!from.startsWith('/') || !from.endsWith('/')) {
            if (to && !/^[a-z]+:\/\//i.test(to) && !to.startsWith('{SCHEME}')) {
                to = `{SCHEME}://${to}`;
            }

            let body;
            const escapedFrom = util.escapeRegExp(from);

            if (from.includes('*')) {
                body = '^https?://' + escapedFrom.replace(/\\\*/g, '(.*)');
            } else {
                body = '^https?://' + escapedFrom + '\\/?(?=[?#]|$)';
            }

            const re = new RegExp(body, 'i');
            return {
                re,
                to
            };
        }
    }

    try {
        const regexMatch = raw.match(/^\/((?:\\.|[^\/])*)\/([a-z]*)/i);
        if (!regexMatch) {
            if (!simpleMatch)
                util.log(`[RULE:L${lineNum}] Invalid rule syntax`);
            return null;
        }

        const body = regexMatch[1];
        const flags = regexMatch[2] || '';
        let to = '';

        const substitutionMatch = raw.slice(regexMatch[0].length).match(/^\s*(?:,|->|=>|→)\s*(.*)/);
        if (substitutionMatch) {
            to = unquote(substitutionMatch[1].trim());
        }

        if (!isSafeRegex(regexMatch[0])) {
            util.log(`[RULE:L${lineNum}] Unsafe or complex regex detected: ${body}`);
            return null;
        }

        const re = new RegExp(body, flags);
        return {
            re,
            to
        };

    } catch (e) {
        util.log(`[RULE:L${lineNum}] Failed to compile rule: ${e.message}`);
        return null;
    }
}

export function compileRules(text) {
    const rules = [];
    if (typeof text !== 'string')
        return rules;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const rule = parseRegexLine(lines[i], i + 1);
        if (rule) {
            rules.push(rule);
        }
    }
    return rules;
};
