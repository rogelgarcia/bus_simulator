// Adapts evaluated Three.js materials into explicit bake semantics without shader source.
// @ts-check

import {
    compareCanonicalStrings,
    hashCanonicalJsonSha256
} from '../../../app/illumination/bake_source/index.js';
import { failBakeSource } from './BakeSourceErrors.js';
import { activeMaterialSlotEntries, collectResolvedRootMeshes } from './BakeSourceScene.js';
import { createBakeTextureCatalog } from './BakeSourceTextures.js';

export const BAKE_MATERIAL_SEMANTICS_DOMAIN = 'bus-simulator/illumination/bake-source/material-semantics/v1';

const TEXTURE_SLOTS = Object.freeze([
    'map',
    'alphaMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'bumpMap',
    'displacementMap',
    'lightMap',
    'specularMap',
    'specularColorMap',
    'specularIntensityMap',
    'transmissionMap',
    'thicknessMap',
    'clearcoatMap',
    'clearcoatNormalMap',
    'clearcoatRoughnessMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'iridescenceMap',
    'iridescenceThicknessMap'
]);

const USER_DATA_KEYS = Object.freeze([
    'asphaltRoadBase',
    'asphaltMarkingsNoiseBase',
    'asphaltMarkingsNoiseConfig',
    'asphaltEdgeWearConfig',
    'sidewalkEdgeDirtStripConfig',
    'roadSurfaceVariationConfig',
    'materialVariationConfig',
    'uvTilingConfig',
    'groundSubstrateBlendConfig',
    'roadMarkingsAsphaltNoiseConfig',
    'roadMarkingsOverlayConfig',
    'roadMarkingsOverlayEnabled',
    'smartMaterialGroupShader',
    'windowFakeDepth',
    'grassCardShaderConfig',
    'grassCardShaderSignature',
    'grassCardShaderVersion',
    'grassLodShaderVersion',
    'buildingWindowMergeSafeShader',
    'windowGlass',
    'buildingWindowGlass',
    'buildingWindowGlassEnabled',
    'iblEnvMapIntensity',
    'iblEnvMapIntensityScale'
]);

const CUSTOM_SHADER_TAGS = Object.freeze([
    'asphaltMarkingsNoiseInjected',
    'asphaltEdgeWearInjected',
    'sidewalkEdgeDirtStripInjected',
    'roadMarkingsOverlayEnabled',
    'roadSurfaceVariationConfig',
    'materialVariationConfig',
    'uvTilingConfig',
    'groundSubstrateBlendConfig',
    'smartMaterialGroupShader',
    'windowFakeDepth',
    'grassCardShaderVersion',
    'grassLodShaderVersion',
    'buildingWindowMergeSafeShader'
]);

const CUSTOM_SHADER_ADAPTERS = Object.freeze({
    asphaltMarkingsNoiseInjected: Object.freeze({ id: 'asphalt-markings-noise-v1', semantics: ['asphaltMarkingsNoiseConfig'] }),
    asphaltEdgeWearInjected: Object.freeze({ id: 'asphalt-edge-wear-v1', semantics: ['asphaltEdgeWearConfig'] }),
    sidewalkEdgeDirtStripInjected: Object.freeze({ id: 'sidewalk-edge-dirt-strip-v1', semantics: ['sidewalkEdgeDirtStripConfig'] }),
    roadMarkingsOverlayEnabled: Object.freeze({ id: 'road-markings-overlay-v5', semantics: ['roadMarkingsOverlayConfig'] }),
    roadSurfaceVariationConfig: Object.freeze({ id: 'road-surface-variation-v1', semantics: ['roadSurfaceVariationConfig'] }),
    materialVariationConfig: Object.freeze({ id: 'material-variation-v1', semantics: ['materialVariationConfig'] }),
    uvTilingConfig: Object.freeze({ id: 'uv-tiling-v1', semantics: ['uvTilingConfig'] }),
    groundSubstrateBlendConfig: Object.freeze({ id: 'ground-substrate-blend-v1', semantics: ['groundSubstrateBlendConfig'] }),
    smartMaterialGroupShader: Object.freeze({ id: 'smart-material-group-v1', semantics: ['smartMaterialGroupShader'] }),
    windowFakeDepth: Object.freeze({ id: 'window-fake-depth-v1', semantics: ['windowFakeDepth'] }),
    grassCardShaderVersion: Object.freeze({ id: 'grass-card-atlas-v1', semantics: ['grassCardShaderVersion', 'grassCardShaderConfig'] }),
    grassLodShaderVersion: Object.freeze({ id: 'grass-lod-blend-v1', semantics: ['grassLodShaderVersion'] }),
    buildingWindowMergeSafeShader: Object.freeze({ id: 'building-window-material-v1', semantics: ['buildingWindowMergeSafeShader'] })
});

