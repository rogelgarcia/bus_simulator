// src/graphics/assets3d/generators/building_fabrication/FacadeLetteringGeometry.js
// AI 508: facade signage lettering — extruded block glyphs for building name
// signs (a carved-frieze "BRADBURY", a storefront fascia sign).
//
// The letterforms are a built-in stroke font: each glyph is a list of thick
// centerline segments in a unit box (baseline y=0, cap height y=1, advance
// width per glyph), so there is no font-file pipeline. A stroke renders as an
// extruded quad prism; diagonals get perpendicular butt ends, which reads as
// chunky industrial block capitals. Caps only — input is uppercased.
// @ts-check
import * as THREE from 'three';

// Stroke width in glyph units (cap height = 1).
const STROKE = 0.16;
const H = STROKE / 2;

// Glyphs: `w` = advance width (units), `s` = strokes `[x0, y0, x1, y1]`
// (centerlines; a bar's outer edge lands half a stroke past its centerline).
const GLYPHS = Object.freeze({
    ' ': { w: 0.46, s: [] },
    '-': { w: 0.5, s: [[0.06, 0.5, 0.44, 0.5]] },
    '.': { w: 0.28, s: [[0.06, 0.08, 0.22, 0.08]] },
    '&': {
        w: 0.88,
        s: [[0.66, 0.76, 0.58, 0.92], [0.58, 0.92, 0.3, 0.92], [0.3, 0.92, 0.14, 0.76], [0.14, 0.76, 0.14, 0.62], [0.14, 0.62, 0.7, 0.08], [0.7, 0.08, 0.28, 0.08], [0.28, 0.08, 0.1, 0.26], [0.1, 0.26, 0.1, 0.42], [0.1, 0.42, 0.56, 0.86], [0.46, 0.52, 0.8, 0.08], [0.6, 0.34, 0.8, 0.58]]
    },
    A: { w: 0.78, s: [[0.06, 0.0, 0.39, 1.0], [0.72, 0.0, 0.39, 1.0], [0.2, 0.3, 0.58, 0.3]] },
    B: {
        w: 0.72,
        s: [
            [0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.52, 0.92], [0.08, 0.5, 0.56, 0.5],
            [0.08, 0.08, 0.56, 0.08], [0.52, 0.92, 0.52, 0.5], [0.56, 0.5, 0.56, 0.08]
        ]
    },
    C: { w: 0.7, s: [[0.08, 0.06, 0.08, 0.94], [0.08, 0.92, 0.62, 0.92], [0.08, 0.08, 0.62, 0.08]] },
    D: {
        w: 0.74,
        s: [
            [0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.42, 0.92], [0.08, 0.08, 0.42, 0.08],
            [0.42, 0.92, 0.66, 0.68], [0.42, 0.08, 0.66, 0.32], [0.66, 0.68, 0.66, 0.32]
        ]
    },
    E: { w: 0.66, s: [[0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.58, 0.92], [0.08, 0.5, 0.5, 0.5], [0.08, 0.08, 0.58, 0.08]] },
    F: { w: 0.62, s: [[0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.58, 0.92], [0.08, 0.5, 0.48, 0.5]] },
    G: {
        w: 0.74,
        s: [
            [0.08, 0.06, 0.08, 0.94], [0.08, 0.92, 0.64, 0.92], [0.08, 0.08, 0.64, 0.08],
            [0.66, 0.08, 0.66, 0.45], [0.66, 0.45, 0.4, 0.45]
        ]
    },
    H: { w: 0.72, s: [[0.08, 0.0, 0.08, 1.0], [0.64, 0.0, 0.64, 1.0], [0.08, 0.5, 0.64, 0.5]] },
    I: { w: 0.44, s: [[0.22, 0.0, 0.22, 1.0], [0.04, 0.92, 0.4, 0.92], [0.04, 0.08, 0.4, 0.08]] },
    J: { w: 0.6, s: [[0.52, 0.08, 0.52, 1.0], [0.08, 0.08, 0.52, 0.08], [0.08, 0.08, 0.08, 0.3]] },
    K: { w: 0.72, s: [[0.08, 0.0, 0.08, 1.0], [0.64, 1.0, 0.12, 0.47], [0.2, 0.55, 0.66, 0.0]] },
    L: { w: 0.62, s: [[0.08, 0.0, 0.08, 1.0], [0.08, 0.08, 0.58, 0.08]] },
    M: { w: 0.9, s: [[0.08, 0.0, 0.08, 1.0], [0.82, 0.0, 0.82, 1.0], [0.08, 1.0, 0.45, 0.42], [0.82, 1.0, 0.45, 0.42]] },
    N: { w: 0.76, s: [[0.08, 0.0, 0.08, 1.0], [0.68, 0.0, 0.68, 1.0], [0.08, 0.96, 0.68, 0.04]] },
    O: { w: 0.76, s: [[0.08, 0.06, 0.08, 0.94], [0.68, 0.06, 0.68, 0.94], [0.08, 0.92, 0.68, 0.92], [0.08, 0.08, 0.68, 0.08]] },
    P: { w: 0.68, s: [[0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.54, 0.92], [0.08, 0.46, 0.54, 0.46], [0.54, 0.92, 0.54, 0.46]] },
    Q: {
        w: 0.78,
        s: [
            [0.08, 0.06, 0.08, 0.94], [0.68, 0.06, 0.68, 0.94], [0.08, 0.92, 0.68, 0.92],
            [0.08, 0.08, 0.68, 0.08], [0.48, 0.3, 0.72, -0.02]
        ]
    },
    R: {
        w: 0.72,
        s: [
            [0.08, 0.0, 0.08, 1.0], [0.08, 0.92, 0.54, 0.92], [0.08, 0.46, 0.54, 0.46],
            [0.54, 0.92, 0.54, 0.46], [0.36, 0.46, 0.66, 0.0]
        ]
    },
    S: {
        w: 0.68,
        s: [
            [0.08, 0.92, 0.6, 0.92], [0.08, 0.92, 0.08, 0.54], [0.08, 0.5, 0.6, 0.5],
            [0.6, 0.46, 0.6, 0.08], [0.08, 0.08, 0.6, 0.08]
        ]
    },
    T: { w: 0.68, s: [[0.04, 0.92, 0.64, 0.92], [0.34, 0.0, 0.34, 0.92]] },
    U: { w: 0.74, s: [[0.08, 0.08, 0.08, 1.0], [0.66, 0.08, 0.66, 1.0], [0.08, 0.08, 0.66, 0.08]] },
    V: { w: 0.78, s: [[0.06, 1.0, 0.39, 0.0], [0.72, 1.0, 0.39, 0.0]] },
    W: { w: 1.02, s: [[0.06, 1.0, 0.27, 0.0], [0.48, 0.62, 0.27, 0.0], [0.48, 0.62, 0.69, 0.0], [0.96, 1.0, 0.69, 0.0]] },
    X: { w: 0.72, s: [[0.06, 1.0, 0.66, 0.0], [0.66, 1.0, 0.06, 0.0]] },
    Y: { w: 0.74, s: [[0.06, 1.0, 0.37, 0.5], [0.68, 1.0, 0.37, 0.5], [0.37, 0.5, 0.37, 0.0]] },
    Z: { w: 0.68, s: [[0.06, 0.92, 0.62, 0.92], [0.6, 0.9, 0.08, 0.1], [0.06, 0.08, 0.62, 0.08]] },
    0: { w: 0.76, s: [[0.08, 0.06, 0.08, 0.94], [0.68, 0.06, 0.68, 0.94], [0.08, 0.92, 0.68, 0.92], [0.08, 0.08, 0.68, 0.08]] },
    1: { w: 0.5, s: [[0.28, 0.0, 0.28, 1.0], [0.1, 0.72, 0.28, 0.96], [0.06, 0.08, 0.46, 0.08]] },
    2: { w: 0.68, s: [[0.06, 0.92, 0.58, 0.92], [0.6, 0.9, 0.6, 0.55], [0.6, 0.55, 0.08, 0.12], [0.06, 0.08, 0.62, 0.08]] },
    3: { w: 0.66, s: [[0.06, 0.92, 0.56, 0.92], [0.58, 0.9, 0.58, 0.1], [0.2, 0.5, 0.58, 0.5], [0.06, 0.08, 0.56, 0.08]] },
    4: { w: 0.72, s: [[0.52, 0.0, 0.52, 1.0], [0.52, 1.0, 0.06, 0.34], [0.04, 0.34, 0.68, 0.34]] },
    5: {
        w: 0.68,
        s: [
            [0.08, 0.92, 0.6, 0.92], [0.08, 0.92, 0.08, 0.54], [0.08, 0.54, 0.54, 0.54],
            [0.58, 0.5, 0.58, 0.12], [0.06, 0.08, 0.56, 0.08]
        ]
    },
    6: {
        w: 0.7,
        s: [
            [0.08, 0.06, 0.08, 0.94], [0.08, 0.92, 0.6, 0.92], [0.08, 0.5, 0.56, 0.5],
            [0.6, 0.46, 0.6, 0.12], [0.08, 0.08, 0.6, 0.08]
        ]
    },
    7: { w: 0.64, s: [[0.04, 0.92, 0.58, 0.92], [0.58, 0.9, 0.26, 0.0]] },
    8: {
        w: 0.72,
        s: [
            [0.08, 0.06, 0.08, 0.94], [0.64, 0.06, 0.64, 0.94], [0.08, 0.92, 0.64, 0.92],
            [0.08, 0.5, 0.64, 0.5], [0.08, 0.08, 0.64, 0.08]
        ]
    },
    9: {
        w: 0.7,
        s: [
            [0.62, 0.06, 0.62, 0.94], [0.1, 0.92, 0.62, 0.92], [0.08, 0.9, 0.08, 0.54],
            [0.08, 0.5, 0.6, 0.5], [0.08, 0.08, 0.6, 0.08]
        ]
    }
});

