// Defines explicit world-meter regions shared by native acquisition and editing.
// @ts-check
import { clonePlainData, requireBounds, requireCondition, requireFinite } from './internal/LandscapeValidation.js';

/** @typedef {{type:'point',x:number,z:number}|{type:'circle',center:{x:number,z:number},radius:number}|{type:'rectangle',minX:number,maxX:number,minZ:number,maxZ:number}} LandscapeRegion */

/** @param {LandscapeRegion} input @param {{allowPoint?:boolean}} [options] @returns {LandscapeRegion} */
export function validateLandscapeRegion(input, { allowPoint = true } = {}) {
    const region = clonePlainData(input, 'region');
    requireCondition(region && ['point', 'circle', 'rectangle'].includes(region.type), 'region must be a point, circle, or rectangle');
    if (region.type === 'point') {
        requireCondition(allowPoint, 'editing requires an explicit circle or rectangle extent');
        requireFinite(region.x, 'region.x');
        requireFinite(region.z, 'region.z');
    } else if (region.type === 'circle') {
        requireFinite(region.center?.x, 'region.center.x');
        requireFinite(region.center?.z, 'region.center.z');
        requireFinite(region.radius, 'region.radius');
        requireCondition(region.radius > 0, 'region.radius must be positive');
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
    return { minX: region.minX, maxX: region.maxX, minZ: region.minZ, maxZ: region.maxZ };
}

/** @param {LandscapeRegion} region @param {number} x @param {number} z @returns {boolean} */
export function landscapeRegionContains(region, x, z) {
    if (region.type === 'point') return x === region.x && z === region.z;
    if (region.type === 'circle') return Math.hypot(x - region.center.x, z - region.center.z) <= region.radius;
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
    return region.maxX >= bounds.minX && region.minX <= bounds.maxX && region.maxZ >= bounds.minZ && region.minZ <= bounds.maxZ;
}

/** @param {LandscapeRegion} region @param {{type:'none'|'linear',distance?:number}} falloff @param {number} x @param {number} z @returns {number} */
export function landscapeRegionWeight(region, falloff, x, z) {
    if (!landscapeRegionContains(region, x, z)) return 0;
    if (falloff.type === 'none') return 1;
    const distance = region.type === 'circle'
        ? region.radius - Math.hypot(x - region.center.x, z - region.center.z)
        : Math.min(x - region.minX, region.maxX - x, z - region.minZ, region.maxZ - z);
    return Math.min(1, Math.max(0, distance / falloff.distance));
}
