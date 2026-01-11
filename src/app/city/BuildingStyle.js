// src/app/city/BuildingStyle.js
// Defines stable building style identifiers used by configs and UI

export const BUILDING_STYLE = Object.freeze({
    DEFAULT: 'default',
    BRICK: 'brick',
    CEMENT: 'cement',
    STONE_1: 'stone_1',
    STONE_2: 'stone_2',
    LEGACY_TEXTURE: 'legacy_texture'
});

export function isBuildingStyle(value) {
    const v = typeof value === 'string' ? value : '';
    return v === BUILDING_STYLE.DEFAULT
        || v === BUILDING_STYLE.BRICK
        || v === BUILDING_STYLE.CEMENT
        || v === BUILDING_STYLE.STONE_1
        || v === BUILDING_STYLE.STONE_2
        || v === BUILDING_STYLE.LEGACY_TEXTURE;
}

