// Verifies evaluated material alpha semantics and exact typed texture coverage extraction.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBakeMaterialCatalog } from '../../../src/graphics/illumination/bake_source/BakeSourceMaterials.js';
import { createBakeTextureCatalog } from '../../../src/graphics/illumination/bake_source/BakeSourceTextures.js';
import { registerMaterialShaderHook } from '../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';

function typedTexture() {
    const source = {
        width: 2,
        height: 1,
        data: new Uint8Array([
            10, 20, 30, 0,
            40, 200, 60, 255
        ])
    };
    return {
        isTexture: true,
        name: 'AlphaFixtureTexture',
        source: { data: source },
        image: source,
        format: 1023,
        type: 1009,
        internalFormat: null,
        mapping: 300,
        channel: 0,
        wrapS: 1000,
        wrapT: 1000,
        magFilter: 1006,
        minFilter: 1008,
        generateMipmaps: true,
        anisotropy: 1,
        flipY: false,
        premultiplyAlpha: false,
        unpackAlignment: 4,
        colorSpace: 'srgb',
        offset: { x: 0, y: 0 },
        repeat: { x: 1, y: 1 },
        center: { x: 0, y: 0 },
        rotation: 0,
        matrixAutoUpdate: true
    };
}

test('parallel texture capture preserves exact catalog identity and shared-source deduplication', async () => {
    const texture = typedTexture();
    const textures = [texture, { ...texture, repeat: { x: 2, y: 3 } }, typedTexture(), typedTexture()];
    textures[2].source.data.data[0] = 90;
    const sequential = await createBakeTextureCatalog(textures);
    const parallel = await createBakeTextureCatalog(textures, { concurrency: 4 });
    assert.deepEqual(parallel.sources, sequential.sources);
    assert.deepEqual(parallel.bindings, sequential.bindings);
    assert.deepEqual(parallel.buffers, sequential.buffers);
    assert.deepEqual(parallel.coverageBuffers, sequential.coverageBuffers);
    assert.equal(parallel.sources.length, 2);
    await assert.rejects(createBakeTextureCatalog(textures, { concurrency: 10 }), /concurrency/);
});

function fixtureRoot(material) {
    const mesh = {
        isMesh: true,
        type: 'Mesh',
        name: 'AlphaFixtureMesh',
        visible: true,
        geometry: {
            attributes: { position: { count: 3 } },
            index: null,
            groups: [],
            drawRange: { start: 0, count: 3 }
        },
        material,
        userData: {},
        children: []
    };
    const root = {
        type: 'Group',
        name: 'AlphaFixtureRoot',
        visible: true,
        children: [mesh],
        traverse(visitor) {
            visitor(this);
            visitor(mesh);
        }
    };
    mesh.parent = root;
    return { id: 'building:alpha-fixture', category: 'buildings', root };
}

test('texture capture shares image reads but preserves independent sampling and rejects unsupported clones', async (t) => {
    const texture = typedTexture();
    texture.image.src = 'http://texture-fixture.invalid/shared.png';
    let reads = 0;
    t.mock.method(globalThis, 'fetch', async () => { reads++; return new Response(new Uint8Array([1, 2, 3])); });
    const clone = { ...texture, offset: { x: 0.25, y: 0.5 } };
    const result = await createBakeTextureCatalog([texture, clone]);
    assert.equal(reads, 1);
    assert.equal(result.sources.length, 1);
    assert.equal(result.bindings.length, 2);
    assert.notEqual(result.bindingByTexture.get(texture).id, result.bindingByTexture.get(clone).id);
    await assert.rejects(createBakeTextureCatalog([texture, { ...clone, isCompressedTexture: true }]), /unsupported/i);
    await assert.rejects(createBakeTextureCatalog([{ ...texture, format: null }, { ...clone, format: NaN }]), /finite/i);
    const changed = await createBakeTextureCatalog([texture, { ...clone, format: 1022 }]);
    assert.equal(changed.sources.length, 2);
});

test('texture snapshots are fresh per validation and cancellation stops further texture work', async () => {
    const texture = typedTexture();
    const before = await createBakeTextureCatalog([texture]);
    texture.image.data[0] = 90;
    const after = await createBakeTextureCatalog([texture]);
    assert.notEqual(before.sources[0].id, after.sources[0].id);
    const abort = new AbortController();
    await assert.rejects(createBakeTextureCatalog([texture, { ...texture }], {
        signal: abort.signal, onProgress: () => abort.abort(new Error('cancel fixture'))
    }), /cancel fixture/);
});

