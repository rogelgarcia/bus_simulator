// Verifies strict AI531 production orchestration without launching Blender.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import {
    canonicalJsonStringify
} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    createAi531StaticSunLightProfiles
} from '../../../../tools/illumination_bake_exporter/profile.mjs';
import {
    createThreeR183DirectionalShadowFilterAxes
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    PRODUCTION_STATIC_SUN_DEFAULTS,
    parseProductionCliArguments
} from '../../../../tools/static_sun_depth/production.mjs';
import {
    PRODUCTION_STATIC_SUN_PACKAGE_INDEX_SCHEMA,
    PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX,
    buildProductionPackageIndex,
    createProductionStaticSunRequest,
    deriveLiveSourceToCacheLightAxisTransform,
    deriveProductionSourceIdentityHashes,
    orchestrateProductionStaticSunDepth,
    parseProductionReceiptStdoutDescriptor,
    selectProductionStaticSunProfiles,
    validateResidualNativeFieldSource
} from '../../../../tools/static_sun_depth/src/ProductionOrchestrator.mjs';
import {
    validateProductionPackageIndex
} from '../../../../tools/static_sun_depth/validate_production.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

test('residual calibration accepts authenticated incremental v11 field lineage', () => {
    const residual = makeResidualCalibrationSource();
    assert.doesNotThrow(() => validateResidualNativeFieldSource(residual));

    residual.sourceField.method =
        'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10';
    assert.throws(
        () => validateResidualNativeFieldSource(residual),
        /source field is unsupported/u
    );
});

test('production orchestrator independently authenticates v4 derivative axes', () => {
    const profile = selectProductionStaticSunProfiles(['ai527.sun.az045.el35'])[0];
    const pcf = structuredClone(
        createProductionStaticSunRequest(profile).sampling.pcf
    );
    const cacheBasis = {
        rightAxisWorld: pcf.sourceMapRightAxisWorld.map((value) => -value),
        upAxisWorld: [...pcf.sourceMapUpAxisWorld]
    };
    assert.deepEqual(
        deriveLiveSourceToCacheLightAxisTransform(cacheBasis, pcf),
        [[-1, 0], [0, 1]]
    );
    pcf.sourceMapUpAxisWorld = [...pcf.sourceMapRightAxisWorld];
    assert.throws(
        () => deriveLiveSourceToCacheLightAxisTransform(cacheBasis, pcf),
        /not bijective/u
    );
});

test('production request inventory uses the exact eight non-lab release profiles', () => {
    const profiles = selectProductionStaticSunProfiles();
    assert.equal(profiles.length, 8);
    assert.deepEqual(profiles.map((entry) => entry.id), [
        'ai527.sun.az045.el08',
        'ai527.sun.az045.el35',
        'ai527.sun.az135.el08',
        'ai527.sun.az135.el35',
        'ai527.sun.az225.el08',
        'ai527.sun.az225.el35',
        'ai527.sun.az315.el08',
        'ai527.sun.az315.el35'
    ]);
    assert.equal(createAi531StaticSunLightProfiles().length, 9);

    for (const profile of profiles) {
        const request = createProductionStaticSunRequest(profile);
        const filterAxes = createThreeR183DirectionalShadowFilterAxes(
            profile.directionThree
        );
        assert.deepEqual(request, {
            boundsMarginMeters: 2,
            casterSidedness: {
                model: 'three-r183-effective-shadow-side-v1',
                preserveMaterialFlagSemantics: 'material-userdata-preserveShadowSide-or-isFoliage-v1',
                twoSidedCasting: true
            },
            guardPixels: 4,
            interiorPixels: [1870, 1821],
            lightingProfileId: profile.id,
            maxPayloadBytes: 536_870_912,
            phasePolicy: 'absolute-stable-basis-texel-edge-lattice-v1',
            sampling: {
                bias: {
                    constantDepthReliefMeters: 0.0697915,
                    geometricNormalOffsetMeters: 0.0232,
                    model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
                },
                pcf: {
                    hardwareComparison: 'linear-four-compare-taps-v1',
                    model: 'three-r183-vogel-5-linear-compare-v1',
                    radiusTexels: 1.5,
                    sampleCount: 5,
                    screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                    shadowMapSizeTexels: [16384, 16384],
                    shadowMapWorldExtentMeters: [680, 680],
                    sourceMapRightAxisWorld: filterAxes.rightAxisWorld,
                    sourceMapUpAxisWorld: filterAxes.upAxisWorld
                }
            },
            schema: 'ai531-static-sun-production-request-v4',
            sourceShadowCapability: {
                id: 'three-r183-single-high-effective-16384-v1',
                mapSizeTexels: [16384, 16384],
                worldExtentMeters: [680, 680]
            },
            sunPointDirectionWorld: profile.directionThree,
            texelSizeMeters: 0.04150390625,
            tileSizeMeters: [77.6123046875, 75.57861328125]
        });
    }
});

