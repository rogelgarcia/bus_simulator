// Offline-only search for two compatible layouts; normal scene loads never import this module.
import { redistributeGrassDebugV2CanopySource } from './GrassDebugV2CanopySourceLayout.js';
import { optimizeGrassDebugV2CanopyPattern } from './GrassDebugV2CanopyPatternOptimizer.js';
import { refineGrassDebugV2CanopyRenderedPattern } from './GrassDebugV2CanopyRenderedOptimizer.js';
import { createGrassCanopyInteriorConstraint, varyGrassCanopyInterior, validateGrassCanopyPairBoundaries } from './GrassDebugV2CanopyTilePair.js';
import { createGrassCanopyLayoutAsset, createGrassCanopyLayoutPair } from './GrassDebugV2CanopyLayoutAsset.js';

export async function compileGrassCanopyTilePair(meshes, identity, options) {
    const shared = { ...options, periodMeters: identity.periodMeters, sun: identity.sun,
        sourceHeight: identity.sourceHeight, boundaryBandMeters: identity.boundaryBandMeters,
        shootIds: identity.tileIds.map(id => Math.floor(id / 2)) };
    const variants = [];
    for (const [i, mesh] of meshes.entries()) {
        const onProgress = message => options.onProgress?.(`Tile ${i + 1}/2 · ${message}`);
        if (i) mesh.geometry.attributes.position.copy(meshes[0].geometry.attributes.position);
        const placement = i ? varyGrassCanopyInterior(mesh, shared) : redistributeGrassDebugV2CanopySource(mesh, shared);
        const constraint = () => i ? createGrassCanopyInteriorConstraint(mesh, shared).canMove : () => true;
        const optimization = await optimizeGrassDebugV2CanopyPattern(mesh, { ...shared, onProgress, canMove: constraint() });
        const renderedOptimization = await refineGrassDebugV2CanopyRenderedPattern(mesh, { ...shared, onProgress, canMove: constraint() });
        variants.push(createGrassCanopyLayoutAsset(mesh, identity, { placement, optimization, renderedOptimization }));
    }
    const compatibility = validateGrassCanopyPairBoundaries(meshes, shared);
    return createGrassCanopyLayoutPair(identity, variants, compatibility);
}
