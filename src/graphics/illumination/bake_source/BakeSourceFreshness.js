// Pure freshness projections shared by export and independent package validation.
// @ts-check

import {
    canonicalJsonStringify,
    compareCanonicalStrings,
    hashCanonicalJsonSha256
} from '../../../app/illumination/bake_source/index.js';
import { failBakeSource } from './BakeSourceErrors.js';

export const RESOLVED_CITY_BAKE_CHANNEL_SOURCE_DOMAIN = 'bus-simulator/illumination/bake-source/channel-source/v1';

function sortById(entries) {
    return entries.sort((left, right) => compareCanonicalStrings(left.id, right.id));
}

function projectGeometryObject(entry) {
    const {
        materialIds: _materialIds,
        materialSlots: _materialSlots,
        resolvedCaster: _resolvedCaster,
        resolvedReceiver: _resolvedReceiver,
        mergeShadowAsOpaque: _mergeShadowAsOpaque,
        ...geometry
    } = entry;
    return geometry;
}

function projectGeometryInstance(entry) {
    const { materialIds: _materialIds, ...geometry } = entry;
    return geometry;
}

export function createGeometryFreshnessProjection({
    objects,
    meshInstances,
    geometries,
    buffers
}) {
    return {
        objects: objects.map(projectGeometryObject),
        meshInstances: meshInstances.map(projectGeometryInstance),
        geometries,
        buffers
    };
}

function receiverPolicyRecord(mapping) {
    return {
        id: `used-policy/${mapping.id}`,
        kind: 'receiver_material_policy',
        mappingId: mapping.id,
        meshInstanceId: mapping.meshInstanceId,
        objectId: mapping.objectId,
        geometryId: mapping.geometryId,
        materialId: mapping.materialId,
        alphaInputId: mapping.alphaInputId,
        groupIndex: mapping.groupIndex,
        materialIndex: mapping.materialIndex,
        start: mapping.start,
        count: mapping.count,
        channelRelevance: mapping.channelRelevance
    };
}

function casterPolicyRecord(mapping) {
    return {
        id: `used-policy/${mapping.id}`,
        kind: 'caster_material_policy',
        mappingId: mapping.id,
        meshInstanceId: mapping.meshInstanceId,
        objectId: mapping.objectId,
        geometryId: mapping.geometryId,
        materialId: mapping.materialId,
        alphaInputId: mapping.alphaInputId,
        groupIndex: mapping.groupIndex,
        materialIndex: mapping.materialIndex,
        start: mapping.start,
        count: mapping.count,
        coverageMode: mapping.coverageMode,
        side: mapping.side,
        shadowSide: mapping.shadowSide,
        preserveShadowSide: mapping.preserveShadowSide,
        effectiveShadowSide: mapping.effectiveShadowSide,
        policySource: mapping.policySource,
        channelRelevance: mapping.channelRelevance
    };
}

function participantPolicyRecord(mapping) {
    return {
        id: `used-policy/${mapping.id}`,
        kind: 'static_surface_participant_policy',
        mappingId: mapping.id,
        meshInstanceId: mapping.meshInstanceId,
        objectId: mapping.objectId,
        geometryId: mapping.geometryId,
        materialId: mapping.materialId,
        alphaInputId: mapping.alphaInputId,
        groupIndex: mapping.groupIndex,
        materialIndex: mapping.materialIndex,
        start: mapping.start,
        count: mapping.count,
        channelRelevance: mapping.channelRelevance
    };
}

export function createUsedMaterialsFreshnessInventory({
    materials,
    textures,
    alphaInputs,
    receiverMappings,
    casterMappings,
    participantMappings = []
}) {
    return sortById([
        ...materials,
        ...textures,
        ...alphaInputs,
        ...receiverMappings.map(receiverPolicyRecord),
        ...casterMappings.map(casterPolicyRecord),
        ...participantMappings.map(participantPolicyRecord)
    ]);
}

export function createReceiverLayoutFreshnessRecords(receiverMappings) {
    return receiverMappings.map((mapping) => ({
        id: `receiver-layout/${mapping.id}`,
        mappingId: mapping.id,
        meshInstanceId: mapping.meshInstanceId,
        objectId: mapping.objectId,
        geometryId: mapping.geometryId,
        groupIndex: mapping.groupIndex,
        start: mapping.start,
        count: mapping.count,
        lightmapMappingId: mapping.lightmapMappingId,
        geometricNormalAttribute: mapping.geometricNormalAttribute,
        uvSets: mapping.uvSets
    }));
}

export function createResolvedSourceFreshnessProjection({
    city,
    sourceProfile,
    roots,
    categories,
    chunks,
    unsupportedCases,
    semanticConflicts,
    receiverMappings
}) {
    return {
        city,
        sourceProfile,
        roots,
        categories,
        chunks,
        unsupportedCases,
        semanticConflicts,
        receiverBakeMappings: createReceiverLayoutFreshnessRecords(receiverMappings)
    };
}

