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
    getWindowInteriorAtlasCellAspect,
    getWindowInteriorAtlasLayoutById
} from '../../../src/app/buildings/window_mesh/WindowInteriorAtlasLayoutCatalog.js';
import { decodePng, scoreAtlasGrid } from './helpers/atlas_grid_probe.js';
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

const IMAGE_ATLAS_IDS = WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG
    .filter((entry) => entry.id !== WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL)
    .map((entry) => entry.id);

const TEXTURES_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../assets/public/textures/window_interiors'
);

// A declared boundary that lands on a real cell edge scores >= 2.0 on every
// shipped atlas; a boundary cutting through the middle of a photo (what the
// filename-derived grids did) scores <= 1.75. 1.9 sits in that gap.
const GRID_BOUNDARY_MIN_SCORE = 1.9;

function atlasFileName(atlasId) {
    const urlEntry = getWindowInteriorAtlasById(atlasId);
    return decodeURIComponent(urlEntry.url.split('/').pop() ?? '');
}

function loadAtlasImage(atlasId) {
    return decodePng(fs.readFileSync(path.join(TEXTURES_DIR, atlasFileName(atlasId))));
}

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
    for (const atlasId of SHOP_ATLAS_IDS) {
        const fileName = atlasFileName(atlasId);
        assert.ok(
            fs.existsSync(path.join(TEXTURES_DIR, fileName)),
            `atlas texture ${fileName} missing on disk`
        );
    }
});

// The three checks below close the loop the declaration-vs-declaration tests
// left open: both catalogs could be (and were) wrong together because they were
// written from the FILENAMES. These read the PNG itself.
test('interior atlases: declared pixel size matches the PNG header', () => {
    for (const atlasId of IMAGE_ATLAS_IDS) {
        const layout = getWindowInteriorAtlasLayoutById(atlasId);
        const image = loadAtlasImage(atlasId);
        assert.equal(image.width, layout.imageWidthPx, `width mismatch for ${atlasId}`);
        assert.equal(image.height, layout.imageHeightPx, `height mismatch for ${atlasId}`);
    }
});

test('interior atlases: every declared cell boundary lands on a seam in the image', () => {
    for (const atlasId of IMAGE_ATLAS_IDS) {
        const layout = getWindowInteriorAtlasLayoutById(atlasId);
        const score = scoreAtlasGrid(loadAtlasImage(atlasId), { cols: layout.cols, rows: layout.rows });
        assert.ok(
            score.cols >= GRID_BOUNDARY_MIN_SCORE,
            `${atlasId}: ${layout.cols} columns cut through photo content (score ${score.cols.toFixed(2)})`
        );
        assert.ok(
            score.rows >= GRID_BOUNDARY_MIN_SCORE,
            `${atlasId}: ${layout.rows} rows cut through photo content (score ${score.rows.toFixed(2)})`
        );
    }
});

test('interior atlases: a finer grid than declared is rejected by the seam check', () => {
    // Guards the guard: doubling the columns must always break the check, so a
    // future mis-declaration cannot pass by accident.
    for (const atlasId of IMAGE_ATLAS_IDS) {
        const layout = getWindowInteriorAtlasLayoutById(atlasId);
        const score = scoreAtlasGrid(loadAtlasImage(atlasId), { cols: layout.cols * 2, rows: layout.rows });
        assert.ok(
            score.cols < GRID_BOUNDARY_MIN_SCORE,
            `${atlasId}: ${layout.cols * 2} columns should not score as a valid grid (score ${score.cols.toFixed(2)})`
        );
    }
});

test('interior atlases: cell aspect is plausible for an interior photo', () => {
    for (const atlasId of IMAGE_ATLAS_IDS) {
        const aspect = getWindowInteriorAtlasCellAspect(atlasId);
        assert.ok(aspect >= 0.25 && aspect <= 4.0, `${atlasId} cell aspect ${aspect} is degenerate`);
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
