// Defines the optional city-owned landscape reference and rigid coordinate conversion.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { loadLandscapeManifest } from './LandscapePayload.js';
import { validateLandscapeRegion } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireBounds, requireCondition, requireFinite, requireId, requireRelativeUrl } from './internal/LandscapeValidation.js';

export const LANDSCAPE_CITY_BINDING_CAPABILITY = 'landscape-reference-v1';

/** @typedef {{format:'city-landscape-binding',schemaVersion:1,landscapeId:string,manifestUrl:string,revision:string,transform:{translation:{x:number,y:number,z:number},yawDegrees:number,scale:1},extent:{minX:number,maxX:number,minZ:number,maxZ:number},capabilities:string[]}} LandscapeCityBinding */

/** @param {LandscapeCityBinding} input @param {{manifest?:object}} [options] @returns {LandscapeCityBinding} */
export function validateLandscapeCityBinding(input, { manifest } = {}) {
    const binding = clonePlainData(input, 'city landscape binding');
    requireCondition(binding?.format === 'city-landscape-binding' && binding.schemaVersion === 1, 'unsupported city landscape binding format/schemaVersion');
    requireId(binding.landscapeId, 'binding.landscapeId');
    requireId(binding.revision, 'binding.revision');
    requireRelativeUrl(binding.manifestUrl, 'binding.manifestUrl');
    requireCondition(binding.manifestUrl.startsWith('assets/public/landscape/') && binding.manifestUrl.endsWith('.json'), 'binding.manifestUrl must reference retained assets/public/landscape/ JSON');
    requireBounds(binding.extent, 'binding.extent');
    for (const axis of ['x', 'y', 'z']) requireFinite(binding.transform?.translation?.[axis], `binding.transform.translation.${axis}`);
    requireFinite(binding.transform?.yawDegrees, 'binding.transform.yawDegrees');
    requireCondition(binding.transform.scale === 1, 'city landscape binding requires meter-preserving scale:1');
    requireCondition(Array.isArray(binding.capabilities) && binding.capabilities.length === 1 && binding.capabilities[0] === LANDSCAPE_CITY_BINDING_CAPABILITY, 'unsupported city landscape binding capabilities; landscape-reference-v1 is required');
    if (manifest) {
        const source = validateLandscapeManifest(manifest);
        requireCondition(source.id === binding.landscapeId, 'city landscape identity mismatch');
        requireCondition(source.revision === binding.revision, `city landscape revision is stale: expected ${binding.revision}, got ${source.revision}; explicitly rebind after reviewing terrain changes`);
        const a = binding.extent, b = source.bounds;
        requireCondition(a.minX >= b.minX && a.maxX <= b.maxX && a.minZ >= b.minZ && a.maxZ <= b.maxZ, 'city landscape extent is outside the manifest bounds');
    }
    return freezeData(binding);
}

function convertPoint(binding, point, inverse) {
    requireFinite(point?.x, 'point.x');
    requireFinite(point?.z, 'point.z');
    if (point.y !== undefined) requireFinite(point.y, 'point.y');
    const angle = (binding.transform.yawDegrees % 360) * Math.PI / 180;
    const c = Math.cos(angle), s = Math.sin(angle), t = binding.transform.translation;
    const x = inverse ? point.x - t.x : point.x, z = inverse ? point.z - t.z : point.z;
    return {
        x: inverse ? c * x - s * z : c * x + s * z + t.x,
        ...(point.y === undefined ? {} : { y: inverse ? point.y - t.y : point.y + t.y }),
        z: inverse ? s * x + c * z : -s * x + c * z + t.z
    };
}

/** @param {LandscapeCityBinding} input @param {{x:number,y?:number,z:number}} point */
export function landscapePointToCity(input, point) { return convertPoint(validateLandscapeCityBinding(input), point, false); }

/** @param {LandscapeCityBinding} input @param {{x:number,y?:number,z:number}} point */
export function cityPointToLandscape(input, point) { return convertPoint(validateLandscapeCityBinding(input), point, true); }

/** @param {LandscapeCityBinding} input @param {import('./LandscapeRegions.js').LandscapeRegion} inputRegion */
export function cityRegionToLandscape(input, inputRegion) {
    const binding = validateLandscapeCityBinding(input), region = validateLandscapeRegion(inputRegion);
    const point = value => convertPoint(binding, value, true);
    if (region.type === 'point') return freezeData({ type: 'point', ...point(region) });
    if (region.type === 'circle') return freezeData({ type: 'circle', center: point(region.center), radius: region.radius });
    const points = region.type === 'polygon' ? region.points : [
        { x: region.minX, z: region.minZ }, { x: region.maxX, z: region.minZ },
        { x: region.maxX, z: region.maxZ }, { x: region.minX, z: region.maxZ }
    ];
    return freezeData(validateLandscapeRegion({ type: 'polygon', points: points.map(point) }));
}

/** @param {LandscapeCityBinding} input @param {object[]} reservations */
export function cityReservationsToLandscapeConstraints(input, reservations) {
    const binding = validateLandscapeCityBinding(input);
    requireCondition(Array.isArray(reservations), 'resolved city reservations must be an array');
    const ids = new Set();
    return freezeData(reservations.map(reservation => {
        requireId(reservation?.id, 'reservation.id');
        requireCondition(!ids.has(reservation.id), `duplicate reservation ${reservation.id}`);
        ids.add(reservation.id);
        requireCondition(Array.isArray(reservation.loops) && reservation.loops.length === 1, `reservation ${reservation.id} requires one resolved footprint loop`);
        const region = cityRegionToLandscape(binding, { type: 'polygon', points: reservation.loops[0].map(({ x, z }) => ({ x, z })) });
        return { id: reservation.id, classification: 'reservation', shape: { type: 'footprint', region } };
    }));
}

/** @param {LandscapeCityBinding} input @param {{baseUrl?:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal}} [options] */
export async function loadCityLandscape(input, { baseUrl = new URL('../../../', import.meta.url), fetchImpl, signal } = {}) {
    const binding = validateLandscapeCityBinding(input);
    const base = new URL(baseUrl);
    requireCondition(base.protocol === 'http:' || base.protocol === 'https:', 'city landscape loading requires an HTTP(S) application base URL');
    const manifestUrl = new URL(binding.manifestUrl, base).href;
    const manifest = await loadLandscapeManifest(manifestUrl, { fetchImpl, signal });
    validateLandscapeCityBinding(binding, { manifest });
    return Object.freeze({ binding, manifest, manifestUrl });
}

/** Rejects flat-only consumers before they load geometry or caches. @param {object} spec @param {string} consumer */
export function assertFlatCityCapability(spec, consumer) {
    if (spec?.landscape === undefined || spec.landscape === null) return;
    validateLandscapeCityBinding(spec.landscape);
    throw new Error(`[Landscape] ${consumer} does not support landscape-bound cities; use the Map Debugger reference plan and Landscape Fabrication. Terrain road, slab, collision and bake adapters are not implemented.`);
}
