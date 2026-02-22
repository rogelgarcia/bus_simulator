// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildOutputPanel.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildOutputPanel(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildOutputPanel() {
        const panel = makeEl('div', 'ui-panel terrain-debugger-output-panel');
        panel.style.position = 'fixed';
        panel.style.left = '12px';
        panel.style.bottom = '12px';
        panel.style.zIndex = '220';
        panel.style.pointerEvents = 'none';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '6px';
        panel.style.maxWidth = '420px';
        panel.style.minWidth = '280px';
        panel.style.padding = '10px 12px';
        panel.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        panel.style.fontSize = '11px';
        panel.style.opacity = '0.95';

        const cameraXzRow = makeEl('div', 'terrain-debugger-output-row');
        cameraXzRow.style.display = 'flex';
        cameraXzRow.style.alignItems = 'baseline';
        cameraXzRow.style.gap = '8px';
        cameraXzRow.style.justifyContent = 'space-between';

        const cameraXzLabel = makeEl('div', 'terrain-debugger-output-label', 'Camera XZ');
        cameraXzLabel.style.fontSize = '11px';
        cameraXzLabel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        cameraXzLabel.style.letterSpacing = '0.04em';
        cameraXzLabel.style.textTransform = 'uppercase';
        cameraXzLabel.style.opacity = '0.8';
        const cameraXzValue = makeEl('div', 'terrain-debugger-output-value', 'X ------   Z ------');
        cameraXzValue.style.textAlign = 'right';
        cameraXzValue.style.whiteSpace = 'pre';
        cameraXzValue.style.fontVariantNumeric = 'tabular-nums';
        cameraXzValue.style.minWidth = '250px';
        cameraXzRow.appendChild(cameraXzLabel);
        cameraXzRow.appendChild(cameraXzValue);

        const cameraHeightRow = makeEl('div', 'terrain-debugger-output-row');
        cameraHeightRow.style.display = 'flex';
        cameraHeightRow.style.alignItems = 'baseline';
        cameraHeightRow.style.gap = '8px';
        cameraHeightRow.style.justifyContent = 'space-between';

        const cameraHeightLabel = makeEl('div', 'terrain-debugger-output-label', 'Camera Height (m)');
        cameraHeightLabel.style.fontSize = '11px';
        cameraHeightLabel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        cameraHeightLabel.style.letterSpacing = '0.04em';
        cameraHeightLabel.style.textTransform = 'uppercase';
        cameraHeightLabel.style.opacity = '0.8';
        const cameraHeightValue = makeEl('div', 'terrain-debugger-output-value', '-----.-- m');
        cameraHeightValue.style.textAlign = 'right';
        cameraHeightValue.style.whiteSpace = 'pre';
        cameraHeightValue.style.fontVariantNumeric = 'tabular-nums';
        cameraHeightValue.style.minWidth = '250px';
        cameraHeightRow.appendChild(cameraHeightLabel);
        cameraHeightRow.appendChild(cameraHeightValue);

        const pointerDistanceRow = makeEl('div', 'terrain-debugger-output-row');
        pointerDistanceRow.style.display = 'flex';
        pointerDistanceRow.style.alignItems = 'baseline';
        pointerDistanceRow.style.gap = '8px';
        pointerDistanceRow.style.justifyContent = 'space-between';

        const pointerDistanceLabel = makeEl('div', 'terrain-debugger-output-label', 'Pointer Distance');
        pointerDistanceLabel.style.fontSize = '11px';
        pointerDistanceLabel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
        pointerDistanceLabel.style.letterSpacing = '0.04em';
        pointerDistanceLabel.style.textTransform = 'uppercase';
        pointerDistanceLabel.style.opacity = '0.8';
        const pointerDistanceValue = makeEl('div', 'terrain-debugger-output-value', '---.- m');
        pointerDistanceValue.style.textAlign = 'right';
        pointerDistanceValue.style.whiteSpace = 'pre';
        pointerDistanceValue.style.fontVariantNumeric = 'tabular-nums';
        pointerDistanceValue.style.minWidth = '250px';
        pointerDistanceRow.appendChild(pointerDistanceLabel);
        pointerDistanceRow.appendChild(pointerDistanceValue);
        panel.appendChild(cameraXzRow);
        panel.appendChild(cameraHeightRow);
        panel.appendChild(pointerDistanceRow);
        this._outputPanel = panel;
        this._controls.outputCameraXzLine = cameraXzValue;
        this._controls.outputCameraHeightLine = cameraHeightValue;
        this._controls.outputPointerDistanceLine = pointerDistanceValue;
    };
}
