// src/graphics/content3d/catalogs/IBLCatalog.js
// Defines stable IBL/HDRI environment catalog entries.

export const IBL_ID = Object.freeze({
    CALIBRATED_AFTERNOON_55: 'ibl.calibrated.clear_afternoon_55',
    GERMAN_TOWN_STREET_2K: 'ibl.hdri.german_town_street_2k',
    KLOOFENDAL_43D_CLEAR_PURESKY_2K: 'ibl.hdri.kloofendal_43d_clear_puresky_2k'
});

const HDRI_GERMAN_TOWN_STREET_2K_URL = new URL(
    '../../../../assets/public/lighting/hdri/german_town_street_2k.hdr',
    import.meta.url
).toString();

// Poly Haven "Kloofendal 43d Clear (Pure Sky)", CC0: a clear midday sky with a crisp sun and no ground, the sky the
// Bradbury render scene is judged under (AI 574 item 1). Provenance in the .source.json beside the file.
const HDRI_KLOOFENDAL_43D_CLEAR_PURESKY_2K_URL = new URL(
    '../../../../assets/public/lighting/hdri/kloofendal_43d_clear_puresky_2k.hdr',
    import.meta.url
).toString();

export const IBL_CATALOG = Object.freeze([
    Object.freeze({
        id: IBL_ID.CALIBRATED_AFTERNOON_55,
        label: 'Calibrated clear afternoon (55°)',
        hdrUrl: new URL('../../../../assets/public/lighting/calibrated/clear-afternoon-55.hdr', import.meta.url).toString(),
        previewUrl: null
    }),
    Object.freeze({
        id: IBL_ID.GERMAN_TOWN_STREET_2K,
        label: 'German town street (2k)',
        hdrUrl: HDRI_GERMAN_TOWN_STREET_2K_URL,
        previewUrl: null
    }),
    Object.freeze({
        id: IBL_ID.KLOOFENDAL_43D_CLEAR_PURESKY_2K,
        label: 'Kloofendal 43d clear pure sky (2k)',
        hdrUrl: HDRI_KLOOFENDAL_43D_CLEAR_PURESKY_2K_URL,
        previewUrl: null
    })
]);

export const DEFAULT_IBL_ID = IBL_ID.GERMAN_TOWN_STREET_2K;

export function getIblOptions() {
    return IBL_CATALOG.map((entry) => ({ id: entry.id, label: entry.label }));
}

export function getIblEntryById(iblId) {
    const id = typeof iblId === 'string' ? iblId : '';
    return IBL_CATALOG.find((entry) => entry.id === id)
        ?? IBL_CATALOG.find((entry) => entry.id === DEFAULT_IBL_ID) ?? null;
}
