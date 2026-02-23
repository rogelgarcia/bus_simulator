// src/graphics/engine3d/buildings/window_mesh/WindowMeshGeometry.js
// Builds reusable BufferGeometries for procedural window meshes.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';

const EPS = 1e-6;
const QUANT = 10000;
const HANDLE_RADIUS = 0.025;
const HANDLE_MAIN_HEIGHT = 0.24;
const HANDLE_SEGMENTS = 6;

function q(value) {
    return Math.round(Number(value) * QUANT);
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
    const fw = Math.max(0, Number(settings?.frame?.width) || 0);
    const openBottom = !!settings?.frame?.openBottom;

    const innerWidth = Math.max(EPS, w - fw * 2);
    const topMargin = fw;
    const bottomMargin = openBottom ? 0 : fw;
    const innerHeight = Math.max(EPS, h - topMargin - bottomMargin);
    const centerY = (bottomMargin - topMargin) * 0.5;

    return { innerWidth, innerHeight, centerY, topMargin };
}

function buildFrameGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);

    const w = s.width;
    const h = s.height;
    const fw = s.frame.width;
    const depth = s.frame.depth;
    const openBottom = !!s.frame.openBottom;

    if (openBottom) {
        const d = Math.max(EPS, depth);
        const sideW = Math.max(EPS, Math.min(fw, w * 0.5));
        const sideH = Math.max(EPS, h);
        const topH = Math.max(EPS, Math.min(fw, h));
        const topW = Math.max(EPS, w - sideW * 2);

        const left = new THREE.BoxGeometry(sideW, sideH, d);
        left.translate(-w * 0.5 + sideW * 0.5, 0, d * 0.5);
        const right = new THREE.BoxGeometry(sideW, sideH, d);
        right.translate(w * 0.5 - sideW * 0.5, 0, d * 0.5);
        const top = new THREE.BoxGeometry(topW, topH, d);
        top.translate(0, h * 0.5 - topH * 0.5, d * 0.5);

        const merged = mergeGeometries([left, right, top], false);
        left.dispose();
        right.dispose();
        top.dispose();
        merged.computeVertexNormals();
        merged.computeBoundingBox();
        return merged;
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

    const innerWidth = Math.max(EPS, w - fw * 2);
    const innerHeight = Math.max(EPS, h - fw * 2);
    const innerWantsArch = wantsArch && archRise > EPS && innerHeight > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;

    const hole = new THREE.Path();
    buildWindowOutline(hole, {
        width: innerWidth,
        height: innerHeight,
        wantsArch: innerWantsArch,
        archRise: Math.min(innerArchRise, Math.max(0, innerHeight - fw)),
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

    if (s.arch.topPieceMode === 'muntin') {
        const w = s.width;
        const h = s.height;
        const fw = s.frame.width;
        const frameDepth = s.frame.depth;

        const outerArchRise = s.arch.heightRatio * w;
        if (!(outerArchRise > EPS)) return null;

        const innerWidth = Math.max(EPS, w - fw * 2);
        const innerHeight = Math.max(EPS, h - fw * 2);
        const innerArchRise = s.arch.heightRatio * innerWidth;
        const openingArchRise = Math.min(innerArchRise, Math.max(0, innerHeight - fw));
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
    const fw = s.frame.width;
    const depth = s.frame.depth;

    const archRise = s.arch.heightRatio * w;
    if (!(archRise > EPS)) return null;

    const yTop = h * 0.5;
    const yChord = yTop - archRise;

    const innerWidth = Math.max(EPS, w - fw * 2);
    const geo = new THREE.BoxGeometry(innerWidth, fw, Math.max(EPS, depth));
    geo.translate(0, yChord - fw * 0.5, depth * 0.5);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.userData = geo.userData ?? {};
    geo.userData.windowJoinBarLayer = 'frame';
    return geo;
}

function createHandleCylinderGeometry({ x = 0, y = 0, z = 0, height = 0.1, axis = 'y' } = {}) {
    const geo = new THREE.CylinderGeometry(
        HANDLE_RADIUS,
        HANDLE_RADIUS,
        Math.max(EPS, Number(height) || 0.1),
        HANDLE_SEGMENTS,
        1,
        false
    );
    if (axis === 'z') geo.rotateX(Math.PI * 0.5);
    geo.translate(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    return geo;
}

function resolveHandlePanelPair(panelCount) {
    const count = Math.max(2, panelCount | 0);
    if ((count % 2) === 0) {
        const rightIndex = count * 0.5;
        return [rightIndex - 1, rightIndex];
    }
    const mid = (count - 1) * 0.5;
    const leftIndex = Math.min(count - 2, mid);
    return [leftIndex, leftIndex + 1];
}

function computeDoorHandleXPositions({ innerWidth, panelCount }) {
    const count = Math.max(1, panelCount | 0);
    const paneWidth = Math.max(EPS, innerWidth / count);
    const xMin = -innerWidth * 0.5;
    const edgeInset = Math.min(Math.max(0.06, paneWidth * 0.2), paneWidth * 0.45);

    if (count === 1) return [xMin + paneWidth - edgeInset];

    const [leftPanel, rightPanel] = resolveHandlePanelPair(count);
    const leftPanelLeft = xMin + paneWidth * leftPanel;
    const rightPanelLeft = xMin + paneWidth * rightPanel;
    const leftPanelRight = leftPanelLeft + paneWidth;
    return [leftPanelRight - edgeInset, rightPanelLeft + edgeInset];
}

function buildDoorHandlesGeometry({ settings }) {
    const s = sanitizeWindowMeshSettings(settings);
    if (!s.frame.openBottom || !s.frame.addHandles) return null;

    const { innerWidth, innerHeight, centerY } = computeInnerOpeningProfile(s);
    const panelCount = s.muntins.enabled ? Math.max(1, s.muntins.columns | 0) : 1;
    const xPositions = computeDoorHandleXPositions({ innerWidth, panelCount });

    const yBottom = centerY - innerHeight * 0.5;
    const yTop = centerY + innerHeight * 0.5;
    const yDesired = yBottom + 1.0;
    const yMin = yBottom + HANDLE_MAIN_HEIGHT * 0.5 + 0.02;
    const yMax = yTop - HANDLE_MAIN_HEIGHT * 0.5 - 0.02;
    const yCenter = yMax >= yMin
        ? Math.min(yMax, Math.max(yMin, yDesired))
        : (yBottom + yTop) * 0.5;

    const surfaceZ = Math.max(EPS, s.frame.depth);
    const handleCenterZ = surfaceZ + 0.08;
    const connectorLength = Math.max(EPS, handleCenterZ - surfaceZ);
    const connectorCenterZ = surfaceZ + connectorLength * 0.5;
    const connectorYOffset = HANDLE_MAIN_HEIGHT * 0.32;

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    for (const x of xPositions) {
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter,
            z: handleCenterZ,
            height: HANDLE_MAIN_HEIGHT,
            axis: 'y'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter + connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
            axis: 'z'
        }));
        parts.push(createHandleCylinderGeometry({
            x,
            y: yCenter - connectorYOffset,
            z: connectorCenterZ,
            height: connectorLength,
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
        `fd:${q(f.depth)}`,
        `fob:${f.openBottom ? 1 : 0}`,
        `fah:${f.addHandles ? 1 : 0}`,
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
