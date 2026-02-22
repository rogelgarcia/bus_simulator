// src/graphics/gui/terrain_debugger/view/controllers/TerrainDebuggerMaterialController.js
// Terrain material and shader synchronization adapter for TerrainDebuggerView.
// @ts-check

function assertView(view) {
    if (!view || typeof view !== 'object') {
        throw new Error('[TerrainDebuggerMaterialController] Missing TerrainDebuggerView instance');
    }
    return view;
}

export class TerrainDebuggerMaterialController {
    constructor({ view } = {}) {
        this._view = assertView(view);
    }

    applyBiomeTilingPerformanceSettings({ force = false } = {}) {
        this._view._applyBiomeTilingPerformanceSettings({ force });
    }

    syncTerrainBiomePbrMapsOnStandardMaterial() {
        this._view._syncTerrainBiomePbrMapsOnStandardMaterial();
    }

    updateTerrainPbrLegendUi() {
        this._view._updateTerrainPbrLegendUi();
    }

    applyTerrainViewBackgroundFallback() {
        this._view._applyTerrainViewBackgroundFallback();
    }

    applyIblState(iblState, { force = false } = {}) {
        return this._view._applyIblState(iblState, { force });
    }
}
