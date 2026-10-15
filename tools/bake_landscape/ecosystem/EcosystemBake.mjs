// Runs the offline ecosystem generation of a recipe over a saved landscape and its gates: determinism, seams, spacing and the spatial statistics, with densities against the recipe targets.
// @ts-check
// Every offline layer generates over the cells intersecting the landscape bounds through one shared cell cache (higher-priority layers are memoized
// as the lower ones reach into their halos). The gates then re-open the landscape with fresh caches: a sample of cells regenerates alone and must
// match byte for byte, and a sample of 3 x 3 blocks regenerates its centre after its neighbours and must match too; a site layer must show no pair
// closer than its declared spacing bound. Anisotropy is reported but never fails real terrain, whose linear habitats are anisotropic by nature.
import { ecosystemLayerPriorityOrder, ecosystemLayerSpacing } from '../../../src/app/landscape/ecosystem/EcosystemRecipe.js';
import { ecosystemCellsIntersecting } from '../../../src/app/landscape/ecosystem/EcosystemLattice.js';
import { createEcosystemCellCache, generateEcosystemLayerCells } from '../../../src/app/landscape/ecosystem/EcosystemGeneration.js';
import { ECOSYSTEM_RECORD, createEcosystemTileData, encodeEcosystemTile } from '../../../src/app/landscape/ecosystem/EcosystemTiles.js';
import { ecosystemSpatialStatistics } from '../../../src/app/landscape/ecosystem/EcosystemStatistics.js';
import { openEcosystemLandscape } from './EcosystemFileSources.mjs';

export const ECOSYSTEM_GATE_SAMPLES = Object.freeze({ determinism: 8, seams: 4 });
const F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts;
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const sameBytes = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

function sampleCells(cells, count) {
    const sorted = [...cells].sort((a, b) => a.cellZ - b.cellZ || a.cellX - b.cellX), picked = new Map();
    for (let i = 0; i < count && sorted.length > 0; i++) { const cell = sorted[Math.round(i * (sorted.length - 1) / Math.max(1, count - 1))]; picked.set(cell.id, cell); }
    return [...picked.values()];
}

function mergeRecords(cells) {
    const total = cells.reduce((sum, cell) => sum + cell.tile.count, 0), merged = createEcosystemTileData(total);
    for (const cell of cells) { merged.records.set(cell.tile.records.subarray(0, cell.tile.count * F), merged.count * F); merged.ids.set(cell.tile.ids.subarray(0, cell.tile.count * I), merged.count * I); merged.count += cell.tile.count; }
    return merged;
}

function sumStatistics(cells) {
    const sum = { sites: 0, culled: 0, outside: 0, excluded: {}, below: 0, competed: 0, kept: 0, keptByCover: {}, children: null, overrides: null };
    const add = (target, source) => {
        for (const key of ['sites', 'parents', 'spawned', 'culled', 'outside', 'below', 'competed', 'kept']) if (key in source) target[key] = (target[key] ?? 0) + source[key];
        for (const [zone, count] of Object.entries(source.excluded)) target.excluded[zone] = (target.excluded[zone] ?? 0) + count;
        for (const [cover, count] of Object.entries(source.keptByCover)) target.keptByCover[cover] = (target.keptByCover[cover] ?? 0) + count;
    };
    for (const cell of cells) {
        add(sum, cell.statistics);
        if (cell.statistics.children) { sum.children ??= { parents: 0, spawned: 0, outside: 0, excluded: {}, below: 0, competed: 0, kept: 0, keptByCover: {} }; add(sum.children, cell.statistics.children); }
        if (cell.statistics.overrides) { sum.overrides ??= { masked: 0, removed: 0, pinned: 0, unplaced: 0 }; sum.overrides.masked += cell.statistics.overrides.masked; sum.overrides.removed += cell.statistics.overrides.removed; sum.overrides.pinned += cell.statistics.overrides.pinned.length; sum.overrides.unplaced += cell.statistics.overrides.unplaced.length; }
    }
    return sum;
}

/**
 * @param {{directory:string,source:{bytes:Uint8Array,manifest:any},recipe:any,overrides:any,densityScale:number,layerIds:string[],signal?:AbortSignal,log?:(message:string)=>void}} options
 */
