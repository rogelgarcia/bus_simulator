// src/graphics/gui/building_fabrication/WallsUIController.js
// Walls UI controller for building fabrication HUD.
import { BUILDING_STYLE } from '../../../app/buildings/BuildingStyle.js';
import { BELT_COURSE_COLOR } from '../../../app/buildings/BeltCourseColor.js';
import { WALL_BASE_MATERIAL_DEFAULT } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import { createMaterialPickerRowController } from './mini_controllers/MaterialPickerRowController.js';
import { createDetailsSection, createHint, createRangeRow } from './mini_controllers/UiMiniControlPrimitives.js';
import { createTextureTilingMiniController } from './mini_controllers/TextureTilingMiniController.js';
import { applyMaterialSymbolToButton } from '../shared/materialSymbols.js';

export function createWallsUIController({
    detailsOpenByKey = null,
    clamp = null,
    formatFloat = null,
    setMaterialThumbToTexture = null,
    setMaterialThumbToColor = null,
    getWallInset = null,
    setWallInset = null,
    onWallInsetChange = null,
    appendWallMaterialVariationUI = null,
    requestReRenderLayersPanel = null,
    registerLayerMiniController = null
} = {}) {
    const detailsMap = detailsOpenByKey instanceof Map ? detailsOpenByKey : null;
    const clampFn = typeof clamp === 'function' ? clamp : (v, min, max) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return min;
        return Math.max(min, Math.min(max, num));
    };
    const formatFloatFn = typeof formatFloat === 'function' ? formatFloat : (v, digits = 1) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return '';
        return num.toFixed(digits);
    };
    const thumbTextureFn = typeof setMaterialThumbToTexture === 'function' ? setMaterialThumbToTexture : () => {};
    const thumbColorFn = typeof setMaterialThumbToColor === 'function' ? setMaterialThumbToColor : () => {};

    const getInset = typeof getWallInset === 'function' ? getWallInset : () => 0.0;
    const setInset = typeof setWallInset === 'function' ? setWallInset : () => {};
    const onInsetChange = typeof onWallInsetChange === 'function' ? onWallInsetChange : null;

    const appendMatVar = typeof appendWallMaterialVariationUI === 'function' ? appendWallMaterialVariationUI : null;
    const reRenderLayers = typeof requestReRenderLayersPanel === 'function' ? requestReRenderLayersPanel : null;
    const registerMini = typeof registerLayerMiniController === 'function' ? registerLayerMiniController : null;

    const wallInsetRow = createRangeRow('Wall inset (m)');
    wallInsetRow.range.min = '0';
    wallInsetRow.range.max = '4';
    wallInsetRow.range.step = '0.05';
    wallInsetRow.number.min = '0';
    wallInsetRow.number.max = '4';
    wallInsetRow.number.step = '0.05';

    let mounted = false;
    let bound = false;

    const setWallInsetFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 4.0);
        const prev = Number(getInset()) || 0.0;
        const changed = Math.abs(next - prev) >= 1e-6;
        setInset(next);
        wallInsetRow.range.value = String(next);
        wallInsetRow.number.value = formatFloatFn(next, 2);
        if (changed) onInsetChange?.(next);
    };

    const onWallInsetRangeInput = () => setWallInsetFromUi(wallInsetRow.range.value);
    const onWallInsetNumberInput = () => setWallInsetFromUi(wallInsetRow.number.value);

    const mountWallInset = (parent, { before = null } = {}) => {
        if (!parent || typeof parent.appendChild !== 'function') return;
        if (mounted) return;
        mounted = true;
        if (before && typeof parent.insertBefore === 'function') {
            parent.insertBefore(wallInsetRow.row, before);
        } else {
            parent.appendChild(wallInsetRow.row);
        }
    };

    const syncGlobal = ({ hasSelected = false, allow = false } = {}) => {
        const enabled = !!allow;
        wallInsetRow.range.disabled = !enabled;
        wallInsetRow.number.disabled = !enabled;

        if (!hasSelected) {
            wallInsetRow.range.value = '0';
            wallInsetRow.number.value = '';
            return;
        }

        const inset = clampFn(getInset(), 0.0, 4.0);
        wallInsetRow.range.value = String(inset);
        wallInsetRow.number.value = formatFloatFn(inset, 2);
    };

    const bind = () => {
        if (bound) return;
        bound = true;
        wallInsetRow.range.addEventListener('input', onWallInsetRangeInput);
        wallInsetRow.number.addEventListener('input', onWallInsetNumberInput);
    };

    const unbind = () => {
        if (!bound) return;
        bound = false;
        wallInsetRow.range.removeEventListener('input', onWallInsetRangeInput);
        wallInsetRow.number.removeEventListener('input', onWallInsetNumberInput);
    };

    const dispose = () => {
        unbind();
        mounted = false;
    };

    const appendLayerWallsUI = ({
        allow = false,
        scopeKey = 'template',
        layerId = null,
        layer = null,
        openMaterialPicker = null,
        openColorPicker = null,
        textureMaterialOptions = [],
        colorMaterialOptions = [],
        getWallTextureOption = null,
        getWallColorOption = null,
        onChange = null
    } = {}) => {
        const canEdit = !!allow;
        const onChangeFn = typeof onChange === 'function' ? onChange : () => {};
        const layerObj = layer && typeof layer === 'object' ? layer : null;
        const id = layerId ?? '';

        const details = document.createElement('details');
        details.className = 'building-fab-details building-fab-layer-subdetails';
        const summary = document.createElement('summary');
        summary.className = 'building-fab-details-summary';
        const label = document.createElement('span');
        label.className = 'building-fab-details-title';
        label.textContent = 'Walls';
        summary.appendChild(label);
        details.appendChild(summary);
        const body = document.createElement('div');
        body.className = 'building-fab-details-body';
        details.appendChild(body);

        const key = `${scopeKey}:layer:${id}:walls`;
        if (detailsMap && typeof key === 'string' && key) {
            details.dataset.detailsKey = key;
            const stored = detailsMap.get(key);
            details.open = typeof stored === 'boolean' ? stored : false;
            detailsMap.set(key, details.open);
            details.addEventListener('toggle', () => {
                detailsMap.set(key, details.open);
            });
        } else {
            details.open = false;
        }

        const getTexOpt = typeof getWallTextureOption === 'function' ? getWallTextureOption : () => null;
        const getColorOpt = typeof getWallColorOption === 'function' ? getWallColorOption : () => null;
        const picker = createMaterialPickerRowController({ label: 'Wall material' });
        const openColorPickerFn = typeof openColorPicker === 'function' ? openColorPicker : null;

        const fallbackStyleId = typeof layerObj?.style === 'string' ? layerObj.style : BUILDING_STYLE.DEFAULT;
        const wallMaterial = layerObj?.material ?? { kind: 'texture', id: fallbackStyleId };

        const syncWallMaterialPicker = (materialSpec) => {
            const spec = materialSpec && typeof materialSpec === 'object' ? materialSpec : { kind: 'texture', id: fallbackStyleId };
            if (spec.kind === 'color') {
                const colorId = typeof spec.id === 'string' && spec.id ? spec.id : BELT_COURSE_COLOR.OFFWHITE;
                const found = getColorOpt(colorId) ?? null;
                const labelText = found?.label ?? colorId;
                picker.text.textContent = labelText;
                thumbColorFn(picker.thumb, found?.hex ?? 0xffffff);
                return;
            }
            const styleId = typeof spec.id === 'string' && spec.id ? spec.id : fallbackStyleId;
            const found = getTexOpt(styleId) ?? null;
            const labelText = found?.label ?? styleId;
            picker.text.textContent = labelText;
            thumbTextureFn(picker.thumb, found?.wallTextureUrl ?? '', labelText);
        };

        syncWallMaterialPicker(wallMaterial);
        picker.button.disabled = !canEdit;
        picker.button.addEventListener('click', () => {
            if (!canEdit) return;
            if (typeof openMaterialPicker !== 'function') return;
            openMaterialPicker({
                title: 'Wall material',
                material: layerObj?.material ?? wallMaterial,
                textureOptions: Array.isArray(textureMaterialOptions) ? textureMaterialOptions : [],
                colorOptions: Array.isArray(colorMaterialOptions) ? colorMaterialOptions : [],
                onSelect: (spec) => {
                    if (!layerObj) return;
                    layerObj.material = spec;
                    if (spec?.kind === 'texture' && typeof spec.id === 'string') layerObj.style = spec.id;
                    syncWallMaterialPicker(spec);
                    onChangeFn();
                }
            });
        });
        body.appendChild(picker.row);

        if (layerObj) {
            layerObj.wallBase ??= { ...WALL_BASE_MATERIAL_DEFAULT };

            const wallBaseGroup = createDetailsSection('Wall base material', {
                open: false,
                nested: true,
                key: `${scopeKey}:layer:${id}:walls:base`,
                detailsOpenByKey: detailsMap
            });
            const wallBaseResetBtn = document.createElement('button');
            wallBaseResetBtn.type = 'button';
            wallBaseResetBtn.className = 'building-fab-details-reset';
            wallBaseResetBtn.disabled = !canEdit;
            applyMaterialSymbolToButton(wallBaseResetBtn, { name: 'restart_alt', label: 'Reset to defaults', size: 'sm' });
            wallBaseResetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!canEdit) return;
                layerObj.wallBase = { ...WALL_BASE_MATERIAL_DEFAULT };
                syncWallBaseUi();
                onChangeFn();
            });
            wallBaseGroup.summary.appendChild(wallBaseResetBtn);

            wallBaseGroup.body.appendChild(createHint('These controls affect the full wall surface (before material variation).'));

            const tintPicker = createMaterialPickerRowController({
                label: 'Wall albedo tint',
                onPick: () => {
                    if (!canEdit) return;
                    if (!openColorPickerFn) return;
                    if (layerObj?.material?.kind === 'color') return;
                    const options = [
                        { id: 'wall_tint:white', label: 'White (no tint)', kind: 'color', hex: 0xffffff },
                        ...(Array.isArray(colorMaterialOptions) ? colorMaterialOptions : [])
                    ].filter((opt) => opt && opt.kind === 'color' && Number.isFinite(opt.hex));
                    const selectedHex = Number(layerObj.wallBase?.tintHex);
                    openColorPickerFn({
                        title: 'Wall albedo tint',
                        options,
                        selectedHex: Number.isFinite(selectedHex) ? selectedHex : 0xffffff,
                        onPick: (picked) => {
                            const hex = Number(picked?.hex);
                            if (!Number.isFinite(hex)) return;
                            layerObj.wallBase.tintHex = (hex >>> 0) & 0xffffff;
                            syncWallBaseUi();
                            onChangeFn();
                        }
                    });
                }
            });

            const wallRoughnessRow = createRangeRow('Wall roughness');
            wallRoughnessRow.range.min = '0';
            wallRoughnessRow.range.max = '1';
            wallRoughnessRow.range.step = '0.01';
            wallRoughnessRow.number.min = '0';
            wallRoughnessRow.number.max = '1';
            wallRoughnessRow.number.step = '0.01';

            const wallNormalRow = createRangeRow('Wall normal strength');
            wallNormalRow.range.min = '0';
            wallNormalRow.range.max = '2';
            wallNormalRow.range.step = '0.01';
            wallNormalRow.number.min = '0';
            wallNormalRow.number.max = '2';
            wallNormalRow.number.step = '0.01';

            const setWallRoughnessFromUi = (raw) => {
                const next = clampFn(raw, 0.0, 1.0);
                layerObj.wallBase.roughness = next;
                wallRoughnessRow.range.value = String(next);
                wallRoughnessRow.number.value = formatFloatFn(next, 2);
                onChangeFn();
            };

            const setWallNormalFromUi = (raw) => {
                const next = clampFn(raw, 0.0, 2.0);
                layerObj.wallBase.normalStrength = next;
                wallNormalRow.range.value = String(next);
                wallNormalRow.number.value = formatFloatFn(next, 2);
                onChangeFn();
            };

            const syncWallBaseUi = () => {
                layerObj.wallBase ??= { ...WALL_BASE_MATERIAL_DEFAULT };
                const tintHex = Number.isFinite(layerObj.wallBase?.tintHex) ? ((Number(layerObj.wallBase.tintHex) >>> 0) & 0xffffff) : 0xffffff;
                const options = [
                    { id: 'wall_tint:white', label: 'White (no tint)', kind: 'color', hex: 0xffffff },
                    ...(Array.isArray(colorMaterialOptions) ? colorMaterialOptions : [])
                ].filter((opt) => opt && opt.kind === 'color' && Number.isFinite(opt.hex));
                const labelText = options.find((opt) => opt.hex === tintHex)?.label
                    ?? `#${tintHex.toString(16).padStart(6, '0')}`;
                tintPicker.text.textContent = labelText;
                thumbColorFn(tintPicker.thumb, tintHex);

                const textured = layerObj?.material?.kind !== 'color';
                tintPicker.button.disabled = !canEdit || !textured || !openColorPickerFn;

                const rough = clampFn(layerObj.wallBase?.roughness ?? WALL_BASE_MATERIAL_DEFAULT.roughness, 0.0, 1.0);
                wallRoughnessRow.range.disabled = !canEdit;
                wallRoughnessRow.number.disabled = !canEdit;
                wallRoughnessRow.range.value = String(rough);
                wallRoughnessRow.number.value = formatFloatFn(rough, 2);

                const normal = clampFn(layerObj.wallBase?.normalStrength ?? WALL_BASE_MATERIAL_DEFAULT.normalStrength, 0.0, 2.0);
                wallNormalRow.range.disabled = !canEdit;
                wallNormalRow.number.disabled = !canEdit;
                wallNormalRow.range.value = String(normal);
                wallNormalRow.number.value = formatFloatFn(normal, 2);

                wallBaseResetBtn.disabled = !canEdit;
            };

            wallRoughnessRow.range.addEventListener('input', () => setWallRoughnessFromUi(wallRoughnessRow.range.value));
            wallRoughnessRow.number.addEventListener('input', () => setWallRoughnessFromUi(wallRoughnessRow.number.value));
            wallNormalRow.range.addEventListener('input', () => setWallNormalFromUi(wallNormalRow.range.value));
            wallNormalRow.number.addEventListener('input', () => setWallNormalFromUi(wallNormalRow.number.value));

            syncWallBaseUi();
            wallBaseGroup.body.appendChild(tintPicker.row);
            wallBaseGroup.body.appendChild(wallRoughnessRow.row);
            wallBaseGroup.body.appendChild(wallNormalRow.row);
            body.appendChild(wallBaseGroup.details);

            const wallTilingController = createTextureTilingMiniController({
                mode: 'details',
                title: 'Texture tiling',
                detailsOpenByKey: detailsMap,
                detailsKey: `${scopeKey}:layer:${id}:walls:tiling`,
                allow: canEdit,
                tiling: (layerObj.tiling ??= {}),
                defaults: { tileMeters: 2.0 },
                hintText: 'Overrides the material tile size in meters.',
                onChange: onChangeFn
            });
            wallTilingController.mount(body);
            registerMini?.(wallTilingController);

            appendMatVar?.({
                parent: body,
                allow: canEdit,
                scopeKey,
                layerId: id,
                layer: layerObj,
                onChange: onChangeFn,
                onReRender: () => reRenderLayers?.(),
                registerMiniController: (ctrl) => registerMini?.(ctrl)
            });
        }

        return { details, summary, body, label };
    };

    return {
        wallInsetRow,
        mountWallInset,
        syncGlobal,
        appendLayerWallsUI,
        bind,
        unbind,
        dispose,
        destroy: dispose
    };
}
