// src/app/road_debugger/RoadDebuggerPipeline.js
// Pure rebuild pipeline for Road Debugger derived geometry and render primitives.
// Design: Returns plain serializable data so results are deterministic and renderer-agnostic.

const EPS = 1e-9;

function clampInt(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n | 0));
}

function safeId(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function normalizeDirXZ(a, b) {
    const dx = (b?.x ?? 0) - (a?.x ?? 0);
    const dz = (b?.z ?? 0) - (a?.z ?? 0);
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function rightNormalXZ(dir) {
    return { x: dir.z, z: -dir.x };
}

function resolveOrigin(origin) {
    const ox = Number(origin?.x) || 0;
    const oz = Number(origin?.z) || 0;
    return { x: ox, z: oz };
}

function resolveFlags(flags) {
    const f = flags && typeof flags === 'object' ? flags : {};
    return {
        centerline: f.centerline !== false,
        directionCenterlines: f.directionCenterlines !== false,
        laneEdges: f.laneEdges !== false,
        asphaltEdges: f.asphaltEdges !== false,
        markers: f.markers !== false,
        asphaltObb: f.asphaltObb !== false
    };
}

function resolveTrim(trim, laneWidth) {
    const t = trim && typeof trim === 'object' ? trim : {};
    const debug = t.debug && typeof t.debug === 'object' ? t.debug : {};
    const threshold = Number.isFinite(t.threshold) ? Number(t.threshold) : (Number(laneWidth) || 4.8) * 0.1;
    return {
        enabled: t.enabled !== false,
        threshold,
        debug: {
            rawSegments: !!debug.rawSegments,
            strips: !!debug.strips,
            overlaps: !!debug.overlaps,
            intervals: !!debug.intervals,
            keptPieces: !!debug.keptPieces,
            droppedPieces: !!debug.droppedPieces
        }
    };
}

export function resolveRoadDebuggerSettings(settings = {}) {
    const tileSize = Number(settings.tileSize) || 24;
    const laneWidth = Number(settings.laneWidth) || 4.8;
    const marginFactor = Number.isFinite(settings.marginFactor) ? Number(settings.marginFactor) : 0.1;
    const origin = resolveOrigin(settings.origin);
    const flags = resolveFlags(settings.flags);
    const trim = resolveTrim(settings.trim, laneWidth);
    return {
        tileSize,
        laneWidth,
        marginFactor,
        origin,
        flags,
        trim
    };
}

function pointWorldPosition(point, settings) {
    const tileX = Number(point?.tileX) || 0;
    const tileY = Number(point?.tileY) || 0;
    const offsetX = Number(point?.offsetX) || 0;
    const offsetY = Number(point?.offsetY) || 0;
    const tileSize = Number(settings?.tileSize) || 24;
    const origin = settings?.origin ?? { x: 0, z: 0 };
    return {
        x: origin.x + tileX * tileSize + offsetX,
        z: origin.z + tileY * tileSize + offsetY
    };
}

function normalizePoint(raw, { roadId, index, settings }) {
    const id = safeId(raw?.id, `pt_${roadId}_${index}`);
    const tileX = Number(raw?.tileX) || 0;
    const tileY = Number(raw?.tileY) || 0;
    const offsetX = Number(raw?.offsetX) || 0;
    const offsetY = Number(raw?.offsetY) || 0;
    const tangentFactor = Number.isFinite(raw?.tangentFactor) ? Number(raw.tangentFactor) : 1;
    const world = pointWorldPosition({ tileX, tileY, offsetX, offsetY }, settings);
    return {
        id,
        tileX,
        tileY,
        offsetX,
        offsetY,
        tangentFactor,
        world
    };
}

function offsetPointXZ(p, right, offset) {
    return {
        x: (p?.x ?? 0) + right.x * offset,
        z: (p?.z ?? 0) + right.z * offset
    };
}

function makePolyline({ segmentId, roadId, kind, offset, right, aPoint, bPoint }) {
    const id = `${segmentId}__${kind}`;
    const a = offsetPointXZ(aPoint.world, right, offset);
    const b = offsetPointXZ(bPoint.world, right, offset);
    return {
        id,
        kind,
        roadId,
        segmentId,
        offset,
        points: [
            {
                id: `${id}__${aPoint.id}`,
                x: a.x,
                z: a.z,
                tangentFactor: aPoint.tangentFactor,
                roadPointId: aPoint.id
            },
            {
                id: `${id}__${bPoint.id}`,
                x: b.x,
                z: b.z,
                tangentFactor: bPoint.tangentFactor,
                roadPointId: bPoint.id
            }
        ]
    };
}

function segmentCorners(aWorld, bWorld, right, leftWidth, rightWidth) {
    const aL = offsetPointXZ(aWorld, right, -leftWidth);
    const aR = offsetPointXZ(aWorld, right, rightWidth);
    const bR = offsetPointXZ(bWorld, right, rightWidth);
    const bL = offsetPointXZ(bWorld, right, -leftWidth);
    return [aL, aR, bR, bL];
}

function computeAabb(points) {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
        const x = p?.x ?? 0;
        const z = p?.z ?? 0;
        if (x < minX) minX = x;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) {
        return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
    }
    return { minX, minZ, maxX, maxZ };
}

function cross2(a, b) {
    return (a?.x ?? 0) * (b?.z ?? 0) - (a?.z ?? 0) * (b?.x ?? 0);
}

function dot2(a, b) {
    return (a?.x ?? 0) * (b?.x ?? 0) + (a?.z ?? 0) * (b?.z ?? 0);
}

function polygonArea(points) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        sum += (a?.x ?? 0) * (b?.z ?? 0) - (b?.x ?? 0) * (a?.z ?? 0);
    }
    return sum * 0.5;
}