test('material export ignores runtime illumination wrappers while retaining unknown authored shader exclusions', async () => {
    const { overrideMaterialShadowSide, restoreMaterialShadowSide } = await import('../../../src/graphics/lighting/MaterialShadowSideState.js');
    const material = { isMaterial: true, isMeshStandardMaterial: true, type: 'MeshStandardMaterial', name: 'Receiver',
        visible: true, opacity: 1, alphaTest: 0, transmission: 0, side: 0, userData: {} };
    const roots = [fixtureRoot(material)];
    const original = (await createBakeMaterialCatalog(roots)).materials;
    const runtime = registerMaterialShaderHook(material, { id: 'illumination.static_sun_depth', apply() {} });
    assert.deepEqual((await createBakeMaterialCatalog(roots)).materials, original);
    overrideMaterialShadowSide(material, 2);
    assert.equal(material.shadowSide, 2);
    assert.deepEqual((await createBakeMaterialCatalog(roots)).materials, original);
    restoreMaterialShadowSide(material);
    assert.equal(material.shadowSide, null);
    const cascades = registerMaterialShaderHook(material, { id: 'city.cascaded_shadows', apply() {} });
    material.defines = { USE_CSM: 1, CSM_CASCADES: 4, CSM_FADE: '' };
    assert.deepEqual((await createBakeMaterialCatalog(roots)).materials, original);
    const authored = registerMaterialShaderHook(material, { id: 'unknown.authored_effect', apply() {} });
    assert.equal((await createBakeMaterialCatalog(roots)).materials[0].channelSupport.indirect_irradiance.supported, false);
    authored.remove(); runtime.remove(); cascades.remove();
});

test('material catalog preserves map-alpha and alphaMap-green exact coverage channels', async () => {
    const texture = typedTexture();
    const material = {
        isMaterial: true,
        isMeshStandardMaterial: true,
        type: 'MeshStandardMaterial',
        name: 'AlphaFixtureMaterial',
        visible: true,
        opacity: 1,
        alphaTest: 0.5,
        alphaToCoverage: true,
        transparent: false,
        blending: 1,
        transmission: 0,
        side: 0,
        shadowSide: null,
        vertexColors: false,
        map: texture,
        alphaMap: texture,
        userData: {}
    };

    const catalog = await createBakeMaterialCatalog([fixtureRoot(material)]);
    assert.equal(catalog.materials.length, 1);
    assert.equal(catalog.textures.sources.length, 1);
    assert.equal(catalog.textures.bindings.length, 1);

    const record = catalog.materials[0];
    assert.equal(record.alpha.mode, 'cutout');
    assert.equal(record.alpha.alphaTest, 0.5);
    assert.equal(record.alpha.alphaToCoverage, true);
    assert.deepEqual(record.alpha.inputs.map(({ channel, operation }) => ({ channel, operation })), [
        { channel: 'a', operation: 'multiply' },
        { channel: 'g', operation: 'multiply' }
    ]);
    assert.equal(record.alpha.inputs[0].bindingId, record.alpha.inputs[1].bindingId);

    const source = catalog.textures.sources[0];
    assert.equal(source.width, 2);
    assert.equal(source.height, 1);
    assert.equal(source.storage, 'raw_typed_pixels');
    assert.equal(source.componentType, 'uint8');
    assert.equal(source.coverageChannels.a.byteLength, 2);
    assert.equal(source.coverageChannels.g.byteLength, 2);

    const alphaBytes = catalog.coverageBuffers.find((entry) => entry.coverageChannel === 'a').data;
    const greenBytes = catalog.coverageBuffers.find((entry) => entry.coverageChannel === 'g').data;
    assert.deepEqual(Array.from(alphaBytes), [0, 255]);
    assert.deepEqual(Array.from(greenBytes), [20, 200]);
    assert.equal(source.coverageChannels.a.sha256, catalog.coverageBuffers.find((entry) => entry.coverageChannel === 'a').contentSha256);
    assert.equal(source.coverageChannels.g.sha256, catalog.coverageBuffers.find((entry) => entry.coverageChannel === 'g').contentSha256);
});
