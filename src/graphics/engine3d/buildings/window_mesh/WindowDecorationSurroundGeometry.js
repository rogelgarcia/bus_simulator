// src/graphics/engine3d/buildings/window_mesh/WindowDecorationSurroundGeometry.js
// Shared geometry builders for window opening surround decorations (headers/lintels and jambs).
// Conventions: X centered on the opening, back face at z=0 extruding to +depth (away from the wall).
// Header profiles anchor y=0 at the header BOTTOM (placed at window top + gap); the arched band
// dips below y=0 at its chord ends so it hugs the window arch. Jambs center y=0 on the run.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WINDOW_DECORATION_STYLE } from '../../../../app/buildings/window_mesh/WindowMeshDecorationTemplates.js';

const EPS = 1e-6;

// Splay slope for splayed lintels: horizontal flare per meter of header height.
const SPLAYED_LINTEL_FLARE_PER_HEIGHT = 0.45;
// Keystone band fraction and flare for the angled keystone profile.
const KEYSTONE_BAND_HEIGHT_RATIO = 0.7;
const KEYSTONE_TOP_FLARE_RATIO = 0.55;
// Base band fraction under the pediment triangle.
const PEDIMENT_BAND_HEIGHT_RATIO = 0.3;

function clampPositive(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return num;
}

export function isWindowHeaderProfileStyle(style) {
    const raw = typeof style === 'string' ? style.trim().toLowerCase() : '';
    return raw === WINDOW_DECORATION_STYLE.FLAT_BAND
        || raw === WINDOW_DECORATION_STYLE.SPLAYED_LINTEL
        || raw === WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE
        || raw === WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE
        || raw === WINDOW_DECORATION_STYLE.ARCHED_BAND;
}

function extrudeProfile(shape, depth, curveSegments = 12) {
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.001, depth),
        steps: 1,
        bevelEnabled: false,
        curveSegments: Math.max(6, curveSegments | 0)
    });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function buildFlatBandShape({ halfWidth, height }) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth, height);
    shape.lineTo(-halfWidth, height);
    shape.lineTo(-halfWidth, 0);
    return shape;
}

function buildSplayedLintelShape({ halfWidth, height }) {
    const flare = height * SPLAYED_LINTEL_FLARE_PER_HEIGHT;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth + flare, height);
    shape.lineTo(-halfWidth - flare, height);
    shape.lineTo(-halfWidth, 0);
    return shape;
}

function buildAngledKeystoneShape({ halfWidth, height }) {
    const bandH = height * KEYSTONE_BAND_HEIGHT_RATIO;
    const riseH = Math.max(EPS, height - bandH);
    const kBot = Math.min(halfWidth * 0.35, 0.16);
    const kTop = kBot + riseH * KEYSTONE_TOP_FLARE_RATIO;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth, bandH);
    shape.lineTo(kBot, bandH);
    shape.lineTo(kTop, height);
    shape.lineTo(-kTop, height);
    shape.lineTo(-kBot, bandH);
    shape.lineTo(-halfWidth, bandH);
    shape.lineTo(-halfWidth, 0);
    return shape;
}

function buildPedimentTriangleShape({ halfWidth, height }) {
    const bandH = height * PEDIMENT_BAND_HEIGHT_RATIO;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(halfWidth, bandH);
    shape.lineTo(0, height);
    shape.lineTo(-halfWidth, bandH);
    shape.lineTo(-halfWidth, 0);
    return shape;
}

function buildArchedBandShape({ openingHalfWidth, bandHeight, archRise }) {
    const w = openingHalfWidth * 2;
    const r = Math.max(EPS, archRise);
    const R = (w * w) / (8 * r) + r / 2;
    const cy = -R;
    const chordY = -r;
    const aR = Math.atan2(chordY - cy, openingHalfWidth);
    const aL = Math.atan2(chordY - cy, -openingHalfWidth);
    const R2 = R + bandHeight;

    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(aR) * R, cy + Math.sin(aR) * R);
    shape.lineTo(Math.cos(aR) * R2, cy + Math.sin(aR) * R2);
    shape.absarc(0, cy, R2, aR, aL, false);
    shape.lineTo(Math.cos(aL) * R, cy + Math.sin(aL) * R);
    shape.absarc(0, cy, R, aL, aR, true);
    return shape;
}

/**
 * Builds header (lintel) geometry for a surround profile style.
 * y=0 sits at the header bottom (the window top edge + gap); arched bands dip below.
 */
export function buildWindowHeaderSurroundGeometry({
    style,
    openingWidth,
    widthScale = 1.0,
    height,
    depth,
    earsMeters = 0.0,
    archEnabled = false,
    archHeightRatio = 0.0,
    windowHeight = 0.0,
    curveSegments = 12
} = {}) {
    const w = clampPositive(openingWidth, 1.0) * clampPositive(widthScale, 1.0);
    const h = clampPositive(height, 0.08);
    const d = clampPositive(depth, 0.08);
    const ears = Math.max(0, Number(earsMeters) || 0);
    const halfWidth = w * 0.5 + ears;
    const raw = typeof style === 'string' ? style.trim().toLowerCase() : '';

    if (raw === WINDOW_DECORATION_STYLE.ARCHED_BAND) {
        const ratio = Math.max(0, Number(archHeightRatio) || 0);
        const wh = Math.max(0, Number(windowHeight) || 0);
        const riseCandidate = ratio * w;
        const archRise = wh > EPS ? Math.min(riseCandidate, Math.max(0, wh - 0.05)) : riseCandidate;
        if (archEnabled && archRise > EPS) {
            const shape = buildArchedBandShape({
                openingHalfWidth: w * 0.5,
                bandHeight: h,
                archRise
            });
            return extrudeProfile(shape, d, curveSegments);
        }
        // Arch disabled/degenerate: fall back to a flat band so the asset still reads framed.
        return extrudeProfile(buildFlatBandShape({ halfWidth, height: h }), d, curveSegments);
    }

    if (raw === WINDOW_DECORATION_STYLE.SPLAYED_LINTEL) {
        return extrudeProfile(buildSplayedLintelShape({ halfWidth, height: h }), d, curveSegments);
    }
    if (raw === WINDOW_DECORATION_STYLE.ANGLED_KEYSTONE) {
        return extrudeProfile(buildAngledKeystoneShape({ halfWidth, height: h }), d, curveSegments);
    }
    if (raw === WINDOW_DECORATION_STYLE.PEDIMENT_TRIANGLE) {
        return extrudeProfile(buildPedimentTriangleShape({ halfWidth, height: h }), d, curveSegments);
    }
    return extrudeProfile(buildFlatBandShape({ halfWidth, height: h }), d, curveSegments);
}

/**
 * Builds jamb geometry: two vertical trim boxes flanking the opening, merged into one geometry.
 * y=0 sits at the run center; back face at z=0.
 */
export function buildWindowJambsSurroundGeometry({
    openingWidth,
    jambWidth,
    runHeight,
    depth
} = {}) {
    const w = clampPositive(openingWidth, 1.0);
    const jw = clampPositive(jambWidth, 0.1);
    const rh = clampPositive(runHeight, 1.0);
    const d = clampPositive(depth, 0.08);
    const xOffset = w * 0.5 + jw * 0.5;

    const left = new THREE.BoxGeometry(jw, rh, d);
    left.translate(-xOffset, 0, d * 0.5);
    const right = new THREE.BoxGeometry(jw, rh, d);
    right.translate(xOffset, 0, d * 0.5);

    const merged = mergeGeometries([left, right], false);
    left.dispose();
    right.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}