function ensureCcw(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 3) return pts;
    if (polygonArea(pts) >= 0) return pts;
    return pts.slice().reverse();
}

function lineIntersectionParam(p, q, a, b) {
    const r = { x: (q?.x ?? 0) - (p?.x ?? 0), z: (q?.z ?? 0) - (p?.z ?? 0) };
    const s = { x: (b?.x ?? 0) - (a?.x ?? 0), z: (b?.z ?? 0) - (a?.z ?? 0) };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const ap = { x: (a?.x ?? 0) - (p?.x ?? 0), z: (a?.z ?? 0) - (p?.z ?? 0) };
    return cross2(ap, s) / denom;
}

function clipPolygon(subject, clip) {
    let output = ensureCcw(subject);
    const clipPts = ensureCcw(clip);
    if (output.length < 3 || clipPts.length < 3) return [];

    for (let i = 0; i < clipPts.length; i++) {
        const a = clipPts[i];
        const b = clipPts[(i + 1) % clipPts.length];
        const input = output;
        output = [];
        if (input.length < 3) break;

        const edge = { x: (b?.x ?? 0) - (a?.x ?? 0), z: (b?.z ?? 0) - (a?.z ?? 0) };
        const inside = (p) => cross2(edge, { x: (p?.x ?? 0) - (a?.x ?? 0), z: (p?.z ?? 0) - (a?.z ?? 0) }) >= -EPS;

        for (let j = 0; j < input.length; j++) {
            const p = input[j];
            const q = input[(j + 1) % input.length];
            const pIn = inside(p);
            const qIn = inside(q);

            if (pIn && qIn) {
                output.push({ x: q.x, z: q.z });
                continue;
            }
            if (pIn && !qIn) {
                const t = lineIntersectionParam(p, q, a, b);
                if (t !== null) {
                    const tt = Math.max(0, Math.min(1, t));
                    output.push({ x: (p.x ?? 0) + ((q.x ?? 0) - (p.x ?? 0)) * tt, z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * tt });
                }
                continue;
            }
            if (!pIn && qIn) {
                const t = lineIntersectionParam(p, q, a, b);
                if (t !== null) {
                    const tt = Math.max(0, Math.min(1, t));
                    output.push({ x: (p.x ?? 0) + ((q.x ?? 0) - (p.x ?? 0)) * tt, z: (p.z ?? 0) + ((q.z ?? 0) - (p.z ?? 0)) * tt });
                }
                output.push({ x: q.x, z: q.z });
            }
        }
    }

    if (output.length < 3) return [];
    const cleaned = [];
    for (const p of output) {
        const last = cleaned[cleaned.length - 1] ?? null;
        if (last && Math.hypot((p.x ?? 0) - (last.x ?? 0), (p.z ?? 0) - (last.z ?? 0)) <= 1e-6) continue;
        cleaned.push(p);
    }
    if (cleaned.length >= 3) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (first && last && Math.hypot((first.x ?? 0) - (last.x ?? 0), (first.z ?? 0) - (last.z ?? 0)) <= 1e-6) cleaned.pop();
    }
    return cleaned.length >= 3 ? cleaned : [];
}

