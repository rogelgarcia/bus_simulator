// src/app/road_decoration/traffic_controls/RoadTrafficControlPlacement.js
// Computes deterministic stop sign / traffic light placements from RoadEngine junction derived data.

const EPS = 1e-6;
const LANE_WIDTH_BASE = 4.8;
const TILE_SIZE_BASE = 24;
const CURB_THICKNESS_BASE = 0.48;
const SIDEWALK_WIDTH_BASE = 1.875;
const SIDEWALK_LIFT_BASE = 0.001;

export const ROAD_TRAFFIC_CONTROL = Object.freeze({
    TRAFFIC_LIGHT: 'traffic_light',
    STOP_SIGN: 'stop_sign'
});

function clampNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function clampInt(value, lo, hi) {
    const n = Math.trunc(Number(value) || 0);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

function dotXZ(a, b) {
    return (Number(a?.x) || 0) * (Number(b?.x) || 0) + (Number(a?.z) || 0) * (Number(b?.z) || 0);
}

function normalizeDirXZ(v) {
    const x = Number(v?.x) || 0;
    const z = Number(v?.z) || 0;
    const len = Math.hypot(x, z);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, z: z * inv };
}

function scaleXZ(v, s) {
    return { x: (Number(v?.x) || 0) * s, z: (Number(v?.z) || 0) * s };
}

function addXZ(a, b) {
    return { x: (Number(a?.x) || 0) + (Number(b?.x) || 0), z: (Number(a?.z) || 0) + (Number(b?.z) || 0) };
}

function subXZ(a, b) {
    return { x: (Number(a?.x) || 0) - (Number(b?.x) || 0), z: (Number(a?.z) || 0) - (Number(b?.z) || 0) };
}

function negateXZ(v) {
    return { x: -(Number(v?.x) || 0), z: -(Number(v?.z) || 0) };
}

function canonicalizeDirXZ(dir) {
    const n = normalizeDirXZ(dir);
    if (!n) return null;
    if (n.x < -EPS || (Math.abs(n.x) <= EPS && n.z < -EPS)) return negateXZ(n);
    return n;
}

function compareString(a, b) {
    const aa = String(a ?? '');
    const bb = String(b ?? '');
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
}

function computePoleAndStopInsets({ sidewalkWidth, tileSize } = {}) {
    const sw = Math.max(0, clampNumber(sidewalkWidth, SIDEWALK_WIDTH_BASE));
    const ts = Math.max(EPS, clampNumber(tileSize, TILE_SIZE_BASE));
    const poleInset = clamp(sw * 0.6, 0, ts * 0.25);
    const stopInsetBase = clamp(sw * 0.15, 0, ts * 0.18);
    const stopInset = clamp(poleInset + (poleInset - stopInsetBase) * 2.0, 0, ts * 0.35);
    return { poleInset, stopInset };
}

function isTJunctionByDirections(endpoints) {
    const list = Array.isArray(endpoints) ? endpoints : [];
    if (list.length !== 3) return null;

    let best = null;
    let bestDot = Infinity;
    for (let i = 0; i < list.length; i++) {
        const a = normalizeDirXZ(list[i]?.dirOut ?? null);
        if (!a) continue;
        for (let j = i + 1; j < list.length; j++) {
            const b = normalizeDirXZ(list[j]?.dirOut ?? null);
            if (!b) continue;
            const d = dotXZ(a, b);
            if (d < bestDot) {
                bestDot = d;
                best = { i, j };
            }
        }
    }

    if (!best || !(bestDot < -0.55)) return null;
    const stemIndex = [0, 1, 2].find((k) => k !== best.i && k !== best.j);
    return Number.isInteger(stemIndex) ? stemIndex : null;
}

function segmentTotalLanes(seg) {
    const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
    const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
    return lanesF + lanesB;
}

function endpointApproachHalfWidth(ep, seg, laneWidth) {
    const wr = Number(ep?.widthRight) || 0;
    const wl = Number(ep?.widthLeft) || 0;
    const fallback = laneWidth * segmentTotalLanes(seg) * 0.5;
    return Math.max(0, wr, wl, fallback);
}

