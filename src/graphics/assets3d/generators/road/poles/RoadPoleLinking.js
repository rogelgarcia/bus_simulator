// src/graphics/assets3d/generators/road/poles/RoadPoleLinking.js
import { normalizeDir } from '../math/RoadAngleUtils.js';
import { EPS, HALF } from '../RoadConstants.js';
import { distanceBetween, distanceSq } from '../math/RoadIntersection.js';

export function linkRoadPoles({ roadData, roadById, connectionPolesByCollision }) {
    const endKeyEntries = new Map();
    const registerEndEntry = (data, endKey, endLabel) => {
        if (!data || !endKey) return;
        const poles = endLabel === 'start' ? data.endPoles?.start : data.endPoles?.end;
        if (!poles || !poles.left || !poles.right) return;
        const base = endLabel === 'start'
            ? (data.centerlineStart ?? data.rawStart)
            : (data.centerlineEnd ?? data.rawEnd);
        if (!base) return;
        const dirOut = endLabel === 'start'
            ? { x: data.dir.x, y: data.dir.y }
            : { x: -data.dir.x, y: -data.dir.y };
        let entry = endKeyEntries.get(endKey);
        if (!entry) {
            entry = [];
            endKeyEntries.set(endKey, entry);
        }
        entry.push({
            roadId: data.roadId,
            data,
            end: endLabel,
            endKey,
            poles,
            base,
            dirOut
        });
    };
    for (const data of roadData) {
        registerEndEntry(data, data.startKey, 'start');
        registerEndEntry(data, data.endKey, 'end');
    }

    const polePointXY = (pole) => {
        if (!pole) return null;
        const x = pole.x;
        const y = Number.isFinite(pole.z) ? pole.z : pole.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    };
    const averagePointXY = (points) => {
        if (!Array.isArray(points) || !points.length) return null;
        let sx = 0;
        let sy = 0;
        let count = 0;
        for (const p of points) {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            sx += p.x;
            sy += p.y;
            count += 1;
        }
        if (count === 0) return null;
        return { x: sx / count, y: sy / count };
    };
    const pickPolePair = (poles) => {
        if (!Array.isArray(poles) || poles.length < 2) return null;
        let best = null;
        let bestDist = -Infinity;
        for (let i = 0; i < poles.length; i++) {
            const a = poles[i];
            if (!a) continue;
            for (let j = i + 1; j < poles.length; j++) {
                const b = poles[j];
                if (!b) continue;
                const d2 = distanceSq(a, b);
                if (d2 > bestDist) {
                    bestDist = d2;
                    best = { a, b };
                }
            }
        }
        return best;
    };
    const resolveLoopConnections = (edges, loopKey, centerOverride = null) => {
        if (!Array.isArray(edges) || edges.length < 2) return;
        const prepared = [];
        const centers = [];
        for (const edge of edges) {
            const pair = pickPolePair(edge?.poles);
            if (!pair) continue;
            const pa = polePointXY(pair.a);
            const pb = polePointXY(pair.b);
            if (!pa || !pb) continue;
            const center = { x: (pa.x + pb.x) * HALF, y: (pa.y + pb.y) * HALF };
            centers.push(center);
            prepared.push({
                roadId: edge.roadId,
                poles: pair,
                center,
                dirOut: edge.dirOut ?? null
            });
        }
        if (prepared.length < 2) return;
        const center = centerOverride ?? averagePointXY(centers);
        if (!center) return;
        const ordered = [];
        for (const edge of prepared) {
            let dir = normalizeDir(edge.center.x - center.x, edge.center.y - center.y);
            if (!dir && edge.dirOut) dir = normalizeDir(edge.dirOut.x, edge.dirOut.y);
            if (!dir) continue;
            const pa = polePointXY(edge.poles.a);
            const pb = polePointXY(edge.poles.b);
            if (!pa || !pb) continue;
            const normal = { x: -dir.y, y: dir.x };
            const dotA = (pa.x - edge.center.x) * normal.x + (pa.y - edge.center.y) * normal.y;
            const dotB = (pb.x - edge.center.x) * normal.x + (pb.y - edge.center.y) * normal.y;
            const leftPole = dotA >= dotB ? edge.poles.a : edge.poles.b;
            const rightPole = leftPole === edge.poles.a ? edge.poles.b : edge.poles.a;
            ordered.push({
                roadId: edge.roadId,
                center: edge.center,
                dir,
                angle: Math.atan2(dir.y, dir.x),
                leftPole,
                rightPole
            });
        }
        if (ordered.length < 2) return;
        ordered.sort((a, b) => b.angle - a.angle);
        const total = ordered.length;
        for (let i = 0; i < total; i++) {
            const edge = ordered[i];
            if (edge.leftPole) {
                edge.leftPole.loopIndex = i;
                edge.leftPole.loopCount = total;
                edge.leftPole.loopKey = loopKey;
            }
            if (edge.rightPole) {
                edge.rightPole.loopIndex = i;
                edge.rightPole.loopCount = total;
                edge.rightPole.loopKey = loopKey;
            }
        }
        for (let i = 0; i < total; i++) {
            const curr = ordered[i];
            const next = ordered[(i + 1) % total];
            const rightPole = curr.rightPole;
            const leftPole = next.leftPole;
            if (!rightPole || !leftPole) continue;
            rightPole.linkedTarget = { roadId: next.roadId, pole: leftPole, loopKey };
            leftPole.linkedTarget = { roadId: curr.roadId, pole: rightPole, loopKey };
        }
    };
    const collisionCenterForEntry = (entry) => {
        if (!entry) return null;
        for (const poles of entry.values()) {
            if (!Array.isArray(poles)) continue;
            for (const pole of poles) {
                const collision = pole?.collision ?? null;
                const cx = collision?.x;
                const cy = Number.isFinite(collision?.z) ? collision.z : collision?.y;
                if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
            }
        }
        return null;
    };
    const buildCollisionEdges = (entry) => {
        const groups = new Map();
        for (const [roadId, poles] of entry.entries()) {
            if (!Array.isArray(poles)) continue;
            for (const pole of poles) {
                if (!pole || !Number.isFinite(pole.cut)) continue;
                const key = `${roadId}:${pole.cut.toFixed(4)}`;
                let group = groups.get(key);
                if (!group) {
                    group = { roadId, poles: [] };
                    groups.set(key, group);
                }
                group.poles.push(pole);
            }
        }
        return Array.from(groups.values());
    };

    for (const [collisionId, entry] of connectionPolesByCollision.entries()) {
        const edges = buildCollisionEdges(entry);
        if (edges.length < 2) continue;
        const center = collisionCenterForEntry(entry);
        resolveLoopConnections(edges, `collision:${collisionId}`, center);
    }
    for (const [endKey, entries] of endKeyEntries.entries()) {
        if (!Array.isArray(entries) || entries.length < 2) continue;
        const edges = [];
        for (const entry of entries) {
            const poles = entry?.poles;
            if (!poles || !poles.left || !poles.right) continue;
            edges.push({ roadId: entry.roadId, poles: [poles.left, poles.right], dirOut: entry.dirOut });
        }
        resolveLoopConnections(edges, `end:${endKey}`, null);
    }

    const markCurveAtEnd = (data, endLabel) => {
        const endPoles = data?.endPoles;
        if (!endPoles) return;
        const poleSet = endLabel === 'start' ? endPoles.start : endPoles.end;
        const leftPole = poleSet?.left ?? null;
        const rightPole = poleSet?.right ?? null;
        if (!leftPole || !rightPole) return;
        const leftLink = leftPole.linkedTarget ?? null;
        const rightLink = rightPole.linkedTarget ?? null;
        if (!leftLink || !rightLink) return;
        const otherRoadId = leftLink.roadId;
        if (otherRoadId == null || otherRoadId !== rightLink.roadId) return;
        const leftTarget = leftLink.pole ?? null;
        const rightTarget = rightLink.pole ?? null;
        if (!leftTarget || !rightTarget) return;
        if (leftTarget === rightTarget) return;
        if (!leftTarget.end || !rightTarget.end) return;
        if (leftTarget.end !== rightTarget.end) return;
        const other = roadById.get(otherRoadId);
        if (!other?.endPoles) return;
        const otherPoleSet = leftTarget.end === 'start' ? other.endPoles.start : other.endPoles.end;
        if (!otherPoleSet) return;
        const distLeft = distanceBetween(leftPole, leftTarget);
        const distRight = distanceBetween(rightPole, rightTarget);
        if (!Number.isFinite(distLeft) || !Number.isFinite(distRight)) return;
        leftPole.curveConnection = true;
        rightPole.curveConnection = true;
        leftTarget.curveConnection = true;
        rightTarget.curveConnection = true;
        if (Math.abs(distLeft - distRight) > EPS) {
            const leftInner = distLeft < distRight;
            leftPole.curveSide = leftInner ? 'internal' : 'external';
            rightPole.curveSide = leftInner ? 'external' : 'internal';
            leftTarget.curveSide = leftInner ? 'internal' : 'external';
            rightTarget.curveSide = leftInner ? 'external' : 'internal';
        }
    };

    for (const data of roadData) {
        markCurveAtEnd(data, 'start');
        markCurveAtEnd(data, 'end');
    }
}

