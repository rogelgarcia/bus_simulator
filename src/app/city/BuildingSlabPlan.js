// @ts-check
// Plans foundation slabs under buildings as a scalar-field region:
//
//   slab = { apron: within expandMeters of a footprint }
//        ∪ { bridges: elliptical necks between buildings whose slabs come
//            within slabBridgeRangeMeters of each other }
//        ∪ { corridors: points whose distance-to-footprint plus
//            distance-to-sidewalk is within reach — the space between a
//            facade and a sidewalk it faces }
//   minus the sidewalk region itself (the slab ends exactly on the sidewalk
//   outer boundary, curves included).
//
// The region outline is extracted with marching squares over the field, so
// merged slabs, curved sidewalk cuts, and pocket closures all come from one
// definition with no per-edge special cases. Slabs never merge with the
// sidewalk geometry; contour parts on the sidewalk boundary are vertical
// joints, everything else gets a bevel skirt.

const EPS = 1e-9;

export const BUILDING_SLAB_DEFAULTS = Object.freeze({
    expandMeters: 1.0,
    slabBridgeRangeMeters: 1.0,
    connectRangeMeters: 3.0,
    connectMaxReachMeters: 12.0,
    bevelRunMeters: 0.3,
    cellMeters: 0.25,
    stripSampleSpacingMeters: 0.4,
    simplifyToleranceMeters: 0.03,
    flushToleranceMeters: 0.06,
    minLoopAreaSqMeters: 0.75
});

export const SLAB_EDGE_MODE = Object.freeze({
    CONNECT: 'connect',
    BEVEL: 'bevel'
});

function toPoint(value) {
    return { x: Number(value?.x) || 0, z: Number(value?.z) || 0 };
}

export function signedAreaXZ(loop) {
    const pts = Array.isArray(loop) ? loop : [];
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        area += (Number(a?.x) || 0) * (Number(b?.z) || 0) - (Number(b?.x) || 0) * (Number(a?.z) || 0);
    }
    return area / 2;
}

// ---------------------------------------------------------------------------
// Segment helpers

function loopSegments(loop) {
    const pts = loop.map(toPoint);
    const closed = pts.length > 2;
    const out = [];
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
        out.push([pts[i], pts[(i + 1) % pts.length]]);
    }
    return out;
}

function pointSegmentDistance(px, pz, a, b) {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz;
    let t = lenSq > EPS ? ((px - a.x) * abx + (pz - a.z) * abz) / lenSq : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = px - (a.x + abx * t);
    const dz = pz - (a.z + abz * t);
    return Math.hypot(dx, dz);
}

function distanceToSegments(px, pz, segments, cap = Infinity) {
    let best = cap;
    for (const [a, b] of segments) {
        const d = pointSegmentDistance(px, pz, a, b);
        if (d < best) best = d;
    }
    return best;
}

function segmentSegmentDistance(a1, a2, b1, b2) {
    return Math.min(
        pointSegmentDistance(a1.x, a1.z, b1, b2),
        pointSegmentDistance(a2.x, a2.z, b1, b2),
        pointSegmentDistance(b1.x, b1.z, a1, a2),
        pointSegmentDistance(b2.x, b2.z, a1, a2)
    );
}

function loopsMinDistance(segsA, segsB) {
    let best = Infinity;
    for (const [a1, a2] of segsA) {
        for (const [b1, b2] of segsB) {
            const d = segmentSegmentDistance(a1, a2, b1, b2);
            if (d < best) best = d;
            if (best <= 0) return 0;
        }
    }
    return best;
}

function segmentsBounds(segments, pad = 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [a, b] of segments) {
        minX = Math.min(minX, a.x, b.x);
        maxX = Math.max(maxX, a.x, b.x);
        minZ = Math.min(minZ, a.z, b.z);
        maxZ = Math.max(maxZ, a.z, b.z);
    }
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function boundsOverlap(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
}