function finite(value, label, fallback = 0) {
    const number = value === undefined || value === null ? fallback : Number(value);
    if (!Number.isFinite(number)) failBakeSource('non_finite_material_semantic', `${label} must be finite.`, { label, value });
    return Object.is(number, -0) ? 0 : number;
}

function color(material, key, fallback) {
    const value = material?.[key];
    if (!value?.isColor) return fallback;
    return [
        finite(value.r, `${key}.r`),
        finite(value.g, `${key}.g`),
        finite(value.b, `${key}.b`)
    ];
}

function semanticJson(value, path, bindingByTexture = null, depth = 0, active = new WeakSet()) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return finite(value, path);
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return null;
    if (value?.isTexture) {
        const binding = bindingByTexture?.get(value);
        if (!binding) failBakeSource('texture_binding_missing', `${path} has no captured texture binding.`);
        return { textureBindingId: binding.id };
    }
    if (value?.isColor) return [finite(value.r, `${path}.r`), finite(value.g, `${path}.g`), finite(value.b, `${path}.b`)];
    if (value?.isVector2) return [finite(value.x, `${path}.x`), finite(value.y, `${path}.y`)];
    if (value?.isVector3) return [finite(value.x, `${path}.x`), finite(value.y, `${path}.y`), finite(value.z, `${path}.z`)];
    if (value?.isVector4 || value?.isQuaternion) {
        return [finite(value.x, `${path}.x`), finite(value.y, `${path}.y`), finite(value.z, `${path}.z`), finite(value.w, `${path}.w`)];
    }
    if (value?.isMatrix3 || value?.isMatrix4) {
        return Array.from(value.elements ?? []).map((entry, index) => finite(entry, `${path}.elements[${index}]`));
    }
    if (ArrayBuffer.isView(value)) return { typedArray: value.constructor.name, length: value.length };
    if (typeof value === 'object') {
        if (active.has(value)) return { cyclicReferenceExcluded: true };
        active.add(value);
    }
    if (Array.isArray(value)) {
        const output = value.map((entry, index) => semanticJson(entry, `${path}[${index}]`, bindingByTexture, depth + 1, active));
        active.delete(value);
        return output;
    }
    if (typeof value === 'object') {
        const output = {};
        for (const key of Object.keys(value).sort()) {
            if (key.startsWith('_') || key === 'shaderUniforms') continue;
            const next = semanticJson(value[key], `${path}.${key}`, bindingByTexture, depth + 1, active);
            if (next !== null) output[key] = next;
        }
        active.delete(value);
        return output;
    }
    return null;
}

function collectSemanticTextures(value, textures, depth = 0, active = new WeakSet()) {
    if (!value) return;
    if (value.isTexture) {
        textures.add(value);
        return;
    }
    if (typeof value !== 'object' || active.has(value)) return;
    active.add(value);
    if (Array.isArray(value)) {
        for (const entry of value) collectSemanticTextures(entry, textures, depth + 1, active);
    } else {
        for (const key of Object.keys(value).sort(compareCanonicalStrings)) {
            if (key.startsWith('_') || key === 'shaderUniforms') continue;
            collectSemanticTextures(value[key], textures, depth + 1, active);
        }
    }
    active.delete(value);
}

