// src/states/SceneShortcutRegistry.js
// Registry of selectable scenes and their shortcuts.

export const Q_MENU_GROUP = Object.freeze({
    fabrication: 'fabrication',
    debuggers: 'debuggers'
});

export const SCENE_SHORTCUT_REGISTRY = Object.freeze([
    Object.freeze({
        id: 'map_debugger',
        label: 'City Map',
        key: '1',
        description: 'City layout and road authoring surface',
        qGroup: Q_MENU_GROUP.fabrication,
        href: 'screens/map_debugger.html'
    }),
    Object.freeze({
        id: 'test_mode',
        label: 'Test Mode',
        key: 'T',
        description: 'Gameplay/system sanity checks and diagnostics',
        qGroup: Q_MENU_GROUP.debuggers,
        href: 'screens/test_mode.html'
    }),
    Object.freeze({
        id: 'connector_debugger',
        label: 'Rubins Debugger',
        key: 'R',
        description: 'Connector geometry and transition debugging',
        qGroup: Q_MENU_GROUP.debuggers,
        href: 'screens/connector_debugger.html'
    }),
    Object.freeze({
        id: 'rapier_debugger',
        label: 'Rapier Debugger',
        key: 'P',
        description: 'Vehicle and physics tuning diagnostics',
        qGroup: Q_MENU_GROUP.debuggers,
        href: 'screens/rapier_debugger.html'
    }),
    Object.freeze({
        id: 'building_fabrication',
        label: 'Building Fabrication',
        key: '3',
        description: 'Legacy building fabrication workspace',
        qGroup: Q_MENU_GROUP.fabrication,
        href: 'screens/building_fabrication.html'
    }),
    Object.freeze({
        id: 'inspector_room',
        label: 'Inspector Room',
        key: 'I',
        description: 'Isolated mesh/lighting inspection environment',
        qGroup: Q_MENU_GROUP.debuggers,
        href: 'screens/inspector_room.html'
    }),
    Object.freeze({
        id: 'material_calibration',
        label: 'Material Calibration',
        key: '5',
        description: 'PBR calibration and material look-dev',
        qGroup: Q_MENU_GROUP.fabrication,
        href: 'screens/material_calibration.html'
    }),
    Object.freeze({
        id: 'road_debugger',
        label: 'Road Debugger',
        key: '2',
        description: 'Road/asphalt authoring and validation',
        qGroup: Q_MENU_GROUP.fabrication,
        href: 'screens/road_debugger.html'
    }),
    Object.freeze({
        id: 'building_fabrication2',
        label: 'Building Fabrication 2',
        key: '4',
        description: 'Current bay/facade building fabrication flow',
        qGroup: Q_MENU_GROUP.fabrication,
        href: 'screens/building_fabrication2.html'
    })
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

export function isLaunchableSceneId(id) {
    return !!getSceneShortcutById(id);
}
