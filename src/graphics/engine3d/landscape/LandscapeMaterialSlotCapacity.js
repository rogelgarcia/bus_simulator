// Declares the material array contract of the terrain programs: tiers, slot bytes and the capacity formula that fits streamed slots to the appearance GPU ceiling.
// @ts-check
// Design (AI 598 D3a, landscape-material-slots-v1; the arrays themselves are owned by LandscapeMaterialSlots.js). The design rationale of the arrays, the
// capacity phases and the ledger charge is in that module; this one imports nothing graphical so the planner, the pages owner and the unit tests share it.
import { landscapeTextureBytes } from './LandscapeAppearanceBudget.js';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT, LANDSCAPE_MATERIAL_SLOTS_MAX, LANDSCAPE_MATERIAL_TIERS, LANDSCAPE_MATERIAL_TIER_NAMES } from './LandscapeMaterialParameters.js';

export const LANDSCAPE_MATERIAL_SLOTS = Object.freeze({
    id: 'landscape-material-slots-v1',
    tiers: LANDSCAPE_MATERIAL_TIERS,
    tierNames: LANDSCAPE_MATERIAL_TIER_NAMES,
    // base colour plus the three surface layers of a slot
    maps: 4,
    surfaceLayers: 3,
    maxFine: 8,
    maxMid: 16,
    // the mid slots taken before any fine slot
    reservedMid: 4,
    // one spare slot per streamed array that holds fitted slots (the transition allowance in slot form)
    transitionSlots: 1,
    // the arrays' allocated VRAM never exceeds this: at the shipped profiles (appearance half 264 MiB with the cache off, 360 MiB on) it holds the
    // coarse arrays of 32 materials, 8 fitted fine slots (9 x 22.37 MB with the spare) and 8 fitted mid slots (9 x 5.59 MB)
    maxArrayBytes: 256 * 1024 * 1024,
    anisotropy: 4,
    kind: 'appearance-material-arrays',
    reasons: Object.freeze({ slots: 'appearance-material-slots' })
});

const MODEL = LANDSCAPE_MATERIAL_SLOTS;
export const LANDSCAPE_MATERIAL_TIER = Object.freeze({ coarse: 0, mid: 1, fine: 2 });
const TIER = LANDSCAPE_MATERIAL_TIER;

/** GPU bytes of one slot of an array at a resolution: the mipped base colour plus the three mipped surface layers. @param {number} resolution */
export function landscapeMaterialSlotBytes(resolution) { return landscapeTextureBytes(resolution) * MODEL.maps; }

/** GPU bytes of the parameter texture (RGBA32F, rows x capacity). */
export function landscapeMaterialParameterBytes() { return LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT * LANDSCAPE_MATERIAL_SLOTS_MAX * 16; }

/**
 * The capacity formula: fitted fine and mid slots (and their physical counts with the spare) from the appearance GPU ceiling less the fixed consumers,
 * in three phases (reservedMid mid slots, then fine slots, then the remaining mid slots).
 * @param {{limits:{gpuBytes:number},fixedGpuBytes:number,materialCapacity:number,maxFine?:number,maxMid?:number,reservedMid?:number,maxArrayBytes?:number}} options fixedGpuBytes are
 *   the mask and fine coverage arrays (and anything else the appearance holds before the materials); materialCapacity the coarse array layers (every bound material)
 * @returns {Readonly<{fine:number,mid:number,fineSlots:number,midSlots:number,materialCapacity:number,bytes:Readonly<{coarse:number,mid:number,fine:number,parameters:number,allocated:number,charged:number}>,
 *   freeBytes:number,ceilingBytes:number,reason:string|null}>}
 */
export function landscapeMaterialSlotCapacity({ limits, fixedGpuBytes, materialCapacity, maxFine = MODEL.maxFine, maxMid = MODEL.maxMid, reservedMid = MODEL.reservedMid, maxArrayBytes = MODEL.maxArrayBytes }) {
    if (!Number.isSafeInteger(limits?.gpuBytes) || limits.gpuBytes < 0 || !Number.isSafeInteger(fixedGpuBytes) || fixedGpuBytes < 0) throw new Error('[LandscapeMaterialSlots] Capacity needs the appearance GPU limit and the fixed GPU bytes');
    if (!Number.isSafeInteger(materialCapacity) || materialCapacity < 1 || materialCapacity > LANDSCAPE_MATERIAL_SLOTS_MAX) throw new Error(`[LandscapeMaterialSlots] 1..${LANDSCAPE_MATERIAL_SLOTS_MAX} materials fit the arrays; received ${materialCapacity}`);
    if (![maxFine, maxMid, reservedMid].every(value => Number.isSafeInteger(value) && value >= 0) || reservedMid > maxMid || !Number.isSafeInteger(maxArrayBytes) || maxArrayBytes < 0) throw new Error('[LandscapeMaterialSlots] Capacity caps must be nonnegative integers with reservedMid <= maxMid');
    const coarse = landscapeMaterialSlotBytes(MODEL.tiers[TIER.coarse]) * materialCapacity, parameters = landscapeMaterialParameterBytes();
    const ceilingBytes = Math.min(Math.max(0, limits.gpuBytes - fixedGpuBytes), maxArrayBytes);
    let free = ceilingBytes - coarse - parameters;
    if (free < 0) throw new Error(`[LandscapeMaterialSlots] The coarse arrays of ${materialCapacity} materials (${coarse} bytes) do not fit the appearance GPU ceiling of ${limits.gpuBytes} bytes beside ${fixedGpuBytes} fixed bytes`);
    // takes up to `maximum` more fitted slots of an array; the first fitted slot of an array brings the spare with it
    const take = (state, resolution, maximum) => {
        const slotBytes = landscapeMaterialSlotBytes(resolution), spare = state.physical ? 0 : MODEL.transitionSlots, room = Math.floor(free / slotBytes);
        const fitted = Math.max(0, Math.min(maximum, room - spare)), physical = fitted ? fitted + spare : 0;
        free -= physical * slotBytes;
        state.fitted += fitted; state.physical += physical; state.bytes += physical * slotBytes;
        return state;
    };
    const mid = take({ fitted: 0, physical: 0, bytes: 0 }, MODEL.tiers[TIER.mid], reservedMid), fine = take({ fitted: 0, physical: 0, bytes: 0 }, MODEL.tiers[TIER.fine], maxFine);
    take(mid, MODEL.tiers[TIER.mid], maxMid - mid.fitted);
    return Object.freeze({ fine: fine.fitted, mid: mid.fitted, fineSlots: fine.physical, midSlots: mid.physical, materialCapacity,
        bytes: Object.freeze({ coarse, mid: mid.bytes, fine: fine.bytes, parameters, allocated: coarse + mid.bytes + fine.bytes + parameters, charged: coarse + parameters }), freeBytes: free, ceilingBytes,
        // a capacity below one fine slot and the reserved mid slots cannot stream every material of a view: an explicit degradation
        reason: fine.fitted >= 1 && mid.fitted >= reservedMid ? null : MODEL.reasons.slots });
}
