// Authenticates retained coastal planning records and preserves their coordinate and advisory identities.
// @ts-check
import { validateLandscapeManifest } from './LandscapeManifest.js';
import { freezeData, requireCondition, requireFinite } from './internal/LandscapeValidation.js';
import { readBoundedResponse, resolveLandscapeUrl, verifyLandscapeHash } from './internal/LandscapePayloadIO.js';

export const LANDSCAPE_PLANNING_LIMITS = Object.freeze({ fileBytes: 512 * 1024, totalBytes: 768 * 1024, features: 512, points: 32768 });
export const LANDSCAPE_PLANNING_ROLES = Object.freeze(['planning-districts', 'planning-road-centerlines', 'planning-shoreline', 'planning-beach-reservations']);
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function coordinate(value, dimensions, manifest) {
    requireCondition(Array.isArray(value) && value.length === dimensions, `planning coordinate must contain ${dimensions} values`);
    value.forEach(number => requireFinite(number, 'planning coordinate'));
    const point = { x: value[0], y: dimensions === 3 ? value[1] : null, z: value[dimensions - 1] }, bounds = manifest.bounds;
    requireCondition(point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ, 'planning reference extends outside landscape bounds');
    return point;
}

/** @param {any} manifest @param {any} reference @param {any} data @returns {any[]} */
export function normalizeLandscapePlanningReference(manifest, reference, data) {
    requireCondition(LANDSCAPE_PLANNING_ROLES.includes(reference.role), 'unsupported planning reference role');
    const features = [];
    function feature(kind, record, type, values, dimensions, classification, metadata = {}) {
        requireCondition(Array.isArray(values) && values.length >= (type === 'polygon' ? 3 : type === 'polyline' ? 2 : 1)
            && values.length <= LANDSCAPE_PLANNING_LIMITS.points, 'planning geometry point count is invalid');
        requireCondition(typeof record.name === 'string' && record.name.length > 0 && record.name.length <= 160, 'planning feature name is required and bounded');
        const identity = record.id ?? slug(record.name);
        requireCondition((typeof identity === 'string' || Number.isSafeInteger(identity)) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(String(identity)), 'planning feature identity is invalid');
        const points = values.map(value => coordinate(value, dimensions, manifest));
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const point of points) {
            bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
            bounds.minZ = Math.min(bounds.minZ, point.z); bounds.maxZ = Math.max(bounds.maxZ, point.z);
        }
        features.push({ id: `${kind}/${identity}`, sourceId: record.id ?? null, name: record.name, kind, classification,
            geometry: { type, points }, bounds, source: { id: reference.id, sha256: reference.sha256, url: reference.url }, metadata });
    }
    if (reference.role === 'planning-districts') {
        requireCondition(Array.isArray(data) && data.length <= LANDSCAPE_PLANNING_LIMITS.features, 'district records must be a bounded array');
        for (const record of data) {
            requireFinite(record.target_elevation_m, 'district target elevation');
            feature('district', record, 'polygon', record.boundary_xz_m, 2, 'informational', {
                targetElevationMeters: record.target_elevation_m, designBand: String(record.typical_design_band_m ?? '') });
        }
    } else {
        requireCondition(/^X east, Y (elevation|sea level), Z north; metres$/.test(data?.coordinate_order), 'planning XYZ coordinate convention is missing or unsupported');
        if (reference.role === 'planning-road-centerlines') {
            requireCondition(Array.isArray(data.roads) && data.roads.length <= LANDSCAPE_PLANNING_LIMITS.features, 'road references must be a bounded array');
            for (const record of data.roads) {
                requireFinite(record.width_m, 'road reference width');
                requireCondition(record.width_m > 0 && record.width_m <= 1000, 'road reference width is invalid');
                feature('road', record, 'polyline', record.centerline_xyz_m, 3, 'advisory', { widthMeters: record.width_m,
                    roadType: String(record.type ?? ''), from: String(record.from ?? ''), to: String(record.to ?? '') });
            }
        } else if (reference.role === 'planning-shoreline') {
            feature('shoreline', { id: data.id ?? 'source', name: data.name ?? 'Retained shoreline' }, 'polyline', data.points_xyz_m, 3, 'informational');
        } else {
            requireCondition(Array.isArray(data.points) && data.points.length <= LANDSCAPE_PLANNING_LIMITS.features, 'beach references must be a bounded array');
            for (const record of data.points) {
                let footprintMeters = null;
                if (record.footprint_m !== undefined) {
                    requireCondition(Array.isArray(record.footprint_m) && record.footprint_m.length === 2
                        && record.footprint_m.every(value => Number.isFinite(value) && value > 0 && value <= 1000), 'reference footprint dimensions are invalid');
                    footprintMeters = { width: record.footprint_m[0], depth: record.footprint_m[1], orientation: 'source-unspecified' };
                }
                feature('point', record, 'point', [record.xyz_m], 3, footprintMeters ? 'reservation' : 'informational',
                    { footprintMeters, note: String(record.note ?? '') });
            }
            if (data.open_view_corridor_xz_m) feature('view-corridor', { id: 'beach-open-view', name: 'Beach open view corridor' }, 'polygon', data.open_view_corridor_xz_m, 2, 'advisory', { note: 'Retained open view reference; future constraint policy is separate.' });
        }
    }
    requireCondition(features.length <= LANDSCAPE_PLANNING_LIMITS.features, 'too many planning features');
    requireCondition(features.reduce((count, item) => count + item.geometry.points.length, 0) <= LANDSCAPE_PLANNING_LIMITS.points, 'planning coordinates exceed the point budget');
    return freezeData(features);
}

