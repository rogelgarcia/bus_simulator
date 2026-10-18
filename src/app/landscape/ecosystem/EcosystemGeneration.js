// Generates the instances of one ecosystem layer inside one world-anchored cell: blue-noise site selection, exclusions, competition, parent/child spawning, variation and the post-generation overrides.
// @ts-check
// Design: a cell is a pure function of the recipe, the overrides, the inputs at its sites and the already generated features of the higher-priority
// layers inside its halo, so the Node bake, the browser worker and the inspection trace share this one implementation. Sites whose blue-noise rank
// exceeds the layer's largest reachable density are never sampled (an exact shortcut: density cannot reach them), which is what keeps a sparse layer
// cheap on a dense lattice. Competitor features are bucketed per cell so a clearance test costs a few comparisons. The layer orchestration below
// memoizes the referenced cells of higher-priority layers (one ring around the cell, bounded by validation), so a landscape, a sub-area or one cell
// generate with the same per-cell function and identical bytes.
import { landscapeRegionSignedDistance } from '../LandscapeRegions.js';
import { requireCondition, requireFinite, requireInteger } from '../internal/LandscapeValidation.js';
import { compileEcosystemDensity, evaluateEcosystemDensity, traceEcosystemRule } from './EcosystemRules.js';
import { ecosystemCompetitionDistance, ecosystemCompetitors, ecosystemLayerHaloMeters } from './EcosystemRecipe.js';
import { ECOSYSTEM_RECORD, createEcosystemTileData, ecosystemCellBounds, ecosystemInstanceId, ecosystemTileId, sortEcosystemTile, writeEcosystemRecord } from './EcosystemTiles.js';
import { applyEcosystemOverrides, ecosystemOverrideParameters } from './EcosystemOverrides.js';
import { ecosystemExcludedBy } from './EcosystemInputs.js';
import { ecosystemBlueNoiseRank } from './EcosystemBlueNoise.js';
import { ECOSYSTEM_CHILD_CHANNELS, createEcosystemClumping, createEcosystemVariationSampler, ecosystemCellSites, ecosystemCellsIntersecting, ecosystemChildHash, ecosystemGrownBounds, ecosystemHashUnit, ecosystemLayerSalt,
    ecosystemLayerVariants, ecosystemSitePosition, ecosystemUnitDirection } from './EcosystemLattice.js';
import { ECOSYSTEM_COVER_DISTANCE_METERS } from './EcosystemCellSources.js';

const LAYER_DISTANCE = 'distance.layer.', F = ECOSYSTEM_RECORD.floats, I = ECOSYSTEM_RECORD.idInts, DEFAULT_PARAMETERS = Object.freeze({ densityScale: 1, scaleMultiplier: 1, included: false, regionIds: Object.freeze([]) });
const CELL_LIMIT = 2 ** 24;

/** The layers a layer reads while generating (competitors, parent, `distance.layer.*` targets) with the reach in metres of each reference. @param {any} recipe @param {any} layer */
export function ecosystemLayerReferences(recipe, layer) {
    const reaches = new Map();
    const reference = (other, reach) => reaches.set(other.id, Math.max(reaches.get(other.id) ?? 0, reach));
    for (const other of ecosystemCompetitors(recipe, layer)) reference(other, ecosystemCompetitionDistance(layer, other));
    if (layer.rules.parent) reference(recipe.layers[layer.rules.parent.layer], layer.rules.parent.radiusMeters[1]);
    for (const term of layer.rules.density) if (term.input.startsWith(LAYER_DISTANCE)) {
        const other = recipe.layers[term.input.slice(LAYER_DISTANCE.length)], reach = term.curve[term.curve.length - 1][0];
        requireCondition(reach <= other.cell.meters / 2, `layer ${layer.id}: ${term.input} reaches ${reach} m, beyond half of the ${other.cell.meters} m cell of ${other.id} (locality)`);
        reference(other, reach);
    }
    return [...reaches].map(([id, reach]) => ({ layer: recipe.layers[id], reach }));
}