function resolveCustomShaderAdapters(customTags, customSemantics) {
    const adapters = [];
    const unsupportedTags = [];
    for (const tag of customTags) {
        const adapter = CUSTOM_SHADER_ADAPTERS[tag];
        if (!adapter) {
            unsupportedTags.push(tag);
            continue;
        }
        const missingSemantics = adapter.semantics.filter((key) => customSemantics[key] === undefined);
        if (missingSemantics.length > 0) {
            unsupportedTags.push(`${tag}:missing:${missingSemantics.join(',')}`);
            continue;
        }
        adapters.push({ id: adapter.id, tag, semantics: adapter.semantics });
    }
    adapters.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    unsupportedTags.sort(compareCanonicalStrings);
    return { adapters, unsupportedTags };
}

function textureBindings(material, bindingByTexture) {
    const result = {};
    for (const slot of TEXTURE_SLOTS) {
        const texture = material?.[slot] ?? null;
        if (!texture) continue;
        const binding = bindingByTexture.get(texture);
        if (!binding) failBakeSource('texture_binding_missing', `Material texture slot '${slot}' has no captured binding.`);
        result[slot] = binding.id;
    }
    return result;
}

function alphaSemantics(material, bindings, customAdapters, customSemantics) {
    const opacity = finite(material.opacity, 'material.opacity', 1);
    const alphaTest = finite(material.alphaTest, 'material.alphaTest', 0);
    const transmission = finite(material.transmission, 'material.transmission', 0);
    const cutout = alphaTest > 0;
    const blended = opacity < 1 || (material.transparent === true && Number(material.blending) !== 0);
    if (cutout && !bindings.map && !bindings.alphaMap) {
        failBakeSource('ambiguous_alpha_semantics', 'An alpha-tested material has no canonical map or alphaMap input.', {
            material: material.name || material.type,
            alphaTest
        });
    }
    let mode = 'opaque';
    const proceduralCoverage = customAdapters
        .filter((entry) => entry.id === 'asphalt-edge-wear-v1' || entry.id === 'sidewalk-edge-dirt-strip-v1')
        .map((entry) => ({
            adapterId: entry.id,
            semantics: entry.id === 'asphalt-edge-wear-v1'
                ? customSemantics.asphaltEdgeWearConfig
                : customSemantics.sidewalkEdgeDirtStripConfig
        }));
    if (transmission > 0) mode = 'transmissive';
    else if (blended && proceduralCoverage.length > 0) mode = 'procedural_coverage';
    else if (blended && cutout) mode = 'cutout_blended';
    else if (blended) mode = 'blended';
    else if (cutout) mode = 'cutout';
    const inputs = [];
    if (bindings.map) inputs.push({ bindingId: bindings.map, channel: 'a', operation: 'multiply' });
    if (bindings.alphaMap) inputs.push({ bindingId: bindings.alphaMap, channel: 'g', operation: 'multiply' });
    return {
        mode,
        opacity,
        alphaTest,
        alphaToCoverage: material.alphaToCoverage === true,
        inputs,
        proceduralCoverage
    };
}

function channelSupport(material, alpha, unsupportedCustomTags) {
    const physical = material.isMeshStandardMaterial === true || material.isMeshPhysicalMaterial === true;
    const surfaceUnsupported = alpha.mode === 'blended' || alpha.mode === 'cutout_blended' || alpha.mode === 'transmissive';
    const custom = unsupportedCustomTags.length > 0;
    const result = {
        static_sun_depth: { supported: !surfaceUnsupported, reasons: [] },
        direct_receiver: { supported: physical && !surfaceUnsupported && !custom, reasons: [] },
        indirect_irradiance: { supported: physical && !surfaceUnsupported && !custom, reasons: [] },
        static_ao_bent_normal: { supported: !surfaceUnsupported, reasons: [] }
    };
    for (const [channel, entry] of Object.entries(result)) {
        if (!physical && (channel === 'direct_receiver' || channel === 'indirect_irradiance')) entry.reasons.push('non_physical_material');
        if (surfaceUnsupported) entry.reasons.push(`unsupported_alpha_mode:${alpha.mode}`);
        if (custom && (channel === 'direct_receiver' || channel === 'indirect_irradiance')) {
            entry.reasons.push(...unsupportedCustomTags.map((tag) => `custom_shader_adapter_missing:${tag}`));
        }
    }
    return result;
}