/** @param {any} input @param {{manifestUrl:string|URL,fetchImpl?:typeof fetch,signal?:AbortSignal}} options */
export async function loadLandscapePlanningReferences(input, { manifestUrl, fetchImpl = globalThis.fetch, signal }) {
    const manifest = validateLandscapeManifest(input), base = resolveLandscapeUrl(manifestUrl);
    const references = manifest.references.filter(reference => LANDSCAPE_PLANNING_ROLES.includes(reference.role));
    let sourceBytes = 0, pointCount = 0;
    for (const reference of references) {
        requireCondition(reference.encoding === 'json' && reference.byteLength <= LANDSCAPE_PLANNING_LIMITS.fileBytes, 'planning JSON exceeds its per-file budget');
        sourceBytes += reference.byteLength;
    }
    requireCondition(sourceBytes <= LANDSCAPE_PLANNING_LIMITS.totalBytes, 'planning JSON exceeds its total source budget');
    const features = [], ids = new Set();
    for (const reference of references) {
        signal?.throwIfAborted();
        const response = await fetchImpl(new URL(reference.url, base).href, { signal });
        const bytes = await readBoundedResponse(response, reference.byteLength, true, `planning reference ${reference.id}`);
        await verifyLandscapeHash(bytes, reference.sha256, `planning reference ${reference.id}`); signal?.throwIfAborted();
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        for (const feature of normalizeLandscapePlanningReference(manifest, reference, parsed)) {
            requireCondition(!ids.has(feature.id), `duplicate planning feature ${feature.id}`);
            ids.add(feature.id); features.push(feature); pointCount += feature.geometry.points.length;
            requireCondition(features.length <= LANDSCAPE_PLANNING_LIMITS.features && pointCount <= LANDSCAPE_PLANNING_LIMITS.points, 'planning reference aggregate exceeds its feature/point budget');
        }
    }
    signal?.throwIfAborted();
    return freezeData({ sourceRevision: manifest.revision, features, sourceBytes, pointCount,
        dependency: references.map(reference => ({ id: reference.id, sha256: reference.sha256 })),
        numericBytes: pointCount * 3 * 8, accuracy: 'retained-planning-reference', authoritativeTerrain: false });
}
