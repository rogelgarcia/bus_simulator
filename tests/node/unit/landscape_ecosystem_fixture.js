// Builds the AI 599 generation fixture: a 512 m landscape with a hill, a slope, water, sand, grass, forest and rock bands, a planning road strip, synthetic field and geology pages, planning features and a small recipe.
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LANDSCAPE_TERRAIN_FIELD_CHANNELS, createEcosystemCellSources, createEcosystemInputSampler, ecosystemCellBounds, ecosystemCellRequirements,
    encodeLandscapeGeologyChannel, encodeLandscapeTerrainField, landscapeGeologyLayout, landscapeTerrainFieldsLayout, validateEcosystemRecipe } from '../../../src/app/landscape/index.js';

export const FIXTURE = Object.freeze({ chunkIntervals: 64, maxLevel: 2, spacing: 2, roadRows: [200, 206], roadWidthMeters: 10, faceColumns: [236, 244], shoreColumn: 20, sandColumn: 40, grassColumn: 120, forestColumn: 200 });
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Heights in metres at a native sample: a water ramp west of column 20, land rising east, a hill and a steep band toward the rock. */
export function fixtureHeightAt(column, row) {
    return Math.fround(column < FIXTURE.shoreColumn ? (column - FIXTURE.shoreColumn) * .3 : (column - FIXTURE.shoreColumn) * .15 + 12 * Math.exp(-((column - 160) ** 2 + (row - 120) ** 2) / 1800) + 20 * smooth(220, 240, column));
}

/** Land cover at a native sample: water, sand, a planning road strip, grass, forest, rock. */
export function fixtureCoverAt(column, row) {
    if (column < FIXTURE.shoreColumn) return 0;
    if (column < FIXTURE.sandColumn) return 1;
    if (row >= FIXTURE.roadRows[0] && row < FIXTURE.roadRows[1]) return 6;
    return column < FIXTURE.grassColumn ? 2 : column < FIXTURE.forestColumn ? 3 : 4;
}

/** Synthetic terrain fields at a world position (decoded values). */
export function fixtureFieldsAt(x) {
    return { wetness: Math.min(1, Math.max(0, .3 + .4 * Math.sin(x / 50))), flow: .1, deposition: .05, rockExposure: x >= FIXTURE.forestColumn * FIXTURE.spacing ? .7 : .1, skyView: 1, shoreDistance: x - FIXTURE.sandColumn * FIXTURE.spacing + 40, convexity: 0, slopeDegrees: 5 };
}

/** Synthetic geology at a world position (decoded channels and labels): beach sand near the shore, a backshore strip, a face band in the rock. */
export function fixtureGeologyAt(x) {
    const column = x / FIXTURE.spacing, sand = column >= FIXTURE.shoreColumn && column < FIXTURE.sandColumn, face = column >= FIXTURE.faceColumns[0] && column < FIXTURE.faceColumns[1];
    return { channels: { bedrockOffset: 2, regolith: .5, depositThickness: sand ? 1 : 0, wear: 0, deposition: 0, flow: 0, waveExposure: 0, faceMask: face ? 1 : 0 },
        categories: { depositType: sand ? 4 : 0, lithology: 1, drainage: 0, coastalZone: column >= 30 && column < FIXTURE.sandColumn ? 7 : 0 } };
}

function fieldPage(chunk, layout) {
    const page = new Uint8Array(layout.pageBytes), b = chunk.bounds, spacing = FIXTURE.spacing;
    for (let ty = 0; ty < layout.width; ty++) for (let tx = 0; tx < layout.width; tx++) {
        const x = b.minX + (tx - layout.halo) * spacing, fields = fixtureFieldsAt(x), values = [fields.wetness, fields.flow, fields.deposition, fields.rockExposure, fields.skyView, fields.shoreDistance, fields.convexity, fields.slopeDegrees, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let k = 0; k < 16; k++) page[(k >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (k & 3)] = encodeLandscapeTerrainField(LANDSCAPE_TERRAIN_FIELD_CHANNELS[k], values[k]);
    }
    return page;
}

function geologyPage(chunk, layout) {
    const fields = new Uint8Array(layout.pageBytes), categorical = new Uint8Array(layout.categorical.byteLength), b = chunk.bounds, spacing = FIXTURE.spacing, count = chunk.columns * chunk.rows;
    for (let ty = 0; ty < layout.width; ty++) for (let tx = 0; tx < layout.width; tx++) {
        const geology = fixtureGeologyAt(b.minX + (tx - layout.halo) * spacing);
        LANDSCAPE_GEOLOGY_CHANNELS.forEach((definition, k) => { fields[(k >> 2) * layout.layerBytes + (ty * layout.width + tx) * 4 + (k & 3)] = encodeLandscapeGeologyChannel(definition, geology.channels[definition.name]); });
    }
    for (let r = 0; r < chunk.rows; r++) for (let c = 0; c < chunk.columns; c++) {
        const geology = fixtureGeologyAt(b.minX + c * spacing);
        LANDSCAPE_GEOLOGY_CATEGORIES.forEach((category, k) => { categorical[k * count + r * chunk.columns + c] = geology.categories[category.name]; });
    }
    return { fields, categorical };
}

/** The planning features of the fixture: the road along the strip, a district in the forest and an open-view corridor in the grass. */
export function fixturePlanning(manifest) {
    const z = manifest.bounds.maxZ - (FIXTURE.roadRows[0] + 3) * FIXTURE.spacing, x0 = FIXTURE.sandColumn * FIXTURE.spacing, x1 = manifest.bounds.maxX;
    const polygon = (kind, name, points, metadata = {}) => ({ id: `${kind}/${name}`, name, kind, geometry: { type: 'polygon', points }, bounds: { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) }, metadata });
    return { features: [
        { id: 'road/strip', name: 'Strip road', kind: 'road', geometry: { type: 'polyline', points: [{ x: x0, z }, { x: x1, z }] }, bounds: { minX: x0, maxX: x1, minZ: z, maxZ: z }, metadata: { widthMeters: FIXTURE.roadWidthMeters } },
        polygon('district', 'forest-hamlet', [{ x: 300, z: 380 }, { x: 360, z: 380 }, { x: 360, z: 440 }, { x: 300, z: 440 }], { targetElevationMeters: 20 }),
        polygon('view-corridor', 'beach-open-view', [{ x: 100, z: 300 }, { x: 180, z: 300 }, { x: 180, z: 360 }, { x: 100, z: 360 }])
    ], roadZ: z };
}

