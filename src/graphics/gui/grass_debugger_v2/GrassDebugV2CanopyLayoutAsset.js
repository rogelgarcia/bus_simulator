// Authenticate and restore the optimized LOD4 source positions without running the search.
// @ts-check
import { validateGrassCanopyRenderedExposure } from './GrassDebugV2CanopyExposure.js';
export const GRASS_CANOPY_LAYOUT_URL = '/assets/public/grass/lod4/layout.json';
const SCHEMA = 'bus-simulator.grass-lod4-layout';

async function sha256(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

/** Source identity includes every compact attribute, topology, leaf selection and bake context. */
export async function grassCanopyLayoutIdentity(mesh, context) {
    const geometry = mesh.geometry, attributes = {};
    for (const name of Object.keys(geometry.attributes).sort()) {
        const attribute = geometry.attributes[name], array = attribute.array;
        attributes[name] = { type: array.constructor.name, itemSize: attribute.itemSize, normalized: attribute.normalized,
            hash: await sha256(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) };
    }
    const index = geometry.index.array;
    const input = { recipe: 1, context, attributes, index: { type: index.constructor.name,
        hash: await sha256(new Uint8Array(index.buffer, index.byteOffset, index.byteLength)) }, ranges: mesh.userData.grassLeafRanges };
    return { hash: await sha256(new TextEncoder().encode(JSON.stringify(input))),
        vertices: geometry.attributes.position.count, leaves: mesh.userData.grassLeafRanges.length, ...context };
}

/** Validate serialized data before it can mutate the source or be published. */
export function validateGrassCanopyLayoutAsset(asset, expectedSource = null) {
    if (asset?.schema === SCHEMA && asset.version === 2) {
        if (asset.source?.periodMeters !== 2 || asset.variants?.length !== 2
            || asset.source.feedbackProfile !== 'hdr-display-v1'
            || !(asset.compatibility?.changedShoots > 0) || !asset.compatibility.shadowsProtected)
            throw new Error('Invalid compiled LOD4 tile pair.');
        for (const variant of asset.variants) validateGrassCanopyLayoutAsset(variant, expectedSource ?? asset.source);
        if (JSON.stringify(asset.source) !== JSON.stringify(asset.variants[0].source)) throw new Error('LOD4 pair source mismatch.');
        return asset;
    }
    if (asset?.schema !== SCHEMA || asset.version !== 1 || !/^[a-f0-9]{64}$/.test(asset.source?.hash)
        || !Number.isInteger(asset.source.vertices) || asset.source.vertices < 1
        || !Number.isInteger(asset.source.leaves) || asset.source.leaves < 1
        || ![1, 2].includes(asset.source.periodMeters) || !Array.isArray(asset.positions)
        || asset.positions.length !== asset.source.vertices * 3 || !asset.positions.every(Number.isFinite)
        || !asset.placement || asset.optimization?.algorithm !== 'material-feedback'
        || asset.renderedOptimization?.algorithm !== 'rendered-feedback')
        throw new Error('Invalid compiled LOD4 layout. Regenerate materials/grass/lod4-layout.');
    if (expectedSource && JSON.stringify(asset.source) !== JSON.stringify(expectedSource))
        throw new Error('Compiled LOD4 layout does not match the current source. Regenerate materials/grass/lod4-layout.');
    const o = asset.optimization, r = asset.renderedOptimization;
    if (asset.source.feedbackProfile === 'hdr-display-v1') {
        const pipeline = r.renderPipeline;
        if (pipeline?.profile !== 'hdr-display-v1' || pipeline.hdrFormat !== 'RGBA16F'
            || pipeline.displayTransform !== 'scene-color-grading-output'
            || !Number.isFinite(pipeline.exposure) || pipeline.exposure <= 0
            || !Number.isFinite(pipeline.toneMapping))
            throw new Error('Compiled LOD4 layout lacks an HDR display validation.');
        for (const views of [r.views, r.finalViews, r.verification?.initial, r.verification?.candidate]) {
            if (!Array.isArray(views) || views.length !== 48)
                throw new Error('Compiled LOD4 layout lacks 48-view exposure evidence.');
            views.forEach(validateGrassCanopyRenderedExposure);
        }
    }
    if (![o.initialLoss, o.finalLoss, o.initialCoverage, o.finalCoverage].every(Number.isFinite)
        || o.finalLoss > o.initialLoss + 1e-8 || Math.abs(o.finalCoverage - o.initialCoverage) > .00601
        || r.verificationResolution !== 4096 || r.verificationShadowResolution !== 8192
        || typeof r.published !== 'boolean' || !r.verification)
        throw new Error('Compiled LOD4 layout has not passed pattern validation.');
    if (r.published && (!(r.verification.loss < 1.5) || !(r.verification.worstRatio <= 1.05)
        || Math.abs(r.verification.candidateMasks.coverage - r.verification.initialMasks.coverage) > .006
        || !['leaf', 'background'].every(key => r.verification.candidateMasks[key].every((v, c) =>
            Math.abs(v / r.verification.initialMasks[key][c] - 1) <= .02))))
        throw new Error('Compiled LOD4 layout failed rendered publication gates.');
    return asset;
}

export function createGrassCanopyLayoutAsset(mesh, source, reports) {
    return validateGrassCanopyLayoutAsset({ schema: SCHEMA, version: 1, source,
        positions: Array.from(mesh.geometry.attributes.position.array), ...reports });
}

export function createGrassCanopyLayoutPair(source, variants, compatibility) {
    return validateGrassCanopyLayoutAsset({ schema: SCHEMA, version: 2, source, variants, compatibility });
}

/** The optimizer may translate each leaf horizontally; shape, height and topology must remain intact. */
export function applyGrassCanopyLayoutAsset(mesh, asset, expectedSource) {
    validateGrassCanopyLayoutAsset(asset, expectedSource);
    if (asset.version !== 1) throw new Error('Apply each LOD4 tile variant separately.');
    const position = mesh.geometry.attributes.position, index = mesh.geometry.index, next = asset.positions;
    for (const range of mesh.userData.grassLeafRanges) {
        const first = index.getX(range.start), dx = next[first * 3] - position.getX(first), dz = next[first * 3 + 2] - position.getZ(first);
        for (let i = range.start; i < range.start + range.count; i++) {
            const vertex = index.getX(i), offset = vertex * 3;
            if (Math.abs(next[offset] - position.getX(vertex) - dx) > 2e-6
                || next[offset + 1] !== position.getY(vertex)
                || Math.abs(next[offset + 2] - position.getZ(vertex) - dz) > 2e-6)
                throw new Error('Compiled LOD4 layout changes a leaf shape instead of its position.');
        }
    }
    position.array.set(next); position.needsUpdate = true;
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
}

export async function loadGrassCanopyLayoutPair(meshes, source, url = GRASS_CANOPY_LAYOUT_URL) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Compiled LOD4 layout unavailable (${response.status}). Run node tools/bake.mjs --target materials/grass/lod4-layout --publish`);
    const asset = validateGrassCanopyLayoutAsset(await response.json(), source);
    if (asset.version !== 2) throw new Error('LOD4 needs the compiled 2 m tile pair. Regenerate materials/grass/lod4-layout.');
    meshes.forEach((mesh, i) => applyGrassCanopyLayoutAsset(mesh, asset.variants[i], source));
    return asset;
}

export async function loadGrassCanopyLayoutAsset(mesh, source, url = GRASS_CANOPY_LAYOUT_URL) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Compiled LOD4 layout unavailable (${response.status}). Run node tools/bake.mjs --target materials/grass/lod4-layout --publish`);
    const asset = await response.json(); applyGrassCanopyLayoutAsset(mesh, asset, source); return asset;
}
