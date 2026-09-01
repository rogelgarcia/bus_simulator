// Verifies semantic package validation recomputes bytes, identities, foreign keys, and freshness projections.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BAKE_SOURCE_HASH_SET_SCHEMA,
    buildBakeSourceHashSet,
    buildBakeSourcePackage,
    convertBlenderMatrixToThree,
    convertThreeMatrixToBlender,
    hashCanonicalJsonSha256,
    sha256Hex,
    validateAffineTransform
} from '../../../src/app/illumination/bake_source/index.js';
import {
    buildChannelSourceHashes,
    createGeometryFreshnessProjection,
    createResolvedSourceFreshnessProjection,
    createUsedMaterialsFreshnessInventory
} from '../../../src/graphics/illumination/bake_source/BakeSourceFreshness.js';
import {
    BAKE_MATERIAL_SEMANTICS_DOMAIN,
    BakeSourceValidationError,
    extractBakeSourceGeometry,
    validateResolvedCityBakePackage
} from '../../../src/graphics/illumination/bake_source/index.js';

const GEOMETRY_DOMAIN = 'bus-simulator/illumination/bake-source/evaluated-geometry-buffer/v1';
const ALPHA_DOMAIN = 'bus-simulator/illumination/bake-source/alpha-input/v1';
const IDENTITY = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);
const NON_UNIFORM_TRANSFORM = Object.freeze([
    Math.sqrt(3), 1, 0, 0,
    -1.5, 3 * Math.sqrt(3) / 2, 0, 0,
    0, 0, 4, 0,
    3, -2, 5, 1
]);

function attribute(array, itemSize, { normalized = false, name = '' } = {}) {
    return { array, itemSize, count: array.length / itemSize, normalized, name };
}

function fixtureRoot(matrixThreeWorld = IDENTITY) {
    const sourceGeometry = {
        attributes: {
            position: attribute(new Float32Array([
                0, 0, 0,
                1, 0, 0,
                0, 1, 0
            ]), 3, { name: 'fixture-position' }),
            normal: attribute(new Float32Array([
                0, 0, 1,
                0, 1, 1,
                1, 0, 1
            ]), 3, { name: 'fixture-normal' }),
            tangent: attribute(new Float32Array([
                1, 0, 0, 1,
                1, 1, 0, -1,
                0, 1, 0, 1
            ]), 4, { name: 'fixture-tangent' }),
            uv: attribute(new Float32Array([
                0, 0,
                1, 0,
                0, 1
            ]), 2, { name: 'fixture-uv' }),
            uv2: attribute(new Float32Array([
                0.1, 0.1,
                0.9, 0.1,
                0.1, 0.9
            ]), 2, { name: 'fixture-uv2' }),
            bakeWeight: attribute(new Uint8Array([0, 127, 255]), 1, {
                name: 'fixture-weight',
                normalized: true
            })
        },
        index: attribute(new Uint16Array([0, 1, 2]), 1),
        groups: [],
        drawRange: { start: 0, count: Number.POSITIVE_INFINITY },
        morphAttributes: {},
        boundingBox: null,
        boundingSphere: null
    };
    const mesh = {
        isMesh: true,
        isInstancedMesh: false,
        type: 'Mesh',
        name: 'FixtureMesh',
        geometry: sourceGeometry,
        material: {},
        matrixWorld: { elements: Array.from(matrixThreeWorld) },
        userData: {},
        children: []
    };
    const root = {
        type: 'Group',
        name: 'FixtureRoot',
        children: [mesh],
        traverse(visitor) {
            visitor(this);
            visitor(mesh);
        }
    };
    mesh.parent = root;
    return {
        id: 'building:validation-fixture',
        category: 'buildings',
        provenance: { sourceKind: 'unit_fixture', sourceId: 'validation-fixture' },
        root
    };
}

