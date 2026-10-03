// Defines bounded survey shapes and exact horizontal overlap tests for planning reports.
import { validateLandscapeRegion, landscapeRegionBounds, landscapeRegionContains } from '../LandscapeRegions.js';
import { clonePlainData, requireCondition, requireFinite } from './LandscapeValidation.js';

export function validateReportShape(input) {
    if (input?.type === 'footprint') return { type: 'footprint', region: validateLandscapeRegion(input.region, { allowPoint: false }) };
    const shape = clonePlainData(input, 'report shape');
    requireCondition(shape?.type === 'corridor', 'report shape must be footprint or corridor');
    requireCondition(Array.isArray(shape.points) && shape.points.length >= 2 && shape.points.length <= 128, 'corridor needs 2..128 points');
    requireFinite(shape.widthMeters, 'corridor.widthMeters');
    requireCondition(shape.widthMeters > 0, 'corridor width must be positive');
    shape.points.forEach((point, index) => {
        requireFinite(point.x, 'corridor.x'); requireFinite(point.z, 'corridor.z');
        if (index) requireCondition(point.x !== shape.points[index - 1].x || point.z !== shape.points[index - 1].z, 'corridor has a zero-length segment');
    });
    return shape;
}

export function reportShapeBounds(shape) {
    if (shape.type === 'footprint') return landscapeRegionBounds(shape.region);
    const radius = shape.widthMeters / 2;
    return { minX: Math.min(...shape.points.map(p => p.x)) - radius, maxX: Math.max(...shape.points.map(p => p.x)) + radius,
        minZ: Math.min(...shape.points.map(p => p.z)) - radius, maxZ: Math.max(...shape.points.map(p => p.z)) + radius };
}

function distance(point, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
function segmentDistance(a, b, c, d) {
    const abc = cross(a, b, c), abd = cross(a, b, d), cda = cross(c, d, a), cdb = cross(c, d, b);
    if ((abc > 0 && abd < 0 || abc < 0 && abd > 0) && (cda > 0 && cdb < 0 || cda < 0 && cdb > 0)) return 0;
    return Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
}

function polygon(region) {
    if (region.type === 'polygon') return region.points;
    return [{ x: region.minX, z: region.minZ }, { x: region.maxX, z: region.minZ },
        { x: region.maxX, z: region.maxZ }, { x: region.minX, z: region.maxZ }];
}
function segments(points, closed = false) {
    return points.slice(0, closed ? points.length : -1).map((point, i) => [point, points[(i + 1) % points.length]]);
}

export function reportShapeContains(shape, point) {
    return shape.type === 'footprint' ? landscapeRegionContains(shape.region, point.x, point.z)
        : segments(shape.points).some(([a, b]) => distance(point, a, b) <= shape.widthMeters / 2);
}

function segmentIntersectsRegion(a, b, radius, region) {
    if (region.type === 'circle') return distance(region.center, a, b) <= radius + region.radius;
    if (landscapeRegionContains(region, a.x, a.z) || landscapeRegionContains(region, b.x, b.z)) return true;
    return segments(polygon(region), true).some(([c, d]) => segmentDistance(a, b, c, d) <= radius);
}

export function reportShapesOverlap(first, second) {
    if (first.type === 'corridor') {
        if (second.type === 'corridor') return segments(first.points).some(([a, b]) => segments(second.points).some(([c, d]) => segmentDistance(a, b, c, d) <= (first.widthMeters + second.widthMeters) / 2));
        return segments(first.points).some(([a, b]) => segmentIntersectsRegion(a, b, first.widthMeters / 2, second.region));
    }
    if (second.type === 'corridor') return reportShapesOverlap(second, first);
    const a = first.region, b = second.region;
    if (a.type === 'circle') {
        if (b.type === 'circle') return Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z) <= a.radius + b.radius;
        return landscapeRegionContains(b, a.center.x, a.center.z) || segments(polygon(b), true).some(([c, d]) => distance(a.center, c, d) <= a.radius);
    }
    if (b.type === 'circle') return reportShapesOverlap(second, first);
    const aa = polygon(a), bb = polygon(b);
    return aa.some(p => landscapeRegionContains(b, p.x, p.z)) || bb.some(p => landscapeRegionContains(a, p.x, p.z))
        || segments(aa, true).some(([c, d]) => segments(bb, true).some(([e, f]) => segmentDistance(c, d, e, f) === 0));
}

export function reportShapeArea(shape) {
    if (shape.type === 'corridor') {
        const length = segments(shape.points).reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.z - a.z), 0);
        return { squareMeters: length * shape.widthMeters + Math.PI * (shape.widthMeters / 2) ** 2, lengthMeters: length,
            exact: shape.points.length === 2, method: shape.points.length === 2 ? 'round-ended-capsule' : 'round-ended-sweep-upper-bound-overlaps-not-subtracted' };
    }
    const region = shape.region;
    if (region.type === 'circle') return { squareMeters: Math.PI * region.radius ** 2, exact: true, method: 'circle' };
    const points = polygon(region), anchor = points[0];
    return { squareMeters: Math.abs(points.reduce((sum, point, index) => sum + cross(anchor, point, points[(index + 1) % points.length]), 0)) / 2, exact: true, method: 'polygon-shoelace' };
}

export function reportProbes(shape, spacing, maxSamples) {
    const bounds = reportShapeBounds(shape), probes = [], keys = new Set();
    const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / spacing)), rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / spacing));
    requireCondition(columns * rows <= 65536, 'report candidate grid exceeds 65536; increase sampleSpacingMeters');
    const add = (point, profileDistance = null) => {
        const key = `${point.x}/${point.z}`;
        if (keys.has(key) && profileDistance === null) return;
        requireCondition(probes.length < maxSamples, `report exceeds ${maxSamples} probes; increase sampleSpacingMeters`);
        keys.add(key); probes.push({ ...point, profileDistance });
    };
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const point = { x: bounds.minX + (column + 0.5) * (bounds.maxX - bounds.minX) / columns,
            z: bounds.minZ + (row + 0.5) * (bounds.maxZ - bounds.minZ) / rows };
        if (reportShapeContains(shape, point)) add(point);
    }
    if (shape.type === 'corridor') {
        let traversed = 0;
        for (const [a, b] of segments(shape.points)) {
            const length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(length / spacing);
            requireCondition(count <= maxSamples, 'corridor profile exceeds probe budget; increase sampleSpacingMeters');
            for (let i = 0; i < count; i++) add({ x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count }, traversed + length * i / count);
            traversed += length;
        }
        add(shape.points.at(-1), traversed);
    } else if (shape.region.type === 'circle') add(shape.region.center);
    else polygon(shape.region).forEach(point => add(point));
    return probes;
}
