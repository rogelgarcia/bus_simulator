// Resolves each material's streamed tiers from the schema-1 appearance sidecar and an optional companion multiscale sidecar.
// @ts-check
// The companion sidecar (landscape-appearance-multiscale) adds finer 1024-pixel base tiers and, for some materials, a paired micro
// layer per tier with its own physical period. It is optional: an absent sidecar (404), a disabled or invalid one, a capability contract
// this renderer cannot honour, or an appearance budget too small for its working set all fall back explicitly to the schema-1 tiers,
// with the reason kept for inspection. Budget limits degrade in two steps: first the 1024 tiers are dropped (micro layers stay paired
// with 32/128/512), then the whole sidecar. A tier's maps are its base color, normals, ORM and, when paired, the micro layer.
import { LANDSCAPE_MICRO_DETAIL, landscapeMicroDetailDefinition } from './LandscapeMicroDetail.js';
import { landscapeMaterialTierBytes } from './LandscapeAppearanceDemand.js';

export const LANDSCAPE_MULTISCALE_CAPABILITY = Object.freeze({
    format: 'landscape-appearance-multiscale',
    schemaVersion: 1,
    encoding: 'rgba8',
    gpuCompression: 'none',
    maxPageBytes: 4 * 1024 * 1024,
    maxResolution: 1024,
    microEncoding: LANDSCAPE_MICRO_DETAIL.encoding
});

const ROLES = Object.freeze(['baseColor', 'normal', 'orm']);

/** Schema-1 tiers of one appearance material: base color, normals and ORM from the appearance sidecar. @param {any} definition */
export function landscapeSchemaMaterialTiers(definition) {
    return definition.tiers.map(tier => Object.freeze({ id: tier.id, resolution: tier.resolution,
        pages: Object.freeze(ROLES.map(role => Object.freeze({ role, source: 'appearance', page: tier.channels[role] }))) }));
}

/** Explicit schema-1 resolution of every material with the fallback status and reason. @param {any} appearance @param {string} status @param {string} reason */
export function landscapeMultiscaleFallback(appearance, status, reason) {
    return Object.freeze({ status, reason, active: false, maxResolution: Math.max(...appearance.materials.flatMap(material => material.tiers.map(tier => tier.resolution))),
        materials: Object.freeze(appearance.materials.map(definition => Object.freeze({ soilId: definition.soilId, materialId: definition.materialId, maps: 3, micro: null, tiers: Object.freeze(landscapeSchemaMaterialTiers(definition)) }))) });
}

function contractFailure(sidecar) {
    const capability = sidecar.capabilities ?? {};
    if (capability.encoding !== LANDSCAPE_MULTISCALE_CAPABILITY.encoding) return `encoding ${capability.encoding} is not rgba8`;
    if (capability.gpuCompression !== LANDSCAPE_MULTISCALE_CAPABILITY.gpuCompression) return `GPU compression ${capability.gpuCompression} is not supported`;
    if (!(Number.isSafeInteger(capability.maxPageBytes) && capability.maxPageBytes > 0 && capability.maxPageBytes <= LANDSCAPE_MULTISCALE_CAPABILITY.maxPageBytes)) return `maxPageBytes ${capability.maxPageBytes} exceeds ${LANDSCAPE_MULTISCALE_CAPABILITY.maxPageBytes}`;
    return null;
}

/**
 * GPU bytes of the smallest multiscale working set: fixed arrays, every material's coarse fallback, the largest material tier and the
 * transition source one tier below it. @param {{fixedGpuBytes:number,materials:Array<{maps:number,tiers:Array<{resolution:number}>}>}} input
 */
export function landscapeMultiscaleWorkingSetBytes({ fixedGpuBytes, materials }) {
    let coarse = 0, largest = 0;
    for (const material of materials) {
        const resolutions = material.tiers.map(tier => tier.resolution).sort((a, b) => a - b);
        coarse += landscapeMaterialTierBytes(resolutions[0], material.maps).gpuBytes;
        const top = resolutions.at(-1), below = resolutions.length > 1 ? resolutions.at(-2) : resolutions[0];
        largest = Math.max(largest, landscapeMaterialTierBytes(top, material.maps).gpuBytes + landscapeMaterialTierBytes(below, material.maps).gpuBytes);
    }
    return fixedGpuBytes + coarse + largest;
}

