// Orchestrates deterministic resolved-city extraction, freshness hashes, packaging, and reports.
// @ts-check

import {
    BAKE_SOURCE_HASH_SET_SCHEMA,
    buildBakeSourceHashSet,
    buildBakeSourcePackage,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings,
    hashCanonicalJsonSha256,
    sha256Hex,
    validateAffineTransform,
    convertThreeMatrixToBlender
} from '../../../app/illumination/bake_source/index.js';
import { failBakeSource } from './BakeSourceErrors.js';
import {
    collectResolvedCityBakeRoots,
    createOriginalCasterResolver,
    createResolvedCitySourceRecord
} from './BakeSourceScene.js';
import {
    extractBakeSourceGeometry,
    getBakeSourceMaterialReferences,
    getBakeSourceObjectReferences
} from './BakeSourceGeometry.js';
import {
    assertBakeSourceCasterShadowMaterials,
    createBakeMaterialCatalog
} from './BakeSourceMaterials.js';
import {
    buildChannelSourceHashes,
    createChannelSourceProjection,
    createGeometryFreshnessProjection,
    createResolvedSourceFreshnessProjection,
    createUsedMaterialsFreshnessInventory
} from './BakeSourceFreshness.js';
import { validateResolvedCityBakePackage } from './BakeSourceValidation.js';
import {
    requireStaticSunDepthCasterSidedness,
    resolveStaticSunDepthEffectiveShadowSide
} from '../../lighting/EffectiveShadowSide.js';

export const RESOLVED_CITY_BAKE_INPUT_FORMAT = 'bus-sim-illumination-bake-input-v2';
export const RESOLVED_CITY_BAKE_GEOMETRY_BUFFER_DOMAIN = 'bus-simulator/illumination/bake-source/evaluated-geometry-buffer/v1';
export const RESOLVED_CITY_BAKE_ALPHA_DOMAIN = 'bus-simulator/illumination/bake-source/alpha-input/v1';
export const RESOLVED_CITY_BAKE_PROFILE_ASSET_DOMAIN = 'bus-simulator/illumination/bake-source/profile-asset/v1';
export const RESOLVED_CITY_BAKE_FILE_DOMAIN = 'bus-simulator/illumination/bake-source/final-file/v1';

function sortById(entries) {
    return entries.sort((left, right) => compareCanonicalStrings(left.id, right.id));
}

function normalizeProjectUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    const url = new URL(value, globalThis.location?.href ?? 'http://localhost/');
    return globalThis.location && url.origin === globalThis.location.origin ? url.pathname : url.toString();
}

function mappingRange(geometry, group, groupIndex) {
    const drawStart = geometry.drawRange.start;
    const drawEnd = drawStart + geometry.drawRange.count;
    const groupStart = group?.start ?? drawStart;
    const groupEnd = group ? group.start + group.count : drawEnd;
    const start = Math.max(drawStart, groupStart);
    const end = Math.min(drawEnd, groupEnd);
    return {
        groupIndex,
        materialIndex: group?.materialIndex ?? 0,
        start,
        count: Math.max(0, end - start)
    };
}