export function resolvedCitySourceFromManifest(source) {
    const {
        exportProfileId: _exportProfileId,
        sourceSelection: _sourceSelection,
        unsupportedCases: _unsupportedCases,
        semanticConflicts: _semanticConflicts,
        ...city
    } = source;
    return city;
}

function projectChannelMapping(mapping, channelId, kind) {
    const base = {
        id: mapping.id,
        kind,
        meshInstanceId: mapping.meshInstanceId,
        objectId: mapping.objectId,
        geometryId: mapping.geometryId,
        materialSlotId: `material-slot/${mapping.objectId}/${String(mapping.materialIndex).padStart(4, '0')}`,
        groupIndex: mapping.groupIndex,
        materialIndex: mapping.materialIndex,
        start: mapping.start,
        count: mapping.count
    };
    if (kind === 'receiver') {
        return {
            ...base,
            lightmapMappingId: mapping.lightmapMappingId,
            geometricNormalAttribute: mapping.geometricNormalAttribute,
            uvSets: mapping.uvSets
        };
    }
    if (kind === 'participant') {
        return {
            ...base,
            channelRelevant: mapping.channelRelevance[channelId] === true
        };
    }
    return {
        ...base,
        coverageMode: mapping.coverageMode,
        side: mapping.side,
        shadowSide: mapping.shadowSide,
        preserveShadowSide: mapping.preserveShadowSide,
        effectiveShadowSide: mapping.effectiveShadowSide,
        policySource: mapping.policySource,
        channelRelevant: mapping.channelRelevance[channelId] === true
    };
}

function textureUseId(slotId, path) {
    return `channel-texture/${slotId}/${path.map((entry) => encodeURIComponent(String(entry))).join('/')}`;
}

function registerTextureUse(textureUses, { slotId, path, bindingId, mode, coverageChannel = null }) {
    if (typeof bindingId !== 'string' || !bindingId.startsWith('texture-binding:')) return bindingId ?? null;
    const id = textureUseId(slotId, path);
    const next = { id, bindingId, mode, coverageChannel };
    const prior = textureUses.get(id);
    if (prior && canonicalJsonStringify(prior) !== canonicalJsonStringify(next)) {
        failBakeSource('channel_texture_use_ambiguous', `Channel texture use '${id}' resolves to conflicting sources.`, { id });
    }
    textureUses.set(id, next);
    return id;
}

function projectAlpha(alpha, slotId, textureUses, { fullMapContent = false } = {}) {
    return {
        ...alpha,
        inputs: (alpha?.inputs ?? []).map((entry, index) => ({
            ...entry,
            bindingId: registerTextureUse(textureUses, {
                slotId,
                path: ['alpha', 'inputs', index],
                bindingId: entry.bindingId,
                mode: fullMapContent && entry.channel === 'a' ? 'full' : 'coverage',
                coverageChannel: entry.channel
            })
        }))
    };
}

function projectSemanticTextureReferences(value, slotId, textureUses, path = []) {
    if (typeof value === 'string') {
        return registerTextureUse(textureUses, {
            slotId,
            path,
            bindingId: value,
            mode: 'full'
        });
    }
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        return value.map((entry, index) => projectSemanticTextureReferences(entry, slotId, textureUses, [...path, index]));
    }
    const result = {};
    for (const key of Object.keys(value)) {
        result[key] = projectSemanticTextureReferences(value[key], slotId, textureUses, [...path, key]);
    }
    return result;
}

function projectFullTransportMaterial(material, slotId, textureUses) {
    const {
        id: _id,
        alphaInputId: _alphaInputId,
        alpha,
        textureBindings,
        customSemantics,
        ...semantics
    } = material;
    const projectedBindings = {};
    for (const [name, bindingId] of Object.entries(textureBindings ?? {})) {
        if (!bindingId) continue;
        projectedBindings[name] = registerTextureUse(textureUses, {
            slotId,
            path: ['textureBindings', name],
            bindingId,
            mode: name === 'alphaMap' ? 'coverage' : 'full',
            coverageChannel: name === 'alphaMap' ? 'g' : null
        });
    }
    return {
        id: slotId,
        ...semantics,
        alpha: projectAlpha(alpha, slotId, textureUses, { fullMapContent: true }),
        textureBindings: projectedBindings,
        customSemantics: projectSemanticTextureReferences(
            customSemantics ?? {},
            slotId,
            textureUses,
            ['customSemantics']
        )
    };
}

