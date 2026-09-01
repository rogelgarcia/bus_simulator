// Browser regression for replacing an active AI 531 Lab static-sun profile.
import test, {expect} from '@playwright/test';
import {
    ILLUMINATION_LAB_VALIDATION_CASES
} from '../../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import {
    LAB_VALIDATION_CAPABILITY_PROFILE_ID,
    LAB_VALIDATION_FIXTURE_SCHEMA,
    LAB_VALIDATION_PCF,
    LAB_VALIDATION_SAMPLING_BIAS,
    LAB_VALIDATION_THRESHOLDS
} from '../../../tools/static_sun_depth/validate_lab.mjs';

test('AI 531 Lab visibility programs move from azimuth 45 to 135 without retained uniforms', async ({
    page
}) => {
    test.setTimeout(240_000);
    const pageErrors = [];
    const localRequestFailures = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('requestfailed', (request) => {
        if (new URL(request.url()).origin === new URL(page.url()).origin) {
            localRequestFailures.push(
                `${request.url()} ${request.failure()?.errorText ?? ''}`
            );
        }
    });

    await page.goto('/debug_tools/lab_scene.html?coreTests=0');
    await page.waitForFunction(() => !!window.__labSceneValidation?.readiness);
    const readiness = await page.evaluate(() => window.__labSceneValidation.readiness);
    expect(readiness.ready).toBe(true);
    const validationEnvironment = await page.evaluate(
        async (settings) => {
            const runtime = await import(
                '/tools/static_sun_depth/browser/LabValidationRuntime.js'
            );
            return runtime.installLabValidationRuntime(settings);
        },
        {
            capabilityProfileId: LAB_VALIDATION_CAPABILITY_PROFILE_ID,
            fixtureSchema: LAB_VALIDATION_FIXTURE_SCHEMA,
            samplingPcf: LAB_VALIDATION_PCF,
            samplingBias: LAB_VALIDATION_SAMPLING_BIAS,
            thresholds: LAB_VALIDATION_THRESHOLDS
        }
    );

    const profile45 = ILLUMINATION_LAB_VALIDATION_CASES.find(
        (entry) => entry.sunProfile.id === 'ai527.sun.az045.el35'
    ).sunProfile;
    const profile135 = ILLUMINATION_LAB_VALIDATION_CASES.find(
        (entry) => entry.sunProfile.id === 'ai527.sun.az135.el08'
    ).sunProfile;
    const proofCase = {
        ...ILLUMINATION_LAB_VALIDATION_CASES[0],
        camera: {
            ...ILLUMINATION_LAB_VALIDATION_CASES[0].camera,
            presetId: 'overhang_receiver_fixture'
        }
    };
    const lifecycleCase = ILLUMINATION_LAB_VALIDATION_CASES.find(
        (entry) => entry.id === 'illum.lab.road_wall_default'
    );

    let result;
    try {
        result = await page.evaluate(async ({
            caseValue,
            firstProfile,
            lifecycleCaseValue,
            secondProfile
        }) => {
            const runtime = window.__ai531LabValidation;
            const firstCase = {...lifecycleCaseValue, sunProfile: firstProfile};
            const firstPrepared = await runtime.prepareProfile(firstProfile);
            await runtime.captureCurrent(firstCase, 1);
            const firstActivation = await runtime.activatePreparedProfile();
            if (!firstActivation.active) {
                throw new Error('First Lab profile did not activate');
            }
            const first = await runtime.captureVisibilityDebugProof({
                ...caseValue,
                sunProfile: firstProfile
            });
            await runtime.captureCache(firstCase, 1);
            await runtime.captureComparisonAndCompare(firstCase, 1);
            const fallback = await runtime.proveCurrentFallback();
            if (!fallback.passed) {
                throw new Error('First Lab profile fallback proof failed');
            }
            const secondPrepared = await runtime.prepareProfile(secondProfile);
            const secondActivation = await runtime.activatePreparedProfile();
            if (!secondActivation.active) {
                throw new Error('Second Lab profile did not activate');
            }
            const second = await runtime.captureVisibilityDebugProof({
                ...caseValue,
                sunProfile: secondProfile
            });
            return {
                first,
                second,
                samplingBiases: [firstPrepared.fixture, secondPrepared.fixture].map((fixture) => ({
                    model: fixture.biasModel,
                    constantDepthReliefMeters: fixture.constantDepthReliefMeters,
                    geometricNormalOffsetMeters: fixture.geometricNormalOffsetMeters
                })),
                samplingPcfs: [firstPrepared.fixture.pcf, secondPrepared.fixture.pcf],
                liveFilters: [
                    firstPrepared.fixture.liveDirectionalShadowFilter,
                    secondPrepared.fixture.liveDirectionalShadowFilter
                ]
            };
        }, {
            caseValue: proofCase,
            firstProfile: profile45,
            lifecycleCaseValue: lifecycleCase,
            secondProfile: profile135
        });
    } finally {
        await page.evaluate(() => window.__ai531LabValidation?.dispose());
    }

    expect(result.first.bindingDirection[0]).toBeGreaterThan(0);
    expect(result.first.bindingDirection[2]).toBeGreaterThan(0);
    expect(result.second.bindingDirection[0]).toBeLessThan(0);
    expect(result.second.bindingDirection[2]).toBeGreaterThan(0);
    for (const proof of [result.first, result.second]) {
        proof.citySunDirection.forEach((component, index) => {
            expect(component).toBeCloseTo(proof.bindingDirection[index], 12);
        });
        expect(proof.sampleCount).toBeGreaterThan(50);
    }
    expect(result.second.bindingVariantKey).not.toBe(result.first.bindingVariantKey);
    expect(result.second.litSampleCount - result.first.litSampleCount).toBeGreaterThan(50);
    expect(result.second.visibilitySampleSha256).not.toBe(
        result.first.visibilitySampleSha256
    );
    expect(result.samplingBiases).toEqual([
        LAB_VALIDATION_SAMPLING_BIAS,
        LAB_VALIDATION_SAMPLING_BIAS
    ]);
    const liveFilter = result.liveFilters[0];
    expect(result.liveFilters[1]).toEqual(liveFilter);
    expect(liveFilter).toMatchObject({
        effectiveMapSizeTexels: [
            Math.min(16384, validationEnvironment.rendererMaxTextureSize),
            Math.min(16384, validationEnvironment.rendererMaxTextureSize)
        ],
        radiusTexels: 1.5,
        requestedPresetMapSizeTexels: [16384, 16384],
        sizePolicy: 'derive-exact-live-single-high-v1',
        worldExtentMeters: [680, 680]
    });
    for (const pcf of result.samplingPcfs) {
        expect(pcf.shadowMapSizeTexels).toEqual(
            liveFilter.effectiveMapSizeTexels
        );
        expect(pcf.radiusTexels).toBe(1.5);
        expect(pcf.sampleCount).toBe(5);
    }
    expect(pageErrors).toEqual([]);
    expect(localRequestFailures).toEqual([]);
});
