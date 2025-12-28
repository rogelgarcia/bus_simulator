// graphics/assets3d/generators/internal_road/ArcConnector.js
import * as THREE from 'three';
import { wrapAngle } from './RoadMath.js';
import { mergeBufferGeometries, applyWorldSpaceUV_XZ } from './RoadGeometry.js';
import { solveConnectorPath } from '../../../../src/geometry/ConnectorPathSolver.js';

const EPS = 1e-8;
const TAU = Math.PI * 2;

export function leftNormal(dir) {
    return new THREE.Vector2(-dir.y, dir.x);
}

export function arcDelta(aFrom, aTo, turn) {
    const from = wrapAngle(aFrom);
    const to = wrapAngle(aTo);
    if (turn === 'L') {
        let d = to - from;
        if (d < 0) d += TAU;
        return d;
    }
    let d = from - to;
    if (d < 0) d += TAU;
    return d;
}

export function circleTangents(c1, r1, c2, r2) {
    const d = c2.clone().sub(c1);
    const dr = r1 - r2;
    const d2 = d.lengthSq();
    const h2 = d2 - dr * dr;
    if (d2 < EPS || h2 < -EPS) return [];
    const h = Math.sqrt(Math.max(0, h2));
    const pd = leftNormal(d);
    const out = [];
    for (const s of [-1, 1]) {
        const v = d.clone()
            .multiplyScalar(dr)
            .add(pd.clone().multiplyScalar(h * s))
            .multiplyScalar(1 / d2);
        out.push({
            t0: c1.clone().add(v.clone().multiplyScalar(r1)),
            t1: c2.clone().add(v.clone().multiplyScalar(r2))
        });
    }
    return out;
}

export function travelTangent(center, pt, turn) {
    const r = pt.clone().sub(center);
    const t = (turn === 'L') ? leftNormal(r) : leftNormal(r).multiplyScalar(-1);
    const len = t.length();
    if (len < EPS) return new THREE.Vector2(0, 0);
    return t.multiplyScalar(1 / len);
}

function pointSegDistSq(p, a, b) {
    const ab = b.clone().sub(a);
    const abLenSq = ab.lengthSq();
    if (abLenSq < EPS) return p.distanceToSquared(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / abLenSq));
    const proj = a.clone().add(ab.multiplyScalar(t));
    return p.distanceToSquared(proj);
}

function bestCandidate(candidates) {
    let best = null;
    let bestScore = -Infinity;
    for (const cand of candidates) {
        const score = cand.score ?? -cand.totalLength;
        if (score > bestScore) {
            best = cand;
            bestScore = score;
        }
    }
    return best;
}

function solveForRadius({ p0, dir0, p1, dir1, R, preferS, minStraight }) {
    const d0 = dir0.clone().normalize();
    const d1 = dir1.clone().normalize();
    if (d0.lengthSq() < EPS || d1.lengthSq() < EPS || !(R > EPS)) return null;
    const n0 = leftNormal(d0);
    const n1 = leftNormal(d1);
    const types = preferS ? ['LSR', 'RSL', 'LSL', 'RSR'] : ['LSL', 'RSR', 'LSR', 'RSL'];
    const candidates = [];
    for (const type of types) {
        const turn0 = type[0];
        const turn1 = type[2];
        const c0 = p0.clone().add(n0.clone().multiplyScalar(turn0 === 'L' ? R : -R));
        const c1 = p1.clone().add(n1.clone().multiplyScalar(turn1 === 'L' ? R : -R));
        const internal = turn0 !== turn1;
        const sols = internal
            ? circleTangents(c0, R, c1, -R)
            : circleTangents(c0, R, c1, R);
        if (!sols.length) continue;
        for (const { t0, t1 } of sols) {
            const s = t1.clone().sub(t0);
            const lenS = s.length();
            if (!Number.isFinite(lenS) || lenS < EPS) continue;
            const sdir = s.clone().multiplyScalar(1 / lenS);
            const tan0 = travelTangent(c0, t0, turn0);
            const tan1 = travelTangent(c1, t1, turn1);
            const dot0 = tan0.dot(sdir);
            const dot1 = tan1.dot(sdir);
            if (dot0 < 0.1 || dot1 < 0.1) continue;
            const a0s = Math.atan2(p0.y - c0.y, p0.x - c0.x);
            const a0e = Math.atan2(t0.y - c0.y, t0.x - c0.x);
            const a1s = Math.atan2(t1.y - c1.y, t1.x - c1.x);
            const a1e = Math.atan2(p1.y - c1.y, p1.x - c1.x);
            const da0 = arcDelta(a0s, a0e, turn0);
            const da1 = arcDelta(a1s, a1e, turn1);
            const totalLength = da0 * R + lenS + da1 * R;
            const selfIntersecting = (pointSegDistSq(c0, t0, t1) < (R * R * 0.999))
                || (pointSegDistSq(c1, t0, t1) < (R * R * 0.999));
            let score = -totalLength + (dot0 + dot1) * 0.25;
            if (preferS && internal) score += 0.5;
            if (minStraight > 0 && lenS < minStraight) score -= (minStraight - lenS) / minStraight;
            if (selfIntersecting) score -= 1.0;
            candidates.push({
                type,
                R,
                arc0: {
                    center: c0.clone(),
                    radius: R,
                    startAngle: a0s,
                    deltaAngle: da0,
                    turnDir: turn0,
                    startPoint: p0.clone(),
                    endPoint: t0.clone()
                },
                straight: {
                    start: t0.clone(),
                    end: t1.clone(),
                    length: lenS,
                    dir: sdir.clone()
                },
                arc1: {
                    center: c1.clone(),
                    radius: R,
                    startAngle: a1s,
                    deltaAngle: da1,
                    turnDir: turn1,
                    startPoint: t1.clone(),
                    endPoint: p1.clone()
                },
                totalLength,
                score,
                quality: {
                    tangentDot0: dot0,
                    tangentDot1: dot1,
                    straightLength: lenS,
                    selfIntersecting
                }
            });
        }
    }
    return bestCandidate(candidates);
}

