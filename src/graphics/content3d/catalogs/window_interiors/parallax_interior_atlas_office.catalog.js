import { createWindowInteriorAtlasEntry, WINDOW_INTERIOR_TYPE } from './_shared.js';

const atlas = createWindowInteriorAtlasEntry({
    id: 'window_interior_image.office_4x4_01',
    label: 'Office Atlas 01',
    fileName: 'parallax_interior_atlas_office.png',
    type: WINDOW_INTERIOR_TYPE.OFFICE,
    image: { widthPx: 1024, heightPx: 1024, hasAlpha: true },
    grid: { cols: 4, rows: 4 },
    borders: {
        edgeInsetPx: 0,
        gutterPx: 0
    }
});

export default atlas;

