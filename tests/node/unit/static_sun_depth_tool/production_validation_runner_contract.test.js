// Verifies the BigCity2 production runner's strict package, case, capture, and failure contract.
// @ts-check

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {ILLUMINATION_VALIDATION_CASES} from '../../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {rawSha256Hex} from '../../../../src/app/illumination/package/index.js';
import {
    createStableStaticSunDepthBasis,
    createStaticSunDepthLayerWindowEnvelope,
    createThreeR183DirectionalShadowFilterAxes
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    productionShadowLumaDarkeningByte,
    requireNonCityDynamicReceiverTarget,
    requireProductionDynamicReceiverRootScope
} from '../../../../tools/static_sun_depth/browser/ProductionReceiverScope.js';
import {
    createProductionReceiverMaskPartition
} from '../../../../tools/static_sun_depth/browser/ProductionReceiverMaskPartition.js';
import {
    PRODUCTION_VALIDATION_CASE_COUNT,
    PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS,
    PRODUCTION_VALIDATION_INDEX_SCHEMA,
    PRODUCTION_VALIDATION_REPORT_SCHEMA,
    PRODUCTION_VALIDATION_THRESHOLDS,
    authenticateProductionStaticSunDepthPackage,
    createProductionDynamicBusEvidence,
    createProductionLiveTexelPhaseEvidence,
    createProductionTileBoundaryEvidence,
    createProductionValidationPlan,
    evaluateProductionCasterTransition,
    evaluateProductionCaseMetrics,
    evaluateProductionDynamicBusShadowProof,
    evaluateProductionDynamicBusState,
    evaluateProductionShadowSubmission,
    requireProductionMetricRecord,
    validateProductionDescriptorFilterIdentity,
    validateProductionPackageIndex
} from '../../../../tools/static_sun_depth/validate_production.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const LIVE_TEXEL_PITCH_METERS = 680 / 16384;

test('production plan excludes exactly eight labs and groups all 197 BigCity2 cases by exact sun profile', () => {
    const index = makeIndex();
    const validated = validateProductionPackageIndex(index);
    const plan = createProductionValidationPlan(validated);

    assert.equal(PRODUCTION_VALIDATION_CASE_COUNT, 197);
    assert.equal(
        PRODUCTION_VALIDATION_REPORT_SCHEMA,
        'bus-sim-static-sun-depth-production-validation-report-v4'
    );
    assert.deepEqual(PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS, [1280, 720]);
    assert.equal(
        Object.isFrozen(PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS),
        true
    );
    assert.equal(plan.caseCount, 197);
    assert.equal(plan.excludedLabCaseCount, 8);
    assert.equal(plan.groups.length, 8);
    assert.equal(plan.groups.reduce((sum, group) => sum + group.cases.length, 0), 197);
    assert.equal(plan.groups.every((group) => (
        group.cases.every((entry) => (
            entry.kind !== 'lab'
            && entry.cityId === 'bigcity2'
            && entry.sunProfile.id === group.lightingProfileId
        ))
    )), true);
    const defaultGroup = plan.groups.find(
        (group) => group.lightingProfileId === 'ai527.sun.az045.el35'
    );
    assert.equal(defaultGroup.cases.length, 113);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.groups), true);
    assert.equal(Object.isFrozen(plan.groups[0].package.liveIdentity), true);
});

test('package index requires exact profile mapping, canonical artifact paths, and seven own data fields', () => {
    const missing = makeIndex();
    delete missing.profiles['ai527.sun.az045.el08'];
    assert.throws(
        () => createProductionValidationPlan(missing),
        /exact production lightingProfileId inventory.*missing=/
    );

    const extra = makeIndex();
    extra.profiles['ai527.sun.az000.el00'] = profileEntry('ai527.sun.az000.el00');
    assert.throws(
        () => createProductionValidationPlan(extra),
        /unexpected=/
    );

    const wrongPath = makeIndex();
    wrongPath.profiles['ai527.sun.az045.el08'].packagePath = '../escape.ilpkg';
    assert.throws(() => validateProductionPackageIndex(wrongPath), /canonical repository-relative/);

    const wrongProfile = makeIndex();
    wrongProfile.profiles['ai527.sun.az045.el08'].liveIdentity.lightingProfileId =
        'ai527.sun.az045.el35';
    assert.throws(() => validateProductionPackageIndex(wrongProfile), /must match its map key/);

    const extraIdentity = makeIndex();
    extraIdentity.profiles['ai527.sun.az045.el08'].liveIdentity.extra = true;
    assert.throws(() => validateProductionPackageIndex(extraIdentity), /must contain exactly/);

    const accessorIdentity = makeIndex();
    const identity = accessorIdentity.profiles['ai527.sun.az045.el08'].liveIdentity;
    Object.defineProperty(identity, 'resolvedSourceSha256', {
        enumerable: true,
        get: () => HASH_C
    });
    assert.throws(() => validateProductionPackageIndex(accessorIdentity), /own data property/);

    const accessorProfile = makeIndex();
    const profile = accessorProfile.profiles['ai527.sun.az045.el08'];
    Object.defineProperty(accessorProfile.profiles, 'ai527.sun.az045.el08', {
        enumerable: true,
        get: () => profile
    });
    assert.throws(() => validateProductionPackageIndex(accessorProfile), /own data property/);
});

