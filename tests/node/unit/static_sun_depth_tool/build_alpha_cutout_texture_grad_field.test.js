// Verifies the fail-closed full-lattice candidate/native textureGrad builder contract.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    deriveLiveSourceToCacheLightAxisTransform,
    parseTextureGradFieldArguments,
    TEXTURE_GRAD_FIELD_METHOD,
    TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA
} from '../../../../tools/static_sun_depth/build_alpha_cutout_texture_grad_field.mjs';

const SOURCE_URL = new URL(
    '../../../../tools/static_sun_depth/build_alpha_cutout_texture_grad_field.mjs',
    import.meta.url
);

test('textureGrad field builder is bounded, artifact-confined, and unpromoted', async () => {
    assert.equal(
        TEXTURE_GRAD_FIELD_RECEIPT_SCHEMA,
        'ai531-production-alpha-cutout-native-field-receipt-v3'
    );
    assert.equal(
        TEXTURE_GRAD_FIELD_METHOD,
        'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3'
    );
    const options = parseTextureGradFieldArguments([
        '--profile-id',
        'ai527.sun.az135.el08',
        '--output-root',
        'tests/artifacts/illumination_531/native_cutout_fields/test-v3'
    ]);
    assert.match(options.executablePath, /blender-5\.2\.1-windows-x64[\\/]blender\.exe$/u);
    assert.equal(options.samplingMode, 'explicit-texture-grad');
    assert.match(options.inputPath, /ai531-production[\\/]bigcity2\.bsib$/u);
    const implicit = parseTextureGradFieldArguments([
        '--output-root',
        'tests/artifacts/illumination_531/native_cutout_fields/test-v4',
        '--sampling',
        'implicit-gradient'
    ]);
    assert.equal(implicit.samplingMode, 'implicit-gradient');
    const candidateOnly = parseTextureGradFieldArguments([
        '--output-root',
        'tests/artifacts/illumination_531/native_cutout_fields/candidate-only',
        '--candidate-only'
    ]);
    assert.equal(candidateOnly.candidateOnly, true);
    assert.throws(
        () => parseTextureGradFieldArguments([
            '--output-root',
            'tests/artifacts/outside'
        ]),
        /must stay below illumination_531/u
    );
    const source = await readFile(SOURCE_URL, 'utf8');
    assert.match(source, /MAXIMUM_CHUNK_RECORDS = 65_536/u);
    assert.match(source, /productionEligible: false/u);
    assert.match(source, /status: 'complete_unpromoted'/u);
    assert.match(source, /requestfailed/u);
    assert.match(source, /stateRestoration !== 'verified'/u);
    assert.match(source, /captureProductionAlphaCutoutTextureGradSamples/u);
    assert.match(source, /captureProductionAlphaCutoutImplicitGradientSamples/u);
    assert.match(source, /samplingMode === 'implicit-gradient'/u);
    assert.match(source, /descriptorBytes = candidate\.bytes/u);
    assert.match(source, /matrix\[0\] \* x \+ matrix\[3\] \* y/u);
    assert.match(source, /cacheDx\[0\].*liveSourceToCacheLightAxisTransform/su);
    assert.doesNotMatch(source, /productionEligible: true/u);
});

test('textureGrad field builder authenticates live-to-cache derivative axes', () => {
    const upAxis = [-1 / Math.sqrt(6), Math.sqrt(2 / 3), -1 / Math.sqrt(6)];
    const descriptor = {
        identity: {
            basis: {
                rightAxisWorld: [-Math.SQRT1_2, 0, Math.SQRT1_2],
                upAxisWorld: upAxis
            },
            sampling: {
                pcf: {
                    sourceMapRightAxisWorld: [Math.SQRT1_2, 0, -Math.SQRT1_2],
                    sourceMapUpAxisWorld: upAxis
                }
            }
        }
    };
    assert.deepEqual(
        deriveLiveSourceToCacheLightAxisTransform(descriptor),
        [[-1, 0], [0, 1]]
    );

    descriptor.identity.sampling.pcf.sourceMapRightAxisWorld = [0.5, 0, -0.5];
    assert.throws(
        () => deriveLiveSourceToCacheLightAxisTransform(descriptor),
        /signed permutation/u
    );
});