/** The test recipe: boulders and shrubs offline, scree (children of boulders) and pebbles (geology driven) runtime. */
export function fixtureRecipe(mutate = null) {
    const recipe = {
        format: 'landscape-ecosystem-recipe', schemaVersion: 1, id: 'ai599-test', name: 'AI 599 generation fixture', seed: 4242,
        zones: { pond: { type: 'circle', center: { x: 300, z: 300 }, radius: 20 } },
        assets: { rocks: { kind: 'placeholder-rocks', variants: 3, seed: 1, footprintRadiusMeters: .5, heightMeters: 1, lods: [{ level: 0, triangles: 320 }, { level: 1, triangles: 80 }] },
            bushes: { kind: 'catalog-distant', species: 'arrowwood_viburnum', variants: ['mature_01', 'mature_02'], footprintRadiusMeters: .5, heightMeters: 2, lods: [{ level: 3 }, { level: 5 }] } },
        layers: {
            boulders: { id: 'boulders', label: 'Boulders', assetSet: 'rocks', generation: 'offline', cell: { meters: 64, sitesPerAxis: 16 }, footprint: { radiusMeters: .5, clearanceMeters: 1 }, jitter: .3,
                alignment: { mode: 'sunk', slopeWeight: .5, sinkMeters: .1, sinkScalesWithSize: true }, variation: { scale: { min: .5, max: 2, distribution: 'log-uniform' }, yaw: 'random', tint: { value: [.9, 1.1], channels: { r: [.98, 1.02], g: [1, 1], b: [.95, 1] } } },
                viewDistanceMeters: 300, lods: [{ level: 0, distanceMeters: 100 }, { level: 1, distanceMeters: 300 }],
                rules: { density: [{ group: 'habitat', input: 'soil.rock', curve: [[0, 0], [1, .6]] }, { group: 'habitat', input: 'cover.forest', curve: [[0, 0], [1, .15]] }, { input: 'slopeDegrees', curve: [[0, 1], [40, 0]] }],
                    clumping: { wavelengthMeters: 30, contrast: .5, threshold: .5, octaves: 2 }, competition: { priority: 30, clearanceMeters: 1, against: 'all' },
                    exclusions: [{ zone: 'water' }, { zone: 'pond' }, { zone: 'roads', marginMeters: 3 }, { zone: 'view-corridor' }, { zone: 'faces' }] } },
            shrubs: { id: 'shrubs', label: 'Shrubs', assetSet: 'bushes', generation: 'offline', cell: { meters: 64, sitesPerAxis: 16 }, footprint: { radiusMeters: .5, clearanceMeters: 1.5 }, jitter: .3,
                variation: { scale: { min: .8, max: 1.2, distribution: 'uniform' }, yaw: 'downslope', tint: { value: [1, 1], channels: { r: [1, 1], g: [1, 1], b: [1, 1] } } }, viewDistanceMeters: 300, lods: [{ level: 3, distanceMeters: 100 }, { level: 5, distanceMeters: 300 }],
                rules: { density: [{ input: 'cover.grass', curve: [[0, 0], [1, .5]] }, { input: 'distance.cover.forest', curve: [[0, 1], [30, 1], [40, .4]] }, { input: 'moisture', curve: [[0, .5], [1, 1]] }, { input: 'distance.layer.boulders', curve: [[0, 0], [3, 1]] }],
                    competition: { priority: 20, clearanceMeters: 1.5, against: 'all' }, exclusions: [{ zone: 'water', marginMeters: 5 }, { zone: 'planning-cover', marginMeters: 2 }, { zone: 'districts', marginMeters: 2 }] } },
            scree: { id: 'scree', label: 'Scree', assetSet: 'rocks', generation: 'runtime', cell: { meters: 32, sitesPerAxis: 8 }, footprint: { radiusMeters: .1, clearanceMeters: 0 }, jitter: .2, viewDistanceMeters: 100, lods: [{ level: 0, distanceMeters: 100 }],
                rules: { density: [{ input: 'slopeDegrees', curve: [[0, 1], [60, 0]] }], parent: { layer: 'boulders', count: [2, 5], radiusMeters: [.8, 3], inheritScale: .5 }, competition: { priority: 10, clearanceMeters: .2, against: ['boulders', 'shrubs'] }, exclusions: [{ zone: 'water' }] } },
            pebbles: { id: 'pebbles', label: 'Pebbles', assetSet: 'rocks', generation: 'runtime', cell: { meters: 32, sitesPerAxis: 16 }, footprint: { radiusMeters: .05, clearanceMeters: 0 }, jitter: .3, viewDistanceMeters: 60, lods: [{ level: 0, distanceMeters: 60 }],
                rules: { density: [{ input: 'soil.sand', curve: [[0, 0], [1, .4]] }, { input: 'geology.coastalZone.backshore', curve: [[0, .2], [1, 1]] }], competition: { priority: 5, clearanceMeters: 0, against: 'all' }, exclusions: [] } }
        },
        biomes: { natural: { label: 'Natural ground', layers: ['boulders', 'shrubs', 'scree', 'pebbles'] } }, targets: {}
    };
    if (mutate) mutate(recipe);
    return validateEcosystemRecipe(recipe);
}