test('production validator rejects legacy, stale-size, pitch, phase, and axis drift', () => {
    const valid = makeProductionDescriptor();
    assert.deepEqual(validateProductionDescriptorFilterIdentity(valid), valid);

    const repeatedNormalizationNoise = structuredClone(valid);
    repeatedNormalizationNoise.identity.sampling.pcf.sourceMapRightAxisWorld[1]
        += 5e-13;
    assert.doesNotThrow(
        () => validateProductionDescriptorFilterIdentity(repeatedNormalizationNoise)
    );

    const excessiveAxisDrift = structuredClone(valid);
    excessiveAxisDrift.identity.sampling.pcf.sourceMapRightAxisWorld[1] += 2e-12;
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(excessiveAxisDrift),
        /effective Three r183 16384 filter identity/
    );

    const legacy = structuredClone(valid);
    legacy.identity.sampling = {
        bias: {
            constantMeters: 0.04,
            model: 'constant-plus-normal-offset-v1',
            normalOffsetScaleMeters: 0.08
        },
        comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
        emptyPolicy: 'visible-v1',
        outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
        pcf: {model: 'square-nearest-box-v1', radiusTexels: 1}
    };
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(legacy),
        /effective Three r183 16384 filter identity/
    );

    const staleSize = structuredClone(valid);
    staleSize.identity.sampling.pcf.shadowMapSizeTexels = [8192, 8192];
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(staleSize),
        /effective Three r183 16384 filter identity/
    );

    const swappedAxes = structuredClone(valid);
    swapSamplingAxes(swappedAxes.identity.sampling);
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(swappedAxes),
        /source-map axes do not match Three r183/
    );

    const pitchDrift = structuredClone(valid);
    pitchDrift.identity.layout.texelSizeMeters = LIVE_TEXEL_PITCH_METERS * 2;
    pitchDrift.identity.layout.boundsLightMeters.max =
        [LIVE_TEXEL_PITCH_METERS * 4, LIVE_TEXEL_PITCH_METERS * 4];
    pitchDrift.tiles[0].interiorBoundsLightMeters.max =
        [LIVE_TEXEL_PITCH_METERS * 4, LIVE_TEXEL_PITCH_METERS * 4];
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(pitchDrift),
        /cache texel pitch differs from the live source/
    );

    const phaseDrift = structuredClone(valid);
    for (const edge of ['min', 'max']) {
        phaseDrift.identity.layout.boundsLightMeters[edge] =
            phaseDrift.identity.layout.boundsLightMeters[edge]
                .map((value) => value + LIVE_TEXEL_PITCH_METERS / 4);
        phaseDrift.tiles[0].interiorBoundsLightMeters[edge] =
            phaseDrift.tiles[0].interiorBoundsLightMeters[edge]
                .map((value) => value + LIVE_TEXEL_PITCH_METERS / 4);
    }
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(phaseDrift),
        /cache grid edge is not phase-aligned/
    );

    const directionLength = Math.hypot(1, 2, 3);
    const nonPermutationAxes = makeProductionDescriptor([
        1 / directionLength,
        2 / directionLength,
        3 / directionLength
    ]);
    assert.throws(
        () => validateProductionDescriptorFilterIdentity(nonPermutationAxes),
        /source\/cache light axes are not a signed permutation/
    );
});

test('live texel phase evidence rejects stale axes and shifted camera grids', () => {
    const descriptor = makeProductionDescriptor();
    const filterAxes = descriptor.identity.sampling.pcf;
    const sourceCameraCenterWorld = [0, 0, -200];
    const sourceCameraBoundsMeters = {
        bottom: -340,
        left: -340,
        right: 340,
        top: 340
    };
    const livePhaseInput = {
        descriptor,
        sourceCameraBoundsMeters,
        sourceCameraCenterWorld,
        sourceMapRightAxisWorld: filterAxes.sourceMapRightAxisWorld,
        sourceMapUpAxisWorld: filterAxes.sourceMapUpAxisWorld
    };
    const evidence = createProductionLiveTexelPhaseEvidence(livePhaseInput);
    assert.equal(evidence.status, 'verified');
    assert.equal(evidence.cacheTexelPitchMeters, LIVE_TEXEL_PITCH_METERS);
    assert.ok(evidence.maximumPhaseIndexError <= 1e-9);
    assert.deepEqual(evidence.cacheBasis, {
        originWorld: descriptor.identity.basis.originWorld,
        rightAxisWorld: descriptor.identity.basis.rightAxisWorld,
        upAxisWorld: descriptor.identity.basis.upAxisWorld
    });
    assert.deepEqual(
        evidence.cacheBoundsLightMeters,
        descriptor.identity.layout.boundsLightMeters
    );
    assert.deepEqual(
        evidence.sourceMapRightAxisWorld,
        filterAxes.sourceMapRightAxisWorld
    );
    assert.deepEqual(
        evidence.sourceMapUpAxisWorld,
        filterAxes.sourceMapUpAxisWorld
    );

    const shiftedCenter = sourceCameraCenterWorld.map((value, axis) => (
        value + filterAxes.sourceMapRightAxisWorld[axis] * LIVE_TEXEL_PITCH_METERS / 4
    ));
    assert.throws(
        () => createProductionLiveTexelPhaseEvidence({
            ...livePhaseInput,
            sourceCameraCenterWorld: shiftedCenter
        }),
        /camera center is not snapped/
    );

    const shiftedBounds = {
        bottom: -340,
        left: -340 + LIVE_TEXEL_PITCH_METERS / 4,
        right: 340 + LIVE_TEXEL_PITCH_METERS / 4,
        top: 340
    };
    assert.throws(
        () => createProductionLiveTexelPhaseEvidence({
            ...livePhaseInput,
            sourceCameraBoundsMeters: shiftedBounds
        }),
        /texel centers are not phase-aligned/
    );

    assert.throws(
        () => createProductionLiveTexelPhaseEvidence({
            ...livePhaseInput,
            sourceMapRightAxisWorld: filterAxes.sourceMapUpAxisWorld
        }),
        /live source shadow axes differ/
    );
});

