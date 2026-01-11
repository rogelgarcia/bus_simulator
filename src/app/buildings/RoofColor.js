// src/app/buildings/RoofColor.js
export const ROOF_COLOR = Object.freeze({
    DEFAULT: 'default',
    DARK_GRAY: 'dark_gray',
    GRAY: 'gray',
    OFFWHITE: 'offwhite',
    TERRACOTTA: 'terracotta',
    GREEN_TINT: 'green_tint',
    BLUE_TINT: 'blue_tint'
});

export function isRoofColor(value) {
    if (typeof value !== 'string') return false;
    return value === ROOF_COLOR.DEFAULT
        || value === ROOF_COLOR.DARK_GRAY
        || value === ROOF_COLOR.GRAY
        || value === ROOF_COLOR.OFFWHITE
        || value === ROOF_COLOR.TERRACOTTA
        || value === ROOF_COLOR.GREEN_TINT
        || value === ROOF_COLOR.BLUE_TINT;
}

export function resolveRoofColorLabel(colorId) {
    const id = isRoofColor(colorId) ? colorId : ROOF_COLOR.DEFAULT;
    if (id === ROOF_COLOR.DEFAULT) return 'Default';
    if (id === ROOF_COLOR.DARK_GRAY) return 'Dark gray';
    if (id === ROOF_COLOR.GRAY) return 'Gray';
    if (id === ROOF_COLOR.OFFWHITE) return 'Off-white';
    if (id === ROOF_COLOR.TERRACOTTA) return 'Terracotta';
    if (id === ROOF_COLOR.GREEN_TINT) return 'Green tint';
    if (id === ROOF_COLOR.BLUE_TINT) return 'Blue tint';
    return 'Default';
}

export function resolveRoofColorHex(colorId, defaultHex = 0xffffff) {
    const id = isRoofColor(colorId) ? colorId : ROOF_COLOR.DEFAULT;
    if (id === ROOF_COLOR.DEFAULT) return Number.isFinite(defaultHex) ? defaultHex : 0xffffff;
    if (id === ROOF_COLOR.DARK_GRAY) return 0x2f3338;
    if (id === ROOF_COLOR.GRAY) return 0x6b727b;
    if (id === ROOF_COLOR.OFFWHITE) return 0xf2f2f2;
    if (id === ROOF_COLOR.TERRACOTTA) return 0xb05d3d;
    if (id === ROOF_COLOR.GREEN_TINT) return 0x7ea794;
    if (id === ROOF_COLOR.BLUE_TINT) return 0x6f8fae;
    return Number.isFinite(defaultHex) ? defaultHex : 0xffffff;
}

export function getRoofColorOptions(defaultHex = 0xffffff) {
    const ids = [
        ROOF_COLOR.DEFAULT,
        ROOF_COLOR.DARK_GRAY,
        ROOF_COLOR.GRAY,
        ROOF_COLOR.OFFWHITE,
        ROOF_COLOR.TERRACOTTA,
        ROOF_COLOR.GREEN_TINT,
        ROOF_COLOR.BLUE_TINT
    ];
    return ids.map((id) => ({
        id,
        label: resolveRoofColorLabel(id),
        hex: resolveRoofColorHex(id, defaultHex)
    }));
}
