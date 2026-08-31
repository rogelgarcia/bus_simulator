// Verifies AI 531 graphics package binding, pinned shader anchors, and source-level integration invariants.
// @ts-check

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    assertStaticSunDepthPlanIdentity,
    assertStaticSunDepthTextureLayout,
    extractStaticSunDepthTileSetDescriptor,
    ILLUMINATION_COORDINATE_ENVELOPE_SCHEMA,
    requireStaticSunDepthPlanResource,
    validateStaticSunDepthUploadDescriptor
} from '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthPlanContract.js';
import {
    patchStaticSunDepthDirectionalChunk,
    STATIC_SUN_DEPTH_DIRECT_ANCHOR
} from '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthShaderContract.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeDescriptor() {
    return {
        schema: 'static-sun-depth-tile-set-v1',
        identity: {
            cityId: 'city.fixture',
            compilerSignatureSha256: HASH_A,
            channelSourceSha256: HASH_B,
            layout: {
                tileCount: [2, 2],
                interiorTexels: [4, 4]
            }
        },
        tiles: [{
            storedTexels: [6, 6]
        }]
    };
}

function makeResource(coordinateTransform = makeDescriptor()) {
    return {
        id: 'sun.depth.array',
        channelId: 'static_sun_depth',
        coordinateTransform,
        upload: {
            kind: 'texture_2d_array',
            encoding: 'rg8_unorm',
            width: 6,
            height: 6,
            layers: 4
        }
    };
}

function makePlan(resource = makeResource()) {
    return {
        identity: {
            cityId: 'city.fixture',
            compilerSignature: HASH_A,
            sourceHashes: {
                channels: {
                    static_sun_depth: HASH_B
                }
            }
        },
        resources: [resource]
    };
}

test('static-sun graphics accepts only the canonical descriptor nesting', () => {
    const direct = makeDescriptor();
    assert.strictEqual(extractStaticSunDepthTileSetDescriptor(makeResource(direct)), direct);

    const wrapped = {
        schema: ILLUMINATION_COORDINATE_ENVELOPE_SCHEMA,
        outputDescriptor: direct
    };
    assert.strictEqual(extractStaticSunDepthTileSetDescriptor(makeResource(wrapped)), direct);

    assert.throws(
        () => extractStaticSunDepthTileSetDescriptor(makeResource({ descriptor: direct })),
        /schema 'unknown' is unsupported/
    );
    assert.throws(
        () => extractStaticSunDepthTileSetDescriptor(makeResource({ ...wrapped, alias: direct })),
        /must contain exactly/
    );
    assert.throws(
        () => extractStaticSunDepthTileSetDescriptor(makeResource({
            schema: ILLUMINATION_COORDINATE_ENVELOPE_SCHEMA,
            outputDescriptor: { schema: 'ai529-depth-proof' }
        })),
        /not a V1 tile set/
    );
});

test('static-sun descriptor identity is bound to verified AI 530 provenance', () => {
    const descriptor = makeDescriptor();
    const plan = makePlan();
    assert.equal(assertStaticSunDepthPlanIdentity(plan, descriptor), true);

    for (const mutate of [
        (value) => { value.identity.cityId = 'other-city'; },
        (value) => { value.identity.compilerSignature = 'c'.repeat(64); },
        (value) => { value.identity.sourceHashes.channels.static_sun_depth = 'd'.repeat(64); }
    ]) {
        const mismatched = structuredClone(plan);
        mutate(mismatched);
        assert.throws(
            () => assertStaticSunDepthPlanIdentity(mismatched, descriptor),
            /does not match the verified package identity/
        );
    }
});

test('static-sun upload and descriptor layout account exact RG8 array bytes', () => {
    const resource = makeResource();
    const upload = validateStaticSunDepthUploadDescriptor(resource, {
        maxTextureSize: 8,
        maxArrayTextureLayers: 8
    });
    assert.deepEqual(upload, {
        kind: 'texture_2d_array',
        encoding: 'rg8_unorm',
        width: 6,
        height: 6,
        layers: 4,
        expectedBytes: 288
    });
    assert.strictEqual(requireStaticSunDepthPlanResource(makePlan(resource)), resource);
    assert.equal(assertStaticSunDepthTextureLayout(resource, makeDescriptor()), true);

    assert.throws(
        () => validateStaticSunDepthUploadDescriptor(resource, { maxTextureSize: 5 }),
        /MAX_TEXTURE_SIZE/
    );
    assert.throws(
        () => validateStaticSunDepthUploadDescriptor(resource, { maxArrayTextureLayers: 3 }),
        /MAX_ARRAY_TEXTURE_LAYERS/
    );
    assert.throws(
        () => requireStaticSunDepthPlanResource({ resources: [resource, resource] }),
        /exactly one/
    );
    const wrongLayers = structuredClone(resource);
    wrongLayers.upload.layers = 3;
    assert.throws(
        () => assertStaticSunDepthTextureLayout(wrongLayers, makeDescriptor()),
        /dimensions do not match/
    );
    const rectangular = makeDescriptor();
    rectangular.identity.layout.interiorTexels = [4, 2];
    assert.throws(
        () => assertStaticSunDepthTextureLayout(resource, rectangular),
        /requires square/
    );
});

