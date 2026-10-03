// Records terrain product provenance and spatial/channel invalidation without renderer ownership.
// @ts-check
import { landscapeRegionIntersectsBounds } from './LandscapeRegions.js';
import { clonePlainData, freezeData, requireBounds, requireCondition, requireId } from './internal/LandscapeValidation.js';

const CHANNELS = ['height', 'landCover', 'soil', 'water'];

/** @param {object} manifest @param {{bounds:object,channels:string[],algorithm:string}} options @returns {object} */
export function createLandscapeDependency(manifest, { bounds, channels, algorithm }) {
    bounds = clonePlainData(bounds, 'dependency bounds'); requireBounds(bounds, 'dependency bounds'); requireId(algorithm, 'dependency algorithm');
    requireCondition(Array.isArray(channels) && channels.length > 0 && channels.every(channel => CHANNELS.includes(channel)), 'unsupported dependency channels');
    channels = [...new Set(channels)].sort();
    const usesCover = channels.includes('landCover') || channels.includes('soil');
    const usesHeight = channels.includes('height') || channels.includes('water');
    const records = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel && landscapeRegionIntersectsBounds({ type: 'rectangle', ...bounds }, chunk.bounds)).map(chunk => ({
        id: chunk.id, ...(usesHeight ? { height: chunk.channels.height.sha256 } : {}), ...(usesCover ? { landCover: chunk.channels.landCover.sha256 } : {})
    })).sort((a, b) => a.id.localeCompare(b.id));
    const content = { landscapeId: manifest.id, schemaVersion: manifest.schemaVersion, sourceSha256: manifest.provenance.sourceSha256,
        coordinates: manifest.coordinates, grid: manifest.grid, bounds, channels, algorithm, records,
        ...(channels.includes('soil') ? { soil: { ...manifest.soil, overrides: manifest.soil.overrides.filter(override => landscapeRegionIntersectsBounds(override.region, bounds)) } } : {}),
        ...(usesCover ? { landCover: manifest.landCover } : {}),
        ...(channels.includes('water') ? { seaLevel: manifest.coordinates.seaLevel } : {}) };
    return freezeData({ format: 'landscape-product-dependency', schemaVersion: 1, landscapeId: manifest.id, revision: manifest.revision,
        bounds, channels, algorithm, contentKey: JSON.stringify(content) });
}

/** @param {object} dependency @param {object} manifest @param {{requireRevision?:boolean}} [options] @returns {object} */
export function checkLandscapeDependency(dependency, manifest, { requireRevision = true } = {}) {
    requireCondition(dependency?.format === 'landscape-product-dependency' && dependency.schemaVersion === 1, 'unsupported landscape dependency');
    if (dependency.landscapeId !== manifest.id) return { status: 'stale', reason: 'landscape-changed' };
    if (requireRevision && dependency.revision !== manifest.revision) return { status: 'stale', reason: 'revision-changed' };
    const current = createLandscapeDependency(manifest, dependency);
    return current.contentKey === dependency.contentKey ? { status: 'current' } : { status: 'stale', reason: 'dependent-content-changed' };
}

/** @param {object} dependency @param {{bounds:object,channels:string[]}} change @returns {boolean} */
export function landscapeChangeInvalidates(dependency, change) {
    requireBounds(change.bounds, 'change.bounds');
    requireCondition(Array.isArray(change.channels) && change.channels.every(channel => CHANNELS.includes(channel)), 'invalid change channels');
    const channels = new Set(change.channels);
    if (channels.has('height')) channels.add('water');
    if (channels.has('landCover')) channels.add('soil');
    return dependency.channels.some(channel => channels.has(channel)) && landscapeRegionIntersectsBounds({ type: 'rectangle', ...dependency.bounds }, change.bounds);
}
