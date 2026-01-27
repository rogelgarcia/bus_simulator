// src/graphics/assets3d/materials/RoadMarkingsColors.js
// Canonical road marking target colors (as seen under the project sun/exposure).
// @ts-check

export const ROAD_MARKING_YELLOW_TARGET_SUN_HEX = 0xedac07;
export const ROAD_MARKING_WHITE_TARGET_SUN_HEX = 0xe8e4d0;

export function hexToCssColor(hex) {
    const safe = (Number(hex) >>> 0) & 0xffffff;
    return `#${safe.toString(16).padStart(6, '0')}`;
}

