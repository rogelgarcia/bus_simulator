// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildBiomeTilingTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildBiomeTilingTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildBiomeTilingTab() {
        const terrain = this._state.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : {};
        this._state.terrain = terrain;
        const visualization = this._state.visualization && typeof this._state.visualization === 'object'
            ? this._state.visualization
            : {};
        this._state.visualization = visualization;
        const bt = (terrain.biomeTiling && typeof terrain.biomeTiling === 'object') ? terrain.biomeTiling : {};
        terrain.biomeTiling = bt;

        const materialOptionsRaw = getPbrMaterialOptionsForGround();
        const materialOptions = (Array.isArray(materialOptionsRaw) ? materialOptionsRaw : [])
            .map((opt) => ({
                id: String(opt?.id ?? ''),
                label: String(opt?.label ?? opt?.id ?? ''),
                previewUrl: String(opt?.previewUrl ?? '')
            }))
            .filter((opt) => !!opt.id);
        const materialById = new Map(materialOptions.map((opt) => [opt.id, opt]));
        const validMaterialIds = new Set(materialOptions.map((opt) => opt.id));
        const defaultMaterialId = materialOptions[0]?.id ?? 'pbr.ground_037';
        const normalizeMaterialId = (value, fallback) => {
            const id = String(value ?? '').trim();
            if (validMaterialIds.has(id)) return id;
            if (validMaterialIds.has(String(fallback ?? ''))) return String(fallback);
            return defaultMaterialId;
        };
        const normalizeRebuildCadence = (value, fallbackSeconds = 1.0) => {
            const raw = String(value ?? '').trim().toLowerCase();
            if (!raw || raw === 'off' || raw === 'none' || raw === 'no_auto') return 'off';
            if (raw === 'frame' || raw === '1f' || raw === 'f1') return 'frame';
            if (raw === 'frame_2' || raw === '2f' || raw === 'f2' || raw === '/2') return 'frame_2';
            if (raw === 'frame_8' || raw === '8f' || raw === 'f8' || raw === '/8') return 'frame_8';
            if (raw === '1s') return 'sec:1';
            const secMatch = raw.match(/^sec:([0-9]*\.?[0-9]+)$/);
            if (secMatch) {
                const sec = clamp(Number(secMatch[1]), 0.1, 60.0, fallbackSeconds);
                return `sec:${Number(sec.toFixed(2))}`;
            }
            const asNumber = Number(raw);
            if (Number.isFinite(asNumber) && asNumber > 0) {
                const sec = clamp(asNumber, 0.1, 60.0, fallbackSeconds);
                return `sec:${Number(sec.toFixed(2))}`;
            }
            return 'off';
        };
        const normalizeRebuildCadenceChoice = (value) => {
            const normalized = normalizeRebuildCadence(value, 1.0);
            if (normalized === 'off' || normalized === 'frame' || normalized === 'frame_2' || normalized === 'frame_8') {
                return normalized;
            }
            return 'sec:1';
        };
        const normalizeGeometryPreset = (value, fallback = 'medium') => {
            const raw = String(value ?? '').trim().toLowerCase();
            if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
            const fb = String(fallback ?? '').trim().toLowerCase();
            if (fb === 'low' || fb === 'medium' || fb === 'high') return fb;
            return 'medium';
        };

        bt.calibrationRigDebugEnabled = bt.calibrationRigDebugEnabled === true;
        bt.materialId = normalizeMaterialId(bt.materialId, defaultMaterialId);
        const distanceTiling = (bt.distanceTiling && typeof bt.distanceTiling === 'object') ? bt.distanceTiling : {};
        distanceTiling.enabled = distanceTiling.enabled === true;
        distanceTiling.nearScale = clamp(distanceTiling.nearScale, 0.1, 6.0, 4.0);
        distanceTiling.farScale = clamp(distanceTiling.farScale, 0.01, 2.0, 0.36);
        distanceTiling.blendStartMeters = clamp(distanceTiling.blendStartMeters, 0.0, 500.0, 40.0);
        distanceTiling.blendEndMeters = clamp(distanceTiling.blendEndMeters, 0.0, 2000.0, 240.0);
        if (distanceTiling.blendEndMeters <= distanceTiling.blendStartMeters + 1.0) {
            distanceTiling.blendEndMeters = Math.min(2000.0, distanceTiling.blendStartMeters + 1.0);
        }
        distanceTiling.blendCurve = clamp(distanceTiling.blendCurve, 0.35, 3.0, 1.0);
        const rawDistanceDebug = String(distanceTiling.debugView ?? 'blended');
        distanceTiling.debugView = rawDistanceDebug === 'near' || rawDistanceDebug === 'far' ? rawDistanceDebug : 'blended';
        bt.distanceTiling = distanceTiling;

        const variation = (bt.variation && typeof bt.variation === 'object') ? bt.variation : {};
        variation.antiTilingEnabled = variation.antiTilingEnabled === true;
        variation.antiTilingStrength = clamp(variation.antiTilingStrength, 0.0, 2.0, 0.45);
        variation.antiTilingCellMeters = clamp(variation.antiTilingCellMeters, 0.25, 12.0, 2.0);
        variation.macroVariationEnabled = variation.macroVariationEnabled === true;
        variation.macroVariationStrength = clamp(variation.macroVariationStrength, 0.0, 0.8, 0.16);
        variation.macroVariationScale = clamp(variation.macroVariationScale, 0.002, 0.2, 0.02);
        variation.nearIntensity = clamp(variation.nearIntensity, 0.0, 2.0, 1.0);
        variation.farIntensity = clamp(variation.farIntensity, 0.0, 2.0, 0.65);
        bt.variation = variation;

        const displacement = (bt.displacement && typeof bt.displacement === 'object') ? bt.displacement : {};
        displacement.enabled = displacement.enabled === true;
        displacement.strength = clamp(displacement.strength, 0.0, 0.2, 0.02);
        displacement.bias = clamp(displacement.bias, -10.0, 10.0, 0.0);
        const displacementSourceRaw = String(displacement.source ?? 'auto');
        displacement.source = (displacementSourceRaw === 'displacement'
            || displacementSourceRaw === 'ao'
            || displacementSourceRaw === 'orm')
            ? displacementSourceRaw
            : 'auto';
        const displacementDebugRaw = String(displacement.debugView ?? 'standard');
        displacement.debugView = (displacementDebugRaw === 'wireframe' || displacementDebugRaw === 'displacement')
            ? displacementDebugRaw
            : 'standard';
        bt.displacement = displacement;

        const geometryDensity = (bt.geometryDensity && typeof bt.geometryDensity === 'object') ? bt.geometryDensity : {};
        const hasGeometryEnabled = Object.prototype.hasOwnProperty.call(geometryDensity, 'enabled');
        const hasDetailPreset = Object.prototype.hasOwnProperty.call(geometryDensity, 'detailPreset');
        const detailPresetRaw = String(
            hasDetailPreset ? geometryDensity.detailPreset : 'medium'
        ).trim().toLowerCase();
        geometryDensity.enabled = hasGeometryEnabled
            ? (geometryDensity.enabled === true && detailPresetRaw !== 'off')
            : (hasDetailPreset && detailPresetRaw !== 'off');
        geometryDensity.detailPreset = normalizeGeometryPreset(detailPresetRaw, 'medium');
        const tileSizeMeters = Math.max(0.001, Number(this._terrainTileSize) || 24);
        const thresholdsTiles = geometryDensity.detailPreset === 'low'
            ? [0, 1, 2, 4]
            : geometryDensity.detailPreset === 'high'
                ? [1, 3, 6, 12]
                : [0, 2, 4, 8];
        geometryDensity.mode = geometryDensity.enabled ? 'adaptive_rings' : 'uniform';
        geometryDensity.segmentsPerTile = 1;
        geometryDensity.nearSegmentsPerTile = 16;
        geometryDensity.farSegmentsPerTile = 1;
        geometryDensity.nearRadiusMeters = Math.max(0, thresholdsTiles[0] * tileSizeMeters);
        geometryDensity.transitionWidthMeters = Math.max(0, (thresholdsTiles[1] - thresholdsTiles[0]) * tileSizeMeters);
        geometryDensity.renderDistanceMeters = Math.max(0, thresholdsTiles[3] * tileSizeMeters);
        geometryDensity.transitionSmoothing = clamp(geometryDensity.transitionSmoothing, 0.0, 1.0, 0.72);
        geometryDensity.transitionBias = clamp(geometryDensity.transitionBias, -0.85, 0.85, 0.0);
        geometryDensity.transitionDebugBands = Math.max(0, Math.min(6, Math.round(Number(geometryDensity.transitionDebugBands) || 0)));
        geometryDensity.ringOverlayEnabled = geometryDensity.ringOverlayEnabled === true;
        geometryDensity.tileLodDebugEnabled = geometryDensity.tileLodDebugEnabled === true;
        geometryDensity.centerOnApplyCamera = geometryDensity.centerOnApplyCamera !== false;
        geometryDensity.waveStrength = clamp(geometryDensity.waveStrength, 0.0, 1.0, 0.02);
        geometryDensity.waveMaxHeightMeters = clamp(geometryDensity.waveMaxHeightMeters, 0.0, 10.0, 2.0);
        geometryDensity.waveMaxNeighborDeltaMeters = clamp(geometryDensity.waveMaxNeighborDeltaMeters, 0.0, 2.0, 0.5);
        geometryDensity.waveMaxTileRangeMeters = clamp(geometryDensity.waveMaxTileRangeMeters, 0.0, 20.0, 0.5);
        geometryDensity.rebuildCadence = normalizeRebuildCadence(geometryDensity.rebuildCadence, 1.0);
        geometryDensity.centerX = Number.isFinite(Number(geometryDensity.centerX)) ? Number(geometryDensity.centerX) : 0;
        geometryDensity.centerZ = Number.isFinite(Number(geometryDensity.centerZ)) ? Number(geometryDensity.centerZ) : 0;
        geometryDensity.applyNonce = Math.max(0, Math.round(Number(geometryDensity.applyNonce) || 0));
        if (!geometryDensity.enabled) geometryDensity.mode = 'uniform';
        bt.geometryDensity = geometryDensity;

        const performance = (bt.performance && typeof bt.performance === 'object') ? bt.performance : {};
        performance.fragmentShaderEnabled = performance.fragmentShaderEnabled === true;
        performance.fragmentShaderBiomeEnabled = TERRAIN_BIOME_SHADER_TEMP_DISABLED ? false : performance.fragmentShaderBiomeEnabled === true;
        performance.fragmentShaderPbrLightingEnabled = performance.fragmentShaderPbrLightingEnabled === true;
        performance.fragmentShaderAlbedoEnabled = performance.fragmentShaderAlbedoEnabled === true;
        performance.fragmentShaderSurfaceEnabled = performance.fragmentShaderSurfaceEnabled === true;
        performance.shadowsEnabled = performance.shadowsEnabled !== false;
        performance.highDpiEnabled = performance.highDpiEnabled !== false;
        bt.performance = performance;

        const setSliderValue = (ctrl, value, digits = 2) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(v.toFixed(digits));
        };

        const createMaterialPickerRow = ({ label, onPick }) => {
            const row = makeEl('div', 'options-row');
            const left = makeEl('div', 'options-row-label', label);
            const right = makeEl('div', 'options-row-control');
            const button = makeEl('button', 'options-btn');
            button.type = 'button';
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.gap = '10px';
            button.style.minWidth = '220px';
            button.style.maxWidth = '100%';
            button.style.textAlign = 'left';
            button.addEventListener('click', () => onPick?.());

            const thumb = makeEl('div', null);
            thumb.style.width = '60px';
            thumb.style.height = '40px';
            thumb.style.borderRadius = '6px';
            thumb.style.border = '1px solid rgba(0,0,0,0.35)';
            thumb.style.overflow = 'hidden';
            thumb.style.flex = '0 0 auto';

            const text = makeEl('div', null, '');
            text.style.fontSize = '11px';
            text.style.opacity = '0.9';
            text.style.wordBreak = 'break-word';
            text.style.minWidth = '0';

            button.appendChild(thumb);
            button.appendChild(text);
            right.appendChild(button);
            row.appendChild(left);
            row.appendChild(right);
            return {
                row,
                setValue: ({ materialId, materialLabel, previewUrl }) => {
                    thumb.textContent = '';
                    const url = String(previewUrl ?? '').trim();
                    if (url) {
                        thumb.style.background = '';
                        const img = document.createElement('img');
                        img.src = url;
                        img.alt = String(materialLabel ?? materialId ?? '');
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        thumb.appendChild(img);
                    } else {
                        thumb.style.background = 'linear-gradient(135deg, #4e4e4e, #808080)';
                    }
                    text.textContent = String(materialLabel ?? materialId ?? '(none)');
                }
            };
        };

        const openMaterialPicker = () => {
            const sections = getPbrMaterialClassSectionsForGround().map((section) => ({
                label: section.label,
                options: (section.options ?? []).map((opt) => ({
                    id: String(opt?.id ?? ''),
                    label: String(opt?.label ?? opt?.id ?? ''),
                    kind: 'texture',
                    previewUrl: opt?.previewUrl ?? null
                })).filter((opt) => !!opt.id)
            })).filter((section) => Array.isArray(section.options) && section.options.length > 0);
            if (!sections.length) return;
            this._pickerPopup?.open?.({
                title: 'Biome Tiling Texture',
                sections,
                selectedId: bt.materialId,
                onSelect: (opt) => {
                    bt.materialId = normalizeMaterialId(opt?.id, defaultMaterialId);
                    syncUi();
                    this._emit();
                }
            });
        };

        const focusSection = this._buildSection('biome_tiling', 'Focus');
        const focusButtonsRow = makeEl('div', null);
        focusButtonsRow.style.display = 'grid';
        focusButtonsRow.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        focusButtonsRow.style.gap = '8px';

        const focusOverviewBtn = makeEl('button', 'options-btn terrain-focus-btn', 'Overview');
        focusOverviewBtn.type = 'button';
        focusOverviewBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('overview')));

        const focusBusBtn = makeEl('button', 'options-btn terrain-focus-btn', 'Bus High');
        focusBusBtn.type = 'button';
        focusBusBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('bus_high')));

        const focusEyeBtn = makeEl('button', 'options-btn terrain-focus-btn', 'Focus Eye');
        focusEyeBtn.type = 'button';
        focusEyeBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('eye_1p8')));

        const flyoverBtn = makeEl('button', 'options-btn terrain-focus-btn', 'Flyover');
        flyoverBtn.type = 'button';
        flyoverBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('flyover')));

        focusButtonsRow.appendChild(focusOverviewBtn);
        focusButtonsRow.appendChild(focusBusBtn);
        focusButtonsRow.appendChild(focusEyeBtn);
        focusButtonsRow.appendChild(flyoverBtn);
        focusSection.appendChild(focusButtonsRow);
        this._controls.biomeTilingFocusButtons = {
            overview: focusOverviewBtn,
            bus_high: focusBusBtn,
            eye_1p8: focusEyeBtn
        };

        const debugRunsRow = makeEl('div', 'options-row');
        const debugRunsLabel = makeEl('div', 'options-row-label', 'Debug Runs');
        const debugRunsControl = makeEl('div', 'options-row-control');
        debugRunsControl.style.gap = '8px';

        const flyoverDebugBtn = makeEl('button', 'options-btn', 'Flyover Debug Run');
        flyoverDebugBtn.type = 'button';
        flyoverDebugBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('flyover_debug')));
        debugRunsControl.appendChild(flyoverDebugBtn);

        const sunOrbitBtn = makeEl('button', 'options-btn', 'Sun Orbit Run');
        sunOrbitBtn.type = 'button';
        sunOrbitBtn.addEventListener('click', () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTilingAction('sun_orbit')));
        debugRunsControl.appendChild(sunOrbitBtn);

        debugRunsRow.appendChild(debugRunsLabel);
        debugRunsRow.appendChild(debugRunsControl);
        focusSection.appendChild(debugRunsRow);

        const rigDebugRow = makeToggleRow({
            label: 'Calibration Rig Debug',
            value: bt.calibrationRigDebugEnabled,
            tooltip: 'Spawns the calibration panel/sphere/cube rig above the terrain and animates camera + sun to the calibration pose (4s ease-in-out).',
            onChange: (v) => {
                bt.calibrationRigDebugEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        focusSection.appendChild(rigDebugRow.row);

        const textureSection = this._buildSection('biome_tiling', 'Texture');
        const materialRow = createMaterialPickerRow({
            label: 'PBR Texture',
            onPick: () => openMaterialPicker()
        });
        textureSection.appendChild(materialRow.row);
        const textureNearScaleRow = makeNumberSliderRow({
            label: 'Size',
            value: distanceTiling.nearScale,
            min: 0.1,
            max: 6.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                distanceTiling.nearScale = v;
                this._emit();
            }
        });
        textureSection.appendChild(textureNearScaleRow.row);

        const biomeTilingSubtabsHost = makeEl('div', 'options-section');
        biomeTilingSubtabsHost.style.padding = '10px 12px';
        const biomeTilingSubtabsBar = makeEl('div', 'options-tabs');
        const biomeTilingSubtabsBody = makeEl('div', null);
        biomeTilingSubtabsBody.style.display = 'block';
        biomeTilingSubtabsBody.style.marginTop = '8px';
        const biomeTilingSubtabs = [
            { id: 'config', label: 'Config' },
            { id: 'dynamic_size', label: 'Distance Blend' },
            { id: 'variation', label: 'Anti-tiling' },
            { id: 'lod', label: 'LOD' },
            { id: 'displacement', label: 'Displacement' },
            { id: 'diagnostics', label: 'Diagnostics' }
        ];
        const biomeTilingSubtabButtons = new Map();
        const biomeTilingSubtabPanels = new Map();
        const setBiomeTilingSubtab = (id) => {
            const next = biomeTilingSubtabPanels.has(id) ? id : 'config';
            for (const [key, btn] of biomeTilingSubtabButtons.entries()) btn.classList.toggle('is-active', key === next);
            for (const [key, panel] of biomeTilingSubtabPanels.entries()) panel.style.display = key === next ? '' : 'none';
        };
        for (const def of biomeTilingSubtabs) {
            const btn = makeEl('button', 'options-tab', def.label);
            btn.type = 'button';
            btn.style.textTransform = 'none';
            btn.style.letterSpacing = '0';
            btn.addEventListener('click', () => setBiomeTilingSubtab(def.id));
            biomeTilingSubtabsBar.appendChild(btn);
            biomeTilingSubtabButtons.set(def.id, btn);

            const panel = makeEl('div', null);
            panel.style.display = 'none';
            panel.style.marginTop = '8px';
            biomeTilingSubtabPanels.set(def.id, panel);
            biomeTilingSubtabsBody.appendChild(panel);
        }
        biomeTilingSubtabsHost.appendChild(biomeTilingSubtabsBar);
        biomeTilingSubtabsHost.appendChild(biomeTilingSubtabsBody);
        setBiomeTilingSubtab('config');

        const createBiomeSubtabBody = (titleText) => {
            const body = makeEl('div', null);
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
            body.style.gap = '8px';
            body.appendChild(makeEl('div', 'options-note', titleText));
            return body;
        };
        const makeConfigToggleGroup = (marginTopPx = 0) => {
            const group = makeEl('div', null);
            group.style.display = 'flex';
            group.style.flexDirection = 'column';
            group.style.gap = '8px';
            if (marginTopPx > 0) group.style.marginTop = `${marginTopPx}px`;
            return group;
        };

        const configSection = createBiomeSubtabBody('Config');
        const configFeaturesGroup = makeConfigToggleGroup(0);
        const configVisualsGroup = makeConfigToggleGroup(12);
        const configPerformanceGroup = makeConfigToggleGroup(12);
        const requestGeometryRebuild = () => {
            geometryDensity.applyNonce = Math.max(0, Math.round(Number(geometryDensity.applyNonce) || 0)) + 1;
        };
        const configWireframeRow = makeToggleRow({
            label: 'Heatmap Wireframe',
            value: visualization.landWireframe === true,
            onChange: (v) => {
                visualization.landWireframe = !!v;
                this._emit();
            }
        });
        configVisualsGroup.appendChild(configWireframeRow.row);

        const configDistanceEnabledRow = makeToggleRow({
            label: 'Enable Distance Blend',
            value: distanceTiling.enabled,
            onChange: (v) => {
                distanceTiling.enabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFeaturesGroup.appendChild(configDistanceEnabledRow.row);

        const configLodEnabledRow = makeToggleRow({
            label: 'Enable LOD',
            value: geometryDensity.enabled !== false,
            onChange: (v) => {
                const enabled = !!v;
                geometryDensity.enabled = enabled;
                geometryDensity.mode = enabled ? 'adaptive_rings' : 'uniform';
                if (enabled) {
                    geometryDensity.detailPreset = normalizeGeometryPreset(geometryDensity.detailPreset, 'medium');
                }
                requestGeometryRebuild();
                syncUi();
                this._emit();
            }
        });
        configFeaturesGroup.appendChild(configLodEnabledRow.row);

        const configAntiEnabledRow = makeToggleRow({
            label: 'Enable Anti-Tiling',
            value: variation.antiTilingEnabled,
            onChange: (v) => {
                variation.antiTilingEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFeaturesGroup.appendChild(configAntiEnabledRow.row);

        const configMacroEnabledRow = makeToggleRow({
            label: 'Enable Macro Variation',
            value: variation.macroVariationEnabled,
            onChange: (v) => {
                variation.macroVariationEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFeaturesGroup.appendChild(configMacroEnabledRow.row);

        const configDisplacementEnabledRow = makeToggleRow({
            label: 'Enable Displacement',
            value: displacement.enabled,
            onChange: (v) => {
                displacement.enabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFeaturesGroup.appendChild(configDisplacementEnabledRow.row);

        const displacementSection = createBiomeSubtabBody('Displacement');
        displacementSection.appendChild(makeEl('div', 'options-note', 'Optional displacement validation overlay (separate from adaptive terrain LOD mesh).'));
        const displacementEnabledRow = makeToggleRow({
            label: 'Enable Displacement',
            value: displacement.enabled,
            onChange: (v) => {
                displacement.enabled = !!v;
                syncUi();
                this._emit();
            }
        });
        displacementSection.appendChild(displacementEnabledRow.row);

        const displacementStrengthRow = makeNumberSliderRow({
            label: 'Strength',
            value: displacement.strength,
            min: 0.0,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                displacement.strength = v;
                this._emit();
            }
        });
        displacementSection.appendChild(displacementStrengthRow.row);

        const displacementBiasRow = makeNumberSliderRow({
            label: 'Bias',
            value: displacement.bias,
            min: -10.0,
            max: 10.0,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                displacement.bias = v;
                this._emit();
            }
        });
        displacementSection.appendChild(displacementBiasRow.row);

        const displacementSourceRow = makeSelectRow({
            label: 'Source',
            value: displacement.source,
            options: [
                { id: 'auto', label: 'Auto (Disp → AO → ORM)' },
                { id: 'displacement', label: 'Displacement Map' },
                { id: 'ao', label: 'AO Map' },
                { id: 'orm', label: 'ORM Map' }
            ],
            onChange: (id) => {
                const v = String(id ?? 'auto');
                displacement.source = (v === 'displacement' || v === 'ao' || v === 'orm') ? v : 'auto';
                this._emit();
            }
        });
        displacementSection.appendChild(displacementSourceRow.row);

        const displacementDebugViewRow = makeChoiceRow({
            label: 'Inspect Mode',
            value: displacement.debugView,
            options: [
                { id: 'standard', label: 'Standard' },
                { id: 'wireframe', label: 'Wireframe' },
                { id: 'displacement', label: 'Displacement Focus' }
            ],
            onChange: (id) => {
                displacement.debugView = id === 'wireframe' || id === 'displacement' ? id : 'standard';
                this._emit();
            }
        });
        displacementSection.appendChild(displacementDebugViewRow.row);

        const geometrySection = createBiomeSubtabBody('LOD');
        geometrySection.appendChild(makeEl('div', 'options-note', 'Finite map terrain LOD with fixed grid bounds. Rebuild applies current camera-centered LOD allocation.'));

        const geometryPresetRow = makeChoiceRow({
            label: 'Detail Preset',
            value: geometryDensity.enabled === false
                ? 'off'
                : normalizeGeometryPreset(geometryDensity.detailPreset, 'medium'),
            segmented: true,
            options: [
                { id: 'off', label: 'Off' },
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' }
            ],
            onChange: (id) => {
                const v = String(id ?? 'medium');
                if (v === 'off') {
                    geometryDensity.enabled = false;
                    geometryDensity.mode = 'uniform';
                } else {
                    geometryDensity.enabled = true;
                    geometryDensity.mode = 'adaptive_rings';
                    geometryDensity.detailPreset = normalizeGeometryPreset(v, geometryDensity.detailPreset);
                }
                requestGeometryRebuild();
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryPresetRow.row);

        const geometryRenderDistanceRow = makeNumberSliderRow({
            label: 'Render Distance (m)',
            value: Math.max(0, Number(geometryDensity.renderDistanceMeters) || (Number(geometryDensity.nearRadiusMeters) + Number(geometryDensity.transitionWidthMeters) || 6)),
            min: 2.0,
            max: 1200.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                const dist = clamp(v, 2.0, 1200.0, 6.0);
                geometryDensity.renderDistanceMeters = dist;
                geometryDensity.nearRadiusMeters = dist * 0.5;
                geometryDensity.transitionWidthMeters = dist * 0.5;
                this._emit();
            }
        });
        geometrySection.appendChild(geometryRenderDistanceRow.row);

        const geometryWaveStrengthRow = makeNumberSliderRow({
            label: 'Wave Strength',
            value: geometryDensity.waveStrength,
            min: 0.0,
            max: 1.0,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                geometryDensity.waveStrength = clamp(v, 0.0, 1.0, 0.02);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryWaveStrengthRow.row);

        const geometryWaveMaxHeightRow = makeNumberSliderRow({
            label: 'Max Height on Map (m)',
            value: geometryDensity.waveMaxHeightMeters,
            min: 0.0,
            max: 10.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                geometryDensity.waveMaxHeightMeters = clamp(v, 0.0, 10.0, 2.0);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryWaveMaxHeightRow.row);

        const geometryWaveMaxTileRangeRow = makeNumberSliderRow({
            label: 'Max Height Range / Tile (m)',
            value: geometryDensity.waveMaxTileRangeMeters,
            min: 0.0,
            max: 20.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                geometryDensity.waveMaxTileRangeMeters = clamp(v, 0.0, 20.0, 0.5);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryWaveMaxTileRangeRow.row);

        const geometryModeRow = makeChoiceRow({
            label: 'Mode',
            value: geometryDensity.mode,
            options: [
                { id: 'uniform', label: 'Uniform' },
                { id: 'adaptive_rings', label: 'Adaptive Rings' }
            ],
            onChange: (id) => {
                geometryDensity.mode = id === 'adaptive_rings' ? 'adaptive_rings' : 'uniform';
                geometryDensity.enabled = geometryDensity.mode === 'adaptive_rings';
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryModeRow.row);

        const geometrySegmentsRow = makeNumberSliderRow({
            label: 'Uniform Segments / Tile',
            value: geometryDensity.segmentsPerTile,
            min: 1,
            max: 1024,
            step: 1,
            digits: 0,
            onChange: (v) => {
                geometryDensity.segmentsPerTile = Math.max(1, Math.min(1024, Math.round(v)));
                this._emit();
            }
        });
        geometrySection.appendChild(geometrySegmentsRow.row);

        const geometryNearSegmentsRow = makeNumberSliderRow({
            label: 'Near Segments / Tile',
            value: geometryDensity.nearSegmentsPerTile,
            min: 1,
            max: 10000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                geometryDensity.nearSegmentsPerTile = Math.max(1, Math.min(10000, Math.round(v)));
                this._emit();
            }
        });
        geometrySection.appendChild(geometryNearSegmentsRow.row);

        const geometryFarSegmentsRow = makeNumberSliderRow({
            label: 'Far Segments / Tile',
            value: geometryDensity.farSegmentsPerTile,
            min: 1,
            max: 1024,
            step: 1,
            digits: 0,
            onChange: (v) => {
                geometryDensity.farSegmentsPerTile = Math.max(1, Math.min(1024, Math.round(v)));
                this._emit();
            }
        });
        geometrySection.appendChild(geometryFarSegmentsRow.row);

        const geometryNearRadiusRow = makeNumberSliderRow({
            label: 'Near Radius (m)',
            value: geometryDensity.nearRadiusMeters,
            min: 0.0,
            max: 1200.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                geometryDensity.nearRadiusMeters = clamp(v, 0.0, 1200.0, 3.0);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryNearRadiusRow.row);

        const geometryTransitionWidthRow = makeNumberSliderRow({
            label: 'Transition Width (m)',
            value: geometryDensity.transitionWidthMeters,
            min: 0.0,
            max: 600.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                geometryDensity.transitionWidthMeters = clamp(v, 0.0, 600.0, 3.0);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryTransitionWidthRow.row);

        const geometryTransitionSmoothingRow = makeNumberSliderRow({
            label: 'Transition Smoothing',
            value: geometryDensity.transitionSmoothing,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            tooltip: '0 = more responsive (linear), 1 = smoother (lower pop risk).',
            onChange: (v) => {
                geometryDensity.transitionSmoothing = clamp(v, 0.0, 1.0, 0.72);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryTransitionSmoothingRow.row);

        const geometryTransitionBiasRow = makeNumberSliderRow({
            label: 'Transition Bias',
            value: geometryDensity.transitionBias,
            min: -0.85,
            max: 0.85,
            step: 0.01,
            digits: 2,
            tooltip: 'Negative keeps near detail longer; positive responds faster toward far density.',
            onChange: (v) => {
                geometryDensity.transitionBias = clamp(v, -0.85, 0.85, 0.0);
                this._emit();
            }
        });
        geometrySection.appendChild(geometryTransitionBiasRow.row);

        const geometryTransitionBandsRow = makeNumberSliderRow({
            label: 'Transition Debug Bands',
            value: geometryDensity.transitionDebugBands,
            min: 0,
            max: 6,
            step: 1,
            digits: 0,
            tooltip: 'Adds intermediate transition rings to visualize active LOD zones.',
            onChange: (v) => {
                geometryDensity.transitionDebugBands = Math.max(0, Math.min(6, Math.round(v)));
                this._emit();
            }
        });
        geometrySection.appendChild(geometryTransitionBandsRow.row);

        const geometryCaptureCenterRow = makeToggleRow({
            label: 'Capture Camera Center',
            value: geometryDensity.centerOnApplyCamera,
            tooltip: 'When enabled, apply captures current camera XZ as adaptive ring center.',
            onChange: (v) => {
                geometryDensity.centerOnApplyCamera = !!v;
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryCaptureCenterRow.row);

        const geometryOverlayRow = makeToggleRow({
            label: 'Show LOD Overlay',
            value: geometryDensity.ringOverlayEnabled,
            onChange: (v) => {
                geometryDensity.ringOverlayEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryOverlayRow.row);

        const geometryTileLodDebugRow = makeToggleRow({
            label: 'LOD Markers',
            value: geometryDensity.tileLodDebugEnabled === true,
            onChange: (v) => {
                geometryDensity.tileLodDebugEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryTileLodDebugRow.row);

        const geometryAutoRebuildCadenceRow = makeChoiceRow({
            label: 'Auto Rebuild',
            value: normalizeRebuildCadenceChoice(geometryDensity.rebuildCadence),
            segmented: true,
            options: [
                { id: 'off', label: 'Off' },
                { id: 'frame', label: '1F' },
                { id: 'frame_2', label: '2F' },
                { id: 'frame_8', label: '8F' },
                { id: 'sec:1', label: '1S' }
            ],
            onChange: (id) => {
                const selected = String(id ?? 'off');
                geometryDensity.rebuildCadence = normalizeRebuildCadence(selected, 1.0);
                syncUi();
                this._emit();
            }
        });
        geometrySection.appendChild(geometryAutoRebuildCadenceRow.row);

        const configCaptureCenterRow = makeToggleRow({
            label: 'Capture Camera Center',
            value: geometryDensity.centerOnApplyCamera,
            onChange: (v) => {
                geometryDensity.centerOnApplyCamera = !!v;
                syncUi();
                this._emit();
            }
        });
        configVisualsGroup.appendChild(configCaptureCenterRow.row);

        const configTileLodDebugRow = makeToggleRow({
            label: 'LOD Markers',
            value: geometryDensity.tileLodDebugEnabled === true,
            onChange: (v) => {
                geometryDensity.tileLodDebugEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configVisualsGroup.appendChild(configTileLodDebugRow.row);

        const configFragmentShaderRow = makeToggleRow({
            label: 'Fragment Shader',
            value: performance.fragmentShaderEnabled,
            onChange: (v) => {
                performance.fragmentShaderEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configPerformanceGroup.appendChild(configFragmentShaderRow.row);

        const configFragmentShaderAlbedoRow = makeToggleRow({
            label: 'Albedo',
            value: performance.fragmentShaderAlbedoEnabled,
            onChange: (v) => {
                performance.fragmentShaderAlbedoEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderAlbedoRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderAlbedoRow.row);

        const configFragmentShaderDistanceBlendRow = makeToggleRow({
            label: 'Distance Blend Shader',
            value: distanceTiling.enabled,
            onChange: (v) => {
                distanceTiling.enabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderDistanceBlendRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderDistanceBlendRow.row);

        const configFragmentShaderAntiTilingRow = makeToggleRow({
            label: 'Anti-tiling Shader',
            value: variation.antiTilingEnabled,
            onChange: (v) => {
                variation.antiTilingEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderAntiTilingRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderAntiTilingRow.row);

        const configFragmentShaderMacroVariationRow = makeToggleRow({
            label: 'Macro Variation Shader',
            value: variation.macroVariationEnabled,
            onChange: (v) => {
                variation.macroVariationEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderMacroVariationRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderMacroVariationRow.row);

        const configFragmentShaderPbrLightingRow = makeToggleRow({
            label: 'PBR Lighting',
            value: performance.fragmentShaderPbrLightingEnabled,
            onChange: (v) => {
                performance.fragmentShaderPbrLightingEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderPbrLightingRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderPbrLightingRow.row);

        const configFragmentShaderSurfaceRow = makeToggleRow({
            label: 'Surface (Normal+ORM)',
            value: performance.fragmentShaderSurfaceEnabled,
            onChange: (v) => {
                performance.fragmentShaderSurfaceEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderSurfaceRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderSurfaceRow.row);

        const configFragmentShaderBiomeRow = makeToggleRow({
            label: 'Biome',
            value: performance.fragmentShaderBiomeEnabled,
            tooltip: TERRAIN_BIOME_SHADER_TEMP_DISABLED ? TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON : '',
            onChange: (v) => {
                performance.fragmentShaderBiomeEnabled = TERRAIN_BIOME_SHADER_TEMP_DISABLED ? false : !!v;
                syncUi();
                this._emit();
            }
        });
        configFragmentShaderBiomeRow.row.classList.add('options-row-child-indent');
        configPerformanceGroup.appendChild(configFragmentShaderBiomeRow.row);
        if (TERRAIN_BIOME_SHADER_TEMP_DISABLED) {
            configPerformanceGroup.appendChild(makeEl('div', 'options-note', TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON));
        }

        const configShadowsRow = makeToggleRow({
            label: 'Shadows',
            value: performance.shadowsEnabled,
            onChange: (v) => {
                performance.shadowsEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configPerformanceGroup.appendChild(configShadowsRow.row);

        const configHighDpiRow = makeToggleRow({
            label: 'High-DPI / Pixel Ratio',
            value: performance.highDpiEnabled,
            onChange: (v) => {
                performance.highDpiEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        configPerformanceGroup.appendChild(configHighDpiRow.row);

        configSection.appendChild(configFeaturesGroup);
        configSection.appendChild(configVisualsGroup);
        configSection.appendChild(configPerformanceGroup);

        const lodSamplerDiagnosticsNote = makeEl('div', 'options-note', 'Fragment samplers: n/a');
        geometrySection.appendChild(lodSamplerDiagnosticsNote);
        this._controls.biomeTilingLodSamplerDiagnostics = lodSamplerDiagnosticsNote;
        const fragmentPathBreakdownNote = makeEl('div', 'options-note', 'Fragment paths: n/a');
        geometrySection.appendChild(fragmentPathBreakdownNote);
        this._controls.biomeTilingFragmentPathBreakdown = fragmentPathBreakdownNote;

        const hideAdvancedGeometryRows = [
            geometryRenderDistanceRow,
            geometryWaveStrengthRow,
            geometryWaveMaxHeightRow,
            geometryWaveMaxTileRangeRow,
            geometryModeRow,
            geometrySegmentsRow,
            geometryNearSegmentsRow,
            geometryFarSegmentsRow,
            geometryNearRadiusRow,
            geometryTransitionWidthRow,
            geometryTransitionSmoothingRow,
            geometryTransitionBiasRow,
            geometryTransitionBandsRow,
            geometryCaptureCenterRow,
            geometryOverlayRow
        ];
        for (const rowCtrl of hideAdvancedGeometryRows) {
            if (rowCtrl?.row?.style) rowCtrl.row.style.display = 'none';
        }

        const diagnosticsSection = createBiomeSubtabBody('Diagnostics');
        const terrainLodTitle = makeEl('div', 'options-note', 'Terrain LOD');
        terrainLodTitle.style.fontWeight = '700';
        terrainLodTitle.style.marginTop = '2px';
        diagnosticsSection.appendChild(terrainLodTitle);

        const terrainLodTableWrap = makeEl('div', null);
        terrainLodTableWrap.style.overflowX = 'auto';
        terrainLodTableWrap.style.border = '1px solid rgba(255,255,255,0.12)';
        terrainLodTableWrap.style.borderRadius = '10px';
        terrainLodTableWrap.style.padding = '6px';
        terrainLodTableWrap.style.background = 'rgba(0,0,0,0.16)';
        const terrainLodTable = document.createElement('table');
        terrainLodTable.style.width = '100%';
        terrainLodTable.style.borderCollapse = 'collapse';
        terrainLodTable.style.fontVariantNumeric = 'tabular-nums';
        terrainLodTable.style.fontSize = '11px';
        const terrainLodHead = document.createElement('thead');
        const terrainLodHeadRow = document.createElement('tr');
        for (const label of ['On/Off', '256', '64', '16', '4', '1', 'Total Quads']) {
            const th = document.createElement('th');
            th.textContent = label;
            th.style.padding = '5px 8px';
            th.style.textAlign = 'right';
            th.style.borderBottom = '1px solid rgba(255,255,255,0.18)';
            th.style.whiteSpace = 'nowrap';
            if (label === 'On/Off') th.style.textAlign = 'left';
            terrainLodHeadRow.appendChild(th);
        }
        terrainLodHead.appendChild(terrainLodHeadRow);
        terrainLodTable.appendChild(terrainLodHead);
        const terrainLodBody = document.createElement('tbody');
        const terrainLodRow = document.createElement('tr');
        const makeValueCell = ({ align = 'right', text = 'n/a' } = {}) => {
            const td = document.createElement('td');
            td.textContent = text;
            td.style.padding = '6px 8px';
            td.style.textAlign = align;
            td.style.whiteSpace = 'nowrap';
            return td;
        };
        const terrainLodStatusCell = makeValueCell({ align: 'left', text: 'n/a' });
        const terrainLodCell256 = makeValueCell();
        const terrainLodCell64 = makeValueCell();
        const terrainLodCell16 = makeValueCell();
        const terrainLodCell4 = makeValueCell();
        const terrainLodCell1 = makeValueCell();
        const terrainLodTotalCell = makeValueCell();
        terrainLodRow.appendChild(terrainLodStatusCell);
        terrainLodRow.appendChild(terrainLodCell256);
        terrainLodRow.appendChild(terrainLodCell64);
        terrainLodRow.appendChild(terrainLodCell16);
        terrainLodRow.appendChild(terrainLodCell4);
        terrainLodRow.appendChild(terrainLodCell1);
        terrainLodRow.appendChild(terrainLodTotalCell);
        terrainLodBody.appendChild(terrainLodRow);
        terrainLodTable.appendChild(terrainLodBody);
        terrainLodTableWrap.appendChild(terrainLodTable);
        diagnosticsSection.appendChild(terrainLodTableWrap);

        const gpuTitleNote = makeEl('div', 'options-note', 'GPU');
        gpuTitleNote.style.fontWeight = '700';
        gpuTitleNote.style.marginTop = '8px';
        const gpuSamplerUsageNote = makeEl('div', 'options-note', 'GPU samplers: n/a');
        const gpuSamplerPathsTitle = makeEl('div', 'options-note', 'Fragment Sampler Paths');
        gpuSamplerPathsTitle.style.marginTop = '4px';
        const gpuSamplerPathsTableWrap = makeEl('div', null);
        gpuSamplerPathsTableWrap.style.overflowX = 'auto';
        gpuSamplerPathsTableWrap.style.border = '1px solid rgba(255,255,255,0.12)';
        gpuSamplerPathsTableWrap.style.borderRadius = '10px';
        gpuSamplerPathsTableWrap.style.padding = '6px';
        gpuSamplerPathsTableWrap.style.background = 'rgba(0,0,0,0.16)';
        const gpuSamplerPathsTable = document.createElement('table');
        gpuSamplerPathsTable.style.width = '100%';
        gpuSamplerPathsTable.style.borderCollapse = 'collapse';
        gpuSamplerPathsTable.style.fontVariantNumeric = 'tabular-nums';
        gpuSamplerPathsTable.style.fontSize = '11px';
        const gpuSamplerPathsHead = document.createElement('thead');
        const gpuSamplerPathsHeadRow = document.createElement('tr');
        for (const label of ['Path', 'Samplers', 'Notes']) {
            const th = document.createElement('th');
            th.textContent = label;
            th.style.padding = '5px 8px';
            th.style.textAlign = label === 'Samplers' ? 'right' : 'left';
            th.style.borderBottom = '1px solid rgba(255,255,255,0.18)';
            th.style.whiteSpace = 'nowrap';
            gpuSamplerPathsHeadRow.appendChild(th);
        }
        gpuSamplerPathsHead.appendChild(gpuSamplerPathsHeadRow);
        gpuSamplerPathsTable.appendChild(gpuSamplerPathsHead);
        const gpuSamplerPathsBody = document.createElement('tbody');
        const gpuSamplerPathsBodyRow = document.createElement('tr');
        const gpuSamplerPathsPathCell = document.createElement('td');
        gpuSamplerPathsPathCell.textContent = 'n/a';
        gpuSamplerPathsPathCell.style.padding = '5px 8px';
        gpuSamplerPathsPathCell.style.whiteSpace = 'nowrap';
        const gpuSamplerPathsCountCell = document.createElement('td');
        gpuSamplerPathsCountCell.textContent = 'n/a';
        gpuSamplerPathsCountCell.style.padding = '5px 8px';
        gpuSamplerPathsCountCell.style.textAlign = 'right';
        gpuSamplerPathsCountCell.style.whiteSpace = 'nowrap';
        const gpuSamplerPathsNoteCell = document.createElement('td');
        gpuSamplerPathsNoteCell.textContent = 'No active fragment paths.';
        gpuSamplerPathsNoteCell.style.padding = '5px 8px';
        gpuSamplerPathsBodyRow.appendChild(gpuSamplerPathsPathCell);
        gpuSamplerPathsBodyRow.appendChild(gpuSamplerPathsCountCell);
        gpuSamplerPathsBodyRow.appendChild(gpuSamplerPathsNoteCell);
        gpuSamplerPathsBody.appendChild(gpuSamplerPathsBodyRow);
        gpuSamplerPathsTable.appendChild(gpuSamplerPathsBody);
        gpuSamplerPathsTableWrap.appendChild(gpuSamplerPathsTable);
        const gpuMaxTexturesNote = makeEl('div', 'options-note', 'GPU max fragment texture units: n/a');
        const gpuSamplerHeadroomNote = makeEl('div', 'options-note', 'GPU sampler headroom: n/a');
        const gpuWebglVersionNote = makeEl('div', 'options-note', 'GPU WebGL: n/a');
        const gpuFrameTimeNote = makeEl('div', 'options-note', 'GPU frame time: n/a');
        diagnosticsSection.appendChild(gpuTitleNote);
        diagnosticsSection.appendChild(gpuSamplerUsageNote);
        diagnosticsSection.appendChild(gpuSamplerPathsTitle);
        diagnosticsSection.appendChild(gpuSamplerPathsTableWrap);
        diagnosticsSection.appendChild(gpuMaxTexturesNote);
        diagnosticsSection.appendChild(gpuSamplerHeadroomNote);
        diagnosticsSection.appendChild(gpuWebglVersionNote);
        diagnosticsSection.appendChild(gpuFrameTimeNote);

        const baseTitleNote = makeEl('div', 'options-note', 'Base');
        baseTitleNote.style.fontWeight = '700';
        baseTitleNote.style.marginTop = '8px';
        const baseGeometryStatsNote = makeEl('div', 'options-note', 'Base terrain geometry: (n/a)');
        const baseModeNote = makeEl('div', 'options-note', 'Base terrain mode: (n/a)');
        diagnosticsSection.appendChild(baseTitleNote);
        diagnosticsSection.appendChild(baseGeometryStatsNote);
        diagnosticsSection.appendChild(baseModeNote);

        this._controls.biomeTilingTerrainLodStatusCell = terrainLodStatusCell;
        this._controls.biomeTilingTerrainLodCountCells = {
            '256': terrainLodCell256,
            '64': terrainLodCell64,
            '16': terrainLodCell16,
            '4': terrainLodCell4,
            '1': terrainLodCell1
        };
        this._controls.biomeTilingTerrainLodTotalCell = terrainLodTotalCell;
        this._controls.biomeTilingGpuSamplerUsage = gpuSamplerUsageNote;
        this._controls.biomeTilingGpuMaxTextures = gpuMaxTexturesNote;
        this._controls.biomeTilingGpuSamplerHeadroom = gpuSamplerHeadroomNote;
        this._controls.biomeTilingGpuWebglVersion = gpuWebglVersionNote;
        this._controls.biomeTilingGpuFrameTime = gpuFrameTimeNote;
        this._controls.biomeTilingGpuSamplerPathsBody = gpuSamplerPathsBody;
        this._controls.biomeTilingBaseGeometryStats = baseGeometryStatsNote;
        this._controls.biomeTilingBaseMode = baseModeNote;

        const distanceSection = createBiomeSubtabBody('Distance Blend');
        distanceSection.appendChild(makeEl('div', 'options-note', 'Blends global Size (Texture section) toward Far Size using camera distance. "Blend Curve" is optional and defaults to linear.'));
        const distanceEnabledRow = makeToggleRow({
            label: 'Enable Distance Blend',
            value: distanceTiling.enabled,
            onChange: (v) => {
                distanceTiling.enabled = !!v;
                syncUi();
                this._emit();
            }
        });
        distanceSection.appendChild(distanceEnabledRow.row);

        const farScaleRow = makeNumberSliderRow({
            label: 'Far Size',
            value: distanceTiling.farScale,
            min: 0.01,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                distanceTiling.farScale = v;
                this._emit();
            }
        });
        distanceSection.appendChild(farScaleRow.row);

        const blendStartRow = makeNumberSliderRow({
            label: 'Blend Start (m)',
            value: distanceTiling.blendStartMeters,
            min: 0.0,
            max: 500.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                distanceTiling.blendStartMeters = v;
                if (distanceTiling.blendEndMeters <= distanceTiling.blendStartMeters + 1.0) {
                    distanceTiling.blendEndMeters = Math.min(2000.0, distanceTiling.blendStartMeters + 1.0);
                    setSliderValue(blendEndRow, distanceTiling.blendEndMeters, 0);
                }
                this._emit();
            }
        });
        distanceSection.appendChild(blendStartRow.row);

        const blendEndRow = makeNumberSliderRow({
            label: 'Blend End (m)',
            value: distanceTiling.blendEndMeters,
            min: 0.0,
            max: 2000.0,
            step: 1.0,
            digits: 0,
            onChange: (v) => {
                distanceTiling.blendEndMeters = Math.min(2000.0, Math.max(v, distanceTiling.blendStartMeters + 1.0));
                setSliderValue(blendEndRow, distanceTiling.blendEndMeters, 0);
                this._emit();
            }
        });
        distanceSection.appendChild(blendEndRow.row);

        const blendCurveRow = makeNumberSliderRow({
            label: 'Blend Curve',
            value: distanceTiling.blendCurve,
            min: 0.35,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                distanceTiling.blendCurve = v;
                this._emit();
            }
        });
        distanceSection.appendChild(blendCurveRow.row);

        const debugViewRow = makeChoiceRow({
            label: 'Distance Debug',
            value: distanceTiling.debugView,
            options: [
                { id: 'blended', label: 'Blended' },
                { id: 'near', label: 'Near Only' },
                { id: 'far', label: 'Far Only' }
            ],
            onChange: (id) => {
                distanceTiling.debugView = (id === 'near' || id === 'far') ? id : 'blended';
                this._emit();
            }
        });
        distanceSection.appendChild(debugViewRow.row);

        const variationSection = createBiomeSubtabBody('Anti-tiling');
        variationSection.appendChild(makeEl('div', 'options-note', 'Use anti-tiling and macro variation to break visible repetition.'));
        const antiEnabledRow = makeToggleRow({
            label: 'Enable Anti-Tiling',
            value: variation.antiTilingEnabled,
            onChange: (v) => {
                variation.antiTilingEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        variationSection.appendChild(antiEnabledRow.row);

        const antiStrengthRow = makeNumberSliderRow({
            label: 'Anti Strength',
            value: variation.antiTilingStrength,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variation.antiTilingStrength = v;
                this._emit();
            }
        });
        variationSection.appendChild(antiStrengthRow.row);

        const antiCellRow = makeNumberSliderRow({
            label: 'Anti Cell (m)',
            value: variation.antiTilingCellMeters,
            min: 0.25,
            max: 12.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variation.antiTilingCellMeters = v;
                this._emit();
            }
        });
        variationSection.appendChild(antiCellRow.row);

        const macroEnabledRow = makeToggleRow({
            label: 'Enable Macro Variation',
            value: variation.macroVariationEnabled,
            onChange: (v) => {
                variation.macroVariationEnabled = !!v;
                syncUi();
                this._emit();
            }
        });
        variationSection.appendChild(macroEnabledRow.row);

        const macroStrengthRow = makeNumberSliderRow({
            label: 'Macro Strength',
            value: variation.macroVariationStrength,
            min: 0.0,
            max: 0.8,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variation.macroVariationStrength = v;
                this._emit();
            }
        });
        variationSection.appendChild(macroStrengthRow.row);

        const macroScaleRow = makeNumberSliderRow({
            label: 'Macro Scale',
            value: variation.macroVariationScale,
            min: 0.002,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                variation.macroVariationScale = v;
                this._emit();
            }
        });
        variationSection.appendChild(macroScaleRow.row);

        const variationNearRow = makeNumberSliderRow({
            label: 'Variation Near',
            value: variation.nearIntensity,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variation.nearIntensity = v;
                this._emit();
            }
        });
        variationSection.appendChild(variationNearRow.row);

        const variationFarRow = makeNumberSliderRow({
            label: 'Variation Far',
            value: variation.farIntensity,
            min: 0.0,
            max: 2.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                variation.farIntensity = v;
                this._emit();
            }
        });
        variationSection.appendChild(variationFarRow.row);

        const setDistanceControlsEnabled = (enabled) => {
            const disabled = !enabled;
            if (farScaleRow.range) farScaleRow.range.disabled = disabled;
            if (farScaleRow.number) farScaleRow.number.disabled = disabled;
            if (blendStartRow.range) blendStartRow.range.disabled = disabled;
            if (blendStartRow.number) blendStartRow.number.disabled = disabled;
            if (blendEndRow.range) blendEndRow.range.disabled = disabled;
            if (blendEndRow.number) blendEndRow.number.disabled = disabled;
            if (blendCurveRow.range) blendCurveRow.range.disabled = disabled;
            if (blendCurveRow.number) blendCurveRow.number.disabled = disabled;
            debugViewRow.setDisabled(disabled);
        };

        const setVariationControlsEnabled = ({ antiEnabled, macroEnabled }) => {
            const antiDisabled = !antiEnabled;
            if (antiStrengthRow.range) antiStrengthRow.range.disabled = antiDisabled;
            if (antiStrengthRow.number) antiStrengthRow.number.disabled = antiDisabled;
            if (antiCellRow.range) antiCellRow.range.disabled = antiDisabled;
            if (antiCellRow.number) antiCellRow.number.disabled = antiDisabled;

            const macroDisabled = !macroEnabled;
            if (macroStrengthRow.range) macroStrengthRow.range.disabled = macroDisabled;
            if (macroStrengthRow.number) macroStrengthRow.number.disabled = macroDisabled;
            if (macroScaleRow.range) macroScaleRow.range.disabled = macroDisabled;
            if (macroScaleRow.number) macroScaleRow.number.disabled = macroDisabled;

            const intensityDisabled = !(antiEnabled || macroEnabled);
            if (variationNearRow.range) variationNearRow.range.disabled = intensityDisabled;
            if (variationNearRow.number) variationNearRow.number.disabled = intensityDisabled;
            if (variationFarRow.range) variationFarRow.range.disabled = intensityDisabled;
            if (variationFarRow.number) variationFarRow.number.disabled = intensityDisabled;
        };

        const setDisplacementControlsEnabled = (enabled) => {
            const disabled = !enabled;
            if (displacementStrengthRow.range) displacementStrengthRow.range.disabled = disabled;
            if (displacementStrengthRow.number) displacementStrengthRow.number.disabled = disabled;
            if (displacementBiasRow.range) displacementBiasRow.range.disabled = disabled;
            if (displacementBiasRow.number) displacementBiasRow.number.disabled = disabled;
            if (displacementSourceRow.select) displacementSourceRow.select.disabled = disabled;
        };

        const setGeometryControlsEnabled = (mode, enabled = true) => {
            const adaptive = enabled && String(mode ?? '') === 'adaptive_rings';
            const uniformDisabled = adaptive;
            if (geometrySegmentsRow.range) geometrySegmentsRow.range.disabled = uniformDisabled;
            if (geometrySegmentsRow.number) geometrySegmentsRow.number.disabled = uniformDisabled;

            const adaptiveDisabled = !adaptive;
            if (geometryNearSegmentsRow.range) geometryNearSegmentsRow.range.disabled = adaptiveDisabled;
            if (geometryNearSegmentsRow.number) geometryNearSegmentsRow.number.disabled = adaptiveDisabled;
            if (geometryFarSegmentsRow.range) geometryFarSegmentsRow.range.disabled = adaptiveDisabled;
            if (geometryFarSegmentsRow.number) geometryFarSegmentsRow.number.disabled = adaptiveDisabled;
            if (geometryNearRadiusRow.range) geometryNearRadiusRow.range.disabled = adaptiveDisabled;
            if (geometryNearRadiusRow.number) geometryNearRadiusRow.number.disabled = adaptiveDisabled;
            if (geometryTransitionWidthRow.range) geometryTransitionWidthRow.range.disabled = adaptiveDisabled;
            if (geometryTransitionWidthRow.number) geometryTransitionWidthRow.number.disabled = adaptiveDisabled;
            if (geometryTransitionSmoothingRow.range) geometryTransitionSmoothingRow.range.disabled = adaptiveDisabled;
            if (geometryTransitionSmoothingRow.number) geometryTransitionSmoothingRow.number.disabled = adaptiveDisabled;
            if (geometryTransitionBiasRow.range) geometryTransitionBiasRow.range.disabled = adaptiveDisabled;
            if (geometryTransitionBiasRow.number) geometryTransitionBiasRow.number.disabled = adaptiveDisabled;
            if (geometryTransitionBandsRow.range) geometryTransitionBandsRow.range.disabled = adaptiveDisabled;
            if (geometryTransitionBandsRow.number) geometryTransitionBandsRow.number.disabled = adaptiveDisabled;
            if (geometryCaptureCenterRow.toggle) geometryCaptureCenterRow.toggle.disabled = adaptiveDisabled;
            if (geometryOverlayRow.toggle) geometryOverlayRow.toggle.disabled = !enabled;
            if (geometryTileLodDebugRow.toggle) geometryTileLodDebugRow.toggle.disabled = !enabled;
            if (geometryRenderDistanceRow.range) geometryRenderDistanceRow.range.disabled = !enabled;
            if (geometryRenderDistanceRow.number) geometryRenderDistanceRow.number.disabled = !enabled;
            if (geometryWaveStrengthRow.range) geometryWaveStrengthRow.range.disabled = !enabled;
            if (geometryWaveStrengthRow.number) geometryWaveStrengthRow.number.disabled = !enabled;
            if (geometryWaveMaxHeightRow.range) geometryWaveMaxHeightRow.range.disabled = !enabled;
            if (geometryWaveMaxHeightRow.number) geometryWaveMaxHeightRow.number.disabled = !enabled;
            if (geometryWaveMaxTileRangeRow.range) geometryWaveMaxTileRangeRow.range.disabled = !enabled;
            if (geometryWaveMaxTileRangeRow.number) geometryWaveMaxTileRangeRow.number.disabled = !enabled;
            geometryAutoRebuildCadenceRow.setDisabled(!enabled);
        };
        const setFragmentShaderSubControlsEnabled = () => {
            if (configFragmentShaderRow.toggle) configFragmentShaderRow.toggle.disabled = false;
            if (configFragmentShaderAlbedoRow.toggle) configFragmentShaderAlbedoRow.toggle.disabled = false;
            if (configFragmentShaderDistanceBlendRow.toggle) configFragmentShaderDistanceBlendRow.toggle.disabled = false;
            if (configFragmentShaderAntiTilingRow.toggle) configFragmentShaderAntiTilingRow.toggle.disabled = false;
            if (configFragmentShaderMacroVariationRow.toggle) configFragmentShaderMacroVariationRow.toggle.disabled = false;
            if (configFragmentShaderPbrLightingRow.toggle) configFragmentShaderPbrLightingRow.toggle.disabled = false;
            if (configFragmentShaderSurfaceRow.toggle) configFragmentShaderSurfaceRow.toggle.disabled = false;
            if (configFragmentShaderBiomeRow.toggle) configFragmentShaderBiomeRow.toggle.disabled = TERRAIN_BIOME_SHADER_TEMP_DISABLED;
        };
        const enforceShaderFeatureLinkage = () => {
            performance.fragmentShaderEnabled = performance.fragmentShaderEnabled === true;
            performance.fragmentShaderAlbedoEnabled = performance.fragmentShaderAlbedoEnabled === true;
            performance.fragmentShaderPbrLightingEnabled = performance.fragmentShaderPbrLightingEnabled === true;
            performance.fragmentShaderSurfaceEnabled = performance.fragmentShaderSurfaceEnabled === true;
            performance.fragmentShaderBiomeEnabled = TERRAIN_BIOME_SHADER_TEMP_DISABLED
                ? false
                : (performance.fragmentShaderBiomeEnabled === true);
            distanceTiling.enabled = distanceTiling.enabled === true;
            variation.antiTilingEnabled = variation.antiTilingEnabled === true;
            variation.macroVariationEnabled = variation.macroVariationEnabled === true;

            const albedoShaderFeaturesEnabled = distanceTiling.enabled || variation.antiTilingEnabled || variation.macroVariationEnabled;
            if (albedoShaderFeaturesEnabled) {
                performance.fragmentShaderEnabled = true;
                performance.fragmentShaderAlbedoEnabled = true;
            }
            if (performance.fragmentShaderSurfaceEnabled) {
                performance.fragmentShaderEnabled = true;
                performance.fragmentShaderPbrLightingEnabled = true;
            }
            if (performance.fragmentShaderBiomeEnabled) {
                performance.fragmentShaderEnabled = true;
                performance.fragmentShaderAlbedoEnabled = true;
            }

            if (!performance.fragmentShaderEnabled) {
                performance.fragmentShaderAlbedoEnabled = false;
                performance.fragmentShaderPbrLightingEnabled = false;
                performance.fragmentShaderSurfaceEnabled = false;
                performance.fragmentShaderBiomeEnabled = false;
                distanceTiling.enabled = false;
                variation.antiTilingEnabled = false;
                variation.macroVariationEnabled = false;
            }
            if (!performance.fragmentShaderAlbedoEnabled) {
                distanceTiling.enabled = false;
                variation.antiTilingEnabled = false;
                variation.macroVariationEnabled = false;
            }
            if (!performance.fragmentShaderPbrLightingEnabled) {
                performance.fragmentShaderSurfaceEnabled = false;
            }
        };

        const syncUi = () => {
            enforceShaderFeatureLinkage();
            bt.materialId = normalizeMaterialId(bt.materialId, defaultMaterialId);
            const meta = materialById.get(bt.materialId) ?? null;
            materialRow.setValue({
                materialId: bt.materialId,
                materialLabel: meta?.label ?? bt.materialId,
                previewUrl: meta?.previewUrl ?? ''
            });

            rigDebugRow.toggle.checked = bt.calibrationRigDebugEnabled;

            distanceEnabledRow.toggle.checked = distanceTiling.enabled;
            setSliderValue(textureNearScaleRow, distanceTiling.nearScale, 2);
            setSliderValue(farScaleRow, distanceTiling.farScale, 2);
            setSliderValue(blendStartRow, distanceTiling.blendStartMeters, 0);
            setSliderValue(blendEndRow, distanceTiling.blendEndMeters, 0);
            setSliderValue(blendCurveRow, distanceTiling.blendCurve, 2);
            debugViewRow.setValue(distanceTiling.debugView);
            setDistanceControlsEnabled(distanceTiling.enabled);

            antiEnabledRow.toggle.checked = variation.antiTilingEnabled;
            setSliderValue(antiStrengthRow, variation.antiTilingStrength, 2);
            setSliderValue(antiCellRow, variation.antiTilingCellMeters, 2);
            macroEnabledRow.toggle.checked = variation.macroVariationEnabled;
            setSliderValue(macroStrengthRow, variation.macroVariationStrength, 2);
            setSliderValue(macroScaleRow, variation.macroVariationScale, 3);
            setSliderValue(variationNearRow, variation.nearIntensity, 2);
            setSliderValue(variationFarRow, variation.farIntensity, 2);
            setVariationControlsEnabled({
                antiEnabled: variation.antiTilingEnabled,
                macroEnabled: variation.macroVariationEnabled
            });

            displacementEnabledRow.toggle.checked = displacement.enabled;
            setSliderValue(displacementStrengthRow, displacement.strength, 3);
            setSliderValue(displacementBiasRow, displacement.bias, 2);
            if (displacementSourceRow.select) displacementSourceRow.select.value = displacement.source;
            displacementDebugViewRow.setValue(displacement.debugView);
            setDisplacementControlsEnabled(displacement.enabled);

            geometryDensity.enabled = geometryDensity.enabled !== false;
            geometryDensity.detailPreset = normalizeGeometryPreset(geometryDensity.detailPreset, 'medium');
            if (!geometryDensity.enabled) geometryDensity.mode = 'uniform';
            else geometryDensity.mode = 'adaptive_rings';
            geometryModeRow.setValue(geometryDensity.mode);
            geometryPresetRow.setValue(geometryDensity.enabled ? geometryDensity.detailPreset : 'off');
            configWireframeRow.toggle.checked = visualization.landWireframe === true;
            configDistanceEnabledRow.toggle.checked = distanceTiling.enabled;
            configLodEnabledRow.toggle.checked = geometryDensity.enabled !== false;
            configAntiEnabledRow.toggle.checked = variation.antiTilingEnabled;
            configMacroEnabledRow.toggle.checked = variation.macroVariationEnabled;
            configDisplacementEnabledRow.toggle.checked = displacement.enabled;
            configFragmentShaderRow.toggle.checked = performance.fragmentShaderEnabled;
            configFragmentShaderBiomeRow.toggle.checked = performance.fragmentShaderBiomeEnabled;
            configFragmentShaderPbrLightingRow.toggle.checked = performance.fragmentShaderPbrLightingEnabled;
            configFragmentShaderAlbedoRow.toggle.checked = performance.fragmentShaderAlbedoEnabled;
            configFragmentShaderDistanceBlendRow.toggle.checked = distanceTiling.enabled;
            configFragmentShaderAntiTilingRow.toggle.checked = variation.antiTilingEnabled;
            configFragmentShaderMacroVariationRow.toggle.checked = variation.macroVariationEnabled;
            configFragmentShaderSurfaceRow.toggle.checked = performance.fragmentShaderSurfaceEnabled;
            setFragmentShaderSubControlsEnabled();
            configShadowsRow.toggle.checked = performance.shadowsEnabled;
            configHighDpiRow.toggle.checked = performance.highDpiEnabled;
            const renderDistance = clamp(
                geometryDensity.renderDistanceMeters,
                2.0,
                1200.0,
                Math.max(2, Number(geometryDensity.nearRadiusMeters) + Number(geometryDensity.transitionWidthMeters) || 6)
            );
            geometryDensity.renderDistanceMeters = renderDistance;
            setSliderValue(geometryRenderDistanceRow, renderDistance, 0);
            setSliderValue(geometryWaveStrengthRow, geometryDensity.waveStrength, 3);
            setSliderValue(geometryWaveMaxHeightRow, geometryDensity.waveMaxHeightMeters, 2);
            setSliderValue(geometryWaveMaxTileRangeRow, geometryDensity.waveMaxTileRangeMeters, 2);
            setSliderValue(geometrySegmentsRow, geometryDensity.segmentsPerTile, 0);
            setSliderValue(geometryNearSegmentsRow, geometryDensity.nearSegmentsPerTile, 0);
            setSliderValue(geometryFarSegmentsRow, geometryDensity.farSegmentsPerTile, 0);
            setSliderValue(geometryNearRadiusRow, geometryDensity.nearRadiusMeters, 0);
            setSliderValue(geometryTransitionWidthRow, geometryDensity.transitionWidthMeters, 0);
            setSliderValue(geometryTransitionSmoothingRow, geometryDensity.transitionSmoothing, 2);
            setSliderValue(geometryTransitionBiasRow, geometryDensity.transitionBias, 2);
            setSliderValue(geometryTransitionBandsRow, geometryDensity.transitionDebugBands, 0);
            geometryCaptureCenterRow.toggle.checked = geometryDensity.centerOnApplyCamera;
            geometryOverlayRow.toggle.checked = geometryDensity.ringOverlayEnabled;
            geometryTileLodDebugRow.toggle.checked = geometryDensity.tileLodDebugEnabled === true;
            configCaptureCenterRow.toggle.checked = geometryDensity.centerOnApplyCamera;
            configTileLodDebugRow.toggle.checked = geometryDensity.tileLodDebugEnabled === true;
            geometryDensity.rebuildCadence = normalizeRebuildCadence(geometryDensity.rebuildCadence, 1.0);
            geometryAutoRebuildCadenceRow.setValue(normalizeRebuildCadenceChoice(geometryDensity.rebuildCadence));
            setGeometryControlsEnabled(geometryDensity.mode, geometryDensity.enabled !== false);
        };

        {
            const biomeTilingTabBody = this._tabBodies?.biome_tiling ?? null;
            if (biomeTilingTabBody) {
                biomeTilingTabBody.appendChild(textureSection);
                biomeTilingTabBody.appendChild(focusSection);
                biomeTilingTabBody.appendChild(biomeTilingSubtabsHost);
                biomeTilingSubtabPanels.get('config')?.appendChild(configSection);
                biomeTilingSubtabPanels.get('dynamic_size')?.appendChild(distanceSection);
                biomeTilingSubtabPanels.get('variation')?.appendChild(variationSection);
                biomeTilingSubtabPanels.get('lod')?.appendChild(geometrySection);
                biomeTilingSubtabPanels.get('displacement')?.appendChild(displacementSection);
                biomeTilingSubtabPanels.get('diagnostics')?.appendChild(diagnosticsSection);
            }
        }

        syncUi();
        this.setBiomeTilingFocusButtons({ activePresetId: '' });
    };
}
