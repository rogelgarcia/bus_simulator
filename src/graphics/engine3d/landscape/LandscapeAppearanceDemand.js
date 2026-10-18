// Fits each material's texel demand to the streamed material slots and bounds the speculative credit the appearance protects.
// @ts-check
// A material tier holds `maps` RGBA maps: base color, normals and ORM, plus the paired micro layer when a companion multiscale sidecar
// supplies one. AI 598 D3a (landscape-material-slot-fitting-v2): materials no longer compete for bytes but for the slots of the resolution-grouped
// arrays (LandscapeMaterialSlots): every material always holds its 128 px tier in the coarse array (the floor), the fine array holds `slots.fine`
// 1024 px materials and the mid array `slots.mid` 512 px materials. Fitting is finest first: the materials wanting 1024 take the fine slots in
// priority order, then every material still at the floor that wants at least 512 takes a mid slot, so a material that lost the fine competition
// settles one array down instead of at the floor. Priority is the closest material first (the highest projected density of the visible pages where
// it occurs), then its page count, then its index; a material that holds a level (bound, arriving or pending) keeps it against a competitor less
// than 1/0.65 times as close, so compositions do not alternate between frames. The composition's GPU bytes are the fixed consumers plus the bytes
// the arrays' occupied slots charge (every fitted material's tier, maps exact) plus the one transition allowance of the pre-D3a planner (the largest
// tier a fitted material may still hold while its fitted tier arrives), so the credit the appearance protects against the shared ledger follows
// the demand exactly as before; its CPU bytes add the decode of the largest fitted tier (the worker's source and the chain it returns). A level
// whose decode would not fit the CPU ceiling is refused with appearance-cpu-budget; a level without a free slot with appearance-material-slots.
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';

export const LANDSCAPE_APPEARANCE_DEMAND = Object.freeze({ id: 'landscape-material-slot-fitting-v2', history: Object.freeze(['landscape-material-water-filling-v1']), incumbentPreference: 1 / .65,
    floorResolution: 128, levels: Object.freeze([{ resolution: 1024, slots: 'fine' }, { resolution: 512, slots: 'mid' }]) });

const NO_BYTES = Object.freeze({ rawBytes: 0, gpuBytes: 0 });

/** Decoded CPU bytes and mipped GPU bytes of one material tier. @param {number} resolution @param {number} [maps] */
export function landscapeMaterialTierBytes(resolution, maps = 3) {
    if (!Number.isSafeInteger(maps) || maps < 1) throw new Error('[Landscape] Material tiers need a positive map count');
    return { rawBytes: resolution ** 2 * 4 * maps, gpuBytes: landscapeTextureBytes(resolution) * maps };
}

/** CPU bytes a tier's decode holds at its peak: the worker's source bytes and the complete mip chains it returns. @param {number} resolution @param {number} [maps] */
export function landscapeMaterialDecodeBytes(resolution, maps = 3) {
    const tier = landscapeMaterialTierBytes(resolution, maps);
    return tier.rawBytes + tier.gpuBytes;
}

/**
 * @param {{fixedCpuBytes:number,fixedGpuBytes:number,decodeBytes:number,limits:{cpuBytes:number,gpuBytes:number},slots:{fine:number,mid:number,gpuBytes:number},
 *   materials:Array<{soilId:string,index:number,density?:number,pages?:number,desiredResolution:number,heldResolution?:number,resolutions:number[],maps?:number}>}} options
 *   fixedGpuBytes are the appearance consumers before the materials (mask and fine coverage arrays); slots the fitted capacities of the streamed arrays
 *   (LandscapeMaterialSlots.demandCapacity) and the GPU bytes the arrays charge whatever they hold (the coarse arrays and the parameter texture);
 *   density is the highest projected pixels per meter of the visible pages where the soil occurs, pages their count and heldResolution the tier the
 *   material holds or is acquiring
 * @returns {{cpuBytes:number,gpuBytes:number,fittedTiers:Object<string,string>,transitionBytes:{cpuBytes:number,gpuBytes:number},
 *   limited:Array<{soilId:string,desired:string,fitted:string}>,reason:string|null,slots:{fine:number,mid:number,fineCapacity:number,midCapacity:number}}}
 *   reason names the ceiling or the slot shortage that kept a material below its demand
 */
export function planLandscapeAppearanceDemand({ fixedCpuBytes, fixedGpuBytes, decodeBytes, limits, slots, materials }) {
    if (!slots || ![slots.fine, slots.mid, slots.gpuBytes].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('[Landscape] Material demand needs the fitted slot capacities (fine, mid) and the arrays\' fixed GPU bytes');
    const floor = LANDSCAPE_APPEARANCE_DEMAND.floorResolution, fitted = new Map(materials.map(material => [material, floor]));
    const wanted = material => material.resolutions.filter(resolution => resolution > floor && resolution <= material.desiredResolution);
    let gpuBytes = fixedGpuBytes + slots.gpuBytes, decode = 0, transition = NO_BYTES, reason = null;
    const used = { fine: 0, mid: 0 };
    for (const level of LANDSCAPE_APPEARANCE_DEMAND.levels) {
        const score = material => (material.density ?? 0) * ((material.heldResolution ?? 0) >= level.resolution ? LANDSCAPE_APPEARANCE_DEMAND.incumbentPreference : 1);
        const candidates = materials.filter(material => fitted.get(material) === floor && wanted(material).includes(level.resolution))
            .sort((a, b) => score(b) - score(a) || (b.pages ?? 0) - (a.pages ?? 0) || a.index - b.index);
        for (const material of candidates) {
            if (used[level.slots] >= slots[level.slots]) { reason ??= 'appearance-material-slots'; continue; }
            const maps = material.maps ?? 3, tierDecode = landscapeMaterialDecodeBytes(level.resolution, maps);
            if (fixedCpuBytes + decodeBytes + tierDecode > limits.cpuBytes) { reason ??= 'appearance-cpu-budget'; continue; }
            const below = Math.max(floor, ...material.resolutions.filter(resolution => resolution < level.resolution && resolution > floor)), source = below > floor ? landscapeMaterialTierBytes(below, maps) : NO_BYTES;
            fitted.set(material, level.resolution);
            used[level.slots]++;
            gpuBytes += landscapeMaterialTierBytes(level.resolution, maps).gpuBytes;
            decode = Math.max(decode, tierDecode);
            transition = { rawBytes: Math.max(transition.rawBytes, source.rawBytes), gpuBytes: Math.max(transition.gpuBytes, source.gpuBytes) };
        }
    }
    const fittedTiers = Object.fromEntries(materials.map(material => [material.soilId, String(fitted.get(material))]));
    const limited = materials.filter(material => fitted.get(material) < Math.max(floor, ...wanted(material)))
        .map(material => ({ soilId: material.soilId, desired: String(Math.max(...wanted(material))), fitted: fittedTiers[material.soilId] }));
    return { cpuBytes: fixedCpuBytes + decodeBytes + decode, gpuBytes: gpuBytes + transition.gpuBytes, fittedTiers, transitionBytes: { cpuBytes: decode, gpuBytes: transition.gpuBytes }, limited, reason,
        slots: { fine: used.fine, mid: used.mid, fineCapacity: slots.fine, midCapacity: slots.mid } };
}
