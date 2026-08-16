import { createWindowInteriorAtlasEntry, WINDOW_INTERIOR_TYPE } from './_shared.js';

const atlas = createWindowInteriorAtlasEntry({
    id: 'window_interior_image.business_wide_6x4_01',
    label: 'Business Atlas Wide 6x4 01',
    fileName: 'parallax_interior_atlas_wide_6x4_01.png',
    type: WINDOW_INTERIOR_TYPE.BUSINESS,
    businessTypes: [
        'pharmacy',
        'church',
        'gym',
        'cafe',
        'bakery',
        'restaurant',
        'bookstore',
        'clinic'
    ],
    image: { widthPx: 1536, heightPx: 1024, hasAlpha: false },
    // Grid read off the actual PNG; the FILENAME says 6x4 but the
    // image is 3x3. A wrong grid makes the parallax shader sample a
    // sliver across neighbouring photos instead of one interior.
    grid: { cols: 3, rows: 3 },
    borders: {
        edgeInsetPx: 6,
        gutterPx: { x: 4, y: 4 }
    }
});

export default atlas;