function projectionsOverlapOnAxis(pointsA, pointsB, axis) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of pointsA) {
        const v = dot2(p, axis);
        if (v < minA) minA = v;
        if (v > maxA) maxA = v;
    }
    for (const p of pointsB) {
        const v = dot2(p, axis);
        if (v < minB) minB = v;
        if (v > maxB) maxB = v;
    }
    if (!Number.isFinite(minA) || !Number.isFinite(maxA) || !Number.isFinite(minB) || !Number.isFinite(maxB)) return false;
    return !(maxA < minB - EPS || maxB < minA - EPS);
}

function satOverlapConvex(pointsA, pointsB, axes) {
    for (const axis of axes) {
        if (!projectionsOverlapOnAxis(pointsA, pointsB, axis)) return false;
    }
    return true;
}

function aabbOverlaps(a, b) {
    if (!a || !b) return false;
    return !(
        (a.maxX ?? 0) < (b.minX ?? 0) - EPS ||
        (b.maxX ?? 0) < (a.minX ?? 0) - EPS ||
        (a.maxZ ?? 0) < (b.minZ ?? 0) - EPS ||
        (b.maxZ ?? 0) < (a.minZ ?? 0) - EPS
    );
}

function projectPolygonToSegmentT(points, segStart, axis, length) {
    if (!Array.isArray(points) || points.length < 3) return null;
    if (!(length > EPS)) return null;
    let minT = Infinity;
    let maxT = -Infinity;
    for (const p of points) {
        const rel = { x: (p?.x ?? 0) - (segStart?.x ?? 0), z: (p?.z ?? 0) - (segStart?.z ?? 0) };
        const t = dot2(rel, axis) / length;
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
    return { t0: minT, t1: maxT };
}

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function segmentIntersectionXZ(a0, a1, b0, b1) {
    const p = { x: a0?.x ?? 0, z: a0?.z ?? 0 };
    const r = { x: (a1?.x ?? 0) - (a0?.x ?? 0), z: (a1?.z ?? 0) - (a0?.z ?? 0) };
    const q = { x: b0?.x ?? 0, z: b0?.z ?? 0 };
    const s = { x: (b1?.x ?? 0) - (b0?.x ?? 0), z: (b1?.z ?? 0) - (b0?.z ?? 0) };
    const denom = cross2(r, s);
    if (Math.abs(denom) <= EPS) return null;
    const qp = { x: q.x - p.x, z: q.z - p.z };
    const t = cross2(qp, s) / denom;
    const u = cross2(qp, r) / denom;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { x: p.x + r.x * t, z: p.z + r.z * t };
}

function centroid(points) {
    const pts = Array.isArray(points) ? points : [];
    if (!pts.length) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    for (const p of pts) {
        x += p?.x ?? 0;
        z += p?.z ?? 0;
    }
    const inv = 1 / pts.length;
    return { x: x * inv, z: z * inv };
}

function makeRectCorners(start, end, right, leftWidth, rightWidth) {
    return segmentCorners(start, end, right, leftWidth, rightWidth);
}

function mergeIntervals(intervals) {
    const list = Array.isArray(intervals) ? intervals.slice() : [];
    list.sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0));
    const out = [];
    for (const it of list) {
        const t0 = clamp01(it?.t0 ?? 0);
        const t1 = clamp01(it?.t1 ?? 0);
        if (!(t1 > t0 + EPS)) continue;
        const last = out[out.length - 1] ?? null;
        if (!last || t0 > last.t1 + 1e-6) {
            out.push({ t0, t1 });
        } else {
            last.t1 = Math.max(last.t1, t1);
        }
    }
    return out;
}

function complementIntervals(removed) {
    const out = [];
    let t = 0;
    for (const it of removed) {
        if ((it.t0 ?? 0) > t + 1e-9) out.push({ t0: t, t1: it.t0 });
        t = Math.max(t, it.t1 ?? t);
        if (t >= 1 - 1e-9) {
            t = 1;
            break;
        }
    }
    if (t < 1 - 1e-9) out.push({ t0: t, t1: 1 });
    return out.filter((it) => (it.t1 ?? 0) > (it.t0 ?? 0) + EPS);
}

