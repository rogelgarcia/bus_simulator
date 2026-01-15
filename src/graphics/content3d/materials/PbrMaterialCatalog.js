// src/graphics/content3d/materials/PbrMaterialCatalog.js
// Defines a stable registry of imported PBR materials (URLs + building eligibility).
import { getPbrAssetsEnabled } from './PbrAssetsRuntime.js';

const PBR_ID_PREFIX = 'pbr.';

const PBR_BASE_URL = new URL('../../../../assets/public/pbr/', import.meta.url);

const MAPS = Object.freeze({
    baseColor: 'basecolor.jpg',
    normal: 'normal_gl.png',
    orm: 'arm.png'
});

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

const MATERIALS = Object.freeze([
    Object.freeze({ id: makeId('asphalt_02'), label: 'Asphalt 02', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('brick_crosswalk'), label: 'Brick Crosswalk', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('clay_roof_tiles_02'), label: 'Clay Roof Tiles 02', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('coast_sand_rocks_02'), label: 'Coast Sand Rocks 02', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('patterned_concrete_pavers'), label: 'Patterned Concrete Pavers', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('patterned_paving'), label: 'Patterned Paving', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('red_slate_roof_tiles_01'), label: 'Red Slate Roof Tiles 01', root: 'surface', buildingEligible: false }),
    Object.freeze({ id: makeId('rocky_terrain_02'), label: 'Rocky Terrain 02', root: 'surface', buildingEligible: false }),

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

export function getPbrMaterialLabel(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return typeof materialId === 'string' ? materialId : '';
    return def.label || toTitle(def.id.slice(PBR_ID_PREFIX.length));
}

export function resolvePbrMaterialUrls(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return { baseColorUrl: null, normalUrl: null, ormUrl: null };
    if (!getPbrAssetsEnabled()) return { baseColorUrl: null, normalUrl: null, ormUrl: null };
    const dir = new URL(`${def.id.slice(PBR_ID_PREFIX.length)}/`, PBR_BASE_URL);
    return {
        baseColorUrl: new URL(MAPS.baseColor, dir).toString(),
        normalUrl: new URL(MAPS.normal, dir).toString(),
        ormUrl: new URL(MAPS.orm, dir).toString()
    };
}

export function getPbrMaterialOptions() {
    return MATERIALS.map((entry) => {
        return {
            id: entry.id,
            label: entry.label || toTitle(entry.id.slice(PBR_ID_PREFIX.length)),
            previewUrl: makePreviewUrl({ id: entry.id, label: entry.label || toTitle(entry.id.slice(PBR_ID_PREFIX.length)) }),
            root: entry.root,
            buildingEligible: !!entry.buildingEligible
        };
    });
}

export function getPbrMaterialOptionsForBuildings() {
    return getPbrMaterialOptions().filter((entry) => (
        entry.buildingEligible && !String(entry.id).toLowerCase().includes('grass')
    ));
}

export function isPbrBuildingWallMaterialId(materialId) {
    const def = getPbrMaterialDefinition(materialId);
    if (!def) return false;
    if (String(def.id).toLowerCase().includes('grass')) return false;
    return !!def.buildingEligible;
}
