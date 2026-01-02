// src/app/geometry/dubins/dubinsSolve.js
// src/geometry/dubins/dubinsSolve.js
import { DubinsPath, DubinsPathType } from './DubinsCurves.js';

const SEGMENTS_BY_TYPE = {
    [DubinsPathType.LSL]: ['L', 'S', 'L'],
    [DubinsPathType.LSR]: ['L', 'S', 'R'],
    [DubinsPathType.RSL]: ['R', 'S', 'L'],
    [DubinsPathType.RSR]: ['R', 'S', 'R'],
    [DubinsPathType.RLR]: ['R', 'L', 'R'],
    [DubinsPathType.LRL]: ['L', 'R', 'L']
};

function resolveHeading(pose) {
    if (!pose) return null;
    if (Number.isFinite(pose.heading)) return pose.heading;
    const dir = pose.direction ?? pose.dir ?? null;
    if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.y)) return null;
    return Math.atan2(dir.y, dir.x);
}

function resolvePosition(pose) {
    const pos = pose?.position ?? pose?.pos ?? null;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
    return pos;
}

export function dubinsSolve({ start, end, radius, pathType = null } = {}) {
    const startPos = resolvePosition(start);
    const endPos = resolvePosition(end);
    const startHeading = resolveHeading(start);
    const endHeading = resolveHeading(end);

    if (!startPos || !endPos || !Number.isFinite(startHeading) || !Number.isFinite(endHeading)) {
        return {
            ok: false,
            error: { code: 'invalid-input', message: 'start/end pose missing position or heading' },
            path: null,
            type: null
        };
    }

    if (!Number.isFinite(radius) || !(radius > 0)) {
        return {
            ok: false,
            error: { code: 'bad-radius', message: 'radius must be > 0' },
            path: null,
            type: null
        };
    }

    const q0 = [startPos.x, startPos.y, startHeading];
    const q1 = [endPos.x, endPos.y, endHeading];
    const path = pathType ? new DubinsPath(q0, q1, radius, pathType) : new DubinsPath(q0, q1, radius);

    if (!path.type) {
        return {
            ok: false,
            error: { code: 'no-path', message: 'dubins path not found' },
            path,
            type: null
        };
    }

    const segmentTypes = SEGMENTS_BY_TYPE[path.type] ?? null;
    return {
        ok: true,
        error: null,
        path,
        type: path.type,
        radius,
        startConfig: q0,
        endConfig: q1,
        segmentLengths: path.segmentLengths.slice(),
        segmentTypes
    };
}

export { SEGMENTS_BY_TYPE as DUBINS_SEGMENTS_BY_TYPE };