function buildSegment({ road, roadIndex, segmentIndex, aPoint, bPoint, settings }) {
    const segmentId = `seg_${road.id}_${aPoint.id}_${bPoint.id}`;
    const dir = normalizeDirXZ(aPoint.world, bPoint.world);
    if (!dir) return null;
    const right = rightNormalXZ(dir);

    const laneWidth = settings.laneWidth;
    const margin = laneWidth * settings.marginFactor;
    const lanesF = clampInt(road.lanesF, 0, 99);
    const lanesB = clampInt(road.lanesB, 0, 99);
    const rightLaneEdge = lanesF * laneWidth;
    const leftLaneEdge = lanesB * laneWidth;
    const rightAsphaltEdge = rightLaneEdge + margin;
    const leftAsphaltEdge = leftLaneEdge + margin;

    const polylines = [];
    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'centerline',
        offset: 0,
        right,
        aPoint,
        bPoint
    }));

    if (lanesF > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'forward_centerline',
            offset: rightLaneEdge * 0.5,
            right,
            aPoint,
            bPoint
        }));
    }

    if (lanesB > 0) {
        polylines.push(makePolyline({
            segmentId,
            roadId: road.id,
            kind: 'backward_centerline',
            offset: -leftLaneEdge * 0.5,
            right,
            aPoint,
            bPoint
        }));
    }

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'lane_edge_right',
        offset: rightLaneEdge,
        right,
        aPoint,
        bPoint
    }));

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'lane_edge_left',
        offset: -leftLaneEdge,
        right,
        aPoint,
        bPoint
    }));

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'asphalt_edge_right',
        offset: rightAsphaltEdge,
        right,
        aPoint,
        bPoint
    }));

    polylines.push(makePolyline({
        segmentId,
        roadId: road.id,
        kind: 'asphalt_edge_left',
        offset: -leftAsphaltEdge,
        right,
        aPoint,
        bPoint
    }));

    const corners = segmentCorners(aPoint.world, bPoint.world, right, leftAsphaltEdge, rightAsphaltEdge);
    const obb = {
        id: `${segmentId}__asphalt_obb`,
        roadId: road.id,
        segmentId,
        center: {
            x: (aPoint.world.x + bPoint.world.x) * 0.5,
            z: (aPoint.world.z + bPoint.world.z) * 0.5
        },
        axis: { x: dir.x, z: dir.z },
        halfLength: dir.length * 0.5,
        halfWidthLeft: leftAsphaltEdge,
        halfWidthRight: rightAsphaltEdge,
        corners,
        aabb: computeAabb(corners)
    };

    return {
        id: segmentId,
        roadId: road.id,
        roadIndex,
        index: segmentIndex,
        aPointId: aPoint.id,
        bPointId: bPoint.id,
        aWorld: { x: aPoint.world.x, z: aPoint.world.z },
        bWorld: { x: bPoint.world.x, z: bPoint.world.z },
        lanesF,
        lanesB,
        length: dir.length,
        dir: { x: dir.x, z: dir.z },
        right,
        laneWidth,
        margin,
        polylines,
        asphaltObb: obb
    };
}

function includePolyline(kind, flags) {
    if (kind === 'centerline') return flags.centerline;
    if (kind === 'forward_centerline' || kind === 'backward_centerline') return flags.directionCenterlines;
    if (kind === 'lane_edge_left' || kind === 'lane_edge_right') return flags.laneEdges;
    if (kind === 'asphalt_edge_left' || kind === 'asphalt_edge_right') return flags.asphaltEdges;
    return true;
}

function pushPolylinePrimitive(primitives, poly) {
    primitives.push({
        type: 'polyline',
        id: poly.id,
        kind: poly.kind,
        roadId: poly.roadId,
        segmentId: poly.segmentId,
        points: poly.points.map((p) => ({ x: p.x, z: p.z }))
    });
}

function pushMarkerPrimitive(primitives, poly) {
    primitives.push({
        type: 'points',
        id: `${poly.id}__markers`,
        kind: `${poly.kind}_markers`,
        roadId: poly.roadId,
        segmentId: poly.segmentId,
        points: poly.points.map((p) => ({ x: p.x, z: p.z }))
    });
}

