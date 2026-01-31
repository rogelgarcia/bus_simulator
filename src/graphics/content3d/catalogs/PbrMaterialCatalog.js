// src/graphics/content3d/catalogs/PbrMaterialCatalog.js
// Defines a stable registry of imported PBR materials (URLs + building eligibility).
import { getPbrAssetsEnabled } from '../materials/PbrAssetsRuntime.js';

const PBR_ID_PREFIX = 'pbr.';

const PBR_BASE_URL = new URL('../../../../assets/public/pbr/', import.meta.url);

const MAPS = Object.freeze({
    baseColor: 'basecolor.jpg',
    normal: 'normal_gl.png',
    orm: 'arm.png'
});

const DEFAULT_TILE_METERS_BY_ROOT = Object.freeze({
    wall: 4.0,
    surface: 4.0
});

const DEFAULT_VARIANT = '1k';

const MATERIAL_META_OVERRIDES = Object.freeze({});

const _previewUrlCache = new Map();

function toTitle(slug) {
    return String(slug || '')
        .split('_')
        .filter(Boolean)
        .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
        .join(' ');
}

function makeId(slug) {
    return `${PBR_ID_PREFIX}${slug}`;
}

function normalizeRoot(value) {
    return value === 'surface' ? 'surface' : 'wall';
}

function normalizeVariant(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return id ? id : null;
}

function normalizeMapFiles(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const out = {};
    const add = (key) => {
        const v = typeof src[key] === 'string' ? src[key].trim() : '';
        if (!v) return;
        out[key] = v;
    };

    add('baseColor');
    add('normal');
    add('orm');
    add('ao');
    add('roughness');
    add('metalness');
    add('displacement');

    return Object.keys(out).length ? out : null;
}

