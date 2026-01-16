// src/graphics/content3d/catalogs/IBLCatalog.js
// Defines stable IBL/HDRI environment catalog entries.

export const IBL_ID = Object.freeze({
    GERMAN_TOWN_STREET_2K: 'ibl.hdri.german_town_street_2k'
});

const HDRI_GERMAN_TOWN_STREET_2K_URL = new URL(
    '../../../../assets/public/lighting/hdri/german_town_street_2k.hdr',
    import.meta.url
).toString();

export const IBL_CATALOG = Object.freeze([
    Object.freeze({
        id: IBL_ID.GERMAN_TOWN_STREET_2K,
        label: 'German town street (2k)',
        hdrUrl: HDRI_GERMAN_TOWN_STREET_2K_URL,
        previewUrl: null
    })
]);

export const DEFAULT_IBL_ID = IBL_ID.GERMAN_TOWN_STREET_2K;

export function getIblOptions() {
    return IBL_CATALOG.map((entry) => ({ id: entry.id, label: entry.label }));
}

export function getIblEntryById(iblId) {
    const id = typeof iblId === 'string' ? iblId : '';
    return IBL_CATALOG.find((entry) => entry.id === id) ?? IBL_CATALOG[0] ?? null;
}
