// src/graphics/gui/building_fabrication/MaterialVariationLayerUI.js
// Data-driven Material Variation layer UI (shared by wall + roof contexts).
import { MATERIAL_VARIATION_ROOT, getDefaultMaterialVariationPreset, normalizeMaterialVariationConfig } from '../../assets3d/materials/MaterialVariationSystem.js';
import { clampInt, clampNumber, formatFixed } from './mini_controllers/RangeNumberUtils.js';
import { createMaterialVariationAntiTilingMiniController } from './mini_controllers/MaterialVariationAntiTilingMiniController.js';
import { createRangeNumberRowController } from './mini_controllers/RangeNumberRowController.js';
import { createSelectRowController } from './mini_controllers/SelectRowController.js';
import { createToggleRowController } from './mini_controllers/ToggleRowController.js';
import { applyTooltip, createDetailsSection, createHint } from './mini_controllers/UiMiniControlPrimitives.js';
import { createUiControlRegistry } from '../shared/utils/uiControlRegistry.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

function clamp(value, min, max) {
    return clampNumber(value, min, max);
}

function formatFloat(value, digits = 1) {
    return formatFixed(value, digits);
}

function formatHueNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';
    return String(Math.round(num));
}

function tip(...lines) {
    return lines.filter((line) => typeof line === 'string' && line.trim()).join('\n');
}

function normalizeDirection(dir, fallback = { x: 0.4, y: 0.85, z: 0.2 }) {
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
}

function directionToAzimuthElevationDegrees(dir) {
    const n = normalizeDirection(dir, { x: 0, y: 1, z: 0 });
    const elevationDegrees = Math.asin(clamp(n.y, -1, 1)) * (180 / Math.PI);
    let azimuthDegrees = Math.atan2(n.z, n.x) * (180 / Math.PI);
    if (azimuthDegrees < 0) azimuthDegrees += 360;
    return { azimuthDegrees, elevationDegrees };
}

function azimuthElevationDegreesToDirection(azimuthDegrees, elevationDegrees) {
    const az = clamp(azimuthDegrees, 0, 360) * (Math.PI / 180);
    const el = clamp(elevationDegrees, 0, 90) * (Math.PI / 180);
    const cosEl = Math.cos(el);
    const x = cosEl * Math.cos(az);
    const z = cosEl * Math.sin(az);
    const y = Math.sin(el);
    return normalizeDirection({ x, y, z }, { x: 0, y: 1, z: 0 });
}

function addDetailsResetButton(section, { allow = true, label = 'Reset to defaults', onReset = null } = {}) {
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
}

function isMinimalMaterialVariationConfig(cfg) {
    const src = cfg && typeof cfg === 'object' ? cfg : null;
    if (!src) return true;
    const keys = Object.keys(src);
    for (const key of keys) {
        if (key !== 'enabled' && key !== 'seedOffset' && key !== 'normalMap') return false;
    }
    return true;
}

function createDisabledMaterialVariationConfig(root, { seedOffset = 0, normalMap = null } = {}) {
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
}

function ensureObject(parent, key) {
    const obj = parent && typeof parent === 'object' ? parent : null;
    if (!obj) return null;
    const current = obj[key];
    if (current && typeof current === 'object' && !Array.isArray(current)) return current;
    const next = {};
    obj[key] = next;
    return next;
}

function ensureArray(parent, key) {
    const obj = parent && typeof parent === 'object' ? parent : null;
    if (!obj) return [];
    if (Array.isArray(obj[key])) return obj[key];
    obj[key] = [];
    return obj[key];
}

function ensureIndex(parentArray, index) {
    const arr = Array.isArray(parentArray) ? parentArray : [];
    const i = Number(index) | 0;
    if (i < 0) return null;
    if (!arr[i] || typeof arr[i] !== 'object') arr[i] = {};
    return arr[i];
}

function createFormBuilder({ parent, registry } = {}) {
    const root = parent instanceof HTMLElement ? parent : null;
    const reg = registry ?? createUiControlRegistry();

    const append = (control, { key = null, enabledIf = null, visibleIf = null } = {}) => {
        const el = control?.root ?? control?.row ?? control;
        if (root && el) root.appendChild(el);
        reg.add(control, { key, enabledIf, visibleIf });
        return control;
    };

    const toggle = ({
        key,
        enabledIf = null,
        visibleIf = null,
        ...controllerArgs
    }) => append(createToggleRowController(controllerArgs), { key, enabledIf, visibleIf });

    const range = ({
        key,
        enabledIf = null,
        visibleIf = null,
        ...controllerArgs
    }) => append(createRangeNumberRowController(controllerArgs), { key, enabledIf, visibleIf });

    const select = ({
        key,
        enabledIf = null,
        visibleIf = null,
        ...controllerArgs
    }) => append(createSelectRowController(controllerArgs), { key, enabledIf, visibleIf });

    const hint = (text) => {
        const el = createHint(text);
        if (root && el) root.appendChild(el);
        return el;
    };

    return { toggle, range, select, hint, registry: reg };
}

