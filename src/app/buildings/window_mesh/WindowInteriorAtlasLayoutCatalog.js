// src/app/buildings/window_mesh/WindowInteriorAtlasLayoutCatalog.js
// Renderer-agnostic interior atlas layouts (ids + grid dimensions).
// @ts-check

export const WINDOW_INTERIOR_ATLAS_ID = Object.freeze({
    PROCEDURAL: 'window_interior_atlas.procedural',
    RESIDENTIAL_4X4: 'window_interior_atlas.residential_4x4',
    OFFICE_4X4: 'window_interior_atlas.office_4x4'
});

export const DEFAULT_WINDOW_INTERIOR_ATLAS_ID = WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4;

export const WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG = Object.freeze([
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4, cols: 4, rows: 4 }),
    Object.freeze({ id: WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4, cols: 4, rows: 4 })
]);

export function getWindowInteriorAtlasLayoutById(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    return WINDOW_INTERIOR_ATLAS_LAYOUT_CATALOG.find((entry) => entry.id === id) ?? null;
}