function approachLaneCountForEndpoint(ep, seg) {
    const dirOut = normalizeDirXZ(ep?.dirOut ?? null);
    const segDir = normalizeDirXZ(seg?.dir ?? null);
    if (!dirOut || !segDir) return 0;

    const lanesF = clampInt(seg?.lanesF ?? 0, 0, 99);
    const lanesB = clampInt(seg?.lanesB ?? 0, 0, 99);
    const aligned = dotXZ(dirOut, segDir) >= 0;
    return aligned ? lanesB : lanesF;
}

function computeTrafficLightArmLength({ laneWidth, scale, sideOffset, lanesApproach } = {}) {
    const lw = Math.max(EPS, clampNumber(laneWidth, LANE_WIDTH_BASE));
    const s = Math.max(EPS, clampNumber(scale, 3));
    const offset = Math.max(0, clampNumber(sideOffset, 0));
    const lanes = clampInt(lanesApproach ?? 0, 0, 99);
    const laneCenterFromCenter = lanes > 0 ? lw * lanes * 0.5 : lw * 0.5;
    const desiredReachWorld = Math.max(0, offset - laneCenterFromCenter);
    const desired = desiredReachWorld / s;
    return clamp(desired, 0.8, 4.2);
}

function junctionCenterXZ(junction, endpoints) {
    if (junction?.center && Number.isFinite(junction.center.x) && Number.isFinite(junction.center.z)) {
        return { x: junction.center.x, z: junction.center.z };
    }
    const eps = Array.isArray(endpoints) ? endpoints : [];
    if (!eps.length) return { x: 0, z: 0 };
    let sx = 0;
    let sz = 0;
    let count = 0;
    for (const ep of eps) {
        const w = ep?.world ?? null;
        if (!w) continue;
        sx += Number(w.x) || 0;
        sz += Number(w.z) || 0;
        count += 1;
    }
    if (!count) return { x: 0, z: 0 };
    const inv = 1 / count;
    return { x: sx * inv, z: sz * inv };
}

function buildRoadIdSet(endpoints) {
    const set = new Set();
    for (const ep of Array.isArray(endpoints) ? endpoints : []) {
        const id = ep?.roadId ?? null;
        if (id) set.add(id);
    }
    return set;
}

function intersectSets(a, b) {
    const out = new Set();
    const aa = a instanceof Set ? a : new Set();
    const bb = b instanceof Set ? b : new Set();
    const [small, large] = aa.size <= bb.size ? [aa, bb] : [bb, aa];
    for (const v of small) if (large.has(v)) out.add(v);
    return out;
}

function computeTJunctionSignature(endpoints) {
    const list = Array.isArray(endpoints) ? endpoints : [];
    if (list.length !== 3) return null;
    const stemIndex = isTJunctionByDirections(list);
    if (stemIndex === null) return null;
    const stemDir = normalizeDirXZ(list[stemIndex]?.dirOut ?? null);
    if (!stemDir) return null;
    const through = [0, 1, 2].filter((i) => i !== stemIndex);
    const axisDir = canonicalizeDirXZ(list[through[0]]?.dirOut ?? null) ?? canonicalizeDirXZ(list[through[1]]?.dirOut ?? null);
    if (!axisDir) return null;
    return { stemIndex, throughIndices: through, axisDir, stemDir };
}