test('production package authentication reassembles strict windows and retains direct compatibility', async () => {
    const descriptor = makeTwoLayerProductionDescriptor();
    const layerByteLength = 6 * 6 * 2;
    const payload = Uint8Array.from(
        {length: layerByteLength * 2},
        (_, index) => (index * 31 + 7) & 255
    );
    const direct = await makeVerifiedStaticSunPackage(descriptor, payload, false);
    const directResult = await authenticateProductionStaticSunDepthPackage(
        direct,
        descriptor,
        payload
    );
    assert.equal(directResult.assembledByteLength, payload.byteLength);
    assert.equal(directResult.assembledSha256, await rawSha256Hex(payload));

    const windows = await makeVerifiedStaticSunPackage(descriptor, payload, true);
    const windowResult = await authenticateProductionStaticSunDepthPackage(
        windows,
        descriptor,
        payload
    );
    assert.deepEqual(windowResult.dimensions, {
        components: 2,
        depth: 2,
        height: 6,
        width: 6
    });

    for (const mutate of [
        (value) => value.chunks.reverse(),
        (value) => { value.chunks[1].descriptor.coordinateTransform.firstLayer = 2; },
        (value) => { value.chunks[1].descriptor.coordinateTransform.firstLayer = 0; },
        (value) => { value.chunks[1].descriptor.id = value.chunks[0].descriptor.id; },
        (value) => {
            value.chunks[1].descriptor.coordinateTransform.assembledSha256 = HASH_A;
        },
        (value) => { value.chunks[1].data[0] ^= 255; }
    ]) {
        const invalid = structuredClone(windows);
        mutate(invalid);
        await assert.rejects(
            authenticateProductionStaticSunDepthPackage(
                invalid,
                descriptor,
                payload
            ),
            /chunk|window|gap|overlap|reorder|inconsistent|SHA-256/i
        );
    }

    const tamperedPublishedPayload = payload.slice();
    tamperedPublishedPayload[0] ^= 255;
    await assert.rejects(
        authenticateProductionStaticSunDepthPackage(
            windows,
            descriptor,
            tamperedPublishedPayload
        ),
        /authenticated published static_sun_depth\.rg8/
    );
    const substitutedDescriptor = structuredClone(descriptor);
    substitutedDescriptor.tiles[0].contentSha256 = HASH_A;
    await assert.rejects(
        authenticateProductionStaticSunDepthPackage(
            windows,
            substitutedDescriptor,
            payload
        ),
        /published descriptor or dimensions/
    );

    const phaseDriftDescriptor = structuredClone(descriptor);
    for (const edge of ['min', 'max']) {
        phaseDriftDescriptor.identity.layout.boundsLightMeters[edge] =
            phaseDriftDescriptor.identity.layout.boundsLightMeters[edge]
                .map((value) => value + LIVE_TEXEL_PITCH_METERS / 4);
        for (const tile of phaseDriftDescriptor.tiles) {
            tile.interiorBoundsLightMeters[edge] =
                tile.interiorBoundsLightMeters[edge]
                    .map((value) => value + LIVE_TEXEL_PITCH_METERS / 4);
        }
    }
    const phaseDriftPackage = await makeVerifiedStaticSunPackage(
        phaseDriftDescriptor,
        payload,
        true
    );
    await assert.rejects(
        authenticateProductionStaticSunDepthPackage(
            phaseDriftPackage,
            phaseDriftDescriptor,
            payload
        ),
        /cache grid edge is not phase-aligned/
    );
});

test('threshold evaluator fails missing occluders, false-lit seams, continuous seams, and documented RGB gates', () => {
    const passing = makeMetrics({
        width: 20,
        height: 25,
        pixelCount: 500,
        pixelsOverFourByte: 1,
        meanRgbErrorByte: PRODUCTION_VALIDATION_THRESHOLDS.meanRgbErrorByte,
        pixelsOverFourBytePercent: PRODUCTION_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent,
        maxRgbErrorByte: PRODUCTION_VALIDATION_THRESHOLDS.maxRgbErrorByte,
        rawSamePixelMeanRgbErrorByte: PRODUCTION_VALIDATION_THRESHOLDS.meanRgbErrorByte,
        rawSamePixelPixelsOverFourByte: 1,
        rawSamePixelPixelsOverFourBytePercent:
            PRODUCTION_VALIDATION_THRESHOLDS.pixelsOverFourBytePercent,
        rawSamePixelMaxRgbErrorByte: PRODUCTION_VALIDATION_THRESHOLDS.maxRgbErrorByte,
        missingOccluderPixelCount: 0,
        seamErrorPixelCount: 1,
        seamFalseLitPixelCount: 0,
        maxContinuousSeamRunPixels: 1
    });
    assert.deepEqual(evaluateProductionCaseMetrics(passing), []);
    assert.deepEqual(evaluateProductionCaseMetrics({
        ...passing,
        meanRgbErrorByte: 0.351,
        pixelsOverFourByte: 2,
        pixelsOverFourBytePercent: 0.4,
        maxRgbErrorByte: 65,
        rawSamePixelMeanRgbErrorByte: 0.351,
        rawSamePixelPixelsOverFourByte: 2,
        rawSamePixelPixelsOverFourBytePercent: 0.4,
        rawSamePixelMaxRgbErrorByte: 65,
        missingOccluderPixelCount: 1,
        seamFalseLitPixelCount: 1,
        seamErrorPixelCount: 2,
        seamPixelCount: 2,
        maxContinuousSeamRunPixels: 2
    }), [
        'mean_rgb_error',
        'pixels_over_four',
        'maximum_rgb_error',
        'missing_occluder',
        'false_lit_seam',
        'continuous_seam'
    ]);
});

