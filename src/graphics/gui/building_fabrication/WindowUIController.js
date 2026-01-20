// src/graphics/gui/building_fabrication/WindowUIController.js
// Window UI controller for building fabrication HUD.
import { BUILDING_STYLE } from '../../../app/buildings/BuildingStyle.js';
import { BELT_COURSE_COLOR } from '../../../app/buildings/BeltCourseColor.js';
import { WINDOW_TYPE, getDefaultWindowParams, getWindowTypeOptions } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import { normalizeWindowTypeIdOrLegacyStyle } from '../../assets3d/generators/buildings/WindowTypeCompatibility.js';
import { createMaterialPickerRowController } from './mini_controllers/MaterialPickerRowController.js';
import { createDetailsSection, createRangeRow, createToggleRow } from './mini_controllers/UiMiniControlPrimitives.js';

export function createWindowUIController({
    pickerPopup = null,
    detailsOpenByKey = null,
    clamp = null,
    clampInt = null,
    formatFloat = null,
    setMaterialThumbToTexture = null,
    setMaterialThumbToColor = null,
    getWindowTypeId = null,
    setWindowTypeId = null,
    getWindowParams = null,
    setWindowParams = null,
    getWindowWidth = null,
    setWindowWidth = null,
    getWindowGap = null,
    setWindowGap = null,
    getWindowHeight = null,
    setWindowHeight = null,
    getWindowY = null,
    setWindowY = null,
    getWindowSpacerEnabled = null,
    setWindowSpacerEnabled = null,
    getWindowSpacerEvery = null,
    setWindowSpacerEvery = null,
    getWindowSpacerWidth = null,
    setWindowSpacerWidth = null,
    getWindowSpacerExtrude = null,
    setWindowSpacerExtrude = null,
    getWindowSpacerExtrudeDistance = null,
    setWindowSpacerExtrudeDistance = null,
    getStreetWindowTypeId = null,
    setStreetWindowTypeId = null,
    getStreetWindowParams = null,
    setStreetWindowParams = null,
    getStreetWindowWidth = null,
    setStreetWindowWidth = null,
    getStreetWindowGap = null,
    setStreetWindowGap = null,
    getStreetWindowHeight = null,
    setStreetWindowHeight = null,
    getStreetWindowY = null,
    setStreetWindowY = null,
    getStreetWindowSpacerEnabled = null,
    setStreetWindowSpacerEnabled = null,
    getStreetWindowSpacerEvery = null,
    setStreetWindowSpacerEvery = null,
    getStreetWindowSpacerWidth = null,
    setStreetWindowSpacerWidth = null,
    getStreetWindowSpacerExtrude = null,
    setStreetWindowSpacerExtrude = null,
    getStreetWindowSpacerExtrudeDistance = null,
    setStreetWindowSpacerExtrudeDistance = null,
    requestSync = null,
    onWindowStyleChange = null,
    onWindowFrameWidthChange = null,
    onWindowFrameColorChange = null,
    onWindowGlassTopChange = null,
    onWindowGlassBottomChange = null,
    onWindowWidthChange = null,
    onWindowGapChange = null,
    onWindowHeightChange = null,
    onWindowYChange = null,
    onWindowSpacerEnabledChange = null,
    onWindowSpacerEveryChange = null,
    onWindowSpacerWidthChange = null,
    onWindowSpacerExtrudeChange = null,
    onWindowSpacerExtrudeDistanceChange = null,
    onStreetWindowStyleChange = null,
    onStreetWindowFrameWidthChange = null,
    onStreetWindowFrameColorChange = null,
    onStreetWindowGlassTopChange = null,
    onStreetWindowGlassBottomChange = null,
    onStreetWindowWidthChange = null,
    onStreetWindowGapChange = null,
    onStreetWindowHeightChange = null,
    onStreetWindowYChange = null,
    onStreetWindowSpacerEnabledChange = null,
    onStreetWindowSpacerEveryChange = null,
    onStreetWindowSpacerWidthChange = null,
    onStreetWindowSpacerExtrudeChange = null,
    onStreetWindowSpacerExtrudeDistanceChange = null
} = {}) {
    const windowTypeOptions = getWindowTypeOptions();
    const windowParamColorOptions = [
        { id: 'offwhite', label: 'Off-white', hex: 0xdfe7f2 },
        { id: 'beige', label: 'Beige', hex: 0xd9c4a1 },
        { id: 'brown', label: 'Brown', hex: 0x6a4c3b },
        { id: 'warm', label: 'Warm', hex: 0xffcc78 },
        { id: 'blue', label: 'Blue', hex: 0x1d5c8d },
        { id: 'navy', label: 'Navy', hex: 0x061a2c },
        { id: 'dark', label: 'Dark', hex: 0x0a101a }
    ];

    const clampFn = typeof clamp === 'function' ? clamp : (v, min, max) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return min;
        return Math.max(min, Math.min(max, num));
    };
    const clampIntFn = typeof clampInt === 'function' ? clampInt : (v, min, max) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return min;
        const rounded = Math.round(num);
        return Math.max(min, Math.min(max, rounded));
    };
    const formatFloatFn = typeof formatFloat === 'function' ? formatFloat : (v, digits = 1) => {
        const num = Number(v);
        if (!Number.isFinite(num)) return '';
        return num.toFixed(digits);
    };

    const thumbTextureFn = typeof setMaterialThumbToTexture === 'function' ? setMaterialThumbToTexture : () => {};
    const thumbColorFn = typeof setMaterialThumbToColor === 'function' ? setMaterialThumbToColor : () => {};
    const requestSyncFn = typeof requestSync === 'function' ? requestSync : () => {};

    const getWinType = typeof getWindowTypeId === 'function' ? getWindowTypeId : () => WINDOW_TYPE.STYLE_DEFAULT;
    const setWinType = typeof setWindowTypeId === 'function' ? setWindowTypeId : () => {};
    const getWinParams = typeof getWindowParams === 'function' ? getWindowParams : () => null;
    const setWinParams = typeof setWindowParams === 'function' ? setWindowParams : () => {};
    const getWinWidth = typeof getWindowWidth === 'function' ? getWindowWidth : () => 2.2;
    const setWinWidth = typeof setWindowWidth === 'function' ? setWindowWidth : () => {};
    const getWinGap = typeof getWindowGap === 'function' ? getWindowGap : () => 1.6;
    const setWinGap = typeof setWindowGap === 'function' ? setWindowGap : () => {};
    const getWinHeight = typeof getWindowHeight === 'function' ? getWindowHeight : () => 1.4;
    const setWinHeight = typeof setWindowHeight === 'function' ? setWindowHeight : () => {};
    const getWinY = typeof getWindowY === 'function' ? getWindowY : () => 1.0;
    const setWinY = typeof setWindowY === 'function' ? setWindowY : () => {};
    const getWinSpacerEnabled = typeof getWindowSpacerEnabled === 'function' ? getWindowSpacerEnabled : () => false;
    const setWinSpacerEnabled = typeof setWindowSpacerEnabled === 'function' ? setWindowSpacerEnabled : () => {};
    const getWinSpacerEvery = typeof getWindowSpacerEvery === 'function' ? getWindowSpacerEvery : () => 4;
    const setWinSpacerEvery = typeof setWindowSpacerEvery === 'function' ? setWindowSpacerEvery : () => {};
    const getWinSpacerWidth = typeof getWindowSpacerWidth === 'function' ? getWindowSpacerWidth : () => 0.9;
    const setWinSpacerWidth = typeof setWindowSpacerWidth === 'function' ? setWindowSpacerWidth : () => {};
    const getWinSpacerExtrude = typeof getWindowSpacerExtrude === 'function' ? getWindowSpacerExtrude : () => false;
    const setWinSpacerExtrude = typeof setWindowSpacerExtrude === 'function' ? setWindowSpacerExtrude : () => {};
    const getWinSpacerExtrudeDistance = typeof getWindowSpacerExtrudeDistance === 'function' ? getWindowSpacerExtrudeDistance : () => 0.12;
    const setWinSpacerExtrudeDistance = typeof setWindowSpacerExtrudeDistance === 'function' ? setWindowSpacerExtrudeDistance : () => {};

    const getStreetType = typeof getStreetWindowTypeId === 'function' ? getStreetWindowTypeId : () => WINDOW_TYPE.STYLE_DEFAULT;
    const setStreetType = typeof setStreetWindowTypeId === 'function' ? setStreetWindowTypeId : () => {};
    const getStreetParams = typeof getStreetWindowParams === 'function' ? getStreetWindowParams : () => null;
    const setStreetParams = typeof setStreetWindowParams === 'function' ? setStreetWindowParams : () => {};
    const getStreetWidth = typeof getStreetWindowWidth === 'function' ? getStreetWindowWidth : () => 2.2;
    const setStreetWidth = typeof setStreetWindowWidth === 'function' ? setStreetWindowWidth : () => {};
    const getStreetGap = typeof getStreetWindowGap === 'function' ? getStreetWindowGap : () => 1.6;
    const setStreetGap = typeof setStreetWindowGap === 'function' ? setStreetWindowGap : () => {};
    const getStreetHeight = typeof getStreetWindowHeight === 'function' ? getStreetWindowHeight : () => 1.4;
    const setStreetHeight = typeof setStreetWindowHeight === 'function' ? setStreetWindowHeight : () => {};
    const getStreetY = typeof getStreetWindowY === 'function' ? getStreetWindowY : () => 1.0;
    const setStreetY = typeof setStreetWindowY === 'function' ? setStreetWindowY : () => {};
    const getStreetSpacerEnabled = typeof getStreetWindowSpacerEnabled === 'function' ? getStreetWindowSpacerEnabled : () => false;
    const setStreetSpacerEnabled = typeof setStreetWindowSpacerEnabled === 'function' ? setStreetWindowSpacerEnabled : () => {};
    const getStreetSpacerEvery = typeof getStreetWindowSpacerEvery === 'function' ? getStreetWindowSpacerEvery : () => 4;
    const setStreetSpacerEvery = typeof setStreetWindowSpacerEvery === 'function' ? setStreetWindowSpacerEvery : () => {};
    const getStreetSpacerWidth = typeof getStreetWindowSpacerWidth === 'function' ? getStreetWindowSpacerWidth : () => 0.9;
    const setStreetSpacerWidth = typeof setStreetWindowSpacerWidth === 'function' ? setStreetWindowSpacerWidth : () => {};
    const getStreetSpacerExtrude = typeof getStreetWindowSpacerExtrude === 'function' ? getStreetWindowSpacerExtrude : () => false;
    const setStreetSpacerExtrude = typeof setStreetWindowSpacerExtrude === 'function' ? setStreetWindowSpacerExtrude : () => {};
    const getStreetSpacerExtrudeDistance = typeof getStreetWindowSpacerExtrudeDistance === 'function' ? getStreetWindowSpacerExtrudeDistance : () => 0.12;
    const setStreetSpacerExtrudeDistance = typeof setStreetWindowSpacerExtrudeDistance === 'function' ? setStreetWindowSpacerExtrudeDistance : () => {};

    const getWindowOption = (id) => (windowTypeOptions ?? []).find((opt) => opt?.id === id) ?? null;

    const isParametricWindowType = (typeId) => {
        const id = typeof typeId === 'string' && typeId ? typeId : WINDOW_TYPE.STYLE_DEFAULT;
        return id === WINDOW_TYPE.ARCH_V1 || id === WINDOW_TYPE.MODERN_V1;
    };

    const labelForHex = (hex) => {
        const safe = Number.isFinite(hex) ? hex : 0xffffff;
        return windowParamColorOptions.find((c) => c.hex === safe)?.label
            ?? `#${safe.toString(16).padStart(6, '0')}`;
    };

    const makeMaterialPickerRow = (label, { status = false, onPick = null } = {}) => {
        const ctrl = createMaterialPickerRowController({ label, status, onPick });
        return ctrl;
    };

    const windowStyleRow = makeMaterialPickerRow('Window', { status: true, onPick: () => openWindowTypePicker() });

    const windowWidthRow = createRangeRow('Window width (m)');
    windowWidthRow.range.min = '0.3';
    windowWidthRow.range.max = '12';
    windowWidthRow.range.step = '0.1';
    windowWidthRow.number.min = '0.3';
    windowWidthRow.number.max = '12';
    windowWidthRow.number.step = '0.1';

    const windowGapRow = createRangeRow('Window spacing (m)');
    windowGapRow.range.min = '0';
    windowGapRow.range.max = '24';
    windowGapRow.range.step = '0.1';
    windowGapRow.number.min = '0';
    windowGapRow.number.max = '24';
    windowGapRow.number.step = '0.1';

    const windowHeightRow = createRangeRow('Window height (m)');
    windowHeightRow.range.min = '0.3';
    windowHeightRow.range.max = '10';
    windowHeightRow.range.step = '0.1';
    windowHeightRow.number.min = '0.3';
    windowHeightRow.number.max = '10';
    windowHeightRow.number.step = '0.1';

    const windowYRow = createRangeRow('Window y (m)');
    windowYRow.range.min = '0';
    windowYRow.range.max = '12';
    windowYRow.range.step = '0.1';
    windowYRow.number.min = '0';
    windowYRow.number.max = '12';
    windowYRow.number.step = '0.1';

    const windowFrameWidthRow = createRangeRow('Frame width');
    windowFrameWidthRow.range.min = '0.02';
    windowFrameWidthRow.range.max = '0.2';
    windowFrameWidthRow.range.step = '0.01';
    windowFrameWidthRow.number.min = '0.02';
    windowFrameWidthRow.number.max = '0.2';
    windowFrameWidthRow.number.step = '0.01';

    const windowFrameColorRow = makeMaterialPickerRow('Frame color', { onPick: () => openWindowFrameColorPicker() });
    const windowGlassTopRow = makeMaterialPickerRow('Glass top', { onPick: () => openWindowGlassTopPicker() });
    const windowGlassBottomRow = makeMaterialPickerRow('Glass bottom', { onPick: () => openWindowGlassBottomPicker() });

    const windowSpacerToggle = createToggleRow('Window spacer', { wide: true });
    windowSpacerToggle.input.checked = !!getWinSpacerEnabled();
    const windowSpacerEveryRow = createRangeRow('Spacer every (windows)');
    windowSpacerEveryRow.range.min = '1';
    windowSpacerEveryRow.range.max = '99';
    windowSpacerEveryRow.range.step = '1';
    windowSpacerEveryRow.number.min = '1';
    windowSpacerEveryRow.number.max = '99';
    windowSpacerEveryRow.number.step = '1';
    const windowSpacerWidthRow = createRangeRow('Spacer width (m)');
    windowSpacerWidthRow.range.min = '0.1';
    windowSpacerWidthRow.range.max = '10';
    windowSpacerWidthRow.range.step = '0.1';
    windowSpacerWidthRow.number.min = '0.1';
    windowSpacerWidthRow.number.max = '10';
    windowSpacerWidthRow.number.step = '0.1';
    const windowSpacerExtrudeToggle = createToggleRow('Spacer extrude', { wide: true });
    windowSpacerExtrudeToggle.input.checked = !!getWinSpacerExtrude();
    const windowSpacerExtrudeDistanceRow = createRangeRow('Spacer extrude (m)');
    windowSpacerExtrudeDistanceRow.range.min = '0';
    windowSpacerExtrudeDistanceRow.range.max = '1';
    windowSpacerExtrudeDistanceRow.range.step = '0.01';
    windowSpacerExtrudeDistanceRow.number.min = '0';
    windowSpacerExtrudeDistanceRow.number.max = '1';
    windowSpacerExtrudeDistanceRow.number.step = '0.01';

    const streetWindowStyleRow = makeMaterialPickerRow('Window', { status: true, onPick: () => openStreetWindowTypePicker() });

    const streetWindowWidthRow = createRangeRow('Window width (m)');
    streetWindowWidthRow.range.min = '0.3';
    streetWindowWidthRow.range.max = '12';
    streetWindowWidthRow.range.step = '0.1';
    streetWindowWidthRow.number.min = '0.3';
    streetWindowWidthRow.number.max = '12';
    streetWindowWidthRow.number.step = '0.1';
    const streetWindowGapRow = createRangeRow('Window spacing (m)');
    streetWindowGapRow.range.min = '0';
    streetWindowGapRow.range.max = '24';
    streetWindowGapRow.range.step = '0.1';
    streetWindowGapRow.number.min = '0';
    streetWindowGapRow.number.max = '24';
    streetWindowGapRow.number.step = '0.1';
    const streetWindowHeightRow = createRangeRow('Window height (m)');
    streetWindowHeightRow.range.min = '0.3';
    streetWindowHeightRow.range.max = '10';
    streetWindowHeightRow.range.step = '0.1';
    streetWindowHeightRow.number.min = '0.3';
    streetWindowHeightRow.number.max = '10';
    streetWindowHeightRow.number.step = '0.1';
    const streetWindowYRow = createRangeRow('Window y (m)');
    streetWindowYRow.range.min = '0';
    streetWindowYRow.range.max = '12';
    streetWindowYRow.range.step = '0.1';
    streetWindowYRow.number.min = '0';
    streetWindowYRow.number.max = '12';
    streetWindowYRow.number.step = '0.1';

    const streetWindowFrameWidthRow = createRangeRow('Frame width');
    streetWindowFrameWidthRow.range.min = '0.02';
    streetWindowFrameWidthRow.range.max = '0.2';
    streetWindowFrameWidthRow.range.step = '0.01';
    streetWindowFrameWidthRow.number.min = '0.02';
    streetWindowFrameWidthRow.number.max = '0.2';
    streetWindowFrameWidthRow.number.step = '0.01';
    const streetWindowFrameColorRow = makeMaterialPickerRow('Frame color', { onPick: () => openStreetWindowFrameColorPicker() });
    const streetWindowGlassTopRow = makeMaterialPickerRow('Glass top', { onPick: () => openStreetWindowGlassTopPicker() });
    const streetWindowGlassBottomRow = makeMaterialPickerRow('Glass bottom', { onPick: () => openStreetWindowGlassBottomPicker() });

    const streetWindowSpacerToggle = createToggleRow('Window spacer', { wide: true });
    streetWindowSpacerToggle.input.checked = !!getStreetSpacerEnabled();
    const streetWindowSpacerEveryRow = createRangeRow('Spacer every (windows)');
    streetWindowSpacerEveryRow.range.min = '1';
    streetWindowSpacerEveryRow.range.max = '99';
    streetWindowSpacerEveryRow.range.step = '1';
    streetWindowSpacerEveryRow.number.min = '1';
    streetWindowSpacerEveryRow.number.max = '99';
    streetWindowSpacerEveryRow.number.step = '1';
    const streetWindowSpacerWidthRow = createRangeRow('Spacer width (m)');
    streetWindowSpacerWidthRow.range.min = '0.1';
    streetWindowSpacerWidthRow.range.max = '10';
    streetWindowSpacerWidthRow.range.step = '0.1';
    streetWindowSpacerWidthRow.number.min = '0.1';
    streetWindowSpacerWidthRow.number.max = '10';
    streetWindowSpacerWidthRow.number.step = '0.1';
    const streetWindowSpacerExtrudeToggle = createToggleRow('Spacer extrude', { wide: true });
    streetWindowSpacerExtrudeToggle.input.checked = !!getStreetSpacerExtrude();
    const streetWindowSpacerExtrudeDistanceRow = createRangeRow('Spacer extrude (m)');
    streetWindowSpacerExtrudeDistanceRow.range.min = '0';
    streetWindowSpacerExtrudeDistanceRow.range.max = '1';
    streetWindowSpacerExtrudeDistanceRow.range.step = '0.01';
    streetWindowSpacerExtrudeDistanceRow.number.min = '0';
    streetWindowSpacerExtrudeDistanceRow.number.max = '1';
    streetWindowSpacerExtrudeDistanceRow.number.step = '0.01';

    const openWindowTypePicker = () => {
        if (!pickerPopup || windowStyleRow.button.disabled) return;
        const options = (windowTypeOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.previewUrl
        }));
        pickerPopup.open({
            title: 'Window type',
            sections: [{ label: 'Types', options }],
            selectedId: getWinType() || WINDOW_TYPE.STYLE_DEFAULT,
            onSelect: (opt) => setWindowStyleFromUi(opt?.id)
        });
    };

    const openStreetWindowTypePicker = () => {
        if (!pickerPopup || streetWindowStyleRow.button.disabled) return;
        const options = (windowTypeOptions ?? []).map((opt) => ({
            id: opt.id,
            label: opt.label,
            kind: 'texture',
            previewUrl: opt.previewUrl
        }));
        pickerPopup.open({
            title: 'Street window type',
            sections: [{ label: 'Types', options }],
            selectedId: getStreetType() || WINDOW_TYPE.STYLE_DEFAULT,
            onSelect: (opt) => setStreetWindowStyleFromUi(opt?.id)
        });
    };

    const openWindowParamColorPicker = ({ title, selectedHex, onPick } = {}) => {
        if (!pickerPopup || typeof onPick !== 'function') return;
        const options = windowParamColorOptions.map((c) => ({
            id: c.id,
            label: c.label,
            kind: 'color',
            hex: c.hex
        }));
        const selected = windowParamColorOptions.find((c) => c.hex === selectedHex)?.id ?? null;
        pickerPopup.open({
            title: title || 'Select color',
            sections: [{ label: 'Colors', options }],
            selectedId: selected,
            onSelect: (opt) => onPick(opt?.hex)
        });
    };

    const openWindowFrameColorPicker = () => {
        const hex = Number(getWinParams()?.frameColor);
        openWindowParamColorPicker({
            title: 'Frame color',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setWinParams({ ...(getWinParams() ?? {}), frameColor: pickedHex });
                onWindowFrameColorChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const openWindowGlassTopPicker = () => {
        const hex = Number(getWinParams()?.glassTop);
        openWindowParamColorPicker({
            title: 'Glass top',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setWinParams({ ...(getWinParams() ?? {}), glassTop: pickedHex });
                onWindowGlassTopChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const openWindowGlassBottomPicker = () => {
        const hex = Number(getWinParams()?.glassBottom);
        openWindowParamColorPicker({
            title: 'Glass bottom',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setWinParams({ ...(getWinParams() ?? {}), glassBottom: pickedHex });
                onWindowGlassBottomChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const openStreetWindowFrameColorPicker = () => {
        const hex = Number(getStreetParams()?.frameColor);
        openWindowParamColorPicker({
            title: 'Street frame color',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setStreetParams({ ...(getStreetParams() ?? {}), frameColor: pickedHex });
                onStreetWindowFrameColorChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const openStreetWindowGlassTopPicker = () => {
        const hex = Number(getStreetParams()?.glassTop);
        openWindowParamColorPicker({
            title: 'Street glass top',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setStreetParams({ ...(getStreetParams() ?? {}), glassTop: pickedHex });
                onStreetWindowGlassTopChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const openStreetWindowGlassBottomPicker = () => {
        const hex = Number(getStreetParams()?.glassBottom);
        openWindowParamColorPicker({
            title: 'Street glass bottom',
            selectedHex: Number.isFinite(hex) ? hex : null,
            onPick: (pickedHex) => {
                if (!Number.isFinite(pickedHex)) return;
                setStreetParams({ ...(getStreetParams() ?? {}), glassBottom: pickedHex });
                onStreetWindowGlassBottomChange?.(pickedHex);
                requestSyncFn();
            }
        });
    };

    const setWindowStyleFromUi = (raw) => {
        const typeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const changed = typeId !== getWinType();
        setWinType(typeId);
        setWinParams(getDefaultWindowParams(typeId));
        requestSyncFn();
        if (changed) onWindowStyleChange?.(typeId);
    };

    const setStreetWindowStyleFromUi = (raw) => {
        const typeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const changed = typeId !== getStreetType();
        setStreetType(typeId);
        setStreetParams(getDefaultWindowParams(typeId));
        requestSyncFn();
        if (changed) onStreetWindowStyleChange?.(typeId);
    };

    const setWindowWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.3, 12.0);
        const changed = Math.abs(next - getWinWidth()) >= 1e-6;
        setWinWidth(next);
        windowWidthRow.range.value = String(next);
        windowWidthRow.number.value = formatFloatFn(next, 1);
        if (changed) onWindowWidthChange?.(next);
    };
    const setWindowGapFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 24.0);
        const changed = Math.abs(next - getWinGap()) >= 1e-6;
        setWinGap(next);
        windowGapRow.range.value = String(next);
        windowGapRow.number.value = formatFloatFn(next, 1);
        if (changed) onWindowGapChange?.(next);
    };
    const setWindowHeightFromUi = (raw) => {
        const next = clampFn(raw, 0.3, 10.0);
        const changed = Math.abs(next - getWinHeight()) >= 1e-6;
        setWinHeight(next);
        windowHeightRow.range.value = String(next);
        windowHeightRow.number.value = formatFloatFn(next, 1);
        if (changed) onWindowHeightChange?.(next);
    };
    const setWindowYFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 12.0);
        const changed = Math.abs(next - getWinY()) >= 1e-6;
        setWinY(next);
        windowYRow.range.value = String(next);
        windowYRow.number.value = formatFloatFn(next, 1);
        if (changed) onWindowYChange?.(next);
    };

    const setWindowFrameWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.02, 0.2);
        const prev = Number(getWinParams()?.frameWidth) || 0;
        const changed = Math.abs(next - prev) >= 1e-6;
        setWinParams({ ...(getWinParams() ?? {}), frameWidth: next });
        windowFrameWidthRow.range.value = String(next);
        windowFrameWidthRow.number.value = formatFloatFn(next, 2);
        if (changed) onWindowFrameWidthChange?.(next);
    };

    const setWindowSpacerEnabledFromUi = (raw) => {
        const next = !!raw;
        const changed = next !== !!getWinSpacerEnabled();
        setWinSpacerEnabled(next);
        windowSpacerToggle.input.checked = next;
        requestSyncFn();
        if (changed) onWindowSpacerEnabledChange?.(next);
    };
    const setWindowSpacerEveryFromUi = (raw) => {
        const next = clampIntFn(raw, 1, 99);
        const changed = next !== getWinSpacerEvery();
        setWinSpacerEvery(next);
        windowSpacerEveryRow.range.value = String(next);
        windowSpacerEveryRow.number.value = String(next);
        requestSyncFn();
        if (changed) onWindowSpacerEveryChange?.(next);
    };
    const setWindowSpacerWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.1, 10.0);
        const changed = Math.abs(next - getWinSpacerWidth()) >= 1e-6;
        setWinSpacerWidth(next);
        windowSpacerWidthRow.range.value = String(next);
        windowSpacerWidthRow.number.value = formatFloatFn(next, 1);
        requestSyncFn();
        if (changed) onWindowSpacerWidthChange?.(next);
    };
    const setWindowSpacerExtrudeFromUi = (raw) => {
        const next = !!raw;
        const changed = next !== !!getWinSpacerExtrude();
        setWinSpacerExtrude(next);
        windowSpacerExtrudeToggle.input.checked = next;
        requestSyncFn();
        if (changed) onWindowSpacerExtrudeChange?.(next);
    };
    const setWindowSpacerExtrudeDistanceFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 1.0);
        const changed = Math.abs(next - getWinSpacerExtrudeDistance()) >= 1e-6;
        setWinSpacerExtrudeDistance(next);
        windowSpacerExtrudeDistanceRow.range.value = String(next);
        windowSpacerExtrudeDistanceRow.number.value = formatFloatFn(next, 2);
        requestSyncFn();
        if (changed) onWindowSpacerExtrudeDistanceChange?.(next);
    };

    const setStreetWindowWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.3, 12.0);
        const changed = Math.abs(next - getStreetWidth()) >= 1e-6;
        setStreetWidth(next);
        streetWindowWidthRow.range.value = String(next);
        streetWindowWidthRow.number.value = formatFloatFn(next, 1);
        if (changed) onStreetWindowWidthChange?.(next);
    };
    const setStreetWindowGapFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 24.0);
        const changed = Math.abs(next - getStreetGap()) >= 1e-6;
        setStreetGap(next);
        streetWindowGapRow.range.value = String(next);
        streetWindowGapRow.number.value = formatFloatFn(next, 1);
        if (changed) onStreetWindowGapChange?.(next);
    };
    const setStreetWindowHeightFromUi = (raw) => {
        const next = clampFn(raw, 0.3, 10.0);
        const changed = Math.abs(next - getStreetHeight()) >= 1e-6;
        setStreetHeight(next);
        streetWindowHeightRow.range.value = String(next);
        streetWindowHeightRow.number.value = formatFloatFn(next, 1);
        if (changed) onStreetWindowHeightChange?.(next);
    };
    const setStreetWindowYFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 12.0);
        const changed = Math.abs(next - getStreetY()) >= 1e-6;
        setStreetY(next);
        streetWindowYRow.range.value = String(next);
        streetWindowYRow.number.value = formatFloatFn(next, 1);
        if (changed) onStreetWindowYChange?.(next);
    };

    const setStreetWindowFrameWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.02, 0.2);
        const prev = Number(getStreetParams()?.frameWidth) || 0;
        const changed = Math.abs(next - prev) >= 1e-6;
        setStreetParams({ ...(getStreetParams() ?? {}), frameWidth: next });
        streetWindowFrameWidthRow.range.value = String(next);
        streetWindowFrameWidthRow.number.value = formatFloatFn(next, 2);
        if (changed) onStreetWindowFrameWidthChange?.(next);
    };

    const setStreetWindowSpacerEnabledFromUi = (raw) => {
        const next = !!raw;
        const changed = next !== !!getStreetSpacerEnabled();
        setStreetSpacerEnabled(next);
        streetWindowSpacerToggle.input.checked = next;
        requestSyncFn();
        if (changed) onStreetWindowSpacerEnabledChange?.(next);
    };
    const setStreetWindowSpacerEveryFromUi = (raw) => {
        const next = clampIntFn(raw, 1, 99);
        const changed = next !== getStreetSpacerEvery();
        setStreetSpacerEvery(next);
        streetWindowSpacerEveryRow.range.value = String(next);
        streetWindowSpacerEveryRow.number.value = String(next);
        requestSyncFn();
        if (changed) onStreetWindowSpacerEveryChange?.(next);
    };
    const setStreetWindowSpacerWidthFromUi = (raw) => {
        const next = clampFn(raw, 0.1, 10.0);
        const changed = Math.abs(next - getStreetSpacerWidth()) >= 1e-6;
        setStreetSpacerWidth(next);
        streetWindowSpacerWidthRow.range.value = String(next);
        streetWindowSpacerWidthRow.number.value = formatFloatFn(next, 1);
        requestSyncFn();
        if (changed) onStreetWindowSpacerWidthChange?.(next);
    };
    const setStreetWindowSpacerExtrudeFromUi = (raw) => {
        const next = !!raw;
        const changed = next !== !!getStreetSpacerExtrude();
        setStreetSpacerExtrude(next);
        streetWindowSpacerExtrudeToggle.input.checked = next;
        requestSyncFn();
        if (changed) onStreetWindowSpacerExtrudeChange?.(next);
    };
    const setStreetWindowSpacerExtrudeDistanceFromUi = (raw) => {
        const next = clampFn(raw, 0.0, 1.0);
        const changed = Math.abs(next - getStreetSpacerExtrudeDistance()) >= 1e-6;
        setStreetSpacerExtrudeDistance(next);
        streetWindowSpacerExtrudeDistanceRow.range.value = String(next);
        streetWindowSpacerExtrudeDistanceRow.number.value = formatFloatFn(next, 2);
        requestSyncFn();
        if (changed) onStreetWindowSpacerExtrudeDistanceChange?.(next);
    };

    const syncWindowStyleButtons = ({ allow } = {}) => {
        const enabled = !!allow;
        const selected = getWinType() || WINDOW_TYPE.STYLE_DEFAULT;
        const found = getWindowOption(selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.previewUrl === 'string' ? found.previewUrl : '';

        windowStyleRow.button.disabled = !enabled;
        windowStyleRow.text.textContent = label;
        thumbTextureFn(windowStyleRow.thumb, url, label);
        if (windowStyleRow.status) windowStyleRow.status.textContent = enabled ? '' : 'Select a building to change windows.';
    };

    const syncStreetWindowStyleButtons = ({ allow } = {}) => {
        const enabled = !!allow;
        const selected = getStreetType() || WINDOW_TYPE.STYLE_DEFAULT;
        const found = getWindowOption(selected) ?? null;
        const label = found?.label ?? selected;
        const url = typeof found?.previewUrl === 'string' ? found.previewUrl : '';

        streetWindowStyleRow.button.disabled = !enabled;
        streetWindowStyleRow.text.textContent = label;
        thumbTextureFn(streetWindowStyleRow.thumb, url, label);
        if (streetWindowStyleRow.status) streetWindowStyleRow.status.textContent = enabled ? '' : 'Select a building and enable street floors.';
    };

    const sync = ({ hasSelected = false, allow = false, allowStreetWindows = false } = {}) => {
        const showWindowParams = !!hasSelected && isParametricWindowType(getWinType());
        const showStreetWindowParams = !!hasSelected && !!allowStreetWindows && isParametricWindowType(getStreetType());
        const allowWindowParams = !!allow && showWindowParams;
        const allowStreetWindowParams = !!allowStreetWindows && showStreetWindowParams;
        const allowWindowSpacer = !!allow && !!getWinSpacerEnabled();
        const allowStreetWindowSpacer = !!allowStreetWindows && !!getStreetSpacerEnabled();

        windowFrameWidthRow.row.classList.toggle('hidden', !showWindowParams);
        windowFrameColorRow.row.classList.toggle('hidden', !showWindowParams);
        windowGlassTopRow.row.classList.toggle('hidden', !showWindowParams);
        windowGlassBottomRow.row.classList.toggle('hidden', !showWindowParams);
        streetWindowFrameWidthRow.row.classList.toggle('hidden', !showStreetWindowParams);
        streetWindowFrameColorRow.row.classList.toggle('hidden', !showStreetWindowParams);
        streetWindowGlassTopRow.row.classList.toggle('hidden', !showStreetWindowParams);
        streetWindowGlassBottomRow.row.classList.toggle('hidden', !showStreetWindowParams);

        windowWidthRow.range.disabled = !allow;
        windowWidthRow.number.disabled = !allow;
        windowGapRow.range.disabled = !allow;
        windowGapRow.number.disabled = !allow;
        windowHeightRow.range.disabled = !allow;
        windowHeightRow.number.disabled = !allow;
        windowYRow.range.disabled = !allow;
        windowYRow.number.disabled = !allow;
        windowFrameWidthRow.range.disabled = !allowWindowParams;
        windowFrameWidthRow.number.disabled = !allowWindowParams;
        windowFrameColorRow.button.disabled = !allowWindowParams;
        windowGlassTopRow.button.disabled = !allowWindowParams;
        windowGlassBottomRow.button.disabled = !allowWindowParams;
        windowSpacerToggle.input.disabled = !allow;
        windowSpacerEveryRow.range.disabled = !allowWindowSpacer;
        windowSpacerEveryRow.number.disabled = !allowWindowSpacer;
        windowSpacerWidthRow.range.disabled = !allowWindowSpacer;
        windowSpacerWidthRow.number.disabled = !allowWindowSpacer;
        windowSpacerExtrudeToggle.input.disabled = !allowWindowSpacer;
        windowSpacerExtrudeDistanceRow.range.disabled = !allowWindowSpacer || !getWinSpacerExtrude();
        windowSpacerExtrudeDistanceRow.number.disabled = !allowWindowSpacer || !getWinSpacerExtrude();

        streetWindowWidthRow.range.disabled = !allowStreetWindows;
        streetWindowWidthRow.number.disabled = !allowStreetWindows;
        streetWindowGapRow.range.disabled = !allowStreetWindows;
        streetWindowGapRow.number.disabled = !allowStreetWindows;
        streetWindowHeightRow.range.disabled = !allowStreetWindows;
        streetWindowHeightRow.number.disabled = !allowStreetWindows;
        streetWindowYRow.range.disabled = !allowStreetWindows;
        streetWindowYRow.number.disabled = !allowStreetWindows;
        streetWindowFrameWidthRow.range.disabled = !allowStreetWindowParams;
        streetWindowFrameWidthRow.number.disabled = !allowStreetWindowParams;
        streetWindowFrameColorRow.button.disabled = !allowStreetWindowParams;
        streetWindowGlassTopRow.button.disabled = !allowStreetWindowParams;
        streetWindowGlassBottomRow.button.disabled = !allowStreetWindowParams;
        streetWindowSpacerToggle.input.disabled = !allowStreetWindows;
        streetWindowSpacerEveryRow.range.disabled = !allowStreetWindowSpacer;
        streetWindowSpacerEveryRow.number.disabled = !allowStreetWindowSpacer;
        streetWindowSpacerWidthRow.range.disabled = !allowStreetWindowSpacer;
        streetWindowSpacerWidthRow.number.disabled = !allowStreetWindowSpacer;
        streetWindowSpacerExtrudeToggle.input.disabled = !allowStreetWindowSpacer;
        streetWindowSpacerExtrudeDistanceRow.range.disabled = !allowStreetWindowSpacer || !getStreetSpacerExtrude();
        streetWindowSpacerExtrudeDistanceRow.number.disabled = !allowStreetWindowSpacer || !getStreetSpacerExtrude();

        if (!hasSelected) {
            syncWindowStyleButtons({ allow: false });
            syncStreetWindowStyleButtons({ allow: false });

            windowWidthRow.range.value = '0.3';
            windowWidthRow.number.value = '';
            windowGapRow.range.value = '0';
            windowGapRow.number.value = '';
            windowHeightRow.range.value = '0.3';
            windowHeightRow.number.value = '';
            windowYRow.range.value = '0';
            windowYRow.number.value = '';
            windowSpacerToggle.input.checked = false;
            windowSpacerEveryRow.range.value = '1';
            windowSpacerEveryRow.number.value = '';
            windowSpacerWidthRow.range.value = '0.1';
            windowSpacerWidthRow.number.value = '';
            windowSpacerExtrudeToggle.input.checked = false;
            windowSpacerExtrudeDistanceRow.range.value = '0';
            windowSpacerExtrudeDistanceRow.number.value = '';

            streetWindowWidthRow.range.value = '0.3';
            streetWindowWidthRow.number.value = '';
            streetWindowGapRow.range.value = '0';
            streetWindowGapRow.number.value = '';
            streetWindowHeightRow.range.value = '0.3';
            streetWindowHeightRow.number.value = '';
            streetWindowYRow.range.value = '0';
            streetWindowYRow.number.value = '';
            streetWindowSpacerToggle.input.checked = false;
            streetWindowSpacerEveryRow.range.value = '1';
            streetWindowSpacerEveryRow.number.value = '';
            streetWindowSpacerWidthRow.range.value = '0.1';
            streetWindowSpacerWidthRow.number.value = '';
            streetWindowSpacerExtrudeToggle.input.checked = false;
            streetWindowSpacerExtrudeDistanceRow.range.value = '0';
            streetWindowSpacerExtrudeDistanceRow.number.value = '';

            return;
        }

        syncWindowStyleButtons({ allow });
        syncStreetWindowStyleButtons({ allow: allowStreetWindows });

        const windowParams = { ...getDefaultWindowParams(getWinType()), ...(getWinParams() ?? {}) };
        const windowFrameWidth = clampFn(windowParams.frameWidth, 0.02, 0.2);
        const windowFrameColor = Number.isFinite(windowParams.frameColor) ? windowParams.frameColor : 0xffffff;
        const windowGlassTop = Number.isFinite(windowParams.glassTop) ? windowParams.glassTop : 0x94d9ff;
        const windowGlassBottom = Number.isFinite(windowParams.glassBottom) ? windowParams.glassBottom : 0x12507a;
        windowFrameWidthRow.range.value = String(windowFrameWidth);
        windowFrameWidthRow.number.value = formatFloatFn(windowFrameWidth, 2);
        windowFrameColorRow.text.textContent = labelForHex(windowFrameColor);
        windowGlassTopRow.text.textContent = labelForHex(windowGlassTop);
        windowGlassBottomRow.text.textContent = labelForHex(windowGlassBottom);
        thumbColorFn(windowFrameColorRow.thumb, windowFrameColor);
        thumbColorFn(windowGlassTopRow.thumb, windowGlassTop);
        thumbColorFn(windowGlassBottomRow.thumb, windowGlassBottom);

        windowWidthRow.range.value = String(getWinWidth());
        windowWidthRow.number.value = formatFloatFn(getWinWidth(), 1);
        windowGapRow.range.value = String(getWinGap());
        windowGapRow.number.value = formatFloatFn(getWinGap(), 1);
        windowHeightRow.range.value = String(getWinHeight());
        windowHeightRow.number.value = formatFloatFn(getWinHeight(), 1);
        windowYRow.range.value = String(getWinY());
        windowYRow.number.value = formatFloatFn(getWinY(), 1);
        windowSpacerToggle.input.checked = !!getWinSpacerEnabled();
        windowSpacerEveryRow.range.value = String(getWinSpacerEvery());
        windowSpacerEveryRow.number.value = String(getWinSpacerEvery());
        windowSpacerWidthRow.range.value = String(getWinSpacerWidth());
        windowSpacerWidthRow.number.value = formatFloatFn(getWinSpacerWidth(), 1);
        windowSpacerExtrudeToggle.input.checked = !!getWinSpacerExtrude();
        windowSpacerExtrudeDistanceRow.range.value = String(getWinSpacerExtrudeDistance());
        windowSpacerExtrudeDistanceRow.number.value = formatFloatFn(getWinSpacerExtrudeDistance(), 2);

        const streetParams = { ...getDefaultWindowParams(getStreetType()), ...(getStreetParams() ?? {}) };
        const streetFrameWidth = clampFn(streetParams.frameWidth, 0.02, 0.2);
        const streetFrameColor = Number.isFinite(streetParams.frameColor) ? streetParams.frameColor : 0xffffff;
        const streetGlassTop = Number.isFinite(streetParams.glassTop) ? streetParams.glassTop : 0x94d9ff;
        const streetGlassBottom = Number.isFinite(streetParams.glassBottom) ? streetParams.glassBottom : 0x12507a;
        streetWindowFrameWidthRow.range.value = String(streetFrameWidth);
        streetWindowFrameWidthRow.number.value = formatFloatFn(streetFrameWidth, 2);
        streetWindowFrameColorRow.text.textContent = labelForHex(streetFrameColor);
        streetWindowGlassTopRow.text.textContent = labelForHex(streetGlassTop);
        streetWindowGlassBottomRow.text.textContent = labelForHex(streetGlassBottom);
        thumbColorFn(streetWindowFrameColorRow.thumb, streetFrameColor);
        thumbColorFn(streetWindowGlassTopRow.thumb, streetGlassTop);
        thumbColorFn(streetWindowGlassBottomRow.thumb, streetGlassBottom);

        streetWindowWidthRow.range.value = String(getStreetWidth());
        streetWindowWidthRow.number.value = formatFloatFn(getStreetWidth(), 1);
        streetWindowGapRow.range.value = String(getStreetGap());
        streetWindowGapRow.number.value = formatFloatFn(getStreetGap(), 1);
        streetWindowHeightRow.range.value = String(getStreetHeight());
        streetWindowHeightRow.number.value = formatFloatFn(getStreetHeight(), 1);
        streetWindowYRow.range.value = String(getStreetY());
        streetWindowYRow.number.value = formatFloatFn(getStreetY(), 1);
        streetWindowSpacerToggle.input.checked = !!getStreetSpacerEnabled();
        streetWindowSpacerEveryRow.range.value = String(getStreetSpacerEvery());
        streetWindowSpacerEveryRow.number.value = String(getStreetSpacerEvery());
        streetWindowSpacerWidthRow.range.value = String(getStreetSpacerWidth());
        streetWindowSpacerWidthRow.number.value = formatFloatFn(getStreetSpacerWidth(), 1);
        streetWindowSpacerExtrudeToggle.input.checked = !!getStreetSpacerExtrude();
        streetWindowSpacerExtrudeDistanceRow.range.value = String(getStreetSpacerExtrudeDistance());
        streetWindowSpacerExtrudeDistanceRow.number.value = formatFloatFn(getStreetSpacerExtrudeDistance(), 2);
    };

    let bound = false;
    const handleWindowWidthRangeInput = () => setWindowWidthFromUi(windowWidthRow.range.value);
    const handleWindowWidthNumberInput = () => setWindowWidthFromUi(windowWidthRow.number.value);
    const handleWindowGapRangeInput = () => setWindowGapFromUi(windowGapRow.range.value);
    const handleWindowGapNumberInput = () => setWindowGapFromUi(windowGapRow.number.value);
    const handleWindowHeightRangeInput = () => setWindowHeightFromUi(windowHeightRow.range.value);
    const handleWindowHeightNumberInput = () => setWindowHeightFromUi(windowHeightRow.number.value);
    const handleWindowYRangeInput = () => setWindowYFromUi(windowYRow.range.value);
    const handleWindowYNumberInput = () => setWindowYFromUi(windowYRow.number.value);
    const handleWindowFrameWidthRangeInput = () => setWindowFrameWidthFromUi(windowFrameWidthRow.range.value);
    const handleWindowFrameWidthNumberInput = () => setWindowFrameWidthFromUi(windowFrameWidthRow.number.value);
    const handleWindowSpacerEnabledChange = () => setWindowSpacerEnabledFromUi(windowSpacerToggle.input.checked);
    const handleWindowSpacerEveryRangeInput = () => setWindowSpacerEveryFromUi(windowSpacerEveryRow.range.value);
    const handleWindowSpacerEveryNumberInput = () => setWindowSpacerEveryFromUi(windowSpacerEveryRow.number.value);
    const handleWindowSpacerWidthRangeInput = () => setWindowSpacerWidthFromUi(windowSpacerWidthRow.range.value);
    const handleWindowSpacerWidthNumberInput = () => setWindowSpacerWidthFromUi(windowSpacerWidthRow.number.value);
    const handleWindowSpacerExtrudeChange = () => setWindowSpacerExtrudeFromUi(windowSpacerExtrudeToggle.input.checked);
    const handleWindowSpacerExtrudeDistanceRangeInput = () => setWindowSpacerExtrudeDistanceFromUi(windowSpacerExtrudeDistanceRow.range.value);
    const handleWindowSpacerExtrudeDistanceNumberInput = () => setWindowSpacerExtrudeDistanceFromUi(windowSpacerExtrudeDistanceRow.number.value);

    const handleStreetWindowWidthRangeInput = () => setStreetWindowWidthFromUi(streetWindowWidthRow.range.value);
    const handleStreetWindowWidthNumberInput = () => setStreetWindowWidthFromUi(streetWindowWidthRow.number.value);
    const handleStreetWindowGapRangeInput = () => setStreetWindowGapFromUi(streetWindowGapRow.range.value);
    const handleStreetWindowGapNumberInput = () => setStreetWindowGapFromUi(streetWindowGapRow.number.value);
    const handleStreetWindowHeightRangeInput = () => setStreetWindowHeightFromUi(streetWindowHeightRow.range.value);
    const handleStreetWindowHeightNumberInput = () => setStreetWindowHeightFromUi(streetWindowHeightRow.number.value);
    const handleStreetWindowYRangeInput = () => setStreetWindowYFromUi(streetWindowYRow.range.value);
    const handleStreetWindowYNumberInput = () => setStreetWindowYFromUi(streetWindowYRow.number.value);
    const handleStreetWindowFrameWidthRangeInput = () => setStreetWindowFrameWidthFromUi(streetWindowFrameWidthRow.range.value);
    const handleStreetWindowFrameWidthNumberInput = () => setStreetWindowFrameWidthFromUi(streetWindowFrameWidthRow.number.value);
    const handleStreetWindowSpacerEnabledChange = () => setStreetWindowSpacerEnabledFromUi(streetWindowSpacerToggle.input.checked);
    const handleStreetWindowSpacerEveryRangeInput = () => setStreetWindowSpacerEveryFromUi(streetWindowSpacerEveryRow.range.value);
    const handleStreetWindowSpacerEveryNumberInput = () => setStreetWindowSpacerEveryFromUi(streetWindowSpacerEveryRow.number.value);
    const handleStreetWindowSpacerWidthRangeInput = () => setStreetWindowSpacerWidthFromUi(streetWindowSpacerWidthRow.range.value);
    const handleStreetWindowSpacerWidthNumberInput = () => setStreetWindowSpacerWidthFromUi(streetWindowSpacerWidthRow.number.value);
    const handleStreetWindowSpacerExtrudeChange = () => setStreetWindowSpacerExtrudeFromUi(streetWindowSpacerExtrudeToggle.input.checked);
    const handleStreetWindowSpacerExtrudeDistanceRangeInput = () => setStreetWindowSpacerExtrudeDistanceFromUi(streetWindowSpacerExtrudeDistanceRow.range.value);
    const handleStreetWindowSpacerExtrudeDistanceNumberInput = () => setStreetWindowSpacerExtrudeDistanceFromUi(streetWindowSpacerExtrudeDistanceRow.number.value);

    const bind = () => {
        if (bound) return;
        bound = true;

        windowWidthRow.range.addEventListener('input', handleWindowWidthRangeInput);
        windowWidthRow.number.addEventListener('input', handleWindowWidthNumberInput);
        windowGapRow.range.addEventListener('input', handleWindowGapRangeInput);
        windowGapRow.number.addEventListener('input', handleWindowGapNumberInput);
        windowHeightRow.range.addEventListener('input', handleWindowHeightRangeInput);
        windowHeightRow.number.addEventListener('input', handleWindowHeightNumberInput);
        windowYRow.range.addEventListener('input', handleWindowYRangeInput);
        windowYRow.number.addEventListener('input', handleWindowYNumberInput);
        windowFrameWidthRow.range.addEventListener('input', handleWindowFrameWidthRangeInput);
        windowFrameWidthRow.number.addEventListener('input', handleWindowFrameWidthNumberInput);
        windowSpacerToggle.input.addEventListener('change', handleWindowSpacerEnabledChange);
        windowSpacerEveryRow.range.addEventListener('input', handleWindowSpacerEveryRangeInput);
        windowSpacerEveryRow.number.addEventListener('input', handleWindowSpacerEveryNumberInput);
        windowSpacerWidthRow.range.addEventListener('input', handleWindowSpacerWidthRangeInput);
        windowSpacerWidthRow.number.addEventListener('input', handleWindowSpacerWidthNumberInput);
        windowSpacerExtrudeToggle.input.addEventListener('change', handleWindowSpacerExtrudeChange);
        windowSpacerExtrudeDistanceRow.range.addEventListener('input', handleWindowSpacerExtrudeDistanceRangeInput);
        windowSpacerExtrudeDistanceRow.number.addEventListener('input', handleWindowSpacerExtrudeDistanceNumberInput);

        streetWindowWidthRow.range.addEventListener('input', handleStreetWindowWidthRangeInput);
        streetWindowWidthRow.number.addEventListener('input', handleStreetWindowWidthNumberInput);
        streetWindowGapRow.range.addEventListener('input', handleStreetWindowGapRangeInput);
        streetWindowGapRow.number.addEventListener('input', handleStreetWindowGapNumberInput);
        streetWindowHeightRow.range.addEventListener('input', handleStreetWindowHeightRangeInput);
        streetWindowHeightRow.number.addEventListener('input', handleStreetWindowHeightNumberInput);
        streetWindowYRow.range.addEventListener('input', handleStreetWindowYRangeInput);
        streetWindowYRow.number.addEventListener('input', handleStreetWindowYNumberInput);
        streetWindowFrameWidthRow.range.addEventListener('input', handleStreetWindowFrameWidthRangeInput);
        streetWindowFrameWidthRow.number.addEventListener('input', handleStreetWindowFrameWidthNumberInput);
        streetWindowSpacerToggle.input.addEventListener('change', handleStreetWindowSpacerEnabledChange);
        streetWindowSpacerEveryRow.range.addEventListener('input', handleStreetWindowSpacerEveryRangeInput);
        streetWindowSpacerEveryRow.number.addEventListener('input', handleStreetWindowSpacerEveryNumberInput);
        streetWindowSpacerWidthRow.range.addEventListener('input', handleStreetWindowSpacerWidthRangeInput);
        streetWindowSpacerWidthRow.number.addEventListener('input', handleStreetWindowSpacerWidthNumberInput);
        streetWindowSpacerExtrudeToggle.input.addEventListener('change', handleStreetWindowSpacerExtrudeChange);
        streetWindowSpacerExtrudeDistanceRow.range.addEventListener('input', handleStreetWindowSpacerExtrudeDistanceRangeInput);
        streetWindowSpacerExtrudeDistanceRow.number.addEventListener('input', handleStreetWindowSpacerExtrudeDistanceNumberInput);
    };

    const unbind = () => {
        if (!bound) return;
        bound = false;
        windowWidthRow.range.removeEventListener('input', handleWindowWidthRangeInput);
        windowWidthRow.number.removeEventListener('input', handleWindowWidthNumberInput);
        windowGapRow.range.removeEventListener('input', handleWindowGapRangeInput);
        windowGapRow.number.removeEventListener('input', handleWindowGapNumberInput);
        windowHeightRow.range.removeEventListener('input', handleWindowHeightRangeInput);
        windowHeightRow.number.removeEventListener('input', handleWindowHeightNumberInput);
        windowYRow.range.removeEventListener('input', handleWindowYRangeInput);
        windowYRow.number.removeEventListener('input', handleWindowYNumberInput);
        windowFrameWidthRow.range.removeEventListener('input', handleWindowFrameWidthRangeInput);
        windowFrameWidthRow.number.removeEventListener('input', handleWindowFrameWidthNumberInput);
        windowSpacerToggle.input.removeEventListener('change', handleWindowSpacerEnabledChange);
        windowSpacerEveryRow.range.removeEventListener('input', handleWindowSpacerEveryRangeInput);
        windowSpacerEveryRow.number.removeEventListener('input', handleWindowSpacerEveryNumberInput);
        windowSpacerWidthRow.range.removeEventListener('input', handleWindowSpacerWidthRangeInput);
        windowSpacerWidthRow.number.removeEventListener('input', handleWindowSpacerWidthNumberInput);
        windowSpacerExtrudeToggle.input.removeEventListener('change', handleWindowSpacerExtrudeChange);
        windowSpacerExtrudeDistanceRow.range.removeEventListener('input', handleWindowSpacerExtrudeDistanceRangeInput);
        windowSpacerExtrudeDistanceRow.number.removeEventListener('input', handleWindowSpacerExtrudeDistanceNumberInput);

        streetWindowWidthRow.range.removeEventListener('input', handleStreetWindowWidthRangeInput);
        streetWindowWidthRow.number.removeEventListener('input', handleStreetWindowWidthNumberInput);
        streetWindowGapRow.range.removeEventListener('input', handleStreetWindowGapRangeInput);
        streetWindowGapRow.number.removeEventListener('input', handleStreetWindowGapNumberInput);
        streetWindowHeightRow.range.removeEventListener('input', handleStreetWindowHeightRangeInput);
        streetWindowHeightRow.number.removeEventListener('input', handleStreetWindowHeightNumberInput);
        streetWindowYRow.range.removeEventListener('input', handleStreetWindowYRangeInput);
        streetWindowYRow.number.removeEventListener('input', handleStreetWindowYNumberInput);
        streetWindowFrameWidthRow.range.removeEventListener('input', handleStreetWindowFrameWidthRangeInput);
        streetWindowFrameWidthRow.number.removeEventListener('input', handleStreetWindowFrameWidthNumberInput);
        streetWindowSpacerToggle.input.removeEventListener('change', handleStreetWindowSpacerEnabledChange);
        streetWindowSpacerEveryRow.range.removeEventListener('input', handleStreetWindowSpacerEveryRangeInput);
        streetWindowSpacerEveryRow.number.removeEventListener('input', handleStreetWindowSpacerEveryNumberInput);
        streetWindowSpacerWidthRow.range.removeEventListener('input', handleStreetWindowSpacerWidthRangeInput);
        streetWindowSpacerWidthRow.number.removeEventListener('input', handleStreetWindowSpacerWidthNumberInput);
        streetWindowSpacerExtrudeToggle.input.removeEventListener('change', handleStreetWindowSpacerExtrudeChange);
        streetWindowSpacerExtrudeDistanceRow.range.removeEventListener('input', handleStreetWindowSpacerExtrudeDistanceRangeInput);
        streetWindowSpacerExtrudeDistanceRow.number.removeEventListener('input', handleStreetWindowSpacerExtrudeDistanceNumberInput);
    };

    const dispose = () => {
        unbind();
        windowStyleRow.destroy();
        windowFrameColorRow.destroy();
        windowGlassTopRow.destroy();
        windowGlassBottomRow.destroy();
        streetWindowStyleRow.destroy();
        streetWindowFrameColorRow.destroy();
        streetWindowGlassTopRow.destroy();
        streetWindowGlassBottomRow.destroy();
    };

    const mountFloorsWindowStyle = (parent) => {
        if (!parent) return;
        parent.appendChild(windowStyleRow.row);
    };

    const mountFloorsWindowControls = (parent) => {
        if (!parent) return;
        parent.appendChild(windowWidthRow.row);
        parent.appendChild(windowGapRow.row);
        parent.appendChild(windowHeightRow.row);
        parent.appendChild(windowYRow.row);
        parent.appendChild(windowFrameWidthRow.row);
        parent.appendChild(windowFrameColorRow.row);
        parent.appendChild(windowGlassTopRow.row);
        parent.appendChild(windowGlassBottomRow.row);
        parent.appendChild(windowSpacerToggle.toggle);
        parent.appendChild(windowSpacerEveryRow.row);
        parent.appendChild(windowSpacerWidthRow.row);
        parent.appendChild(windowSpacerExtrudeToggle.toggle);
        parent.appendChild(windowSpacerExtrudeDistanceRow.row);
    };

    const mountStreetWindowStyle = (parent) => {
        if (!parent) return;
        parent.appendChild(streetWindowStyleRow.row);
    };

    const mountStreetWindowControls = (parent) => {
        if (!parent) return;
        parent.appendChild(streetWindowWidthRow.row);
        parent.appendChild(streetWindowGapRow.row);
        parent.appendChild(streetWindowHeightRow.row);
        parent.appendChild(streetWindowYRow.row);
        parent.appendChild(streetWindowFrameWidthRow.row);
        parent.appendChild(streetWindowFrameColorRow.row);
        parent.appendChild(streetWindowGlassTopRow.row);
        parent.appendChild(streetWindowGlassBottomRow.row);
        parent.appendChild(streetWindowSpacerToggle.toggle);
        parent.appendChild(streetWindowSpacerEveryRow.row);
        parent.appendChild(streetWindowSpacerWidthRow.row);
        parent.appendChild(streetWindowSpacerExtrudeToggle.toggle);
        parent.appendChild(streetWindowSpacerExtrudeDistanceRow.row);
    };

    const makeLayerPickerRow = (labelText) => {
        const row = document.createElement('div');
        row.className = 'building-fab-row building-fab-row-texture';
        const label = document.createElement('div');
        label.className = 'building-fab-row-label';
        label.textContent = labelText;
        const picker = document.createElement('div');
        picker.className = 'building-fab-texture-picker building-fab-material-picker';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'building-fab-material-button';
        const thumb = document.createElement('div');
        thumb.className = 'building-fab-material-thumb';
        const text = document.createElement('div');
        text.className = 'building-fab-material-text';
        button.appendChild(thumb);
        button.appendChild(text);
        picker.appendChild(button);
        row.appendChild(label);
        row.appendChild(picker);
        return { row, button, thumb, text };
    };

    const appendLayerWindowsUI = ({
        parent,
        allow = true,
        scopeKey = 'template',
        layerId = 'layer_0',
        layer,
        openMaterialPicker = null,
        textureMaterialOptions = [],
        beltColorMaterialOptions = [],
        getStyleOption = null,
        getBeltColorOption = null,
        onChange = null
    } = {}) => {
        const onChangeFn = typeof onChange === 'function' ? onChange : () => {};
        const styleOptionFn = typeof getStyleOption === 'function' ? getStyleOption : () => null;
        const beltColorOptionFn = typeof getBeltColorOption === 'function' ? getBeltColorOption : () => null;
        const openMaterialPickerFn = typeof openMaterialPicker === 'function' ? openMaterialPicker : null;

        const windowsGroup = createDetailsSection('Windows', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:windows`, detailsOpenByKey });
        const windowsToggle = createToggleRow('Enable windows', { wide: true });
        windowsToggle.input.checked = !!layer?.windows?.enabled;
        windowsToggle.input.disabled = !allow;
        windowsGroup.body.appendChild(windowsToggle.toggle);

        const windowPicker = makeLayerPickerRow('Window type');
        const winTypeId = layer?.windows?.typeId ?? WINDOW_TYPE.STYLE_DEFAULT;
        const winFound = getWindowOption(winTypeId) ?? null;
        const winLabel = winFound?.label ?? winTypeId;
        windowPicker.text.textContent = winLabel;
        thumbTextureFn(windowPicker.thumb, winFound?.previewUrl ?? '', winLabel);
        windowPicker.button.disabled = !allow || !layer?.windows?.enabled;
        windowPicker.button.addEventListener('click', () => {
            if (!pickerPopup) return;
            const options = (windowTypeOptions ?? []).map((opt) => ({
                id: opt.id,
                label: opt.label,
                kind: 'texture',
                previewUrl: opt.previewUrl
            }));
            pickerPopup.open({
                title: 'Window type',
                sections: [{ label: 'Types', options }],
                selectedId: layer?.windows?.typeId || WINDOW_TYPE.STYLE_DEFAULT,
                onSelect: (opt) => {
                    if (!layer?.windows) return;
                    layer.windows.typeId = opt.id;
                    const found = getWindowOption(layer.windows.typeId) ?? null;
                    const label = found?.label ?? layer.windows.typeId;
                    windowPicker.text.textContent = label;
                    thumbTextureFn(windowPicker.thumb, found?.previewUrl ?? '', label);
                    layer.windows.params = { ...getDefaultWindowParams(layer.windows.typeId), ...(layer.windows.params ?? {}) };
                    onChangeFn();
                }
            });
        });
        windowsGroup.body.appendChild(windowPicker.row);

        const winWidthRow = createRangeRow('Window width (m)');
        winWidthRow.range.min = '0.3';
        winWidthRow.range.max = '12';
        winWidthRow.range.step = '0.1';
        winWidthRow.number.min = '0.3';
        winWidthRow.number.max = '12';
        winWidthRow.number.step = '0.1';
        winWidthRow.range.value = String(layer?.windows?.width ?? 2.2);
        winWidthRow.number.value = formatFloatFn(layer?.windows?.width ?? 2.2, 1);
        winWidthRow.range.disabled = !allow || !layer?.windows?.enabled;
        winWidthRow.number.disabled = !allow || !layer?.windows?.enabled;
        winWidthRow.range.addEventListener('input', () => {
            const next = clampFn(winWidthRow.range.value, 0.3, 12.0);
            layer.windows.width = next;
            winWidthRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        winWidthRow.number.addEventListener('change', () => {
            const next = clampFn(winWidthRow.number.value, 0.3, 12.0);
            layer.windows.width = next;
            winWidthRow.range.value = String(next);
            winWidthRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        windowsGroup.body.appendChild(winWidthRow.row);

        const winSpacingRow = createRangeRow('Window spacing (m)');
        winSpacingRow.range.min = '0';
        winSpacingRow.range.max = '24';
        winSpacingRow.range.step = '0.1';
        winSpacingRow.number.min = '0';
        winSpacingRow.number.max = '24';
        winSpacingRow.number.step = '0.1';
        winSpacingRow.range.value = String(layer?.windows?.spacing ?? 1.6);
        winSpacingRow.number.value = formatFloatFn(layer?.windows?.spacing ?? 1.6, 1);
        winSpacingRow.range.disabled = !allow || !layer?.windows?.enabled;
        winSpacingRow.number.disabled = !allow || !layer?.windows?.enabled;
        winSpacingRow.range.addEventListener('input', () => {
            const next = clampFn(winSpacingRow.range.value, 0.0, 24.0);
            layer.windows.spacing = next;
            winSpacingRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        winSpacingRow.number.addEventListener('change', () => {
            const next = clampFn(winSpacingRow.number.value, 0.0, 24.0);
            layer.windows.spacing = next;
            winSpacingRow.range.value = String(next);
            winSpacingRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        windowsGroup.body.appendChild(winSpacingRow.row);

        const winHeightRow = createRangeRow('Window height (m)');
        winHeightRow.range.min = '0.3';
        winHeightRow.range.max = '10';
        winHeightRow.range.step = '0.1';
        winHeightRow.number.min = '0.3';
        winHeightRow.number.max = '10';
        winHeightRow.number.step = '0.1';
        winHeightRow.range.value = String(layer?.windows?.height ?? 1.4);
        winHeightRow.number.value = formatFloatFn(layer?.windows?.height ?? 1.4, 1);
        winHeightRow.range.disabled = !allow || !layer?.windows?.enabled;
        winHeightRow.number.disabled = !allow || !layer?.windows?.enabled;
        winHeightRow.range.addEventListener('input', () => {
            const next = clampFn(winHeightRow.range.value, 0.3, 10.0);
            layer.windows.height = next;
            winHeightRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        winHeightRow.number.addEventListener('change', () => {
            const next = clampFn(winHeightRow.number.value, 0.3, 10.0);
            layer.windows.height = next;
            winHeightRow.range.value = String(next);
            winHeightRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        windowsGroup.body.appendChild(winHeightRow.row);

        const winSillRow = createRangeRow('Sill height (m)');
        winSillRow.range.min = '0';
        winSillRow.range.max = '12';
        winSillRow.range.step = '0.1';
        winSillRow.number.min = '0';
        winSillRow.number.max = '12';
        winSillRow.number.step = '0.1';
        winSillRow.range.value = String(layer?.windows?.sillHeight ?? 1.0);
        winSillRow.number.value = formatFloatFn(layer?.windows?.sillHeight ?? 1.0, 1);
        winSillRow.range.disabled = !allow || !layer?.windows?.enabled;
        winSillRow.number.disabled = !allow || !layer?.windows?.enabled;
        winSillRow.range.addEventListener('input', () => {
            const next = clampFn(winSillRow.range.value, 0.0, 12.0);
            layer.windows.sillHeight = next;
            winSillRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        winSillRow.number.addEventListener('change', () => {
            const next = clampFn(winSillRow.number.value, 0.0, 12.0);
            layer.windows.sillHeight = next;
            winSillRow.range.value = String(next);
            winSillRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        windowsGroup.body.appendChild(winSillRow.row);

        layer.windows.fakeDepth ??= { enabled: false, strength: 0.06, insetStrength: 0.25 };
        const fakeDepthToggle = createToggleRow('Fake depth (parallax)', { wide: true });
        fakeDepthToggle.input.checked = !!layer?.windows?.fakeDepth?.enabled;
        fakeDepthToggle.input.disabled = !allow || !layer?.windows?.enabled;
        windowsGroup.body.appendChild(fakeDepthToggle.toggle);

        const fakeDepthStrengthRow = createRangeRow('Fake depth strength');
        fakeDepthStrengthRow.range.min = '0';
        fakeDepthStrengthRow.range.max = '0.25';
        fakeDepthStrengthRow.range.step = '0.01';
        fakeDepthStrengthRow.number.min = '0';
        fakeDepthStrengthRow.number.max = '0.25';
        fakeDepthStrengthRow.number.step = '0.01';
        fakeDepthStrengthRow.range.value = String(layer?.windows?.fakeDepth?.strength ?? 0.06);
        fakeDepthStrengthRow.number.value = formatFloatFn(layer?.windows?.fakeDepth?.strength ?? 0.06, 2);
        fakeDepthStrengthRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.fakeDepth?.enabled;
        fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
        fakeDepthStrengthRow.range.addEventListener('input', () => {
            const next = clampFn(fakeDepthStrengthRow.range.value, 0.0, 0.25);
            layer.windows.fakeDepth.strength = next;
            fakeDepthStrengthRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        fakeDepthStrengthRow.number.addEventListener('change', () => {
            const next = clampFn(fakeDepthStrengthRow.number.value, 0.0, 0.25);
            layer.windows.fakeDepth.strength = next;
            fakeDepthStrengthRow.range.value = String(next);
            fakeDepthStrengthRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        windowsGroup.body.appendChild(fakeDepthStrengthRow.row);

        const fakeDepthInsetRow = createRangeRow('Inset / recess');
        fakeDepthInsetRow.range.min = '0';
        fakeDepthInsetRow.range.max = '1';
        fakeDepthInsetRow.range.step = '0.01';
        fakeDepthInsetRow.number.min = '0';
        fakeDepthInsetRow.number.max = '1';
        fakeDepthInsetRow.number.step = '0.01';
        fakeDepthInsetRow.range.value = String(layer?.windows?.fakeDepth?.insetStrength ?? 0.25);
        fakeDepthInsetRow.number.value = formatFloatFn(layer?.windows?.fakeDepth?.insetStrength ?? 0.25, 2);
        fakeDepthInsetRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.fakeDepth?.enabled;
        fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
        fakeDepthInsetRow.range.addEventListener('input', () => {
            const next = clampFn(fakeDepthInsetRow.range.value, 0.0, 1.0);
            layer.windows.fakeDepth.insetStrength = next;
            fakeDepthInsetRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        fakeDepthInsetRow.number.addEventListener('change', () => {
            const next = clampFn(fakeDepthInsetRow.number.value, 0.0, 1.0);
            layer.windows.fakeDepth.insetStrength = next;
            fakeDepthInsetRow.range.value = String(next);
            fakeDepthInsetRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        windowsGroup.body.appendChild(fakeDepthInsetRow.row);

        const columnsGroup = createDetailsSection('Space columns', { open: false, nested: true, key: `${scopeKey}:layer:${layerId}:space_columns`, detailsOpenByKey });
        const colsToggle = createToggleRow('Enable space columns', { wide: true });
        colsToggle.input.checked = !!layer?.windows?.spaceColumns?.enabled;
        colsToggle.input.disabled = !allow || !layer?.windows?.enabled;
        columnsGroup.body.appendChild(colsToggle.toggle);

        const colsEveryRow = createRangeRow('Every N windows');
        colsEveryRow.range.min = '1';
        colsEveryRow.range.max = '99';
        colsEveryRow.range.step = '1';
        colsEveryRow.number.min = '1';
        colsEveryRow.number.max = '99';
        colsEveryRow.number.step = '1';
        colsEveryRow.range.value = String(layer?.windows?.spaceColumns?.every ?? 4);
        colsEveryRow.number.value = String(layer?.windows?.spaceColumns?.every ?? 4);
        colsEveryRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
        colsEveryRow.number.disabled = colsEveryRow.range.disabled;
        colsEveryRow.range.addEventListener('input', () => {
            const next = clampIntFn(colsEveryRow.range.value, 1, 99);
            layer.windows.spaceColumns.every = next;
            colsEveryRow.number.value = String(next);
            onChangeFn();
        });
        colsEveryRow.number.addEventListener('change', () => {
            const next = clampIntFn(colsEveryRow.number.value, 1, 99);
            layer.windows.spaceColumns.every = next;
            colsEveryRow.range.value = String(next);
            colsEveryRow.number.value = String(next);
            onChangeFn();
        });
        columnsGroup.body.appendChild(colsEveryRow.row);

        const colsWidthRow = createRangeRow('Column width (m)');
        colsWidthRow.range.min = '0.1';
        colsWidthRow.range.max = '10';
        colsWidthRow.range.step = '0.1';
        colsWidthRow.number.min = '0.1';
        colsWidthRow.number.max = '10';
        colsWidthRow.number.step = '0.1';
        colsWidthRow.range.value = String(layer?.windows?.spaceColumns?.width ?? 0.9);
        colsWidthRow.number.value = formatFloatFn(layer?.windows?.spaceColumns?.width ?? 0.9, 1);
        colsWidthRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
        colsWidthRow.number.disabled = colsWidthRow.range.disabled;
        colsWidthRow.range.addEventListener('input', () => {
            const next = clampFn(colsWidthRow.range.value, 0.1, 10.0);
            layer.windows.spaceColumns.width = next;
            colsWidthRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        colsWidthRow.number.addEventListener('change', () => {
            const next = clampFn(colsWidthRow.number.value, 0.1, 10.0);
            layer.windows.spaceColumns.width = next;
            colsWidthRow.range.value = String(next);
            colsWidthRow.number.value = formatFloatFn(next, 1);
            onChangeFn();
        });
        columnsGroup.body.appendChild(colsWidthRow.row);

        const colsMaterialPicker = makeLayerPickerRow('Column material');
        const colsMaterial = layer?.windows?.spaceColumns?.material ?? { kind: 'color', id: BELT_COURSE_COLOR.OFFWHITE };
        if (colsMaterial?.kind === 'texture') {
            const styleId = typeof colsMaterial.id === 'string' && colsMaterial.id ? colsMaterial.id : BUILDING_STYLE.DEFAULT;
            const found = styleOptionFn(styleId) ?? null;
            const label = found?.label ?? styleId;
            colsMaterialPicker.text.textContent = label;
            thumbTextureFn(colsMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
        } else {
            const colorId = typeof colsMaterial?.id === 'string' && colsMaterial.id ? colsMaterial.id : BELT_COURSE_COLOR.OFFWHITE;
            const found = beltColorOptionFn(colorId) ?? null;
            const label = found?.label ?? colorId;
            colsMaterialPicker.text.textContent = label;
            thumbColorFn(colsMaterialPicker.thumb, found?.hex ?? 0xffffff);
        }
        colsMaterialPicker.button.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
        colsMaterialPicker.button.addEventListener('click', () => {
            if (!openMaterialPickerFn) return;
            openMaterialPickerFn({
                title: 'Column material',
                material: layer.windows.spaceColumns.material ?? colsMaterial,
                textureOptions: textureMaterialOptions,
                colorOptions: beltColorMaterialOptions,
                onSelect: (spec) => {
                    layer.windows.spaceColumns.material = spec;
                    if (spec.kind === 'color') {
                        const found = beltColorOptionFn(spec.id) ?? null;
                        const label = found?.label ?? spec.id;
                        colsMaterialPicker.text.textContent = label;
                        thumbColorFn(colsMaterialPicker.thumb, found?.hex ?? 0xffffff);
                    } else {
                        const found = styleOptionFn(spec.id) ?? null;
                        const label = found?.label ?? spec.id;
                        colsMaterialPicker.text.textContent = label;
                        thumbTextureFn(colsMaterialPicker.thumb, found?.wallTextureUrl ?? '', label);
                    }
                    onChangeFn();
                }
            });
        });
        columnsGroup.body.appendChild(colsMaterialPicker.row);

        const colsExtrudeToggle = createToggleRow('Extrude columns', { wide: true });
        colsExtrudeToggle.input.checked = !!layer?.windows?.spaceColumns?.extrude;
        colsExtrudeToggle.input.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled;
        columnsGroup.body.appendChild(colsExtrudeToggle.toggle);

        const colsExtrudeRow = createRangeRow('Extrude distance (m)');
        colsExtrudeRow.range.min = '0';
        colsExtrudeRow.range.max = '1';
        colsExtrudeRow.range.step = '0.01';
        colsExtrudeRow.number.min = '0';
        colsExtrudeRow.number.max = '1';
        colsExtrudeRow.number.step = '0.01';
        colsExtrudeRow.range.value = String(layer?.windows?.spaceColumns?.extrudeDistance ?? 0.12);
        colsExtrudeRow.number.value = formatFloatFn(layer?.windows?.spaceColumns?.extrudeDistance ?? 0.12, 2);
        colsExtrudeRow.range.disabled = !allow || !layer?.windows?.enabled || !layer?.windows?.spaceColumns?.enabled || !layer?.windows?.spaceColumns?.extrude;
        colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
        colsExtrudeRow.range.addEventListener('input', () => {
            const next = clampFn(colsExtrudeRow.range.value, 0.0, 1.0);
            layer.windows.spaceColumns.extrudeDistance = next;
            colsExtrudeRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        colsExtrudeRow.number.addEventListener('change', () => {
            const next = clampFn(colsExtrudeRow.number.value, 0.0, 1.0);
            layer.windows.spaceColumns.extrudeDistance = next;
            colsExtrudeRow.range.value = String(next);
            colsExtrudeRow.number.value = formatFloatFn(next, 2);
            onChangeFn();
        });
        columnsGroup.body.appendChild(colsExtrudeRow.row);

        colsToggle.input.addEventListener('change', () => {
            layer.windows.spaceColumns.enabled = !!colsToggle.input.checked;
            const enabled = layer.windows.enabled && layer.windows.spaceColumns.enabled;
            colsEveryRow.range.disabled = !allow || !enabled;
            colsEveryRow.number.disabled = colsEveryRow.range.disabled;
            colsWidthRow.range.disabled = !allow || !enabled;
            colsWidthRow.number.disabled = colsWidthRow.range.disabled;
            colsMaterialPicker.button.disabled = !allow || !enabled;
            colsExtrudeToggle.input.disabled = !allow || !enabled;
            colsExtrudeRow.range.disabled = !allow || !enabled || !layer.windows.spaceColumns.extrude;
            colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
            onChangeFn();
        });

        colsExtrudeToggle.input.addEventListener('change', () => {
            layer.windows.spaceColumns.extrude = !!colsExtrudeToggle.input.checked;
            const enabled = layer.windows.enabled && layer.windows.spaceColumns.enabled && layer.windows.spaceColumns.extrude;
            colsExtrudeRow.range.disabled = !allow || !enabled;
            colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
            onChangeFn();
        });

        fakeDepthToggle.input.addEventListener('change', () => {
            layer.windows.fakeDepth.enabled = !!fakeDepthToggle.input.checked;
            const enabled = layer.windows.enabled && layer.windows.fakeDepth.enabled;
            fakeDepthStrengthRow.range.disabled = !allow || !enabled;
            fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
            fakeDepthInsetRow.range.disabled = !allow || !enabled;
            fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
            onChangeFn();
        });

        windowsToggle.input.addEventListener('change', () => {
            layer.windows.enabled = !!windowsToggle.input.checked;
            const winEnabled = layer.windows.enabled;
            windowPicker.button.disabled = !allow || !winEnabled;
            winWidthRow.range.disabled = !allow || !winEnabled;
            winWidthRow.number.disabled = winWidthRow.range.disabled;
            winSpacingRow.range.disabled = !allow || !winEnabled;
            winSpacingRow.number.disabled = winSpacingRow.range.disabled;
            winHeightRow.range.disabled = !allow || !winEnabled;
            winHeightRow.number.disabled = winHeightRow.range.disabled;
            winSillRow.range.disabled = !allow || !winEnabled;
            winSillRow.number.disabled = winSillRow.range.disabled;
            fakeDepthToggle.input.disabled = !allow || !winEnabled;
            const fakeEnabled = winEnabled && layer.windows.fakeDepth.enabled;
            fakeDepthStrengthRow.range.disabled = !allow || !fakeEnabled;
            fakeDepthStrengthRow.number.disabled = fakeDepthStrengthRow.range.disabled;
            fakeDepthInsetRow.range.disabled = !allow || !fakeEnabled;
            fakeDepthInsetRow.number.disabled = fakeDepthInsetRow.range.disabled;
            colsToggle.input.disabled = !allow || !winEnabled;
            const colsEnabled = winEnabled && layer.windows.spaceColumns.enabled;
            colsEveryRow.range.disabled = !allow || !colsEnabled;
            colsEveryRow.number.disabled = colsEveryRow.range.disabled;
            colsWidthRow.range.disabled = !allow || !colsEnabled;
            colsWidthRow.number.disabled = colsWidthRow.range.disabled;
            colsMaterialPicker.button.disabled = !allow || !colsEnabled;
            colsExtrudeToggle.input.disabled = !allow || !colsEnabled;
            colsExtrudeRow.range.disabled = !allow || !colsEnabled || !layer.windows.spaceColumns.extrude;
            colsExtrudeRow.number.disabled = colsExtrudeRow.range.disabled;
            onChangeFn();
        });

        if (parent) {
            parent.appendChild(windowsGroup.details);
            parent.appendChild(columnsGroup.details);
        }

        return { windowsGroup, columnsGroup };
    };

    return {
        mountFloorsWindowStyle,
        mountFloorsWindowControls,
        mountStreetWindowStyle,
        mountStreetWindowControls,
        appendLayerWindowsUI,
        sync,
        bind,
        unbind,
        destroy: dispose,
        dispose
    };
}