function filterSegmentsToBounds(segments, bounds) {
    const out = [];
    for (const seg of segments) {
        const [a, b] = seg;
        if (Math.max(a.x, b.x) < bounds.minX || Math.min(a.x, b.x) > bounds.maxX) continue;
        if (Math.max(a.z, b.z) < bounds.minZ || Math.min(a.z, b.z) > bounds.maxZ) continue;
        out.push(seg);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Marching squares

function interp(pA, pB, fA, fB) {
    const t = Math.abs(fB - fA) > EPS ? fA / (fA - fB) : 0.5;
    return { x: pA.x + (pB.x - pA.x) * t, z: pA.z + (pB.z - pA.z) * t };
}

/**
 * Extracts iso-contour loops of F = 0 (region: F <= 0) from a grid of field
 * values, with linear interpolation. Returns CCW loops (region interior on
 * the left); clockwise loops (holes) are dropped.
 */
function marchingSquaresLoops({ nx, nz, originX, originZ, cell, values }) {
    const val = (i, j) => values[i * nz + j];
    const nodePos = (i, j) => ({ x: originX + i * cell, z: originZ + j * cell });
    const key = (p) => `${Math.round(p.x * 5000)}|${Math.round(p.z * 5000)}`;

    const edges = new Map();
    const addSeg = (from, to) => {
        if (Math.abs(from.x - to.x) < 1e-7 && Math.abs(from.z - to.z) < 1e-7) return;
        const k = key(from);
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push({ from, to });
    };

    for (let i = 0; i < nx - 1; i++) {
        for (let j = 0; j < nz - 1; j++) {
            const f00 = val(i, j);
            const f10 = val(i + 1, j);
            const f11 = val(i + 1, j + 1);
            const f01 = val(i, j + 1);
            const p00 = nodePos(i, j);
            const p10 = nodePos(i + 1, j);
            const p11 = nodePos(i + 1, j + 1);
            const p01 = nodePos(i, j + 1);

            let caseIndex = 0;
            if (f00 <= 0) caseIndex |= 1;
            if (f10 <= 0) caseIndex |= 2;
            if (f11 <= 0) caseIndex |= 4;
            if (f01 <= 0) caseIndex |= 8;
            if (caseIndex === 0 || caseIndex === 15) continue;

            const eB = () => interp(p00, p10, f00, f10);
            const eR = () => interp(p10, p11, f10, f11);
            const eT = () => interp(p01, p11, f01, f11);
            const eL = () => interp(p00, p01, f00, f01);

            // Segments oriented with the inside (F <= 0) on the LEFT.
            switch (caseIndex) {
                case 1: addSeg(eL(), eB()); break;
                case 2: addSeg(eB(), eR()); break;
                case 3: addSeg(eL(), eR()); break;
                case 4: addSeg(eR(), eT()); break;
                case 6: addSeg(eB(), eT()); break;
                case 7: addSeg(eL(), eT()); break;
                case 8: addSeg(eT(), eL()); break;
                case 9: addSeg(eT(), eB()); break;
                case 11: addSeg(eT(), eR()); break;
                case 12: addSeg(eR(), eL()); break;
                case 13: addSeg(eR(), eB()); break;
                case 14: addSeg(eB(), eL()); break;
                case 5: {
                    const center = (f00 + f10 + f11 + f01) / 4;
                    if (center <= 0) {
                        addSeg(eL(), eT());
                        addSeg(eR(), eB());
                    } else {
                        addSeg(eL(), eB());
                        addSeg(eR(), eT());
                    }
                    break;
                }
                case 10: {
                    const center = (f00 + f10 + f11 + f01) / 4;
                    if (center <= 0) {
                        addSeg(eT(), eR());
                        addSeg(eB(), eL());
                    } else {
                        addSeg(eT(), eL());
                        addSeg(eB(), eR());
                    }
                    break;
                }
                default: break;
            }
        }
    }

    const takeEdge = (fromKey, edge) => {
        const bucket = edges.get(fromKey);
        if (!bucket) return;
        const idx = bucket.indexOf(edge);
        if (idx >= 0) bucket.splice(idx, 1);
        if (!bucket.length) edges.delete(fromKey);
    };

    // At junction points (saddles, interp points landing on nodes) pick the
    // leftmost outgoing edge relative to the incoming direction, so loops
    // stay tight and never jump between contours.
    const pickNext = (arriveDirX, arriveDirZ, candidates) => {
        if (candidates.length === 1) return candidates[0];
        let best = candidates[0];
        let bestAngle = -Infinity;
        for (const c of candidates) {
            const vx = c.to.x - c.from.x;
            const vz = c.to.z - c.from.z;
            const angle = Math.atan2(
                arriveDirX * vz - arriveDirZ * vx,
                arriveDirX * vx + arriveDirZ * vz
            );
            if (angle > bestAngle) {
                bestAngle = angle;
                best = c;
            }
        }
        return best;
    };

    const loops = [];
    while (edges.size) {
        const firstKey = edges.keys().next().value;
        const start = edges.get(firstKey)[0];
        const startKey = key(start.from);
        const loop = [start.from];
        takeEdge(startKey, start);
        let current = start;
        for (let guard = 0; guard < 500000; guard++) {
            const toKey = key(current.to);
            if (toKey === startKey) break;
            const outs = edges.get(toKey);
            if (!outs || !outs.length) break;
            loop.push(current.to);
            const next = pickNext(
                current.to.x - current.from.x,
                current.to.z - current.from.z,
                outs
            );
            takeEdge(toKey, next);
            current = next;
        }
        if (loop.length >= 3) loops.push(loop);
    }
    // Outer region loops come out clockwise under this convention (holes
    // counter-clockwise): keep the outers, reversed into CCW.
    return loops.filter((l) => signedAreaXZ(l) < 0).map((l) => l.slice().reverse());
}

function simplifyLoop(loop, tolerance) {
    // Stack-based chord simplification: each point is tested against the
    // chord of its SURVIVING neighbors, so deviation accumulates and arcs
    // keep their shape while collinear runs collapse.
    const out = [];
    for (const p of loop) {
        out.push(p);
        while (out.length >= 3) {
            const a = out[out.length - 3];
            const c = out[out.length - 2];
            const b = out[out.length - 1];
            if (pointSegmentDistance(c.x, c.z, a, b) <= tolerance) {
                out.splice(out.length - 2, 1);
            } else {
                break;
            }
        }
    }

    // Seam cleanup where the loop wraps around.
    let guard = 0;
    while (out.length >= 4 && guard++ < 1000) {
        let n = out.length;
        if (pointSegmentDistance(out[n - 1].x, out[n - 1].z, out[n - 2], out[0]) <= tolerance) {
            out.pop();
            continue;
        }
        n = out.length;
        if (pointSegmentDistance(out[0].x, out[0].z, out[n - 1], out[1]) <= tolerance) {
            out.shift();
            continue;
        }
        break;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Sidewalk scanline (inside test)

function buildSidewalkRowCrossings(sidewalkSegments, z) {
    const xs = [];
    for (const [a, b] of sidewalkSegments) {
        const z1 = a.z;
        const z2 = b.z;
        if ((z1 <= z && z2 > z) || (z2 <= z && z1 > z)) {
            const t = (z - z1) / (z2 - z1);
            xs.push(a.x + (b.x - a.x) * t);
        }
    }
    xs.sort((p, q) => p - q);
    return xs;
}

function insideFromCrossings(crossings, x) {
    let lo = 0;
    let hi = crossings.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (crossings[mid] < x) lo = mid + 1;
        else hi = mid;
    }
    return (lo & 1) === 1;
}

// ---------------------------------------------------------------------------
// Connect strips (slab-to-sidewalk)

function ensureCcwLoop(loop) {
    return signedAreaXZ(loop) >= 0 ? loop : loop.slice().reverse();
}

function rayForwardCrossing(originX, originZ, dirX, dirZ, segments, sMax) {
    let best = null;
    for (const [a, b] of segments) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const cross = dirX * dz - dirZ * dx;
        if (Math.abs(cross) < 1e-9) continue;
        const wx = a.x - originX;
        const wz = a.z - originZ;
        const s = (wx * dz - wz * dx) / cross;
        const u = (dirZ * wx - dirX * wz) / cross;
        if (u < -1e-6 || u > 1 + 1e-6) continue;
        if (s < -0.25 || s > sMax) continue;
        if (best === null || s < best) best = s;
    }
    return best;
}

/**
 * Builds rectangular connect strips from footprint facades toward sidewalks:
 * perpendicular rays sample each facade, and when any part of the facade has
 * the sidewalk within reach, the whole facade extends. Strip sides are
 * straight (the facade's perpendicular ends); its front overshoots slightly
 * and is trimmed exactly on the sidewalk boundary by the field clip, so a
 * slab meets a sidewalk only flush or with straight cuts, never a blend.
 */
function buildConnectStrips(loop, swSegments, { expand, connectRange, maxReach, spacing }) {
    const strips = [];
    if (!swSegments.length) return strips;
    const pts = ensureCcwLoop(loop);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.4) continue;
        const nxDir = dz / len;
        const nzDir = -dx / len;

        const count = Math.max(2, Math.min(96, Math.ceil(len / spacing) + 1));
        const outers = new Array(count);
        let anyInRange = false;
        for (let s = 0; s < count; s++) {
            const t = s / (count - 1);
            const ox = a.x + dx * t;
            const oz = a.z + dz * t;
            const hit = rayForwardCrossing(ox, oz, nxDir, nzDir, swSegments, maxReach);
            if (hit !== null && hit <= expand + connectRange + 1e-6) anyInRange = true;
            outers[s] = hit !== null ? Math.min(hit + 0.3, maxReach) : expand;
        }
        if (!anyInRange) continue;

        const polygon = [
            { x: a.x, z: a.z },
            { x: b.x, z: b.z }
        ];
        for (let s = count - 1; s >= 0; s--) {
            const t = s / (count - 1);
            polygon.push({
                x: a.x + dx * t + nxDir * outers[s],
                z: a.z + dz * t + nzDir * outers[s]
            });
        }
        strips.push({ pts: polygon, segs: loopSegments(polygon) });
    }
    return strips;
}

