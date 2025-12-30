// graphics/assets3d/generators/road_generator_utils/RoadGeometryCalc.js - Road geometry calculations.
// Computes lane widths and basic segment geometry values.
import { clamp } from '../internal_road/RoadMath.js';
import { DOUBLE, EPS, HALF, MIN_LANES_ONEWAY } from './RoadConstants.js';

export function laneCount(lanesF, lanesB) {
    const f = lanesF ?? 0;
    const b = lanesB ?? 0;
    const total = f + b;
    if (total <= 0) return 0;
    if (f === 0 || b === 0) return Math.max(MIN_LANES_ONEWAY, total);
    return total;
}

export function roadWidth(lanesF, lanesB, laneWidth, shoulder, tileSize) {
    const lanes = laneCount(lanesF, lanesB);
    const raw = lanes * laneWidth + shoulder * DOUBLE;
    return clamp(raw, laneWidth, tileSize);
}

export function segmentDataFromEndpoints(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return null;
    return {
        mid: { x: (p0.x + p1.x) * HALF, y: (p0.y + p1.y) * HALF },
        length: len
    };
}

export function offsetEndpoints(p0, p1, normal, offset) {
    return {
        start: { x: p0.x + normal.x * offset, y: p0.y + normal.y * offset },
        end: { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset }
    };
}

export function cross2(a, b) {
    return a.x * b.y - a.y * b.x;
}

export function dot2(a, b) {
    return a.x * b.x + a.y * b.y;
}
