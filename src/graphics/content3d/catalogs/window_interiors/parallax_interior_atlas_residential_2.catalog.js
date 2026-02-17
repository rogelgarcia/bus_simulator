import { createWindowInteriorAtlasEntry, WINDOW_INTERIOR_TYPE } from './_shared.js';

const atlas = createWindowInteriorAtlasEntry({
    id: 'window_interior_image.residential_4x4_02',
    label: 'Residential Atlas 02',
    fileName: 'parallax_interior_atlas_residential_2.png',
    type: WINDOW_INTERIOR_TYPE.RESIDENTIAL,
    image: { widthPx: 1024, heightPx: 1024, hasAlpha: false },
    grid: { cols: 4, rows: 4 },
    borders: {
        edgeInsetPx: 4,
        gutterPx: 4
    }
});

export default atlas;

