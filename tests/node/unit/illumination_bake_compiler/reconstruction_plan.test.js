// Verifies deterministic stable-ID reconstruction and semantic rejection gates.

import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import { CompilerError } from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';
import {
    RECONSTRUCTION_MODE,
    RECONSTRUCTION_PLAN_SCHEMA,
    createReconstructionPlan
} from '../../../../tools/illumination_bake_compiler/src/ReconstructionPlan.mjs';

const HASH = '8'.repeat(64);

function material() {
    return {
        id: 'material:fixture',
        schema: 'bus-sim-evaluated-material-semantics-v1',
        model: 'MeshStandardMaterial',
        alphaInputId: 'alpha:fixture',
        alpha: {
            mode: 'opaque',
            opacity: 1,
            alphaTest: 0,
            alphaToCoverage: false,
            inputs: [],
            proceduralCoverage: []
        },
        textureBindings: {},
        channelSupport: {
            static_sun_depth: { supported: true, reasons: [] },
            direct_receiver: { supported: true, reasons: [] },
            indirect_irradiance: { supported: true, reasons: [] },
            static_ao_bent_normal: { supported: true, reasons: [] }
        }
    };
}

function manifest() {
    const fixtureMaterial = material();
    const alpha = {
        id: fixtureMaterial.alphaInputId,
        materialId: fixtureMaterial.id,
        alpha: structuredClone(fixtureMaterial.alpha)
    };
    const objects = [{ id: 'object:z' }, { id: 'object:a' }];
    const geometries = [{ id: 'geometry:z' }, { id: 'geometry:a' }];
    const meshInstances = [{
        id: 'instance:z',
        objectId: 'object:z',
        geometryId: 'geometry:z'
    }, {
        id: 'instance:a',
        objectId: 'object:a',
        geometryId: 'geometry:a'
    }];
    const participantMappings = [{
        id: 'participant:z',
        meshInstanceId: 'instance:z',
        objectId: 'object:z',
        geometryId: 'geometry:z',
        materialId: fixtureMaterial.id,
        alphaInputId: alpha.id,
        channelRelevance: { static_ao_bent_normal: true }
    }, {
        id: 'participant:a',
        meshInstanceId: 'instance:a',
        objectId: 'object:a',
        geometryId: 'geometry:a',
        materialId: fixtureMaterial.id,
        alphaInputId: alpha.id,
        channelRelevance: { static_ao_bent_normal: true }
    }];
    return {
        format: 'bus-sim-illumination-bake-input-v1',
        schemaVersion: 1,
        coordinateContract: {
            id: 'three-y-up-to-blender-z-up-v1',
            target: 'blender_right_handed_z_up_column_major',
            units: 'meters'
        },
        colorContract: 'scene-linear-linear-srgb-v1',
        hashes: {
            resolvedSource: HASH,
            geometry: '9'.repeat(64),
            usedMaterials: 'a'.repeat(64),
            channelSources: [{ id: 'static_ao_bent_normal', sha256: 'b'.repeat(64) }]
        },
        objects,
        geometries,
        meshInstances,
        materials: [fixtureMaterial],
        textures: [],
        alphaInputs: [alpha],
        participantMappings,
        receiverMappings: [],
        casterMappings: [],
        lightingProfiles: [],
        channelProfiles: [{ id: 'static_ao_bent_normal', samples: 4 }],
        buffers: []
    };
}

function shuffleInventories(value) {
    const shuffled = structuredClone(value);
    for (const key of [
        'objects',
        'geometries',
        'meshInstances',
        'participantMappings',
        'materials',
        'alphaInputs',
        'channelProfiles'
    ]) shuffled[key].reverse();
    return shuffled;
}

test('shuffled discovery produces identical stable-ID reconstruction plan bytes', () => {
    const source = manifest();
    const first = createReconstructionPlan(source);
    const shuffled = createReconstructionPlan(shuffleInventories(source));
    assert.equal(first.schema, RECONSTRUCTION_PLAN_SCHEMA);
    assert.equal(first.mode, RECONSTRUCTION_MODE);
    assert.equal(canonicalJsonStringify(first), canonicalJsonStringify(shuffled));
    assert.deepEqual(first.objects.map((entry) => entry.id), ['object:a', 'object:z']);
    assert.deepEqual(first.meshInstances.map((entry) => entry.id), ['instance:a', 'instance:z']);
    assert.deepEqual(first.mappings.participants.map((entry) => entry.id), ['participant:a', 'participant:z']);
    assert.equal(first.summary.stableIdsPreserved, true);
});