/** How far outside its cell a layer reads other layers' features: the D1 halo extended by the `distance.layer.*` curve reaches. @param {any} recipe @param {any} layer */
export function ecosystemLayerGenerationHalo(recipe, layer) {
    return Math.max(ecosystemLayerHaloMeters(recipe, layer), ...ecosystemLayerReferences(recipe, layer).map(entry => entry.reach));
}

/** Distance from a cell within which a native terrain change can alter its tile: the cover halo, and every referenced layer's reach plus its own dependency. @param {any} recipe @param {any} layer */
export function ecosystemLayerDependencyMeters(recipe, layer) {
    let reach = ECOSYSTEM_COVER_DISTANCE_METERS;
    for (const entry of ecosystemLayerReferences(recipe, layer)) reach = Math.max(reach, entry.reach + ecosystemLayerDependencyMeters(recipe, entry.layer));
    return reach;
}

// features of one competitor bucketed on a grid of the competition distance over the grown cell bounds
function createFeatureIndex(features, bounds, cellMeters) {
    if (!features || features.count === 0) return null;
    const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellMeters)), rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellMeters)), records = features.records;
    const columnOf = x => Math.min(columns - 1, Math.max(0, Math.floor((x - bounds.minX) / cellMeters))), rowOf = z => Math.min(rows - 1, Math.max(0, Math.floor((z - bounds.minZ) / cellMeters)));
    const starts = new Uint32Array(columns * rows + 1), order = new Uint32Array(features.count);
    for (let i = 0; i < features.count; i++) starts[rowOf(records[i * F + 2]) * columns + columnOf(records[i * F]) + 1]++;
    for (let c = 0; c < columns * rows; c++) starts[c + 1] += starts[c];
    const fill = Uint32Array.from(starts);
    for (let i = 0; i < features.count; i++) order[fill[rowOf(records[i * F + 2]) * columns + columnOf(records[i * F])]++] = i;
    return {
        hasWithin(x, z, radius) {
            const squared = radius * radius, minColumn = columnOf(x - radius), maxColumn = columnOf(x + radius), minRow = rowOf(z - radius), maxRow = rowOf(z + radius);
            for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) {
                const cell = row * columns + column;
                for (let k = starts[cell]; k < starts[cell + 1]; k++) {
                    const o = order[k] * F, dx = records[o] - x, dz = records[o + 2] - z;
                    if (dx * dx + dz * dz <= squared) return true;
                }
            }
            return false;
        }
    };
}

const groupsMaximum = groups => groups.reduce((product, group) => product * Math.max(...group.map(term => Math.max(...term.curve.map(point => point[1])))), 1);