/**
 * The fixture: landscape, decoded chunks, synthetic pages and a `cellSources` factory for `generateEcosystemLayerCells` that can leave out fields, geology or planning.
 * @param {{heightAt?:(column:number,row:number)=>number,fields?:boolean,geology?:boolean,planning?:boolean,recipe?:any}} [options]
 */
export function createEcosystemFixture({ heightAt = fixtureHeightAt, fields = true, geology = true, planning = true, recipe = fixtureRecipe() } = {}) {
    const landscape = createLandscapeModelFixture({ chunkIntervals: FIXTURE.chunkIntervals, maxLevel: FIXTURE.maxLevel, minX: 0, minZ: 0, spacing: FIXTURE.spacing, heightAt, coverAt: fixtureCoverAt });
    const { manifest, decoded } = landscape, natives = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel);
    const fieldsLayout = landscapeTerrainFieldsLayout(FIXTURE.chunkIntervals + 1), geologyLayout = landscapeGeologyLayout(FIXTURE.chunkIntervals + 1), soilIndex = manifest.soil.catalog.findIndex(soil => soil.id === 'loam');
    const fieldPages = new Map(natives.map(chunk => [chunk.id, fieldPage(chunk, fieldsLayout)])), geologyPages = new Map(natives.map(chunk => [chunk.id, geologyPage(chunk, geologyLayout)]));
    const naturalSoilPages = new Map(natives.filter(chunk => decoded.get(chunk.id).landCover.some(id => id === 6)).map(chunk => [chunk.id, new Uint8Array(chunk.columns * chunk.rows).fill(soilIndex)]));
    const planningFeatures = fixturePlanning(manifest), layerIds = Object.keys(recipe.layers);
    const cellSources = ({ layer, cellX, cellZ, haloMeters, layerFeatures }) => {
        const requirements = ecosystemCellRequirements(manifest, layer, cellX, cellZ, haloMeters), chunks = new Map(requirements.chunkIds.map(id => [id, decoded.get(id)]));
        const sources = createEcosystemCellSources({ manifest, chunks, bounds: ecosystemCellBounds(layer.cell.meters, cellX, cellZ), layerDistanceMeters: haloMeters, layerFeatures,
            fieldPages: fields ? new Map(requirements.chunkIds.map(id => [id, fieldPages.get(id)])) : null, fieldsLayout: fields ? fieldsLayout : null,
            naturalSoilPages: fields ? new Map(requirements.chunkIds.filter(id => naturalSoilPages.has(id)).map(id => [id, naturalSoilPages.get(id)])) : null,
            geologyPages: geology ? new Map(requirements.chunkIds.map(id => [id, geologyPages.get(id)])) : null, geologyLayout: geology ? geologyLayout : null, planning: planning ? planningFeatures : null });
        return { sampler: createEcosystemInputSampler({ layerIds, sources }), viewCorridor: sources.viewCorridor, sources };
    };
    return { ...landscape, recipe, layerIds, fieldPages, geologyPages, naturalSoilPages, fieldsLayout, geologyLayout, planning: planningFeatures, cellSources };
}