test('production metrics are exact own finite non-negative records with consistent counts', () => {
    const passing = makeMetrics();
    assert.equal(requireProductionMetricRecord(passing), passing);
    const withOutsidePixels = makeMetrics({outsideStaticReceiverPixelCount: 1});
    assert.equal(withOutsidePixels.eligibleStaticReceiverPixelCount, 3);
    assert.equal(requireProductionMetricRecord(withOutsidePixels), withOutsidePixels);
    assert.throws(
        () => evaluateProductionCaseMetrics({...passing, missingOccluderPixelCount: NaN}),
        /finite non-negative/
    );
    const missing = {...passing};
    delete missing.seamPixelCount;
    assert.throws(() => evaluateProductionCaseMetrics(missing), /must contain exactly/);
    assert.throws(
        () => evaluateProductionCaseMetrics({...passing, unexpected: 0}),
        /must contain exactly/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({...passing, pixelCount: 3}),
        /dimensions and pixelCount/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({...passing, pixelsOverFourBytePercent: 1}),
        /inconsistent with its count/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({
            ...passing,
            rawSamePixelPixelsOverFourBytePercent: 1
        }),
        /rawSamePixelPixelsOverFourBytePercent is inconsistent with its count/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({
            ...passing,
            maxRgbErrorByte: passing.rawSamePixelMaxRgbErrorByte + 1
        }),
        /aligned RGB metrics contradict raw same-pixel evidence/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({
            ...passing,
            seamErrorPixelCount: 1,
            maxContinuousSeamRunPixels: 0
        }),
        /contradictory seam evidence/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({
            ...passing,
            dynamicReceiverMaskedPixelCount: 1
        }),
        /exactly partition/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics({
            ...passing,
            dynamicReceiverMaskedPixelCount: 1,
            eligibleStaticReceiverPixelCount: 3,
            pixelsOverFourByte: 1,
            pixelsOverFourBytePercent: 25,
            rawSamePixelPixelsOverFourByte: 1,
            rawSamePixelPixelsOverFourBytePercent: 100 / 3
        }),
        /inconsistent with its count/
    );
    assert.throws(
        () => evaluateProductionCaseMetrics(makeMetrics({
            width: 1280,
            height: 720,
            pixelCount: 1280 * 720,
            eligibleStaticReceiverPixelCount: 1,
            outsideStaticReceiverPixelCount: 1280 * 720 - 1
        })),
        /static-receiver mask coverage collapsed/
    );
});

test('production dynamic receiver scope accepts only the disjoint bus root and rejects City targets', () => {
    const scene = makeObject3d(null);
    const city = makeObject3d(scene);
    const bus = makeObject3d(scene);
    const busReceiver = makeObject3d(bus, {isMesh: true});
    const cityReceiver = makeObject3d(city, {isMesh: true});

    assert.deepEqual(
        requireProductionDynamicReceiverRootScope(new Set([bus]), city, bus),
        {registeredDynamicRootCount: 1}
    );
    assert.equal(requireNonCityDynamicReceiverTarget(busReceiver, city), busReceiver);
    assert.throws(
        () => requireNonCityDynamicReceiverTarget(cityReceiver, city),
        /must not contain a static City mesh/
    );
    assert.throws(
        () => requireProductionDynamicReceiverRootScope(new Set([bus, scene]), city, bus),
        /exactly the bus anchor/
    );
    assert.throws(
        () => requireProductionDynamicReceiverRootScope(new Set([scene]), city, bus),
        /exactly the bus anchor/
    );

    bus.parent = city;
    assert.throws(
        () => requireProductionDynamicReceiverRootScope(new Set([bus]), city, bus),
        /disjoint from the static City/
    );
    bus.parent = scene;
    city.parent = bus;
    assert.throws(
        () => requireProductionDynamicReceiverRootScope(new Set([bus]), city, bus),
        /disjoint from the static City/
    );
});

test('production receiver masks form a binary disjoint partition with dynamic precedence', () => {
    const dynamicPixels = new Uint8Array([
        0, 0, 0, 255,
        0, 0, 0, 255,
        1, 0, 0, 255,
        0, 2, 0, 255
    ]);
    const staticPixels = new Uint8Array([
        0, 0, 0, 255,
        0, 0, 64, 255,
        0, 0, 0, 255,
        255, 255, 255, 255
    ]);
    const originalDynamic = new Uint8Array(dynamicPixels);
    const originalStatic = new Uint8Array(staticPixels);
    const partition = createProductionReceiverMaskPartition(
        {width: 4, height: 1, pixels: dynamicPixels},
        {width: 4, height: 1, pixels: staticPixels}
    );

    assert.equal(partition.dynamicReceiverMaskedPixelCount, 2);
    assert.equal(partition.eligibleStaticReceiverPixelCount, 1);
    assert.equal(partition.outsideStaticReceiverPixelCount, 1);
    assert.equal(partition.overlappingInputPixelCount, 1);
    assert.deepEqual([...partition.dynamicReceiverMask.pixels], [
        0, 0, 0, 255,
        0, 0, 0, 255,
        255, 255, 255, 255,
        255, 255, 255, 255
    ]);
    assert.deepEqual([...partition.staticCityReceiverMask.pixels], [
        0, 0, 0, 255,
        255, 255, 255, 255,
        0, 0, 0, 255,
        0, 0, 0, 255
    ]);
    assert.deepEqual(dynamicPixels, originalDynamic);
    assert.deepEqual(staticPixels, originalStatic);
    for (let offset = 0; offset < dynamicPixels.length; offset += 4) {
        assert.equal(
            partition.dynamicReceiverMask.pixels[offset] > 0
                && partition.staticCityReceiverMask.pixels[offset] > 0,
            false
        );
    }
    assert.throws(
        () => createProductionReceiverMaskPartition(
            {width: 4, height: 1, pixels: dynamicPixels},
            {width: 2, height: 2, pixels: staticPixels}
        ),
        /dimensions differ/
    );
});