function overrideDensityBound(overrides, layerId, bounds) {
    let bound = 1;
    if (overrides) for (const entry of overrides.regions) {
        const parameters = entry.layers[layerId] ?? entry.layers['*'];
        if (parameters && parameters.densityScale > 1 && regionTouches(entry.region, bounds)) bound *= parameters.densityScale;
    }
    return bound;
}
const regionTouches = (region, bounds) => landscapeRegionSignedDistance(region, (bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2) > -Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;

function createCellEvaluator({ recipe, layer, bounds, sampler, viewCorridor, overrides, densityScale, competitors }) {
    const catalog = sampler.catalog, groups = compileEcosystemDensity(layer.rules.density, catalog);
    const biome = Object.values(recipe.biomes).find(entry => entry.layers.includes(layer.id)), whereGroups = compileEcosystemDensity(biome.where, catalog);
    const salt = ecosystemLayerSalt(recipe.seed, layer.id), clumping = createEcosystemClumping(layer, salt), variation = createEcosystemVariationSampler(layer, ecosystemLayerVariants(recipe, layer), salt);
    const zoneContext = { zones: recipe.zones, viewCorridor, regionDistance: landscapeRegionSignedDistance }, halo = ecosystemLayerGenerationHalo(recipe, layer), grown = ecosystemGrownBounds(bounds, halo);
    const competition = ecosystemCompetitors(recipe, layer).map(other => ({ layer: other, distance: ecosystemCompetitionDistance(layer, other), index: createFeatureIndex(competitors?.(other.id) ?? null, grown, Math.max(1, ecosystemCompetitionDistance(layer, other))) })).filter(entry => entry.index);
    const maxDensity = Math.min(1, groupsMaximum(groups) * groupsMaximum(whereGroups) * densityScale * overrideDensityBound(overrides, layer.id, bounds));
    const vector = catalog.neutralVector();
    return {
        salt, variation, maxDensity, halo,
        evaluate(x, z, rank, detail = false) {
            const sample = sampler.sample(x, z, vector);
            if (!sample) return { outcome: 'outside' };
            const parameters = overrides ? ecosystemOverrideParameters(overrides, layer.id, x, z) : DEFAULT_PARAMETERS;
            let excluded = null;
            if (!parameters.included) for (const exclusion of layer.rules.exclusions) {
                if (ecosystemExcludedBy(exclusion.zone, exclusion.marginMeters, { x, z, terrain: sample.terrain, vector, catalog }, zoneContext)) { excluded = exclusion.zone; break; }
            }
            const clump = clumping ? clumping.evaluate(x, z) : 1, scale = densityScale * parameters.densityScale;
            const curveDensity = evaluateEcosystemDensity(groups, vector) * (whereGroups.length ? evaluateEcosystemDensity(whereGroups, vector) : 1);
            const density = excluded ? 0 : Math.min(1, Math.max(0, curveDensity * clump * scale));
            const result = { outcome: 'kept', sample, parameters, density, excluded, competitor: null, rule: null, biome: null, inputs: null };
            if (detail) { result.rule = traceEcosystemRule(groups, vector, { clumping: clump, densityScale: scale, excluded }); result.biome = traceEcosystemRule(whereGroups, vector, { clumping: 1, densityScale: 1, excluded }); result.inputs = sampler.describe(vector); }
            if (excluded) result.outcome = 'excluded';
            else if (!(rank < density)) result.outcome = 'below';
            else for (const entry of competition) if (entry.index.hasWithin(x, z, entry.distance)) { result.outcome = 'competed'; result.competitor = entry.layer.id; break; }
            return result;
        }
    };
}

const childCount = (rule, salt, siteX, siteZ, parentChild) => rule.count[0] + Math.floor(ecosystemHashUnit(ecosystemChildHash(salt, siteX, siteZ, parentChild, -1, ECOSYSTEM_CHILD_CHANNELS.count)) * (rule.count[1] - rule.count[0] + 1));
const direction = new Float64Array(2);
function childAnchor(rule, salt, siteX, siteZ, parentChild, k, parentX, parentZ) {
    const radius = rule.radiusMeters[0] + (rule.radiusMeters[1] - rule.radiusMeters[0]) * ecosystemHashUnit(ecosystemChildHash(salt, siteX, siteZ, parentChild, k, ECOSYSTEM_CHILD_CHANNELS.radius));
    ecosystemUnitDirection(ecosystemHashUnit(ecosystemChildHash(salt, siteX, siteZ, parentChild, k, ECOSYSTEM_CHILD_CHANNELS.angle)), direction);
    return { x: parentX + radius * direction[0], z: parentZ + radius * direction[1], radius, keep: ecosystemHashUnit(ecosystemChildHash(salt, siteX, siteZ, parentChild, k, ECOSYSTEM_CHILD_CHANNELS.keep)) };
}
const insideCell = (bounds, x, z) => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;
const isTile = value => !!value && value.records instanceof Float32Array && value.ids instanceof Int32Array && Number.isSafeInteger(value.count);

function validateCellArguments({ recipe, layer, cellX, cellZ, sampler, viewCorridor, densityScale, parents }) {
    requireCondition(!!recipe?.layers && !!layer && recipe.layers[layer.id] === layer, 'ecosystem generation needs a validated recipe and one of its layers');
    requireInteger(cellX, -CELL_LIMIT, CELL_LIMIT, 'cellX'); requireInteger(cellZ, -CELL_LIMIT, CELL_LIMIT, 'cellZ');
    requireFinite(densityScale, 'densityScale'); requireCondition(densityScale >= 0 && densityScale <= 16, 'densityScale must be in 0..16');
    requireCondition(!!sampler && typeof sampler.sample === 'function' && !!sampler.catalog, 'ecosystem generation needs an ecosystem input sampler');
    requireCondition(!layer.rules.exclusions.some(exclusion => exclusion.zone === 'view-corridor') || typeof viewCorridor === 'function', `layer ${layer.id} excludes the view corridor and needs its predicate`);
    requireCondition(parents === null || isTile(parents), 'parents must be an ecosystem tile');
}

/**
 * Generates one cell of a layer. `competitors(layerId)` returns the final features of a higher-priority layer inside the cell grown by the halo,
 * `parents` those of the parent layer inside the cell grown by the child radius; both may be null when absent. Children belong to the cell holding
 * their anchor, keep when their hash is below the local density and take their rank from that hash; pinned parents spawn no children. With
 * `overrides`, the post-generation steps (exclude masks, removed ids, pinned instances on the exact ground) run last.
 * @param {{recipe:any,layer:any,cellX:number,cellZ:number,sampler:any,viewCorridor?:((x:number,z:number)=>boolean)|null,overrides?:any,densityScale?:number,
 *   competitors?:((layerId:string)=>any)|null,parents?:any,trace?:boolean}} options
 * @returns {{id:string,layerId:string,cellX:number,cellZ:number,bounds:any,tile:import('./EcosystemTiles.js').EcosystemTileData,statistics:any,trace:any[]|null}}
 */
export function generateEcosystemCell({ recipe, layer, cellX, cellZ, sampler, viewCorridor = null, overrides = null, densityScale = 1, competitors = null, parents = null, trace = false }) {
    validateCellArguments({ recipe, layer, cellX, cellZ, sampler, viewCorridor, densityScale, parents });
    const bounds = ecosystemCellBounds(layer.cell.meters, cellX, cellZ), evaluator = createCellEvaluator({ recipe, layer, bounds, sampler, viewCorridor, overrides, densityScale, competitors });
    const { salt, variation, maxDensity } = evaluator, sites = ecosystemCellSites(layer, cellX, cellZ), rule = layer.rules.parent;
    const parentCount = rule && parents ? parents.count : 0, tile = createEcosystemTileData(rule ? parentCount * rule.count[1] : sites.count * sites.count);
    const statistics = { sites: 0, culled: 0, outside: 0, excluded: {}, below: 0, competed: 0, kept: 0, keptByCover: {}, maxDensity, children: null, overrides: null, count: 0 }, traced = trace ? [] : null;
    const record = (outcome, siteX, siteZ, child, x, z, rank) => traced?.push({ siteX, siteZ, child, x, z, rank, outcome: outcome.outcome, density: outcome.density ?? null, excluded: outcome.excluded ?? null, competitor: outcome.competitor ?? null });
    const count = (target, outcome) => {
        if (outcome.outcome === 'excluded') target.excluded[outcome.excluded] = (target.excluded[outcome.excluded] ?? 0) + 1; else target[outcome.outcome]++;
        if (outcome.outcome === 'kept') target.keptByCover[outcome.sample.terrain.landCoverId] = (target.keptByCover[outcome.sample.terrain.landCoverId] ?? 0) + 1;
    };
    // a child layer has no lattice features of its own: its instances are spawned around the parent layer's features below
    if (!rule) for (let siteZ = sites.minSiteZ; siteZ < sites.minSiteZ + sites.count; siteZ++) for (let siteX = sites.minSiteX; siteX < sites.minSiteX + sites.count; siteX++) {
        statistics.sites++;
        const rank = ecosystemBlueNoiseRank(siteX, siteZ);
        if (rank >= maxDensity) { statistics.culled++; continue; }
        const { x, z } = ecosystemSitePosition(layer, salt, siteX, siteZ), outcome = evaluator.evaluate(x, z, rank);
        count(statistics, outcome); record(outcome, siteX, siteZ, ECOSYSTEM_RECORD.childNone, x, z, rank);
        if (outcome.outcome !== 'kept') continue;
        const terrain = outcome.sample.terrain, shape = variation.site(siteX, siteZ, terrain.normal);
        writeEcosystemRecord(tile, tile.count++, { x, y: terrain.height, z, scale: shape.scale * outcome.parameters.scaleMultiplier, normalX: terrain.normal.x, normalZ: terrain.normal.z, yaw: shape.yaw, variant: shape.variant, rank, tint: shape.tint, siteX, siteZ, child: ECOSYSTEM_RECORD.childNone });
    }
    if (rule && parents) {
        const children = statistics.children = { parents: 0, spawned: 0, outside: 0, excluded: {}, below: 0, competed: 0, kept: 0, keptByCover: {} }, reach = rule.radiusMeters[1], records = parents.records, ids = parents.ids;
        for (let i = 0; i < parents.count; i++) {
            const o = i * F, parentX = records[o], parentZ = records[o + 2], parentScale = records[o + 3], siteX = ids[i * I], siteZ = ids[i * I + 1], parentChild = ids[i * I + 2];
            if (parentChild === ECOSYSTEM_RECORD.childPinned || parentX + reach < bounds.minX || parentX - reach >= bounds.maxX || parentZ + reach < bounds.minZ || parentZ - reach >= bounds.maxZ) continue;
            children.parents++;
            const total = childCount(rule, salt, siteX, siteZ, parentChild);
            for (let k = 0; k < total; k++) {
                const anchor = childAnchor(rule, salt, siteX, siteZ, parentChild, k, parentX, parentZ);
                if (!insideCell(bounds, anchor.x, anchor.z)) continue;
                children.spawned++;
                const outcome = evaluator.evaluate(anchor.x, anchor.z, anchor.keep);
                count(children, outcome); record(outcome, siteX, siteZ, k, anchor.x, anchor.z, anchor.keep);
                if (outcome.outcome !== 'kept') continue;
                const terrain = outcome.sample.terrain, shape = variation.child(siteX, siteZ, parentChild, k, terrain.normal), scale = shape.scale * (1 + (parentScale - 1) * rule.inheritScale) * outcome.parameters.scaleMultiplier;
                writeEcosystemRecord(tile, tile.count++, { x: anchor.x, y: terrain.height, z: anchor.z, scale, normalX: terrain.normal.x, normalZ: terrain.normal.z, yaw: shape.yaw, variant: shape.variant, rank: anchor.keep, tint: shape.tint, siteX, siteZ, child: k });
            }
        }
    }
    let result = sortEcosystemTile(tile);
    if (overrides) {
        const applied = applyEcosystemOverrides(result, { layerId: layer.id, bounds, overrides, groundAt: (x, z) => { const sample = sampler.sample(x, z); return sample ? { height: sample.terrain.height, normal: sample.terrain.normal } : null; } });
        result = applied.tile; statistics.overrides = { masked: applied.masked, removed: applied.removed, pinned: applied.pinned, unplaced: applied.unplaced };
    }
    statistics.count = result.count;
    return { id: ecosystemTileId(layer.id, cellX, cellZ), layerId: layer.id, cellX, cellZ, bounds, tile: result, statistics, trace: traced };
}

/**
 * Re-evaluates the rule at one instance (a site, or the k-th child of a parent site found in `parents`) with every factor named: the inspection trace.
 * @param {{recipe:any,layer:any,siteX:number,siteZ:number,child?:number,sampler:any,viewCorridor?:((x:number,z:number)=>boolean)|null,overrides?:any,densityScale?:number,competitors?:((layerId:string)=>any)|null,parents?:any}} options
 */
export function traceEcosystemSite({ recipe, layer, siteX, siteZ, child = ECOSYSTEM_RECORD.childNone, sampler, viewCorridor = null, overrides = null, densityScale = 1, competitors = null, parents = null }) {
    requireInteger(siteX, -(2 ** 31), 2 ** 31 - 1, 'siteX'); requireInteger(siteZ, -(2 ** 31), 2 ** 31 - 1, 'siteZ'); requireInteger(child, -1, 2 ** 31 - 1, 'child');
    const rule = layer?.rules?.parent;
    requireCondition(child === ECOSYSTEM_RECORD.childNone || (!!rule && isTile(parents)), 'tracing a child needs the parent layer rule and the parent features');
    let x, z, rank, cell, anchor = null;
    if (child === ECOSYSTEM_RECORD.childNone) {
        const n = layer.cell.sitesPerAxis;
        cell = { cellX: Math.floor(siteX / n), cellZ: Math.floor(siteZ / n) };
        ({ x, z } = ecosystemSitePosition(layer, ecosystemLayerSalt(recipe.seed, layer.id), siteX, siteZ)); rank = ecosystemBlueNoiseRank(siteX, siteZ);
    } else {
        let parent = -1;
        for (let i = 0; i < parents.count; i++) if (parents.ids[i * I] === siteX && parents.ids[i * I + 1] === siteZ && parents.ids[i * I + 2] === ECOSYSTEM_RECORD.childNone) parent = i;
        requireCondition(parent >= 0, `parent site ${siteX},${siteZ} is not among the supplied parents`);
        const salt = ecosystemLayerSalt(recipe.seed, layer.id), total = childCount(rule, salt, siteX, siteZ, ECOSYSTEM_RECORD.childNone);
        if (child >= total) return Object.freeze({ id: ecosystemInstanceId(layer.id, siteX, siteZ, child), outcome: 'unspawned', childCount: total, position: null, rank: null, density: null, excluded: null, competitor: null, rule: null, biome: null, inputs: null, parameters: null });
        anchor = childAnchor(rule, salt, siteX, siteZ, ECOSYSTEM_RECORD.childNone, child, parents.records[parent * F], parents.records[parent * F + 2]);
        x = anchor.x; z = anchor.z; rank = anchor.keep; cell = { cellX: Math.floor(x / layer.cell.meters), cellZ: Math.floor(z / layer.cell.meters) };
    }
    validateCellArguments({ recipe, layer, cellX: cell.cellX, cellZ: cell.cellZ, sampler, viewCorridor, densityScale, parents });
    const bounds = ecosystemCellBounds(layer.cell.meters, cell.cellX, cell.cellZ), evaluator = createCellEvaluator({ recipe, layer, bounds, sampler, viewCorridor, overrides, densityScale, competitors });
    const outcome = evaluator.evaluate(x, z, rank, true);
    return Object.freeze({ id: ecosystemInstanceId(layer.id, siteX, siteZ, child), outcome: outcome.outcome, position: { x, z }, rank, cell, culled: rank >= evaluator.maxDensity, maxDensity: evaluator.maxDensity, childRadius: anchor?.radius ?? null,
        density: outcome.density ?? null, excluded: outcome.excluded ?? null, competitor: outcome.competitor ?? null, rule: outcome.rule ?? null, biome: outcome.biome ?? null, inputs: outcome.inputs ?? null, parameters: outcome.parameters ?? null, terrain: outcome.sample?.terrain ?? null });
}

/** A bounded most-recently-used cache of generated cells keyed by tile id (Infinity: keep everything, the bake's choice). @param {number} [limit] */
export function createEcosystemCellCache(limit = Infinity) {
    requireCondition(limit === Infinity || (Number.isSafeInteger(limit) && limit >= 1), 'cell cache limit must be a positive integer or Infinity');
    const entries = new Map();
    return Object.freeze({
        get size() { return entries.size; },
        get(id) { const value = entries.get(id); if (value !== undefined) { entries.delete(id); entries.set(id, value); } return value; },
        set(id, value) { entries.delete(id); entries.set(id, value); while (entries.size > limit) entries.delete(entries.keys().next().value); },
        has(id) { return entries.has(id); },
        delete(id) { return entries.delete(id); },
        clear() { entries.clear(); }
    });
}

const intersects = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

// the features of several tiles that fall inside closed bounds, as one tile
function mergeFeatures(tiles, bounds) {
    let total = 0;
    for (const tile of tiles) total += tile.count;
    const merged = createEcosystemTileData(total);
    for (const tile of tiles) for (let i = 0; i < tile.count; i++) {
        const o = i * F, x = tile.records[o], z = tile.records[o + 2];
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
        merged.records.set(tile.records.subarray(o, o + F), merged.count * F); merged.ids.set(tile.ids.subarray(i * I, i * I + I), merged.count * I); merged.count++;
    }
    return merged;
}

/**
 * Generates a set of cells of one layer, memoizing the referenced cells of higher-priority layers (competitors, parent, `distance.layer.*` targets)
 * through the same cache. `cellSources({layer, cellX, cellZ, haloMeters, layerFeatures})` builds the input sampler of a cell (and may be async);
 * `bounds` skips cells (own or referenced) that do not intersect the landscape.
 * @param {{recipe:any,layer:any,cells:Array<{cellX:number,cellZ:number}>,cellSources:(request:{layer:any,cellX:number,cellZ:number,haloMeters:number,layerFeatures:(layerId:string)=>any})=>any,
 *   overrides?:any,densityScale?:number,cache?:ReturnType<typeof createEcosystemCellCache>,bounds?:any,trace?:boolean}} options
 * @returns {Promise<Array<ReturnType<typeof generateEcosystemCell>>>}
 */
export async function generateEcosystemLayerCells({ recipe, layer, cells, cellSources, overrides = null, densityScale = 1, cache = createEcosystemCellCache(), bounds = null, trace = false }) {
    requireCondition(!!recipe?.layers && !!layer && recipe.layers[layer.id] === layer && Array.isArray(cells) && typeof cellSources === 'function', 'generateEcosystemLayerCells needs a validated recipe, one of its layers, cells and a cell sources factory');
    async function generate(target, cellX, cellZ) {
        const id = ecosystemTileId(target.id, cellX, cellZ), cached = cache.get(id);
        if (cached) return cached;
        const cellBounds = ecosystemCellBounds(target.cell.meters, cellX, cellZ), features = new Map();
        for (const entry of ecosystemLayerReferences(recipe, target)) {
            const reach = ecosystemGrownBounds(cellBounds, entry.reach), tiles = [];
            for (const cell of ecosystemCellsIntersecting(entry.layer, reach)) {
                if (bounds && !intersects(ecosystemCellBounds(entry.layer.cell.meters, cell.cellX, cell.cellZ), bounds)) continue;
                tiles.push((await generate(entry.layer, cell.cellX, cell.cellZ)).tile);
            }
            features.set(entry.layer.id, mergeFeatures(tiles, reach));
        }
        const layerFeatures = layerId => features.get(layerId) ?? null, parentLayer = target.rules.parent?.layer ?? null;
        const sources = await cellSources({ layer: target, cellX, cellZ, haloMeters: ecosystemLayerGenerationHalo(recipe, target), layerFeatures });
        requireCondition(!!sources && !!sources.sampler, 'cellSources must return { sampler, viewCorridor }');
        const result = generateEcosystemCell({ recipe, layer: target, cellX, cellZ, sampler: sources.sampler, viewCorridor: sources.viewCorridor ?? null, overrides, densityScale, competitors: layerFeatures, parents: parentLayer ? layerFeatures(parentLayer) : null, trace: trace && target === layer });
        cache.set(id, result);
        return result;
    }
    const results = [];
    for (const cell of cells) {
        requireInteger(cell?.cellX, -CELL_LIMIT, CELL_LIMIT, 'cellX'); requireInteger(cell?.cellZ, -CELL_LIMIT, CELL_LIMIT, 'cellZ');
        if (bounds && !intersects(ecosystemCellBounds(layer.cell.meters, cell.cellX, cell.cellZ), bounds)) continue;
        results.push(await generate(layer, cell.cellX, cell.cellZ));
    }
    return results;
}