export const FACADE_LETTERING_DEFAULT_SPACING_RATIO = 0.18;

// Corner offsets of one thick stroke: perpendicular butt ends, so a diagonal's
// end corners overshoot its endpoint by up to half a stroke on each axis.
function strokeCornerExtents(x0, y0, x1, y1, half) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) return null;
    const px = Math.abs(dy / len) * half;
    const py = Math.abs(dx / len) * half;
    return {
        minX: Math.min(x0, x1) - px,
        maxX: Math.max(x0, x1) + px,
        minY: Math.min(y0, y1) - py,
        maxY: Math.max(y0, y1) + py
    };
}

/**
 * Lays the text out in glyph units (cap height = 1). Unsupported characters
 * take a space's advance so the layout stays stable, and are reported so the
 * caller can warn. `ink` is the exact bounding box of the rendered strokes
 * (diagonal butt ends overshoot the em box slightly, like type overshoot) —
 * fitting and centering must use it, not the advance width.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.letterSpacingRatio] extra advance between glyphs, in units
 * @returns {{
 *   glyphs: Array<{char: string, x: number, strokes: number[][]}>,
 *   widthUnits: number,
 *   ink: { minX: number, minY: number, maxX: number, maxY: number } | null,
 *   unsupported: string[]
 * }}
 */
