import { createWindowInteriorAtlasEntry, WINDOW_INTERIOR_TYPE } from './_shared.js';

const atlas = createWindowInteriorAtlasEntry({
    id: 'window_interior_image.business_square_4x4_01',
    label: 'Business Atlas Square 4x4 01',
    fileName: 'parallax_interior_atlas_square_4x4_01.png',
    type: WINDOW_INTERIOR_TYPE.BUSINESS,
    businessTypes: [
        'pharmacy',
        'church',
        'gym',
        'cafe',
        'bakery',
        'restaurant'
    ],
    image: { widthPx: 1024, heightPx: 1024, hasAlpha: true },
    grid: { cols: 4, rows: 4 },
    borders: {
        edgeInsetPx: 8,
        gutterPx: { x: 6, y: 6 }
    }
});

export default atlas;

