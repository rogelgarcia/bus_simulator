// Source-level guardrails for AI 532's generic hybrid-shadow integration.
// @ts-check

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(relativePath) {
    return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('dynamic layer is one generic shared interaction map with deterministic ownership', async () => {
    const layer = await source('../../../src/graphics/illumination/dynamic_sun_shadow/DynamicSunShadowLayer.js');
    assert.match(layer, /sharedInteractionMap: true/);
    assert.match(layer, /fitDynamicSunShadowProjection/);
    assert.match(layer, /source\.castShadow = suppressCurrentCasters/);
    assert.match(layer, /record\.source\.castShadow = record\.originalCastShadow/);
    assert.match(layer, /DynamicSunShadowProxy/);
    assert.match(layer, /customDepthMaterial must be a MeshDepthMaterial/);
    assert.match(layer, /transparent === true[\s\S]*opacity/);
    assert.doesNotMatch(layer, /Bus|bus/);
});

test('hybrid shader multiplies independent static and dynamic visibility using r183 depth packing', async () => {
    const staticFragment = await source('../../../src/graphics/shaders/materials/static_sun_depth.frag.glsl');
    const dynamicFragment = await source('../../../src/graphics/shaders/materials/dynamic_sun_shadow.frag.glsl');
    assert.match(
        staticFragment,
        /directLight\.color \*= staticSunDepthCacheVisibility;\s*dynamicSunShadowApplyDirectional/
    );
    assert.match(dynamicFragment, /directLight\.color \*= dynamicSunShadowVisibility/);
    assert.match(dynamicFragment, /255\.0 \/ 256\.0/);
    assert.match(dynamicFragment, /255\.0 \/ 65536\.0/);
    assert.match(dynamicFragment, /1\.0 \/ 16777216\.0/);
    assert.match(dynamicFragment, /staticVisibility \* sampleValue\.x/);
    assert.match(dynamicFragment, /for \( int y = -1; y <= 1; y \+\+ \)/);
});

test('pipeline and gameplay use the generic engine registration path', async () => {
    const adapter = await source('../../../src/graphics/illumination/static_sun_depth/StaticSunDepthMaterialAdapter.js');
    const pipeline = await source('../../../src/graphics/illumination/static_sun_depth/StaticSunDepthPipeline.js');
    const engine = await source('../../../src/app/core/GameEngine.js');
    const gameplay = await source('../../../src/states/GameplayState.js');
    assert.match(adapter, /prepareRoots\(roots, binding/);
    assert.match(pipeline, /registerDynamicShadowObject\(descriptor\)/);
    assert.match(pipeline, /this\._materials\.prepareRoots\(receiverRoots/);
    assert.match(pipeline, /dynamic_shadow_render_failed/);
    assert.match(engine, /registerDynamicIlluminationObject\(descriptor\)/);
    assert.match(engine, /_bindDynamicIlluminationObjects\(pipeline\)/);
    assert.match(gameplay, /registerDynamicIlluminationObject\?\.\(\{/);
    assert.match(gameplay, /id: `vehicle\.\$\{this\.vehicle\.id\}`/);
});