function pushObbPrimitive(primitives, obb) {
    primitives.push({
        type: 'polygon',
        id: obb.id,
        kind: 'asphalt_obb',
        roadId: obb.roadId,
        segmentId: obb.segmentId,
        points: obb.corners.map((p) => ({ x: p.x, z: p.z }))
    });
}

export function rebuildRoadDebuggerPipeline({ roads = [], settings = {} } = {}) {
    const resolvedSettings = resolveRoadDebuggerSettings(settings);
    const derivedRoads = [];
    const segments = [];
    const primitives = [];
    const flags = resolvedSettings.flags;
    const trim = resolvedSettings.trim ?? { enabled: false, threshold: 0 };

    const list = Array.isArray(roads) ? roads : [];
    for (let roadIndex = 0; roadIndex < list.length; roadIndex++) {
        const rawRoad = list[roadIndex] ?? {};
        const roadId = safeId(rawRoad?.id, `road_${roadIndex}`);
        const name = typeof rawRoad?.name === 'string' && rawRoad.name.trim() ? rawRoad.name.trim() : roadId;
        const lanesF = clampInt(rawRoad?.lanesF ?? 1, 0, 99);
        const lanesB = clampInt(rawRoad?.lanesB ?? 1, 0, 99);
        const rawPoints = Array.isArray(rawRoad?.points) ? rawRoad.points : [];
        const points = rawPoints.map((pt, index) => normalizePoint(pt, { roadId, index, settings: resolvedSettings }));

        const roadOut = {
            id: roadId,
            name,
            lanesF,
            lanesB,
            points,
            segmentIds: []
        };

        for (let i = 0; i < points.length - 1; i++) {
            const seg = buildSegment({
                road: roadOut,
                roadIndex,
                segmentIndex: i,
                aPoint: points[i],
                bPoint: points[i + 1],
                settings: resolvedSettings
            });
            if (!seg) continue;
            roadOut.segmentIds.push(seg.id);
            segments.push(seg);

            for (const poly of seg.polylines) {
                if (!includePolyline(poly.kind, flags)) continue;
                pushPolylinePrimitive(primitives, poly);
                if (flags.markers) pushMarkerPrimitive(primitives, poly);
            }

            if (flags.asphaltObb) pushObbPrimitive(primitives, seg.asphaltObb);
        }

        derivedRoads.push(roadOut);
    }

    const trimOut = {
        enabled: trim.enabled,
        threshold: trim.threshold,
        overlaps: []
    };

    if (trim.enabled) {
        const threshold = Math.max(0, Number(trim.threshold) || 0);
        const pad = threshold * 0.5;
        const snapStep = resolvedSettings.tileSize / 10;

        const expanded = segments.map((seg) => {
            const left = (seg?.asphaltObb?.halfWidthLeft ?? 0) + pad;
            const rightW = (seg?.asphaltObb?.halfWidthRight ?? 0) + pad;
            const axis = seg?.dir ?? { x: 1, z: 0 };
            const right = seg?.right ?? { x: 0, z: -1 };
            const a = seg?.aWorld ?? { x: 0, z: 0 };
            const b = seg?.bWorld ?? { x: 0, z: 0 };
            const start = { x: (a.x ?? 0) - (axis.x ?? 0) * pad, z: (a.z ?? 0) - (axis.z ?? 0) * pad };
            const end = { x: (b.x ?? 0) + (axis.x ?? 0) * pad, z: (b.z ?? 0) + (axis.z ?? 0) * pad };
            const corners = makeRectCorners(start, end, right, left, rightW);
            return {
                segmentId: seg.id,
                roadId: seg.roadId,
                axis,
                right,
                start,
                end,
                leftWidth: left,
                rightWidth: rightW,
                corners: ensureCcw(corners),
                aabb: computeAabb(corners)
            };
        });

        const expandedById = new Map(expanded.map((s) => [s.segmentId, s]));
        const intervalsBySeg = new Map();

        const sortedSegs = segments.slice().sort((a, b) => {
            const aId = String(a?.id ?? '');
            const bId = String(b?.id ?? '');
            if (aId < bId) return -1;
            if (aId > bId) return 1;
            return 0;
        });
        for (let i = 0; i < sortedSegs.length; i++) {
            const aSeg = sortedSegs[i];
            const aStrip = expandedById.get(aSeg.id);
            if (!aStrip) continue;
            for (let j = i + 1; j < sortedSegs.length; j++) {
                const bSeg = sortedSegs[j];
                if (aSeg.aPointId === bSeg.aPointId || aSeg.aPointId === bSeg.bPointId || aSeg.bPointId === bSeg.aPointId || aSeg.bPointId === bSeg.bPointId) continue;

                const bStrip = expandedById.get(bSeg.id);
                if (!bStrip) continue;
                if (!aabbOverlaps(aStrip.aabb, bStrip.aabb)) continue;

                const axes = [
                    aStrip.axis, aStrip.right,
                    bStrip.axis, bStrip.right
                ];
                if (!satOverlapConvex(aStrip.corners, bStrip.corners, axes)) continue;

                const overlapPoly = clipPolygon(aStrip.corners, bStrip.corners);
                if (overlapPoly.length < 3) continue;
                const area = Math.abs(polygonArea(overlapPoly));
                if (!(area > 1e-6)) continue;

                const anchor = segmentIntersectionXZ(aSeg.aWorld, aSeg.bWorld, bSeg.aWorld, bSeg.bWorld) ?? centroid(overlapPoly);

                const aProj = projectPolygonToSegmentT(overlapPoly, aSeg.aWorld, aSeg.dir, aSeg.length);
                const bProj = projectPolygonToSegmentT(overlapPoly, bSeg.aWorld, bSeg.dir, bSeg.length);
                if (!aProj || !bProj) continue;

                const aT0 = clamp01(aProj.t0);
                const aT1 = clamp01(aProj.t1);
                const bT0 = clamp01(bProj.t0);
                const bT1 = clamp01(bProj.t1);
                if (!(aT1 > aT0 + 1e-9) || !(bT1 > bT0 + 1e-9)) continue;

                const aCrossRaw = clamp01(dot2({ x: (anchor.x ?? 0) - (aSeg.aWorld.x ?? 0), z: (anchor.z ?? 0) - (aSeg.aWorld.z ?? 0) }, aSeg.dir) / aSeg.length);
                const bCrossRaw = clamp01(dot2({ x: (anchor.x ?? 0) - (bSeg.aWorld.x ?? 0), z: (anchor.z ?? 0) - (bSeg.aWorld.z ?? 0) }, bSeg.dir) / bSeg.length);

                const aCross = (aT0 + aT1) * 0.5;
                const bCross = (bT0 + bT1) * 0.5;

                const aRemove = { t0: aT0, t1: aT1 };
                const bRemove = { t0: bT0, t1: bT1 };

                if (!intervalsBySeg.has(aSeg.id)) intervalsBySeg.set(aSeg.id, []);
                if (!intervalsBySeg.has(bSeg.id)) intervalsBySeg.set(bSeg.id, []);
                intervalsBySeg.get(aSeg.id).push({ ...aRemove, otherSegmentId: bSeg.id });
                intervalsBySeg.get(bSeg.id).push({ ...bRemove, otherSegmentId: aSeg.id });

                const overlapId = `ov_${aSeg.id}__${bSeg.id}`;
                trimOut.overlaps.push({
                    id: overlapId,
                    aSegmentId: aSeg.id,
                    bSegmentId: bSeg.id,
                    polygon: overlapPoly,
                    aInterval: aRemove,
                    bInterval: bRemove,
                    aCross,
                    bCross,
                    aCrossRaw,
                    bCrossRaw
                });

                if (trim.debug?.overlaps) {
                    primitives.push({
                        type: 'polygon',
                        id: `${overlapId}__poly`,
                        kind: 'trim_overlap',
                        roadId: null,
                        segmentId: overlapId,
                        points: overlapPoly.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }
        }

        for (const seg of segments) {
            const rawIntervals = intervalsBySeg.get(seg.id) ?? [];
            const removed = mergeIntervals(rawIntervals);
            const hadTrim = removed.length > 0;
            const kept = hadTrim ? complementIntervals(removed) : [{ t0: 0, t1: 1 }];

            seg.trimRemoved = removed;
            seg.keptPieces = [];
            seg.droppedPieces = [];

            const makePiece = ({ t0, t1, index, dropped }) => {
                const length = seg.length * (t1 - t0);
                const start = { x: seg.aWorld.x + seg.dir.x * (seg.length * t0), z: seg.aWorld.z + seg.dir.z * (seg.length * t0) };
                const end = { x: seg.aWorld.x + seg.dir.x * (seg.length * t1), z: seg.aWorld.z + seg.dir.z * (seg.length * t1) };
                const corners = makeRectCorners(start, end, seg.right, seg.asphaltObb.halfWidthLeft, seg.asphaltObb.halfWidthRight);
                return {
                    id: `${seg.id}__${dropped ? 'drop' : 'keep'}_${index}`,
                    roadId: seg.roadId,
                    segmentId: seg.id,
                    index,
                    t0,
                    t1,
                    length,
                    aWorld: start,
                    bWorld: end,
                    corners,
                    aabb: computeAabb(corners)
                };
            };

            let keepIndex = 0;
            let dropIndex = 0;
            for (const it of kept) {
                const t0 = clamp01(it.t0);
                const t1 = clamp01(it.t1);
                if (!(t1 > t0 + 1e-9)) continue;
                const pieceLen = seg.length * (t1 - t0);
                if (hadTrim && pieceLen < snapStep - 1e-6) {
                    const piece = makePiece({ t0, t1, index: dropIndex++, dropped: true });
                    seg.droppedPieces.push(piece);
                    if (trim.debug?.droppedPieces) {
                        primitives.push({
                            type: 'polygon',
                            id: piece.id,
                            kind: 'trim_dropped_piece',
                            roadId: piece.roadId,
                            segmentId: piece.segmentId,
                            points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                        });
                    }
                    continue;
                }

                const piece = makePiece({ t0, t1, index: keepIndex++, dropped: false });
                seg.keptPieces.push(piece);
                primitives.push({
                    type: 'polygon',
                    id: piece.id,
                    kind: 'asphalt_piece',
                    roadId: piece.roadId,
                    segmentId: piece.segmentId,
                    points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                });

                if (trim.debug?.keptPieces) {
                    primitives.push({
                        type: 'polygon',
                        id: `${piece.id}__dbg`,
                        kind: 'trim_kept_piece',
                        roadId: piece.roadId,
                        segmentId: piece.segmentId,
                        points: piece.corners.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.rawSegments) {
                const corners = seg.asphaltObb?.corners ?? null;
                if (Array.isArray(corners) && corners.length === 4) {
                    primitives.push({
                        type: 'polygon',
                        id: `${seg.id}__raw_asphalt`,
                        kind: 'trim_raw_asphalt',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: corners.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.strips) {
                const strip = expandedById.get(seg.id);
                const pts = strip?.corners ?? null;
                if (Array.isArray(pts) && pts.length >= 3) {
                    primitives.push({
                        type: 'polygon',
                        id: `${seg.id}__strip`,
                        kind: 'trim_strip',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: pts.map((p) => ({ x: p.x, z: p.z }))
                    });
                }
            }

            if (trim.debug?.intervals) {
                for (let k = 0; k < removed.length; k++) {
                    const it = removed[k];
                    const start = { x: seg.aWorld.x + seg.dir.x * (seg.length * it.t0), z: seg.aWorld.z + seg.dir.z * (seg.length * it.t0) };
                    const end = { x: seg.aWorld.x + seg.dir.x * (seg.length * it.t1), z: seg.aWorld.z + seg.dir.z * (seg.length * it.t1) };
                    primitives.push({
                        type: 'polyline',
                        id: `${seg.id}__removed_${k}`,
                        kind: 'trim_removed_interval',
                        roadId: seg.roadId,
                        segmentId: seg.id,
                        points: [{ x: start.x, z: start.z }, { x: end.x, z: end.z }]
                    });
                }
            }
        }
    } else {
        for (const seg of segments) {
            seg.trimRemoved = [];
            seg.keptPieces = [];
            seg.droppedPieces = [];
            const corners = seg.asphaltObb?.corners ?? null;
            if (Array.isArray(corners) && corners.length === 4) {
                primitives.push({
                    type: 'polygon',
                    id: `${seg.id}__keep_0`,
                    kind: 'asphalt_piece',
                    roadId: seg.roadId,
                    segmentId: seg.id,
                    points: corners.map((p) => ({ x: p.x, z: p.z }))
                });
            }
        }
    }

    return {
        settings: resolvedSettings,
        roads: derivedRoads,
        segments,
        primitives,
        trim: trimOut
    };
}
