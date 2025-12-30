// graphics/assets3d/generators/road/connectors/ConnectorCurbUtils.js
const TAU = Math.PI * 2;

function wrapAngleLocal(a) {
    a = a % TAU;
    if (a < 0) a += TAU;
    return a;
}

function curbArcSpan(arc) {
    const dir = arc.turnDir === 'L' ? 1 : -1;
    const worldStart = arc.startAngle;
    const worldEnd = worldStart + dir * arc.deltaAngle;
    const start = wrapAngleLocal(-worldStart);
    const end = wrapAngleLocal(-worldEnd);
    if (arc.turnDir === 'L') return { startAng: end, spanAng: arc.deltaAngle };
    return { startAng: start, spanAng: arc.deltaAngle };
}

export function addConnectorCurbSegments({ curb, key, color, connector, curveSegs, curbY, curbH, curbT }) {
    if (!curb || !connector) return;
    const eps = 1e-4;
    const segments = Array.isArray(connector) ? connector : (connector.segments ?? []);
    if (!segments.length) return;
    for (const segment of segments) {
        if (segment.type === 'ARC' && segment.deltaAngle > eps) {
            const span = curbArcSpan(segment);
            curb.addArcSolidKey({
                key,
                centerX: segment.center.x,
                centerZ: segment.center.y,
                radiusCenter: segment.radius,
                startAng: span.startAng,
                spanAng: span.spanAng,
                curveSegs
            });
        } else if (segment.type === 'STRAIGHT') {
            const start = segment.startPoint;
            const end = segment.endPoint;
            if (!start || !end) continue;
            const s = end.clone().sub(start);
            const len = s.length();
            if (len > eps) {
                const mid = start.clone().add(end).multiplyScalar(0.5);
                const dir = segment.direction ? segment.direction.clone() : s.multiplyScalar(1 / len);
                const ry = Math.atan2(-dir.y, dir.x);
                curb.addBox(mid.x, curbY, mid.y, len, curbH, curbT, ry, color);
            }
        }
    }
}
