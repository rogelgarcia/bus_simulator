// src/graphics/content3d/catalogs/TextureInspectorCatalog.js
// Defines a stable texture catalog for inspector scenes.
import { WINDOW_STYLE } from '../../../app/buildings/WindowStyle.js';
import { getWindowTexture } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { getSignAssetById, getSignAssets } from '../../assets3d/textures/signs/SignAssets.js';
import { getPbrMaterialClassSections } from './PbrMaterialCatalog.js';

export const INSPECTOR_COLLECTION = Object.freeze({
    WINDOWS: 'tex.collection.windows',
    TRAFFIC_SIGNS: 'tex.collection.traffic_signs',
    PBR_PREFIX: 'tex.collection.pbr.'
});

export const INSPECTOR_TEXTURE = Object.freeze({
    WINDOW_DEFAULT: 'tex.window.default',
    WINDOW_DARK: 'tex.window.dark',
    WINDOW_BLUE: 'tex.window.blue',
    WINDOW_LIGHT_BLUE: 'tex.window.light_blue',
    WINDOW_GREEN: 'tex.window.green',
    WINDOW_WARM: 'tex.window.warm',
    WINDOW_GRID: 'tex.window.grid'
});

const PBR_COLLECTIONS = Object.freeze(getPbrMaterialClassSections().map((section) => ({
    id: `${INSPECTOR_COLLECTION.PBR_PREFIX}${section.classId}`,
    label: `PBR · ${section.label}`,
    entries: Object.freeze((section.options ?? []).map((opt) => ({
        id: opt.id,
        label: opt.label,
        kind: 'pbr_material',
        materialId: opt.id,
        root: opt.root,
        buildingEligible: opt.buildingEligible,
        groundEligible: opt.groundEligible
    })))
})));

const COLLECTIONS = Object.freeze([
    {
        id: INSPECTOR_COLLECTION.WINDOWS,
        label: 'Windows',
        entries: Object.freeze([
            { id: INSPECTOR_TEXTURE.WINDOW_DEFAULT, label: 'Window (Default)', kind: 'window', style: WINDOW_STYLE.DEFAULT },
            { id: INSPECTOR_TEXTURE.WINDOW_DARK, label: 'Window (Dark)', kind: 'window', style: WINDOW_STYLE.DARK },
            { id: INSPECTOR_TEXTURE.WINDOW_BLUE, label: 'Window (Blue)', kind: 'window', style: WINDOW_STYLE.BLUE },
            { id: INSPECTOR_TEXTURE.WINDOW_LIGHT_BLUE, label: 'Window (Light Blue)', kind: 'window', style: WINDOW_STYLE.LIGHT_BLUE },
            { id: INSPECTOR_TEXTURE.WINDOW_GREEN, label: 'Window (Green)', kind: 'window', style: WINDOW_STYLE.GREEN },
            { id: INSPECTOR_TEXTURE.WINDOW_WARM, label: 'Window (Warm)', kind: 'window', style: WINDOW_STYLE.WARM },
            { id: INSPECTOR_TEXTURE.WINDOW_GRID, label: 'Window (Grid)', kind: 'window', style: WINDOW_STYLE.GRID }
        ])
    },
    {
        id: INSPECTOR_COLLECTION.TRAFFIC_SIGNS,
        label: 'Traffic Signs',
        entries: Object.freeze(getSignAssets().map((sign) => ({
            id: sign.id,
            label: sign.label,
            kind: 'sign',
            atlasId: sign.atlasId,
            atlasLabel: sign.atlasLabel,
            rectPx: sign.rectPx,
            uv: sign.uv,
            offset: sign.offset,
            repeat: sign.repeat,
            aspect: sign.aspect
        })))
    },
    ...PBR_COLLECTIONS
]);

const COLLECTION_OPTIONS = Object.freeze(COLLECTIONS.map((collection) => ({ id: collection.id, label: collection.label })));

const TEXTURE_OPTIONS = Object.freeze(COLLECTIONS.flatMap((collection) => (
    collection.entries.map((entry) => ({
        ...entry,
        collectionId: collection.id,
        collectionLabel: collection.label
    }))
)));

export function getTextureInspectorCollections() {
    return Array.from(COLLECTION_OPTIONS);
}

export function getTextureInspectorCollectionById(collectionId) {
    const id = typeof collectionId === 'string' ? collectionId : '';
    return COLLECTIONS.find((collection) => collection.id === id) ?? COLLECTIONS[0] ?? null;
}

export function getTextureInspectorOptionsForCollection(collectionId) {
    const collection = getTextureInspectorCollectionById(collectionId);
    if (!collection) return [];
    return TEXTURE_OPTIONS.filter((entry) => entry.collectionId === collection.id);
}

export function getTextureInspectorOptions() {
    return Array.from(TEXTURE_OPTIONS);
}

export function getTextureInspectorEntryById(textureId) {
    const id = typeof textureId === 'string' ? textureId : '';
    return TEXTURE_OPTIONS.find((opt) => opt.id === id) ?? TEXTURE_OPTIONS[0] ?? null;
}

export function getTextureInspectorTextureById(textureId) {
    const entry = getTextureInspectorEntryById(textureId);
    if (!entry) return null;
    if (entry.kind === 'window') {
        const style = typeof entry.style === 'string' ? entry.style : WINDOW_STYLE.DEFAULT;
        return getWindowTexture({ typeId: `window.style.${style}` });
    }
    if (entry.kind === 'sign') return getSignAssetById(entry.id).getAtlasTexture();
    return null;
}