function channelMaterialProjection(channelId, material, slotId, { participant = false, receiver = false, textureUses } = {}) {
    if (channelId === 'indirect_irradiance' && participant) {
        return projectFullTransportMaterial(material, slotId, textureUses);
    }
    const normalMapBindingId = channelId === 'direct_receiver' && receiver && material.textureBindings.normalMap
        ? registerTextureUse(textureUses, {
            slotId,
            path: ['normalMap'],
            bindingId: material.textureBindings.normalMap,
            mode: 'full'
        })
        : null;
    return {
        id: slotId,
        alpha: projectAlpha(material.alpha, slotId, textureUses),
        side: material.side,
        shadowSide: material.shadowSide,
        preserveShadowSide: material.preserveShadowSide === true,
        isFoliage: material.isFoliage === true,
        channelSupport: material.channelSupport[channelId],
        normalMapBindingId,
        normalMapType: channelId === 'direct_receiver' ? material.normalMapType ?? null : null,
        normalMapSpace: channelId === 'direct_receiver' ? material.normalMapSpace ?? null : null,
        normalMapTangentRequirement: channelId === 'direct_receiver'
            ? material.normalMapTangentRequirement ?? null
            : null,
        normalScale: channelId === 'direct_receiver' ? material.normalScale ?? null : null
    };
}

function selectTextureRecords(textures, textureUses) {
    const byId = new Map(textures.map((entry) => [entry.id, entry]));
    const selected = [];
    for (const use of sortById(Array.from(textureUses.values()))) {
        const binding = byId.get(use.bindingId);
        if (!binding) failBakeSource('channel_texture_binding_missing', `Channel texture binding '${use.bindingId}' is missing.`, { bindingId: use.bindingId });
        const source = byId.get(binding.sourceId);
        if (!source) failBakeSource('channel_texture_source_missing', `Channel texture source '${binding.sourceId}' is missing.`, { sourceId: binding.sourceId });
        const sourceId = `${use.id}/source`;
        const { id: _bindingId, sourceId: _originalSourceId, ...sampling } = binding;
        const projectedSampling = use.mode === 'coverage'
            ? Object.fromEntries(Object.entries(sampling).filter(([key]) => key !== 'colorSpace'))
            : sampling;
        selected.push({ id: use.id, kind: 'binding', sourceId, ...projectedSampling });
        if (use.mode === 'full') {
            const { id: _sourceId, ...fullSource } = source;
            selected.push({ id: sourceId, kind: 'source', ...fullSource });
            continue;
        }
        const coverage = source.coverageChannels?.[use.coverageChannel];
        if (!coverage) {
            failBakeSource('channel_texture_coverage_missing', `Texture source '${binding.sourceId}' has no exact '${use.coverageChannel}' coverage identity.`, {
                sourceId: binding.sourceId,
                channel: use.coverageChannel
            });
        }
        selected.push({
            id: sourceId,
            kind: 'coverage_source',
            width: source.width,
            height: source.height,
            depth: source.depth,
            format: source.format,
            type: source.type,
            internalFormat: source.internalFormat,
            storage: source.storage,
            componentType: source.componentType,
            rowOrigin: source.rowOrigin,
            coverageChannel: use.coverageChannel,
            coverage
        });
    }
    return sortById(selected);
}