export function solveArcStraightArcConnector({
    p0,
    dir0,
    p1,
    dir1,
    R,
    preferS = true,
    allowFallback = true,
    minStraight = 0.05
} = {}) {
    const radii = [R];
    if (allowFallback && Number.isFinite(R)) {
        radii.push(R * 0.85, R * 0.7, R * 0.55);
    }
    const candidates = [];
    for (const r of radii) {
        const cand = solveForRadius({ p0, dir0, p1, dir1, R: r, preferS, minStraight });
        if (cand) candidates.push(cand);
    }
    return bestCandidate(candidates);
}

function lineIntersection(p0, d0, p1, d1) {
    const cross = d0.x * d1.y - d0.y * d1.x;
    if (Math.abs(cross) < EPS) return null;
    const diff = p1.clone().sub(p0);
    const t = (diff.x * d1.y - diff.y * d1.x) / cross;
    return p0.clone().add(d0.clone().multiplyScalar(t));
}

export function solveFilletConnector({ p0, dir0, p1, dir1, R } = {}) {
    const d0 = dir0.clone().normalize();
    const d1 = dir1.clone().normalize();
    if (d0.lengthSq() < EPS || d1.lengthSq() < EPS || !(R > EPS)) return null;
    const cross = d0.x * d1.y - d0.y * d1.x;
    if (Math.abs(cross) < EPS) return null;
    const i = lineIntersection(p0, d0, p1, d1);
    if (!i) return null;
    const turnDir = cross > 0 ? 'L' : 'R';
    const n0 = leftNormal(d0);
    const n1 = leftNormal(d1);
    const n0i = turnDir === 'L' ? n0 : n0.clone().multiplyScalar(-1);
    const n1i = turnDir === 'L' ? n1.clone().multiplyScalar(-1) : n1;
    const p0o = i.clone().add(n0i.clone().multiplyScalar(R));
    const p1o = i.clone().add(n1i.clone().multiplyScalar(R));
    const c = lineIntersection(p0o, d0, p1o, d1);
    if (!c) return null;
    const t0 = c.clone().sub(n0i.clone().multiplyScalar(R));
    const t1 = c.clone().sub(n1i.clone().multiplyScalar(R));
    const a0 = Math.atan2(t0.y - c.y, t0.x - c.x);
    const a1 = Math.atan2(t1.y - c.y, t1.x - c.x);
    const da = arcDelta(a0, a1, turnDir);
    const totalLength = da * R;
    return {
        type: 'FILLET',
        R,
        arc0: {
            center: c.clone(),
            radius: R,
            startAngle: a0,
            deltaAngle: da,
            turnDir,
            startPoint: t0.clone(),
            endPoint: t1.clone()
        },
        straight: {
            start: t1.clone(),
            end: t1.clone(),
            length: 0,
            dir: d0.clone()
        },
        arc1: {
            center: c.clone(),
            radius: R,
            startAngle: a1,
            deltaAngle: 0,
            turnDir,
            startPoint: t1.clone(),
            endPoint: t1.clone()
        },
        totalLength,
        score: -totalLength,
        quality: {
            tangentDot0: 1,
            tangentDot1: 1,
            straightLength: 0,
            selfIntersecting: false
        }
    };
}

function appendSamplePoint(points, tangents, p, t) {
    const last = points[points.length - 1];
    if (last && last.distanceToSquared(p) < 1e-10) return;
    points.push(p);
    tangents.push(t);
}

