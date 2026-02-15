// Node unit tests: AO alpha-cutout helper behavior.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyAoAlphaHandlingToMaterial,
    primeAoOverrideMaterial,
    resolveAoOverrideMaterial,
    shouldApplyAoAlphaCutout
} from '../../../src/graphics/visuals/postprocessing/AoAlphaCutoutSupport.js';

function makeTexture(tag = 'tex') {
    return { isTexture: true, tag };
}

function makeMaterial(partial = {}) {
    return {
        isMaterial: true,
        alphaTest: 0,
        transparent: false,
        depthWrite: true,
        opacity: 1,
        map: null,
        alphaMap: null,
        userData: {},
        needsUpdate: false,
        ...partial
    };
}

test('AoAlphaCutoutSupport: tagged foliage with alpha texture is treated as cutout candidate', () => {
    const src = makeMaterial({
        map: makeTexture('leaf'),
        userData: { isFoliage: true }
    });
    assert.equal(shouldApplyAoAlphaCutout(src, null), true);
});

test('AoAlphaCutoutSupport: transparent alpha-card without explicit alphaTest is treated as cutout candidate', () => {
    const src = makeMaterial({
        map: makeTexture('card'),
        transparent: true,
        depthWrite: false,
        alphaTest: 0
    });
    assert.equal(shouldApplyAoAlphaCutout(src, null), true);
});

test('AoAlphaCutoutSupport: opaque material with no alpha-test intent is not treated as cutout candidate', () => {
    const src = makeMaterial({
        map: makeTexture('opaque'),
        transparent: false,
        depthWrite: true,
        alphaTest: 0
    });
    assert.equal(shouldApplyAoAlphaCutout(src, null), false);
});

test('AoAlphaCutoutSupport: resolveAoOverrideMaterial falls back to active scene override material', () => {
    const drawMaterial = makeMaterial({ name: 'scene_mat' });
    const sceneOverride = makeMaterial({ name: 'ao_override' });
    const overrideMaterials = new Set([sceneOverride]);
    const resolved = resolveAoOverrideMaterial({
        drawMaterial,
        sceneOverrideMaterial: sceneOverride,
        overrideMaterials
    });
    assert.equal(resolved, sceneOverride);
});

test('AoAlphaCutoutSupport: primeAoOverrideMaterial enables alpha-texture path on override material', () => {
    const override = makeMaterial({
        map: undefined,
        alphaMap: undefined,
        alphaTest: 0,
        transparent: true,
        depthWrite: false
    });
    const white = makeTexture('white');
    primeAoOverrideMaterial(override, white);

    assert.equal(override.transparent, false);
    assert.equal(override.depthWrite, true);
    assert.equal(override.alphaTest, 0.0001);
    assert.equal(override.map, white);
    assert.equal(override.alphaMap, white);
    assert.equal(override.needsUpdate, true);
});

test('AoAlphaCutoutSupport: alpha_test mode uses source cutout textures and threshold', () => {
    const white = makeTexture('white');
    const sourceMap = makeTexture('leaf_map');
    const sourceAlphaMap = makeTexture('leaf_alpha');
    const src = makeMaterial({
        map: sourceMap,
        alphaMap: sourceAlphaMap,
        transparent: true,
        depthWrite: false,
        alphaTest: 0
    });
    const override = makeMaterial({ map: white, alphaMap: white, alphaTest: 0.0001 });

    applyAoAlphaHandlingToMaterial({
        overrideMaterial: override,
        sourceMaterial: src,
        object: null,
        handling: 'alpha_test',
        threshold: 0.42,
        whiteTexture: white
    });

    assert.equal(override.map, sourceMap);
    assert.equal(override.alphaMap, sourceAlphaMap);
    assert.equal(override.alphaTest, 0.42);
});

test('AoAlphaCutoutSupport: exclude mode removes cutout caster contribution', () => {
    const white = makeTexture('white');
    const src = makeMaterial({
        map: makeTexture('leaf'),
        transparent: true,
        depthWrite: false
    });
    const override = makeMaterial({ map: white, alphaMap: white, alphaTest: 0.0001 });

    applyAoAlphaHandlingToMaterial({
        overrideMaterial: override,
        sourceMaterial: src,
        object: null,
        handling: 'exclude',
        threshold: 0.5,
        whiteTexture: white
    });

    assert.equal(override.map, white);
    assert.equal(override.alphaMap, white);
    assert.equal(override.alphaTest, 1.1);
});

