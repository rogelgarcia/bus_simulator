// src/graphics/engine3d/buildings/window_mesh/WindowMeshGeometry.js
// Builds reusable BufferGeometries for procedural window meshes.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';

const EPS = 1e-6;
const QUANT = 10000;
const HANDLE_DIAMETER_SCALE = 0.9;
const HANDLE_RADIUS = 0.025 * HANDLE_DIAMETER_SCALE;
const HANDLE_CONNECTOR_RADIUS = HANDLE_RADIUS * 0.5;
const HANDLE_MAIN_HEIGHT = 0.24;
const HANDLE_SEGMENTS = 6;
const HANDLE_EDGE_OFFSET_METERS = 0.15;
export const WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS = 0.006;
const DOUBLE_DOOR_CENTER_GAP_METERS = WINDOW_MESH_DOUBLE_DOOR_CENTER_GAP_METERS;

function q(value) {
    return Math.round(Number(value) * QUANT);
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
    const bottomMargin = bottomEnabled ? horizontalMargin : 0;
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
    centerX = 0
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
        left.translate(centerX - profile.width * 0.5 + profile.left * 0.5, 0, d * 0.5);
        parts.push(left);
    }
    if (profile.right > EPS) {
        const right = new THREE.BoxGeometry(profile.right, profile.height, d);
        right.translate(centerX + profile.width * 0.5 - profile.right * 0.5, 0, d * 0.5);
        parts.push(right);
    }

    const topSpan = Math.max(EPS, profile.width - profile.left - profile.right);
    if (profile.top > EPS) {
        const top = new THREE.BoxGeometry(topSpan, profile.top, d);
        top.translate(centerX + profile.centerX, profile.height * 0.5 - profile.top * 0.5, d * 0.5);
        parts.push(top);
    }
    if (profile.bottom > EPS) {
        const bottom = new THREE.BoxGeometry(topSpan, profile.bottom, d);
        bottom.translate(centerX + profile.centerX, -profile.height * 0.5 + profile.bottom * 0.5, d * 0.5);
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
    centerX = 0
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
        y0: profile.centerY - profile.innerHeight * 0.5,
        y1: profile.centerY + profile.innerHeight * 0.5,
        reverse: false
    });
    const geo = new THREE.ShapeGeometry(shape, 1);
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
    centerX = 0
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
    const y0 = profile.centerY - profile.innerHeight * 0.5;
    const y1 = profile.centerY + profile.innerHeight * 0.5;

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    const paneW = profile.innerWidth / cols;
    for (let c = 1; c < cols; c++) {
        const x = x0 + paneW * c + offX;
        if (x <= x0 + mwV * 0.5 + EPS || x >= x1 - mwV * 0.5 - EPS) continue;
        const heightMeters = Math.max(EPS, profile.innerHeight);
        const geo = new THREE.BoxGeometry(mwV, heightMeters, md);
        geo.translate(x, profile.centerY, centerZ);
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

function buildFrameGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);

    const w = s.width;
    const h = s.height;
    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
    const depth = s.frame.depth;
    const bottomFrameWidth = hasFrameBottomPiece(s) ? frameHorizontalWidth : 0;

    if (isDoorDoubleStyle(s)) {
        const centerGap = Math.max(0, Math.min(w - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (w - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const leftLeaf = buildRectLeafFrameGeometry({
            width: leafWidth,
            height: h,
            depth,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            centerX: -leafOffset
        });
        const rightLeaf = buildRectLeafFrameGeometry({
            width: leafWidth,
            height: h,
            depth,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            centerX: leafOffset
        });
        const parts = [leftLeaf, rightLeaf].filter(Boolean);
        if (!parts.length) return null;
        const merged = mergeGeometries(parts, false);
        for (const part of parts) part?.dispose?.();
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
        const bottomFrameWidth = hasFrameBottomPiece(s) ? frameHorizontalWidth : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const leftLeaf = buildRectLeafOpeningGeometry({
            width: leafWidth,
            height: s.height,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            centerX: -leafOffset
        });
        const rightLeaf = buildRectLeafOpeningGeometry({
            width: leafWidth,
            height: s.height,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            centerX: leafOffset
        });
        const parts = [leftLeaf, rightLeaf].filter(Boolean);
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

    const geo = new THREE.ShapeGeometry(shape, Math.max(6, curveSegments | 0));
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
        const bottomFrameWidth = hasFrameBottomPiece(s) ? frameHorizontalWidth : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const leftLeaf = buildRectLeafMuntinsGeometry({
            width: leafWidth,
            height: s.height,
            frameDepth,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            muntins: s.muntins,
            centerX: -leafOffset
        });
        const rightLeaf = buildRectLeafMuntinsGeometry({
            width: leafWidth,
            height: s.height,
            frameDepth,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth,
            muntins: s.muntins,
            centerX: leafOffset
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
    if (isDoorDoubleStyle(s)) return null;
    const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);

    if (s.arch.topPieceMode === 'muntin') {
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

    const archRise = s.arch.heightRatio * w;
    if (!(archRise > EPS)) return null;

    const yTop = h * 0.5;
    const yChord = yTop - archRise;

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

function resolveHandleYCenterFromProfile(profile) {
    const yBottom = profile.centerY - profile.innerHeight * 0.5;
    const yTop = profile.centerY + profile.innerHeight * 0.5;
    const yDesired = yBottom + 1.0;
    const yMin = yBottom + HANDLE_MAIN_HEIGHT * 0.5 + 0.02;
    const yMax = yTop - HANDLE_MAIN_HEIGHT * 0.5 - 0.02;
    return yMax >= yMin
        ? Math.min(yMax, Math.max(yMin, yDesired))
        : (yBottom + yTop) * 0.5;
}

function buildDoorHandlesGeometry({ settings }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!s.frame.addHandles || !s.frame.openBottom) return null;

    const surfaceZ = Math.max(EPS, s.frame.depth);
    const handleCenterZ = surfaceZ + 0.08;
    const connectorLength = Math.max(EPS, handleCenterZ - surfaceZ);
    const connectorCenterZ = surfaceZ + connectorLength * 0.5;
    const connectorYOffset = HANDLE_MAIN_HEIGHT * 0.32;

    const handlePlacements = [];
    if (isDoorDoubleStyle(s)) {
        const { vertical: frameVerticalWidth, horizontal: frameHorizontalWidth } = getFrameWidths(s.frame);
        const bottomFrameWidth = hasFrameBottomPiece(s) ? frameHorizontalWidth : 0;
        const centerGap = Math.max(0, Math.min(s.width - EPS, DOUBLE_DOOR_CENTER_GAP_METERS));
        const leafWidth = Math.max(EPS, (s.width - centerGap) * 0.5);
        const leafOffset = centerGap * 0.5 + leafWidth * 0.5;
        const leftCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'left');
        const rightCenterMode = resolveDoorCenterFrameSideMode(s.frame, 'right');
        const centerLeftWidth = leftCenterMode === 'none' ? 0 : frameVerticalWidth;
        const centerRightWidth = rightCenterMode === 'none' ? 0 : frameVerticalWidth;

        const leftProfile = computeRectLeafProfile({
            width: leafWidth,
            height: s.height,
            leftFrameWidth: frameVerticalWidth,
            rightFrameWidth: centerLeftWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth
        });
        const rightProfile = computeRectLeafProfile({
            width: leafWidth,
            height: s.height,
            leftFrameWidth: centerRightWidth,
            rightFrameWidth: frameVerticalWidth,
            topFrameWidth: frameHorizontalWidth,
            bottomFrameWidth
        });

        const leftEdge = -leafOffset + leftProfile.centerX + leftProfile.innerWidth * 0.5;
        const leftMinX = -leafOffset + leftProfile.centerX - leftProfile.innerWidth * 0.5 + HANDLE_RADIUS;
        const leftMaxX = -leafOffset + leftProfile.centerX + leftProfile.innerWidth * 0.5 - HANDLE_RADIUS;
        const leftHandleX = Math.max(leftMinX, Math.min(leftMaxX, leftEdge - HANDLE_EDGE_OFFSET_METERS));
        handlePlacements.push({
            x: leftHandleX,
            y: resolveHandleYCenterFromProfile(leftProfile)
        });

        const rightEdge = leafOffset + rightProfile.centerX - rightProfile.innerWidth * 0.5;
        const rightMinX = leafOffset + rightProfile.centerX - rightProfile.innerWidth * 0.5 + HANDLE_RADIUS;
        const rightMaxX = leafOffset + rightProfile.centerX + rightProfile.innerWidth * 0.5 - HANDLE_RADIUS;
        const rightHandleX = Math.max(rightMinX, Math.min(rightMaxX, rightEdge + HANDLE_EDGE_OFFSET_METERS));
        handlePlacements.push({
            x: rightHandleX,
            y: resolveHandleYCenterFromProfile(rightProfile)
        });
    } else {
        const { innerWidth, innerHeight, centerY } = computeInnerOpeningProfile(s);
        const xMin = -innerWidth * 0.5 + HANDLE_RADIUS;
        const xMax = innerWidth * 0.5 - HANDLE_RADIUS;
        const x = Math.max(xMin, Math.min(xMax, innerWidth * 0.5 - HANDLE_EDGE_OFFSET_METERS));
        handlePlacements.push({
            x,
            y: resolveHandleYCenterFromProfile({
                centerY,
                innerHeight
            })
        });
    }

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    for (const placement of handlePlacements) {
        const x = placement.x;
        const yCenter = placement.y;
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter,
            z: handleCenterZ,
            height: HANDLE_MAIN_HEIGHT,
            radius: HANDLE_RADIUS,
            axis: 'y'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter + connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
            radius: HANDLE_CONNECTOR_RADIUS,
            axis: 'z'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter - connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
            radius: HANDLE_CONNECTOR_RADIUS,
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
        `fds:${f.doorStyle === 'double' ? 'd' : 's'}`,
        `fdb:${f.doorBottomFrame?.enabled ? 1 : 0}`,
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
        `cs:${curveSegments | 0}`
    ].join('|');
}

export function buildWindowMeshGeometryBundle(settings, { curveSegments = 24 } = {}) {
    const frame = buildFrameGeometry({ settings, curveSegments });
    const opening = buildOpeningGeometry({ settings, curveSegments });
    const muntins = buildMuntinsGeometry({ settings, curveSegments });
    const joinBar = buildArchMeetRectJoinGeometry({ settings });
    const handles = buildDoorHandlesGeometry({ settings });

    const joinBarLayer = joinBar?.userData?.windowJoinBarLayer === 'muntins' ? 'muntins' : (joinBar ? 'frame' : null);
    return { frame, opening, muntins, joinBar, joinBarLayer, handles };
}