export function pickSharedRoadOnSide(roadById, data, endKey, side) {
    if (!data || !endKey) return null;
    const sharedIds = endKey === data.startKey ? data.sharedStartRoadIds : data.sharedEndRoadIds;
    if (!Array.isArray(sharedIds) || !sharedIds.length) return null;
    const base = endKey === data.startKey ? data.startCenter : data.endCenter;
    if (!base) return null;
    const sideNormal = side === 'right'
        ? { x: -data.normal.x, y: -data.normal.y }
        : { x: data.normal.x, y: data.normal.y };
    let bestId = null;
    let bestDot = -Infinity;
    let bestDist = Infinity;
    for (const id of sharedIds) {
        const other = roadById.get(id);
        if (!other) continue;
        let otherCenter = null;
        if (endKey === other.startKey) otherCenter = other.startCenter;
        else if (endKey === other.endKey) otherCenter = other.endCenter;
        if (!otherCenter) continue;
        const vx = otherCenter.x - base.x;
        const vy = otherCenter.y - base.y;
        const dot = vx * sideNormal.x + vy * sideNormal.y;
        if (!(dot > EPS)) continue;
        const distSq = vx * vx + vy * vy;
        if (dot > bestDot + EPS || (Math.abs(dot - bestDot) <= EPS && distSq < bestDist)) {
            bestDot = dot;
            bestDist = distSq;
            bestId = id;
        }
    }
    return bestId;
}

export function pickEndPole(data, endKey, side) {
    if (!data || !data.endPoles) return null;
    if (endKey === data.startKey) return data.endPoles.start?.[side] ?? null;
    if (endKey === data.endKey) return data.endPoles.end?.[side] ?? null;
    return null;
}

export function pickClosestEndPole(data, side, ref) {
    if (!data || !data.endPoles || !ref) return null;
    const startPole = data.endPoles.start?.[side] ?? null;
    const endPole = data.endPoles.end?.[side] ?? null;
    let best = null;
    let bestDist = Infinity;
    if (startPole) {
        const d = distanceSq(startPole, ref);
        if (d < bestDist) {
            best = startPole;
            bestDist = d;
        }
    }
    if (endPole) {
        const d = distanceSq(endPole, ref);
        if (d < bestDist) best = endPole;
    }
    return best;
}
