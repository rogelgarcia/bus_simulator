// src/states/SceneShortcutRegistry.js
// Registry of selectable scenes and their numeric shortcuts.

export const SCENE_SHORTCUT_REGISTRY = Object.freeze([
    {
        id: 'map_debugger',
        label: 'City Map',
        key: '1'
    },
    {
        id: 'test_mode',
        label: 'Test Mode',
        key: '2'
    },
    {
        id: 'connector_debugger',
        label: 'Rubins Debugger',
        key: '3'
    },
    {
        id: 'rapier_debugger',
        label: 'Rapier Debugger',
        key: '4'
    },
    {
        id: 'building_fabrication',
        label: 'Building Fabrication',
        key: '5'
    },
    {
        id: 'inspector_room',
        label: 'Inspector Room',
        key: '6'
    },
    {
        id: 'road_debugger',
        label: 'Road Debugger',
        key: '7'
    }
]);

export function getSelectableSceneShortcuts() {
    return SCENE_SHORTCUT_REGISTRY;
}

export function getSceneShortcutByKey(key) {
    const typed = typeof key === 'string' ? key.toUpperCase() : '';
    if (!typed) return null;
    return SCENE_SHORTCUT_REGISTRY.find((entry) => (entry?.key ?? '').toUpperCase() === typed) ?? null;
}

export function getSceneShortcutById(id) {
    const sceneId = typeof id === 'string' ? id : '';
    if (!sceneId) return null;
    return SCENE_SHORTCUT_REGISTRY.find((entry) => entry?.id === sceneId) ?? null;
}
