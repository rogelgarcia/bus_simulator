// Reuses pure geometry plans only for exact live inputs; it never authorizes lighting compatibility.
// @ts-check
import { rawSha256Hex } from '../../illumination/package/RawSha256.js';

export const CITY_INPUT_SCHEMA = 'city-input-plans-v1';
export const CITY_INPUT_ALGORITHMS = Object.freeze([
    'src/app/city/BuildingSlabPlan.js',
    'src/app/city/BuildingSlabBoundary.js',
    'src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js',
    'src/app/city/precomputed/CityInputPlans.js'
]);

/** The slab caller supplies the resolved loops; omitted planner options use authenticated code defaults. */
export function slabInputKey(input) {
    return JSON.stringify([input.footprintLoops, input.sidewalkBoundaries ?? []]);
}

/** Hash the exact float32 corners and eligibility/material groups, not an exported object ID. */
export async function coplanarInputKey(positions, groups) {
    if (!(positions instanceof Float32Array) || !(groups instanceof Int32Array) || positions.length !== groups.length * 9) {
        throw new Error('Invalid precomputed coplanar input');
    }
    const hashes = await Promise.all([rawSha256Hex(positions), rawSha256Hex(groups)]);
    return `${groups.length}/${hashes.join('/')}`;
}

/** Cache ownership is scoped to one engine. Capture mode is injected only by the offline tool. */
export function createCityInputPlans(catalog = null, { capture = false, reason = 'missing' } = {}) {
    const slabs = new Map(), coplanar = new Map(), recordedSlabs = new Map(), recordedCoplanar = new Map();
    const stats = { state: catalog ? 'ready' : reason, slabHits: 0, slabMisses: 0, coplanarHits: 0, coplanarMisses: 0 };
    if (catalog) {
        if (catalog.schema !== CITY_INPUT_SCHEMA || !Array.isArray(catalog.slabs) || !Array.isArray(catalog.coplanar)) throw new Error('Invalid city input catalog');
        for (const entry of catalog.slabs) {
            if (typeof entry.key !== 'string' || slabs.has(entry.key) || !Array.isArray(entry.plan)) throw new Error('Invalid slab plan entry');
            slabs.set(entry.key, entry.plan);
        }
        for (const entry of catalog.coplanar) {
            if (!/^\d+\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(entry.key) || coplanar.has(entry.key)
                || !Array.isArray(entry.patches) || !Number.isFinite(entry.removedArea)) throw new Error('Invalid coplanar plan entry');
            coplanar.set(entry.key, entry);
        }
    }
    return Object.freeze({
        slabs(input, compute) {
            const key = slabInputKey(input), saved = slabs.get(key);
            const start = performance.now();
            const result = saved ? structuredClone(saved) : compute(input);
            stats[saved ? 'slabHits' : 'slabMisses']++;
            stats.slabMs = (stats.slabMs ?? 0) + performance.now() - start;
            if (capture) recordedSlabs.set(key, { key, input: structuredClone(input), plan: structuredClone(result) });
            return result;
        },
        async coplanar(positions, groups) {
            if (!capture && !coplanar.size) { stats.coplanarMisses++; return { plan: null, key: null }; }
            const key = await coplanarInputKey(positions, groups), saved = coplanar.get(key);
            stats[saved ? 'coplanarHits' : 'coplanarMisses']++;
            if (capture) recordedCoplanar.set(key, { key, positions: Array.from(positions), groups: Array.from(groups) });
            return { key, plan: saved ? { patches: new Map(structuredClone(saved.patches)), removedArea: saved.removedArea } : null };
        },
        recordCoplanar(key, plan) {
            if (capture) Object.assign(recordedCoplanar.get(key), { patches: structuredClone([...plan.patches]), removedArea: plan.removedArea });
        },
        diagnostics() { return { ...stats, entries: slabs.size + coplanar.size }; },
        captured() {
            if (!capture) throw new Error('City input recording is not enabled');
            return structuredClone({ slabs: [...recordedSlabs.values()], coplanar: [...recordedCoplanar.values()] });
        }
    });
}
