// Fits each material's texel demand to the appearance ceilings level by level and bounds the speculative credit it protects.
// @ts-check
// A material tier holds `maps` RGBA maps: base color, normals and ORM, plus the paired micro layer when a companion multiscale sidecar
// supplies one. Absent counts keep the original three maps. The composition is breadth-first ("water-filling"): interested materials
// rise one available level at a time (128, then 512, then 1024) in priority order, and the first level that cannot be granted to every
// material wanting it is the last level raised, so no material is left below a level that fits for all while another holds a finer
// tier. Priority is the closest material first (the highest projected density of the visible pages where it occurs), then its page
// count, then its index; a material that holds a level (bound, arriving or pending) keeps it against a competitor less than 1/0.65
// times as close, so compositions do not alternate between frames. One transition allowance, the largest tier any material may still
// hold just below its fitted tier, is fitted and protected with the composition, so every fitted upgrade stays admissible while the tier
// it replaces remains resident.
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';

export const LANDSCAPE_APPEARANCE_DEMAND = Object.freeze({ id: 'landscape-material-water-filling-v1', incumbentPreference: 1 / .65 });

const NO_BYTES = Object.freeze({ rawBytes: 0, gpuBytes: 0 });

/** Decoded CPU bytes and mipped GPU bytes of one material tier. @param {number} resolution @param {number} [maps] */
export function landscapeMaterialTierBytes(resolution, maps = 3) {
    if (!Number.isSafeInteger(maps) || maps < 1) throw new Error('[Landscape] Material tiers need a positive map count');
    return { rawBytes: resolution ** 2 * 4 * maps, gpuBytes: landscapeTextureBytes(resolution) * maps };
}

/**
 * @param {{fixedCpuBytes:number,fixedGpuBytes:number,decodeBytes:number,limits:{cpuBytes:number,gpuBytes:number},materials:Array<{soilId:string,index:number,
 *   density?:number,pages?:number,desiredResolution:number,heldResolution?:number,resolutions:number[],maps?:number}>}} options density is the highest
 *   projected pixels per meter of the visible pages where the soil occurs, pages their count and heldResolution the tier the material holds or is acquiring
 * @returns {{cpuBytes:number,gpuBytes:number,fittedTiers:Object<string,string>,transitionBytes:{cpuBytes:number,gpuBytes:number},
 *   limited:Array<{soilId:string,desired:string,fitted:string}>,reason:string|null}} reason names the ceiling that kept a material below its demand
 */
export function planLandscapeAppearanceDemand({ fixedCpuBytes, fixedGpuBytes, decodeBytes, limits, materials }) {
    let cpuBytes = fixedCpuBytes, gpuBytes = fixedGpuBytes, decode = decodeBytes, transition = NO_BYTES, reason = null;
    for (const material of materials) {
        const coarse = landscapeMaterialTierBytes(32, material.maps);
        cpuBytes += coarse.rawBytes;
        gpuBytes += coarse.gpuBytes;
    }
    const fitted = new Map(materials.map(material => [material, 32]));
    const wanted = material => material.resolutions.filter(resolution => resolution > 32 && resolution <= material.desiredResolution);
    for (const level of [...new Set(materials.flatMap(wanted))].sort((a, b) => a - b)) {
        const score = material => (material.density ?? 0) * ((material.heldResolution ?? 0) >= level ? LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference : 1);
        const candidates = materials.filter(material => wanted(material).includes(level)).sort((a, b) => score(b) - score(a) || (b.pages ?? 0) - (a.pages ?? 0) || a.index - b.index);
        for (const material of candidates) {
            const from = fitted.get(material), held = from > 32 ? landscapeMaterialTierBytes(from, material.maps) : NO_BYTES, next = landscapeMaterialTierBytes(level, material.maps);
            const below = Math.max(32, ...material.resolutions.filter(resolution => resolution < level)), source = below > 32 ? landscapeMaterialTierBytes(below, material.maps) : NO_BYTES;
            const nextTransition = { rawBytes: Math.max(transition.rawBytes, source.rawBytes), gpuBytes: Math.max(transition.gpuBytes, source.gpuBytes) };
            const nextDecode = Math.max(decode, next.rawBytes), cpu = cpuBytes - held.rawBytes + next.rawBytes, gpu = gpuBytes - held.gpuBytes + next.gpuBytes;
            const refusal = cpu + nextDecode + nextTransition.rawBytes > limits.cpuBytes ? 'appearance-cpu-budget' : gpu + nextTransition.gpuBytes > limits.gpuBytes ? 'appearance-gpu-budget' : null;
            if (refusal) { reason ??= refusal; continue; }
            cpuBytes = cpu;
            gpuBytes = gpu;
            decode = nextDecode;
            transition = nextTransition;
            fitted.set(material, level);
        }
        if (reason) break;
    }
    const fittedTiers = Object.fromEntries(materials.map(material => [material.soilId, String(fitted.get(material))]));
    const limited = materials.filter(material => fitted.get(material) < Math.max(32, ...wanted(material)))
        .map(material => ({ soilId: material.soilId, desired: String(Math.max(...wanted(material))), fitted: fittedTiers[material.soilId] }));
    return { cpuBytes: cpuBytes + decode + transition.rawBytes, gpuBytes: gpuBytes + transition.gpuBytes, fittedTiers,
        transitionBytes: { cpuBytes: transition.rawBytes, gpuBytes: transition.gpuBytes }, limited, reason };
}
