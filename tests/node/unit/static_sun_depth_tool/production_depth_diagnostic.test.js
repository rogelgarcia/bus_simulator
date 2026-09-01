// Verifies the isolated RGB24+A one-profile diagnostic contract end to end.
// @ts-check

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
    canonicalJsonBytes
} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    rawSha256Hex
} from '../../../../src/app/illumination/package/index.js';
import {
    STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes,
    packStaticSunDepthQuantizedRgba8Diagnostic,
    unpackStaticSunDepthQuantizedRgba8Diagnostic
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS,
    parseProductionDepthDiagnosticArgs
} from '../../../../tools/static_sun_depth/diagnose_precision.mjs';
import {
    PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA,
    PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
    createProductionDepthDiagnosticPackageIndex,
    normalizeProductionDepthDiagnosticOptions,
    orchestrateProductionDepthDiagnostic
} from '../../../../tools/static_sun_depth/src/ProductionDepthDiagnostic.mjs';
import {
    buildProductionDepthDiagnosticPackage,
    buildProductionStaticSunDepthPackage,
    requireProductionDepthDiagnosticChunkWindows
} from '../../../../tools/static_sun_depth/src/ProductionPackage.mjs';
import {
    PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_CASE_COUNT,
    PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_REPORT_SCHEMA,
    authenticateProductionDepthDiagnosticPackage,
    authenticateProductionStaticSunDepthPackage,
    createProductionDepthDiagnosticValidationPlan,
    validateProductionDepthDiagnosticPackageIndex
} from '../../../../tools/static_sun_depth/validate_production.mjs';
import {
    PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_DEFAULTS,
    parseProductionDepthDiagnosticValidationArgs
} from '../../../../tools/static_sun_depth/validate_depth_precision_diagnostic.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const HASH_F = 'f'.repeat(64);
const LIVE_TEXEL_PITCH_METERS = 680 / 16384;

test('RGB24+A packer retains all 24 depth bits and exact binary occupancy', () => {
    const bytes = packStaticSunDepthQuantizedRgba8Diagnostic(
        0xabcdef,
        true
    );
    assert.deepEqual([...bytes], [0xab, 0xcd, 0xef, 0xff]);
    assert.deepEqual(
        unpackStaticSunDepthQuantizedRgba8Diagnostic(bytes),
        {occupied: true, quantized: 0xabcdef}
    );
    assert.deepEqual(
        unpackStaticSunDepthQuantizedRgba8Diagnostic(
            packStaticSunDepthQuantizedRgba8Diagnostic(0, false)
        ),
        {occupied: false, quantized: 0}
    );
    const invalidOccupancy = bytes.slice();
    invalidOccupancy[3] = 1;
    assert.throws(
        () => unpackStaticSunDepthQuantizedRgba8Diagnostic(invalidOccupancy),
        /exactly 0 or 255/
    );
});

test('diagnostic index and plan are hard-gated to 12 canonical az135/el08 cases', () => {
    const entry = makeIndexEntry();
    const index = createProductionDepthDiagnosticPackageIndex(entry);
    const validated = validateProductionDepthDiagnosticPackageIndex(index);
    const plan = createProductionDepthDiagnosticValidationPlan(validated);

    assert.equal(index.schema, PRODUCTION_DEPTH_DIAGNOSTIC_INDEX_SCHEMA);
    assert.equal(index.productionEligible, false);
    assert.equal(PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_CASE_COUNT, 12);
    assert.equal(
        PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_REPORT_SCHEMA,
        'bus-sim-static-sun-depth-depth-precision-diagnostic-validation-report-v1'
    );
    assert.equal(plan.caseCount, 12);
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0].lightingProfileId, PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID);
    assert.equal(plan.groups[0].cases.every((entry) => (
        entry.kind === 'low_sun_pose'
        && entry.sunProfile.id === PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID
    )), true);

    const promotable = structuredClone(index);
    promotable.productionEligible = true;
    assert.throws(
        () => validateProductionDepthDiagnosticPackageIndex(promotable),
        /non-promotable/
    );
    const productionPath = structuredClone(index);
    productionPath.profiles[PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID].packagePath =
        'tests/artifacts/illumination_531/production/ai527.sun.az135.el08/static_sun_depth.ilpkg';
    assert.throws(
        () => validateProductionDepthDiagnosticPackageIndex(productionPath),
        /separate diagnostics artifact root/
    );
});