function polygonSignedDistance(x, z, polygon) {
    let inside = false;
    const pts = polygon.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p = pts[i];
        const q = pts[j];
        if ((p.z > z) !== (q.z > z)
            && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) {
            inside = !inside;
        }
    }
    const d = distanceToSegments(x, z, polygon.segs);
    return inside ? -d : d;
}

// ---------------------------------------------------------------------------
// Planning

/**
 * Plans all building slabs at once.
 *
 * @param {object} input
 * @param {{x:number,z:number}[][]} input.footprintLoops one outer loop per building
 * @param {{x:number,z:number}[][]} [input.sidewalkBoundaries] sidewalk outer boundary loops
 * @param {number} [input.expandMeters]
 * @param {number} [input.slabBridgeRangeMeters]
 * @param {number} [input.connectRangeMeters]
 * @param {number} [input.bevelRunMeters]
 * @param {number} [input.cellMeters]
 * @returns {{top:{x:number,z:number}[], foot:{x:number,z:number}[], edgeModes:string[]}[]}
 */
export function planBuildingSlabs({
    footprintLoops,
    sidewalkBoundaries = [],
    expandMeters = BUILDING_SLAB_DEFAULTS.expandMeters,
    slabBridgeRangeMeters = BUILDING_SLAB_DEFAULTS.slabBridgeRangeMeters,
    connectRangeMeters = BUILDING_SLAB_DEFAULTS.connectRangeMeters,
    bevelRunMeters = BUILDING_SLAB_DEFAULTS.bevelRunMeters,
    cellMeters = BUILDING_SLAB_DEFAULTS.cellMeters
} = {}) {
    const loops = (Array.isArray(footprintLoops) ? footprintLoops : [])
        .filter((l) => Array.isArray(l) && l.length >= 3)
        .map((l) => l.map(toPoint));
    if (!loops.length) return [];

    const expand = Math.max(0.1, Number(expandMeters) || 1);
    const bridgeRange = Math.max(0, Number(slabBridgeRangeMeters) || 0);
    const connectRange = Math.max(0, Number(connectRangeMeters) || 0);
    const maxReach = Math.max(connectRange, BUILDING_SLAB_DEFAULTS.connectMaxReachMeters);
    const bevelRun = Math.max(0, Number(bevelRunMeters) || 0);
    const cell = Math.max(0.1, Number(cellMeters) || 0.25);
    const stripSpacing = BUILDING_SLAB_DEFAULTS.stripSampleSpacingMeters;

    const fpSegments = loops.map(loopSegments);
    const fpBounds = fpSegments.map((segs) => segmentsBounds(segs));
    const sidewalkSegments = [];
    for (const bl of Array.isArray(sidewalkBoundaries) ? sidewalkBoundaries : []) {
        if (Array.isArray(bl) && bl.length >= 2) sidewalkSegments.push(...loopSegments(bl));
    }

    // Cluster buildings whose slabs can interact (bridge reach), so each
    // cluster gets one field grid and merged slabs come out as one contour.
    const n = loops.length;
    const clusterGap = expand * 2 + bridgeRange + 0.4;
    const parent = loops.map((_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const padded = {
                minX: fpBounds[i].minX - clusterGap,
                maxX: fpBounds[i].maxX + clusterGap,
                minZ: fpBounds[i].minZ - clusterGap,
                maxZ: fpBounds[i].maxZ + clusterGap
            };
            if (!boundsOverlap(padded, fpBounds[j])) continue;
            if (loopsMinDistance(fpSegments[i], fpSegments[j]) <= clusterGap) {
                const ri = find(i);
                const rj = find(j);
                if (ri !== rj) parent[rj] = ri;
            }
        }
    }
    const clusters = new Map();
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(i);
    }

    const plans = [];
    for (const members of clusters.values()) {
        const memberSegs = members.map((i) => fpSegments[i]);
        const allSegs = memberSegs.flat();

        const swNear = filterSegmentsToBounds(
            sidewalkSegments,
            segmentsBounds(allSegs, maxReach + bevelRun + 4)
        );

        // Connect strips: straight-sided facade extensions toward sidewalks.
        const strips = [];
        for (const i of members) {
            strips.push(...buildConnectStrips(loops[i], swNear, {
                expand,
                connectRange,
                maxReach,
                spacing: stripSpacing
            }));
        }

        // Bridge pairs: buildings whose footprints come within
        // 2*expand + bridgeRange of each other get an elliptical neck
        // (curved blends are reserved for slab-to-slab connections).
        const bridgePairs = [];
        for (let a = 0; a < members.length; a++) {
            for (let b = a + 1; b < members.length; b++) {
                const gap = loopsMinDistance(memberSegs[a], memberSegs[b]);
                if (gap <= expand * 2 + bridgeRange + EPS) {
                    bridgePairs.push({ a, b, sum: gap + expand * 2 + bridgeRange * 0.5 });
                }
            }
        }

        // Grid bounds cover the aprons and every strip.
        let bounds = segmentsBounds(allSegs, expand + bevelRun + cell * 3);
        for (const strip of strips) {
            const sb = segmentsBounds(strip.segs, bevelRun + cell * 3);
            bounds = {
                minX: Math.min(bounds.minX, sb.minX),
                maxX: Math.max(bounds.maxX, sb.maxX),
                minZ: Math.min(bounds.minZ, sb.minZ),
                maxZ: Math.max(bounds.maxZ, sb.maxZ)
            };
        }

        const nx = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / cell) + 1);
        const nz = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 1);
        const values = new Float64Array(nx * nz);
        const dSwAbsArr = new Float64Array(nx * nz);
        const insideSwArr = new Uint8Array(nx * nz);
        const memberDist = new Float64Array(members.length);
        const distCap = maxReach + bevelRun + 6;

        for (let j = 0; j < nz; j++) {
            const z = bounds.minZ + j * cell;
            const crossings = buildSidewalkRowCrossings(sidewalkSegments, z);
            for (let i = 0; i < nx; i++) {
                const x = bounds.minX + i * cell;
                const k = i * nz + j;

                let dFp = Infinity;
                for (let m = 0; m < members.length; m++) {
                    const d = distanceToSegments(x, z, memberSegs[m], distCap);
                    memberDist[m] = d;
                    if (d < dFp) dFp = d;
                }

                const dSwAbs = swNear.length ? distanceToSegments(x, z, swNear, distCap) : distCap;
                const insideSidewalk = sidewalkSegments.length ? insideFromCrossings(crossings, x) : false;
                dSwAbsArr[k] = dSwAbs;
                insideSwArr[k] = insideSidewalk ? 1 : 0;
                const dSw = insideSidewalk ? -dSwAbs : dSwAbs;

                // Region terms (negative = inside the slab region).
                let f = dFp - expand;
                for (const strip of strips) {
                    if (f <= -0.5) break;
                    const sf = polygonSignedDistance(x, z, strip);
                    if (sf < f) f = sf;
                }
                for (const pair of bridgePairs) {
                    const bf = memberDist[pair.a] + memberDist[pair.b] - pair.sum;
                    if (bf < f) f = bf;
                }
                // Never into the sidewalk: clip at its boundary.
                if (-dSw > f) f = -dSw;

                values[i * nz + j] = f;
            }
        }

        // Hole filling: any grass pocket fully enclosed by slab and sidewalk
        // becomes slab. Outside nodes flood in from the grid border; what
        // they cannot reach is enclosed.
        {
            const visited = new Uint8Array(nx * nz);
            const queue = [];
            const push = (i, j) => {
                const k = i * nz + j;
                if (visited[k]) return;
                if (!(values[k] > 0) || insideSwArr[k]) return;
                visited[k] = 1;
                queue.push(k);
            };
            for (let i = 0; i < nx; i++) {
                push(i, 0);
                push(i, nz - 1);
            }
            for (let j = 0; j < nz; j++) {
                push(0, j);
                push(nx - 1, j);
            }
            while (queue.length) {
                const k = queue.pop();
                const i = Math.floor(k / nz);
                const j = k - i * nz;
                if (i > 0) push(i - 1, j);
                if (i < nx - 1) push(i + 1, j);
                if (j > 0) push(i, j - 1);
                if (j < nz - 1) push(i, j + 1);
            }
            for (let k = 0; k < values.length; k++) {
                if (values[k] > 0 && !insideSwArr[k] && !visited[k]) {
                    // Filled pockets keep the sidewalk-distance profile so the
                    // contour still lands exactly on the sidewalk boundary.
                    values[k] = -Math.min(Math.max(dSwAbsArr[k], 0.05), 2);
                }
            }
        }

        const rawLoops = marchingSquaresLoops({
            nx,
            nz,
            originX: bounds.minX,
            originZ: bounds.minZ,
            cell,
            values
        });

        for (const raw of rawLoops) {
            if (Math.abs(signedAreaXZ(raw)) < BUILDING_SLAB_DEFAULTS.minLoopAreaSqMeters) continue;
            const outline = simplifyLoop(raw, BUILDING_SLAB_DEFAULTS.simplifyToleranceMeters);
            if (outline.length < 3) continue;

            const count = outline.length;
            const top = outline;
            const foot = new Array(count);
            const edgeModes = new Array(count);
            const flushTol = BUILDING_SLAB_DEFAULTS.flushToleranceMeters;

            const pointFlush = new Array(count);
            for (let i = 0; i < count; i++) {
                const p = top[i];
                const d = swNear.length ? distanceToSegments(p.x, p.z, swNear, flushTol * 4) : Infinity;
                pointFlush[i] = d <= flushTol;
            }

            for (let i = 0; i < count; i++) {
                const p = top[i];
                const prev = top[(i - 1 + count) % count];
                const next = top[(i + 1) % count];
                const isFlush = pointFlush[i]
                    && (pointFlush[(i + 1) % count] || pointFlush[(i - 1 + count) % count]);
                if (isFlush) {
                    foot[i] = { x: p.x, z: p.z };
                } else {
                    const dx = next.x - prev.x;
                    const dz = next.z - prev.z;
                    const len = Math.hypot(dx, dz);
                    // Outward normal for CCW loops in XZ: (dz, -dx).
                    const ox = len > EPS ? dz / len : 0;
                    const oz = len > EPS ? -dx / len : 0;
                    foot[i] = { x: p.x + ox * bevelRun, z: p.z + oz * bevelRun };
                }
                edgeModes[i] = pointFlush[i] && pointFlush[(i + 1) % count]
                    ? SLAB_EDGE_MODE.CONNECT
                    : SLAB_EDGE_MODE.BEVEL;
            }

            plans.push({ top, foot, edgeModes });
        }
    }
    return plans;
}
