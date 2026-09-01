import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildBakeSourceHashSet,
    canonicalJsonStringify
} from '../../../src/app/illumination/bake_source/index.js';
import {
    buildChannelSourceHashes,
    createGeometryFreshnessProjection,
    createResolvedSourceFreshnessProjection,
    createUsedMaterialsFreshnessInventory
} from '../../../src/graphics/illumination/bake_source/BakeSourceFreshness.js';

function fixture() {
    const objects = [{
        id: 'object/city/mesh',
        contentHash: 'geometry-object',
        rootId: 'building:one',
        category: 'buildings',
        semanticPath: 'mesh',
        sourceKind: 'Mesh',
        geometryId: 'geometry:one',
        materialSlotCount: 1,
        materialGroupingMode: 'single_material_draw_range',
        instanceMatrix: null,
        instanceColor: null,
        materialIds: ['material:one'],
        materialSlots: [{ index: 0, id: 'material:one' }],
        instanceIds: ['object/city/mesh/instance/base'],
        resolvedCaster: true,
        resolvedReceiver: true,
        mergeShadowAsOpaque: false,
        provenance: { rootId: 'building:one', semanticPath: 'mesh', sourceKind: 'Mesh' }
    }];
    const meshInstances = [{
        id: 'object/city/mesh/instance/base',
        contentHash: 'instance',
        objectId: 'object/city/mesh',
        rootId: 'building:one',
        category: 'buildings',
        geometryId: 'geometry:one',
        materialIds: ['material:one'],
        matrixThreeWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        matrixBlenderWorld: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1],
        determinant: 1,
        boundsThreeWorld: { min: [0, 0, 0], max: [1, 1, 0] },
        boundsBlenderWorld: { min: [0, 0, -1], max: [1, 0, 0] },
        chunkId: 'chunk/buildings/0/0'
    }];
    const geometries = [{
        id: 'geometry:one',
        objectIds: ['object/city/mesh'],
        topology: 'triangles_ccw',
        attributes: { position: { bufferId: 'buffer:position', count: 3 } },
        index: null,
        groups: [],
        drawRange: { start: 0, count: 3 },
        bounds: { box: { min: [0, 0, 0], max: [1, 1, 0] } }
    }];
    const alpha = {
        mode: 'cutout',
        opacity: 1,
        alphaTest: 0.5,
        alphaToCoverage: false,
        inputs: [{ bindingId: 'texture-binding:one', channel: 'a', operation: 'multiply' }],
        proceduralCoverage: []
    };
    const support = {
        static_sun_depth: { supported: true, reasons: [] },
        direct_receiver: { supported: true, reasons: [] },
        indirect_irradiance: { supported: true, reasons: [] },
        static_ao_bent_normal: { supported: true, reasons: [] }
    };
    const materials = [{
        id: 'material:one',
        schema: 'bus-sim-evaluated-material-semantics-v2',
        alphaInputId: 'alpha-input:one',
        model: 'MeshStandardMaterial',
        colorLinearSrgb: [0.6, 0.5, 0.4],
        emissiveLinearSrgb: [0, 0, 0],
        roughness: 0.8,
        metalness: 0,
        alpha,
        side: 0,
        shadowSide: null,
        preserveShadowSide: false,
        isFoliage: false,
        textureBindings: { map: 'texture-binding:one' },
        customSemantics: {},
        channelSupport: support
    }];
    const receiverMappings = [{
        id: 'receiver/object/city/mesh/instance/base/group/0000',
        meshInstanceId: meshInstances[0].id,
        objectId: objects[0].id,
        geometryId: geometries[0].id,
        materialId: materials[0].id,
        alphaInputId: 'alpha-input:one',
        groupIndex: 0,
        materialIndex: 0,
        start: 0,
        count: 3,
        chunkId: 'chunk/buildings/0/0',
        category: 'buildings',
        lightmapMappingId: 'lightmap/object/city/mesh/instance/base/group/0000',
        geometricNormalAttribute: 'normal',
        uvSets: ['uv', 'uv2'],
        normalMapPreventsScalarPromotion: false,
        channelRelevance: { direct_receiver: true, indirect_irradiance: true, static_ao_bent_normal: true }
    }];
    const casterMappings = [{
        id: 'caster/object/city/mesh/instance/base/group/0000',
        meshInstanceId: meshInstances[0].id,
        objectId: objects[0].id,
        geometryId: geometries[0].id,
        materialId: materials[0].id,
        alphaInputId: 'alpha-input:one',
        groupIndex: 0,
        materialIndex: 0,
        start: 0,
        count: 3,
        chunkId: 'chunk/buildings/0/0',
        category: 'buildings',
        coverageMode: 'cutout',
        side: 0,
        shadowSide: null,
        preserveShadowSide: false,
        effectiveShadowSide: 2,
        policySource: 'evaluated_original_caster',
        channelRelevance: {
            static_sun_depth: true,
            direct_receiver: true,
            indirect_irradiance: true,
            static_ao_bent_normal: true
        }
    }];
    const participantMappings = [{
        id: 'participant/object/city/mesh/instance/base/group/0000',
        meshInstanceId: meshInstances[0].id,
        objectId: objects[0].id,
        geometryId: geometries[0].id,
        materialId: materials[0].id,
        alphaInputId: 'alpha-input:one',
        groupIndex: 0,
        materialIndex: 0,
        start: 0,
        count: 3,
        chunkId: 'chunk/buildings/0/0',
        category: 'buildings',
        channelRelevance: {
            indirect_irradiance: true,
            static_ao_bent_normal: true
        }
    }];
    const lightingProfiles = [{
        id: 'sun.default',
        type: 'directional_sun',
        directionThree: [0.5, 0.7, 0.5],
        colorLinearSrgb: [1, 0.95, 0.9],
        intensity: 5.75,
        angularDiameterDegrees: 0.53,
        filterModel: 'cycles_directional_soft_angle_v1'
    }, {
        id: 'hemisphere.current',
        type: 'hemisphere_diffuse',
        skyColorLinearSrgb: [1, 1, 1],
        groundColorLinearSrgb: [0.1, 0.2, 0.1],
        intensity: 1.46
    }, {
        id: 'environment.default',
        type: 'environment_ibl',
        enabled: true,
        intensity: 0.28,
        sourceReference: { sha256: 'a'.repeat(64) }
    }];
    const channelProfiles = [{
        id: 'static_sun_depth',
        lightProfileId: 'sun.default',
        resolution: 4096,
        casterSidedness: {
            model: 'three-r183-effective-shadow-side-v1',
            preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
            twoSidedCasting: true
        }
    }, {
        id: 'direct_receiver', lightProfileIds: ['sun.default'], resolution: 4096
    }, {
        id: 'indirect_irradiance', lightProfileIds: ['sun.default', 'hemisphere.current', 'environment.default'], samples: 256
    }, {
        id: 'static_ao_bent_normal', radiusMeters: 5, samples: 128
    }];
    return {
        objects,
        meshInstances,
        geometries,
        buffers: [{ id: 'buffer:position', kind: 'geometry', contentSha256: 'b'.repeat(64), byteLength: 36 }],
        materials,
        textures: [{
            id: 'texture-binding:one',
            kind: 'binding',
            sourceId: 'texture-source:one',
            mapping: 300,
            channel: 0,
            wrapS: 1000,
            wrapT: 1000,
            magFilter: 1006,
            minFilter: 1008,
            generateMipmaps: true,
            anisotropy: 1,
            flipY: true,
            premultiplyAlpha: false,
            unpackAlignment: 4,
            colorSpace: 'srgb',
            offset: [0, 0],
            repeat: [1, 1],
            center: [0, 0],
            rotation: 0,
            matrixAutoUpdate: true,
            matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
        }, {
            id: 'texture-source:one',
            kind: 'source',
            width: 2,
            height: 2,
            depth: 1,
            format: 1023,
            type: 1009,
            internalFormat: null,
            storage: 'encoded_source',
            componentType: 'uint8',
            byteLength: 32,
            contentSha256: 'c'.repeat(64),
            provenanceUrl: '/fixture.png',
            mimeType: 'image/png',
            mipLevels: 0,
            rowOrigin: 'native_source_with_flipY_declared_by_binding',
            sourceSha256: 'd'.repeat(64),
            coverageChannels: {
                a: { sha256: 'e'.repeat(64), byteLength: 4, pixelCount: 4 }
            }
        }],
        alphaInputs: [{
            id: 'alpha-input:one',
            materialId: 'material:one',
            alpha,
            side: 0,
            shadowSide: null,
            textureBindingIds: ['texture-binding:one']
        }],
        receiverMappings,
        casterMappings,
        participantMappings,
        lightingProfiles,
        channelProfiles,
        compilerReferences: [{ id: 'compiler:test', digest: '1'.repeat(64) }]
    };
}

