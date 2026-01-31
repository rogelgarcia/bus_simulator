// src/graphics/engine3d/grass/GrassRng.js
// Deterministic RNG helpers for grass generation.
// @ts-check

function fnv1a32FromString(text) {
    const str = String(text ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let t = (Number(seed) >>> 0) || 1;
    return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

export function makeRng(seedText) {
    return mulberry32(fnv1a32FromString(seedText));
}