test('pinned r183 stock and CSM directional variants patch every sun branch only', () => {
    const begin = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
    const end = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
    const stock = [
        'vec3 geometryNormal = normal;',
        begin,
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        end,
        'RECT_AREA_SENTINEL',
        '#if ( NUM_POINT_LIGHTS > 0 )',
        'POINT_SENTINEL'
    ].join('\n');
    const patchedStock = patchStaticSunDepthDirectionalChunk(stock, '183');
    assert.equal(patchedStock.replacements, 1);
    assert.equal(patchedStock.variant, 'stock');
    assert.match(patchedStock.source, /staticSunDepthApplyDirectional/);
    assert.match(patchedStock.source, /RECT_AREA_SENTINEL[\s\S]*POINT_SENTINEL/);

    const csm = [
        begin + ' && ! defined( USE_CSM )',
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        '#endif',
        begin + ' && defined( USE_CSM ) && defined( CSM_CASCADES )',
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        '#else // non-fade CSM',
        'if ( csmRange ) ' + STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        '#elif ( NUM_DIR_LIGHT_SHADOWS > 0 ) // single-light fallback',
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        '#endif',
        '#if ( NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS )',
        STATIC_SUN_DEPTH_DIRECT_ANCHOR,
        '#endif',
        end
    ].join('\n');
    const patchedCsm = patchStaticSunDepthDirectionalChunk(csm, 183);
    assert.equal(patchedCsm.replacements, 5);
    assert.equal(patchedCsm.variant, 'csm');
    assert.equal(
        patchedCsm.source.split('staticSunDepthApplyDirectional').length - 1,
        5
    );
    assert.match(patchedCsm.source, /if \( csmRange \) \{\s*staticSunDepthApplyDirectional/);

    assert.throws(() => patchStaticSunDepthDirectionalChunk(stock, '184'), /Unsupported Three revision/);
    assert.throws(
        () => patchStaticSunDepthDirectionalChunk(stock.replace(end, '#if ( NUM_POINT_LIGHTS > 0 )'), '183'),
        /boundaries do not match/
    );
    assert.throws(
        () => patchStaticSunDepthDirectionalChunk(csm.replace(STATIC_SUN_DEPTH_DIRECT_ANCHOR, ''), '183'),
        /pinned CSM variant/
    );
});

test('graphics source keeps registry updates stable, current exact, and prewarm awaited', async () => {
    const adapter = await readFile(new URL(
        '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthMaterialAdapter.js',
        import.meta.url
    ), 'utf8');
    const pipeline = await readFile(new URL(
        '../../../src/graphics/illumination/static_sun_depth/StaticSunDepthPipeline.js',
        import.meta.url
    ), 'utf8');
    const resources = await readFile(new URL(
        '../../../src/graphics/illumination/static_sun_depth/ThreeStaticSunDepthResources.js',
        import.meta.url
    ), 'utf8');

    assert.match(adapter, /#include <project_vertex>\\nstaticSunDepthTransferWorldPosition/);
    assert.doesNotMatch(adapter, /#include <begin_vertex>\\nstaticSunDepthTransferWorldPosition/);
    assert.match(adapter, /state = \{ binding \}/);
    assert.doesNotMatch(adapter, /handle\.update\(\{[^\n]*apply/);
    assert.doesNotMatch(adapter, /material\.needsUpdate/);

    assert.match(pipeline, /await this\._prewarmMaterialVariants\(binding\)/);
    assert.match(pipeline, /await this\.renderer\.compileAsync\(scene, camera\)/);
    assert.match(pipeline, /createShaderDiagnosticGuard\(this\.renderer\)/);
    assert.match(pipeline, /shaderDiagnostics\.assertNoFailure\(\)/);
    assert.match(pipeline, /validateOwnedStaticSunDepthTileArrayIntegrity/);
    assert.match(pipeline, /this\._materials\.verifyOwnership\(\)/);
    assert.match(pipeline, /addEventListener\?\.\('webglcontextlost'/);
    assert.match(pipeline, /removeEventListener\?\.\('webglcontextlost'/);
    assert.match(pipeline, /static_receiver_sampling_v1: true/);
    assert.match(
        pipeline,
        /try \{\s*this\._materials\.dispose\(\);\s*\} catch \(error\) \{\s*firstError \?\?= error;\s*\}\s*this\._materials = new StaticSunDepthMaterialSet\(\)/
    );
    assert.match(pipeline, /city !== active\.city/);
    assert.match(resources, /new THREE\.DataArrayTexture\(pixels, upload\.width, upload\.height, upload\.layers\)/);
    assert.match(resources, /const pixels = source\.slice\(\)/);
    assert.match(resources, /texture\.image\.data = verifiedPixels;\s*renderer\.initTexture\(texture\)/);
    assert.match(resources, /cpuBytes: expectedByteLength,\s*gpuBytes: expectedByteLength/);
});