export function createChannelSourceProjection(channelId, context) {
    const {
        objects,
        meshInstances,
        geometries,
        receiverMappings,
        casterMappings,
        participantMappings = [],
        materials,
        textures
    } = context;
    const receivers = receiverMappings.filter((entry) => entry.channelRelevance[channelId] === true);
    const casters = casterMappings.filter((entry) => entry.channelRelevance[channelId] === true);
    const casterGeometryRelevant = channelId === 'static_sun_depth' || channelId === 'direct_receiver';
    // Indirect transport and AO depend on all visible static geometry, including
    // bounce/occlusion-only surfaces that do not use Three's shadow-map flags.
    // The direct and sun-depth projections remain limited to their evaluated
    // receiver/caster mappings.
    const completeParticipatingGeometry = channelId === 'indirect_irradiance'
        || channelId === 'static_ao_bent_normal';
    const participants = completeParticipatingGeometry
        ? participantMappings.filter((entry) => entry.channelRelevance[channelId] === true)
        : [];
    const objectIds = new Set([...receivers, ...casters, ...participants].map((entry) => entry.objectId));
    const selectedObjects = objects.filter((entry) => objectIds.has(entry.id)).map(projectGeometryObject);
    const selectedInstances = meshInstances.filter((entry) => objectIds.has(entry.objectId)).map(projectGeometryInstance);
    const geometryIds = new Set(selectedObjects.map((entry) => entry.geometryId));
    const selectedGeometries = geometries
        .filter((entry) => geometryIds.has(entry.id))
        .map((entry) => ({
            ...entry,
            objectIds: Array.isArray(entry.objectIds)
                ? entry.objectIds.filter((id) => objectIds.has(id))
                : entry.objectIds
        }));
    const materialById = new Map(materials.map((entry) => [entry.id, entry]));
    const materialBySlotId = new Map();
    const textureUses = new Map();
    const selectedSlotsById = new Map();
    const registerSlot = (mapping, role) => {
        const slotId = `material-slot/${mapping.objectId}/${String(mapping.materialIndex).padStart(4, '0')}`;
        const slot = selectedSlotsById.get(slotId) ?? {
            slotId,
            objectId: mapping.objectId,
            materialIndex: mapping.materialIndex,
            materialId: mapping.materialId,
            sourceIds: [],
            participant: false,
            receiver: false,
            caster: false
        };
        if (slot.materialId !== mapping.materialId) {
            failBakeSource('channel_material_slot_ambiguous', `Channel material slot '${slotId}' resolves to multiple material IDs.`, {
                slotId,
                materialIds: [slot.materialId, mapping.materialId]
            });
        }
        slot.sourceIds.push(mapping.id);
        slot[role] = true;
        selectedSlotsById.set(slotId, slot);
    };
    for (const mapping of receivers) registerSlot(mapping, 'receiver');
    if (casterGeometryRelevant) for (const mapping of casters) registerSlot(mapping, 'caster');
    for (const mapping of participants) registerSlot(mapping, 'participant');
    const selectedSlots = Array.from(selectedSlotsById.values())
        .sort((left, right) => compareCanonicalStrings(left.slotId, right.slotId));
    for (const slot of selectedSlots) {
        const material = materialById.get(slot.materialId);
        if (!material) failBakeSource('channel_material_missing', `Channel material slot '${slot.slotId}' references a missing material.`, { sourceIds: slot.sourceIds });
        const projection = channelMaterialProjection(channelId, material, slot.slotId, {
            participant: slot.participant,
            receiver: slot.receiver,
            textureUses
        });
        const prior = materialBySlotId.get(slot.slotId);
        if (prior && canonicalJsonStringify(prior) !== canonicalJsonStringify(projection)) {
            failBakeSource('channel_material_slot_ambiguous', `Channel material slot '${slot.slotId}' resolves to multiple semantics.`, { slotId: slot.slotId });
        }
        materialBySlotId.set(slot.slotId, projection);
    }
    const selectedMaterials = sortById(Array.from(materialBySlotId.values()));
    return {
        participationPolicy: completeParticipatingGeometry
            ? 'all_exported_visible_static_surfaces'
            : 'evaluated_receiver_and_caster_mappings',
        objects: selectedObjects,
        meshInstances: selectedInstances,
        geometries: selectedGeometries,
        receiverMappings: receivers.map((entry) => projectChannelMapping(entry, channelId, 'receiver')),
        casterMappings: casters.map((entry) => projectChannelMapping(entry, channelId, 'caster')),
        participantMappings: participants.map((entry) => projectChannelMapping(entry, channelId, 'participant')),
        materials: selectedMaterials,
        textures: selectTextureRecords(textures, textureUses),
        alphaInputs: selectedMaterials.map((entry) => ({
            id: `channel-alpha/${entry.id}`,
            alpha: entry.alpha,
            side: entry.side,
            shadowSide: entry.shadowSide
        }))
    };
}

export function projectLightingProfileForChannel(channelId, profile) {
    if (channelId === 'static_sun_depth' && profile.type === 'directional_sun') {
        return {
            id: profile.id,
            type: profile.type,
            directionThree: profile.directionThree,
            angularDiameterDegrees: profile.angularDiameterDegrees ?? null,
            filterModel: profile.filterModel ?? null
        };
    }
    return profile;
}

export async function buildChannelSourceHashes(channelProfiles, hashSet, context) {
    const channelHashes = new Map(hashSet.channels.map((entry) => [entry.id, entry.sha256]));
    const lightingProfileById = new Map(context.lightingProfiles.map((entry) => [entry.id, entry]));
    const results = [];
    for (const channel of channelProfiles) {
        const referencedProfiles = [];
        for (const id of [channel.lightProfileId, ...(channel.lightProfileIds ?? [])]) {
            if (!id) continue;
            const profile = lightingProfileById.get(id);
            if (!profile) failBakeSource('channel_profile_reference_missing', `Channel '${channel.id}' references missing lighting profile '${id}'.`, { channelId: channel.id, profileId: id });
            referencedProfiles.push(projectLightingProfileForChannel(channel.id, profile));
        }
        const projection = {
            channelId: channel.id,
            channelConfigurationSha256: channelHashes.get(channel.id),
            lightingProfiles: sortById(referencedProfiles),
            source: createChannelSourceProjection(channel.id, context)
        };
        results.push({
            id: channel.id,
            sha256: await hashCanonicalJsonSha256(`${RESOLVED_CITY_BAKE_CHANNEL_SOURCE_DOMAIN}/${channel.id}`, projection)
        });
    }
    return sortById(results);
}
