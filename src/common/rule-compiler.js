/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

import { util } from './utils.js';
import safeRegex from 'safe-regex';

function deriveLiteralPrefix(re) {
    try {
        const source = re?.source || '';
        const match = source.match(/^https?:\/\/([^\\[\(\{\)\.\+\*\?\^\$|]*)/);
        if (!match || !match[1]) {
            return null;
        }
        return `https://${match[1]}`;
    } catch {
        return null;
    }
}

function deriveHost(re) {
    if (!re)
        return null;
    try {
        const source = re.source;
        const match = source.match(/^(?:\\^)?(?:https?:\\\/\\\/)?(?:www\\.)?([a-z0-9_.-]+\\.[a-z]{2,})/i);
        if (match && match[1]) {
            return match[1].replace(/\\\./g, '.');
        }
    } catch {}
    return null;
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
    const hostPart = from.split('/')[0];
    const host = hostPart.replace(/^\*\./, '').replace(/\*$/, '');

    return {
        re,
        to,
        host
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
        const host = deriveHost(re);

        return {
            re,
            to,
            host
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

    if (raw.startsWith('/') && (raw.includes('/') && raw.lastIndexOf('/') > 0)) {
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
            if (rule && rule.re && !('prefix' in rule)) {
                try {
                    rule.prefix = deriveLiteralPrefix(rule.re);
                } catch {}
            }
            rules.push(rule);
        }
    }
    return rules;
};