function makePreviewUrl({ id, label }) {
    if (typeof document === 'undefined') return null;
    const slug = String(id || '').startsWith(PBR_ID_PREFIX) ? String(id).slice(PBR_ID_PREFIX.length) : String(id || '');
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const seed = Array.from(slug).reduce((sum, ch) => (sum * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    const hue = (seed % 360) / 360;
    const sat = 0.45;
    const light = 0.55;

    ctx.fillStyle = `hsl(${Math.round(hue * 360)}, ${Math.round(sat * 100)}%, ${Math.round(light * 100)}%)`;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(size * 0.5, size * 0.5);
    ctx.rotate(-Math.PI / 6);
    ctx.translate(-size * 0.5, -size * 0.5);
    ctx.fillStyle = '#000';
    for (let i = -size; i < size * 2; i += 12) {
        ctx.fillRect(i, 0, 6, size);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, size - 22, size, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label || '').slice(0, 16), 6, size - 11);

    try {
        return c.toDataURL('image/png');
    } catch {
        return null;
    }
}

function getCachedPreviewUrl({ id, label }) {
    const key = `${String(id || '')}|${String(label || '')}`;
    if (_previewUrlCache.has(key)) return _previewUrlCache.get(key) ?? null;
    const url = makePreviewUrl({ id, label });
    _previewUrlCache.set(key, url);
    return url;
}

const MATERIALS = Object.freeze([
    Object.freeze({ id: makeId('asphalt_02'), label: 'Asphalt 02', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('brick_crosswalk'), label: 'Brick Crosswalk', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('clay_roof_tiles_02'), label: 'Clay Roof Tiles 02', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('coast_sand_rocks_02'), label: 'Coast Sand Rocks 02', root: 'surface', buildingEligible: false, groundEligible: true }),
    Object.freeze({ id: makeId('forrest_ground_01'), label: 'Forest Ground 01', root: 'surface', buildingEligible: false, groundEligible: true }),
    Object.freeze({ id: makeId('gravelly_sand'), label: 'Gravelly Sand', root: 'surface', buildingEligible: false, groundEligible: true }),
    Object.freeze({
        id: makeId('grass_001'),
        label: 'Grass 001',
        root: 'surface',
        buildingEligible: false,
        groundEligible: true,
        mapFiles: Object.freeze({
            baseColor: 'basecolor.png',
            normal: 'normal_gl.png',
            ao: 'ao.png',
            roughness: 'roughness.png',
            displacement: 'displacement.png'
        })
    }),
    Object.freeze({
        id: makeId('grass_004'),
        label: 'Grass 004',
        root: 'surface',
        buildingEligible: false,
        groundEligible: true,
        mapFiles: Object.freeze({
            baseColor: 'basecolor.png',
            normal: 'normal_gl.png',
            ao: 'ao.png',
            roughness: 'roughness.png',
            displacement: 'displacement.png'
        })
    }),
    Object.freeze({
        id: makeId('grass_005'),
        label: 'Grass 005',
        root: 'surface',
        buildingEligible: false,
        groundEligible: true,
        mapFiles: Object.freeze({
            baseColor: 'basecolor.png',
            normal: 'normal_gl.png',
            ao: 'ao.png',
            roughness: 'roughness.png',
            displacement: 'displacement.png'
        })
    }),
    Object.freeze({
        id: makeId('ground_037'),
        label: 'Ground 037',
        root: 'surface',
        buildingEligible: false,
        groundEligible: true,
        mapFiles: Object.freeze({
            baseColor: 'basecolor.png',
            normal: 'normal_gl.png',
            ao: 'ao.png',
            roughness: 'roughness.png',
            displacement: 'displacement.png'
        })
    }),
    Object.freeze({ id: makeId('patterned_concrete_pavers'), label: 'Patterned Concrete Pavers', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('patterned_paving'), label: 'Patterned Paving', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('red_slate_roof_tiles_01'), label: 'Red Slate Roof Tiles 01', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('rocky_terrain_02'), label: 'Rocky Terrain 02', root: 'surface', buildingEligible: false, groundEligible: true }),

    Object.freeze({ id: makeId('brick_wall_11'), label: 'Brick Wall 11', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('brick_wall_13'), label: 'Brick Wall 13', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('concrete'), label: 'Concrete', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('concrete_layers_02'), label: 'Concrete Layers 02', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('corrugated_iron_02'), label: 'Corrugated Iron 02', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('exterior_wall_cladding'), label: 'Exterior Wall Cladding', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('metal_plate'), label: 'Metal Plate', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('painted_brick'), label: 'Painted Brick', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('painted_plaster_wall'), label: 'Painted Plaster Wall', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('patterned_concrete_wall'), label: 'Patterned Concrete Wall', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('plaster_brick_pattern'), label: 'Plaster Brick Pattern', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('plastered_wall_02'), label: 'Plastered Wall 02', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('plastered_wall_04'), label: 'Plastered Wall 04', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('plastered_wall_05'), label: 'Plastered Wall 05', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('red_brick'), label: 'Red Brick', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('rock_wall_16'), label: 'Rock Wall 16', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('rough_concrete'), label: 'Rough Concrete', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('rustic_stone_wall_02'), label: 'Rustic Stone Wall 02', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('rusty_metal_shutter'), label: 'Rusty Metal Shutter', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('seaworn_sandstone_brick'), label: 'Seaworn Sandstone Brick', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('whitewashed_brick'), label: 'Whitewashed Brick', root: 'wall', buildingEligible: true }),
    Object.freeze({ id: makeId('worn_mossy_plasterwall'), label: 'Worn Mossy Plasterwall', root: 'wall', buildingEligible: true })
]);

const MATERIAL_BY_ID = new Map(MATERIALS.map((entry) => [entry.id, entry]));

export function isPbrMaterialId(materialId) {
    const id = typeof materialId === 'string' ? materialId : '';
    return MATERIAL_BY_ID.has(id);
}

export function getPbrMaterialDefinition(materialId) {
    const id = typeof materialId === 'string' ? materialId : '';
    return MATERIAL_BY_ID.get(id) ?? null;
}

export function getPbrMaterialExplicitTileMeters(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return null;

    const override = MATERIAL_META_OVERRIDES[def.id] ?? null;
    const candidate = Number.isFinite(override?.tileMeters) ? override.tileMeters : def.tileMeters;
    const tile = Number(candidate);
    if (Number.isFinite(tile) && tile > 0) return tile;
    return null;
}

export function getPbrMaterialMeta(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return null;

    const root = normalizeRoot(def.root);
    const override = MATERIAL_META_OVERRIDES[def.id] ?? null;

    const tileCandidate = Number.isFinite(override?.tileMeters) ? override.tileMeters : def.tileMeters;
    const fallbackTile = DEFAULT_TILE_METERS_BY_ROOT[root] ?? 1.0;
    const tileMeters = (Number.isFinite(tileCandidate) && tileCandidate > 0) ? tileCandidate : fallbackTile;

    const preferredCandidate = normalizeVariant(override?.preferredVariant ?? def.preferredVariant);
    const preferredVariant = preferredCandidate ?? DEFAULT_VARIANT;

    const variantsRaw = Array.isArray(override?.variants) ? override.variants : (Array.isArray(def.variants) ? def.variants : null);
    const variants = variantsRaw
        ? variantsRaw.map((v) => normalizeVariant(v)).filter(Boolean)
        : [preferredVariant];
    if (!variants.includes(preferredVariant)) variants.unshift(preferredVariant);

    const mapFiles = normalizeMapFiles(override?.mapFiles ?? def.mapFiles) ?? null;
    const maps = Object.keys(mapFiles ?? MAPS);

    return {
        id: def.id,
        label: getPbrMaterialLabel(def.id),
        root,
        buildingEligible: !!def.buildingEligible,
        groundEligible: !!def.groundEligible,
        tileMeters,
        preferredVariant,
        variants,
        maps
    };
}

export function getPbrMaterialTileMeters(materialId) {
    const meta = getPbrMaterialMeta(materialId);
    const t = Number(meta?.tileMeters);
    if (Number.isFinite(t) && t > 0) return t;
    const def = getPbrMaterialDefinition(materialId);
    const root = normalizeRoot(def?.root);
    return DEFAULT_TILE_METERS_BY_ROOT[root] ?? 1.0;
}

export function computePbrMaterialTextureRepeat(materialId, { uvSpace = 'meters', surfaceSizeMeters = null } = {}) {
    const tileMeters = getPbrMaterialTileMeters(materialId);
    const tile = Number(tileMeters);
    const safeTile = (Number.isFinite(tile) && tile > 0) ? tile : 1.0;

    if (uvSpace === 'unit') {
        const size = surfaceSizeMeters && typeof surfaceSizeMeters === 'object' ? surfaceSizeMeters : null;
        const sx = Number(size?.x);
        const sy = Number(size?.y);
        if (!(Number.isFinite(sx) && sx > 0) || !(Number.isFinite(sy) && sy > 0)) return { x: 1, y: 1 };
        return { x: sx / safeTile, y: sy / safeTile };
    }

    const rep = 1 / safeTile;
    return { x: rep, y: rep };
}

export function getPbrMaterialLabel(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return typeof materialId === 'string' ? materialId : '';
    return def.label || toTitle(def.id.slice(PBR_ID_PREFIX.length));
}

export function tryGetPbrMaterialIdFromUrl(url) {
    const raw = typeof url === 'string' ? url : '';
    if (!raw) return null;
    const marker = '/assets/public/pbr/';
    const idx = raw.indexOf(marker);
    if (idx < 0) return null;
    const rest = raw.slice(idx + marker.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return null;
    const slug = rest.slice(0, slash);
    if (!slug) return null;
    const id = makeId(slug);
    return isPbrMaterialId(id) ? id : null;
}

export function resolvePbrMaterialUrls(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) {
        return {
            baseColorUrl: null,
            normalUrl: null,
            ormUrl: null,
            aoUrl: null,
            roughnessUrl: null,
            metalnessUrl: null,
            displacementUrl: null
        };
    }
    if (!getPbrAssetsEnabled()) {
        return {
            baseColorUrl: null,
            normalUrl: null,
            ormUrl: null,
            aoUrl: null,
            roughnessUrl: null,
            metalnessUrl: null,
            displacementUrl: null
        };
    }
    const dir = new URL(`${def.id.slice(PBR_ID_PREFIX.length)}/`, PBR_BASE_URL);

    const files = normalizeMapFiles(def.mapFiles) ?? MAPS;
    const urlOrNull = (file) => {
        const f = typeof file === 'string' ? file.trim() : '';
        return f ? new URL(f, dir).toString() : null;
    };

    return {
        baseColorUrl: urlOrNull(files.baseColor),
        normalUrl: urlOrNull(files.normal),
        ormUrl: urlOrNull(files.orm),
        aoUrl: urlOrNull(files.ao),
        roughnessUrl: urlOrNull(files.roughness),
        metalnessUrl: urlOrNull(files.metalness),
        displacementUrl: urlOrNull(files.displacement)
    };
}

export function getPbrMaterialOptions() {
    return MATERIALS.map((entry) => {
        const meta = getPbrMaterialMeta(entry.id);
        const label = entry.label || toTitle(entry.id.slice(PBR_ID_PREFIX.length));
        const urls = resolvePbrMaterialUrls(entry.id);
        const previewUrl = urls.baseColorUrl ?? getCachedPreviewUrl({ id: entry.id, label });
        return {
            id: entry.id,
            label,
            previewUrl,
            root: entry.root,
            buildingEligible: !!entry.buildingEligible,
            groundEligible: !!entry.groundEligible,
            tileMeters: meta?.tileMeters ?? null,
            preferredVariant: meta?.preferredVariant ?? null,
            variants: meta?.variants ?? null,
            maps: meta?.maps ?? null
        };
    });
}

export function getPbrMaterialOptionsForBuildings() {
    return getPbrMaterialOptions().filter((entry) => (
        entry.buildingEligible && !String(entry.id).toLowerCase().includes('grass')
    ));
}

export function getPbrMaterialOptionsForGround() {
    return getPbrMaterialOptions().filter((entry) => entry.groundEligible);
}

export function isPbrBuildingWallMaterialId(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return false;
    if (String(def.id).toLowerCase().includes('grass')) return false;
    return !!def.buildingEligible;
}
