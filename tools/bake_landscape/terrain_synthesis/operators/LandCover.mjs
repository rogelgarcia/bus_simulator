// Implements derive-land-cover: the natural land cover of every sample derived from the final geology, with the full class transition matrix.
// @ts-check
// The operator closes the cover side of a recipe the way geology-channels closes the channel side: it reads the finalized layers (deposit
// type and thickness, regolith, face mask, coastal zone) and the slope of the final height, applies the declared rules in a fixed
// precedence (planning classes copied exactly, water below sea level, sand, rock, alluvium valley floors, then the source class where
// the geology is neutral) and writes the cover layer in place. Every rule is a catalog parameter with units and ranges, and the report
// carries the from -> to transition matrix with sample counts, the per-class totals before and after and the count each rule decided,
// so a published cover can be audited against its recipe. Rock from hardness needs the hardness layer of strata (reported as off
// without it). The executor publishes the derived cover under recipe.outputs.coverPolicy derive (nearest-upsampled from a coarser
// working grid with the planning classes restored from the native cover).
import { terrainGradient } from '../../terrain_fields/TerrainFieldsGrid.mjs';

const DEGREES = 180 / Math.PI;
export const LAND_COVER_CLASS = Object.freeze({ water: 0, sand: 1, grass: 2, forest: 3, rock: 4 });
const SAND_DEPOSITS = Object.freeze([4, 5]), TALUS = 1, ALLUVIUM = 3;
const RULES = Object.freeze(['planning', 'water', 'sand-deposit', 'sand-zone', 'rock-face', 'rock-slope', 'rock-talus', 'rock-bedrock', 'grass-alluvium', 'source-natural', 'emerged']);

/**
 * Transition matrix and totals of a cover change: counts keyed by source class then target class (observed pairs only), the per-class
 * totals before and after, and the changed sample count.
 * @param {Uint8Array} before @param {Uint8Array} after
 */
export function coverTransitionMatrix(before, after) {
    if (before.length !== after.length) throw new Error('[Synthesis] coverTransitionMatrix needs two rasters of one length');
    const counts = new Uint32Array(65536), totalsBefore = new Uint32Array(256), totalsAfter = new Uint32Array(256);
    let changed = 0;
    for (let i = 0; i < before.length; i++) {
        counts[before[i] * 256 + after[i]]++; totalsBefore[before[i]]++; totalsAfter[after[i]]++;
        if (before[i] !== after[i]) changed++;
    }
    const matrix = {};
    for (let from = 0; from < 256; from++) {
        if (!totalsBefore[from]) continue;
        const row = {};
        for (let to = 0; to < 256; to++) if (counts[from * 256 + to]) row[to] = counts[from * 256 + to];
        matrix[from] = row;
    }
    const totals = {};
    for (let id = 0; id < 256; id++) if (totalsBefore[id] || totalsAfter[id]) totals[id] = { before: totalsBefore[id], after: totalsAfter[id], delta: totalsAfter[id] - totalsBefore[id] };
    return { samples: before.length, changedSamples: changed, matrix, totals };
}

async function deriveLandCover(context) {
    const { params } = context.operator, { grid, scope, memory, seaLevel, layers } = context, { columns, rows } = grid, n = columns * rows;
    if (context.operator.mask !== null) throw new Error(`[Synthesis] operator ${context.operator.id}: derive-land-cover decides every sample and does not take a mask`);
    const heights = layers.get('height'), cover = layers.get('cover'), regolith = layers.get('regolith'), depositType = layers.get('depositType'), depositThickness = layers.get('depositThickness');
    const faceMask = layers.get('faceMask'), coastalZone = layers.get('coastalZone'), hardness = layers.has('hardness') ? layers.get('hardness') : null;
    const before = scope.allocate('cover-before', Uint8Array, n);
    before.set(cover);
    const planning = new Uint8Array(256), sandZone = new Uint8Array(16);
    for (const id of params.planningClasses) planning[id] = 1;
    for (const id of params.sandCoastalZones) sandZone[id] = 1;
    const prefix = `op/${context.operator.id}/cover-`, { dhdx, dhdz } = terrainGradient(grid, heights, memory, prefix);
    const tanRock = Math.tan(params.rockSlopeDegrees / DEGREES), tanBedrock = Math.tan(params.bedrockSlopeDegrees / DEGREES), tanValley = Math.tan(params.valleyFloorSlopeDegrees / DEGREES);
    const decided = Object.fromEntries(RULES.map(rule => [rule, 0]));
    for (let row = 0; row < rows; row++) {
        if (row % 64 === 0) context.checkpoint();
        for (let column = 0; column < columns; column++) {
            const i = row * columns + column, source = before[i];
            let rule, next;
            if (planning[source]) { rule = 'planning'; next = source; }
            else if (heights[i] < seaLevel) { rule = 'water'; next = LAND_COVER_CLASS.water; }
            else {
                const tangent = Math.hypot(dhdx[i], dhdz[i]), thickness = depositThickness[i], type = depositType[i], mantle = regolith[i] + thickness;
                if (thickness > 0 && SAND_DEPOSITS.includes(type)) { rule = 'sand-deposit'; next = LAND_COVER_CLASS.sand; }
                else if (coastalZone[i] < 16 && sandZone[coastalZone[i]]) { rule = 'sand-zone'; next = LAND_COVER_CLASS.sand; }
                else if (faceMask[i] >= params.faceMaskThreshold) { rule = 'rock-face'; next = LAND_COVER_CLASS.rock; }
                else if (tangent >= tanRock) { rule = 'rock-slope'; next = LAND_COVER_CLASS.rock; }
                else if (type === TALUS && thickness >= params.talusRockMinMeters) { rule = 'rock-talus'; next = LAND_COVER_CLASS.rock; }
                else if (hardness && mantle <= params.exposedMantleMeters && tangent >= tanBedrock && hardness[i] >= params.rockHardnessThreshold) { rule = 'rock-bedrock'; next = LAND_COVER_CLASS.rock; }
                else if (type === ALLUVIUM && thickness >= params.alluviumGrassMinMeters && tangent <= tanValley) { rule = 'grass-alluvium'; next = LAND_COVER_CLASS.grass; }
                else if (source >= LAND_COVER_CLASS.sand && source <= LAND_COVER_CLASS.rock) { rule = 'source-natural'; next = source; }
                else { rule = 'emerged'; next = params.emergedLandClass; }
            }
            cover[i] = next; decided[rule]++;
        }
    }
    memory.free(`${prefix}dhdx`, `${prefix}dhdz`);
    const transition = coverTransitionMatrix(before, cover);
    scope.free('cover-before');
    return { rules: { ...params, hardnessApplied: hardness !== null }, decidedByRule: decided, ...transition };
}

export const LAND_COVER_OPERATORS = Object.freeze({ 'derive-land-cover': deriveLandCover });
