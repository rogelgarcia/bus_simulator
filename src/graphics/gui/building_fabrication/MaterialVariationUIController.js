// src/graphics/gui/building_fabrication/MaterialVariationUIController.js
// Builds and wires the Material Variation UI used by BuildingFabricationUI.
import { MATERIAL_VARIATION_DEBUG_DEFAULT, MATERIAL_VARIATION_ROOT, getDefaultMaterialVariationPreset, normalizeMaterialVariationConfig, normalizeMaterialVariationDebugConfig } from '../../assets3d/materials/MaterialVariationSystem.js';
import { clampInt, clampNumber, formatFixed } from './mini_controllers/RangeNumberUtils.js';
import { createMaterialVariationAntiTilingMiniController } from './mini_controllers/MaterialVariationAntiTilingMiniController.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

function clamp(value, min, max) {
    return clampNumber(value, min, max);
}

function formatFloat(value, digits = 1) {
    return formatFixed(value, digits);
}

export function createMaterialVariationUIController({
    detailsOpenByKey,
    getAllow,
    getHasSelected,
    getSeed,
    setSeed,
    notifySeedChanged,
    onDebugChanged
} = {}) {
    const detailsMap = detailsOpenByKey instanceof Map ? detailsOpenByKey : new Map();
    const canEdit = typeof getAllow === 'function' ? getAllow : () => true;
    const hasSelected = typeof getHasSelected === 'function' ? getHasSelected : () => false;
    const getActiveSeed = typeof getSeed === 'function' ? getSeed : () => null;
    const setActiveSeed = typeof setSeed === 'function' ? setSeed : () => {};
    const notifySeed = typeof notifySeedChanged === 'function' ? notifySeedChanged : () => {};
    const notifyDebug = typeof onDebugChanged === 'function' ? onDebugChanged : () => {};

    let debugConfig = normalizeMaterialVariationDebugConfig(null);

    const makeDetailsSection = (title, { open = true } = {}) => {
        const details = document.createElement('details');
        details.className = 'building-fab-details';
        details.open = !!open;
        const summary = document.createElement('summary');
        summary.className = 'building-fab-details-summary';
        const label = document.createElement('span');
        label.className = 'building-fab-details-title';
        label.textContent = title;
        summary.appendChild(label);
        details.appendChild(summary);
        const body = document.createElement('div');
        body.className = 'building-fab-details-body';
        details.appendChild(body);
        return { details, summary, body, label };
    };

    const seedSection = makeDetailsSection('Material variation seed', { open: false });

    const seedToggle = document.createElement('label');
    seedToggle.className = 'building-fab-toggle building-fab-toggle-wide';
    const seedToggleInput = document.createElement('input');
    seedToggleInput.type = 'checkbox';
    const seedToggleText = document.createElement('span');
    seedToggleText.textContent = 'Override building seed';
    seedToggle.appendChild(seedToggleInput);
    seedToggle.appendChild(seedToggleText);
    seedSection.body.appendChild(seedToggle);

    const seedRow = document.createElement('div');
    seedRow.className = 'building-fab-row';
    const seedLabel = document.createElement('div');
    seedLabel.className = 'building-fab-row-label';
    seedLabel.textContent = 'Seed';
    const seedNumber = document.createElement('input');
    seedNumber.type = 'number';
    seedNumber.min = '0';
    seedNumber.max = '4294967295';
    seedNumber.step = '1';
    seedNumber.className = 'building-fab-number';
    seedRow.appendChild(seedLabel);
    seedRow.appendChild(seedNumber);
    seedSection.body.appendChild(seedRow);

    const seedHint = document.createElement('div');
    seedHint.className = 'building-fab-hint';
    seedHint.textContent = 'When disabled, the seed is derived from the building footprint.';
    seedSection.body.appendChild(seedHint);

    const debugSection = makeDetailsSection('Material variation debug', { open: false });
    const debugResetBtn = document.createElement('button');
    debugResetBtn.type = 'button';
    debugResetBtn.className = 'building-fab-details-reset';
    applyMaterialSymbolToButton(debugResetBtn, { name: 'restart_alt', label: 'Reset to defaults', size: 'sm' });
    debugSection.summary.appendChild(debugResetBtn);

    const makeDebugToggle = (label) => {
        const toggle = document.createElement('label');
        toggle.className = 'building-fab-toggle building-fab-toggle-wide';
        const input = document.createElement('input');
        input.type = 'checkbox';
        const text = document.createElement('span');
        text.textContent = label;
        toggle.appendChild(input);
        toggle.appendChild(text);
        return { toggle, input, text };
    };

    const debugMasterLabel = document.createElement('div');
    debugMasterLabel.className = 'ui-section-label';
    debugMasterLabel.textContent = 'Master';
    debugSection.body.appendChild(debugMasterLabel);
    const dbgUseMatVar = makeDebugToggle('Enable mat-var injection (USE_MATVAR)');
    debugSection.body.appendChild(dbgUseMatVar.toggle);

    const debugUvLabel = document.createElement('div');
    debugUvLabel.className = 'ui-section-label';
    debugUvLabel.textContent = 'UV transforms';
    debugSection.body.appendChild(debugUvLabel);
    const dbgStair = makeDebugToggle('Stair shift UV');
    debugSection.body.appendChild(dbgStair.toggle);
    const dbgAntiOffset = makeDebugToggle('Anti-tiling offset');
    debugSection.body.appendChild(dbgAntiOffset.toggle);
    const dbgAntiRot = makeDebugToggle('Anti-tiling rotation');
    debugSection.body.appendChild(dbgAntiRot.toggle);
    const dbgWarp = makeDebugToggle('UV warp (quality)');
    debugSection.body.appendChild(dbgWarp.toggle);

    const debugContribLabel = document.createElement('div');
    debugContribLabel.className = 'ui-section-label';
    debugContribLabel.textContent = 'Contributions';
    debugSection.body.appendChild(debugContribLabel);
    const dbgRough = makeDebugToggle('Roughness contribution');
    debugSection.body.appendChild(dbgRough.toggle);
    const dbgColor = makeDebugToggle('Tint/value/saturation contribution');
    debugSection.body.appendChild(dbgColor.toggle);
    const dbgOrm = makeDebugToggle('Use AO/ORM remap');
    debugSection.body.appendChild(dbgOrm.toggle);
    const dbgNormFactor = makeDebugToggle('Normal factor contribution');
    debugSection.body.appendChild(dbgNormFactor.toggle);

    const debugNormalLabel = document.createElement('div');
    debugNormalLabel.className = 'ui-section-label';
    debugNormalLabel.textContent = 'Normal map handling';
    debugSection.body.appendChild(debugNormalLabel);
    const dbgBasis = makeDebugToggle('Use original UVs for tangent basis');
    debugSection.body.appendChild(dbgBasis.toggle);
    const dbgFlipY = makeDebugToggle('Flip normal Y (green channel)');
    debugSection.body.appendChild(dbgFlipY.toggle);

    const debugHint = document.createElement('div');
    debugHint.className = 'building-fab-hint';
    debugHint.textContent = 'Debug-only, session-only shader overrides (not saved into building data).';
    debugSection.body.appendChild(debugHint);

    const debugReadout = document.createElement('div');
    debugReadout.className = 'building-fab-hint building-fab-debug-readout';
    debugSection.body.appendChild(debugReadout);

    const onSeedOverrideChange = () => {
        if (!canEdit()) return;
        const on = !!seedToggleInput.checked;
        if (!on) {
            setActiveSeed(null);
            syncSeedPanel();
            notifySeed();
            return;
        }

        const current = getActiveSeed();
        const next = Number.isFinite(current) ? current : 0;
        setActiveSeed(next);
        syncSeedPanel();
        notifySeed();
    };

    const onSeedNumberChange = () => {
        if (!canEdit()) return;
        const next = clampInt(seedNumber.value, 0, 4294967295);
        setActiveSeed(next);
        syncSeedPanel();
        notifySeed();
    };

    const formatDebugReadout = (cfg) => {
        const dbg = cfg && typeof cfg === 'object' ? cfg : normalizeMaterialVariationDebugConfig(null);
        const onOff = (value) => (value ? 'on' : 'off');
        const basis = dbg.basisUsesOriginalUv ? 'original' : 'transformed';
        return [
            'USE_MATVAR: ' + onOff(dbg.useMatVarDefine),
            'UV: stair=' + onOff(dbg.uvStairShift) + ' antiOffset=' + onOff(dbg.uvAntiOffset) + ' antiRot=' + onOff(dbg.uvAntiRotation) + ' warp=' + onOff(dbg.uvWarp),
            'Contrib: rough=' + onOff(dbg.contribRoughness) + ' color=' + onOff(dbg.contribColor) + ' orm=' + onOff(dbg.useOrm) + ' normalFactor=' + onOff(dbg.contribNormalFactor),
            'Normal: basis=' + basis + ' flipY=' + onOff(dbg.flipNormalY)
        ].join('\n');
    };

    const syncSeedPanel = () => {
        const allow = !!canEdit();
        const selected = !!hasSelected();
        const seed = getActiveSeed();
        const override = Number.isFinite(seed);

        seedToggleInput.checked = override;
        seedToggleInput.disabled = !allow;
        seedNumber.disabled = !allow || !override;
        seedNumber.value = String(override ? seed : 0);

        if (seedSection?.label) {
            seedSection.label.textContent = selected ? 'Material variation seed (building)' : 'Material variation seed (template)';
        }
    };

    const syncDebugPanel = () => {
        const allow = !!canEdit();
        const dbg = debugConfig;

        dbgUseMatVar.input.checked = !!dbg.useMatVarDefine;
        dbgUseMatVar.input.disabled = !allow;
        dbgStair.input.checked = !!dbg.uvStairShift;
        dbgStair.input.disabled = !allow;
        dbgAntiOffset.input.checked = !!dbg.uvAntiOffset;
        dbgAntiOffset.input.disabled = !allow;
        dbgAntiRot.input.checked = !!dbg.uvAntiRotation;
        dbgAntiRot.input.disabled = !allow;
        dbgWarp.input.checked = !!dbg.uvWarp;
        dbgWarp.input.disabled = !allow;

        dbgRough.input.checked = !!dbg.contribRoughness;
        dbgRough.input.disabled = !allow;
        dbgColor.input.checked = !!dbg.contribColor;
        dbgColor.input.disabled = !allow;
        dbgOrm.input.checked = !!dbg.useOrm;
        dbgOrm.input.disabled = !allow;
        dbgNormFactor.input.checked = !!dbg.contribNormalFactor;
        dbgNormFactor.input.disabled = !allow;

        dbgBasis.input.checked = !!dbg.basisUsesOriginalUv;
        dbgBasis.input.disabled = !allow;
        dbgFlipY.input.checked = !!dbg.flipNormalY;
        dbgFlipY.input.disabled = !allow;

        debugResetBtn.disabled = !allow;
        debugReadout.textContent = formatDebugReadout(dbg);
    };

    const setDebugFromUi = () => {
        if (!canEdit()) return;
        debugConfig = normalizeMaterialVariationDebugConfig({
            useMatVarDefine: !!dbgUseMatVar.input.checked,
            uvStairShift: !!dbgStair.input.checked,
            uvAntiOffset: !!dbgAntiOffset.input.checked,
            uvAntiRotation: !!dbgAntiRot.input.checked,
            uvWarp: !!dbgWarp.input.checked,
            contribRoughness: !!dbgRough.input.checked,
            contribColor: !!dbgColor.input.checked,
            useOrm: !!dbgOrm.input.checked,
            contribNormalFactor: !!dbgNormFactor.input.checked,
            basisUsesOriginalUv: !!dbgBasis.input.checked,
            flipNormalY: !!dbgFlipY.input.checked
        });
        syncDebugPanel();
        notifyDebug({ ...debugConfig });
    };

    const resetDebugFromUi = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (!canEdit()) return;
        debugConfig = normalizeMaterialVariationDebugConfig(MATERIAL_VARIATION_DEBUG_DEFAULT);
        syncDebugPanel();
        notifyDebug({ ...debugConfig });
    };

    let bound = false;

    const bind = () => {
        if (bound) return;
        bound = true;
        seedToggleInput.addEventListener('change', onSeedOverrideChange);
        seedNumber.addEventListener('change', onSeedNumberChange);
        debugResetBtn.addEventListener('click', resetDebugFromUi);

        dbgUseMatVar.input.addEventListener('change', setDebugFromUi);
        dbgStair.input.addEventListener('change', setDebugFromUi);
        dbgAntiOffset.input.addEventListener('change', setDebugFromUi);
        dbgAntiRot.input.addEventListener('change', setDebugFromUi);
        dbgWarp.input.addEventListener('change', setDebugFromUi);
        dbgRough.input.addEventListener('change', setDebugFromUi);
        dbgColor.input.addEventListener('change', setDebugFromUi);
        dbgOrm.input.addEventListener('change', setDebugFromUi);
        dbgNormFactor.input.addEventListener('change', setDebugFromUi);
        dbgBasis.input.addEventListener('change', setDebugFromUi);
        dbgFlipY.input.addEventListener('change', setDebugFromUi);
    };

    const unbind = () => {
        if (!bound) return;
        bound = false;
        seedToggleInput.removeEventListener('change', onSeedOverrideChange);
        seedNumber.removeEventListener('change', onSeedNumberChange);
        debugResetBtn.removeEventListener('click', resetDebugFromUi);

        dbgUseMatVar.input.removeEventListener('change', setDebugFromUi);
        dbgStair.input.removeEventListener('change', setDebugFromUi);
        dbgAntiOffset.input.removeEventListener('change', setDebugFromUi);
        dbgAntiRot.input.removeEventListener('change', setDebugFromUi);
        dbgWarp.input.removeEventListener('change', setDebugFromUi);
        dbgRough.input.removeEventListener('change', setDebugFromUi);
        dbgColor.input.removeEventListener('change', setDebugFromUi);
        dbgOrm.input.removeEventListener('change', setDebugFromUi);
        dbgNormFactor.input.removeEventListener('change', setDebugFromUi);
        dbgBasis.input.removeEventListener('change', setDebugFromUi);
        dbgFlipY.input.removeEventListener('change', setDebugFromUi);
    };

    const mount = (parent) => {
        if (!parent || typeof parent.appendChild !== 'function') return;
        if (!seedSection.details.isConnected) parent.appendChild(seedSection.details);
        if (!debugSection.details.isConnected) parent.appendChild(debugSection.details);
    };

    const getDebugConfig = () => ({ ...debugConfig });

    const sync = () => {
        syncSeedPanel();
        syncDebugPanel();
    };

    const tip = (...lines) => lines.filter((line) => typeof line === 'string' && line.trim()).join('\n');

    const normalizeDirection = (dir, fallback = { x: 0.4, y: 0.85, z: 0.2 }) => {
        const x = Number.isFinite(dir?.x) ? Number(dir.x) : Number(fallback?.x ?? 0);
        const y = Number.isFinite(dir?.y) ? Number(dir.y) : Number(fallback?.y ?? 0);
        const z = Number.isFinite(dir?.z) ? Number(dir.z) : Number(fallback?.z ?? 0);
        const len = Math.hypot(x, y, z);
        if (len > 1e-6) return { x: x / len, y: y / len, z: z / len };
        const fx = Number.isFinite(fallback?.x) ? Number(fallback.x) : 0;
        const fy = Number.isFinite(fallback?.y) ? Number(fallback.y) : 0;
        const fz = Number.isFinite(fallback?.z) ? Number(fallback.z) : 0;
        const fl = Math.hypot(fx, fy, fz);
        if (fl > 1e-6) return { x: fx / fl, y: fy / fl, z: fz / fl };
        return { x: 0, y: 1, z: 0 };
    };

    const directionToAzimuthElevationDegrees = (dir) => {
        const n = normalizeDirection(dir, { x: 0, y: 1, z: 0 });
        const elevationDegrees = Math.asin(clamp(n.y, -1, 1)) * (180 / Math.PI);
        let azimuthDegrees = Math.atan2(n.z, n.x) * (180 / Math.PI);
        if (azimuthDegrees < 0) azimuthDegrees += 360;
        return { azimuthDegrees, elevationDegrees };
    };

    const azimuthElevationDegreesToDirection = (azimuthDegrees, elevationDegrees) => {
        const az = clamp(azimuthDegrees, 0, 360) * (Math.PI / 180);
        const el = clamp(elevationDegrees, 0, 90) * (Math.PI / 180);
        const cosEl = Math.cos(el);
        const x = cosEl * Math.cos(az);
        const z = cosEl * Math.sin(az);
        const y = Math.sin(el);
        return normalizeDirection({ x, y, z }, { x: 0, y: 1, z: 0 });
    };

    const applyTooltip = (node, text) => {
        const el = node && typeof node === 'object' ? node : null;
        const t = typeof text === 'string' ? text : '';
        if (!el || !t) return;
        el.title = t;
    };

    const appendMustHaveDot = (target) => {
        const el = target && typeof target === 'object' ? target : null;
        if (!el) return;
        const dot = document.createElement('span');
        dot.className = 'building-fab-must-have-dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '•';
        el.appendChild(dot);
        const sr = document.createElement('span');
        sr.className = 'building-fab-sr-only';
        sr.textContent = ' (must-have)';
        el.appendChild(sr);
    };

    const applyRangeRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
        if (!row) return;
        if (tooltip) {
            applyTooltip(row.label, tooltip);
            applyTooltip(row.range, tooltip);
            applyTooltip(row.number, tooltip);
        }
        if (mustHave) appendMustHaveDot(row.label);
    };

    const applyToggleRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
        if (!row) return;
        if (tooltip) {
            applyTooltip(row.text, tooltip);
            applyTooltip(row.toggle, tooltip);
        }
        if (mustHave) appendMustHaveDot(row.text);
    };

    const applySelectRowMeta = (row, { tooltip = '', mustHave = false } = {}) => {
        const r = row && typeof row === 'object' ? row : null;
        if (!r) return;
        if (tooltip) {
            applyTooltip(r.label, tooltip);
            applyTooltip(r.select, tooltip);
        }
        if (mustHave) appendMustHaveDot(r.label);
    };

    const addDetailsResetButton = (section, { allow = true, label = 'Reset to defaults', onReset = null } = {}) => {
        const summary = section?.summary ?? null;
        const reset = typeof onReset === 'function' ? onReset : null;
        if (!summary || !reset) return null;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'building-fab-details-reset';
        btn.disabled = !allow;
        applyMaterialSymbolToButton(btn, { name: 'restart_alt', label, size: 'sm' });
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            reset();
        });
        summary.appendChild(btn);
        return btn;
    };

    const isMinimalMaterialVariationConfig = (cfg) => {
        const src = cfg && typeof cfg === 'object' ? cfg : null;
        if (!src) return true;
        const keys = Object.keys(src);
        for (const key of keys) {
            if (key !== 'enabled' && key !== 'seedOffset' && key !== 'normalMap') return false;
        }
        return true;
    };

    const createDisabledMaterialVariationConfig = (root, { seedOffset = 0, normalMap = null } = {}) => {
        const preset = getDefaultMaterialVariationPreset(root);
        const presetBrick = preset.brick && typeof preset.brick === 'object' ? preset.brick : {};
        const brickBaseLayout = {
            bricksPerTileX: presetBrick.bricksPerTileX ?? 6.0,
            bricksPerTileY: presetBrick.bricksPerTileY ?? 3.0,
            mortarWidth: presetBrick.mortarWidth ?? 0.08,
            offsetX: presetBrick.offsetX ?? 0.0,
            offsetY: presetBrick.offsetY ?? 0.0
        };
        const srcNormalMap = normalMap && typeof normalMap === 'object' ? normalMap : null;
        const presetNormalMap = preset.normalMap && typeof preset.normalMap === 'object' ? preset.normalMap : {};
        return {
            enabled: true,
            seedOffset: clampInt(seedOffset, -9999, 9999),
            root: preset.root,
            space: preset.space,
            worldSpaceScale: preset.worldSpaceScale,
            objectSpaceScale: preset.objectSpaceScale,
            globalIntensity: preset.globalIntensity,
            aoAmount: preset.aoAmount,
            normalMap: {
                flipX: srcNormalMap?.flipX === undefined ? !!presetNormalMap.flipX : !!srcNormalMap.flipX,
                flipY: srcNormalMap?.flipY === undefined ? !!presetNormalMap.flipY : !!srcNormalMap.flipY,
                flipZ: srcNormalMap?.flipZ === undefined ? !!presetNormalMap.flipZ : !!srcNormalMap.flipZ
            },
            macroLayers: [{ enabled: false }, { enabled: false }, { enabled: false }, { enabled: false }],
            streaks: { enabled: false },
            exposure: { enabled: false },
            wearTop: { enabled: false },
            wearBottom: { enabled: false },
            wearSide: { enabled: false },
            cracksLayer: { enabled: false },
            antiTiling: { enabled: false },
            stairShift: { enabled: false },
            brick: {
                perBrick: { enabled: false, layout: { ...brickBaseLayout } },
                mortar: { enabled: false, layout: { ...brickBaseLayout } }
            }
        };
    };

    const bindDetailsState = (details, key, { open = true } = {}) => {
        if (!details || typeof key !== 'string' || !key) return;
        details.dataset.detailsKey = key;
        const stored = detailsMap.get(key);
        details.open = typeof stored === 'boolean' ? stored : !!open;
        detailsMap.set(key, details.open);
        details.addEventListener('toggle', () => {
            detailsMap.set(key, details.open);
        });
    };

    const makeDetailsSectionWithKey = (title, { open = true, nested = false, key = null } = {}) => {
        const details = document.createElement('details');
        details.className = nested ? 'building-fab-details building-fab-layer-subdetails' : 'building-fab-details';
        const summary = document.createElement('summary');
        summary.className = 'building-fab-details-summary';
        const label = document.createElement('span');
        label.className = 'building-fab-details-title';
        label.textContent = title;
        summary.appendChild(label);
        details.appendChild(summary);
        const body = document.createElement('div');
        body.className = 'building-fab-details-body';
        details.appendChild(body);
        bindDetailsState(details, key, { open });
        return { details, summary, body, label };
    };

    const makeRangeRow = (labelText) => {
        const row = document.createElement('div');
        row.className = 'building-fab-row';
        const l = document.createElement('div');
        l.className = 'building-fab-row-label';
        l.textContent = labelText;
        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'building-fab-range';
        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'building-fab-number';
        row.appendChild(l);
        row.appendChild(range);
        row.appendChild(number);
        return { row, range, number, label: l };
    };

    const makeToggleRow = (labelText) => {
        const toggle = document.createElement('label');
        toggle.className = 'building-fab-toggle building-fab-toggle-wide';
        const input = document.createElement('input');
        input.type = 'checkbox';
        const text = document.createElement('span');
        text.textContent = labelText;
        toggle.appendChild(input);
        toggle.appendChild(text);
        return { toggle, input, text };
    };

    const appendWallMaterialVariationUI = ({ parent, allow, scopeKey, layerId, layer, onChange: onChangeArg, onReRender: onReRenderArg, registerMiniController: registerArg } = {}) => {
        const onChange = typeof onChangeArg === 'function' ? onChangeArg : () => {};
        const onReRender = typeof onReRenderArg === 'function' ? onReRenderArg : () => {};
        const registerMiniController = typeof registerArg === 'function' ? registerArg : () => {};
        const detailsOpenByKey = detailsMap;
        const makeDetailsSection = makeDetailsSectionWithKey;
        const wallMatVarGroup = makeDetailsSection('Material variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar` });
        layer.materialVariation ??= { enabled: false, seedOffset: 0 };
        const wallMatVarNormalized = normalizeMaterialVariationConfig(layer.materialVariation, { root: MATERIAL_VARIATION_ROOT.WALL });
        
        const wallMatVarBasicsGroup = makeDetailsSection('Basics', { open: true, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:basics` });
        const wallMatVarMacroGroup = makeDetailsSection('Macro variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro` });
        const wallMatVarMidGroup = makeDetailsSection('Mid variation (patches)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:mid` });
        const wallMatVarMicroGroup = makeDetailsSection('Micro variation (surface response)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:micro` });
        const wallMatVarWeatherGroup = makeDetailsSection('Weathering', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:weather` });
        const wallMatVarBrickGroup = makeDetailsSection('Brick-specific', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:brick` });
        const wallMatVarAdvancedGroup = makeDetailsSection('Advanced', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:advanced` });
        
        wallMatVarGroup.body.appendChild(wallMatVarBasicsGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarMacroGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarMidGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarMicroGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarWeatherGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarBrickGroup.details);
        wallMatVarGroup.body.appendChild(wallMatVarAdvancedGroup.details);
        
        applyTooltip(
            wallMatVarGroup.label,
            tip(
                'Procedural material variation and weathering for this layer.',
                'Start with Basics → Intensity and World scale.',
                'Too much: stacked effects look noisy or overly dirty.'
            )
        );
        addDetailsResetButton(wallMatVarGroup, { allow,
            onReset: () => {
                const prevEnabled = !!layer.materialVariation.enabled;
                const prevSeedOffset = clampInt(layer.materialVariation.seedOffset ?? 0, -9999, 9999);
                const preset = getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.WALL);
                layer.materialVariation = { ...preset, enabled: prevEnabled, seedOffset: prevSeedOffset };
                onReRender();
                onChange();
            }
        });
        applyTooltip(
            wallMatVarBasicsGroup.label,
            tip(
                'Global controls that affect all enabled strategies.',
                'Start here before touching the deeper groups.',
                'Too much: high intensity + small world scale looks like grain/noise.'
            )
        );
        applyTooltip(
            wallMatVarMacroGroup.label,
            tip(
                'Large-scale breakup to fight repeating textures.',
                'Start with Intensity + Scale on Macro layer 1.',
                'Too much: obvious cloudy blotches.'
            )
        );
        applyTooltip(
            wallMatVarMidGroup.label,
            tip(
                'Patchy mid-scale variation (repairs/batches/fade).',
                'Use sparingly for subtle material history.',
                'Too much: looks like painted camouflage.'
            )
        );
        applyTooltip(
            wallMatVarMicroGroup.label,
            tip(
                'High-frequency variation for surface response (mostly roughness/normal).',
                'Use small amounts to avoid flat, CG-looking materials.',
                'Too much: sparkly, noisy specular.'
            )
        );
        applyTooltip(
            wallMatVarWeatherGroup.label,
            tip(
                'Purpose-driven weathering: runoff streaks, top deposits, ground grime, edge wear, cracks.',
                'Prefer one or two subtle effects rather than everything at once.',
                'Too much: uniformly dirty walls with no believable story.'
            )
        );
        applyTooltip(
            wallMatVarBrickGroup.label,
            tip(
                'Brick-specific controls (bonding / per-brick / mortar).',
                'Use only for brick-like materials.',
                'Too much: patterning becomes more obvious than the base texture.'
            )
        );
        applyTooltip(
            wallMatVarAdvancedGroup.label,
            tip(
                'Advanced controls (projection/space/debug/perf).',
                'Usually leave defaults.',
                'Too much: can cause distortion or artifacts.'
            )
        );
        
        const matVarToggle = makeToggleRow('Enable variation');
        matVarToggle.input.checked = !!wallMatVarNormalized.enabled;
        matVarToggle.input.disabled = !allow;
        applyToggleRowMeta(matVarToggle, {
            mustHave: true,
            tooltip: tip(
                'Turns on the variation system for this layer.',
                'Typical: enable for subtle breakup and weathering.',
                'Too much: high intensity across many strategies looks noisy/dirty.'
            )
        });
        wallMatVarBasicsGroup.body.appendChild(matVarToggle.toggle);
        
        const seedOffsetRow = makeRangeRow('Seed offset');
        seedOffsetRow.range.min = '-9999';
        seedOffsetRow.range.max = '9999';
        seedOffsetRow.range.step = '1';
        seedOffsetRow.number.min = '-9999';
        seedOffsetRow.number.max = '9999';
        seedOffsetRow.number.step = '1';
        seedOffsetRow.range.value = String(layer.materialVariation.seedOffset ?? 0);
        seedOffsetRow.number.value = String(layer.materialVariation.seedOffset ?? 0);
        applyRangeRowMeta(seedOffsetRow, {
            tooltip: tip(
                'Offsets the random seed for this layer.',
                'Use to make the same style look different per building.',
                'Too much: not harmful, but makes iteration harder to compare.'
            )
        });
        wallMatVarBasicsGroup.body.appendChild(seedOffsetRow.row);
        
        const intensityRow = makeRangeRow('Intensity');
        intensityRow.range.min = '0';
        intensityRow.range.max = '2';
        intensityRow.range.step = '0.01';
        intensityRow.number.min = '0';
        intensityRow.number.max = '2';
        intensityRow.number.step = '0.01';
        intensityRow.range.value = String(wallMatVarNormalized.globalIntensity);
        intensityRow.number.value = formatFloat(wallMatVarNormalized.globalIntensity, 2);
        applyRangeRowMeta(intensityRow, {
            mustHave: true,
            tooltip: tip(
                'Overall multiplier for all enabled variation strategies.',
                'Typical: 0.5–1.5 for subtle breakup.',
                'Too much: everything becomes noisy and over-processed.'
            )
        });
        wallMatVarBasicsGroup.body.appendChild(intensityRow.row);
        
        const scaleRow = makeRangeRow('World scale');
        scaleRow.range.min = '0.05';
        scaleRow.range.max = '4';
        scaleRow.range.step = '0.01';
        scaleRow.number.min = '0.05';
        scaleRow.number.max = '4';
        scaleRow.number.step = '0.01';
        scaleRow.range.value = String(wallMatVarNormalized.worldSpaceScale);
        scaleRow.number.value = formatFloat(wallMatVarNormalized.worldSpaceScale, 2);
        applyRangeRowMeta(scaleRow, {
            mustHave: true,
            tooltip: tip(
                'Sets the world-space scale for the procedural patterns.',
                'Lower = larger features; higher = smaller features.',
                'Too much: very high values look like grain/noise.'
            )
         });
         wallMatVarBasicsGroup.body.appendChild(scaleRow.row);
        
         const aoAmountRow = makeRangeRow('AO amount');
         aoAmountRow.range.min = '0';
         aoAmountRow.range.max = '1';
        aoAmountRow.range.step = '0.01';
        aoAmountRow.number.min = '0';
        aoAmountRow.number.max = '1';
        aoAmountRow.number.step = '0.01';
        aoAmountRow.range.value = String(wallMatVarNormalized.aoAmount);
        aoAmountRow.number.value = formatFloat(wallMatVarNormalized.aoAmount, 2);
        applyRangeRowMeta(aoAmountRow, {
            tooltip: tip(
                'Ambient occlusion influence inside the variation system.',
                'Typical: 0.30–0.70 depending on how strong you want crevices.',
                'Too much: everything looks dirty and crushed.'
            )
        });
        wallMatVarBasicsGroup.body.appendChild(aoAmountRow.row);
        
        const matVarSpaceRow = document.createElement('div');
        matVarSpaceRow.className = 'building-fab-row building-fab-row-wide';
        const matVarSpaceLabel = document.createElement('div');
        matVarSpaceLabel.className = 'building-fab-row-label';
        matVarSpaceLabel.textContent = 'Space';
        const matVarSpaceSelect = document.createElement('select');
        matVarSpaceSelect.className = 'building-fab-select';
        for (const v of ['world', 'object']) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v === 'object' ? 'Object space (sticks to mesh)' : 'World space (sticks to scene)';
            matVarSpaceSelect.appendChild(opt);
        }
        matVarSpaceSelect.value = wallMatVarNormalized.space === 'object' ? 'object' : 'world';
        matVarSpaceRow.appendChild(matVarSpaceLabel);
        matVarSpaceRow.appendChild(matVarSpaceSelect);
        applySelectRowMeta(
            { label: matVarSpaceLabel, select: matVarSpaceSelect },
            {
                tooltip: tip(
                    'Chooses the coordinate space for the procedural patterns.',
                    'World: stable across objects; Object: sticks to the mesh (good for moving parts).',
                    'Too much: Object space can reveal stretching on low-UV assets.'
                )
            }
        );
        wallMatVarAdvancedGroup.body.appendChild(matVarSpaceRow);
        
        const objectScaleRow = makeRangeRow('Object scale');
        objectScaleRow.range.min = '0.05';
        objectScaleRow.range.max = '4';
        objectScaleRow.range.step = '0.01';
        objectScaleRow.number.min = '0.05';
        objectScaleRow.number.max = '4';
        objectScaleRow.number.step = '0.01';
        objectScaleRow.range.value = String(wallMatVarNormalized.objectSpaceScale);
        objectScaleRow.number.value = formatFloat(wallMatVarNormalized.objectSpaceScale, 2);
        applyRangeRowMeta(objectScaleRow, {
            tooltip: tip(
                'Scale used when Space is set to Object.',
                'Lower = larger features; higher = smaller features.',
                'Too much: very high values look like grain/noise.'
            )
        });
        wallMatVarAdvancedGroup.body.appendChild(objectScaleRow.row);
        
        const wallMatVarNormalMapGroup = makeDetailsSection('Normal map', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:normalMap` });
        applyTooltip(
            wallMatVarNormalMapGroup.label,
            tip(
                'Per-layer normal map channel fixes.',
                'Typical: flip Y (green) if the normal map is authored for a different convention (DirectX vs OpenGL).',
                'Use with care: flipping X/Z can make lighting look inside-out.'
            )
        );
        
        const wallMatVarNormalFlipXToggle = makeToggleRow('Flip normal X (red)');
        wallMatVarNormalFlipXToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipX;
        wallMatVarNormalFlipXToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(wallMatVarNormalFlipXToggle, {
            tooltip: tip(
                'Flips the red channel of the normal map.',
                'Use if lighting looks mirrored left/right.',
                'Not commonly needed for standard OpenGL normal maps.'
            )
        });
        wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipXToggle.toggle);
        
        const wallMatVarNormalFlipYToggle = makeToggleRow('Flip normal Y (green)');
        wallMatVarNormalFlipYToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipY;
        wallMatVarNormalFlipYToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(wallMatVarNormalFlipYToggle, {
            tooltip: tip(
                'Flips the green channel of the normal map.',
                'Typical: enable when using DirectX-authored normal maps.',
                'If shading becomes worse, turn it back off.'
            )
        });
        wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipYToggle.toggle);
        
        const wallMatVarNormalFlipZToggle = makeToggleRow('Flip normal Z (blue)');
        wallMatVarNormalFlipZToggle.input.checked = !!wallMatVarNormalized.normalMap?.flipZ;
        wallMatVarNormalFlipZToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(wallMatVarNormalFlipZToggle, {
            tooltip: tip(
                'Flips the blue channel of the normal map.',
                'Rarely needed.',
                'If enabled, lighting can look inverted.'
            )
        });
        wallMatVarNormalMapGroup.body.appendChild(wallMatVarNormalFlipZToggle.toggle);
        
        wallMatVarAdvancedGroup.body.appendChild(wallMatVarNormalMapGroup.details);
        
        const macro0 = wallMatVarNormalized.macroLayers?.[0] ?? null;
        const macroGroup = makeDetailsSection('Macro layer 1', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro0` });
        applyTooltip(
            macroGroup.label,
            tip(
                'Macro layer 1 (Macro A): primary large-scale breakup.',
                'Start with Intensity + Scale for subtle variation.',
                'Too much: big cloudy blobs that overpower the base material.'
            )
        );
        const macroToggle = makeToggleRow('Enable macro layer 1');
        macroToggle.input.checked = !!macro0?.enabled;
        macroToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(macroToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables Macro A (large-scale breakup).',
                'Typical: enabled for walls to reduce repetition.',
                'Too much: combined with high intensity can look blotchy.'
            )
        });
        macroGroup.body.appendChild(macroToggle.toggle);
        const macroIntensityRow = makeRangeRow('Intensity');
        macroIntensityRow.range.min = '0';
        macroIntensityRow.range.max = '2';
        macroIntensityRow.range.step = '0.01';
        macroIntensityRow.number.min = '0';
        macroIntensityRow.number.max = '2';
        macroIntensityRow.number.step = '0.01';
        macroIntensityRow.range.value = String(macro0?.intensity ?? 0.0);
        macroIntensityRow.number.value = formatFloat(macro0?.intensity ?? 0.0, 2);
        applyRangeRowMeta(macroIntensityRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of Macro A.',
                'Typical: 0.2–1.0 (depending on the material).',
                'Too much: obvious blotches and loss of texture identity.'
            )
        });
        macroGroup.body.appendChild(macroIntensityRow.row);
        const macroScaleRow = makeRangeRow('Scale');
        macroScaleRow.range.min = '0.01';
        macroScaleRow.range.max = '20';
        macroScaleRow.range.step = '0.01';
        macroScaleRow.number.min = '0.01';
        macroScaleRow.number.max = '20';
        macroScaleRow.number.step = '0.01';
        macroScaleRow.range.value = String(macro0?.scale ?? 1.0);
        macroScaleRow.number.value = formatFloat(macro0?.scale ?? 1.0, 2);
        applyRangeRowMeta(macroScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Frequency of Macro A (higher = smaller features).',
                'Typical: 0.1–5 depending on your tile size.',
                'Too much: looks like noisy speckling instead of macro breakup.'
            )
        });
        macroGroup.body.appendChild(macroScaleRow.row);
        
        const macroHueRow = makeRangeRow('Hue shift (deg)');
        macroHueRow.range.min = '-180';
        macroHueRow.range.max = '180';
        macroHueRow.range.step = '1';
        macroHueRow.number.min = '-180';
        macroHueRow.number.max = '180';
        macroHueRow.number.step = '1';
        macroHueRow.range.value = String(macro0?.hueDegrees ?? 0.0);
        macroHueRow.number.value = String(Math.round(macro0?.hueDegrees ?? 0.0));
        applyRangeRowMeta(macroHueRow, {
            tooltip: tip(
                'Hue shift for Macro A.',
                'Typical: ±5–20° for subtle hue drift.',
                'Too much: unnatural rainbow color variation.'
            )
        });
        macroGroup.body.appendChild(macroHueRow.row);
        
        const macroValueRow = makeRangeRow('Value');
        macroValueRow.range.min = '-1';
        macroValueRow.range.max = '1';
        macroValueRow.range.step = '0.01';
        macroValueRow.number.min = '-1';
        macroValueRow.number.max = '1';
        macroValueRow.number.step = '0.01';
        macroValueRow.range.value = String(macro0?.value ?? 0.0);
        macroValueRow.number.value = formatFloat(macro0?.value ?? 0.0, 2);
        applyRangeRowMeta(macroValueRow, {
            tooltip: tip(
                'Brightness/value shift for Macro A.',
                'Typical: small positive/negative values.',
                'Too much: strong patchiness and contrast.'
            )
        });
        macroGroup.body.appendChild(macroValueRow.row);
        
        const macroSaturationRow = makeRangeRow('Saturation');
        macroSaturationRow.range.min = '-1';
        macroSaturationRow.range.max = '1';
        macroSaturationRow.range.step = '0.01';
        macroSaturationRow.number.min = '-1';
        macroSaturationRow.number.max = '1';
        macroSaturationRow.number.step = '0.01';
        macroSaturationRow.range.value = String(macro0?.saturation ?? 0.0);
        macroSaturationRow.number.value = formatFloat(macro0?.saturation ?? 0.0, 2);
        applyRangeRowMeta(macroSaturationRow, {
            tooltip: tip(
                'Saturation shift for Macro A.',
                'Typical: subtle.',
                'Too much: cartoonish saturation swings or desaturated blotches.'
            )
        });
        macroGroup.body.appendChild(macroSaturationRow.row);
        
        const macroRoughnessRow = makeRangeRow('Roughness');
        macroRoughnessRow.range.min = '-1';
        macroRoughnessRow.range.max = '1';
        macroRoughnessRow.range.step = '0.01';
        macroRoughnessRow.number.min = '-1';
        macroRoughnessRow.number.max = '1';
        macroRoughnessRow.number.step = '0.01';
        macroRoughnessRow.range.value = String(macro0?.roughness ?? 0.0);
        macroRoughnessRow.number.value = formatFloat(macro0?.roughness ?? 0.0, 2);
        applyRangeRowMeta(macroRoughnessRow, {
            tooltip: tip(
                'Roughness shift for Macro A.',
                'Typical: subtle (helps break uniform specular).',
                'Too much: sparkly highlights or overly matte patches.'
            )
        });
        macroGroup.body.appendChild(macroRoughnessRow.row);
        
        const macroNormalRow = makeRangeRow('Normal');
        macroNormalRow.range.min = '-1';
        macroNormalRow.range.max = '1';
        macroNormalRow.range.step = '0.01';
        macroNormalRow.number.min = '-1';
        macroNormalRow.number.max = '1';
        macroNormalRow.number.step = '0.01';
        macroNormalRow.range.value = String(macro0?.normal ?? 0.0);
        macroNormalRow.number.value = formatFloat(macro0?.normal ?? 0.0, 2);
        applyRangeRowMeta(macroNormalRow, {
            tooltip: tip(
                'Normal shift for Macro A.',
                'Typical: small (mostly leave at 0).',
                'Too much: warping/bumpy shading artifacts.'
            )
        });
        macroGroup.body.appendChild(macroNormalRow.row);
        wallMatVarMacroGroup.body.appendChild(macroGroup.details);
        
        const streaksGroup = makeDetailsSection('Streaks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:streaks` });
        applyTooltip(
            streaksGroup.label,
            tip(
                'Runoff streaks and drip marks (gravity-aligned).',
                'Good for subtle staining and variation directionality.',
                'Too much: walls look uniformly dirty and overdone.'
            )
        );
        const streaksToggle = makeToggleRow('Enable streaks');
        streaksToggle.input.checked = !!wallMatVarNormalized.streaks.enabled;
        streaksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(streaksToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables gravity-aligned streaking/runoff.',
                'Typical: enable with low Strength for realism.',
                'Too much: obvious drips on every surface.'
            )
        });
        streaksGroup.body.appendChild(streaksToggle.toggle);
        const streakStrengthRow = makeRangeRow('Strength');
        streakStrengthRow.range.min = '0';
        streakStrengthRow.range.max = '2';
        streakStrengthRow.range.step = '0.01';
        streakStrengthRow.number.min = '0';
        streakStrengthRow.number.max = '2';
        streakStrengthRow.number.step = '0.01';
        streakStrengthRow.range.value = String(wallMatVarNormalized.streaks.strength);
        streakStrengthRow.number.value = formatFloat(wallMatVarNormalized.streaks.strength, 2);
        applyRangeRowMeta(streakStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of streaking/runoff.',
                'Typical: 0.05–0.30 for subtle staining.',
                'Too much: heavy grime everywhere.'
            )
        });
        streaksGroup.body.appendChild(streakStrengthRow.row);
        const streakScaleRow = makeRangeRow('Scale');
        streakScaleRow.range.min = '0.01';
        streakScaleRow.range.max = '20';
        streakScaleRow.range.step = '0.01';
        streakScaleRow.number.min = '0.01';
        streakScaleRow.number.max = '20';
        streakScaleRow.number.step = '0.01';
        streakScaleRow.range.value = String(wallMatVarNormalized.streaks.scale);
        streakScaleRow.number.value = formatFloat(wallMatVarNormalized.streaks.scale, 2);
        applyRangeRowMeta(streakScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Size of streak features (higher = smaller streak detail).',
                'Typical: 0.3–2.0 depending on wall size.',
                'Too much: tiny scale reads as noisy speckles.'
            )
        });
        streaksGroup.body.appendChild(streakScaleRow.row);
        
        const streakLedgeStrengthRow = makeRangeRow('Ledge strength');
        streakLedgeStrengthRow.range.min = '0';
        streakLedgeStrengthRow.range.max = '2';
        streakLedgeStrengthRow.range.step = '0.01';
        streakLedgeStrengthRow.number.min = '0';
        streakLedgeStrengthRow.number.max = '2';
        streakLedgeStrengthRow.number.step = '0.01';
        streakLedgeStrengthRow.range.value = String(wallMatVarNormalized.streaks.ledgeStrength);
        streakLedgeStrengthRow.number.value = formatFloat(wallMatVarNormalized.streaks.ledgeStrength, 2);
        applyRangeRowMeta(streakLedgeStrengthRow, {
            tooltip: tip(
                'Extra streaking under ledges/edges.',
                'Typical: small values (often 0).',
                'Too much: zebra stripes under every edge.'
            )
        });
        streaksGroup.body.appendChild(streakLedgeStrengthRow.row);
        
        const streakLedgeScaleRow = makeRangeRow('Ledge scale');
        streakLedgeScaleRow.range.min = '0';
        streakLedgeScaleRow.range.max = '20';
        streakLedgeScaleRow.range.step = '0.1';
        streakLedgeScaleRow.number.min = '0';
        streakLedgeScaleRow.number.max = '20';
        streakLedgeScaleRow.number.step = '0.1';
        streakLedgeScaleRow.range.value = String(wallMatVarNormalized.streaks.ledgeScale);
        streakLedgeScaleRow.number.value = formatFloat(wallMatVarNormalized.streaks.ledgeScale, 1);
        applyRangeRowMeta(streakLedgeScaleRow, {
            tooltip: tip(
                'Frequency of ledge streak detail.',
                'Typical: leave default unless you use ledge strength.',
                'Too much: repetitive banding under edges.'
            )
        });
        streaksGroup.body.appendChild(streakLedgeScaleRow.row);
        
        const streakHueRow = makeRangeRow('Hue shift (deg)');
        streakHueRow.range.min = '-180';
        streakHueRow.range.max = '180';
        streakHueRow.range.step = '1';
        streakHueRow.number.min = '-180';
        streakHueRow.number.max = '180';
        streakHueRow.number.step = '1';
        streakHueRow.range.value = String(wallMatVarNormalized.streaks.hueDegrees);
        streakHueRow.number.value = String(Math.round(wallMatVarNormalized.streaks.hueDegrees));
        applyRangeRowMeta(streakHueRow, {
            tooltip: tip(
                'Hue shift applied inside streaks.',
                'Typical: subtle warm/cool shift.',
                'Too much: colored paint-like drips.'
            )
        });
        streaksGroup.body.appendChild(streakHueRow.row);
        
        const streakValueRow = makeRangeRow('Value');
        streakValueRow.range.min = '-1';
        streakValueRow.range.max = '1';
        streakValueRow.range.step = '0.01';
        streakValueRow.number.min = '-1';
        streakValueRow.number.max = '1';
        streakValueRow.number.step = '0.01';
        streakValueRow.range.value = String(wallMatVarNormalized.streaks.value ?? 0.0);
        streakValueRow.number.value = formatFloat(wallMatVarNormalized.streaks.value ?? 0.0, 2);
        applyRangeRowMeta(streakValueRow, {
            tooltip: tip(
                'Brightness/value shift inside streaks.',
                'Typical: slightly darker for grime or slightly brighter for chalky deposits.',
                'Too much: harsh painted streaks.'
            )
        });
        streaksGroup.body.appendChild(streakValueRow.row);
        
        const streakSaturationRow = makeRangeRow('Saturation');
        streakSaturationRow.range.min = '-1';
        streakSaturationRow.range.max = '1';
        streakSaturationRow.range.step = '0.01';
        streakSaturationRow.number.min = '-1';
        streakSaturationRow.number.max = '1';
        streakSaturationRow.number.step = '0.01';
        streakSaturationRow.range.value = String(wallMatVarNormalized.streaks.saturation ?? 0.0);
        streakSaturationRow.number.value = formatFloat(wallMatVarNormalized.streaks.saturation ?? 0.0, 2);
        applyRangeRowMeta(streakSaturationRow, {
            tooltip: tip(
                'Saturation shift inside streaks.',
                'Typical: small negative saturation for grime.',
                'Too much: colored streaks that look like paint.'
            )
        });
        streaksGroup.body.appendChild(streakSaturationRow.row);
        
        const streakRoughnessRow = makeRangeRow('Roughness');
         streakRoughnessRow.range.min = '-1';
         streakRoughnessRow.range.max = '1';
         streakRoughnessRow.range.step = '0.01';
         streakRoughnessRow.number.min = '-1';
         streakRoughnessRow.number.max = '1';
         streakRoughnessRow.number.step = '0.01';
         streakRoughnessRow.range.value = String(wallMatVarNormalized.streaks.roughness ?? 0.0);
         streakRoughnessRow.number.value = formatFloat(wallMatVarNormalized.streaks.roughness ?? 0.0, 2);
         applyRangeRowMeta(streakRoughnessRow, {
            tooltip: tip(
                'Roughness shift inside streaks.',
                'Typical: slightly rougher for dried deposits.',
                'Too much: inconsistent specular that reads as noise.'
            )
        });
        streaksGroup.body.appendChild(streakRoughnessRow.row);
        
        const streakNormalRow = makeRangeRow('Normal');
        streakNormalRow.range.min = '-1';
        streakNormalRow.range.max = '1';
        streakNormalRow.range.step = '0.01';
        streakNormalRow.number.min = '-1';
        streakNormalRow.number.max = '1';
        streakNormalRow.number.step = '0.01';
        streakNormalRow.range.value = String(wallMatVarNormalized.streaks.normal ?? 0.0);
        streakNormalRow.number.value = formatFloat(wallMatVarNormalized.streaks.normal ?? 0.0, 2);
        applyRangeRowMeta(streakNormalRow, {
            tooltip: tip(
                'Normal shift inside streaks.',
                'Typical: 0 (leave off unless you need stronger texture response).',
                'Too much: bumpy streak artifacts.'
            )
         });
         streaksGroup.body.appendChild(streakNormalRow.row);
         wallMatVarWeatherGroup.body.appendChild(streaksGroup.details);
        
         const exposure = wallMatVarNormalized.exposure ?? null;
         const exposureGroup = makeDetailsSection('Orientation exposure', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:exposure` });
         applyTooltip(
             exposureGroup.label,
             tip(
                 'Directional exposure based on surface orientation (sun bleaching / windward rain).',
                 'Use subtle Strength and tune Exponent to control falloff.',
                 'Too much: one side of the building looks unnaturally different.'
             )
         );
         const exposureToggle = makeToggleRow('Enable exposure');
         exposureToggle.input.checked = !!exposure?.enabled;
         exposureToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
         applyToggleRowMeta(exposureToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables orientation-based exposure.',
                 'Typical: on for sun bleaching or windward staining.',
                 'Too much: a harsh split between directions.'
             )
         });
         exposureGroup.body.appendChild(exposureToggle.toggle);
        
         const exposureStrengthRow = makeRangeRow('Strength');
         exposureStrengthRow.range.min = '0';
         exposureStrengthRow.range.max = '2';
         exposureStrengthRow.range.step = '0.01';
         exposureStrengthRow.number.min = '0';
         exposureStrengthRow.number.max = '2';
         exposureStrengthRow.number.step = '0.01';
         exposureStrengthRow.range.value = String(exposure?.strength ?? 0.0);
         exposureStrengthRow.number.value = formatFloat(exposure?.strength ?? 0.0, 2);
         applyRangeRowMeta(exposureStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of the exposure mask.',
                 'Typical: 0.05–0.30.',
                 'Too much: strong directional discoloration.'
             )
         });
         exposureGroup.body.appendChild(exposureStrengthRow.row);
        
         const exposureExponentRow = makeRangeRow('Exponent');
         exposureExponentRow.range.min = '0.1';
         exposureExponentRow.range.max = '8';
         exposureExponentRow.range.step = '0.01';
         exposureExponentRow.number.min = '0.1';
         exposureExponentRow.number.max = '8';
         exposureExponentRow.number.step = '0.01';
         exposureExponentRow.range.value = String(exposure?.exponent ?? 1.6);
         exposureExponentRow.number.value = formatFloat(exposure?.exponent ?? 1.6, 2);
         applyRangeRowMeta(exposureExponentRow, {
             tooltip: tip(
                 'Sharpness of the direction falloff (higher = tighter).',
                 'Typical: 1.2–2.5.',
                 'Too much: abrupt “cutoff” bands.'
             )
         });
         exposureGroup.body.appendChild(exposureExponentRow.row);
        
         const exposureAngles = directionToAzimuthElevationDegrees(exposure?.direction);
         const exposureAzimuthRow = makeRangeRow('Azimuth (deg)');
         exposureAzimuthRow.range.min = '0';
         exposureAzimuthRow.range.max = '360';
         exposureAzimuthRow.range.step = '1';
         exposureAzimuthRow.number.min = '0';
         exposureAzimuthRow.number.max = '360';
         exposureAzimuthRow.number.step = '1';
         exposureAzimuthRow.range.value = String(Math.round(exposureAngles.azimuthDegrees));
         exposureAzimuthRow.number.value = String(Math.round(exposureAngles.azimuthDegrees));
         applyRangeRowMeta(exposureAzimuthRow, {
             tooltip: tip(
                 'Direction azimuth in world space.',
                 'Typical: aim toward the “sun” or prevailing weather.',
                 'Too much: direction mismatched to scene lighting.'
             )
         });
         exposureGroup.body.appendChild(exposureAzimuthRow.row);
        
         const exposureElevationRow = makeRangeRow('Elevation (deg)');
         exposureElevationRow.range.min = '0';
         exposureElevationRow.range.max = '90';
         exposureElevationRow.range.step = '1';
         exposureElevationRow.number.min = '0';
         exposureElevationRow.number.max = '90';
         exposureElevationRow.number.step = '1';
         exposureElevationRow.range.value = String(Math.round(exposureAngles.elevationDegrees));
         exposureElevationRow.number.value = String(Math.round(exposureAngles.elevationDegrees));
         applyRangeRowMeta(exposureElevationRow, {
             tooltip: tip(
                 'Direction elevation in world space (0 = horizon, 90 = straight up).',
                 'Typical: 25–70 for sun bleaching.',
                 'Too much: extreme values can feel arbitrary.'
             )
         });
         exposureGroup.body.appendChild(exposureElevationRow.row);
        
         const exposureValueRow = makeRangeRow('Value');
         exposureValueRow.range.min = '-1';
         exposureValueRow.range.max = '1';
         exposureValueRow.range.step = '0.01';
         exposureValueRow.number.min = '-1';
         exposureValueRow.number.max = '1';
         exposureValueRow.number.step = '0.01';
         exposureValueRow.range.value = String(exposure?.value ?? 0.0);
         exposureValueRow.number.value = formatFloat(exposure?.value ?? 0.0, 2);
         applyRangeRowMeta(exposureValueRow, {
             tooltip: tip(
                 'Brightness shift in exposed areas.',
                 'Typical: small positive for bleaching.',
                 'Too much: chalky, washed-out faces.'
             )
         });
         exposureGroup.body.appendChild(exposureValueRow.row);
        
         const exposureSaturationRow = makeRangeRow('Saturation');
         exposureSaturationRow.range.min = '-1';
         exposureSaturationRow.range.max = '1';
         exposureSaturationRow.range.step = '0.01';
         exposureSaturationRow.number.min = '-1';
         exposureSaturationRow.number.max = '1';
         exposureSaturationRow.number.step = '0.01';
         exposureSaturationRow.range.value = String(exposure?.saturation ?? 0.0);
         exposureSaturationRow.number.value = formatFloat(exposure?.saturation ?? 0.0, 2);
         applyRangeRowMeta(exposureSaturationRow, {
             tooltip: tip(
                 'Saturation shift in exposed areas.',
                 'Typical: slight desaturation for bleaching.',
                 'Too much: color pops or dulls unnaturally.'
             )
         });
         exposureGroup.body.appendChild(exposureSaturationRow.row);
        
         const exposureRoughnessRow = makeRangeRow('Roughness');
         exposureRoughnessRow.range.min = '-1';
         exposureRoughnessRow.range.max = '1';
         exposureRoughnessRow.range.step = '0.01';
         exposureRoughnessRow.number.min = '-1';
         exposureRoughnessRow.number.max = '1';
         exposureRoughnessRow.number.step = '0.01';
         exposureRoughnessRow.range.value = String(exposure?.roughness ?? 0.0);
         exposureRoughnessRow.number.value = formatFloat(exposure?.roughness ?? 0.0, 2);
         applyRangeRowMeta(exposureRoughnessRow, {
             tooltip: tip(
                 'Roughness shift in exposed areas.',
                 'Typical: slightly smoother or rougher depending on material.',
                 'Too much: sparkly or overly flat highlights.'
             )
         });
         exposureGroup.body.appendChild(exposureRoughnessRow.row);
         wallMatVarWeatherGroup.body.appendChild(exposureGroup.details);
        
         const wearSide = wallMatVarNormalized.wearSide ?? null;
         const edgeGroup = makeDetailsSection('Side wear (vertical edges)', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearSide` });
         applyTooltip(
            edgeGroup.label,
            tip(
                'Edge/side wear along vertical corners and edges.',
                'Good for subtle exposure and chipped-edge feel.',
                'Too much: outlines every edge like a cartoon.'
            )
        );
        const edgeToggle = makeToggleRow('Enable side wear');
        edgeToggle.input.checked = !!wearSide?.enabled;
        edgeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(edgeToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables vertical edge wear.',
                'Typical: enable with low Strength.',
                'Too much: edges become uniformly highlighted.'
            )
        });
        edgeGroup.body.appendChild(edgeToggle.toggle);
        const edgeStrengthRow = makeRangeRow('Strength');
        edgeStrengthRow.range.min = '0';
        edgeStrengthRow.range.max = '2';
        edgeStrengthRow.range.step = '0.01';
        edgeStrengthRow.number.min = '0';
        edgeStrengthRow.number.max = '2';
        edgeStrengthRow.number.step = '0.01';
        edgeStrengthRow.range.value = String(wearSide?.intensity ?? 0.0);
        edgeStrengthRow.number.value = formatFloat(wearSide?.intensity ?? 0.0, 2);
        applyRangeRowMeta(edgeStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of edge wear.',
                'Typical: 0.05–0.30.',
                'Too much: bright/dirty outlines on every corner.'
            )
        });
        edgeGroup.body.appendChild(edgeStrengthRow.row);
        
        const edgeWidthRow = makeRangeRow('Width');
        edgeWidthRow.range.min = '0';
        edgeWidthRow.range.max = '4';
        edgeWidthRow.range.step = '0.01';
        edgeWidthRow.number.min = '0';
        edgeWidthRow.number.max = '4';
        edgeWidthRow.number.step = '0.01';
        edgeWidthRow.range.value = String(wearSide?.width ?? 1.0);
        edgeWidthRow.number.value = formatFloat(wearSide?.width ?? 1.0, 2);
        applyRangeRowMeta(edgeWidthRow, {
            mustHave: true,
            tooltip: tip(
                'Width of the edge wear band.',
                'Typical: 0.2–1.0 depending on building scale.',
                'Too much: looks like painted stripes on corners.'
            )
        });
        edgeGroup.body.appendChild(edgeWidthRow.row);
        
        const edgeScaleRow = makeRangeRow('Scale');
        edgeScaleRow.range.min = '0.01';
        edgeScaleRow.range.max = '20';
        edgeScaleRow.range.step = '0.01';
        edgeScaleRow.number.min = '0.01';
        edgeScaleRow.number.max = '20';
        edgeScaleRow.number.step = '0.01';
        edgeScaleRow.range.value = String(wearSide?.scale ?? 1.0);
        edgeScaleRow.number.value = formatFloat(wearSide?.scale ?? 1.0, 2);
        applyRangeRowMeta(edgeScaleRow, {
            tooltip: tip(
                'Noise scale used to break up the edge band.',
                'Typical: 0.5–2.0.',
                'Too much: noisy, peppery edges.'
            )
        });
        edgeGroup.body.appendChild(edgeScaleRow.row);
        
        const edgeHueRow = makeRangeRow('Hue shift (deg)');
        edgeHueRow.range.min = '-180';
        edgeHueRow.range.max = '180';
        edgeHueRow.range.step = '1';
        edgeHueRow.number.min = '-180';
        edgeHueRow.number.max = '180';
        edgeHueRow.number.step = '1';
        edgeHueRow.range.value = String(wearSide?.hueDegrees ?? 0.0);
        edgeHueRow.number.value = String(Math.round(wearSide?.hueDegrees ?? 0.0));
        applyRangeRowMeta(edgeHueRow, {
            tooltip: tip(
                'Hue shift applied to edge wear.',
                'Typical: small (often 0).',
                'Too much: colorful outlines on edges.'
            )
        });
        edgeGroup.body.appendChild(edgeHueRow.row);
        
        const edgeValueRow = makeRangeRow('Value');
        edgeValueRow.range.min = '-1';
        edgeValueRow.range.max = '1';
        edgeValueRow.range.step = '0.01';
        edgeValueRow.number.min = '-1';
        edgeValueRow.number.max = '1';
        edgeValueRow.number.step = '0.01';
        edgeValueRow.range.value = String(wearSide?.value ?? 0.0);
        edgeValueRow.number.value = formatFloat(wearSide?.value ?? 0.0, 2);
        applyRangeRowMeta(edgeValueRow, {
            tooltip: tip(
                'Value/brightness shift applied to edge wear.',
                'Typical: subtle brightening/darkening.',
                'Too much: chalky edges or overly dark outlines.'
            )
        });
        edgeGroup.body.appendChild(edgeValueRow.row);
        
        const edgeSaturationRow = makeRangeRow('Saturation');
        edgeSaturationRow.range.min = '-1';
        edgeSaturationRow.range.max = '1';
        edgeSaturationRow.range.step = '0.01';
        edgeSaturationRow.number.min = '-1';
        edgeSaturationRow.number.max = '1';
        edgeSaturationRow.number.step = '0.01';
        edgeSaturationRow.range.value = String(wearSide?.saturation ?? 0.0);
        edgeSaturationRow.number.value = formatFloat(wearSide?.saturation ?? 0.0, 2);
        applyRangeRowMeta(edgeSaturationRow, {
            tooltip: tip(
                'Saturation shift applied to edge wear.',
                'Typical: small negative saturation for dusty edges.',
                'Too much: colored/painterly edges.'
            )
        });
        edgeGroup.body.appendChild(edgeSaturationRow.row);
        
        const edgeRoughnessRow = makeRangeRow('Roughness');
        edgeRoughnessRow.range.min = '-1';
        edgeRoughnessRow.range.max = '1';
        edgeRoughnessRow.range.step = '0.01';
        edgeRoughnessRow.number.min = '-1';
        edgeRoughnessRow.number.max = '1';
        edgeRoughnessRow.number.step = '0.01';
        edgeRoughnessRow.range.value = String(wearSide?.roughness ?? 0.0);
        edgeRoughnessRow.number.value = formatFloat(wearSide?.roughness ?? 0.0, 2);
        applyRangeRowMeta(edgeRoughnessRow, {
            tooltip: tip(
                'Roughness shift applied to edge wear.',
                'Typical: slightly rougher for exposed edges.',
                'Too much: noisy specular along edges.'
            )
        });
        edgeGroup.body.appendChild(edgeRoughnessRow.row);
        
        const edgeNormalRow = makeRangeRow('Normal');
        edgeNormalRow.range.min = '-1';
        edgeNormalRow.range.max = '1';
        edgeNormalRow.range.step = '0.01';
        edgeNormalRow.number.min = '-1';
        edgeNormalRow.number.max = '1';
        edgeNormalRow.number.step = '0.01';
        edgeNormalRow.range.value = String(wearSide?.normal ?? 0.0);
        edgeNormalRow.number.value = formatFloat(wearSide?.normal ?? 0.0, 2);
        applyRangeRowMeta(edgeNormalRow, {
            tooltip: tip(
                'Normal shift applied to edge wear.',
                'Typical: 0.',
                'Too much: bumpy edge artifacts.'
            )
        });
        edgeGroup.body.appendChild(edgeNormalRow.row);
        wallMatVarWeatherGroup.body.appendChild(edgeGroup.details);
        
        const wearBottom = wallMatVarNormalized.wearBottom ?? null;
        const grimeGroup = makeDetailsSection('Bottom wear', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearBottom` });
        applyTooltip(
            grimeGroup.label,
            tip(
                'Ground grime band near the bottom of the wall.',
                'Great for subtle splashback and dirt accumulation.',
                'Too much: the whole wall looks uniformly dirty.'
            )
        );
        const grimeToggle = makeToggleRow('Enable bottom wear');
        grimeToggle.input.checked = !!wearBottom?.enabled;
        grimeToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(grimeToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables bottom wear/grime.',
                'Typical: enable with low Strength + narrow Width.',
                'Too much: a thick dirty band that dominates the facade.'
            )
        });
        grimeGroup.body.appendChild(grimeToggle.toggle);
        const grimeStrengthRow = makeRangeRow('Strength');
        grimeStrengthRow.range.min = '0';
        grimeStrengthRow.range.max = '2';
        grimeStrengthRow.range.step = '0.01';
        grimeStrengthRow.number.min = '0';
        grimeStrengthRow.number.max = '2';
        grimeStrengthRow.number.step = '0.01';
        grimeStrengthRow.range.value = String(wearBottom?.intensity ?? 0.0);
        grimeStrengthRow.number.value = formatFloat(wearBottom?.intensity ?? 0.0, 2);
        applyRangeRowMeta(grimeStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of bottom grime.',
                'Typical: 0.05–0.30.',
                'Too much: looks like a painted dark band.'
            )
        });
        grimeGroup.body.appendChild(grimeStrengthRow.row);
        
        const grimeWidthRow = makeRangeRow('Width');
        grimeWidthRow.range.min = '0';
        grimeWidthRow.range.max = '1';
        grimeWidthRow.range.step = '0.01';
        grimeWidthRow.number.min = '0';
        grimeWidthRow.number.max = '1';
        grimeWidthRow.number.step = '0.01';
        grimeWidthRow.range.value = String(wearBottom?.width ?? 0.5);
        grimeWidthRow.number.value = formatFloat(wearBottom?.width ?? 0.5, 2);
        applyRangeRowMeta(grimeWidthRow, {
            mustHave: true,
            tooltip: tip(
                'Height of the bottom grime band (0–1 relative).',
                'Typical: 0.10–0.40.',
                'Too much: grime climbs too high and looks unrealistic.'
            )
        });
        grimeGroup.body.appendChild(grimeWidthRow.row);
        
        const grimeScaleRow = makeRangeRow('Scale');
        grimeScaleRow.range.min = '0.01';
        grimeScaleRow.range.max = '20';
        grimeScaleRow.range.step = '0.01';
        grimeScaleRow.number.min = '0.01';
        grimeScaleRow.number.max = '20';
        grimeScaleRow.number.step = '0.01';
        grimeScaleRow.range.value = String(wearBottom?.scale ?? 1.0);
        grimeScaleRow.number.value = formatFloat(wearBottom?.scale ?? 1.0, 2);
        applyRangeRowMeta(grimeScaleRow, {
            tooltip: tip(
                'Noise scale for breaking up the grime band.',
                'Typical: 0.5–2.0.',
                'Too much: noisy, speckled dirt.'
            )
        });
        grimeGroup.body.appendChild(grimeScaleRow.row);
        
        const grimeHueRow = makeRangeRow('Hue shift (deg)');
        grimeHueRow.range.min = '-180';
        grimeHueRow.range.max = '180';
        grimeHueRow.range.step = '1';
        grimeHueRow.number.min = '-180';
        grimeHueRow.number.max = '180';
        grimeHueRow.number.step = '1';
        grimeHueRow.range.value = String(wearBottom?.hueDegrees ?? 0.0);
        grimeHueRow.number.value = String(Math.round(wearBottom?.hueDegrees ?? 0.0));
        applyRangeRowMeta(grimeHueRow, {
            tooltip: tip(
                'Hue shift applied to bottom grime.',
                'Typical: subtle (often 0).',
                'Too much: colored dirt band.'
            )
        });
        grimeGroup.body.appendChild(grimeHueRow.row);
        
        const grimeValueRow = makeRangeRow('Value');
        grimeValueRow.range.min = '-1';
        grimeValueRow.range.max = '1';
        grimeValueRow.range.step = '0.01';
        grimeValueRow.number.min = '-1';
        grimeValueRow.number.max = '1';
        grimeValueRow.number.step = '0.01';
        grimeValueRow.range.value = String(wearBottom?.value ?? 0.0);
        grimeValueRow.number.value = formatFloat(wearBottom?.value ?? 0.0, 2);
        applyRangeRowMeta(grimeValueRow, {
            tooltip: tip(
                'Value/brightness shift applied to bottom grime.',
                'Typical: slightly darker for dirt.',
                'Too much: heavy black band.'
            )
        });
        grimeGroup.body.appendChild(grimeValueRow.row);
        
        const grimeSaturationRow = makeRangeRow('Saturation');
        grimeSaturationRow.range.min = '-1';
        grimeSaturationRow.range.max = '1';
        grimeSaturationRow.range.step = '0.01';
        grimeSaturationRow.number.min = '-1';
        grimeSaturationRow.number.max = '1';
        grimeSaturationRow.number.step = '0.01';
        grimeSaturationRow.range.value = String(wearBottom?.saturation ?? 0.0);
        grimeSaturationRow.number.value = formatFloat(wearBottom?.saturation ?? 0.0, 2);
        applyRangeRowMeta(grimeSaturationRow, {
            tooltip: tip(
                'Saturation shift applied to bottom grime.',
                'Typical: small negative saturation for dirt.',
                'Too much: unnatural colored dirt.'
            )
        });
        grimeGroup.body.appendChild(grimeSaturationRow.row);
        
        const grimeRoughnessRow = makeRangeRow('Roughness');
            grimeRoughnessRow.range.min = '-1';
            grimeRoughnessRow.range.max = '1';
            grimeRoughnessRow.range.step = '0.01';
            grimeRoughnessRow.number.min = '-1';
            grimeRoughnessRow.number.max = '1';
            grimeRoughnessRow.number.step = '0.01';
            grimeRoughnessRow.range.value = String(wearBottom?.roughness ?? 0.0);
            grimeRoughnessRow.number.value = formatFloat(wearBottom?.roughness ?? 0.0, 2);
            applyRangeRowMeta(grimeRoughnessRow, {
            tooltip: tip(
                'Roughness shift applied to bottom grime.',
                'Typical: slightly rougher.',
                'Too much: noisy or chalky specular response.'
            )
        });
        grimeGroup.body.appendChild(grimeRoughnessRow.row);
        
        const grimeNormalRow = makeRangeRow('Normal');
        grimeNormalRow.range.min = '-1';
        grimeNormalRow.range.max = '1';
        grimeNormalRow.range.step = '0.01';
        grimeNormalRow.number.min = '-1';
        grimeNormalRow.number.max = '1';
        grimeNormalRow.number.step = '0.01';
        grimeNormalRow.range.value = String(wearBottom?.normal ?? 0.0);
        grimeNormalRow.number.value = formatFloat(wearBottom?.normal ?? 0.0, 2);
        applyRangeRowMeta(grimeNormalRow, {
            tooltip: tip(
                'Normal shift applied to bottom grime.',
                'Typical: 0.',
                'Too much: bumpy artifacts in the grime band.'
            )
        });
        grimeGroup.body.appendChild(grimeNormalRow.row);
        wallMatVarWeatherGroup.body.appendChild(grimeGroup.details);
        
        const wearTop = wallMatVarNormalized.wearTop ?? null;
        const dustGroup = makeDetailsSection('Top wear', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:wearTop` });
        applyTooltip(
            dustGroup.label,
            tip(
                'Top deposits and wear near the roofline/top of the wall.',
                'Good for subtle dust/soot accumulation and sun-faded areas.',
                'Too much: the whole wall top looks painted.'
            )
        );
        const dustToggle = makeToggleRow('Enable top wear');
        dustToggle.input.checked = !!wearTop?.enabled;
        dustToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(dustToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables top wear/deposits.',
                'Typical: enable with low Strength + moderate Width.',
                'Too much: a thick band that dominates the facade.'
            )
        });
        dustGroup.body.appendChild(dustToggle.toggle);
        const dustStrengthRow = makeRangeRow('Strength');
        dustStrengthRow.range.min = '0';
        dustStrengthRow.range.max = '2';
        dustStrengthRow.range.step = '0.01';
        dustStrengthRow.number.min = '0';
        dustStrengthRow.number.max = '2';
        dustStrengthRow.number.step = '0.01';
        dustStrengthRow.range.value = String(wearTop?.intensity ?? 0.0);
        dustStrengthRow.number.value = formatFloat(wearTop?.intensity ?? 0.0, 2);
        applyRangeRowMeta(dustStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of top wear/deposits.',
                'Typical: 0.05–0.25.',
                'Too much: looks like painted grime on the top.'
            )
        });
        dustGroup.body.appendChild(dustStrengthRow.row);
        
        const dustWidthRow = makeRangeRow('Width');
        dustWidthRow.range.min = '0';
        dustWidthRow.range.max = '1';
        dustWidthRow.range.step = '0.01';
        dustWidthRow.number.min = '0';
        dustWidthRow.number.max = '1';
        dustWidthRow.number.step = '0.01';
        dustWidthRow.range.value = String(wearTop?.width ?? 0.4);
        dustWidthRow.number.value = formatFloat(wearTop?.width ?? 0.4, 2);
        applyRangeRowMeta(dustWidthRow, {
            mustHave: true,
            tooltip: tip(
                'Height of the top wear band (0–1 relative).',
                'Typical: 0.10–0.45.',
                'Too much: top wear covers most of the wall.'
            )
        });
        dustGroup.body.appendChild(dustWidthRow.row);
        
        const dustScaleRow = makeRangeRow('Scale');
        dustScaleRow.range.min = '0.01';
        dustScaleRow.range.max = '20';
        dustScaleRow.range.step = '0.01';
        dustScaleRow.number.min = '0.01';
        dustScaleRow.number.max = '20';
        dustScaleRow.number.step = '0.01';
        dustScaleRow.range.value = String(wearTop?.scale ?? 1.0);
        dustScaleRow.number.value = formatFloat(wearTop?.scale ?? 1.0, 2);
        applyRangeRowMeta(dustScaleRow, {
            tooltip: tip(
                'Noise scale for breaking up the top band.',
                'Typical: 0.5–2.0.',
                'Too much: noisy speckling.'
            )
        });
        dustGroup.body.appendChild(dustScaleRow.row);
        
        const dustHueRow = makeRangeRow('Hue shift (deg)');
        dustHueRow.range.min = '-180';
        dustHueRow.range.max = '180';
        dustHueRow.range.step = '1';
        dustHueRow.number.min = '-180';
        dustHueRow.number.max = '180';
        dustHueRow.number.step = '1';
        dustHueRow.range.value = String(wearTop?.hueDegrees ?? 0.0);
        dustHueRow.number.value = String(Math.round(wearTop?.hueDegrees ?? 0.0));
        applyRangeRowMeta(dustHueRow, {
            tooltip: tip(
                'Hue shift applied to top wear.',
                'Typical: subtle.',
                'Too much: colored/painterly top band.'
            )
        });
        dustGroup.body.appendChild(dustHueRow.row);
        
        const dustValueRow = makeRangeRow('Value');
        dustValueRow.range.min = '-1';
        dustValueRow.range.max = '1';
        dustValueRow.range.step = '0.01';
        dustValueRow.number.min = '-1';
        dustValueRow.number.max = '1';
        dustValueRow.number.step = '0.01';
        dustValueRow.range.value = String(wearTop?.value ?? 0.0);
        dustValueRow.number.value = formatFloat(wearTop?.value ?? 0.0, 2);
        applyRangeRowMeta(dustValueRow, {
            tooltip: tip(
                'Value/brightness shift applied to top wear.',
                'Typical: small brightening for dust or darkening for soot.',
                'Too much: harsh contrast at the top.'
            )
        });
        dustGroup.body.appendChild(dustValueRow.row);
        
        const dustSaturationRow = makeRangeRow('Saturation');
        dustSaturationRow.range.min = '-1';
        dustSaturationRow.range.max = '1';
        dustSaturationRow.range.step = '0.01';
        dustSaturationRow.number.min = '-1';
        dustSaturationRow.number.max = '1';
        dustSaturationRow.number.step = '0.01';
        dustSaturationRow.range.value = String(wearTop?.saturation ?? 0.0);
        dustSaturationRow.number.value = formatFloat(wearTop?.saturation ?? 0.0, 2);
        applyRangeRowMeta(dustSaturationRow, {
            tooltip: tip(
                'Saturation shift applied to top wear.',
                'Typical: slightly desaturated for dust/soot.',
                'Too much: colored/painterly top band.'
            )
        });
        dustGroup.body.appendChild(dustSaturationRow.row);
        
        const dustRoughnessRow = makeRangeRow('Roughness');
        dustRoughnessRow.range.min = '-1';
        dustRoughnessRow.range.max = '1';
        dustRoughnessRow.range.step = '0.01';
        dustRoughnessRow.number.min = '-1';
        dustRoughnessRow.number.max = '1';
        dustRoughnessRow.number.step = '0.01';
        dustRoughnessRow.range.value = String(wearTop?.roughness ?? 0.0);
        dustRoughnessRow.number.value = formatFloat(wearTop?.roughness ?? 0.0, 2);
        applyRangeRowMeta(dustRoughnessRow, {
            tooltip: tip(
                'Roughness shift applied to top wear.',
                'Typical: slightly rougher for dusty deposits.',
                'Too much: sparkly/noisy specular response.'
            )
        });
        dustGroup.body.appendChild(dustRoughnessRow.row);
        
        const dustNormalRow = makeRangeRow('Normal');
        dustNormalRow.range.min = '-1';
        dustNormalRow.range.max = '1';
        dustNormalRow.range.step = '0.01';
        dustNormalRow.number.min = '-1';
        dustNormalRow.number.max = '1';
        dustNormalRow.number.step = '0.01';
        dustNormalRow.range.value = String(wearTop?.normal ?? 0.0);
        dustNormalRow.number.value = formatFloat(wearTop?.normal ?? 0.0, 2);
        applyRangeRowMeta(dustNormalRow, {
            tooltip: tip(
                'Normal shift applied to top wear.',
                'Typical: 0.',
                'Too much: bumpy artifacts in the top band.'
            )
        });
        dustGroup.body.appendChild(dustNormalRow.row);
        wallMatVarWeatherGroup.body.appendChild(dustGroup.details);
        
        const antiController = createMaterialVariationAntiTilingMiniController({
            allow,
            detailsOpenByKey: detailsOpenByKey,
            detailsKey: `${scopeKey}:layer:${layerId}:walls:matvar:anti`,
            parentEnabled: !!layer.materialVariation.enabled,
            normalizedAntiTiling: wallMatVarNormalized.antiTiling,
            targetMaterialVariation: layer.materialVariation,
            labels: { offsetU: 'Horizontal shift', offsetV: 'Vertical shift' },
            tooltips: {
                group: tip(
                    'Breaks up visible texture tiling by offset/rotation per cell.',
                    'Use when you can see repeating patterns.',
                    'Too much: UV distortion and “swimming” details.'
                ),
                enable: tip(
                    'Enables anti-tiling UV variation.',
                    'Typical: enable for materials that obviously repeat.',
                    'Too much: distortion that looks like warping.'
                ),
                strength: tip(
                    'How strong the anti-tiling UV shift/rotation is.',
                    'Typical: 0.3–0.9.',
                    'Too much: obvious distortion and blurred details.'
                ),
                cellSize: tip(
                    'Size of the anti-tiling cells in tile units.',
                    'Typical: 1–4.',
                    'Too much: very small sizes become noisy; very large sizes repeat again.'
                ),
                blendWidth: tip(
                    'Softness of transitions between anti-tiling cells.',
                    'Typical: 0.10–0.30.',
                    'Too much: blurry blending; too little: visible seams.'
                ),
                offsetV: tip(
                    'Per-cell vertical (V) UV jitter amount.',
                    'Typical: small values.',
                    'Too much: texture features misalign noticeably.'
                ),
                offsetU: tip(
                    'Per-cell horizontal (U) UV jitter amount.',
                    'Typical: small values.',
                    'Too much: texture features misalign noticeably.'
                ),
                rotation: tip(
                    'Per-cell UV rotation amount.',
                    'Typical: 5–25° for subtle breakup.',
                    'Too much: rotated details look obviously wrong.'
                ),
                quality: tip(
                    'Uses a higher-quality anti-tiling blend (slower).',
                    'Typical: off unless you see seams/artifacts.',
                    'Too much: unnecessary cost when not needed.'
                )
            },
            onChange
        });
        antiController.mount(wallMatVarGroup.body, { before: wallMatVarMacroGroup.details });
        registerMiniController(antiController);
        
         const brickCfg = wallMatVarNormalized.brick ?? null;
        
         const stairGroup = makeDetailsSection('Stair shift', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:stair` });
         applyTooltip(
             stairGroup.label,
             tip(
                'Brick-style UV staggering / bond shifting.',
                'Useful for brick/bonded patterns to reduce obvious repetition.',
                'Too much: misaligned mortar/brick pattern.'
            )
        );
        const stairToggle = makeToggleRow('Enable stair shift');
        stairToggle.input.checked = !!wallMatVarNormalized.stairShift.enabled;
        stairToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(stairToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables per-row/step UV shifting.',
                'Typical: enable for brick-like walls.',
                'Too much: makes the pattern look broken.'
            )
        });
        stairGroup.body.appendChild(stairToggle.toggle);
        
        const stairStrengthRow = makeRangeRow('Strength');
        stairStrengthRow.range.min = '0';
        stairStrengthRow.range.max = '1';
        stairStrengthRow.range.step = '0.01';
        stairStrengthRow.number.min = '0';
        stairStrengthRow.number.max = '1';
        stairStrengthRow.number.step = '0.01';
        stairStrengthRow.range.value = String(wallMatVarNormalized.stairShift.strength);
        stairStrengthRow.number.value = formatFloat(wallMatVarNormalized.stairShift.strength, 2);
        applyRangeRowMeta(stairStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of the stair shift effect.',
                'Typical: 0.2–1.0 for subtle staggering.',
                'Too much: severe pattern discontinuities.'
            )
        });
        stairGroup.body.appendChild(stairStrengthRow.row);
        
        const stairStepRow = makeRangeRow('Step size (tiles)');
        stairStepRow.range.min = '0.01';
        stairStepRow.range.max = '20';
        stairStepRow.range.step = '0.01';
        stairStepRow.number.min = '0.01';
        stairStepRow.number.max = '20';
        stairStepRow.number.step = '0.01';
        stairStepRow.range.value = String(wallMatVarNormalized.stairShift.stepSize);
        stairStepRow.number.value = formatFloat(wallMatVarNormalized.stairShift.stepSize, 2);
        applyRangeRowMeta(stairStepRow, {
            tooltip: tip(
                'How often the shift increments (in tile units).',
                'Typical: 1 for per-row staggering.',
                'Too much: large values make the shift rare and less useful.'
            )
        });
        stairGroup.body.appendChild(stairStepRow.row);
        
        const stairShiftRow = makeRangeRow('Shift per step');
        stairShiftRow.range.min = '-1';
        stairShiftRow.range.max = '1';
        stairShiftRow.range.step = '0.01';
        stairShiftRow.number.min = '-1';
        stairShiftRow.number.max = '1';
        stairShiftRow.number.step = '0.01';
        stairShiftRow.range.value = String(wallMatVarNormalized.stairShift.shift);
        stairShiftRow.number.value = formatFloat(wallMatVarNormalized.stairShift.shift, 2);
        applyRangeRowMeta(stairShiftRow, {
            mustHave: true,
            tooltip: tip(
                'Shift amount applied per step (in UV tile units).',
                'Typical brick bond: small offsets like 0.4 / 0.8 patterns.',
                'Too much: bricks/mortar stop lining up.'
            )
        });
        stairGroup.body.appendChild(stairShiftRow.row);
        
        const stairModeRow = document.createElement('div');
        stairModeRow.className = 'building-fab-row building-fab-row-wide';
        const stairModeLabel = document.createElement('div');
        stairModeLabel.className = 'building-fab-row-label';
        stairModeLabel.textContent = 'Mode';
         const stairModeSelect = document.createElement('select');
         stairModeSelect.className = 'building-fab-select';
         for (const v of ['stair', 'alternate', 'random', 'pattern3']) {
             const opt = document.createElement('option');
             opt.value = v;
             opt.textContent =
                 v === 'random'
                     ? 'Random (per step)'
                     : (v === 'alternate'
                         ? 'Alternate (0 / shift)'
                         : (v === 'pattern3' ? 'Bond 3-step (0 / A / B)' : 'Stair (shift += stepIndex)'));
             stairModeSelect.appendChild(opt);
         }
         stairModeSelect.value = wallMatVarNormalized.stairShift.mode || 'stair';
        applySelectRowMeta(
            { label: stairModeLabel, select: stairModeSelect },
            {
                 tooltip: tip(
                     'How the shift evolves per step.',
                     'Typical: Stair/Alternate for simple bonds, Bond 3-step for 0/A/B patterns, Random for noise.',
                     'Too much: Random can look chaotic for brick bonds.'
                 )
             }
         );
         stairModeRow.appendChild(stairModeLabel);
         stairModeRow.appendChild(stairModeSelect);
         stairGroup.body.appendChild(stairModeRow);
        
         const stairPatternARow = makeRangeRow('Pattern A');
         stairPatternARow.range.min = '-1';
         stairPatternARow.range.max = '1';
         stairPatternARow.range.step = '0.01';
         stairPatternARow.number.min = '-1';
         stairPatternARow.number.max = '1';
         stairPatternARow.number.step = '0.01';
         stairPatternARow.range.value = String(wallMatVarNormalized.stairShift.patternA ?? 0.4);
         stairPatternARow.number.value = formatFloat(wallMatVarNormalized.stairShift.patternA ?? 0.4, 2);
         applyRangeRowMeta(stairPatternARow, {
             tooltip: tip(
                 'Multiplier used for the 2nd step when Mode is Bond 3-step.',
                 'Typical: 0.4.',
                 'Too much: bricks stop lining up.'
             )
         });
         stairGroup.body.appendChild(stairPatternARow.row);
        
         const stairPatternBRow = makeRangeRow('Pattern B');
         stairPatternBRow.range.min = '-1';
         stairPatternBRow.range.max = '1';
         stairPatternBRow.range.step = '0.01';
         stairPatternBRow.number.min = '-1';
         stairPatternBRow.number.max = '1';
         stairPatternBRow.number.step = '0.01';
         stairPatternBRow.range.value = String(wallMatVarNormalized.stairShift.patternB ?? 0.8);
         stairPatternBRow.number.value = formatFloat(wallMatVarNormalized.stairShift.patternB ?? 0.8, 2);
         applyRangeRowMeta(stairPatternBRow, {
             tooltip: tip(
                 'Multiplier used for the 3rd step when Mode is Bond 3-step.',
                 'Typical: 0.8.',
                 'Too much: bricks stop lining up.'
             )
         });
         stairGroup.body.appendChild(stairPatternBRow.row);
        
         const stairBlendRow = makeRangeRow('Blend width');
         stairBlendRow.range.min = '0';
        stairBlendRow.range.max = '0.49';
        stairBlendRow.range.step = '0.01';
        stairBlendRow.number.min = '0';
        stairBlendRow.number.max = '0.49';
        stairBlendRow.number.step = '0.01';
        stairBlendRow.range.value = String(wallMatVarNormalized.stairShift.blendWidth ?? 0.0);
        stairBlendRow.number.value = formatFloat(wallMatVarNormalized.stairShift.blendWidth ?? 0.0, 2);
        applyRangeRowMeta(stairBlendRow, {
            tooltip: tip(
                'Softness of blending between steps.',
                'Typical: 0–0.2.',
                'Too much: blurs the bond pattern.'
            )
        });
        stairGroup.body.appendChild(stairBlendRow.row);
        
        const stairDirRow = document.createElement('div');
        stairDirRow.className = 'building-fab-row building-fab-row-wide';
        const stairDirLabel = document.createElement('div');
        stairDirLabel.className = 'building-fab-row-label';
        stairDirLabel.textContent = 'Direction';
        const stairDirSelect = document.createElement('select');
        stairDirSelect.className = 'building-fab-select';
        for (const v of ['horizontal', 'vertical']) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v === 'vertical' ? 'Vertical (shift V per U step)' : 'Horizontal (shift U per V step)';
            stairDirSelect.appendChild(opt);
        }
        stairDirSelect.value = wallMatVarNormalized.stairShift.direction;
        applySelectRowMeta(
            { label: stairDirLabel, select: stairDirSelect },
            {
                tooltip: tip(
                    'Which axis is shifted per step.',
                    'Typical: Horizontal for brick rows.',
                    'Too much: wrong direction makes the pattern feel off.'
                )
            }
        );
         stairDirRow.appendChild(stairDirLabel);
         stairDirRow.appendChild(stairDirSelect);
         stairGroup.body.appendChild(stairDirRow);
        
         wallMatVarBrickGroup.body.appendChild(stairGroup.details);
        
         const perBrick = brickCfg?.perBrick ?? null;
         const perBrickGroup = makeDetailsSection('Per-brick variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:perBrick` });
         applyTooltip(
             perBrickGroup.label,
             tip(
                 'Subtle per-brick breakup (hue/value/roughness per brick).',
                 'Use low Strength and keep shifts small.',
                 'Too much: noisy, speckled brickwork.'
             )
         );
         const perBrickToggle = makeToggleRow('Enable per-brick variation');
         perBrickToggle.input.checked = !!perBrick?.enabled;
         perBrickToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
         applyToggleRowMeta(perBrickToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables per-brick variation.',
                 'Typical: enabled for brick materials, low strength.',
                 'Too much: bricks look randomly colored.'
             )
         });
         perBrickGroup.body.appendChild(perBrickToggle.toggle);
        
            const perBrickLayout = perBrick?.layout ?? null;
            const perBrickLayoutGroup = makeDetailsSection('Layout', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:perBrick:layout` });
            applyTooltip(
                perBrickLayoutGroup.label,
                tip(
                    'Brick grid layout used for per-brick variation only.',
                    'Use this to de-sync sections without affecting mortar.',
                    'Keep values close to your base texture brick scale.'
                )
            );
        
            const perBrickBricksPerTileXRow = makeRangeRow('Bricks per tile X');
            perBrickBricksPerTileXRow.range.min = '0.25';
            perBrickBricksPerTileXRow.range.max = '200';
            perBrickBricksPerTileXRow.range.step = '0.25';
            perBrickBricksPerTileXRow.number.min = '0.25';
            perBrickBricksPerTileXRow.number.max = '200';
            perBrickBricksPerTileXRow.number.step = '0.25';
            perBrickBricksPerTileXRow.range.value = String(perBrickLayout?.bricksPerTileX ?? 6.0);
            perBrickBricksPerTileXRow.number.value = formatFloat(perBrickLayout?.bricksPerTileX ?? 6.0, 2);
            applyRangeRowMeta(perBrickBricksPerTileXRow, {
                tooltip: tip(
                    'Brick count across one UV tile (U/X) for per-brick variation.',
                    'Typical: 5–10 depending on texture.',
                    'Too much: very high values become noisy.'
                )
            });
            perBrickLayoutGroup.body.appendChild(perBrickBricksPerTileXRow.row);
        
            const perBrickBricksPerTileYRow = makeRangeRow('Bricks per tile Y');
            perBrickBricksPerTileYRow.range.min = '0.25';
            perBrickBricksPerTileYRow.range.max = '200';
            perBrickBricksPerTileYRow.range.step = '0.25';
            perBrickBricksPerTileYRow.number.min = '0.25';
            perBrickBricksPerTileYRow.number.max = '200';
            perBrickBricksPerTileYRow.number.step = '0.25';
            perBrickBricksPerTileYRow.range.value = String(perBrickLayout?.bricksPerTileY ?? 3.0);
            perBrickBricksPerTileYRow.number.value = formatFloat(perBrickLayout?.bricksPerTileY ?? 3.0, 2);
            applyRangeRowMeta(perBrickBricksPerTileYRow, {
                tooltip: tip(
                    'Brick count across one UV tile (V/Y) for per-brick variation.',
                    'Typical: 2–6 depending on texture.',
                    'Too much: wrong values misalign the grid.'
                )
            });
            perBrickLayoutGroup.body.appendChild(perBrickBricksPerTileYRow.row);
        
            const perBrickMortarWidthRow = makeRangeRow('Mortar width');
            perBrickMortarWidthRow.range.min = '0';
            perBrickMortarWidthRow.range.max = '0.49';
            perBrickMortarWidthRow.range.step = '0.01';
            perBrickMortarWidthRow.number.min = '0';
            perBrickMortarWidthRow.number.max = '0.49';
            perBrickMortarWidthRow.number.step = '0.01';
            perBrickMortarWidthRow.range.value = String(perBrickLayout?.mortarWidth ?? 0.08);
            perBrickMortarWidthRow.number.value = formatFloat(perBrickLayout?.mortarWidth ?? 0.08, 2);
            applyRangeRowMeta(perBrickMortarWidthRow, {
                tooltip: tip(
                    'Thickness of mortar lines (as a fraction of a brick cell) for per-brick masking.',
                    'Typical: 0.04–0.12.',
                    'Too much: bricks get masked away.'
                )
            });
            perBrickLayoutGroup.body.appendChild(perBrickMortarWidthRow.row);
        
            const perBrickOffsetXRow = makeRangeRow('Layout offset X (cells)');
            perBrickOffsetXRow.range.min = '-10';
            perBrickOffsetXRow.range.max = '10';
            perBrickOffsetXRow.range.step = '0.01';
            perBrickOffsetXRow.number.min = '-10';
            perBrickOffsetXRow.number.max = '10';
            perBrickOffsetXRow.number.step = '0.01';
            perBrickOffsetXRow.range.value = String(perBrickLayout?.offsetX ?? 0.0);
            perBrickOffsetXRow.number.value = formatFloat(perBrickLayout?.offsetX ?? 0.0, 2);
            applyRangeRowMeta(perBrickOffsetXRow, {
                tooltip: tip(
                    'Shifts the per-brick cell grid horizontally (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            perBrickLayoutGroup.body.appendChild(perBrickOffsetXRow.row);
        
            const perBrickOffsetYRow = makeRangeRow('Layout offset Y (cells)');
            perBrickOffsetYRow.range.min = '-10';
            perBrickOffsetYRow.range.max = '10';
            perBrickOffsetYRow.range.step = '0.01';
            perBrickOffsetYRow.number.min = '-10';
            perBrickOffsetYRow.number.max = '10';
            perBrickOffsetYRow.number.step = '0.01';
            perBrickOffsetYRow.range.value = String(perBrickLayout?.offsetY ?? 0.0);
            perBrickOffsetYRow.number.value = formatFloat(perBrickLayout?.offsetY ?? 0.0, 2);
            applyRangeRowMeta(perBrickOffsetYRow, {
                tooltip: tip(
                    'Shifts the per-brick cell grid vertically (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            perBrickLayoutGroup.body.appendChild(perBrickOffsetYRow.row);
        
            perBrickGroup.body.appendChild(perBrickLayoutGroup.details);
        
         const perBrickStrengthRow = makeRangeRow('Strength');
         perBrickStrengthRow.range.min = '0';
         perBrickStrengthRow.range.max = '2';
         perBrickStrengthRow.range.step = '0.01';
         perBrickStrengthRow.number.min = '0';
         perBrickStrengthRow.number.max = '2';
         perBrickStrengthRow.number.step = '0.01';
         perBrickStrengthRow.range.value = String(perBrick?.intensity ?? 0.0);
         perBrickStrengthRow.number.value = formatFloat(perBrick?.intensity ?? 0.0, 2);
         applyRangeRowMeta(perBrickStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Overall strength of per-brick variation.',
                 'Typical: 0.05–0.40.',
                 'Too much: noisy speckled bricks.'
             )
         });
         perBrickGroup.body.appendChild(perBrickStrengthRow.row);
        
         const perBrickHueRow = makeRangeRow('Hue shift (deg)');
         perBrickHueRow.range.min = '-180';
         perBrickHueRow.range.max = '180';
         perBrickHueRow.range.step = '1';
         perBrickHueRow.number.min = '-180';
         perBrickHueRow.number.max = '180';
         perBrickHueRow.number.step = '1';
         perBrickHueRow.range.value = String(perBrick?.hueDegrees ?? 0.0);
         perBrickHueRow.number.value = String(Math.round(perBrick?.hueDegrees ?? 0.0));
         applyRangeRowMeta(perBrickHueRow, {
             tooltip: tip(
                 'Hue drift per brick.',
                 'Typical: ±5–20°.',
                 'Too much: rainbow bricks.'
             )
         });
         perBrickGroup.body.appendChild(perBrickHueRow.row);
        
         const perBrickValueRow = makeRangeRow('Value');
         perBrickValueRow.range.min = '-1';
         perBrickValueRow.range.max = '1';
         perBrickValueRow.range.step = '0.01';
         perBrickValueRow.number.min = '-1';
         perBrickValueRow.number.max = '1';
         perBrickValueRow.number.step = '0.01';
         perBrickValueRow.range.value = String(perBrick?.value ?? 0.0);
         perBrickValueRow.number.value = formatFloat(perBrick?.value ?? 0.0, 2);
         applyRangeRowMeta(perBrickValueRow, {
             tooltip: tip(
                 'Brightness variation per brick.',
                 'Typical: small.',
                 'Too much: patchy, noisy bricks.'
             )
         });
         perBrickGroup.body.appendChild(perBrickValueRow.row);
        
         const perBrickSaturationRow = makeRangeRow('Saturation');
         perBrickSaturationRow.range.min = '-1';
         perBrickSaturationRow.range.max = '1';
         perBrickSaturationRow.range.step = '0.01';
         perBrickSaturationRow.number.min = '-1';
         perBrickSaturationRow.number.max = '1';
         perBrickSaturationRow.number.step = '0.01';
         perBrickSaturationRow.range.value = String(perBrick?.saturation ?? 0.0);
         perBrickSaturationRow.number.value = formatFloat(perBrick?.saturation ?? 0.0, 2);
         applyRangeRowMeta(perBrickSaturationRow, {
             tooltip: tip(
                 'Saturation variation per brick.',
                 'Typical: small.',
                 'Too much: colored brick noise.'
             )
         });
         perBrickGroup.body.appendChild(perBrickSaturationRow.row);
        
         const perBrickRoughnessRow = makeRangeRow('Roughness');
         perBrickRoughnessRow.range.min = '-1';
         perBrickRoughnessRow.range.max = '1';
         perBrickRoughnessRow.range.step = '0.01';
         perBrickRoughnessRow.number.min = '-1';
         perBrickRoughnessRow.number.max = '1';
         perBrickRoughnessRow.number.step = '0.01';
         perBrickRoughnessRow.range.value = String(perBrick?.roughness ?? 0.0);
         perBrickRoughnessRow.number.value = formatFloat(perBrick?.roughness ?? 0.0, 2);
         applyRangeRowMeta(perBrickRoughnessRow, {
             tooltip: tip(
                 'Roughness variation per brick.',
                 'Typical: subtle.',
                 'Too much: sparkly/noisy highlights.'
             )
         });
         perBrickGroup.body.appendChild(perBrickRoughnessRow.row);
        
         const perBrickNormalRow = makeRangeRow('Normal');
         perBrickNormalRow.range.min = '-1';
         perBrickNormalRow.range.max = '1';
         perBrickNormalRow.range.step = '0.01';
         perBrickNormalRow.number.min = '-1';
         perBrickNormalRow.number.max = '1';
         perBrickNormalRow.number.step = '0.01';
         perBrickNormalRow.range.value = String(perBrick?.normal ?? 0.0);
         perBrickNormalRow.number.value = formatFloat(perBrick?.normal ?? 0.0, 2);
         applyRangeRowMeta(perBrickNormalRow, {
             tooltip: tip(
                 'Optional normal response variation per brick.',
                 'Typical: 0.',
                 'Too much: bumpy noisy shading.'
             )
         });
         perBrickGroup.body.appendChild(perBrickNormalRow.row);
         wallMatVarBrickGroup.body.appendChild(perBrickGroup.details);
        
         const mortar = brickCfg?.mortar ?? null;
         const mortarGroup = makeDetailsSection('Mortar variation', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:mortar` });
         applyTooltip(
             mortarGroup.label,
             tip(
                 'Separate-ish look for mortar lines (value/roughness shifts in mortar).',
                 'Great for dusty mortar and grime-in-grooves.',
                 'Too much: mortar becomes a grid overlay.'
             )
         );
         const mortarToggle = makeToggleRow('Enable mortar variation');
         mortarToggle.input.checked = !!mortar?.enabled;
         mortarToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
         applyToggleRowMeta(mortarToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables mortar-line variation.',
                 'Typical: enabled for brick materials.',
                 'Too much: mortar reads as dark/bright outlines everywhere.'
             )
         });
         mortarGroup.body.appendChild(mortarToggle.toggle);
        
            const mortarLayout = mortar?.layout ?? null;
            const mortarLayoutGroup = makeDetailsSection('Layout', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:mortar:layout` });
            applyTooltip(
                mortarLayoutGroup.label,
                tip(
                    'Brick grid layout used for mortar variation only.',
                    'Lets mortar lines vary without affecting per-brick variation.',
                    'Keep values close to your base texture brick scale.'
                )
            );
        
            const mortarBricksPerTileXRow = makeRangeRow('Bricks per tile X');
            mortarBricksPerTileXRow.range.min = '0.25';
            mortarBricksPerTileXRow.range.max = '200';
            mortarBricksPerTileXRow.range.step = '0.25';
            mortarBricksPerTileXRow.number.min = '0.25';
            mortarBricksPerTileXRow.number.max = '200';
            mortarBricksPerTileXRow.number.step = '0.25';
            mortarBricksPerTileXRow.range.value = String(mortarLayout?.bricksPerTileX ?? 6.0);
            mortarBricksPerTileXRow.number.value = formatFloat(mortarLayout?.bricksPerTileX ?? 6.0, 2);
            applyRangeRowMeta(mortarBricksPerTileXRow, {
                tooltip: tip(
                    'Brick count across one UV tile (U/X) for mortar variation.',
                    'Typical: 5–10 depending on texture.',
                    'Too much: very high values become noisy.'
                )
            });
            mortarLayoutGroup.body.appendChild(mortarBricksPerTileXRow.row);
        
            const mortarBricksPerTileYRow = makeRangeRow('Bricks per tile Y');
            mortarBricksPerTileYRow.range.min = '0.25';
            mortarBricksPerTileYRow.range.max = '200';
            mortarBricksPerTileYRow.range.step = '0.25';
            mortarBricksPerTileYRow.number.min = '0.25';
            mortarBricksPerTileYRow.number.max = '200';
            mortarBricksPerTileYRow.number.step = '0.25';
            mortarBricksPerTileYRow.range.value = String(mortarLayout?.bricksPerTileY ?? 3.0);
            mortarBricksPerTileYRow.number.value = formatFloat(mortarLayout?.bricksPerTileY ?? 3.0, 2);
            applyRangeRowMeta(mortarBricksPerTileYRow, {
                tooltip: tip(
                    'Brick count across one UV tile (V/Y) for mortar variation.',
                    'Typical: 2–6 depending on texture.',
                    'Too much: wrong values misalign the grid.'
                )
            });
            mortarLayoutGroup.body.appendChild(mortarBricksPerTileYRow.row);
        
            const mortarMortarWidthRow = makeRangeRow('Mortar width');
            mortarMortarWidthRow.range.min = '0';
            mortarMortarWidthRow.range.max = '0.49';
            mortarMortarWidthRow.range.step = '0.01';
            mortarMortarWidthRow.number.min = '0';
            mortarMortarWidthRow.number.max = '0.49';
            mortarMortarWidthRow.number.step = '0.01';
            mortarMortarWidthRow.range.value = String(mortarLayout?.mortarWidth ?? 0.08);
            mortarMortarWidthRow.number.value = formatFloat(mortarLayout?.mortarWidth ?? 0.08, 2);
            applyRangeRowMeta(mortarMortarWidthRow, {
                tooltip: tip(
                    'Thickness of mortar lines (as a fraction of a brick cell) for mortar variation.',
                    'Typical: 0.04–0.12.',
                    'Too much: mortar dominates and bricks disappear.'
                )
            });
            mortarLayoutGroup.body.appendChild(mortarMortarWidthRow.row);
        
            const mortarOffsetXRow = makeRangeRow('Layout offset X (cells)');
            mortarOffsetXRow.range.min = '-10';
            mortarOffsetXRow.range.max = '10';
            mortarOffsetXRow.range.step = '0.01';
            mortarOffsetXRow.number.min = '-10';
            mortarOffsetXRow.number.max = '10';
            mortarOffsetXRow.number.step = '0.01';
            mortarOffsetXRow.range.value = String(mortarLayout?.offsetX ?? 0.0);
            mortarOffsetXRow.number.value = formatFloat(mortarLayout?.offsetX ?? 0.0, 2);
            applyRangeRowMeta(mortarOffsetXRow, {
                tooltip: tip(
                    'Shifts the mortar cell grid horizontally (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            mortarLayoutGroup.body.appendChild(mortarOffsetXRow.row);
        
            const mortarOffsetYRow = makeRangeRow('Layout offset Y (cells)');
            mortarOffsetYRow.range.min = '-10';
            mortarOffsetYRow.range.max = '10';
            mortarOffsetYRow.range.step = '0.01';
            mortarOffsetYRow.number.min = '-10';
            mortarOffsetYRow.number.max = '10';
            mortarOffsetYRow.number.step = '0.01';
            mortarOffsetYRow.range.value = String(mortarLayout?.offsetY ?? 0.0);
            mortarOffsetYRow.number.value = formatFloat(mortarLayout?.offsetY ?? 0.0, 2);
            applyRangeRowMeta(mortarOffsetYRow, {
                tooltip: tip(
                    'Shifts the mortar cell grid vertically (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            mortarLayoutGroup.body.appendChild(mortarOffsetYRow.row);
        
            mortarGroup.body.appendChild(mortarLayoutGroup.details);
        
         const mortarStrengthRow = makeRangeRow('Strength');
         mortarStrengthRow.range.min = '0';
         mortarStrengthRow.range.max = '2';
         mortarStrengthRow.range.step = '0.01';
         mortarStrengthRow.number.min = '0';
         mortarStrengthRow.number.max = '2';
         mortarStrengthRow.number.step = '0.01';
         mortarStrengthRow.range.value = String(mortar?.intensity ?? 0.0);
         mortarStrengthRow.number.value = formatFloat(mortar?.intensity ?? 0.0, 2);
         applyRangeRowMeta(mortarStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Overall strength of mortar variation.',
                 'Typical: 0.05–0.50.',
                 'Too much: mortar dominates the look.'
             )
         });
         mortarGroup.body.appendChild(mortarStrengthRow.row);
        
         const mortarHueRow = makeRangeRow('Hue shift (deg)');
         mortarHueRow.range.min = '-180';
         mortarHueRow.range.max = '180';
         mortarHueRow.range.step = '1';
         mortarHueRow.number.min = '-180';
         mortarHueRow.number.max = '180';
         mortarHueRow.number.step = '1';
         mortarHueRow.range.value = String(mortar?.hueDegrees ?? 0.0);
         mortarHueRow.number.value = String(Math.round(mortar?.hueDegrees ?? 0.0));
         applyRangeRowMeta(mortarHueRow, {
             tooltip: tip(
                 'Hue shift in mortar lines.',
                 'Typical: subtle.',
                 'Too much: colored mortar grid.'
             )
         });
         mortarGroup.body.appendChild(mortarHueRow.row);
        
         const mortarValueRow = makeRangeRow('Value');
         mortarValueRow.range.min = '-1';
         mortarValueRow.range.max = '1';
         mortarValueRow.range.step = '0.01';
         mortarValueRow.number.min = '-1';
         mortarValueRow.number.max = '1';
         mortarValueRow.number.step = '0.01';
         mortarValueRow.range.value = String(mortar?.value ?? 0.0);
         mortarValueRow.number.value = formatFloat(mortar?.value ?? 0.0, 2);
         applyRangeRowMeta(mortarValueRow, {
             tooltip: tip(
                 'Brightness shift in mortar lines.',
                 'Typical: slightly darker or lighter.',
                 'Too much: high-contrast grid.'
             )
         });
         mortarGroup.body.appendChild(mortarValueRow.row);
        
         const mortarSaturationRow = makeRangeRow('Saturation');
         mortarSaturationRow.range.min = '-1';
         mortarSaturationRow.range.max = '1';
         mortarSaturationRow.range.step = '0.01';
         mortarSaturationRow.number.min = '-1';
         mortarSaturationRow.number.max = '1';
         mortarSaturationRow.number.step = '0.01';
         mortarSaturationRow.range.value = String(mortar?.saturation ?? 0.0);
         mortarSaturationRow.number.value = formatFloat(mortar?.saturation ?? 0.0, 2);
         applyRangeRowMeta(mortarSaturationRow, {
             tooltip: tip(
                 'Saturation shift in mortar lines.',
                 'Typical: slight desaturation.',
                 'Too much: colored outlines.'
             )
         });
         mortarGroup.body.appendChild(mortarSaturationRow.row);
        
         const mortarRoughnessRow = makeRangeRow('Roughness');
         mortarRoughnessRow.range.min = '-1';
         mortarRoughnessRow.range.max = '1';
         mortarRoughnessRow.range.step = '0.01';
         mortarRoughnessRow.number.min = '-1';
         mortarRoughnessRow.number.max = '1';
         mortarRoughnessRow.number.step = '0.01';
         mortarRoughnessRow.range.value = String(mortar?.roughness ?? 0.0);
         mortarRoughnessRow.number.value = formatFloat(mortar?.roughness ?? 0.0, 2);
         applyRangeRowMeta(mortarRoughnessRow, {
             tooltip: tip(
                 'Roughness shift in mortar lines.',
                 'Typical: slightly rougher.',
                 'Too much: noisy highlights in a grid.'
             )
         });
         mortarGroup.body.appendChild(mortarRoughnessRow.row);
        
         const mortarNormalRow = makeRangeRow('Normal');
         mortarNormalRow.range.min = '-1';
         mortarNormalRow.range.max = '1';
         mortarNormalRow.range.step = '0.01';
         mortarNormalRow.number.min = '-1';
         mortarNormalRow.number.max = '1';
         mortarNormalRow.number.step = '0.01';
         mortarNormalRow.range.value = String(mortar?.normal ?? 0.0);
         mortarNormalRow.number.value = formatFloat(mortar?.normal ?? 0.0, 2);
         applyRangeRowMeta(mortarNormalRow, {
             tooltip: tip(
                 'Optional normal response shift in mortar lines.',
                 'Typical: 0.',
                 'Too much: bumpy grid artifacts.'
             )
         });
         mortarGroup.body.appendChild(mortarNormalRow.row);
         wallMatVarBrickGroup.body.appendChild(mortarGroup.details);
        
         const macro1 = wallMatVarNormalized.macroLayers?.[1] ?? null;
         const detailGroup = makeDetailsSection('Macro layer 2', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro1` });
         applyTooltip(
            detailGroup.label,
            tip(
                'Macro layer 2 (Macro B): secondary breakup at a different scale.',
                'Use after Macro A for richer, less repetitive results.',
                'Too much: busy, noisy surfaces.'
            )
        );
        const detailToggle = makeToggleRow('Enable macro layer 2');
        detailToggle.input.checked = !!macro1?.enabled;
        detailToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(detailToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables Macro B (secondary breakup).',
                'Typical: enable if Macro A is not enough.',
                'Too much: stacked breakup becomes noisy.'
            )
        });
        detailGroup.body.appendChild(detailToggle.toggle);
        const detailStrengthRow = makeRangeRow('Intensity');
        detailStrengthRow.range.min = '0';
        detailStrengthRow.range.max = '2';
        detailStrengthRow.range.step = '0.01';
        detailStrengthRow.number.min = '0';
        detailStrengthRow.number.max = '2';
        detailStrengthRow.number.step = '0.01';
        detailStrengthRow.range.value = String(macro1?.intensity ?? 0.0);
        detailStrengthRow.number.value = formatFloat(macro1?.intensity ?? 0.0, 2);
        applyRangeRowMeta(detailStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of Macro B.',
                'Typical: 0.1–0.8.',
                'Too much: obvious noisy patterning.'
            )
        });
        detailGroup.body.appendChild(detailStrengthRow.row);
        
        const detailScaleRow = makeRangeRow('Scale');
        detailScaleRow.range.min = '0.01';
        detailScaleRow.range.max = '20';
        detailScaleRow.range.step = '0.01';
        detailScaleRow.number.min = '0.01';
        detailScaleRow.number.max = '20';
        detailScaleRow.number.step = '0.01';
        detailScaleRow.range.value = String(macro1?.scale ?? 1.0);
        detailScaleRow.number.value = formatFloat(macro1?.scale ?? 1.0, 2);
        applyRangeRowMeta(detailScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Frequency of Macro B (higher = smaller features).',
                'Typical: 1–10 depending on your base tile size.',
                'Too much: becomes micro-noise.'
            )
        });
        detailGroup.body.appendChild(detailScaleRow.row);
        
        const detailHueRow = makeRangeRow('Hue shift (deg)');
        detailHueRow.range.min = '-180';
        detailHueRow.range.max = '180';
        detailHueRow.range.step = '1';
        detailHueRow.number.min = '-180';
        detailHueRow.number.max = '180';
        detailHueRow.number.step = '1';
        detailHueRow.range.value = String(macro1?.hueDegrees ?? 0.0);
        detailHueRow.number.value = String(Math.round(macro1?.hueDegrees ?? 0.0));
        applyRangeRowMeta(detailHueRow, {
            tooltip: tip(
                'Hue shift for Macro B.',
                'Typical: subtle.',
                'Too much: obvious colored patches.'
            )
        });
        detailGroup.body.appendChild(detailHueRow.row);
        
        const detailValueRow = makeRangeRow('Value');
        detailValueRow.range.min = '-1';
        detailValueRow.range.max = '1';
        detailValueRow.range.step = '0.01';
        detailValueRow.number.min = '-1';
        detailValueRow.number.max = '1';
        detailValueRow.number.step = '0.01';
        detailValueRow.range.value = String(macro1?.value ?? 0.0);
        detailValueRow.number.value = formatFloat(macro1?.value ?? 0.0, 2);
        applyRangeRowMeta(detailValueRow, {
            tooltip: tip(
                'Value/brightness shift for Macro B.',
                'Typical: small.',
                'Too much: harsh patchiness.'
            )
        });
        detailGroup.body.appendChild(detailValueRow.row);
        
        const detailSaturationRow = makeRangeRow('Saturation');
        detailSaturationRow.range.min = '-1';
        detailSaturationRow.range.max = '1';
        detailSaturationRow.range.step = '0.01';
        detailSaturationRow.number.min = '-1';
        detailSaturationRow.number.max = '1';
        detailSaturationRow.number.step = '0.01';
        detailSaturationRow.range.value = String(macro1?.saturation ?? 0.0);
        detailSaturationRow.number.value = formatFloat(macro1?.saturation ?? 0.0, 2);
        applyRangeRowMeta(detailSaturationRow, {
            tooltip: tip(
                'Saturation shift for Macro B.',
                'Typical: subtle.',
                'Too much: obvious saturation swings.'
            )
        });
        detailGroup.body.appendChild(detailSaturationRow.row);
        
        const detailRoughnessRow = makeRangeRow('Roughness');
        detailRoughnessRow.range.min = '-1';
        detailRoughnessRow.range.max = '1';
        detailRoughnessRow.range.step = '0.01';
        detailRoughnessRow.number.min = '-1';
        detailRoughnessRow.number.max = '1';
        detailRoughnessRow.number.step = '0.01';
        detailRoughnessRow.range.value = String(macro1?.roughness ?? 0.0);
        detailRoughnessRow.number.value = formatFloat(macro1?.roughness ?? 0.0, 2);
        applyRangeRowMeta(detailRoughnessRow, {
            tooltip: tip(
                'Roughness shift for Macro B.',
                'Typical: subtle.',
                'Too much: noisy specular response.'
            )
        });
        detailGroup.body.appendChild(detailRoughnessRow.row);
        
        const detailNormalRow = makeRangeRow('Normal');
        detailNormalRow.range.min = '-1';
        detailNormalRow.range.max = '1';
        detailNormalRow.range.step = '0.01';
        detailNormalRow.number.min = '-1';
        detailNormalRow.number.max = '1';
        detailNormalRow.number.step = '0.01';
        detailNormalRow.range.value = String(macro1?.normal ?? 0.0);
        detailNormalRow.number.value = formatFloat(macro1?.normal ?? 0.0, 2);
        applyRangeRowMeta(detailNormalRow, {
            tooltip: tip(
                'Normal shift for Macro B.',
                'Typical: 0.',
                'Too much: bumpy/shimmering artifacts.'
            )
        });
        detailGroup.body.appendChild(detailNormalRow.row);
        wallMatVarMacroGroup.body.appendChild(detailGroup.details);
        
        const macro2 = wallMatVarNormalized.macroLayers?.[2] ?? null;
        const macro2Group = makeDetailsSection('Macro layer 3', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:macro2` });
        applyTooltip(
            macro2Group.label,
            tip(
                'Macro layer 3 (Patches): mid-scale patchy variation.',
                'Good for repairs/batches and less uniform surfaces.',
                'Too much: camouflage-like patchiness.'
            )
        );
        const macro2Toggle = makeToggleRow('Enable macro layer 3');
        macro2Toggle.input.checked = !!macro2?.enabled;
        macro2Toggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(macro2Toggle, {
            mustHave: true,
            tooltip: tip(
                'Enables the patchy mid-variation layer.',
                'Typical: enable with low intensity.',
                'Too much: patch patterns dominate the material.'
            )
        });
        macro2Group.body.appendChild(macro2Toggle.toggle);
        
        const macro2StrengthRow = makeRangeRow('Intensity');
        macro2StrengthRow.range.min = '0';
        macro2StrengthRow.range.max = '2';
        macro2StrengthRow.range.step = '0.01';
        macro2StrengthRow.number.min = '0';
        macro2StrengthRow.number.max = '2';
        macro2StrengthRow.number.step = '0.01';
        macro2StrengthRow.range.value = String(macro2?.intensity ?? 0.0);
        macro2StrengthRow.number.value = formatFloat(macro2?.intensity ?? 0.0, 2);
        applyRangeRowMeta(macro2StrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of patch variation.',
                'Typical: 0.1–0.6.',
                'Too much: obvious patch camouflage.'
            )
        });
        macro2Group.body.appendChild(macro2StrengthRow.row);
        
        const macro2ScaleRow = makeRangeRow('Scale');
        macro2ScaleRow.range.min = '0.01';
        macro2ScaleRow.range.max = '20';
        macro2ScaleRow.range.step = '0.01';
        macro2ScaleRow.number.min = '0.01';
        macro2ScaleRow.number.max = '20';
        macro2ScaleRow.number.step = '0.01';
        macro2ScaleRow.range.value = String(macro2?.scale ?? 1.0);
        macro2ScaleRow.number.value = formatFloat(macro2?.scale ?? 1.0, 2);
         applyRangeRowMeta(macro2ScaleRow, {
             mustHave: true,
             tooltip: tip(
                 'Frequency of patch shapes (higher = smaller patches).',
                 'Typical: 0.5–4.0.',
                 'Too much: tiny noisy patches.'
             )
         });
         macro2Group.body.appendChild(macro2ScaleRow.row);
        
         const macro2CoverageRow = makeRangeRow('Coverage');
         macro2CoverageRow.range.min = '0';
         macro2CoverageRow.range.max = '1';
         macro2CoverageRow.range.step = '0.01';
         macro2CoverageRow.number.min = '0';
         macro2CoverageRow.number.max = '1';
         macro2CoverageRow.number.step = '0.01';
         macro2CoverageRow.range.value = String(macro2?.coverage ?? 0.0);
         macro2CoverageRow.number.value = formatFloat(macro2?.coverage ?? 0.0, 2);
         applyRangeRowMeta(macro2CoverageRow, {
             mustHave: true,
             tooltip: tip(
                 'How much of the surface becomes “patches”. Higher = fewer patches.',
                 'Typical: 0.55–0.80.',
                 'Too much: 0 means everywhere; 1 means almost none.'
             )
         });
         macro2Group.body.appendChild(macro2CoverageRow.row);
        
        const macro2HueRow = makeRangeRow('Hue shift (deg)');
        macro2HueRow.range.min = '-180';
        macro2HueRow.range.max = '180';
        macro2HueRow.range.step = '1';
        macro2HueRow.number.min = '-180';
        macro2HueRow.number.max = '180';
        macro2HueRow.number.step = '1';
        macro2HueRow.range.value = String(macro2?.hueDegrees ?? 0.0);
        macro2HueRow.number.value = String(Math.round(macro2?.hueDegrees ?? 0.0));
        applyRangeRowMeta(macro2HueRow, {
            tooltip: tip(
                'Hue shift for patch variation.',
                'Typical: subtle (often 0).',
                'Too much: colorful patch camouflage.'
            )
        });
        macro2Group.body.appendChild(macro2HueRow.row);
        
        const macro2ValueRow = makeRangeRow('Value');
        macro2ValueRow.range.min = '-1';
        macro2ValueRow.range.max = '1';
        macro2ValueRow.range.step = '0.01';
        macro2ValueRow.number.min = '-1';
        macro2ValueRow.number.max = '1';
        macro2ValueRow.number.step = '0.01';
        macro2ValueRow.range.value = String(macro2?.value ?? 0.0);
        macro2ValueRow.number.value = formatFloat(macro2?.value ?? 0.0, 2);
        applyRangeRowMeta(macro2ValueRow, {
            tooltip: tip(
                'Value/brightness shift for patches.',
                'Typical: small.',
                'Too much: harsh patch contrast.'
            )
        });
        macro2Group.body.appendChild(macro2ValueRow.row);
        
        const macro2SaturationRow = makeRangeRow('Saturation');
        macro2SaturationRow.range.min = '-1';
        macro2SaturationRow.range.max = '1';
        macro2SaturationRow.range.step = '0.01';
        macro2SaturationRow.number.min = '-1';
        macro2SaturationRow.number.max = '1';
        macro2SaturationRow.number.step = '0.01';
        macro2SaturationRow.range.value = String(macro2?.saturation ?? 0.0);
        macro2SaturationRow.number.value = formatFloat(macro2?.saturation ?? 0.0, 2);
        applyRangeRowMeta(macro2SaturationRow, {
            tooltip: tip(
                'Saturation shift for patches.',
                'Typical: subtle.',
                'Too much: obvious colored patch areas.'
            )
        });
        macro2Group.body.appendChild(macro2SaturationRow.row);
        
        const macro2RoughnessRow = makeRangeRow('Roughness');
         macro2RoughnessRow.range.min = '-1';
         macro2RoughnessRow.range.max = '1';
         macro2RoughnessRow.range.step = '0.01';
         macro2RoughnessRow.number.min = '-1';
         macro2RoughnessRow.number.max = '1';
         macro2RoughnessRow.number.step = '0.01';
         macro2RoughnessRow.range.value = String(macro2?.roughness ?? 0.0);
         macro2RoughnessRow.number.value = formatFloat(macro2?.roughness ?? 0.0, 2);
         applyRangeRowMeta(macro2RoughnessRow, {
            tooltip: tip(
                'Roughness shift for patches.',
                'Typical: subtle.',
                'Too much: noisy specular variation.'
            )
        });
        macro2Group.body.appendChild(macro2RoughnessRow.row);
        
        const macro2NormalRow = makeRangeRow('Normal');
        macro2NormalRow.range.min = '-1';
        macro2NormalRow.range.max = '1';
        macro2NormalRow.range.step = '0.01';
        macro2NormalRow.number.min = '-1';
        macro2NormalRow.number.max = '1';
        macro2NormalRow.number.step = '0.01';
        macro2NormalRow.range.value = String(macro2?.normal ?? 0.0);
        macro2NormalRow.number.value = formatFloat(macro2?.normal ?? 0.0, 2);
        applyRangeRowMeta(macro2NormalRow, {
            tooltip: tip(
                'Normal shift for patches.',
                'Typical: 0.',
                'Too much: bumpy patch artifacts.'
            )
        });
         macro2Group.body.appendChild(macro2NormalRow.row);
         wallMatVarMidGroup.body.appendChild(macro2Group.details);
        
         const micro0 = wallMatVarNormalized.macroLayers?.[3] ?? null;
         const microGroup = makeDetailsSection('Micro roughness', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:micro0` });
         applyTooltip(
             microGroup.label,
             tip(
                 'Micro breakup for surface response (mostly roughness, optionally normals).',
                 'Use to avoid large flat glossy/matte areas.',
                 'Too much: sparkly specular noise.'
             )
         );
         const microToggle = makeToggleRow('Enable micro variation');
         microToggle.input.checked = !!micro0?.enabled;
         microToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
         applyToggleRowMeta(microToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables micro-scale variation (roughness-first).',
                 'Typical: enable with low Intensity.',
                 'Too much: noisy shimmer on highlights.'
             )
         });
         microGroup.body.appendChild(microToggle.toggle);
        
         const microIntensityRow = makeRangeRow('Intensity');
         microIntensityRow.range.min = '0';
         microIntensityRow.range.max = '2';
         microIntensityRow.range.step = '0.01';
         microIntensityRow.number.min = '0';
         microIntensityRow.number.max = '2';
         microIntensityRow.number.step = '0.01';
         microIntensityRow.range.value = String(micro0?.intensity ?? 0.0);
         microIntensityRow.number.value = formatFloat(micro0?.intensity ?? 0.0, 2);
         applyRangeRowMeta(microIntensityRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of the micro mask.',
                 'Typical: 0.1–0.8.',
                 'Too much: micro-noise dominates.'
             )
         });
         microGroup.body.appendChild(microIntensityRow.row);
        
         const microScaleRow = makeRangeRow('Scale');
         microScaleRow.range.min = '0.01';
         microScaleRow.range.max = '20';
         microScaleRow.range.step = '0.01';
         microScaleRow.number.min = '0.01';
         microScaleRow.number.max = '20';
         microScaleRow.number.step = '0.01';
         microScaleRow.range.value = String(micro0?.scale ?? 1.0);
         microScaleRow.number.value = formatFloat(micro0?.scale ?? 1.0, 2);
         applyRangeRowMeta(microScaleRow, {
             mustHave: true,
             tooltip: tip(
                 'Frequency of micro breakup (higher = smaller micro detail).',
                 'Typical: 6–20.',
                 'Too much: glittery surface noise.'
             )
         });
         microGroup.body.appendChild(microScaleRow.row);
        
         const microRoughnessRow = makeRangeRow('Roughness');
         microRoughnessRow.range.min = '-1';
         microRoughnessRow.range.max = '1';
         microRoughnessRow.range.step = '0.01';
         microRoughnessRow.number.min = '-1';
         microRoughnessRow.number.max = '1';
         microRoughnessRow.number.step = '0.01';
         microRoughnessRow.range.value = String(micro0?.roughness ?? 0.0);
         microRoughnessRow.number.value = formatFloat(micro0?.roughness ?? 0.0, 2);
         applyRangeRowMeta(microRoughnessRow, {
             mustHave: true,
             tooltip: tip(
                 'Roughness shift driven by the micro mask.',
                 'Typical: small positive values for subtle breakup.',
                 'Too much: unstable specular response.'
             )
         });
         microGroup.body.appendChild(microRoughnessRow.row);
        
         const microNormalRow = makeRangeRow('Normal');
         microNormalRow.range.min = '-1';
         microNormalRow.range.max = '1';
         microNormalRow.range.step = '0.01';
         microNormalRow.number.min = '-1';
         microNormalRow.number.max = '1';
         microNormalRow.number.step = '0.01';
         microNormalRow.range.value = String(micro0?.normal ?? 0.0);
         microNormalRow.number.value = formatFloat(micro0?.normal ?? 0.0, 2);
         applyRangeRowMeta(microNormalRow, {
             tooltip: tip(
                 'Optional micro normal boost/attenuation.',
                 'Typical: 0.',
                 'Too much: bumpy/shimmering shading artifacts.'
             )
         });
         microGroup.body.appendChild(microNormalRow.row);
         wallMatVarMicroGroup.body.appendChild(microGroup.details);
        
         const cracksLayer = wallMatVarNormalized.cracksLayer ?? null;
         const cracksGroup = makeDetailsSection('Cracks', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:walls:matvar:cracks` });
         applyTooltip(
            cracksGroup.label,
            tip(
                'Procedural cracks and fine damage.',
                'Use sparingly to avoid a “ruined” look.',
                'Too much: the surface reads as broken everywhere.'
            )
        );
        const cracksToggle = makeToggleRow('Enable cracks');
        cracksToggle.input.checked = !!cracksLayer?.enabled;
        cracksToggle.input.disabled = !allow || !wallMatVarNormalized.enabled;
        applyToggleRowMeta(cracksToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables procedural cracks.',
                'Typical: enable with very low Strength.',
                'Too much: cracks dominate the material.'
            )
        });
        cracksGroup.body.appendChild(cracksToggle.toggle);
        const crackStrengthRow = makeRangeRow('Strength');
        crackStrengthRow.range.min = '0';
        crackStrengthRow.range.max = '2';
        crackStrengthRow.range.step = '0.01';
        crackStrengthRow.number.min = '0';
        crackStrengthRow.number.max = '2';
        crackStrengthRow.number.step = '0.01';
        crackStrengthRow.range.value = String(cracksLayer?.intensity ?? 0.0);
        crackStrengthRow.number.value = formatFloat(cracksLayer?.intensity ?? 0.0, 2);
        applyRangeRowMeta(crackStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength/visibility of cracks.',
                'Typical: 0.02–0.20.',
                'Too much: strong crack networks everywhere.'
            )
        });
        cracksGroup.body.appendChild(crackStrengthRow.row);
        
        const crackScaleRow = makeRangeRow('Scale');
        crackScaleRow.range.min = '0.01';
        crackScaleRow.range.max = '20';
        crackScaleRow.range.step = '0.01';
        crackScaleRow.number.min = '0.01';
        crackScaleRow.number.max = '20';
        crackScaleRow.number.step = '0.01';
        crackScaleRow.range.value = String(cracksLayer?.scale ?? 1.0);
        crackScaleRow.number.value = formatFloat(cracksLayer?.scale ?? 1.0, 2);
        applyRangeRowMeta(crackScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Frequency of crack patterns (higher = smaller cracks).',
                'Typical: 1–6.',
                'Too much: tiny noisy crack texture.'
            )
        });
        cracksGroup.body.appendChild(crackScaleRow.row);
        
        const crackHueRow = makeRangeRow('Hue shift (deg)');
        crackHueRow.range.min = '-180';
        crackHueRow.range.max = '180';
        crackHueRow.range.step = '1';
        crackHueRow.number.min = '-180';
        crackHueRow.number.max = '180';
        crackHueRow.number.step = '1';
        crackHueRow.range.value = String(cracksLayer?.hueDegrees ?? 0.0);
        crackHueRow.number.value = String(Math.round(cracksLayer?.hueDegrees ?? 0.0));
        applyRangeRowMeta(crackHueRow, {
            tooltip: tip(
                'Hue shift inside cracks.',
                'Typical: 0.',
                'Too much: colored cracks look like paint.'
            )
        });
        cracksGroup.body.appendChild(crackHueRow.row);
        
        const crackValueRow = makeRangeRow('Value');
        crackValueRow.range.min = '-1';
        crackValueRow.range.max = '1';
        crackValueRow.range.step = '0.01';
        crackValueRow.number.min = '-1';
        crackValueRow.number.max = '1';
        crackValueRow.number.step = '0.01';
        crackValueRow.range.value = String(cracksLayer?.value ?? 0.0);
        crackValueRow.number.value = formatFloat(cracksLayer?.value ?? 0.0, 2);
        applyRangeRowMeta(crackValueRow, {
            tooltip: tip(
                'Value/brightness shift inside cracks.',
                'Typical: slightly darker.',
                'Too much: looks like drawn lines.'
            )
        });
        cracksGroup.body.appendChild(crackValueRow.row);
        
        const crackSaturationRow = makeRangeRow('Saturation');
        crackSaturationRow.range.min = '-1';
        crackSaturationRow.range.max = '1';
        crackSaturationRow.range.step = '0.01';
        crackSaturationRow.number.min = '-1';
        crackSaturationRow.number.max = '1';
        crackSaturationRow.number.step = '0.01';
        crackSaturationRow.range.value = String(cracksLayer?.saturation ?? 0.0);
        crackSaturationRow.number.value = formatFloat(cracksLayer?.saturation ?? 0.0, 2);
        applyRangeRowMeta(crackSaturationRow, {
            tooltip: tip(
                'Saturation shift inside cracks.',
                'Typical: small negative saturation.',
                'Too much: colored crack lines.'
            )
        });
        cracksGroup.body.appendChild(crackSaturationRow.row);
        
        const crackRoughnessRow = makeRangeRow('Roughness');
            crackRoughnessRow.range.min = '-1';
            crackRoughnessRow.range.max = '1';
            crackRoughnessRow.range.step = '0.01';
            crackRoughnessRow.number.min = '-1';
            crackRoughnessRow.number.max = '1';
            crackRoughnessRow.number.step = '0.01';
            crackRoughnessRow.range.value = String(cracksLayer?.roughness ?? 0.0);
            crackRoughnessRow.number.value = formatFloat(cracksLayer?.roughness ?? 0.0, 2);
            applyRangeRowMeta(crackRoughnessRow, {
            tooltip: tip(
                'Roughness shift inside cracks.',
                'Typical: small changes.',
                'Too much: noisy specular along crack lines.'
            )
        });
        cracksGroup.body.appendChild(crackRoughnessRow.row);
        
        const crackNormalRow = makeRangeRow('Normal');
        crackNormalRow.range.min = '-1';
        crackNormalRow.range.max = '1';
        crackNormalRow.range.step = '0.01';
        crackNormalRow.number.min = '-1';
        crackNormalRow.number.max = '1';
        crackNormalRow.number.step = '0.01';
        crackNormalRow.range.value = String(cracksLayer?.normal ?? 0.0);
        crackNormalRow.number.value = formatFloat(cracksLayer?.normal ?? 0.0, 2);
        applyRangeRowMeta(crackNormalRow, {
            tooltip: tip(
                'Normal shift inside cracks.',
                'Typical: 0.',
                'Too much: bumpy crack artifacts.'
            )
        });
        cracksGroup.body.appendChild(crackNormalRow.row);
        wallMatVarWeatherGroup.body.appendChild(cracksGroup.details);
        
         const syncMatVarEnabled = () => {
             const enabled = !!layer.materialVariation.enabled;
                const objectSpace = matVarSpaceSelect.value === 'object';
                matVarSpaceSelect.disabled = !allow || !enabled;
             seedOffsetRow.range.disabled = !allow || !enabled;
             seedOffsetRow.number.disabled = seedOffsetRow.range.disabled;
             intensityRow.range.disabled = !allow || !enabled;
             intensityRow.number.disabled = intensityRow.range.disabled;
             scaleRow.range.disabled = !allow || !enabled || objectSpace;
             scaleRow.number.disabled = scaleRow.range.disabled;
                objectScaleRow.range.disabled = !allow || !enabled || !objectSpace;
                objectScaleRow.number.disabled = objectScaleRow.range.disabled;
                wallMatVarNormalFlipXToggle.input.disabled = !allow || !enabled;
                wallMatVarNormalFlipYToggle.input.disabled = !allow || !enabled;
                wallMatVarNormalFlipZToggle.input.disabled = !allow || !enabled;
             aoAmountRow.range.disabled = !allow || !enabled;
             aoAmountRow.number.disabled = aoAmountRow.range.disabled;
        
            macroToggle.input.disabled = !allow || !enabled;
            macroIntensityRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroIntensityRow.number.disabled = macroIntensityRow.range.disabled;
            macroScaleRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroScaleRow.number.disabled = macroScaleRow.range.disabled;
            macroHueRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroHueRow.number.disabled = macroHueRow.range.disabled;
            macroValueRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroValueRow.number.disabled = macroValueRow.range.disabled;
            macroSaturationRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroSaturationRow.number.disabled = macroSaturationRow.range.disabled;
            macroRoughnessRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroRoughnessRow.number.disabled = macroRoughnessRow.range.disabled;
            macroNormalRow.range.disabled = !allow || !enabled || !macroToggle.input.checked;
            macroNormalRow.number.disabled = macroNormalRow.range.disabled;
        
            streaksToggle.input.disabled = !allow || !enabled;
            streakStrengthRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakStrengthRow.number.disabled = streakStrengthRow.range.disabled;
            streakScaleRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakScaleRow.number.disabled = streakScaleRow.range.disabled;
            streakLedgeStrengthRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakLedgeStrengthRow.number.disabled = streakLedgeStrengthRow.range.disabled;
            streakLedgeScaleRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakLedgeScaleRow.number.disabled = streakLedgeScaleRow.range.disabled;
            streakHueRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakHueRow.number.disabled = streakHueRow.range.disabled;
            streakValueRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakValueRow.number.disabled = streakValueRow.range.disabled;
            streakSaturationRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
            streakSaturationRow.number.disabled = streakSaturationRow.range.disabled;
             streakRoughnessRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
             streakRoughnessRow.number.disabled = streakRoughnessRow.range.disabled;
             streakNormalRow.range.disabled = !allow || !enabled || !streaksToggle.input.checked;
             streakNormalRow.number.disabled = streakNormalRow.range.disabled;
        
             exposureToggle.input.disabled = !allow || !enabled;
             exposureStrengthRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureStrengthRow.number.disabled = exposureStrengthRow.range.disabled;
             exposureExponentRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureExponentRow.number.disabled = exposureExponentRow.range.disabled;
             exposureAzimuthRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureAzimuthRow.number.disabled = exposureAzimuthRow.range.disabled;
             exposureElevationRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureElevationRow.number.disabled = exposureElevationRow.range.disabled;
             exposureValueRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureValueRow.number.disabled = exposureValueRow.range.disabled;
             exposureSaturationRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureSaturationRow.number.disabled = exposureSaturationRow.range.disabled;
             exposureRoughnessRow.range.disabled = !allow || !enabled || !exposureToggle.input.checked;
             exposureRoughnessRow.number.disabled = exposureRoughnessRow.range.disabled;
        
             edgeToggle.input.disabled = !allow || !enabled;
             edgeStrengthRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
             edgeStrengthRow.number.disabled = edgeStrengthRow.range.disabled;
            edgeWidthRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeWidthRow.number.disabled = edgeWidthRow.range.disabled;
            edgeScaleRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeScaleRow.number.disabled = edgeScaleRow.range.disabled;
            edgeHueRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeHueRow.number.disabled = edgeHueRow.range.disabled;
            edgeValueRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeValueRow.number.disabled = edgeValueRow.range.disabled;
            edgeSaturationRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeSaturationRow.number.disabled = edgeSaturationRow.range.disabled;
            edgeRoughnessRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeRoughnessRow.number.disabled = edgeRoughnessRow.range.disabled;
            edgeNormalRow.range.disabled = !allow || !enabled || !edgeToggle.input.checked;
            edgeNormalRow.number.disabled = edgeNormalRow.range.disabled;
        
            grimeToggle.input.disabled = !allow || !enabled;
            grimeStrengthRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeStrengthRow.number.disabled = grimeStrengthRow.range.disabled;
            grimeWidthRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeWidthRow.number.disabled = grimeWidthRow.range.disabled;
            grimeScaleRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeScaleRow.number.disabled = grimeScaleRow.range.disabled;
            grimeHueRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeHueRow.number.disabled = grimeHueRow.range.disabled;
            grimeValueRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeValueRow.number.disabled = grimeValueRow.range.disabled;
            grimeSaturationRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeSaturationRow.number.disabled = grimeSaturationRow.range.disabled;
            grimeRoughnessRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeRoughnessRow.number.disabled = grimeRoughnessRow.range.disabled;
            grimeNormalRow.range.disabled = !allow || !enabled || !grimeToggle.input.checked;
            grimeNormalRow.number.disabled = grimeNormalRow.range.disabled;
        
            dustToggle.input.disabled = !allow || !enabled;
            dustStrengthRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustStrengthRow.number.disabled = dustStrengthRow.range.disabled;
            dustWidthRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustWidthRow.number.disabled = dustWidthRow.range.disabled;
            dustScaleRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustScaleRow.number.disabled = dustScaleRow.range.disabled;
            dustHueRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustHueRow.number.disabled = dustHueRow.range.disabled;
            dustValueRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustValueRow.number.disabled = dustValueRow.range.disabled;
            dustSaturationRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustSaturationRow.number.disabled = dustSaturationRow.range.disabled;
            dustRoughnessRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustRoughnessRow.number.disabled = dustRoughnessRow.range.disabled;
            dustNormalRow.range.disabled = !allow || !enabled || !dustToggle.input.checked;
            dustNormalRow.number.disabled = dustNormalRow.range.disabled;
        
            antiController.syncDisabled({ allow, parentEnabled: enabled });
        
             stairToggle.input.disabled = !allow || !enabled;
             stairStrengthRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
             stairStrengthRow.number.disabled = stairStrengthRow.range.disabled;
             stairStepRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
             stairStepRow.number.disabled = stairStepRow.range.disabled;
             stairShiftRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
             stairShiftRow.number.disabled = stairShiftRow.range.disabled;
             stairModeSelect.disabled = !allow || !enabled || !stairToggle.input.checked;
             const stairIsPattern3 = stairModeSelect.value === 'pattern3';
             stairPatternARow.range.disabled = !allow || !enabled || !stairToggle.input.checked || !stairIsPattern3;
             stairPatternARow.number.disabled = stairPatternARow.range.disabled;
             stairPatternBRow.range.disabled = !allow || !enabled || !stairToggle.input.checked || !stairIsPattern3;
             stairPatternBRow.number.disabled = stairPatternBRow.range.disabled;
             stairBlendRow.range.disabled = !allow || !enabled || !stairToggle.input.checked;
             stairBlendRow.number.disabled = stairBlendRow.range.disabled;
             stairDirSelect.disabled = !allow || !enabled || !stairToggle.input.checked;
        
             perBrickToggle.input.disabled = !allow || !enabled;
             perBrickBricksPerTileXRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickBricksPerTileXRow.number.disabled = perBrickBricksPerTileXRow.range.disabled;
             perBrickBricksPerTileYRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickBricksPerTileYRow.number.disabled = perBrickBricksPerTileYRow.range.disabled;
             perBrickMortarWidthRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickMortarWidthRow.number.disabled = perBrickMortarWidthRow.range.disabled;
             perBrickOffsetXRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickOffsetXRow.number.disabled = perBrickOffsetXRow.range.disabled;
             perBrickOffsetYRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickOffsetYRow.number.disabled = perBrickOffsetYRow.range.disabled;
             perBrickStrengthRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickStrengthRow.number.disabled = perBrickStrengthRow.range.disabled;
             perBrickHueRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickHueRow.number.disabled = perBrickHueRow.range.disabled;
             perBrickValueRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickValueRow.number.disabled = perBrickValueRow.range.disabled;
             perBrickSaturationRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickSaturationRow.number.disabled = perBrickSaturationRow.range.disabled;
             perBrickRoughnessRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickRoughnessRow.number.disabled = perBrickRoughnessRow.range.disabled;
             perBrickNormalRow.range.disabled = !allow || !enabled || !perBrickToggle.input.checked;
             perBrickNormalRow.number.disabled = perBrickNormalRow.range.disabled;
        
             mortarToggle.input.disabled = !allow || !enabled;
             mortarBricksPerTileXRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarBricksPerTileXRow.number.disabled = mortarBricksPerTileXRow.range.disabled;
             mortarBricksPerTileYRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarBricksPerTileYRow.number.disabled = mortarBricksPerTileYRow.range.disabled;
             mortarMortarWidthRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarMortarWidthRow.number.disabled = mortarMortarWidthRow.range.disabled;
             mortarOffsetXRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarOffsetXRow.number.disabled = mortarOffsetXRow.range.disabled;
             mortarOffsetYRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarOffsetYRow.number.disabled = mortarOffsetYRow.range.disabled;
             mortarStrengthRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarStrengthRow.number.disabled = mortarStrengthRow.range.disabled;
             mortarHueRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarHueRow.number.disabled = mortarHueRow.range.disabled;
             mortarValueRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarValueRow.number.disabled = mortarValueRow.range.disabled;
             mortarSaturationRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarSaturationRow.number.disabled = mortarSaturationRow.range.disabled;
             mortarRoughnessRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarRoughnessRow.number.disabled = mortarRoughnessRow.range.disabled;
             mortarNormalRow.range.disabled = !allow || !enabled || !mortarToggle.input.checked;
             mortarNormalRow.number.disabled = mortarNormalRow.range.disabled;
        
             detailToggle.input.disabled = !allow || !enabled;
             detailStrengthRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
             detailStrengthRow.number.disabled = detailStrengthRow.range.disabled;
            detailScaleRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailScaleRow.number.disabled = detailScaleRow.range.disabled;
            detailHueRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailHueRow.number.disabled = detailHueRow.range.disabled;
            detailValueRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailValueRow.number.disabled = detailValueRow.range.disabled;
            detailSaturationRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailSaturationRow.number.disabled = detailSaturationRow.range.disabled;
            detailRoughnessRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailRoughnessRow.number.disabled = detailRoughnessRow.range.disabled;
            detailNormalRow.range.disabled = !allow || !enabled || !detailToggle.input.checked;
            detailNormalRow.number.disabled = detailNormalRow.range.disabled;
        
            macro2Toggle.input.disabled = !allow || !enabled;
             macro2StrengthRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2StrengthRow.number.disabled = macro2StrengthRow.range.disabled;
             macro2ScaleRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2ScaleRow.number.disabled = macro2ScaleRow.range.disabled;
             macro2CoverageRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2CoverageRow.number.disabled = macro2CoverageRow.range.disabled;
             macro2HueRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2HueRow.number.disabled = macro2HueRow.range.disabled;
            macro2ValueRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
            macro2ValueRow.number.disabled = macro2ValueRow.range.disabled;
            macro2SaturationRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
            macro2SaturationRow.number.disabled = macro2SaturationRow.range.disabled;
            macro2RoughnessRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2RoughnessRow.number.disabled = macro2RoughnessRow.range.disabled;
             macro2NormalRow.range.disabled = !allow || !enabled || !macro2Toggle.input.checked;
             macro2NormalRow.number.disabled = macro2NormalRow.range.disabled;
        
             microToggle.input.disabled = !allow || !enabled;
             microIntensityRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
             microIntensityRow.number.disabled = microIntensityRow.range.disabled;
             microScaleRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
             microScaleRow.number.disabled = microScaleRow.range.disabled;
             microRoughnessRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
             microRoughnessRow.number.disabled = microRoughnessRow.range.disabled;
             microNormalRow.range.disabled = !allow || !enabled || !microToggle.input.checked;
             microNormalRow.number.disabled = microNormalRow.range.disabled;
        
             cracksToggle.input.disabled = !allow || !enabled;
             crackStrengthRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
             crackStrengthRow.number.disabled = crackStrengthRow.range.disabled;
            crackScaleRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackScaleRow.number.disabled = crackScaleRow.range.disabled;
            crackHueRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackHueRow.number.disabled = crackHueRow.range.disabled;
            crackValueRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackValueRow.number.disabled = crackValueRow.range.disabled;
            crackSaturationRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackSaturationRow.number.disabled = crackSaturationRow.range.disabled;
            crackRoughnessRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackRoughnessRow.number.disabled = crackRoughnessRow.range.disabled;
            crackNormalRow.range.disabled = !allow || !enabled || !cracksToggle.input.checked;
            crackNormalRow.number.disabled = crackNormalRow.range.disabled;
        };
        
        matVarToggle.input.addEventListener('change', () => {
            const nextEnabled = !!matVarToggle.input.checked;
            const wasEnabled = !!layer.materialVariation.enabled;
            if (nextEnabled && !wasEnabled && isMinimalMaterialVariationConfig(layer.materialVariation)) {
                const prevSeedOffset = clampInt(layer.materialVariation.seedOffset ?? 0, -9999, 9999);
                const prevNormalMap = layer.materialVariation.normalMap && typeof layer.materialVariation.normalMap === 'object'
                    ? { ...layer.materialVariation.normalMap }
                    : null;
                layer.materialVariation = createDisabledMaterialVariationConfig(MATERIAL_VARIATION_ROOT.WALL, { seedOffset: prevSeedOffset, normalMap: prevNormalMap });
                onReRender();
                onChange();
                return;
            }
        
            layer.materialVariation.enabled = nextEnabled;
            syncMatVarEnabled();
            onChange();
        });
        seedOffsetRow.range.addEventListener('input', () => {
            const next = clampInt(seedOffsetRow.range.value, -9999, 9999);
            layer.materialVariation.seedOffset = next;
            seedOffsetRow.number.value = String(next);
            onChange();
        });
        seedOffsetRow.number.addEventListener('change', () => {
            const next = clampInt(seedOffsetRow.number.value, -9999, 9999);
            layer.materialVariation.seedOffset = next;
            seedOffsetRow.range.value = String(next);
            seedOffsetRow.number.value = String(next);
            onChange();
        });
        intensityRow.range.addEventListener('input', () => {
            const next = clamp(intensityRow.range.value, 0.0, 2.0);
            layer.materialVariation.globalIntensity = next;
            intensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        intensityRow.number.addEventListener('change', () => {
            const next = clamp(intensityRow.number.value, 0.0, 2.0);
            layer.materialVariation.globalIntensity = next;
            intensityRow.range.value = String(next);
            intensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        scaleRow.range.addEventListener('input', () => {
            const next = clamp(scaleRow.range.value, 0.05, 4.0);
            layer.materialVariation.worldSpaceScale = next;
            scaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
         scaleRow.number.addEventListener('change', () => {
             const next = clamp(scaleRow.number.value, 0.05, 4.0);
             layer.materialVariation.worldSpaceScale = next;
             scaleRow.range.value = String(next);
             scaleRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         aoAmountRow.range.addEventListener('input', () => {
             const next = clamp(aoAmountRow.range.value, 0.0, 1.0);
             layer.materialVariation.aoAmount = next;
            aoAmountRow.number.value = formatFloat(next, 2);
            onChange();
        });
        aoAmountRow.number.addEventListener('change', () => {
            const next = clamp(aoAmountRow.number.value, 0.0, 1.0);
            layer.materialVariation.aoAmount = next;
            aoAmountRow.range.value = String(next);
            aoAmountRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        matVarSpaceSelect.addEventListener('change', () => {
            layer.materialVariation.space = matVarSpaceSelect.value === 'object' ? 'object' : 'world';
            syncMatVarEnabled();
            onChange();
        });
        
        objectScaleRow.range.addEventListener('input', () => {
            const next = clamp(objectScaleRow.range.value, 0.05, 4.0);
            layer.materialVariation.objectSpaceScale = next;
            objectScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        objectScaleRow.number.addEventListener('change', () => {
            const next = clamp(objectScaleRow.number.value, 0.05, 4.0);
            layer.materialVariation.objectSpaceScale = next;
            objectScaleRow.range.value = String(next);
            objectScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        wallMatVarNormalFlipXToggle.input.addEventListener('change', () => {
            layer.materialVariation.normalMap ??= {};
            layer.materialVariation.normalMap.flipX = !!wallMatVarNormalFlipXToggle.input.checked;
            onChange();
        });
        wallMatVarNormalFlipYToggle.input.addEventListener('change', () => {
            layer.materialVariation.normalMap ??= {};
            layer.materialVariation.normalMap.flipY = !!wallMatVarNormalFlipYToggle.input.checked;
            onChange();
        });
        wallMatVarNormalFlipZToggle.input.addEventListener('change', () => {
            layer.materialVariation.normalMap ??= {};
            layer.materialVariation.normalMap.flipZ = !!wallMatVarNormalFlipZToggle.input.checked;
            onChange();
        });
        
        macroToggle.input.addEventListener('change', () => {
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].enabled = !!macroToggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        macroIntensityRow.range.addEventListener('input', () => {
            const next = clamp(macroIntensityRow.range.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].intensity = next;
            macroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroIntensityRow.number.addEventListener('change', () => {
            const next = clamp(macroIntensityRow.number.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].intensity = next;
            macroIntensityRow.range.value = String(next);
            macroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroScaleRow.range.addEventListener('input', () => {
            const next = clamp(macroScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].scale = next;
            macroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroScaleRow.number.addEventListener('change', () => {
            const next = clamp(macroScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].scale = next;
            macroScaleRow.range.value = String(next);
            macroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroHueRow.range.addEventListener('input', () => {
            const next = clamp(macroHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].hueDegrees = next;
            macroHueRow.number.value = String(Math.round(next));
            onChange();
        });
        macroHueRow.number.addEventListener('change', () => {
            const next = clamp(macroHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].hueDegrees = next;
            macroHueRow.range.value = String(next);
            macroHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        macroValueRow.range.addEventListener('input', () => {
            const next = clamp(macroValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].value = next;
            macroValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroValueRow.number.addEventListener('change', () => {
            const next = clamp(macroValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].value = next;
            macroValueRow.range.value = String(next);
            macroValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macroSaturationRow.range.addEventListener('input', () => {
            const next = clamp(macroSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].saturation = next;
            macroSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroSaturationRow.number.addEventListener('change', () => {
            const next = clamp(macroSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].saturation = next;
            macroSaturationRow.range.value = String(next);
            macroSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macroRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(macroRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].roughness = next;
            macroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(macroRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].roughness = next;
            macroRoughnessRow.range.value = String(next);
            macroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macroNormalRow.range.addEventListener('input', () => {
            const next = clamp(macroNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].normal = next;
            macroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macroNormalRow.number.addEventListener('change', () => {
            const next = clamp(macroNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[0] ??= {};
            layer.materialVariation.macroLayers[0].normal = next;
            macroNormalRow.range.value = String(next);
            macroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        streaksToggle.input.addEventListener('change', () => {
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.enabled = !!streaksToggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        streakStrengthRow.range.addEventListener('input', () => {
            const next = clamp(streakStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.strength = next;
            streakStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakStrengthRow.number.addEventListener('change', () => {
            const next = clamp(streakStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.strength = next;
            streakStrengthRow.range.value = String(next);
            streakStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakScaleRow.range.addEventListener('input', () => {
            const next = clamp(streakScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.scale = next;
            streakScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakScaleRow.number.addEventListener('change', () => {
            const next = clamp(streakScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.scale = next;
            streakScaleRow.range.value = String(next);
            streakScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakLedgeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(streakLedgeStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.ledgeStrength = next;
            streakLedgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakLedgeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(streakLedgeStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.ledgeStrength = next;
            streakLedgeStrengthRow.range.value = String(next);
            streakLedgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakLedgeScaleRow.range.addEventListener('input', () => {
            const next = clamp(streakLedgeScaleRow.range.value, 0.0, 20.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.ledgeScale = next;
            streakLedgeScaleRow.number.value = formatFloat(next, 1);
            onChange();
        });
        streakLedgeScaleRow.number.addEventListener('change', () => {
            const next = clamp(streakLedgeScaleRow.number.value, 0.0, 20.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.ledgeScale = next;
            streakLedgeScaleRow.range.value = String(next);
            streakLedgeScaleRow.number.value = formatFloat(next, 1);
            onChange();
        });
        
        streakHueRow.range.addEventListener('input', () => {
            const next = clamp(streakHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.hueDegrees = next;
            streakHueRow.number.value = String(Math.round(next));
            onChange();
        });
        streakHueRow.number.addEventListener('change', () => {
            const next = clamp(streakHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.hueDegrees = next;
            streakHueRow.range.value = String(next);
            streakHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        streakValueRow.range.addEventListener('input', () => {
            const next = clamp(streakValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.value = next;
            streakValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakValueRow.number.addEventListener('change', () => {
            const next = clamp(streakValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.value = next;
            streakValueRow.range.value = String(next);
            streakValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        streakSaturationRow.range.addEventListener('input', () => {
            const next = clamp(streakSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.saturation = next;
            streakSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakSaturationRow.number.addEventListener('change', () => {
            const next = clamp(streakSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.saturation = next;
            streakSaturationRow.range.value = String(next);
            streakSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        streakRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(streakRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.roughness = next;
            streakRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        streakRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(streakRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.roughness = next;
            streakRoughnessRow.range.value = String(next);
            streakRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        streakNormalRow.range.addEventListener('input', () => {
            const next = clamp(streakNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.streaks ??= {};
            layer.materialVariation.streaks.normal = next;
            streakNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
         streakNormalRow.number.addEventListener('change', () => {
             const next = clamp(streakNormalRow.number.value, -1.0, 1.0);
             layer.materialVariation.streaks ??= {};
             layer.materialVariation.streaks.normal = next;
             streakNormalRow.range.value = String(next);
             streakNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         exposureToggle.input.addEventListener('change', () => {
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.enabled = !!exposureToggle.input.checked;
             syncMatVarEnabled();
             onChange();
         });
        
         exposureStrengthRow.range.addEventListener('input', () => {
             const next = clamp(exposureStrengthRow.range.value, 0.0, 2.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.strength = next;
             exposureStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
         exposureStrengthRow.number.addEventListener('change', () => {
             const next = clamp(exposureStrengthRow.number.value, 0.0, 2.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.strength = next;
             exposureStrengthRow.range.value = String(next);
             exposureStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         exposureExponentRow.range.addEventListener('input', () => {
             const next = clamp(exposureExponentRow.range.value, 0.1, 8.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.exponent = next;
             exposureExponentRow.number.value = formatFloat(next, 2);
             onChange();
         });
         exposureExponentRow.number.addEventListener('change', () => {
             const next = clamp(exposureExponentRow.number.value, 0.1, 8.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.exponent = next;
             exposureExponentRow.range.value = String(next);
             exposureExponentRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         const setExposureDirectionFromUi = () => {
             const az = clampInt(exposureAzimuthRow.number.value, 0, 360);
             const el = clampInt(exposureElevationRow.number.value, 0, 90);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.direction = azimuthElevationDegreesToDirection(az, el);
         };
         exposureAzimuthRow.range.addEventListener('input', () => {
             const next = clampInt(exposureAzimuthRow.range.value, 0, 360);
             exposureAzimuthRow.number.value = String(next);
             setExposureDirectionFromUi();
             onChange();
         });
         exposureAzimuthRow.number.addEventListener('change', () => {
             const next = clampInt(exposureAzimuthRow.number.value, 0, 360);
             exposureAzimuthRow.range.value = String(next);
             exposureAzimuthRow.number.value = String(next);
             setExposureDirectionFromUi();
             onChange();
         });
        
         exposureElevationRow.range.addEventListener('input', () => {
             const next = clampInt(exposureElevationRow.range.value, 0, 90);
             exposureElevationRow.number.value = String(next);
             setExposureDirectionFromUi();
             onChange();
         });
         exposureElevationRow.number.addEventListener('change', () => {
             const next = clampInt(exposureElevationRow.number.value, 0, 90);
             exposureElevationRow.range.value = String(next);
             exposureElevationRow.number.value = String(next);
             setExposureDirectionFromUi();
             onChange();
         });
        
         exposureValueRow.range.addEventListener('input', () => {
             const next = clamp(exposureValueRow.range.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.value = next;
             exposureValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
         exposureValueRow.number.addEventListener('change', () => {
             const next = clamp(exposureValueRow.number.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.value = next;
             exposureValueRow.range.value = String(next);
             exposureValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         exposureSaturationRow.range.addEventListener('input', () => {
             const next = clamp(exposureSaturationRow.range.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.saturation = next;
             exposureSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
         exposureSaturationRow.number.addEventListener('change', () => {
             const next = clamp(exposureSaturationRow.number.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.saturation = next;
             exposureSaturationRow.range.value = String(next);
             exposureSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         exposureRoughnessRow.range.addEventListener('input', () => {
             const next = clamp(exposureRoughnessRow.range.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.roughness = next;
             exposureRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
         exposureRoughnessRow.number.addEventListener('change', () => {
             const next = clamp(exposureRoughnessRow.number.value, -1.0, 1.0);
             layer.materialVariation.exposure ??= {};
             layer.materialVariation.exposure.roughness = next;
             exposureRoughnessRow.range.value = String(next);
             exposureRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         edgeToggle.input.addEventListener('change', () => {
             layer.materialVariation.wearSide ??= {};
             layer.materialVariation.wearSide.enabled = !!edgeToggle.input.checked;
             syncMatVarEnabled();
            onChange();
        });
        edgeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(edgeStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.strength = next;
            edgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(edgeStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.strength = next;
            edgeStrengthRow.range.value = String(next);
            edgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeWidthRow.range.addEventListener('input', () => {
            const next = clamp(edgeWidthRow.range.value, 0.0, 4.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.width = next;
            edgeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeWidthRow.number.addEventListener('change', () => {
            const next = clamp(edgeWidthRow.number.value, 0.0, 4.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.width = next;
            edgeWidthRow.range.value = String(next);
            edgeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeScaleRow.range.addEventListener('input', () => {
            const next = clamp(edgeScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.scale = next;
            edgeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeScaleRow.number.addEventListener('change', () => {
            const next = clamp(edgeScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.scale = next;
            edgeScaleRow.range.value = String(next);
            edgeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeHueRow.range.addEventListener('input', () => {
            const next = clamp(edgeHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.hueDegrees = next;
            edgeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        edgeHueRow.number.addEventListener('change', () => {
            const next = clamp(edgeHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.hueDegrees = next;
            edgeHueRow.range.value = String(next);
            edgeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        edgeValueRow.range.addEventListener('input', () => {
            const next = clamp(edgeValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.value = next;
            edgeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeValueRow.number.addEventListener('change', () => {
            const next = clamp(edgeValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.value = next;
            edgeValueRow.range.value = String(next);
            edgeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeSaturationRow.range.addEventListener('input', () => {
            const next = clamp(edgeSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.saturation = next;
            edgeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeSaturationRow.number.addEventListener('change', () => {
            const next = clamp(edgeSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.saturation = next;
            edgeSaturationRow.range.value = String(next);
            edgeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(edgeRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.roughness = next;
            edgeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(edgeRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.roughness = next;
            edgeRoughnessRow.range.value = String(next);
            edgeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        edgeNormalRow.range.addEventListener('input', () => {
            const next = clamp(edgeNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.normal = next;
            edgeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        edgeNormalRow.number.addEventListener('change', () => {
            const next = clamp(edgeNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearSide ??= {};
            layer.materialVariation.wearSide.normal = next;
            edgeNormalRow.range.value = String(next);
            edgeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeToggle.input.addEventListener('change', () => {
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.enabled = !!grimeToggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        grimeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(grimeStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.strength = next;
            grimeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(grimeStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.strength = next;
            grimeStrengthRow.range.value = String(next);
            grimeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeWidthRow.range.addEventListener('input', () => {
            const next = clamp(grimeWidthRow.range.value, 0.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.width = next;
            grimeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeWidthRow.number.addEventListener('change', () => {
            const next = clamp(grimeWidthRow.number.value, 0.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.width = next;
            grimeWidthRow.range.value = String(next);
            grimeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeScaleRow.range.addEventListener('input', () => {
            const next = clamp(grimeScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.scale = next;
            grimeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeScaleRow.number.addEventListener('change', () => {
            const next = clamp(grimeScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.scale = next;
            grimeScaleRow.range.value = String(next);
            grimeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeHueRow.range.addEventListener('input', () => {
            const next = clamp(grimeHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.hueDegrees = next;
            grimeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        grimeHueRow.number.addEventListener('change', () => {
            const next = clamp(grimeHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.hueDegrees = next;
            grimeHueRow.range.value = String(next);
            grimeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        grimeValueRow.range.addEventListener('input', () => {
            const next = clamp(grimeValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.value = next;
            grimeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeValueRow.number.addEventListener('change', () => {
            const next = clamp(grimeValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.value = next;
            grimeValueRow.range.value = String(next);
            grimeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeSaturationRow.range.addEventListener('input', () => {
            const next = clamp(grimeSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.saturation = next;
            grimeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeSaturationRow.number.addEventListener('change', () => {
            const next = clamp(grimeSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.saturation = next;
            grimeSaturationRow.range.value = String(next);
            grimeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(grimeRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.roughness = next;
            grimeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(grimeRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.roughness = next;
            grimeRoughnessRow.range.value = String(next);
            grimeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        grimeNormalRow.range.addEventListener('input', () => {
            const next = clamp(grimeNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.normal = next;
            grimeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        grimeNormalRow.number.addEventListener('change', () => {
            const next = clamp(grimeNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearBottom ??= {};
            layer.materialVariation.wearBottom.normal = next;
            grimeNormalRow.range.value = String(next);
            grimeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        dustToggle.input.addEventListener('change', () => {
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.enabled = !!dustToggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        dustStrengthRow.range.addEventListener('input', () => {
            const next = clamp(dustStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.strength = next;
            dustStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustStrengthRow.number.addEventListener('change', () => {
            const next = clamp(dustStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.strength = next;
            dustStrengthRow.range.value = String(next);
            dustStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustWidthRow.range.addEventListener('input', () => {
            const next = clamp(dustWidthRow.range.value, 0.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.width = next;
            dustWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustWidthRow.number.addEventListener('change', () => {
            const next = clamp(dustWidthRow.number.value, 0.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.width = next;
            dustWidthRow.range.value = String(next);
            dustWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustScaleRow.range.addEventListener('input', () => {
            const next = clamp(dustScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.scale = next;
            dustScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustScaleRow.number.addEventListener('change', () => {
            const next = clamp(dustScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.scale = next;
            dustScaleRow.range.value = String(next);
            dustScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        dustHueRow.range.addEventListener('input', () => {
            const next = clamp(dustHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.hueDegrees = next;
            dustHueRow.number.value = String(Math.round(next));
            onChange();
        });
        dustHueRow.number.addEventListener('change', () => {
            const next = clamp(dustHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.hueDegrees = next;
            dustHueRow.range.value = String(next);
            dustHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        dustValueRow.range.addEventListener('input', () => {
            const next = clamp(dustValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.value = next;
            dustValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustValueRow.number.addEventListener('change', () => {
            const next = clamp(dustValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.value = next;
            dustValueRow.range.value = String(next);
            dustValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        dustSaturationRow.range.addEventListener('input', () => {
            const next = clamp(dustSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.saturation = next;
            dustSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustSaturationRow.number.addEventListener('change', () => {
            const next = clamp(dustSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.saturation = next;
            dustSaturationRow.range.value = String(next);
            dustSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        dustRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(dustRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.roughness = next;
            dustRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(dustRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.roughness = next;
            dustRoughnessRow.range.value = String(next);
            dustRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        dustNormalRow.range.addEventListener('input', () => {
            const next = clamp(dustNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.normal = next;
            dustNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        dustNormalRow.number.addEventListener('change', () => {
            const next = clamp(dustNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.wearTop ??= {};
            layer.materialVariation.wearTop.normal = next;
            dustNormalRow.range.value = String(next);
            dustNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
         stairToggle.input.addEventListener('change', () => {
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.enabled = !!stairToggle.input.checked;
             syncMatVarEnabled();
            onChange();
        });
        stairStrengthRow.range.addEventListener('input', () => {
            const next = clamp(stairStrengthRow.range.value, 0.0, 1.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.strength = next;
            stairStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairStrengthRow.number.addEventListener('change', () => {
            const next = clamp(stairStrengthRow.number.value, 0.0, 1.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.strength = next;
            stairStrengthRow.range.value = String(next);
            stairStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairStepRow.range.addEventListener('input', () => {
            const next = clamp(stairStepRow.range.value, 0.01, 20.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.stepSize = next;
            stairStepRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairStepRow.number.addEventListener('change', () => {
            const next = clamp(stairStepRow.number.value, 0.01, 20.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.stepSize = next;
            stairStepRow.range.value = String(next);
            stairStepRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairShiftRow.range.addEventListener('input', () => {
            const next = clamp(stairShiftRow.range.value, -1.0, 1.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.shift = next;
            stairShiftRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairShiftRow.number.addEventListener('change', () => {
            const next = clamp(stairShiftRow.number.value, -1.0, 1.0);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.shift = next;
            stairShiftRow.range.value = String(next);
            stairShiftRow.number.value = formatFloat(next, 2);
            onChange();
        });
         stairModeSelect.addEventListener('change', () => {
             layer.materialVariation.stairShift ??= {};
             const v = stairModeSelect.value;
             layer.materialVariation.stairShift.mode =
                 v === 'random' ? 'random' : (v === 'alternate' ? 'alternate' : (v === 'pattern3' ? 'pattern3' : 'stair'));
             syncMatVarEnabled();
             onChange();
         });
        
         stairPatternARow.range.addEventListener('input', () => {
             const next = clamp(stairPatternARow.range.value, -1.0, 1.0);
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.patternA = next;
             stairPatternARow.number.value = formatFloat(next, 2);
             onChange();
         });
         stairPatternARow.number.addEventListener('change', () => {
             const next = clamp(stairPatternARow.number.value, -1.0, 1.0);
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.patternA = next;
             stairPatternARow.range.value = String(next);
             stairPatternARow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         stairPatternBRow.range.addEventListener('input', () => {
             const next = clamp(stairPatternBRow.range.value, -1.0, 1.0);
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.patternB = next;
             stairPatternBRow.number.value = formatFloat(next, 2);
             onChange();
         });
         stairPatternBRow.number.addEventListener('change', () => {
             const next = clamp(stairPatternBRow.number.value, -1.0, 1.0);
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.patternB = next;
             stairPatternBRow.range.value = String(next);
             stairPatternBRow.number.value = formatFloat(next, 2);
             onChange();
         });
        stairBlendRow.range.addEventListener('input', () => {
            const next = clamp(stairBlendRow.range.value, 0.0, 0.49);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.blendWidth = next;
            stairBlendRow.number.value = formatFloat(next, 2);
            onChange();
        });
        stairBlendRow.number.addEventListener('change', () => {
            const next = clamp(stairBlendRow.number.value, 0.0, 0.49);
            layer.materialVariation.stairShift ??= {};
            layer.materialVariation.stairShift.blendWidth = next;
            stairBlendRow.range.value = String(next);
            stairBlendRow.number.value = formatFloat(next, 2);
            onChange();
        });
         stairDirSelect.addEventListener('change', () => {
             layer.materialVariation.stairShift ??= {};
             layer.materialVariation.stairShift.direction = stairDirSelect.value === 'vertical' ? 'vertical' : 'horizontal';
             onChange();
         });
        
         perBrickToggle.input.addEventListener('change', () => {
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.enabled = !!perBrickToggle.input.checked;
             syncMatVarEnabled();
             onChange();
         });
        
         perBrickBricksPerTileXRow.range.addEventListener('input', () => {
             const next = clamp(perBrickBricksPerTileXRow.range.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.bricksPerTileX = next;
             perBrickBricksPerTileXRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickBricksPerTileXRow.number.addEventListener('change', () => {
             const next = clamp(perBrickBricksPerTileXRow.number.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.bricksPerTileX = next;
             perBrickBricksPerTileXRow.range.value = String(next);
             perBrickBricksPerTileXRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickBricksPerTileYRow.range.addEventListener('input', () => {
             const next = clamp(perBrickBricksPerTileYRow.range.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.bricksPerTileY = next;
             perBrickBricksPerTileYRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickBricksPerTileYRow.number.addEventListener('change', () => {
             const next = clamp(perBrickBricksPerTileYRow.number.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.bricksPerTileY = next;
             perBrickBricksPerTileYRow.range.value = String(next);
             perBrickBricksPerTileYRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickMortarWidthRow.range.addEventListener('input', () => {
             const next = clamp(perBrickMortarWidthRow.range.value, 0.0, 0.49);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.mortarWidth = next;
             perBrickMortarWidthRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickMortarWidthRow.number.addEventListener('change', () => {
             const next = clamp(perBrickMortarWidthRow.number.value, 0.0, 0.49);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.mortarWidth = next;
             perBrickMortarWidthRow.range.value = String(next);
             perBrickMortarWidthRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickOffsetXRow.range.addEventListener('input', () => {
             const next = clamp(perBrickOffsetXRow.range.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.offsetX = next;
             perBrickOffsetXRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickOffsetXRow.number.addEventListener('change', () => {
             const next = clamp(perBrickOffsetXRow.number.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.offsetX = next;
             perBrickOffsetXRow.range.value = String(next);
             perBrickOffsetXRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickOffsetYRow.range.addEventListener('input', () => {
             const next = clamp(perBrickOffsetYRow.range.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.offsetY = next;
             perBrickOffsetYRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickOffsetYRow.number.addEventListener('change', () => {
             const next = clamp(perBrickOffsetYRow.number.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.layout ??= {};
             layer.materialVariation.brick.perBrick.layout.offsetY = next;
             perBrickOffsetYRow.range.value = String(next);
             perBrickOffsetYRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickStrengthRow.range.addEventListener('input', () => {
             const next = clamp(perBrickStrengthRow.range.value, 0.0, 2.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.strength = next;
             perBrickStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickStrengthRow.number.addEventListener('change', () => {
             const next = clamp(perBrickStrengthRow.number.value, 0.0, 2.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.strength = next;
             perBrickStrengthRow.range.value = String(next);
             perBrickStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickHueRow.range.addEventListener('input', () => {
             const next = clamp(perBrickHueRow.range.value, -180.0, 180.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.hueDegrees = next;
             perBrickHueRow.number.value = String(Math.round(next));
             onChange();
         });
         perBrickHueRow.number.addEventListener('change', () => {
             const next = clamp(perBrickHueRow.number.value, -180.0, 180.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.hueDegrees = next;
             perBrickHueRow.range.value = String(next);
             perBrickHueRow.number.value = String(Math.round(next));
             onChange();
         });
        
         perBrickValueRow.range.addEventListener('input', () => {
             const next = clamp(perBrickValueRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.value = next;
             perBrickValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickValueRow.number.addEventListener('change', () => {
             const next = clamp(perBrickValueRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.value = next;
             perBrickValueRow.range.value = String(next);
             perBrickValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickSaturationRow.range.addEventListener('input', () => {
             const next = clamp(perBrickSaturationRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.saturation = next;
             perBrickSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickSaturationRow.number.addEventListener('change', () => {
             const next = clamp(perBrickSaturationRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.saturation = next;
             perBrickSaturationRow.range.value = String(next);
             perBrickSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickRoughnessRow.range.addEventListener('input', () => {
             const next = clamp(perBrickRoughnessRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.roughness = next;
             perBrickRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickRoughnessRow.number.addEventListener('change', () => {
             const next = clamp(perBrickRoughnessRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.roughness = next;
             perBrickRoughnessRow.range.value = String(next);
             perBrickRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         perBrickNormalRow.range.addEventListener('input', () => {
             const next = clamp(perBrickNormalRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.normal = next;
             perBrickNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
         perBrickNormalRow.number.addEventListener('change', () => {
             const next = clamp(perBrickNormalRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.perBrick ??= {};
             layer.materialVariation.brick.perBrick.normal = next;
             perBrickNormalRow.range.value = String(next);
             perBrickNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarToggle.input.addEventListener('change', () => {
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.enabled = !!mortarToggle.input.checked;
             syncMatVarEnabled();
             onChange();
         });
        
         mortarBricksPerTileXRow.range.addEventListener('input', () => {
             const next = clamp(mortarBricksPerTileXRow.range.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.bricksPerTileX = next;
             mortarBricksPerTileXRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarBricksPerTileXRow.number.addEventListener('change', () => {
             const next = clamp(mortarBricksPerTileXRow.number.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.bricksPerTileX = next;
             mortarBricksPerTileXRow.range.value = String(next);
             mortarBricksPerTileXRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarBricksPerTileYRow.range.addEventListener('input', () => {
             const next = clamp(mortarBricksPerTileYRow.range.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.bricksPerTileY = next;
             mortarBricksPerTileYRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarBricksPerTileYRow.number.addEventListener('change', () => {
             const next = clamp(mortarBricksPerTileYRow.number.value, 0.25, 200.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.bricksPerTileY = next;
             mortarBricksPerTileYRow.range.value = String(next);
             mortarBricksPerTileYRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarMortarWidthRow.range.addEventListener('input', () => {
             const next = clamp(mortarMortarWidthRow.range.value, 0.0, 0.49);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.mortarWidth = next;
             mortarMortarWidthRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarMortarWidthRow.number.addEventListener('change', () => {
             const next = clamp(mortarMortarWidthRow.number.value, 0.0, 0.49);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.mortarWidth = next;
             mortarMortarWidthRow.range.value = String(next);
             mortarMortarWidthRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarOffsetXRow.range.addEventListener('input', () => {
             const next = clamp(mortarOffsetXRow.range.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.offsetX = next;
             mortarOffsetXRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarOffsetXRow.number.addEventListener('change', () => {
             const next = clamp(mortarOffsetXRow.number.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.offsetX = next;
             mortarOffsetXRow.range.value = String(next);
             mortarOffsetXRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarOffsetYRow.range.addEventListener('input', () => {
             const next = clamp(mortarOffsetYRow.range.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.offsetY = next;
             mortarOffsetYRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarOffsetYRow.number.addEventListener('change', () => {
             const next = clamp(mortarOffsetYRow.number.value, -10.0, 10.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.layout ??= {};
             layer.materialVariation.brick.mortar.layout.offsetY = next;
             mortarOffsetYRow.range.value = String(next);
             mortarOffsetYRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarStrengthRow.range.addEventListener('input', () => {
             const next = clamp(mortarStrengthRow.range.value, 0.0, 2.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.strength = next;
             mortarStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarStrengthRow.number.addEventListener('change', () => {
             const next = clamp(mortarStrengthRow.number.value, 0.0, 2.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.strength = next;
             mortarStrengthRow.range.value = String(next);
             mortarStrengthRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarHueRow.range.addEventListener('input', () => {
             const next = clamp(mortarHueRow.range.value, -180.0, 180.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.hueDegrees = next;
             mortarHueRow.number.value = String(Math.round(next));
             onChange();
         });
         mortarHueRow.number.addEventListener('change', () => {
             const next = clamp(mortarHueRow.number.value, -180.0, 180.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.hueDegrees = next;
             mortarHueRow.range.value = String(next);
             mortarHueRow.number.value = String(Math.round(next));
             onChange();
         });
        
         mortarValueRow.range.addEventListener('input', () => {
             const next = clamp(mortarValueRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.value = next;
             mortarValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarValueRow.number.addEventListener('change', () => {
             const next = clamp(mortarValueRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.value = next;
             mortarValueRow.range.value = String(next);
             mortarValueRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarSaturationRow.range.addEventListener('input', () => {
             const next = clamp(mortarSaturationRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.saturation = next;
             mortarSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarSaturationRow.number.addEventListener('change', () => {
             const next = clamp(mortarSaturationRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.saturation = next;
             mortarSaturationRow.range.value = String(next);
             mortarSaturationRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarRoughnessRow.range.addEventListener('input', () => {
             const next = clamp(mortarRoughnessRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.roughness = next;
             mortarRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarRoughnessRow.number.addEventListener('change', () => {
             const next = clamp(mortarRoughnessRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.roughness = next;
             mortarRoughnessRow.range.value = String(next);
             mortarRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         mortarNormalRow.range.addEventListener('input', () => {
             const next = clamp(mortarNormalRow.range.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.normal = next;
             mortarNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
         mortarNormalRow.number.addEventListener('change', () => {
             const next = clamp(mortarNormalRow.number.value, -1.0, 1.0);
             layer.materialVariation.brick ??= {};
             layer.materialVariation.brick.mortar ??= {};
             layer.materialVariation.brick.mortar.normal = next;
             mortarNormalRow.range.value = String(next);
             mortarNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         detailToggle.input.addEventListener('change', () => {
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].enabled = !!detailToggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        detailStrengthRow.range.addEventListener('input', () => {
            const next = clamp(detailStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].intensity = next;
            detailStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailStrengthRow.number.addEventListener('change', () => {
            const next = clamp(detailStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].intensity = next;
            detailStrengthRow.range.value = String(next);
            detailStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailScaleRow.range.addEventListener('input', () => {
            const next = clamp(detailScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].scale = next;
            detailScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailScaleRow.number.addEventListener('change', () => {
            const next = clamp(detailScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].scale = next;
            detailScaleRow.range.value = String(next);
            detailScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailHueRow.range.addEventListener('input', () => {
            const next = clamp(detailHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].hueDegrees = next;
            detailHueRow.number.value = String(Math.round(next));
            onChange();
        });
        detailHueRow.number.addEventListener('change', () => {
            const next = clamp(detailHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].hueDegrees = next;
            detailHueRow.range.value = String(next);
            detailHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        detailValueRow.range.addEventListener('input', () => {
            const next = clamp(detailValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].value = next;
            detailValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailValueRow.number.addEventListener('change', () => {
            const next = clamp(detailValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].value = next;
            detailValueRow.range.value = String(next);
            detailValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        detailSaturationRow.range.addEventListener('input', () => {
            const next = clamp(detailSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].saturation = next;
            detailSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailSaturationRow.number.addEventListener('change', () => {
            const next = clamp(detailSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].saturation = next;
            detailSaturationRow.range.value = String(next);
            detailSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        detailRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(detailRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].roughness = next;
            detailRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(detailRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].roughness = next;
            detailRoughnessRow.range.value = String(next);
            detailRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        detailNormalRow.range.addEventListener('input', () => {
            const next = clamp(detailNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].normal = next;
            detailNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        detailNormalRow.number.addEventListener('change', () => {
            const next = clamp(detailNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[1] ??= {};
            layer.materialVariation.macroLayers[1].normal = next;
            detailNormalRow.range.value = String(next);
            detailNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macro2Toggle.input.addEventListener('change', () => {
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].enabled = !!macro2Toggle.input.checked;
            syncMatVarEnabled();
            onChange();
        });
        
        macro2StrengthRow.range.addEventListener('input', () => {
            const next = clamp(macro2StrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].intensity = next;
            macro2StrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macro2StrengthRow.number.addEventListener('change', () => {
            const next = clamp(macro2StrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].intensity = next;
            macro2StrengthRow.range.value = String(next);
            macro2StrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macro2ScaleRow.range.addEventListener('input', () => {
            const next = clamp(macro2ScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].scale = next;
            macro2ScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macro2ScaleRow.number.addEventListener('change', () => {
            const next = clamp(macro2ScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].scale = next;
            macro2ScaleRow.range.value = String(next);
            macro2ScaleRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         macro2CoverageRow.range.addEventListener('input', () => {
             const next = clamp(macro2CoverageRow.range.value, 0.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[2] ??= {};
             layer.materialVariation.macroLayers[2].coverage = next;
             macro2CoverageRow.number.value = formatFloat(next, 2);
             onChange();
         });
         macro2CoverageRow.number.addEventListener('change', () => {
             const next = clamp(macro2CoverageRow.number.value, 0.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[2] ??= {};
             layer.materialVariation.macroLayers[2].coverage = next;
             macro2CoverageRow.range.value = String(next);
             macro2CoverageRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         macro2HueRow.range.addEventListener('input', () => {
             const next = clamp(macro2HueRow.range.value, -180.0, 180.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].hueDegrees = next;
            macro2HueRow.number.value = String(Math.round(next));
            onChange();
        });
        macro2HueRow.number.addEventListener('change', () => {
            const next = clamp(macro2HueRow.number.value, -180.0, 180.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].hueDegrees = next;
            macro2HueRow.range.value = String(next);
            macro2HueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        macro2ValueRow.range.addEventListener('input', () => {
            const next = clamp(macro2ValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].value = next;
            macro2ValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macro2ValueRow.number.addEventListener('change', () => {
            const next = clamp(macro2ValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].value = next;
            macro2ValueRow.range.value = String(next);
            macro2ValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macro2SaturationRow.range.addEventListener('input', () => {
            const next = clamp(macro2SaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].saturation = next;
            macro2SaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macro2SaturationRow.number.addEventListener('change', () => {
            const next = clamp(macro2SaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].saturation = next;
            macro2SaturationRow.range.value = String(next);
            macro2SaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macro2RoughnessRow.range.addEventListener('input', () => {
            const next = clamp(macro2RoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].roughness = next;
            macro2RoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        macro2RoughnessRow.number.addEventListener('change', () => {
            const next = clamp(macro2RoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].roughness = next;
            macro2RoughnessRow.range.value = String(next);
            macro2RoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        macro2NormalRow.range.addEventListener('input', () => {
            const next = clamp(macro2NormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[2] ??= {};
            layer.materialVariation.macroLayers[2].normal = next;
            macro2NormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
         macro2NormalRow.number.addEventListener('change', () => {
             const next = clamp(macro2NormalRow.number.value, -1.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[2] ??= {};
             layer.materialVariation.macroLayers[2].normal = next;
             macro2NormalRow.range.value = String(next);
             macro2NormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         microToggle.input.addEventListener('change', () => {
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].enabled = !!microToggle.input.checked;
             syncMatVarEnabled();
             onChange();
         });
         microIntensityRow.range.addEventListener('input', () => {
             const next = clamp(microIntensityRow.range.value, 0.0, 2.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].intensity = next;
             microIntensityRow.number.value = formatFloat(next, 2);
             onChange();
         });
         microIntensityRow.number.addEventListener('change', () => {
             const next = clamp(microIntensityRow.number.value, 0.0, 2.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].intensity = next;
             microIntensityRow.range.value = String(next);
             microIntensityRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
        microScaleRow.range.addEventListener('input', () => {
            const next = clamp(microScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[3] ??= {};
            layer.materialVariation.macroLayers[3].scale = next;
            microScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        microScaleRow.number.addEventListener('change', () => {
            const next = clamp(microScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.macroLayers ??= [];
            layer.materialVariation.macroLayers[3] ??= {};
            layer.materialVariation.macroLayers[3].scale = next;
            microScaleRow.range.value = String(next);
            microScaleRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         microRoughnessRow.range.addEventListener('input', () => {
             const next = clamp(microRoughnessRow.range.value, -1.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].roughness = next;
             microRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
         microRoughnessRow.number.addEventListener('change', () => {
             const next = clamp(microRoughnessRow.number.value, -1.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].roughness = next;
             microRoughnessRow.range.value = String(next);
             microRoughnessRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         microNormalRow.range.addEventListener('input', () => {
             const next = clamp(microNormalRow.range.value, -1.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].normal = next;
             microNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
         microNormalRow.number.addEventListener('change', () => {
             const next = clamp(microNormalRow.number.value, -1.0, 1.0);
             layer.materialVariation.macroLayers ??= [];
             layer.materialVariation.macroLayers[3] ??= {};
             layer.materialVariation.macroLayers[3].normal = next;
             microNormalRow.range.value = String(next);
             microNormalRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         cracksToggle.input.addEventListener('change', () => {
             layer.materialVariation.cracksLayer ??= {};
             layer.materialVariation.cracksLayer.enabled = !!cracksToggle.input.checked;
             syncMatVarEnabled();
            onChange();
        });
        crackStrengthRow.range.addEventListener('input', () => {
            const next = clamp(crackStrengthRow.range.value, 0.0, 2.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.strength = next;
            crackStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackStrengthRow.number.addEventListener('change', () => {
            const next = clamp(crackStrengthRow.number.value, 0.0, 2.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.strength = next;
            crackStrengthRow.range.value = String(next);
            crackStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackScaleRow.range.addEventListener('input', () => {
            const next = clamp(crackScaleRow.range.value, 0.01, 20.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.scale = next;
            crackScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackScaleRow.number.addEventListener('change', () => {
            const next = clamp(crackScaleRow.number.value, 0.01, 20.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.scale = next;
            crackScaleRow.range.value = String(next);
            crackScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        crackHueRow.range.addEventListener('input', () => {
            const next = clamp(crackHueRow.range.value, -180.0, 180.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.hueDegrees = next;
            crackHueRow.number.value = String(Math.round(next));
            onChange();
        });
        crackHueRow.number.addEventListener('change', () => {
            const next = clamp(crackHueRow.number.value, -180.0, 180.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.hueDegrees = next;
            crackHueRow.range.value = String(next);
            crackHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        crackValueRow.range.addEventListener('input', () => {
            const next = clamp(crackValueRow.range.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.value = next;
            crackValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackValueRow.number.addEventListener('change', () => {
            const next = clamp(crackValueRow.number.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.value = next;
            crackValueRow.range.value = String(next);
            crackValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        crackSaturationRow.range.addEventListener('input', () => {
            const next = clamp(crackSaturationRow.range.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.saturation = next;
            crackSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackSaturationRow.number.addEventListener('change', () => {
            const next = clamp(crackSaturationRow.number.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.saturation = next;
            crackSaturationRow.range.value = String(next);
            crackSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        crackRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(crackRoughnessRow.range.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.roughness = next;
            crackRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(crackRoughnessRow.number.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.roughness = next;
            crackRoughnessRow.range.value = String(next);
            crackRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        crackNormalRow.range.addEventListener('input', () => {
            const next = clamp(crackNormalRow.range.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.normal = next;
            crackNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        crackNormalRow.number.addEventListener('change', () => {
            const next = clamp(crackNormalRow.number.value, -1.0, 1.0);
            layer.materialVariation.cracksLayer ??= {};
            layer.materialVariation.cracksLayer.normal = next;
            crackNormalRow.range.value = String(next);
            crackNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        syncMatVarEnabled();
        wallMatVarBasicsGroup.body.appendChild(document.createElement('div')).className = 'building-fab-hint';
        wallMatVarBasicsGroup.body.lastChild.textContent = 'Enable the variation system to add weathering and breakup.';
        parent.appendChild(wallMatVarGroup.details);
    };

    const appendRoofMaterialVariationUI = ({ parent, allow, scopeKey, layerId, layer, onChange: onChangeArg, onReRender: onReRenderArg, registerMiniController: registerArg } = {}) => {
        const onChange = typeof onChangeArg === 'function' ? onChangeArg : () => {};
        const onReRender = typeof onReRenderArg === 'function' ? onReRenderArg : () => {};
        const registerMiniController = typeof registerArg === 'function' ? registerArg : () => {};
        const detailsOpenByKey = detailsMap;
        const makeDetailsSection = makeDetailsSectionWithKey;
        const roofMatVarGroup = makeDetailsSection('Material variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar` });
        layer.roof.materialVariation ??= { enabled: false, seedOffset: 0 };
        const roofMatVarNormalized = normalizeMaterialVariationConfig(layer.roof.materialVariation, { root: MATERIAL_VARIATION_ROOT.SURFACE });
        
        const roofMatVarBasicsGroup = makeDetailsSection('Basics', { open: true, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:basics` });
        const roofMatVarMacroGroup = makeDetailsSection('Macro variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro` });
        const roofMatVarMidGroup = makeDetailsSection('Mid variation (patches)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:mid` });
        const roofMatVarMicroGroup = makeDetailsSection('Micro variation (surface response)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:micro` });
        const roofMatVarWeatherGroup = makeDetailsSection('Weathering', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:weather` });
        const roofMatVarBrickGroup = makeDetailsSection('Brick-specific', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:brick` });
        const roofMatVarAdvancedGroup = makeDetailsSection('Advanced', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:advanced` });
        
        roofMatVarGroup.body.appendChild(roofMatVarBasicsGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarMacroGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarMidGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarMicroGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarWeatherGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarBrickGroup.details);
        roofMatVarGroup.body.appendChild(roofMatVarAdvancedGroup.details);
        
        applyTooltip(
            roofMatVarGroup.label,
            tip(
                'Procedural material variation and weathering for this roof/surface layer.',
                'Start with Basics → Intensity and World scale.',
                'Too much: stacked effects look noisy or overly dirty.'
            )
        );
        addDetailsResetButton(roofMatVarGroup, { allow,
            onReset: () => {
                const prevEnabled = !!layer.roof.materialVariation.enabled;
                const prevSeedOffset = clampInt(layer.roof.materialVariation.seedOffset ?? 0, -9999, 9999);
                const preset = getDefaultMaterialVariationPreset(MATERIAL_VARIATION_ROOT.SURFACE);
                layer.roof.materialVariation = { ...preset, enabled: prevEnabled, seedOffset: prevSeedOffset };
                onReRender();
                onChange();
            }
        });
        applyTooltip(
            roofMatVarBasicsGroup.label,
            tip(
                'Global controls that affect all enabled strategies.',
                'Start here before touching the deeper groups.',
                'Too much: high intensity + small world scale looks like grain/noise.'
            )
        );
        applyTooltip(
            roofMatVarMacroGroup.label,
            tip(
                'Large-scale breakup to fight repeating textures.',
                'Start with Intensity + Scale on Macro layer 1.',
                'Too much: obvious cloudy blotches.'
            )
        );
        applyTooltip(
            roofMatVarMidGroup.label,
            tip(
                'Patchy mid-scale variation (repairs/batches/fade).',
                'Use sparingly for subtle material history.',
                'Too much: looks like painted camouflage.'
            )
        );
        applyTooltip(
            roofMatVarMicroGroup.label,
            tip(
                'High-frequency variation for surface response (mostly roughness/normal).',
                'Use small amounts to avoid flat, CG-looking materials.',
                'Too much: sparkly, noisy specular.'
            )
        );
        applyTooltip(
            roofMatVarWeatherGroup.label,
            tip(
                'Purpose-driven weathering: runoff streaks, top deposits, ground grime, edge wear, cracks.',
                'Prefer one or two subtle effects rather than everything at once.',
                'Too much: uniformly dirty surfaces with no believable story.'
            )
        );
        applyTooltip(
            roofMatVarBrickGroup.label,
            tip(
                'Brick-specific controls (bonding / per-brick / mortar).',
                'Use only for brick-like materials.',
                'Too much: patterning becomes more obvious than the base texture.'
            )
        );
        applyTooltip(
            roofMatVarAdvancedGroup.label,
            tip(
                'Advanced controls (projection/space/debug/perf).',
                'Usually leave defaults.',
                'Too much: can cause distortion or artifacts.'
            )
        );
        
        const roofMatVarToggle = makeToggleRow('Enable variation');
        roofMatVarToggle.input.checked = !!roofMatVarNormalized.enabled;
        roofMatVarToggle.input.disabled = !allow;
        applyToggleRowMeta(roofMatVarToggle, {
            mustHave: true,
            tooltip: tip(
                'Turns on the variation system for this roof/surface layer.',
                'Typical: enable for subtle breakup and weathering.',
                'Too much: high intensity across many strategies looks noisy/dirty.'
            )
        });
        roofMatVarBasicsGroup.body.appendChild(roofMatVarToggle.toggle);
        
        const roofSeedOffsetRow = makeRangeRow('Seed offset');
        roofSeedOffsetRow.range.min = '-9999';
        roofSeedOffsetRow.range.max = '9999';
        roofSeedOffsetRow.range.step = '1';
        roofSeedOffsetRow.number.min = '-9999';
        roofSeedOffsetRow.number.max = '9999';
        roofSeedOffsetRow.number.step = '1';
        roofSeedOffsetRow.range.value = String(layer.roof.materialVariation.seedOffset ?? 0);
        roofSeedOffsetRow.number.value = String(layer.roof.materialVariation.seedOffset ?? 0);
        applyRangeRowMeta(roofSeedOffsetRow, {
            tooltip: tip(
                'Offsets the random seed for this layer.',
                'Use to make the same style look different per building.',
                'Too much: not harmful, but makes iteration harder to compare.'
            )
        });
        roofMatVarBasicsGroup.body.appendChild(roofSeedOffsetRow.row);
        
        const roofIntensityRow = makeRangeRow('Intensity');
        roofIntensityRow.range.min = '0';
        roofIntensityRow.range.max = '2';
        roofIntensityRow.range.step = '0.01';
        roofIntensityRow.number.min = '0';
        roofIntensityRow.number.max = '2';
        roofIntensityRow.number.step = '0.01';
        roofIntensityRow.range.value = String(roofMatVarNormalized.globalIntensity);
        roofIntensityRow.number.value = formatFloat(roofMatVarNormalized.globalIntensity, 2);
        applyRangeRowMeta(roofIntensityRow, {
            mustHave: true,
            tooltip: tip(
                'Overall multiplier for all enabled variation strategies.',
                'Typical: 0.5–1.5 for subtle breakup.',
                'Too much: everything becomes noisy and over-processed.'
            )
        });
        roofMatVarBasicsGroup.body.appendChild(roofIntensityRow.row);
        
        const roofScaleRow = makeRangeRow('World scale');
        roofScaleRow.range.min = '0.05';
        roofScaleRow.range.max = '4';
        roofScaleRow.range.step = '0.01';
        roofScaleRow.number.min = '0.05';
        roofScaleRow.number.max = '4';
        roofScaleRow.number.step = '0.01';
        roofScaleRow.range.value = String(roofMatVarNormalized.worldSpaceScale);
        roofScaleRow.number.value = formatFloat(roofMatVarNormalized.worldSpaceScale, 2);
        applyRangeRowMeta(roofScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Sets the world-space scale for the procedural patterns.',
                'Lower = larger features; higher = smaller features.',
                'Too much: very high values look like grain/noise.'
            )
         });
         roofMatVarBasicsGroup.body.appendChild(roofScaleRow.row);
        
         const roofAoAmountRow = makeRangeRow('AO amount');
         roofAoAmountRow.range.min = '0';
         roofAoAmountRow.range.max = '1';
        roofAoAmountRow.range.step = '0.01';
        roofAoAmountRow.number.min = '0';
        roofAoAmountRow.number.max = '1';
        roofAoAmountRow.number.step = '0.01';
        roofAoAmountRow.range.value = String(roofMatVarNormalized.aoAmount);
        roofAoAmountRow.number.value = formatFloat(roofMatVarNormalized.aoAmount, 2);
        applyRangeRowMeta(roofAoAmountRow, {
            tooltip: tip(
                'Ambient occlusion influence inside the variation system.',
                'Typical: 0.30–0.70 depending on how strong you want crevices.',
                'Too much: everything looks dirty and crushed.'
            )
        });
        roofMatVarBasicsGroup.body.appendChild(roofAoAmountRow.row);
        
        const roofMatVarSpaceRow = document.createElement('div');
        roofMatVarSpaceRow.className = 'building-fab-row building-fab-row-wide';
        const roofMatVarSpaceLabel = document.createElement('div');
        roofMatVarSpaceLabel.className = 'building-fab-row-label';
        roofMatVarSpaceLabel.textContent = 'Space';
        const roofMatVarSpaceSelect = document.createElement('select');
        roofMatVarSpaceSelect.className = 'building-fab-select';
        for (const v of ['world', 'object']) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v === 'object' ? 'Object space (sticks to mesh)' : 'World space (sticks to scene)';
            roofMatVarSpaceSelect.appendChild(opt);
        }
        roofMatVarSpaceSelect.value = roofMatVarNormalized.space === 'object' ? 'object' : 'world';
        roofMatVarSpaceRow.appendChild(roofMatVarSpaceLabel);
        roofMatVarSpaceRow.appendChild(roofMatVarSpaceSelect);
        applySelectRowMeta(
            { label: roofMatVarSpaceLabel, select: roofMatVarSpaceSelect },
            {
                tooltip: tip(
                    'Chooses the coordinate space for the procedural patterns.',
                    'World: stable across objects; Object: sticks to the mesh (good for moving parts).',
                    'Too much: Object space can reveal stretching on low-UV assets.'
                )
            }
        );
        roofMatVarAdvancedGroup.body.appendChild(roofMatVarSpaceRow);
        
        const roofObjectScaleRow = makeRangeRow('Object scale');
        roofObjectScaleRow.range.min = '0.05';
        roofObjectScaleRow.range.max = '4';
        roofObjectScaleRow.range.step = '0.01';
        roofObjectScaleRow.number.min = '0.05';
        roofObjectScaleRow.number.max = '4';
        roofObjectScaleRow.number.step = '0.01';
        roofObjectScaleRow.range.value = String(roofMatVarNormalized.objectSpaceScale);
        roofObjectScaleRow.number.value = formatFloat(roofMatVarNormalized.objectSpaceScale, 2);
        applyRangeRowMeta(roofObjectScaleRow, {
            tooltip: tip(
                'Scale used when Space is set to Object.',
                'Lower = larger features; higher = smaller features.',
                'Too much: very high values look like grain/noise.'
            )
        });
        roofMatVarAdvancedGroup.body.appendChild(roofObjectScaleRow.row);
        
        const roofMatVarNormalMapGroup = makeDetailsSection('Normal map', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:normalMap` });
        applyTooltip(
            roofMatVarNormalMapGroup.label,
            tip(
                'Per-layer normal map channel fixes.',
                'Typical: flip Y (green) if the normal map is authored for a different convention (DirectX vs OpenGL).',
                'Use with care: flipping X/Z can make lighting look inside-out.'
            )
        );
        
        const roofMatVarNormalFlipXToggle = makeToggleRow('Flip normal X (red)');
        roofMatVarNormalFlipXToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipX;
        roofMatVarNormalFlipXToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
        applyToggleRowMeta(roofMatVarNormalFlipXToggle, {
            tooltip: tip(
                'Flips the red channel of the normal map.',
                'Use if lighting looks mirrored left/right.',
                'Not commonly needed for standard OpenGL normal maps.'
            )
        });
        roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipXToggle.toggle);
        
        const roofMatVarNormalFlipYToggle = makeToggleRow('Flip normal Y (green)');
        roofMatVarNormalFlipYToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipY;
        roofMatVarNormalFlipYToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
        applyToggleRowMeta(roofMatVarNormalFlipYToggle, {
            tooltip: tip(
                'Flips the green channel of the normal map.',
                'Typical: enable when using DirectX-authored normal maps.',
                'If shading becomes worse, turn it back off.'
            )
        });
        roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipYToggle.toggle);
        
        const roofMatVarNormalFlipZToggle = makeToggleRow('Flip normal Z (blue)');
        roofMatVarNormalFlipZToggle.input.checked = !!roofMatVarNormalized.normalMap?.flipZ;
        roofMatVarNormalFlipZToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
        applyToggleRowMeta(roofMatVarNormalFlipZToggle, {
            tooltip: tip(
                'Flips the blue channel of the normal map.',
                'Rarely needed.',
                'If enabled, lighting can look inverted.'
            )
        });
        roofMatVarNormalMapGroup.body.appendChild(roofMatVarNormalFlipZToggle.toggle);
        
        roofMatVarAdvancedGroup.body.appendChild(roofMatVarNormalMapGroup.details);
        
        const roofMacro0 = roofMatVarNormalized.macroLayers?.[0] ?? null;
        const roofMacroGroup = makeDetailsSection('Macro layer 1', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro0` });
        applyTooltip(
            roofMacroGroup.label,
            tip(
                'Macro layer 1 (Macro A): primary large-scale breakup.',
                'Start with Intensity + Scale for subtle variation.',
                'Too much: big cloudy blobs that overpower the base material.'
            )
        );
        const roofMacroToggle = makeToggleRow('Enable macro layer 1');
        roofMacroToggle.input.checked = !!roofMacro0?.enabled;
        roofMacroToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
        applyToggleRowMeta(roofMacroToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables Macro A (large-scale breakup).',
                'Typical: enabled for roofs/surfaces to reduce repetition.',
                'Too much: combined with high intensity can look blotchy.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroToggle.toggle);
        
        const roofMacroIntensityRow = makeRangeRow('Intensity');
        roofMacroIntensityRow.range.min = '0';
        roofMacroIntensityRow.range.max = '2';
        roofMacroIntensityRow.range.step = '0.01';
        roofMacroIntensityRow.number.min = '0';
        roofMacroIntensityRow.number.max = '2';
        roofMacroIntensityRow.number.step = '0.01';
        roofMacroIntensityRow.range.value = String(roofMacro0?.intensity ?? 0.0);
        roofMacroIntensityRow.number.value = formatFloat(roofMacro0?.intensity ?? 0.0, 2);
        applyRangeRowMeta(roofMacroIntensityRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of Macro A.',
                'Typical: 0.2–1.0 (depending on the material).',
                'Too much: obvious blotches and loss of texture identity.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroIntensityRow.row);
        
        const roofMacroScaleRow = makeRangeRow('Scale');
        roofMacroScaleRow.range.min = '0.01';
        roofMacroScaleRow.range.max = '20';
        roofMacroScaleRow.range.step = '0.01';
        roofMacroScaleRow.number.min = '0.01';
        roofMacroScaleRow.number.max = '20';
        roofMacroScaleRow.number.step = '0.01';
        roofMacroScaleRow.range.value = String(roofMacro0?.scale ?? 1.0);
        roofMacroScaleRow.number.value = formatFloat(roofMacro0?.scale ?? 1.0, 2);
        applyRangeRowMeta(roofMacroScaleRow, {
            mustHave: true,
            tooltip: tip(
                'Frequency of Macro A (higher = smaller features).',
                'Typical: 0.1–5 depending on your tile size.',
                'Too much: looks like noisy speckling instead of macro breakup.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroScaleRow.row);
        
        const roofMacroHueRow = makeRangeRow('Hue shift (deg)');
        roofMacroHueRow.range.min = '-180';
        roofMacroHueRow.range.max = '180';
        roofMacroHueRow.range.step = '1';
        roofMacroHueRow.number.min = '-180';
        roofMacroHueRow.number.max = '180';
        roofMacroHueRow.number.step = '1';
        roofMacroHueRow.range.value = String(roofMacro0?.hueDegrees ?? 0.0);
        roofMacroHueRow.number.value = String(Math.round(roofMacro0?.hueDegrees ?? 0.0));
        applyRangeRowMeta(roofMacroHueRow, {
            tooltip: tip(
                'Hue shift for Macro A.',
                'Typical: ±5–20° for subtle hue drift.',
                'Too much: unnatural rainbow color variation.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroHueRow.row);
        
        const roofMacroValueRow = makeRangeRow('Value');
        roofMacroValueRow.range.min = '-1';
        roofMacroValueRow.range.max = '1';
        roofMacroValueRow.range.step = '0.01';
        roofMacroValueRow.number.min = '-1';
        roofMacroValueRow.number.max = '1';
        roofMacroValueRow.number.step = '0.01';
        roofMacroValueRow.range.value = String(roofMacro0?.value ?? 0.0);
        roofMacroValueRow.number.value = formatFloat(roofMacro0?.value ?? 0.0, 2);
        applyRangeRowMeta(roofMacroValueRow, {
            tooltip: tip(
                'Brightness/value shift for Macro A.',
                'Typical: small positive/negative values.',
                'Too much: strong patchiness and contrast.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroValueRow.row);
        
        const roofMacroSaturationRow = makeRangeRow('Saturation');
        roofMacroSaturationRow.range.min = '-1';
        roofMacroSaturationRow.range.max = '1';
        roofMacroSaturationRow.range.step = '0.01';
        roofMacroSaturationRow.number.min = '-1';
        roofMacroSaturationRow.number.max = '1';
        roofMacroSaturationRow.number.step = '0.01';
        roofMacroSaturationRow.range.value = String(roofMacro0?.saturation ?? 0.0);
        roofMacroSaturationRow.number.value = formatFloat(roofMacro0?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofMacroSaturationRow, {
            tooltip: tip(
                'Saturation shift for Macro A.',
                'Typical: subtle.',
                'Too much: cartoonish saturation swings or desaturated blotches.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroSaturationRow.row);
        
        const roofMacroRoughnessRow = makeRangeRow('Roughness');
        roofMacroRoughnessRow.range.min = '-1';
        roofMacroRoughnessRow.range.max = '1';
        roofMacroRoughnessRow.range.step = '0.01';
        roofMacroRoughnessRow.number.min = '-1';
        roofMacroRoughnessRow.number.max = '1';
        roofMacroRoughnessRow.number.step = '0.01';
        roofMacroRoughnessRow.range.value = String(roofMacro0?.roughness ?? 0.0);
        roofMacroRoughnessRow.number.value = formatFloat(roofMacro0?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofMacroRoughnessRow, {
            tooltip: tip(
                'Roughness shift for Macro A.',
                'Typical: subtle (helps break uniform specular).',
                'Too much: sparkly highlights or overly matte patches.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroRoughnessRow.row);
        
        const roofMacroNormalRow = makeRangeRow('Normal');
        roofMacroNormalRow.range.min = '-1';
        roofMacroNormalRow.range.max = '1';
        roofMacroNormalRow.range.step = '0.01';
        roofMacroNormalRow.number.min = '-1';
        roofMacroNormalRow.number.max = '1';
        roofMacroNormalRow.number.step = '0.01';
        roofMacroNormalRow.range.value = String(roofMacro0?.normal ?? 0.0);
        roofMacroNormalRow.number.value = formatFloat(roofMacro0?.normal ?? 0.0, 2);
        applyRangeRowMeta(roofMacroNormalRow, {
            tooltip: tip(
                'Normal shift for Macro A.',
                'Typical: small (mostly leave at 0).',
                'Too much: warping/bumpy shading artifacts.'
            )
        });
        roofMacroGroup.body.appendChild(roofMacroNormalRow.row);
        roofMatVarMacroGroup.body.appendChild(roofMacroGroup.details);
        
        const roofWearBottom = roofMatVarNormalized.wearBottom ?? null;
        const roofGrimeGroup = makeDetailsSection('Bottom wear', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearBottom` });
        applyTooltip(
            roofGrimeGroup.label,
            tip(
                'Ground grime band near the bottom of the surface.',
                'Great for subtle splashback and dirt accumulation.',
                'Too much: the whole surface looks uniformly dirty.'
            )
        );
        const roofGrimeToggle = makeToggleRow('Enable bottom wear');
        roofGrimeToggle.input.checked = !!roofWearBottom?.enabled;
        roofGrimeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
        applyToggleRowMeta(roofGrimeToggle, {
            mustHave: true,
            tooltip: tip(
                'Enables bottom wear/grime.',
                'Typical: enable with low Strength + narrow Width.',
                'Too much: a thick dirty band that dominates the surface.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeToggle.toggle);
        const roofGrimeStrengthRow = makeRangeRow('Strength');
        roofGrimeStrengthRow.range.min = '0';
        roofGrimeStrengthRow.range.max = '2';
        roofGrimeStrengthRow.range.step = '0.01';
        roofGrimeStrengthRow.number.min = '0';
        roofGrimeStrengthRow.number.max = '2';
        roofGrimeStrengthRow.number.step = '0.01';
        roofGrimeStrengthRow.range.value = String(roofWearBottom?.intensity ?? 0.0);
        roofGrimeStrengthRow.number.value = formatFloat(roofWearBottom?.intensity ?? 0.0, 2);
        applyRangeRowMeta(roofGrimeStrengthRow, {
            mustHave: true,
            tooltip: tip(
                'Strength of bottom grime.',
                'Typical: 0.05–0.30.',
                'Too much: looks like a painted dark band.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeStrengthRow.row);
        
        const roofGrimeWidthRow = makeRangeRow('Width');
        roofGrimeWidthRow.range.min = '0';
        roofGrimeWidthRow.range.max = '1';
        roofGrimeWidthRow.range.step = '0.01';
        roofGrimeWidthRow.number.min = '0';
        roofGrimeWidthRow.number.max = '1';
        roofGrimeWidthRow.number.step = '0.01';
        roofGrimeWidthRow.range.value = String(roofWearBottom?.width ?? 0.5);
        roofGrimeWidthRow.number.value = formatFloat(roofWearBottom?.width ?? 0.5, 2);
        applyRangeRowMeta(roofGrimeWidthRow, {
            mustHave: true,
            tooltip: tip(
                'Height of the bottom grime band (0–1 relative).',
                'Typical: 0.10–0.40.',
                'Too much: grime climbs too high and looks unrealistic.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeWidthRow.row);
        
        const roofGrimeScaleRow = makeRangeRow('Scale');
        roofGrimeScaleRow.range.min = '0.01';
        roofGrimeScaleRow.range.max = '20';
        roofGrimeScaleRow.range.step = '0.01';
        roofGrimeScaleRow.number.min = '0.01';
        roofGrimeScaleRow.number.max = '20';
        roofGrimeScaleRow.number.step = '0.01';
        roofGrimeScaleRow.range.value = String(roofWearBottom?.scale ?? 1.0);
        roofGrimeScaleRow.number.value = formatFloat(roofWearBottom?.scale ?? 1.0, 2);
        applyRangeRowMeta(roofGrimeScaleRow, {
            tooltip: tip(
                'Noise scale for breaking up the grime band.',
                'Typical: 0.5–2.0.',
                'Too much: noisy, speckled dirt.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeScaleRow.row);
        
        const roofGrimeHueRow = makeRangeRow('Hue shift (deg)');
        roofGrimeHueRow.range.min = '-180';
        roofGrimeHueRow.range.max = '180';
        roofGrimeHueRow.range.step = '1';
        roofGrimeHueRow.number.min = '-180';
        roofGrimeHueRow.number.max = '180';
        roofGrimeHueRow.number.step = '1';
        roofGrimeHueRow.range.value = String(roofWearBottom?.hueDegrees ?? 0.0);
        roofGrimeHueRow.number.value = String(Math.round(roofWearBottom?.hueDegrees ?? 0.0));
        applyRangeRowMeta(roofGrimeHueRow, {
            tooltip: tip(
                'Hue shift applied to bottom grime.',
                'Typical: subtle (often 0).',
                'Too much: colored dirt band.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeHueRow.row);
        
        const roofGrimeValueRow = makeRangeRow('Value');
        roofGrimeValueRow.range.min = '-1';
        roofGrimeValueRow.range.max = '1';
        roofGrimeValueRow.range.step = '0.01';
        roofGrimeValueRow.number.min = '-1';
        roofGrimeValueRow.number.max = '1';
        roofGrimeValueRow.number.step = '0.01';
        roofGrimeValueRow.range.value = String(roofWearBottom?.value ?? 0.0);
        roofGrimeValueRow.number.value = formatFloat(roofWearBottom?.value ?? 0.0, 2);
        applyRangeRowMeta(roofGrimeValueRow, {
            tooltip: tip(
                'Value/brightness shift applied to bottom grime.',
                'Typical: slightly darker for dirt.',
                'Too much: heavy black band.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeValueRow.row);
        
        const roofGrimeSaturationRow = makeRangeRow('Saturation');
        roofGrimeSaturationRow.range.min = '-1';
        roofGrimeSaturationRow.range.max = '1';
        roofGrimeSaturationRow.range.step = '0.01';
        roofGrimeSaturationRow.number.min = '-1';
        roofGrimeSaturationRow.number.max = '1';
        roofGrimeSaturationRow.number.step = '0.01';
        roofGrimeSaturationRow.range.value = String(roofWearBottom?.saturation ?? 0.0);
        roofGrimeSaturationRow.number.value = formatFloat(roofWearBottom?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofGrimeSaturationRow, {
            tooltip: tip(
                'Saturation shift applied to bottom grime.',
                'Typical: small negative saturation for dirt.',
                'Too much: unnatural colored dirt.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeSaturationRow.row);
        
        const roofGrimeRoughnessRow = makeRangeRow('Roughness');
        roofGrimeRoughnessRow.range.min = '-1';
        roofGrimeRoughnessRow.range.max = '1';
        roofGrimeRoughnessRow.range.step = '0.01';
        roofGrimeRoughnessRow.number.min = '-1';
        roofGrimeRoughnessRow.number.max = '1';
        roofGrimeRoughnessRow.number.step = '0.01';
        roofGrimeRoughnessRow.range.value = String(roofWearBottom?.roughness ?? 0.0);
        roofGrimeRoughnessRow.number.value = formatFloat(roofWearBottom?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofGrimeRoughnessRow, {
            tooltip: tip(
                'Roughness shift applied to bottom grime.',
                'Typical: slightly rougher.',
                'Too much: noisy or chalky specular response.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeRoughnessRow.row);
        
        const roofGrimeNormalRow = makeRangeRow('Normal');
        roofGrimeNormalRow.range.min = '-1';
        roofGrimeNormalRow.range.max = '1';
        roofGrimeNormalRow.range.step = '0.01';
        roofGrimeNormalRow.number.min = '-1';
        roofGrimeNormalRow.number.max = '1';
        roofGrimeNormalRow.number.step = '0.01';
        roofGrimeNormalRow.range.value = String(roofWearBottom?.normal ?? 0.0);
        roofGrimeNormalRow.number.value = formatFloat(roofWearBottom?.normal ?? 0.0, 2);
        applyRangeRowMeta(roofGrimeNormalRow, {
            tooltip: tip(
                'Normal shift applied to bottom grime.',
                'Typical: 0.',
                'Too much: bumpy artifacts in the grime band.'
            )
        });
        roofGrimeGroup.body.appendChild(roofGrimeNormalRow.row);
        roofMatVarWeatherGroup.body.appendChild(roofGrimeGroup.details);
        
         const roofStreaksGroup = makeDetailsSection('Streaks', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:streaks` });
         applyTooltip(
             roofStreaksGroup.label,
             tip(
                 'Runoff streaks and drip marks (gravity-aligned).',
                 'Good for subtle staining and variation directionality.',
                 'Too much: surfaces look uniformly dirty and overdone.'
             )
         );
         const roofStreaksToggle = makeToggleRow('Enable streaks');
         roofStreaksToggle.input.checked = !!roofMatVarNormalized.streaks.enabled;
         roofStreaksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofStreaksToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables gravity-aligned streaking/runoff.',
                 'Typical: enable with low Strength for realism.',
                 'Too much: obvious drips on every surface.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreaksToggle.toggle);
         const roofStreakStrengthRow = makeRangeRow('Strength');
        roofStreakStrengthRow.range.min = '0';
        roofStreakStrengthRow.range.max = '2';
        roofStreakStrengthRow.range.step = '0.01';
        roofStreakStrengthRow.number.min = '0';
        roofStreakStrengthRow.number.max = '2';
         roofStreakStrengthRow.number.step = '0.01';
         roofStreakStrengthRow.range.value = String(roofMatVarNormalized.streaks.strength);
         roofStreakStrengthRow.number.value = formatFloat(roofMatVarNormalized.streaks.strength, 2);
         applyRangeRowMeta(roofStreakStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of streaking/runoff.',
                 'Typical: 0.05–0.30 for subtle staining.',
                 'Too much: heavy grime everywhere.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakStrengthRow.row);
         const roofStreakScaleRow = makeRangeRow('Scale');
        roofStreakScaleRow.range.min = '0.01';
        roofStreakScaleRow.range.max = '20';
        roofStreakScaleRow.range.step = '0.01';
        roofStreakScaleRow.number.min = '0.01';
         roofStreakScaleRow.number.max = '20';
         roofStreakScaleRow.number.step = '0.01';
         roofStreakScaleRow.range.value = String(roofMatVarNormalized.streaks.scale);
         roofStreakScaleRow.number.value = formatFloat(roofMatVarNormalized.streaks.scale, 2);
         applyRangeRowMeta(roofStreakScaleRow, {
             mustHave: true,
             tooltip: tip(
                 'Size of streak features (higher = smaller streak detail).',
                 'Typical: 0.3–2.0 depending on surface size.',
                 'Too much: tiny scale reads as noisy speckles.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakScaleRow.row);
        
        const roofStreakLedgeStrengthRow = makeRangeRow('Ledge strength');
        roofStreakLedgeStrengthRow.range.min = '0';
        roofStreakLedgeStrengthRow.range.max = '2';
        roofStreakLedgeStrengthRow.range.step = '0.01';
        roofStreakLedgeStrengthRow.number.min = '0';
        roofStreakLedgeStrengthRow.number.max = '2';
         roofStreakLedgeStrengthRow.number.step = '0.01';
         roofStreakLedgeStrengthRow.range.value = String(roofMatVarNormalized.streaks.ledgeStrength);
         roofStreakLedgeStrengthRow.number.value = formatFloat(roofMatVarNormalized.streaks.ledgeStrength, 2);
         applyRangeRowMeta(roofStreakLedgeStrengthRow, {
             tooltip: tip(
                 'Extra streaking under ledges/edges.',
                 'Typical: small values (often 0).',
                 'Too much: zebra stripes under every edge.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakLedgeStrengthRow.row);
        
        const roofStreakLedgeScaleRow = makeRangeRow('Ledge scale');
        roofStreakLedgeScaleRow.range.min = '0';
        roofStreakLedgeScaleRow.range.max = '20';
        roofStreakLedgeScaleRow.range.step = '0.1';
        roofStreakLedgeScaleRow.number.min = '0';
          roofStreakLedgeScaleRow.number.max = '20';
         roofStreakLedgeScaleRow.number.step = '0.1';
         roofStreakLedgeScaleRow.range.value = String(roofMatVarNormalized.streaks.ledgeScale);
         roofStreakLedgeScaleRow.number.value = formatFloat(roofMatVarNormalized.streaks.ledgeScale, 1);
         applyRangeRowMeta(roofStreakLedgeScaleRow, {
             tooltip: tip(
                 'Frequency of ledge streak detail.',
                 'Typical: leave default unless you use ledge strength.',
                 'Too much: repetitive banding under edges.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakLedgeScaleRow.row);
        
        const roofStreakHueRow = makeRangeRow('Hue shift (deg)');
        roofStreakHueRow.range.min = '-180';
        roofStreakHueRow.range.max = '180';
        roofStreakHueRow.range.step = '1';
        roofStreakHueRow.number.min = '-180';
         roofStreakHueRow.number.max = '180';
         roofStreakHueRow.number.step = '1';
         roofStreakHueRow.range.value = String(roofMatVarNormalized.streaks.hueDegrees);
         roofStreakHueRow.number.value = String(Math.round(roofMatVarNormalized.streaks.hueDegrees));
         applyRangeRowMeta(roofStreakHueRow, {
             tooltip: tip(
                 'Hue shift applied inside streaks.',
                 'Typical: subtle warm/cool shift.',
                 'Too much: colored paint-like drips.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakHueRow.row);
        
        const roofStreakValueRow = makeRangeRow('Value');
        roofStreakValueRow.range.min = '-1';
        roofStreakValueRow.range.max = '1';
        roofStreakValueRow.range.step = '0.01';
        roofStreakValueRow.number.min = '-1';
        roofStreakValueRow.number.max = '1';
        roofStreakValueRow.number.step = '0.01';
        roofStreakValueRow.range.value = String(roofMatVarNormalized.streaks.value ?? 0.0);
        roofStreakValueRow.number.value = formatFloat(roofMatVarNormalized.streaks.value ?? 0.0, 2);
        applyRangeRowMeta(roofStreakValueRow, {
             tooltip: tip(
                 'Brightness/value shift inside streaks.',
                 'Typical: slightly darker for grime or slightly brighter for chalky deposits.',
                 'Too much: harsh painted streaks.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakValueRow.row);
        
        const roofStreakSaturationRow = makeRangeRow('Saturation');
        roofStreakSaturationRow.range.min = '-1';
        roofStreakSaturationRow.range.max = '1';
        roofStreakSaturationRow.range.step = '0.01';
        roofStreakSaturationRow.number.min = '-1';
        roofStreakSaturationRow.number.max = '1';
        roofStreakSaturationRow.number.step = '0.01';
        roofStreakSaturationRow.range.value = String(roofMatVarNormalized.streaks.saturation ?? 0.0);
        roofStreakSaturationRow.number.value = formatFloat(roofMatVarNormalized.streaks.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofStreakSaturationRow, {
             tooltip: tip(
                 'Saturation shift inside streaks.',
                 'Typical: small negative saturation for grime.',
                 'Too much: colored streaks that look like paint.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakSaturationRow.row);
        
        const roofStreakRoughnessRow = makeRangeRow('Roughness');
        roofStreakRoughnessRow.range.min = '-1';
        roofStreakRoughnessRow.range.max = '1';
        roofStreakRoughnessRow.range.step = '0.01';
        roofStreakRoughnessRow.number.min = '-1';
        roofStreakRoughnessRow.number.max = '1';
        roofStreakRoughnessRow.number.step = '0.01';
        roofStreakRoughnessRow.range.value = String(roofMatVarNormalized.streaks.roughness ?? 0.0);
        roofStreakRoughnessRow.number.value = formatFloat(roofMatVarNormalized.streaks.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofStreakRoughnessRow, {
             tooltip: tip(
                 'Roughness shift inside streaks.',
                 'Typical: slightly rougher for dried deposits.',
                 'Too much: inconsistent specular that reads as noise.'
             )
         });
         roofStreaksGroup.body.appendChild(roofStreakRoughnessRow.row);
        
        const roofStreakNormalRow = makeRangeRow('Normal');
        roofStreakNormalRow.range.min = '-1';
        roofStreakNormalRow.range.max = '1';
        roofStreakNormalRow.range.step = '0.01';
        roofStreakNormalRow.number.min = '-1';
        roofStreakNormalRow.number.max = '1';
        roofStreakNormalRow.number.step = '0.01';
        roofStreakNormalRow.range.value = String(roofMatVarNormalized.streaks.normal ?? 0.0);
        roofStreakNormalRow.number.value = formatFloat(roofMatVarNormalized.streaks.normal ?? 0.0, 2);
        applyRangeRowMeta(roofStreakNormalRow, {
              tooltip: tip(
                  'Normal shift inside streaks.',
                  'Typical: 0 (leave off unless you need stronger texture response).',
                  'Too much: bumpy streak artifacts.'
              )
          });
          roofStreaksGroup.body.appendChild(roofStreakNormalRow.row);
         roofMatVarWeatherGroup.body.appendChild(roofStreaksGroup.details);
        
          const roofExposure = roofMatVarNormalized.exposure ?? null;
          const roofExposureGroup = makeDetailsSection('Orientation exposure', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:exposure` });
          applyTooltip(
              roofExposureGroup.label,
              tip(
                  'Directional exposure based on surface orientation (sun bleaching / windward rain).',
                  'Use subtle Strength and tune Exponent to control falloff.',
                  'Too much: one side of the building looks unnaturally different.'
              )
          );
          const roofExposureToggle = makeToggleRow('Enable exposure');
          roofExposureToggle.input.checked = !!roofExposure?.enabled;
          roofExposureToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
          applyToggleRowMeta(roofExposureToggle, {
              mustHave: true,
              tooltip: tip(
                  'Enables orientation-based exposure.',
                  'Typical: on for sun bleaching or windward staining.',
                  'Too much: a harsh split between directions.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureToggle.toggle);
        
         const roofExposureStrengthRow = makeRangeRow('Strength');
         roofExposureStrengthRow.range.min = '0';
         roofExposureStrengthRow.range.max = '2';
         roofExposureStrengthRow.range.step = '0.01';
         roofExposureStrengthRow.number.min = '0';
         roofExposureStrengthRow.number.max = '2';
          roofExposureStrengthRow.number.step = '0.01';
          roofExposureStrengthRow.range.value = String(roofExposure?.strength ?? 0.0);
          roofExposureStrengthRow.number.value = formatFloat(roofExposure?.strength ?? 0.0, 2);
          applyRangeRowMeta(roofExposureStrengthRow, {
              mustHave: true,
              tooltip: tip(
                  'Strength of the exposure mask.',
                  'Typical: 0.05–0.30.',
                  'Too much: strong directional discoloration.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureStrengthRow.row);
        
         const roofExposureExponentRow = makeRangeRow('Exponent');
         roofExposureExponentRow.range.min = '0.1';
         roofExposureExponentRow.range.max = '8';
         roofExposureExponentRow.range.step = '0.01';
         roofExposureExponentRow.number.min = '0.1';
          roofExposureExponentRow.number.max = '8';
          roofExposureExponentRow.number.step = '0.01';
          roofExposureExponentRow.range.value = String(roofExposure?.exponent ?? 1.6);
          roofExposureExponentRow.number.value = formatFloat(roofExposure?.exponent ?? 1.6, 2);
          applyRangeRowMeta(roofExposureExponentRow, {
              tooltip: tip(
                  'Sharpness of the direction falloff (higher = tighter).',
                  'Typical: 1.2–2.5.',
                  'Too much: abrupt “cutoff” bands.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureExponentRow.row);
        
         const roofExposureAngles = directionToAzimuthElevationDegrees(roofExposure?.direction);
         const roofExposureAzimuthRow = makeRangeRow('Azimuth (deg)');
         roofExposureAzimuthRow.range.min = '0';
         roofExposureAzimuthRow.range.max = '360';
         roofExposureAzimuthRow.range.step = '1';
         roofExposureAzimuthRow.number.min = '0';
          roofExposureAzimuthRow.number.max = '360';
          roofExposureAzimuthRow.number.step = '1';
          roofExposureAzimuthRow.range.value = String(Math.round(roofExposureAngles.azimuthDegrees));
          roofExposureAzimuthRow.number.value = String(Math.round(roofExposureAngles.azimuthDegrees));
          applyRangeRowMeta(roofExposureAzimuthRow, {
              tooltip: tip(
                  'Direction azimuth in world space.',
                  'Typical: aim toward the “sun” or prevailing weather.',
                  'Too much: direction mismatched to scene lighting.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureAzimuthRow.row);
        
         const roofExposureElevationRow = makeRangeRow('Elevation (deg)');
         roofExposureElevationRow.range.min = '0';
         roofExposureElevationRow.range.max = '90';
         roofExposureElevationRow.range.step = '1';
         roofExposureElevationRow.number.min = '0';
          roofExposureElevationRow.number.max = '90';
          roofExposureElevationRow.number.step = '1';
          roofExposureElevationRow.range.value = String(Math.round(roofExposureAngles.elevationDegrees));
          roofExposureElevationRow.number.value = String(Math.round(roofExposureAngles.elevationDegrees));
          applyRangeRowMeta(roofExposureElevationRow, {
              tooltip: tip(
                  'Elevation angle (0 = horizon, 90 = straight up).',
                  'Typical: 30–80 depending on how “top-down” the exposure is.',
                  'Too much: overly top-lit effect.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureElevationRow.row);
        
         const roofExposureValueRow = makeRangeRow('Value');
         roofExposureValueRow.range.min = '-1';
         roofExposureValueRow.range.max = '1';
         roofExposureValueRow.range.step = '0.01';
         roofExposureValueRow.number.min = '-1';
         roofExposureValueRow.number.max = '1';
         roofExposureValueRow.number.step = '0.01';
         roofExposureValueRow.range.value = String(roofExposure?.value ?? 0.0);
         roofExposureValueRow.number.value = formatFloat(roofExposure?.value ?? 0.0, 2);
         applyRangeRowMeta(roofExposureValueRow, {
              tooltip: tip(
                  'Value shift applied to the exposed side.',
                  'Typical: small positive for bleach, negative for staining.',
                  'Too much: obvious light/dark split.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureValueRow.row);
        
         const roofExposureSaturationRow = makeRangeRow('Saturation');
         roofExposureSaturationRow.range.min = '-1';
         roofExposureSaturationRow.range.max = '1';
         roofExposureSaturationRow.range.step = '0.01';
         roofExposureSaturationRow.number.min = '-1';
         roofExposureSaturationRow.number.max = '1';
         roofExposureSaturationRow.number.step = '0.01';
         roofExposureSaturationRow.range.value = String(roofExposure?.saturation ?? 0.0);
         roofExposureSaturationRow.number.value = formatFloat(roofExposure?.saturation ?? 0.0, 2);
         applyRangeRowMeta(roofExposureSaturationRow, {
              tooltip: tip(
                  'Saturation shift applied to the exposed side.',
                  'Typical: slightly negative for bleaching.',
                  'Too much: oddly colored exposure.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureSaturationRow.row);
        
         const roofExposureRoughnessRow = makeRangeRow('Roughness');
         roofExposureRoughnessRow.range.min = '-1';
          roofExposureRoughnessRow.range.max = '1';
          roofExposureRoughnessRow.range.step = '0.01';
         roofExposureRoughnessRow.number.min = '-1';
          roofExposureRoughnessRow.number.max = '1';
          roofExposureRoughnessRow.number.step = '0.01';
          roofExposureRoughnessRow.range.value = String(roofExposure?.roughness ?? 0.0);
          roofExposureRoughnessRow.number.value = formatFloat(roofExposure?.roughness ?? 0.0, 2);
          applyRangeRowMeta(roofExposureRoughnessRow, {
              tooltip: tip(
                  'Roughness shift applied to the exposed side.',
                  'Typical: subtle.',
                  'Too much: unnatural glossy/matte directionality.'
              )
          });
          roofExposureGroup.body.appendChild(roofExposureRoughnessRow.row);
         roofMatVarWeatherGroup.body.appendChild(roofExposureGroup.details);
        
          const roofWearSide = roofMatVarNormalized.wearSide ?? null;
          const roofEdgeGroup = makeDetailsSection('Side wear (vertical edges)', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearSide` });
          applyTooltip(
              roofEdgeGroup.label,
              tip(
                  'Edge/side wear along vertical corners and edges.',
                  'Good for subtle exposure and chipped-edge feel.',
                  'Too much: outlines every edge like a cartoon.'
              )
          );
          const roofEdgeToggle = makeToggleRow('Enable side wear');
         roofEdgeToggle.input.checked = !!roofWearSide?.enabled;
         roofEdgeToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofEdgeToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables vertical edge wear.',
                 'Typical: enable with low Strength.',
                 'Too much: edges become uniformly highlighted.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeToggle.toggle);
         const roofEdgeStrengthRow = makeRangeRow('Strength');
        roofEdgeStrengthRow.range.min = '0';
        roofEdgeStrengthRow.range.max = '2';
        roofEdgeStrengthRow.range.step = '0.01';
        roofEdgeStrengthRow.number.min = '0';
        roofEdgeStrengthRow.number.max = '2';
         roofEdgeStrengthRow.number.step = '0.01';
         roofEdgeStrengthRow.range.value = String(roofWearSide?.intensity ?? 0.0);
         roofEdgeStrengthRow.number.value = formatFloat(roofWearSide?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofEdgeStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of edge wear.',
                 'Typical: 0.05–0.30.',
                 'Too much: bright/dirty outlines on every corner.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeStrengthRow.row);
        
        const roofEdgeWidthRow = makeRangeRow('Width');
        roofEdgeWidthRow.range.min = '0';
        roofEdgeWidthRow.range.max = '4';
        roofEdgeWidthRow.range.step = '0.01';
        roofEdgeWidthRow.number.min = '0';
         roofEdgeWidthRow.number.max = '4';
         roofEdgeWidthRow.number.step = '0.01';
         roofEdgeWidthRow.range.value = String(roofWearSide?.width ?? 1.0);
         roofEdgeWidthRow.number.value = formatFloat(roofWearSide?.width ?? 1.0, 2);
         applyRangeRowMeta(roofEdgeWidthRow, {
             mustHave: true,
             tooltip: tip(
                 'Width of the edge wear band.',
                 'Typical: 0.2–1.0 depending on building scale.',
                 'Too much: looks like painted stripes on corners.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeWidthRow.row);
        
        const roofEdgeScaleRow = makeRangeRow('Scale');
        roofEdgeScaleRow.range.min = '0.01';
        roofEdgeScaleRow.range.max = '20';
        roofEdgeScaleRow.range.step = '0.01';
        roofEdgeScaleRow.number.min = '0.01';
          roofEdgeScaleRow.number.max = '20';
         roofEdgeScaleRow.number.step = '0.01';
         roofEdgeScaleRow.range.value = String(roofWearSide?.scale ?? 1.0);
         roofEdgeScaleRow.number.value = formatFloat(roofWearSide?.scale ?? 1.0, 2);
         applyRangeRowMeta(roofEdgeScaleRow, {
             tooltip: tip(
                 'Noise scale used to break up the edge band.',
                 'Typical: 0.5–2.0.',
                 'Too much: noisy, peppery edges.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeScaleRow.row);
        
        const roofEdgeHueRow = makeRangeRow('Hue shift (deg)');
        roofEdgeHueRow.range.min = '-180';
        roofEdgeHueRow.range.max = '180';
        roofEdgeHueRow.range.step = '1';
        roofEdgeHueRow.number.min = '-180';
         roofEdgeHueRow.number.max = '180';
         roofEdgeHueRow.number.step = '1';
         roofEdgeHueRow.range.value = String(roofWearSide?.hueDegrees ?? 0.0);
         roofEdgeHueRow.number.value = String(Math.round(roofWearSide?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofEdgeHueRow, {
             tooltip: tip(
                 'Hue shift applied to edge wear.',
                 'Typical: small (often 0).',
                 'Too much: colorful outlines on edges.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeHueRow.row);
        
        const roofEdgeValueRow = makeRangeRow('Value');
        roofEdgeValueRow.range.min = '-1';
        roofEdgeValueRow.range.max = '1';
        roofEdgeValueRow.range.step = '0.01';
        roofEdgeValueRow.number.min = '-1';
        roofEdgeValueRow.number.max = '1';
        roofEdgeValueRow.number.step = '0.01';
        roofEdgeValueRow.range.value = String(roofWearSide?.value ?? 0.0);
        roofEdgeValueRow.number.value = formatFloat(roofWearSide?.value ?? 0.0, 2);
        applyRangeRowMeta(roofEdgeValueRow, {
             tooltip: tip(
                 'Value/brightness shift applied to edge wear.',
                 'Typical: subtle brightening/darkening.',
                 'Too much: chalky edges or overly dark outlines.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeValueRow.row);
        
        const roofEdgeSaturationRow = makeRangeRow('Saturation');
        roofEdgeSaturationRow.range.min = '-1';
        roofEdgeSaturationRow.range.max = '1';
        roofEdgeSaturationRow.range.step = '0.01';
        roofEdgeSaturationRow.number.min = '-1';
        roofEdgeSaturationRow.number.max = '1';
        roofEdgeSaturationRow.number.step = '0.01';
        roofEdgeSaturationRow.range.value = String(roofWearSide?.saturation ?? 0.0);
        roofEdgeSaturationRow.number.value = formatFloat(roofWearSide?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofEdgeSaturationRow, {
             tooltip: tip(
                 'Saturation shift applied to edge wear.',
                 'Typical: small negative saturation for dusty edges.',
                 'Too much: colored/painterly edges.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeSaturationRow.row);
        
        const roofEdgeRoughnessRow = makeRangeRow('Roughness');
        roofEdgeRoughnessRow.range.min = '-1';
        roofEdgeRoughnessRow.range.max = '1';
        roofEdgeRoughnessRow.range.step = '0.01';
        roofEdgeRoughnessRow.number.min = '-1';
        roofEdgeRoughnessRow.number.max = '1';
        roofEdgeRoughnessRow.number.step = '0.01';
        roofEdgeRoughnessRow.range.value = String(roofWearSide?.roughness ?? 0.0);
        roofEdgeRoughnessRow.number.value = formatFloat(roofWearSide?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofEdgeRoughnessRow, {
             tooltip: tip(
                 'Roughness shift applied to edge wear.',
                 'Typical: slightly rougher for exposed edges.',
                 'Too much: noisy specular along edges.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeRoughnessRow.row);
        
        const roofEdgeNormalRow = makeRangeRow('Normal');
        roofEdgeNormalRow.range.min = '-1';
        roofEdgeNormalRow.range.max = '1';
        roofEdgeNormalRow.range.step = '0.01';
        roofEdgeNormalRow.number.min = '-1';
         roofEdgeNormalRow.number.max = '1';
         roofEdgeNormalRow.number.step = '0.01';
         roofEdgeNormalRow.range.value = String(roofWearSide?.normal ?? 0.0);
         roofEdgeNormalRow.number.value = formatFloat(roofWearSide?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofEdgeNormalRow, {
             tooltip: tip(
                 'Normal shift applied to edge wear.',
                 'Typical: 0.',
                 'Too much: bumpy edge artifacts.'
             )
         });
         roofEdgeGroup.body.appendChild(roofEdgeNormalRow.row);
        roofMatVarWeatherGroup.body.appendChild(roofEdgeGroup.details);
        
         const roofWearTop = roofMatVarNormalized.wearTop ?? null;
         const roofDustGroup = makeDetailsSection('Top wear', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:wearTop` });
         applyTooltip(
             roofDustGroup.label,
             tip(
                 'Top deposits and wear near the top of the surface.',
                 'Good for subtle dust/soot accumulation and sun-faded areas.',
                 'Too much: the whole top looks painted.'
             )
         );
         const roofDustToggle = makeToggleRow('Enable top wear');
         roofDustToggle.input.checked = !!roofWearTop?.enabled;
         roofDustToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofDustToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables top wear/deposits.',
                 'Typical: enable with low Strength + moderate Width.',
                 'Too much: a thick band that dominates the surface.'
             )
         });
         roofDustGroup.body.appendChild(roofDustToggle.toggle);
         const roofDustStrengthRow = makeRangeRow('Strength');
        roofDustStrengthRow.range.min = '0';
        roofDustStrengthRow.range.max = '2';
        roofDustStrengthRow.range.step = '0.01';
        roofDustStrengthRow.number.min = '0';
        roofDustStrengthRow.number.max = '2';
         roofDustStrengthRow.number.step = '0.01';
         roofDustStrengthRow.range.value = String(roofWearTop?.intensity ?? 0.0);
         roofDustStrengthRow.number.value = formatFloat(roofWearTop?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofDustStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of top wear/deposits.',
                 'Typical: 0.05–0.30.',
                 'Too much: looks like painted grime on the top.'
             )
         });
         roofDustGroup.body.appendChild(roofDustStrengthRow.row);
        
        const roofDustWidthRow = makeRangeRow('Width');
        roofDustWidthRow.range.min = '0';
        roofDustWidthRow.range.max = '1';
        roofDustWidthRow.range.step = '0.01';
        roofDustWidthRow.number.min = '0';
         roofDustWidthRow.number.max = '1';
         roofDustWidthRow.number.step = '0.01';
         roofDustWidthRow.range.value = String(roofWearTop?.width ?? 0.4);
         roofDustWidthRow.number.value = formatFloat(roofWearTop?.width ?? 0.4, 2);
         applyRangeRowMeta(roofDustWidthRow, {
             mustHave: true,
             tooltip: tip(
                 'Height of the top wear band (0–1 relative).',
                 'Typical: 0.10–0.45.',
                 'Too much: top wear covers most of the surface.'
             )
         });
         roofDustGroup.body.appendChild(roofDustWidthRow.row);
        
        const roofDustScaleRow = makeRangeRow('Scale');
        roofDustScaleRow.range.min = '0.01';
        roofDustScaleRow.range.max = '20';
        roofDustScaleRow.range.step = '0.01';
        roofDustScaleRow.number.min = '0.01';
          roofDustScaleRow.number.max = '20';
         roofDustScaleRow.number.step = '0.01';
         roofDustScaleRow.range.value = String(roofWearTop?.scale ?? 1.0);
         roofDustScaleRow.number.value = formatFloat(roofWearTop?.scale ?? 1.0, 2);
         applyRangeRowMeta(roofDustScaleRow, {
             tooltip: tip(
                 'Noise scale for breaking up the top band.',
                 'Typical: 0.5–2.0.',
                 'Too much: noisy speckling.'
             )
         });
         roofDustGroup.body.appendChild(roofDustScaleRow.row);
        
        const roofDustHueRow = makeRangeRow('Hue shift (deg)');
        roofDustHueRow.range.min = '-180';
        roofDustHueRow.range.max = '180';
        roofDustHueRow.range.step = '1';
        roofDustHueRow.number.min = '-180';
         roofDustHueRow.number.max = '180';
         roofDustHueRow.number.step = '1';
         roofDustHueRow.range.value = String(roofWearTop?.hueDegrees ?? 0.0);
         roofDustHueRow.number.value = String(Math.round(roofWearTop?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofDustHueRow, {
             tooltip: tip(
                 'Hue shift applied to top wear.',
                 'Typical: subtle.',
                 'Too much: colored/painterly top band.'
             )
         });
         roofDustGroup.body.appendChild(roofDustHueRow.row);
        
        const roofDustValueRow = makeRangeRow('Value');
        roofDustValueRow.range.min = '-1';
        roofDustValueRow.range.max = '1';
        roofDustValueRow.range.step = '0.01';
        roofDustValueRow.number.min = '-1';
        roofDustValueRow.number.max = '1';
        roofDustValueRow.number.step = '0.01';
        roofDustValueRow.range.value = String(roofWearTop?.value ?? 0.0);
        roofDustValueRow.number.value = formatFloat(roofWearTop?.value ?? 0.0, 2);
        applyRangeRowMeta(roofDustValueRow, {
             tooltip: tip(
                 'Value/brightness shift applied to top wear.',
                 'Typical: small brightening for dust or darkening for soot.',
                 'Too much: harsh contrast at the top.'
             )
         });
         roofDustGroup.body.appendChild(roofDustValueRow.row);
        
        const roofDustSaturationRow = makeRangeRow('Saturation');
        roofDustSaturationRow.range.min = '-1';
        roofDustSaturationRow.range.max = '1';
        roofDustSaturationRow.range.step = '0.01';
        roofDustSaturationRow.number.min = '-1';
        roofDustSaturationRow.number.max = '1';
        roofDustSaturationRow.number.step = '0.01';
        roofDustSaturationRow.range.value = String(roofWearTop?.saturation ?? 0.0);
        roofDustSaturationRow.number.value = formatFloat(roofWearTop?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofDustSaturationRow, {
             tooltip: tip(
                 'Saturation shift applied to top wear.',
                 'Typical: slightly desaturated for dust/soot.',
                 'Too much: colored/painterly top band.'
             )
         });
         roofDustGroup.body.appendChild(roofDustSaturationRow.row);
        
        const roofDustRoughnessRow = makeRangeRow('Roughness');
        roofDustRoughnessRow.range.min = '-1';
        roofDustRoughnessRow.range.max = '1';
        roofDustRoughnessRow.range.step = '0.01';
        roofDustRoughnessRow.number.min = '-1';
        roofDustRoughnessRow.number.max = '1';
        roofDustRoughnessRow.number.step = '0.01';
        roofDustRoughnessRow.range.value = String(roofWearTop?.roughness ?? 0.0);
        roofDustRoughnessRow.number.value = formatFloat(roofWearTop?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofDustRoughnessRow, {
             tooltip: tip(
                 'Roughness shift applied to top wear.',
                 'Typical: slightly rougher for dusty deposits.',
                 'Too much: sparkly/noisy specular response.'
             )
         });
         roofDustGroup.body.appendChild(roofDustRoughnessRow.row);
        
        const roofDustNormalRow = makeRangeRow('Normal');
        roofDustNormalRow.range.min = '-1';
        roofDustNormalRow.range.max = '1';
        roofDustNormalRow.range.step = '0.01';
        roofDustNormalRow.number.min = '-1';
         roofDustNormalRow.number.max = '1';
         roofDustNormalRow.number.step = '0.01';
         roofDustNormalRow.range.value = String(roofWearTop?.normal ?? 0.0);
         roofDustNormalRow.number.value = formatFloat(roofWearTop?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofDustNormalRow, {
             tooltip: tip(
                 'Normal shift applied to top wear.',
                 'Typical: 0.',
                 'Too much: bumpy artifacts in the top band.'
             )
         });
        roofDustGroup.body.appendChild(roofDustNormalRow.row);
        roofMatVarWeatherGroup.body.appendChild(roofDustGroup.details);
        
         const roofAntiController = createMaterialVariationAntiTilingMiniController({
             allow,
             detailsOpenByKey: detailsOpenByKey,
             detailsKey: `${scopeKey}:layer:${layerId}:roof:matvar:anti`,
                nested: false,
             parentEnabled: !!layer.roof.materialVariation.enabled,
             normalizedAntiTiling: roofMatVarNormalized.antiTiling,
             targetMaterialVariation: layer.roof.materialVariation,
             labels: { offsetU: 'U shift', offsetV: 'V shift' },
                offsetOrder: ['offsetU', 'offsetV'],
             tooltips: {
                 group: tip(
                     'Breaks up visible texture tiling by offset/rotation per cell.',
                     'Use when you can see repeating patterns.',
                     'Too much: UV distortion and “swimming” details.'
                 ),
                 enable: tip(
                     'Enables anti-tiling UV variation.',
                     'Typical: enable for materials that obviously repeat.',
                     'Too much: distortion that looks like warping.'
                 ),
                 strength: tip(
                     'How strong the anti-tiling UV shift/rotation is.',
                     'Typical: 0.3–0.9.',
                     'Too much: obvious distortion and blurred details.'
                 ),
                 cellSize: tip(
                     'Size of the anti-tiling cells in tile units.',
                     'Typical: 1–4.',
                     'Too much: very small sizes become noisy; very large sizes repeat again.'
                 ),
                 blendWidth: tip(
                     'Softness of transitions between anti-tiling cells.',
                     'Typical: 0.10–0.30.',
                     'Too much: blurry blending; too little: visible seams.'
                 ),
                 offsetU: tip(
                     'Per-cell U UV jitter amount.',
                     'Typical: small values.',
                     'Too much: texture features misalign noticeably.'
                 ),
                 offsetV: tip(
                     'Per-cell V UV jitter amount.',
                     'Typical: small values.',
                     'Too much: texture features misalign noticeably.'
                 ),
                 rotation: tip(
                     'Per-cell UV rotation amount.',
                     'Typical: 5–25° for subtle breakup.',
                     'Too much: rotated details look obviously wrong.'
                 ),
                 quality: tip(
                     'Uses a higher-quality anti-tiling blend (slower).',
                     'Typical: off unless you see seams/artifacts.',
                     'Too much: unnecessary cost when not needed.'
                 )
             },
             onChange
         });
         roofAntiController.mount(roofMatVarGroup.body, { before: roofMatVarMacroGroup.details });
         registerMiniController(roofAntiController);
        
         const roofBrickCfg = roofMatVarNormalized.brick ?? null;
        
          const roofStairGroup = makeDetailsSection('Stair shift', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:stair` });
          applyTooltip(
              roofStairGroup.label,
             tip(
                 'Brick-style UV staggering / bond shifting.',
                 'Useful for brick/bonded patterns to reduce obvious repetition.',
                 'Too much: misaligned mortar/brick pattern.'
             )
         );
         const roofStairToggle = makeToggleRow('Enable stair shift');
         roofStairToggle.input.checked = !!roofMatVarNormalized.stairShift.enabled;
         roofStairToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofStairToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables per-row/step UV shifting.',
                 'Typical: enable for brick-like surfaces.',
                 'Too much: makes the pattern look broken.'
             )
         });
         roofStairGroup.body.appendChild(roofStairToggle.toggle);
        
        const roofStairStrengthRow = makeRangeRow('Strength');
        roofStairStrengthRow.range.min = '0';
        roofStairStrengthRow.range.max = '1';
        roofStairStrengthRow.range.step = '0.01';
        roofStairStrengthRow.number.min = '0';
         roofStairStrengthRow.number.max = '1';
         roofStairStrengthRow.number.step = '0.01';
         roofStairStrengthRow.range.value = String(roofMatVarNormalized.stairShift.strength);
         roofStairStrengthRow.number.value = formatFloat(roofMatVarNormalized.stairShift.strength, 2);
         applyRangeRowMeta(roofStairStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of the stair shift effect.',
                 'Typical: 0.2–1.0 for subtle staggering.',
                 'Too much: severe pattern discontinuities.'
             )
         });
         roofStairGroup.body.appendChild(roofStairStrengthRow.row);
        
        const roofStairStepRow = makeRangeRow('Step size (tiles)');
        roofStairStepRow.range.min = '0.01';
        roofStairStepRow.range.max = '20';
        roofStairStepRow.range.step = '0.01';
        roofStairStepRow.number.min = '0.01';
          roofStairStepRow.number.max = '20';
         roofStairStepRow.number.step = '0.01';
         roofStairStepRow.range.value = String(roofMatVarNormalized.stairShift.stepSize);
         roofStairStepRow.number.value = formatFloat(roofMatVarNormalized.stairShift.stepSize, 2);
         applyRangeRowMeta(roofStairStepRow, {
             tooltip: tip(
                 'How often the shift increments (in tile units).',
                 'Typical: 1 for per-row staggering.',
                 'Too much: large values make the shift rare and less useful.'
             )
         });
         roofStairGroup.body.appendChild(roofStairStepRow.row);
        
        const roofStairShiftRow = makeRangeRow('Shift per step');
        roofStairShiftRow.range.min = '-1';
        roofStairShiftRow.range.max = '1';
        roofStairShiftRow.range.step = '0.01';
        roofStairShiftRow.number.min = '-1';
         roofStairShiftRow.number.max = '1';
         roofStairShiftRow.number.step = '0.01';
         roofStairShiftRow.range.value = String(roofMatVarNormalized.stairShift.shift);
         roofStairShiftRow.number.value = formatFloat(roofMatVarNormalized.stairShift.shift, 2);
         applyRangeRowMeta(roofStairShiftRow, {
             mustHave: true,
             tooltip: tip(
                 'Shift amount applied per step (in UV tile units).',
                 'Typical brick bond: small offsets like 0.4 / 0.8 patterns.',
                 'Too much: bricks/mortar stop lining up.'
             )
         });
         roofStairGroup.body.appendChild(roofStairShiftRow.row);
        
        const roofStairModeRow = document.createElement('div');
        roofStairModeRow.className = 'building-fab-row building-fab-row-wide';
        const roofStairModeLabel = document.createElement('div');
         roofStairModeLabel.className = 'building-fab-row-label';
         roofStairModeLabel.textContent = 'Mode';
         const roofStairModeSelect = document.createElement('select');
         roofStairModeSelect.className = 'building-fab-select';
         for (const v of ['stair', 'alternate', 'random', 'pattern3']) {
             const opt = document.createElement('option');
             opt.value = v;
             opt.textContent =
                 v === 'random'
                     ? 'Random (per step)'
                     : (v === 'alternate'
                         ? 'Alternate (0 / shift)'
                         : (v === 'pattern3' ? 'Bond 3-step (0 / A / B)' : 'Stair (shift += stepIndex)'));
             roofStairModeSelect.appendChild(opt);
         }
         roofStairModeSelect.value = roofMatVarNormalized.stairShift.mode || 'stair';
         applySelectRowMeta(
             { label: roofStairModeLabel, select: roofStairModeSelect },
             {
                 tooltip: tip(
                     'How the shift evolves per step.',
                     'Typical: Stair/Alternate for simple bonds, Bond 3-step for 0/A/B patterns, Random for noise.',
                     'Too much: Random can look chaotic for brick bonds.'
                 )
             }
         );
         roofStairModeRow.appendChild(roofStairModeLabel);
         roofStairModeRow.appendChild(roofStairModeSelect);
         roofStairGroup.body.appendChild(roofStairModeRow);
        
         const roofStairPatternARow = makeRangeRow('Pattern A');
         roofStairPatternARow.range.min = '-1';
         roofStairPatternARow.range.max = '1';
         roofStairPatternARow.range.step = '0.01';
         roofStairPatternARow.number.min = '-1';
         roofStairPatternARow.number.max = '1';
         roofStairPatternARow.number.step = '0.01';
         roofStairPatternARow.range.value = String(roofMatVarNormalized.stairShift.patternA ?? 0.4);
         roofStairPatternARow.number.value = formatFloat(roofMatVarNormalized.stairShift.patternA ?? 0.4, 2);
         applyRangeRowMeta(roofStairPatternARow, {
             tooltip: tip(
                 'Multiplier used for the 2nd step when Mode is Bond 3-step.',
                 'Typical: 0.4.',
                 'Too much: bricks stop lining up.'
             )
         });
         roofStairGroup.body.appendChild(roofStairPatternARow.row);
        
         const roofStairPatternBRow = makeRangeRow('Pattern B');
         roofStairPatternBRow.range.min = '-1';
         roofStairPatternBRow.range.max = '1';
         roofStairPatternBRow.range.step = '0.01';
         roofStairPatternBRow.number.min = '-1';
         roofStairPatternBRow.number.max = '1';
         roofStairPatternBRow.number.step = '0.01';
         roofStairPatternBRow.range.value = String(roofMatVarNormalized.stairShift.patternB ?? 0.8);
         roofStairPatternBRow.number.value = formatFloat(roofMatVarNormalized.stairShift.patternB ?? 0.8, 2);
         applyRangeRowMeta(roofStairPatternBRow, {
             tooltip: tip(
                 'Multiplier used for the 3rd step when Mode is Bond 3-step.',
                 'Typical: 0.8.',
                 'Too much: bricks stop lining up.'
             )
         });
         roofStairGroup.body.appendChild(roofStairPatternBRow.row);
        
         const roofStairBlendRow = makeRangeRow('Blend width');
         roofStairBlendRow.range.min = '0';
         roofStairBlendRow.range.max = '0.49';
        roofStairBlendRow.range.step = '0.01';
        roofStairBlendRow.number.min = '0';
        roofStairBlendRow.number.max = '0.49';
         roofStairBlendRow.number.step = '0.01';
         roofStairBlendRow.range.value = String(roofMatVarNormalized.stairShift.blendWidth ?? 0.0);
         roofStairBlendRow.number.value = formatFloat(roofMatVarNormalized.stairShift.blendWidth ?? 0.0, 2);
         applyRangeRowMeta(roofStairBlendRow, {
             tooltip: tip(
                 'Softness of blending between steps.',
                 'Typical: 0.0–0.25.',
                 'Too much: mushy/blurred shifting.'
             )
         });
         roofStairGroup.body.appendChild(roofStairBlendRow.row);
        
        const roofStairDirRow = document.createElement('div');
        roofStairDirRow.className = 'building-fab-row building-fab-row-wide';
        const roofStairDirLabel = document.createElement('div');
        roofStairDirLabel.className = 'building-fab-row-label';
        roofStairDirLabel.textContent = 'Direction';
        const roofStairDirSelect = document.createElement('select');
        roofStairDirSelect.className = 'building-fab-select';
         for (const v of ['horizontal', 'vertical']) {
             const opt = document.createElement('option');
             opt.value = v;
             opt.textContent = v === 'vertical' ? 'Vertical (shift V per U step)' : 'Horizontal (shift U per V step)';
             roofStairDirSelect.appendChild(opt);
         }
         roofStairDirSelect.value = roofMatVarNormalized.stairShift.direction;
         applySelectRowMeta(
             { label: roofStairDirLabel, select: roofStairDirSelect },
             {
                 tooltip: tip(
                     'Which UV axis is shifted per step.',
                     'Typical: horizontal for brick bonds.',
                     'Too much: wrong direction makes the bond look odd.'
                 )
             }
         );
         roofStairDirRow.appendChild(roofStairDirLabel);
         roofStairDirRow.appendChild(roofStairDirSelect);
         roofStairGroup.body.appendChild(roofStairDirRow);
         roofMatVarBrickGroup.body.appendChild(roofStairGroup.details);
        
         const roofPerBrick = roofBrickCfg?.perBrick ?? null;
         const roofPerBrickGroup = makeDetailsSection('Per-brick variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:perBrick` });
         applyTooltip(
             roofPerBrickGroup.label,
             tip(
                 'Subtle per-brick breakup (hue/value/roughness per brick).',
                 'Use low Strength and keep shifts small.',
                 'Too much: noisy, speckled brickwork.'
             )
         );
         const roofPerBrickToggle = makeToggleRow('Enable per-brick variation');
         roofPerBrickToggle.input.checked = !!roofPerBrick?.enabled;
         roofPerBrickToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofPerBrickToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables per-brick variation.',
                 'Typical: enabled for brick materials, low strength.',
                 'Too much: bricks look randomly colored.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickToggle.toggle);
        
            const roofPerBrickLayout = roofPerBrick?.layout ?? null;
            const roofPerBrickLayoutGroup = makeDetailsSection('Layout', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:perBrick:layout` });
            applyTooltip(
                roofPerBrickLayoutGroup.label,
                tip(
                    'Brick grid layout used for per-brick variation only.',
                    'Use this to de-sync sections without affecting mortar.',
                    'Keep values close to your base texture brick scale.'
                )
            );
        
            const roofPerBrickBricksPerTileXRow = makeRangeRow('Bricks per tile X');
            roofPerBrickBricksPerTileXRow.range.min = '0.25';
            roofPerBrickBricksPerTileXRow.range.max = '200';
            roofPerBrickBricksPerTileXRow.range.step = '0.25';
            roofPerBrickBricksPerTileXRow.number.min = '0.25';
            roofPerBrickBricksPerTileXRow.number.max = '200';
            roofPerBrickBricksPerTileXRow.number.step = '0.25';
            roofPerBrickBricksPerTileXRow.range.value = String(roofPerBrickLayout?.bricksPerTileX ?? 6.0);
            roofPerBrickBricksPerTileXRow.number.value = formatFloat(roofPerBrickLayout?.bricksPerTileX ?? 6.0, 2);
            applyRangeRowMeta(roofPerBrickBricksPerTileXRow, {
                tooltip: tip(
                    'Brick count across one UV tile (U/X) for per-brick variation.',
                    'Typical: 5–10 depending on texture.',
                    'Too much: very high values become noisy.'
                )
            });
            roofPerBrickLayoutGroup.body.appendChild(roofPerBrickBricksPerTileXRow.row);
        
            const roofPerBrickBricksPerTileYRow = makeRangeRow('Bricks per tile Y');
            roofPerBrickBricksPerTileYRow.range.min = '0.25';
            roofPerBrickBricksPerTileYRow.range.max = '200';
            roofPerBrickBricksPerTileYRow.range.step = '0.25';
            roofPerBrickBricksPerTileYRow.number.min = '0.25';
            roofPerBrickBricksPerTileYRow.number.max = '200';
            roofPerBrickBricksPerTileYRow.number.step = '0.25';
            roofPerBrickBricksPerTileYRow.range.value = String(roofPerBrickLayout?.bricksPerTileY ?? 3.0);
            roofPerBrickBricksPerTileYRow.number.value = formatFloat(roofPerBrickLayout?.bricksPerTileY ?? 3.0, 2);
            applyRangeRowMeta(roofPerBrickBricksPerTileYRow, {
                tooltip: tip(
                    'Brick count across one UV tile (V/Y) for per-brick variation.',
                    'Typical: 2–6 depending on texture.',
                    'Too much: wrong values misalign the grid.'
                )
            });
            roofPerBrickLayoutGroup.body.appendChild(roofPerBrickBricksPerTileYRow.row);
        
            const roofPerBrickMortarWidthRow = makeRangeRow('Mortar width');
            roofPerBrickMortarWidthRow.range.min = '0';
            roofPerBrickMortarWidthRow.range.max = '0.49';
            roofPerBrickMortarWidthRow.range.step = '0.01';
            roofPerBrickMortarWidthRow.number.min = '0';
            roofPerBrickMortarWidthRow.number.max = '0.49';
            roofPerBrickMortarWidthRow.number.step = '0.01';
            roofPerBrickMortarWidthRow.range.value = String(roofPerBrickLayout?.mortarWidth ?? 0.08);
            roofPerBrickMortarWidthRow.number.value = formatFloat(roofPerBrickLayout?.mortarWidth ?? 0.08, 2);
            applyRangeRowMeta(roofPerBrickMortarWidthRow, {
                tooltip: tip(
                    'Thickness of mortar lines (as a fraction of a brick cell) for per-brick masking.',
                    'Typical: 0.04–0.12.',
                    'Too much: bricks get masked away.'
                )
            });
            roofPerBrickLayoutGroup.body.appendChild(roofPerBrickMortarWidthRow.row);
        
            const roofPerBrickOffsetXRow = makeRangeRow('Layout offset X (cells)');
            roofPerBrickOffsetXRow.range.min = '-10';
            roofPerBrickOffsetXRow.range.max = '10';
            roofPerBrickOffsetXRow.range.step = '0.01';
            roofPerBrickOffsetXRow.number.min = '-10';
            roofPerBrickOffsetXRow.number.max = '10';
            roofPerBrickOffsetXRow.number.step = '0.01';
            roofPerBrickOffsetXRow.range.value = String(roofPerBrickLayout?.offsetX ?? 0.0);
            roofPerBrickOffsetXRow.number.value = formatFloat(roofPerBrickLayout?.offsetX ?? 0.0, 2);
            applyRangeRowMeta(roofPerBrickOffsetXRow, {
                tooltip: tip(
                    'Shifts the per-brick cell grid horizontally (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            roofPerBrickLayoutGroup.body.appendChild(roofPerBrickOffsetXRow.row);
        
            const roofPerBrickOffsetYRow = makeRangeRow('Layout offset Y (cells)');
            roofPerBrickOffsetYRow.range.min = '-10';
            roofPerBrickOffsetYRow.range.max = '10';
            roofPerBrickOffsetYRow.range.step = '0.01';
            roofPerBrickOffsetYRow.number.min = '-10';
            roofPerBrickOffsetYRow.number.max = '10';
            roofPerBrickOffsetYRow.number.step = '0.01';
            roofPerBrickOffsetYRow.range.value = String(roofPerBrickLayout?.offsetY ?? 0.0);
            roofPerBrickOffsetYRow.number.value = formatFloat(roofPerBrickLayout?.offsetY ?? 0.0, 2);
            applyRangeRowMeta(roofPerBrickOffsetYRow, {
                tooltip: tip(
                    'Shifts the per-brick cell grid vertically (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            roofPerBrickLayoutGroup.body.appendChild(roofPerBrickOffsetYRow.row);
        
            roofPerBrickGroup.body.appendChild(roofPerBrickLayoutGroup.details);
        
         const roofPerBrickStrengthRow = makeRangeRow('Strength');
         roofPerBrickStrengthRow.range.min = '0';
         roofPerBrickStrengthRow.range.max = '2';
         roofPerBrickStrengthRow.range.step = '0.01';
         roofPerBrickStrengthRow.number.min = '0';
         roofPerBrickStrengthRow.number.max = '2';
         roofPerBrickStrengthRow.number.step = '0.01';
         roofPerBrickStrengthRow.range.value = String(roofPerBrick?.intensity ?? 0.0);
         roofPerBrickStrengthRow.number.value = formatFloat(roofPerBrick?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofPerBrickStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Overall strength of per-brick variation.',
                 'Typical: 0.05–0.40.',
                 'Too much: noisy speckled bricks.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickStrengthRow.row);
        
         const roofPerBrickHueRow = makeRangeRow('Hue shift (deg)');
         roofPerBrickHueRow.range.min = '-180';
         roofPerBrickHueRow.range.max = '180';
         roofPerBrickHueRow.range.step = '1';
         roofPerBrickHueRow.number.min = '-180';
         roofPerBrickHueRow.number.max = '180';
         roofPerBrickHueRow.number.step = '1';
         roofPerBrickHueRow.range.value = String(roofPerBrick?.hueDegrees ?? 0.0);
         roofPerBrickHueRow.number.value = String(Math.round(roofPerBrick?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofPerBrickHueRow, {
             tooltip: tip(
                 'Hue drift per brick.',
                 'Typical: ±5–20°.',
                 'Too much: rainbow bricks.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickHueRow.row);
        
         const roofPerBrickValueRow = makeRangeRow('Value');
         roofPerBrickValueRow.range.min = '-1';
         roofPerBrickValueRow.range.max = '1';
         roofPerBrickValueRow.range.step = '0.01';
         roofPerBrickValueRow.number.min = '-1';
         roofPerBrickValueRow.number.max = '1';
         roofPerBrickValueRow.number.step = '0.01';
         roofPerBrickValueRow.range.value = String(roofPerBrick?.value ?? 0.0);
         roofPerBrickValueRow.number.value = formatFloat(roofPerBrick?.value ?? 0.0, 2);
         applyRangeRowMeta(roofPerBrickValueRow, {
             tooltip: tip(
                 'Brightness variation per brick.',
                 'Typical: small.',
                 'Too much: patchy, noisy bricks.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickValueRow.row);
        
         const roofPerBrickSaturationRow = makeRangeRow('Saturation');
         roofPerBrickSaturationRow.range.min = '-1';
         roofPerBrickSaturationRow.range.max = '1';
         roofPerBrickSaturationRow.range.step = '0.01';
         roofPerBrickSaturationRow.number.min = '-1';
         roofPerBrickSaturationRow.number.max = '1';
         roofPerBrickSaturationRow.number.step = '0.01';
         roofPerBrickSaturationRow.range.value = String(roofPerBrick?.saturation ?? 0.0);
         roofPerBrickSaturationRow.number.value = formatFloat(roofPerBrick?.saturation ?? 0.0, 2);
         applyRangeRowMeta(roofPerBrickSaturationRow, {
             tooltip: tip(
                 'Saturation variation per brick.',
                 'Typical: small.',
                 'Too much: unnaturally colorful bricks.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickSaturationRow.row);
        
         const roofPerBrickRoughnessRow = makeRangeRow('Roughness');
         roofPerBrickRoughnessRow.range.min = '-1';
         roofPerBrickRoughnessRow.range.max = '1';
         roofPerBrickRoughnessRow.range.step = '0.01';
         roofPerBrickRoughnessRow.number.min = '-1';
         roofPerBrickRoughnessRow.number.max = '1';
         roofPerBrickRoughnessRow.number.step = '0.01';
         roofPerBrickRoughnessRow.range.value = String(roofPerBrick?.roughness ?? 0.0);
         roofPerBrickRoughnessRow.number.value = formatFloat(roofPerBrick?.roughness ?? 0.0, 2);
         applyRangeRowMeta(roofPerBrickRoughnessRow, {
             tooltip: tip(
                 'Roughness variation per brick.',
                 'Typical: subtle.',
                 'Too much: sparkly speckling.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickRoughnessRow.row);
        
         const roofPerBrickNormalRow = makeRangeRow('Normal');
         roofPerBrickNormalRow.range.min = '-1';
         roofPerBrickNormalRow.range.max = '1';
         roofPerBrickNormalRow.range.step = '0.01';
         roofPerBrickNormalRow.number.min = '-1';
         roofPerBrickNormalRow.number.max = '1';
         roofPerBrickNormalRow.number.step = '0.01';
         roofPerBrickNormalRow.range.value = String(roofPerBrick?.normal ?? 0.0);
         roofPerBrickNormalRow.number.value = formatFloat(roofPerBrick?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofPerBrickNormalRow, {
             tooltip: tip(
                 'Normal variation per brick.',
                 'Typical: 0.',
                 'Too much: bumpy noisy bricks.'
             )
         });
         roofPerBrickGroup.body.appendChild(roofPerBrickNormalRow.row);
         roofMatVarBrickGroup.body.appendChild(roofPerBrickGroup.details);
        
         const roofMortar = roofBrickCfg?.mortar ?? null;
         const roofMortarGroup = makeDetailsSection('Mortar variation', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:mortar` });
         applyTooltip(
             roofMortarGroup.label,
             tip(
                 'Separate-ish look for mortar lines (different value/roughness + optional grime).',
                 'Use low Strength and keep it subtle.',
                 'Too much: mortar becomes more prominent than the bricks.'
             )
         );
         const roofMortarToggle = makeToggleRow('Enable mortar variation');
         roofMortarToggle.input.checked = !!roofMortar?.enabled;
         roofMortarToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofMortarToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables mortar-line variation.',
                 'Typical: slight darkening + roughness increase.',
                 'Too much: bright/dirty outlines around every brick.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarToggle.toggle);
        
            const roofMortarLayout = roofMortar?.layout ?? null;
            const roofMortarLayoutGroup = makeDetailsSection('Layout', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:mortar:layout` });
            applyTooltip(
                roofMortarLayoutGroup.label,
                tip(
                    'Brick grid layout used for mortar variation only.',
                    'Lets mortar lines vary without affecting per-brick variation.',
                    'Keep values close to your base texture brick scale.'
                )
            );
        
            const roofMortarBricksPerTileXRow = makeRangeRow('Bricks per tile X');
            roofMortarBricksPerTileXRow.range.min = '0.25';
            roofMortarBricksPerTileXRow.range.max = '200';
            roofMortarBricksPerTileXRow.range.step = '0.25';
            roofMortarBricksPerTileXRow.number.min = '0.25';
            roofMortarBricksPerTileXRow.number.max = '200';
            roofMortarBricksPerTileXRow.number.step = '0.25';
            roofMortarBricksPerTileXRow.range.value = String(roofMortarLayout?.bricksPerTileX ?? 6.0);
            roofMortarBricksPerTileXRow.number.value = formatFloat(roofMortarLayout?.bricksPerTileX ?? 6.0, 2);
            applyRangeRowMeta(roofMortarBricksPerTileXRow, {
                tooltip: tip(
                    'Brick count across one UV tile (U/X) for mortar variation.',
                    'Typical: 5–10 depending on texture.',
                    'Too much: very high values become noisy.'
                )
            });
            roofMortarLayoutGroup.body.appendChild(roofMortarBricksPerTileXRow.row);
        
            const roofMortarBricksPerTileYRow = makeRangeRow('Bricks per tile Y');
            roofMortarBricksPerTileYRow.range.min = '0.25';
            roofMortarBricksPerTileYRow.range.max = '200';
            roofMortarBricksPerTileYRow.range.step = '0.25';
            roofMortarBricksPerTileYRow.number.min = '0.25';
            roofMortarBricksPerTileYRow.number.max = '200';
            roofMortarBricksPerTileYRow.number.step = '0.25';
            roofMortarBricksPerTileYRow.range.value = String(roofMortarLayout?.bricksPerTileY ?? 3.0);
            roofMortarBricksPerTileYRow.number.value = formatFloat(roofMortarLayout?.bricksPerTileY ?? 3.0, 2);
            applyRangeRowMeta(roofMortarBricksPerTileYRow, {
                tooltip: tip(
                    'Brick count across one UV tile (V/Y) for mortar variation.',
                    'Typical: 2–6 depending on texture.',
                    'Too much: wrong values misalign the grid.'
                )
            });
            roofMortarLayoutGroup.body.appendChild(roofMortarBricksPerTileYRow.row);
        
            const roofMortarMortarWidthRow = makeRangeRow('Mortar width');
            roofMortarMortarWidthRow.range.min = '0';
            roofMortarMortarWidthRow.range.max = '0.49';
            roofMortarMortarWidthRow.range.step = '0.01';
            roofMortarMortarWidthRow.number.min = '0';
            roofMortarMortarWidthRow.number.max = '0.49';
            roofMortarMortarWidthRow.number.step = '0.01';
            roofMortarMortarWidthRow.range.value = String(roofMortarLayout?.mortarWidth ?? 0.08);
            roofMortarMortarWidthRow.number.value = formatFloat(roofMortarLayout?.mortarWidth ?? 0.08, 2);
            applyRangeRowMeta(roofMortarMortarWidthRow, {
                tooltip: tip(
                    'Thickness of mortar lines (as a fraction of a brick cell) for mortar variation.',
                    'Typical: 0.04–0.12.',
                    'Too much: mortar dominates and bricks disappear.'
                )
            });
            roofMortarLayoutGroup.body.appendChild(roofMortarMortarWidthRow.row);
        
            const roofMortarOffsetXRow = makeRangeRow('Layout offset X (cells)');
            roofMortarOffsetXRow.range.min = '-10';
            roofMortarOffsetXRow.range.max = '10';
            roofMortarOffsetXRow.range.step = '0.01';
            roofMortarOffsetXRow.number.min = '-10';
            roofMortarOffsetXRow.number.max = '10';
            roofMortarOffsetXRow.number.step = '0.01';
            roofMortarOffsetXRow.range.value = String(roofMortarLayout?.offsetX ?? 0.0);
            roofMortarOffsetXRow.number.value = formatFloat(roofMortarLayout?.offsetX ?? 0.0, 2);
            applyRangeRowMeta(roofMortarOffsetXRow, {
                tooltip: tip(
                    'Shifts the mortar cell grid horizontally (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            roofMortarLayoutGroup.body.appendChild(roofMortarOffsetXRow.row);
        
            const roofMortarOffsetYRow = makeRangeRow('Layout offset Y (cells)');
            roofMortarOffsetYRow.range.min = '-10';
            roofMortarOffsetYRow.range.max = '10';
            roofMortarOffsetYRow.range.step = '0.01';
            roofMortarOffsetYRow.number.min = '-10';
            roofMortarOffsetYRow.number.max = '10';
            roofMortarOffsetYRow.number.step = '0.01';
            roofMortarOffsetYRow.range.value = String(roofMortarLayout?.offsetY ?? 0.0);
            roofMortarOffsetYRow.number.value = formatFloat(roofMortarLayout?.offsetY ?? 0.0, 2);
            applyRangeRowMeta(roofMortarOffsetYRow, {
                tooltip: tip(
                    'Shifts the mortar cell grid vertically (in brick cell units).',
                    'Use small values (0–1) to de-sync sections.',
                    '0 keeps the original alignment.'
                )
            });
            roofMortarLayoutGroup.body.appendChild(roofMortarOffsetYRow.row);
        
            roofMortarGroup.body.appendChild(roofMortarLayoutGroup.details);
        
         const roofMortarStrengthRow = makeRangeRow('Strength');
         roofMortarStrengthRow.range.min = '0';
         roofMortarStrengthRow.range.max = '2';
         roofMortarStrengthRow.range.step = '0.01';
         roofMortarStrengthRow.number.min = '0';
         roofMortarStrengthRow.number.max = '2';
         roofMortarStrengthRow.number.step = '0.01';
         roofMortarStrengthRow.range.value = String(roofMortar?.intensity ?? 0.0);
         roofMortarStrengthRow.number.value = formatFloat(roofMortar?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofMortarStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Overall strength of mortar variation.',
                 'Typical: 0.05–0.40.',
                 'Too much: thick, noisy mortar lines.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarStrengthRow.row);
        
         const roofMortarHueRow = makeRangeRow('Hue shift (deg)');
         roofMortarHueRow.range.min = '-180';
         roofMortarHueRow.range.max = '180';
         roofMortarHueRow.range.step = '1';
         roofMortarHueRow.number.min = '-180';
         roofMortarHueRow.number.max = '180';
         roofMortarHueRow.number.step = '1';
         roofMortarHueRow.range.value = String(roofMortar?.hueDegrees ?? 0.0);
         roofMortarHueRow.number.value = String(Math.round(roofMortar?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofMortarHueRow, {
             tooltip: tip(
                 'Hue shift applied to mortar.',
                 'Typical: small.',
                 'Too much: colorful mortar.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarHueRow.row);
        
         const roofMortarValueRow = makeRangeRow('Value');
         roofMortarValueRow.range.min = '-1';
         roofMortarValueRow.range.max = '1';
         roofMortarValueRow.range.step = '0.01';
         roofMortarValueRow.number.min = '-1';
         roofMortarValueRow.number.max = '1';
         roofMortarValueRow.number.step = '0.01';
         roofMortarValueRow.range.value = String(roofMortar?.value ?? 0.0);
         roofMortarValueRow.number.value = formatFloat(roofMortar?.value ?? 0.0, 2);
         applyRangeRowMeta(roofMortarValueRow, {
             tooltip: tip(
                 'Brightness/value shift applied to mortar.',
                 'Typical: slightly darker.',
                 'Too much: high-contrast outlines.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarValueRow.row);
        
         const roofMortarSaturationRow = makeRangeRow('Saturation');
         roofMortarSaturationRow.range.min = '-1';
         roofMortarSaturationRow.range.max = '1';
         roofMortarSaturationRow.range.step = '0.01';
         roofMortarSaturationRow.number.min = '-1';
         roofMortarSaturationRow.number.max = '1';
         roofMortarSaturationRow.number.step = '0.01';
         roofMortarSaturationRow.range.value = String(roofMortar?.saturation ?? 0.0);
         roofMortarSaturationRow.number.value = formatFloat(roofMortar?.saturation ?? 0.0, 2);
         applyRangeRowMeta(roofMortarSaturationRow, {
             tooltip: tip(
                 'Saturation shift applied to mortar.',
                 'Typical: slightly desaturated.',
                 'Too much: colorful mortar.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarSaturationRow.row);
        
         const roofMortarRoughnessRow = makeRangeRow('Roughness');
         roofMortarRoughnessRow.range.min = '-1';
         roofMortarRoughnessRow.range.max = '1';
         roofMortarRoughnessRow.range.step = '0.01';
         roofMortarRoughnessRow.number.min = '-1';
         roofMortarRoughnessRow.number.max = '1';
         roofMortarRoughnessRow.number.step = '0.01';
         roofMortarRoughnessRow.range.value = String(roofMortar?.roughness ?? 0.0);
         roofMortarRoughnessRow.number.value = formatFloat(roofMortar?.roughness ?? 0.0, 2);
         applyRangeRowMeta(roofMortarRoughnessRow, {
             tooltip: tip(
                 'Roughness shift applied to mortar.',
                 'Typical: slightly rougher than bricks.',
                 'Too much: sparkly outlines.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarRoughnessRow.row);
        
         const roofMortarNormalRow = makeRangeRow('Normal');
         roofMortarNormalRow.range.min = '-1';
         roofMortarNormalRow.range.max = '1';
         roofMortarNormalRow.range.step = '0.01';
         roofMortarNormalRow.number.min = '-1';
         roofMortarNormalRow.number.max = '1';
         roofMortarNormalRow.number.step = '0.01';
         roofMortarNormalRow.range.value = String(roofMortar?.normal ?? 0.0);
         roofMortarNormalRow.number.value = formatFloat(roofMortar?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofMortarNormalRow, {
             tooltip: tip(
                 'Normal shift applied to mortar.',
                 'Typical: 0.',
                 'Too much: bumpy mortar artifacts.'
             )
         });
         roofMortarGroup.body.appendChild(roofMortarNormalRow.row);
         roofMatVarBrickGroup.body.appendChild(roofMortarGroup.details);
        
         const roofMacro1 = roofMatVarNormalized.macroLayers?.[1] ?? null;
         const roofDetailGroup = makeDetailsSection('Macro layer 2', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro1` });
         applyTooltip(
             roofDetailGroup.label,
             tip(
                 'Macro layer 2 (Macro B): secondary breakup at a different scale.',
                 'Use after Macro A for richer, less repetitive results.',
                 'Too much: busy, noisy surfaces.'
             )
         );
         const roofDetailToggle = makeToggleRow('Enable macro layer 2');
         roofDetailToggle.input.checked = !!roofMacro1?.enabled;
         roofDetailToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofDetailToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables Macro B (secondary breakup).',
                 'Typical: enabled for richer variation after Macro A.',
                 'Too much: can make surfaces feel noisy.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailToggle.toggle);
         const roofDetailStrengthRow = makeRangeRow('Intensity');
        roofDetailStrengthRow.range.min = '0';
        roofDetailStrengthRow.range.max = '2';
        roofDetailStrengthRow.range.step = '0.01';
        roofDetailStrengthRow.number.min = '0';
        roofDetailStrengthRow.number.max = '2';
         roofDetailStrengthRow.number.step = '0.01';
         roofDetailStrengthRow.range.value = String(roofMacro1?.intensity ?? 0.0);
         roofDetailStrengthRow.number.value = formatFloat(roofMacro1?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofDetailStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of Macro B.',
                 'Typical: 0.1–0.8.',
                 'Too much: obvious noisy patterning.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailStrengthRow.row);
        
        const roofDetailScaleRow = makeRangeRow('Scale');
        roofDetailScaleRow.range.min = '0.01';
        roofDetailScaleRow.range.max = '20';
        roofDetailScaleRow.range.step = '0.01';
        roofDetailScaleRow.number.min = '0.01';
          roofDetailScaleRow.number.max = '20';
         roofDetailScaleRow.number.step = '0.01';
         roofDetailScaleRow.range.value = String(roofMacro1?.scale ?? 1.0);
         roofDetailScaleRow.number.value = formatFloat(roofMacro1?.scale ?? 1.0, 2);
         applyRangeRowMeta(roofDetailScaleRow, {
             mustHave: true,
             tooltip: tip(
                 'Frequency of Macro B (higher = smaller features).',
                 'Typical: 1–10 depending on your base tile size.',
                 'Too much: becomes micro-noise.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailScaleRow.row);
        
        const roofDetailHueRow = makeRangeRow('Hue shift (deg)');
        roofDetailHueRow.range.min = '-180';
        roofDetailHueRow.range.max = '180';
        roofDetailHueRow.range.step = '1';
        roofDetailHueRow.number.min = '-180';
         roofDetailHueRow.number.max = '180';
         roofDetailHueRow.number.step = '1';
         roofDetailHueRow.range.value = String(roofMacro1?.hueDegrees ?? 0.0);
         roofDetailHueRow.number.value = String(Math.round(roofMacro1?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofDetailHueRow, {
             tooltip: tip(
                 'Hue shift for Macro B.',
                 'Typical: subtle.',
                 'Too much: obvious colored patches.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailHueRow.row);
        
        const roofDetailValueRow = makeRangeRow('Value');
        roofDetailValueRow.range.min = '-1';
        roofDetailValueRow.range.max = '1';
        roofDetailValueRow.range.step = '0.01';
        roofDetailValueRow.number.min = '-1';
        roofDetailValueRow.number.max = '1';
        roofDetailValueRow.number.step = '0.01';
        roofDetailValueRow.range.value = String(roofMacro1?.value ?? 0.0);
        roofDetailValueRow.number.value = formatFloat(roofMacro1?.value ?? 0.0, 2);
        applyRangeRowMeta(roofDetailValueRow, {
             tooltip: tip(
                 'Value/brightness shift for Macro B.',
                 'Typical: small.',
                 'Too much: harsh patchiness.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailValueRow.row);
        
        const roofDetailSaturationRow = makeRangeRow('Saturation');
        roofDetailSaturationRow.range.min = '-1';
        roofDetailSaturationRow.range.max = '1';
        roofDetailSaturationRow.range.step = '0.01';
        roofDetailSaturationRow.number.min = '-1';
        roofDetailSaturationRow.number.max = '1';
        roofDetailSaturationRow.number.step = '0.01';
        roofDetailSaturationRow.range.value = String(roofMacro1?.saturation ?? 0.0);
        roofDetailSaturationRow.number.value = formatFloat(roofMacro1?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofDetailSaturationRow, {
             tooltip: tip(
                 'Saturation shift for Macro B.',
                 'Typical: subtle.',
                 'Too much: obvious saturation swings.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailSaturationRow.row);
        
        const roofDetailRoughnessRow = makeRangeRow('Roughness');
        roofDetailRoughnessRow.range.min = '-1';
        roofDetailRoughnessRow.range.max = '1';
        roofDetailRoughnessRow.range.step = '0.01';
        roofDetailRoughnessRow.number.min = '-1';
        roofDetailRoughnessRow.number.max = '1';
        roofDetailRoughnessRow.number.step = '0.01';
        roofDetailRoughnessRow.range.value = String(roofMacro1?.roughness ?? 0.0);
        roofDetailRoughnessRow.number.value = formatFloat(roofMacro1?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofDetailRoughnessRow, {
             tooltip: tip(
                 'Roughness shift for Macro B.',
                 'Typical: subtle.',
                 'Too much: sparkly highlights or overly matte patches.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailRoughnessRow.row);
        
        const roofDetailNormalRow = makeRangeRow('Normal');
        roofDetailNormalRow.range.min = '-1';
        roofDetailNormalRow.range.max = '1';
        roofDetailNormalRow.range.step = '0.01';
        roofDetailNormalRow.number.min = '-1';
         roofDetailNormalRow.number.max = '1';
         roofDetailNormalRow.number.step = '0.01';
         roofDetailNormalRow.range.value = String(roofMacro1?.normal ?? 0.0);
         roofDetailNormalRow.number.value = formatFloat(roofMacro1?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofDetailNormalRow, {
             tooltip: tip(
                 'Normal shift for Macro B.',
                 'Typical: 0.',
                 'Too much: warping/bumpy shading artifacts.'
             )
         });
         roofDetailGroup.body.appendChild(roofDetailNormalRow.row);
        roofMatVarMacroGroup.body.appendChild(roofDetailGroup.details);
        
         const roofMacro2 = roofMatVarNormalized.macroLayers?.[2] ?? null;
         const roofMacro2Group = makeDetailsSection('Macro layer 3', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:macro2` });
         applyTooltip(
             roofMacro2Group.label,
             tip(
                 'Macro layer 3 (Patches): mid-scale patchy variation.',
                 'Good for repairs/batches and less uniform surfaces.',
                 'Too much: camouflage-like patchiness.'
             )
         );
         const roofMacro2Toggle = makeToggleRow('Enable macro layer 3');
         roofMacro2Toggle.input.checked = !!roofMacro2?.enabled;
         roofMacro2Toggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyToggleRowMeta(roofMacro2Toggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables the patchy mid-variation layer.',
                 'Typical: enable with low intensity.',
                 'Too much: patch patterns dominate the material.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2Toggle.toggle);
        
        const roofMacro2StrengthRow = makeRangeRow('Intensity');
        roofMacro2StrengthRow.range.min = '0';
        roofMacro2StrengthRow.range.max = '2';
        roofMacro2StrengthRow.range.step = '0.01';
        roofMacro2StrengthRow.number.min = '0';
        roofMacro2StrengthRow.number.max = '2';
         roofMacro2StrengthRow.number.step = '0.01';
         roofMacro2StrengthRow.range.value = String(roofMacro2?.intensity ?? 0.0);
         roofMacro2StrengthRow.number.value = formatFloat(roofMacro2?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofMacro2StrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength of patch variation.',
                 'Typical: 0.1–0.6.',
                 'Too much: obvious patch camouflage.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2StrengthRow.row);
        
        const roofMacro2ScaleRow = makeRangeRow('Scale');
        roofMacro2ScaleRow.range.min = '0.01';
        roofMacro2ScaleRow.range.max = '20';
        roofMacro2ScaleRow.range.step = '0.01';
        roofMacro2ScaleRow.number.min = '0.01';
          roofMacro2ScaleRow.number.max = '20';
         roofMacro2ScaleRow.number.step = '0.01';
          roofMacro2ScaleRow.range.value = String(roofMacro2?.scale ?? 1.0);
          roofMacro2ScaleRow.number.value = formatFloat(roofMacro2?.scale ?? 1.0, 2);
          applyRangeRowMeta(roofMacro2ScaleRow, {
              mustHave: true,
              tooltip: tip(
                  'Frequency of patch shapes (higher = smaller patches).',
                  'Typical: 0.5–4.0.',
                  'Too much: tiny noisy patches.'
              )
          });
          roofMacro2Group.body.appendChild(roofMacro2ScaleRow.row);
        
         const roofMacro2CoverageRow = makeRangeRow('Coverage');
         roofMacro2CoverageRow.range.min = '0';
         roofMacro2CoverageRow.range.max = '1';
         roofMacro2CoverageRow.range.step = '0.01';
         roofMacro2CoverageRow.number.min = '0';
          roofMacro2CoverageRow.number.max = '1';
          roofMacro2CoverageRow.number.step = '0.01';
          roofMacro2CoverageRow.range.value = String(roofMacro2?.coverage ?? 0.0);
          roofMacro2CoverageRow.number.value = formatFloat(roofMacro2?.coverage ?? 0.0, 2);
          applyRangeRowMeta(roofMacro2CoverageRow, {
              mustHave: true,
              tooltip: tip(
                  'How much of the surface becomes “patches”. Higher = fewer patches.',
                  'Typical: 0.55–0.80.',
                  'Too much: 0 means everywhere; 1 means almost none.'
              )
          });
          roofMacro2Group.body.appendChild(roofMacro2CoverageRow.row);
        
         const roofMacro2HueRow = makeRangeRow('Hue shift (deg)');
         roofMacro2HueRow.range.min = '-180';
         roofMacro2HueRow.range.max = '180';
        roofMacro2HueRow.range.step = '1';
        roofMacro2HueRow.number.min = '-180';
         roofMacro2HueRow.number.max = '180';
         roofMacro2HueRow.number.step = '1';
         roofMacro2HueRow.range.value = String(roofMacro2?.hueDegrees ?? 0.0);
         roofMacro2HueRow.number.value = String(Math.round(roofMacro2?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofMacro2HueRow, {
             tooltip: tip(
                 'Hue shift for patch variation.',
                 'Typical: subtle (often 0).',
                 'Too much: colorful patch camouflage.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2HueRow.row);
        
        const roofMacro2ValueRow = makeRangeRow('Value');
        roofMacro2ValueRow.range.min = '-1';
        roofMacro2ValueRow.range.max = '1';
        roofMacro2ValueRow.range.step = '0.01';
        roofMacro2ValueRow.number.min = '-1';
        roofMacro2ValueRow.number.max = '1';
        roofMacro2ValueRow.number.step = '0.01';
        roofMacro2ValueRow.range.value = String(roofMacro2?.value ?? 0.0);
        roofMacro2ValueRow.number.value = formatFloat(roofMacro2?.value ?? 0.0, 2);
        applyRangeRowMeta(roofMacro2ValueRow, {
             tooltip: tip(
                 'Value/brightness shift for patches.',
                 'Typical: small.',
                 'Too much: harsh patch contrast.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2ValueRow.row);
        
        const roofMacro2SaturationRow = makeRangeRow('Saturation');
        roofMacro2SaturationRow.range.min = '-1';
        roofMacro2SaturationRow.range.max = '1';
        roofMacro2SaturationRow.range.step = '0.01';
        roofMacro2SaturationRow.number.min = '-1';
        roofMacro2SaturationRow.number.max = '1';
        roofMacro2SaturationRow.number.step = '0.01';
        roofMacro2SaturationRow.range.value = String(roofMacro2?.saturation ?? 0.0);
        roofMacro2SaturationRow.number.value = formatFloat(roofMacro2?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofMacro2SaturationRow, {
             tooltip: tip(
                 'Saturation shift for patches.',
                 'Typical: subtle.',
                 'Too much: colored patches.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2SaturationRow.row);
        
        const roofMacro2RoughnessRow = makeRangeRow('Roughness');
        roofMacro2RoughnessRow.range.min = '-1';
        roofMacro2RoughnessRow.range.max = '1';
        roofMacro2RoughnessRow.range.step = '0.01';
        roofMacro2RoughnessRow.number.min = '-1';
        roofMacro2RoughnessRow.number.max = '1';
        roofMacro2RoughnessRow.number.step = '0.01';
        roofMacro2RoughnessRow.range.value = String(roofMacro2?.roughness ?? 0.0);
        roofMacro2RoughnessRow.number.value = formatFloat(roofMacro2?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofMacro2RoughnessRow, {
             tooltip: tip(
                 'Roughness shift for patches.',
                 'Typical: subtle.',
                 'Too much: sparkly or overly matte patch noise.'
             )
         });
         roofMacro2Group.body.appendChild(roofMacro2RoughnessRow.row);
        
        const roofMacro2NormalRow = makeRangeRow('Normal');
        roofMacro2NormalRow.range.min = '-1';
        roofMacro2NormalRow.range.max = '1';
        roofMacro2NormalRow.range.step = '0.01';
        roofMacro2NormalRow.number.min = '-1';
          roofMacro2NormalRow.number.max = '1';
          roofMacro2NormalRow.number.step = '0.01';
          roofMacro2NormalRow.range.value = String(roofMacro2?.normal ?? 0.0);
          roofMacro2NormalRow.number.value = formatFloat(roofMacro2?.normal ?? 0.0, 2);
          applyRangeRowMeta(roofMacro2NormalRow, {
              tooltip: tip(
                  'Normal shift for patch variation.',
                  'Typical: 0.',
                  'Too much: bumpy patch artifacts.'
              )
          });
          roofMacro2Group.body.appendChild(roofMacro2NormalRow.row);
         roofMatVarMidGroup.body.appendChild(roofMacro2Group.details);
        
          const roofMicro0 = roofMatVarNormalized.macroLayers?.[3] ?? null;
          const roofMicroGroup = makeDetailsSection('Micro roughness', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:micro0` });
          applyTooltip(
              roofMicroGroup.label,
              tip(
                  'Micro breakup for surface response (mostly roughness, optionally normals).',
                  'Use to avoid large flat glossy/matte areas.',
                  'Too much: sparkly specular noise.'
              )
          );
          const roofMicroToggle = makeToggleRow('Enable micro variation');
          roofMicroToggle.input.checked = !!roofMicro0?.enabled;
          roofMicroToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
          applyToggleRowMeta(roofMicroToggle, {
              mustHave: true,
              tooltip: tip(
                  'Enables micro-scale variation (roughness-first).',
                  'Typical: enable with low Intensity.',
                  'Too much: noisy shimmer on highlights.'
              )
          });
          roofMicroGroup.body.appendChild(roofMicroToggle.toggle);
        
         const roofMicroIntensityRow = makeRangeRow('Intensity');
         roofMicroIntensityRow.range.min = '0';
         roofMicroIntensityRow.range.max = '2';
         roofMicroIntensityRow.range.step = '0.01';
         roofMicroIntensityRow.number.min = '0';
         roofMicroIntensityRow.number.max = '2';
          roofMicroIntensityRow.number.step = '0.01';
          roofMicroIntensityRow.range.value = String(roofMicro0?.intensity ?? 0.0);
          roofMicroIntensityRow.number.value = formatFloat(roofMicro0?.intensity ?? 0.0, 2);
          applyRangeRowMeta(roofMicroIntensityRow, {
              mustHave: true,
              tooltip: tip(
                  'Strength of the micro mask.',
                  'Typical: 0.1–0.8.',
                  'Too much: micro-noise dominates.'
              )
          });
          roofMicroGroup.body.appendChild(roofMicroIntensityRow.row);
        
         const roofMicroScaleRow = makeRangeRow('Scale');
         roofMicroScaleRow.range.min = '0.01';
         roofMicroScaleRow.range.max = '20';
         roofMicroScaleRow.range.step = '0.01';
         roofMicroScaleRow.number.min = '0.01';
           roofMicroScaleRow.number.max = '20';
          roofMicroScaleRow.number.step = '0.01';
          roofMicroScaleRow.range.value = String(roofMicro0?.scale ?? 1.0);
          roofMicroScaleRow.number.value = formatFloat(roofMicro0?.scale ?? 1.0, 2);
          applyRangeRowMeta(roofMicroScaleRow, {
              mustHave: true,
              tooltip: tip(
                  'Frequency of micro breakup (higher = smaller micro detail).',
                  'Typical: 6–20.',
                  'Too much: glittery surface noise.'
              )
          });
          roofMicroGroup.body.appendChild(roofMicroScaleRow.row);
        
         const roofMicroRoughnessRow = makeRangeRow('Roughness');
         roofMicroRoughnessRow.range.min = '-1';
          roofMicroRoughnessRow.range.max = '1';
          roofMicroRoughnessRow.range.step = '0.01';
         roofMicroRoughnessRow.number.min = '-1';
          roofMicroRoughnessRow.number.max = '1';
          roofMicroRoughnessRow.number.step = '0.01';
          roofMicroRoughnessRow.range.value = String(roofMicro0?.roughness ?? 0.0);
          roofMicroRoughnessRow.number.value = formatFloat(roofMicro0?.roughness ?? 0.0, 2);
          applyRangeRowMeta(roofMicroRoughnessRow, {
              mustHave: true,
              tooltip: tip(
                  'Roughness shift driven by the micro mask.',
                  'Typical: small positive values for subtle breakup.',
                  'Too much: unstable specular response.'
              )
          });
          roofMicroGroup.body.appendChild(roofMicroRoughnessRow.row);
        
         const roofMicroNormalRow = makeRangeRow('Normal');
         roofMicroNormalRow.range.min = '-1';
          roofMicroNormalRow.range.max = '1';
          roofMicroNormalRow.range.step = '0.01';
         roofMicroNormalRow.number.min = '-1';
          roofMicroNormalRow.number.max = '1';
          roofMicroNormalRow.number.step = '0.01';
          roofMicroNormalRow.range.value = String(roofMicro0?.normal ?? 0.0);
          roofMicroNormalRow.number.value = formatFloat(roofMicro0?.normal ?? 0.0, 2);
          applyRangeRowMeta(roofMicroNormalRow, {
              tooltip: tip(
                  'Optional micro normal boost/attenuation.',
                  'Typical: 0.',
                  'Too much: bumpy/shimmering shading artifacts.'
              )
          });
          roofMicroGroup.body.appendChild(roofMicroNormalRow.row);
         roofMatVarMicroGroup.body.appendChild(roofMicroGroup.details);
        
          const roofCracksLayer = roofMatVarNormalized.cracksLayer ?? null;
          const roofCracksGroup = makeDetailsSection('Cracks', { open: false, nested: false, key: `${scopeKey}:layer:${layerId}:roof:matvar:cracks` });
          const roofCracksToggle = makeToggleRow('Enable cracks');
         roofCracksToggle.input.checked = !!roofCracksLayer?.enabled;
         roofCracksToggle.input.disabled = !allow || !roofMatVarNormalized.enabled;
         applyTooltip(
             roofCracksGroup.label,
             tip(
                 'Procedural cracks and fine damage.',
                 'Use sparingly to avoid a “ruined” look.',
                 'Too much: the surface reads as broken everywhere.'
             )
         );
         applyToggleRowMeta(roofCracksToggle, {
             mustHave: true,
             tooltip: tip(
                 'Enables procedural cracks.',
                 'Typical: enable with very low Strength.',
                 'Too much: cracks dominate the material.'
             )
         });
         roofCracksGroup.body.appendChild(roofCracksToggle.toggle);
         const roofCrackStrengthRow = makeRangeRow('Strength');
        roofCrackStrengthRow.range.min = '0';
        roofCrackStrengthRow.range.max = '2';
        roofCrackStrengthRow.range.step = '0.01';
        roofCrackStrengthRow.number.min = '0';
        roofCrackStrengthRow.number.max = '2';
         roofCrackStrengthRow.number.step = '0.01';
         roofCrackStrengthRow.range.value = String(roofCracksLayer?.intensity ?? 0.0);
         roofCrackStrengthRow.number.value = formatFloat(roofCracksLayer?.intensity ?? 0.0, 2);
         applyRangeRowMeta(roofCrackStrengthRow, {
             mustHave: true,
             tooltip: tip(
                 'Strength/visibility of cracks.',
                 'Typical: 0.02–0.20.',
                 'Too much: strong crack networks everywhere.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackStrengthRow.row);
        
        const roofCrackScaleRow = makeRangeRow('Scale');
        roofCrackScaleRow.range.min = '0.01';
        roofCrackScaleRow.range.max = '20';
        roofCrackScaleRow.range.step = '0.01';
        roofCrackScaleRow.number.min = '0.01';
          roofCrackScaleRow.number.max = '20';
         roofCrackScaleRow.number.step = '0.01';
         roofCrackScaleRow.range.value = String(roofCracksLayer?.scale ?? 1.0);
         roofCrackScaleRow.number.value = formatFloat(roofCracksLayer?.scale ?? 1.0, 2);
         applyRangeRowMeta(roofCrackScaleRow, {
             mustHave: true,
             tooltip: tip(
                 'Frequency of crack patterns (higher = smaller cracks).',
                 'Typical: 1–6.',
                 'Too much: tiny noisy crack texture.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackScaleRow.row);
        
        const roofCrackHueRow = makeRangeRow('Hue shift (deg)');
        roofCrackHueRow.range.min = '-180';
        roofCrackHueRow.range.max = '180';
        roofCrackHueRow.range.step = '1';
        roofCrackHueRow.number.min = '-180';
         roofCrackHueRow.number.max = '180';
         roofCrackHueRow.number.step = '1';
         roofCrackHueRow.range.value = String(roofCracksLayer?.hueDegrees ?? 0.0);
         roofCrackHueRow.number.value = String(Math.round(roofCracksLayer?.hueDegrees ?? 0.0));
         applyRangeRowMeta(roofCrackHueRow, {
             tooltip: tip(
                 'Hue shift inside cracks.',
                 'Typical: 0.',
                 'Too much: colored cracks look like paint.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackHueRow.row);
        
        const roofCrackValueRow = makeRangeRow('Value');
        roofCrackValueRow.range.min = '-1';
        roofCrackValueRow.range.max = '1';
        roofCrackValueRow.range.step = '0.01';
        roofCrackValueRow.number.min = '-1';
        roofCrackValueRow.number.max = '1';
        roofCrackValueRow.number.step = '0.01';
        roofCrackValueRow.range.value = String(roofCracksLayer?.value ?? 0.0);
        roofCrackValueRow.number.value = formatFloat(roofCracksLayer?.value ?? 0.0, 2);
        applyRangeRowMeta(roofCrackValueRow, {
             tooltip: tip(
                 'Value/brightness shift inside cracks.',
                 'Typical: slightly darker.',
                 'Too much: looks like drawn lines.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackValueRow.row);
        
        const roofCrackSaturationRow = makeRangeRow('Saturation');
        roofCrackSaturationRow.range.min = '-1';
        roofCrackSaturationRow.range.max = '1';
        roofCrackSaturationRow.range.step = '0.01';
        roofCrackSaturationRow.number.min = '-1';
        roofCrackSaturationRow.number.max = '1';
        roofCrackSaturationRow.number.step = '0.01';
        roofCrackSaturationRow.range.value = String(roofCracksLayer?.saturation ?? 0.0);
        roofCrackSaturationRow.number.value = formatFloat(roofCracksLayer?.saturation ?? 0.0, 2);
        applyRangeRowMeta(roofCrackSaturationRow, {
             tooltip: tip(
                 'Saturation shift inside cracks.',
                 'Typical: small negative saturation.',
                 'Too much: colored crack lines.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackSaturationRow.row);
        
        const roofCrackRoughnessRow = makeRangeRow('Roughness');
        roofCrackRoughnessRow.range.min = '-1';
        roofCrackRoughnessRow.range.max = '1';
        roofCrackRoughnessRow.range.step = '0.01';
        roofCrackRoughnessRow.number.min = '-1';
        roofCrackRoughnessRow.number.max = '1';
        roofCrackRoughnessRow.number.step = '0.01';
        roofCrackRoughnessRow.range.value = String(roofCracksLayer?.roughness ?? 0.0);
        roofCrackRoughnessRow.number.value = formatFloat(roofCracksLayer?.roughness ?? 0.0, 2);
        applyRangeRowMeta(roofCrackRoughnessRow, {
             tooltip: tip(
                 'Roughness shift inside cracks.',
                 'Typical: small changes.',
                 'Too much: noisy specular along crack lines.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackRoughnessRow.row);
        
        const roofCrackNormalRow = makeRangeRow('Normal');
        roofCrackNormalRow.range.min = '-1';
        roofCrackNormalRow.range.max = '1';
        roofCrackNormalRow.range.step = '0.01';
        roofCrackNormalRow.number.min = '-1';
         roofCrackNormalRow.number.max = '1';
         roofCrackNormalRow.number.step = '0.01';
         roofCrackNormalRow.range.value = String(roofCracksLayer?.normal ?? 0.0);
         roofCrackNormalRow.number.value = formatFloat(roofCracksLayer?.normal ?? 0.0, 2);
         applyRangeRowMeta(roofCrackNormalRow, {
             tooltip: tip(
                 'Normal shift inside cracks.',
                 'Typical: 0.',
                 'Too much: bumpy crack artifacts.'
             )
         });
         roofCracksGroup.body.appendChild(roofCrackNormalRow.row);
        roofMatVarWeatherGroup.body.appendChild(roofCracksGroup.details);
        
         const syncRoofMatVarEnabled = () => {
             const enabled = !!layer.roof.materialVariation.enabled;
                const objectSpace = roofMatVarSpaceSelect.value === 'object';
                roofMatVarSpaceSelect.disabled = !allow || !enabled;
             roofSeedOffsetRow.range.disabled = !allow || !enabled;
             roofSeedOffsetRow.number.disabled = roofSeedOffsetRow.range.disabled;
             roofIntensityRow.range.disabled = !allow || !enabled;
             roofIntensityRow.number.disabled = roofIntensityRow.range.disabled;
             roofScaleRow.range.disabled = !allow || !enabled || objectSpace;
             roofScaleRow.number.disabled = roofScaleRow.range.disabled;
                roofObjectScaleRow.range.disabled = !allow || !enabled || !objectSpace;
                roofObjectScaleRow.number.disabled = roofObjectScaleRow.range.disabled;
                roofMatVarNormalFlipXToggle.input.disabled = !allow || !enabled;
                roofMatVarNormalFlipYToggle.input.disabled = !allow || !enabled;
                roofMatVarNormalFlipZToggle.input.disabled = !allow || !enabled;
             roofAoAmountRow.range.disabled = !allow || !enabled;
             roofAoAmountRow.number.disabled = roofAoAmountRow.range.disabled;
        
            roofMacroToggle.input.disabled = !allow || !enabled;
            roofMacroIntensityRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroIntensityRow.number.disabled = roofMacroIntensityRow.range.disabled;
            roofMacroScaleRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroScaleRow.number.disabled = roofMacroScaleRow.range.disabled;
            roofMacroHueRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroHueRow.number.disabled = roofMacroHueRow.range.disabled;
            roofMacroValueRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroValueRow.number.disabled = roofMacroValueRow.range.disabled;
            roofMacroSaturationRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroSaturationRow.number.disabled = roofMacroSaturationRow.range.disabled;
            roofMacroRoughnessRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroRoughnessRow.number.disabled = roofMacroRoughnessRow.range.disabled;
            roofMacroNormalRow.range.disabled = !allow || !enabled || !roofMacroToggle.input.checked;
            roofMacroNormalRow.number.disabled = roofMacroNormalRow.range.disabled;
        
            roofGrimeToggle.input.disabled = !allow || !enabled;
            roofGrimeStrengthRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeStrengthRow.number.disabled = roofGrimeStrengthRow.range.disabled;
            roofGrimeWidthRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeWidthRow.number.disabled = roofGrimeWidthRow.range.disabled;
            roofGrimeScaleRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeScaleRow.number.disabled = roofGrimeScaleRow.range.disabled;
            roofGrimeHueRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeHueRow.number.disabled = roofGrimeHueRow.range.disabled;
            roofGrimeValueRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeValueRow.number.disabled = roofGrimeValueRow.range.disabled;
            roofGrimeSaturationRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeSaturationRow.number.disabled = roofGrimeSaturationRow.range.disabled;
            roofGrimeRoughnessRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeRoughnessRow.number.disabled = roofGrimeRoughnessRow.range.disabled;
            roofGrimeNormalRow.range.disabled = !allow || !enabled || !roofGrimeToggle.input.checked;
            roofGrimeNormalRow.number.disabled = roofGrimeNormalRow.range.disabled;
        
            roofStreaksToggle.input.disabled = !allow || !enabled;
            roofStreakStrengthRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakStrengthRow.number.disabled = roofStreakStrengthRow.range.disabled;
            roofStreakScaleRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakScaleRow.number.disabled = roofStreakScaleRow.range.disabled;
            roofStreakLedgeStrengthRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakLedgeStrengthRow.number.disabled = roofStreakLedgeStrengthRow.range.disabled;
            roofStreakLedgeScaleRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakLedgeScaleRow.number.disabled = roofStreakLedgeScaleRow.range.disabled;
            roofStreakHueRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakHueRow.number.disabled = roofStreakHueRow.range.disabled;
            roofStreakValueRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakValueRow.number.disabled = roofStreakValueRow.range.disabled;
            roofStreakSaturationRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakSaturationRow.number.disabled = roofStreakSaturationRow.range.disabled;
            roofStreakRoughnessRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
            roofStreakRoughnessRow.number.disabled = roofStreakRoughnessRow.range.disabled;
             roofStreakNormalRow.range.disabled = !allow || !enabled || !roofStreaksToggle.input.checked;
             roofStreakNormalRow.number.disabled = roofStreakNormalRow.range.disabled;
        
             roofExposureToggle.input.disabled = !allow || !enabled;
             roofExposureStrengthRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureStrengthRow.number.disabled = roofExposureStrengthRow.range.disabled;
             roofExposureExponentRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureExponentRow.number.disabled = roofExposureExponentRow.range.disabled;
             roofExposureAzimuthRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureAzimuthRow.number.disabled = roofExposureAzimuthRow.range.disabled;
             roofExposureElevationRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureElevationRow.number.disabled = roofExposureElevationRow.range.disabled;
             roofExposureValueRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureValueRow.number.disabled = roofExposureValueRow.range.disabled;
             roofExposureSaturationRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureSaturationRow.number.disabled = roofExposureSaturationRow.range.disabled;
             roofExposureRoughnessRow.range.disabled = !allow || !enabled || !roofExposureToggle.input.checked;
             roofExposureRoughnessRow.number.disabled = roofExposureRoughnessRow.range.disabled;
        
             roofEdgeToggle.input.disabled = !allow || !enabled;
             roofEdgeStrengthRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
             roofEdgeStrengthRow.number.disabled = roofEdgeStrengthRow.range.disabled;
            roofEdgeWidthRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeWidthRow.number.disabled = roofEdgeWidthRow.range.disabled;
            roofEdgeScaleRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeScaleRow.number.disabled = roofEdgeScaleRow.range.disabled;
            roofEdgeHueRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeHueRow.number.disabled = roofEdgeHueRow.range.disabled;
            roofEdgeValueRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeValueRow.number.disabled = roofEdgeValueRow.range.disabled;
            roofEdgeSaturationRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeSaturationRow.number.disabled = roofEdgeSaturationRow.range.disabled;
            roofEdgeRoughnessRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeRoughnessRow.number.disabled = roofEdgeRoughnessRow.range.disabled;
            roofEdgeNormalRow.range.disabled = !allow || !enabled || !roofEdgeToggle.input.checked;
            roofEdgeNormalRow.number.disabled = roofEdgeNormalRow.range.disabled;
        
            roofDustToggle.input.disabled = !allow || !enabled;
            roofDustStrengthRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustStrengthRow.number.disabled = roofDustStrengthRow.range.disabled;
            roofDustWidthRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustWidthRow.number.disabled = roofDustWidthRow.range.disabled;
            roofDustScaleRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustScaleRow.number.disabled = roofDustScaleRow.range.disabled;
            roofDustHueRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustHueRow.number.disabled = roofDustHueRow.range.disabled;
            roofDustValueRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustValueRow.number.disabled = roofDustValueRow.range.disabled;
            roofDustSaturationRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustSaturationRow.number.disabled = roofDustSaturationRow.range.disabled;
            roofDustRoughnessRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustRoughnessRow.number.disabled = roofDustRoughnessRow.range.disabled;
            roofDustNormalRow.range.disabled = !allow || !enabled || !roofDustToggle.input.checked;
            roofDustNormalRow.number.disabled = roofDustNormalRow.range.disabled;
        
            roofAntiController.syncDisabled({ allow, parentEnabled: enabled });
        
             roofPerBrickToggle.input.disabled = !allow || !enabled;
             roofPerBrickBricksPerTileXRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickBricksPerTileXRow.number.disabled = roofPerBrickBricksPerTileXRow.range.disabled;
             roofPerBrickBricksPerTileYRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickBricksPerTileYRow.number.disabled = roofPerBrickBricksPerTileYRow.range.disabled;
             roofPerBrickMortarWidthRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickMortarWidthRow.number.disabled = roofPerBrickMortarWidthRow.range.disabled;
             roofPerBrickOffsetXRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickOffsetXRow.number.disabled = roofPerBrickOffsetXRow.range.disabled;
             roofPerBrickOffsetYRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickOffsetYRow.number.disabled = roofPerBrickOffsetYRow.range.disabled;
             roofPerBrickStrengthRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickStrengthRow.number.disabled = roofPerBrickStrengthRow.range.disabled;
             roofPerBrickHueRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickHueRow.number.disabled = roofPerBrickHueRow.range.disabled;
             roofPerBrickValueRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickValueRow.number.disabled = roofPerBrickValueRow.range.disabled;
             roofPerBrickSaturationRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickSaturationRow.number.disabled = roofPerBrickSaturationRow.range.disabled;
             roofPerBrickRoughnessRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickRoughnessRow.number.disabled = roofPerBrickRoughnessRow.range.disabled;
             roofPerBrickNormalRow.range.disabled = !allow || !enabled || !roofPerBrickToggle.input.checked;
             roofPerBrickNormalRow.number.disabled = roofPerBrickNormalRow.range.disabled;
        
             roofMortarToggle.input.disabled = !allow || !enabled;
             roofMortarBricksPerTileXRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarBricksPerTileXRow.number.disabled = roofMortarBricksPerTileXRow.range.disabled;
             roofMortarBricksPerTileYRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarBricksPerTileYRow.number.disabled = roofMortarBricksPerTileYRow.range.disabled;
             roofMortarMortarWidthRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarMortarWidthRow.number.disabled = roofMortarMortarWidthRow.range.disabled;
             roofMortarOffsetXRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarOffsetXRow.number.disabled = roofMortarOffsetXRow.range.disabled;
             roofMortarOffsetYRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarOffsetYRow.number.disabled = roofMortarOffsetYRow.range.disabled;
             roofMortarStrengthRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarStrengthRow.number.disabled = roofMortarStrengthRow.range.disabled;
             roofMortarHueRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarHueRow.number.disabled = roofMortarHueRow.range.disabled;
             roofMortarValueRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarValueRow.number.disabled = roofMortarValueRow.range.disabled;
             roofMortarSaturationRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarSaturationRow.number.disabled = roofMortarSaturationRow.range.disabled;
             roofMortarRoughnessRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarRoughnessRow.number.disabled = roofMortarRoughnessRow.range.disabled;
             roofMortarNormalRow.range.disabled = !allow || !enabled || !roofMortarToggle.input.checked;
             roofMortarNormalRow.number.disabled = roofMortarNormalRow.range.disabled;
        
             roofStairToggle.input.disabled = !allow || !enabled;
             roofStairStrengthRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
             roofStairStrengthRow.number.disabled = roofStairStrengthRow.range.disabled;
            roofStairStepRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
            roofStairStepRow.number.disabled = roofStairStepRow.range.disabled;
             roofStairShiftRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
             roofStairShiftRow.number.disabled = roofStairShiftRow.range.disabled;
             roofStairModeSelect.disabled = !allow || !enabled || !roofStairToggle.input.checked;
             const roofStairIsPattern3 = roofStairModeSelect.value === 'pattern3';
             roofStairPatternARow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked || !roofStairIsPattern3;
             roofStairPatternARow.number.disabled = roofStairPatternARow.range.disabled;
             roofStairPatternBRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked || !roofStairIsPattern3;
             roofStairPatternBRow.number.disabled = roofStairPatternBRow.range.disabled;
             roofStairBlendRow.range.disabled = !allow || !enabled || !roofStairToggle.input.checked;
             roofStairBlendRow.number.disabled = roofStairBlendRow.range.disabled;
             roofStairDirSelect.disabled = !allow || !enabled || !roofStairToggle.input.checked;
        
            roofDetailToggle.input.disabled = !allow || !enabled;
            roofDetailStrengthRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailStrengthRow.number.disabled = roofDetailStrengthRow.range.disabled;
            roofDetailScaleRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailScaleRow.number.disabled = roofDetailScaleRow.range.disabled;
            roofDetailHueRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailHueRow.number.disabled = roofDetailHueRow.range.disabled;
            roofDetailValueRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailValueRow.number.disabled = roofDetailValueRow.range.disabled;
            roofDetailSaturationRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailSaturationRow.number.disabled = roofDetailSaturationRow.range.disabled;
            roofDetailRoughnessRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailRoughnessRow.number.disabled = roofDetailRoughnessRow.range.disabled;
            roofDetailNormalRow.range.disabled = !allow || !enabled || !roofDetailToggle.input.checked;
            roofDetailNormalRow.number.disabled = roofDetailNormalRow.range.disabled;
        
            roofMacro2Toggle.input.disabled = !allow || !enabled;
             roofMacro2StrengthRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2StrengthRow.number.disabled = roofMacro2StrengthRow.range.disabled;
             roofMacro2ScaleRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2ScaleRow.number.disabled = roofMacro2ScaleRow.range.disabled;
             roofMacro2CoverageRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2CoverageRow.number.disabled = roofMacro2CoverageRow.range.disabled;
             roofMacro2HueRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2HueRow.number.disabled = roofMacro2HueRow.range.disabled;
            roofMacro2ValueRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
            roofMacro2ValueRow.number.disabled = roofMacro2ValueRow.range.disabled;
            roofMacro2SaturationRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
            roofMacro2SaturationRow.number.disabled = roofMacro2SaturationRow.range.disabled;
             roofMacro2RoughnessRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2RoughnessRow.number.disabled = roofMacro2RoughnessRow.range.disabled;
             roofMacro2NormalRow.range.disabled = !allow || !enabled || !roofMacro2Toggle.input.checked;
             roofMacro2NormalRow.number.disabled = roofMacro2NormalRow.range.disabled;
        
             roofMicroToggle.input.disabled = !allow || !enabled;
             roofMicroIntensityRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
             roofMicroIntensityRow.number.disabled = roofMicroIntensityRow.range.disabled;
             roofMicroScaleRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
             roofMicroScaleRow.number.disabled = roofMicroScaleRow.range.disabled;
             roofMicroRoughnessRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
             roofMicroRoughnessRow.number.disabled = roofMicroRoughnessRow.range.disabled;
             roofMicroNormalRow.range.disabled = !allow || !enabled || !roofMicroToggle.input.checked;
             roofMicroNormalRow.number.disabled = roofMicroNormalRow.range.disabled;
        
             roofCracksToggle.input.disabled = !allow || !enabled;
             roofCrackStrengthRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
             roofCrackStrengthRow.number.disabled = roofCrackStrengthRow.range.disabled;
            roofCrackScaleRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackScaleRow.number.disabled = roofCrackScaleRow.range.disabled;
            roofCrackHueRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackHueRow.number.disabled = roofCrackHueRow.range.disabled;
            roofCrackValueRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackValueRow.number.disabled = roofCrackValueRow.range.disabled;
            roofCrackSaturationRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackSaturationRow.number.disabled = roofCrackSaturationRow.range.disabled;
            roofCrackRoughnessRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackRoughnessRow.number.disabled = roofCrackRoughnessRow.range.disabled;
            roofCrackNormalRow.range.disabled = !allow || !enabled || !roofCracksToggle.input.checked;
            roofCrackNormalRow.number.disabled = roofCrackNormalRow.range.disabled;
        };
        
        roofMatVarToggle.input.addEventListener('change', () => {
            const nextEnabled = !!roofMatVarToggle.input.checked;
            const wasEnabled = !!layer.roof.materialVariation.enabled;
            if (nextEnabled && !wasEnabled && isMinimalMaterialVariationConfig(layer.roof.materialVariation)) {
                const prevSeedOffset = clampInt(layer.roof.materialVariation.seedOffset ?? 0, -9999, 9999);
                const prevNormalMap = layer.roof.materialVariation.normalMap && typeof layer.roof.materialVariation.normalMap === 'object'
                    ? { ...layer.roof.materialVariation.normalMap }
                    : null;
                layer.roof.materialVariation = createDisabledMaterialVariationConfig(MATERIAL_VARIATION_ROOT.SURFACE, { seedOffset: prevSeedOffset, normalMap: prevNormalMap });
                onReRender();
                onChange();
                return;
            }
        
            layer.roof.materialVariation.enabled = nextEnabled;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofSeedOffsetRow.range.addEventListener('input', () => {
            const next = clampInt(roofSeedOffsetRow.range.value, -9999, 9999);
            layer.roof.materialVariation.seedOffset = next;
            roofSeedOffsetRow.number.value = String(next);
            onChange();
        });
        roofSeedOffsetRow.number.addEventListener('change', () => {
            const next = clampInt(roofSeedOffsetRow.number.value, -9999, 9999);
            layer.roof.materialVariation.seedOffset = next;
            roofSeedOffsetRow.range.value = String(next);
            roofSeedOffsetRow.number.value = String(next);
            onChange();
        });
        roofIntensityRow.range.addEventListener('input', () => {
            const next = clamp(roofIntensityRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.globalIntensity = next;
            roofIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofIntensityRow.number.addEventListener('change', () => {
            const next = clamp(roofIntensityRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.globalIntensity = next;
            roofIntensityRow.range.value = String(next);
            roofIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofScaleRow.range.value, 0.05, 4.0);
            layer.roof.materialVariation.worldSpaceScale = next;
            roofScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
         roofScaleRow.number.addEventListener('change', () => {
             const next = clamp(roofScaleRow.number.value, 0.05, 4.0);
             layer.roof.materialVariation.worldSpaceScale = next;
             roofScaleRow.range.value = String(next);
             roofScaleRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         roofAoAmountRow.range.addEventListener('input', () => {
             const next = clamp(roofAoAmountRow.range.value, 0.0, 1.0);
             layer.roof.materialVariation.aoAmount = next;
            roofAoAmountRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofAoAmountRow.number.addEventListener('change', () => {
            const next = clamp(roofAoAmountRow.number.value, 0.0, 1.0);
            layer.roof.materialVariation.aoAmount = next;
            roofAoAmountRow.range.value = String(next);
            roofAoAmountRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMatVarSpaceSelect.addEventListener('change', () => {
            layer.roof.materialVariation.space = roofMatVarSpaceSelect.value === 'object' ? 'object' : 'world';
            syncRoofMatVarEnabled();
            onChange();
        });
        
        roofObjectScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofObjectScaleRow.range.value, 0.05, 4.0);
            layer.roof.materialVariation.objectSpaceScale = next;
            roofObjectScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofObjectScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofObjectScaleRow.number.value, 0.05, 4.0);
            layer.roof.materialVariation.objectSpaceScale = next;
            roofObjectScaleRow.range.value = String(next);
            roofObjectScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMatVarNormalFlipXToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.normalMap ??= {};
            layer.roof.materialVariation.normalMap.flipX = !!roofMatVarNormalFlipXToggle.input.checked;
            onChange();
        });
        roofMatVarNormalFlipYToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.normalMap ??= {};
            layer.roof.materialVariation.normalMap.flipY = !!roofMatVarNormalFlipYToggle.input.checked;
            onChange();
        });
        roofMatVarNormalFlipZToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.normalMap ??= {};
            layer.roof.materialVariation.normalMap.flipZ = !!roofMatVarNormalFlipZToggle.input.checked;
            onChange();
        });
        roofMacroToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].enabled = !!roofMacroToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofMacroIntensityRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroIntensityRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].intensity = next;
            roofMacroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroIntensityRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroIntensityRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].intensity = next;
            roofMacroIntensityRow.range.value = String(next);
            roofMacroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].scale = next;
            roofMacroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].scale = next;
            roofMacroScaleRow.range.value = String(next);
            roofMacroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroHueRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].hueDegrees = next;
            roofMacroHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofMacroHueRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].hueDegrees = next;
            roofMacroHueRow.range.value = String(next);
            roofMacroHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofMacroValueRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].value = next;
            roofMacroValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroValueRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].value = next;
            roofMacroValueRow.range.value = String(next);
            roofMacroValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacroSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].saturation = next;
            roofMacroSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].saturation = next;
            roofMacroSaturationRow.range.value = String(next);
            roofMacroSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacroRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].roughness = next;
            roofMacroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].roughness = next;
            roofMacroRoughnessRow.range.value = String(next);
            roofMacroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacroNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofMacroNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].normal = next;
            roofMacroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacroNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofMacroNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[0] ??= {};
            layer.roof.materialVariation.macroLayers[0].normal = next;
            roofMacroNormalRow.range.value = String(next);
            roofMacroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.enabled = !!roofGrimeToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofGrimeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.strength = next;
            roofGrimeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.strength = next;
            roofGrimeStrengthRow.range.value = String(next);
            roofGrimeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeWidthRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeWidthRow.range.value, 0.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.width = next;
            roofGrimeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeWidthRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeWidthRow.number.value, 0.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.width = next;
            roofGrimeWidthRow.range.value = String(next);
            roofGrimeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.scale = next;
            roofGrimeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.scale = next;
            roofGrimeScaleRow.range.value = String(next);
            roofGrimeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeHueRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.hueDegrees = next;
            roofGrimeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofGrimeHueRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.hueDegrees = next;
            roofGrimeHueRow.range.value = String(next);
            roofGrimeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofGrimeValueRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.value = next;
            roofGrimeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeValueRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.value = next;
            roofGrimeValueRow.range.value = String(next);
            roofGrimeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.saturation = next;
            roofGrimeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.saturation = next;
            roofGrimeSaturationRow.range.value = String(next);
            roofGrimeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.roughness = next;
            roofGrimeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.roughness = next;
            roofGrimeRoughnessRow.range.value = String(next);
            roofGrimeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofGrimeNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofGrimeNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.normal = next;
            roofGrimeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofGrimeNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofGrimeNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearBottom ??= {};
            layer.roof.materialVariation.wearBottom.normal = next;
            roofGrimeNormalRow.range.value = String(next);
            roofGrimeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStreaksToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.enabled = !!roofStreaksToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofStreakStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.strength = next;
            roofStreakStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.strength = next;
            roofStreakStrengthRow.range.value = String(next);
            roofStreakStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.scale = next;
            roofStreakScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.scale = next;
            roofStreakScaleRow.range.value = String(next);
            roofStreakScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakLedgeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakLedgeStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.ledgeStrength = next;
            roofStreakLedgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakLedgeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakLedgeStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.ledgeStrength = next;
            roofStreakLedgeStrengthRow.range.value = String(next);
            roofStreakLedgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakLedgeScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakLedgeScaleRow.range.value, 0.0, 20.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.ledgeScale = next;
            roofStreakLedgeScaleRow.number.value = formatFloat(next, 1);
            onChange();
        });
        roofStreakLedgeScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakLedgeScaleRow.number.value, 0.0, 20.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.ledgeScale = next;
            roofStreakLedgeScaleRow.range.value = String(next);
            roofStreakLedgeScaleRow.number.value = formatFloat(next, 1);
            onChange();
        });
        
        roofStreakHueRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.hueDegrees = next;
            roofStreakHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofStreakHueRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.hueDegrees = next;
            roofStreakHueRow.range.value = String(next);
            roofStreakHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofStreakValueRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.value = next;
            roofStreakValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakValueRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.value = next;
            roofStreakValueRow.range.value = String(next);
            roofStreakValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStreakSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.saturation = next;
            roofStreakSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.saturation = next;
            roofStreakSaturationRow.range.value = String(next);
            roofStreakSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStreakRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.roughness = next;
            roofStreakRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.roughness = next;
            roofStreakRoughnessRow.range.value = String(next);
            roofStreakRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStreakNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofStreakNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.normal = next;
            roofStreakNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStreakNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofStreakNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.streaks ??= {};
            layer.roof.materialVariation.streaks.normal = next;
            roofStreakNormalRow.range.value = String(next);
            roofStreakNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        const setRoofExposureDirectionFromUi = () => {
            const az = clamp(roofExposureAzimuthRow.range.value, 0.0, 360.0);
            const el = clamp(roofExposureElevationRow.range.value, 0.0, 90.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.direction = azimuthElevationDegreesToDirection(az, el);
        };
        
        roofExposureToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.enabled = !!roofExposureToggle.input.checked;
            setRoofExposureDirectionFromUi();
            syncRoofMatVarEnabled();
            onChange();
        });
        roofExposureStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.strength = next;
            roofExposureStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.strength = next;
            roofExposureStrengthRow.range.value = String(next);
            roofExposureStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureExponentRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureExponentRow.range.value, 0.1, 8.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.exponent = next;
            roofExposureExponentRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureExponentRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureExponentRow.number.value, 0.1, 8.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.exponent = next;
            roofExposureExponentRow.range.value = String(next);
            roofExposureExponentRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureAzimuthRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureAzimuthRow.range.value, 0.0, 360.0);
            roofExposureAzimuthRow.number.value = String(Math.round(next));
            setRoofExposureDirectionFromUi();
            onChange();
        });
        roofExposureAzimuthRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureAzimuthRow.number.value, 0.0, 360.0);
            roofExposureAzimuthRow.range.value = String(next);
            roofExposureAzimuthRow.number.value = String(Math.round(next));
            setRoofExposureDirectionFromUi();
            onChange();
        });
        roofExposureElevationRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureElevationRow.range.value, 0.0, 90.0);
            roofExposureElevationRow.number.value = String(Math.round(next));
            setRoofExposureDirectionFromUi();
            onChange();
        });
        roofExposureElevationRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureElevationRow.number.value, 0.0, 90.0);
            roofExposureElevationRow.range.value = String(next);
            roofExposureElevationRow.number.value = String(Math.round(next));
            setRoofExposureDirectionFromUi();
            onChange();
        });
        roofExposureValueRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.value = next;
            roofExposureValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureValueRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.value = next;
            roofExposureValueRow.range.value = String(next);
            roofExposureValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.saturation = next;
            roofExposureSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.saturation = next;
            roofExposureSaturationRow.range.value = String(next);
            roofExposureSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofExposureRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.roughness = next;
            roofExposureRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofExposureRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofExposureRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.exposure ??= {};
            layer.roof.materialVariation.exposure.roughness = next;
            roofExposureRoughnessRow.range.value = String(next);
            roofExposureRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofEdgeToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.enabled = !!roofEdgeToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofEdgeStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.strength = next;
            roofEdgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.strength = next;
            roofEdgeStrengthRow.range.value = String(next);
            roofEdgeStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeWidthRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeWidthRow.range.value, 0.0, 4.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.width = next;
            roofEdgeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeWidthRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeWidthRow.number.value, 0.0, 4.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.width = next;
            roofEdgeWidthRow.range.value = String(next);
            roofEdgeWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.scale = next;
            roofEdgeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.scale = next;
            roofEdgeScaleRow.range.value = String(next);
            roofEdgeScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofEdgeHueRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.hueDegrees = next;
            roofEdgeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofEdgeHueRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.hueDegrees = next;
            roofEdgeHueRow.range.value = String(next);
            roofEdgeHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofEdgeValueRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.value = next;
            roofEdgeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeValueRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.value = next;
            roofEdgeValueRow.range.value = String(next);
            roofEdgeValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofEdgeSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.saturation = next;
            roofEdgeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.saturation = next;
            roofEdgeSaturationRow.range.value = String(next);
            roofEdgeSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofEdgeRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.roughness = next;
            roofEdgeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.roughness = next;
            roofEdgeRoughnessRow.range.value = String(next);
            roofEdgeRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofEdgeNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofEdgeNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.normal = next;
            roofEdgeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofEdgeNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofEdgeNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearSide ??= {};
            layer.roof.materialVariation.wearSide.normal = next;
            roofEdgeNormalRow.range.value = String(next);
            roofEdgeNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDustToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.enabled = !!roofDustToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofDustStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofDustStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.strength = next;
            roofDustStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofDustStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.strength = next;
            roofDustStrengthRow.range.value = String(next);
            roofDustStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustWidthRow.range.addEventListener('input', () => {
            const next = clamp(roofDustWidthRow.range.value, 0.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.width = next;
            roofDustWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustWidthRow.number.addEventListener('change', () => {
            const next = clamp(roofDustWidthRow.number.value, 0.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.width = next;
            roofDustWidthRow.range.value = String(next);
            roofDustWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofDustScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.scale = next;
            roofDustScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofDustScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.scale = next;
            roofDustScaleRow.range.value = String(next);
            roofDustScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDustHueRow.range.addEventListener('input', () => {
            const next = clamp(roofDustHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.hueDegrees = next;
            roofDustHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofDustHueRow.number.addEventListener('change', () => {
            const next = clamp(roofDustHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.hueDegrees = next;
            roofDustHueRow.range.value = String(next);
            roofDustHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofDustValueRow.range.addEventListener('input', () => {
            const next = clamp(roofDustValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.value = next;
            roofDustValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustValueRow.number.addEventListener('change', () => {
            const next = clamp(roofDustValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.value = next;
            roofDustValueRow.range.value = String(next);
            roofDustValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDustSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofDustSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.saturation = next;
            roofDustSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofDustSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.saturation = next;
            roofDustSaturationRow.range.value = String(next);
            roofDustSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDustRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofDustRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.roughness = next;
            roofDustRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofDustRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.roughness = next;
            roofDustRoughnessRow.range.value = String(next);
            roofDustRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDustNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofDustNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.normal = next;
            roofDustNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDustNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofDustNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.wearTop ??= {};
            layer.roof.materialVariation.wearTop.normal = next;
            roofDustNormalRow.range.value = String(next);
            roofDustNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.enabled = !!roofPerBrickToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        
        roofPerBrickBricksPerTileXRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickBricksPerTileXRow.range.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.bricksPerTileX = next;
            roofPerBrickBricksPerTileXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickBricksPerTileXRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickBricksPerTileXRow.number.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.bricksPerTileX = next;
            roofPerBrickBricksPerTileXRow.range.value = String(next);
            roofPerBrickBricksPerTileXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickBricksPerTileYRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickBricksPerTileYRow.range.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.bricksPerTileY = next;
            roofPerBrickBricksPerTileYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickBricksPerTileYRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickBricksPerTileYRow.number.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.bricksPerTileY = next;
            roofPerBrickBricksPerTileYRow.range.value = String(next);
            roofPerBrickBricksPerTileYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickMortarWidthRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickMortarWidthRow.range.value, 0.0, 0.49);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.mortarWidth = next;
            roofPerBrickMortarWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickMortarWidthRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickMortarWidthRow.number.value, 0.0, 0.49);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.mortarWidth = next;
            roofPerBrickMortarWidthRow.range.value = String(next);
            roofPerBrickMortarWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickOffsetXRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickOffsetXRow.range.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.offsetX = next;
            roofPerBrickOffsetXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickOffsetXRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickOffsetXRow.number.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.offsetX = next;
            roofPerBrickOffsetXRow.range.value = String(next);
            roofPerBrickOffsetXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickOffsetYRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickOffsetYRow.range.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.offsetY = next;
            roofPerBrickOffsetYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickOffsetYRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickOffsetYRow.number.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.layout ??= {};
            layer.roof.materialVariation.brick.perBrick.layout.offsetY = next;
            roofPerBrickOffsetYRow.range.value = String(next);
            roofPerBrickOffsetYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.strength = next;
            roofPerBrickStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.strength = next;
            roofPerBrickStrengthRow.range.value = String(next);
            roofPerBrickStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickHueRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.hueDegrees = next;
            roofPerBrickHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofPerBrickHueRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.hueDegrees = next;
            roofPerBrickHueRow.range.value = String(next);
            roofPerBrickHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofPerBrickValueRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.value = next;
            roofPerBrickValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickValueRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.value = next;
            roofPerBrickValueRow.range.value = String(next);
            roofPerBrickValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.saturation = next;
            roofPerBrickSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.saturation = next;
            roofPerBrickSaturationRow.range.value = String(next);
            roofPerBrickSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.roughness = next;
            roofPerBrickRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.roughness = next;
            roofPerBrickRoughnessRow.range.value = String(next);
            roofPerBrickRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofPerBrickNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofPerBrickNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.normal = next;
            roofPerBrickNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofPerBrickNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofPerBrickNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.perBrick ??= {};
            layer.roof.materialVariation.brick.perBrick.normal = next;
            roofPerBrickNormalRow.range.value = String(next);
            roofPerBrickNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.enabled = !!roofMortarToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        
        roofMortarBricksPerTileXRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarBricksPerTileXRow.range.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.bricksPerTileX = next;
            roofMortarBricksPerTileXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarBricksPerTileXRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarBricksPerTileXRow.number.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.bricksPerTileX = next;
            roofMortarBricksPerTileXRow.range.value = String(next);
            roofMortarBricksPerTileXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarBricksPerTileYRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarBricksPerTileYRow.range.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.bricksPerTileY = next;
            roofMortarBricksPerTileYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarBricksPerTileYRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarBricksPerTileYRow.number.value, 0.25, 200.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.bricksPerTileY = next;
            roofMortarBricksPerTileYRow.range.value = String(next);
            roofMortarBricksPerTileYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarMortarWidthRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarMortarWidthRow.range.value, 0.0, 0.49);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.mortarWidth = next;
            roofMortarMortarWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarMortarWidthRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarMortarWidthRow.number.value, 0.0, 0.49);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.mortarWidth = next;
            roofMortarMortarWidthRow.range.value = String(next);
            roofMortarMortarWidthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarOffsetXRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarOffsetXRow.range.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.offsetX = next;
            roofMortarOffsetXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarOffsetXRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarOffsetXRow.number.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.offsetX = next;
            roofMortarOffsetXRow.range.value = String(next);
            roofMortarOffsetXRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarOffsetYRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarOffsetYRow.range.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.offsetY = next;
            roofMortarOffsetYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarOffsetYRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarOffsetYRow.number.value, -10.0, 10.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.layout ??= {};
            layer.roof.materialVariation.brick.mortar.layout.offsetY = next;
            roofMortarOffsetYRow.range.value = String(next);
            roofMortarOffsetYRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.strength = next;
            roofMortarStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.strength = next;
            roofMortarStrengthRow.range.value = String(next);
            roofMortarStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarHueRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.hueDegrees = next;
            roofMortarHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofMortarHueRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.hueDegrees = next;
            roofMortarHueRow.range.value = String(next);
            roofMortarHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofMortarValueRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.value = next;
            roofMortarValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarValueRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.value = next;
            roofMortarValueRow.range.value = String(next);
            roofMortarValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.saturation = next;
            roofMortarSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.saturation = next;
            roofMortarSaturationRow.range.value = String(next);
            roofMortarSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.roughness = next;
            roofMortarRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.roughness = next;
            roofMortarRoughnessRow.range.value = String(next);
            roofMortarRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMortarNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofMortarNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.normal = next;
            roofMortarNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMortarNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofMortarNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.brick ??= {};
            layer.roof.materialVariation.brick.mortar ??= {};
            layer.roof.materialVariation.brick.mortar.normal = next;
            roofMortarNormalRow.range.value = String(next);
            roofMortarNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStairToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.enabled = !!roofStairToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofStairStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofStairStrengthRow.range.value, 0.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.strength = next;
            roofStairStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofStairStrengthRow.number.value, 0.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.strength = next;
            roofStairStrengthRow.range.value = String(next);
            roofStairStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairStepRow.range.addEventListener('input', () => {
            const next = clamp(roofStairStepRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.stepSize = next;
            roofStairStepRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairStepRow.number.addEventListener('change', () => {
            const next = clamp(roofStairStepRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.stepSize = next;
            roofStairStepRow.range.value = String(next);
            roofStairStepRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairShiftRow.range.addEventListener('input', () => {
            const next = clamp(roofStairShiftRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.shift = next;
            roofStairShiftRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairShiftRow.number.addEventListener('change', () => {
            const next = clamp(roofStairShiftRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.shift = next;
            roofStairShiftRow.range.value = String(next);
            roofStairShiftRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairModeSelect.addEventListener('change', () => {
            layer.roof.materialVariation.stairShift ??= {};
            const v = roofStairModeSelect.value;
            layer.roof.materialVariation.stairShift.mode = v === 'random'
                ? 'random'
                : (v === 'alternate' ? 'alternate' : (v === 'pattern3' ? 'pattern3' : 'stair'));
            syncRoofMatVarEnabled();
            onChange();
        });
        
        roofStairPatternARow.range.addEventListener('input', () => {
            const next = clamp(roofStairPatternARow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.patternA = next;
            roofStairPatternARow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairPatternARow.number.addEventListener('change', () => {
            const next = clamp(roofStairPatternARow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.patternA = next;
            roofStairPatternARow.range.value = String(next);
            roofStairPatternARow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofStairPatternBRow.range.addEventListener('input', () => {
            const next = clamp(roofStairPatternBRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.patternB = next;
            roofStairPatternBRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairPatternBRow.number.addEventListener('change', () => {
            const next = clamp(roofStairPatternBRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.patternB = next;
            roofStairPatternBRow.range.value = String(next);
            roofStairPatternBRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairBlendRow.range.addEventListener('input', () => {
            const next = clamp(roofStairBlendRow.range.value, 0.0, 0.49);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.blendWidth = next;
            roofStairBlendRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairBlendRow.number.addEventListener('change', () => {
            const next = clamp(roofStairBlendRow.number.value, 0.0, 0.49);
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.blendWidth = next;
            roofStairBlendRow.range.value = String(next);
            roofStairBlendRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofStairDirSelect.addEventListener('change', () => {
            layer.roof.materialVariation.stairShift ??= {};
            layer.roof.materialVariation.stairShift.direction = roofStairDirSelect.value === 'vertical' ? 'vertical' : 'horizontal';
            onChange();
        });
        
        roofDetailToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].enabled = !!roofDetailToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofDetailStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].intensity = next;
            roofDetailStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].intensity = next;
            roofDetailStrengthRow.range.value = String(next);
            roofDetailStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].scale = next;
            roofDetailScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].scale = next;
            roofDetailScaleRow.range.value = String(next);
            roofDetailScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailHueRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].hueDegrees = next;
            roofDetailHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofDetailHueRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].hueDegrees = next;
            roofDetailHueRow.range.value = String(next);
            roofDetailHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofDetailValueRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].value = next;
            roofDetailValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailValueRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].value = next;
            roofDetailValueRow.range.value = String(next);
            roofDetailValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDetailSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].saturation = next;
            roofDetailSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].saturation = next;
            roofDetailSaturationRow.range.value = String(next);
            roofDetailSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDetailRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].roughness = next;
            roofDetailRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].roughness = next;
            roofDetailRoughnessRow.range.value = String(next);
            roofDetailRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofDetailNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofDetailNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].normal = next;
            roofDetailNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofDetailNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofDetailNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[1] ??= {};
            layer.roof.materialVariation.macroLayers[1].normal = next;
            roofDetailNormalRow.range.value = String(next);
            roofDetailNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacro2Toggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].enabled = !!roofMacro2Toggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofMacro2StrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2StrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].intensity = next;
            roofMacro2StrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2StrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2StrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].intensity = next;
            roofMacro2StrengthRow.range.value = String(next);
            roofMacro2StrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2ScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2ScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].scale = next;
            roofMacro2ScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2ScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2ScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].scale = next;
            roofMacro2ScaleRow.range.value = String(next);
            roofMacro2ScaleRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         roofMacro2CoverageRow.range.addEventListener('input', () => {
             const next = clamp(roofMacro2CoverageRow.range.value, 0.0, 1.0);
             layer.roof.materialVariation.macroLayers ??= [];
             layer.roof.materialVariation.macroLayers[2] ??= {};
             layer.roof.materialVariation.macroLayers[2].coverage = next;
             roofMacro2CoverageRow.number.value = formatFloat(next, 2);
             onChange();
         });
         roofMacro2CoverageRow.number.addEventListener('change', () => {
             const next = clamp(roofMacro2CoverageRow.number.value, 0.0, 1.0);
             layer.roof.materialVariation.macroLayers ??= [];
             layer.roof.materialVariation.macroLayers[2] ??= {};
             layer.roof.materialVariation.macroLayers[2].coverage = next;
             roofMacro2CoverageRow.range.value = String(next);
             roofMacro2CoverageRow.number.value = formatFloat(next, 2);
             onChange();
         });
        
         roofMacro2HueRow.range.addEventListener('input', () => {
             const next = clamp(roofMacro2HueRow.range.value, -180.0, 180.0);
             layer.roof.materialVariation.macroLayers ??= [];
             layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].hueDegrees = next;
            roofMacro2HueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofMacro2HueRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2HueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].hueDegrees = next;
            roofMacro2HueRow.range.value = String(next);
            roofMacro2HueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofMacro2ValueRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2ValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].value = next;
            roofMacro2ValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2ValueRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2ValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].value = next;
            roofMacro2ValueRow.range.value = String(next);
            roofMacro2ValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacro2SaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2SaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].saturation = next;
            roofMacro2SaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2SaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2SaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].saturation = next;
            roofMacro2SaturationRow.range.value = String(next);
            roofMacro2SaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacro2RoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2RoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].roughness = next;
            roofMacro2RoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2RoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2RoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].roughness = next;
            roofMacro2RoughnessRow.range.value = String(next);
            roofMacro2RoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMacro2NormalRow.range.addEventListener('input', () => {
            const next = clamp(roofMacro2NormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].normal = next;
            roofMacro2NormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMacro2NormalRow.number.addEventListener('change', () => {
            const next = clamp(roofMacro2NormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[2] ??= {};
            layer.roof.materialVariation.macroLayers[2].normal = next;
            roofMacro2NormalRow.range.value = String(next);
            roofMacro2NormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMicroToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].enabled = !!roofMicroToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofMicroIntensityRow.range.addEventListener('input', () => {
            const next = clamp(roofMicroIntensityRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].intensity = next;
            roofMicroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMicroIntensityRow.number.addEventListener('change', () => {
            const next = clamp(roofMicroIntensityRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].intensity = next;
            roofMicroIntensityRow.range.value = String(next);
            roofMicroIntensityRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMicroScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofMicroScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].scale = next;
            roofMicroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMicroScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofMicroScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].scale = next;
            roofMicroScaleRow.range.value = String(next);
            roofMicroScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMicroRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofMicroRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].roughness = next;
            roofMicroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMicroRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofMicroRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].roughness = next;
            roofMicroRoughnessRow.range.value = String(next);
            roofMicroRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofMicroNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofMicroNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].normal = next;
            roofMicroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofMicroNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofMicroNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.macroLayers ??= [];
            layer.roof.materialVariation.macroLayers[3] ??= {};
            layer.roof.materialVariation.macroLayers[3].normal = next;
            roofMicroNormalRow.range.value = String(next);
            roofMicroNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofCracksToggle.input.addEventListener('change', () => {
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.enabled = !!roofCracksToggle.input.checked;
            syncRoofMatVarEnabled();
            onChange();
        });
        roofCrackStrengthRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackStrengthRow.range.value, 0.0, 2.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.strength = next;
            roofCrackStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackStrengthRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackStrengthRow.number.value, 0.0, 2.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.strength = next;
            roofCrackStrengthRow.range.value = String(next);
            roofCrackStrengthRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackScaleRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackScaleRow.range.value, 0.01, 20.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.scale = next;
            roofCrackScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackScaleRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackScaleRow.number.value, 0.01, 20.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.scale = next;
            roofCrackScaleRow.range.value = String(next);
            roofCrackScaleRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofCrackHueRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackHueRow.range.value, -180.0, 180.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.hueDegrees = next;
            roofCrackHueRow.number.value = String(Math.round(next));
            onChange();
        });
        roofCrackHueRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackHueRow.number.value, -180.0, 180.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.hueDegrees = next;
            roofCrackHueRow.range.value = String(next);
            roofCrackHueRow.number.value = String(Math.round(next));
            onChange();
        });
        
        roofCrackValueRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackValueRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.value = next;
            roofCrackValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackValueRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackValueRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.value = next;
            roofCrackValueRow.range.value = String(next);
            roofCrackValueRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofCrackSaturationRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackSaturationRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.saturation = next;
            roofCrackSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackSaturationRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackSaturationRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.saturation = next;
            roofCrackSaturationRow.range.value = String(next);
            roofCrackSaturationRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofCrackRoughnessRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackRoughnessRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.roughness = next;
            roofCrackRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackRoughnessRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackRoughnessRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.roughness = next;
            roofCrackRoughnessRow.range.value = String(next);
            roofCrackRoughnessRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        roofCrackNormalRow.range.addEventListener('input', () => {
            const next = clamp(roofCrackNormalRow.range.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.normal = next;
            roofCrackNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        roofCrackNormalRow.number.addEventListener('change', () => {
            const next = clamp(roofCrackNormalRow.number.value, -1.0, 1.0);
            layer.roof.materialVariation.cracksLayer ??= {};
            layer.roof.materialVariation.cracksLayer.normal = next;
            roofCrackNormalRow.range.value = String(next);
            roofCrackNormalRow.number.value = formatFloat(next, 2);
            onChange();
        });
        
        syncRoofMatVarEnabled();
        roofMatVarBasicsGroup.body.appendChild(document.createElement('div')).className = 'building-fab-hint';
        roofMatVarBasicsGroup.body.lastChild.textContent = 'Enable the variation system to add weathering and breakup.';
        parent.appendChild(roofMatVarGroup.details);
    };

    return {
        seedSection,
        debugSection,
        mount,
        bind,
        unbind,
        sync,
        getDebugConfig,
        appendWallMaterialVariationUI,
        appendRoofMaterialVariationUI
    };
}
