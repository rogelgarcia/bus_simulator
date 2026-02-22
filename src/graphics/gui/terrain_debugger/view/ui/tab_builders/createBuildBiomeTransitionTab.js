// src/graphics/gui/terrain_debugger/view/ui/tab_builders/createBuildBiomeTransitionTab.js
// Terrain Debugger tab builder extracted from TerrainDebuggerUI.
// @ts-check

export function createBuildBiomeTransitionTab(deps = {}) {
    const { clamp, formatFixedWidthNumber, makeEl, makeToggleRow, makeSelectRow, makeChoiceRow, makeNumberSliderRow, makeTextRow, makeColorRow, makeButtonRow, deepClone, deepMerge, TERRAIN_BIOME_IDS, TERRAIN_HUMIDITY_SLOT_IDS, DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS, BIOME_TRANSITION_INTENT_IDS, BIOME_TRANSITION_INTENT_PRESETS, BIOME_TRANSITION_DEBUG_MODE_OPTIONS, BIOME_TRANSITION_PROFILE_DEFAULT, TERRAIN_BIOME_SHADER_TEMP_DISABLED, TERRAIN_BIOME_SHADER_TEMP_DISABLED_REASON, titleCaseHumSlot, titleCaseBiome, normalizeHumiditySlotId, getBiomeSortIndex, makeBiomePairKey, normalizeTransitionIntentId, getTransitionIntentPreset, sanitizeTransitionPairProfile, buildTransitionPreviewGradient, getPatternTypeLabel, getAntiTilingLabel, pickNextPatternType, getIblOptions, DEFAULT_IBL_ID, getPbrMaterialOptionsForGround, getPbrMaterialClassSectionsForGround, createDefaultGrassEngineConfig, createTerrainDebuggerCameraPresetAction, createTerrainDebuggerFlyoverLoopChangedAction, createTerrainDebuggerFocusBiomeTilingAction, createTerrainDebuggerFocusBiomeTransitionAction, createTerrainDebuggerInspectGrassAction, createTerrainDebuggerInspectGrassLodAction, createTerrainDebuggerResetCameraAction, createTerrainDebuggerToggleFlyoverAction } = deps;
    return function buildBiomeTransitionTab() {
        const terrain = this._state.terrain && typeof this._state.terrain === 'object' ? this._state.terrain : {};
        this._state.terrain = terrain;
        const engine = (terrain.engine && typeof terrain.engine === 'object') ? terrain.engine : {};
        terrain.engine = engine;
        const transition = (engine.transition && typeof engine.transition === 'object') ? engine.transition : {};
        engine.transition = transition;
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
            pairProfiles[pairKey] = sanitizeTransitionPairProfile(rawProfile, { fallbackProfile: transition.profileDefaults });
        }
        transition.pairProfiles = pairProfiles;
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

        const bt = (terrain.biomeTransition && typeof terrain.biomeTransition === 'object') ? terrain.biomeTransition : {};
        terrain.biomeTransition = bt;
        const transitionBiomeLeft = 'grass';
        const transitionBiomeRight = 'land';
        const transitionBiomePairKey = makeBiomePairKey(transitionBiomeLeft, transitionBiomeRight);
        bt.biome1 = transitionBiomeLeft;
        bt.biome2 = transitionBiomeRight;
        bt.debugMode = BIOME_TRANSITION_DEBUG_MODE_OPTIONS.some((opt) => opt.id === bt.debugMode) ? bt.debugMode : 'transition_result';
        bt.compareEnabled = !!bt.compareEnabled;
        bt.leftMaterialId = typeof bt.leftMaterialId === 'string' ? bt.leftMaterialId : '';
        bt.rightMaterialId = typeof bt.rightMaterialId === 'string' ? bt.rightMaterialId : '';
        bt.selectedPresetId = typeof bt.selectedPresetId === 'string' ? bt.selectedPresetId : '';
        bt.catalog = Array.isArray(bt.catalog) ? bt.catalog : [];
        bt.baselineProfiles = (bt.baselineProfiles && typeof bt.baselineProfiles === 'object') ? bt.baselineProfiles : {};
        bt.texturePairProfiles = (bt.texturePairProfiles && typeof bt.texturePairProfiles === 'object') ? bt.texturePairProfiles : {};
        bt.textureBaselineProfiles = (bt.textureBaselineProfiles && typeof bt.textureBaselineProfiles === 'object') ? bt.textureBaselineProfiles : {};

        const sanitizeCatalogEntry = (entry) => {
            const src = entry && typeof entry === 'object' ? entry : null;
            if (!src) return null;
            const biome1 = transitionBiomeLeft;
            const biome2 = transitionBiomeRight;
            const pairKey = makeBiomePairKey(biome1, biome2);
            const profile = sanitizeTransitionPairProfile(src.profile, { fallbackProfile: transition.profileDefaults });
            const id = String(src.id ?? '').trim();
            if (!id) return null;
            const name = String(src.name ?? '').trim() || pairKey;
            const leftMaterialId = typeof src.leftMaterialId === 'string' ? src.leftMaterialId.trim() : '';
            const rightMaterialId = typeof src.rightMaterialId === 'string' ? src.rightMaterialId.trim() : '';
            return {
                id,
                name,
                biome1,
                biome2,
                pairKey,
                leftMaterialId,
                rightMaterialId,
                profile,
                createdAt: typeof src.createdAt === 'string' ? src.createdAt : null
            };
        };
        bt.catalog = bt.catalog.map((entry) => sanitizeCatalogEntry(entry)).filter((entry) => !!entry);

        const baselineProfiles = {};
        for (const [rawKey, rawProfile] of Object.entries(bt.baselineProfiles)) {
            const key = String(rawKey ?? '').trim();
            if (!key) continue;
            const parts = key.split('|');
            if (parts.length !== 2) continue;
            const pairKey = makeBiomePairKey(parts[0], parts[1]);
            baselineProfiles[pairKey] = sanitizeTransitionPairProfile(rawProfile, { fallbackProfile: transition.profileDefaults });
        }
        bt.baselineProfiles = baselineProfiles;
        const texturePairProfiles = {};
        for (const [rawKey, rawProfile] of Object.entries(bt.texturePairProfiles)) {
            const key = String(rawKey ?? '').trim();
            if (!key) continue;
            texturePairProfiles[key] = sanitizeTransitionPairProfile(rawProfile, { fallbackProfile: transition.profileDefaults });
        }
        bt.texturePairProfiles = texturePairProfiles;
        const textureBaselineProfiles = {};
        for (const [rawKey, rawProfile] of Object.entries(bt.textureBaselineProfiles)) {
            const key = String(rawKey ?? '').trim();
            if (!key) continue;
            textureBaselineProfiles[key] = sanitizeTransitionPairProfile(rawProfile, { fallbackProfile: transition.profileDefaults });
        }
        bt.textureBaselineProfiles = textureBaselineProfiles;

        const getActivePair = () => {
            const biome1 = transitionBiomeLeft;
            const biome2 = transitionBiomeRight;
            const pairKey = transitionBiomePairKey;
            return { biome1, biome2, pairKey };
        };

        const makeTexturePairKey = (materialA, materialB) => {
            const a = normalizeMaterialId(materialA, defaultMaterialId);
            const b = normalizeMaterialId(materialB, defaultMaterialId);
            if (a === b) return `${a}|${a}`;
            return a <= b ? `${a}|${b}` : `${b}|${a}`;
        };

        const setSliderValue = (ctrl, value, digits = 3) => {
            if (!ctrl?.range || !ctrl?.number) return;
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            ctrl.range.value = String(v);
            ctrl.number.value = String(v.toFixed(digits));
        };

        const applyMaterialToBiomeAllHumiditySlots = (biomeId, materialId) => {
            const biome = TERRAIN_BIOME_IDS.includes(String(biomeId ?? '')) ? String(biomeId) : 'land';
            const fallbackBiome = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS[biome] ?? DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS.land;
            const fallbackId = fallbackBiome.neutral ?? fallbackBiome.dry ?? fallbackBiome.wet ?? defaultMaterialId;
            const selectedId = normalizeMaterialId(materialId, fallbackId);
            const row = biomeBindings[biome] && typeof biomeBindings[biome] === 'object' ? biomeBindings[biome] : {};
            biomeBindings[biome] = row;
            row.dry = selectedId;
            row.neutral = selectedId;
            row.wet = selectedId;
            return selectedId;
        };

        const resolveBiomeMaterialId = (biomeId, fallback = defaultMaterialId) => {
            const biome = TERRAIN_BIOME_IDS.includes(String(biomeId ?? '')) ? String(biomeId) : 'land';
            const row = biomeBindings[biome] && typeof biomeBindings[biome] === 'object' ? biomeBindings[biome] : {};
            const candidate = row.neutral ?? row.dry ?? row.wet ?? fallback;
            return normalizeMaterialId(candidate, fallback);
        };

        const getActiveTexturePair = () => {
            const pair = getActivePair();
            const leftFallback = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS?.[pair.biome1]?.neutral ?? defaultMaterialId;
            const rightFallback = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS?.[pair.biome2]?.neutral ?? defaultMaterialId;
            const leftMaterialId = normalizeMaterialId(bt.leftMaterialId || resolveBiomeMaterialId(pair.biome1, leftFallback), leftFallback);
            const rightMaterialId = normalizeMaterialId(bt.rightMaterialId || resolveBiomeMaterialId(pair.biome2, rightFallback), rightFallback);
            return {
                ...pair,
                leftMaterialId,
                rightMaterialId,
                texturePairKey: makeTexturePairKey(leftMaterialId, rightMaterialId)
            };
        };

        const ensurePairProfile = () => {
            const active = getActiveTexturePair();
            const src = bt.texturePairProfiles[active.texturePairKey] ?? transition.pairProfiles[active.pairKey];
            const profile = sanitizeTransitionPairProfile(src, { fallbackProfile: transition.profileDefaults });
            bt.texturePairProfiles[active.texturePairKey] = profile;
            transition.pairProfiles[active.pairKey] = profile;
            return profile;
        };

        const resolveActiveBaselineProfile = () => {
            const active = getActiveTexturePair();
            const src = bt.textureBaselineProfiles[active.texturePairKey];
            if (!(src && typeof src === 'object')) {
                bt.baselineProfiles = {};
                return null;
            }
            const profile = sanitizeTransitionPairProfile(src, { fallbackProfile: transition.profileDefaults });
            bt.textureBaselineProfiles[active.texturePairKey] = profile;
            bt.baselineProfiles = {
                [active.pairKey]: deepClone(profile)
            };
            return profile;
        };

        const createSideMaterialPickerRow = ({ label, onPick }) => {
            const row = makeEl('div', null);
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '6px';

            const left = makeEl('div', 'options-row-label', label);
            left.style.width = 'auto';
            left.style.minWidth = '0';
            left.style.margin = '0';

            const right = makeEl('div', null);
            const button = makeEl('button', 'options-btn');
            button.type = 'button';
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.gap = '10px';
            button.style.width = '100%';
            button.style.padding = '8px';
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

            button.appendChild(thumb);
            button.appendChild(text);
            right.appendChild(button);
            row.appendChild(left);
            row.appendChild(right);
            return {
                row,
                button,
                labelEl: left,
                setValue: ({ materialId, materialLabel, previewUrl, title }) => {
                    if (typeof title === 'string') button.title = title;
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

        const openSideMaterialPicker = ({ side, selectedId, onSelect }) => {
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
                title: `${side === 'left' ? 'Left' : 'Right'} Texture`,
                sections,
                selectedId: String(selectedId ?? ''),
                onSelect: (opt) => onSelect?.(String(opt?.id ?? ''))
            });
        };

        const actionsSection = this._buildSection('biome_transition', 'Quick Actions');
        actionsSection.appendChild(makeEl('div', 'options-note', 'Use this to quickly frame the pair authoring layout.'));
        const focusCameraRow = makeButtonRow({
            label: 'Camera',
            text: 'Focus Pair View',
            onClick: () => this._dispatchUiAction(createTerrainDebuggerFocusBiomeTransitionAction())
        });
        actionsSection.appendChild(focusCameraRow.row);

        const pairSection = this._buildSection('biome_transition', 'Pair Layout');
        pairSection.appendChild(makeEl('div', 'options-note', 'Deterministic 3x3 layout: left side uses the left texture, center is transition, right side uses the right texture.'));

        const pairKeyNote = makeEl('div', 'options-note', '');
        pairSection.appendChild(pairKeyNote);
        pairSection.appendChild(makeEl('div', 'options-note', 'Transition tuning is stored per selected texture pair.'));

        const leftPickerRow = createSideMaterialPickerRow({
            label: 'Left Texture',
            onPick: () => {
                const pair = getActivePair();
                openSideMaterialPicker({
                    side: 'left',
                    selectedId: bt.leftMaterialId,
                    onSelect: (id) => {
                        bt.leftMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome1, id);
                        syncPairDependentUi();
                        this._emit();
                    }
                });
            }
        });

        const rightPickerRow = createSideMaterialPickerRow({
            label: 'Right Texture',
            onPick: () => {
                const pair = getActivePair();
                openSideMaterialPicker({
                    side: 'right',
                    selectedId: bt.rightMaterialId,
                    onSelect: (id) => {
                        bt.rightMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome2, id);
                        syncPairDependentUi();
                        this._emit();
                    }
                });
            }
        });

        const pickersGrid = makeEl('div', null);
        pickersGrid.style.display = 'grid';
        pickersGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        pickersGrid.style.gap = '8px';
        pickersGrid.appendChild(leftPickerRow.row);
        pickersGrid.appendChild(rightPickerRow.row);
        pairSection.appendChild(pickersGrid);

        const intentSection = this._buildSection('biome_transition', 'Intent + Controls');
        intentSection.appendChild(makeEl('div', 'options-note', 'Intent presets guide the profile; sliders provide per-texture-pair fine tuning.'));

        const intentRow = makeChoiceRow({
            label: 'Visual Intent',
            value: 'medium',
            options: [
                { id: 'soft', label: 'Soft' },
                { id: 'medium', label: 'Medium' },
                { id: 'hard', label: 'Hard' }
            ],
            onChange: (id) => {
                const nextIntent = normalizeTransitionIntentId(id, 'medium');
                const pair = getActivePair();
                const profile = ensurePairProfile(pair.pairKey);
                const preset = getTransitionIntentPreset(nextIntent);
                profile.intent = nextIntent;
                profile.widthScale = preset.widthScale;
                profile.falloffPower = preset.falloffPower;
                profile.edgeNoiseScale = preset.edgeNoiseScale;
                profile.edgeNoiseStrength = preset.edgeNoiseStrength;
                profile.dominanceBias = preset.dominanceBias;
                profile.heightInfluence = preset.heightInfluence;
                profile.contrast = preset.contrast;
                syncPairDependentUi();
                this._emit();
            }
        });
        intentSection.appendChild(intentRow.row);

        const widthRow = makeNumberSliderRow({
            label: 'Transition Width',
            value: 1,
            min: 0.25,
            max: 4.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).widthScale = v;
                this._emit();
            }
        });
        intentSection.appendChild(widthRow.row);

        const falloffRow = makeNumberSliderRow({
            label: 'Blend Falloff',
            value: 1,
            min: 0.3,
            max: 3.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).falloffPower = v;
                this._emit();
            }
        });
        intentSection.appendChild(falloffRow.row);

        const edgeScaleRow = makeNumberSliderRow({
            label: 'Edge Noise Scale',
            value: 0.02,
            min: 0.0005,
            max: 0.2,
            step: 0.0005,
            digits: 4,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).edgeNoiseScale = v;
                this._emit();
            }
        });
        intentSection.appendChild(edgeScaleRow.row);

        const edgeStrengthRow = makeNumberSliderRow({
            label: 'Edge Irregularity',
            value: 0.22,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).edgeNoiseStrength = v;
                this._emit();
            }
        });
        intentSection.appendChild(edgeStrengthRow.row);

        const dominanceRow = makeNumberSliderRow({
            label: 'Material Dominance',
            value: 0.0,
            min: -0.5,
            max: 0.5,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).dominanceBias = v;
                this._emit();
            }
        });
        intentSection.appendChild(dominanceRow.row);

        const heightInfluenceRow = makeNumberSliderRow({
            label: 'Height Influence',
            value: 0.0,
            min: -1.0,
            max: 1.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).heightInfluence = v;
                this._emit();
            }
        });
        intentSection.appendChild(heightInfluenceRow.row);

        const contrastRow = makeNumberSliderRow({
            label: 'Final Contrast',
            value: 1.0,
            min: 0.25,
            max: 3.0,
            step: 0.01,
            digits: 2,
            onChange: (v) => {
                ensurePairProfile(getActivePair().pairKey).contrast = v;
                this._emit();
            }
        });
        intentSection.appendChild(contrastRow.row);

        const diagnosticsSection = this._buildSection('biome_transition', 'Diagnostics');
        const debugModeNotes = Object.freeze({
            pair_isolation: 'Shows only the selected biome-pair transition; other pairs are dimmed.',
            transition_result: 'Shows final per-pixel biome transition result using current profile.',
            transition_weight: 'Shows final transition weight/intensity as grayscale.',
            transition_falloff: 'Shows falloff contribution before dominance and contrast shaping.',
            transition_noise: 'Shows irregular edge offset contribution.',
            pair_compare: 'Side-by-side baseline (left) vs tuned (right) for active pair.'
        });

        const debugModeRow = makeChoiceRow({
            label: 'Mode',
            value: bt.debugMode,
            options: BIOME_TRANSITION_DEBUG_MODE_OPTIONS,
            onChange: (id) => {
                const next = BIOME_TRANSITION_DEBUG_MODE_OPTIONS.some((opt) => opt.id === id) ? id : 'transition_result';
                bt.debugMode = next;
                if (next === 'pair_compare') bt.compareEnabled = true;
                compareRow.toggle.checked = bt.compareEnabled;
                debugModeNote.textContent = debugModeNotes[next] ?? '';
                this._emit();
            }
        });
        diagnosticsSection.appendChild(debugModeRow.row);

        const compareRow = makeToggleRow({
            label: 'Enable Baseline Compare',
            value: bt.compareEnabled,
            onChange: (v) => {
                bt.compareEnabled = !!v;
                if (bt.compareEnabled) bt.debugMode = 'pair_compare';
                if (!bt.compareEnabled && bt.debugMode === 'pair_compare') bt.debugMode = 'transition_result';
                debugModeRow.setValue(bt.debugMode);
                debugModeNote.textContent = debugModeNotes[bt.debugMode] ?? '';
                this._emit();
            }
        });
        diagnosticsSection.appendChild(compareRow.row);
        const debugModeNote = makeEl('div', 'options-note', debugModeNotes[bt.debugMode] ?? '');
        diagnosticsSection.appendChild(debugModeNote);

        const baselineNote = makeEl('div', 'options-note', '');
        diagnosticsSection.appendChild(baselineNote);

        const captureBaselineRow = makeButtonRow({
            label: 'Baseline',
            text: 'Capture Baseline',
            onClick: () => {
                const active = getActiveTexturePair();
                const profile = ensurePairProfile(active.pairKey);
                bt.textureBaselineProfiles[active.texturePairKey] = deepClone(profile);
                bt.baselineProfiles = { [active.pairKey]: deepClone(profile) };
                bt.compareEnabled = true;
                bt.debugMode = 'pair_compare';
                compareRow.toggle.checked = true;
                debugModeRow.setValue('pair_compare');
                debugModeNote.textContent = debugModeNotes.pair_compare;
                syncPairDependentUi();
                this._emit();
            }
        });
        diagnosticsSection.appendChild(captureBaselineRow.row);

        const catalogSection = this._buildSection('biome_transition', 'Preset Catalog');
        catalogSection.appendChild(makeEl('div', 'options-note', 'Save/load texture-pair profiles with lightweight previews and JSON portability.'));

        const catalogRow = makeEl('div', 'options-row');
        catalogRow.appendChild(makeEl('div', 'options-row-label', 'Saved Presets'));
        const catalogRight = makeEl('div', 'options-row-control');
        const catalogSelect = document.createElement('select');
        catalogSelect.className = 'options-select';
        catalogSelect.addEventListener('change', () => {
            bt.selectedPresetId = String(catalogSelect.value ?? '');
            renderCatalogPreviewCards();
            this._emit();
        });
        catalogRight.appendChild(catalogSelect);
        catalogRow.appendChild(catalogRight);
        catalogSection.appendChild(catalogRow);

        const previewHost = makeEl('div', null);
        previewHost.style.display = 'grid';
        previewHost.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        previewHost.style.gap = '8px';
        catalogSection.appendChild(previewHost);

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.display = 'none';
        importInput.addEventListener('change', async () => {
            const file = importInput.files?.[0] ?? null;
            importInput.value = '';
            if (!file) return;
            try {
                const text = await file.text();
                const obj = JSON.parse(text);
                const profile = sanitizeTransitionPairProfile(obj?.profile, { fallbackProfile: transition.profileDefaults });
                const importedTextures = obj?.textures && typeof obj.textures === 'object' ? obj.textures : {};
                const pair = getActivePair();
                bt.leftMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome1, importedTextures.leftMaterialId ?? bt.leftMaterialId);
                bt.rightMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome2, importedTextures.rightMaterialId ?? bt.rightMaterialId);
                const active = getActiveTexturePair();
                bt.texturePairProfiles[active.texturePairKey] = profile;
                transition.pairProfiles[active.pairKey] = profile;
                const importedBaselineRaw = obj?.baselineProfile;
                if (importedBaselineRaw && typeof importedBaselineRaw === 'object') {
                    const baseline = sanitizeTransitionPairProfile(importedBaselineRaw, { fallbackProfile: transition.profileDefaults });
                    bt.textureBaselineProfiles[active.texturePairKey] = baseline;
                    bt.baselineProfiles = { [active.pairKey]: deepClone(baseline) };
                }

                const leftLabel = materialById.get(active.leftMaterialId)?.label ?? active.leftMaterialId;
                const rightLabel = materialById.get(active.rightMaterialId)?.label ?? active.rightMaterialId;
                const name = String(obj?.name ?? file.name.replace(/\.json$/i, '')).trim() || `${leftLabel} ↔ ${rightLabel}`;
                const id = `pair_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
                bt.catalog.push({
                    id,
                    name,
                    biome1: pair.biome1,
                    biome2: pair.biome2,
                    pairKey: pair.pairKey,
                    leftMaterialId: active.leftMaterialId,
                    rightMaterialId: active.rightMaterialId,
                    profile: deepClone(profile),
                    createdAt: new Date().toISOString()
                });
                bt.selectedPresetId = id;
                syncPairDependentUi();
                this._emit();
            } catch (err) {
                window.alert(`Failed to import pair preset JSON.\n${String(err?.message ?? err)}`);
            }
        });
        catalogSection.appendChild(importInput);

        const saveRow = makeButtonRow({
            label: 'Save Current',
            text: 'Save to Catalog',
            onClick: () => {
                const active = getActiveTexturePair();
                const profile = ensurePairProfile(active.pairKey);
                const leftLabel = materialById.get(active.leftMaterialId)?.label ?? active.leftMaterialId;
                const rightLabel = materialById.get(active.rightMaterialId)?.label ?? active.rightMaterialId;
                const defaultName = `${leftLabel} ↔ ${rightLabel} ${profile.intent}`;
                const entered = window.prompt('Preset name', defaultName);
                const name = String(entered ?? '').trim();
                if (!name) return;
                const id = `pair_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
                bt.catalog.push({
                    id,
                    name,
                    biome1: active.biome1,
                    biome2: active.biome2,
                    pairKey: active.pairKey,
                    leftMaterialId: active.leftMaterialId,
                    rightMaterialId: active.rightMaterialId,
                    profile: deepClone(profile),
                    createdAt: new Date().toISOString()
                });
                bt.selectedPresetId = id;
                syncPairDependentUi();
                this._emit();
            }
        });
        catalogSection.appendChild(saveRow.row);

        const applyRow = makeButtonRow({
            label: 'Apply Selected',
            text: 'Apply Preset',
            onClick: () => {
                const id = String(catalogSelect.value ?? '');
                const entry = bt.catalog.find((item) => String(item?.id ?? '') === id) ?? null;
                if (!entry) return;
                const pair = getActivePair();
                bt.leftMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome1, entry.leftMaterialId || bt.leftMaterialId);
                bt.rightMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome2, entry.rightMaterialId || bt.rightMaterialId);
                const active = getActiveTexturePair();
                const profile = sanitizeTransitionPairProfile(entry.profile, { fallbackProfile: transition.profileDefaults });
                bt.texturePairProfiles[active.texturePairKey] = profile;
                transition.pairProfiles[pair.pairKey] = profile;
                bt.selectedPresetId = id;
                syncPairDependentUi();
                this._emit();
            }
        });
        catalogSection.appendChild(applyRow.row);

        const deleteRow = makeButtonRow({
            label: 'Delete Selected',
            text: 'Delete Preset',
            onClick: () => {
                const id = String(catalogSelect.value ?? '');
                if (!id) return;
                bt.catalog = bt.catalog.filter((entry) => String(entry?.id ?? '') !== id);
                if (bt.selectedPresetId === id) bt.selectedPresetId = '';
                syncPairDependentUi();
                this._emit();
            }
        });
        catalogSection.appendChild(deleteRow.row);

        const exportRow = makeButtonRow({
            label: 'Export Pair JSON',
            text: 'Export',
            onClick: () => {
                const active = getActiveTexturePair();
                const profile = ensurePairProfile(active.pairKey);
                const baseline = bt.textureBaselineProfiles[active.texturePairKey] ?? null;
                const leftLabel = materialById.get(active.leftMaterialId)?.label ?? active.leftMaterialId;
                const rightLabel = materialById.get(active.rightMaterialId)?.label ?? active.rightMaterialId;
                const payload = {
                    schema: 'bus_sim.biome_transition_pair_profile',
                    version: 1,
                    name: `${leftLabel} ↔ ${rightLabel}`,
                    pair: { biome1: active.biome1, biome2: active.biome2, pairKey: active.pairKey },
                    textures: {
                        leftMaterialId: active.leftMaterialId,
                        rightMaterialId: active.rightMaterialId,
                        texturePairKey: active.texturePairKey
                    },
                    profile,
                    baselineProfile: baseline ? deepClone(baseline) : null,
                    createdAt: new Date().toISOString()
                };
                const text = JSON.stringify(payload, null, 2);
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `biome_transition_${active.texturePairKey.replace(/\|/g, '_')}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 0);
            }
        });
        catalogSection.appendChild(exportRow.row);

        const importRow = makeButtonRow({
            label: 'Import Pair JSON',
            text: 'Load',
            onClick: () => {
                importInput.click();
            }
        });
        catalogSection.appendChild(importRow.row);

        const acceptanceSection = this._buildSection('biome_transition', 'Acceptance');
        acceptanceSection.appendChild(makeEl('div', 'options-note', 'Quality gates:'));
        acceptanceSection.appendChild(makeEl('div', 'options-note', '1) No obvious square/grid artifacts at standard camera heights.'));
        acceptanceSection.appendChild(makeEl('div', 'options-note', '2) Stable under camera movement (no popping/flicker).'));
        acceptanceSection.appendChild(makeEl('div', 'options-note', '3) Consistent near/mid behavior across presets.'));
        acceptanceSection.appendChild(makeEl('div', 'options-note', '4) Runtime cost stays practical (debug modes are evidence-focused).'));
        acceptanceSection.appendChild(makeEl('div', 'options-note', 'Rollout: start from defaults, tune critical pairs first, extend later with advanced boundary models.'));

        const renderCatalogOptions = () => {
            const pair = getActivePair();
            const matching = bt.catalog.filter((entry) => entry.pairKey === pair.pairKey);
            const list = matching.length ? matching : bt.catalog.slice(0);
            catalogSelect.textContent = '';
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = list.length ? 'Select preset…' : 'No presets saved';
            catalogSelect.appendChild(empty);
            for (const entry of list) {
                const opt = document.createElement('option');
                opt.value = entry.id;
                const leftLabel = materialById.get(entry.leftMaterialId)?.label ?? entry.leftMaterialId ?? '';
                const rightLabel = materialById.get(entry.rightMaterialId)?.label ?? entry.rightMaterialId ?? '';
                const textureLabel = leftLabel || rightLabel ? ` (${leftLabel || '?'} ↔ ${rightLabel || '?'})` : '';
                opt.textContent = `${entry.name}${textureLabel}`;
                catalogSelect.appendChild(opt);
            }
            const selected = list.some((entry) => entry.id === bt.selectedPresetId) ? bt.selectedPresetId : '';
            bt.selectedPresetId = selected;
            catalogSelect.value = selected;
        };

        const renderCatalogPreviewCards = () => {
            previewHost.textContent = '';
            const pair = getActivePair();
            const matching = bt.catalog.filter((entry) => entry.pairKey === pair.pairKey);
            const list = matching.length ? matching : bt.catalog.slice(0, 6);
            for (const entry of list.slice(0, 8)) {
                const card = makeEl('button', 'options-btn');
                card.type = 'button';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.alignItems = 'stretch';
                card.style.gap = '6px';
                card.style.padding = '6px';
                card.style.textAlign = 'left';
                card.style.border = entry.id === bt.selectedPresetId ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.2)';

                const swatch = makeEl('div', null);
                swatch.style.height = '32px';
                swatch.style.borderRadius = '6px';
                swatch.style.border = '1px solid rgba(0,0,0,0.35)';
                swatch.style.background = buildTransitionPreviewGradient({
                    biome1: entry.biome1,
                    biome2: entry.biome2,
                    profile: entry.profile
                });
                card.appendChild(swatch);
                card.appendChild(makeEl('div', null, entry.name));
                card.addEventListener('click', () => {
                    bt.selectedPresetId = entry.id;
                    catalogSelect.value = entry.id;
                    renderCatalogPreviewCards();
                });
                previewHost.appendChild(card);
            }
        };

        const syncPairDependentUi = () => {
            const pair = getActivePair();
            const leftFallback = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS?.[pair.biome1]?.neutral ?? defaultMaterialId;
            const rightFallback = DEFAULT_TERRAIN_BIOME_HUMIDITY_BINDINGS?.[pair.biome2]?.neutral ?? defaultMaterialId;
            const leftSourceId = bt.leftMaterialId || resolveBiomeMaterialId(pair.biome1, leftFallback);
            const rightSourceId = bt.rightMaterialId || resolveBiomeMaterialId(pair.biome2, rightFallback);
            bt.leftMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome1, leftSourceId);
            bt.rightMaterialId = applyMaterialToBiomeAllHumiditySlots(pair.biome2, rightSourceId);
            const active = getActiveTexturePair();
            const profile = ensurePairProfile(active.pairKey);

            const leftMeta = materialById.get(bt.leftMaterialId) ?? null;
            const rightMeta = materialById.get(bt.rightMaterialId) ?? null;
            if (leftPickerRow?.labelEl) leftPickerRow.labelEl.textContent = 'Left Texture';
            if (rightPickerRow?.labelEl) rightPickerRow.labelEl.textContent = 'Right Texture';
            leftPickerRow?.setValue?.({
                materialId: bt.leftMaterialId,
                materialLabel: leftMeta?.label ?? bt.leftMaterialId,
                previewUrl: leftMeta?.previewUrl ?? '',
                title: 'Left side texture'
            });
            rightPickerRow?.setValue?.({
                materialId: bt.rightMaterialId,
                materialLabel: rightMeta?.label ?? bt.rightMaterialId,
                previewUrl: rightMeta?.previewUrl ?? '',
                title: 'Right side texture'
            });

            pairKeyNote.textContent = `Texture Pair: ${active.texturePairKey}`;
            intentRow.setValue(profile.intent);
            setSliderValue(widthRow, profile.widthScale, 2);
            setSliderValue(falloffRow, profile.falloffPower, 2);
            setSliderValue(edgeScaleRow, profile.edgeNoiseScale, 4);
            setSliderValue(edgeStrengthRow, profile.edgeNoiseStrength, 2);
            setSliderValue(dominanceRow, profile.dominanceBias, 2);
            setSliderValue(heightInfluenceRow, profile.heightInfluence, 2);
            setSliderValue(contrastRow, profile.contrast, 2);
            const baseline = resolveActiveBaselineProfile();
            if (!baseline && bt.compareEnabled && bt.debugMode === 'pair_compare') {
                bt.compareEnabled = false;
                bt.debugMode = 'transition_result';
                compareRow.toggle.checked = false;
                debugModeRow.setValue(bt.debugMode);
                debugModeNote.textContent = debugModeNotes[bt.debugMode] ?? '';
            }
            baselineNote.textContent = baseline
                ? `Baseline captured for ${active.texturePairKey}. Use "Baseline vs Tuned" mode for side-by-side comparison.`
                : `No baseline captured for ${active.texturePairKey}. Capture one to enable side-by-side comparison.`;
            renderCatalogOptions();
            renderCatalogPreviewCards();
        };

        syncPairDependentUi();
    };
}