test('receipt stdout authentication requires one canonical fixed-path descriptor', () => {
    const descriptor = {
        byteLength: 123,
        path: 'production_static_sun_receipt.json',
        sha256: HASH_A
    };
    const stdout = [
        'Blender 5.2.1',
        PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX
            + canonicalJsonStringify(descriptor),
        'Blender quit'
    ].join('\n');
    assert.deepEqual(parseProductionReceiptStdoutDescriptor(stdout), descriptor);

    assert.throws(
        () => parseProductionReceiptStdoutDescriptor(stdout + '\n'
            + PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX
            + canonicalJsonStringify(descriptor)),
        /exactly one/
    );
    assert.throws(
        () => parseProductionReceiptStdoutDescriptor(
            PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX
            + JSON.stringify({ sha256: HASH_A, path: descriptor.path, byteLength: 123 })
        ),
        /not canonical JSON/
    );
    assert.throws(
        () => parseProductionReceiptStdoutDescriptor(
            PRODUCTION_STATIC_SUN_RECEIPT_STDOUT_PREFIX
            + canonicalJsonStringify({ ...descriptor, path: '../receipt.json' })
        ),
        /must be 'production_static_sun_receipt.json'/
    );
});

test('source identity hashes reproduce the renderer caster and alpha projections', () => {
    const selectedMapping = {
        alphaInputId: 'alpha.selected',
        channelRelevance: { static_sun_depth: true },
        effectiveShadowSide: 2,
        id: 'mapping.selected',
        materialId: 'material.selected',
        preserveShadowSide: false,
        shadowSide: 2,
        side: 2
    };
    const manifest = {
        alphaInputs: [{
            alpha: {
                inputs: [{ bindingId: 'binding.selected' }],
                mode: 'cutout'
            },
            id: 'alpha.selected'
        }],
        casterMappings: [
            selectedMapping,
            {
                alphaInputId: 'alpha.other',
                channelRelevance: { static_sun_depth: false },
                id: 'mapping.other',
                materialId: 'material.other'
            }
        ],
        materials: [{
            alpha: { mode: 'cutout' },
            alphaInputId: 'alpha.selected',
            id: 'material.selected',
            isFoliage: false,
            preserveShadowSide: false,
            shadowSide: 2,
            side: 2,
            vertexColors: false
        }],
        textures: [{
            id: 'binding.selected',
            sourceId: 'source.selected',
            wrap: 'clamp'
        }, {
            contentSha256: HASH_A,
            coverageChannels: [{ channel: 'a', sha256: HASH_B }],
            id: 'source.selected'
        }]
    };
    const alphaProjection = {
        alphaInputs: [manifest.alphaInputs[0]],
        bindings: [manifest.textures[0]],
        materials: [{
            ...manifest.materials[0],
            isFoliage: false,
            preserveShadowSide: false
        }],
        schema: 'ai531-static-sun-alpha-semantics-projection-v2',
        sources: [{
            contentSha256: HASH_A,
            coverageChannels: [{ channel: 'a', sha256: HASH_B }],
            id: 'source.selected'
        }]
    };
    const casterProjection = {
        channelId: 'static_sun_depth',
        mappings: [selectedMapping],
        schema: 'ai531-static-sun-caster-inventory-projection-v2'
    };
    const identity = deriveProductionSourceIdentityHashes(manifest);
    assert.equal(
        identity.alphaSemanticsSha256,
        rawCanonicalSha256(alphaProjection)
    );
    assert.equal(
        identity.casterInventorySha256,
        rawCanonicalSha256(casterProjection)
    );

    const irrelevantChanged = structuredClone(manifest);
    irrelevantChanged.casterMappings[1].id = 'mapping.unselected.changed';
    assert.deepEqual(
        deriveProductionSourceIdentityHashes(irrelevantChanged),
        identity
    );
    const selectedChanged = structuredClone(manifest);
    selectedChanged.casterMappings[0].materialId = 'material.changed';
    assert.notEqual(
        deriveProductionSourceIdentityHashes(selectedChanged)
            .casterInventorySha256,
        identity.casterInventorySha256
    );
    const missingPreserveFlag = structuredClone(manifest);
    delete missingPreserveFlag.materials[0].preserveShadowSide;
    assert.throws(
        () => deriveProductionSourceIdentityHashes(missingPreserveFlag),
        /explicit V2 shadow-side booleans/
    );
    const invalidFoliageFlag = structuredClone(manifest);
    invalidFoliageFlag.materials[0].isFoliage = 'false';
    assert.throws(
        () => deriveProductionSourceIdentityHashes(invalidFoliageFlag),
        /explicit V2 shadow-side booleans/
    );
});

