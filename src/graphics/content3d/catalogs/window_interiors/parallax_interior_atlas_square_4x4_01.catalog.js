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
    // Grid read off the actual PNG; the FILENAME says 4x4 but the
    // image is 3x1. A wrong grid makes the parallax shader sample a
    // sliver across neighbouring photos instead of one interior.
    grid: { cols: 3, rows: 1 },
    borders: {
        edgeInsetPx: 8,
        gutterPx: { x: 6, y: 6 }
    }
});

export default atlas;

