// src/app/buildings/window_mesh/WindowInteriorAtlasLayoutCatalog.js
// Renderer-agnostic interior atlas layouts (ids + grid dimensions).
// @ts-check

export const WINDOW_INTERIOR_ATLAS_ID = Object.freeze({
    PROCEDURAL: 'window_interior_atlas.procedural',
    RESIDENTIAL_4X4: 'window_interior_atlas.residential_4x4',
    OFFICE_4X4: 'window_interior_atlas.office_4x4',
    SHOP_WIDE_6X4_01: 'window_interior_atlas.shop_wide_6x4_01',
    SHOP_WIDE_6X4_02: 'window_interior_atlas.shop_wide_6x4_02',
    SHOP_SQUARE_4X4_01: 'window_interior_atlas.shop_square_4x4_01',
    SHOP_SQUARE_4X4_02: 'window_interior_atlas.shop_square_4x4_02',
    SHOP_SQUARE_4X4_03: 'window_interior_atlas.shop_square_4x4_03',
    SHOP_SQUARE_4X4_04: 'window_interior_atlas.shop_square_4x4_04',
    SHOP_CINEMATIC_8X4_01: 'window_interior_atlas.shop_cinematic_8x4_01',
    SHOP_CINEMATIC_8X4_02: 'window_interior_atlas.shop_cinematic_8x4_02'
});

export const DEFAULT_WINDOW_INTERIOR_ATLAS_ID = WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4;

export const WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG = Object.freeze([
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_01, cols: 6, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_02, cols: 6, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_01, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_02, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_03, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_04, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_01, cols: 8, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_02, cols: 8, rows: 4 })
]);

export function getWindowInteriorAtlasLayoutById(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    return WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG.find((entry) => entry.id === id) ?? null;
}

