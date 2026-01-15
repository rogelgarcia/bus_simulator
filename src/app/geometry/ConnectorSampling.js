// src/app/geometry/ConnectorSampling.js
// Samples 2D connector segments into point + tangent lists for debug and road rendering.
import * as THREE from 'three';

const EPS = 1e-8;

function leftNormal(dir) {
    return new THREE.Vector2(-dir.y, dir.x);
}

function travelTangent(center, pt, turn) {
    const r = pt.clone().sub(center);
    const t = (turn === 'L') ? leftNormal(r) : leftNormal(r).multiplyScalar(-1);
    const len = t.length();
    if (len < EPS) return new THREE.Vector2(0, 0);
    return t.multiplyScalar(1 / len);
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
        if (!arc || (arc.deltaAngle ?? 0) < EPS) return;
        const radius = Number(arc.radius) || 0;
        if (!(radius > EPS)) return;
        const len = arc.deltaAngle * radius;
        const steps = Math.max(1, Math.ceil(len / step));
        const sign = arc.turnDir === 'L' ? 1 : -1;
        const center = arc.center ?? null;
        if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
        const startAngle = Number(arc.startAngle) || 0;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const ang = startAngle + sign * arc.deltaAngle * t;
            const p = new THREE.Vector2(
                center.x + Math.cos(ang) * radius,
                center.y + Math.sin(ang) * radius
            );
            const tan = travelTangent(new THREE.Vector2(center.x, center.y), p, arc.turnDir);
            appendSamplePoint(points, tangents, p, tan);
        }
    };

    const sampleStraight = (straight) => {
        if (!straight) return;
        const start = straight.startPoint ?? straight.start ?? null;
        const end = straight.endPoint ?? straight.end ?? null;
        if (!start || !end) return;
        const startV = new THREE.Vector2(start.x, start.y);
        const endV = new THREE.Vector2(end.x, end.y);
        const length = Number(straight.length) || endV.clone().sub(startV).length();
        if (!(length > EPS)) return;
        const steps = Math.max(1, Math.ceil(length / step));
        const dir = straight.direction ?? straight.dir ?? null;
        const dirV = dir && Number.isFinite(dir.x) && Number.isFinite(dir.y)
            ? new THREE.Vector2(dir.x, dir.y).normalize()
            : endV.clone().sub(startV).normalize();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = startV.clone().lerp(endV, t);
            appendSamplePoint(points, tangents, p, dirV.clone());
        }
    };

    const segments = Array.isArray(connector) ? connector : (connector.segments ?? null);
    if (segments && segments.length) {
        for (const seg of segments) {
            if (seg?.type === 'ARC') sampleArc(seg);
            else if (seg?.type === 'STRAIGHT') sampleStraight(seg);
        }
    } else {
        sampleArc(connector.arc0);
        sampleStraight(connector.straight);
        sampleArc(connector.arc1);
    }

    return { points, tangents };
}

