// src/graphics/gui/terrain_debugger/view/contracts/TerrainDebuggerUiActionContract.js
// Typed action contract between TerrainDebuggerUI and TerrainDebuggerView.
// @ts-check

/**
 * @typedef {Object} TerrainDebuggerUiAction
 * @property {string} type
 * @property {Object<string, unknown>} payload
 */

export const TerrainDebuggerUiActionType = Object.freeze({
    STATE_CHANGED: 'terrain_debugger.ui.state_changed',
    RESET_CAMERA: 'terrain_debugger.ui.reset_camera',
    CAMERA_PRESET: 'terrain_debugger.ui.camera_preset',
    FOCUS_BIOME_TRANSITION: 'terrain_debugger.ui.focus_biome_transition',
    FOCUS_BIOME_TILING: 'terrain_debugger.ui.focus_biome_tiling',
    TOGGLE_FLYOVER: 'terrain_debugger.ui.toggle_flyover',
    FLYOVER_LOOP_CHANGED: 'terrain_debugger.ui.flyover_loop_changed',
    INSPECT_GRASS: 'terrain_debugger.ui.inspect_grass',
    INSPECT_GRASS_LOD: 'terrain_debugger.ui.inspect_grass_lod'
});

function freezePayload(payload) {
    return Object.freeze({ ...(payload && typeof payload === 'object' ? payload : {}) });
}

/**
 * @param {string} type
 * @param {Object<string, unknown>} [payload]
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerUiAction(type, payload = {}) {
    return Object.freeze({
        type: String(type ?? ''),
        payload: freezePayload(payload)
    });
}

/**
 * @param {unknown} value
 * @returns {value is TerrainDebuggerUiAction}
 */
export function isTerrainDebuggerUiAction(value) {
    const action = value && typeof value === 'object' ? /** @type {TerrainDebuggerUiAction} */ (value) : null;
    return !!(
        !!action
        && typeof action.type === 'string'
        && !!action.type
        && action.payload
        && typeof action.payload === 'object'
    );
}

/**
 * @param {unknown} state
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerStateChangedAction(state) {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.STATE_CHANGED, { state });
}

/**
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerResetCameraAction() {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.RESET_CAMERA);
}

/**
 * @param {string} presetId
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerCameraPresetAction(presetId) {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.CAMERA_PRESET, {
        presetId: String(presetId ?? '')
    });
}

/**
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerFocusBiomeTransitionAction() {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.FOCUS_BIOME_TRANSITION);
}

/**
 * @param {string} mode
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerFocusBiomeTilingAction(mode) {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.FOCUS_BIOME_TILING, {
        mode: String(mode ?? '')
    });
}

/**
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerToggleFlyoverAction() {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.TOGGLE_FLYOVER);
}

/**
 * @param {boolean} enabled
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerFlyoverLoopChangedAction(enabled) {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.FLYOVER_LOOP_CHANGED, {
        enabled: !!enabled
    });
}

/**
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerInspectGrassAction() {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.INSPECT_GRASS);
}

/**
 * @param {string} tier
 * @returns {TerrainDebuggerUiAction}
 */
export function createTerrainDebuggerInspectGrassLodAction(tier) {
    return createTerrainDebuggerUiAction(TerrainDebuggerUiActionType.INSPECT_GRASS_LOD, {
        tier: String(tier ?? '')
    });
}
