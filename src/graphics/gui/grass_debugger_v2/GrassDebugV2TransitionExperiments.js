// Use the adopted filtering/edge defaults while retaining lazy material copies for comparisons.
// @ts-check
import { createGrassDebugV2CanopyDiagnostic } from './GrassDebugV2CanopyDiagnostics.js';
import { captureGrassEnvironmentLobes, createGrassEnvironmentApproximation } from './GrassDebugV2EnvironmentApproximation.js';
import { loadGrassCanopyTextureAsset, createGrassCompressedCanopyMaterial } from './GrassDebugV2CanopyTextureAsset.js';

export const GRASS_TRANSITION_EXPERIMENTS = Object.freeze({ recommended: 'Default · 4× + edge strips', baseline: 'Previous baseline · 8× + edge grids', aniso4: '4× filtering only', strips: 'Edge strips only · 8×', simple_ibl: 'Approximate environment light', compressed: 'Offline BC3 / BC1 textures', chunks4: '4 m batches · all LODs', chunks8: '8 m batches · all LODs' });

export function createGrassDebugV2TransitionExperiments(renderer, environment, shadowDirection) {
    const variants = new Map(), textureCache = new Map(), baselines = new Map();
    let lobes, compressed;
    function baseline(source) {
        if (!baselines.has(source)) baselines.set(source, createGrassDebugV2CanopyDiagnostic(source, 'aniso8', { renderer, textureCache }));
        return baselines.get(source).material;
    }
    return Object.freeze({
        async prepare(id) {
            if (id === 'compressed' && !compressed) compressed = await loadGrassCanopyTextureAsset({ renderer, shadowDirection });
        },
        material(source, id) {
            if (!Object.hasOwn(GRASS_TRANSITION_EXPERIMENTS, id)) throw new Error('Unknown grass experiment: ' + id);
            if (['recommended', 'aniso4'].includes(id)) return source;
            if (['baseline', 'strips', 'chunks4', 'chunks8'].includes(id)) return baseline(source);
            if (!variants.has(id)) variants.set(id, new Map());
            const cache = variants.get(id);
            if (!cache.has(source)) cache.set(source, id === 'simple_ibl'
                ? createGrassEnvironmentApproximation(baseline(source), lobes ??= captureGrassEnvironmentLobes(renderer, environment))
                : createGrassCompressedCanopyMaterial(source, compressed));
            return cache.get(source).material;
        },
        dispose() { for (const cache of variants.values()) for (const value of cache.values()) value.dispose(); variants.clear();
            for (const value of baselines.values()) value.dispose(); baselines.clear();
            for (const texture of textureCache.values()) texture.dispose(); textureCache.clear(); compressed?.dispose(); },
        getSnapshot: () => ({ comparisonTextureCopies: textureCache.size, compressed: compressed?.getSnapshot().bake ?? null })
    });
}
