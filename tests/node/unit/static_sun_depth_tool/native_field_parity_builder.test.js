import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    parseNativeFieldParityArguments,
    sampleNativeField
} from '../../../../tools/static_sun_depth/build_alpha_cutout_native_field_parity.mjs';

test('native-field parity CLI is per-profile and artifact-contained', () => {
    const options = parseNativeFieldParityArguments([
        '--profile-id', 'ai527.sun.az135.el08',
        '--output-root',
        'tests/artifacts/illumination_531/alpha_parity_native_test/ai527.sun.az135.el08',
        '--production-root',
        'tests/artifacts/illumination_531/provisional_native_test',
        '--native-cutout-root',
        'tests/artifacts/illumination_531/native_cutout_fields/test',
        '--diagnostic'
    ]);
    assert.equal(options.profileId, 'ai527.sun.az135.el08');
    assert.match(options.outputRoot, /alpha_parity_native_test/u);
    assert.equal(options.diagnostic, true);
    assert.throws(
        () => parseNativeFieldParityArguments([
            '--output-root', '../escaped-native-parity'
        ]),
        /below illumination_531/u
    );
});

test('native-field parity samples exact global texels and converts signed depth', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai531-native-parity-'));
    try {
        const values = new Float32Array([0, 5, -2, 1]);
        const bytes = new Uint8Array(values.buffer);
        const outputPath = path.join(root, 'tile.f32le');
        await writeFile(outputPath, bytes);
        const field = {
            layout: {layout: {interiorPixels: [2, 2], tileCount: [1, 1]}},
            outputs: [{
                byteLength: bytes.byteLength,
                path: 'tile.f32le',
                sha256: createHash('sha256').update(bytes).digest('hex')
            }]
        };
        const sampled = await sampleNativeField({
            field,
            fieldRoot: root,
            samplePlan: {
                samples: [
                    {globalTexel: [0, 0]},
                    {globalTexel: [1, 0]},
                    {globalTexel: [0, 1]},
                    {globalTexel: [1, 1]}
                ]
            },
            sourceCameraOriginDepthMetersInCacheBasis: -10
        });
        assert.deepEqual([...sampled.occupancyBytes], [0, 1, 1, 1]);
        assert.deepEqual(
            [...new Float32Array(
                sampled.depthBytes.buffer,
                sampled.depthBytes.byteOffset,
                sampled.depthBytes.byteLength / 4
            )],
            [0, 15, 8, 11]
        );
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});
