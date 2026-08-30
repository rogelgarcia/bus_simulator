// Creates a stable-ID Blender reconstruction plan from a validated AI 528 manifest.
// @ts-check

import {
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { createStableInventory } from '../../../src/app/illumination/bake_source/StableInventory.js';
import { failCompiler } from './CompilerErrors.mjs';

export const RECONSTRUCTION_PLAN_SCHEMA = 'bus-sim-illumination-reconstruction-plan-v1';
export const RECONSTRUCTION_MODE = 'scripted_clean_scene_v1';

const SUPPORTED_CHANNEL_ROLES = Object.freeze({
    static_sun_depth: Object.freeze(['caster']),
    direct_receiver: Object.freeze(['caster', 'receiver']),
    indirect_irradiance: Object.freeze(['participant', 'receiver']),
    static_ao_bent_normal: Object.freeze(['participant', 'receiver'])
});
const PHYSICAL_MATERIAL_MODELS = new Set(['MeshPhysicalMaterial', 'MeshStandardMaterial']);
const SUPPORTED_ALPHA_MODES = new Set(['cutout', 'opaque', 'procedural_coverage']);
const SUPPORTED_PROCEDURAL_ALPHA_ADAPTERS = new Set([
    'asphalt-edge-wear-v1',
    'sidewalk-edge-dirt-strip-v1'
]);
const UV_MAPPING = 300;
const SUPPORTED_WRAP_MODES = new Set([1000, 1001, 1002]);
const SUPPORTED_MAG_FILTERS = new Set([1003, 1006]);
const SUPPORTED_MIN_FILTERS = new Set([1003, 1004, 1005, 1006, 1007, 1008]);

/**
 * @param {unknown} manifestValue
 * @param {{channelIds?: readonly string[]}} [options]
 * @returns {Readonly<Record<string, any>>}
 */
export function createReconstructionPlan(manifestValue, options = {}) {
    const manifest = requireObject(manifestValue, 'Resolved-city manifest');
    if (manifest.format !== 'bus-sim-illumination-bake-input-v1' || manifest.schemaVersion !== 1) {
        failCompiler('reconstruction_input_version_unsupported', 'Reconstruction requires a validated AI 528 V1 manifest.', {
            format: manifest.format ?? null,
            schemaVersion: manifest.schemaVersion ?? null
        });
    }
    if (manifest.coordinateContract?.id !== 'three-y-up-to-blender-z-up-v1'
        || manifest.coordinateContract?.target !== 'blender_right_handed_z_up_column_major'
        || manifest.coordinateContract?.units !== 'meters') {
        failCompiler('reconstruction_coordinate_contract_unsupported', 'Reconstruction coordinate contract is unsupported.', {
            coordinateContract: manifest.coordinateContract ?? null
        });
    }

    const inventories = createInventories(manifest);
    const selectedChannelIds = selectChannelIds(inventories.channelProfiles, options.channelIds);
    const channelSourceById = indexNamedHashes(manifest.hashes?.channelSources, 'hashes.channelSources');
    const usages = [];
    const channels = selectedChannelIds.map((channelId) => {
        if (!channelSourceById.has(channelId)) {
            failCompiler('reconstruction_channel_source_missing', 'Selected channel has no AI 528 source hash.', { channelId });
        }
        const roles = SUPPORTED_CHANNEL_ROLES[channelId];
        if (!roles) failCompiler('reconstruction_channel_unsupported', 'Selected reconstruction channel is unsupported.', { channelId });
        const mappingIds = { caster: [], participant: [], receiver: [] };
        for (const role of roles) {
            const inventory = mappingInventory(inventories, role);
            for (const mapping of inventory) {
                if (mapping.channelRelevance?.[channelId] !== true) continue;
                mappingIds[role].push(mapping.id);
                usages.push({ channelId, role, mapping });
            }
        }
        return {
            id: channelId,
            sourceSha256: channelSourceById.get(channelId),
            profile: inventories.channelProfiles.find((entry) => entry.id === channelId),
            casterMappingIds: mappingIds.caster,
            participantMappingIds: mappingIds.participant,
            receiverMappingIds: mappingIds.receiver
        };
    });

    const usageByMappingId = new Map();
    for (const usage of usages) {
        const values = usageByMappingId.get(usage.mapping.id) ?? [];
        values.push(usage);
        usageByMappingId.set(usage.mapping.id, values);
    }
    const selectedMappings = {
        casters: inventories.casterMappings.filter((entry) => usageByMappingId.has(entry.id)),
        participants: inventories.participantMappings.filter((entry) => usageByMappingId.has(entry.id)),
        receivers: inventories.receiverMappings.filter((entry) => usageByMappingId.has(entry.id))
    };

    const selectedMappingInventory = [
        ...selectedMappings.casters,
        ...selectedMappings.participants,
        ...selectedMappings.receivers
    ];
    const instanceIds = new Set(selectedMappingInventory.map((entry) => entry.meshInstanceId));
    const objectIds = new Set(selectedMappingInventory.map((entry) => entry.objectId));
    const geometryIds = new Set(selectedMappingInventory.map((entry) => entry.geometryId));
    const materialIds = new Set(selectedMappingInventory.map((entry) => entry.materialId));
    const alphaInputIds = new Set(selectedMappingInventory.map((entry) => entry.alphaInputId));
    const meshInstances = inventories.meshInstances.filter((entry) => instanceIds.has(entry.id));
    const objects = inventories.objects.filter((entry) => objectIds.has(entry.id));
    const geometries = inventories.geometries.filter((entry) => geometryIds.has(entry.id));
    const materials = inventories.materials.filter((entry) => materialIds.has(entry.id));
    const alphaInputs = inventories.alphaInputs.filter((entry) => alphaInputIds.has(entry.id));

    assertMappingReferences({
        usages,
        objects,
        geometries,
        meshInstances,
        materials,
        alphaInputs
    });
    const semanticSelection = validateMaterialSemantics({
        usages,
        materials,
        alphaInputs,
        textures: inventories.textures,
        buffers: inventories.buffers
    });
    const referencedLightingIds = new Set();
    for (const channel of channels) {
        for (const id of [channel.profile.lightProfileId, ...(channel.profile.lightProfileIds ?? [])]) {
            if (id) referencedLightingIds.add(id);
        }
    }
    const lightingProfiles = inventories.lightingProfiles.filter((entry) => referencedLightingIds.has(entry.id));
    if (lightingProfiles.length !== referencedLightingIds.size) {
        failCompiler('reconstruction_lighting_profile_missing', 'Selected channels reference missing lighting profiles.', {
            expected: [...referencedLightingIds].sort(compareCanonicalStrings),
            actual: lightingProfiles.map((entry) => entry.id)
        });
    }

    const plan = {
        schema: RECONSTRUCTION_PLAN_SCHEMA,
        mode: RECONSTRUCTION_MODE,
        coordinateContract: manifest.coordinateContract,
        colorContract: manifest.colorContract,
        sourceHashes: {
            resolvedSourceSha256: manifest.hashes?.resolvedSource,
            geometrySha256: manifest.hashes?.geometry,
            usedMaterialsSha256: manifest.hashes?.usedMaterials,
            channelSources: selectedChannelIds.map((id) => ({ id, sha256: channelSourceById.get(id) }))
        },
        channels,
        lightingProfiles,
        objects,
        geometries,
        meshInstances,
        materials,
        textures: semanticSelection.textures,
        alphaInputs,
        buffers: inventories.buffers,
        mappings: selectedMappings,
        summary: {
            objectOrder: 'stable_id_ascending',
            stableIdsPreserved: true,
            objectCount: objects.length,
            geometryCount: geometries.length,
            meshInstanceCount: meshInstances.length,
            materialCount: materials.length,
            textureCount: semanticSelection.textures.length,
            alphaInputCount: alphaInputs.length
        }
    };
    return /** @type {Readonly<Record<string, any>>} */ (cloneCanonicalJson(plan));
}

/** @param {Record<string, any>} manifest */
function createInventories(manifest) {
    const names = [
        'objects',
        'geometries',
        'meshInstances',
        'materials',
        'textures',
        'alphaInputs',
        'participantMappings',
        'receiverMappings',
        'casterMappings',
        'lightingProfiles',
        'channelProfiles',
        'buffers'
    ];
    const result = {};
    for (const name of names) {
        result[name] = createStableInventory(manifest[name], { label: `Reconstruction ${name}` });
    }
    return /** @type {Record<string, readonly Record<string, any>[]>} */ (result);
}

/**
 * @param {readonly Record<string, any>[]} channelProfiles
 * @param {readonly string[] | undefined} requested
 */
function selectChannelIds(channelProfiles, requested) {
    const available = new Set(channelProfiles.map((entry) => entry.id));
    if (requested !== undefined && !Array.isArray(requested)) {
        throw new TypeError('Reconstruction channel IDs must be an array of stable strings');
    }
    const ids = requested === undefined ? [...available] : [...requested];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id)) {
        throw new TypeError('Reconstruction channel IDs must be an array of stable strings');
    }
    ids.sort(compareCanonicalStrings);
    if (new Set(ids).size !== ids.length) throw new TypeError('Reconstruction channel IDs must be unique');
    for (const id of ids) {
        if (!available.has(id)) failCompiler('reconstruction_channel_missing', 'Requested channel is absent from the source manifest.', { channelId: id });
        if (!SUPPORTED_CHANNEL_ROLES[id]) failCompiler('reconstruction_channel_unsupported', 'Requested channel has no V1 Blender adapter.', { channelId: id });
    }
    return ids;
}