export function layoutFacadeLetteringText(text, { letterSpacingRatio = FACADE_LETTERING_DEFAULT_SPACING_RATIO } = {}) {
    const raw = typeof text === 'string' ? text : '';
    const spacing = Number.isFinite(Number(letterSpacingRatio)) ? Math.max(0, Math.min(2, Number(letterSpacingRatio))) : FACADE_LETTERING_DEFAULT_SPACING_RATIO;
    const glyphs = [];
    const unsupported = [];
    let x = 0;
    let ink = null;
    for (const rawChar of raw.toUpperCase()) {
        const known = Object.prototype.hasOwnProperty.call(GLYPHS, rawChar);
        const glyph = known ? GLYPHS[rawChar] : GLYPHS[' '];
        if (!known && rawChar !== ' ' && !unsupported.includes(rawChar)) unsupported.push(rawChar);
        const strokes = known ? glyph.s : [];
        glyphs.push({ char: rawChar, x, strokes });
        for (const stroke of strokes) {
            const ext = strokeCornerExtents(stroke[0], stroke[1], stroke[2], stroke[3], H);
            if (!ext) continue;
            if (!ink) {
                ink = { minX: x + ext.minX, maxX: x + ext.maxX, minY: ext.minY, maxY: ext.maxY };
            } else {
                ink.minX = Math.min(ink.minX, x + ext.minX);
                ink.maxX = Math.max(ink.maxX, x + ext.maxX);
                ink.minY = Math.min(ink.minY, ext.minY);
                ink.maxY = Math.max(ink.maxY, ext.maxY);
            }
        }
        x += glyph.w + spacing;
    }
    const widthUnits = glyphs.length ? Math.max(0, x - spacing) : 0;
    return { glyphs, widthUnits, ink, unsupported };
}

