// Builds the asset sets of a validated ecosystem recipe (AI 599 D4): placeholder rocks and catalog vegetation per LOD, with their bytes reserved in the ecosystem share.
// @ts-check
import { createEcosystemPlaceholderRocks } from './EcosystemPlaceholderRocks.js';
import { loadEcosystemCatalogAsset } from './EcosystemCatalogAssets.js';

/**
 * @param {{recipe:any,renderer:any,ledger:any,signal?:AbortSignal}} options recipe is a validated ecosystem recipe; ledger the view's ecosystem share
 *   (createLandscapeEcosystemLedger), where every set reserves `ecosystem/assets/<id>` with its CPU and GPU bytes (released on dispose)
 * @returns {Promise<Readonly<{ids:ReadonlyArray<string>,get(id:string):any,snapshot():any,dispose():void}>>} a set holds {id, kind, variants, footprintRadiusMeters, heightMeters,
 *   lods:[{level, geometry, impostor|null, textures|null, textured, triangles, drawTriangles, vertices, bytes}], bytes:{cpuBytes, gpuBytes}, loadMs}
 */
export async function createEcosystemAssetSets({ recipe, renderer, ledger, signal }) {
    if (!recipe?.assets || typeof recipe.assets !== 'object') throw new Error('[LandscapeEcosystem] Asset sets need a validated recipe');
    if (!renderer?.isWebGLRenderer) throw new Error('[LandscapeEcosystem] Asset sets need the view renderer');
    if (!ledger || typeof ledger.reserve !== 'function' || typeof ledger.release !== 'function') throw new Error('[LandscapeEcosystem] Asset sets need the ecosystem share');
    const started = performance.now(), sets = new Map(), reserved = [];
    const release = () => { for (const { key, set } of reserved.splice(0)) { set.dispose(); ledger.release(key); } };
    try {
        for (const [id, asset] of Object.entries(recipe.assets)) {
            signal?.throwIfAborted();
            const set = asset.kind === 'placeholder-rocks' ? createEcosystemPlaceholderRocks(asset) : await loadEcosystemCatalogAsset({ asset, renderer, signal });
            signal?.throwIfAborted();
            const key = `ecosystem/assets/${id}`, admission = ledger.reserve(key, { cpuBytes: set.bytes.cpuBytes, gpuBytes: set.bytes.gpuBytes });
            if (!admission.admitted) { set.dispose(); throw new Error(`[LandscapeEcosystem] asset set ${id} (${set.bytes.cpuBytes} CPU / ${set.bytes.gpuBytes} GPU bytes) cannot fit the ecosystem share: ${admission.reason}`); }
            reserved.push({ key, set });
            sets.set(id, Object.freeze({ id, ...set }));
        }
    } catch (error) { release(); throw error; }
    let disposed = false;
    const loadMs = performance.now() - started;
    return Object.freeze({
        ids: Object.freeze([...sets.keys()]),
        /** @param {string} id */
        get(id) {
            const set = sets.get(id);
            if (!set) throw new Error(`[LandscapeEcosystem] unknown asset set ${String(id)}`);
            return set;
        },
        snapshot() {
            return { loadMs, disposed, cpuBytes: [...sets.values()].reduce((sum, set) => sum + set.bytes.cpuBytes, 0), gpuBytes: [...sets.values()].reduce((sum, set) => sum + set.bytes.gpuBytes, 0),
                sets: [...sets.values()].map(set => ({ id: set.id, kind: set.kind, variants: set.variants, species: set.species ?? null, footprintRadiusMeters: set.footprintRadiusMeters, heightMeters: set.heightMeters, loadMs: set.loadMs, cpuBytes: set.bytes.cpuBytes, gpuBytes: set.bytes.gpuBytes,
                    lods: set.lods.map(lod => ({ level: lod.level, triangles: lod.triangles, drawTriangles: lod.drawTriangles, vertices: lod.vertices, textured: lod.textured, impostor: lod.impostor !== null, bytes: lod.bytes })) })) };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            release();
            sets.clear();
        }
    });
}