async function createFixture({ indirectSupported = true, matrixThreeWorld = IDENTITY } = {}) {
    const rootEntry = fixtureRoot(matrixThreeWorld);
    const extraction = await extractBakeSourceGeometry([rootEntry], {
        hashBytes: (bytes) => sha256Hex(GEOMETRY_DOMAIN, bytes),
        matrixHelpers: { validateAffineTransform, convertThreeMatrixToBlender }
    });
    const materialSemantics = {
        schema: 'bus-sim-evaluated-material-semantics-v2',
        type: 'MeshStandardMaterial',
        name: 'fixture-material',
        visible: true,
        side: 0,
        shadowSide: null,
        preserveShadowSide: false,
        isFoliage: false,
        vertexColors: false,
        alpha: { mode: 'opaque', cutoff: null, opacity: 1, inputs: [] },
        textureBindings: {},
        channelSupport: {
            static_sun_depth: { supported: true, reasons: [] },
            direct_receiver: { supported: true, reasons: [] },
            indirect_irradiance: {
                supported: indirectSupported,
                reasons: indirectSupported ? [] : ['fixture_transport_unsupported']
            },
            static_ao_bent_normal: { supported: true, reasons: [] }
        }
    };
    const materialHash = await hashCanonicalJsonSha256(BAKE_MATERIAL_SEMANTICS_DOMAIN, materialSemantics);
    const materialId = `material:${materialHash}`;
    const alphaProjection = {
        schema: 'bus-sim-evaluated-alpha-input-v1',
        materialId,
        alpha: materialSemantics.alpha,
        side: materialSemantics.side,
        shadowSide: materialSemantics.shadowSide,
        vertexColors: materialSemantics.vertexColors,
        textureBindingIds: []
    };
    const alphaHash = await hashCanonicalJsonSha256(ALPHA_DOMAIN, alphaProjection);
    const alpha = { id: `alpha-input/${alphaHash}`, ...alphaProjection, sha256: alphaHash };
    const material = { id: materialId, ...materialSemantics, alphaInputId: alpha.id };
    const objects = extraction.objects.map((entry) => {
        const { instances, ...descriptor } = entry;
        return {
            ...descriptor,
            materialIds: [materialId],
            materialSlots: [{ index: 0, id: materialId }],
            instanceIds: instances.map((instance) => instance.id),
            resolvedCaster: false,
            resolvedReceiver: false,
            mergeShadowAsOpaque: false,
            provenance: {
                rootId: entry.rootId,
                semanticPath: entry.semanticPath,
                sourceKind: entry.sourceKind
            }
        };
    });
    const meshInstances = extraction.objects.flatMap((object) => object.instances.map((instance) => ({
        ...instance,
        objectId: object.id,
        rootId: object.rootId,
        category: object.category,
        geometryId: object.geometryId,
        materialIds: [materialId]
    }))).sort((left, right) => left.id < right.id ? -1 : 1);
    const roots = [{
        id: rootEntry.id,
        category: rootEntry.category,
        visibilityPolicy: 'respect_evaluated_root_visibility',
        provenance: rootEntry.provenance
    }];
    const buffers = extraction.buffers.map((entry) => ({
        id: entry.id,
        kind: 'geometry',
        encoding: 'typed_array_little_endian',
        byteLength: entry.data.byteLength,
        contentSha256: entry.sha256,
        roles: entry.roles
    }));
    const sourceCity = {
        schema: 'bus-sim-resolved-city-source-v1',
        cityId: 'validation-fixture',
        mapId: 'validation-fixture-map'
    };
    const sourceSelection = { include: ['resolved_static_city'] };
    const coordinateContract = {
        id: 'three-y-up-to-blender-z-up-v1',
        source: 'three_right_handed_y_up_column_major',
        target: 'blender_right_handed_z_up_column_major',
        units: 'meters',
        logicalUvOrigin: 'lower_left',
        threeToBlenderBasisColumnMajor: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]
    };
    const colorContract = 'scene-linear-linear-srgb-v1';
    const receiverMappings = [];
    const casterMappings = [];
    const participantMappings = meshInstances.map((instance) => ({
        id: `participant/${instance.id}/group/0000`,
        meshInstanceId: instance.id,
        objectId: instance.objectId,
        geometryId: instance.geometryId,
        materialId,
        alphaInputId: alpha.id,
        groupIndex: 0,
        materialIndex: 0,
        start: 0,
        count: 3,
        chunkId: instance.chunkId,
        category: instance.category,
        channelRelevance: {
            indirect_irradiance: indirectSupported,
            static_ao_bent_normal: true
        }
    }));
    const unsupportedCases = indirectSupported ? [] : [{
        id: `unsupported/indirect_irradiance/participant/${materialId}`,
        channelId: 'indirect_irradiance',
        role: 'participant',
        materialId,
        reasons: ['fixture_transport_unsupported']
    }];
    const materials = [material];
    const textures = [];
    const alphaInputs = [alpha];
    const lightingProfiles = [];
    const channelProfiles = [
        { id: 'indirect_irradiance', samples: 4 },
        { id: 'static_ao_bent_normal', samples: 4 },
        {
            id: 'static_sun_depth',
            casterSidedness: {
                model: 'three-r183-effective-shadow-side-v1',
                preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
                twoSidedCasting: true
            }
        }
    ];
    const compilerReferences = [{
        id: 'compiler:fixture',
        schema: 'bus-sim-illumination-compiler-reference-v1',
        backend: 'fixture'
    }];
    const sourceProfile = {
        id: 'profile:fixture',
        coordinateContract: coordinateContract.id,
        colorContract,
        sourceSelection
    };
    const geometryProjection = createGeometryFreshnessProjection({
        objects,
        meshInstances,
        geometries: extraction.geometries,
        buffers
    });
    const usedMaterials = createUsedMaterialsFreshnessInventory({
        materials,
        textures,
        alphaInputs,
        receiverMappings,
        casterMappings,
        participantMappings
    });
    const resolvedSource = createResolvedSourceFreshnessProjection({
        city: sourceCity,
        sourceProfile,
        roots,
        categories: extraction.inventory.categories,
        chunks: extraction.inventory.chunks,
        unsupportedCases,
        semanticConflicts: [],
        receiverMappings
    });
    const hashSet = await buildBakeSourceHashSet({
        resolvedSource,
        geometry: geometryProjection,
        usedMaterials,
        profiles: lightingProfiles,
        channels: channelProfiles,
        compiler: compilerReferences
    });
    const channelSources = await buildChannelSourceHashes(channelProfiles, hashSet, {
        objects,
        meshInstances,
        geometries: extraction.geometries,
        receiverMappings,
        casterMappings,
        participantMappings,
        materials,
        textures,
        alphaInputs,
        lightingProfiles
    });
    const manifest = {
        format: 'bus-sim-illumination-bake-input-v2',
        schemaVersion: 2,
        containerVersion: { major: 2, minor: 0 },
        coordinateContract,
        colorContract,
        source: {
            ...sourceCity,
            exportProfileId: sourceProfile.id,
            sourceSelection,
            unsupportedCases,
            semanticConflicts: []
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
            expectedTrees: 0,
            textureStablePasses: 3,
            lightingProfileSourcesReady: true,
            freshSourceEqualityVerified: true
        },
        categories: extraction.inventory.categories,
        chunks: extraction.inventory.chunks,
        roots,
        objects,
        geometries: extraction.geometries,
        meshInstances,
        materials,
        textures,
        alphaInputs,
        receiverMappings,
        casterMappings,
        participantMappings,
        lightingProfiles,
        channelProfiles,
        compilerReferences,
        buffers,
        hashes: { ...hashSet, channelSources }
    };
    return {
        manifest,
        packageBuffers: extraction.buffers.map((entry) => ({ id: entry.id, data: entry.data }))
    };
}

