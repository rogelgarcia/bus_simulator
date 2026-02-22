// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildEnvironmentTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildEnvironmentTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildEnvironmentTab() {
        const section = this._buildSection('environment', 'IBL');

        const enabledRow = makeToggleRow({
            label: 'IBL Enabled',
            value: this._state.ibl.enabled,
            onChange: (v) => {
                this._state.ibl.enabled = !!v;
                const disabled = !this._state.ibl.enabled;
                iblRow.select.disabled = disabled;
                bgRow.toggle.disabled = disabled;
                intensityRow.range.disabled = disabled;
                intensityRow.number.disabled = disabled;
                this._emit();
            }
        });
        section.appendChild(enabledRow.row);
        this._controls.iblEnabled = enabledRow;

        const iblRow = makeSelectRow({
            label: 'HDRI',
            value: this._state.ibl.iblId,
            options: getIblOptions(),
            onChange: (id) => {
                this._state.ibl.iblId = String(id ?? DEFAULT_IBL_ID);
                this._emit();
            }
        });
        section.appendChild(iblRow.row);
        this._controls.iblId = iblRow;

        const bgRow = makeToggleRow({
            label: 'Background',
            value: this._state.ibl.setBackground,
            onChange: (v) => {
                this._state.ibl.setBackground = !!v;
                this._emit();
            }
        });
        section.appendChild(bgRow.row);
        this._controls.iblBackground = bgRow;

        const intensityRow = makeNumberSliderRow({
            label: 'IBL Intensity',
            value: this._state.ibl.envMapIntensity,
            min: 0.0,
            max: 5.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.ibl.envMapIntensity = v;
                this._emit();
            }
        });
        section.appendChild(intensityRow.row);
        this._controls.iblIntensity = intensityRow;

        const exposureSection = this._buildSection('environment', 'Tone Mapping');
        const exposureRow = makeNumberSliderRow({
            label: 'Exposure',
            value: this._state.exposure,
            min: 0.1,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                this._state.exposure = v;
                this._emit();
            }
        });
        exposureSection.appendChild(exposureRow.row);
        this._controls.exposure = exposureRow;

        const terrain = this._state.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : {};
        const layoutState = (terrain.layout && typeof terrain.layout === 'object')
            ? terrain.layout
            : { extraEndTiles: 80, extraSideTiles: 20 };
        terrain.layout = layoutState;
        const slopeState = (terrain.slope && typeof terrain.slope === 'object')
            ? terrain.slope
            : { leftDeg: 1.5, rightDeg: 3.5, endDeg: 3, endStartAfterRoadTiles: 0 };
        terrain.slope = slopeState;
        if (!Number.isFinite(slopeState.endStartAfterRoadTiles)) slopeState.endStartAfterRoadTiles = 0;

        const cameraState = (this._state.camera && typeof this._state.camera === 'object')
            ? this._state.camera
            : { drawDistance: 4000, presetId: 'low', flyoverLoop: false };
        this._state.camera = cameraState;
        if (typeof cameraState.presetId !== 'string' || !cameraState.presetId) cameraState.presetId = 'low';
        cameraState.flyoverLoop = !!cameraState.flyoverLoop;

        const tilesSection = this._buildSection('environment', 'Terrain Tiles');
        const gridRow = makeToggleRow({
            label: 'Tile Grid',
            value: this._state.terrain.showGrid,
            onChange: (v) => {
                this._state.terrain.showGrid = !!v;
                this._emit();
            }
        });
        tilesSection.appendChild(gridRow.row);
        this._controls.showGrid = gridRow;

        const getBaseDepthTiles = () => Math.max(1, Math.round(Number(this._terrainBaseDepthTiles) || 16));
        const getTileSize = () => {
            const s = Number(this._terrainTileSize);
            return (Number.isFinite(s) && s > 0) ? s : 24;
        };
        const maxExtraEndTiles = 100;
        layoutState.extraEndTiles = Math.max(0, Math.min(maxExtraEndTiles, Math.round(Number(layoutState.extraEndTiles) || 0)));
        const getMaxCloudTiles = () => Math.max(0, Math.round(getBaseDepthTiles() + (Number(layoutState.extraEndTiles) || 0)));
        const syncCloudTilesMax = () => {
            const row = this._controls.cloudTiles;
            if (!row) return;
            const maxTiles = getMaxCloudTiles();
                row.range.max = String(maxTiles);
                row.number.max = String(maxTiles);
                const clamped = Math.max(0, Math.round(clamp(this._state.terrain.cloud.tiles, 0, maxTiles, 0)));
                if (clamped !== this._state.terrain.cloud.tiles) {
                    this._state.terrain.cloud.tiles = clamped;
                    row.range.value = String(clamped);
                    row.number.value = String(clamped.toFixed(0));
                }
            };
        this._syncCloudTilesMax = syncCloudTilesMax;
        const getDrawDistanceMax = () => {
            const maxDepthTiles = getBaseDepthTiles() + maxExtraEndTiles;
            const maxDepthMeters = maxDepthTiles * getTileSize();
            return Math.max(2000, maxDepthMeters + 4000);
        };
        const getDrawDistanceMinForTerrain = () => {
            const depthTiles = getBaseDepthTiles() + Math.max(0, Math.round(Number(layoutState.extraEndTiles) || 0));
            const depthMeters = depthTiles * getTileSize();
            return Math.max(1200, depthMeters + 600);
        };
        const syncDrawDistanceForTerrain = () => {
            const row = this._controls.drawDistance;
            if (!row) return;
            const minDist = getDrawDistanceMinForTerrain();
            const maxDist = getDrawDistanceMax();
            row.range.max = String(maxDist);
            row.number.max = String(maxDist);
            if (!Number.isFinite(cameraState.drawDistance)) cameraState.drawDistance = minDist;
            const next = clamp(cameraState.drawDistance, 100, maxDist, minDist);
            const bumped = next < minDist ? minDist : next;
            if (bumped !== cameraState.drawDistance) {
                cameraState.drawDistance = bumped;
                row.range.value = String(bumped);
                row.number.value = String(bumped.toFixed(0));
            }
        };
        this._syncDrawDistanceForTerrain = syncDrawDistanceForTerrain;

        const extraEndRow = makeNumberSliderRow({
            label: 'Extra End Tiles (far)',
            value: layoutState.extraEndTiles,
            min: 0,
            max: maxExtraEndTiles,
            step: 1,
            digits: 0,
            onChange: (v) => {
                layoutState.extraEndTiles = Math.round(v);
                syncCloudTilesMax();
                syncDrawDistanceForTerrain();
                this._emit();
            }
        });
        tilesSection.appendChild(extraEndRow.row);
        this._controls.extraEndTiles = extraEndRow;

            const extraSideRow = makeNumberSliderRow({
                label: 'Extra Side Tiles (each)',
                value: layoutState.extraSideTiles,
                min: 0,
                max: 40,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    layoutState.extraSideTiles = Math.round(v);
                    this._emit();
                }
            });
            tilesSection.appendChild(extraSideRow.row);
            this._controls.extraSideTiles = extraSideRow;

            const slopeSection = this._buildSection('environment', 'Terrain Inclination');
            const slopeLeftRow = makeNumberSliderRow({
                label: 'Left Hill (deg)',
                value: slopeState.leftDeg,
                min: 0,
                max: 60,
                step: 0.5,
                digits: 1,
                onChange: (v) => {
                    slopeState.leftDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeLeftRow.row);
            this._controls.slopeLeftDeg = slopeLeftRow;

            const slopeRightRow = makeNumberSliderRow({
                label: 'Right Hill (deg)',
                value: slopeState.rightDeg,
                min: 0,
                max: 60,
                step: 0.5,
                digits: 1,
                onChange: (v) => {
                    slopeState.rightDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeRightRow.row);
            this._controls.slopeRightDeg = slopeRightRow;

            const slopeEndRow = makeNumberSliderRow({
                label: 'End Inclination (deg)',
                value: slopeState.endDeg,
                min: -20,
                max: 20,
                step: 0.25,
                digits: 2,
                onChange: (v) => {
                    slopeState.endDeg = v;
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeEndRow.row);
            this._controls.slopeEndDeg = slopeEndRow;

            const slopeEndStartRow = makeNumberSliderRow({
                label: 'End Hill Start After Road (tiles)',
                value: slopeState.endStartAfterRoadTiles,
                min: 0,
                max: 80,
                step: 1,
                digits: 0,
                onChange: (v) => {
                    slopeState.endStartAfterRoadTiles = Math.max(0, Math.round(v));
                    this._emit();
                }
            });
            slopeSection.appendChild(slopeEndStartRow.row);
            this._controls.slopeEndStartAfterRoadTiles = slopeEndStartRow;

            const cloudSection = this._buildSection('environment', 'Cloud Displacement');
            const cloudState = this._state.terrain.cloud;

            const cloudEnabledRow = makeToggleRow({
                label: 'Enabled',
                value: cloudState.enabled !== false,
                onChange: (v) => {
                    cloudState.enabled = !!v;
                    const disabled = cloudState.enabled === false;
                    ampRow.range.disabled = disabled;
                    ampRow.number.disabled = disabled;
                    scaleRow.range.disabled = disabled;
                    scaleRow.number.disabled = disabled;
                    tilesRow.range.disabled = disabled;
                    tilesRow.number.disabled = disabled;
                    blendRow.range.disabled = disabled;
                    blendRow.number.disabled = disabled;
                    this._emit();
                }
            });
            cloudSection.appendChild(cloudEnabledRow.row);
            this._controls.cloudEnabled = cloudEnabledRow;

            const ampRow = makeNumberSliderRow({
                label: 'Amplitude',
                value: cloudState.amplitude,
                min: 0.0,
                max: 35.0,
                step: 0.1,
                digits: 1,
                onChange: (v) => {
                    cloudState.amplitude = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(ampRow.row);
            this._controls.cloudAmplitude = ampRow;

            const scaleRow = makeNumberSliderRow({
                label: 'World Scale',
                value: cloudState.worldScale,
                min: 0.005,
                max: 0.25,
                step: 0.001,
                digits: 3,
                onChange: (v) => {
                    cloudState.worldScale = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(scaleRow.row);
            this._controls.cloudWorldScale = scaleRow;

            const tilesRow = makeNumberSliderRow({
                label: 'Tiles (from end)',
                value: cloudState.tiles,
                min: 0,
                max: getMaxCloudTiles(),
                step: 1,
                digits: 0,
                onChange: (v) => {
                    cloudState.tiles = Math.max(0, Math.round(v));
                    this._emit();
                }
            });
            cloudSection.appendChild(tilesRow.row);
            this._controls.cloudTiles = tilesRow;

            const blendRow = makeNumberSliderRow({
                label: 'Blend (m)',
                value: cloudState.blendMeters,
                min: 0.0,
                max: 1000.0,
                step: 1.0,
                digits: 0,
                onChange: (v) => {
                    cloudState.blendMeters = v;
                    this._emit();
                }
            });
            cloudSection.appendChild(blendRow.row);
            this._controls.cloudBlendMeters = blendRow;

            const cloudDisabled = cloudState.enabled === false;
            ampRow.range.disabled = cloudDisabled;
            ampRow.number.disabled = cloudDisabled;
            scaleRow.range.disabled = cloudDisabled;
            scaleRow.number.disabled = cloudDisabled;
            tilesRow.range.disabled = cloudDisabled;
            tilesRow.number.disabled = cloudDisabled;
            blendRow.range.disabled = cloudDisabled;
            blendRow.number.disabled = cloudDisabled;
            syncCloudTilesMax();

        const cameraSection = this._buildSection('environment', 'Camera');
        const drawDistanceRow = makeNumberSliderRow({
            label: 'Draw Distance (m)',
            value: cameraState.drawDistance,
            min: 100,
            max: getDrawDistanceMax(),
            step: 10,
            digits: 0,
            onChange: (v) => {
                cameraState.drawDistance = v;
                this._emit();
            }
        });
        cameraSection.appendChild(drawDistanceRow.row);
        this._controls.drawDistance = drawDistanceRow;

        syncDrawDistanceForTerrain();

        const resetRow = makeButtonRow({
            label: 'Reset',
            text: 'Reset Camera',
            onClick: () => this._dispatchUiAction(createTerrainDebuggerResetCameraAction())
        });
        cameraSection.appendChild(resetRow.row);
        this._controls.resetCamera = resetRow;

        const presetRow = makeChoiceRow({
            label: 'Presets',
            value: cameraState.presetId,
            options: [
                { id: 'low', label: 'Low' },
                { id: 'high', label: 'High' },
                { id: 'high_far', label: 'High (Far)' },
                { id: 'behind_gameplay', label: 'Behind Bus (Gameplay)' },
                { id: 'behind_low_horizon', label: 'Behind Bus (Low / Horizon)' }
            ],
            onChange: (id) => {
                const nextId = String(id ?? 'low');
                cameraState.presetId = nextId;
                this._emit();
                this._dispatchUiAction(createTerrainDebuggerCameraPresetAction(nextId));
            }
        });
        cameraSection.appendChild(presetRow.row);
        this._controls.cameraPreset = presetRow;

        const flyoverRow = makeButtonRow({
            label: 'Flyover',
            text: 'Start',
            onClick: () => this._dispatchUiAction(createTerrainDebuggerToggleFlyoverAction())
        });
        cameraSection.appendChild(flyoverRow.row);
        this._controls.flyoverToggle = flyoverRow;

        const loopRow = makeToggleRow({
            label: 'Loop',
            value: cameraState.flyoverLoop,
            onChange: (v) => {
                cameraState.flyoverLoop = !!v;
                this._dispatchUiAction(createTerrainDebuggerFlyoverLoopChangedAction(cameraState.flyoverLoop));
                this._emit();
            }
        });
        cameraSection.appendChild(loopRow.row);
        this._controls.flyoverLoop = loopRow;

        const statusNote = makeEl('div', 'options-note', '');
        cameraSection.appendChild(statusNote);
        this._controls.cameraStatusNote = statusNote;

            const iblDisabled = !this._state.ibl.enabled;
            iblRow.select.disabled = iblDisabled;
            bgRow.toggle.disabled = iblDisabled;
            intensityRow.range.disabled = iblDisabled;
            intensityRow.number.disabled = iblDisabled;
    };
}
