// src/app/city/placement/internal/StreetLines.js
// Street lines: the boundary between a parcel and the road it faces.
//
// A parcel does not stop at the tile boundary, it stops at the KERB LINE: the
// outer edge of the sidewalk, which is the asphalt half width (lanes x lane
// width + shoulder) plus the curb thickness plus the sidewalk width. Roads are
// turned into keep-out bands once, and a side's street limit is a ray cast
// outward from that side: it EXTENDS a parcel across a tile boundary a narrow
// road does not fill, and PULLS one back when the tile row is narrower than
// the avenue that runs through it.
// @ts-check

const EPS = 1e-9;

// Mirrors ROAD_DEFAULTS (src/graphics/assets3d/generators/GeneratorParams.js).
// The planner is app-layer and cannot import renderer config, so callers pass
// the live values in; these are the documented boundary defaults.
export const CITY_ROAD_GEOMETRY_DEFAULTS = Object.freeze({
    laneWidth: 4.8,
    shoulder: 0.525,
    curbThickness: 0.48,
    sidewalkWidth: 1.875
});

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function normalizeRoadGeometry(input) {
    const d = CITY_ROAD_GEOMETRY_DEFAULTS;
    return Object.freeze({
        laneWidth: Math.max(0.1, num(input?.laneWidth, d.laneWidth)),
        shoulder: Math.max(0, num(input?.shoulder, d.shoulder)),
        curbThickness: Math.max(0, num(input?.curbThickness, d.curbThickness)),
        sidewalkWidth: Math.max(0, num(input?.sidewalkWidth, d.sidewalkWidth))
    });
}

function boundsOf(pts) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

function bandFromSegment({ a, b, offLeft, offRight, extendStart, extendEnd }) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (!(len > EPS)) return null;

    const ux = dx / len;
    const uz = dz / len;
    const rx = uz;
    const rz = -ux;

    const sx = a.x - ux * extendStart;
    const sz = a.z - uz * extendStart;
    const ex = b.x + ux * extendEnd;
    const ez = b.z + uz * extendEnd;

    const pts = [
        { x: sx + rx * offRight, z: sz + rz * offRight },
        { x: ex + rx * offRight, z: ez + rz * offRight },
        { x: ex - rx * offLeft, z: ez - rz * offLeft },
        { x: sx - rx * offLeft, z: sz - rz * offLeft }
    ];
    return { pts, ...boundsOf(pts) };
}

function roadWorldPoints(road, map) {
    if (Array.isArray(road?.points) && road.points.length >= 2) {
        return road.points
            .map((p) => ({ x: Number(p?.x), z: Number.isFinite(p?.z) ? Number(p.z) : Number(p?.y) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
    }
    if (road?.a && road?.b && map?.tileToWorldCenter) {
        const p0 = map.tileToWorldCenter(road.a.x | 0, road.a.y | 0);
        const p1 = map.tileToWorldCenter(road.b.x | 0, road.b.y | 0);
        return [{ x: p0.x, z: p0.z }, { x: p1.x, z: p1.z }];
    }
    return [];
}

/**
 * Road keep-out bands: one convex quad per road segment, covering asphalt,
 * curb and sidewalk on both sides. Interior polyline joints are extended so
 * the band chain has no gap at a bend.
 */
export function buildStreetBands({ map, roadGeometry } = {}) {
    const geom = normalizeRoadGeometry(roadGeometry);
    const hard = geom.shoulder + geom.curbThickness + geom.sidewalkWidth;
    const roads = Array.isArray(map?.roadSegments) ? map.roadSegments : [];
    const bands = [];

    for (const road of roads) {
        if (!road) continue;
        const pts = roadWorldPoints(road, map);
        if (pts.length < 2) continue;

        const offRight = Math.max(0, road.lanesF ?? 0) * geom.laneWidth + hard;
        const offLeft = Math.max(0, road.lanesB ?? 0) * geom.laneWidth + hard;
        const joint = Math.max(offLeft, offRight);

        for (let i = 0; i + 1 < pts.length; i++) {
            const band = bandFromSegment({
                a: pts[i],
                b: pts[i + 1],
                offLeft,
                offRight,
                extendStart: i > 0 ? joint : 0,
                extendEnd: i + 2 < pts.length ? joint : 0
            });
            if (band) bands.push(band);
        }
    }

    return bands;
}

function pointInsideBand(x, z, band) {
    if (x < band.minX - EPS || x > band.maxX + EPS || z < band.minZ - EPS || z > band.maxZ + EPS) return false;
    const pts = band.pts;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p = pts[i];
        const q = pts[j];
        if ((p.z > z) !== (q.z > z) && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) inside = !inside;
    }
    return inside;
}

function rayFirstHit(ox, oz, dx, dz, bands, maxDist) {
    let best = Infinity;
    for (const band of bands) {
        const pts = band.pts;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const ex = b.x - a.x;
            const ez = b.z - a.z;
            const denom = dx * ez - dz * ex;
            if (Math.abs(denom) < 1e-12) continue;
            const wx = a.x - ox;
            const wz = a.z - oz;
            const t = (wx * ez - wz * ex) / denom;
            const u = (wx * dz - wz * dx) / denom;
            if (u < -1e-6 || u > 1 + 1e-6) continue;
            if (t < -1e-6 || t > maxDist) continue;
            if (t < best) best = Math.max(0, t);
        }
    }
    return Number.isFinite(best) ? best : null;
}

/**
 * Signed outward offset from a parcel side to the street line it faces.
 * Positive extends the side outward, negative pulls it back. Returns null
 * when no road is within reach of that side (reported by the caller; the
 * model never silently falls back to the tile boundary).
 */
export function computeStreetOffset({ bands, side, rect, maxSearchMeters, sampleCount } = {}) {
    if (!Array.isArray(bands) || !bands.length) return null;

    const axisZ = side === 'north' || side === 'south';
    const outward = (side === 'north' || side === 'east') ? 1 : -1;
    const edge = side === 'north' ? rect.maxZ
        : side === 'south' ? rect.minZ
            : side === 'east' ? rect.maxX
                : rect.minX;
    const spanMin = axisZ ? rect.minX : rect.minZ;
    const spanMax = axisZ ? rect.maxX : rect.maxZ;

    const count = Math.max(2, sampleCount | 0);
    const dx = axisZ ? 0 : outward;
    const dz = axisZ ? outward : 0;

    let best = null;
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const along = spanMin + (spanMax - spanMin) * t;
        const ox = axisZ ? along : edge;
        const oz = axisZ ? edge : along;

        let offset = null;
        if (bands.some((band) => pointInsideBand(ox, oz, band))) {
            // Already inside the road band: pull back to its near boundary.
            const back = rayFirstHit(ox, oz, -dx, -dz, bands, maxSearchMeters);
            if (back !== null) offset = -back;
        } else {
            const forward = rayFirstHit(ox, oz, dx, dz, bands, maxSearchMeters);
            if (forward !== null) offset = forward;
        }

        if (offset === null) continue;
        if (best === null || offset < best) best = offset;
    }

    return best;
}
