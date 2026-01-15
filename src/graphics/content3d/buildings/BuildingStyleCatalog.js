// src/graphics/content3d/buildings/BuildingStyleCatalog.js
// Defines building style labels and wall material URL specifications.
import { getPbrMaterialLabel, isPbrMaterialId, resolvePbrMaterialUrls } from '../materials/PbrMaterialCatalog.js';

const BUILDING_TEXTURE_BASE_URL = new URL('../../../../assets/public/textures/buildings/walls/', import.meta.url);

const BUILDING_STYLE_DEFS = Object.freeze({
    default: Object.freeze({
        id: 'default',
        label: 'Default',
        wall: Object.freeze({ baseColorUrl: null, normalUrl: null, ormUrl: null })
    }),
    brick: Object.freeze({
        id: 'brick',
        label: 'Brick',
        wall: Object.freeze({
            baseColorUrl: new URL('brick_wall_DEPRECATED.png', BUILDING_TEXTURE_BASE_URL).toString(),
            normalUrl: null,
            ormUrl: null
        })
    }),
    cement: Object.freeze({
        id: 'cement',
        label: 'Cement',
        wall: Object.freeze({
            baseColorUrl: new URL('cement.png', BUILDING_TEXTURE_BASE_URL).toString(),
            normalUrl: null,
            ormUrl: null
        })
    }),
    stone_1: Object.freeze({
        id: 'stone_1',
        label: 'Stone 1',
        wall: Object.freeze({
            baseColorUrl: new URL('stonewall_1.png', BUILDING_TEXTURE_BASE_URL).toString(),
            normalUrl: null,
            ormUrl: null
        })
    }),
    stone_2: Object.freeze({
        id: 'stone_2',
        label: 'Stone 2',
        wall: Object.freeze({
            baseColorUrl: new URL('stonewall_2.png', BUILDING_TEXTURE_BASE_URL).toString(),
            normalUrl: null,
            ormUrl: null
        })
    }),
    legacy_texture: Object.freeze({
        id: 'legacy_texture',
        label: 'Legacy texture',
        wall: Object.freeze({ baseColorUrl: null, normalUrl: null, ormUrl: null })
    })
});

const BUILDING_STYLE_OPTIONS = Object.freeze([
    'default',
    'brick',
    'cement',
    'stone_1',
    'stone_2'
]);

export function normalizeBuildingStyleId(styleId) {
    const id = typeof styleId === 'string' ? styleId : '';
    return BUILDING_STYLE_DEFS[id] ? id : 'default';
}

export function getBuildingStyleDefinition(styleId) {
    const id = normalizeBuildingStyleId(styleId);
    return BUILDING_STYLE_DEFS[id] ?? BUILDING_STYLE_DEFS.default;
}

export function resolveBuildingStyleLabel(styleId) {
    if (isPbrMaterialId(styleId)) return getPbrMaterialLabel(styleId);
    return getBuildingStyleDefinition(styleId).label;
}

export function resolveBuildingStyleWallMaterialUrls(styleId) {
    if (isPbrMaterialId(styleId)) return resolvePbrMaterialUrls(styleId);
    const wall = getBuildingStyleDefinition(styleId).wall ?? null;
    return {
        baseColorUrl: typeof wall?.baseColorUrl === 'string' ? wall.baseColorUrl : null,
        normalUrl: typeof wall?.normalUrl === 'string' ? wall.normalUrl : null,
        ormUrl: typeof wall?.ormUrl === 'string' ? wall.ormUrl : null
    };
}

export function resolveBuildingStyleWallTextureUrl(styleId) {
    return resolveBuildingStyleWallMaterialUrls(styleId).baseColorUrl;
}

export function getBuildingStyleOptions() {
    return BUILDING_STYLE_OPTIONS.map((id) => {
        const def = getBuildingStyleDefinition(id);
        return {
            id: def.id,
            label: def.label,
            wallTextureUrl: def.wall?.baseColorUrl ?? null
        };
    });
}