/** @param {unknown} value @param {string} label */
function indexNamedHashes(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const result = new Map();
    for (const entry of value) {
        if (!entry || typeof entry.id !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256) || result.has(entry.id)) {
            throw new TypeError(`${label} contains an invalid or duplicate record`);
        }
        result.set(entry.id, entry.sha256);
    }
    return result;
}

/** @param {Record<string, readonly Record<string, any>[]>} inventories @param {string} role */
function mappingInventory(inventories, role) {
    if (role === 'caster') return inventories.casterMappings;
    if (role === 'participant') return inventories.participantMappings;
    if (role === 'receiver') return inventories.receiverMappings;
    throw new TypeError(`Unknown reconstruction mapping role '${role}'`);
}

/**
 * @param {{
 *   usages: {channelId: string, role: string, mapping: Record<string, any>}[],
 *   objects: readonly Record<string, any>[],
 *   geometries: readonly Record<string, any>[],
 *   meshInstances: readonly Record<string, any>[],
 *   materials: readonly Record<string, any>[],
 *   alphaInputs: readonly Record<string, any>[]
 * }} selection
 */
function assertMappingReferences(selection) {
    const ids = {
        objectId: new Set(selection.objects.map((entry) => entry.id)),
        geometryId: new Set(selection.geometries.map((entry) => entry.id)),
        meshInstanceId: new Set(selection.meshInstances.map((entry) => entry.id)),
        materialId: new Set(selection.materials.map((entry) => entry.id)),
        alphaInputId: new Set(selection.alphaInputs.map((entry) => entry.id))
    };
    const instanceById = new Map(selection.meshInstances.map((entry) => [entry.id, entry]));
    for (const { mapping, channelId, role } of selection.usages) {
        for (const [key, inventory] of Object.entries(ids)) {
            if (!inventory.has(mapping[key])) {
                failCompiler('reconstruction_mapping_reference_missing', 'Selected mapping has a missing semantic reference.', {
                    mappingId: mapping.id,
                    channelId,
                    role,
                    reference: key,
                    id: mapping[key] ?? null
                });
            }
        }
        const instance = instanceById.get(mapping.meshInstanceId);
        if (instance.objectId !== mapping.objectId || instance.geometryId !== mapping.geometryId) {
            failCompiler('reconstruction_mapping_reference_mismatch', 'Selected mapping disagrees with its mesh instance.', {
                mappingId: mapping.id,
                meshInstanceId: mapping.meshInstanceId
            });
        }
    }
}

