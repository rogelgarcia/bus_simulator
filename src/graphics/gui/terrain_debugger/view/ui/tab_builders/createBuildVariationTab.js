// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildVariationTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildVariationTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildVariationTab() {
        const section = this._buildSection('variation', 'Variation');
        const terrainState = this._state.terrain;
        const variationState = (terrainState.variation && typeof terrainState.variation === 'object') ? terrainState.variation : {};
        terrainState.variation = variationState;
        if (!Number.isFinite(variationState.nearIntensity)) variationState.nearIntensity = 1.0;
        if (!Number.isFinite(variationState.farIntensity)) variationState.farIntensity = 0.55;

        const nearRow = makeNumberSliderRow({
            label: 'Near Intensity',
            value: Number(variationState.nearIntensity),
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variationState.nearIntensity = v;
                this._emit();
            }
        });
        section.appendChild(nearRow.row);

        const farRow = makeNumberSliderRow({
            label: 'Far Intensity',
            value: Number(variationState.farIntensity),
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variationState.farIntensity = v;
                this._emit();
            }
        });
        section.appendChild(farRow.row);

        section.appendChild(makeEl('div', 'options-note', 'Near/Far blend uses Terrain ▸ Distance Scaling distances.'));

        const layersSection = this._buildSection('variation', 'Layers');

        const addRow = makeEl('div', 'options-row options-row-wide');
        addRow.appendChild(makeEl('div', 'options-row-label', 'Add'));
        const addRight = makeEl('div', 'options-row-control options-row-control-wide');
        const addGroup = makeEl('div', 'options-choice-group');
        const addAnti = makeEl('button', 'options-choice-btn', 'Anti-Tiling');
        addAnti.type = 'button';
        addAnti.addEventListener('click', () => this._addLayer('anti_tiling'));
        const addPattern = makeEl('button', 'options-choice-btn', 'Pattern');
        addPattern.type = 'button';
        addPattern.addEventListener('click', () => this._addLayer('pattern'));
        addGroup.appendChild(addAnti);
        addGroup.appendChild(addPattern);
        addRight.appendChild(addGroup);
        addRow.appendChild(addRight);
        layersSection.appendChild(addRow);

        const host = makeEl('div', null);
        layersSection.appendChild(host);
        this._layersHost = host;
        this._renderVariationLayers();
    };
}
