// src/graphics/content3d/catalogs/WindowTypeCatalog.js
// Defines window type IDs and metadata for window texture generation and UI.

export const WINDOW_TYPE = Object.freeze({
    STYLE_DEFAULT: 'window.style.default',
    STYLE_DARK: 'window.style.dark',
    STYLE_BLUE: 'window.style.blue',
    STYLE_LIGHT_BLUE: 'window.style.light_blue',
    STYLE_GREEN: 'window.style.green',
    STYLE_WARM: 'window.style.warm',
    STYLE_GRID: 'window.style.grid',
    ARCH_V1: 'window.arch.v1',
    MODERN_V1: 'window.modern.v1'
});

const WINDOW_TYPE_ORDER = Object.freeze([
    WINDOW_TYPE.STYLE_DEFAULT,
    WINDOW_TYPE.STYLE_DARK,
    WINDOW_TYPE.STYLE_BLUE,
    WINDOW_TYPE.STYLE_LIGHT_BLUE,
    WINDOW_TYPE.STYLE_GREEN,
    WINDOW_TYPE.STYLE_WARM,
    WINDOW_TYPE.STYLE_GRID,
    WINDOW_TYPE.ARCH_V1,
    WINDOW_TYPE.MODERN_V1
]);

const WINDOW_PARAM_SPECS = Object.freeze({
    arch_v1: Object.freeze({
        frameWidth: Object.freeze({ default: 0.06, min: 0.02, max: 0.2 }),
        frameColor: Object.freeze({ default: 0xdfe7f2 }),
        glassTop: Object.freeze({ default: 0x10395a }),
        glassBottom: Object.freeze({ default: 0x061a2c })
    }),
    modern_v1: Object.freeze({
        frameWidth: Object.freeze({ default: 0.06, min: 0.02, max: 0.2 }),
        frameColor: Object.freeze({ default: 0xdfe7f2 }),
        glassTop: Object.freeze({ default: 0x1d5c8d }),
        glassBottom: Object.freeze({ default: 0x061a2c })
    })
});

const WINDOW_TYPE_DEFS = Object.freeze({
    [WINDOW_TYPE.STYLE_DEFAULT]: Object.freeze({
        id: WINDOW_TYPE.STYLE_DEFAULT,
        label: 'Default',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_DARK]: Object.freeze({
        id: WINDOW_TYPE.STYLE_DARK,
        label: 'Dark',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_BLUE]: Object.freeze({
        id: WINDOW_TYPE.STYLE_BLUE,
        label: 'Blue',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_LIGHT_BLUE]: Object.freeze({
        id: WINDOW_TYPE.STYLE_LIGHT_BLUE,
        label: 'Light Blue',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_GREEN]: Object.freeze({
        id: WINDOW_TYPE.STYLE_GREEN,
        label: 'Green',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_WARM]: Object.freeze({
        id: WINDOW_TYPE.STYLE_WARM,
        label: 'Warm',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.STYLE_GRID]: Object.freeze({
        id: WINDOW_TYPE.STYLE_GRID,
        label: 'Grid',
        renderKind: 'legacy_style',
        preview: Object.freeze({ size: 96 })
    }),
    [WINDOW_TYPE.ARCH_V1]: Object.freeze({
        id: WINDOW_TYPE.ARCH_V1,
        label: 'Arched',
        renderKind: 'arch_v1',
        preview: Object.freeze({ width: 96, height: 128 }),
        paramSpec: WINDOW_PARAM_SPECS.arch_v1
    }),
    [WINDOW_TYPE.MODERN_V1]: Object.freeze({
        id: WINDOW_TYPE.MODERN_V1,
        label: 'Modern',
        renderKind: 'modern_v1',
        preview: Object.freeze({ width: 96, height: 96 }),
        paramSpec: WINDOW_PARAM_SPECS.modern_v1
    })
});

export function listWindowTypeIds() {
    return WINDOW_TYPE_ORDER.slice();
}

export function isWindowTypeId(value) {
    if (typeof value !== 'string') return false;
    return WINDOW_TYPE_DEFS[value] != null;
}

export function normalizeWindowTypeId(value) {
    return isWindowTypeId(value) ? value : WINDOW_TYPE.STYLE_DEFAULT;
}

export function getWindowTypeDefinition(typeId) {
    const id = normalizeWindowTypeId(typeId);
    return WINDOW_TYPE_DEFS[id];
}

export function getWindowTypeParamSpec(typeId) {
    const def = getWindowTypeDefinition(typeId);
    return def?.paramSpec ?? null;
}
