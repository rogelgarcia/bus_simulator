// graphics/assets3d/generators/road/math/RoadTileUtils.js
import { EPS, POLE_CLEARANCE } from '../RoadConstants.js';
import { dot2, offsetEndpoints } from '../geometry/RoadGeometryCalc.js';

export function exitDistanceFromRect(p0, moveDir, rectStart, rectEnd, rectHalf) {
    if (!p0 || !moveDir || !rectStart || !rectEnd) return 0;
    const dx = rectEnd.x - rectStart.x;
    const dy = rectEnd.y - rectStart.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return 0;
    const dir = { x: dx / len, y: dy / len };
    const normal = { x: -dir.y, y: dir.x };
    const a = dot2(moveDir, normal);
    const b = dot2({ x: p0.x - rectStart.x, y: p0.y - rectStart.y }, normal);
    let n0 = -Infinity;
    let n1 = Infinity;
    if (Math.abs(a) <= EPS) {
        if (Math.abs(b) > rectHalf) return 0;
    } else {
        const t1 = (-rectHalf - b) / a;
        const t2 = (rectHalf - b) / a;
        n0 = Math.min(t1, t2);
        n1 = Math.max(t1, t2);
    }
    const c = dot2(moveDir, dir);
    const d = dot2({ x: p0.x - rectStart.x, y: p0.y - rectStart.y }, dir);
    let s0 = -Infinity;
    let s1 = Infinity;
    if (Math.abs(c) <= EPS) {
        if (d < 0 || d > len) return 0;
    } else {
        const t3 = (0 - d) / c;
        const t4 = (len - d) / c;
        s0 = Math.min(t3, t4);
        s1 = Math.max(t3, t4);
    }
    const t0 = Math.max(n0, s0);
    const t1 = Math.min(n1, s1);
    if (t0 > t1) return 0;
    if (t1 < 0) return 0;
    if (t0 > 0) return 0;
    if (!Number.isFinite(t1)) return Infinity;
    return Math.max(0, t1 + EPS);
}

export function tileKey(tile) {
    if (!tile) return null;
    const x = tile.x;
    const y = tile.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return `${x},${y}`;
}

export function tileExitDistance(p0, moveDir, center, halfTile) {
    if (!p0 || !moveDir || !center) return 0;
    const minX = center.x - halfTile;
    const maxX = center.x + halfTile;
    const minY = center.y - halfTile;
    const maxY = center.y + halfTile;
    let tMin = -Infinity;
    let tMax = Infinity;
    if (Math.abs(moveDir.x) <= EPS) {
        if (p0.x < minX - EPS || p0.x > maxX + EPS) return 0;
    } else {
        const tx1 = (minX - p0.x) / moveDir.x;
        const tx2 = (maxX - p0.x) / moveDir.x;
        tMin = Math.max(tMin, Math.min(tx1, tx2));
        tMax = Math.min(tMax, Math.max(tx1, tx2));
    }
    if (Math.abs(moveDir.y) <= EPS) {
        if (p0.y < minY - EPS || p0.y > maxY + EPS) return 0;
    } else {
        const ty1 = (minY - p0.y) / moveDir.y;
        const ty2 = (maxY - p0.y) / moveDir.y;
        tMin = Math.max(tMin, Math.min(ty1, ty2));
        tMax = Math.min(tMax, Math.max(ty1, ty2));
    }
    if (tMax < tMin) return 0;
    if (tMax < 0) return 0;
    if (!Number.isFinite(tMax)) return 0;
    return Math.max(0, tMax + EPS);
}

export function endPoleTrimForTile(data, center, halfTile, isStart) {
    if (!data || !center) return 0;
    const base = isStart ? data.rawStart : data.rawEnd;
    if (!base) return 0;
    const moveDir = isStart ? data.dir : { x: -data.dir.x, y: -data.dir.y };
    const left = {
        x: base.x + data.normal.x * data.curbOffset,
        y: base.y + data.normal.y * data.curbOffset
    };
    const right = {
        x: base.x - data.normal.x * data.curbOffset,
        y: base.y - data.normal.y * data.curbOffset
    };
    const tLeft = tileExitDistance(left, moveDir, center, halfTile);
    const tRight = tileExitDistance(right, moveDir, center, halfTile);
    return Math.max(tLeft, tRight);
}

export function centerlineExtent(halfTile, halfWidth, dir, normal) {
    let t = halfTile;
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const nx = Math.abs(normal.x);
    const ny = Math.abs(normal.y);
    if (ax > EPS) t = Math.min(t, (halfTile - nx * halfWidth) / ax);
    if (ay > EPS) t = Math.min(t, (halfTile - ny * halfWidth) / ay);
    if (t < 0) return 0;
    return t;
}

export function trimForRoad(data, others) {
    if (!data || !Array.isArray(others)) return null;
    const leftEdge = offsetEndpoints(data.rawStart, data.rawEnd, data.normal, data.curbOffset);
    const rightEdge = offsetEndpoints(data.rawStart, data.rawEnd, data.normal, -data.curbOffset);
    const startPoles = [leftEdge.start, rightEdge.start];
    const endPoles = [leftEdge.end, rightEdge.end];
    let trimStart = 0;
    let trimEnd = 0;
    const moveStart = data.dir;
    const moveEnd = { x: -data.dir.x, y: -data.dir.y };
    for (const other of others) {
        if (!other || other.roadId === data.roadId) continue;
        const rectHalf = (other.boundaryHalf ?? 0) + POLE_CLEARANCE;
        const otherStart = other.sharedOriginalStart ?? other.rawStart;
        const otherEnd = other.sharedOriginalEnd ?? other.rawEnd;
        if (!otherStart || !otherEnd) continue;
        const extraBack = (Number.isFinite(data?.halfWidth) && Number.isFinite(other?.halfWidth))
            ? Math.min(data.halfWidth, other.halfWidth)
            : 0;
        for (const p of startPoles) {
            let t = exitDistanceFromRect(p, moveStart, otherStart, otherEnd, rectHalf);
            if (t > 0 && extraBack > 0) t += extraBack;
            if (!Number.isFinite(t)) t = data.length;
            if (t > trimStart) trimStart = t;
        }
        for (const p of endPoles) {
            let t = exitDistanceFromRect(p, moveEnd, otherStart, otherEnd, rectHalf);
            if (t > 0 && extraBack > 0) t += extraBack;
            if (!Number.isFinite(t)) t = data.length;
            if (t > trimEnd) trimEnd = t;
        }
    }
    const length = data.length ?? 0;
    if (!(length > EPS)) {
        return { start: data.rawStart, end: data.rawEnd };
    }
    const maxTrim = Math.max(0, length - EPS);
    const totalTrim = trimStart + trimEnd;
    if (totalTrim > maxTrim && totalTrim > EPS) {
        const scale = maxTrim / totalTrim;
        trimStart *= scale;
        trimEnd *= scale;
    }
    return {
        start: { x: data.rawStart.x + data.dir.x * trimStart, y: data.rawStart.y + data.dir.y * trimStart },
        end: { x: data.rawEnd.x - data.dir.x * trimEnd, y: data.rawEnd.y - data.dir.y * trimEnd }
    };
}
