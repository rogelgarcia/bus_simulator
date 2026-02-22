// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildVisualizationTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildVisualizationTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildVisualizationTab() {
        const visualization = this._state.visualization && typeof this._state.visualization === 'object'
            ? this._state.visualization
            : {};
        this._state.visualization = visualization;

        const section = this._buildSection('visualization', 'Wireframe');
        const landRow = makeToggleRow({
            label: 'Land',
            value: !!visualization.landWireframe,
            tooltip: 'Render terrain using wireframe material mode.',
            onChange: (v) => {
                visualization.landWireframe = !!v;
                this._emit();
            }
        });
        section.appendChild(landRow.row);

        const asphaltRow = makeToggleRow({
            label: 'Asphalt (Curb + Sidewalk)',
            value: !!visualization.asphaltWireframe,
            tooltip: 'Render asphalt, curbs, and sidewalks as wireframes.',
            onChange: (v) => {
                visualization.asphaltWireframe = !!v;
                this._emit();
            }
        });
        section.appendChild(asphaltRow.row);
        this._controls.landWireframe = landRow;
        this._controls.asphaltWireframe = asphaltRow;
    };
}