async function identities(value) {
    const geometry = createGeometryFreshnessProjection(value);
    const usedMaterials = createUsedMaterialsFreshnessInventory(value);
    const resolvedSource = createResolvedSourceFreshnessProjection({
        city: { cityId: 'fixture' },
        sourceProfile: { id: 'fixture.default' },
        roots: [{ id: 'building:one' }],
        categories: [{ id: 'buildings' }],
        chunks: [{ id: 'chunk/buildings/0/0' }],
        unsupportedCases: [],
        semanticConflicts: [],
        receiverMappings: value.receiverMappings
    });
    const hashSet = await buildBakeSourceHashSet({
        resolvedSource,
        geometry,
        usedMaterials,
        profiles: value.lightingProfiles,
        channels: value.channelProfiles,
        compiler: value.compilerReferences
    });
    const channelSources = await buildChannelSourceHashes(value.channelProfiles, hashSet, value);
    return {
        hashSet,
        channels: Object.fromEntries(channelSources.map((entry) => [entry.id, entry.sha256]))
    };
}

function clone(value) {
    return structuredClone(value);
}

test('freshness separates geometry from used material and eligibility policy', async () => {
    const base = fixture();
    const materialMutation = clone(base);
    materialMutation.materials[0].roughness = 0.2;
    materialMutation.materials[0].id = 'material:two';
    materialMutation.alphaInputs[0].materialId = 'material:two';
    materialMutation.receiverMappings[0].materialId = 'material:two';
    materialMutation.casterMappings[0].materialId = 'material:two';
    materialMutation.participantMappings[0].materialId = 'material:two';
    materialMutation.objects[0].materialIds = ['material:two'];
    materialMutation.objects[0].materialSlots[0].id = 'material:two';
    materialMutation.meshInstances[0].materialIds = ['material:two'];

    assert.equal(
        canonicalJsonStringify(createGeometryFreshnessProjection(base)),
        canonicalJsonStringify(createGeometryFreshnessProjection(materialMutation))
    );
    assert.notEqual(
        canonicalJsonStringify(createUsedMaterialsFreshnessInventory(base)),
        canonicalJsonStringify(createUsedMaterialsFreshnessInventory(materialMutation))
    );

    const eligibilityMutation = clone(base);
    eligibilityMutation.receiverMappings = [];
    assert.equal(
        canonicalJsonStringify(createGeometryFreshnessProjection(base)),
        canonicalJsonStringify(createGeometryFreshnessProjection(eligibilityMutation))
    );
    assert.notEqual(
        canonicalJsonStringify(createUsedMaterialsFreshnessInventory(base)),
        canonicalJsonStringify(createUsedMaterialsFreshnessInventory(eligibilityMutation))
    );
});

