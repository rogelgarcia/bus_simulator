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

function makeShopAtlasEntry(atlasId, label, fileName) {
    const layout = getWindowInteriorAtlasLayoutById(atlasId);
    return Object.freeze({
        id: atlasId,
        label,
        url: new URL(fileName, ATLAS_BASE_URL).toString(),
        cols: layout?.cols ?? 4,
        rows: layout?.rows ?? 4
    });
}

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
    }),
    // Shop/business interiors (AI 488): storefront display glazing defaults to these.
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_01, 'Shop Wide (6x4) 01', 'parallax_interior_atlas_wide_6x4_01.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_WIDE_6X4_02, 'Shop Wide (6x4) 02', 'parallax_interior_atlas_wide_6x4_02.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_01, 'Shop Square (4x4) 01', 'parallax_interior_atlas_square_4x4_01.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_02, 'Shop Square (4x4) 02', 'parallax_interior_atlas_square_4x4_02.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_03, 'Shop Square (4x4) 03', 'parallax_interior_atlas_square_4x4_03.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_SQUARE_4X4_04, 'Shop Square (4x4) 04', 'parallax_interior_atlas_square_4x4_04.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_01, 'Shop Cinematic (8x4) 01', 'parallax_interior_atlas_cinematic_8x4_01.png'),
    makeShopAtlasEntry(WINDOW_INTERIOR_ATLAS_ID.SHOP_CINEMATIC_8X4_02, 'Shop Cinematic (8x4) 02', 'parallax_interior_atlas_cinematic_8x4_02.png')
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