/**
 * Rejects shadow-only material overrides that have no V1 bake adapter.
 * @param {any} mesh
 * @param {{selectedCaster?: boolean, objectId?: string | null, rootId?: string | null, semanticPath?: string | null}} [options]
 */
export function assertBakeSourceCasterShadowMaterials(
    mesh,
    { selectedCaster = false, objectId = null, rootId = null, semanticPath = null } = {}
) {
    if (!selectedCaster || mesh?.userData?.mergeShadowAsOpaque === true) return;
    for (const property of ['customDepthMaterial', 'customDistanceMaterial']) {
        const material = mesh?.[property];
        if (!material) continue;
        failBakeSource('custom_shadow_material_adapter_missing', `Selected caster '${objectId ?? mesh?.name ?? 'unnamed'}' uses ${property} without a V1 bake adapter.`, {
            objectId,
            rootId,
            semanticPath,
            shadowMaterialProperty: property,
            shadowMaterialType: String(material.type || 'Material'),
            shadowMaterialName: String(material.name || material.type || 'Material'),
            affectedChannels: ['static_sun_depth', 'direct_receiver'],
            remediation: 'Add a versioned V1 custom shadow-material adapter or remove this object from static caster selection.'
        });
    }
}

function materialRecord(material, bindingByTexture) {
    if (!material?.isMaterial) failBakeSource('invalid_material', 'A mesh references a missing or non-Three material.');
    const bindings = textureBindings(material, bindingByTexture);
    const customTags = CUSTOM_SHADER_TAGS.filter((key) => material.userData?.[key] !== undefined);
    const hasOwnShaderPatch = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')
        && typeof material.onBeforeCompile === 'function';
    if (hasOwnShaderPatch && customTags.length === 0) customTags.push('unadapted_onBeforeCompile');
    const hasOwnProgramKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
        && typeof material.customProgramCacheKey === 'function';
    if (hasOwnProgramKey && customTags.length === 0) customTags.push('unadapted_customProgramCacheKey');
    const customSemantics = {};
    for (const key of USER_DATA_KEYS) {
        if (material.userData?.[key] === undefined) continue;
        const value = semanticJson(material.userData[key], `material.userData.${key}`, bindingByTexture);
        if (value !== null) customSemantics[key] = value;
    }
    const customAdapters = resolveCustomShaderAdapters(customTags, customSemantics);
    const alpha = alphaSemantics(material, bindings, customAdapters.adapters, customSemantics);
    const hasNormalMap = Boolean(bindings.normalMap);
    const normalMapType = hasNormalMap
        ? finite(material.normalMapType, 'material.normalMapType', 0)
        : null;
    const normalMapSpace = !hasNormalMap
        ? null
        : normalMapType === 0
            ? 'tangent_space'
            : normalMapType === 1
                ? 'object_space'
                : 'unsupported';
    if (normalMapSpace === 'unsupported') {
        failBakeSource('unsupported_normal_map_space', 'A used normal map has an unknown Three.js normalMapType.', {
            material: material.name || material.type,
            normalMapType
        });
    }
    return {
        schema: 'bus-sim-evaluated-material-semantics-v1',
        provenance: {
            kind: 'evaluated_three_material',
            type: String(material.type || 'Material'),
            name: String(material.name || material.type || 'Material')
        },
        model: String(material.type || 'Material'),
        visible: material.visible !== false,
        colorLinearSrgb: color(material, 'color', [1, 1, 1]),
        emissiveLinearSrgb: color(material, 'emissive', [0, 0, 0]),
        emissiveIntensity: finite(material.emissiveIntensity, 'material.emissiveIntensity', 1),
        roughness: finite(material.roughness, 'material.roughness', 1),
        metalness: finite(material.metalness, 'material.metalness', 0),
        ior: finite(material.ior, 'material.ior', 1.5),
        transmission: finite(material.transmission, 'material.transmission', 0),
        thickness: finite(material.thickness, 'material.thickness', 0),
        attenuationDistance: material.attenuationDistance === Infinity ? 'infinity' : finite(material.attenuationDistance, 'material.attenuationDistance', 0),
        attenuationColorLinearSrgb: color(material, 'attenuationColor', [1, 1, 1]),
        clearcoat: finite(material.clearcoat, 'material.clearcoat', 0),
        clearcoatRoughness: finite(material.clearcoatRoughness, 'material.clearcoatRoughness', 0),
        normalMapType,
        normalMapSpace,
        normalMapTangentRequirement: !hasNormalMap
            ? null
            : normalMapSpace === 'tangent_space'
                ? 'explicit_tangent_or_derivative_frame'
                : 'not_applicable',
        normalScale: [finite(material.normalScale?.x, 'material.normalScale.x', 1), finite(material.normalScale?.y, 'material.normalScale.y', 1)],
        bumpScale: finite(material.bumpScale, 'material.bumpScale', 1),
        displacementScale: finite(material.displacementScale, 'material.displacementScale', 1),
        displacementBias: finite(material.displacementBias, 'material.displacementBias', 0),
        aoMapIntensity: finite(material.aoMapIntensity, 'material.aoMapIntensity', 1),
        lightMapIntensity: finite(material.lightMapIntensity, 'material.lightMapIntensity', 1),
        side: finite(material.side, 'material.side', 0),
        shadowSide: material.shadowSide === null ? null : finite(material.shadowSide, 'material.shadowSide', 0),
        vertexColors: material.vertexColors === true,
        flatShading: material.flatShading === true,
        depthTest: material.depthTest !== false,
        depthWrite: material.depthWrite !== false,
        colorWrite: material.colorWrite !== false,
        blending: finite(material.blending, 'material.blending', 1),
        blendSrc: finite(material.blendSrc, 'material.blendSrc', 0),
        blendDst: finite(material.blendDst, 'material.blendDst', 0),
        blendEquation: finite(material.blendEquation, 'material.blendEquation', 0),
        alpha,
        textureBindings: bindings,
        customShaderTags: customTags,
        customShaderAdapters: customAdapters.adapters,
        unsupportedCustomShaderTags: customAdapters.unsupportedTags,
        defines: semanticJson(material.defines ?? {}, 'material.defines', bindingByTexture),
        customSemantics,
        channelSupport: channelSupport(material, alpha, customAdapters.unsupportedTags)
    };
}

