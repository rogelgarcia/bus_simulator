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
    grid: { cols: 6, rows: 4 },
    borders: {
        edgeInsetPx: 6,
        gutterPx: { x: 4, y: 4 }
    }
});

export default atlas;

