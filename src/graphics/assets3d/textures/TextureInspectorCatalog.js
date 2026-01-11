// src/graphics/assets3d/textures/TextureInspectorCatalog.js
// Defines a stable texture catalog for inspector scenes.
import { WINDOW_STYLE } from '../../../app/buildings/WindowStyle.js';
import { getBuildingWindowTextureForStyle } from '../generators/buildings/BuildingGenerator.js';

export const INSPECTOR_TEXTURE = Object.freeze({
    WINDOW_DEFAULT: 'tex.window.default',
    WINDOW_DARK: 'tex.window.dark',
    WINDOW_BLUE: 'tex.window.blue',
    WINDOW_WARM: 'tex.window.warm',
    WINDOW_GRID: 'tex.window.grid'
});

const TEXTURE_OPTIONS = Object.freeze([
    { id: INSPECTOR_TEXTURE.WINDOW_DEFAULT, label: 'Window (Default)', kind: 'window', style: WINDOW_STYLE.DEFAULT },
    { id: INSPECTOR_TEXTURE.WINDOW_DARK, label: 'Window (Dark)', kind: 'window', style: WINDOW_STYLE.DARK },
    { id: INSPECTOR_TEXTURE.WINDOW_BLUE, label: 'Window (Blue)', kind: 'window', style: WINDOW_STYLE.BLUE },
    { id: INSPECTOR_TEXTURE.WINDOW_WARM, label: 'Window (Warm)', kind: 'window', style: WINDOW_STYLE.WARM },
    { id: INSPECTOR_TEXTURE.WINDOW_GRID, label: 'Window (Grid)', kind: 'window', style: WINDOW_STYLE.GRID }
]);

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
    return null;
}