test('unknown channel semantics fail before Blender spawn', () => {
    const source = manifest();
    source.channelProfiles = [{ id: 'future_gi_channel' }];
    source.hashes.channelSources = [{ id: 'future_gi_channel', sha256: 'c'.repeat(64) }];
    assert.throws(
        () => createReconstructionPlan(source),
        (error) => error instanceof CompilerError && error.code === 'reconstruction_channel_unsupported'
    );
});

test('malformed geometry references fail before Blender spawn', () => {
    const source = manifest();
    source.participantMappings[0].geometryId = 'geometry:missing';
    assert.throws(
        () => createReconstructionPlan(source),
        (error) => error instanceof CompilerError
            && error.code === 'reconstruction_mapping_reference_missing'
            && error.context.reference === 'geometryId'
    );
});

test('nonphysical material cannot enter indirect irradiance reconstruction', () => {
    const source = manifest();
    source.channelProfiles = [{ id: 'indirect_irradiance' }];
    source.hashes.channelSources = [{ id: 'indirect_irradiance', sha256: 'c'.repeat(64) }];
    source.materials[0].model = 'MeshBasicMaterial';
    for (const mapping of source.participantMappings) {
        mapping.channelRelevance = { indirect_irradiance: true };
    }
    assert.throws(
        () => createReconstructionPlan(source),
        (error) => error instanceof CompilerError && error.code === 'reconstruction_material_model_unsupported'
    );
});

test('unsupported alpha blend and missing exact cutout coverage fail reconstruction', () => {
    const blended = manifest();
    blended.materials[0].alpha.mode = 'blended';
    blended.alphaInputs[0].alpha.mode = 'blended';
    assert.throws(
        () => createReconstructionPlan(blended),
        (error) => error instanceof CompilerError && error.code === 'reconstruction_alpha_mode_unsupported'
    );

    const cutout = manifest();
    cutout.materials[0].alpha.mode = 'cutout';
    cutout.materials[0].alpha.alphaTest = 0.5;
    cutout.materials[0].alpha.inputs = [{ bindingId: 'binding:missing', channel: 'a', operation: 'multiply' }];
    cutout.alphaInputs[0].alpha = structuredClone(cutout.materials[0].alpha);
    assert.throws(
        () => createReconstructionPlan(cutout),
        (error) => error instanceof CompilerError && error.code === 'reconstruction_alpha_coverage_missing'
    );
});

test('opaque material map alpha does not require a silhouette coverage buffer', () => {
    const source = manifest();
    const bindingId = 'texture-binding:opaque-map';
    const sourceId = 'texture-source:opaque-map';
    source.materials[0].alpha.inputs = [{ bindingId, channel: 'a', operation: 'multiply' }];
    source.materials[0].textureBindings = { map: bindingId };
    source.alphaInputs[0].alpha = structuredClone(source.materials[0].alpha);
    source.textures = [{
        id: bindingId,
        kind: 'binding',
        sourceId,
        mapping: 300,
        channel: 0,
        wrapS: 1001,
        wrapT: 1001,
        magFilter: 1006,
        minFilter: 1006,
        matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        flipY: false,
        premultiplyAlpha: false
    }, {
        id: sourceId,
        kind: 'source',
        width: 1,
        height: 1,
        storage: 'raw_rgba8',
        rowOrigin: 'native_source_with_flipY_declared_by_binding',
        coverageChannels: {}
    }];
    const plan = createReconstructionPlan(source);
    assert.equal(plan.summary.textureCount, 2);
});

test('channel relevance cannot override declared unsupported material semantics', () => {
    const source = manifest();
    source.materials[0].channelSupport.static_ao_bent_normal = {
        supported: false,
        reasons: ['fixture_unsupported']
    };
    assert.throws(
        () => createReconstructionPlan(source),
        (error) => error instanceof CompilerError
            && error.code === 'reconstruction_channel_semantics_unsupported'
            && error.context.reasons[0] === 'fixture_unsupported'
    );
});