export async function runEcosystemGeneration({ directory, source, recipe, overrides, densityScale, layerIds, signal, log = () => {} }) {
    const started = performance.now(), landscape = await openEcosystemLandscape({ directory, recipe, source, signal, log }), bounds = landscape.manifest.bounds, cache = createEcosystemCellCache();
    const layers = new Map(), timing = {}, order = ecosystemLayerPriorityOrder(recipe).filter(id => layerIds.includes(id));
    for (const layerId of order) {
        const layer = recipe.layers[layerId], mark = performance.now(), cells = ecosystemCellsIntersecting(layer, bounds);
        const results = await generateEcosystemLayerCells({ recipe, layer, cells, cellSources: landscape.cellSources, overrides, densityScale, cache, bounds });
        layers.set(layerId, results); timing[layerId] = round((performance.now() - mark) / 1000, 3);
        log(`[Ecosystem] ${layerId}: ${results.length} cells, ${results.reduce((sum, cell) => sum + cell.tile.count, 0)} instances in ${timing[layerId]} s (${landscape.reads.chunks} chunk reads so far)`);
    }
    timing.generationSeconds = round((performance.now() - started) / 1000, 3);
    const mark = performance.now(), fresh = await openEcosystemLandscape({ directory, recipe, source, signal }), gates = { determinism: {}, seams: {}, spacing: {}, passed: true }, reports = {}, statistics = {};
    const regenerate = async (layer, cells, cellCache) => generateEcosystemLayerCells({ recipe, layer, cells, cellSources: fresh.cellSources, overrides, densityScale, cache: cellCache, bounds });
    for (const layerId of order) {
        const layer = recipe.layers[layerId], results = layers.get(layerId), nonEmpty = results.filter(cell => cell.tile.count > 0), byId = new Map(results.map(cell => [cell.id, cell]));
        const determinism = [];
        for (const cell of sampleCells(nonEmpty, ECOSYSTEM_GATE_SAMPLES.determinism)) {
            const [again] = await regenerate(layer, [{ cellX: cell.cellX, cellZ: cell.cellZ }], createEcosystemCellCache());
            determinism.push({ id: cell.id, count: cell.tile.count, identical: sameBytes(encodeEcosystemTile(cell.tile), encodeEcosystemTile(again.tile)) });
        }
        const seams = [];
        for (const cell of sampleCells(nonEmpty, ECOSYSTEM_GATE_SAMPLES.seams)) {
            const cellCache = createEcosystemCellCache(), neighbours = [];
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) neighbours.push({ cellX: cell.cellX + dx, cellZ: cell.cellZ + dz });
            const around = await regenerate(layer, neighbours, cellCache), [centre] = await regenerate(layer, [{ cellX: cell.cellX, cellZ: cell.cellZ }], cellCache);
            const neighboursIdentical = around.every(tile => { const original = byId.get(tile.id); return !!original && sameBytes(encodeEcosystemTile(original.tile), encodeEcosystemTile(tile.tile)); });
            seams.push({ id: cell.id, neighbours: around.length, identical: sameBytes(encodeEcosystemTile(cell.tile), encodeEcosystemTile(centre.tile)) && neighboursIdentical });
        }
        const merged = mergeRecords(results), spacing = ecosystemLayerSpacing(layer), minimumSpacing = layer.rules.parent ? 0 : spacing * (1 - 2 * layer.jitter);
        const spatial = ecosystemSpatialStatistics(merged.records, merged.count, { spacing, minimumSpacing });
        const spacingPassed = minimumSpacing === 0 || spatial.count < 2 || (spatial.closePairs === 0 && spatial.nearest.minimum >= minimumSpacing - 1e-6);
        gates.determinism[layerId] = { cells: determinism, passed: determinism.every(entry => entry.identical) };
        gates.seams[layerId] = { cells: seams, passed: seams.every(entry => entry.identical) };
        gates.spacing[layerId] = { minimumSpacing: round(minimumSpacing), nearestMinimum: spatial.nearest ? round(spatial.nearest.minimum) : null, closePairs: spatial.closePairs, passed: spacingPassed };
        gates.passed = gates.passed && gates.determinism[layerId].passed && gates.seams[layerId].passed && spacingPassed;
        const counts = sumStatistics(results);
        statistics[layerId] = { generation: layer.generation, cells: results.length, tiles: nonEmpty.length, instances: merged.count, ...counts,
            spatial: { count: spatial.count, nearest: spatial.nearest ? { mean: round(spatial.nearest.mean), minimum: round(spatial.nearest.minimum), coefficientOfVariation: round(spatial.nearest.coefficientOfVariation) } : null, closePairs: spatial.closePairs,
                pairCorrelation: { binMeters: round(spatial.pairCorrelation.binMeters), values: spatial.pairCorrelation.values.map(value => round(value, 3)) }, anisotropy: { sectors: spatial.anisotropy.sectors, chiSquare: round(spatial.anisotropy.chiSquare, 3), passes: spatial.anisotropy.passes } } };
        reports[layerId] = statistics[layerId];
    }
    timing.gateSeconds = round((performance.now() - mark) / 1000, 3);
    const coverage = landscape.coverage(), areaKm2 = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ) / 1e6, landKm2 = coverage.landSamples * coverage.areaPerSampleSquareMeters / 1e6;
    const densities = {};
    for (const layerId of order) {
        const { instances, keptByCover, children } = statistics[layerId], byCover = {};
        for (const entry of landscape.manifest.landCover.catalog) {
            const kept = (keptByCover[entry.id] ?? 0) + (children?.keptByCover[entry.id] ?? 0), km2 = coverage.cover[entry.id] * coverage.areaPerSampleSquareMeters / 1e6;
            if (kept > 0) byCover[entry.label] = { instances: kept, squareKilometers: round(km2, 4), perSquareKilometer: round(kept / km2, 1) };
        }
        densities[layerId] = { instances, perSquareKilometer: { landscape: round(instances / areaKm2, 1), land: round(instances / landKm2, 1) }, byCover, target: recipe.targets[layerId] ?? null };
    }
    return { landscape, layers, order, statistics, gates, densities, timing: { ...timing, totalSeconds: round((performance.now() - started) / 1000, 3) },
        coverage: { ...coverage, landscapeSquareKilometers: round(areaKm2, 4), landSquareKilometers: round(landKm2, 4) }, reads: landscape.reads };
}