/**
 * @param {{
 *   usages: {channelId: string, role: string, mapping: Record<string, any>}[],
 *   materials: readonly Record<string, any>[],
 *   alphaInputs: readonly Record<string, any>[],
 *   textures: readonly Record<string, any>[],
 *   buffers: readonly Record<string, any>[]
 * }} selection
 */
function validateMaterialSemantics(selection) {
    const materialById = new Map(selection.materials.map((entry) => [entry.id, entry]));
    const alphaById = new Map(selection.alphaInputs.map((entry) => [entry.id, entry]));
    const textureById = new Map(selection.textures.map((entry) => [entry.id, entry]));
    const bufferById = new Map(selection.buffers.map((entry) => [entry.id, entry]));
    const bindingIds = new Set();
    const usageByMaterial = new Map();
    for (const usage of selection.usages) {
        const material = materialById.get(usage.mapping.materialId);
        if (!material) continue;
        const values = usageByMaterial.get(material.id) ?? [];
        values.push(usage);
        usageByMaterial.set(material.id, values);
    }

    for (const material of selection.materials) {
        if (material.schema !== 'bus-sim-evaluated-material-semantics-v1') {
            failCompiler('reconstruction_material_schema_unsupported', 'Material semantics have no V1 Blender adapter.', {
                materialId: material.id,
                schema: material.schema ?? null
            });
        }
        const usages = usageByMaterial.get(material.id) ?? [];
        const requiresPhysicalSurface = usages.some(({ channelId, role }) => (
            (role === 'receiver' && (channelId === 'direct_receiver' || channelId === 'indirect_irradiance'))
            || (role === 'participant' && channelId === 'indirect_irradiance')
        ));
        const model = material.model ?? material.type ?? material.provenance?.type;
        if (requiresPhysicalSurface && !PHYSICAL_MATERIAL_MODELS.has(model)) {
            failCompiler('reconstruction_material_model_unsupported', 'Selected radiometric channel requires a physical material model.', {
                materialId: material.id,
                model: model ?? null
            });
        }
        for (const { channelId, role, mapping } of usages) {
            if (role !== 'caster') {
                const support = material.channelSupport?.[channelId];
                if (support?.supported !== true) {
                    failCompiler('reconstruction_channel_semantics_unsupported', 'Selected mapping material does not support the requested channel.', {
                        mappingId: mapping.id,
                        materialId: material.id,
                        channelId,
                        reasons: Array.isArray(support?.reasons) ? support.reasons : []
                    });
                }
            }
        }
        const forcedOpaqueOnly = usages.length > 0 && usages.every(({ role, mapping }) => (
            role === 'caster' && mapping.coverageMode === 'forced_opaque'
        ));
        const alpha = alphaById.get(material.alphaInputId);
        validateAlphaSemantics(material, alpha, forcedOpaqueOnly, textureById, bufferById, bindingIds);
        for (const bindingId of Object.values(material.textureBindings ?? {})) {
            if (typeof bindingId !== 'string') {
                failCompiler('reconstruction_texture_binding_unsupported', 'Material texture binding ID is invalid.', { materialId: material.id });
            }
            bindingIds.add(bindingId);
        }
    }
    const sourceIds = new Set();
    for (const bindingId of bindingIds) {
        const binding = textureById.get(bindingId);
        validateTextureBinding(bindingId, binding);
        const source = textureById.get(binding.sourceId);
        validateTextureSource(binding.sourceId, source);
        sourceIds.add(binding.sourceId);
    }
    const selectedIds = new Set([...bindingIds, ...sourceIds]);
    return { textures: selection.textures.filter((entry) => selectedIds.has(entry.id)) };
}

