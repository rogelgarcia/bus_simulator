// src/graphics/gui/building_fabrication/WallsUIController.js
// Walls UI controller for building fabrication HUD.
import { BUILDING_STYLE } from '../../../app/buildings/BuildingStyle.js';
import { BELT_COURSE_COLOR } from '../../../app/buildings/BeltCourseColor.js';
import { createMaterialPickerRowController } from './mini_controllers/MaterialPickerRowController.js';
import { createRangeRow } from './mini_controllers/UiMiniControlPrimitives.js';
import { createTextureTilingMiniController } from './mini_controllers/TextureTilingMiniController.js';

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
