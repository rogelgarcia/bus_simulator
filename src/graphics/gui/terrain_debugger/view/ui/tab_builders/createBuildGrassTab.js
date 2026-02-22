// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildGrassTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildGrassTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildGrassTab() {
        const grass = this._state.grass;
        const tip = (...lines) => lines.filter((l) => l !== null && l !== undefined).join('\n');

        const lodTips = {
            masterEnabled: tip(
                'Enables the Master (highest quality) LOD tier.',
                '',
                'Master is only used when:',
                '• Master Enabled is ON',
                '• Master Dist > 0',
                '• View angle ≤ Master Max Angle',
                '• Field → Allow Master is ON',
                '• LOD Render Mode → Master is not "None"',
                '',
                'When Master is inactive, Near is used at close range instead.'
            ),
            force: tip(
                'Overrides automatic LOD selection.',
                '',
                'Auto: choose/blend tiers by distance & view angle.',
                'Master/Near/Mid/Far: force a tier everywhere (may be remapped if disallowed).',
                'None: disables grass rendering.',
                '',
                'Note: Field → Force LOD (if not Auto) overrides this.'
            ),
            masterDist: tip(
                'Distance where Master fades into Near (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale',
                '(AngleScale depends on Grazing/Top-down settings below).',
                '',
                'Only applies when Master is active (see Master Enabled + Master Max Angle).'
            ),
            nearEnd: tip(
                'End of Near tier. Near blends into Mid around this distance (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            midEnd: tip(
                'End of Mid tier. Mid blends into Far around this distance (± Transition).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            farEnd: tip(
                'Start of Far fade-out.',
                '',
                'Far becomes dominant after Mid End, then begins fading out at Far End and reaches 0 at Cutoff.',
                'This fade uses the [Far End → Cutoff] interval (Transition does not apply).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            cutoff: tip(
                'End of grass visibility.',
                '',
                'At/after Cutoff the Far tier weight becomes 0.',
                'If Cutoff == Far End, grass ends abruptly (no fade).',
                '',
                'Compared against EFFECTIVE distance:',
                'EffectiveDistance = WorldDistance × AngleScale'
            ),
            transition: tip(
                'Blend width for tier transitions (meters).',
                '',
                'Used as ±Transition around:',
                '• Master Dist',
                '• Near End',
                '• Mid End',
                '',
                'Not used for the Far→Cutoff fade (that uses Far End → Cutoff).'
            ),
            grazingAngle: tip(
                'Lower bound of the AngleScale interpolation range.',
                '',
                'View angle is derived from the camera look direction:',
                '0° = looking at the horizon (grazing)',
                '90° = looking straight down/up (top-down)',
                '',
                'At/below this view angle, AngleScale = Grazing Dist Scale.'
            ),
            topDownAngle: tip(
                'Upper bound of the AngleScale interpolation range.',
                '',
                'View angle is derived from the camera look direction:',
                '0° = looking at the horizon (grazing)',
                '90° = looking straight down/up (top-down)',
                '',
                'At/above this view angle, AngleScale = Top-down Dist Scale.'
            ),
            masterMaxAngle: tip(
                'Disables the Master tier when looking too top-down.',
                '',
                'If ViewAngleDeg > Master Max Angle, Master weight becomes 0 and Near starts at 0m.',
                'Use this to avoid expensive 3D tufts when looking downward.'
            ),
            grazingScale: tip(
                'AngleScale used near the horizon (grazing views).',
                '',
                'EffectiveDistance = WorldDistance × AngleScale.',
                '',
                'Smaller (<1): pushes LOD transitions farther out (more detail for longer).',
                'Larger (>1): pulls transitions closer in (more aggressive LOD).'
            ),
            topDownScale: tip(
                'AngleScale used for top-down views.',
                '',
                'EffectiveDistance = WorldDistance × AngleScale.',
                '',
                'Smaller (<1): pushes LOD transitions farther out (more detail for longer).',
                'Larger (>1): pulls transitions closer in (more aggressive LOD).'
            ),
            renderMode: tip(
                'Chooses the geometry strategy for this LOD tier.',
                '',
                '3D Tuft: true 3D blades (most expensive, best close-up).',
                'Star: 3 intersecting quads (cheaper).',
                'Cross: 2 intersecting quads (cheaper).',
                'Cross (Sparse): same geometry as Cross, intended to be used with a lower density multiplier.',
                'None: disables this tier (it is treated as disallowed).'
            ),
            inspect: tip(
                'Opens a popup inspector for this LOD tier.',
                '',
                'Use it to tweak render mode, density, and blade/tuft/material parameters.',
                'Click Save to write changes back into the main Grass config.'
            ),
            densityMul: tip(
                'Multiplier applied on top of Field Density (tufts/m²) and Global Mul.',
                'Approx instances ≈ fieldDensity × globalMul × tierMul × area.',
                '',
                'Counts are cumulative per patch:',
                'Far ≤ Mid ≤ Near ≤ Master (when Master Enabled).',
                'So setting Near Mul below Mid Mul has no effect.'
            ),
            fieldForce: tip(
                'Per-field LOD override.',
                '',
                'If not Auto, this overrides the global LOD Force setting.',
                'Useful for testing tiers without changing the global config.'
            ),
            fieldAllow: tip(
                'Allows/disallows specific tiers for this field.',
                '',
                'If a tier is disallowed (or its Render Mode is "None"), its weight is reassigned to the nearest allowed tier.',
                'If you disable all tiers, Near is automatically re-enabled.'
            ),
            debugBaseRings: tip(
                'Draws the configured LOD distance thresholds as rings centered on the camera.',
                '',
                'These are the raw distances in the LOD section.',
                'Actual transitions use EFFECTIVE distance (distance × AngleScale), so boundaries can shift with view angle.',
                '',
                'Tip: enable "Angle-scaled LOD Rings" to see the current world-space boundaries.'
            ),
            debugAngleScaledRings: tip(
                'Draws LOD rings converted back into world distance for the CURRENT camera view angle.',
                '',
                'Rings are scaled by 1/AngleScale, so they move as you look up/down.',
                'This visualizes how Grazing/Top-down scales affect LOD distances.'
            )
        };

        const engineSection = this._buildSection('grass', 'Engine');
        engineSection.appendChild(makeToggleRow({
            label: 'Enabled',
            value: grass.enabled,
            onChange: (v) => {
                grass.enabled = !!v;
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeTextRow({
            label: 'Seed',
            value: grass.seed,
            placeholder: 'grass-debugger',
            onChange: (v) => {
                grass.seed = String(v ?? '');
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Patch Size (m)',
            value: grass.patch.sizeMeters,
            min: 8,
            max: 256,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.patch.sizeMeters = Math.round(v);
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Y Offset',
            value: grass.patch.yOffset,
            min: -0.2,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                grass.patch.yOffset = v;
                this._emit();
            }
        }).row);

        engineSection.appendChild(makeNumberSliderRow({
            label: 'Density Mult',
            value: grass.density.globalMultiplier,
            min: 0.0,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.globalMultiplier = v;
                this._emit();
            }
        }).row);

        const materialSection = this._buildSection('grass', 'Material');
        const roughnessRow = makeNumberSliderRow({
            label: 'Roughness',
            value: grass.material.roughness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.material.roughness = v;
                this._emit();
            }
        });
        materialSection.appendChild(roughnessRow.row);
        this._controls.grassRoughness = roughnessRow;

        const metalnessRow = makeNumberSliderRow({
            label: 'Metalness',
            value: grass.material.metalness,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.material.metalness = v;
                this._emit();
            }
        });
        materialSection.appendChild(metalnessRow.row);
        this._controls.grassMetalness = metalnessRow;

        const bladeSection = this._buildSection('grass', 'Blade');
        bladeSection.appendChild(makeButtonRow({
            label: 'Blade / Tuft',
            text: 'Inspect Grass Blade',
            onClick: () => this._dispatchUiAction(createTerrainDebuggerInspectGrassAction())
        }).row);
        bladeSection.appendChild(makeEl('div', 'options-note', 'Popup uses a separate render buffer.'));

        const bladesPerTuftRow = makeNumberSliderRow({
            label: 'Blades / Tuft',
            value: grass.geometry.tuft.bladesPerTuft,
            min: 1,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.geometry.tuft.bladesPerTuft = Math.round(v);
                this._emit();
            }
        });
        bladeSection.appendChild(bladesPerTuftRow.row);
        this._controls.grassBladesPerTuft = bladesPerTuftRow;

        const tuftRadiusRow = makeNumberSliderRow({
            label: 'Tuft Radius (x width)',
            value: grass.geometry.tuft.radius,
            min: 0.0,
            max: 6.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.geometry.tuft.radius = v;
                this._emit();
            }
        });
        bladeSection.appendChild(tuftRadiusRow.row);
        this._controls.grassTuftRadius = tuftRadiusRow;

        const bladeWidthRow = makeNumberSliderRow({
            label: 'Width (m)',
            value: grass.geometry.blade.width,
            min: 0.001,
            max: 0.05,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                grass.geometry.blade.width = v;
                this._emit();
            }
        });
        bladeSection.appendChild(bladeWidthRow.row);
        this._controls.grassBladeWidth = bladeWidthRow;

        const bladeHeightMultRow = makeNumberSliderRow({
            label: 'Height Mult',
            value: grass.geometry.blade.height,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.geometry.blade.height = v;
                this._emit();
            }
        });
        bladeSection.appendChild(bladeHeightMultRow.row);
        this._controls.grassHeightMult = bladeHeightMultRow;
        bladeSection.appendChild(makeEl('div', 'options-note', 'Height Mult scales Field Height Min/Max.'));

        const lodSection = this._buildSection('grass', 'LOD');
        lodSection.appendChild(makeEl('div', 'options-note', 'Tip: hover labels for detailed LOD explanations.'));
        lodSection.appendChild(makeToggleRow({
            label: 'Master Enabled',
            tooltip: lodTips.masterEnabled,
            value: grass.lod.enableMaster,
            onChange: (v) => {
                grass.lod.enableMaster = !!v;
                this._emit();
            }
        }).row);

        const forceLodRow = makeSelectRow({
            label: 'Force LOD',
            tooltip: lodTips.force,
            value: grass.lod.force,
            options: [
                { id: 'auto', label: 'Auto' },
                { id: 'master', label: 'Master' },
                { id: 'near', label: 'Near' },
                { id: 'mid', label: 'Mid' },
                { id: 'far', label: 'Far' },
                { id: 'none', label: 'None' }
            ],
            onChange: (id) => {
                grass.lod.force = String(id ?? 'auto');
                this._emit();
            }
        });
        lodSection.appendChild(forceLodRow.row);

        lodSection.appendChild(makeNumberSliderRow({
            label: 'Master Dist (m)',
            tooltip: lodTips.masterDist,
            value: grass.lod.distances.master,
            min: 0,
            max: 50,
            step: 0.25,
            digits: 2,
            onChange: (v) => {
                grass.lod.distances.master = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Near End (m)',
            tooltip: lodTips.nearEnd,
            value: grass.lod.distances.near,
            min: 5,
            max: 500,
            step: 1,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.near = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Mid End (m)',
            tooltip: lodTips.midEnd,
            value: grass.lod.distances.mid,
            min: 10,
            max: 2000,
            step: 5,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.mid = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Far End (m)',
            tooltip: lodTips.farEnd,
            value: grass.lod.distances.far,
            min: 20,
            max: 5000,
            step: 10,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.far = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Cutoff (m)',
            tooltip: lodTips.cutoff,
            value: grass.lod.distances.cutoff,
            min: 20,
            max: 8000,
            step: 10,
            digits: 0,
            onChange: (v) => {
                grass.lod.distances.cutoff = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Transition (m)',
            tooltip: lodTips.transition,
            value: grass.lod.transitionWidthMeters,
            min: 0.1,
            max: 100,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                grass.lod.transitionWidthMeters = v;
                this._emit();
            }
        }).row);

        lodSection.appendChild(makeNumberSliderRow({
            label: 'Grazing Angle (°)',
            tooltip: lodTips.grazingAngle,
            value: grass.lod.angle.grazingDeg,
            min: 0,
            max: 60,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.grazingDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Top-down Angle (°)',
            tooltip: lodTips.topDownAngle,
            value: grass.lod.angle.topDownDeg,
            min: 10,
            max: 90,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.topDownDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Master Max Angle (°)',
            tooltip: lodTips.masterMaxAngle,
            value: grass.lod.angle.masterMaxDeg,
            min: 0,
            max: 60,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                grass.lod.angle.masterMaxDeg = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Grazing Dist Scale',
            tooltip: lodTips.grazingScale,
            value: grass.lod.angle.grazingDistanceScale,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.lod.angle.grazingDistanceScale = v;
                this._emit();
            }
        }).row);
        lodSection.appendChild(makeNumberSliderRow({
            label: 'Top-down Dist Scale',
            tooltip: lodTips.topDownScale,
            value: grass.lod.angle.topDownDistanceScale,
            min: 0.2,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.lod.angle.topDownDistanceScale = v;
                this._emit();
            }
        }).row);

        const lodModes = grass.lod.renderMode && typeof grass.lod.renderMode === 'object'
            ? grass.lod.renderMode
            : (grass.lod.renderMode = { master: 'tuft', near: 'star', mid: 'cross', far: 'cross_sparse' });

        const lodModeSection = this._buildSection('grass', 'LOD Render Mode');
        const modeOptions = [
            { id: 'tuft', label: '3D Tuft (blades)' },
            { id: 'star', label: 'Star' },
            { id: 'cross', label: 'Cross' },
            { id: 'cross_sparse', label: 'Cross (Sparse)' },
            { id: 'none', label: 'None' }
        ];
        const renderMasterRow = makeSelectRow({
            label: 'Master',
            tooltip: lodTips.renderMode,
            value: lodModes.master,
            options: modeOptions,
            onChange: (v) => {
                lodModes.master = String(v ?? 'tuft');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderMasterRow.row);
        this._controls.grassRenderModeMaster = renderMasterRow;

        const renderNearRow = makeSelectRow({
            label: 'Near',
            tooltip: lodTips.renderMode,
            value: lodModes.near,
            options: modeOptions,
            onChange: (v) => {
                lodModes.near = String(v ?? 'star');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderNearRow.row);
        this._controls.grassRenderModeNear = renderNearRow;

        const renderMidRow = makeSelectRow({
            label: 'Mid',
            tooltip: lodTips.renderMode,
            value: lodModes.mid,
            options: modeOptions,
            onChange: (v) => {
                lodModes.mid = String(v ?? 'cross');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderMidRow.row);
        this._controls.grassRenderModeMid = renderMidRow;

        const renderFarRow = makeSelectRow({
            label: 'Far',
            tooltip: lodTips.renderMode,
            value: lodModes.far,
            options: modeOptions,
            onChange: (v) => {
                lodModes.far = String(v ?? 'cross_sparse');
                this._emit();
            }
        });
        lodModeSection.appendChild(renderFarRow.row);
        this._controls.grassRenderModeFar = renderFarRow;

        const lodInspectorSection = this._buildSection('grass', 'LOD Inspectors');
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Master',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._dispatchUiAction(createTerrainDebuggerInspectGrassLodAction('master'))
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Near',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._dispatchUiAction(createTerrainDebuggerInspectGrassLodAction('near'))
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Mid',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._dispatchUiAction(createTerrainDebuggerInspectGrassLodAction('mid'))
        }).row);
        lodInspectorSection.appendChild(makeButtonRow({
            label: 'Far',
            text: 'Inspect',
            tooltip: lodTips.inspect,
            onClick: () => this._dispatchUiAction(createTerrainDebuggerInspectGrassLodAction('far'))
        }).row);

        const lodDensitySection = this._buildSection('grass', 'LOD Density');
        const densityMasterRow = makeNumberSliderRow({
            label: 'Master Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.masterMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.masterMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityMasterRow.row);
        this._controls.grassDensityMasterMul = densityMasterRow;

        const densityNearRow = makeNumberSliderRow({
            label: 'Near Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.nearMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.nearMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityNearRow.row);
        this._controls.grassDensityNearMul = densityNearRow;

        const densityMidRow = makeNumberSliderRow({
            label: 'Mid Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.midMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.midMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityMidRow.row);
        this._controls.grassDensityMidMul = densityMidRow;

        const densityFarRow = makeNumberSliderRow({
            label: 'Far Mul',
            tooltip: lodTips.densityMul,
            value: grass.density.farMul,
            min: 0.0,
            max: 8.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.density.farMul = v;
                this._emit();
            }
        });
        lodDensitySection.appendChild(densityFarRow.row);
        this._controls.grassDensityFarMul = densityFarRow;

        const fieldSection = this._buildSection('grass', 'Field');
        fieldSection.appendChild(makeToggleRow({
            label: 'Enabled',
            value: grass.field.enabled,
            onChange: (v) => {
                grass.field.enabled = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Density (tufts/m²)',
            value: grass.field.density,
            min: 0.0,
            max: 60.0,
            step: 0.1,
            digits: 1,
            onChange: (v) => {
                grass.field.density = v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeColorRow({
            label: 'Base Color',
            value: grass?.field?.color?.base ?? '#2E8F3D',
            onChange: (hex) => {
                grass.field.color.base = hex;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Hue Var (±°)',
            value: Math.max(0, Number(grass?.field?.color?.variation?.hueShiftDeg?.max) || 0),
            min: 0.0,
            max: 45.0,
            step: 0.25,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.hueShiftDeg.min = -v;
                grass.field.color.variation.hueShiftDeg.max = v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Sat Var (±)',
            value: Math.max(0, (Number(grass?.field?.color?.variation?.saturationMul?.max) || 1) - 1),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.saturationMul.min = Math.max(0, 1 - v);
                grass.field.color.variation.saturationMul.max = 1 + v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeNumberSliderRow({
            label: 'Bri Var (±)',
            value: Math.max(0, (Number(grass?.field?.color?.variation?.brightnessMul?.max) || 1) - 1),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.color.variation.brightnessMul.min = Math.max(0, 1 - v);
                grass.field.color.variation.brightnessMul.max = 1 + v;
                this._emit();
            }
        }).row);
        const fieldHeightMinRow = makeNumberSliderRow({
            label: 'Height Min (m)',
            value: grass.field.height.min,
            min: 0.02,
            max: 1.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.height.min = v;
                this._emit();
            }
        });
        fieldSection.appendChild(fieldHeightMinRow.row);
        this._controls.grassFieldHeightMin = fieldHeightMinRow;

        const fieldHeightMaxRow = makeNumberSliderRow({
            label: 'Height Max (m)',
            value: grass.field.height.max,
            min: 0.02,
            max: 2.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                grass.field.height.max = v;
                this._emit();
            }
        });
        fieldSection.appendChild(fieldHeightMaxRow.row);
        this._controls.grassFieldHeightMax = fieldHeightMaxRow;
        fieldSection.appendChild(makeSelectRow({
            label: 'Force LOD',
            tooltip: lodTips.fieldForce,
            value: grass?.field?.lod?.force ?? 'auto',
            options: [
                { id: 'auto', label: 'Auto' },
                { id: 'master', label: 'Master' },
                { id: 'near', label: 'Near' },
                { id: 'mid', label: 'Mid' },
                { id: 'far', label: 'Far' },
                { id: 'none', label: 'None' }
            ],
            onChange: (v) => {
                grass.field.lod.force = String(v ?? 'auto');
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeEl('div', 'options-note', 'Allow LODs:'));
        const fieldAllow = grass?.field?.lod?.allow ?? {};
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Master',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.master,
            onChange: (v) => {
                grass.field.lod.allow.master = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Near',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.near,
            onChange: (v) => {
                grass.field.lod.allow.near = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Mid',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.mid,
            onChange: (v) => {
                grass.field.lod.allow.mid = !!v;
                this._emit();
            }
        }).row);
        fieldSection.appendChild(makeToggleRow({
            label: 'Allow Far',
            tooltip: lodTips.fieldAllow,
            value: !!fieldAllow.far,
            onChange: (v) => {
                grass.field.lod.allow.far = !!v;
                this._emit();
            }
        }).row);

        const exclusionSection = this._buildSection('grass', 'Exclusion');
        exclusionSection.appendChild(makeToggleRow({
            label: 'Road / Sidewalk',
            value: grass.exclusion.enabled,
            onChange: (v) => {
                grass.exclusion.enabled = !!v;
                this._emit();
            }
        }).row);
        exclusionSection.appendChild(makeNumberSliderRow({
            label: 'Margin (m)',
            value: grass.exclusion.marginMeters,
            min: 0.0,
            max: 10.0,
            step: 0.05,
            digits: 2,
            onChange: (v) => {
                grass.exclusion.marginMeters = v;
                this._emit();
            }
        }).row);

        const debugSection = this._buildSection('grass', 'Debug');
        debugSection.appendChild(makeToggleRow({
            label: 'LOD Rings',
            tooltip: lodTips.debugBaseRings,
            value: grass.debug.showLodRings,
            onChange: (v) => {
                grass.debug.showLodRings = !!v;
                this._emit();
            }
        }).row);
        debugSection.appendChild(makeToggleRow({
            label: 'Angle-scaled LOD Rings',
            tooltip: lodTips.debugAngleScaledRings,
            value: !!grass.debug.showLodAngleScaledRings,
            onChange: (v) => {
                grass.debug.showLodAngleScaledRings = !!v;
                this._emit();
            }
        }).row);

        this._controls.grassLodDebugInfo = makeEl('div', 'options-note', 'View angle: (n/a) · AngleScale: (n/a)');
        debugSection.appendChild(this._controls.grassLodDebugInfo);

        const statsSection = this._buildSection('grass', 'Stats');
        this._controls.grassStatsInstances = makeEl('div', 'options-note', 'Instances: (disabled)');
        this._controls.grassStatsTriangles = makeEl('div', 'options-note', 'Triangles: (disabled)');
        this._controls.grassStatsDrawCalls = makeEl('div', 'options-note', 'Draw calls: (disabled)');
        statsSection.appendChild(this._controls.grassStatsInstances);
        statsSection.appendChild(this._controls.grassStatsTriangles);
        statsSection.appendChild(this._controls.grassStatsDrawCalls);
    };
}
