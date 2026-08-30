// Verifies evaluated material alpha semantics and exact typed texture coverage extraction.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBakeMaterialCatalog } from '../../../src/graphics/illumination/bake_source/BakeSourceMaterials.js';

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
