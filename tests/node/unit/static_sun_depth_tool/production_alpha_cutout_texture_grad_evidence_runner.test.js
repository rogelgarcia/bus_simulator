// Verifies the reusable retained-candidate-to-native-textureGrad evidence runner.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    deriveNativeTextureGradComparison,
    parseAlphaCutoutTextureGradArguments
} from '../../../../tools/static_sun_depth/capture_alpha_cutout_texture_grad_evidence.mjs';

const RUNNER_URL = new URL(
    '../../../../tools/static_sun_depth/capture_alpha_cutout_texture_grad_evidence.mjs',
    import.meta.url
);
const CAPTURE_HELPER_URL = new URL(
    '../../../../tools/static_sun_depth/capture_alpha_cutout_evidence.mjs',
    import.meta.url
);

function float32Bytes(...values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return bytes;
}

test('native textureGrad evidence runner requires distinct illumination_531 artifact roots', () => {
    assert.throws(
        () => parseAlphaCutoutTextureGradArguments([]),
        /candidate-root and --output-root are required/u
    );
    assert.throws(
        () => parseAlphaCutoutTextureGradArguments([
            '--candidate-root',
            'tests/artifacts/illumination_531/candidate',
            '--output-root',
            'outside'
        ]),
        /must stay below illumination_531/u
    );
    assert.throws(
        () => parseAlphaCutoutTextureGradArguments([
            '--candidate-root',
            'tests/artifacts/illumination_531/shared',
            '--output-root',
            'tests/artifacts/illumination_531/shared'
        ]),
        /must differ/u
    );
    const options = parseAlphaCutoutTextureGradArguments([
        '--candidate-root',
        'tests/artifacts/illumination_531/candidate',
        '--output-root',
        'tests/artifacts/illumination_531/native'
    ]);
    assert.match(options.candidateRoot, /illumination_531[\\/]candidate$/u);
    assert.match(options.outputRoot, /illumination_531[\\/]native$/u);
});

test('native textureGrad comparison derives exact occupancy and first-hit depth parity', () => {
    const sampleRequest = {
        depthReference: {sourceCameraOriginDepthMetersInCacheBasis: 3},
        samples: [
            {globalTexel: [10, 20], index: 0},
            {globalTexel: [11, 20], index: 1}
        ]
    };
    const flattenedCandidates = [
        {
            candidate: {
                lightDepthMeters: 5,
                source: 'tree.near',
                sourceTriangleIndex: 7
            },
            sampleIndex: 0
        },
        {
            candidate: {
                lightDepthMeters: 7,
                source: 'tree.far',
                sourceTriangleIndex: 9
            },
            sampleIndex: 0
        },
        {
            candidate: {
                lightDepthMeters: 6,
                source: 'tree.empty',
                sourceTriangleIndex: 11
            },
            sampleIndex: 1
        }
    ];
    const comparison = deriveNativeTextureGradComparison({
        captureValues: [0.6, 0.4, 0.4],
        flattenedCandidates,
        liveDepthBytes: float32Bytes(2, 0),
        liveOccupancyBytes: Uint8Array.of(1, 0),
        sampleRequest
    });

    assert.equal(comparison.status, 'matched');
    assert.equal(comparison.sampleCount, 2);
    assert.equal(comparison.liveOccupiedSampleCount, 1);
    assert.equal(comparison.bakeOccupiedSampleCount, 1);
    assert.equal(comparison.commonOccupiedSampleCount, 1);
    assert.equal(comparison.occupancyMismatchCount, 0);
    assert.equal(comparison.depthMismatchCount, 0);
    assert.equal(comparison.mismatchCount, 0);
    assert.equal(comparison.maximumFirstHitDepthErrorMeters, 0);
});

test('native textureGrad evidence authenticates every executable producer layer', async () => {
    const [runnerSource, helperSource] = await Promise.all([
        readFile(RUNNER_URL, 'utf8'),
        readFile(CAPTURE_HELPER_URL, 'utf8')
    ]);
    assert.match(
        runnerSource,
        /sourceDescriptor\(captureHelperPath, captureHelperBytes\)/
    );
    assert.match(runnerSource, /sourceDescriptor\(runnerPath, runnerBytes\)/);
    assert.match(runnerSource, /\.\.\.capture/);
    assert.match(runnerSource, /MAXIMUM_CANDIDATE_COUNT = 262_144/);
    assert.match(runnerSource, /native-texture-grad-query-v1/);
    assert.match(runnerSource, /bindingSha256/);
    assert.match(runnerSource, /cutoutCasterIdsSha256/);
    assert.match(runnerSource, /sourceBsib/);
    assert.match(helperSource, /sha256\(producerBytes\)/);
    assert.match(helperSource, /return \{\.\.\.result, producer\}/);
});