async function captureLightingProfiles(inputProfiles) {
    const profiles = [];
    const buffers = [];
    for (const input of inputProfiles ?? []) {
        const profile = { ...cloneCanonicalJson(input) };
        const source = normalizeProjectUrl(profile.source);
        if (profile.type === 'environment_ibl' && profile.enabled !== false && !source) {
            failBakeSource('lighting_profile_source_missing', `Lighting profile '${profile.id}' is enabled without a canonical source.`, {
                id: profile.id
            });
        }
        if (profile.type === 'environment_ibl' && profile.enabled !== false && source) {
            const response = await fetch(profile.source);
            if (!response.ok) {
                failBakeSource('lighting_profile_source_missing', `Lighting profile '${profile.id}' source could not be fetched.`, {
                    id: profile.id,
                    source,
                    status: response.status
                });
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (!bytes.byteLength) failBakeSource('lighting_profile_source_empty', `Lighting profile '${profile.id}' source is empty.`, { id: profile.id, source });
            const sha256 = await sha256Hex(RESOLVED_CITY_BAKE_PROFILE_ASSET_DOMAIN, bytes);
            const bufferId = `profile-asset/${sha256}`;
            profile.source = source;
            profile.sourceReference = {
                bufferId,
                byteLength: bytes.byteLength,
                mimeType: response.headers.get('content-type')?.split(';')[0] ?? null,
                sha256
            };
            buffers.push({ id: bufferId, data: bytes, contentSha256: sha256, kind: 'lighting_profile_source' });
        }
        profiles.push(profile);
    }
    return { profiles: sortById(profiles), buffers: sortById(buffers) };
}

async function createAlphaInputs(materials) {
    const records = [];
    const byMaterialId = new Map();
    for (const material of materials) {
        const projection = {
            schema: 'bus-sim-evaluated-alpha-input-v1',
            materialId: material.id,
            alpha: material.alpha,
            side: material.side,
            shadowSide: material.shadowSide,
            vertexColors: material.vertexColors,
            textureBindingIds: material.alpha.inputs.map((entry) => entry.bindingId).sort(compareCanonicalStrings)
        };
        const sha256 = await hashCanonicalJsonSha256(RESOLVED_CITY_BAKE_ALPHA_DOMAIN, projection);
        const record = { id: `alpha-input/${sha256}`, ...projection, sha256 };
        records.push(record);
        byMaterialId.set(material.id, record);
    }
    return { records: sortById(records), byMaterialId };
}

function createMappings({
    geometryExtraction,
    materialRecords,
    materialIdByLiveObject,
    alphaByMaterialId,
    city,
    casterSidedness
}) {
    const authenticatedCasterSidedness = requireStaticSunDepthCasterSidedness(casterSidedness);
    const geometryById = new Map(geometryExtraction.geometries.map((entry) => [entry.id, entry]));
    const materialById = new Map(materialRecords.map((entry) => [entry.id, entry]));
    const materialReferences = getBakeSourceMaterialReferences(geometryExtraction);
    const objectReferences = getBakeSourceObjectReferences(geometryExtraction);
    const resolveOriginalCaster = createOriginalCasterResolver(city);
    const objects = [];
    const meshInstances = [];
    const receiverMappings = [];
    const casterMappings = [];
    const participantMappings = [];
    const unsupportedCases = [];
    const semanticConflicts = [];

    for (const extracted of geometryExtraction.objects) {
        const liveObject = objectReferences.get(extracted.id);
        const slots = materialReferences.get(extracted.id) ?? [];
        const geometry = geometryById.get(extracted.geometryId);
        const groups = extracted.materialGroupingMode === 'geometry_groups' && geometry.groups.length
            ? geometry.groups.map((group, index) => mappingRange(geometry, group, index))
            : [mappingRange(geometry, null, 0)];
        const activeSlotIndices = Array.from(new Set(groups
            .filter((range) => range.count > 0)
            .map((range) => range.materialIndex))).sort((left, right) => left - right);
        const materialSlots = activeSlotIndices.map((index) => ({
            index,
            id: materialIdByLiveObject.get(slots[index])?.id
        }));
        if (materialSlots.some((entry) => !entry.id)) {
            failBakeSource('material_mapping_missing', `Object '${extracted.id}' has an unmapped active material.`, {
                id: extracted.id,
                activeSlotIndices
            });
        }
        const materialIdBySlotIndex = new Map(materialSlots.map((entry) => [entry.index, entry.id]));
        const materialIds = materialSlots.map((entry) => entry.id);
        const sourceCaster = resolveOriginalCaster(liveObject);
        const sourceReceiver = liveObject?.receiveShadow === true;
        const forcedOpaque = liveObject?.userData?.mergeShadowAsOpaque === true;
        assertBakeSourceCasterShadowMaterials(liveObject, {
            selectedCaster: sourceCaster && materialIds.some((id) => materialById.get(id)?.visible !== false),
            objectId: extracted.id,
            rootId: extracted.rootId,
            semanticPath: extracted.semanticPath
        });
        const { instances, ...objectDescriptor } = extracted;
        objects.push({
            ...objectDescriptor,
            materialIds,
            materialSlots,
            instanceIds: instances.map((entry) => entry.id),
            resolvedCaster: sourceCaster,
            resolvedReceiver: sourceReceiver,
            mergeShadowAsOpaque: forcedOpaque,
            provenance: {
                rootId: extracted.rootId,
                semanticPath: extracted.semanticPath,
                sourceKind: extracted.sourceKind
            }
        });
        for (const instance of instances) {
            meshInstances.push({
                ...instance,
                objectId: extracted.id,
                rootId: extracted.rootId,
                category: extracted.category,
                geometryId: extracted.geometryId,
                materialIds
            });
        }

        for (const range of groups) {
            if (range.count === 0) continue;
            const materialId = materialIdBySlotIndex.get(range.materialIndex);
            const material = materialById.get(materialId);
            const alpha = alphaByMaterialId.get(materialId);
            const visible = material.visible !== false;
            let coverageMode = 'none';
            if (sourceCaster && visible) {
                if (forcedOpaque) coverageMode = 'forced_opaque';
                else if (material.alpha.mode === 'opaque') coverageMode = 'opaque';
                else if (material.alpha.mode === 'cutout') coverageMode = 'cutout';
                else if (material.alpha.mode === 'procedural_coverage') coverageMode = 'procedural_coverage';
                else coverageMode = 'unsupported_blend_or_transmission';
            }
            if (forcedOpaque && material.alpha.mode !== 'opaque') {
                semanticConflicts.push({
                    id: `spec-runtime-conflict/${extracted.id}/${String(range.groupIndex).padStart(4, '0')}`,
                    code: 'SPEC_RUNTIME_SEMANTIC_CONFLICT',
                    objectId: extracted.id,
                    materialId,
                    resolvedBehavior: 'forced_opaque_shadow_silhouette'
                });
            }
            const casterCoverageSupport = coverageMode === 'unsupported_blend_or_transmission'
                ? material.channelSupport.static_sun_depth
                : { supported: true, reasons: [] };
            const supportRequirements = [
                ['static_sun_depth', 'caster', sourceCaster && visible, casterCoverageSupport],
                ['direct_receiver', 'receiver', sourceReceiver && visible, material.channelSupport.direct_receiver],
                ['direct_receiver', 'caster', sourceCaster && visible, casterCoverageSupport],
                ['indirect_irradiance', 'participant', visible, material.channelSupport.indirect_irradiance],
                ['static_ao_bent_normal', 'participant', visible, material.channelSupport.static_ao_bent_normal]
            ];
            for (const [channelId, role, relevant, support] of supportRequirements) {
                if (relevant && !support.supported) unsupportedCases.push({
                    id: `unsupported/${channelId}/${role}/${materialId}`,
                    channelId,
                    role,
                    materialId,
                    reasons: support.reasons
                });
            }
            for (const instance of instances) {
                const suffix = `${instance.id}/group/${String(range.groupIndex).padStart(4, '0')}`;
                if (visible) {
                    participantMappings.push({
                        id: `participant/${suffix}`,
                        meshInstanceId: instance.id,
                        objectId: extracted.id,
                        geometryId: extracted.geometryId,
                        materialId,
                        alphaInputId: alpha.id,
                        groupIndex: range.groupIndex,
                        materialIndex: range.materialIndex,
                        start: range.start,
                        count: range.count,
                        chunkId: instance.chunkId,
                        category: extracted.category,
                        channelRelevance: {
                            indirect_irradiance: material.channelSupport.indirect_irradiance.supported,
                            static_ao_bent_normal: material.channelSupport.static_ao_bent_normal.supported
                        }
                    });
                }
                if (sourceReceiver && visible) {
                    receiverMappings.push({
                        id: `receiver/${suffix}`,
                        meshInstanceId: instance.id,
                        objectId: extracted.id,
                        geometryId: extracted.geometryId,
                        materialId,
                        alphaInputId: alpha.id,
                        groupIndex: range.groupIndex,
                        materialIndex: range.materialIndex,
                        start: range.start,
                        count: range.count,
                        chunkId: instance.chunkId,
                        category: extracted.category,
                        lightmapMappingId: `lightmap/${suffix}`,
                        geometricNormalAttribute: geometry.attributes.normal ? 'normal' : null,
                        uvSets: Object.keys(geometry.attributes).filter((name) => /^uv\d*$/.test(name)).sort(compareCanonicalStrings),
                        normalMapPreventsScalarPromotion: Boolean(material.textureBindings.normalMap),
                        channelRelevance: {
                            direct_receiver: material.channelSupport.direct_receiver.supported,
                            indirect_irradiance: material.channelSupport.indirect_irradiance.supported,
                            static_ao_bent_normal: material.channelSupport.static_ao_bent_normal.supported
                        }
                    });
                }
                if (sourceCaster && visible) {
                    const preserveShadowSide = material.preserveShadowSide === true
                        || material.isFoliage === true;
                    casterMappings.push({
                        id: `caster/${suffix}`,
                        meshInstanceId: instance.id,
                        objectId: extracted.id,
                        geometryId: extracted.geometryId,
                        materialId,
                        alphaInputId: alpha.id,
                        groupIndex: range.groupIndex,
                        materialIndex: range.materialIndex,
                        start: range.start,
                        count: range.count,
                        chunkId: instance.chunkId,
                        category: extracted.category,
                        coverageMode,
                        side: material.side,
                        shadowSide: material.shadowSide,
                        preserveShadowSide,
                        effectiveShadowSide: resolveStaticSunDepthEffectiveShadowSide({
                            side: material.side,
                            shadowSide: material.shadowSide,
                            preserveShadowSide: material.preserveShadowSide,
                            isFoliage: material.isFoliage
                        }, authenticatedCasterSidedness),
                        policySource: forcedOpaque ? 'mergeShadowAsOpaque' : 'evaluated_original_caster',
                        channelRelevance: {
                            static_sun_depth: coverageMode !== 'unsupported_blend_or_transmission',
                            direct_receiver: coverageMode !== 'unsupported_blend_or_transmission',
                            indirect_irradiance: coverageMode !== 'unsupported_blend_or_transmission',
                            static_ao_bent_normal: coverageMode !== 'unsupported_blend_or_transmission'
                        }
                    });
                }
            }
        }
    }
    const uniqueUnsupported = new Map(unsupportedCases.map((entry) => [entry.id, entry]));
    return {
        objects: sortById(objects),
        meshInstances: sortById(meshInstances),
        receiverMappings: sortById(receiverMappings),
        casterMappings: sortById(casterMappings),
        participantMappings: sortById(participantMappings),
        unsupportedCases: sortById(Array.from(uniqueUnsupported.values())),
        semanticConflicts: sortById(semanticConflicts)
    };
}

function selectCoverageBuffers(materials, textureCatalog, availableBuffers) {
    const bindingById = new Map(textureCatalog.bindings.map((entry) => [entry.id, entry]));
    const availableById = new Map(availableBuffers.map((entry) => [entry.id, entry]));
    const selected = new Map();
    for (const material of materials) {
        if (material.alpha?.mode === 'opaque') continue;
        for (const input of (material.alpha?.inputs ?? [])) {
            const binding = bindingById.get(input.bindingId);
            if (!binding) failBakeSource('alpha_texture_binding_missing', `Material '${material.id}' references a missing alpha texture binding.`, { materialId: material.id, bindingId: input.bindingId });
            const id = `${binding.sourceId}:coverage:${input.channel}`;
            const buffer = availableById.get(id);
            if (!buffer) failBakeSource('alpha_texture_coverage_missing', `Material '${material.id}' has no exact '${input.channel}' texture coverage bytes.`, { materialId: material.id, sourceId: binding.sourceId, channel: input.channel });
            selected.set(id, buffer);
        }
    }
    return sortById(Array.from(selected.values()));
}

function bufferDescriptors(geometryBuffers, textureBuffers, coverageBuffers, profileBuffers, textureSources) {
    const textureSourceByBuffer = new Map(textureSources.map((entry) => [`${entry.id}:bytes`, entry]));
    const records = [
        ...geometryBuffers.map(({ data, ...entry }) => ({
            id: entry.id,
            kind: 'geometry',
            encoding: 'typed_array_little_endian',
            byteLength: data.byteLength,
            contentSha256: entry.sha256,
            roles: entry.roles
        })),
        ...textureBuffers.map((entry) => {
            const source = textureSourceByBuffer.get(entry.id);
            return {
                id: entry.id,
                kind: 'texture_source',
                encoding: source?.storage === 'encoded_source' ? 'raw_source' : 'typed_array_little_endian',
                byteLength: entry.data.byteLength,
                contentSha256: source?.contentSha256 ?? null,
                textureSourceId: source?.id ?? null
            };
        }),
        ...coverageBuffers.map((entry) => ({
            id: entry.id,
            kind: 'texture_coverage_channel',
            encoding: 'exact_channel_typed_bytes',
            byteLength: entry.data.byteLength,
            contentSha256: entry.contentSha256,
            textureSourceId: entry.textureSourceId,
            coverageChannel: entry.coverageChannel
        })),
        ...profileBuffers.map((entry) => ({
            id: entry.id,
            kind: entry.kind,
            encoding: 'raw_source',
            byteLength: entry.data.byteLength,
            contentSha256: entry.contentSha256
        }))
    ];
    return sortById(records);
}

function registerPackageBuffers(...groups) {
    const byId = new Map();
    for (const group of groups) {
        for (const entry of group) {
            if (byId.has(entry.id)) failBakeSource('duplicate_buffer_id', `Duplicate package buffer ID '${entry.id}'.`, { id: entry.id });
            byId.set(entry.id, { id: entry.id, data: entry.data });
        }
    }
    return sortById(Array.from(byId.values()));
}

function createInventoryReport(manifest, geometryInventory) {
    const channelCounts = {};
    for (const channel of manifest.channelProfiles) {
        channelCounts[channel.id] = {
            receivers: manifest.receiverMappings.filter((entry) => entry.channelRelevance[channel.id] === true).length,
            casters: manifest.casterMappings.filter((entry) => entry.channelRelevance[channel.id] === true).length,
            participants: manifest.participantMappings.filter((entry) => entry.channelRelevance[channel.id] === true).length
        };
    }
    return {
        schema: 'bus-sim-illumination-bake-inventory-report-v1',
        cityId: manifest.source.cityId,
        ...geometryInventory,
        materialCount: manifest.materials.length,
        textureSourceCount: manifest.textures.filter((entry) => entry.kind === 'source').length,
        textureBindingCount: manifest.textures.filter((entry) => entry.kind === 'binding').length,
        textureCoverageBufferCount: manifest.buffers.filter((entry) => entry.kind === 'texture_coverage_channel').length,
        textureCoverageByteLength: manifest.buffers
            .filter((entry) => entry.kind === 'texture_coverage_channel')
            .reduce((sum, entry) => sum + entry.byteLength, 0),
        alphaInputCount: manifest.alphaInputs.length,
        receiverMappingCount: manifest.receiverMappings.length,
        casterMappingCount: manifest.casterMappings.length,
        participantMappingCount: manifest.participantMappings.length,
        channelCounts
    };
}

function createSizeReport(manifest, packageByteLength, channelSourceContext) {
    const byKind = {};
    for (const buffer of manifest.buffers) byKind[buffer.kind] = (byKind[buffer.kind] ?? 0) + buffer.byteLength;
    const geometryById = new Map(manifest.geometries.map((entry) => [entry.id, entry]));
    const bufferById = new Map(manifest.buffers.map((entry) => [entry.id, entry]));
    const objectGeometrySize = (object) => {
        const geometry = geometryById.get(object.geometryId);
        const bufferIds = new Set();
        for (const accessor of Object.values(geometry.attributes)) bufferIds.add(accessor.bufferId);
        if (geometry.index) bufferIds.add(geometry.index.bufferId);
        const byteLength = Array.from(bufferIds).reduce((sum, id) => sum + bufferById.get(id).byteLength, 0);
        return { geometry, byteLength };
    };
    const byCategory = {};
    for (const object of manifest.objects) {
        const { geometry, byteLength } = objectGeometrySize(object);
        const entry = byCategory[object.category] ?? { objectCount: 0, meshInstanceCount: 0, expandedTriangles: 0, inclusiveGeometryBytes: 0 };
        entry.objectCount += 1;
        entry.meshInstanceCount += object.instanceIds.length;
        entry.expandedTriangles += geometry.triangleCount * object.instanceIds.length;
        entry.inclusiveGeometryBytes += byteLength;
        byCategory[object.category] = entry;
    }
    const byChannel = {};
    for (const channel of manifest.channelProfiles) {
        const channelSource = createChannelSourceProjection(channel.id, channelSourceContext);
        const receivers = manifest.receiverMappings.filter((entry) => entry.channelRelevance[channel.id] === true);
        const casters = manifest.casterMappings.filter((entry) => entry.channelRelevance[channel.id] === true);
        const participants = manifest.participantMappings.filter((entry) => entry.channelRelevance[channel.id] === true);
        const objectIds = new Set([...receivers, ...casters, ...participants].map((entry) => entry.objectId));
        const materialIds = new Set([...receivers, ...casters, ...participants].map((entry) => entry.materialId));
        const alphaInputIds = new Set([...receivers, ...casters, ...participants].map((entry) => entry.alphaInputId));
        const entry = {
            receiverMappingCount: receivers.length,
            casterMappingCount: casters.length,
            participantMappingCount: participants.length,
            objectCount: 0,
            meshInstanceCount: 0,
            expandedTriangles: 0,
            materialCount: materialIds.size,
            alphaInputCount: alphaInputIds.size,
            textureBindingCount: channelSource.textures.filter((item) => item.kind === 'binding').length,
            textureSourceUseCount: channelSource.textures.filter((item) => item.kind !== 'binding').length,
            uniqueTextureContentCount: 0,
            inclusiveGeometryBytes: 0,
            fullTextureSourceBytes: 0,
            coverageTextureSourceBytes: 0,
            lightingProfileSourceBytes: 0,
            inclusiveInputBytes: 0
        };
        for (const object of manifest.objects) {
            if (!objectIds.has(object.id)) continue;
            const { geometry, byteLength } = objectGeometrySize(object);
            entry.objectCount += 1;
            entry.meshInstanceCount += object.instanceIds.length;
            entry.expandedTriangles += geometry.triangleCount * object.instanceIds.length;
            entry.inclusiveGeometryBytes += byteLength;
        }
        const textureContents = new Map();
        for (const texture of channelSource.textures) {
            if (texture.kind === 'source') {
                textureContents.set(`full:${texture.contentSha256}`, {
                    kind: 'full',
                    byteLength: texture.byteLength
                });
            } else if (texture.kind === 'coverage_source') {
                textureContents.set(`coverage:${texture.coverage.sha256}`, {
                    kind: 'coverage',
                    byteLength: texture.coverage.byteLength
                });
            }
        }
        entry.uniqueTextureContentCount = textureContents.size;
        for (const content of textureContents.values()) {
            if (content.kind === 'full') entry.fullTextureSourceBytes += content.byteLength;
            else entry.coverageTextureSourceBytes += content.byteLength;
        }
        const profileIds = new Set([
            channel.lightProfileId,
            ...(channel.lightProfileIds ?? [])
        ].filter(Boolean));
        for (const profile of manifest.lightingProfiles) {
            if (profileIds.has(profile.id)) entry.lightingProfileSourceBytes += profile.sourceReference?.byteLength ?? 0;
        }
        entry.inclusiveInputBytes = entry.inclusiveGeometryBytes
            + entry.fullTextureSourceBytes
            + entry.coverageTextureSourceBytes
            + entry.lightingProfileSourceBytes;
        byChannel[channel.id] = entry;
    }
    return {
        schema: 'bus-sim-illumination-bake-size-report-v1',
        packageByteLength,
        logicalBufferBytes: manifest.buffers.reduce((sum, entry) => sum + entry.byteLength, 0),
        byKind,
        byCategory,
        byChannel,
        note: 'Category and channel bytes are inclusive. Shared geometry can be counted once per object and again in more than one category or channel; texture content is deduplicated within each channel by semantic content digest.'
    };
}

/**
 * Exports one fully resolved, prewarmed gameplay city. It does not attach the city or mutate gameplay lighting.
 */
export async function exportResolvedCityBakeSource({ city, profile, readiness = {}, sourceEqualityVerified = false } = {}) {
    if (!city?.cityId || !profile?.id) failBakeSource('export_context_missing', 'Resolved city export requires a city and explicit export profile.');
    const started = performance.now();
    city.group.updateWorldMatrix(true, true);
    const sourceBefore = createResolvedCitySourceRecord(city);
    const roots = collectResolvedCityBakeRoots(city);
    const [geometryExtraction, materialCatalog, capturedLighting] = await Promise.all([
        extractBakeSourceGeometry(roots, {
            hashBytes: (bytes) => sha256Hex(RESOLVED_CITY_BAKE_GEOMETRY_BUFFER_DOMAIN, bytes),
            matrixHelpers: { validateAffineTransform, convertThreeMatrixToBlender }
        }),
        createBakeMaterialCatalog(roots),
        captureLightingProfiles(profile.lightProfiles)
    ]);

    const sourceAfter = createResolvedCitySourceRecord(city);
    if (canonicalJsonStringify(sourceBefore) !== canonicalJsonStringify(sourceAfter)) {
        failBakeSource('source_mutated_during_export', 'Resolved city source provenance changed during extraction.');
    }
    const sourceMaterialRecords = materialCatalog.materials;
    const coverageBuffers = selectCoverageBuffers(
        sourceMaterialRecords,
        materialCatalog.textures,
        materialCatalog.coverageBuffers
    );
    const alphaCatalog = await createAlphaInputs(sourceMaterialRecords);
    const mappings = createMappings({
        geometryExtraction,
        materialRecords: sourceMaterialRecords,
        materialIdByLiveObject: materialCatalog.materialByObject,
        alphaByMaterialId: alphaCatalog.byMaterialId,
        city,
        casterSidedness: profile.channelConfigurations?.static_sun_depth?.casterSidedness
    });
    const blockingUnsupportedCases = mappings.unsupportedCases.filter((entry) => {
        const channel = profile.channelConfigurations?.[entry.channelId];
        return channel && channel.unsupportedMaterialPolicy !== 'exclude';
    });
    if (blockingUnsupportedCases.length > 0) {
        failBakeSource('unsupported_required_material_semantics', 'A required bake channel references material semantics without a V2 compiler adapter.', {
            count: blockingUnsupportedCases.length,
            cases: blockingUnsupportedCases.slice(0, 25)
        });
    }
    const materials = sortById(sourceMaterialRecords.map((record) => ({
        ...record,
        alphaInputId: alphaCatalog.byMaterialId.get(record.id).id
    })));
    const textures = sortById([
        ...materialCatalog.textures.sources.map((entry) => ({ id: entry.id, kind: 'source', ...entry })),
        ...materialCatalog.textures.bindings.map((entry) => ({ id: entry.id, kind: 'binding', ...entry }))
    ]);
    const channelProfiles = sortById(Object.entries(profile.channelConfigurations ?? {}).map(([id, value]) => ({ id, ...cloneCanonicalJson(value) })));
    const compilerReferences = sortById([{ ...cloneCanonicalJson(profile.compilerReference) }]);
    const rootRecords = sortById(roots.map((entry) => ({
        id: entry.id,
        category: entry.category,
        visibilityPolicy: entry.ignoreRootVisibility === true
            ? 'ignore_camera_pvs_root_visibility'
            : 'respect_evaluated_root_visibility',
        provenance: cloneCanonicalJson(entry.provenance ?? {})
    })));
    const semanticBuffers = bufferDescriptors(
        geometryExtraction.buffers,
        materialCatalog.buffers,
        coverageBuffers,
        capturedLighting.buffers,
        materialCatalog.textures.sources
    );
    const sourceProfile = {
        id: profile.id,
        coordinateContract: profile.coordinateContract,
        colorContract: profile.colorContract,
        sourceSelection: profile.sourceSelection
    };
    const geometryFreshness = createGeometryFreshnessProjection({
        objects: mappings.objects,
        meshInstances: mappings.meshInstances,
        geometries: geometryExtraction.geometries,
        buffers: semanticBuffers.filter((entry) => entry.kind === 'geometry')
    });
    const usedMaterialsFreshness = createUsedMaterialsFreshnessInventory({
        materials,
        textures,
        alphaInputs: alphaCatalog.records,
        receiverMappings: mappings.receiverMappings,
        casterMappings: mappings.casterMappings,
        participantMappings: mappings.participantMappings
    });
    const resolvedSourceFreshness = createResolvedSourceFreshnessProjection({
        city: sourceBefore,
        sourceProfile,
        roots: rootRecords,
        categories: geometryExtraction.inventory.categories,
        chunks: geometryExtraction.inventory.chunks,
        unsupportedCases: mappings.unsupportedCases,
        semanticConflicts: mappings.semanticConflicts,
        receiverMappings: mappings.receiverMappings
    });
    const hashSet = await buildBakeSourceHashSet({
        resolvedSource: resolvedSourceFreshness,
        geometry: geometryFreshness,
        usedMaterials: usedMaterialsFreshness,
        profiles: capturedLighting.profiles,
        channels: channelProfiles,
        compiler: compilerReferences
    });
    const channelSourceContext = {
        objects: mappings.objects,
        meshInstances: mappings.meshInstances,
        geometries: geometryExtraction.geometries,
        receiverMappings: mappings.receiverMappings,
        casterMappings: mappings.casterMappings,
        participantMappings: mappings.participantMappings,
        materials,
        textures,
        alphaInputs: alphaCatalog.records,
        lightingProfiles: capturedLighting.profiles
    };
    const channelSources = await buildChannelSourceHashes(channelProfiles, hashSet, channelSourceContext);
    const manifest = {
        format: RESOLVED_CITY_BAKE_INPUT_FORMAT,
        schemaVersion: 2,
        containerVersion: { major: 2, minor: 0 },
        coordinateContract: {
            id: profile.coordinateContract,
            source: 'three_right_handed_y_up_column_major',
            target: 'blender_right_handed_z_up_column_major',
            units: 'meters',
            logicalUvOrigin: 'lower_left',
            threeToBlenderBasisColumnMajor: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]
        },
        colorContract: profile.colorContract,
        source: {
            ...sourceBefore,
            exportProfileId: profile.id,
            sourceSelection: cloneCanonicalJson(profile.sourceSelection),
            unsupportedCases: mappings.unsupportedCases,
            semanticConflicts: mappings.semanticConflicts
        },
        extractorContract: {
            id: 'resolved-city-bake-extractor-v1',
            canonicalizer: 'strict-sorted-json-v1',
            geometryAdapter: 'evaluated-three-buffer-geometry-v1',
            materialAdapter: 'evaluated-three-material-semantics-v2',
            textureAdapter: 'evaluated-three-texture-source-v1',
            sourceHashSetSchema: BAKE_SOURCE_HASH_SET_SCHEMA
        },
        readiness: {
            schema: 'resolved-city-bake-readiness-v1',
            expectedTrees: Number(readiness.expectedTrees ?? city.world?.trees?.placements?.length ?? 0),
            textureStablePasses: Number(readiness.textureStablePasses ?? 3),
            lightingProfileSourcesReady: readiness.lightingProfileSourcesReady === true,
            freshSourceEqualityVerified: sourceEqualityVerified === true
        },
        categories: geometryExtraction.inventory.categories,
        chunks: geometryExtraction.inventory.chunks,
        roots: rootRecords,
        objects: mappings.objects,
        geometries: geometryExtraction.geometries,
        meshInstances: mappings.meshInstances,
        materials,
        textures,
        alphaInputs: alphaCatalog.records,
        receiverMappings: mappings.receiverMappings,
        casterMappings: mappings.casterMappings,
        participantMappings: mappings.participantMappings,
        lightingProfiles: capturedLighting.profiles,
        channelProfiles,
        compilerReferences,
        buffers: semanticBuffers,
        hashes: { ...hashSet, channelSources }
    };
    const packageBuffers = registerPackageBuffers(
        geometryExtraction.buffers,
        materialCatalog.buffers,
        coverageBuffers,
        capturedLighting.buffers
    );
    const packageBytes = await buildBakeSourcePackage({ manifest, buffers: packageBuffers });
    const packageSha256 = await sha256Hex(RESOLVED_CITY_BAKE_FILE_DOMAIN, packageBytes);
    const validated = await validateResolvedCityBakePackage(packageBytes, {
        resolvedSource: {
            manifest,
            buffers: packageBuffers
        }
    });
    const inventory = createInventoryReport(manifest, geometryExtraction.inventory);
    const size = createSizeReport(manifest, packageBytes.byteLength, channelSourceContext);
    return {
        packageBytes,
        manifest,
        packageSha256,
        sourceIdentity: manifest.hashes,
        reports: {
            inventory,
            size,
            roundTrip: validated.report,
            validation: {
                schema: 'bus-sim-illumination-bake-validation-report-v1',
                valid: true,
                unsupportedCases: mappings.unsupportedCases,
                semanticConflicts: mappings.semanticConflicts
            },
            metrics: {
                schema: 'bus-sim-illumination-bake-export-metrics-v1',
                exportTimeMs: performance.now() - started,
                packageByteLength: packageBytes.byteLength,
                peakMemory: { status: 'not_measured', reason: 'Browser APIs do not expose a reliable per-export peak heap measurement.' }
            }
        }
    };
}
