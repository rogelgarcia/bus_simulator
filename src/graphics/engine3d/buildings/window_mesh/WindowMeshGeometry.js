// src/graphics/engine3d/buildings/window_mesh/WindowMeshGeometry.js
// Builds reusable BufferGeometries for procedural window meshes.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';
import { resolveParallaxPanelOverscanMeters } from '../../../../app/buildings/window_mesh/ParallaxPanelOverscan.js';

const EPS = 1e-6;
const QUANT = 10000;
const HANDLE_DIAMETER_SCALE = 0.9;
const HANDLE_RADIUS = 0.025 * HANDLE_DIAMETER_SCALE;
const HANDLE_CONNECTOR_RADIUS = HANDLE_RADIUS * 0.5;
const HANDLE_MAIN_HEIGHT = 0.24;
const HANDLE_SEGMENTS = 6;
const HANDLE_EDGE_OFFSET_METERS = 0.15;
// C-pull (squared C-bracket door pull): tube radius, vertical grip length,
// horizontal arm length (stile -> grip), and how far the pull stands off the
// leaf face. The open side of the C faces the meeting stile.
const HANDLE_C_PULL_RADIUS = 0.016;
const HANDLE_C_PULL_GRIP_HEIGHT = 0.3;
const HANDLE_C_PULL_ARM_METERS = 0.1;
const HANDLE_C_PULL_STANDOFF_METERS = 0.06;
const HANDLE_C_PULL_EDGE_OFFSET_METERS = 0.075;
export const WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS = 0.006;
const DOUBLE_DOOR_CENTER_GAP_METERS = WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS;

function q(value) {
    return Math.round(Number(value) * QUANT);
}

// ShapeGeometry can preserve a duplicated closing point in an otherwise valid
// outline. Earcut may reference that point in a zero-area triangle. Removing
// only exact zero-area index triplets keeps the rendered surface unchanged and
// prevents invalid topology from reaching downstream geometry consumers.
function removeZeroAreaIndexTriangles(geometry) {
    const position = geometry?.getAttribute?.('position') ?? null;
    const index = geometry?.index ?? null;
    if (!position || !index || index.count % 3 !== 0) return geometry;

    const kept = [];
    for (let offset = 0; offset < index.count; offset += 3) {
        const ia = index.getX(offset);
        const ib = index.getX(offset + 1);
        const ic = index.getX(offset + 2);
        const abx = position.getX(ib) - position.getX(ia);
        const aby = position.getY(ib) - position.getY(ia);
        const abz = position.getZ(ib) - position.getZ(ia);
        const acx = position.getX(ic) - position.getX(ia);
        const acy = position.getY(ic) - position.getY(ia);
        const acz = position.getZ(ic) - position.getZ(ia);
        const crossX = aby * acz - abz * acy;
        const crossY = abz * acx - abx * acz;
        const crossZ = abx * acy - aby * acx;
        if (crossX !== 0 || crossY !== 0 || crossZ !== 0) kept.push(ia, ib, ic);
    }
    if (kept.length !== index.count) geometry.setIndex(kept);
    return geometry;
}

function getFrameWidths(frame) {
    const src = frame && typeof frame === 'object' ? frame : {};
    const legacy = Math.max(0, Number(src.width) || 0);
    const vertical = Number(src.verticalWidth);
    const horizontal = Number(src.horizontalWidth);
    return {
        vertical: Number.isFinite(vertical) ? Math.max(0, vertical) : legacy,
        horizontal: Number.isFinite(horizontal) ? Math.max(0, horizontal) : legacy
    };
}

function getDoorBottomFrameRenderEnabled(frame) {
    const src = frame && typeof frame === 'object' ? frame : {};
    const bottom = src.doorBottomFrame && typeof src.doorBottomFrame === 'object' ? src.doorBottomFrame : null;
    if (!bottom) return false;
    const mode = typeof bottom.mode === 'string' ? bottom.mode.trim().toLowerCase() : '';
    return !!bottom.enabled && mode === 'match';
}

function hasFrameBottomPiece(settings) {
    const frame = settings?.frame && typeof settings.frame === 'object' ? settings.frame : {};
    if (!frame.openBottom) return true;
    return getDoorBottomFrameRenderEnabled(frame);
}

// Bottom frame member height: an authored doorBottomFrame.heightMeters
// (the flush kick rail) overrides the legacy horizontal frame width.
function resolveBottomFrameHeight(settings, frameHorizontalWidth) {
    const raw = settings?.frame?.doorBottomFrame?.heightMeters;
    return Number.isFinite(raw) ? Math.max(0.02, Number(raw)) : frameHorizontalWidth;
}

function isDoorDoubleStyle(settings) {
    const style = typeof settings?.frame?.doorStyle === 'string' ? settings.frame.doorStyle.trim().toLowerCase() : '';
    return style === 'double';
}

function resolveDoorCenterFrameSideMode(frame, side) {
    const src = frame && typeof frame === 'object' ? frame : {};
    const center = src.doorCenterFrame && typeof src.doorCenterFrame === 'object' ? src.doorCenterFrame : {};
    const raw = side === 'left' ? center.leftMode : center.rightMode;
    const mode = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return mode === 'none' ? 'none' : 'match';
}

function buildRectOutline(out, { x0, x1, y0, y1, reverse }) {
    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, y1);
        out.lineTo(x0, y1);
        out.lineTo(x0, y0);
        return;
    }
    out.moveTo(x0, y0);
    out.lineTo(x0, y1);
    out.lineTo(x1, y1);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
}

function buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse }) {
    if (!(archRise > EPS) || !(Math.abs(x1 - x0) > EPS)) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return;
    }

    const w = Math.abs(x1 - x0);
    const hRise = archRise;
    const R = (w * w) / (8 * hRise) + hRise / 2;
    const cx = (x0 + x1) * 0.5;
    const cy = yChord + hRise - R;

    const rightAngle = Math.atan2(yChord - cy, x1 - cx);
    const leftAngle = Math.atan2(yChord - cy, x0 - cx);

    if (!reverse) {
        out.moveTo(x0, y0);
        out.lineTo(x1, y0);
        out.lineTo(x1, yChord);
        out.absarc(cx, cy, R, rightAngle, leftAngle, false);
        out.lineTo(x0, y0);
        return;
    }

    out.moveTo(x0, y0);
    out.lineTo(x0, yChord);
    out.absarc(cx, cy, R, leftAngle, rightAngle, true);
    out.lineTo(x1, y0);
    out.lineTo(x0, y0);
    if (Number.isFinite(curveSegments) && out.curves) {
        for (const c of out.curves) {
            if (c?.isEllipseCurve) c.aClockwise = reverse;
        }
    }
}

