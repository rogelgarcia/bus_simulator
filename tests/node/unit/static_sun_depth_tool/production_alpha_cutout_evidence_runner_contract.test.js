// Verifies the bounded real-game-to-headless-Blender cutout evidence runner.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    alphaCutoutEvidenceUsage,
    captureLiveTextureGradEvidence,
    compareAlphaCutoutEvidenceStreams,
    deriveAlphaCutoutParityEvidenceStreams,
    parseAlphaCutoutEvidenceArguments
} from '../../../../tools/static_sun_depth/capture_alpha_cutout_evidence.mjs';

test('alpha-cutout evidence runner defaults to pinned headless Blender and a diagnostic artifact child', () => {
    const options = parseAlphaCutoutEvidenceArguments([]);
    assert.equal(options.profileId, 'ai527.sun.az135.el08');
    assert.match(options.executablePath, /blender-5\.2\.1-windows-x64[\\/]blender\.exe$/u);
    assert.match(options.producerPath, /production_alpha_cutout_sparse_samples\.py$/u);
    assert.match(options.silhouetteCompilerPath, /compile_cutout_silhouettes\.py$/u);
    assert.match(options.outputRoot, /illumination_531[\\/]alpha_diagnostics[\\/]/u);
    assert.equal(options.timeoutMs, 3_600_000);
    assert.equal(options.coverageMode, 'source');
    assert.match(alphaCutoutEvidenceUsage(), /headless Blender timeout/iu);
    assert.match(alphaCutoutEvidenceUsage(), /source-no-flipy-diagnostic/iu);
    assert.match(alphaCutoutEvidenceUsage(), /deterministic-silhouette-diagnostic/iu);
    assert.equal(typeof captureLiveTextureGradEvidence, 'function');
});

test('alpha-cutout evidence comparison derives occupancy and fixed-5mm depth mismatches from bytes', () => {
    const floats = (...values) => {
        const bytes = new Uint8Array(values.length * 4);
        const view = new DataView(bytes.buffer);
        values.forEach((value, index) => view.setFloat32(index * 4, value, true));
        return bytes;
    };
    const result = compareAlphaCutoutEvidenceStreams({
        bakeDepthBytes: floats(2, 0, 4.01),
        bakeOccupancyBytes: Uint8Array.of(1, 0, 1),
        liveDepthBytes: floats(2.004, 3, 4),
        liveOccupancyBytes: Uint8Array.of(1, 1, 1),
        samplePlan: {
            samples: [0, 1, 2].map((index) => ({
                casterId: `caster.${index}`,
                globalTexel: [index, 0],
                index
            }))
        }
    });
    assert.equal(result.status, 'mismatched');
    assert.equal(result.occupancyMismatchCount, 1);
    assert.equal(result.depthMismatchCount, 1);
    assert.equal(result.commonOccupiedSampleCount, 2);
    assert.ok(result.maximumFirstHitDepthErrorMeters > 0.009);
    assert.equal(result.mismatchCount, 2);

    const evidence = deriveAlphaCutoutParityEvidenceStreams({
        bakeDepthBytes: floats(2, 0, 4.01),
        bakeOccupancyBytes: Uint8Array.of(1, 0, 1),
        liveDepthBytes: floats(2.004, 3, 4),
        liveOccupancyBytes: Uint8Array.of(1, 1, 1)
    });
    assert.deepEqual([...evidence.comparisonBytes], [1, 2, 4]);
    assert.equal(evidence.bakeFirstHitDepthBytes.byteLength, 8);
    assert.equal(evidence.liveFirstHitDepthBytes.byteLength, 8);
    const bakeDepth = new DataView(
        evidence.bakeFirstHitDepthBytes.buffer,
        evidence.bakeFirstHitDepthBytes.byteOffset,
        evidence.bakeFirstHitDepthBytes.byteLength
    );
    const liveDepth = new DataView(
        evidence.liveFirstHitDepthBytes.buffer,
        evidence.liveFirstHitDepthBytes.byteOffset,
        evidence.liveFirstHitDepthBytes.byteLength
    );
    assert.equal(bakeDepth.getFloat32(0, true), 2);
    assert.ok(bakeDepth.getFloat32(4, true) > 4.009);
    assert.ok(liveDepth.getFloat32(0, true) > 2.003);
    assert.equal(liveDepth.getFloat32(4, true), 4);
});

test('alpha-cutout evidence runner rejects unsupported profiles and non-artifact outputs', () => {
    assert.throws(
        () => parseAlphaCutoutEvidenceArguments(['--profile-id', 'not-a-profile']),
        /Invalid AI531 lighting profile ID/u
    );
    assert.throws(
        () => parseAlphaCutoutEvidenceArguments(['--output-root', 'outside']),
        /must stay below/u
    );
    assert.throws(
        () => parseAlphaCutoutEvidenceArguments(['--url', 'https://example.com']),
        /loopback/u
    );
    const resumed = parseAlphaCutoutEvidenceArguments([
        '--live-root',
        'tests/artifacts/illumination_531/alpha_diagnostics/prior'
    ]);
    assert.match(resumed.liveRoot, /illumination_531[\\/]alpha_diagnostics[\\/]prior$/u);
    const forcedOpaque = parseAlphaCutoutEvidenceArguments([
        '--coverage-mode',
        'force-opaque-diagnostic'
    ]);
    assert.equal(forcedOpaque.coverageMode, 'force-opaque-diagnostic');
    const noFlipY = parseAlphaCutoutEvidenceArguments([
        '--coverage-mode',
        'source-no-flipy-diagnostic'
    ]);
    assert.equal(noFlipY.coverageMode, 'source-no-flipy-diagnostic');
    const deterministicSilhouette = parseAlphaCutoutEvidenceArguments([
        '--coverage-mode',
        'deterministic-silhouette-diagnostic'
    ]);
    assert.equal(
        deterministicSilhouette.coverageMode,
        'deterministic-silhouette-diagnostic'
    );
    assert.throws(
        () => parseAlphaCutoutEvidenceArguments(['--coverage-mode', 'forged']),
        /coverage mode/iu
    );
});
