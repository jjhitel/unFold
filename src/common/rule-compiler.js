/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

import safeRegex from 'safe-regex';

function isSafeRegex(body) {
    if (!body)
        return false;
    return safeRegex(body);
}

function parseRegexLine(line) {
    const raw = (line ?? "").trim();
    if (!raw)
        return null;
    if (/^(#|\/\/|;)/.test(raw))
        return null;

    const unquote = (s) => {
        if (!s)
            return "";
        const q = s[0];
        if ((q === '"' || q === "'" || q === "`") && s[s.length - 1] === q) {
            s = s.slice(1, -1);
        }
        return s
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
    };

    const safeCheck = safeRegex;

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    let m = raw.match(
            /^\/((?:\\.|[^/])*)\/([a-z]*)\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/i);
    if (m) {
        const body = m[1];
        const flags = m[2] || "";
        const to = unquote(m[3]);
        if (!safeCheck(body))
            return null;
        try {
            const re = new RegExp(body, flags);
            return {
                re,
                to
            };
        } catch {
            return null;
        }
    }

    m = raw.match(/^\/((?:\\.|[^/])*)\/([a-z]*)\s*(?:->|=>|→)\s*(.*)$/i);
    if (m) {
        const body = m[1];
        const flags = m[2] || "";
        const to = m[3] ?? "";
        if (!safeCheck(body))
            return null;
        try {
            const re = new RegExp(body, flags);
            return {
                re,
                to
            };
        } catch {
            return null;
        }
    }

    m = raw.match(/^(.*?)\s*(?:->|=>|→)\s*(.*)$/);
    if (m) {
        const from = m[1].trim();
        const to = m[2] ?? "";
        if (!from)
            return null;

        const escapedFrom = escapeRegex(from).replace(/^\\\*\\\./, '(?:www\\.)?');
        const body = `^https?://${escapedFrom}`;

        if (!safeCheck(body))
            return null;
        try {
            const re = new RegExp(body);
            return {
                re,
                to
            };
        } catch {
            return null;
        }
    }

    m = raw.match(/^\/((?:\\.|[^/])*)\/([a-z]*)$/i);
    if (m) {
        const body = m[1];
        const flags = m[2] || "";
        if (!safeCheck(body))
            return null;
        try {
            const re = new RegExp(body, flags);
            return {
                re,
                to: ""
            };
        } catch {
            return null;
        }
    }

    return null;
}

export function compileRules(text) {
    const rules = [];
    if (typeof text !== 'string')
        return rules;

    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const rule = parseRegexLine(line);
        if (rule) {
            rules.push(rule);
        }
    }
    return rules;
};