function buildWindowOutline(out, { centerX = 0, centerY = 0, width, height, wantsArch, archRise, curveSegments, reverse }) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);

    const x0 = centerX - w * 0.5;
    const x1 = centerX + w * 0.5;
    const y0 = centerY - h * 0.5;
    const yTop = centerY + h * 0.5;

    if (!wantsArch) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return { x0, x1, y0, yTop, yChord: yTop, archRise: 0.0 };
    }

    const yChord = yTop - archRise;
    buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse });
    return { x0, x1, y0, yTop, yChord, archRise };
}

function computeInnerOpeningProfile(settings) {
    const w = Number(settings?.width) || 0;
    const h = Number(settings?.height) || 0;
    const frame = settings?.frame && typeof settings.frame === 'object' ? settings.frame : {};
    const { vertical: sideMargin, horizontal: horizontalMargin } = getFrameWidths(frame);
    const bottomEnabled = hasFrameBottomPiece(settings);

    const innerWidth = Math.max(EPS, w - sideMargin * 2);
    const topMargin = horizontalMargin;
    const bottomMargin = bottomEnabled ? resolveBottomFrameHeight(settings, horizontalMargin) : 0;
    const innerHeight = Math.max(EPS, h - topMargin - bottomMargin);
    const centerY = (bottomMargin - topMargin) * 0.5;

    return { innerWidth, innerHeight, centerY, topMargin, bottomMargin, sideMargin, bottomEnabled };
}

function computeRectLeafProfile({
    width,
    height,
    leftFrameWidth,
    rightFrameWidth,
    topFrameWidth,
    bottomFrameWidth
}) {
    const w = Math.max(EPS, Number(width) || 0);
    const h = Math.max(EPS, Number(height) || 0);
    const left = Math.max(0, Number(leftFrameWidth) || 0);
    const right = Math.max(0, Number(rightFrameWidth) || 0);
    const top = Math.max(0, Number(topFrameWidth) || 0);
    const bottom = Math.max(0, Number(bottomFrameWidth) || 0);

    const innerWidth = Math.max(EPS, w - left - right);
    const innerHeight = Math.max(EPS, h - top - bottom);
    const centerX = (left - right) * 0.5;
    const centerY = (bottom - top) * 0.5;
    return {
        width: w,
        height: h,
        left,
        right,
        top,
        bottom,
        innerWidth,
        innerHeight,
        centerX,
        centerY
    };
}

function buildRectLeafFrameGeometry({
    width,
    height,
    depth,
    leftFrameWidth,
    rightFrameWidth,
    topFrameWidth,
    bottomFrameWidth,
    centerX = 0,
    centerY = 0
}) {
    const profile = computeRectLeafProfile({
        width,
        height,
        leftFrameWidth,
        rightFrameWidth,
        topFrameWidth,
        bottomFrameWidth
    });
    const d = Math.max(EPS, Number(depth) || 0);

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];

    if (profile.left > EPS) {
        const left = new THREE.BoxGeometry(profile.left, profile.height, d);
        left.translate(centerX - profile.width * 0.5 + profile.left * 0.5, centerY, d * 0.5);
        parts.push(left);
    }
    if (profile.right > EPS) {
        const right = new THREE.BoxGeometry(profile.right, profile.height, d);
        right.translate(centerX + profile.width * 0.5 - profile.right * 0.5, centerY, d * 0.5);
        parts.push(right);
    }

    const topSpan = Math.max(EPS, profile.width - profile.left - profile.right);
    if (profile.top > EPS) {
        const top = new THREE.BoxGeometry(topSpan, profile.top, d);
        top.translate(centerX + profile.centerX, centerY + profile.height * 0.5 - profile.top * 0.5, d * 0.5);
        parts.push(top);
    }
    if (profile.bottom > EPS) {
        const bottom = new THREE.BoxGeometry(topSpan, profile.bottom, d);
        bottom.translate(centerX + profile.centerX, centerY - profile.height * 0.5 + profile.bottom * 0.5, d * 0.5);
        parts.push(bottom);
    }

    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}

