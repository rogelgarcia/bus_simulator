// Verifies the bounded production-lattice native foliage depth pass.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    captureProductionAlphaCutoutNativeFieldTile,
    PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD,
    PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_SCHEMA
} from '../../../../tools/static_sun_depth/browser/ProductionAlphaCutoutNativeFieldCapture.js';
import {
    encodeLightDepthTile,
    parseAlphaCutoutNativeFieldArguments
} from '../../../../tools/static_sun_depth/capture_alpha_cutout_native_field.mjs';

const BROWSER_SOURCE_URL = new URL(
    '../../../../tools/static_sun_depth/browser/ProductionAlphaCutoutNativeFieldCapture.js',
    import.meta.url
);

test('native cutout field is bounded, isolated, Depth24, and state restoring', async () => {
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_SCHEMA,
        'ai531-production-alpha-cutout-native-field-session-v2'
    );
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD,
        'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2'
    );
    assert.throws(
        () => captureProductionAlphaCutoutNativeFieldTile({tileIndex: 0}),
        /no production native cutout field session/u
    );
    const source = await readFile(BROWSER_SOURCE_URL, 'utf8');
    assert.match(source, /new THREE\.Scene\(\)/);
    assert.match(source, /new THREE\.DepthTexture/);
    assert.match(source, /THREE\.UnsignedIntType/);
    assert.match(source, /MAXIMUM_TILE_TEXELS = 4_000_000/);
    assert.match(source, /captureNativeShadowDepthTexture/);
    assert.match(source, /createRuntimeTreeCasterId/);
    assert.match(source, /all-visible-material-groups-of-authenticated-cutout-meshes-v1/);
    assert.match(source, /createNativeFoliageDepthMaterial/);
    assert.match(source, /usesCutoutCoverage \? source\.map \?\? null : null/);
    assert.match(source, /restoreRendererState/);
    assert.match(source, /compareRendererState/);
    assert.doesNotMatch(source, /city\.group\.remove|source\.material\s*=/u);
});

test('native cutout field CLI contains outputs and parses a strict tile subset', () => {
    assert.throws(
        () => parseAlphaCutoutNativeFieldArguments([]),
        /output-root is required/u
    );
    const options = parseAlphaCutoutNativeFieldArguments([
        '--profile-id',
        'ai527.sun.az135.el08',
        '--output-root',
        'tests/artifacts/illumination_531/native_cutout_fields/probe',
        '--candidate-root',
        'tests/artifacts/illumination_531/native_cutout_fields/candidates',
        '--tiles',
        '0,2,7'
    ]);
    assert.deepEqual(options.tileIndices, [0, 2, 7]);
    assert.match(options.candidateRoot, /native_cutout_fields[\\/]candidates$/u);
    assert.match(options.outputRoot, /illumination_531[\\/]native_cutout_fields/u);
    assert.throws(
        () => parseAlphaCutoutNativeFieldArguments([
            '--output-root',
            'outside'
        ]),
        /must stay below illumination_531/u
    );
    assert.throws(
        () => parseAlphaCutoutNativeFieldArguments([
            '--output-root',
            'tests/artifacts/illumination_531/native_cutout_fields/probe',
            '--tiles',
            '2,2'
        ]),
        /strictly increasing and unique/u
    );
});

test('native cutout field converts linear depth and mirrors camera X into cache X', () => {
    const result = encodeLightDepthTile(
        Float32Array.of(0.25, 1),
        {
            cameraClipEndMeters: 3,
            cameraClipStartMeters: 1,
            cameraOriginDepthMeters: -1
        },
        {maxDepthMeters: 10, minDepthMeters: -10},
        [2, 1]
    );
    const view = new DataView(result.bytes.buffer);
    assert.equal(view.getFloat32(0, true), 0);
    assert.equal(view.getFloat32(4, true), 0.5);
    assert.equal(result.occupiedTexelCount, 1);
    assert.equal(result.transparentTexelCount, 1);
    assert.equal(result.minimumDepthMeters, 0.5);
    assert.equal(result.maximumDepthMeters, 0.5);
});
