// src/graphics/engine3d/buildings/window_mesh/WindowMeshGeometry.js
// Builds reusable BufferGeometries for procedural window meshes.
// @ts-check

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitizeWindowMeshSettings } from '../../../../app/buildings/window_mesh/WindowMeshSettings.js';

const EPS = 1e-6;
const QUANT = 10000;

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

function buildWindowOutline(out, { width, height, wantsArch, archRise, curveSegments, reverse }) {
    const w = Math.max(0.01, Number(width) || 1);
    const h = Math.max(0.01, Number(height) || 1);

    const x0 = -w * 0.5;
    const x1 = w * 0.5;
    const y0 = -h * 0.5;
    const yTop = h * 0.5;

    if (!wantsArch) {
        buildRectOutline(out, { x0, x1, y0, y1: yTop, reverse });
        return { x0, x1, y0, yTop, yChord: yTop, archRise: 0.0 };
    }

    const yChord = yTop - archRise;
    buildArchedOutline(out, { x0, x1, y0, yTop, yChord, archRise, curveSegments, reverse });
    return { x0, x1, y0, yTop, yChord, archRise };
}

function buildFrameGeometry({ settings, curveSegments }) {
    const s = sanitizeWindowMeshSettings(settings);

    const w = s.width;
    const h = s.height;
    const fw = s.frame.width;
    const depth = s.frame.depth;

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

    const w = s.width;
    const h = s.height;
    const fw = s.frame.width;

    const innerWidth = Math.max(EPS, w - fw * 2);
    const innerHeight = Math.max(EPS, h - fw * 2);

    const wantsArch = !!s.arch.enabled;
    const outerArchRise = wantsArch ? (s.arch.heightRatio * w) : 0.0;
    const innerWantsArch = wantsArch && outerArchRise > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;

    const shape = new THREE.Shape();
    buildWindowOutline(shape, {
        width: innerWidth,
        height: innerHeight,
        wantsArch: innerWantsArch,
        archRise: Math.min(innerArchRise, Math.max(0, innerHeight - fw)),
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

    const w = s.width;
    const h = s.height;
    const fw = s.frame.width;
    const frameDepth = s.frame.depth;

    const innerWidth = Math.max(EPS, w - fw * 2);
    const innerHeight = Math.max(EPS, h - fw * 2);

    const wantsArch = !!s.arch.enabled;
    const outerArchRise = wantsArch ? (s.arch.heightRatio * w) : 0.0;
    const innerWantsArch = wantsArch && outerArchRise > EPS;
    const innerArchRise = innerWantsArch ? (s.arch.heightRatio * innerWidth) : 0.0;
    const rectHeight = innerWantsArch ? Math.max(EPS, innerHeight - innerArchRise) : innerHeight;

    const x0 = -innerWidth * 0.5;
    const x1 = innerWidth * 0.5;
    const y0 = -innerHeight * 0.5;
    const y1 = y0 + rectHeight;

    const cols = Math.max(1, s.muntins.columns | 0);
    const rows = Math.max(1, s.muntins.rows | 0);
    const mw = Math.max(EPS, s.muntins.width);
    const md = Math.max(EPS, s.muntins.depth);
    const inset = Math.max(0, s.muntins.inset);
    const offX = (s.muntins.uvOffset.x || 0) * (innerWidth / cols) * 0.25;
    const offY = (s.muntins.uvOffset.y || 0) * (rectHeight / rows) * 0.25;

    const frontZ = frameDepth - inset;
    const centerZ = frontZ - md * 0.5;

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];

    const paneW = innerWidth / cols;
    for (let c = 1; c < cols; c++) {
        const x = x0 + paneW * c + offX;
        if (x <= x0 + mw * 0.5 + EPS || x >= x1 - mw * 0.5 - EPS) continue;
        const geo = new THREE.BoxGeometry(mw, rectHeight, md);
        geo.translate(x, y0 + rectHeight * 0.5, centerZ);
        parts.push(geo);
    }

    const paneH = rectHeight / rows;
    for (let r = 1; r < rows; r++) {
        const y = y0 + paneH * r + offY;
        if (y <= y0 + mw * 0.5 + EPS || y >= y1 - mw * 0.5 - EPS) continue;
        const geo = new THREE.BoxGeometry(innerWidth, mw, md);
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
    return geo;
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
        `fw:${q(f.width)}`,
        `fd:${q(f.depth)}`,
        `m:${m.enabled ? 1 : 0}`,
        `mc:${m.columns | 0}`,
        `mr:${m.rows | 0}`,
        `mw:${q(m.width)}`,
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

    return { frame, opening, muntins, joinBar };
}