async function packageFixture(fixture, mutate = () => {}) {
    const manifest = structuredClone(fixture.manifest);
    mutate(manifest);
    return buildBakeSourcePackage({ manifest, buffers: fixture.packageBuffers });
}

function hasCode(code) {
    return (error) => error instanceof BakeSourceValidationError && error.code === code;
}

test('semantic validator reconstructs package projections and states that no live comparison occurred', async () => {
    const fixture = await createFixture();
    const validated = await validateResolvedCityBakePackage(await packageFixture(fixture));

    assert.equal(validated.report.valid, true);
    assert.equal(validated.report.checks.declaredBufferDigestsRecomputed, true);
    assert.equal(validated.report.checks.packageFreshnessProjectionsRecomputed, true);
    assert.equal(validated.report.checks.inverseTransformsAndDirectionParity, true);
    assert.equal(validated.report.counts.normalDirectionComparisons, 3);
    assert.equal(validated.report.counts.tangentDirectionComparisons, 3);
    assert.equal(validated.manifest.geometries[0].attributes.uv.count, 3);
    assert.equal(validated.manifest.geometries[0].attributes.uv2.count, 3);
    assert.equal(validated.report.counts.participantMappings, 1);
    assert.deepEqual(validated.report.freshness.liveResolvedSourceComparison, {
        performed: false,
        verified: false,
        reason: 'This package-only validator has no live resolved city. Runtime activation must independently derive and compare live source hashes.'
    });
});

test('semantic validator compares parsed manifest and buffers with the resolved export source', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture);
    const resolvedSource = {
        manifest: fixture.manifest,
        buffers: fixture.packageBuffers
    };
    const validated = await validateResolvedCityBakePackage(bytes, { resolvedSource });

    assert.equal(validated.report.checks.resolvedExportSourceManifestAndBuffers, true);
    assert.deepEqual(validated.report.freshness.resolvedExportSourceComparison, {
        performed: true,
        verified: true,
        reason: 'Parsed canonical manifest and every logical package buffer exactly match the fully prewarmed resolved Three.js source used for export.'
    });

    const mismatchedBuffers = fixture.packageBuffers.map((entry, index) => {
        if (index !== 0) return entry;
        const data = entry.data.slice();
        data[0] ^= 0xff;
        return { ...entry, data };
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes, {
            resolvedSource: { manifest: fixture.manifest, buffers: mismatchedBuffers }
        }),
        hasCode('resolved_export_source_buffer_mismatch')
    );
});