test('production bus shadow proof uses signed luma darkening and rejects inverse brightening', () => {
    const darkerWithBus = new Uint8Array([40, 50, 60, 255]);
    const brighterWithoutBus = new Uint8Array([60, 70, 80, 255]);
    assert.ok(Math.abs(
        productionShadowLumaDarkeningByte(darkerWithBus, brighterWithoutBus, 0) - 20
    ) < 1e-12);
    assert.ok(Math.abs(
        productionShadowLumaDarkeningByte(brighterWithoutBus, darkerWithBus, 0) + 20
    ) < 1e-12);
    assert.deepEqual(evaluateProductionDynamicBusShadowProof(makeBusShadowProof()), []);
    assert.deepEqual(evaluateProductionDynamicBusShadowProof(makeBusShadowProof({
        affectedStaticCityReceiverPixelCount: 0,
        brightenedStaticCityReceiverPixelCount: 3,
        maximumLumaBrighteningByte: 18,
        maximumLumaDarkeningByte: 0
    })), ['dynamic_bus_shadow_brightening']);
});

test('production caster and aggregate tile-boundary evidence gates are fail-closed', () => {
    const current = {
        active: null,
        debugMode: 'final',
        casters: {
            active: false,
            staticMeshCount: 0,
            originalCasterCount: 0,
            suppressedCasterCount: 0,
            snapshotMeshCount: 0,
            restores: 0
        },
        runtime: {
            controller: {
                requestedMode: 'current',
                effectiveMode: 'current',
                state: 'unavailable',
                phase: 'disposed',
                reason: 'not_configured'
            }
        }
    };
    const pairedCurrent = makeDiagnostics('liveFinal', {
        active: false,
        staticMeshCount: 8,
        originalCasterCount: 6,
        suppressedCasterCount: 6,
        snapshotMeshCount: 0,
        restores: 3,
        lastReason: 'validation_live_final_shadow_retained'
    });
    const cache = makeDiagnostics('final', {
        active: true,
        staticMeshCount: 8,
        originalCasterCount: 6,
        suppressedCasterCount: 6,
        snapshotMeshCount: 8,
        restores: 2,
        lastReason: null
    });
    const comparison = makeDiagnostics('signedDifference', {
        active: false,
        staticMeshCount: 8,
        originalCasterCount: 6,
        suppressedCasterCount: 6,
        snapshotMeshCount: 0,
        restores: 3,
        lastReason: 'comparison_current_shadow_retained'
    });
    assert.deepEqual(evaluateProductionCasterTransition(current, cache, comparison), []);
    const currentWorkload = makeWorkload(3, 120);
    const cacheWorkload = makeWorkload(0, 0);
    const comparisonWorkload = makeWorkload(3, 120);
    assert.deepEqual(evaluateProductionShadowSubmission(
        currentWorkload,
        cacheWorkload,
        comparisonWorkload
    ), []);
    assert.deepEqual(evaluateProductionShadowSubmission(
        currentWorkload,
        makeWorkload(1, 24),
        comparisonWorkload
    ), ['static_casters_submitted_in_cache']);
    assert.deepEqual(evaluateProductionShadowSubmission(
        currentWorkload,
        cacheWorkload,
        makeWorkload(0, 0)
    ), ['comparison_static_shadow_submission_missing']);
    const busState = makeBusState();
    assert.deepEqual(evaluateProductionDynamicBusState(
        busState,
        busState,
        busState
    ), []);
    assert.deepEqual(evaluateProductionDynamicBusState(
        busState,
        {...busState, casterMeshCount: busState.casterMeshCount - 1},
        busState
    ), ['dynamic_bus_ownership_or_caster_state']);
    assert.deepEqual(
        evaluateProductionCasterTransition(
            current,
            {...cache, casters: {...cache.casters, suppressedCasterCount: 5}},
            comparison
        ),
        ['static_casters_not_suppressed']
    );
    assert.deepEqual(
        evaluateProductionCasterTransition(current, cache, {
            ...comparison,
            casters: {...comparison.casters, active: true}
        }),
        ['static_casters_not_restored_for_comparison']
    );
    assert.deepEqual(
        evaluateProductionCasterTransition(
            pairedCurrent,
            cache,
            comparison
        ),
        ['genuine_current_lifecycle_invalid']
    );
    assert.equal(createProductionTileBoundaryEvidence([
        {metrics: makeMetrics({seamPixelCount: 4})}
    ]).passed, true);
    assert.equal(createProductionTileBoundaryEvidence([
        {metrics: makeMetrics({seamPixelCount: 0})}
    ]).passed, false);
    const dynamicResult = {
        metrics: makeMetrics({dynamicReceiverMaskedPixelCount: 1}),
        workload: {cache: makeWorkload(0, 0)},
        dynamicBus: {shadowProof: makeBusShadowProof()}
    };
    assert.equal(createProductionDynamicBusEvidence([dynamicResult]).passed, true);
    assert.equal(createProductionDynamicBusEvidence([{
        ...dynamicResult,
        metrics: makeMetrics()
    }]).passed, false);
    assert.equal(createProductionDynamicBusEvidence([{
        ...dynamicResult,
        workload: {cache: makeWorkload(0, 0, 0, 0)}
    }]).passed, false);
    assert.equal(createProductionDynamicBusEvidence([{
        ...dynamicResult,
        dynamicBus: {shadowProof: makeBusShadowProof({
            affectedStaticCityReceiverPixelCount: 0,
            maximumLumaDarkeningByte: 0
        })}
    }]).passed, false);
    assert.equal(createProductionDynamicBusEvidence([{
        ...dynamicResult,
        dynamicBus: {shadowProof: makeBusShadowProof({
            affectedStaticCityReceiverPixelCount: 0,
            brightenedStaticCityReceiverPixelCount: 3,
            maximumLumaBrighteningByte: 18,
            maximumLumaDarkeningByte: 0
        })}
    }]).passed, false);
});

