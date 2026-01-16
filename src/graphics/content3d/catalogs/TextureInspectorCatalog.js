// src/graphics/content3d/catalogs/TextureInspectorCatalog.js
// Defines a stable texture catalog for inspector scenes.
import { WINDOW_STYLE } from '../../../app/buildings/WindowStyle.js';
import { BUILDING_STYLE } from '../../../app/buildings/BuildingStyle.js';
import { getBuildingWindowTextureForStyle } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { getSignAssetById, getSignAssets } from '../../assets3d/textures/signs/SignAssets.js';
import { getPbrMaterialOptions } from './PbrMaterialCatalog.js';

export const INSPECTOR_COLLECTION = Object.freeze({
    WINDOWS: 'tex.collection.windows',
    TRAFFIC_SIGNS: 'tex.collection.traffic_signs',
    BUILDING_WALLS: 'tex.collection.building_walls',
    PBR_MATERIALS: 'tex.collection.pbr_materials'
});

export const INSPECTOR_TEXTURE = Object.freeze({
    WINDOW_DEFAULT: 'tex.window.default',
    WINDOW_DARK: 'tex.window.dark',
    WINDOW_BLUE: 'tex.window.blue',
    WINDOW_LIGHT_BLUE: 'tex.window.light_blue',
    WINDOW_GREEN: 'tex.window.green',
    WINDOW_WARM: 'tex.window.warm',
    WINDOW_GRID: 'tex.window.grid',
    WALL_BRICK: 'tex.wall.brick',
    WALL_CEMENT: 'tex.wall.cement',
    WALL_STONE_1: 'tex.wall.stone_1',
    WALL_STONE_2: 'tex.wall.stone_2'
});

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
    {
        id: INSPECTOR_COLLECTION.BUILDING_WALLS,
        label: 'Building Walls',
        entries: Object.freeze([
            { id: INSPECTOR_TEXTURE.WALL_BRICK, label: 'Brick', kind: 'building_wall', style: BUILDING_STYLE.BRICK },
            { id: INSPECTOR_TEXTURE.WALL_CEMENT, label: 'Cement', kind: 'building_wall', style: BUILDING_STYLE.CEMENT },
            { id: INSPECTOR_TEXTURE.WALL_STONE_1, label: 'Stone 1', kind: 'building_wall', style: BUILDING_STYLE.STONE_1 },
            { id: INSPECTOR_TEXTURE.WALL_STONE_2, label: 'Stone 2', kind: 'building_wall', style: BUILDING_STYLE.STONE_2 }
        ])
    },
    {
        id: INSPECTOR_COLLECTION.PBR_MATERIALS,
        label: 'PBR Materials',
        entries: Object.freeze(getPbrMaterialOptions().map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'pbr_material',
            materialId: opt.id,
            root: opt.root,
            buildingEligible: opt.buildingEligible
        })))
    }
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
    if (entry.kind === 'window') return getBuildingWindowTextureForStyle(entry.style);
    if (entry.kind === 'sign') return getSignAssetById(entry.id).getAtlasTexture();
    return null;
}
