// Applies explicit material-only catalog revisions without changing landscape samples or authoring history.
// @ts-check
import { isDeepStrictEqual } from 'node:util';
import { validateLandscapeManifest } from '../../src/app/landscape/index.js';
import { authoringHash, readAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';

/** @param {any} before @param {any} candidate */
export function assertAppearanceMaterialOnlyChange(before, candidate) {
    const restored = structuredClone(candidate);
    restored.revision = before.revision;
    if (restored.soil.catalog.length !== before.soil.catalog.length) throw new Error('Appearance publication changed non-material landscape data');
    restored.soil.catalog.forEach((soil, index) => { soil.materialId = before.soil.catalog[index].materialId; });
    if (!isDeepStrictEqual(restored, before)) throw new Error('Appearance publication changed non-material landscape data');
}

/** @param {any} landscape @param {string|undefined} file */
export async function prepareAppearanceMaterialBindings(landscape, file) {
    if (!file) return landscape;
    const binding = JSON.parse((await readAuthoringFile(file, 16 * 1024)).toString('utf8'));
    const ids = landscape.soil.catalog.map(soil => soil.id).sort();
    if (binding.format !== 'landscape-material-bindings' || binding.schemaVersion !== 1 || binding.landscapeId !== landscape.id
        || !binding.materialIds || Object.keys(binding.materialIds).sort().join(',') !== ids.join(',')
        || !Object.values(binding.materialIds).every(id => typeof id === 'string' && /^pbr\.[a-zA-Z0-9_-]+$/.test(id))) {
        throw new Error('Appearance material-bindings must provide every soil ID once for the selected landscape');
    }
    const candidate = structuredClone(landscape);
    for (const soil of candidate.soil.catalog) soil.materialId = binding.materialIds[soil.id];
    if (isDeepStrictEqual(candidate, landscape)) return landscape;
    candidate.revision = `materials-${authoringHash(JSON.stringify({ beforeRevision: landscape.revision, catalog: candidate.soil.catalog })).slice(0, 24)}`;
    assertAppearanceMaterialOnlyChange(landscape, candidate);
    return validateLandscapeManifest(candidate);
}
