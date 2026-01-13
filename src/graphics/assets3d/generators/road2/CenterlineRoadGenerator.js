// src/graphics/assets3d/generators/road2/CenterlineRoadGenerator.js
// Generates road meshes from a RoadNetwork centerline graph (no tile-derived geometry).

import * as THREE from 'three';
import { ROAD_DEFAULTS } from '../GeneratorParams.js';
import { deepMerge } from '../road/math/RoadMath.js';
import { createAsphaltBuilder } from '../road/builders/AsphaltBuilder.js';
import { computeEdgeFilletArcXZ, sampleArcXZ } from '../../../../app/geometry/RoadEdgeFillet.js';

const EPS = 1e-9;
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function normalizeDirXZ(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: dx * inv, z: dz * inv, length: len };
}

function dotXZ(a, b) {
    return a.x * b.x + a.z * b.z;
}

function crossXZ(a, b) {
    return a.x * b.z - a.z * b.x;
}

function leftNormal(dir) {
    return { x: -dir.z, z: dir.x };
}

function rightNormal(dir) {
    return { x: dir.z, z: -dir.x };
}

function lineIntersectionXZ(p1, d1, p2, d2) {
    const denom = crossXZ(d1, d2);
    if (Math.abs(denom) <= EPS) return null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const t = (dx * d2.z - dz * d2.x) / denom;
    return { x: p1.x + d1.x * t, z: p1.z + d1.z * t };
}

function polygonSignedAreaXZ(points) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        area += a.x * b.z - b.x * a.z;
    }
    return area * 0.5;
}

function offsetConvexPolygonXZ(points, offset) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 3) return null;
    if (!Number.isFinite(offset)) return null;
    if (Math.abs(offset) <= EPS) return pts.slice();

    const ccw = polygonSignedAreaXZ(pts) >= 0;
    const lines = [];
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (!(len > EPS)) return null;
        const inv = 1 / len;
        const dir = { x: dx * inv, z: dz * inv };
        const outward = ccw ? { x: dir.z, z: -dir.x } : { x: -dir.z, z: dir.x };
        lines.push({
            p: { x: a.x + outward.x * offset, z: a.z + outward.z * offset },
            d: dir
        });
    }

    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = lines[(i - 1 + n) % n];
        const cur = lines[i];
        const hit = lineIntersectionXZ(prev.p, prev.d, cur.p, cur.d);
        out.push(hit ?? cur.p);
    }
    return out;
}

function orientXZ(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegmentXZ(a, b, p) {
    const minX = Math.min(a.x, b.x) - 1e-9;
    const maxX = Math.max(a.x, b.x) + 1e-9;
    const minZ = Math.min(a.z, b.z) - 1e-9;
    const maxZ = Math.max(a.z, b.z) + 1e-9;
    return p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
}

function onSegmentXZEps(a, b, p, eps = 1e-9) {
    const minX = Math.min(a.x, b.x) - eps;
    const maxX = Math.max(a.x, b.x) + eps;
    const minZ = Math.min(a.z, b.z) - eps;
    const maxZ = Math.max(a.z, b.z) + eps;
    return p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
}

function segmentsIntersectXZ(a0, a1, b0, b1) {
    const o1 = orientXZ(a0, a1, b0);
    const o2 = orientXZ(a0, a1, b1);
    const o3 = orientXZ(b0, b1, a0);
    const o4 = orientXZ(b0, b1, a1);

    const eps = 1e-9;
    const s1 = Math.abs(o1) <= eps ? 0 : (o1 > 0 ? 1 : -1);
    const s2 = Math.abs(o2) <= eps ? 0 : (o2 > 0 ? 1 : -1);
    const s3 = Math.abs(o3) <= eps ? 0 : (o3 > 0 ? 1 : -1);
    const s4 = Math.abs(o4) <= eps ? 0 : (o4 > 0 ? 1 : -1);

    if (s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0) {
        return (s1 !== s2) && (s3 !== s4);
    }

    if (s1 === 0 && onSegmentXZ(a0, a1, b0)) return true;
    if (s2 === 0 && onSegmentXZ(a0, a1, b1)) return true;
    if (s3 === 0 && onSegmentXZ(b0, b1, a0)) return true;
    if (s4 === 0 && onSegmentXZ(b0, b1, a1)) return true;
    return false;
}

function pointInPolygonStrictXZ(p, poly, eps = 1e-9) {
    const list = Array.isArray(poly) ? poly : [];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || list.length < 3) return false;

    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const b = list[(i + 1) % list.length];
        if (Math.abs(orientXZ(a, b, p)) <= eps && onSegmentXZEps(a, b, p, eps)) return false;
    }

    let inside = false;
    for (let i = 0, j = list.length - 1; i < list.length; j = i++) {
        const a = list[i];
        const b = list[j];
        const zi = a.z;
        const zj = b.z;
        const intersects = ((zi > p.z) !== (zj > p.z))
            && (p.x < (b.x - a.x) * (p.z - zi) / (zj - zi + 0.0) + a.x);
        if (intersects) inside = !inside;
    }
    return inside;
}

function isSimplePolygonXZ(points) {
    const pts = Array.isArray(points) ? points : [];
    const n = pts.length;
    if (n < 3) return false;
    for (let i = 0; i < n; i++) {
        const a0 = pts[i];
        const a1 = pts[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
            const b0 = pts[j];
            const b1 = pts[(j + 1) % n];
            const adjacent = (i === j) || ((i + 1) % n === j) || (i === (j + 1) % n);
            if (adjacent) continue;
            if (segmentsIntersectXZ(a0, a1, b0, b1)) return false;
        }
    }
    return true;
}

function distanceXZ(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.hypot(dx, dz);
}

function requiredCutbackForJoin({ dirA, dirB, halfA, halfB }) {
    const ha = Number.isFinite(halfA) ? Math.max(0, halfA) : 0;
    const hb = Number.isFinite(halfB) ? Math.max(0, halfB) : 0;
    if (!(ha > EPS) || !(hb > EPS)) return 0;

    const nA = leftNormal(dirA);
    const nB = leftNormal(dirB);
    const denom = crossXZ(nA, nB);
    if (Math.abs(denom) <= EPS) return 0;

    const v = { x: dirB.x - dirA.x, z: dirB.z - dirA.z };
    const kT = crossXZ(v, nB) / denom;
    const kU = crossXZ(v, nA) / denom;
    const cA = Math.abs(kT) > EPS ? (ha / Math.abs(kT)) : Infinity;
    const cB = Math.abs(kU) > EPS ? (hb / Math.abs(kU)) : Infinity;
    const c = Math.min(cA, cB);
    if (!Number.isFinite(c) || c <= 0) return 0;
    return c;
}