function assemble(appearance, sidecar, { includeFinest }) {
    const bySoil = new Map(sidecar.materials.map(material => [material.soilId, material]));
    return appearance.materials.map(definition => {
        const extra = bySoil.get(definition.soilId);
        if (!extra) return Object.freeze({ soilId: definition.soilId, materialId: definition.materialId, maps: 3, micro: null, tiers: Object.freeze(landscapeSchemaMaterialTiers(definition)) });
        if (extra.materialId !== definition.materialId) throw new Error(`soil ${definition.soilId} binds ${extra.materialId}, appearance binds ${definition.materialId}`);
        if (extra.micro && extra.micro.encoding !== LANDSCAPE_MULTISCALE_CAPABILITY.microEncoding) throw new Error(`soil ${definition.soilId} micro encoding ${extra.micro.encoding} is not supported`);
        const response = extra.micro ? landscapeMicroDetailDefinition(definition.soilId) : null;
        const microTiers = new Map((response ? extra.micro.tiers : []).map(tier => [tier.resolution, tier.channels.micro]));
        const finest = includeFinest ? extra.tiers.filter(tier => !definition.tiers.some(base => base.resolution === tier.resolution)) : [];
        const candidates = [...definition.tiers.map(tier => ({ tier, source: 'appearance' })), ...finest.map(tier => ({ tier, source: 'multiscale' }))]
            .sort((a, b) => a.tier.resolution - b.tier.resolution);
        const unpaired = response ? candidates.find(({ tier }) => !microTiers.has(tier.resolution)) : null;
        if (unpaired) throw new Error(`soil ${definition.soilId} has no micro page paired with its ${unpaired.tier.resolution} tier`);
        const micro = response ? Object.freeze({ materialId: extra.micro.materialId, tileMeters: extra.micro.tileMeters, luminanceRange: extra.micro.luminanceRange, encoding: extra.micro.encoding }) : null;
        const tiers = candidates.map(({ tier, source }) => Object.freeze({ id: String(tier.resolution), resolution: tier.resolution, pages: Object.freeze([
            ...ROLES.map(role => Object.freeze({ role, source, page: tier.channels[role] })),
            ...(micro ? [Object.freeze({ role: 'micro', source: 'multiscale', page: microTiers.get(tier.resolution) })] : [])]) }));
        return Object.freeze({ soilId: definition.soilId, materialId: definition.materialId, maps: micro ? 4 : 3, micro, tiers: Object.freeze(tiers) });
    });
}

/**
 * @param {{appearance:any,sidecar:any|null,error?:string|null,enabled?:boolean,maxTextureSize:number,limits:{gpuBytes:number},fixedGpuBytes:number}} input
 * sidecar is the validated companion sidecar (null when absent); error is its load or validation failure
 */
export function resolveLandscapeMultiscaleTiers({ appearance, sidecar, error = null, enabled = true, maxTextureSize, limits, fixedGpuBytes }) {
    if (!Array.isArray(appearance?.materials) || !Number.isSafeInteger(maxTextureSize) || !Number.isSafeInteger(limits?.gpuBytes) || !Number.isSafeInteger(fixedGpuBytes)) {
        throw new Error('[Landscape] Multiscale tier resolution needs the appearance sidecar, device texture size, appearance limits and fixed GPU bytes');
    }
    if (!enabled) return landscapeMultiscaleFallback(appearance, 'disabled', 'multiscale-disabled');
    if (error) return landscapeMultiscaleFallback(appearance, 'invalid', error);
    if (!sidecar) return landscapeMultiscaleFallback(appearance, 'absent', 'multiscale-sidecar-absent');
    const failure = contractFailure(sidecar);
    if (failure) return landscapeMultiscaleFallback(appearance, 'invalid', `multiscale capability contract: ${failure}`);
    const finestRequested = Math.max(...sidecar.materials.flatMap(material => material.tiers.map(tier => tier.resolution)));
    const deviceLimited = finestRequested > Math.min(maxTextureSize, LANDSCAPE_MULTISCALE_CAPABILITY.maxResolution);
    for (const includeFinest of deviceLimited ? [false] : [true, false]) {
        let materials;
        try { materials = assemble(appearance, sidecar, { includeFinest }); }
        catch (assembly) { return landscapeMultiscaleFallback(appearance, 'invalid', `multiscale binding: ${assembly.message}`); }
        if (!materials.some(material => material.micro || material.tiers.some(tier => tier.pages.some(page => page.source === 'multiscale')))) continue;
        const workingSet = landscapeMultiscaleWorkingSetBytes({ fixedGpuBytes, materials });
        if (workingSet > limits.gpuBytes) continue;
        const maxResolution = Math.max(...materials.flatMap(material => material.tiers.map(tier => tier.resolution)));
        const limited = !includeFinest ? (deviceLimited ? 'device-capacity-1024' : 'appearance-gpu-budget-1024') : null;
        return Object.freeze({ status: limited ? 'active-limited' : 'active', reason: limited, active: true, maxResolution, workingSetBytes: workingSet, materials: Object.freeze(materials),
            revision: sidecar.revision, capabilities: sidecar.capabilities });
    }
    return landscapeMultiscaleFallback(appearance, deviceLimited ? 'device-capacity' : 'budget-denied', deviceLimited ? 'multiscale-device-capacity' : 'multiscale-appearance-gpu-budget');
}
