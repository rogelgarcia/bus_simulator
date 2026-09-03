// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT,
    PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID,
    aggregateProductionMismatchCasterSamples,
    selectProductionMismatchSamples
} from '../../../../tools/static_sun_depth/browser/ProductionMismatchLocalization.js';
import {
    createProductionMismatchLocalizationUsageText,
    parseProductionMismatchLocalizationArgs
} from '../../../../tools/static_sun_depth/localize_production_mismatch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

test('bounded production mismatch sample is deterministic and spatially stratified', () => {
    const candidates = [];
    for (let y = 0; y < 80; y += 1) {
        for (let x = 0; x < 80; x += 1) candidates.push({pixel: [x, y]});
    }
    const forward = selectProductionMismatchSamples(candidates, {
        width: 80,
        height: 80,
        sampleCount: PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT
    });
    const reverse = selectProductionMismatchSamples([...candidates].reverse(), {
        width: 80,
        height: 80,
        sampleCount: PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT
    });
    assert.equal(forward.length, 64);
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward.map((entry) => entry.sampleIndex),
        Array.from({length: 64}, (_, index) => index));
    const strata = new Set(forward.map((entry) => (
        `${Math.floor(entry.pixel[0] / 10)},${Math.floor(entry.pixel[1] / 10)}`
    )));
    assert.equal(strata.size, 64);
    assert.throws(() => selectProductionMismatchSamples(
        [{pixel: [1, 1]}, {pixel: [1, 1]}],
        {width: 8, height: 8, sampleCount: 2}
    ), /unique/);
});

test('caster aggregation separates foliage cutouts, opaque casters, and unresolved samples', () => {
    const samples = [
        {
            sampleIndex: 0,
            dominantAlphaEvaluatedCaster: {
                coverageMode: 'cutout',
                isFoliage: true,
                materialName: 'Tree Leaves',
                objectName: 'Tree Crown',
                objectPath: 'City/Trees/Tree Crown[0]'
            }
        },
        {
            sampleIndex: 1,
            dominantAlphaEvaluatedCaster: {
                coverageMode: 'cutout',
                isFoliage: true,
                materialName: 'Tree Leaves',
                objectName: 'Tree Crown',
                objectPath: 'City/Trees/Tree Crown[0]'
            }
        },
        {
            sampleIndex: 2,
            dominantAlphaEvaluatedCaster: {
                coverageMode: 'opaque',
                isFoliage: false,
                materialName: 'Concrete',
                objectName: 'Tower',
                objectPath: 'City/Buildings/Tower[4]'
            }
        },
        {sampleIndex: 3, dominantAlphaEvaluatedCaster: null}
    ];
    const aggregate = aggregateProductionMismatchCasterSamples(samples);
    assert.equal(aggregate.sampleCount, 4);
    assert.equal(aggregate.resolvedSampleCount, 3);
    assert.equal(aggregate.unresolvedSampleCount, 1);
    assert.equal(aggregate.foliageSampleCount, 2);
    assert.equal(aggregate.cutoutSampleCount, 2);
    assert.equal(aggregate.opaqueSampleCount, 1);
    assert.equal(aggregate.foliageOrCutoutSampleCount, 2);
    assert.equal(aggregate.topCasters[0].objectName, 'Tree Crown');
    assert.equal(aggregate.topCasters[0].count, 2);
});

test('mismatch-localization CLI remains one-case, artifact-only, and bounded', () => {
    assert.equal(
        PRODUCTION_MISMATCH_LOCALIZATION_TARGET_CASE_ID,
        'illum.game.low_sun_matrix.regional_dense.w.az135.el08'
    );
    assert.equal(PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT, 64);
    assert.deepEqual(parseProductionMismatchLocalizationArgs([
        '--source-report', 'source.json',
        '--output-root', 'tests/artifacts/screens/illumination_531/localize',
        '--warmup-frames', '3',
        '--sample-count', '8',
        '--current-source', 'preactivation',
        '--prelude-case-id', 'illum.profiler.r1c1.n',
        '--prelude-repeat', '4',
        '--direction', 'cache_darker',
        '--target-pixel', '31,404',
        '--metrics-only',
        '--direct-render',
        '--disable-gtao',
        '--enable-instanced-casters',
        '--disable-shadow-culling'
    ]), {
        sourceReportPath: 'source.json',
        outputRoot: 'tests/artifacts/screens/illumination_531/localize',
        warmupFrames: 3,
        sampleCount: 8,
        currentSource: 'preactivation',
        preludeCaseId: 'illum.profiler.r1c1.n',
        preludeRepeat: 4,
        direction: 'cache_darker',
        targetPixel: [31, 404],
        metricsOnly: true,
        directRender: true,
        disableGtao: true,
        enableInstancedCasters: true,
        disableShadowCulling: true
    });
    assert.match(createProductionMismatchLocalizationUsageText(), /localize_production_mismatch/);
    assert.throws(
        () => parseProductionMismatchLocalizationArgs(['--sample-count']),
        /requires a value/
    );
    assert.throws(
        () => parseProductionMismatchLocalizationArgs(['--target-pixel', '31']),
        /target pixel/
    );
});