function safeMiterVertex({ nodePos, aPoint, aDir, bPoint, bDir, aHalf, bHalf }) {
    const maxHalf = Math.max(aHalf ?? 0, bHalf ?? 0);
    const minLimit = Math.max(0.5, maxHalf * 6);
    const maxLimit = Math.max(minLimit, maxHalf * 18);

    const hit = lineIntersectionXZ(aPoint, aDir, bPoint, bDir);
    if (hit && Number.isFinite(hit.x) && Number.isFinite(hit.z)) {
        const d = distanceXZ(hit, nodePos);
        if (d <= maxLimit) return hit;
    }

    const mid = { x: (aPoint.x + bPoint.x) * 0.5, z: (aPoint.z + bPoint.z) * 0.5 };
    const dMid = distanceXZ(mid, nodePos);
    if (dMid >= minLimit) return mid;

    const dA = distanceXZ(aPoint, nodePos);
    const dB = distanceXZ(bPoint, nodePos);
    return dA >= dB ? aPoint : bPoint;
}

function edgeDirectionAngle(dir) {
    return wrapAngle(Math.atan2(dir.z, dir.x));
}

function assignPolygonBoundaries({ nodeId, nodePos, incident, verts, boundaryByNodeEdge, nodeEdgeKey }) {
    for (const entry of incident) {
        const dir = entry?.dir ?? null;
        if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.z)) continue;
        const normal = entry?.normal ?? leftNormal(dir);
        const projections = verts.map((p) => (p.x - nodePos.x) * dir.x + (p.z - nodePos.z) * dir.z);
        const best = projections.reduce((m, v) => Math.max(m, v), -Infinity);
        const eps = 1e-3;
        let candidates = [];
        for (let i = 0; i < verts.length; i++) {
            if (projections[i] >= best - eps) candidates.push(verts[i]);
        }
        if (candidates.length < 2) {
            const ranked = verts.map((p, i) => ({ p, v: projections[i] })).sort((a, b) => b.v - a.v);
            candidates = ranked.slice(0, 2).map((r) => r.p);
        }
        if (candidates.length < 2) continue;
        const a = candidates[0];
        const b = candidates[1];
        const da = (a.x - nodePos.x) * normal.x + (a.z - nodePos.z) * normal.z;
        const db = (b.x - nodePos.x) * normal.x + (b.z - nodePos.z) * normal.z;
        const left = da >= db ? a : b;
        const right = da >= db ? b : a;
        boundaryByNodeEdge.set(nodeEdgeKey(nodeId, entry.edgeId), { left, right });
    }
}

function wrapAngle(angle) {
    let a = angle % TAU;
    if (a < 0) a += TAU;
    return a;
}

function angleDeltaCCW(from, to) {
    return wrapAngle(to - from);
}

function roadWidthFromLanes({ lanesF, lanesB, laneWidth, shoulder }) {
    const f = Number.isFinite(lanesF) ? lanesF : 0;
    const b = Number.isFinite(lanesB) ? lanesB : 0;
    const total = f + b;
    if (!(total > 0)) return 0;
    const lw = Number.isFinite(laneWidth) ? laneWidth : ROAD_DEFAULTS.laneWidth;
    const sh = Number.isFinite(shoulder) ? shoulder : ROAD_DEFAULTS.shoulder;
    return Math.max(lw, total * lw + sh * 2);
}

function computeCornerFillet({ nodePos, dirA, dirB, rMax, lenA, lenB }) {
    const dot = clamp(dotXZ(dirA, dirB), -1, 1);
    const angle = Math.acos(dot);
    if (!(angle > 1e-3) || Math.abs(Math.PI - angle) <= 1e-3) return null;

    const tanHalf = Math.tan(angle * 0.5);
    if (!(tanHalf > EPS)) return null;

    const maxT = Math.max(0, Math.min(lenA, lenB));
    if (!(maxT > EPS)) return null;

    const maxRByLen = (maxT * 0.9) / tanHalf;
    const r = Math.max(0, Math.min(rMax, maxRByLen));
    if (!(r > EPS)) return null;

    const t = r * tanHalf;
    if (!(t > EPS)) return null;

    const bisectorRaw = { x: dirA.x + dirB.x, z: dirA.z + dirB.z };
    const bisectorLen = Math.hypot(bisectorRaw.x, bisectorRaw.z);
    if (!(bisectorLen > EPS)) return null;
    const bisector = { x: bisectorRaw.x / bisectorLen, z: bisectorRaw.z / bisectorLen };

    const sinHalf = Math.sin(angle * 0.5);
    if (!(sinHalf > EPS)) return null;
    const h = r / sinHalf;

    const center = {
        x: nodePos.x + bisector.x * h,
        z: nodePos.z + bisector.z * h
    };

    const tA = { x: nodePos.x + dirA.x * t, z: nodePos.z + dirA.z * t };
    const tB = { x: nodePos.x + dirB.x * t, z: nodePos.z + dirB.z * t };

    const a0 = Math.atan2(tA.z - center.z, tA.x - center.x);
    const a1 = Math.atan2(tB.z - center.z, tB.x - center.x);
    const deltaCCW = angleDeltaCCW(a0, a1);
    const useCCW = deltaCCW <= Math.PI;
    const startAng = useCCW ? a0 : a1;
    const spanAng = useCCW ? deltaCCW : TAU - deltaCCW;

    return { center, radius: r, startAng, spanAng, tangentA: tA, tangentB: tB, angle };
}