function buildRectLeafOpeningGeometry({
    width,
    height,
    leftFrameWidth,
    rightFrameWidth,
    topFrameWidth,
    bottomFrameWidth,
    centerX = 0,
    centerY = 0
}) {
    const profile = computeRectLeafProfile({
        width,
        height,
        leftFrameWidth,
        rightFrameWidth,
        topFrameWidth,
        bottomFrameWidth
    });
    const shape = new THREE.Shape();
    buildRectOutline(shape, {
        x0: centerX + profile.centerX - profile.innerWidth * 0.5,
        x1: centerX + profile.centerX + profile.innerWidth * 0.5,
        y0: centerY + profile.centerY - profile.innerHeight * 0.5,
        y1: centerY + profile.centerY + profile.innerHeight * 0.5,
        reverse: false
    });
    const geo = removeZeroAreaIndexTriangles(new THREE.ShapeGeometry(shape, 1));
    applyPlanarUv01(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function buildRectLeafMuntinsGeometry({
    width,
    height,
    frameDepth,
    leftFrameWidth,
    rightFrameWidth,
    topFrameWidth,
    bottomFrameWidth,
    muntins,
    centerX = 0,
    centerY = 0
}) {
    const profile = computeRectLeafProfile({
        width,
        height,
        leftFrameWidth,
        rightFrameWidth,
        topFrameWidth,
        bottomFrameWidth
    });
    const src = muntins && typeof muntins === 'object' ? muntins : {};

    const cols = Math.max(1, src.columns | 0);
    const rows = Math.max(1, src.rows | 0);
    const mwV = Math.max(EPS, src.verticalWidth);
    const mwH = Math.max(EPS, src.horizontalWidth);
    const md = Math.max(EPS, src.depth);
    const inset = Math.max(0, src.inset);
    const offX = (src.uvOffset?.x || 0) * (profile.innerWidth / cols) * 0.25;
    const offY = (src.uvOffset?.y || 0) * (profile.innerHeight / rows) * 0.25;

    const frontZ = Math.max(EPS, Number(frameDepth) || 0) - inset;
    const centerZ = frontZ - md * 0.5;
    const x0 = centerX + profile.centerX - profile.innerWidth * 0.5;
    const x1 = centerX + profile.centerX + profile.innerWidth * 0.5;
    const y0 = centerY + profile.centerY - profile.innerHeight * 0.5;
    const y1 = centerY + profile.centerY + profile.innerHeight * 0.5;

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    const paneW = profile.innerWidth / cols;
    for (let c = 1; c < cols; c++) {
        const x = x0 + paneW * c + offX;
        if (x <= x0 + mwV * 0.5 + EPS || x >= x1 - mwV * 0.5 - EPS) continue;
        const heightMeters = Math.max(EPS, profile.innerHeight);
        const geo = new THREE.BoxGeometry(mwV, heightMeters, md);
        geo.translate(x, centerY + profile.centerY, centerZ);
        parts.push(geo);
    }

    const paneH = profile.innerHeight / rows;
    for (let r = 1; r < rows; r++) {
        const y = y0 + paneH * r + offY;
        if (y <= y0 + mwH * 0.5 + EPS || y >= y1 - mwH * 0.5 - EPS) continue;
        const geo = new THREE.BoxGeometry(profile.innerWidth, mwH, md);
        geo.translate(centerX + profile.centerX, y, centerZ);
        parts.push(geo);
    }

    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}

/**
 * Where a double door's leaves stop, and what is left above them.
 *
 * An arched door is not a rectangular door in an arched hole: the leaves are
 * rectangular and terminate at the springing line, and the lunette above is a
 * glazed fanlight in its own frame (AI 497). Without this the leaves ran the
 * full height of the opening and the glass continued straight up into the arch.
 *
 * `archRise` matches the outer arch the frame and wall cut are built from, so
 * the springing line is the same line for every layer.
 *
 * @param {object} s sanitized window mesh settings
 */
function computeDoubleDoorArchProfile(s) {
    const h = s.height;
    const yTop = h * 0.5;
    const archRise = s.arch.enabled ? (s.arch.heightRatio * s.width) : 0.0;
    const { horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
    // Leave at least a rail's worth of leaf below the springing line.
    const maxRise = Math.max(0, h - frameHorizontalWidth * 3);
    const rise = Math.min(archRise, maxRise);
    if (!(rise > EPS)) {
        return {
            wantsArch: false,
            archRise: 0.0,
            yTop,
            yChord: yTop,
            leafHeight: h,
            leafCenterY: 0.0,
            leafTopFrameWidth: frameHorizontalWidth
        };
    }
    const yChord = yTop - rise;
    // With `meetsRectangleFrame` the transom bar spans both leaves and the gap
    // between them, so it *is* their top rail: giving the leaves one as well
    // would put two rails in the same place and z-fight.
    const hasTransom = !!s.arch.meetsRectangleFrame;
    const leafTopY = hasTransom ? (yChord - frameHorizontalWidth) : yChord;
    return {
        wantsArch: true,
        archRise: rise,
        yTop,
        yChord,
        hasTransom,
        leafHeight: Math.max(EPS, leafTopY + yTop),
        leafCenterY: (leafTopY - yTop) * 0.5,
        leafTopFrameWidth: hasTransom ? 0 : frameHorizontalWidth
    };
}

/**
 * The arched head above a double door's leaves: a frame ring when
 * `topPieceMode` is `frame`, so the lunette reads as a framed fanlight.
 */
function buildDoorFanlightFrameGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!isDoorDoubleStyle(s)) return null;
    const arch = computeDoubleDoorArchProfile(s);
    if (!arch.wantsArch) return null;

    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
    const depth = s.frame.depth;

    // The arc is vertical where it springs, so a ring that starts exactly at the
    // springing line pinches to nothing there and leaves a notch at each corner.
    // Carrying it down past the transom gives the jambs something to meet.
    const skirt = arch.hasTransom ? frameHorizontalWidth : 0;
    const yBase = arch.yChord - skirt;

    const outer = new THREE.Shape();
    buildWindowOutline(outer, {
        centerY: yBase + (arch.archRise + skirt) * 0.5,
        width: s.width,
        height: arch.archRise + skirt,
        wantsArch: true,
        archRise: arch.archRise,
        curveSegments,
        reverse: false
    });

    const innerWidth = Math.max(EPS, s.width - frameVerticalWidth * 2);
    const innerRise = Math.max(0, arch.archRise - frameHorizontalWidth);
    if (innerRise > EPS) {
        // The hole carries the same skirt, so the ring stays a constant-width
        // frame and the transom bar has that band to itself.
        const hole = new THREE.Path();
        buildWindowOutline(hole, {
            centerY: yBase + (innerRise + skirt) * 0.5,
            width: innerWidth,
            height: innerRise + skirt,
            wantsArch: true,
            archRise: innerRise,
            curveSegments,
            reverse: true
        });
        outer.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(outer, {
        depth: Math.max(EPS, depth),
        bevelEnabled: false,
        curveSegments: Math.max(6, curveSegments | 0)
    });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

/** The glazed lunette inside the fanlight frame. */
function buildDoorFanlightOpeningGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!isDoorDoubleStyle(s)) return null;
    const arch = computeDoubleDoorArchProfile(s);
    if (!arch.wantsArch) return null;

    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
    const innerWidth = Math.max(EPS, s.width - frameVerticalWidth * 2);
    const innerRise = Math.max(0, arch.archRise - frameHorizontalWidth);
    if (!(innerRise > EPS)) return null;

    const shape = new THREE.Shape();
    buildWindowOutline(shape, {
        centerY: arch.yChord + innerRise * 0.5,
        width: innerWidth,
        height: innerRise,
        wantsArch: true,
        archRise: innerRise,
        curveSegments,
        reverse: false
    });
    const geo = removeZeroAreaIndexTriangles(new THREE.ShapeGeometry(shape, Math.max(6, curveSegments | 0)));
    // Matches the leaf glass, which the fanlight is merged with.
    applyPlanarUv01(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function buildFrameGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);

    const w = s.width;
    const h = s.height;
    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
    const depth = s.frame.depth;
    const bottomFrameWidth = hasFrameBottomPiece(s) ? resolveBottomFrameHeight(s, frameHorizontalWidth) : 0;

    if (isDoorDoubleStyle(s)) {
        const centerGap = Math.max(0, Math.min(w - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (w - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;
        // Leaves stop at the springing line; the lunette is the fanlight's.
        const arch = computeDoubleDoorArchProfile(s);

        const leftLeaf = buildRectLeafFrameGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            depth,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            centerX: -leafOffset,
            centerY: arch.leafCenterY
        });
        const rightLeaf = buildRectLeafFrameGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            depth,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            centerX: leafOffset,
            centerY: arch.leafCenterY
        });
        const fanlight = buildDoorFanlightFrameGeometry({ settings: s, curveSegments });
        const raw = [leftLeaf, rightLeaf, fanlight].filter(Boolean);
        if (!raw.length) return null;
        // Box leaves are indexed and the extruded fanlight is not; mergeGeometries
        // needs one or the other. Index the odd one out rather than dropping the
        // rest, so the result keeps the same attribute signature as every other
        // window frame and still shares their merge bucket at city build.
        const parts = raw.map((g) => (g.index ? g : mergeVertices(g)));
        const merged = mergeGeometries(parts, false);
        for (const part of parts) part?.dispose?.();
        for (const part of raw) if (!parts.includes(part)) part?.dispose?.();
        removeZeroAreaIndexTriangles(merged);
        merged.computeVertexNormals();
        merged.computeBoundingBox();
        return merged;
    }

    if (!s.arch.enabled || !hasFrameBottomPiece(s)) {
        const geo = buildRectLeafFrameGeometry({
            width: w,
            height: h,
            depth,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            centerX: 0
        });
        if (geo) return geo;
    }

    const wantsArch = !!s.arch.enabled;
    const archRise = wantsArch ? (s.arch.heightRatio * w) : 0.0;

    const outer = new THREE.Shape();
    buildWindowOutline(outer, {
        width: w,
        height: h,
        wantsArch,
        archRise,
        curveSegments,
        reverse: false
    });

    const { innerWidth, innerHeight, centerY, topMargin } = computeInnerOpeningProfile(s);
    const innerWantsArch = wantsArch && archRise > EPS && innerHeight > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;

    const hole = new THREE.Path();
    buildWindowOutline(hole, {
        centerY,
        width: innerWidth,
        height: innerHeight,
        wantsArch: innerWantsArch,
        archRise: Math.min(innerArchRise, Math.max(0, innerHeight - topMargin)),
        curveSegments,
        reverse: true
    });
    outer.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(outer, {
        depth: Math.max(EPS, depth),
        steps: 1,
        bevelEnabled: false,
        curveSegments: Math.max(6, curveSegments | 0)
    });
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function applyPlanarUv01(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const pos = g?.attributes?.position;
    if (!pos?.isBufferAttribute) return;

    g.computeBoundingBox();
    const box = g.boundingBox;
    if (!box) return;

    const minX = Number(box.min.x) || 0;
    const maxX = Number(box.max.x) || 0;
    const minY = Number(box.min.y) || 0;
    const maxY = Number(box.max.y) || 0;
    const invW = 1.0 / Math.max(EPS, maxX - minX);
    const invH = 1.0 / Math.max(EPS, maxY - minY);

    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) - minX) * invW;
        uv[i * 2 + 1] = (pos.getY(i) - minY) * invH;
    }

    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.slice(0), 2));
}

function buildOpeningGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);

    if (isDoorDoubleStyle(s)) {
        const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
        const bottomFrameWidth = hasFrameBottomPiece(s) ? resolveBottomFrameHeight(s, frameHorizontalWidth) : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const arch = computeDoubleDoorArchProfile(s);
        const leftLeaf = buildRectLeafOpeningGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            centerX: -leafOffset,
            centerY: arch.leafCenterY
        });
        const rightLeaf = buildRectLeafOpeningGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            centerX: leafOffset,
            centerY: arch.leafCenterY
        });
        const fanlight = buildDoorFanlightOpeningGeometry({ settings: s, curveSegments });
        const parts = [leftLeaf, rightLeaf, fanlight].filter(Boolean);
        if (!parts.length) return null;
        const merged = mergeGeometries(parts, false);
        for (const part of parts) part?.dispose?.();
        applyPlanarUv01(merged);
        merged.computeVertexNormals();
        merged.computeBoundingBox();
        return merged;
    }

    const { innerWidth, innerHeight, centerY, topMargin } = computeInnerOpeningProfile(s);

    const wantsArch = !!s.arch.enabled;
    const outerArchRise = wantsArch ? (s.arch.heightRatio * s.width) : 0.0;
    const innerWantsArch = wantsArch && outerArchRise > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;

    const shape = new THREE.Shape();
    buildWindowOutline(shape, {
        centerY,
        width: innerWidth,
        height: innerHeight,
        wantsArch: innerWantsArch,
        archRise: Math.min(innerArchRise, Math.max(0, innerHeight - topMargin)),
        curveSegments,
        reverse: false
    });

    const geo = removeZeroAreaIndexTriangles(new THREE.ShapeGeometry(shape, Math.max(6, curveSegments | 0)));
    applyPlanarUv01(geo);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
}

function buildMuntinsGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!s.muntins.enabled) return null;

    const frameDepth = s.frame.depth;

    if (isDoorDoubleStyle(s)) {
        const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
        const bottomFrameWidth = hasFrameBottomPiece(s) ? resolveBottomFrameHeight(s, frameHorizontalWidth) : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const arch = computeDoubleDoorArchProfile(s);
        const leftLeaf = buildRectLeafMuntinsGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            frameDepth,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            muntins: s.muntins,
            centerX: -leafOffset,
            centerY: arch.leafCenterY
        });
        const rightLeaf = buildRectLeafMuntinsGeometry({
            width: leafWidth,
            height: arch.leafHeight,
            frameDepth,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: arch.leafTopFrameWidth,
            bottomFrameWidth,
            muntins: s.muntins,
            centerX: leafOffset,
            centerY: arch.leafCenterY
        });
        const parts = [leftLeaf, rightLeaf].filter(Boolean);
        if (!parts.length) return null;
        const merged = mergeGeometries(parts, false);
        for (const part of parts) part?.dispose?.();
        merged.computeVertexNormals();
        merged.computeBoundingBox();
        return merged;
    }

    const { innerWidth, innerHeight, centerY, topMargin } = computeInnerOpeningProfile(s);

    const wantsArch = !!s.arch.enabled;
    const outerArchRise = wantsArch ? (s.arch.heightRatio * s.width) : 0.0;
    const innerWantsArch = wantsArch && outerArchRise > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;
    const openingArchRise = innerWantsArch ? Math.min(innerArchRise, Math.max(0, innerHeight - topMargin)) : 0.0;
    const rectHeight = openingArchRise > EPS ? Math.max(EPS, innerHeight - openingArchRise) : innerHeight;

    const x0 = -innerWidth * 0.5;
    const x1 = innerWidth * 0.5;
    const y0 = centerY - innerHeight * 0.5;
    const yTop = centerY + innerHeight * 0.5;
    const yChord = openingArchRise > EPS ? (yTop - openingArchRise) : yTop;
    const y1 = openingArchRise > EPS ? yChord : (y0 + rectHeight);

    const cols = Math.max(1, s.muntins.columns | 0);
    const rows = Math.max(1, s.muntins.rows | 0);
    const mwV = Math.max(EPS, s.muntins.verticalWidth);
    const mwH = Math.max(EPS, s.muntins.horizontalWidth);
    const md = Math.max(EPS, s.muntins.depth);
    const inset = Math.max(0, s.muntins.inset);
    const offX = (s.muntins.uvOffset.x || 0) * (innerWidth / cols) * 0.25;
    const offY = (s.muntins.uvOffset.y || 0) * (rectHeight / rows) * 0.25;

    const frontZ = frameDepth - inset;
    const centerZ = frontZ - md * 0.5;

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    const clipVerticalToChord = openingArchRise > EPS && (s.arch.meetsRectangleFrame || s.arch.clipVerticalMuntinsToRectWhenNoTopPiece);

    const paneW = innerWidth / cols;
    for (let c = 1; c < cols; c++) {
        const x = x0 + paneW * c + offX;
        if (x <= x0 + mwV * 0.5 + EPS || x >= x1 - mwV * 0.5 - EPS) continue;
        if (openingArchRise > EPS && !clipVerticalToChord) {
            const wSpan = innerWidth;
            const hRise = openingArchRise;
            const R = (wSpan * wSpan) / (8 * hRise) + hRise / 2;
            const cx = 0;
            const cy = yChord + hRise - R;
            const arcYAt = (xp) => {
                const dx = xp - cx;
                const inner = R * R - dx * dx;
                if (!(inner > 0)) return yChord;
                return cy + Math.sqrt(inner);
            };
            const xA = Math.max(x0, Math.min(x1, x - mwV * 0.5));
            const xB = Math.max(x0, Math.min(x1, x + mwV * 0.5));
            const yA = arcYAt(xA);
            const yB = arcYAt(xB);
            const yMax = Math.max(yChord, Math.min(yA, yB));
            const height = Math.max(EPS, yMax - y0);
            const geo = new THREE.BoxGeometry(mwV, height, md);
            geo.translate(x, y0 + height * 0.5, centerZ);
            parts.push(geo);
        } else {
            const height = Math.max(EPS, yChord - y0);
            const geo = new THREE.BoxGeometry(mwV, height, md);
            geo.translate(x, y0 + height * 0.5, centerZ);
            parts.push(geo);
        }
    }

    const paneH = rectHeight / rows;
    for (let r = 1; r < rows; r++) {
        const y = y0 + paneH * r + offY;
        if (y <= y0 + mwH * 0.5 + EPS || y >= y1 - mwH * 0.5 - EPS) continue;
        const geo = new THREE.BoxGeometry(innerWidth, mwH, md);
        geo.translate(0, y, centerZ);
        parts.push(geo);
    }

    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}

function buildArchMeetRectJoinGeometry({ settings }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!s.arch.enabled || !s.arch.meetsRectangleFrame) return null;
    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);

    if (s.arch.topPieceMode === 'muntin' && !isDoorDoubleStyle(s)) {
        const w = s.width;
        const h = s.height;
        const fw = frameVerticalWidth;
        const frameDepth = s.frame.depth;

        const outerArchRise = s.arch.heightRatio * w;
        if (!(outerArchRise > EPS)) return null;

        const innerWidth = Math.max(EPS, w - fw * 2);
        const innerHeight = Math.max(EPS, h - frameHorizontalWidth * 2);
        const innerArchRise = s.arch.heightRatio * innerWidth;
        const openingArchRise = Math.min(innerArchRise, Math.max(0, innerHeight - frameHorizontalWidth));
        if (!(openingArchRise > EPS)) return null;

        const yTop = innerHeight * 0.5;
        const yChord = yTop - openingArchRise;

        const mw = Math.max(EPS, s.muntins.horizontalWidth);
        const md = Math.max(EPS, s.muntins.depth);
        const inset = Math.max(0, s.muntins.inset);
        const frontZ = frameDepth - inset;
        const centerZ = frontZ - md * 0.5;

        const geo = new THREE.BoxGeometry(innerWidth, mw, md);
        geo.translate(0, yChord - mw * 0.5, centerZ);
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.userData = geo.userData ?? {};
        geo.userData.windowJoinBarLayer = 'muntins';
        return geo;
    }

    const w = s.width;
    const h = s.height;
    const fw = frameVerticalWidth;
    const depth = s.frame.depth;

    const doorArch = isDoorDoubleStyle(s) ? computeDoubleDoorArchProfile(s) : null;
    const archRise = doorArch ? doorArch.archRise : (s.arch.heightRatio * w);
    if (!(archRise > EPS)) return null;

    const yTop = h * 0.5;
    const yChord = doorArch ? doorArch.yChord : (yTop - archRise);

    const innerWidth = Math.max(EPS, w - fw * 2);
    const geo = new THREE.BoxGeometry(innerWidth, Math.max(EPS, frameHorizontalWidth), Math.max(EPS, depth));
    geo.translate(0, yChord - frameHorizontalWidth * 0.5, depth * 0.5);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.userData = geo.userData ?? {};
    geo.userData.windowJoinBarLayer = 'frame';
    return geo;
}