export function sampleConnector(connector, stepMeters = 0.5) {
    if (!connector) return { points: [], tangents: [] };
    const step = Math.max(0.05, stepMeters ?? 0.5);
    const points = [];
    const tangents = [];
    const sampleArc = (arc) => {
        if (!arc || arc.deltaAngle < EPS) return;
        const len = arc.deltaAngle * arc.radius;
        const steps = Math.max(1, Math.ceil(len / step));
        const sign = arc.turnDir === 'L' ? 1 : -1;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const ang = arc.startAngle + sign * arc.deltaAngle * t;
            const p = new THREE.Vector2(
                arc.center.x + Math.cos(ang) * arc.radius,
                arc.center.y + Math.sin(ang) * arc.radius
            );
            const tan = travelTangent(arc.center, p, arc.turnDir);
            appendSamplePoint(points, tangents, p, tan);
        }
    };
    const sampleStraight = (straight) => {
        if (!straight) return;
        const start = straight.startPoint ?? straight.start ?? null;
        const end = straight.endPoint ?? straight.end ?? null;
        if (!start || !end) return;
        const len = straight.length ?? end.clone().sub(start).length();
        if (len < EPS) return;
        const steps = Math.max(1, Math.ceil(len / step));
        const dir = straight.direction ?? straight.dir ?? end.clone().sub(start).normalize();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = start.clone().lerp(end, t);
            appendSamplePoint(points, tangents, p, dir.clone());
        }
    };
    const segments = Array.isArray(connector) ? connector : (connector.segments ?? null);
    if (segments && segments.length) {
        for (const seg of segments) {
            if (seg.type === 'ARC') sampleArc(seg);
            else if (seg.type === 'STRAIGHT') sampleStraight(seg);
        }
    } else {
        sampleArc(connector.arc0);
        sampleStraight(connector.straight);
        sampleArc(connector.arc1);
    }
    return { points, tangents };
}

function shapeFromEdges(left, right) {
    const shape = new THREE.Shape();
    if (!left.length || !right.length) return shape;
    shape.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) {
        shape.lineTo(left[i].x, left[i].y);
    }
    for (let i = right.length - 1; i >= 0; i--) {
        shape.lineTo(right[i].x, right[i].y);
    }
    shape.closePath();
    return shape;
}

export function buildRoadMeshesFromCenterline(points, tangents, roadWidth, curbWidth, curbHeight, metersPerRepeat = 4.0) {
    if (!points || points.length < 2 || !tangents || tangents.length !== points.length) {
        return { asphaltGeometry: null, curbGeometry: null, markingsGeometry: null };
    }
    const half = roadWidth * 0.5;
    const leftEdge = [];
    const rightEdge = [];
    const leftOuter = [];
    const rightOuter = [];
    for (let i = 0; i < points.length; i++) {
        const t = tangents[i].clone().normalize();
        const n = leftNormal(t);
        const p = points[i];
        leftEdge.push(p.clone().add(n.clone().multiplyScalar(half)));
        rightEdge.push(p.clone().add(n.clone().multiplyScalar(-half)));
        leftOuter.push(p.clone().add(n.clone().multiplyScalar(half + curbWidth)));
        rightOuter.push(p.clone().add(n.clone().multiplyScalar(-half - curbWidth)));
    }
    const roadShape = shapeFromEdges(leftEdge, rightEdge);
    const asphaltGeometry = new THREE.ShapeGeometry(roadShape);
    asphaltGeometry.rotateX(-Math.PI / 2);
    applyWorldSpaceUV_XZ(asphaltGeometry, metersPerRepeat);
    const curbOptions = {
        depth: Math.max(0.01, curbHeight),
        bevelEnabled: false,
        curveSegments: 12
    };
    const leftShape = shapeFromEdges(leftOuter, leftEdge);
    const rightShape = shapeFromEdges(rightEdge, rightOuter);
    const curbLeft = new THREE.ExtrudeGeometry(leftShape, curbOptions);
    const curbRight = new THREE.ExtrudeGeometry(rightShape, curbOptions);
    curbLeft.rotateX(-Math.PI / 2);
    curbRight.rotateX(-Math.PI / 2);
    const curbGeometry = mergeBufferGeometries([curbLeft, curbRight]);
    return { asphaltGeometry, curbGeometry, markingsGeometry: null };
}

export function buildConnectorDemoGroup() {
    const group = new THREE.Group();
    const p0 = new THREE.Vector2(-12, -4);
    const dir0 = new THREE.Vector2(1, 0);
    const p1 = new THREE.Vector2(8, 10);
    const dir1 = new THREE.Vector2(0, -1);
    const connector = solveConnectorPath({
        start: { position: p0, direction: dir0 },
        end: { position: p1, direction: dir1 },
        radius: 4.5,
        allowFallback: true
    });
    const { points, tangents } = sampleConnector(connector, 0.5);
    const { asphaltGeometry, curbGeometry } = buildRoadMeshesFromCenterline(points, tangents, 6.4, 0.3, 0.18, 3.5);
    if (asphaltGeometry) {
        const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.95 });
        const asphaltMesh = new THREE.Mesh(asphaltGeometry, asphaltMat);
        asphaltMesh.receiveShadow = true;
        group.add(asphaltMesh);
    }
    if (curbGeometry) {
        const curbMat = new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 1.0 });
        const curbMesh = new THREE.Mesh(curbGeometry, curbMat);
        curbMesh.castShadow = true;
        curbMesh.receiveShadow = true;
        group.add(curbMesh);
    }
    return group;
}

export { applyWorldSpaceUV_XZ };
