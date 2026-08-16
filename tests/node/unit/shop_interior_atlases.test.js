// tests/node/unit/shop_interior_atlases.test.js
// AI 488: shop/business parallax atlases must be registered consistently across
// the renderer-agnostic layout catalog, the URL catalog, and the per-atlas
// image metadata catalogs, so storefront glazing can actually display them.
// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    WINDOW_INTERIOR_ATLAS_ID,
    WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG,
    getWindowInteriorAtlasLayoutById
} from '../../../src/app/buildings/window_mesh/WindowInteriorAtlasLayoutCatalog.js';
import {
    PARALLAX_INTERIOR_PRESET_ID,
    resolveParallaxInteriorPresetInteriorConfig
} from '../../../src/app/buildings/window_mesh/ParallaxInteriorPresetCatalog.js';
import {
    WINDOW_INTERIOR_ATLAS_CATALOG,
    getWindowInteriorAtlasById
} from '../../../src/graphics/content3d/catalogs/WindowInteriorAtlasCatalog.js';
import { WINDOW_INTERIOR_IMAGE_ATLAS_CATALOG } from '../../../src/graphics/content3d/catalogs/window_interiors/index.js';

const SHOP_ATLAS_IDS = Object.entries(WINDOW_INTERIOR_ATLAS_ID)
    .filter(([key]) => key.startsWith('SHOP_'))
    .map(([, id]) => id);

test('shop atlases: every SHOP_* layout id has a URL catalog entry with matching grid', () => {
    assert.equal(SHOP_ATLAS_IDS.length, 8);
    for (const atlasId of SHOP_ATLAS_IDS) {
        const layout = getWindowInteriorAtlasLayoutById(atlasId);
        assert.ok(layout, `layout missing for ${atlasId}`);
        const urlEntry = getWindowInteriorAtlasById(atlasId);
        assert.ok(urlEntry, `URL catalog entry missing for ${atlasId}`);
        assert.equal(urlEntry.cols, layout.cols, `cols mismatch for ${atlasId}`);
        assert.equal(urlEntry.rows, layout.rows, `rows mismatch for ${atlasId}`);
        assert.ok(urlEntry.url.endsWith('.png'), `URL for ${atlasId} should point at a png`);
    }
});

test('shop atlases: registered grids match the per-atlas image metadata catalogs', () => {
    for (const atlasId of SHOP_ATLAS_IDS) {
        const urlEntry = getWindowInteriorAtlasById(atlasId);
        const fileName = decodeURIComponent(urlEntry.url.split('/').pop() ?? '');
        const imageEntry = WINDOW_INTERIOR_IMAGE_ATLAS_CATALOG.find((entry) => entry.fileName === fileName) ?? null;
        assert.ok(imageEntry, `image metadata catalog entry missing for ${fileName}`);
        assert.equal(urlEntry.cols, imageEntry.layout.cols, `cols mismatch vs image metadata for ${atlasId}`);
        assert.equal(urlEntry.rows, imageEntry.layout.rows, `rows mismatch vs image metadata for ${atlasId}`);
        assert.equal(imageEntry.type, 'business', `${fileName} should be a business atlas`);
    }
});

test('shop atlases: atlas textures exist on disk', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const texturesDir = path.resolve(here, '../../../assets/public/textures/window_interiors');
    for (const atlasId of SHOP_ATLAS_IDS) {
        const urlEntry = getWindowInteriorAtlasById(atlasId);
        const fileName = decodeURIComponent(urlEntry.url.split('/').pop() ?? '');
        assert.ok(
            fs.existsSync(path.join(texturesDir, fileName)),
            `atlas texture ${fileName} missing on disk`
        );
    }
});

test('shop preset: resolves to a registered shop atlas with shop-tuned parallax', () => {
    const interior = resolveParallaxInteriorPresetInteriorConfig(PARALLAX_INTERIOR_PRESET_ID.SHOP);
    assert.ok(interior, 'shop preset should resolve');
    assert.equal(interior.enabled, true);
    assert.ok(SHOP_ATLAS_IDS.includes(interior.atlasId), `shop preset atlas ${interior.atlasId} should be a shop atlas`);
    const layout = getWindowInteriorAtlasLayoutById(interior.atlasId);
    assert.equal(interior.atlas.cols, layout.cols);
    assert.equal(interior.atlas.rows, layout.rows);
    // Shop-tuned defaults differ from the shared residential/office defaults.
    const residential = resolveParallaxInteriorPresetInteriorConfig(PARALLAX_INTERIOR_PRESET_ID.RESIDENTIAL);
    assert.notEqual(interior.uvZoom, residential.uvZoom, 'shop preset should carry its own uvZoom');
    assert.ok(interior.parallaxDepthMeters > 0);
});

test('shop atlases: layout catalog has no duplicate ids', () => {
    const ids = WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    const urlIds = WINDOW_INTERIOR_ATLAS_CATALOG.map((entry) => entry.id);
    assert.equal(new Set(urlIds).size, urlIds.length);
});