test('diagnostic CLI defaults remain separate and preserve the production render contract', () => {
    const bake = parseProductionDepthDiagnosticArgs([]);
    assert.deepEqual(bake, PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS);
    assert.match(
        bake.artifactRoot.replaceAll('\\', '/'),
        /illumination_531\/diagnostics\/rgba8_rgb24a_global_v1$/
    );
    assert.equal(bake.rowStripPixels, 1821);
    assert.throws(
        () => parseProductionDepthDiagnosticArgs(['--row-strip-pixels', '1']),
        /preserve the production tile height/
    );

    const validation = parseProductionDepthDiagnosticValidationArgs([]);
    assert.deepEqual(validation, PRODUCTION_DEPTH_DIAGNOSTIC_VALIDATION_DEFAULTS);
    assert.equal(validation.depthPrecisionDiagnostic, true);
    assert.match(
        validation.packageIndexPath.replaceAll('\\', '/'),
        /diagnostics\/rgba8_rgb24a_global_v1\/package_index\.json$/
    );
    assert.match(
        validation.outputRoot.replaceAll('\\', '/'),
        /screens\/illumination_531\/depth_precision_rgba8_rgb24a_v1$/
    );
});

test('diagnostic orchestration refuses production roots and publishes one mocked profile', async () => {
    assert.throws(
        () => normalizeProductionDepthDiagnosticOptions({
            ...PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS,
            artifactRoot: path.join(
                PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS.repoRoot,
                'tests/artifacts/illumination_531/production'
            )
        }),
        /named child below.*diagnostics/
    );
    let published = null;
    const result = await orchestrateProductionDepthDiagnostic(
        PRODUCTION_DEPTH_DIAGNOSTIC_DEFAULTS,
        {
            executeProfileFn: async ({profile}) => ({
                ...makeIndexEntry(),
                lightingProfileId: profile.id
            }),
            lstatFn: async () => {
                const error = new Error('missing');
                // @ts-ignore fixture error code
                error.code = 'ENOENT';
                throw error;
            },
            prepareAuthorityFn: async () => ({authenticated: true}),
            publishIndexFn: async (filePath, value) => {
                published = {filePath, value};
            }
        }
    );
    assert.equal(result.profile.lightingProfileId, PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID);
    assert.deepEqual(result.packageIndex, published.value);
    assert.match(published.filePath.replaceAll('\\', '/'), /package_index\.json$/);
});

test('diagnostic package authenticates exact RGBA8 bytes and production rejects it', async () => {
    const fixture = await makeDiagnosticPackageFixture();
    const packaged = await buildProductionDepthDiagnosticPackage(fixture.options);
    const resolved = requireProductionDepthDiagnosticChunkWindows(packaged.chunks);
    assert.equal(packaged.compatibility.compatible, true);
    assert.equal(resolved.id, 'static_sun_depth.tiles.rgba8_rgb24a_diagnostic');
    assert.deepEqual(resolved.dimensions, {
        components: 4,
        depth: 1,
        height: 6,
        width: 6
    });
    assert.equal(packaged.chunks[0].descriptor.encoding, 'rgba8_unorm');
    assert.deepEqual(packaged.chunks[0].descriptor.requiredRuntimeCapabilities, [
        'fragment_highp_float',
        'rgba8_unorm',
        'texture_2d_array',
        'webgl2'
    ]);
    const authenticated = await authenticateProductionDepthDiagnosticPackage(
        packaged,
        fixture.descriptor,
        fixture.payload
    );
    assert.equal(authenticated.assembledByteLength, fixture.payload.byteLength);
    assert.equal(authenticated.dimensions.components, 4);

    const stale = fixture.payload.slice();
    stale[0] ^= 1;
    await assert.rejects(
        authenticateProductionDepthDiagnosticPackage(
            packaged,
            fixture.descriptor,
            stale
        ),
        /assembled bytes differ/
    );
    await assert.rejects(
        authenticateProductionStaticSunDepthPackage(
            packaged,
            fixture.descriptor,
            fixture.payload
        ),
        /chunk ID|complete texture array|layer windows/
    );
    await assert.rejects(
        buildProductionStaticSunDepthPackage(fixture.options),
        /descriptor encoding must be 'rg8-packed-linear-depth-v1'/
    );
});

