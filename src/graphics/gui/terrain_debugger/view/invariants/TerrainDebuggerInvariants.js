// src/graphics/gui/terrain_debugger/view/invariants/TerrainDebuggerInvariants.js
// Non-negotiable parity invariants for Terrain Debugger refactors.
// @ts-check

/** @typedef {{ id: string, description: string }} TerrainDebuggerInvariant */

/** @type {ReadonlyArray<TerrainDebuggerInvariant>} */
export const TERRAIN_DEBUGGER_PARITY_INVARIANTS = Object.freeze([
    Object.freeze({
        id: 'terrain_rendering_behavior',
        description: 'Terrain rendering path remains stable: debug view modes, wireframe toggles, and base terrain rebuild behavior are unchanged.'
    }),
    Object.freeze({
        id: 'biome_tiling_diagnostics',
        description: 'Biome tiling diagnostics remain operational: focus presets, LOD diagnostics, displacement diagnostics, and URL sync continue to work.'
    }),
    Object.freeze({
        id: 'flyover_tools',
        description: 'Flyover tools remain operational: start/stop, loop, debug overlay, and flyover camera status updates are unchanged.'
    }),
    Object.freeze({
        id: 'grass_controls',
        description: 'Grass controls remain operational: inspector actions, LOD inspector actions, stats, and LOD diagnostics keep their behavior.'
    }),
    Object.freeze({
        id: 'existing_hotkeys',
        description: 'Existing hotkeys remain functional: movement keys (WASD/Arrow), Shift fast move, Escape interaction guard, and camera keys preserve behavior.'
    })
]);

function hasFunction(value) {
    return typeof value === 'function';
}

/**
 * Runtime guard for expected parity-critical hooks.
 * @param {unknown} viewLike
 */
export function assertTerrainDebuggerParityInvariants(viewLike) {
    const view = viewLike && typeof viewLike === 'object' ? /** @type {Record<string, unknown>} */ (viewLike) : null;
    if (!view) throw new Error('[TerrainDebuggerInvariants] Expected TerrainDebuggerView instance');

    const requiredFns = [
        '_applyUiState',
        '_updateTerrainEngineMasks',
        '_updateTerrainHoverSample',
        '_syncBiomeTilingDiagnosticsUi',
        '_toggleFlyover',
        '_setFlyoverLoop',
        '_openGrassInspector',
        '_openGrassLodInspector',
        '_handleKey'
    ];
    for (const id of requiredFns) {
        if (!hasFunction(view[id])) {
            throw new Error(`[TerrainDebuggerInvariants] Missing required handler: ${id}`);
        }
    }
}
