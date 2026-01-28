// src/app/city/buildings/BuildingConfigExport.js
// Helpers for exporting building fabrication layers as city building config modules.
import { BUILDING_STYLE, isBuildingStyle } from '../../buildings/BuildingStyle.js';
import { LAYER_TYPE, normalizeBuildingLayers, normalizeBuildingWindowVisualsConfig } from '../../../graphics/assets3d/generators/building_fabrication/BuildingFabricationTypes.js';

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function indentLines(text, spaces) {
    const pad = ' '.repeat(Math.max(0, spaces | 0));
    return String(text)
        .split('\n')
        .map((line) => (line ? pad + line : line))
        .join('\n');
}

export function sanitizeBuildingConfigId(raw, { fallback = 'building_config' } = {}) {
    const base = typeof raw === 'string' ? raw.trim() : '';
    let id = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) id = typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'building_config';
    if (/^[0-9]/.test(id)) id = `building_${id}`;
    return id;
}

export function sanitizeBuildingConfigName(raw, { fallback = 'Building config' } = {}) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name) return name;
    return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Building config';
}

export function buildingConfigIdToDisplayName(id) {
    const safe = sanitizeBuildingConfigId(id);
    const label = safe.replace(/_+/g, ' ').trim();
    if (!label) return 'Building config';
    const lower = label.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function buildingConfigIdToConstName(id) {
    const safe = sanitizeBuildingConfigId(id);
    const base = safe.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const prefix = base && !/^[0-9]/.test(base) ? base : `BUILDING_${base || 'CONFIG'}`;
    return `${prefix}_BUILDING_CONFIG`;
}

export function buildingConfigIdToFileBaseName(id) {
    const safe = sanitizeBuildingConfigId(id);
    const parts = safe.split(/[^a-z0-9]+/i).filter(Boolean);
    if (!parts.length) return 'BuildingConfig';
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function deriveLegacyFieldsFromLayers(layers) {
    const list = Array.isArray(layers) ? layers : [];
    const floorLayers = list.filter((layer) => layer?.type === LAYER_TYPE.FLOOR);
    const firstFloor = floorLayers[0] ?? null;
    const totalFloors = floorLayers.reduce((sum, layer) => sum + clampInt(layer?.floors ?? 0, 0, 99), 0);

    const floors = clampInt(totalFloors || 1, 1, 30);
    const floorHeight = clamp(firstFloor?.floorHeight ?? 3, 1.0, 12.0);

    const styleRaw = firstFloor?.style;
    const style = isBuildingStyle(styleRaw) ? styleRaw : BUILDING_STYLE.DEFAULT;

    const win = firstFloor?.windows ?? null;
    const windowsEnabled = !!win?.enabled;
    const windows = windowsEnabled ? {
        width: clamp(win?.width ?? 2.2, 0.3, 12.0),
        gap: clamp(win?.spacing ?? 1.6, 0.0, 24.0),
        height: clamp(win?.height ?? 1.4, 0.3, 10.0),
        y: clamp(win?.sillHeight ?? 1.0, 0.0, 12.0)
    } : null;

    return { floors, floorHeight, style, windows };
}

export function createCityBuildingConfigFromFabrication({
    id,
    name,
    layers,
    wallInset = 0.0,
    materialVariationSeed = null,
    windowVisuals = null
} = {}) {
    const safeId = sanitizeBuildingConfigId(id);
    const safeName = sanitizeBuildingConfigName(name, { fallback: buildingConfigIdToDisplayName(safeId) });
    const safeLayers = normalizeBuildingLayers(layers);
    const { floors, floorHeight, style, windows } = deriveLegacyFieldsFromLayers(safeLayers);

    const inset = clamp(wallInset, 0.0, 4.0);
    const seed = Number.isFinite(materialVariationSeed) ? clampInt(materialVariationSeed, 0, 4294967295) : null;
    const cfg = {
        id: safeId,
        name: safeName,
        layers: safeLayers,
        floors,
        floorHeight,
        style,
        windows
    };

    if (inset > 1e-6) cfg.wallInset = inset;
    if (seed !== null) cfg.materialVariationSeed = seed;
    if (windowVisuals && typeof windowVisuals === 'object') cfg.windowVisuals = normalizeBuildingWindowVisualsConfig(windowVisuals);
    return cfg;
}

export function serializeCityBuildingConfigToEsModule(config, { exportConstName = null, fileBaseName = null } = {}) {
    const cfg = config && typeof config === 'object' ? config : {};
    const id = sanitizeBuildingConfigId(cfg.id);
    const name = sanitizeBuildingConfigName(cfg.name, { fallback: buildingConfigIdToDisplayName(id) });
    const constName = typeof exportConstName === 'string' && exportConstName.trim()
        ? exportConstName.trim()
        : buildingConfigIdToConstName(id);
    const baseName = typeof fileBaseName === 'string' && fileBaseName.trim()
        ? fileBaseName.trim()
        : buildingConfigIdToFileBaseName(id);

    const layersJson = JSON.stringify(cfg.layers ?? [], null, 4);
    const layersBlock = indentLines(layersJson, 8);

    const windows = cfg.windows && typeof cfg.windows === 'object' ? cfg.windows : null;
    const windowsLines = windows ? [
        '    windows: Object.freeze({',
        `        width: ${clamp(windows.width, 0.3, 12.0)},`,
        `        gap: ${clamp(windows.gap, 0.0, 24.0)},`,
        `        height: ${clamp(windows.height, 0.3, 10.0)},`,
        `        y: ${clamp(windows.y, 0.0, 12.0)}`,
        '    }),'
    ] : ['    windows: null,'];

    const wallInset = Number.isFinite(cfg.wallInset) ? clamp(cfg.wallInset, 0.0, 4.0) : null;
    const seed = Number.isFinite(cfg.materialVariationSeed) ? clampInt(cfg.materialVariationSeed, 0, 4294967295) : null;
    const windowVisuals = cfg.windowVisuals && typeof cfg.windowVisuals === 'object' ? cfg.windowVisuals : null;
    const windowVisualsLines = windowVisuals ? [
        '    windowVisuals: Object.freeze(',
        indentLines(JSON.stringify(windowVisuals, null, 4), 8),
        '    ),'
    ] : [];

    const lines = [
        `// src/graphics/content3d/buildings/configs/${baseName}.js`,
        `// City building config: ${name}.`,
        `export const ${constName} = Object.freeze({`,
        `    id: ${JSON.stringify(id)},`,
        `    name: ${JSON.stringify(name)},`,
        '    layers: Object.freeze(',
        layersBlock,
        '    ),',
        ...(wallInset !== null && wallInset > 1e-6 ? [`    wallInset: ${wallInset},`] : []),
        ...(seed !== null ? [`    materialVariationSeed: ${seed},`] : []),
        `    floors: ${clampInt(cfg.floors ?? 1, 1, 30)},`,
        `    floorHeight: ${clamp(cfg.floorHeight ?? 3, 1.0, 12.0)},`,
        `    style: ${JSON.stringify(isBuildingStyle(cfg.style) ? cfg.style : BUILDING_STYLE.DEFAULT)},`,
        ...windowsLines,
        ...windowVisualsLines,
        '});',
        '',
        `export default ${constName};`,
        ''
    ];

    return lines.join('\n');
}