function buildSplitCrossingEndpoints(metaA, metaB, sharedRoadIds) {
    const shared = sharedRoadIds instanceof Set ? sharedRoadIds : new Set();
    const aSig = metaA?.sig ?? null;
    const bSig = metaB?.sig ?? null;
    const aEndpoints = metaA?.endpoints ?? [];
    const bEndpoints = metaB?.endpoints ?? [];
    if (!aSig || !bSig) return null;
    if (aEndpoints.length !== 3 || bEndpoints.length !== 3) return null;
    if (!shared.size) return null;

    const axisDir = aSig.axisDir;
    const axisCandidatesRaw = [
        aEndpoints[aSig.throughIndices[0]],
        aEndpoints[aSig.throughIndices[1]],
        bEndpoints[bSig.throughIndices[0]],
        bEndpoints[bSig.throughIndices[1]]
    ].filter(Boolean);

    const axisCandidates = [];
    const axisSeen = new Set();
    for (const ep of axisCandidatesRaw) {
        if (!ep?.id || axisSeen.has(ep.id)) continue;
        if (!shared.has(ep.roadId)) continue;
        axisSeen.add(ep.id);
        axisCandidates.push(ep);
    }
    if (axisCandidates.length < 2) return null;

    let pos = null;
    let neg = null;
    let posDot = -Infinity;
    let negDot = Infinity;
    for (const ep of axisCandidates) {
        const dir = normalizeDirXZ(ep?.dirOut ?? null);
        if (!dir) continue;
        const d = dotXZ(dir, axisDir);
        if (d > posDot + 1e-9 || (Math.abs(d - posDot) <= 1e-9 && compareString(ep.id, pos?.id) < 0)) {
            pos = ep;
            posDot = d;
        }
        if (d < negDot - 1e-9 || (Math.abs(d - negDot) <= 1e-9 && compareString(ep.id, neg?.id) < 0)) {
            neg = ep;
            negDot = d;
        }
    }
    if (!pos || !neg) return null;
    if (pos.id === neg.id) return null;
    if (!(posDot > 0.55) || !(negDot < -0.55)) return null;

    const stemA = aEndpoints[aSig.stemIndex] ?? null;
    const stemB = bEndpoints[bSig.stemIndex] ?? null;
    if (!stemA?.id || !stemB?.id) return null;
    if (stemA.id === stemB.id) return null;
    if (shared.has(stemA.roadId) || shared.has(stemB.roadId)) return null;

    const merged = [pos, neg, stemA, stemB];
    const unique = new Map();
    for (const ep of merged) {
        if (!ep?.id) return null;
        if (unique.has(ep.id)) return null;
        unique.set(ep.id, ep);
    }
    return Array.from(unique.values()).sort((a, b) => compareString(a?.id, b?.id));
}

