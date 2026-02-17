import { createWindowInteriorAtlasEntry, WINDOW_INTERIOR_TYPE } from './_shared.js';

const atlas = createWindowInteriorAtlasEntry({
    id: 'window_interior_image.business_cinematic_8x4_01',
    label: 'Business Atlas Cinematic 8x4 01',
    fileName: 'parallax_interior_atlas_cinematic_8x4_01.png',
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
    image: { widthPx: 1456, heightPx: 720, hasAlpha: true },
    grid: { cols: 8, rows: 4 },
    borders: {
        edgeInsetPx: { x: 6, y: 4 },
        gutterPx: { x: 3, y: 3 }
    }
});

export default atlas;

