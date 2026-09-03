// Verifies the native WebGL2 textureGrad alpha diagnostic remains bounded and state restoring.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
    captureProductionAlphaCutoutImplicitGradientSamples,
    captureProductionAlphaCutoutTextureGradSamples,
    PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_METHOD,
    PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_SCHEMA,
    PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_METHOD,
    PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_SCHEMA
} from '../../../../tools/static_sun_depth/browser/ProductionAlphaCutoutTextureGradCapture.js';

const SOURCE_URL = new URL(
    '../../../../tools/static_sun_depth/browser/ProductionAlphaCutoutTextureGradCapture.js',
    import.meta.url
);

test('native textureGrad capture rejects absent live WebGL2 authority', () => {
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_SCHEMA,
        'ai531-production-alpha-cutout-native-texture-grad-capture-v2'
    );
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_TEXTURE_GRAD_CAPTURE_METHOD,
        'live-three-native-texture-explicit-gradient-batched-rgba32f-readback-v2'
    );
    assert.throws(
        () => captureProductionAlphaCutoutTextureGradSamples({}),
        /WebGL2 renderer/u
    );
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_SCHEMA,
        'ai531-production-alpha-cutout-native-implicit-gradient-capture-v3'
    );
    assert.equal(
        PRODUCTION_ALPHA_CUTOUT_IMPLICIT_GRADIENT_CAPTURE_METHOD,
        'live-three-native-texture-implicit-gradient-instanced-2x2-rgba32f-readback-v3'
    );
    assert.throws(
        () => captureProductionAlphaCutoutImplicitGradientSamples({}),
        /WebGL2 renderer/u
    );
});

test('native textureGrad capture binds the live Three texture and restores exact GL state', async () => {
    const source = await readFile(SOURCE_URL, 'utf8');

    assert.match(source, /renderer\.properties\.get\(texture\)\?\.__webglTexture/);
    assert.match(source, /EXT_color_buffer_float/);
    assert.match(source, /gl\.RGBA32F/);
    assert.match(source, /textureGrad\(uTexture, uv, dx, dy\)/);
    assert.match(source, /texture\(uTexture, vUv\)/);
    assert.match(source, /gl\.drawArraysInstanced/);
    assert.match(source, /gl_InstanceID/);
    assert.match(source, /corner\.x \* 2\.0 - 0\.5/);
    assert.match(source, /implicitSampleTextureLayout/);
    assert.match(source, /gl\.RG32F/);
    assert.match(source, /texelFetch\(uUvTexture, texel, 0\)/);
    assert.match(source, /MAXIMUM_SAMPLE_COUNT = 262_144/);
    assert.match(source, /selectTextureUnits/);
    assert.match(source, /priorTextureUnits/);
    assert.match(source, /UNPACK_FLIP_Y_WEBGL/);
    assert.match(source, /UNPACK_PREMULTIPLY_ALPHA_WEBGL/);
    assert.match(source, /UNPACK_COLORSPACE_CONVERSION_WEBGL/);
    assert.match(source, /collectSingleCutoutTexture/);
    assert.match(source, /expectedCutoutCasterCount/);
    assert.match(source, /captureState\(gl\)/);
    assert.match(source, /restoreState\(gl, state, resources\)/);
    assert.match(source, /compareState\(state, captureState\(gl\)\)/);
    assert.match(source, /WEBGL_debug_renderer_info/);
});