function makeIndexEntry() {
    return {
        lightingProfileId: PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
        liveIdentity: {
            alphaSemanticsSha256: HASH_A,
            casterInventorySha256: HASH_B,
            cityId: 'bigcity2',
            developmentCacheAllowed: true,
            lightingProfileId: PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
            resolvedSourceSha256: HASH_C,
            staticSunDepthSourceSha256: HASH_D
        },
        packagePath:
            'tests/artifacts/illumination_531/diagnostics/rgba8_rgb24a_global_v1/'
            + 'ai527.sun.az135.el08/static_sun_depth.ilpkg'
    };
}

async function makeDiagnosticPackageFixture() {
    const compilerDescriptor = {
        backend: 'cycles_cpu',
        buildHash: 'diagnostic-fixture-build',
        schema: 'production-static-sun-compiler-v1',
        version: '5.2.1 LTS'
    };
    const compilerSignatureSha256 = await rawSha256Hex(
        canonicalJsonBytes(compilerDescriptor)
    );
    const payload = new Uint8Array(6 * 6 * 4);
    for (let offset = 0; offset < payload.byteLength; offset += 4) {
        packStaticSunDepthQuantizedRgba8Diagnostic(
            0x123456,
            true,
            payload,
            offset
        );
    }
    const contentSha256 = await rawSha256Hex(payload);
    const sunPointDirectionWorld = [0, 0, -1];
    const filterAxes = createThreeR183DirectionalShadowFilterAxes(
        sunPointDirectionWorld
    );
    const descriptor = {
        identity: {
            alpha: {
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                forcedOpaque: 'shadow-as-opaque-v1',
                model: 'evaluated-runtime-coverage-v1',
                semanticsSha256: HASH_D,
                sidedness: 'material-side-and-shadow-side-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1'
            },
            basis: createStableStaticSunDepthBasis(sunPointDirectionWorld),
            casterInventorySha256: HASH_A,
            channelId: 'static_sun_depth',
            channelSourceSha256: HASH_B,
            channelVersion: 1,
            cityId: 'bigcity2',
            compilerSignatureSha256,
            encoding: {
                alphaChannel: 'occupied-255-empty-0-v1',
                blueChannel: 'quantized-low-byte-v1',
                emptyAlpha: 0,
                greenChannel: 'quantized-middle-byte-v1',
                id: STATIC_SUN_DEPTH_DIAGNOSTIC_ENCODING_ID,
                maxDepthMeters: 10,
                maxQuantized: 16777215,
                minDepthMeters: 0,
                occupiedAlpha: 255,
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1'
            },
            layout: {
                boundsLightMeters: {
                    max: [LIVE_TEXEL_PITCH_METERS * 2, LIVE_TEXEL_PITCH_METERS * 2],
                    min: [0, 0]
                },
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                guardTexels: 2,
                interiorTexels: [2, 2],
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                order: 'row-major-y-then-x-v1',
                rowOrigin: 'min-light-y-v1',
                texelSizeMeters: LIVE_TEXEL_PITCH_METERS,
                tileCount: [1, 1]
            },
            sampling: {
                bias: {
                    constantDepthReliefMeters: 0.0697915,
                    geometricNormalOffsetMeters: 0.0232,
                    model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
                },
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
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
            sunPointDirectionWorld
        },
        schema: 'static-sun-depth-tile-set-v1',
        tiles: [{
            contentSha256,
            coordinates: [0, 0],
            id: 'tile.0.0',
            interiorBoundsLightMeters: {
                max: [LIVE_TEXEL_PITCH_METERS * 2, LIVE_TEXEL_PITCH_METERS * 2],
                min: [0, 0]
            },
            storedTexels: [6, 6]
        }]
    };
    return {
        descriptor,
        payload,
        options: {
            channelProfileSha256: HASH_F,
            cityId: 'bigcity2',
            compilerDescriptor,
            descriptor,
            lightingProfileId: PRODUCTION_DEPTH_DIAGNOSTIC_PROFILE_ID,
            payload,
            selectedCapabilityProfileId: 'development.static_sun_v1',
            source: {
                geometrySha256: '1'.repeat(64),
                resolvedSourceSha256: HASH_E,
                schema: 'production-static-sun-source-v1',
                usedMaterialsSha256: '2'.repeat(64)
            }
        }
    };
}