function createHandleCylinderGeometry({ x = 0, y = 0, z = 0, height = 0.1, radius = HANDLE_RADIUS, axis = 'y' } = {}) {
    const geo = new THREE.CylinderGeometry(
        Math.max(EPS, Number(radius) || HANDLE_RADIUS),
        Math.max(EPS, Number(radius) || HANDLE_RADIUS),
        Math.max(EPS, Number(height) || 0.1),
        HANDLE_SEGMENTS,
        1,
        false
    );
    if (axis === 'z') geo.rotateX(Math.PI * 0.5);
    geo.translate(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    return geo;
}

function resolveHandleYCenterFromProfile(profile, {
    desiredAboveBottom = 1.0,
    desiredCenterY = null,
    handleHeight = HANDLE_MAIN_HEIGHT
} = {}) {
    const yBottom = profile.centerY - profile.innerHeight * 0.5;
    const yTop = profile.centerY + profile.innerHeight * 0.5;
    const yDesired = Number.isFinite(desiredCenterY)
        ? desiredCenterY
        : yBottom + desiredAboveBottom;
    const halfHandle = Math.max(EPS, Number(handleHeight) || HANDLE_MAIN_HEIGHT) * 0.5;
    const yMin = yBottom + halfHandle + 0.02;
    const yMax = yTop - halfHandle - 0.02;
    return yMax >= yMin
        ? Math.min(yMax, Math.max(yMin, yDesired))
        : (yBottom + yTop) * 0.5;
}

// Legacy automatic C-pull placement centers the grip slightly below the
// door's vertical middle. Authored `handleCenterHeightMeters` supersedes this
// offset and measures from the outer door bottom instead.
const C_PULL_DESIRED_ABOVE_BOTTOM_METERS = 0.67;

// One squared C-bracket pull: two arms leave the leaf face near the meeting
// stile (short stubs out), turn sideways away from the stile, and a vertical
// grip bar joins their far ends parallel to the face — the open side of the
// C faces the stile. `dir` is the away-from-stile direction (+1/-1 in x).
function buildCPullGeometry({ x, yCenter, dir, surfaceZ, scale = 1 }) {
    const safeScale = Math.max(0.25, Number(scale) || 1);
    const r = HANDLE_C_PULL_RADIUS * safeScale;
    const grip = HANDLE_C_PULL_GRIP_HEIGHT * safeScale;
    const arm = HANDLE_C_PULL_ARM_METERS * safeScale;
    const standoff = HANDLE_C_PULL_STANDOFF_METERS * safeScale;
    const zOut = surfaceZ + standoff;
    const yTop = yCenter + grip * 0.5;
    const yBottom = yCenter - grip * 0.5;
    const xGrip = x + dir * arm;

    const parts = [];
    for (const y of [yTop, yBottom]) {
        // stub: leaf face -> standoff depth
        parts.push(createHandleCylinderGeometry({
            x, y, z: surfaceZ + standoff * 0.5, height: standoff + r, radius: r, axis: 'z'
        }));
        // arm: stile side -> grip side, parallel to the face
        const armGeo = new THREE.CylinderGeometry(r, r, arm, HANDLE_SEGMENTS, 1, false);
        armGeo.rotateZ(Math.PI * 0.5);
        armGeo.translate(x + dir * arm * 0.5, y, zOut);
        parts.push(armGeo);
        // rounded elbow at the arm/grip corner
        const elbow = new THREE.SphereGeometry(r, HANDLE_SEGMENTS, 4);
        elbow.translate(xGrip, y, zOut);
        parts.push(elbow);
    }
    // vertical grip bar joining the two arm ends
    parts.push(createHandleCylinderGeometry({
        x: xGrip, y: yCenter, z: zOut, height: grip, radius: r, axis: 'y'
    }));
    return parts;
}

// Solid frame-material panels filling the BOTTOM of each door leaf (the
// storefront-door kick): glass reads above, panel below, inside the leaf
// frame — NOT a separate band under the assembly.
function buildDoorKickPanelsGeometry({ settings }) {
    const s = sanitizeWindowMeshSettings(settings);
    const kick = s.frame.doorKickPanel;
    const midRail = s.frame.doorMidRail;
    if ((!kick?.enabled && !midRail?.enabled) || !s.frame.openBottom) return null;

    const rects = [];
    if (isDoorDoubleStyle(s)) {
        const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
        const bottomFrameWidth = hasFrameBottomPiece(s) ? resolveBottomFrameHeight(s, frameHorizontalWidth) : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;
        const arch = computeDoubleDoorArchProfile(s);
        const profileOf = (leftW, rightW) => {
            const profile = computeRectLeafProfile({
                width: leafWidth,
                height: arch.leafHeight,
                leftFrameWidth: leftW,
                rightFrameWidth: rightW,
                topFrameWidth: arch.leafTopFrameWidth,
                bottomFrameWidth
            });
            return { ...profile, centerY: profile.centerY + arch.leafCenterY };
        };
        const lp = profileOf(frameVerticalWidth, centerLeftWidth);
        const rp = profileOf(centerRightWidth, frameVerticalWidth);
        rects.push({ cx: -leafOffset + lp.centerX, w: lp.innerWidth, yBottom: lp.centerY - lp.innerHeight * 0.5, hMax: lp.innerHeight });
        rects.push({ cx: leafOffset + rp.centerX, w: rp.innerWidth, yBottom: rp.centerY - rp.innerHeight * 0.5, hMax: rp.innerHeight });
    } else {
        const { innerWidth, innerHeight, centerY } = computeInnerOpeningProfile(s);
        rects.push({ cx: 0, w: innerWidth, yBottom: centerY - innerHeight * 0.5, hMax: innerHeight });
    }

    // Slabs spanning most of the frame depth so they read solid from both
    // sides; slightly wider than the leaf opening to close hairline gaps.
    const zBack = 0.015;
    const zFront = Math.max(zBack + 0.02, s.frame.depth - 0.015);
    const parts = [];
    for (const r of rects) {
        if (kick?.enabled) {
            const h = Math.max(0.05, Math.min(kick.heightMeters, r.hMax * 0.8));
            const geo = new THREE.BoxGeometry(Math.max(EPS, r.w + 0.012), h, zFront - zBack);
            geo.translate(r.cx, r.yBottom + h * 0.5, (zBack + zFront) * 0.5);
            parts.push(geo);
        }
        if (midRail?.enabled) {
            // Rail at pull height, dividing the leaf glass into an upper and
            // a lower pane. yMeters measures from the leaf's inner bottom.
            const railY = r.yBottom + Math.max(0.1, Math.min(midRail.yMeters, r.hMax - 0.1));
            const geo = new THREE.BoxGeometry(Math.max(EPS, r.w + 0.012), midRail.thicknessMeters, zFront - zBack);
            geo.translate(r.cx, railY, (zBack + zFront) * 0.5);
            parts.push(geo);
        }
    }
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}

function buildDoorHandlesGeometry({ settings }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!s.frame.addHandles || !s.frame.openBottom) return null;

    const cPull = s.frame.handleStyle === 'c_pull';
    const handleScale = Math.max(0.25, Number(s.frame.handleScale) || 1);
    const handleRadius = (cPull ? HANDLE_C_PULL_RADIUS : HANDLE_RADIUS) * handleScale;
    const handleHeight = (cPull ? HANDLE_C_PULL_GRIP_HEIGHT : HANDLE_MAIN_HEIGHT) * handleScale;
    const edgeOffset = (cPull ? HANDLE_C_PULL_EDGE_OFFSET_METERS : HANDLE_EDGE_OFFSET_METERS) * handleScale;
    const authoredCenterY = Number.isFinite(s.frame.handleCenterHeightMeters)
        ? -s.height * 0.5 + s.frame.handleCenterHeightMeters
        : null;
    const resolveHandleY = (profile) => resolveHandleYCenterFromProfile(profile, {
        desiredAboveBottom: cPull ? C_PULL_DESIRED_ABOVE_BOTTOM_METERS : 1.0,
        desiredCenterY: authoredCenterY,
        handleHeight
    });
    const surfaceZ = Math.max(EPS, s.frame.depth);
    const handleCenterZ = surfaceZ + 0.08 * handleScale;
    const connectorLength = Math.max(EPS, handleCenterZ - surfaceZ);
    const connectorCenterZ = surfaceZ + connectorLength * 0.5;
    const connectorYOffset = HANDLE_MAIN_HEIGHT * handleScale * 0.32;

    const handlePlacements = [];
    if (isDoorDoubleStyle(s)) {
        const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
        const bottomFrameWidth = hasFrameBottomPiece(s) ? resolveBottomFrameHeight(s, frameHorizontalWidth) : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const arch = computeDoubleDoorArchProfile(s);
        const leafProfileOf = (leftWidth, rightWidth) => {
            const profile = computeRectLeafProfile({
                width: leafWidth,
                height: arch.leafHeight,
                leftFrameWidth: leftWidth,
                rightFrameWidth: rightWidth,
                topFrameWidth: arch.leafTopFrameWidth,
                bottomFrameWidth
            });
            // The leaf sits below the springing line, so the handle does too.
            return { ...profile, centerY: profile.centerY + arch.leafCenterY };
        };
        const leftProfile = leafProfileOf(frameVerticalWidth, centerLeftWidth);
        const rightProfile = leafProfileOf(centerRightWidth, frameVerticalWidth);

        const leftEdge = -leafOffset + leftProfile.centerX + leftProfile.innerWidth * 0.5;
        // A C-pull mounts ON the meeting stile (the leaf's frame member near
        // the center), never over the glass; the bar handle keeps its
        // just-inside-the-glass placement.
        const leftStileX = leftEdge + Math.max(0.02, centerLeftWidth) * 0.5;
        const leftMinX = -leafOffset + leftProfile.centerX - leftProfile.innerWidth * 0.5 + handleRadius;
        const leftMaxX = leftEdge + Math.max(0.02, centerLeftWidth);
        const leftHandleX = cPull
            ? leftStileX
            : Math.max(leftMinX, Math.min(leftMaxX, leftEdge - edgeOffset));
        handlePlacements.push({
            x: leftHandleX,
            y: resolveHandleY(leftProfile),
            dir: -1
        });

        const rightEdge = leafOffset + rightProfile.centerX - rightProfile.innerWidth * 0.5;
        const rightStileX = rightEdge - Math.max(0.02, centerRightWidth) * 0.5;
        const rightMinX = rightEdge - Math.max(0.02, centerRightWidth);
        const rightMaxX = leafOffset + rightProfile.centerX + rightProfile.innerWidth * 0.5 - handleRadius;
        const rightHandleX = cPull
            ? rightStileX
            : Math.max(rightMinX, Math.min(rightMaxX, rightEdge + edgeOffset));
        handlePlacements.push({
            x: rightHandleX,
            y: resolveHandleY(rightProfile),
            dir: 1
        });
    } else {
        const { innerWidth, innerHeight, centerY } = computeInnerOpeningProfile(s);
        const xMin = -innerWidth * 0.5 + handleRadius;
        const xMax = innerWidth * 0.5 - handleRadius;
        const x = Math.max(xMin, Math.min(xMax, innerWidth * 0.5 - edgeOffset));
        handlePlacements.push({
            x,
            y: resolveHandleY({
                centerY,
                innerHeight
            }),
            dir: -1
        });
    }

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    for (const placement of handlePlacements) {
        const x = placement.x;
        const yCenter = placement.y;
        if (cPull) {
            parts.push(...buildCPullGeometry({
                x,
                yCenter,
                dir: placement.dir ?? -1,
                surfaceZ,
                scale: handleScale
            }));
            continue;
        }
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter,
            z: handleCenterZ,
            height: HANDLE_MAIN_HEIGHT * handleScale,
            radius: HANDLE_RADIUS * handleScale,
            axis: 'y'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter + connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
            radius: HANDLE_CONNECTOR_RADIUS * handleScale,
            axis: 'z'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter - connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
            radius: HANDLE_CONNECTOR_RADIUS * handleScale,
            axis: 'z'
        }));
    }

    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    return merged;
}