// One extruded stroke: a thick centerline segment becomes a quad prism.
// Front face at z1, back at z0; UVs project along z (side smear is invisible
// at signage stroke sizes and irrelevant for color materials).
function pushStrokePrism(positions, uvs, { x0, y0, x1, y1, half, z0, z1 }) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) return;
    const px = (-dy / len) * half;
    const py = (dx / len) * half;
    // CCW seen from +z (front).
    let corners = [
        [x0 - px, y0 - py],
        [x1 - px, y1 - py],
        [x1 + px, y1 + py],
        [x0 + px, y0 + py]
    ];
    const area = (corners[1][0] - corners[0][0]) * (corners[2][1] - corners[0][1])
        - (corners[1][1] - corners[0][1]) * (corners[2][0] - corners[0][0]);
    if (area < 0) corners = corners.slice().reverse();

    const quad = (a, b, c, d) => {
        for (const p of [a, b, c, a, c, d]) {
            positions.push(p[0], p[1], p[2]);
            uvs.push(p[0], p[1]);
        }
    };
    const F = corners.map(([x, y]) => [x, y, z1]);
    const B = corners.map(([x, y]) => [x, y, z0]);
    quad(F[0], F[1], F[2], F[3]);
    quad(B[3], B[2], B[1], B[0]);
    for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        quad(B[i], B[j], F[j], F[i]);
    }
}

/**
 * Builds one merged sign geometry. Origin: left end of the baseline, on the
 * wall plane. +x runs along the wall, +y up, +z out of the wall; the relief
 * spans z in [-embedMeters, depthMeters] so the back sits inside the wall.
 *
 * @param {object} params
 * @param {string} params.text
 * @param {number} params.heightMeters cap height
 * @param {number} [params.depthMeters] relief in front of the wall plane
 * @param {number} [params.embedMeters] extension behind the wall plane
 * @param {number} [params.letterSpacingRatio]
 * @returns {{
 *   geometry: THREE.BufferGeometry | null,
 *   widthMeters: number,
 *   inkMeters: { minX: number, minY: number, maxX: number, maxY: number } | null,
 *   unsupported: string[]
 * }}
 */
export function buildFacadeLetteringGeometry({
    text,
    heightMeters,
    depthMeters = 0.04,
    embedMeters = 0.02,
    letterSpacingRatio = FACADE_LETTERING_DEFAULT_SPACING_RATIO
} = {}) {
    const capHeight = Number.isFinite(Number(heightMeters)) ? Math.max(0.01, Number(heightMeters)) : 0.4;
    const depth = Number.isFinite(Number(depthMeters)) ? Math.max(0.003, Number(depthMeters)) : 0.04;
    const embed = Number.isFinite(Number(embedMeters)) ? Math.max(0, Number(embedMeters)) : 0.02;
    const layout = layoutFacadeLetteringText(text, { letterSpacingRatio });

    const positions = [];
    const uvs = [];
    for (const glyph of layout.glyphs) {
        for (const stroke of glyph.strokes) {
            pushStrokePrism(positions, uvs, {
                x0: (glyph.x + stroke[0]) * capHeight,
                y0: stroke[1] * capHeight,
                x1: (glyph.x + stroke[2]) * capHeight,
                y1: stroke[3] * capHeight,
                half: H * capHeight,
                z0: -embed,
                z1: depth
            });
        }
    }

    const inkMeters = layout.ink
        ? {
            minX: layout.ink.minX * capHeight,
            minY: layout.ink.minY * capHeight,
            maxX: layout.ink.maxX * capHeight,
            maxY: layout.ink.maxY * capHeight
        }
        : null;
    if (!positions.length) {
        return { geometry: null, widthMeters: layout.widthUnits * capHeight, inkMeters, unsupported: layout.unsupported };
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.computeVertexNormals();
    return { geometry, widthMeters: layout.widthUnits * capHeight, inkMeters, unsupported: layout.unsupported };
}
