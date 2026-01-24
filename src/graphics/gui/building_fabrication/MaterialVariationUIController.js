// src/graphics/gui/building_fabrication/MaterialVariationUIController.js
// Builds and wires the Material Variation UI used by BuildingFabricationUI.
import { MATERIAL_VARIATION_DEBUG_DEFAULT, normalizeMaterialVariationDebugConfig } from '../../assets3d/materials/MaterialVariationSystem.js';
import { clampInt } from './mini_controllers/RangeNumberUtils.js';
import { appendMaterialVariationLayerUI } from './MaterialVariationLayerUI.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

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

    const debugToggles = [
        { key: 'useMatVarDefine', ctrl: dbgUseMatVar },
        { key: 'uvStairShift', ctrl: dbgStair },
        { key: 'uvAntiOffset', ctrl: dbgAntiOffset },
        { key: 'uvAntiRotation', ctrl: dbgAntiRot },
        { key: 'uvWarp', ctrl: dbgWarp },
        { key: 'contribRoughness', ctrl: dbgRough },
        { key: 'contribColor', ctrl: dbgColor },
        { key: 'useOrm', ctrl: dbgOrm },
        { key: 'contribNormalFactor', ctrl: dbgNormFactor },
        { key: 'basisUsesOriginalUv', ctrl: dbgBasis },
        { key: 'flipNormalY', ctrl: dbgFlipY }
    ];

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

        for (const entry of debugToggles) {
            entry.ctrl.input.checked = !!dbg[entry.key];
            entry.ctrl.input.disabled = !allow;
        }

        debugResetBtn.disabled = !allow;
        debugReadout.textContent = formatDebugReadout(dbg);
    };

    const setDebugFromUi = () => {
        if (!canEdit()) return;
        const next = {};
        for (const entry of debugToggles) next[entry.key] = !!entry.ctrl.input.checked;
        debugConfig = normalizeMaterialVariationDebugConfig(next);
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

        for (const entry of debugToggles) entry.ctrl.input.addEventListener('change', setDebugFromUi);
    };

    const unbind = () => {
        if (!bound) return;
        bound = false;
        seedToggleInput.removeEventListener('change', onSeedOverrideChange);
        seedNumber.removeEventListener('change', onSeedNumberChange);
        debugResetBtn.removeEventListener('click', resetDebugFromUi);

        for (const entry of debugToggles) entry.ctrl.input.removeEventListener('change', setDebugFromUi);
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

    const appendWallMaterialVariationUI = ({ parent, allow, scopeKey, layerId, layer, onChange: onChangeArg, onReRender: onReRenderArg, registerMiniController: registerArg } = {}) => {
        const onChange = typeof onChangeArg === 'function' ? onChangeArg : () => {};
        const onReRender = typeof onReRenderArg === 'function' ? onReRenderArg : () => {};
        const registerMiniController = typeof registerArg === 'function' ? registerArg : () => {};
        appendMaterialVariationLayerUI({
            parent,
            allow,
            scopeKey,
            layerId,
            layer,
            kind: 'walls',
            detailsOpenByKey: detailsMap,
            onChange,
            onReRender,
            registerMiniController
        });
    };

    const appendRoofMaterialVariationUI = ({ parent, allow, scopeKey, layerId, layer, onChange: onChangeArg, onReRender: onReRenderArg, registerMiniController: registerArg } = {}) => {
        const onChange = typeof onChangeArg === 'function' ? onChangeArg : () => {};
        const onReRender = typeof onReRenderArg === 'function' ? onReRenderArg : () => {};
        const registerMiniController = typeof registerArg === 'function' ? registerArg : () => {};
        appendMaterialVariationLayerUI({
            parent,
            allow,
            scopeKey,
            layerId,
            layer,
            kind: 'roof',
            detailsOpenByKey: detailsMap,
            onChange,
            onReRender,
            registerMiniController
        });
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
