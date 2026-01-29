// src/app/buildings/window_mesh/WindowMeshVariation.js
// Deterministic, per-window variations derived from seed + id (renderer-agnostic).
// @ts-check

import { sanitizeWindowMeshSettings, WINDOW_SHADE_COVERAGE } from './WindowMeshSettings.js';

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

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function pick(rng, list) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return null;
    const idx = Math.floor(rng() * arr.length);
    return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}

function makeRng(seedText) {
    return mulberry32(fnv1a32FromString(seedText));
}

function resolveShadeCoverage({ settings, seedKey }) {
    const shade = settings.shade;
    if (!shade.enabled) return WINDOW_SHADE_COVERAGE.NONE;
    if (!shade.randomizeCoverage) return shade.coverage;

    const rng = makeRng(`${seedKey}|shade_coverage`);
    const v = pick(rng, [0.0, 0.2, 0.5, 1.0]);
    return Number.isFinite(v) ? v : shade.coverage;
}

function resolveInteriorCell({ settings, seedKey }) {
    const interior = settings.interior;
    if (!interior.enabled) return { col: 0, row: 0 };

    const cols = interior.atlas.cols;
    const rows = interior.atlas.rows;

    if (!interior.randomizeCell) {
        const col = Math.max(0, Math.min(cols - 1, interior.cell.col | 0));
        const row = Math.max(0, Math.min(rows - 1, interior.cell.row | 0));
        return { col, row };
    }

    const rng = makeRng(`${seedKey}|interior_cell`);
    const n = Math.max(1, cols * rows);
    const idx = Math.floor(rng() * n);
    const i = Math.max(0, Math.min(n - 1, idx));
    return { col: i % cols, row: Math.floor(i / cols) };
}

function resolveInteriorFlipX({ settings, seedKey }) {
    const interior = settings.interior;
    if (!interior.enabled) return false;
    if (!interior.randomFlipX) return false;
    const rng = makeRng(`${seedKey}|interior_flipx`);
    return rng() < 0.5;
}

function resolveInteriorTint({ settings, seedKey }) {
    const interior = settings.interior;
    if (!interior.enabled) return { hueShiftDeg: 0.0, saturationMul: 1.0, brightnessMul: 1.0 };

    const rng = makeRng(`${seedKey}|interior_tint`);
    const hueRange = interior.tintVariation.hueShiftDeg;
    const satRange = interior.tintVariation.saturationMul;
    const briRange = interior.tintVariation.brightnessMul;
    return {
        hueShiftDeg: lerp(hueRange.min, hueRange.max, rng()),
        saturationMul: lerp(satRange.min, satRange.max, rng()),
        brightnessMul: lerp(briRange.min, briRange.max, rng())
    };
}

/**
 * @typedef {Object} WindowMeshInstanceVariation
 * @property {number} shadeCoverage
 * @property {{col:number,row:number}} interiorCell
 * @property {boolean} interiorFlipX
 * @property {{hueShiftDeg:number,saturationMul:number,brightnessMul:number}} interiorTint
 */

/**
 * @param {Object} args
 * @param {import('./WindowMeshSettings.js').WindowMeshSettings} args.settings
 * @param {string|number} args.seed
 * @param {string|number} args.id
 * @returns {WindowMeshInstanceVariation}
 */
export function computeWindowMeshInstanceVariationFromSanitized({ settings, seed, id }) {
    const safeSettings = settings;
    const seedKey = `${String(seed ?? '')}|${String(id ?? '')}|v:${safeSettings?.version ?? 1}`;
    return {
        shadeCoverage: resolveShadeCoverage({ settings: safeSettings, seedKey }),
        interiorCell: resolveInteriorCell({ settings: safeSettings, seedKey }),
        interiorFlipX: resolveInteriorFlipX({ settings: safeSettings, seedKey }),
        interiorTint: resolveInteriorTint({ settings: safeSettings, seedKey })
    };
}

/**
 * @param {Object} args
 * @param {import('./WindowMeshSettings.js').WindowMeshSettings} args.settings
 * @param {string|number} args.seed
 * @param {string|number} args.id
 * @returns {WindowMeshInstanceVariation}
 */
export function computeWindowMeshInstanceVariation({ settings, seed, id }) {
    const safeSettings = sanitizeWindowMeshSettings(settings);
    return computeWindowMeshInstanceVariationFromSanitized({ settings: safeSettings, seed, id });
}