/**
 * @param {Record<string, any>} material
 * @param {Record<string, any> | undefined} alphaInput
 * @param {boolean} forcedOpaqueOnly
 * @param {Map<string, Record<string, any>>} textureById
 * @param {Map<string, Record<string, any>>} bufferById
 * @param {Set<string>} bindingIds
 */
function validateAlphaSemantics(material, alphaInput, forcedOpaqueOnly, textureById, bufferById, bindingIds) {
    if (!alphaInput || alphaInput.materialId !== material.id
        || canonicalJsonStringify(alphaInput.alpha) !== canonicalJsonStringify(material.alpha)) {
        failCompiler('reconstruction_alpha_reference_mismatch', 'Material alpha semantics do not resolve to their declared input.', {
            materialId: material.id,
            alphaInputId: material.alphaInputId ?? null
        });
    }
    const alpha = material.alpha;
    if (!alpha || typeof alpha !== 'object' || Array.isArray(alpha)) {
        failCompiler('reconstruction_alpha_semantics_unsupported', 'Material alpha semantics are missing.', { materialId: material.id });
    }
    if (!SUPPORTED_ALPHA_MODES.has(alpha.mode) && !forcedOpaqueOnly) {
        failCompiler('reconstruction_alpha_mode_unsupported', 'Selected material alpha mode has no V1 Blender adapter.', {
            materialId: material.id,
            mode: alpha.mode ?? null
        });
    }
    if (alpha.mode === 'procedural_coverage') {
        if (!Array.isArray(alpha.proceduralCoverage) || alpha.proceduralCoverage.length === 0
            || alpha.proceduralCoverage.some((entry) => !SUPPORTED_PROCEDURAL_ALPHA_ADAPTERS.has(entry?.adapterId))) {
            failCompiler('reconstruction_alpha_procedure_unsupported', 'Procedural alpha coverage uses an unsupported adapter.', {
                materialId: material.id
            });
        }
    }
    if (!Array.isArray(alpha.inputs)) {
        failCompiler('reconstruction_alpha_inputs_unsupported', 'Material alpha inputs must be an array.', { materialId: material.id });
    }
    if (alpha.mode === 'cutout' && alpha.inputs.length === 0) {
        failCompiler('reconstruction_alpha_inputs_unsupported', 'Cutout alpha requires an exact declared texture input.', { materialId: material.id });
    }
    for (const input of alpha.inputs) {
        if (!input || typeof input.bindingId !== 'string' || !['a', 'g'].includes(input.channel)
            || input.operation !== 'multiply') {
            failCompiler('reconstruction_alpha_inputs_unsupported', 'Alpha texture input channel or operation is unsupported.', {
                materialId: material.id,
                bindingId: input?.bindingId ?? null,
                channel: input?.channel ?? null,
                operation: input?.operation ?? null
            });
        }
        const binding = textureById.get(input.bindingId);
        const source = binding ? textureById.get(binding.sourceId) : null;
        const coverage = source?.coverageChannels?.[input.channel];
        const coverageBuffer = source ? bufferById.get(`${source.id}:coverage:${input.channel}`) : null;
        const exactCoverageMissing = !coverage || !coverageBuffer
            || coverageBuffer.kind !== 'texture_coverage_channel'
            || coverageBuffer.coverageChannel !== input.channel
            || coverageBuffer.contentSha256 !== coverage.sha256;
        if (!binding || !source || (alpha.mode === 'cutout' && exactCoverageMissing)) {
            failCompiler('reconstruction_alpha_coverage_missing', 'Alpha input is not backed by exact declared coverage bytes.', {
                materialId: material.id,
                bindingId: input.bindingId,
                channel: input.channel
            });
        }
        bindingIds.add(input.bindingId);
    }
}

