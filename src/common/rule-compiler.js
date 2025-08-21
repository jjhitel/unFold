/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

import { util } from './utils.js';
import safeRegex from 'safe-regex';

function deriveLiteralPrefix(re) {
    try {
        const src = re && re.source || "";
        const m = src.match(/^https?:\/\/(.*)$/);
        if (!m) return null;
        let s = m[1];
        let out = "http";
        out += "s?://";
        out = "";
        let lit = "";
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if ("[](){}.+*?^$|".includes(ch)) break;
            if (ch === "\\") {
                i++;
                if (i < s.length) lit += s[i];
            } else {
                lit += ch;
            }
            i++;
        }
        if (!lit) return null;
        return "https://" + lit;
    } catch {
        return null;
    }
}

function isSafeRegex(pattern) {
    return safeRegex(pattern);
}

function parseSimpleLine(raw, lineNum, unquote) {
    const simpleMatch = raw.match(/^(.*?)\s*(?:->|=>|→)\s*(.*)$/);
    if (!simpleMatch)
        return null;

    const from = simpleMatch[1].trim();
    let to = simpleMatch[2].trim() || '';

    if (!from) {
        util.log(`[RULE:L${lineNum}] Invalid redirect syntax: no source pattern`);
        return null;
    }

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

function parseFullRegexLine(raw, lineNum, unquote) {
    try {
        const regexMatch = raw.match(/^\/((?:\\.|[^\/])*)\/([a-z]*)/i);
        if (!regexMatch)
            return null;

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

    if (raw.startsWith('/') && raw.endsWith('/') || raw.match(/^\/(?:\\.|[^\/])+\/[a-z]*/i)) {
        return parseFullRegexLine(raw, lineNum, unquote);
    } else {
        return parseSimpleLine(raw, lineNum, unquote);
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
            if (rule && rule.re && !('prefix' in rule)) {
                try { rule.prefix = deriveLiteralPrefix(rule.re); } catch {}
            }
        }
    }
    return rules;
};