test('package index is canonical and matches the downstream seven-field live identity schema', () => {
    const first = makeIndexEntry('ai527.sun.az045.el35', HASH_A);
    const second = makeIndexEntry('ai527.sun.az045.el08', HASH_B);
    const index = buildProductionPackageIndex([first, second]);

    assert.equal(index.schema, PRODUCTION_STATIC_SUN_PACKAGE_INDEX_SCHEMA);
    assert.deepEqual(Object.keys(index.profiles), [
        'ai527.sun.az045.el08',
        'ai527.sun.az045.el35'
    ]);
    assert.deepEqual(validateProductionPackageIndex(index), index);

    assert.throws(
        () => buildProductionPackageIndex([{
            ...first,
            liveIdentity: {
                ...first.liveIdentity,
                unexpected: true
            }
        }]),
        /must contain exactly/
    );
    assert.throws(
        () => buildProductionPackageIndex([first, first]),
        /Invalid or duplicate/
    );
});

test('CLI pins the fresh source, proof_cpu_12, full-row rendering, and repeat defaults', () => {
    assert.match(
        PRODUCTION_STATIC_SUN_DEFAULTS.inputPath.replaceAll('\\', '/'),
        /tests\/artifacts\/illumination_528\/packages\/bigcity2\/ai531-production\/bigcity2\.bsib$/
    );
    assert.match(
        PRODUCTION_STATIC_SUN_DEFAULTS.profilePath.replaceAll('\\', '/'),
        /tools\/illumination_bake_compiler\/profiles\/proof_cpu_12\.v1\.json$/
    );
    assert.equal(PRODUCTION_STATIC_SUN_DEFAULTS.rowStripPixels, 1821);
    assert.equal(PRODUCTION_STATIC_SUN_DEFAULTS.repeat, 1);
    assert.equal(
        PRODUCTION_STATIC_SUN_DEFAULTS.artifactRoot.replaceAll('\\', '/'),
        `${process.cwd().replaceAll('\\', '/')}/assets/baked_lighting/shadows`
    );

    const selected = parseProductionCliArguments([
        '--alpha-parity-root',
        'tests/artifacts/illumination_531/alpha_parity',
        '--profiles',
        'ai527.sun.az045.el35,ai527.sun.az225.el35',
        '--repeat',
        '2',
        '--row-strip-pixels',
        '1821'
    ]);
    assert.deepEqual(selected.profiles, [
        'ai527.sun.az045.el35',
        'ai527.sun.az225.el35'
    ]);
    assert.equal(selected.repeat, 2);
    assert.equal(selected.rowStripPixels, 1821);
    assert.match(
        selected.alphaParityRoot.replaceAll('\\', '/'),
        /tests\/artifacts\/illumination_531\/alpha_parity$/
    );
    assert.throws(
        () => parseProductionCliArguments([
            '--profiles',
            'ai527.sun.az225.el12'
        ]),
        /Unknown AI531 lighting profile IDs/
    );
    assert.throws(
        () => parseProductionCliArguments([
            '--row-strip-pixels',
            '64'
        ]),
        /rectangular tile interior height/
    );
    assert.throws(
        () => parseProductionCliArguments([
            '--profiles',
            'ai527.sun.az045.el35,ai527.sun.az045.el35'
        ]),
        /unique/
    );
});

