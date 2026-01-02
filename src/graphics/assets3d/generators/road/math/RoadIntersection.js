// src/graphics/assets3d/generators/road/math/RoadIntersection.js
import { clamp } from './RoadMath.js';
import { EPS } from '../RoadConstants.js';
import { cross2 } from '../geometry/RoadGeometryCalc.js';

export function segmentIntersection(p0, p1, p2, p3) {
    if (!p0 || !p1 || !p2 || !p3) return null;
    const r = { x: p1.x - p0.x, y: p1.y - p0.y };
    const s = { x: p3.x - p2.x, y: p3.y - p2.y };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const qp = { x: p2.x - p0.x, y: p2.y - p0.y };
    const t = cross2(qp, s) / denom;
    const u = cross2(qp, r) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p0.x + r.x * t, y: p0.y + r.y * t };
}

export function distanceSq(a, b) {
    const dx = a.x - b.x;
    const ay = Number.isFinite(a.z) ? a.z : a.y;
    const by = Number.isFinite(b.z) ? b.z : b.y;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

export function distanceBetween(a, b) {
    const ax = a?.x;
    const bx = b?.x;
    const az = Number.isFinite(a?.z) ? a.z : a?.y;
    const bz = Number.isFinite(b?.z) ? b.z : b?.y;
    if (!Number.isFinite(ax) || !Number.isFinite(bx) || !Number.isFinite(az) || !Number.isFinite(bz)) return null;
    return Math.hypot(bx - ax, bz - az);
}

export function polylineDistances(points) {
    const distances = new Array(points.length);
    if (!points.length) return distances;
    distances[0] = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        distances[i] = distances[i - 1] + Math.hypot(dx, dy);
    }
    return distances;
}

export function pointAlongPolyline(points, distances, dist) {
    const count = points.length;
    if (!count) return { point: null, dir: null };
    const total = distances[count - 1] ?? 0;
    if (!(total > EPS)) {
        return { point: points[0], dir: { x: 1, y: 0 } };
    }
    const d = clamp(dist ?? 0, 0, total);
    let idx = 0;
    while (idx + 1 < count && distances[idx + 1] < d - EPS) idx++;
    const nextIdx = Math.min(idx + 1, count - 1);
    const p0 = points[idx];
    const p1 = points[nextIdx];
    const segLen = distances[nextIdx] - distances[idx];
    const t = segLen > EPS ? (d - distances[idx]) / segLen : 0;
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len > EPS) {
        dx /= len;
        dy /= len;
    } else {
        dx = 1;
        dy = 0;
    }
    return { point: { x, y }, dir: { x: dx, y: dy } };
}

export function directionFromPolyline(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return null;
    return { x: dx / len, y: dy / len };
}

export function alongForData(data, point) {
    if (!data || !point) return 0;
    const base = data.centerlineStart ?? data.rawStart;
    if (!base) return 0;
    const py = Number.isFinite(point.y) ? point.y : point.z;
    return (point.x - base.x) * data.dir.x + (py - base.y) * data.dir.y;
}
