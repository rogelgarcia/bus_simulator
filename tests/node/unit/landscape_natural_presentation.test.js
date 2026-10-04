// Verifies natural display inference without changing semantic terrain or introducing tile-dependent seams.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { createLandscapeNaturalPresentation, rasterizeLandscapeDisplayMask, landscapeNaturalPresentationBytes } from '../../../src/graphics/engine3d/landscape/LandscapeNaturalPresentation.js';
import { createLandscapeMaterialTiling, LANDSCAPE_MATERIAL_TILING } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialTiling.js';
import { buildLandscapeMeshBuffers } from '../../../src/graphics/engine3d/landscape/LandscapeMeshBuffers.js';
import { resolveLandscapeSoil } from '../../../src/app/landscape/LandscapeSoil.js';

function setup(options = {}) {
    const fixture = createLandscapeModelFixture({ coverAt: c => c < 2 ? 3 : c > 6 ? 2 : 6, ...options });
    const root = fixture.decoded.get(fixture.manifest.overviewId);
    return { ...fixture, root, presentation: createLandscapeNaturalPresentation(fixture.manifest, root) };
}

test('Natural display: planning cover infers adjacent forest and grass while preserving unknown substrate and original arrays', () => {
    const { manifest, root, presentation } = setup(), cover = root.landCover.slice();
    const left = presentation.sample(-4, 18, 6), right = presentation.sample(4, 18, 6);
    assert.equal(manifest.soil.catalog[left & 15].id, 'unknown');
    assert.equal(manifest.soil.catalog[left >> 4].id, 'forest');
    assert.equal(manifest.soil.catalog[right >> 4].id, 'loam');
    for (const id of [5, 6, 7]) assert.equal(presentation.sample(-4, 18, id), left);
    for (const id of [0, 1, 2, 3, 4]) {
        const packed = presentation.sample(0, 18, id);
        assert.equal(packed & 15, packed >> 4);
        assert.equal(manifest.soil.catalog[packed & 15].id, resolveLandscapeSoil(manifest, 0, 18, id));
    }
    assert.deepEqual(root.landCover, cover);
    assert.equal(presentation.reference.spacingX, 4);
});

test('Natural display: repeated workers and different mask orders agree at all shared native and overview samples', () => {
    const { manifest, decoded, root, presentation } = setup();
    const second = createLandscapeNaturalPresentation(manifest, root), seen = new Map();
    for (const chunk of [...decoded.values()].reverse()) {
        const mask = rasterizeLandscapeDisplayMask(second, chunk.descriptor, chunk.landCover);
        for (let row = 0; row < chunk.descriptor.rows; row++) for (let column = 0; column < chunk.descriptor.columns; column++) {
            const i = row * chunk.descriptor.columns + column, stride = chunk.descriptor.sampleStride;
            const x = manifest.bounds.minX + (chunk.descriptor.startColumn + column * stride) * manifest.grid.spacingX;
            const z = manifest.bounds.maxZ - (chunk.descriptor.startRow + row * stride) * manifest.grid.spacingZ;
            const packed = mask.pixels[i * 2], key = `${x}/${z}`;
            assert.equal(packed, presentation.sample(x, z, chunk.landCover[i]));
            assert.equal(mask.pixels[i * 2 + 1], chunk.landCover[i]);
            if (seen.has(key)) assert.equal(packed, seen.get(key));
            seen.set(key, packed);
        }
        assert.deepEqual(mask.soils, [...new Set(Array.from(chunk.landCover, (cover, i) => mask.pixels[i * 2] >> 4))].sort((a, b) => a - b));
        assert.ok(!mask.soils.includes(0));
    }
});

test('Natural display: catalog planning metadata controls inference rather than numeric cover identity', () => {
    const { manifest, root } = setup(), edited = structuredClone(manifest);
    edited.landCover.catalog.find(entry => entry.id === 6).planningOnly = false;
    const display = createLandscapeNaturalPresentation(edited, root);
    assert.equal(display.sample(-4, 18, 6), 0);
});

test('Natural display: ordered explicit overrides win even when assigning unknown to a planning class', () => {
    const { manifest, root } = setup();
    const edited = structuredClone(manifest), region = { type: 'rectangle', ...manifest.bounds };
    edited.soil.overrides = [{ soilId: 'sand', region }, { soilId: 'unknown', region: { type: 'circle', center: { x: 0, z: 18 }, radius: 1 } }];
    const display = createLandscapeNaturalPresentation(edited, root);
    assert.equal(display.sample(-4, 18, 6), 2 * 17);
    assert.equal(display.sample(0, 18, 6), 0);
    assert.equal(display.sample(0, 18, 3), 0);
    const mask = rasterizeLandscapeDisplayMask(display, root.descriptor, root.landCover);
    assert.ok(mask.soils.includes(0)); assert.ok(mask.soils.includes(2));
    assert.deepEqual(root.landCover, setup().root.landCover);
});

test('Natural display: fallback mesh colors match adjacent natural soil and all source buffers remain unchanged', () => {
    const { manifest, root, presentation } = setup();
    const heights = root.heights.slice(), cover = root.landCover.slice();
    const buffers = buildLandscapeMeshBuffers({ manifest, chunk: root, root, presentation });
    const color = i => [...buffers.colors.slice(i * 3, i * 3 + 3)];
    assert.deepEqual(color(0), color(1));
    assert.deepEqual(color(3), color(4));
    assert.deepEqual(root.heights, heights); assert.deepEqual(root.landCover, cover);
});

test('Natural display: empty natural reference has an explicit loam fallback and bounded worker storage', () => {
    const { manifest, root, presentation } = setup({ coverAt: () => 5 });
    assert.equal(manifest.soil.catalog[presentation.sample(0, 18, 5) >> 4].id, 'loam');
    assert.deepEqual(landscapeNaturalPresentationBytes({ columns: 257, rows: 257 }), { retainedBytes: 66049, workingBytes: 330245 });
    assert.equal(rasterizeLandscapeDisplayMask(presentation, root.descriptor, root.landCover).pixels.byteLength, root.landCover.byteLength * 2);
    assert.throws(() => createLandscapeNaturalPresentation(manifest, { ...root, landCover: new Uint8Array(1) }), /complete bounded overview/);
    assert.throws(() => rasterizeLandscapeDisplayMask(presentation, root.descriptor, new Uint8Array(1)), /dimensions/);
});

test('Landscape material tiling: every material keeps its physical period at every footprint and only paired micro detail has its own period', () => {
    const grass = createLandscapeMaterialTiling(4), sand = createLandscapeMaterialTiling(30, { microTileMeters: 1.5 });
    assert.equal(LANDSCAPE_MATERIAL_TILING.macroLattice, false, 'no four-times macro lattice magnifies distant features');
    assert.deepEqual(grass, { model: LANDSCAPE_MATERIAL_TILING.id, tileMeters: 4, microTileMeters: null, microFadeStartMetersPerPixel: null, microFadeEndMetersPerPixel: null });
    assert.equal(sand.tileMeters, 30); assert.equal(sand.microTileMeters, 1.5);
    assert.ok(sand.microFadeStartMetersPerPixel < sand.microFadeEndMetersPerPixel && sand.microFadeEndMetersPerPixel < sand.microTileMeters);
    assert.ok(Object.isFrozen(sand));
    assert.throws(() => createLandscapeMaterialTiling(0), /positive/);
    assert.throws(() => createLandscapeMaterialTiling(4, { microTileMeters: 8 }), /smaller than the material period/);
    assert.throws(() => createLandscapeMaterialTiling(4, { microTileMeters: 0 }), /positive/);
});
