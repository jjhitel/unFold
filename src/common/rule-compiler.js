/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

import { util } from './utils.js';

function isSafeRegex(body) {
    if (!body)
        return false;
    if (body.length > 256)
        return false;

    const captureGroups = body.match(/\((?!\?)/g) || [];
    if (captureGroups.length > 8) {
        return false;
    }
    const danger = /(\(.{0,50}\)\+){3,}|(\.\*){2,}|\(\?[<!=]/;
    return !danger.test(body);

}

function parseRegexLine(line, lineNum) {
    const raw = (line ?? "").trim();
    if (!raw)
        return null;
    if (/^(#|\/\/|;)/.test(raw))
        return null;

    const unquote = (s) => {
        if (!s)
            return "";
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            return s.slice(1, -1);
        }
        return s;
    };

    const safeCheck =
        typeof isSafeRegex === "function"
         ? isSafeRegex
         : (body) => {
        if (/^\^?https?:\\\/\\\//.test(body))
            return true;
        if (!body)
            return false;
        if (body.length > 1024)
            return false;
        const danger = /\([^)]+[+*]\)\s*[+*]{1,}/;
        return !danger.test(body);
    };

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    let m;
    let body,
    flags,
    to,
    re;

    try {
        m = raw.match(/^\/((?:\\.|[^/])*)\/([a-z]*)\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/i);
        if (m) {
            body = m[1];
            flags = m[2] || '';
            to = unquote(m[3]);
            if (!isSafeRegex(body)) {
                util.log(`[RULE:L${lineNum}] Regex is too complex: ${body}`);
                return null;
            }
            re = new RegExp(body, flags);
            return {
                re,
                to
            };
        }

        m = raw.match(/^\/((?:\\.|[^/])*)\/([a-z]*)\s*(?:->|=>|→)\s*(.*)$/i);
        if (m) {
            body = m[1];
            flags = m[2] || '';
            to = m[3] ?? '';
            if (!isSafeRegex(body)) {
                util.log(`[RULE:L${lineNum}] Regex is too complex: ${body}`);
                return null;
            }
            re = new RegExp(body, flags);
            return {
                re,
                to
            };
        }

        m = raw.match(/^(.*?)\s*(?:->|=>|→)\s*(.*)$/);
        if (m) {
            const from = m[1].trim();
            to = m[2] ?? '';
            if (!from) {
                util.log(`[RULE:L${lineNum}] Invalid redirect syntax: no source host`);
                return null;
            }

            const escapedFrom = escapeRegex(from).replace(/^\\\*\\\./, '(?:www\\.)?');
            body = `^https?://${escapedFrom}`;

            if (!isSafeRegex(body)) {
                util.log(`[RULE:L${lineNum}] Generated regex is too complex: ${body}`);
                return null;
            }
            re = new RegExp(body);
            return {
                re,
                to
            };
        }

        m = raw.match(/^\/((?:\\.|[^/])*)\/([a-z]*)$/i);
        if (m) {
            body = m[1];
            flags = m[2] || '';
            if (!isSafeRegex(body)) {
                util.log(`[RULE:L${lineNum}] Regex is too complex: ${body}`);
                return null;
            }
            re = new RegExp(body, flags);
            return {
                re,
                to: ''
            };
        }

        util.log(`[RULE:L${lineNum}] Invalid rule syntax`);
        return null;
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
