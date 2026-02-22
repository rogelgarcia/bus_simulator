// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildTerrainTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildTerrainTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildTerrainTab() {
        const terrain = this._state.terrain;
        const engine = (terrain.engine && typeof terrain.engine === 'object') ? terrain.engine : {};
        terrain.engine = engine;

        if (typeof engine.seed !== 'string') engine.seed = 'terrain-debugger';

        const patch = (engine.patch && typeof engine.patch === 'object') ? engine.patch : {};
        engine.patch = patch;
        patch.sizeMeters = Math.max(1, Math.round(clamp(patch.sizeMeters, 1, 4096, 72)));
        patch.originX = Number.isFinite(patch.originX) ? Number(patch.originX) : 0;
        patch.originZ = Number.isFinite(patch.originZ) ? Number(patch.originZ) : 0;
        if (patch.layout !== 'grid' && patch.layout !== 'voronoi') patch.layout = 'voronoi';
        patch.voronoiJitter = clamp(patch.voronoiJitter, 0.0, 1.0, 0.85);
        patch.warpScale = clamp(patch.warpScale, 0.000001, 10.0, 0.02);
        const warpAmpDefault = Math.min(256, Math.max(0, Math.round(Number(patch.sizeMeters) * 0.5)));
        const warpAmpRaw = Number(patch.warpAmplitudeMeters);
        patch.warpAmplitudeMeters = Number.isFinite(warpAmpRaw) ? Math.max(0, warpAmpRaw) : warpAmpDefault;

        const biomes = (engine.biomes && typeof engine.biomes === 'object') ? engine.biomes : {};
        engine.biomes = biomes;
        if (biomes.mode !== 'patch_grid' && biomes.mode !== 'source_map') biomes.mode = 'patch_grid';
        if (typeof biomes.defaultBiomeId !== 'string') biomes.defaultBiomeId = 'land';
        const weights = (biomes.weights && typeof biomes.weights === 'object') ? biomes.weights : {};
        biomes.weights = weights;
        if (!Number.isFinite(weights.stone)) weights.stone = 0.25;
        if (!Number.isFinite(weights.grass)) weights.grass = 0.35;
        if (!Number.isFinite(weights.land)) weights.land = 0.40;

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

        const humidity = (engine.humidity && typeof engine.humidity === 'object') ? engine.humidity : {};
        engine.humidity = humidity;
        humidity.mode = 'source_map';
        const humidityCloud = (humidity.cloud && typeof humidity.cloud === 'object') ? humidity.cloud : {};
        humidity.cloud = humidityCloud;
        humidityCloud.subtilePerTile = Math.max(1, Math.min(32, Math.round(Number(humidityCloud.subtilePerTile) || 8)));
        humidityCloud.scale = clamp(humidityCloud.scale, 0.0005, 0.2, 0.02);
        humidityCloud.octaves = Math.max(1, Math.min(8, Math.round(Number(humidityCloud.octaves) || 4)));
        humidityCloud.gain = clamp(humidityCloud.gain, 0.01, 1.0, 0.5);
        humidityCloud.lacunarity = clamp(humidityCloud.lacunarity, 1.0, 4.0, 2.0);
        humidityCloud.bias = clamp(humidityCloud.bias, -1.0, 1.0, 0.0);
        humidityCloud.amplitude = clamp(humidityCloud.amplitude, 0.0, 1.0, 1.0);

        const materialBindings = (engine.materialBindings && typeof engine.materialBindings === 'object') ? engine.materialBindings : {};
        engine.materialBindings = materialBindings;
        const biomeBindings = (materialBindings.biomes && typeof materialBindings.biomes === 'object') ? materialBindings.biomes : {};
        materialBindings.biomes = biomeBindings;
        for (const biome of TERRAIN_BIOME_IDS) {
            const fallbackBiome = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS[biome];
            const row = (biomeBindings[biome] && typeof biomeBindings[biome] === 'object') ? biomeBindings[biome] : {};
            biomeBindings[biome] = row;
            for (const slot of TERRAIN_HUMIDITY_SLOT_IDS) {
                row[slot] = normalizeMaterialId(row[slot], fallbackBiome?.[slot] ?? defaultMaterialId);
            }
        }
        const humidityBindings = (materialBindings.humidity && typeof materialBindings.humidity === 'object') ? materialBindings.humidity : {};
        materialBindings.humidity = humidityBindings;
        humidityBindings.dryMax = clamp(humidityBindings.dryMax, 0.05, 0.49, 0.33);
        humidityBindings.wetMin = clamp(humidityBindings.wetMin, 0.51, 0.95, 0.67);
        if (humidityBindings.wetMin <= humidityBindings.dryMax + 0.02) humidityBindings.wetMin = Math.min(0.95, humidityBindings.dryMax + 0.02);
        humidityBindings.blendBand = clamp(humidityBindings.blendBand, 0.005, 0.25, 0.02);
        humidityBindings.edgeNoiseScale = clamp(humidityBindings.edgeNoiseScale, 0.001, 0.2, 0.025);
        humidityBindings.edgeNoiseStrength = clamp(humidityBindings.edgeNoiseStrength, 0.0, 0.3, 0.0);

        const transition = (engine.transition && typeof engine.transition === 'object') ? engine.transition : {};
        engine.transition = transition;
        transition.cameraBlendRadiusMeters = Math.max(0, Number(transition.cameraBlendRadiusMeters) || 140);
        transition.cameraBlendFeatherMeters = Math.max(0, Number(transition.cameraBlendFeatherMeters) || 24);
        transition.boundaryBandMeters = Math.max(0, Number(transition.boundaryBandMeters) || 10);
        transition.profileDefaults = sanitizeTransitionPairProfile(transition.profileDefaults, {
            fallbackProfile: BIOME_TRANSITION_PROFILE_DEFAULT
        });
        const pairProfilesRaw = transition.pairProfiles && typeof transition.pairProfiles === 'object' ? transition.pairProfiles : {};
        const pairProfiles = {};
        for (const [rawKey, rawProfile] of Object.entries(pairProfilesRaw)) {
            const key = String(rawKey ?? '').trim();
            if (!key) continue;
            const parts = key.split('|');
            if (parts.length !== 2) continue;
            const pairKey = makeBiomePairKey(parts[0], parts[1]);
            pairProfiles[pairKey] = sanitizeTransitionPairProfile(rawProfile, {
                fallbackProfile: transition.profileDefaults
            });
        }
        transition.pairProfiles = pairProfiles;

        const debug = (terrain.debug && typeof terrain.debug === 'object') ? terrain.debug : {};
        terrain.debug = debug;
        const modeRaw = String(debug.mode ?? 'standard');
        const modeAllowed = new Set(['standard', 'biome_id', 'patch_ids', 'humidity', 'transition_band']);
        debug.mode = modeAllowed.has(modeRaw) ? modeRaw : 'standard';

        const viewSection = this._buildSection('terrain', 'View');
        const modeNotes = Object.freeze({
            standard: 'Standard render mode (biome + humidity material binding).',
            biome_id: 'Primary biome ID per patch (stone/grass/land). Validate there are no gaps (uncolored areas).',
            patch_ids: 'Patch IDs and boundaries. Patch colors are stable per patchId; boundaries should be continuous with no gaps.',
            humidity: 'Humidity field [0..1] generated by cloud noise per subtile.',
            transition_band: 'Final PBR transition bands (biome boundaries + humidity slot edges).'
        });

        const viewModeRow = makeChoiceRow({
            label: 'Mode',
            value: debug.mode,
            options: [
                { id: 'standard', label: 'Standard' },
                { id: 'biome_id', label: 'Biome ID' },
                { id: 'patch_ids', label: 'Patch IDs' },
                { id: 'humidity', label: 'Humidity' },
                { id: 'transition_band', label: 'Transition Band' }
            ],
            tooltip: 'Switch between standard rendering and terrain-engine diagnostic views.',
            onChange: (id) => {
                const next = String(id ?? 'standard');
                debug.mode = modeAllowed.has(next) ? next : 'standard';
                if (viewNote) viewNote.textContent = modeNotes[debug.mode] ?? '';
                this._emit();
            }
        });
        viewSection.appendChild(viewModeRow.row);
        const viewNote = makeEl('div', 'options-note', modeNotes[debug.mode] ?? '');
        viewSection.appendChild(viewNote);
        this._controls.terrainViewMode = viewModeRow;

        const legendSection = this._buildSection('terrain', 'Legend');
        legendSection.appendChild(makeEl('div', 'options-note', 'Biome indices (packed mask R/G channels):'));
        const makeLegendRow = ({ color, text }) => {
            const row = makeEl('div', 'options-note', '');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            const swatch = makeEl('span', null, '');
            swatch.style.display = 'inline-block';
            swatch.style.width = '12px';
            swatch.style.height = '12px';
            swatch.style.borderRadius = '3px';
            swatch.style.background = String(color ?? '#000');
            swatch.style.border = '1px solid rgba(0,0,0,0.35)';
            row.appendChild(swatch);
            row.appendChild(makeEl('span', null, String(text ?? '')));
            return row;
        };
        legendSection.appendChild(makeLegendRow({ color: '#969696', text: '0 = stone' }));
        legendSection.appendChild(makeLegendRow({ color: '#46A04E', text: '1 = grass' }));
        legendSection.appendChild(makeLegendRow({ color: '#D79146', text: '2 = land' }));
        legendSection.appendChild(makeEl('div', 'options-note', 'Patch ID colors (Patch IDs mode): deterministic hash of patchId (stable). Boundaries are drawn black.'));
        legendSection.appendChild(makeEl('div', 'options-note', 'Biome × humidity active PBR slots:'));
        const pbrLegend = makeEl('div', '');
        pbrLegend.style.display = 'grid';
        pbrLegend.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
        pbrLegend.style.gap = '8px';
        pbrLegend.setAttribute('data-terrain-pbr-legend', '1');
        legendSection.appendChild(pbrLegend);
        this._controls.terrainPbrLegend = pbrLegend;
        const sampleNote = makeEl('div', 'options-note', 'Sample: (move mouse over terrain)');
        legendSection.appendChild(sampleNote);
        this._controls.terrainSampleNote = sampleNote;

        const section = this._buildSection('terrain', 'Terrain Engine');
        section.appendChild(makeEl('div', 'options-note', 'Patch-based biomes are hard-bordered at map scale. Boundary blending is view-dependent near the camera.'));

        const seedRow = makeTextRow({
            label: 'Seed',
            value: engine.seed,
            placeholder: 'terrain-debugger',
            tooltip: 'Deterministic seed for patch layout and humidity edge shaping.',
            onChange: (v) => {
                engine.seed = String(v ?? '');
                this._emit();
            }
        });
        section.appendChild(seedRow.row);
        this._controls.engineSeed = seedRow;

        const patchSizeRow = makeNumberSliderRow({
            label: 'Patch Size (m)',
            value: Number(patch.sizeMeters),
            min: 8,
            max: 512,
            step: 1,
            digits: 0,
            tooltip: 'Patch cell size (controls patch scale).',
            onChange: (v) => {
                patch.sizeMeters = Math.max(1, Math.round(v));
                this._emit();
            }
        });
        section.appendChild(patchSizeRow.row);
        this._controls.enginePatchSizeMeters = patchSizeRow;

        let warpAmpRow = null;
        let warpScaleRow = null;

        const patchLayoutRow = makeChoiceRow({
            label: 'Patch Layout',
            value: String(patch.layout ?? 'voronoi'),
            options: [
                { id: 'voronoi', label: 'Voronoi' },
                { id: 'grid', label: 'Grid' }
            ],
            tooltip: 'Voronoi yields organic patch shapes. Grid yields axis-aligned patch cells.',
            onChange: (id) => {
                const next = String(id ?? '');
                patch.layout = next === 'grid' ? 'grid' : 'voronoi';
                const isVoronoi = patch.layout === 'voronoi';
                if (voronoiJitterRow?.range) voronoiJitterRow.range.disabled = !isVoronoi;
                if (voronoiJitterRow?.number) voronoiJitterRow.number.disabled = !isVoronoi;
                if (warpAmpRow?.range) warpAmpRow.range.disabled = !isVoronoi;
                if (warpAmpRow?.number) warpAmpRow.number.disabled = !isVoronoi;
                if (warpScaleRow?.range) warpScaleRow.range.disabled = !isVoronoi;
                if (warpScaleRow?.number) warpScaleRow.number.disabled = !isVoronoi;
                this._emit();
            }
        });
        section.appendChild(patchLayoutRow.row);
        this._controls.enginePatchLayout = patchLayoutRow;

        const voronoiJitterRow = makeNumberSliderRow({
            label: 'Voronoi Jitter',
            value: Number(patch.voronoiJitter),
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            tooltip: 'Randomizes patch seed positions inside each cell (higher = more organic).',
            onChange: (v) => {
                patch.voronoiJitter = clamp(v, 0.0, 1.0, 0.85);
                this._emit();
            }
        });
        const isVoronoi = String(patch.layout ?? 'voronoi') !== 'grid';
        voronoiJitterRow.range.disabled = !isVoronoi;
        voronoiJitterRow.number.disabled = !isVoronoi;
        section.appendChild(voronoiJitterRow.row);
        this._controls.engineVoronoiJitter = voronoiJitterRow;

        warpAmpRow = makeNumberSliderRow({
            label: 'Warp Amplitude (m)',
            value: Number(patch.warpAmplitudeMeters),
            min: 0,
            max: 256,
            step: 1,
            digits: 0,
            tooltip: 'Curves Voronoi patch boundaries by warping the sampling domain. Set to 0 to disable.',
            onChange: (v) => {
                patch.warpAmplitudeMeters = Math.max(0, Math.round(Number(v) || 0));
                this._emit();
            }
        });
        warpAmpRow.range.disabled = !isVoronoi;
        warpAmpRow.number.disabled = !isVoronoi;
        section.appendChild(warpAmpRow.row);
        this._controls.engineWarpAmplitudeMeters = warpAmpRow;

        warpScaleRow = makeNumberSliderRow({
            label: 'Warp Scale',
            value: Number(patch.warpScale),
            min: 0.001,
            max: 0.08,
            step: 0.001,
            digits: 3,
            tooltip: 'Frequency of the warp noise (higher = more wiggles).',
            onChange: (v) => {
                patch.warpScale = clamp(v, 0.000001, 10.0, 0.02);
                this._emit();
            }
        });
        warpScaleRow.range.disabled = !isVoronoi;
        warpScaleRow.number.disabled = !isVoronoi;
        section.appendChild(warpScaleRow.row);
        this._controls.engineWarpScale = warpScaleRow;

        const defaultBiomeRow = makeSelectRow({
            label: 'Default Biome',
            value: String(biomes.defaultBiomeId ?? 'land'),
            options: [
                { id: 'stone', label: 'Stone' },
                { id: 'grass', label: 'Grass' },
                { id: 'land', label: 'Land' }
            ],
            tooltip: 'Fallback biome (outside bounds or invalid states).',
            onChange: (id) => {
                biomes.defaultBiomeId = String(id ?? 'land');
                this._emit();
            }
        });
        section.appendChild(defaultBiomeRow.row);
        this._controls.engineDefaultBiomeId = defaultBiomeRow;

        const weightsSection = this._buildSection('terrain', 'Biome Weights');
        weightsSection.appendChild(makeEl('div', 'options-note', 'Weights are normalized. Setting all weights to 0 falls back to defaults.'));

        const stoneRow = makeNumberSliderRow({
            label: 'Stone',
            value: Number(weights.stone),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                weights.stone = v;
                this._emit();
            }
        });
        weightsSection.appendChild(stoneRow.row);

        const grassRow = makeNumberSliderRow({
            label: 'Grass',
            value: Number(weights.grass),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                weights.grass = v;
                this._emit();
            }
        });
        weightsSection.appendChild(grassRow.row);

        const landRow = makeNumberSliderRow({
            label: 'Land',
            value: Number(weights.land),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                weights.land = v;
                this._emit();
            }
        });
        weightsSection.appendChild(landRow.row);

        const humiditySection = this._buildSection('terrain', 'Humidity Pattern');
        humiditySection.appendChild(makeEl('div', 'options-note', 'Humidity uses a cloud-noise pattern with one humidity value per subtile.'));
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Subtiles / Tile',
            value: Number(humidityCloud.subtilePerTile),
            min: 1,
            max: 32,
            step: 1,
            digits: 0,
            onChange: (v) => {
                humidityCloud.subtilePerTile = Math.max(1, Math.min(32, Math.round(v)));
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Cloud Scale',
            value: Number(humidityCloud.scale),
            min: 0.0005,
            max: 0.2,
            step: 0.0005,
            digits: 4,
            onChange: (v) => {
                humidityCloud.scale = clamp(v, 0.0005, 0.2, 0.02);
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Octaves',
            value: Number(humidityCloud.octaves),
            min: 1,
            max: 8,
            step: 1,
            digits: 0,
            onChange: (v) => {
                humidityCloud.octaves = Math.max(1, Math.min(8, Math.round(v)));
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Gain',
            value: Number(humidityCloud.gain),
            min: 0.01,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                humidityCloud.gain = clamp(v, 0.01, 1.0, 0.5);
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Lacunarity',
            value: Number(humidityCloud.lacunarity),
            min: 1.0,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                humidityCloud.lacunarity = clamp(v, 1.0, 4.0, 2.0);
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Bias',
            value: Number(humidityCloud.bias),
            min: -1.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                humidityCloud.bias = clamp(v, -1.0, 1.0, 0.0);
                this._emit();
            }
        }).row);
        humiditySection.appendChild(makeNumberSliderRow({
            label: 'Amplitude',
            value: Number(humidityCloud.amplitude),
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                humidityCloud.amplitude = clamp(v, 0.0, 1.0, 1.0);
                this._emit();
            }
        }).row);

        const humidityDryRow = makeNumberSliderRow({
            label: 'Dry Max',
            value: Number(humidityBindings.dryMax),
            min: 0.05,
            max: 0.49,
            step: 0.01,
            digits: 2,
            tooltip: 'Humidity values below this threshold resolve to dry PBR slot.',
            onChange: (v) => {
                humidityBindings.dryMax = clamp(v, 0.05, 0.49, 0.33);
                if (humidityBindings.wetMin <= humidityBindings.dryMax + 0.02) humidityBindings.wetMin = Math.min(0.95, humidityBindings.dryMax + 0.02);
                this._emit();
            }
        });
        humiditySection.appendChild(humidityDryRow.row);

        const humidityWetRow = makeNumberSliderRow({
            label: 'Wet Min',
            value: Number(humidityBindings.wetMin),
            min: 0.51,
            max: 0.95,
            step: 0.01,
            digits: 2,
            tooltip: 'Humidity values above this threshold resolve to wet PBR slot.',
            onChange: (v) => {
                humidityBindings.wetMin = clamp(v, 0.51, 0.95, 0.67);
                if (humidityBindings.wetMin <= humidityBindings.dryMax + 0.02) humidityBindings.wetMin = Math.min(0.95, humidityBindings.dryMax + 0.02);
                this._emit();
            }
        });
        humiditySection.appendChild(humidityWetRow.row);

        const humidityBandRow = makeNumberSliderRow({
            label: 'Edge Band',
            value: Number(humidityBindings.blendBand),
            min: 0.005,
            max: 0.25,
            step: 0.005,
            digits: 3,
            tooltip: 'Band-only blend width around dry/neutral/wet boundaries.',
            onChange: (v) => {
                humidityBindings.blendBand = clamp(v, 0.005, 0.25, 0.02);
                this._emit();
            }
        });
        humiditySection.appendChild(humidityBandRow.row);

        const humidityEdgeNoiseScaleRow = makeNumberSliderRow({
            label: 'Edge Noise Scale',
            value: Number(humidityBindings.edgeNoiseScale),
            min: 0.001,
            max: 0.2,
            step: 0.001,
            digits: 3,
            onChange: (v) => {
                humidityBindings.edgeNoiseScale = clamp(v, 0.001, 0.2, 0.025);
                this._emit();
            }
        });
        humiditySection.appendChild(humidityEdgeNoiseScaleRow.row);

        const humidityEdgeNoiseStrengthRow = makeNumberSliderRow({
            label: 'Edge Noise Strength',
            value: Number(humidityBindings.edgeNoiseStrength),
            min: 0.0,
            max: 0.3,
            step: 0.005,
            digits: 3,
            onChange: (v) => {
                humidityBindings.edgeNoiseStrength = clamp(v, 0.0, 0.3, 0.0);
                this._emit();
            }
        });
        humiditySection.appendChild(humidityEdgeNoiseStrengthRow.row);

        const transitionSection = this._buildSection('terrain', 'Transitions');
        transitionSection.appendChild(makeEl('div', 'options-note', 'Blend zone only affects patch boundaries. Outside the zone, borders are hard.'));

        const radiusRow = makeNumberSliderRow({
            label: 'Blend Radius (m)',
            value: Number(transition.cameraBlendRadiusMeters),
            min: 0,
            max: 2000,
            step: 1,
            digits: 0,
            onChange: (v) => {
                transition.cameraBlendRadiusMeters = Math.max(0, Math.round(v));
                this._emit();
            }
        });
        transitionSection.appendChild(radiusRow.row);

        const featherRow = makeNumberSliderRow({
            label: 'Radius Feather (m)',
            value: Number(transition.cameraBlendFeatherMeters),
            min: 0,
            max: 500,
            step: 1,
            digits: 0,
            onChange: (v) => {
                transition.cameraBlendFeatherMeters = Math.max(0, Math.round(v));
                this._emit();
            }
        });
        transitionSection.appendChild(featherRow.row);

        const bandRow = makeNumberSliderRow({
            label: 'Boundary Band (m)',
            value: Number(transition.boundaryBandMeters),
            min: 0,
            max: 80,
            step: 0.5,
            digits: 1,
            onChange: (v) => {
                transition.boundaryBandMeters = Math.max(0, v);
                this._emit();
            }
        });
        transitionSection.appendChild(bandRow.row);
    };
}