test('dependency injection selects profiles, executes repeats, resumes peers, and publishes one index', async () => {
    const selectedIds = [
        'ai527.sun.az045.el35',
        'ai527.sun.az225.el35'
    ];
    const calls = {
        execute: [],
        existing: [],
        published: []
    };
    const repoRoot = process.cwd();
    const options = {
        ai529Directory: path.join(repoRoot, 'tools/illumination_bake_compiler/blender'),
        archivePath: path.join(repoRoot, 'archive.zip'),
        artifactRoot: path.join(repoRoot, 'assets/baked_lighting/shadows'),
        executablePath: path.join(repoRoot, 'blender.exe'),
        inputPath: path.join(repoRoot, 'fresh.bsib'),
        nativeCutoutRoot: path.join(
            repoRoot,
            'tests/artifacts/illumination_531/native-cutout-fixture'
        ),
        profilePath: path.join(repoRoot, 'proof_cpu_12.v1.json'),
        profiles: selectedIds,
        rendererPath: path.join(repoRoot, 'production_static_sun.py'),
        repeat: 2,
        repoRoot,
        rowStripPixels: 1821,
        timeoutMs: 10_000,
        toolchainPath: path.join(repoRoot, 'toolchain.v1.json')
    };
    const result = await orchestrateProductionStaticSunDepth(options, {
        prepareAuthorityFn: async (normalized) => {
            assert.equal(normalized.repeat, 2);
            assert.equal(normalized.rowStripPixels, 1821);
            return Object.freeze({ marker: 'authority' });
        },
        executeProfileFn: async (context) => {
            assert.equal(context.authority.marker, 'authority');
            calls.execute.push({
                id: context.profile.id,
                repeatIndex: context.repeatIndex
            });
            return {
                ...makeIndexEntry(context.profile.id, HASH_C),
                repeatIndex: context.repeatIndex,
                repeatVerified: context.repeatIndex > 1,
                resumed: false
            };
        },
        loadExistingProfileFn: async (context) => {
            calls.existing.push(context.profile.id);
            return null;
        },
        publishIndexFn: async (indexPath, index) => {
            calls.published.push({ indexPath, index });
        },
        runBlenderFn: async () => {
            throw new Error('runBlenderFn must not be reached through injected orchestration');
        }
    });

    assert.deepEqual(calls.execute, [
        { id: 'ai527.sun.az045.el35', repeatIndex: 1 },
        { id: 'ai527.sun.az045.el35', repeatIndex: 2 },
        { id: 'ai527.sun.az225.el35', repeatIndex: 1 },
        { id: 'ai527.sun.az225.el35', repeatIndex: 2 }
    ]);
    assert.equal(calls.existing.length, 6);
    assert.equal(calls.published.length, 1);
    assert.deepEqual(
        Object.keys(calls.published[0].index.profiles),
        selectedIds
    );
    assert.deepEqual(result.selectedProfileIds, selectedIds);
    assert.equal(result.profiles.length, 2);
    assert.equal(result.profiles[0].repeatResults.length, 2);
});

function makeIndexEntry(lightingProfileId, seedHash) {
    return {
        lightingProfileId,
        liveIdentity: {
            alphaSemanticsSha256: seedHash,
            casterInventorySha256: HASH_B,
            cityId: 'bigcity2',
            developmentCacheAllowed: true,
            lightingProfileId,
            resolvedSourceSha256: HASH_C,
            staticSunDepthSourceSha256: HASH_D
        },
        packagePath: `assets/baked_lighting/shadows/production/${lightingProfileId}/static_sun_depth.ilpkg`
    };
}

function makeResidualCalibrationSource() {
    return {
        correctedTexelCount: 1,
        correctedTexels: [{
            casterClasses: ['foliage'],
            correctedDepthMeters: Math.fround(1.25),
            formerDepthMeters: 2,
            globalTexel: [1, 2],
            liveDepthMeters: 1.25,
            observationCount: 1,
            observationSha256: HASH_A,
            reportSha256s: [HASH_B]
        }],
        localizationReports: [{
            byteLength: 1,
            captureSetSha256: HASH_C,
            casterClasses: ['foliage'],
            path: 'localization_report.json',
            sha256: HASH_D,
            targetCaseId: 'illum.profiler.r1c1.n'
        }],
        method: 'apply-authenticated-same-session-nearer-live-depth-residuals-v4',
        productionPackage: {
            alphaCertification: {
                byteLength: 1,
                path: 'alpha_certification.json',
                sha256: HASH_A
            },
            packagePath: 'static_sun_depth.ilpkg'
        },
        schema: 'ai531-production-static-shadow-residual-calibration-v4',
        sourceField: {
            method: 'authenticated-static-shadow-residual-live-depth-corrections-v11',
            outputProjectionSha256: HASH_B,
            receiptSha256: HASH_C,
            schema: 'ai531-production-alpha-cutout-native-field-receipt-v11'
        },
        sourceProductionReport: {
            byteLength: 1,
            path: 'production_validation_report.json',
            schema: 'bus-sim-static-sun-depth-production-validation-report-v4',
            sha256: HASH_D
        }
    };
}

function rawCanonicalSha256(value) {
    return createHash('sha256')
        .update(canonicalJsonStringify(value), 'utf8')
        .digest('hex');
}
