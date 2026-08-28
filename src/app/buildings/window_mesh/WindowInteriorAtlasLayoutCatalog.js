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
    SHOP_CINEMATIC_8X4_02: 'window_interior_atlas.shop_cinematic_8x4_02',
    // Generated dark silhouette interior for street-level glass (not SHOP_-
    // prefixed: the shop set is the photographic atlases; this one is the
    // discreet fake-texture alternative).
    STOREFRONT_SILHOUETTE_2X2: 'window_interior_atlas.storefront_silhouette_2x2'
});

export const DEFAULT_WINDOW_INTERIOR_ATLAS_ID = WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4;

// NOTE: the SHOP_* ids carry the grid from their source FILENAMES, which do
// NOT match the images. These cols/rows and pixel sizes were read off the
// actual atlas PNGs: a mis-declared grid makes the shader sample a sliver
// ACROSS neighbouring photos, so shop glass showed smeared fragments instead
// of an interior. Always verify a new atlas against the image itself, not its
// filename - `tests/node/unit/shop_interior_atlases.test.js` decodes the PNGs
// and asserts every declared cell boundary lands on a real seam.
export const WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG = Object.freeze([
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL, cols: 4, rows: 4, imageWidthPx: 0, imageHeightPx: 0 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4, cols: 4, rows: 4, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4, cols: 4, rows: 4, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_01, cols: 3, rows: 3, imageWidthPx: 1536, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_02, cols: 3, rows: 3, imageWidthPx: 1536, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_01, cols: 3, rows: 1, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_02, cols: 2, rows: 4, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_03, cols: 2, rows: 4, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_04, cols: 4, rows: 3, imageWidthPx: 1024, imageHeightPx: 1024 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_01, cols: 4, rows: 4, imageWidthPx: 1456, imageHeightPx: 720 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_02, cols: 4, rows: 2, imageWidthPx: 1456, imageHeightPx: 720 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.STOREFRONT_SILHOUETTE_2X2, cols: 2, rows: 2, imageWidthPx: 1024, imageHeightPx: 1024 })
]);

export function getWindowInteriorAtlasLayoutById(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    return WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG.find((entry) => entry.id === id) ?? null;
}

// Width/height of one atlas cell. The parallax shader cover-fits the cell into
// the opening, so it needs the cell aspect, not the whole image's.
export function getWindowInteriorAtlasCellAspect(atlasId) {
    const layout = getWindowInteriorAtlasLayoutById(atlasId);
    const w = Number(layout?.imageWidthPx) || 0;
    const h = Number(layout?.imageHeightPx) || 0;
    const cols = Math.max(1, layout?.cols | 0);
    const rows = Math.max(1, layout?.rows | 0);
    if (w <= 0 || h <= 0) return 1.0;
    return (w / cols) / (h / rows);
}