export function getWindowMeshGeometryKey(settings, { curveSegments = 24 } = {}) {
    const s = sanitizeWindowMeshSettings(settings);
    const a = s.arch;
    const f = s.frame;
    const m = s.muntins;
    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(f);
    const bottomMode = typeof f?.doorBottomFrame?.mode === 'string' ? f.doorBottomFrame.mode : 'match';
    const centerLeftMode = typeof f?.doorCenterFrame?.leftMode === 'string' ? f.doorCenterFrame.leftMode : 'match';
    const centerRightMode = typeof f?.doorCenterFrame?.rightMode === 'string' ? f.doorCenterFrame.rightMode : 'match';

    return [
        `v:${s.version}`,
        `w:${q(s.width)}`,
        `h:${q(s.height)}`,
        `arch:${a.enabled ? 1 : 0}`,
        `ahr:${q(a.heightRatio)}`,
        `join:${a.meetsRectangleFrame ? 1 : 0}`,
        `jmode:${a.topPieceMode === 'muntin' ? 'm' : 'f'}`,
        `clipv:${a.clipVerticalMuntinsToRectWhenNoTopPiece ? 1 : 0}`,
        `fw:${q(f.width)}`,
        `fvw:${q(frameVerticalWidth)}`,
        `fhw:${q(frameHorizontalWidth)}`,
        `fd:${q(f.depth)}`,
        `fob:${f.openBottom ? 1 : 0}`,
        `fah:${f.addHandles ? 1 : 0}`,
        `fhs:${f.handleStyle === 'c_pull' ? 'c' : 'b'}`,
        `fhscale:${q(f.handleScale)}`,
        `fhcenter:${Number.isFinite(f.handleCenterHeightMeters) ? q(f.handleCenterHeightMeters) : 'auto'}`,
        `fkp:${f.doorKickPanel?.enabled ? q(f.doorKickPanel.heightMeters) : 0}`,
        `fmr:${f.doorMidRail?.enabled ? `${q(f.doorMidRail.yMeters)}x${q(f.doorMidRail.thicknessMeters)}` : 0}`,
        `fds:${f.doorStyle === 'double' ? 'd' : 's'}`,
        `fdb:${f.doorBottomFrame?.enabled ? 1 : 0}`,
        `fdbh:${Number.isFinite(f.doorBottomFrame?.heightMeters) ? q(f.doorBottomFrame.heightMeters) : 'w'}`,
        `fdbm:${bottomMode === 'none' ? 'n' : 'm'}`,
        `fdcl:${centerLeftMode === 'none' ? 'n' : 'm'}`,
        `fdcr:${centerRightMode === 'none' ? 'n' : 'm'}`,
        `m:${m.enabled ? 1 : 0}`,
        `mc:${m.columns | 0}`,
        `mr:${m.rows | 0}`,
        `mwv:${q(m.verticalWidth)}`,
        `mwh:${q(m.horizontalWidth)}`,
        `md:${q(m.depth)}`,
        `mi:${q(m.inset)}`,
        `mox:${q(m.uvOffset.x)}`,
        `moy:${q(m.uvOffset.y)}`,
        `cs:${curveSegments | 0}`,
        // AI 496: the interior panel is part of the bundle, so its overscan
        // (interior depth + per-placement clamp) belongs in the cache key.
        `ios:${q(resolveParallaxPanelOverscanMeters(s))}`
    ].join('|');
}

