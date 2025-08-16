// This file is based on the HNTrieContainer class from uBlock Origin by Raymond Hill.
// Copyright (C) 2017-present Raymond Hill
// Licensed under the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
// https://github.com/gorhill/uBlock
'use strict';

const PAGE_SIZE = 65536;
const TRIE0_SLOT = 64;
const TRIE1_SLOT = 65;
const CHAR0_SLOT = 66;
const CHAR1_SLOT = 67;
const TRIE0_START = 272;

const roundToPageSize = v => (v + PAGE_SIZE - 1) & ~(PAGE_SIZE - 1);

export class HNTrieContainer {
    constructor() {
        const len = PAGE_SIZE;
        this.buf = new Uint8Array(len);
        this.buf32 = new Uint32Array(this.buf.buffer);
        this.needle = '';
        this.buf32[TRIE0_SLOT] = TRIE0_START;
        this.buf32[TRIE1_SLOT] = this.buf32[TRIE0_SLOT];
        this.buf32[CHAR0_SLOT] = len >>> 1;
        this.buf32[CHAR1_SLOT] = this.buf32[CHAR0_SLOT];
    }

    reset() {
        this.buf32.fill(0, TRIE0_SLOT);
        this.buf32[TRIE0_SLOT] = TRIE0_START;
        this.buf32[TRIE1_SLOT] = this.buf32[TRIE0_SLOT];
        this.buf32[CHAR0_SLOT] = this.buf.length >>> 1;
        this.buf32[CHAR1_SLOT] = this.buf32[CHAR0_SLOT];
        this.needle = '';
        this.buf[255] = 0;
    }

    setNeedle(needle) {
        if (needle !== this.needle) {
            const buf = this.buf;
            let i = needle.length;
            if (i > 255) {
                i = 255;
            }
            buf[255] = i;
            while (i--) {
                buf[i] = needle.charCodeAt(i);
            }
            this.needle = needle;
        }
        return this;
    }

    matches(iroot) {
        const buf32 = this.buf32;
        const buf8 = this.buf;
        const char0 = buf32[CHAR0_SLOT];
        let ineedle = buf8[255];
        let icell = buf32[iroot];
        if (icell === 0) {
            return -1;
        }
        let c = 0,
        v = 0,
        i0 = 0,
        n = 0;
        for (; ; ) {
            if (ineedle === 0) {
                return -1;
            }
            ineedle -= 1;
            c = buf8[ineedle];
            for (; ; ) {
                v = buf32[icell + 2];
                i0 = char0 + (v >>> 8);
                if (buf8[i0] === c) {
                    break;
                }
                icell = buf32[icell];
                if (icell === 0) {
                    return -1;
                }
            }
            n = v & 0x7F;
            if (n > 1) {
                n -= 1;
                if (n > ineedle) {
                    return -1;
                }
                i0 += 1;
                const i1 = i0 + n;
                do {
                    ineedle -= 1;
                    if (buf8[i0] !== buf8[ineedle]) {
                        return -1;
                    }
                    i0 += 1;
                } while (i0 < i1);
            }
            if ((v & 0x80) !== 0) {
                if (ineedle === 0 || buf8[ineedle - 1] === 0x2E) {
                    return ineedle;
                }
            }
            icell = buf32[icell + 1];
            if (icell === 0) {
                break;
            }
        }
        return -1;
    }

    createTrie() {
        if ((this.buf32[CHAR0_SLOT] - this.buf32[TRIE1_SLOT]) < 12) {
            this.growBuf(12, 0);
        }
        const iroot = this.buf32[TRIE1_SLOT] >>> 2;
        this.buf32[TRIE1_SLOT] += 12;
        this.buf32.fill(0, iroot, iroot + 3);
        return iroot;
    }