export function generateRoadsFromRoadNetwork({ network, config, materials } = {}) {
    const group = new THREE.Group();
    group.name = 'Roads';

    const roadCfg = deepMerge(ROAD_DEFAULTS, config?.road ?? {});
    const roadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : ROAD_DEFAULTS.surfaceY;
    const laneWidth = Number.isFinite(roadCfg.laneWidth) ? roadCfg.laneWidth : ROAD_DEFAULTS.laneWidth;
    const shoulder = Number.isFinite(roadCfg.shoulder) ? roadCfg.shoulder : ROAD_DEFAULTS.shoulder;
    const turnRadius = Number.isFinite(roadCfg.curves?.turnRadius) ? roadCfg.curves.turnRadius : ROAD_DEFAULTS.curves.turnRadius;
    const asphaltArcSegs = Number.isFinite(roadCfg.curves?.asphaltArcSegments) ? roadCfg.curves.asphaltArcSegments : ROAD_DEFAULTS.curves.asphaltArcSegments;
    const tileSize = Number.isFinite(network?.tileSize) ? network.tileSize : 1;
    const cornerPad = tileSize * 0.25;

    const modeSetting = config?.render?.roadMode ?? null;
    const debugEnabled = modeSetting ? modeSetting === 'debug' : false;
    const roadMatBase = materials?.road ?? new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.95 });
    const asphaltMat = debugEnabled
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : roadMatBase;

    if (asphaltMat) {
        asphaltMat.side = THREE.DoubleSide;
        asphaltMat.polygonOffset = true;
        asphaltMat.polygonOffsetFactor = -1;
        asphaltMat.polygonOffsetUnits = -1;
    }
    if (debugEnabled && asphaltMat) asphaltMat.toneMapped = false;

    const curbT = Number.isFinite(roadCfg.curb?.thickness) ? roadCfg.curb.thickness : ROAD_DEFAULTS.curb.thickness;
    const curbH = Number.isFinite(roadCfg.curb?.height) ? roadCfg.curb.height : ROAD_DEFAULTS.curb.height;
    const curbExtra = Number.isFinite(roadCfg.curb?.extraHeight) ? roadCfg.curb.extraHeight : ROAD_DEFAULTS.curb.extraHeight;
    const sidewalkWidth = Number.isFinite(roadCfg.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : ROAD_DEFAULTS.sidewalk.extraWidth;
    const sidewalkLift = Number.isFinite(roadCfg.sidewalk?.lift) ? roadCfg.sidewalk.lift : ROAD_DEFAULTS.sidewalk.lift;
    const curbBand = (Number.isFinite(curbT) && curbT > EPS) ? curbT : 0;
    const curbY = roadY + curbH + curbExtra;
    const sidewalkY = curbY + (Number.isFinite(sidewalkLift) ? sidewalkLift : 0);

    const curbMatBase = materials?.curb ?? new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 1.0 });
    const sidewalkMatBase = materials?.sidewalk ?? new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 1.0 });
    const curbMat = debugEnabled
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : curbMatBase;
    const sidewalkMat = debugEnabled
        ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : sidewalkMatBase;

    if (curbMat) {
        curbMat.side = THREE.DoubleSide;
        curbMat.polygonOffset = true;
        curbMat.polygonOffsetFactor = -1;
        curbMat.polygonOffsetUnits = -1;
    }
    if (sidewalkMat) {
        sidewalkMat.side = THREE.DoubleSide;
        sidewalkMat.polygonOffset = true;
        sidewalkMat.polygonOffsetFactor = -1;
        sidewalkMat.polygonOffsetUnits = -1;
    }
    if (debugEnabled && curbMat) curbMat.toneMapped = false;
    if (debugEnabled && sidewalkMat) sidewalkMat.toneMapped = false;

    const planeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    planeGeo.rotateX(-Math.PI / 2);

    const asphalt = createAsphaltBuilder({
        planeGeo,
        material: asphaltMat,
        palette: null,
        capacity: 1,
        name: 'Asphalt'
    });

    const curbTop = curbBand > EPS
        ? createAsphaltBuilder({
            planeGeo,
            material: curbMat,
            palette: null,
            capacity: 1,
            name: 'Curb'
        })
        : null;

    const sidewalk = (Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS)
        ? createAsphaltBuilder({
            planeGeo,
            material: sidewalkMat,
            palette: null,
            capacity: 1,
            name: 'Sidewalk'
        })
        : null;

    const edges = network?.getEdges?.() ?? [];
    const nodes = network?.getNodes?.() ?? [];

    const edgeById = new Map();
    for (const edge of edges) {
        if (!edge || edge.rendered === false) continue;
        edgeById.set(edge.id, edge);
    }

    const incidentByNode = new Map();
    for (const node of nodes) {
        const incident = [];
        const edgeIds = Array.isArray(node?.edgeIds) ? node.edgeIds : [];
        for (const edgeId of edgeIds) {
            const edge = edgeById.get(edgeId) ?? null;
            if (!edge) continue;
            const aId = edge.a;
            const bId = edge.b;
            const otherId = node.id === aId ? bId : aId;
            const other = network.getNode(otherId);
            if (!other) continue;
            const dir = normalizeDirXZ(node.position, other.position);
            if (!dir) continue;
            const width = roadWidthFromLanes({ lanesF: edge.lanesF, lanesB: edge.lanesB, laneWidth, shoulder });
            const halfWidth = width * 0.5;
            if (!(halfWidth > EPS)) continue;
            incident.push({
                edgeId,
                edge,
                otherId,
                dir: { x: dir.x, z: dir.z },
                length: dir.length,
                normal: leftNormal(dir),
                angle: wrapAngle(Math.atan2(dir.z, dir.x)),
                halfWidth
            });
        }
        incidentByNode.set(node.id, incident);
    }

    const boundaryByNodeEdge = new Map();
    const intersectionPolygons = [];
    const cornerJoins = [];
    const debugEdges = [];

    const nodeEdgeKey = (nodeId, edgeId) => `${nodeId}::${edgeId}`;

    for (const node of nodes) {
        const nodePos = node.position;
        const incident = incidentByNode.get(node.id) ?? [];
        if (!incident.length) continue;

        if (incident.length >= 3) {
            const sorted = incident.slice().sort((a, b) => a.angle - b.angle);
            let corners = [];

            if (sorted.length === 3) {
                let opposite = null;
                for (let i = 0; i < 3 && !opposite; i++) {
                    for (let j = i + 1; j < 3; j++) {
                        const dot = dotXZ(sorted[i].dir, sorted[j].dir);
                        if (dot <= -0.9995) {
                            opposite = { i, j };
                            break;
                        }
                    }
                }

                if (opposite) {
                    const a = sorted[opposite.i];
                    const b = sorted[opposite.j];
                    const k = [0, 1, 2].find((idx) => idx !== opposite.i && idx !== opposite.j);
                    const branch = sorted[k];

                    const mainDir = a.dir;
                    const mainNormal = leftNormal(mainDir);
                    const mainHalf = Math.max(a.halfWidth, b.halfWidth);
                    const branchDir = branch.dir;
                    const branchNormal = leftNormal(branchDir);
                    const branchHalf = branch.halfWidth;
                    const mainOut = mainNormal;
                    const mainOutR = { x: -mainNormal.x, z: -mainNormal.z };
                    const branchOut = branchNormal;
                    const branchOutR = { x: -branchNormal.x, z: -branchNormal.z };

                    const mainLeft = { x: nodePos.x + mainNormal.x * mainHalf, z: nodePos.z + mainNormal.z * mainHalf };
                    const mainRight = { x: nodePos.x - mainNormal.x * mainHalf, z: nodePos.z - mainNormal.z * mainHalf };
                    const branchLeft = { x: nodePos.x + branchNormal.x * branchHalf, z: nodePos.z + branchNormal.z * branchHalf };
                    const branchRight = { x: nodePos.x - branchNormal.x * branchHalf, z: nodePos.z - branchNormal.z * branchHalf };

                    const p0 = lineIntersectionXZ(mainLeft, mainDir, branchLeft, branchDir);
                    const p1 = lineIntersectionXZ(mainLeft, mainDir, branchRight, branchDir);
                    const p2 = lineIntersectionXZ(mainRight, mainDir, branchRight, branchDir);
                    const p3 = lineIntersectionXZ(mainRight, mainDir, branchLeft, branchDir);

                    const rect = [
                        { p: p0, outA: mainOut, outB: branchOut },
                        { p: p1, outA: mainOut, outB: branchOutR },
                        { p: p2, outA: mainOutR, outB: branchOutR },
                        { p: p3, outA: mainOutR, outB: branchOut }
                    ].filter((c) => c.p && Number.isFinite(c.p.x) && Number.isFinite(c.p.z));
                    if (rect.length === 4) {
                        corners = rect.sort(
                            (u, v) => edgeDirectionAngle({ x: u.p.x - nodePos.x, z: u.p.z - nodePos.z }) - edgeDirectionAngle({ x: v.p.x - nodePos.x, z: v.p.z - nodePos.z })
                        );
                    }
                }
            }

            if (!corners.length) {
                for (let i = 0; i < sorted.length; i++) {
                    const cur = sorted[i];
                    const next = sorted[(i + 1) % sorted.length];
                    const leftBase = {
                        x: nodePos.x + cur.normal.x * cur.halfWidth,
                        z: nodePos.z + cur.normal.z * cur.halfWidth
                    };
                    const rightBaseNext = {
                        x: nodePos.x - next.normal.x * next.halfWidth,
                        z: nodePos.z - next.normal.z * next.halfWidth
                    };

                    const v = safeMiterVertex({
                        nodePos,
                        aPoint: leftBase,
                        aDir: cur.dir,
                        bPoint: rightBaseNext,
                        bDir: next.dir,
                        aHalf: cur.halfWidth,
                        bHalf: next.halfWidth
                    });

                    corners.push({
                        p: v,
                        outA: cur.normal,
                        outB: { x: -next.normal.x, z: -next.normal.z }
                    });
                }
            }

            corners = corners.filter((c) => c?.p && Number.isFinite(c.p.x) && Number.isFinite(c.p.z));
            if (corners.length < 3) continue;

            let verts = corners.map((c) => c.p);
            if (polygonSignedAreaXZ(verts) > 0) {
                corners.reverse();
                verts = corners.map((c) => c.p);
            }

            const polyPoints = verts.map((v) => ({ x: v.x, y: v.z }));
            asphalt.addPolygonXZ({
                points: polyPoints,
                y: roadY,
                colorHex: 0xffffff,
                meta: { kind: 'intersection', nodeId: node.id, degree: sorted.length }
            });
            intersectionPolygons.push({ nodeId: node.id, points: verts });

            assignPolygonBoundaries({
                nodeId: node.id,
                nodePos,
                incident,
                verts,
                boundaryByNodeEdge,
                nodeEdgeKey
            });

            if ((curbTop && curbBand > EPS) || (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS)) {
                const wantCurb = curbTop && curbBand > EPS;
                const wantSidewalk = sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS;
                const idxByVertex = new Map();
                for (let i = 0; i < verts.length; i++) idxByVertex.set(verts[i], i);

                const mouthEdgeIdx = new Set();
                const markMouthPath = (i0, i1) => {
                    const n = verts.length;
                    if (!(n >= 2)) return;
                    if (!Number.isInteger(i0) || !Number.isInteger(i1)) return;
                    if (i0 === i1) return;
                    const cw = (i1 - i0 + n) % n;
                    const ccw = (i0 - i1 + n) % n;
                    if (cw === 0 || ccw === 0) return;
                    if (cw <= ccw) {
                        let i = i0;
                        for (let k = 0; k < cw; k++) {
                            mouthEdgeIdx.add(i);
                            i = (i + 1) % n;
                        }
                        return;
                    }
                    let i = i0;
                    for (let k = 0; k < ccw; k++) {
                        const j = (i - 1 + n) % n;
                        mouthEdgeIdx.add(j);
                        i = j;
                    }
                };

                for (const entry of incident) {
                    const boundary = boundaryByNodeEdge.get(nodeEdgeKey(node.id, entry.edgeId)) ?? null;
                    if (!boundary) continue;
                    const i0 = idxByVertex.get(boundary.left);
                    const i1 = idxByVertex.get(boundary.right);
                    markMouthPath(i0, i1);
                }

                const ccw = polygonSignedAreaXZ(verts) > 0;
                const probeDist = Math.max(1e-3, Math.min(0.05, tileSize * 0.002));
                const polyEps = 1e-7;

                const pickOutward = (p0, p1, guess) => {
                    const mid = { x: (p0.x + p1.x) * 0.5, z: (p0.z + p1.z) * 0.5 };
                    const test = { x: mid.x + guess.x * probeDist, z: mid.z + guess.z * probeDist };
                    if (pointInPolygonStrictXZ(test, verts, polyEps)) return { x: -guess.x, z: -guess.z };
                    return guess;
                };

                const addStrip = (p0, p1) => {
                    const d = normalizeDirXZ(p0, p1);
                    if (!d) return;
                    const outwardGuess = ccw ? rightNormal(d) : leftNormal(d);
                    const outward = pickOutward(p0, p1, outwardGuess);

                    let curbDist = wantCurb ? curbBand : 0;
                    if (wantCurb && curbDist > EPS) {
                        for (let iter = 0; iter < 6; iter++) {
                            const q0 = { x: p0.x + outward.x * curbDist, z: p0.z + outward.z * curbDist };
                            const q1 = { x: p1.x + outward.x * curbDist, z: p1.z + outward.z * curbDist };
                            if (!pointInPolygonStrictXZ(q0, verts, polyEps) && !pointInPolygonStrictXZ(q1, verts, polyEps)) break;
                            curbDist *= 0.5;
                        }
                        if (!(curbDist > EPS)) curbDist = 0;
                    }

                    let sidewalkExtra = wantSidewalk ? sidewalkWidth : 0;
                    if (wantSidewalk && sidewalkExtra > EPS) {
                        for (let iter = 0; iter < 6; iter++) {
                            const dist = curbDist + sidewalkExtra;
                            const s0 = { x: p0.x + outward.x * dist, z: p0.z + outward.z * dist };
                            const s1 = { x: p1.x + outward.x * dist, z: p1.z + outward.z * dist };
                            if (!pointInPolygonStrictXZ(s0, verts, polyEps) && !pointInPolygonStrictXZ(s1, verts, polyEps)) break;
                            sidewalkExtra *= 0.5;
                        }
                        if (!(sidewalkExtra > EPS)) sidewalkExtra = 0;
                    }

                    const q0 = curbDist > EPS ? { x: p0.x + outward.x * curbDist, z: p0.z + outward.z * curbDist } : null;
                    const q1 = curbDist > EPS ? { x: p1.x + outward.x * curbDist, z: p1.z + outward.z * curbDist } : null;

                    if (q0 && q1) {
                        curbTop.addQuadXZ({
                            a: { x: p0.x, y: p0.z },
                            b: { x: p1.x, y: p1.z },
                            c: { x: q1.x, y: q1.z },
                            d: { x: q0.x, y: q0.z },
                            y: curbY,
                            colorHex: 0x606060,
                            meta: { kind: 'curb', nodeId: node.id }
                        });
                    }

                    if (sidewalkExtra > EPS) {
                        const dist = curbDist + sidewalkExtra;
                        const s0 = { x: p0.x + outward.x * dist, z: p0.z + outward.z * dist };
                        const s1 = { x: p1.x + outward.x * dist, z: p1.z + outward.z * dist };
                        if (q0 && q1) {
                            sidewalk.addQuadXZ({
                                a: { x: q0.x, y: q0.z },
                                b: { x: q1.x, y: q1.z },
                                c: { x: s1.x, y: s1.z },
                                d: { x: s0.x, y: s0.z },
                                y: sidewalkY,
                                colorHex: 0x8f8f8f,
                                meta: { kind: 'sidewalk', nodeId: node.id }
                            });
                        } else {
                            sidewalk.addQuadXZ({
                                a: { x: p0.x, y: p0.z },
                                b: { x: p1.x, y: p1.z },
                                c: { x: s1.x, y: s1.z },
                                d: { x: s0.x, y: s0.z },
                                y: sidewalkY,
                                colorHex: 0x8f8f8f,
                                meta: { kind: 'sidewalk', nodeId: node.id }
                            });
                        }
                    }
                };

                for (let i = 0; i < verts.length; i++) {
                    if (mouthEdgeIdx.has(i)) continue;
                    const j = (i + 1) % verts.length;
                    addStrip(verts[i], verts[j]);
                }

                const n = verts.length;
                for (let i = 0; i < n; i++) {
                    const v = verts[i];
                    const prev = verts[(i - 1 + n) % n];
                    const next = verts[(i + 1) % n];
                    const dPrev = normalizeDirXZ(prev, v);
                    const dNext = normalizeDirXZ(v, next);
                    if (!dPrev || !dNext) continue;
                    const outAGuess = ccw ? rightNormal(dPrev) : leftNormal(dPrev);
                    const outBGuess = ccw ? rightNormal(dNext) : leftNormal(dNext);
                    const outA = pickOutward(prev, v, outAGuess);
                    const outB = pickOutward(v, next, outBGuess);
                    const dot = outA.x * outB.x + outA.z * outB.z;
                    if (dot > 0.999) continue;

                    if (wantCurb) {
                        let dist = curbBand;
                        for (let iter = 0; iter < 6; iter++) {
                            const qA = { x: v.x + outA.x * dist, z: v.z + outA.z * dist };
                            const qB = { x: v.x + outB.x * dist, z: v.z + outB.z * dist };
                            if (!pointInPolygonStrictXZ(qA, verts, polyEps) && !pointInPolygonStrictXZ(qB, verts, polyEps)) break;
                            dist *= 0.5;
                        }
                        if (!(dist > EPS)) continue;
                        const qA = { x: v.x + outA.x * dist, z: v.z + outA.z * dist };
                        const qB = { x: v.x + outB.x * dist, z: v.z + outB.z * dist };
                        curbTop.addTriangleXZ({
                            a: { x: v.x, y: v.z },
                            b: { x: qA.x, y: qA.z },
                            c: { x: qB.x, y: qB.z },
                            y: curbY,
                            colorHex: 0x606060,
                            meta: { kind: 'curb', nodeId: node.id }
                        });
                    }

                    if (wantSidewalk) {
                        const base = curbBand > EPS ? curbBand : 0;
                        let extra = sidewalkWidth;
                        for (let iter = 0; iter < 6; iter++) {
                            const oA = { x: v.x + outA.x * (base + extra), z: v.z + outA.z * (base + extra) };
                            const oB = { x: v.x + outB.x * (base + extra), z: v.z + outB.z * (base + extra) };
                            if (!pointInPolygonStrictXZ(oA, verts, polyEps) && !pointInPolygonStrictXZ(oB, verts, polyEps)) break;
                            extra *= 0.5;
                        }
                        if (!(extra > EPS)) continue;
                        const iA = { x: v.x + outA.x * base, z: v.z + outA.z * base };
                        const iB = { x: v.x + outB.x * base, z: v.z + outB.z * base };
                        const oA = { x: v.x + outA.x * (base + extra), z: v.z + outA.z * (base + extra) };
                        const oB = { x: v.x + outB.x * (base + extra), z: v.z + outB.z * (base + extra) };
                        if (base > EPS) {
                            sidewalk.addQuadXZ({
                                a: { x: iA.x, y: iA.z },
                                b: { x: iB.x, y: iB.z },
                                c: { x: oB.x, y: oB.z },
                                d: { x: oA.x, y: oA.z },
                                y: sidewalkY,
                                colorHex: 0x8f8f8f,
                                meta: { kind: 'sidewalk', nodeId: node.id }
                            });
                        } else {
                            sidewalk.addTriangleXZ({
                                a: { x: v.x, y: v.z },
                                b: { x: oA.x, y: oA.z },
                                c: { x: oB.x, y: oB.z },
                                y: sidewalkY,
                                colorHex: 0x8f8f8f,
                                meta: { kind: 'sidewalk', nodeId: node.id }
                            });
                        }
                    }
                }
            }
            continue;
        }

        if (incident.length !== 2) continue;

        const a = incident[0];
        const b = incident[1];
        const dot = clamp(dotXZ(a.dir, b.dir), -1, 1);
        if (dot <= -0.95) continue;

        const maxCut = Math.max(0, Math.min(a.length, b.length) - 1e-6);
        const baseCutRaw = requiredCutbackForJoin({
            dirA: a.dir,
            dirB: b.dir,
            halfA: a.halfWidth,
            halfB: b.halfWidth
        });
        const baseCut = Math.min(maxCut, Math.max(0, (Number.isFinite(baseCutRaw) ? baseCutRaw : 0) + 1e-6));

        const chord = Math.max(0.25, tileSize * 0.02);
        const filletRadius = turnRadius;

        const lines = {
            aLeft: { p: { x: nodePos.x + a.normal.x * a.halfWidth, z: nodePos.z + a.normal.z * a.halfWidth }, dir: a.dir, out: a.normal },
            aRight: { p: { x: nodePos.x - a.normal.x * a.halfWidth, z: nodePos.z - a.normal.z * a.halfWidth }, dir: a.dir, out: { x: -a.normal.x, z: -a.normal.z } },
            bLeft: { p: { x: nodePos.x + b.normal.x * b.halfWidth, z: nodePos.z + b.normal.z * b.halfWidth }, dir: b.dir, out: b.normal },
            bRight: { p: { x: nodePos.x - b.normal.x * b.halfWidth, z: nodePos.z - b.normal.z * b.halfWidth }, dir: b.dir, out: { x: -b.normal.x, z: -b.normal.z } }
        };

        const cutForTangent = (tangent, dir) => {
            if (!tangent || !Number.isFinite(tangent.x) || !Number.isFinite(tangent.z)) return 0;
            const d = Number.isFinite(dir?.x) && Number.isFinite(dir?.z) ? dir : null;
            if (!d) return 0;
            const proj = (tangent.x - nodePos.x) * d.x + (tangent.z - nodePos.z) * d.z;
            return Number.isFinite(proj) ? Math.max(0, proj) : 0;
        };

        const appendUnique = (list, p) => {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
            const last = list[list.length - 1] ?? null;
            if (last && Math.hypot(p.x - last.x, p.z - last.z) <= 1e-6) return;
            list.push({ x: p.x, z: p.z });
        };

        const buildJoinEdgePath = (from, to, arc) => {
            const path = [];
            appendUnique(path, from);
            if (arc) {
                appendUnique(path, arc.tangent0);
                const segs = clamp(Math.ceil((arc.radius * arc.spanAng) / chord), 6, 128);
                const arcPts = sampleArcXZ({
                    center: arc.center,
                    radius: arc.radius,
                    startAng: arc.startAng,
                    spanAng: arc.spanAng,
                    ccw: arc.ccw,
                    segments: segs
                });
                for (const p of arcPts) appendUnique(path, p);
                appendUnique(path, arc.tangent1);
            }
            appendUnique(path, to);
            return path;
        };

        const buildJoinPoly = (basePts, arc12Use, arc30Use) => {
            const path12 = buildJoinEdgePath(basePts[1], basePts[2], arc12Use);
            const path30 = buildJoinEdgePath(basePts[3], basePts[0], arc30Use);

            const poly = [];
            appendUnique(poly, basePts[0]);
            appendUnique(poly, basePts[1]);
            for (let i = 1; i < path12.length; i++) appendUnique(poly, path12[i]);
            appendUnique(poly, basePts[3]);
            for (let i = 1; i + 1 < path30.length; i++) appendUnique(poly, path30[i]);

            return { poly, path12, path30 };
        };

        const computeOption = (mode) => {
            const edge12 = mode === 'cross'
                ? { a: 'aRight', b: 'bLeft' }
                : { a: 'aRight', b: 'bRight' };
            const edge30 = mode === 'cross'
                ? { a: 'bRight', b: 'aLeft' }
                : { a: 'bLeft', b: 'aLeft' };

            const arc12 = computeEdgeFilletArcXZ({
                p0: lines[edge12.a].p,
                dir0: lines[edge12.a].dir,
                out0: lines[edge12.a].out,
                p1: lines[edge12.b].p,
                dir1: lines[edge12.b].dir,
                out1: lines[edge12.b].out,
                radius: filletRadius
            });

            const arc30 = computeEdgeFilletArcXZ({
                p0: lines[edge30.a].p,
                dir0: lines[edge30.a].dir,
                out0: lines[edge30.a].out,
                p1: lines[edge30.b].p,
                dir1: lines[edge30.b].dir,
                out1: lines[edge30.b].out,
                radius: filletRadius
            });

            const arc12Ok = arc12 && cutForTangent(arc12.tangent0, lines[edge12.a].dir) <= maxCut && cutForTangent(arc12.tangent1, lines[edge12.b].dir) <= maxCut;
            const arc30Ok = arc30 && cutForTangent(arc30.tangent0, lines[edge30.a].dir) <= maxCut && cutForTangent(arc30.tangent1, lines[edge30.b].dir) <= maxCut;

            const arcSets = [
                { edge12: arc12Ok ? arc12 : null, edge30: arc30Ok ? arc30 : null },
                { edge12: arc12Ok ? arc12 : null, edge30: null },
                { edge12: null, edge30: arc30Ok ? arc30 : null },
                { edge12: null, edge30: null }
            ];

            const variants = [];
            for (const set of arcSets) {
                let cut = baseCut;
                if (set.edge12) {
                    cut = Math.max(
                        cut,
                        cutForTangent(set.edge12.tangent0, lines[edge12.a].dir),
                        cutForTangent(set.edge12.tangent1, lines[edge12.b].dir)
                    );
                }
                if (set.edge30) {
                    cut = Math.max(
                        cut,
                        cutForTangent(set.edge30.tangent0, lines[edge30.a].dir),
                        cutForTangent(set.edge30.tangent1, lines[edge30.b].dir)
                    );
                }
                cut = Math.min(maxCut, Math.max(0, cut));

                const aC = { x: nodePos.x + a.dir.x * cut, z: nodePos.z + a.dir.z * cut };
                const bC = { x: nodePos.x + b.dir.x * cut, z: nodePos.z + b.dir.z * cut };
                const aLeft = { x: aC.x + a.normal.x * a.halfWidth, z: aC.z + a.normal.z * a.halfWidth };
                const aRight = { x: aC.x - a.normal.x * a.halfWidth, z: aC.z - a.normal.z * a.halfWidth };
                const bLeft = { x: bC.x + b.normal.x * b.halfWidth, z: bC.z + b.normal.z * b.halfWidth };
                const bRight = { x: bC.x - b.normal.x * b.halfWidth, z: bC.z - b.normal.z * b.halfWidth };

                if (segmentsIntersectXZ(aLeft, aRight, bLeft, bRight)) continue;

                const basePts = mode === 'cross'
                    ? [aLeft, aRight, bLeft, bRight]
                    : [aLeft, aRight, bRight, bLeft];

                if (segmentsIntersectXZ(basePts[1], basePts[2], basePts[3], basePts[0])) continue;
                const baseArea = Math.abs(polygonSignedAreaXZ(basePts));
                if (!(baseArea > 1e-4)) continue;

                const join = buildJoinPoly(basePts, set.edge12, set.edge30);
                const polyArea = Math.abs(polygonSignedAreaXZ(join.poly));
                if (!(polyArea > 1e-4)) continue;
                if (!isSimplePolygonXZ(join.poly)) continue;

                variants.push({
                    mode,
                    cut,
                    aLeft,
                    aRight,
                    bLeft,
                    bRight,
                    basePoints: basePts,
                    poly: join.poly,
                    path12: join.path12,
                    path30: join.path30,
                    arcs: {
                        edge12: set.edge12,
                        edge30: set.edge30,
                        edge12Key: edge12,
                        edge30Key: edge30
                    }
                });
            }

            if (!variants.length) return null;

            variants.sort((u, v) => {
                const fu = (u.arcs.edge12 ? 1 : 0) + (u.arcs.edge30 ? 1 : 0);
                const fv = (v.arcs.edge12 ? 1 : 0) + (v.arcs.edge30 ? 1 : 0);
                if (fu !== fv) return fv - fu;
                if (u.cut !== v.cut) return u.cut - v.cut;
                const au = Math.abs(polygonSignedAreaXZ(u.poly));
                const av = Math.abs(polygonSignedAreaXZ(v.poly));
                return av - au;
            });

            return variants[0];
        };

        const optCross = computeOption('cross');
        const optStraight = computeOption('straight');
        const candidates = [optCross, optStraight].filter(Boolean);
        if (!candidates.length) continue;

        candidates.sort((u, v) => {
            const au = Math.abs(polygonSignedAreaXZ(u.poly));
            const av = Math.abs(polygonSignedAreaXZ(v.poly));
            const fu = (u.arcs.edge12 ? 1 : 0) + (u.arcs.edge30 ? 1 : 0);
            const fv = (v.arcs.edge12 ? 1 : 0) + (v.arcs.edge30 ? 1 : 0);
            if (fu !== fv) return fv - fu;
            if (u.cut !== v.cut) return u.cut - v.cut;
            return av - au;
        });

        const best = candidates[0];
        const pts = best.basePoints;

        boundaryByNodeEdge.set(nodeEdgeKey(node.id, a.edgeId), { left: best.aLeft, right: best.aRight });
        boundaryByNodeEdge.set(nodeEdgeKey(node.id, b.edgeId), { left: best.bLeft, right: best.bRight });
        const poly = best.poly;
        const path12 = best.path12;
        const path30 = best.path30;

        asphalt.addPolygonXZ({
            points: poly.map((p) => ({ x: p.x, y: p.z })),
            y: roadY,
            colorHex: 0xffffff,
            meta: { kind: 'join', nodeId: node.id, cutback: best.cut }
        });

        const ccw = polygonSignedAreaXZ(poly) >= 0;
        const addCurbPath = (path) => {
            if (!Array.isArray(path) || path.length < 2) return;
            for (let i = 0; i + 1 < path.length; i++) {
                const p0 = path[i];
                const p1 = path[i + 1];
                const d = normalizeDirXZ(p0, p1);
                if (!d) continue;
                const outward = ccw ? rightNormal(d) : leftNormal(d);

                if (curbTop && curbBand > EPS) {
                    const q0 = { x: p0.x + outward.x * curbBand, z: p0.z + outward.z * curbBand };
                    const q1 = { x: p1.x + outward.x * curbBand, z: p1.z + outward.z * curbBand };
                    curbTop.addQuadXZ({
                        a: { x: p0.x, y: p0.z },
                        b: { x: p1.x, y: p1.z },
                        c: { x: q1.x, y: q1.z },
                        d: { x: q0.x, y: q0.z },
                        y: curbY,
                        colorHex: 0x606060,
                        meta: { kind: 'curb', nodeId: node.id }
                    });

                    if (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS) {
                        const s0 = { x: q0.x + outward.x * sidewalkWidth, z: q0.z + outward.z * sidewalkWidth };
                        const s1 = { x: q1.x + outward.x * sidewalkWidth, z: q1.z + outward.z * sidewalkWidth };
                        sidewalk.addQuadXZ({
                            a: { x: q0.x, y: q0.z },
                            b: { x: q1.x, y: q1.z },
                            c: { x: s1.x, y: s1.z },
                            d: { x: s0.x, y: s0.z },
                            y: sidewalkY,
                            colorHex: 0x8f8f8f,
                            meta: { kind: 'sidewalk', nodeId: node.id }
                        });
                    }
                } else if (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS) {
                    const q0 = { x: p0.x + outward.x * sidewalkWidth, z: p0.z + outward.z * sidewalkWidth };
                    const q1 = { x: p1.x + outward.x * sidewalkWidth, z: p1.z + outward.z * sidewalkWidth };
                    sidewalk.addQuadXZ({
                        a: { x: p0.x, y: p0.z },
                        b: { x: p1.x, y: p1.z },
                        c: { x: q1.x, y: q1.z },
                        d: { x: q0.x, y: q0.z },
                        y: sidewalkY,
                        colorHex: 0x8f8f8f,
                        meta: { kind: 'sidewalk', nodeId: node.id }
                    });
                }
            }
        };

        if ((curbTop && curbBand > EPS) || (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS)) {
            addCurbPath(path12);
            addCurbPath(path30);
        }

        const resolveConn = (label) => {
            const raw = typeof label === 'string' ? label : '';
            if (!raw) return null;
            const side = raw.endsWith('Left') ? 'left' : (raw.endsWith('Right') ? 'right' : null);
            if (!side) return null;
            const edgeId = raw.startsWith('a') ? a.edgeId : (raw.startsWith('b') ? b.edgeId : null);
            if (!edgeId) return null;
            return { edgeId, side };
        };

        const connections = [];
        const edge12Key = best?.arcs?.edge12Key ?? null;
        if (edge12Key) {
            const p0 = resolveConn(edge12Key.a);
            const p1 = resolveConn(edge12Key.b);
            if (p0 && p1) connections.push({ a: p0, b: p1 });
        }
        const edge30Key = best?.arcs?.edge30Key ?? null;
        if (edge30Key) {
            const p0 = resolveConn(edge30Key.a);
            const p1 = resolveConn(edge30Key.b);
            if (p0 && p1) connections.push({ a: p0, b: p1 });
        }

        cornerJoins.push({
            nodeId: node.id,
            cutback: best.cut,
            mode: best.mode,
            edges: { a: a.edgeId, b: b.edgeId },
            connections,
            points: poly,
            fillets: {
                edge12: best.arcs.edge12,
                edge30: best.arcs.edge30
            }
        });
    }

    for (const node of nodes) {
        const incident = incidentByNode.get(node.id) ?? [];
        if (incident.length === 1) {
            const entry = incident[0];
            boundaryByNodeEdge.set(nodeEdgeKey(node.id, entry.edgeId), {
                left: { x: node.position.x + entry.normal.x * entry.halfWidth, z: node.position.z + entry.normal.z * entry.halfWidth },
                right: { x: node.position.x - entry.normal.x * entry.halfWidth, z: node.position.z - entry.normal.z * entry.halfWidth }
            });
        } else if (incident.length === 2) {
            for (const entry of incident) {
                if (boundaryByNodeEdge.has(nodeEdgeKey(node.id, entry.edgeId))) continue;
                boundaryByNodeEdge.set(nodeEdgeKey(node.id, entry.edgeId), {
                    left: { x: node.position.x + entry.normal.x * entry.halfWidth, z: node.position.z + entry.normal.z * entry.halfWidth },
                    right: { x: node.position.x - entry.normal.x * entry.halfWidth, z: node.position.z - entry.normal.z * entry.halfWidth }
                });
            }
        }
    }

    for (const edge of edgeById.values()) {
        const nodeA = network.getNode(edge.a);
        const nodeB = network.getNode(edge.b);
        if (!nodeA || !nodeB) continue;

        const start = boundaryByNodeEdge.get(nodeEdgeKey(nodeA.id, edge.id)) ?? null;
        const end = boundaryByNodeEdge.get(nodeEdgeKey(nodeB.id, edge.id)) ?? null;
        if (!start || !end) continue;

        const startLeftXZ = start.left;
        const startRightXZ = start.right;
        const endLeftXZ = end.right;
        const endRightXZ = end.left;

        const startLeft = { x: startLeftXZ.x, y: startLeftXZ.z };
        const startRight = { x: startRightXZ.x, y: startRightXZ.z };
        const endLeft = { x: endLeftXZ.x, y: endLeftXZ.z };
        const endRight = { x: endRightXZ.x, y: endRightXZ.z };

        asphalt.addQuadXZ({
            a: startLeft,
            b: startRight,
            c: endRight,
            d: endLeft,
            y: roadY,
            colorHex: 0xffffff,
            meta: {
                kind: 'segment',
                edgeId: edge.id,
                sourceId: edge.sourceId ?? edge.id,
                nodeA: nodeA.id,
                nodeB: nodeB.id,
                tag: edge.tag,
                lanesF: edge.lanesF ?? 0,
                lanesB: edge.lanesB ?? 0,
                width: roadWidthFromLanes({ lanesF: edge.lanesF, lanesB: edge.lanesB, laneWidth, shoulder }),
                length: edge.length ?? null
            }
        });

        if ((curbTop && curbBand > EPS) || (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS)) {
            const dir = normalizeDirXZ(nodeA.position, nodeB.position);
            if (dir) {
                const normal = leftNormal(dir);

                const curbLeftA = { x: startLeftXZ.x + normal.x * curbBand, z: startLeftXZ.z + normal.z * curbBand };
                const curbLeftB = { x: endLeftXZ.x + normal.x * curbBand, z: endLeftXZ.z + normal.z * curbBand };
                const curbRightA = { x: startRightXZ.x - normal.x * curbBand, z: startRightXZ.z - normal.z * curbBand };
                const curbRightB = { x: endRightXZ.x - normal.x * curbBand, z: endRightXZ.z - normal.z * curbBand };

                if (curbTop && curbBand > EPS) {
                    curbTop.addQuadXZ({
                        a: { x: startLeftXZ.x, y: startLeftXZ.z },
                        b: { x: endLeftXZ.x, y: endLeftXZ.z },
                        c: { x: curbLeftB.x, y: curbLeftB.z },
                        d: { x: curbLeftA.x, y: curbLeftA.z },
                        y: curbY,
                        colorHex: 0x606060,
                        meta: { kind: 'curb', edgeId: edge.id }
                    });
                    curbTop.addQuadXZ({
                        a: { x: startRightXZ.x, y: startRightXZ.z },
                        b: { x: endRightXZ.x, y: endRightXZ.z },
                        c: { x: curbRightB.x, y: curbRightB.z },
                        d: { x: curbRightA.x, y: curbRightA.z },
                        y: curbY,
                        colorHex: 0x606060,
                        meta: { kind: 'curb', edgeId: edge.id }
                    });
                }

                if (sidewalk && Number.isFinite(sidewalkWidth) && sidewalkWidth > EPS) {
                    const walkLeftA = { x: curbLeftA.x + normal.x * sidewalkWidth, z: curbLeftA.z + normal.z * sidewalkWidth };
                    const walkLeftB = { x: curbLeftB.x + normal.x * sidewalkWidth, z: curbLeftB.z + normal.z * sidewalkWidth };
                    const walkRightA = { x: curbRightA.x - normal.x * sidewalkWidth, z: curbRightA.z - normal.z * sidewalkWidth };
                    const walkRightB = { x: curbRightB.x - normal.x * sidewalkWidth, z: curbRightB.z - normal.z * sidewalkWidth };
                    sidewalk.addQuadXZ({
                        a: { x: curbLeftA.x, y: curbLeftA.z },
                        b: { x: curbLeftB.x, y: curbLeftB.z },
                        c: { x: walkLeftB.x, y: walkLeftB.z },
                        d: { x: walkLeftA.x, y: walkLeftA.z },
                        y: sidewalkY,
                        colorHex: 0x8f8f8f,
                        meta: { kind: 'sidewalk', edgeId: edge.id }
                    });
                    sidewalk.addQuadXZ({
                        a: { x: curbRightA.x, y: curbRightA.z },
                        b: { x: curbRightB.x, y: curbRightB.z },
                        c: { x: walkRightB.x, y: walkRightB.z },
                        d: { x: walkRightA.x, y: walkRightA.z },
                        y: sidewalkY,
                        colorHex: 0x8f8f8f,
                        meta: { kind: 'sidewalk', edgeId: edge.id }
                    });
                }
            }
        }

        debugEdges.push({
            edgeId: edge.id,
            sourceId: edge.sourceId ?? edge.id,
            a: nodeA.id,
            b: nodeB.id,
            tag: edge.tag,
            rendered: edge.rendered !== false,
            lanesF: edge.lanesF ?? 0,
            lanesB: edge.lanesB ?? 0,
            width: roadWidthFromLanes({ lanesF: edge.lanesF, lanesB: edge.lanesB, laneWidth, shoulder }),
            centerline: {
                a: { x: nodeA.position.x, z: nodeA.position.z },
                b: { x: nodeB.position.x, z: nodeB.position.z }
            },
            left: {
                a: { x: startLeftXZ.x, z: startLeftXZ.z },
                b: { x: endLeftXZ.x, z: endLeftXZ.z }
            },
            right: {
                a: { x: startRightXZ.x, z: startRightXZ.z },
                b: { x: endRightXZ.x, z: endRightXZ.z }
            }
        });
    }

    asphalt.finalize();
    group.add(asphalt.mesh);

    if (curbTop) {
        curbTop.finalize();
        group.add(curbTop.mesh);
    }
    if (sidewalk) {
        sidewalk.finalize();
        group.add(sidewalk.mesh);
    }

    return {
        group,
        asphalt: asphalt.mesh,
        sidewalk: sidewalk?.mesh ?? null,
        curbBlocks: curbTop?.mesh ?? null,
        markingsWhite: null,
        markingsYellow: null,
        curbConnectors: [],
        collisionMarkers: [],
        debug: {
            edges: debugEdges,
            cornerFillets: [],
            cornerJoins,
            intersections: intersectionPolygons.map((entry) => ({
                nodeId: entry.nodeId,
                points: (Array.isArray(entry.points) ? entry.points : []).map((p) => ({ x: Math.fround(p.x), z: Math.fround(p.z) }))
            }))
        }
    };
}
