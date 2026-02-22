// src/graphics/gui/terrain_debugger/view/controllers/TerrainDebuggerBiomeTilingController.js
// Biome tiling and flyover orchestration adapter for TerrainDebuggerView.
// @ts-check

function assertView(view) {
    if (!view || typeof view !== 'object') {
        throw new Error('[TerrainDebuggerBiomeTilingController] Missing TerrainDebuggerView instance');
    }
    return view;
}

export class TerrainDebuggerBiomeTilingController {
    constructor({ view } = {}) {
        this._view = assertView(view);
    }

    focusBiomeTransitionCamera() {
        this._view._focusBiomeTransitionCamera();
    }

    focusBiomeTilingCamera(mode) {
        this._view._focusBiomeTilingCamera(mode);
    }

    toggleFlyover() {
        this._view._toggleFlyover();
    }

    setFlyoverLoop(enabled) {
        this._view._setFlyoverLoop(enabled);
    }

    syncHref({ force = false } = {}) {
        this._view._syncBiomeTilingHref({ force });
    }

    stepFrame({ nowMs, dt, biomeTilingViewActive = false } = {}) {
        const view = this._view;
        const flyoverActive = !!view._flyover?.active;

        if (flyoverActive) view._updateFlyover(nowMs);
        else view._updateCameraFromKeys(dt);

        view.controls?.update?.(dt);
        view._syncBiomeTilingFocusUiState({ force: false });
        view._updateBiomeTilingCalibrationRigAnimation(nowMs);
        view._updateBiomeTilingSunOrbit(nowMs);

        const helperVisible = !!biomeTilingViewActive && !flyoverActive;
        if (view._biomeTilingAxisHelper) view._biomeTilingAxisHelper.visible = helperVisible;
        if (view._biomeTilingRingHelper) view._biomeTilingRingHelper.visible = helperVisible;
        if (view._biomeTilingTileLodHelper) view._biomeTilingTileLodHelper.visible = helperVisible;

        view._maybeFollowBiomeTilingDisplacementOverlay({ nowMs });
        view._maybeAutoRebuildBiomeTilingDisplacementOverlay({ nowMs });
        view._updateBiomeTilingLodMonitor({ nowMs });

        if (biomeTilingViewActive && nowMs - (Number(view._biomeTilingDiagnosticsLastSyncMs) || 0) >= 120) {
            view._biomeTilingDiagnosticsLastSyncMs = nowMs;
            view._syncBiomeTilingDiagnosticsUi();
        }
    }
}
