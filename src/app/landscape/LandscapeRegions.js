// Defines explicit world-meter regions shared by native acquisition and editing.
// @ts-check
import { clonePlainData, requireBounds, requireCondition, requireFinite } from './internal/LandscapeValidation.js';

export const LANDSCAPE_MAX_POLYGON_VERTICES = 128;

/** @typedef {{type:'point',x:number,z:number}|{type:'circle',center:{x:number,z:number},radius:number}|{type:'rectangle',minX:number,maxX:number,minZ:number,maxZ:number}|{type:'polygon',points:Array<{x:number,z:number}>}} LandscapeRegion */

function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
function onSegment(a, b, point) {
    return cross(a, b, point) === 0 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
        && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z);
}
function segmentsIntersect(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    return (abC > 0 && abD < 0 || abC < 0 && abD > 0) && (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0)
        || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function segmentDistance(a, b, x, z) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

/** @param {LandscapeRegion} input @param {{allowPoint?:boolean}} [options] @returns {LandscapeRegion} */
export function validateLandscapeRegion(input, { allowPoint = true } = {}) {
    const region = clonePlainData(input, 'region');
    requireCondition(region && ['point', 'circle', 'rectangle', 'polygon'].includes(region.type), 'region must be a point, circle, rectangle, or polygon');
    if (region.type === 'point') {
        requireCondition(allowPoint, 'editing requires an explicit circle, rectangle, or polygon extent');
        requireFinite(region.x, 'region.x');
        requireFinite(region.z, 'region.z');
    } else if (region.type === 'circle') {
        requireFinite(region.center?.x, 'region.center.x');
        requireFinite(region.center?.z, 'region.center.z');
        requireFinite(region.radius, 'region.radius');
        requireCondition(region.radius > 0, 'region.radius must be positive');
    } else if (region.type === 'polygon') {
        requireCondition(region.holes === undefined, 'polygon holes are not supported');
        requireCondition(Array.isArray(region.points) && region.points.length >= 3 && region.points.length <= LANDSCAPE_MAX_POLYGON_VERTICES, `polygon requires 3..${LANDSCAPE_MAX_POLYGON_VERTICES} vertices`);
        for (const point of region.points) { requireFinite(point.x, 'polygon.x'); requireFinite(point.z, 'polygon.z'); }
        let area = 0;
        const count = region.points.length;
        for (let i = 0; i < count; i++) {
            const a = region.points[i], b = region.points[(i + 1) % count];
            requireCondition(a.x !== b.x || a.z !== b.z, 'polygon has a zero-length edge; do not repeat the closing vertex');
            area += cross(region.points[0], a, b);
            for (let j = i + 1; j < count; j++) {
                if (j === i + 1 || i === 0 && j === count - 1) continue;
                requireCondition(!segmentsIntersect(a, b, region.points[j], region.points[(j + 1) % count]), 'polygon must be simple without crossings or repeated vertices');
            }
            const c = region.points[(i + 2) % count];
            requireCondition(!(cross(a, b, c) === 0 && (onSegment(a, b, c) || onSegment(b, c, a))), 'polygon has overlapping adjacent edges');
        }
        requireCondition(Number.isFinite(area) && area !== 0, 'polygon must have finite nonzero area');
    } else requireBounds(region, 'region');
    return region;
}

/** @param {LandscapeRegion} region @returns {{minX:number,maxX:number,minZ:number,maxZ:number}} */
export function landscapeRegionBounds(region) {
    if (region.type === 'point') return { minX: region.x, maxX: region.x, minZ: region.z, maxZ: region.z };
    if (region.type === 'circle') return {
        minX: region.center.x - region.radius, maxX: region.center.x + region.radius,
        minZ: region.center.z - region.radius, maxZ: region.center.z + region.radius
    };
    if (region.type === 'polygon') return {
        minX: Math.min(...region.points.map(point => point.x)), maxX: Math.max(...region.points.map(point => point.x)),
        minZ: Math.min(...region.points.map(point => point.z)), maxZ: Math.max(...region.points.map(point => point.z))
    };
    return { minX: region.minX, maxX: region.maxX, minZ: region.minZ, maxZ: region.maxZ };
}

/** @param {LandscapeRegion} region @param {number} x @param {number} z @returns {boolean} */
export function landscapeRegionContains(region, x, z) {
    if (region.type === 'point') return x === region.x && z === region.z;
    if (region.type === 'circle') return Math.hypot(x - region.center.x, z - region.center.z) <= region.radius;
    if (region.type === 'polygon') {
        let inside = false;
        const point = { x, z };
        for (let i = 0, j = region.points.length - 1; i < region.points.length; j = i++) {
            const a = region.points[j], b = region.points[i];
            if (onSegment(a, b, point)) return true;
            if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
        }
        return inside;
    }
    return x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ;
}

/** @param {LandscapeRegion} region @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @returns {boolean} */
export function landscapeRegionIntersectsBounds(region, bounds) {
    if (region.type === 'point') return region.x >= bounds.minX && region.x <= bounds.maxX && region.z >= bounds.minZ && region.z <= bounds.maxZ;
    if (region.type === 'circle') {
        const x = Math.max(bounds.minX, Math.min(bounds.maxX, region.center.x));
        const z = Math.max(bounds.minZ, Math.min(bounds.maxZ, region.center.z));
        return Math.hypot(x - region.center.x, z - region.center.z) <= region.radius;
    }
    if (region.type === 'polygon') {
        const corners = [{ x: bounds.minX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.minZ }, { x: bounds.maxX, z: bounds.maxZ }, { x: bounds.minX, z: bounds.maxZ }];
        if (corners.some(point => landscapeRegionContains(region, point.x, point.z))
            || region.points.some(point => point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ)) return true;
        return region.points.some((point, i) => corners.some((corner, j) => segmentsIntersect(point, region.points[(i + 1) % region.points.length], corner, corners[(j + 1) % 4])));
    }
    return region.maxX >= bounds.minX && region.minX <= bounds.maxX && region.maxZ >= bounds.minZ && region.minZ <= bounds.maxZ;
}

/** @param {LandscapeRegion} region @param {{type:'none'|'linear',distance?:number}} falloff @param {number} x @param {number} z @returns {number} */
export function landscapeRegionWeight(region, falloff, x, z) {
    if (!landscapeRegionContains(region, x, z)) return 0;
    if (falloff.type === 'none') return 1;
    const distance = region.type === 'circle' ? region.radius - Math.hypot(x - region.center.x, z - region.center.z)
        : region.type === 'polygon' ? Math.min(...region.points.map((point, i) => segmentDistance(point, region.points[(i + 1) % region.points.length], x, z)))
            : Math.min(x - region.minX, region.maxX - x, z - region.minZ, region.maxZ - z);
    return Math.min(1, Math.max(0, distance / falloff.distance));
}

/** Compares geometric fields without making JSON property order part of identity. */
export function landscapeRegionsEqual(first, second) {
    if (first.type !== second.type) return false;
    if (first.type === 'polygon') return first.points.length === second.points.length && first.points.every((point, index) => point.x === second.points[index].x && point.z === second.points[index].z);
    if (first.type === 'circle') return first.center.x === second.center.x && first.center.z === second.center.z && first.radius === second.radius;
    if (first.type === 'point') return first.x === second.x && first.z === second.z;
    return ['minX', 'maxX', 'minZ', 'maxZ'].every(key => first[key] === second[key]);
}