test('runner source owns production launch, genuine-current RGBA/PNG, workload, seam, and contamination contracts', async () => {
    const source = await readFile(
        'tools/static_sun_depth/validate_production.mjs',
        'utf8'
    );
    for (const pattern of [
        /tests\/headless\/e2e\/static_server\.mjs/,
        /chromiumApi\.launch/,
        /newPage\(\{viewport: \{width: 1280, height: 744\}\}\)/,
        /gameCanvas = page\.locator\('#game-canvas'\)/,
        /const gameCanvasBounds = await gameCanvas\.boundingBox\(\)/,
        /gameCanvasBounds\.width\s*!==\s*PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS\[0\]/,
        /gameCanvasBounds\.height\s*!==\s*PRODUCTION_VALIDATION_CAPTURE_DIMENSIONS_PIXELS\[1\]/,
        /Production validation game canvas must be exactly 1280x720 CSS pixels/,
        /\?pose=civic_center_curve_front&coreTests=0&visibilityMap=0/,
        /StaticSunDepthPipeline/,
        /setAtmosphereSettings/,
        /readPreparedLiveSourceShadowFilterIdentity/,
        /shadow\.updateMatrices\(light\)/,
        /shadow\.map\.width/,
        /renderer\.capabilities\.maxTextureSize/,
        /requireActiveFilterMatchesPreparedLiveOracle/,
        /sourceShadowFilterIdentityByProfile/,
        /ProductionTexelPhase/,
        /sourceCameraCenterWorld/,
        /sourceCameraBoundsMeters/,
        /sourceShadowTexelPhaseEvidenceByProfile/,
        /sourceShadowTexelPhaseEvidence/,
        /authenticatedPackagesByProfile/,
        /descriptorSha256: authenticatedPackage\.descriptorSha256/,
        /packageAggregateSha256: authenticatedPackage\.packageAggregateSha256/,
        /three-r183-single-high-effective-16384-v1/,
        /worldFilterRadiusMeters !== 0\.062255859375/,
        /getGameplayPosePreset/,
        /gl\.readPixels\(0, 0, width, height, gl\.RGBA, gl\.UNSIGNED_BYTE, pixels\)/,
        /indexedDB\.open\('ai531-production-validation-v1'/,
        /existing\?\.cachePixels/,
        /captureCurrent/,
        /capturePairedCurrent/,
        /captureCache/,
        /captureComparisonAndCompare/,
        /explicitExactPixelTarget/,
        /Capture the genuine current engine before cache activation/,
        /initializeProfilePage/,
        /Production validation environment changed between profile pages/,
        /A fresh page per sun profile prevents those validation-only mutations/,
        /setDebugMode\('liveFinal'\)/,
        /setDebugMode\('signedDifference'\)/,
        /current\.png/,
        /cache\.png/,
        /comparison\.png/,
        /dynamicReceiverMask\.png/,
        /staticCityReceiverMask\.png/,
        /captureReceiverMask/,
        /ProductionReceiverMaskPartition/,
        /ai531-production-receiver-mask-evidence/,
        /receiverMaskEvidenceCanvas\.getContext\(\s*'2d'/,
        /capture\.height - 1 - targetY/,
        /createProductionReceiverMaskPartition/,
        /pendingReceiverMaskEvidence/,
        /finishReceiverMaskEvidence/,
        /Production receiver-mask evidence canvas must be exactly/,
        /createValidationCaptureRecord/,
        /authenticateProductionValidationCaptureSet/,
        /PRODUCTION_MINIMUM_STATIC_RECEIVER_COVERAGE_RATIO/,
        /captureAuthentication/,
        /current_static_maps_retained_v1/,
        /renderer\.shadowMap\.render/,
        /staticCityShadow/,
        /dynamicBusShadow/,
        /function staticShadowState\(\)/,
        /function resetValidationTemporalHistory\(\)/,
        /function renderValidationFrame\(\)/,
        /setDirectRenderingForDiagnostics\(enabled\)/,
        /taaPass\?\.resetHistory\?\.\(\)/,
        /_invalidateGtaoCache\?\.\(\{resetFrameIndex: true\}\)/,
        /city\.sunFlare, city\.sunRays/,
        /indexedCasterMeshCount/,
        /cameraMatrixWorld/,
        /primarySun: describeShadowLight\(city\.sun\)/,
        /postProcessing: engine\._post\?\.pipeline\?\.getDebugInfo/,
        /captureVisibleReceiverIdentityMask/,
        /requireProductionDynamicReceiverRootScope/,
        /requireNonCityDynamicReceiverTarget/,
        /visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2/,
        /outsideStaticReceiverPixelCount/,
        /bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2/,
        /dynamic_bus_evidence_missing/,
        /missingOccluderPixelCount/,
        /seamFalseLitPixelCount/,
        /maxContinuousSeamRunPixels/,
        /static_casters_not_suppressed/,
        /tile_boundary_evidence_missing/,
        /browser_diagnostics/,
        /timingContamination/,
        /effectiveMode === 'baked'/,
        /production validation failed/
    ]) assert.match(source, pattern);
    const pairedCurrentStart = source.indexOf('async capturePairedCurrent');
    const pairedCurrentEnd = source.indexOf('async captureCache', pairedCurrentStart);
    const pairedCurrentSource = source.slice(pairedCurrentStart, pairedCurrentEnd);
    assert.ok(
        pairedCurrentSource.indexOf('applyCase(validationCase)')
            < pairedCurrentSource.indexOf("pipeline.setDebugMode('liveFinal')"),
        'paired live-current capture must position the target camera before restoring CSM caster ownership'
    );
    assert.equal(source.match(/await gameCanvas\.screenshot\(\{/g)?.length, 3);
    assert.equal(
        source.match(/await receiverMaskEvidenceCanvas\.screenshot\(\{/g)?.length,
        2
    );
    const receiverMaskCaptureSource = source.slice(
        source.indexOf('captureReceiverMask(validationCase, slot)'),
        source.indexOf('finishReceiverMaskEvidence(validationCase)')
    );
    assert.match(receiverMaskCaptureSource, /writeReceiverMaskEvidenceCanvas/);
    assert.doesNotMatch(receiverMaskCaptureSource, /captureDynamicReceiverMask/);
    assert.doesNotMatch(receiverMaskCaptureSource, /captureVisibleReceiverIdentityMask/);
    const comparisonSource = source.slice(
        source.indexOf('async captureComparisonAndCompare(validationCase, warmups)'),
        source.indexOf('async dispose()', source.indexOf(
            'async captureComparisonAndCompare(validationCase, warmups)'
        ))
    );
    assert.match(
        comparisonSource,
        /dynamicBusShadowProof\(\s*receiverMaskPartition\.dynamicReceiverMask,\s*receiverMaskPartition\.staticCityReceiverMask/
    );
    assert.match(
        comparisonSource,
        /compareRgba\(\s*current,\s*cache,\s*seam,\s*signedVisibility,\s*receiverMaskPartition\.dynamicReceiverMask,\s*receiverMaskPartition\.staticCityReceiverMask/
    );
    assert.doesNotMatch(source, /page\.locator\('#game-canvas'\)\.screenshot/);
    assert.doesNotMatch(source, /ILLUMINATION_LAB_VALIDATION_CASES/);
    assert.doesNotMatch(
        source,
        /const\s+dynamicBusShadowProof\s*=\s*dynamicBusShadowProof\s*\(/
    );
});

function makeIndex() {
    const profileIds = [...new Set(
        ILLUMINATION_VALIDATION_CASES
            .filter((entry) => entry.kind !== 'lab')
            .map((entry) => entry.sunProfile.id)
    )].sort();
    return {
        schema: PRODUCTION_VALIDATION_INDEX_SCHEMA,
        profiles: Object.fromEntries(profileIds.map((id) => [id, profileEntry(id)]))
    };
}

/** @param {string} lightingProfileId */
function profileEntry(lightingProfileId) {
    return {
        packagePath:
            `assets/baked_lighting/shadows/production/${lightingProfileId}/static_sun_depth.ilpkg`,
        liveIdentity: {
            alphaSemanticsSha256: HASH_A,
            casterInventorySha256: HASH_B,
            cityId: 'bigcity2',
            developmentCacheAllowed: true,
            lightingProfileId,
            resolvedSourceSha256: HASH_C,
            staticSunDepthSourceSha256: HASH_D
        }
    };
}

/** @param {number[]} [sunPointDirectionWorld] */
function makeProductionDescriptor(sunPointDirectionWorld = [0, 0, -1]) {
    const filterAxes = createThreeR183DirectionalShadowFilterAxes(
        sunPointDirectionWorld
    );
    return {
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
            compilerSignatureSha256: HASH_C,
            encoding: {
                emptyQuantized: 65535,
                greenChannel: 'quantized-low-byte-v1',
                id: 'rg8-packed-linear-depth-v1',
                maxDepthMeters: 10,
                maxQuantized: 65534,
                minDepthMeters: 0,
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
            contentSha256: HASH_D,
            coordinates: [0, 0],
            id: 'tile.0.0',
            interiorBoundsLightMeters: {
                max: [LIVE_TEXEL_PITCH_METERS * 2, LIVE_TEXEL_PITCH_METERS * 2],
                min: [0, 0]
            },
            storedTexels: [6, 6]
        }]
    };
}

function makeTwoLayerProductionDescriptor() {
    const descriptor = makeProductionDescriptor();
    descriptor.identity.layout.boundsLightMeters.max =
        [LIVE_TEXEL_PITCH_METERS * 2, LIVE_TEXEL_PITCH_METERS * 4];
    descriptor.identity.layout.tileCount = [1, 2];
    descriptor.tiles.push({
        contentSha256: HASH_C,
        coordinates: [0, 1],
        id: 'tile.0.1',
        interiorBoundsLightMeters: {
            max: [LIVE_TEXEL_PITCH_METERS * 2, LIVE_TEXEL_PITCH_METERS * 4],
            min: [0, LIVE_TEXEL_PITCH_METERS * 2]
        },
        storedTexels: [6, 6]
    });
    return descriptor;
}

async function makeVerifiedStaticSunPackage(descriptor, payload, useWindows) {
    const layerByteLength = 6 * 6 * 2;
    const assembledSha256 = await rawSha256Hex(payload);
    const requiredRuntimeCapabilities = [
        'fragment_highp_float',
        'rg8_unorm',
        'texture_2d_array',
        'webgl2'
    ];
    const makeDescriptor = async ({data, depth, id, offset, transform}) => {
        const sha256 = await rawSha256Hex(data);
        return {
            byteLength: data.byteLength,
            channelId: 'static_sun_depth',
            compression: 'none',
            coordinateTransform: transform,
            decodedByteLength: data.byteLength,
            decodedSha256: sha256,
            dimensions: {components: 2, depth, height: 6, width: 6},
            encoding: 'rg8_unorm',
            id,
            mipLevel: 0,
            offset,
            precision: 'unorm8',
            requiredRuntimeCapabilities,
            resourceType: 'texture_2d_array',
            rowOrigin: 'lower_left',
            sha256
        };
    };
    if (!useWindows) {
        return {
            chunks: [{
                data: payload.slice(),
                descriptor: await makeDescriptor({
                    data: payload,
                    depth: 2,
                    id: 'static_sun_depth.tiles.rg8',
                    offset: 0,
                    transform: descriptor
                })
            }],
            compatibility: {compatible: true}
        };
    }
    const chunks = [];
    for (let index = 0; index < 2; index += 1) {
        const data = payload.slice(index * layerByteLength, (index + 1) * layerByteLength);
        const id = `static_sun_depth.tiles.rg8.window.${String(index).padStart(5, '0')}`;
        chunks.push({
            data,
            descriptor: await makeDescriptor({
                data,
                depth: 1,
                id,
                offset: index * layerByteLength,
                transform: createStaticSunDepthLayerWindowEnvelope({
                    assembledByteLength: payload.byteLength,
                    assembledSha256,
                    firstLayer: index,
                    layerCount: 1,
                    outputDescriptor: descriptor
                })
            })
        });
    }
    return {chunks, compatibility: {compatible: true}};
}

function swapSamplingAxes(sampling) {
    const right = sampling.pcf.sourceMapRightAxisWorld;
    sampling.pcf.sourceMapRightAxisWorld = sampling.pcf.sourceMapUpAxisWorld;
    sampling.pcf.sourceMapUpAxisWorld = right;
}

function makeMetrics(overrides = {}) {
    const pixelsOverFourByte = overrides.pixelsOverFourByte ?? 0;
    const pixelCount = overrides.pixelCount ?? 4;
    const dynamicReceiverMaskedPixelCount =
        overrides.dynamicReceiverMaskedPixelCount ?? 0;
    const outsideStaticReceiverPixelCount =
        overrides.outsideStaticReceiverPixelCount ?? 0;
    const eligibleStaticReceiverPixelCount =
        overrides.eligibleStaticReceiverPixelCount
        ?? pixelCount - dynamicReceiverMaskedPixelCount - outsideStaticReceiverPixelCount;
    const maxRgbErrorByte = overrides.maxRgbErrorByte ?? 0;
    const meanRgbErrorByte = overrides.meanRgbErrorByte ?? 0;
    const rawSamePixelMaxRgbErrorByte =
        overrides.rawSamePixelMaxRgbErrorByte ?? maxRgbErrorByte;
    const rawSamePixelMeanRgbErrorByte =
        overrides.rawSamePixelMeanRgbErrorByte ?? meanRgbErrorByte;
    const rawSamePixelPixelsOverFourByte =
        overrides.rawSamePixelPixelsOverFourByte ?? pixelsOverFourByte;
    return {
        dynamicReceiverMaskedPixelCount,
        eligibleStaticReceiverPixelCount,
        falseLitMethod:
            'cache_luma_gt_eligible_current_3x3_max_plus_4_and_same_frame_cache_visibility_gt_live_v3',
        height: 2,
        maxContinuousSeamRunPixels: 0,
        maxRgbErrorByte,
        meanRgbErrorByte,
        missingOccluderPixelCount: 0,
        outsideStaticReceiverPixelCount,
        pixelCount,
        pixelsOverFourByte,
        pixelsOverFourBytePercent:
            pixelsOverFourByte / eligibleStaticReceiverPixelCount * 100,
        rawSamePixelMaxRgbErrorByte,
        rawSamePixelMeanRgbErrorByte,
        rawSamePixelPixelsOverFourByte,
        rawSamePixelPixelsOverFourBytePercent:
            rawSamePixelPixelsOverFourByte / eligibleStaticReceiverPixelCount * 100,
        rawSamePixelRgbErrorMethod: 'same_pixel_rgb_chebyshev_v1',
        rgbErrorMethod: 'nearest_eligible_current_3x3_rgb_chebyshev_v1',
        seamErrorPixelCount: 0,
        seamFalseLitPixelCount: 0,
        seamMaskMethod: 'static_sun_depth_seam_debug_red_gt_blue_plus_32_v1',
        seamPixelCount: 1,
        staticReceiverMaskMethod:
            'visible_static_city_receivers_excluding_registered_dynamic_receivers_depth_equality_v2',
        width: 2,
        ...overrides
    };
}

function makeDiagnostics(debugMode, casters) {
    return {
        active: {generation: 1},
        debugMode,
        casters,
        runtime: {controller: {
            effectiveMode: 'baked',
            phase: 'committed',
            reason: null,
            requestedMode: 'auto',
            state: 'active'
        }}
    };
}

function makeWorkload(calls, triangles, busCalls = 1, busTriangles = 48) {
    return {
        staticCityShadow: {calls, triangles, lines: 0, points: 0},
        dynamicBusShadow: {
            calls: busCalls,
            triangles: busTriangles,
            lines: 0,
            points: 0
        }
    };
}

function makeBusState(overrides = {}) {
    return {
        casterMeshCount: 8,
        meshCount: 10,
        method: 'registered_bus_anchor_outside_static_city_v1',
        receiverMeshCount: 9,
        registeredDynamicReceiver: true,
        registeredDynamicRootCount: 1,
        rootOutsideStaticCity: true,
        ...overrides
    };
}

function makeBusShadowProof(overrides = {}) {
    return {
        affectedStaticCityReceiverPixelCount: 3,
        brightenedStaticCityReceiverPixelCount: 0,
        busCasterMeshCount: 8,
        cityReceiverMaskMethod: 'visible_city_receiver_identity_depth_equality_v1',
        maximumLumaBrighteningByte: 0,
        maximumLumaDarkeningByte: 18,
        method:
            'bus_cast_shadow_enabled_luma_darker_than_disabled_over_visible_city_receivers_v2',
        restoredCasterMeshCount: 8,
        staticCityReceiverPixelCount: 500,
        ...overrides
    };
}

function makeObject3d(parent, properties = {}) {
    return {
        parent,
        traverse() {},
        ...properties
    };
}