test('sensitivity matrix covers geometry, eligibility, profiles, transport, settings, and explicit non-inputs', async () => {
    const base = fixture();
    const reference = await identities(base);
    const physicalIds = Object.keys(reference.channels);

    const geometry = clone(base);
    geometry.meshInstances[0].contentHash = 'changed-instance-transform';
    geometry.meshInstances[0].matrixThreeWorld[12] = 4;
    const geometryHashes = await identities(geometry);
    assert.notEqual(geometryHashes.hashSet.geometry, reference.hashSet.geometry);
    assert.notEqual(geometryHashes.hashSet.resolvedSource, reference.hashSet.resolvedSource);
    assert.equal(geometryHashes.hashSet.usedMaterials, reference.hashSet.usedMaterials);
    for (const id of physicalIds) assert.notEqual(geometryHashes.channels[id], reference.channels[id]);

    const casterEligibility = clone(base);
    casterEligibility.casterMappings = [];
    const eligibilityHashes = await identities(casterEligibility);
    assert.equal(eligibilityHashes.hashSet.geometry, reference.hashSet.geometry);
    assert.notEqual(eligibilityHashes.hashSet.usedMaterials, reference.hashSet.usedMaterials);
    assert.notEqual(eligibilityHashes.hashSet.resolvedSource, reference.hashSet.resolvedSource);
    for (const id of physicalIds) assert.notEqual(eligibilityHashes.channels[id], reference.channels[id]);

    const angularFilter = clone(base);
    angularFilter.lightingProfiles[0].angularDiameterDegrees = 0.8;
    angularFilter.lightingProfiles[0].filterModel = 'alternate-filter';
    const angularHashes = await identities(angularFilter);
    assert.notEqual(angularHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.notEqual(angularHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(angularHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(angularHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const environment = clone(base);
    environment.lightingProfiles.find((entry) => entry.id === 'environment.default').intensity = 0.5;
    const environmentHashes = await identities(environment);
    assert.equal(environmentHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(environmentHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(environmentHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(environmentHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const emissive = clone(base);
    emissive.materials[0].emissiveLinearSrgb = [0.2, 0.1, 0];
    const emissiveHashes = await identities(emissive);
    assert.equal(emissiveHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(emissiveHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(emissiveHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(emissiveHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const receiverOnlyBase = clone(base);
    receiverOnlyBase.participantMappings = [];
    const receiverOnlyReference = await identities(receiverOnlyBase);
    receiverOnlyBase.materials[0].colorLinearSrgb = [0.1, 0.2, 0.3];
    const receiverOnlyColor = await identities(receiverOnlyBase);
    assert.notEqual(receiverOnlyColor.hashSet.usedMaterials, receiverOnlyReference.hashSet.usedMaterials);
    assert.notEqual(receiverOnlyColor.hashSet.resolvedSource, receiverOnlyReference.hashSet.resolvedSource);
    for (const id of physicalIds) assert.equal(receiverOnlyColor.channels[id], receiverOnlyReference.channels[id]);

    const directLayout = clone(base);
    const directProfile = directLayout.channelProfiles.find((entry) => entry.id === 'direct_receiver');
    directProfile.resolution = 8192;
    directProfile.precision = 'float16';
    const layoutHashes = await identities(directLayout);
    assert.equal(layoutHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.notEqual(layoutHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.equal(layoutHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(layoutHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const compiler = clone(base);
    compiler.compilerReferences[0].digest = '2'.repeat(64);
    const compilerHashes = await identities(compiler);
    assert.notEqual(compilerHashes.hashSet.compiler, reference.hashSet.compiler);
    assert.equal(compilerHashes.hashSet.resolvedSource, reference.hashSet.resolvedSource);
    for (const id of physicalIds) assert.equal(compilerHashes.channels[id], reference.channels[id]);

    const irrelevant = clone(base);
    irrelevant.cameraPose = { x: 1, y: 2, z: 3 };
    irrelevant.colorPvsState = { hidden: ['object/city/mesh'] };
    irrelevant.unusedCatalogMaterials = [{ id: 'material:unused', roughness: 0 }];
    const irrelevantHashes = await identities(irrelevant);
    assert.equal(canonicalJsonStringify(irrelevantHashes), canonicalJsonStringify(reference));
});

test('channel hashes isolate sun, transport, alpha, receiver mapping, and AO settings', async () => {
    const base = fixture();
    const reference = await identities(base);

    const effectiveSide = clone(base);
    effectiveSide.materials[0].preserveShadowSide = true;
    effectiveSide.casterMappings[0].preserveShadowSide = true;
    effectiveSide.casterMappings[0].effectiveShadowSide = 1;
    const effectiveSideHashes = await identities(effectiveSide);
    assert.notEqual(effectiveSideHashes.channels.static_sun_depth, reference.channels.static_sun_depth);

    const sidednessPolicy = clone(base);
    sidednessPolicy.channelProfiles.find((entry) => entry.id === 'static_sun_depth')
        .casterSidedness.model = 'tampered-model';
    const sidednessPolicyHashes = await identities(sidednessPolicy);
    assert.notEqual(sidednessPolicyHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(sidednessPolicyHashes.channels.direct_receiver, reference.channels.direct_receiver);

    const sunIntensity = clone(base);
    sunIntensity.lightingProfiles[0].intensity += 1;
    const intensityHashes = await identities(sunIntensity);
    assert.equal(intensityHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.notEqual(intensityHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(intensityHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(intensityHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const sunDirection = clone(base);
    sunDirection.lightingProfiles[0].directionThree = [0.4, 0.8, 0.4];
    const directionHashes = await identities(sunDirection);
    assert.notEqual(directionHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.notEqual(directionHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(directionHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(directionHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const roughness = clone(base);
    roughness.materials[0].roughness = 0.1;
    const roughnessHashes = await identities(roughness);
    assert.equal(roughnessHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(roughnessHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(roughnessHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(roughnessHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const alpha = clone(base);
    alpha.materials[0].alpha.alphaTest = 0.7;
    const alphaHashes = await identities(alpha);
    for (const id of Object.keys(reference.channels)) assert.notEqual(alphaHashes.channels[id], reference.channels[id]);

    const receiverUv = clone(base);
    receiverUv.receiverMappings[0].uvSets = ['uv2'];
    const uvHashes = await identities(receiverUv);
    assert.equal(uvHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.notEqual(uvHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(uvHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.notEqual(uvHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const ao = clone(base);
    ao.channelProfiles.find((entry) => entry.id === 'static_ao_bent_normal').radiusMeters = 10;
    const aoHashes = await identities(ao);
    assert.equal(aoHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(aoHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.equal(aoHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.notEqual(aoHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const rgbOnlyTexture = clone(base);
    rgbOnlyTexture.textures.find((entry) => entry.kind === 'source').contentSha256 = 'f'.repeat(64);
    const rgbOnlyHashes = await identities(rgbOnlyTexture);
    assert.equal(rgbOnlyHashes.channels.static_sun_depth, reference.channels.static_sun_depth);
    assert.equal(rgbOnlyHashes.channels.direct_receiver, reference.channels.direct_receiver);
    assert.notEqual(rgbOnlyHashes.channels.indirect_irradiance, reference.channels.indirect_irradiance);
    assert.equal(rgbOnlyHashes.channels.static_ao_bent_normal, reference.channels.static_ao_bent_normal);

    const coverageTexture = clone(base);
    coverageTexture.textures.find((entry) => entry.kind === 'source').coverageChannels.a.sha256 = '0'.repeat(64);
    const coverageHashes = await identities(coverageTexture);
    for (const id of Object.keys(reference.channels)) assert.notEqual(coverageHashes.channels[id], reference.channels[id]);

    const sharedGeometryReverseReference = clone(base);
    sharedGeometryReverseReference.geometries[0].objectIds.push('object/irrelevant-shared-geometry-user');
    const sharedReferenceHashes = await identities(sharedGeometryReverseReference);
    assert.notEqual(sharedReferenceHashes.hashSet.geometry, reference.hashSet.geometry);
    for (const id of Object.keys(reference.channels)) {
        assert.equal(sharedReferenceHashes.channels[id], reference.channels[id]);
    }

    const casterOnlyNormalMap = clone(base);
    casterOnlyNormalMap.receiverMappings = [];
    casterOnlyNormalMap.participantMappings = [];
    casterOnlyNormalMap.materials[0].textureBindings.normalMap = 'texture-binding:one';
    casterOnlyNormalMap.materials[0].normalMapType = 'tangent_space';
    casterOnlyNormalMap.materials[0].normalMapSpace = 'tangent';
    casterOnlyNormalMap.materials[0].normalMapTangentRequirement = 'required';
    casterOnlyNormalMap.materials[0].normalScale = [1, 1];
    const casterOnlyReference = await identities(casterOnlyNormalMap);
    casterOnlyNormalMap.textures.find((entry) => entry.kind === 'source').contentSha256 = '9'.repeat(64);
    const casterOnlyMutation = await identities(casterOnlyNormalMap);
    assert.equal(casterOnlyMutation.channels.static_sun_depth, casterOnlyReference.channels.static_sun_depth);
    assert.equal(casterOnlyMutation.channels.direct_receiver, casterOnlyReference.channels.direct_receiver);
});