export function computeRoadTrafficControlPlacementsFromRoadEngineDerived(derived, options = {}) {
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    if (!junctions.length || !segments.length) return [];

    const segmentById = new Map(segments.filter((s) => s?.id).map((s) => [s.id, s]));

    const laneWidth = Math.max(EPS, clampNumber(options?.laneWidth, LANE_WIDTH_BASE));
    const tileSize = Math.max(EPS, clampNumber(options?.tileSize, TILE_SIZE_BASE));
    const curbThickness = Math.max(0, clampNumber(options?.curbThickness, laneWidth * (CURB_THICKNESS_BASE / LANE_WIDTH_BASE)));
    const sidewalkWidth = Math.max(0, clampNumber(options?.sidewalkWidth, laneWidth * (SIDEWALK_WIDTH_BASE / LANE_WIDTH_BASE)));
    const sidewalkLift = Math.max(0, clampNumber(options?.sidewalkLift, laneWidth * (SIDEWALK_LIFT_BASE / LANE_WIDTH_BASE)));
    const asphaltY = clampNumber(options?.asphaltY, 0);
    const curbHeight = Math.max(0, clampNumber(options?.curbHeight, 0));
    const sidewalkY = asphaltY + curbHeight + sidewalkLift;

    const laneThreshold = clampInt(options?.trafficLightLaneThreshold ?? 3, 1, 99);
    const { poleInset, stopInset } = computePoleAndStopInsets({ sidewalkWidth, tileSize });
    const cornerAlong = clamp((poleInset + stopInset) * 0.5, 0, tileSize * 0.25);

    const placements = [];

    const sortedJunctions = junctions.slice().sort((a, b) => compareString(a?.id, b?.id));

    const mergeDistance = Math.max(tileSize * 0.6, laneWidth * 2.5);
    const overrideEndpointsByJunctionId = new Map();
    const suppressedJunctionIds = new Set();
    const tCandidates = [];

    for (const junction of sortedJunctions) {
        const jid = junction?.id ?? null;
        if (!jid) continue;
        const endpointsRaw = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        const endpoints = endpointsRaw.filter((ep) => ep?.dirOut && ep?.rightOut && ep?.world && ep?.segmentId);
        if (endpoints.length !== 3) continue;
        const sig = computeTJunctionSignature(endpoints);
        if (!sig) continue;
        tCandidates.push({
            id: jid,
            junction,
            endpoints,
            sig,
            center: junctionCenterXZ(junction, endpoints),
            roadIds: buildRoadIdSet(endpoints)
        });
    }

    for (let i = 0; i < tCandidates.length; i++) {
        const a = tCandidates[i];
        if (suppressedJunctionIds.has(a.id)) continue;
        if (overrideEndpointsByJunctionId.has(a.id)) continue;

        let best = null;
        for (let j = i + 1; j < tCandidates.length; j++) {
            const b = tCandidates[j];
            if (suppressedJunctionIds.has(b.id)) continue;
            if (overrideEndpointsByJunctionId.has(b.id)) continue;
            const dist = Math.hypot((a.center.x - b.center.x) || 0, (a.center.z - b.center.z) || 0);
            if (!(dist <= mergeDistance + 1e-6)) continue;

            const sharedRoadIds = intersectSets(a.roadIds, b.roadIds);
            if (!sharedRoadIds.size) continue;

            const axisDot = dotXZ(a.sig.axisDir, b.sig.axisDir);
            if (!(axisDot > 0.85)) continue;

            const stemDot = dotXZ(a.sig.stemDir, b.sig.stemDir);
            if (!(stemDot < -0.6)) continue;

            if (Math.abs(dotXZ(a.sig.stemDir, a.sig.axisDir)) > 0.45) continue;
            if (Math.abs(dotXZ(b.sig.stemDir, a.sig.axisDir)) > 0.45) continue;

            const mergedEndpoints = buildSplitCrossingEndpoints(a, b, sharedRoadIds);
            if (!mergedEndpoints) continue;

            if (!best || dist < best.dist - 1e-6 || (Math.abs(dist - best.dist) <= 1e-6 && compareString(b.id, best.b.id) < 0)) {
                best = { b, dist, mergedEndpoints };
            }
        }

        if (!best) continue;
        overrideEndpointsByJunctionId.set(a.id, best.mergedEndpoints);
        suppressedJunctionIds.add(best.b.id);
    }

    for (const junction of sortedJunctions) {
        const jid = junction?.id ?? null;
        if (!jid) continue;
        if (suppressedJunctionIds.has(jid)) continue;

        const overrideEndpoints = overrideEndpointsByJunctionId.get(jid) ?? null;
        const endpointsRaw = overrideEndpoints ?? (Array.isArray(junction?.endpoints) ? junction.endpoints : []);
        const endpoints = endpointsRaw.filter((ep) => ep?.dirOut && ep?.rightOut && ep?.world && ep?.segmentId);
        const degree = endpoints.length;
        if (degree < 3) continue;

        const endpointMeta = [];
        let hasLaneThreshold = false;

        for (const ep of endpoints) {
            const seg = segmentById.get(ep.segmentId) ?? null;
            if (!seg) continue;
            const totalLanes = segmentTotalLanes(seg);
            if (totalLanes >= laneThreshold) hasLaneThreshold = true;

            const lanesApproach = approachLaneCountForEndpoint(ep, seg);
            endpointMeta.push({
                ep,
                seg,
                totalLanes,
                lanesApproach
            });
        }

        if (endpointMeta.length < 3) continue;

        let mode = ROAD_TRAFFIC_CONTROL.STOP_SIGN;
        if (degree === 4 && hasLaneThreshold) mode = ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT;

        let stopSignEndpointIds = new Set();
        let trafficLightEndpointIds = new Set();

        if (mode === ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT) {
            for (const entry of endpointMeta) trafficLightEndpointIds.add(entry.ep.id);
        } else if (degree === 3) {
            const stemIndex = isTJunctionByDirections(endpoints);
            if (stemIndex === null) {
                for (const entry of endpointMeta) stopSignEndpointIds.add(entry.ep.id);
            } else {
                const stem = endpoints[stemIndex];
                if (stem?.id) stopSignEndpointIds.add(stem.id);
            }
        } else {
            for (const entry of endpointMeta) stopSignEndpointIds.add(entry.ep.id);
        }

        const emitStopSign = (entry) => {
            const ep = entry?.ep ?? null;
            const lanesApproach = clampInt(entry?.lanesApproach ?? 0, 0, 99);
            if (!ep?.id || lanesApproach <= 0) return;
            const dirOut = normalizeDirXZ(ep.dirOut);
            const rightOut = normalizeDirXZ(ep.rightOut);
            const world = ep?.world ?? null;
            if (!dirOut || !rightOut || !world) return;

            const side = rightOut;
            const approachHalfWidth = endpointApproachHalfWidth(ep, entry?.seg ?? null, laneWidth);
            const sideOffset = approachHalfWidth + curbThickness + poleInset;
            const posXZ = addXZ(addXZ(world, scaleXZ(dirOut, cornerAlong)), scaleXZ(side, sideOffset));

            placements.push({
                kind: ROAD_TRAFFIC_CONTROL.STOP_SIGN,
                junctionId: jid,
                corner: ep.id,
                approach: ep.segmentId,
                position: { x: posXZ.x, y: sidewalkY, z: posXZ.z },
                rotationY: Math.atan2(-dirOut.x, -dirOut.z),
                scale: 1.1
            });
        };

        const emitTrafficLight = (entry) => {
            const ep = entry?.ep ?? null;
            const lanesApproach = clampInt(entry?.lanesApproach ?? 0, 0, 99);
            if (!ep?.id || lanesApproach <= 0) return;
            const dirOut = normalizeDirXZ(ep.dirOut);
            const rightOut = normalizeDirXZ(ep.rightOut);
            const world = ep?.world ?? null;
            if (!dirOut || !rightOut || !world) return;

            const side = rightOut;
            const approachHalfWidth = endpointApproachHalfWidth(ep, entry?.seg ?? null, laneWidth);
            const sideOffset = approachHalfWidth + curbThickness + poleInset;
            const posXZ = addXZ(addXZ(world, scaleXZ(dirOut, cornerAlong)), scaleXZ(side, sideOffset));

            const targetArm = 4.0;
            const poleSideOffsetWorld = sideOffset + poleInset;
            const scale = clamp(poleSideOffsetWorld / targetArm, 2.4, 3.2);
            const armLength = computeTrafficLightArmLength({ laneWidth, scale, sideOffset, lanesApproach });

            placements.push({
                kind: ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT,
                junctionId: jid,
                corner: ep.id,
                approach: ep.segmentId,
                position: { x: posXZ.x, y: sidewalkY, z: posXZ.z },
                rotationY: Math.atan2(-dirOut.x, -dirOut.z),
                scale,
                armLength
            });
        };

        for (const entry of endpointMeta) {
            if (stopSignEndpointIds.has(entry.ep.id)) emitStopSign(entry);
            if (trafficLightEndpointIds.has(entry.ep.id)) emitTrafficLight(entry);
        }
    }

    placements.sort((a, b) => {
        const aj = a?.junctionId ?? '';
        const bj = b?.junctionId ?? '';
        if (aj < bj) return -1;
        if (aj > bj) return 1;
        const ak = a?.kind ?? '';
        const bk = b?.kind ?? '';
        if (ak < bk) return -1;
        if (ak > bk) return 1;
        return compareString(a?.corner, b?.corner);
    });

    return placements;
}

export function classifyRoadJunctionTrafficControlKind(junction, segmentsById, { trafficLightLaneThreshold = 3 } = {}) {
    const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
    if (endpoints.length < 3) return null;
    const threshold = clampInt(trafficLightLaneThreshold ?? 3, 1, 99);
    if (endpoints.length !== 4) return ROAD_TRAFFIC_CONTROL.STOP_SIGN;
    const segById = segmentsById instanceof Map ? segmentsById : new Map();
    for (const ep of endpoints) {
        const seg = segById.get(ep?.segmentId);
        const total = segmentTotalLanes(seg);
        if (total >= threshold) return ROAD_TRAFFIC_CONTROL.TRAFFIC_LIGHT;
    }
    return ROAD_TRAFFIC_CONTROL.STOP_SIGN;
}
