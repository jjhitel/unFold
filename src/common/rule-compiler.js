/**
 * This is a lightweight redirect rule compiler inspired by uBlock Origin's filter parsing principles (pre-compilation).
 * Instead of a complex AST, it extracts only the regular expressions and substitution strings needed for unFold.
 */
'use strict';

function parseRegexLine(line) {
    const s = String(line || '').trim();
    if (!s || s.startsWith('#'))
        return null;

    let match = s.match(/^\[?\s*\/(.+)\/([a-z]*)\s*,\s*["'](.+)["']\s*\]?$/i);
    if (!match) {
        match = s.match(/^\/(.+)\/([a-z]*)\s*->\s*(.+)$/i);
    }
    if (!match)
        return null;

    try {
        return {
            re: new RegExp(match[1], match[2] || ''),
            to: match[3]
        };
    } catch (e) {
        return null;
    }
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