// AI 496: the parallax interior panel is an OVERSIZED quad, not the opening
// shape. It sits a short distance behind the glass, so at grazing angles an
// opening-sized panel lets the sightline slip past its edge and exposes a
// bright sliver along the reveal. Extending the panel by
// `depth * tan(maxGrazingAngle)` on every side keeps it in front of every
// plausible sightline; the extra area hides behind the wall at normal angles.
//
// UVs stay pinned to the OPENING rect (the panel's original bounding box), so
// 0..1 still spans exactly what it spanned before and the visible interior is
// pixel-identical head-on. The overscan area runs outside 0..1, where the
// interior shader's existing clamp continues the image's edge outward.
function buildInteriorPanelGeometry({ settings, openingGeometry }) {
    const geo = openingGeometry?.isBufferGeometry ? openingGeometry : null;
    if (!geo) return null;
    const s = sanitizeWindowMeshSettings(settings);
    const overscan = resolveParallaxPanelOverscanMeters(s);

    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (!box) return null;
    const minX = Number(box.min.x) || 0;
    const maxX = Number(box.max.x) || 0;
    const minY = Number(box.min.y) || 0;
    const maxY = Number(box.max.y) || 0;
    const openWidth = Math.max(EPS, maxX - minX);
    const openHeight = Math.max(EPS, maxY - minY);

    // No overscan (interior off, or panel flush with the glass): keep the
    // opening geometry itself so nothing about the current look changes.
    if (!(overscan > 1e-6)) return null;

    const x0 = minX - overscan;
    const x1 = maxX + overscan;
    const y0 = minY - overscan;
    const y1 = maxY + overscan;

    const positions = new Float32Array([
        x0, y0, 0,
        x1, y0, 0,
        x1, y1, 0,
        x0, y1, 0
    ]);
    const uvs = new Float32Array([
        (x0 - minX) / openWidth, (y0 - minY) / openHeight,
        (x1 - minX) / openWidth, (y0 - minY) / openHeight,
        (x1 - minX) / openWidth, (y1 - minY) / openHeight,
        (x0 - minX) / openWidth, (y1 - minY) / openHeight
    ]);

    const panel = new THREE.BufferGeometry();
    panel.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    panel.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    panel.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(0), 2));
    panel.setIndex([0, 1, 2, 0, 2, 3]);
    panel.computeVertexNormals();
    panel.computeBoundingBox();
    panel.userData = panel.userData ?? {};
    panel.userData.parallaxPanelOverscanMeters = overscan;
    panel.userData.parallaxPanelOpeningSize = { width: openWidth, height: openHeight };
    return panel;
}

export function buildWindowMeshGeometryBundle(settings, { curveSegments = 24 } = {}) {
    const frame = buildFrameGeometry({ settings, curveSegments });
    const opening = buildOpeningGeometry({ settings, curveSegments });
    const muntins = buildMuntinsGeometry({ settings, curveSegments });
    const joinBar = buildArchMeetRectJoinGeometry({ settings });
    const handles = buildDoorHandlesGeometry({ settings });
    const kickPanels = buildDoorKickPanelsGeometry({ settings });

    const interiorPanel = buildInteriorPanelGeometry({ settings, openingGeometry: opening });

    const joinBarLayer = joinBar?.userData?.windowJoinBarLayer === 'muntins' ? 'muntins' : (joinBar ? 'frame' : null);
    return { frame, opening, interiorPanel, muntins, joinBar, joinBarLayer, handles, kickPanels };
}
