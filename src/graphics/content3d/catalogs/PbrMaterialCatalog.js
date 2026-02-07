// src/graphics/content3d/catalogs/PbrMaterialCatalog.js
// Defines a stable registry of imported PBR materials (URLs + building eligibility).
import { getPbrAssetsEnabled } from '../materials/PbrAssetsRuntime.js';
import { PBR_MATERIAL_CATALOG } from '../../../../assets/public/pbr/_catalog_index.js';

const PBR_ID_PREFIX = 'pbr.';

const PBR_BASE_URL = new URL('../../../../assets/public/pbr/', import.meta.url);

export const PBR_MATERIAL_CLASS = Object.freeze({
    ASPHALT: 'asphalt',
    CONCRETE: 'concrete',
    BRICK: 'brick',
    PLASTER_STUCCO: 'plaster_stucco',
    STONE: 'stone',
    METAL: 'metal',
    ROOF_TILES: 'roof_tiles',
    PAVERS: 'pavers',
    GRASS: 'grass',
    GROUND: 'ground'
});

const PBR_MATERIAL_CLASS_META = Object.freeze({
    [PBR_MATERIAL_CLASS.ASPHALT]: Object.freeze({ id: PBR_MATERIAL_CLASS.ASPHALT, label: 'Asphalt' }),
    [PBR_MATERIAL_CLASS.CONCRETE]: Object.freeze({ id: PBR_MATERIAL_CLASS.CONCRETE, label: 'Concrete' }),
    [PBR_MATERIAL_CLASS.BRICK]: Object.freeze({ id: PBR_MATERIAL_CLASS.BRICK, label: 'Brick' }),
    [PBR_MATERIAL_CLASS.PLASTER_STUCCO]: Object.freeze({ id: PBR_MATERIAL_CLASS.PLASTER_STUCCO, label: 'Plaster / Stucco' }),
    [PBR_MATERIAL_CLASS.STONE]: Object.freeze({ id: PBR_MATERIAL_CLASS.STONE, label: 'Stone' }),
    [PBR_MATERIAL_CLASS.METAL]: Object.freeze({ id: PBR_MATERIAL_CLASS.METAL, label: 'Metal' }),
    [PBR_MATERIAL_CLASS.ROOF_TILES]: Object.freeze({ id: PBR_MATERIAL_CLASS.ROOF_TILES, label: 'Roof Tiles' }),
    [PBR_MATERIAL_CLASS.PAVERS]: Object.freeze({ id: PBR_MATERIAL_CLASS.PAVERS, label: 'Pavers' }),
    [PBR_MATERIAL_CLASS.GRASS]: Object.freeze({ id: PBR_MATERIAL_CLASS.GRASS, label: 'Grass' }),
    [PBR_MATERIAL_CLASS.GROUND]: Object.freeze({ id: PBR_MATERIAL_CLASS.GROUND, label: 'Ground' })
});

const PBR_MATERIAL_CLASS_ORDER = Object.freeze([
    PBR_MATERIAL_CLASS.ASPHALT,
    PBR_MATERIAL_CLASS.CONCRETE,
    PBR_MATERIAL_CLASS.BRICK,
    PBR_MATERIAL_CLASS.PLASTER_STUCCO,
    PBR_MATERIAL_CLASS.STONE,
    PBR_MATERIAL_CLASS.METAL,
    PBR_MATERIAL_CLASS.ROOF_TILES,
    PBR_MATERIAL_CLASS.PAVERS,
    PBR_MATERIAL_CLASS.GRASS,
    PBR_MATERIAL_CLASS.GROUND
]);

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

function normalizeRoot(value) {
    return value === 'surface' ? 'surface' : 'wall';
}

function normalizeClassId(value) {
    const id = typeof value === 'string' ? value.trim() : '';
    return PBR_MATERIAL_CLASS_META[id] ? id : null;
}

function requireString(value, name) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) throw new Error(`[PbrMaterialCatalog] Missing required ${name}.`);
    return v;
}

function requirePositiveNumber(value, name) {
    const v = Number(value);
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`[PbrMaterialCatalog] Expected ${name} to be a positive number.`);
    return v;
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