test('semantic validator round-trips Blender matrices and transformed normal/tangent directions', async () => {
    const fixture = await createFixture({ matrixThreeWorld: NON_UNIFORM_TRANSFORM });
    const validated = await validateResolvedCityBakePackage(await packageFixture(fixture));
    const instance = validated.manifest.meshInstances[0];
    const inverseConverted = convertBlenderMatrixToThree(instance.matrixBlenderWorld);

    assert.equal(validated.report.checks.inverseTransformsAndDirectionParity, true);
    assert.equal(validated.report.counts.normalDirectionComparisons, 3);
    assert.equal(validated.report.counts.tangentDirectionComparisons, 3);
    assert.equal(inverseConverted.length, instance.matrixThreeWorld.length);
    inverseConverted.forEach((value, index) => {
        assert.ok(Math.abs(value - instance.matrixThreeWorld[index]) <= 1e-9);
    });
});

test('semantic validator rejects a stale self-asserted source hash after parsed source mutation', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.source.mapId = 'mutated-after-export';
    });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('freshness_hash_projection_mismatch')
    );
});

test('semantic validator rejects V1 material adapters and non-boolean sidedness flags', async () => {
    const fixture = await createFixture();
    const adapterBytes = await packageFixture(fixture, (manifest) => {
        manifest.extractorContract.materialAdapter = 'evaluated-three-material-semantics-v1';
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(adapterBytes),
        hasCode('manifest_contract_unsupported')
    );

    const flagBytes = await packageFixture(fixture, (manifest) => {
        manifest.materials[0].preserveShadowSide = 'true';
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(flagBytes),
        hasCode('material_schema_unsupported')
    );
});

test('semantic validator requires exact static-sun sidedness even with zero casters', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.channelProfiles.find((entry) => entry.id === 'static_sun_depth')
            .casterSidedness.model = 'tampered-model';
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('static_sun_depth_caster_sidedness_invalid')
    );
});

test('semantic validator recomputes role-specific buffer content digests from stored bytes', async () => {
    const fixture = await createFixture();
    const packageBuffers = fixture.packageBuffers.map((entry, index) => ({
        id: entry.id,
        data: index === 0 ? Uint8Array.from(entry.data, (value, byteIndex) => byteIndex === 0 ? value ^ 1 : value) : entry.data
    }));
    const bytes = await buildBakeSourcePackage({ manifest: fixture.manifest, buffers: packageBuffers });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('buffer_content_digest_mismatch')
    );
});

test('semantic validator rejects broken source-to-derived foreign keys', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.objects[0].rootId = 'building:missing';
    });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('manifest_reference_missing')
    );
});

test('semantic validator requires a participant range for every visible static surface', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.participantMappings = [];
    });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('mapping_inventory_mismatch')
    );
});

test('semantic validator retains unsupported participants with explicit false channel relevance', async () => {
    const fixture = await createFixture({ indirectSupported: false });
    const validated = await validateResolvedCityBakePackage(await packageFixture(fixture));

    assert.equal(validated.manifest.participantMappings.length, 1);
    assert.equal(validated.manifest.participantMappings[0].channelRelevance.indirect_irradiance, false);
    assert.deepEqual(validated.manifest.source.unsupportedCases.map((entry) => entry.role), ['participant']);
});

test('semantic validator awaits geometry reconstruction failures', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.geometries[0].bounds.box.max[0] = 4;
    });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('round_trip_bounds_mismatch')
    );
});

test('semantic validator applies 1e-9 matrix and 1e-6 bounds absolute tolerances', async () => {
    const matrixFixture = await createFixture();
    const matrixBytes = await packageFixture(matrixFixture, (manifest) => {
        manifest.meshInstances[0].matrixBlenderWorld[12] += 2e-9;
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(matrixBytes),
        hasCode('round_trip_transform_mismatch')
    );

    const boundsFixture = await createFixture();
    const boundsBytes = await packageFixture(boundsFixture, (manifest) => {
        manifest.meshInstances[0].boundsThreeWorld.max[0] += 2e-6;
    });
    await assert.rejects(
        () => validateResolvedCityBakePackage(boundsBytes),
        hasCode('round_trip_world_bounds_mismatch')
    );
});

test('semantic validator rejects an accessor that addresses bytes outside its declared buffer', async () => {
    const fixture = await createFixture();
    const bytes = await packageFixture(fixture, (manifest) => {
        manifest.geometries[0].attributes.position.byteStride = 1024;
        manifest.geometries[0].attributes.position.interleaved = true;
    });

    await assert.rejects(
        () => validateResolvedCityBakePackage(bytes),
        hasCode('accessor_range_invalid')
    );
});