    add(iroot) {
        let lhnchar = this.buf[255];
        if (lhnchar === 0) {
            return 0;
        }
        if ((this.buf32[CHAR0_SLOT] - this.buf32[TRIE1_SLOT]) < 24 || (this.buf.length - this.buf32[CHAR1_SLOT]) < 256) {
            this.growBuf(24, 256);
        }
        let icell = this.buf32[iroot];
        if (icell === 0) {
            this.buf32[iroot] = this.addLeafCell(lhnchar);
            return 1;
        }
        const char0 = this.buf32[CHAR0_SLOT];
        let isegchar,
        lsegchar,
        boundaryBit,
        inext;
        for (; ; ) {
            const v = this.buf32[icell + 2];
            let isegchar0 = char0 + (v >>> 8);
            if (this.buf[isegchar0] !== this.buf[lhnchar - 1]) {
                inext = this.buf32[icell];
                if (inext === 0) {
                    this.buf32[icell] = this.addLeafCell(lhnchar);
                    return 1;
                }
                icell = inext;
                continue;
            }
            isegchar = 1;
            lhnchar -= 1;
            lsegchar = v & 0x7F;
            if (lsegchar !== 1) {
                for (; ; ) {
                    if (isegchar === lsegchar || lhnchar === 0 || this.buf[isegchar0 + isegchar] !== this.buf[lhnchar - 1]) {
                        break;
                    }
                    isegchar += 1;
                    lhnchar -= 1;
                }
            }
            boundaryBit = v & 0x80;
            if (isegchar === lsegchar) {
                if (lhnchar === 0) {
                    if (boundaryBit !== 0) {
                        return 0;
                    }
                    this.buf32[icell + 2] = v | 0x80;
                } else {
                    if (boundaryBit !== 0 && this.buf[lhnchar - 1] === 0x2E) {
                        return -1;
                    }
                    inext = this.buf32[icell + 1];
                    if (inext !== 0) {
                        icell = inext;
                        continue;
                    }
                    this.buf32[icell + 1] = this.addLeafCell(lhnchar);
                }
            } else {
                isegchar0 -= char0;
                this.buf32[icell + 2] = isegchar0 << 8 | isegchar;
                inext = this.addCell(0, this.buf32[icell + 1], isegchar0 + isegchar << 8 | boundaryBit | lsegchar - isegchar);
                this.buf32[icell + 1] = inext;
                if (lhnchar !== 0) {
                    this.buf32[inext] = this.addLeafCell(lhnchar);
                } else {
                    this.buf32[icell + 2] |= 0x80;
                }
            }
            return 1;
        }
    }

    addCell(idown, iright, v) {
        let icell = this.buf32[TRIE1_SLOT];
        this.buf32[TRIE1_SLOT] = icell + 12;
        icell >>>= 2;
        this.buf32[icell] = idown;
        this.buf32[icell + 1] = iright;
        this.buf32[icell + 2] = v;
        return icell;
    }

    addLeafCell(lsegchar) {
        const r = this.buf32[TRIE1_SLOT] >>> 2;
        let i = r;
        while (lsegchar > 127) {
            this.buf32[i] = 0;
            this.buf32[i + 1] = i + 3;
            this.buf32[i + 2] = this.addSegment(lsegchar, lsegchar - 127);
            lsegchar -= 127;
            i += 3;
        }
        this.buf32[i] = 0;
        this.buf32[i + 1] = 0;
        this.buf32[i + 2] = this.addSegment(lsegchar, 0) | 0x80;
        this.buf32[TRIE1_SLOT] = i + 3 << 2;
        return r;
    }

    addSegment(lsegchar, lsegend) {
        if (lsegchar === 0) {
            return 0;
        }
        let char1 = this.buf32[CHAR1_SLOT];
        const isegchar = char1 - this.buf32[CHAR0_SLOT];
        let i = lsegchar;
        do {
            this.buf[char1++] = this.buf[--i];
        } while (i !== lsegend);
        this.buf32[CHAR1_SLOT] = char1;
        return isegchar << 8 | lsegchar - lsegend;
    }

    growBuf(trieGrow, charGrow) {
        const char0 = Math.max(roundToPageSize(this.buf32[TRIE1_SLOT] + trieGrow), this.buf32[CHAR0_SLOT]);
        const char1 = char0 + this.buf32[CHAR1_SLOT] - this.buf32[CHAR0_SLOT];
        const bufLen = Math.max(roundToPageSize(char1 + charGrow), this.buf.length * 2);
        this.resizeBuf(bufLen, char0);
    }

    resizeBuf(bufLen, char0) {
        const charDataLen = this.buf32[CHAR1_SLOT] - this.buf32[CHAR0_SLOT];
        if (bufLen !== this.buf.length) {
            const newBuf = new Uint8Array(bufLen);
            newBuf.set(new Uint8Array(this.buf.buffer, 0, this.buf32[TRIE1_SLOT]), 0);
            newBuf.set(new Uint8Array(this.buf.buffer, this.buf32[CHAR0_SLOT], charDataLen), char0);
            this.buf = newBuf;
            this.buf32 = new Uint32Array(this.buf.buffer);
        }
        if (char0 !== this.buf32[CHAR0_SLOT]) {
            this.buf.set(new Uint8Array(this.buf.buffer, this.buf32[CHAR0_SLOT], charDataLen), char0);
        }
        this.buf32[CHAR0_SLOT] = char0;
        this.buf32[CHAR1_SLOT] = char0 + charDataLen;
    }
}
