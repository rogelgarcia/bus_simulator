// src/graphics/assets3d/generators/buildings/WindowTypeCompatibility.js
// Adapts legacy window styles to window type IDs without leaking app enums into engine3d generators.
import { WINDOW_STYLE, isWindowStyle } from '../../../../app/buildings/WindowStyle.js';
import { WINDOW_TYPE, isWindowTypeId, getWindowTexture, getDefaultWindowParams } from './WindowTextureGenerator.js';

export function windowTypeIdFromLegacyWindowStyle(styleId) {
    const id = isWindowStyle(styleId) ? styleId : WINDOW_STYLE.DEFAULT;
    if (id === WINDOW_STYLE.DARK) return WINDOW_TYPE.STYLE_DARK;
    if (id === WINDOW_STYLE.BLUE) return WINDOW_TYPE.STYLE_BLUE;
    if (id === WINDOW_STYLE.LIGHT_BLUE) return WINDOW_TYPE.STYLE_LIGHT_BLUE;
    if (id === WINDOW_STYLE.GREEN) return WINDOW_TYPE.STYLE_GREEN;
    if (id === WINDOW_STYLE.WARM) return WINDOW_TYPE.STYLE_WARM;
    if (id === WINDOW_STYLE.GRID) return WINDOW_TYPE.STYLE_GRID;
    return WINDOW_TYPE.STYLE_DEFAULT;
}

export function legacyWindowStyleFromWindowTypeId(typeId) {
    if (typeId === WINDOW_TYPE.STYLE_DARK) return WINDOW_STYLE.DARK;
    if (typeId === WINDOW_TYPE.STYLE_BLUE) return WINDOW_STYLE.BLUE;
    if (typeId === WINDOW_TYPE.STYLE_LIGHT_BLUE) return WINDOW_STYLE.LIGHT_BLUE;
    if (typeId === WINDOW_TYPE.STYLE_GREEN) return WINDOW_STYLE.GREEN;
    if (typeId === WINDOW_TYPE.STYLE_WARM) return WINDOW_STYLE.WARM;
    if (typeId === WINDOW_TYPE.STYLE_GRID) return WINDOW_STYLE.GRID;
    return WINDOW_STYLE.DEFAULT;
}

export function normalizeWindowTypeIdOrLegacyStyle(raw) {
    const value = typeof raw === 'string' ? raw : '';
    if (isWindowTypeId(value)) return value;
    if (isWindowStyle(value)) return windowTypeIdFromLegacyWindowStyle(value);
    return WINDOW_TYPE.STYLE_DEFAULT;
}

export function getLegacyWindowStyleTexture(styleId) {
    const typeId = windowTypeIdFromLegacyWindowStyle(styleId);
    return getWindowTexture({ typeId });
}

export function normalizeWindowParams(typeId, params) {
    const defaults = getDefaultWindowParams(typeId);
    const hasDefaults = defaults && typeof defaults === 'object' && Object.keys(defaults).length > 0;
    if (!hasDefaults) return {};
    const p = params && typeof params === 'object' ? params : {};
    return { ...defaults, ...p };
}

