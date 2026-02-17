// src/graphics/content3d/catalogs/WindowInteriorImageCatalog.js
// Aggregated access to per-atlas window interior catalog modules.

import WINDOW_INTERIOR_IMAGE_ATLAS_CATALOG from './window_interiors/index.js';

export const WINDOW_INTERIOR_IMAGE_CATALOG = WINDOW_INTERIOR_IMAGE_ATLAS_CATALOG;

export function getWindowInteriorImageCatalog() {
    return WINDOW_INTERIOR_IMAGE_CATALOG;
}

export function getWindowInteriorImageById(imageId) {
    const id = typeof imageId === 'string' ? imageId : '';
    return WINDOW_INTERIOR_IMAGE_CATALOG.find((entry) => entry.id === id) ?? null;
}

export function getWindowInteriorImageCatalogOptions() {
    return WINDOW_INTERIOR_IMAGE_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        type: entry.type,
        aspect: entry.analysis?.aspect ?? 1.0,
        fileName: entry.fileName
    }));
}