/** @param {string} id @param {Record<string, any> | undefined} binding */
function validateTextureBinding(id, binding) {
    if (!binding || binding.kind !== 'binding' || typeof binding.sourceId !== 'string'
        || binding.mapping !== UV_MAPPING || !Number.isSafeInteger(binding.channel) || binding.channel < 0 || binding.channel > 3
        || !SUPPORTED_WRAP_MODES.has(binding.wrapS) || !SUPPORTED_WRAP_MODES.has(binding.wrapT)
        || !SUPPORTED_MAG_FILTERS.has(binding.magFilter) || !SUPPORTED_MIN_FILTERS.has(binding.minFilter)
        || !Array.isArray(binding.matrix) || binding.matrix.length !== 9
        || binding.matrix.some((value) => !Number.isFinite(value))
        || typeof binding.flipY !== 'boolean' || typeof binding.premultiplyAlpha !== 'boolean') {
        failCompiler('reconstruction_texture_sampling_unsupported', 'Texture binding uses unsupported V1 sampling semantics.', {
            bindingId: id
        });
    }
}

/** @param {string} id @param {Record<string, any> | undefined} source */
function validateTextureSource(id, source) {
    if (!source || source.kind !== 'source' || !Number.isSafeInteger(source.width) || source.width <= 0
        || !Number.isSafeInteger(source.height) || source.height <= 0
        || !['encoded_source', 'raw_rgba8', 'raw_typed_pixels'].includes(source.storage)
        || source.rowOrigin !== 'native_source_with_flipY_declared_by_binding') {
        failCompiler('reconstruction_texture_source_unsupported', 'Texture source uses unsupported V1 storage semantics.', {
            sourceId: id
        });
    }
}

/** @param {unknown} value @param {string} label */
function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
    return /** @type {Record<string, any>} */ (value);
}