export async function createBakeMaterialCatalog(rootEntries) {
    const meshMaterials = new Map();
    const materialObjects = new Set();
    const textures = new Set();
    for (const rootEntry of rootEntries) {
        for (const { object } of collectResolvedRootMeshes(rootEntry)) {
            const slotEntries = activeMaterialSlotEntries(object);
            if (slotEntries.some((entry) => !entry.material)) {
                failBakeSource('missing_material_slot', 'A resolved mesh contains a missing material slot.', {
                    rootId: rootEntry.id,
                    mesh: object.name || object.type
                });
            }
            meshMaterials.set(object, slotEntries);
            for (const { material } of slotEntries) {
                materialObjects.add(material);
                for (const slot of TEXTURE_SLOTS) if (material?.[slot]?.isTexture) textures.add(material[slot]);
                for (const key of USER_DATA_KEYS) {
                    collectSemanticTextures(material?.userData?.[key], textures);
                }
            }
        }
    }
    const textureCatalog = await createBakeTextureCatalog(textures);
    const materialByObject = new Map();
    const materialById = new Map();
    for (const material of materialObjects) {
        const record = materialRecord(material, textureCatalog.bindingByTexture);
        const hash = await hashCanonicalJsonSha256(BAKE_MATERIAL_SEMANTICS_DOMAIN, record);
        const identified = { id: `material:${hash}`, ...record };
        materialByObject.set(material, identified);
        materialById.set(identified.id, identified);
    }
    const materialIdsByMesh = new Map();
    for (const [mesh, slots] of meshMaterials) {
        materialIdsByMesh.set(mesh, slots.map(({ index, material }) => ({
            index,
            id: materialByObject.get(material)?.id
        })));
    }
    return {
        materials: Array.from(materialById.values()).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
        textures: {
            sources: textureCatalog.sources,
            bindings: textureCatalog.bindings
        },
        buffers: textureCatalog.buffers,
        coverageBuffers: textureCatalog.coverageBuffers,
        materialIdsByMesh,
        materialByObject
    };
}
