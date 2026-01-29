// src/graphics/content3d/catalogs/WindowInteriorAtlasCatalog.js
// Defines stable catalog entries for window interior atlas textures.

import {
    DEFAULT_WINDOW_INTERIOR_ATLAS_ID,
    WINDOW_INTERIOR_ATLAS_ID,
    getWindowInteriorAtlasLayoutById
} from '../../../app/buildings/window_mesh/WindowInteriorAtlasLayoutCatalog.js';

export { WINDOW_INTERIOR_ATLAS_ID, DEFAULT_WINDOW_INTERIOR_ATLAS_ID };

const ATLAS_BASE_URL = new URL(
    '../../../../assets/public/textures/window_interiors/',
    import.meta.url
);

const RESIDENTIAL_URL = new URL('parallax_interior_atlas_residential.png', ATLAS_BASE_URL).toString();
const OFFICE_URL = new URL('parallax_interior_atlas_office.png', ATLAS_BASE_URL).toString();

export const WINDOW_INTERIOR_ATLAS_CATALOG = Object.freeze([
    Object.freeze({
        id: WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL,
        label: 'Procedural (generated)',
        url: '',
        cols: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL)?.cols ?? 4,
        rows: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL)?.rows ?? 4
    }),
    Object.freeze({
        id: WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4,
        label: 'Residential (4x4)',
        url: RESIDENTIAL_URL,
        cols: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4)?.cols ?? 4,
        rows: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.RESIDENTIAL_4X4)?.rows ?? 4
    }),
    Object.freeze({
        id: WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4,
        label: 'Office (4x4)',
        url: OFFICE_URL,
        cols: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4)?.cols ?? 4,
        rows: getWindowInteriorAtlasLayoutById(WINDOW_INTERIOR_ATLAS_ID.OFFICE_4X4)?.rows ?? 4
    })
]);

export function getWindowInteriorAtlasById(atlasId) {
    const id = typeof atlasId === 'string' ? atlasId : '';
    return WINDOW_INTERIOR_ATLAS_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function getWindowInteriorAtlasOptions({ includeProcedural = true } = {}) {
    return WINDOW_INTERIOR_ATLAS_CATALOG
        .filter((entry) => includeProcedural || entry.id !== WINDOW_INTERIOR_ATLAS_ID.PROCEDURAL)
        .map((entry) => ({ id: entry.id, label: entry.label }));
}