test('mismatch localization defaults to the genuine pre-activation gameplay oracle', async () => {
    const source = await readFile(
        path.join(repoRoot, 'tools/static_sun_depth/localize_production_mismatch.mjs'),
        'utf8'
    );
    assert.match(source, /options\.currentSource \?\? 'preactivation'/);
    assert.match(source, /currentSource === 'paired-live-cache-first'/);
    assert.match(source, /currentSource === 'paired-live-cache-first'\s*\? null/);
    assert.match(source, /Capture the untouched cache first/);
    assert.match(source, /Mirror the production validator/);
    assert.match(source, /productionOrdering: currentSource === 'preactivation'/);
    assert.match(source, /production preactivation preludes cannot be repeated/);
    assert.match(source, /captureWorkloads/);
    assert.match(source, /staticShadowDiagnostics/);
    assert.match(source, /setDirectRenderingForDiagnostics/);
    assert.match(source, /setAmbientOcclusionSettings/);
    assert.match(source, /instancedCasters: true/);
    assert.match(source, /paddingMeters = 1_000_000/);
});

test('browser pass uses explicit caster IDs and live alpha sampling, never color depth inference', async () => {
    const [passSource, validatorSource, cliSource] = await Promise.all([
        readFile(path.join(
            repoRoot,
            'tools/static_sun_depth/browser/ProductionMismatchCasterIdPass.js'
        ), 'utf8'),
        readFile(path.join(repoRoot, 'tools/static_sun_depth/validate_production.mjs'), 'utf8'),
        readFile(path.join(
            repoRoot,
            'tools/static_sun_depth/localize_production_mismatch.mjs'
        ), 'utf8')
    ]);
    assert.match(passSource, /cropped-live-shadow-camera-rgba8-caster-id-alpha-sampler-v2/);
    assert.match(passSource, /resolveThreeR183ShadowAlphaTest/);
    assert.match(passSource, /resolveThreeR183ShadowSide/);
    assert.match(passSource, /map: source\.map \?\? null/);
    assert.match(passSource, /alphaMap: source\.alphaMap \?\? null/);
    assert.match(passSource, /renderer\.readRenderTargetPixels/);
    assert.match(passSource, /depthColorInferenceUsed: false/);
    assert.match(passSource, /captureNativeShadowDepthTextureSamples/);
    assert.match(passSource, /native-live-depth24-vs-resident-cache-rg8-vogel-taps-v1/);
    assert.match(passSource, /currentDepthMeters/);
    assert.match(passSource, /sourceDepthRangeMeters/);
    assert.match(passSource, /describeReceiverCasterMembership/);
    assert.match(passSource, /stableStaticSunCaster/);
    assert.match(passSource, /indexedByShadowCuller/);
    assert.match(passSource, /shadowMergeEntries/);
    assert.match(passSource, /status: 'unsupported'/);
    assert.match(passSource, /no_lit_triangle_receiver_with_vertex_normals/);
    assert.match(passSource, /depthTapParity: null/);
    assert.doesNotMatch(passSource, /packDepth|unpackRGBAToDepth/);
    assert.match(validatorSource, /collectMissingOccluderCandidates/);
    assert.match(validatorSource, /maximumRgbErrorPixel/);
    assert.match(validatorSource, /ai531-production-mismatch-localization-request-v1/);
    assert.match(cliSource, /productionEligible: false/);
    assert.match(cliSource, /promotable: false/);
    assert.match(cliSource, /PRODUCTION_MISMATCH_LOCALIZATION_SAMPLE_COUNT/);
});