export function appendMaterialVariationLayerUI({
    parent,
    allow = true,
    scopeKey = '',
    layerId = '',
    layer,
    kind = 'walls',
    detailsOpenByKey,
    onChange: onChangeArg,
    onReRender: onReRenderArg,
    registerMiniController: registerArg
} = {}) {
    const onChange = typeof onChangeArg === 'function' ? onChangeArg : () => {};
    const onReRender = typeof onReRenderArg === 'function' ? onReRenderArg : () => {};
    const registerMiniController = typeof registerArg === 'function' ? registerArg : () => {};
    const detailsMap = detailsOpenByKey instanceof Map ? detailsOpenByKey : new Map();

    const layerObj = layer && typeof layer === 'object' ? layer : {};
    const isRoof = kind === 'roof';
    const scope = isRoof ? 'roof' : 'walls';
    const nested = !isRoof;
    const root = isRoof ? MATERIAL_VARIATION_ROOT.SURFACE : MATERIAL_VARIATION_ROOT.WALL;
    const subject = isRoof ? 'roof/surface layer' : 'layer';

    const target = isRoof ? (ensureObject(layerObj, 'roof') ?? {}) : layerObj;
    target.materialVariation ??= { enabled: false, seedOffset: 0 };
    const cfg = target.materialVariation;
    const normalized = normalizeMaterialVariationConfig(cfg, { root });

    const registry = createUiControlRegistry();
    registerMiniController(registry);

    let matVarToggle = null;
    let spaceSelect = null;
    let stairToggle = null;
    let stairModeSelect = null;
    let perBrickToggle = null;
    let mortarToggle = null;
    let macro0Toggle = null;
    let macro1Toggle = null;
    let macro2Toggle = null;
    let microToggle = null;
    let cracksToggle = null;
    let streaksToggle = null;
    let exposureToggle = null;
    let wearSideToggle = null;
    let wearBottomToggle = null;
    let wearTopToggle = null;

    const isMatVarEnabled = () => (matVarToggle ? !!matVarToggle.input.checked : !!normalized.enabled);
    const isObjectSpace = () => {
        const v = spaceSelect?.select?.value ?? (normalized.space === 'object' ? 'object' : 'world');
        return v === 'object';
    };
    const isStairEnabled = () => (stairToggle ? !!stairToggle.input.checked : !!normalized.stairShift?.enabled);
    const isStairPattern3 = () => {
        const v = stairModeSelect?.select?.value ?? (normalized.stairShift?.mode ?? 'stair');
        return v === 'pattern3';
    };
    const isPerBrickEnabled = () => (perBrickToggle ? !!perBrickToggle.input.checked : !!normalized.brick?.perBrick?.enabled);
    const isMortarEnabled = () => (mortarToggle ? !!mortarToggle.input.checked : !!normalized.brick?.mortar?.enabled);
    const isMacro0Enabled = () => (macro0Toggle ? !!macro0Toggle.input.checked : !!normalized.macroLayers?.[0]?.enabled);
    const isMacro1Enabled = () => (macro1Toggle ? !!macro1Toggle.input.checked : !!normalized.macroLayers?.[1]?.enabled);
    const isMacro2Enabled = () => (macro2Toggle ? !!macro2Toggle.input.checked : !!normalized.macroLayers?.[2]?.enabled);
    const isMicroEnabled = () => (microToggle ? !!microToggle.input.checked : !!normalized.macroLayers?.[3]?.enabled);
    const isCracksEnabled = () => (cracksToggle ? !!cracksToggle.input.checked : !!normalized.cracksLayer?.enabled);
    const isStreaksEnabled = () => (streaksToggle ? !!streaksToggle.input.checked : !!normalized.streaks?.enabled);
    const isExposureEnabled = () => (exposureToggle ? !!exposureToggle.input.checked : !!normalized.exposure?.enabled);
    const isWearSideEnabled = () => (wearSideToggle ? !!wearSideToggle.input.checked : !!normalized.wearSide?.enabled);
    const isWearBottomEnabled = () => (wearBottomToggle ? !!wearBottomToggle.input.checked : !!normalized.wearBottom?.enabled);
    const isWearTopEnabled = () => (wearTopToggle ? !!wearTopToggle.input.checked : !!normalized.wearTop?.enabled);

    let antiController = null;

    const syncEnabled = () => {
        registry.sync();
        antiController?.syncDisabled?.({ allow: !!allow, parentEnabled: isMatVarEnabled() });
    };

    const matVarGroup = createDetailsSection('Material variation', {
        open: false,
        nested,
        key: `${scopeKey}:layer:${layerId}:${scope}:matvar`,
        detailsOpenByKey: detailsMap
    });
    const basicsGroup = createDetailsSection('Basics', { open: true, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:basics`, detailsOpenByKey: detailsMap });
    const macroGroup = createDetailsSection('Macro variation', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:macro`, detailsOpenByKey: detailsMap });
    const midGroup = createDetailsSection('Mid variation (patches)', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:mid`, detailsOpenByKey: detailsMap });
    const microGroup = createDetailsSection('Micro variation (surface response)', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:micro`, detailsOpenByKey: detailsMap });
    const weatherGroup = createDetailsSection('Weathering', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:weather`, detailsOpenByKey: detailsMap });
    const brickGroup = createDetailsSection('Brick-specific', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:brick`, detailsOpenByKey: detailsMap });
    const advancedGroup = createDetailsSection('Advanced', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:advanced`, detailsOpenByKey: detailsMap });

    matVarGroup.body.appendChild(basicsGroup.details);
    matVarGroup.body.appendChild(macroGroup.details);
    matVarGroup.body.appendChild(midGroup.details);
    matVarGroup.body.appendChild(microGroup.details);
    matVarGroup.body.appendChild(weatherGroup.details);
    matVarGroup.body.appendChild(brickGroup.details);
    matVarGroup.body.appendChild(advancedGroup.details);

    applyTooltip(
        matVarGroup.label,
        tip(
            `Procedural material variation and weathering for this ${subject}.`,
            'Start with Basics → Intensity and World scale.',
            'Too much: stacked effects look noisy or overly dirty.'
        )
    );
    addDetailsResetButton(matVarGroup, {
        allow,
        onReset: () => {
            const prevEnabled = !!cfg.enabled;
            const prevSeedOffset = clampInt(cfg.seedOffset ?? 0, -9999, 9999);
            const preset = getDefaultMaterialVariationPreset(root);
            target.materialVariation = { ...preset, enabled: prevEnabled, seedOffset: prevSeedOffset };
            onReRender();
            onChange();
        }
    });

    applyTooltip(
        basicsGroup.label,
        tip(
            'Global controls that affect all enabled strategies.',
            'Start here before touching the deeper groups.',
            'Too much: high intensity + small world scale looks like grain/noise.'
        )
    );
    applyTooltip(
        macroGroup.label,
        tip(
            'Large-scale breakup to fight repeating textures.',
            'Start with Intensity + Scale on Macro layer 1.',
            'Too much: obvious cloudy blotches.'
        )
    );
    applyTooltip(
        midGroup.label,
        tip(
            'Patchy mid-scale variation (repairs/batches/fade).',
            'Use sparingly for subtle material history.',
            'Too much: looks like painted camouflage.'
        )
    );
    applyTooltip(
        microGroup.label,
        tip(
            'High-frequency variation for surface response (mostly roughness/normal).',
            'Use small amounts to avoid flat, CG-looking materials.',
            'Too much: sparkly, noisy specular.'
        )
    );
    applyTooltip(
        weatherGroup.label,
        tip(
            'Purpose-driven weathering: runoff streaks, top deposits, ground grime, edge wear, cracks.',
            'Prefer one or two subtle effects rather than everything at once.',
            isRoof
                ? 'Too much: uniformly dirty surfaces with no believable story.'
                : 'Too much: uniformly dirty walls with no believable story.'
        )
    );
    applyTooltip(
        brickGroup.label,
        tip(
            'Brick-specific controls (bonding / per-brick / mortar).',
            'Use only for brick-like materials.',
            'Too much: patterning becomes more obvious than the base texture.'
        )
    );
    applyTooltip(
        advancedGroup.label,
        tip(
            'Advanced controls (projection/space/debug/perf).',
            'Usually leave defaults.',
            'Too much: can cause distortion or artifacts.'
        )
    );

    const basics = createFormBuilder({ parent: basicsGroup.body, registry, registerMiniController });
    const advanced = createFormBuilder({ parent: advancedGroup.body, registry, registerMiniController });

    matVarToggle = basics.toggle({
        key: `${scope}:matvar:enabled`,
        label: 'Enable variation',
        checked: !!normalized.enabled,
        disabled: !allow,
        mustHave: true,
        tooltip: tip(
            isRoof
                ? 'Turns on the variation system for this roof/surface layer.'
                : 'Turns on the variation system for this layer.',
            'Typical: enable for subtle breakup and weathering.',
            'Too much: high intensity across many strategies looks noisy/dirty.'
        ),
        onChange: (checked) => {
            const nextEnabled = !!checked;
            const wasEnabled = !!cfg.enabled;
            if (nextEnabled && !wasEnabled && isMinimalMaterialVariationConfig(cfg)) {
                const prevSeedOffset = clampInt(cfg.seedOffset ?? 0, -9999, 9999);
                const prevNormalMap = cfg.normalMap && typeof cfg.normalMap === 'object' ? { ...cfg.normalMap } : null;
                target.materialVariation = createDisabledMaterialVariationConfig(root, { seedOffset: prevSeedOffset, normalMap: prevNormalMap });
                onReRender();
                onChange();
                return;
            }

            cfg.enabled = nextEnabled;
            syncEnabled();
            onChange();
        }
    });

    const seedOffsetRow = basics.range({
        key: `${scope}:matvar:seedOffset`,
        label: 'Seed offset',
        min: -9999,
        max: 9999,
        step: 1,
        value: clampInt(cfg.seedOffset ?? 0, -9999, 9999),
        clamp: (v) => clampInt(v, -9999, 9999),
        tooltip: tip(
            'Offsets the random seed for this layer.',
            'Use to make the same style look different per building.',
            'Too much: not harmful, but makes iteration harder to compare.'
        ),
        onChange: (next) => {
            cfg.seedOffset = clampInt(next, -9999, 9999);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    basics.range({
        key: `${scope}:matvar:globalIntensity`,
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.01,
        value: normalized.globalIntensity,
        mustHave: true,
        tooltip: tip(
            'Overall multiplier for all enabled variation strategies.',
            'Typical: 0.5–1.5 for subtle breakup.',
            'Too much: everything becomes noisy and over-processed.'
        ),
        onChange: (next) => {
            cfg.globalIntensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    basics.range({
        key: `${scope}:matvar:worldSpaceScale`,
        label: 'World scale',
        min: 0.05,
        max: 4,
        step: 0.01,
        value: normalized.worldSpaceScale,
        mustHave: true,
        tooltip: tip(
            'Sets the world-space scale for the procedural patterns.',
            'Lower = larger features; higher = smaller features.',
            'Too much: very high values look like grain/noise.'
        ),
        onChange: (next) => {
            cfg.worldSpaceScale = clamp(next, 0.05, 4.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && !isObjectSpace()
    });

    basics.range({
        key: `${scope}:matvar:aoAmount`,
        label: 'AO amount',
        min: 0,
        max: 1,
        step: 0.01,
        value: normalized.aoAmount,
        tooltip: tip(
            'Ambient occlusion influence inside the variation system.',
            'Typical: 0.30–0.70 depending on how strong you want crevices.',
            'Too much: everything looks dirty and crushed.'
        ),
        onChange: (next) => {
            cfg.aoAmount = clamp(next, 0.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    basics.hint('Enable the variation system to add weathering and breakup.');

    spaceSelect = advanced.select({
        key: `${scope}:matvar:space`,
        label: 'Space',
        options: [
            { value: 'world', label: 'World space (sticks to scene)' },
            { value: 'object', label: 'Object space (sticks to mesh)' }
        ],
        value: normalized.space === 'object' ? 'object' : 'world',
        tooltip: tip(
            'Chooses the coordinate space for the procedural patterns.',
            'World: stable across objects; Object: sticks to the mesh (good for moving parts).',
            'Too much: Object space can reveal stretching on low-UV assets.'
        ),
        onChange: () => {
            cfg.space = spaceSelect.select.value === 'object' ? 'object' : 'world';
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    advanced.range({
        key: `${scope}:matvar:objectSpaceScale`,
        label: 'Object scale',
        min: 0.05,
        max: 4,
        step: 0.01,
        value: normalized.objectSpaceScale,
        tooltip: tip(
            'Scale used when Space is set to Object.',
            'Lower = larger features; higher = smaller features.',
            'Too much: very high values look like grain/noise.'
        ),
        onChange: (next) => {
            cfg.objectSpaceScale = clamp(next, 0.05, 4.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isObjectSpace()
    });

    const normalMapGroup = createDetailsSection('Normal map', {
        open: false,
        nested,
        key: `${scopeKey}:layer:${layerId}:${scope}:matvar:normalMap`,
        detailsOpenByKey: detailsMap
    });
    applyTooltip(
        normalMapGroup.label,
        tip(
            'Per-layer normal map channel fixes.',
            'Typical: flip Y (green) if the normal map is authored for a different convention (DirectX vs OpenGL).',
            'Use with care: flipping X/Z can make lighting look inside-out.'
        )
    );

    const normal = createFormBuilder({ parent: normalMapGroup.body, registry, registerMiniController });
    const nm = normalized.normalMap && typeof normalized.normalMap === 'object' ? normalized.normalMap : {};
    const ensureNormalMap = () => (ensureObject(cfg, 'normalMap') ?? {});

    normal.toggle({
        key: `${scope}:matvar:normalMap:flipX`,
        label: 'Flip normal X (red)',
        checked: !!nm.flipX,
        tooltip: tip(
            'Flips the red channel of the normal map.',
            'Use if lighting looks mirrored left/right.',
            'Not commonly needed for standard OpenGL normal maps.'
        ),
        onChange: (checked) => {
            ensureNormalMap().flipX = !!checked;
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    normal.toggle({
        key: `${scope}:matvar:normalMap:flipY`,
        label: 'Flip normal Y (green)',
        checked: !!nm.flipY,
        tooltip: tip(
            'Flips the green channel of the normal map.',
            'Typical: enable when using DirectX-authored normal maps.',
            'If shading becomes worse, turn it back off.'
        ),
        onChange: (checked) => {
            ensureNormalMap().flipY = !!checked;
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    normal.toggle({
        key: `${scope}:matvar:normalMap:flipZ`,
        label: 'Flip normal Z (blue)',
        checked: !!nm.flipZ,
        tooltip: tip(
            'Flips the blue channel of the normal map.',
            'Rarely needed.',
            'If enabled, lighting can look inverted.'
        ),
        onChange: (checked) => {
            ensureNormalMap().flipZ = !!checked;
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });

    advancedGroup.body.appendChild(normalMapGroup.details);

    antiController = createMaterialVariationAntiTilingMiniController({
        allow,
        detailsOpenByKey: detailsMap,
        detailsKey: `${scopeKey}:layer:${layerId}:${scope}:matvar:anti`,
        nested,
        parentEnabled: isMatVarEnabled(),
        normalizedAntiTiling: normalized.antiTiling,
        targetMaterialVariation: cfg,
        labels: isRoof ? { offsetU: 'U shift', offsetV: 'V shift' } : { offsetU: 'Horizontal shift', offsetV: 'Vertical shift' },
        offsetOrder: isRoof ? ['offsetU', 'offsetV'] : null,
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
    antiController.mount(matVarGroup.body, { before: macroGroup.details });
    registerMiniController(antiController);

    const macro0 = normalized.macroLayers?.[0] ?? null;
    const macro0Group = createDetailsSection('Macro layer 1', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:macro0`, detailsOpenByKey: detailsMap });
    applyTooltip(
        macro0Group.label,
        tip(
            'Macro layer 1 (Macro A): primary large-scale breakup.',
            'Start with Intensity + Scale for subtle variation.',
            'Too much: big cloudy blobs that overpower the base material.'
        )
    );
    const macro0Form = createFormBuilder({ parent: macro0Group.body, registry, registerMiniController });
    macro0Toggle = macro0Form.toggle({
        key: `${scope}:matvar:macro0:enabled`,
        label: 'Enable macro layer 1',
        checked: !!macro0?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables Macro A (large-scale breakup).',
            isRoof
                ? 'Typical: enabled for roofs/surfaces to reduce repetition.'
                : 'Typical: enabled for walls to reduce repetition.',
            'Too much: combined with high intensity can look blotchy.'
        ),
        onChange: (checked) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:intensity`,
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.01,
        value: macro0?.intensity ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of Macro A.',
            'Typical: 0.2–1.0 (depending on the material).',
            'Too much: obvious blotches and loss of texture identity.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.intensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: macro0?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Frequency of Macro A (higher = smaller features).',
            'Typical: 0.1–5 depending on your tile size.',
            'Too much: looks like noisy speckling instead of macro breakup.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:hueDegrees`,
        label: 'Hue shift (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: macro0?.hueDegrees ?? 0.0,
        formatNumber: formatHueNumber,
        tooltip: tip(
            'Hue shift for Macro A.',
            'Typical: ±5–20° for subtle hue drift.',
            'Too much: unnatural rainbow color variation.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.hueDegrees = clamp(next, -180.0, 180.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro0?.value ?? 0.0,
        tooltip: tip(
            'Brightness/value shift for Macro A.',
            'Typical: small positive/negative values.',
            'Too much: strong patchiness and contrast.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro0?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift for Macro A.',
            'Typical: subtle.',
            'Too much: cartoonish saturation swings or desaturated blotches.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro0?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift for Macro A.',
            'Typical: subtle (helps break uniform specular).',
            'Too much: sparkly highlights or overly matte patches.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macro0Form.range({
        key: `${scope}:matvar:macro0:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro0?.normal ?? 0.0,
        tooltip: tip(
            'Normal shift for Macro A.',
            'Typical: small (mostly leave at 0).',
            'Too much: warping/bumpy shading artifacts.'
        ),
        onChange: (next) => {
            const layer0 = ensureIndex(ensureArray(cfg, 'macroLayers'), 0);
            if (layer0) layer0.normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro0Enabled()
    });
    macroGroup.body.appendChild(macro0Group.details);

    const macro1 = normalized.macroLayers?.[1] ?? null;
    const macro1Group = createDetailsSection('Macro layer 2', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:macro1`, detailsOpenByKey: detailsMap });
    applyTooltip(
        macro1Group.label,
        tip(
            'Macro layer 2 (Macro B): secondary breakup at a different scale.',
            'Use after Macro A for richer, less repetitive results.',
            'Too much: busy, noisy surfaces.'
        )
    );
    const macro1Form = createFormBuilder({ parent: macro1Group.body, registry, registerMiniController });
    macro1Toggle = macro1Form.toggle({
        key: `${scope}:matvar:macro1:enabled`,
        label: 'Enable macro layer 2',
        checked: !!macro1?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables Macro B (secondary breakup).',
            isRoof ? 'Typical: enabled for richer variation after Macro A.' : 'Typical: enable if Macro A is not enough.',
            isRoof ? 'Too much: can make surfaces feel noisy.' : 'Too much: stacked breakup becomes noisy.'
        ),
        onChange: (checked) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:intensity`,
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.01,
        value: macro1?.intensity ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of Macro B.',
            'Typical: 0.1–0.8.',
            'Too much: obvious noisy patterning.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.intensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: macro1?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Frequency of Macro B (higher = smaller features).',
            'Typical: 1–10 depending on your base tile size.',
            'Too much: becomes micro-noise.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:hueDegrees`,
        label: 'Hue shift (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: macro1?.hueDegrees ?? 0.0,
        formatNumber: formatHueNumber,
        tooltip: tip(
            'Hue shift for Macro B.',
            'Typical: subtle.',
            'Too much: obvious colored patches.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.hueDegrees = clamp(next, -180.0, 180.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro1?.value ?? 0.0,
        tooltip: tip(
            'Value/brightness shift for Macro B.',
            'Typical: small.',
            'Too much: harsh patchiness.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro1?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift for Macro B.',
            'Typical: subtle.',
            'Too much: obvious saturation swings.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro1?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift for Macro B.',
            'Typical: subtle.',
            'Too much: noisy specular response.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macro1Form.range({
        key: `${scope}:matvar:macro1:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro1?.normal ?? 0.0,
        tooltip: tip(
            'Normal shift for Macro B.',
            'Typical: 0.',
            'Too much: bumpy/shimmering artifacts.'
        ),
        onChange: (next) => {
            const layer1 = ensureIndex(ensureArray(cfg, 'macroLayers'), 1);
            if (layer1) layer1.normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro1Enabled()
    });
    macroGroup.body.appendChild(macro1Group.details);

    const macro2 = normalized.macroLayers?.[2] ?? null;
    const macro2Group = createDetailsSection('Macro layer 3', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:macro2`, detailsOpenByKey: detailsMap });
    applyTooltip(
        macro2Group.label,
        tip(
            'Macro layer 3 (Patches): mid-scale patchy variation.',
            'Good for repairs/batches and less uniform surfaces.',
            'Too much: camouflage-like patchiness.'
        )
    );
    const macro2Form = createFormBuilder({ parent: macro2Group.body, registry, registerMiniController });
    macro2Toggle = macro2Form.toggle({
        key: `${scope}:matvar:macro2:enabled`,
        label: 'Enable macro layer 3',
        checked: !!macro2?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables the patchy mid-variation layer.',
            'Typical: enable with low intensity.',
            'Too much: patch patterns dominate the material.'
        ),
        onChange: (checked) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:intensity`,
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.01,
        value: macro2?.intensity ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of patch variation.',
            'Typical: 0.1–0.6.',
            'Too much: obvious patch camouflage.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.intensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: macro2?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Frequency of patch shapes (higher = smaller patches).',
            'Typical: 0.5–4.0.',
            'Too much: tiny noisy patches.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:coverage`,
        label: 'Coverage',
        min: 0,
        max: 1,
        step: 0.01,
        value: macro2?.coverage ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'How much of the surface becomes “patches”. Higher = fewer patches.',
            'Typical: 0.55–0.80.',
            'Too much: 0 means everywhere; 1 means almost none.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.coverage = clamp(next, 0.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:hueDegrees`,
        label: 'Hue shift (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: macro2?.hueDegrees ?? 0.0,
        formatNumber: formatHueNumber,
        tooltip: tip(
            'Hue shift for patch variation.',
            'Typical: subtle (often 0).',
            'Too much: colorful patch camouflage.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.hueDegrees = clamp(next, -180.0, 180.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro2?.value ?? 0.0,
        tooltip: tip(
            'Value/brightness shift for patches.',
            'Typical: small.',
            'Too much: harsh patch contrast.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro2?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift for patches.',
            'Typical: subtle.',
            'Too much: obvious colored patch areas.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro2?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift for patches.',
            'Typical: subtle.',
            'Too much: noisy specular variation.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    macro2Form.range({
        key: `${scope}:matvar:macro2:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: macro2?.normal ?? 0.0,
        tooltip: tip(
            'Normal shift for patches.',
            'Typical: 0.',
            'Too much: bumpy patch artifacts.'
        ),
        onChange: (next) => {
            const layer2 = ensureIndex(ensureArray(cfg, 'macroLayers'), 2);
            if (layer2) layer2.normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMacro2Enabled()
    });
    midGroup.body.appendChild(macro2Group.details);

    const micro0 = normalized.macroLayers?.[3] ?? null;
    const micro0Group = createDetailsSection('Micro roughness', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:micro0`, detailsOpenByKey: detailsMap });
    applyTooltip(
        micro0Group.label,
        tip(
            'Micro breakup for surface response (mostly roughness, optionally normals).',
            'Use to avoid large flat glossy/matte areas.',
            'Too much: sparkly specular noise.'
        )
    );
    const micro0Form = createFormBuilder({ parent: micro0Group.body, registry, registerMiniController });
    microToggle = micro0Form.toggle({
        key: `${scope}:matvar:micro0:enabled`,
        label: 'Enable micro variation',
        checked: !!micro0?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables micro-scale variation (roughness-first).',
            'Typical: enable with low Intensity.',
            'Too much: noisy shimmer on highlights.'
        ),
        onChange: (checked) => {
            const layer3 = ensureIndex(ensureArray(cfg, 'macroLayers'), 3);
            if (layer3) layer3.enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    micro0Form.range({
        key: `${scope}:matvar:micro0:intensity`,
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.01,
        value: micro0?.intensity ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of the micro mask.',
            'Typical: 0.1–0.8.',
            'Too much: micro-noise dominates.'
        ),
        onChange: (next) => {
            const layer3 = ensureIndex(ensureArray(cfg, 'macroLayers'), 3);
            if (layer3) layer3.intensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMicroEnabled()
    });
    micro0Form.range({
        key: `${scope}:matvar:micro0:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: micro0?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Frequency of micro breakup (higher = smaller micro detail).',
            'Typical: 6–20.',
            'Too much: glittery surface noise.'
        ),
        onChange: (next) => {
            const layer3 = ensureIndex(ensureArray(cfg, 'macroLayers'), 3);
            if (layer3) layer3.scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMicroEnabled()
    });
    micro0Form.range({
        key: `${scope}:matvar:micro0:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: micro0?.roughness ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Roughness shift driven by the micro mask.',
            'Typical: small positive values for subtle breakup.',
            'Too much: unstable specular response.'
        ),
        onChange: (next) => {
            const layer3 = ensureIndex(ensureArray(cfg, 'macroLayers'), 3);
            if (layer3) layer3.roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMicroEnabled()
    });
    micro0Form.range({
        key: `${scope}:matvar:micro0:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: micro0?.normal ?? 0.0,
        tooltip: tip(
            'Optional micro normal boost/attenuation.',
            'Typical: 0.',
            'Too much: bumpy/shimmering shading artifacts.'
        ),
        onChange: (next) => {
            const layer3 = ensureIndex(ensureArray(cfg, 'macroLayers'), 3);
            if (layer3) layer3.normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isMicroEnabled()
    });
    microGroup.body.appendChild(micro0Group.details);

    const cracksLayer = normalized.cracksLayer ?? null;
    const cracksGroup = createDetailsSection('Cracks', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:cracks`, detailsOpenByKey: detailsMap });
    applyTooltip(
        cracksGroup.label,
        tip(
            'Procedural cracks and fine damage.',
            'Use sparingly to avoid a “ruined” look.',
            'Too much: the surface reads as broken everywhere.'
        )
    );
    const cracksForm = createFormBuilder({ parent: cracksGroup.body, registry, registerMiniController });
    cracksToggle = cracksForm.toggle({
        key: `${scope}:matvar:cracks:enabled`,
        label: 'Enable cracks',
        checked: !!cracksLayer?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables procedural cracks.',
            'Typical: enable with very low Strength.',
            'Too much: cracks dominate the material.'
        ),
        onChange: (checked) => {
            ensureObject(cfg, 'cracksLayer').enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:intensity`,
        label: 'Strength',
        min: 0,
        max: 2,
        step: 0.01,
        value: cracksLayer?.intensity ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength/visibility of cracks.',
            'Typical: 0.02–0.20.',
            'Too much: strong crack networks everywhere.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').intensity = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: cracksLayer?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Frequency of crack patterns (higher = smaller cracks).',
            'Typical: 1–6.',
            'Too much: tiny noisy crack texture.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:hueDegrees`,
        label: 'Hue shift (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: cracksLayer?.hueDegrees ?? 0.0,
        formatNumber: formatHueNumber,
        tooltip: tip(
            'Hue shift inside cracks.',
            'Typical: 0.',
            'Too much: colored cracks look like paint.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').hueDegrees = clamp(next, -180.0, 180.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: cracksLayer?.value ?? 0.0,
        tooltip: tip(
            'Value/brightness shift inside cracks.',
            'Typical: slightly darker.',
            'Too much: looks like drawn lines.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: cracksLayer?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift inside cracks.',
            'Typical: small negative saturation.',
            'Too much: colored crack lines.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: cracksLayer?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift inside cracks.',
            'Typical: small changes.',
            'Too much: noisy specular along crack lines.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    cracksForm.range({
        key: `${scope}:matvar:cracks:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: cracksLayer?.normal ?? 0.0,
        tooltip: tip(
            'Normal shift inside cracks.',
            'Typical: 0.',
            'Too much: bumpy crack artifacts.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'cracksLayer').normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isCracksEnabled()
    });
    microGroup.body.appendChild(cracksGroup.details);

    const streaks = normalized.streaks ?? null;
    const streaksGroup = createDetailsSection('Streaks', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:streaks`, detailsOpenByKey: detailsMap });
    applyTooltip(
        streaksGroup.label,
        tip(
            'Runoff streaks and drip marks (gravity-aligned).',
            'Good for subtle staining and variation directionality.',
            isRoof ? 'Too much: surfaces look uniformly dirty and overdone.' : 'Too much: walls look uniformly dirty and overdone.'
        )
    );
    const streaksForm = createFormBuilder({ parent: streaksGroup.body, registry, registerMiniController });
    streaksToggle = streaksForm.toggle({
        key: `${scope}:matvar:streaks:enabled`,
        label: 'Enable streaks',
        checked: !!streaks?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables gravity-aligned streaking/runoff.',
            'Typical: enable with low Strength for realism.',
            'Too much: obvious drips on every surface.'
        ),
        onChange: (checked) => {
            ensureObject(cfg, 'streaks').enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:strength`,
        label: 'Strength',
        min: 0,
        max: 2,
        step: 0.01,
        value: streaks?.strength ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of streaking/runoff.',
            'Typical: 0.05–0.30 for subtle staining.',
            'Too much: heavy grime everywhere.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').strength = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:scale`,
        label: 'Scale',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: streaks?.scale ?? 1.0,
        mustHave: true,
        tooltip: tip(
            'Size of streak features (higher = smaller streak detail).',
            'Typical: 0.3–2.0 depending on wall size.',
            'Too much: tiny scale reads as noisy speckles.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').scale = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:ledgeStrength`,
        label: 'Ledge strength',
        min: 0,
        max: 2,
        step: 0.01,
        value: streaks?.ledgeStrength ?? 0.0,
        tooltip: tip(
            'Extra streaking under ledges/edges.',
            'Typical: small values (often 0).',
            'Too much: zebra stripes under every edge.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').ledgeStrength = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:ledgeScale`,
        label: 'Ledge scale',
        min: 0,
        max: 20,
        step: 0.1,
        value: streaks?.ledgeScale ?? 0.0,
        formatNumber: (v) => formatFloat(v, 1),
        tooltip: tip(
            'Frequency of ledge streak detail.',
            'Typical: leave default unless you use ledge strength.',
            'Too much: repetitive banding under edges.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').ledgeScale = clamp(next, 0.0, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:hueDegrees`,
        label: 'Hue shift (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: streaks?.hueDegrees ?? 0.0,
        formatNumber: formatHueNumber,
        tooltip: tip(
            'Hue shift applied inside streaks.',
            'Typical: subtle warm/cool shift.',
            'Too much: colored paint-like drips.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').hueDegrees = clamp(next, -180.0, 180.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: streaks?.value ?? 0.0,
        tooltip: tip(
            'Brightness shift inside streaks.',
            'Typical: slightly darker for grime or slightly brighter for chalky deposits.',
            'Too much: harsh painted streaks.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: streaks?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift inside streaks.',
            'Typical: small negative saturation for grime.',
            'Too much: colored streaks that look like paint.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: streaks?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift inside streaks.',
            'Typical: slightly rougher for dried deposits.',
            'Too much: inconsistent specular that reads as noise.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    streaksForm.range({
        key: `${scope}:matvar:streaks:normal`,
        label: 'Normal',
        min: -1,
        max: 1,
        step: 0.01,
        value: streaks?.normal ?? 0.0,
        tooltip: tip(
            'Normal shift inside streaks.',
            'Typical: 0 (leave off unless you need stronger texture response).',
            'Too much: bumpy streak artifacts.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'streaks').normal = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStreaksEnabled()
    });
    weatherGroup.body.appendChild(streaksGroup.details);

    const exposure = normalized.exposure ?? null;
    const exposureGroup = createDetailsSection('Orientation exposure', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:exposure`, detailsOpenByKey: detailsMap });
    applyTooltip(
        exposureGroup.label,
        tip(
            'Directional exposure based on surface orientation (sun bleaching / windward rain).',
            'Use subtle Strength and tune Exponent to control falloff.',
            'Too much: one side of the building looks unnaturally different.'
        )
    );
    const exposureForm = createFormBuilder({ parent: exposureGroup.body, registry, registerMiniController });
    exposureToggle = exposureForm.toggle({
        key: `${scope}:matvar:exposure:enabled`,
        label: 'Enable exposure',
        checked: !!exposure?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables orientation-based exposure.',
            'Typical: on for sun bleaching or windward staining.',
            'Too much: a harsh split between directions.'
        ),
        onChange: (checked) => {
            ensureObject(cfg, 'exposure').enabled = !!checked;
            setExposureDirectionFromUi();
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    exposureForm.range({
        key: `${scope}:matvar:exposure:strength`,
        label: 'Strength',
        min: 0,
        max: 2,
        step: 0.01,
        value: exposure?.strength ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of the exposure mask.',
            'Typical: 0.05–0.30.',
            'Too much: strong directional discoloration.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'exposure').strength = clamp(next, 0.0, 2.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });
    exposureForm.range({
        key: `${scope}:matvar:exposure:exponent`,
        label: 'Exponent',
        min: 0.1,
        max: 8,
        step: 0.01,
        value: exposure?.exponent ?? 1.6,
        tooltip: tip(
            'Sharpness of the direction falloff (higher = tighter).',
            'Typical: 1.2–2.5.',
            'Too much: abrupt “cutoff” bands.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'exposure').exponent = clamp(next, 0.1, 8.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });

    const exposureAngles = directionToAzimuthElevationDegrees(exposure?.direction);
    const clampExposureDegrees = (value, min, max) => (isRoof ? clamp(value, min, max) : clampInt(value, min, max));
    const setExposureDirectionFromUi = () => {
        const azRow = exposureAzimuthRow?.range ?? null;
        const elRow = exposureElevationRow?.range ?? null;
        if (!azRow || !elRow) return;
        const az = clampExposureDegrees(azRow.value, 0, 360);
        const el = clampExposureDegrees(elRow.value, 0, 90);
        ensureObject(cfg, 'exposure').direction = azimuthElevationDegreesToDirection(az, el);
    };

    const exposureAzimuthRow = exposureForm.range({
        key: `${scope}:matvar:exposure:azimuth`,
        label: 'Azimuth (deg)',
        min: 0,
        max: 360,
        step: 1,
        value: Math.round(exposureAngles.azimuthDegrees),
        clamp: (v) => clampExposureDegrees(v, 0, 360),
        tooltip: tip(
            'Direction azimuth in world space.',
            'Typical: aim toward the “sun” or prevailing weather.',
            'Too much: direction mismatched to scene lighting.'
        ),
        onChange: () => {
            setExposureDirectionFromUi();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });

    const exposureElevationRow = exposureForm.range({
        key: `${scope}:matvar:exposure:elevation`,
        label: 'Elevation (deg)',
        min: 0,
        max: 90,
        step: 1,
        value: Math.round(exposureAngles.elevationDegrees),
        clamp: (v) => clampExposureDegrees(v, 0, 90),
        tooltip: tip(
            'Direction elevation in world space (0 = horizon, 90 = straight up).',
            'Typical: 25–70 for sun bleaching.',
            'Too much: extreme values can feel arbitrary.'
        ),
        onChange: () => {
            setExposureDirectionFromUi();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });

    exposureForm.range({
        key: `${scope}:matvar:exposure:value`,
        label: 'Value',
        min: -1,
        max: 1,
        step: 0.01,
        value: exposure?.value ?? 0.0,
        tooltip: tip(
            'Brightness shift in exposed areas.',
            'Typical: small positive for bleaching.',
            'Too much: chalky, washed-out faces.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'exposure').value = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });
    exposureForm.range({
        key: `${scope}:matvar:exposure:saturation`,
        label: 'Saturation',
        min: -1,
        max: 1,
        step: 0.01,
        value: exposure?.saturation ?? 0.0,
        tooltip: tip(
            'Saturation shift in exposed areas.',
            'Typical: slight desaturation for bleaching.',
            'Too much: color pops or dulls unnaturally.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'exposure').saturation = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });
    exposureForm.range({
        key: `${scope}:matvar:exposure:roughness`,
        label: 'Roughness',
        min: -1,
        max: 1,
        step: 0.01,
        value: exposure?.roughness ?? 0.0,
        tooltip: tip(
            'Roughness shift in exposed areas.',
            'Typical: slightly smoother or rougher depending on material.',
            'Too much: sparkly or overly flat highlights.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'exposure').roughness = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isExposureEnabled()
    });
    weatherGroup.body.appendChild(exposureGroup.details);

    const appendWearGroup = ({
        keySuffix,
        title,
        tooltipLabel,
        toggleLabel,
        toggleTooltip,
        data,
        widthMax = 4,
        widthDefault = 1.0,
        strengthTooltip = '',
        widthTooltip = '',
        scaleTooltip = '',
        hueTooltip = '',
        valueTooltip = '',
        saturationTooltip = '',
        roughnessTooltip = '',
        normalTooltip = ''
    }) => {
        const group = createDetailsSection(title, { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:${keySuffix}`, detailsOpenByKey: detailsMap });
        applyTooltip(group.label, tooltipLabel);
        const form = createFormBuilder({ parent: group.body, registry, registerMiniController });
        const toggle = form.toggle({
            key: `${scope}:matvar:${keySuffix}:enabled`,
            label: toggleLabel,
            checked: !!data?.enabled,
            mustHave: true,
            tooltip: toggleTooltip,
            onChange: (checked) => {
                ensureObject(cfg, keySuffix).enabled = !!checked;
                syncEnabled();
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled()
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:intensity`,
            label: 'Strength',
            min: 0,
            max: 2,
            step: 0.01,
            value: data?.intensity ?? 0.0,
            mustHave: true,
            tooltip: strengthTooltip || tip(`Strength of ${title.toLowerCase()}.`, 'Typical: 0.05–0.30.', 'Too much: harsh, obvious wear bands.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).intensity = clamp(next, 0.0, 2.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:width`,
            label: 'Width',
            min: 0,
            max: widthMax,
            step: 0.01,
            value: data?.width ?? widthDefault,
            mustHave: true,
            tooltip: widthTooltip || tip(`Width of the ${title.toLowerCase()} band.`, 'Typical: 0.2–1.0 depending on building scale.', 'Too much: looks like painted stripes.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).width = clamp(next, 0.0, widthMax);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:scale`,
            label: 'Scale',
            min: 0.01,
            max: 20,
            step: 0.01,
            value: data?.scale ?? 1.0,
            tooltip: scaleTooltip || tip(`Noise scale used to break up ${title.toLowerCase()}.`, 'Typical: 0.5–2.0.', 'Too much: noisy, peppery wear.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).scale = clamp(next, 0.01, 20.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:hueDegrees`,
            label: 'Hue shift (deg)',
            min: -180,
            max: 180,
            step: 1,
            value: data?.hueDegrees ?? 0.0,
            formatNumber: formatHueNumber,
            tooltip: hueTooltip || tip(`Hue shift applied to ${title.toLowerCase()}.`, 'Typical: small (often 0).', 'Too much: colorful wear bands.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).hueDegrees = clamp(next, -180.0, 180.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:value`,
            label: 'Value',
            min: -1,
            max: 1,
            step: 0.01,
            value: data?.value ?? 0.0,
            tooltip: valueTooltip || tip(`Value/brightness shift applied to ${title.toLowerCase()}.`, 'Typical: subtle brightening/darkening.', 'Too much: chalky or overly dark bands.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).value = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:saturation`,
            label: 'Saturation',
            min: -1,
            max: 1,
            step: 0.01,
            value: data?.saturation ?? 0.0,
            tooltip: saturationTooltip || tip(`Saturation shift applied to ${title.toLowerCase()}.`, 'Typical: small negative saturation for dusty wear.', 'Too much: colored/painterly wear bands.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).saturation = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:roughness`,
            label: 'Roughness',
            min: -1,
            max: 1,
            step: 0.01,
            value: data?.roughness ?? 0.0,
            tooltip: roughnessTooltip || tip(`Roughness shift applied to ${title.toLowerCase()}.`, 'Typical: slightly rougher for dusty deposits.', 'Too much: noisy specular response.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).roughness = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:normal`,
            label: 'Normal',
            min: -1,
            max: 1,
            step: 0.01,
            value: data?.normal ?? 0.0,
            tooltip: normalTooltip || tip(`Normal shift applied to ${title.toLowerCase()}.`, 'Typical: 0.', 'Too much: bumpy artifacts in wear bands.'),
            onChange: (next) => {
                ensureObject(cfg, keySuffix).normal = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });

        return { group, toggle };
    };

    const wearSide = normalized.wearSide ?? null;
    const wearSideUi = appendWearGroup({
        keySuffix: 'wearSide',
        title: 'Side wear (vertical edges)',
        tooltipLabel: tip(
            'Edge/side wear along vertical corners and edges.',
            'Good for subtle exposure and chipped-edge feel.',
            'Too much: outlines every edge like a cartoon.'
        ),
        toggleLabel: 'Enable side wear',
        toggleTooltip: tip(
            'Enables vertical edge wear.',
            'Typical: enable with low Strength.',
            'Too much: edges become uniformly highlighted.'
        ),
        strengthTooltip: tip(
            'Strength of edge wear.',
            'Typical: 0.05–0.30.',
            'Too much: bright/dirty outlines on every corner.'
        ),
        widthTooltip: tip(
            'Width of the edge wear band.',
            'Typical: 0.2–1.0 depending on building scale.',
            'Too much: looks like painted stripes on corners.'
        ),
        scaleTooltip: tip(
            'Noise scale used to break up the edge band.',
            'Typical: 0.5–2.0.',
            'Too much: noisy, peppery edges.'
        ),
        hueTooltip: tip(
            'Hue shift applied to edge wear.',
            'Typical: small (often 0).',
            'Too much: colorful outlines on edges.'
        ),
        valueTooltip: tip(
            'Value/brightness shift applied to edge wear.',
            'Typical: subtle brightening/darkening.',
            'Too much: chalky edges or overly dark outlines.'
        ),
        saturationTooltip: tip(
            'Saturation shift applied to edge wear.',
            'Typical: small negative saturation for dusty edges.',
            'Too much: colored/painterly edges.'
        ),
        roughnessTooltip: tip(
            'Roughness shift applied to edge wear.',
            'Typical: slightly rougher for exposed edges.',
            'Too much: noisy specular along edges.'
        ),
        normalTooltip: tip(
            'Normal shift applied to edge wear.',
            'Typical: 0.',
            'Too much: bumpy edge artifacts.'
        ),
        widthMax: 4,
        widthDefault: 1.0,
        data: wearSide
    });
    wearSideToggle = wearSideUi.toggle;
    weatherGroup.body.appendChild(wearSideUi.group.details);

    const wearBottom = normalized.wearBottom ?? null;
    const wearBottomUi = appendWearGroup({
        keySuffix: 'wearBottom',
        title: 'Bottom wear',
        tooltipLabel: tip(
            isRoof ? 'Ground grime band near the bottom of the surface.' : 'Ground grime band near the bottom of the wall.',
            'Great for subtle splashback and dirt accumulation.',
            isRoof ? 'Too much: the whole surface looks uniformly dirty.' : 'Too much: the whole wall looks uniformly dirty.'
        ),
        toggleLabel: 'Enable bottom wear',
        toggleTooltip: tip(
            'Enables bottom wear/grime.',
            'Typical: enable with low Strength + narrow Width.',
            isRoof ? 'Too much: a thick dirty band that dominates the surface.' : 'Too much: a thick dirty band that dominates the facade.'
        ),
        strengthTooltip: tip(
            'Strength of bottom grime.',
            'Typical: 0.05–0.30.',
            'Too much: looks like a painted dark band.'
        ),
        widthTooltip: tip(
            'Height of the bottom grime band (0–1 relative).',
            'Typical: 0.10–0.40.',
            'Too much: grime climbs too high and looks unrealistic.'
        ),
        scaleTooltip: tip(
            'Noise scale for breaking up the grime band.',
            'Typical: 0.5–2.0.',
            'Too much: noisy, speckled dirt.'
        ),
        hueTooltip: tip(
            'Hue shift applied to bottom grime.',
            'Typical: subtle (often 0).',
            'Too much: colored dirt band.'
        ),
        valueTooltip: tip(
            'Value/brightness shift applied to bottom grime.',
            'Typical: slightly darker for dirt.',
            'Too much: heavy black band.'
        ),
        saturationTooltip: tip(
            'Saturation shift applied to bottom grime.',
            'Typical: small negative saturation for dirt.',
            'Too much: unnatural colored dirt.'
        ),
        roughnessTooltip: tip(
            'Roughness shift applied to bottom grime.',
            'Typical: slightly rougher.',
            'Too much: noisy or chalky specular response.'
        ),
        normalTooltip: tip(
            'Normal shift applied to bottom grime.',
            'Typical: 0.',
            'Too much: bumpy artifacts in the grime band.'
        ),
        widthMax: 1,
        widthDefault: 0.5,
        data: wearBottom
    });
    wearBottomToggle = wearBottomUi.toggle;
    weatherGroup.body.appendChild(wearBottomUi.group.details);

    const wearTop = normalized.wearTop ?? null;
    const wearTopUi = appendWearGroup({
        keySuffix: 'wearTop',
        title: 'Top wear',
        tooltipLabel: tip(
            isRoof ? 'Top deposits and wear near the top of the surface.' : 'Top deposits and wear near the roofline/top of the wall.',
            'Good for subtle dust/soot accumulation and sun-faded areas.',
            isRoof ? 'Too much: the whole top looks painted.' : 'Too much: the whole wall top looks painted.'
        ),
        toggleLabel: 'Enable top wear',
        toggleTooltip: tip(
            'Enables top wear/deposits.',
            'Typical: enable with low Strength + moderate Width.',
            isRoof ? 'Too much: a thick band that dominates the surface.' : 'Too much: a thick band that dominates the facade.'
        ),
        strengthTooltip: tip(
            'Strength of top wear/deposits.',
            isRoof ? 'Typical: 0.05–0.30.' : 'Typical: 0.05–0.25.',
            'Too much: looks like painted grime on the top.'
        ),
        widthTooltip: tip(
            'Height of the top wear band (0–1 relative).',
            'Typical: 0.10–0.45.',
            isRoof ? 'Too much: top wear covers most of the surface.' : 'Too much: top wear covers most of the wall.'
        ),
        scaleTooltip: tip(
            'Noise scale for breaking up the top band.',
            'Typical: 0.5–2.0.',
            'Too much: noisy speckling.'
        ),
        hueTooltip: tip(
            'Hue shift applied to top wear.',
            'Typical: subtle.',
            'Too much: colored/painterly top band.'
        ),
        valueTooltip: tip(
            'Value/brightness shift applied to top wear.',
            'Typical: small brightening for dust or darkening for soot.',
            'Too much: harsh contrast at the top.'
        ),
        saturationTooltip: tip(
            'Saturation shift applied to top wear.',
            'Typical: slightly desaturated for dust/soot.',
            'Too much: colored/painterly top band.'
        ),
        roughnessTooltip: tip(
            'Roughness shift applied to top wear.',
            'Typical: slightly rougher for dusty deposits.',
            'Too much: sparkly/noisy specular response.'
        ),
        normalTooltip: tip(
            'Normal shift applied to top wear.',
            'Typical: 0.',
            'Too much: bumpy artifacts in the top band.'
        ),
        widthMax: 1,
        widthDefault: 0.4,
        data: wearTop
    });
    wearTopToggle = wearTopUi.toggle;
    weatherGroup.body.appendChild(wearTopUi.group.details);

    const stairGroup = createDetailsSection('Stair shift', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:stair`, detailsOpenByKey: detailsMap });
    applyTooltip(
        stairGroup.label,
        tip(
            'Brick-style UV staggering / bond shifting.',
            'Useful for brick/bonded patterns to reduce obvious repetition.',
            'Too much: misaligned mortar/brick pattern.'
        )
    );
    const stairForm = createFormBuilder({ parent: stairGroup.body, registry, registerMiniController });
    stairToggle = stairForm.toggle({
        key: `${scope}:matvar:stairShift:enabled`,
        label: 'Enable stair shift',
        checked: !!normalized.stairShift?.enabled,
        mustHave: true,
        tooltip: tip(
            'Enables per-row/step UV shifting.',
            isRoof ? 'Typical: enable for brick-like surfaces.' : 'Typical: enable for brick-like walls.',
            'Too much: makes the pattern look broken.'
        ),
        onChange: (checked) => {
            ensureObject(cfg, 'stairShift').enabled = !!checked;
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled()
    });
    stairForm.range({
        key: `${scope}:matvar:stairShift:strength`,
        label: 'Strength',
        min: 0,
        max: 1,
        step: 0.01,
        value: normalized.stairShift?.strength ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Strength of the stair shift effect.',
            'Typical: 0.2–1.0 for subtle staggering.',
            'Too much: severe pattern discontinuities.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').strength = clamp(next, 0.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });
    stairForm.range({
        key: `${scope}:matvar:stairShift:stepSize`,
        label: 'Step size (tiles)',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: normalized.stairShift?.stepSize ?? 1.0,
        tooltip: tip(
            'How often the shift increments (in tile units).',
            'Typical: 1 for per-row staggering.',
            'Too much: large values make the shift rare and less useful.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').stepSize = clamp(next, 0.01, 20.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });
    stairForm.range({
        key: `${scope}:matvar:stairShift:shift`,
        label: 'Shift per step',
        min: -1,
        max: 1,
        step: 0.01,
        value: normalized.stairShift?.shift ?? 0.0,
        mustHave: true,
        tooltip: tip(
            'Shift amount applied per step (in UV tile units).',
            'Typical brick bond: small offsets like 0.4 / 0.8 patterns.',
            'Too much: bricks/mortar stop lining up.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').shift = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });

    stairModeSelect = stairForm.select({
        key: `${scope}:matvar:stairShift:mode`,
        label: 'Mode',
        options: [
            { value: 'stair', label: 'Stair (shift += stepIndex)' },
            { value: 'alternate', label: 'Alternate (0 / shift)' },
            { value: 'random', label: 'Random (per step)' },
            { value: 'pattern3', label: 'Bond 3-step (0 / A / B)' }
        ],
        value: normalized.stairShift?.mode || 'stair',
        tooltip: tip(
            'How the shift evolves per step.',
            'Typical: Stair/Alternate for simple bonds, Bond 3-step for 0/A/B patterns, Random for noise.',
            'Too much: Random can look chaotic for brick bonds.'
        ),
        onChange: () => {
            const v = stairModeSelect.select.value;
            ensureObject(cfg, 'stairShift').mode = v === 'random' ? 'random' : (v === 'alternate' ? 'alternate' : (v === 'pattern3' ? 'pattern3' : 'stair'));
            syncEnabled();
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });

    stairForm.range({
        key: `${scope}:matvar:stairShift:patternA`,
        label: 'Pattern A',
        min: -1,
        max: 1,
        step: 0.01,
        value: normalized.stairShift?.patternA ?? 0.4,
        tooltip: tip(
            'Multiplier used for the 2nd step when Mode is Bond 3-step.',
            'Typical: 0.4.',
            'Too much: bricks stop lining up.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').patternA = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled() && isStairPattern3()
    });
    stairForm.range({
        key: `${scope}:matvar:stairShift:patternB`,
        label: 'Pattern B',
        min: -1,
        max: 1,
        step: 0.01,
        value: normalized.stairShift?.patternB ?? 0.8,
        tooltip: tip(
            'Multiplier used for the 3rd step when Mode is Bond 3-step.',
            'Typical: 0.8.',
            'Too much: bricks stop lining up.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').patternB = clamp(next, -1.0, 1.0);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled() && isStairPattern3()
    });
    stairForm.range({
        key: `${scope}:matvar:stairShift:blendWidth`,
        label: 'Blend width',
        min: 0,
        max: 0.49,
        step: 0.01,
        value: normalized.stairShift?.blendWidth ?? 0.0,
        tooltip: tip(
            'Softness of blending between steps.',
            'Typical: 0–0.2.',
            'Too much: blurs the bond pattern.'
        ),
        onChange: (next) => {
            ensureObject(cfg, 'stairShift').blendWidth = clamp(next, 0.0, 0.49);
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });
    stairForm.select({
        key: `${scope}:matvar:stairShift:direction`,
        label: 'Direction',
        options: [
            { value: 'horizontal', label: 'Horizontal (shift U per V step)' },
            { value: 'vertical', label: 'Vertical (shift V per U step)' }
        ],
        value: normalized.stairShift?.direction,
        tooltip: tip(
            'Which axis is shifted per step.',
            'Typical: Horizontal for brick rows.',
            'Too much: wrong direction makes the pattern feel off.'
        ),
        onChange: (value) => {
            ensureObject(cfg, 'stairShift').direction = value === 'vertical' ? 'vertical' : 'horizontal';
            onChange();
        },
        enabledIf: () => !!allow && isMatVarEnabled() && isStairEnabled()
    });
    brickGroup.body.appendChild(stairGroup.details);

    const brickCfg = normalized.brick ?? null;
    const appendBrickVariationGroup = ({
        title,
        keySuffix,
        tooltipLabel,
        toggleLabel,
        toggleTooltip,
        strengthTooltip,
        hueTooltip,
        valueTooltip,
        saturationTooltip,
        roughnessTooltip,
        normalTooltip,
        src
    }) => {
        const group = createDetailsSection(title, { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:${keySuffix}`, detailsOpenByKey: detailsMap });
        applyTooltip(group.label, tooltipLabel);

        const form = createFormBuilder({ parent: group.body, registry, registerMiniController });
        const toggle = form.toggle({
            key: `${scope}:matvar:${keySuffix}:enabled`,
            label: toggleLabel,
            checked: !!src?.enabled,
            mustHave: true,
            tooltip: toggleTooltip,
            onChange: (checked) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.enabled = !!checked;
                syncEnabled();
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled()
        });

        const layoutGroup = createDetailsSection('Layout', { open: false, nested, key: `${scopeKey}:layer:${layerId}:${scope}:matvar:${keySuffix}:layout`, detailsOpenByKey: detailsMap });
        applyTooltip(
            layoutGroup.label,
            tip(
                keySuffix === 'mortar' ? 'Brick grid layout used for mortar variation only.' : 'Brick grid layout used for per-brick variation only.',
                keySuffix === 'mortar' ? 'Lets mortar lines vary without affecting per-brick variation.' : 'Use this to de-sync sections without affecting mortar.',
                'Keep values close to your base texture brick scale.'
            )
        );
        const layoutForm = createFormBuilder({ parent: layoutGroup.body, registry, registerMiniController });
        const getLayout = () => {
            const brick = ensureObject(cfg, 'brick');
            const slot = ensureObject(brick, keySuffix);
            return ensureObject(slot, 'layout');
        };

        layoutForm.range({
            key: `${scope}:matvar:${keySuffix}:layout:bricksPerTileX`,
            label: 'Bricks per tile X',
            min: 0.25,
            max: 200,
            step: 0.25,
            value: src?.layout?.bricksPerTileX ?? 6.0,
            tooltip: tip(
                `Brick count across one UV tile (U/X) for ${keySuffix === 'mortar' ? 'mortar variation' : 'per-brick variation'}.`,
                'Typical: 5–10 depending on texture.',
                'Too much: very high values become noisy.'
            ),
            onChange: (next) => {
                getLayout().bricksPerTileX = clamp(next, 0.25, 200.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        layoutForm.range({
            key: `${scope}:matvar:${keySuffix}:layout:bricksPerTileY`,
            label: 'Bricks per tile Y',
            min: 0.25,
            max: 200,
            step: 0.25,
            value: src?.layout?.bricksPerTileY ?? 3.0,
            tooltip: tip(
                `Brick count across one UV tile (V/Y) for ${keySuffix === 'mortar' ? 'mortar variation' : 'per-brick variation'}.`,
                'Typical: 2–6 depending on texture.',
                'Too much: wrong values misalign the grid.'
            ),
            onChange: (next) => {
                getLayout().bricksPerTileY = clamp(next, 0.25, 200.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        layoutForm.range({
            key: `${scope}:matvar:${keySuffix}:layout:mortarWidth`,
            label: 'Mortar width',
            min: 0,
            max: 0.49,
            step: 0.01,
            value: src?.layout?.mortarWidth ?? 0.08,
            tooltip: tip(
                `Thickness of mortar lines (as a fraction of a brick cell) for ${keySuffix === 'mortar' ? 'mortar variation' : 'per-brick masking'}.`,
                'Typical: 0.04–0.12.',
                keySuffix === 'mortar' ? 'Too much: mortar dominates and bricks disappear.' : 'Too much: bricks get masked away.'
            ),
            onChange: (next) => {
                getLayout().mortarWidth = clamp(next, 0.0, 0.49);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        layoutForm.range({
            key: `${scope}:matvar:${keySuffix}:layout:offsetX`,
            label: 'Layout offset X (cells)',
            min: -10,
            max: 10,
            step: 0.01,
            value: src?.layout?.offsetX ?? 0.0,
            tooltip: tip(
                `Shifts the ${keySuffix === 'mortar' ? 'mortar' : 'per-brick'} cell grid horizontally (in brick cell units).`,
                'Use small values (0–1) to de-sync sections.',
                '0 keeps the original alignment.'
            ),
            onChange: (next) => {
                getLayout().offsetX = clamp(next, -10.0, 10.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        layoutForm.range({
            key: `${scope}:matvar:${keySuffix}:layout:offsetY`,
            label: 'Layout offset Y (cells)',
            min: -10,
            max: 10,
            step: 0.01,
            value: src?.layout?.offsetY ?? 0.0,
            tooltip: tip(
                `Shifts the ${keySuffix === 'mortar' ? 'mortar' : 'per-brick'} cell grid vertically (in brick cell units).`,
                'Use small values (0–1) to de-sync sections.',
                '0 keeps the original alignment.'
            ),
            onChange: (next) => {
                getLayout().offsetY = clamp(next, -10.0, 10.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        group.body.appendChild(layoutGroup.details);

        form.range({
            key: `${scope}:matvar:${keySuffix}:strength`,
            label: 'Strength',
            min: 0,
            max: 2,
            step: 0.01,
            value: src?.intensity ?? 0.0,
            mustHave: true,
            tooltip: strengthTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.strength = clamp(next, 0.0, 2.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:hueDegrees`,
            label: 'Hue shift (deg)',
            min: -180,
            max: 180,
            step: 1,
            value: src?.hueDegrees ?? 0.0,
            formatNumber: formatHueNumber,
            tooltip: hueTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.hueDegrees = clamp(next, -180.0, 180.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:value`,
            label: 'Value',
            min: -1,
            max: 1,
            step: 0.01,
            value: src?.value ?? 0.0,
            tooltip: valueTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.value = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:saturation`,
            label: 'Saturation',
            min: -1,
            max: 1,
            step: 0.01,
            value: src?.saturation ?? 0.0,
            tooltip: saturationTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.saturation = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:roughness`,
            label: 'Roughness',
            min: -1,
            max: 1,
            step: 0.01,
            value: src?.roughness ?? 0.0,
            tooltip: roughnessTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.roughness = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });
        form.range({
            key: `${scope}:matvar:${keySuffix}:normal`,
            label: 'Normal',
            min: -1,
            max: 1,
            step: 0.01,
            value: src?.normal ?? 0.0,
            tooltip: normalTooltip,
            onChange: (next) => {
                const brick = ensureObject(cfg, 'brick');
                const slot = ensureObject(brick, keySuffix);
                slot.normal = clamp(next, -1.0, 1.0);
                onChange();
            },
            enabledIf: () => !!allow && isMatVarEnabled() && !!toggle.input.checked
        });

        return { group, toggle };
    };

    const perBrickSrc = brickCfg?.perBrick ?? null;
    const perBrickUi = appendBrickVariationGroup({
        title: 'Per-brick variation',
        keySuffix: 'perBrick',
        tooltipLabel: tip(
            'Subtle per-brick breakup (hue/value/roughness per brick).',
            'Use low Strength and keep shifts small.',
            'Too much: noisy, speckled brickwork.'
        ),
        toggleLabel: 'Enable per-brick variation',
        toggleTooltip: tip(
            'Enables per-brick variation.',
            'Typical: enabled for brick materials, low strength.',
            'Too much: bricks look randomly colored.'
        ),
        strengthTooltip: tip(
            'Overall strength of per-brick variation.',
            'Typical: 0.05–0.40.',
            'Too much: noisy speckled bricks.'
        ),
        hueTooltip: tip(
            'Hue drift per brick.',
            'Typical: ±5–20°.',
            'Too much: rainbow bricks.'
        ),
        valueTooltip: tip(
            'Brightness variation per brick.',
            'Typical: small.',
            'Too much: patchy, noisy bricks.'
        ),
        saturationTooltip: tip(
            'Saturation variation per brick.',
            'Typical: small.',
            isRoof ? 'Too much: unnaturally colorful bricks.' : 'Too much: colored brick noise.'
        ),
        roughnessTooltip: tip(
            'Roughness variation per brick.',
            'Typical: subtle.',
            isRoof ? 'Too much: sparkly speckling.' : 'Too much: sparkly/noisy highlights.'
        ),
        normalTooltip: tip(
            isRoof ? 'Normal variation per brick.' : 'Optional normal response variation per brick.',
            'Typical: 0.',
            isRoof ? 'Too much: bumpy noisy bricks.' : 'Too much: bumpy noisy shading.'
        ),
        src: perBrickSrc
    });
    perBrickToggle = perBrickUi.toggle;
    brickGroup.body.appendChild(perBrickUi.group.details);

    const mortarSrc = brickCfg?.mortar ?? null;
    const mortarUi = appendBrickVariationGroup({
        title: 'Mortar variation',
        keySuffix: 'mortar',
        tooltipLabel: tip(
            isRoof
                ? 'Separate-ish look for mortar lines (different value/roughness + optional grime).'
                : 'Separate-ish look for mortar lines (value/roughness shifts in mortar).',
            isRoof ? 'Use low Strength and keep it subtle.' : 'Great for dusty mortar and grime-in-grooves.',
            isRoof ? 'Too much: mortar becomes more prominent than the bricks.' : 'Too much: mortar becomes a grid overlay.'
        ),
        toggleLabel: 'Enable mortar variation',
        toggleTooltip: tip(
            'Enables mortar-line variation.',
            isRoof ? 'Typical: slight darkening + roughness increase.' : 'Typical: enabled for brick materials.',
            isRoof ? 'Too much: bright/dirty outlines around every brick.' : 'Too much: mortar reads as dark/bright outlines everywhere.'
        ),
        strengthTooltip: tip(
            'Overall strength of mortar variation.',
            isRoof ? 'Typical: 0.05–0.40.' : 'Typical: 0.05–0.50.',
            isRoof ? 'Too much: thick, noisy mortar lines.' : 'Too much: mortar dominates the look.'
        ),
        hueTooltip: tip(
            isRoof ? 'Hue shift applied to mortar.' : 'Hue shift in mortar lines.',
            isRoof ? 'Typical: small.' : 'Typical: subtle.',
            isRoof ? 'Too much: colorful mortar.' : 'Too much: colored mortar grid.'
        ),
        valueTooltip: tip(
            isRoof ? 'Brightness/value shift applied to mortar.' : 'Brightness shift in mortar lines.',
            isRoof ? 'Typical: slightly darker.' : 'Typical: slightly darker or lighter.',
            isRoof ? 'Too much: high-contrast outlines.' : 'Too much: high-contrast grid.'
        ),
        saturationTooltip: tip(
            isRoof ? 'Saturation shift applied to mortar.' : 'Saturation shift in mortar lines.',
            isRoof ? 'Typical: slightly desaturated.' : 'Typical: slight desaturation.',
            isRoof ? 'Too much: colorful mortar.' : 'Too much: colored outlines.'
        ),
        roughnessTooltip: tip(
            isRoof ? 'Roughness shift applied to mortar.' : 'Roughness shift in mortar lines.',
            isRoof ? 'Typical: slightly rougher than bricks.' : 'Typical: slightly rougher.',
            isRoof ? 'Too much: sparkly outlines.' : 'Too much: noisy highlights in a grid.'
        ),
        normalTooltip: tip(
            isRoof ? 'Normal shift applied to mortar.' : 'Optional normal response shift in mortar lines.',
            'Typical: 0.',
            isRoof ? 'Too much: bumpy mortar artifacts.' : 'Too much: bumpy grid artifacts.'
        ),
        src: mortarSrc
    });
    mortarToggle = mortarUi.toggle;
    brickGroup.body.appendChild(mortarUi.group.details);

    syncEnabled();
    parent?.appendChild?.(matVarGroup.details);
}