function normalizeNormalizationMeta(value) {
    const src = value && typeof value === 'object' ? value : {};
    const notes = typeof src.notes === 'string' ? src.notes : '';
    const albedoNotes = typeof src.albedoNotes === 'string' ? src.albedoNotes : '';
    const roughnessIntent = typeof src.roughnessIntent === 'string' ? src.roughnessIntent : '';
    return Object.freeze({ notes, albedoNotes, roughnessIntent });
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

function normalizeCatalogEntry(entry) {
    const src = entry && typeof entry === 'object' ? entry : null;
    if (!src) throw new Error('[PbrMaterialCatalog] Invalid catalog entry (expected object).');

    const materialId = requireString(src.materialId ?? src.id, 'materialId');
    if (!materialId.startsWith(PBR_ID_PREFIX)) throw new Error(`[PbrMaterialCatalog] Invalid materialId: ${materialId}`);
    const slug = materialId.slice(PBR_ID_PREFIX.length);
    if (!slug || slug.includes('/') || slug.includes('\\')) throw new Error(`[PbrMaterialCatalog] Invalid materialId slug: ${materialId}`);

    const classId = normalizeClassId(src.classId);
    if (!classId) throw new Error(`[PbrMaterialCatalog] Invalid classId for ${materialId}: ${String(src.classId ?? '')}`);

    const root = normalizeRoot(src.root);
    const label = typeof src.label === 'string' && src.label.trim() ? src.label.trim() : toTitle(slug);
    const tileMeters = requirePositiveNumber(src.tileMeters, `tileMeters for ${materialId}`);
    const buildingEligible = !!src.buildingEligible;
    const groundEligible = !!src.groundEligible;
    const mapFilesRaw = normalizeMapFiles(src.mapFiles);
    const mapFiles = mapFilesRaw ? Object.freeze(mapFilesRaw) : null;

    const files = mapFiles ?? MAPS;
    const hasBase = typeof files.baseColor === 'string' && files.baseColor.trim();
    const hasNormal = typeof files.normal === 'string' && files.normal.trim();
    if (!hasBase || !hasNormal) throw new Error(`[PbrMaterialCatalog] Missing baseColor/normal mapFiles for ${materialId}.`);
    const hasOrm = typeof files.orm === 'string' && files.orm.trim();
    const hasExtra = !!(files.ao || files.roughness || files.metalness);
    if (!hasOrm && !hasExtra) throw new Error(`[PbrMaterialCatalog] Missing orm or ao/roughness/metalness mapFiles for ${materialId}.`);

    return Object.freeze({
        id: materialId,
        label,
        classId,
        root,
        buildingEligible,
        groundEligible,
        tileMeters,
        mapFiles,
        normalization: normalizeNormalizationMeta(src.normalization)
    });
}

const MATERIALS = Object.freeze((Array.isArray(PBR_MATERIAL_CATALOG) ? PBR_MATERIAL_CATALOG : []).map((entry) => normalizeCatalogEntry(entry)));

const MATERIAL_BY_ID = new Map(MATERIALS.map((entry) => [entry.id, entry]));
if (MATERIAL_BY_ID.size !== MATERIALS.length) throw new Error('[PbrMaterialCatalog] Duplicate materialId detected in PBR catalog.');

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
    if (!(Number.isFinite(tile) && tile > 0)) return null;
    const root = normalizeRoot(def.root);
    const fallback = Number(DEFAULT_TILE_METERS_BY_ROOT[root] ?? 1.0);
    if (Number.isFinite(fallback) && Math.abs(tile - fallback) <= 1e-6) return null;
    return tile;
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
        classId: def.classId ?? null,
        classLabel: getPbrMaterialClassLabel(def.classId) ?? null,
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

export function getPbrMaterialClassLabel(classId) {
    const id = typeof classId === 'string' ? classId.trim() : '';
    return PBR_MATERIAL_CLASS_META[id]?.label ?? null;
}

export function getPbrMaterialClassOptions() {
    return PBR_MATERIAL_CLASS_ORDER.map((id) => ({ id, label: PBR_MATERIAL_CLASS_META[id]?.label ?? id }));
}

function buildOptionsByClass(options) {
    const list = Array.isArray(options) ? options : [];
    const byClass = new Map();
    for (const opt of list) {
        const classId = typeof opt?.classId === 'string' ? opt.classId : null;
        if (!classId) continue;
        const bucket = byClass.get(classId);
        if (bucket) bucket.push(opt);
        else byClass.set(classId, [opt]);
    }

    const sections = [];
    for (const classId of PBR_MATERIAL_CLASS_ORDER) {
        const opts = byClass.get(classId) ?? [];
        if (!opts.length) continue;
        sections.push({
            classId,
            label: getPbrMaterialClassLabel(classId) ?? classId,
            options: opts
        });
    }

    const unknown = Array.from(byClass.entries())
        .filter(([id]) => !PBR_MATERIAL_CLASS_META[id])
        .flatMap(([, opts]) => opts);
    if (unknown.length) {
        sections.push({
            classId: 'unknown',
            label: 'Other',
            options: unknown
        });
    }

    return sections;
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
    const id = `${PBR_ID_PREFIX}${slug}`;
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
            classId: entry.classId ?? null,
            classLabel: getPbrMaterialClassLabel(entry.classId) ?? null,
            buildingEligible: !!entry.buildingEligible,
            groundEligible: !!entry.groundEligible,
            tileMeters: meta?.tileMeters ?? null,
            preferredVariant: meta?.preferredVariant ?? null,
            variants: meta?.variants ?? null,
            maps: meta?.maps ?? null
        };
    });
}

export function getPbrMaterialClassSections() {
    return buildOptionsByClass(getPbrMaterialOptions());
}

export function getPbrMaterialClassSectionsForBuildings() {
    return buildOptionsByClass(getPbrMaterialOptionsForBuildings());
}

export function getPbrMaterialClassSectionsForGround() {
    return buildOptionsByClass(getPbrMaterialOptionsForGround());
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
