// Authors the far-shoreline plan of the AI 596 D5 surround: the v3 design shoreline continued north and south to the surround bounds, displaced seaward where the recipe's spur ridges run into the sea and notched by the recipe's coves.
// @ts-check
// The far shoreline is the design shoreline of the surround recipe (`plan-inputs` turns it into the signed distance field the beach,
// cove and shoreline-constraint operators work in). Inside the city extent it is the v3 design shoreline verbatim (801 points,
// (880, 4000) to (1048, 0), sea to the west); beyond it, a C1 cubic Hermite base coast x(z) through the control knots below continues
// the end directions of the design line (the first tangent is the design line's own last segment) out to 100 m beyond the surround
// bounds, so every sample of the 32 km grid has the far shoreline on one side. The headlands are not drawn: the recipe's `spurs`
// operator (an anisotropic ridged `landform-hills` field stretched across the coast) is sampled on the base coast with the very
// seed and parameters the engine resolves, and where that field is high the coast is displaced seaward (SPUR_DISPLACEMENT: a
// smoothstep of the relief over its amplitude up to maxMeters, blurred along the coast and fading in with the distance from the
// design line's ends like the recipe's spur mask), so each ridge of the field runs into the sea on a rounded promontory whose
// outline follows the field's own contour. The recipe's coves are written
// in as the arcs of their elliptical footprints that lie landward of that coast, traced to their two crossings with it (bisected),
// with a small deterministic wobble that vanishes at the crossings; a cove's footprint center (3/8 of its length landward of the
// recipe center) sits on the coast. `node tools/bake_landscape/terrain_synthesis/surround/plan/author.mjs` rewrites
// `far_shoreline.json` from the recipe (reporting a cove center off that rule and the spur headlands it produced); the unit test
// rebuilds the line from the committed file's design points and the recipe and expects the committed file.
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHillsRelief } from '../../operators/Landforms.mjs';
import { landscapeSynthesisEffectiveSeed, resolveLandscapeSynthesisParameters } from '../../../../../src/app/landscape/LandscapeSynthesisRecipe.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../../../..');
export const SURROUND_RECIPE_FILE = 'tools/bake_landscape/terrain_synthesis/recipes/coastal-v3-surround.json';
export const FAR_SHORELINE_FILE = 'tools/bake_landscape/terrain_synthesis/surround/plan/far_shoreline.json';
export const FAR_SHORELINE_ORDER = 'X east, Y sea level, Z north; metres';
/** Sampling step of the continued coast and of the cove arcs (meters). */
export const FAR_SHORELINE_STEP = 20;
/** The recipe operator whose field shapes the headlands. */
export const SPUR_OPERATOR_ID = 'spurs';
/**
 * Seaward displacement of the base coast by the spur field sampled on it: 0 up to `from` (relief over amplitude), maxMeters from `to`, a
 * smoothstep between, smoothed along the coast with a Gaussian of smoothingMeters (so a ridge bulges as a rounded promontory, not a
 * spike) and faded in from endFadeFromMeters to endFadeToMeters of the design line's ends (where the recipe's spur mask fades in too).
 */
export const SPUR_DISPLACEMENT = Object.freeze({ maxMeters: 1000, from: 0, to: .2, smoothingMeters: 180, endFadeFromMeters: 2000, endFadeToMeters: 4500 });
/** A spur headland is a local maximum of the displacement of at least this reach, at least this far from the next. */
export const SPUR_HEADLAND = Object.freeze({ minMeters: 300, separationMeters: 1000 });
/** The design shoreline ends the far shoreline continues: north (880, 4000) heading NNW, south (1048, 0) heading SSE. */
export const DESIGN_ENDS = Object.freeze({ north: Object.freeze({ x: 880, z: 4000, previous: Object.freeze({ x: 907.634, z: 3900 }) }), south: Object.freeze({ x: 1048, z: 0, previous: Object.freeze({ x: 1012.5, z: 100 }) }) });
/** Control knots [x, z] of the gently meandering base coast (the sea lies west: smaller x is seaward), from the design end outward to 100 m beyond the bounds. */
export const FAR_SHORELINE_KNOTS = Object.freeze({
    north: Object.freeze([[880, 4000], [800, 4600], [760, 5400], [820, 6300], [950, 7200], [1000, 8200], [900, 9200], [820, 10200], [900, 11200], [1050, 12200], [1000, 13200], [850, 14300], [800, 15400], [900, 16400], [1000, 17300], [950, 18100]].map(Object.freeze)),
    south: Object.freeze([[1048, 0], [1150, -400], [1250, -1000], [1300, -1800], [1250, -2700], [1150, -3700], [1050, -4800], [1000, -6000], [1100, -7000], [1250, -8000], [1300, -9000], [1200, -10200], [1050, -11400], [1000, -12500], [1100, -13500], [1150, -14100]].map(Object.freeze))
});
/** Outline wobble of a cove arc: amplitude as a fraction of the width, two harmonics over the arc with phases from the center. */
const ARC_WOBBLE = Object.freeze({ amplitude: .025, harmonics: Object.freeze([[3, .65], [7, .35]]) });
const round1 = value => Math.round(value * 10) / 10;
const round3 = value => Math.round(value * 1000) / 1000;
const smoothstep = (edge0, edge1, value) => { const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/**
 * Cubic Hermite x(z) through the knots (finite-difference tangents; the first tangent is given), evaluated at z.
 * @param {ReadonlyArray<ReadonlyArray<number>>} knots [x, z] with z strictly monotonic @param {number} firstTangent dx/dz at the first knot
 */
export function createCoastCurve(knots, firstTangent) {
    const count = knots.length, tangents = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        if (i === 0) tangents[i] = firstTangent;
        else if (i === count - 1) tangents[i] = (knots[i][0] - knots[i - 1][0]) / (knots[i][1] - knots[i - 1][1]);
        else tangents[i] = (knots[i + 1][0] - knots[i - 1][0]) / (knots[i + 1][1] - knots[i - 1][1]);
    }
    const ascending = knots[count - 1][1] > knots[0][1];
    return z => {
        let i = 0;
        while (i + 2 < count && (ascending ? z > knots[i + 1][1] : z < knots[i + 1][1])) i++;
        const [x0, z0] = knots[i], [x1, z1] = knots[i + 1], h = z1 - z0, t = (z - z0) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * x0 + (t3 - 2 * t2 + t) * h * tangents[i] + (-2 * t3 + 3 * t2) * x1 + (t3 - t2) * h * tangents[i + 1];
    };
}

/** The continued base coast x(z) north of the design line (z >= 4000) and south of it (z <= 0); `at` refuses the design range. */
export function farShorelineBase() {
    const north = createCoastCurve(FAR_SHORELINE_KNOTS.north, (DESIGN_ENDS.north.x - DESIGN_ENDS.north.previous.x) / (DESIGN_ENDS.north.z - DESIGN_ENDS.north.previous.z));
    const south = createCoastCurve(FAR_SHORELINE_KNOTS.south, (DESIGN_ENDS.south.x - DESIGN_ENDS.south.previous.x) / (DESIGN_ENDS.south.z - DESIGN_ENDS.south.previous.z));
    const at = z => {
        if (z >= DESIGN_ENDS.north.z) return north(z);
        if (z <= DESIGN_ENDS.south.z) return south(z);
        throw new Error(`[Surround] z ${z} lies inside the design shoreline's range; the base coast continues it only outside 0..4000`);
    };
    return { north, south, at, zRange: { north: [DESIGN_ENDS.north.z, FAR_SHORELINE_KNOTS.north[FAR_SHORELINE_KNOTS.north.length - 1][1]], south: [FAR_SHORELINE_KNOTS.south[FAR_SHORELINE_KNOTS.south.length - 1][1], DESIGN_ENDS.south.z] } };
}

/** The spur field of a recipe: the world-anchored relief sampler of its `spurs` landform-hills operator with the engine's seed and resolved parameters. @param {any} recipe */
export function spurField(recipe) {
    const operator = recipe.operators.find(entry => entry.enabled && entry.id === SPUR_OPERATOR_ID);
    if (!operator || operator.op !== 'landform-hills') throw new Error(`[Surround] the surround recipe needs an enabled landform-hills operator "${SPUR_OPERATOR_ID}"`);
    const params = resolveLandscapeSynthesisParameters(operator);
    return { relief: createHillsRelief(landscapeSynthesisEffectiveSeed(recipe, operator), params), amplitudeMeters: params.amplitudeMeters, operator, params };
}

/**
 * The far coast x(z) outside the design range: the base coast displaced seaward by the spur field sampled on it (SPUR_DISPLACEMENT).
 * @param {any} recipe
 */
export function farShorelineCoast(recipe) {
    const base = farShorelineBase(), spur = spurField(recipe), { maxMeters, from, to, smoothingMeters, endFadeFromMeters, endFadeToMeters } = SPUR_DISPLACEMENT;
    const raw = z => maxMeters * smoothstep(from, to, spur.relief(base.at(z), z) / spur.amplitudeMeters);
    // the raw displacement tabulated every step along each continuation and blurred along the coast (3 sigma taps, clamped at the ends)
    const sigma = smoothingMeters / FAR_SHORELINE_STEP, reach = Math.ceil(3 * sigma), tables = {};
    for (const [name, [from0, to0]] of Object.entries(base.zRange)) {
        const count = Math.round((to0 - from0) / FAR_SHORELINE_STEP) + 1, values = new Float64Array(count), smoothed = new Float64Array(count);
        for (let i = 0; i < count; i++) values[i] = raw(from0 + i * FAR_SHORELINE_STEP);
        for (let i = 0; i < count; i++) {
            let sum = 0, weight = 0;
            for (let j = Math.max(0, i - reach); j <= Math.min(count - 1, i + reach); j++) { const w = Math.exp(-.5 * ((j - i) / sigma) ** 2); sum += w * values[j]; weight += w; }
            smoothed[i] = sum / weight;
        }
        tables[name] = { from: from0, smoothed };
    }
    const displacement = z => {
        const table = z >= DESIGN_ENDS.north.z ? tables.north : tables.south, edge = z >= DESIGN_ENDS.north.z ? z - DESIGN_ENDS.north.z : DESIGN_ENDS.south.z - z;
        const position = (z - table.from) / FAR_SHORELINE_STEP, i = Math.max(0, Math.min(table.smoothed.length - 2, Math.floor(position))), t = Math.max(0, Math.min(1, position - i));
        return (table.smoothed[i] * (1 - t) + table.smoothed[i + 1] * t) * smoothstep(endFadeFromMeters, endFadeToMeters, edge);
    };
    return { base, spur, displacement, at: z => base.at(z) - displacement(z), zRange: base.zRange };
}

/**
 * The spur headlands of the far coast: local maxima of the displacement along both continuations (sampled every step), at least
 * SPUR_HEADLAND.minMeters seaward and separated by SPUR_HEADLAND.separationMeters, most prominent first.
 * @param {ReturnType<typeof farShorelineCoast>} coast
 */
export function farShorelineHeadlands(coast) {
    const candidates = [];
    for (const [from, to] of [coast.zRange.north, coast.zRange.south]) {
        let previous = null, before = null;
        for (let z = from; z <= to; z += FAR_SHORELINE_STEP) {
            const value = coast.displacement(z);
            if (previous !== null && before !== null && previous.value >= SPUR_HEADLAND.minMeters && previous.value >= before.value && previous.value > value) candidates.push({ z: previous.z, x: round3(coast.at(previous.z)), baseX: round3(coast.base.at(previous.z)), displacementMeters: round3(previous.value) });
            before = previous; previous = { z, value };
        }
    }
    candidates.sort((p, q) => q.displacementMeters - p.displacementMeters);
    const headlands = [];
    for (const candidate of candidates) if (headlands.every(entry => Math.abs(entry.z - candidate.z) >= SPUR_HEADLAND.separationMeters)) headlands.push(candidate);
    return headlands;
}

/** Where a promontory's footprint center lies: 3/8 of its length seaward (headland) or landward (cove) of the recipe center. */
export const promontoryFootprintCenterX = feature => feature.center[0] - (feature.kind === 'headland' ? 3 : -3) * feature.lengthMeters / 8;

/**
 * Boundary point [x, z] of a promontory footprint at the angle theta (0 at the seaward tip, pi at the landward end): the ellipse centred on
 * the footprint center with semi-axis 5/8 of the length along the seaward axis (bearing 270, seaward = -x) and half the width along the coast.
 * @param {{kind:'headland'|'cove',center:number[],lengthMeters:number,widthMeters:number,bearingDegrees:number}} feature @param {number} theta
 */
export function promontoryBoundary(feature, theta) {
    if (feature.bearingDegrees !== 270) throw new Error(`[Surround] the far shoreline outlines promontories at bearing 270 only (got ${feature.bearingDegrees})`);
    return [promontoryFootprintCenterX(feature) - 5 * feature.lengthMeters / 8 * Math.cos(theta), feature.center[1] + feature.widthMeters / 2 * Math.sin(theta)];
}

/**
 * The coast arc of a promontory: the part of its footprint boundary seaward of the coast (headland, around theta 0) or landward of it
 * (cove, around theta pi), traced to its two crossings with the coast (bisected to 1e-9 rad) and sampled about every `step` meters, each
 * sample offset across the coast by the wobble (zero at both crossings); points ordered from north to south with the crossings first and
 * last. Returns the points and the crossing angles.
 * @param {any} feature @param {{at:(z:number)=>number}} coast @param {{step?:number}} [options]
 */
export function promontoryArc(feature, coast, { step = FAR_SHORELINE_STEP } = {}) {
    const headland = feature.kind === 'headland', start = headland ? 0 : Math.PI;
    const beyond = theta => { const [x, z] = promontoryBoundary(feature, theta); const line = coast.at(z); return headland ? x < line : x > line; };
    if (!beyond(start)) throw new Error(`[Surround] ${feature.id ?? feature.kind}: the footprint's far end does not clear the coast`);
    const crossing = direction => {
        let inside = start, outside = start;
        for (let k = 1; k <= 1800; k++) { outside = start + direction * k * Math.PI / 1800; if (!beyond(outside)) break; inside = outside; if (k === 1800) throw new Error(`[Surround] ${feature.id ?? feature.kind}: the footprint never meets the coast`); }
        for (let k = 0; k < 60; k++) { const middle = (inside + outside) / 2; if (beyond(middle)) inside = middle; else outside = middle; }
        return (inside + outside) / 2;
    };
    const thetaA = crossing(1), thetaB = crossing(-1), a = 5 * feature.lengthMeters / 8, b = feature.widthMeters / 2;
    const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))), count = Math.max(2, Math.ceil(perimeter * (thetaA - thetaB) / (2 * Math.PI) / step));
    const [cx, cz] = feature.center, phases = ARC_WOBBLE.harmonics.map((_, k) => (cx + (k + 1) * cz) * .0137), amplitude = ARC_WOBBLE.amplitude * feature.widthMeters;
    const points = [];
    for (let i = 0; i <= count; i++) {
        const theta = thetaB + (thetaA - thetaB) * i / count, [x, z] = promontoryBoundary(feature, theta), fraction = i / count, envelope = Math.sin(Math.PI * fraction);
        let wobble = 0;
        for (let k = 0; k < ARC_WOBBLE.harmonics.length; k++) wobble += ARC_WOBBLE.harmonics[k][1] * Math.sin(ARC_WOBBLE.harmonics[k][0] * theta + phases[k]);
        points.push({ x: x + (headland ? -1 : 1) * amplitude * envelope * wobble, z, order: fraction });
    }
    if (points[0].z < points[points.length - 1].z) { points.reverse(); for (const point of points) point.order = 1 - point.order; }
    return { points, thetaA, thetaB, zNorth: Math.max(points[0].z, points[points.length - 1].z), zSouth: Math.min(points[0].z, points[points.length - 1].z) };
}

/** The promontory features of a validated or plain surround recipe (enabled landform-headland / landform-cove operators). @param {any} recipe */
export function recipePromontories(recipe) {
    return recipe.operators.filter(entry => entry.enabled && (entry.op === 'landform-headland' || entry.op === 'landform-cove'))
        .map(entry => ({ id: entry.id, kind: entry.op === 'landform-headland' ? 'headland' : 'cove', center: entry.params.center, lengthMeters: entry.params.lengthMeters, widthMeters: entry.params.widthMeters, bearingDegrees: entry.params.bearingDegrees ?? 270 }));
}

/**
 * The far shoreline polyline: the continued coast north of the design line (north end first), the design points verbatim, then the
 * continued coast south of it; every promontory replaces the coast samples between its two crossings by its arc.
 * @param {{designPoints:ReadonlyArray<ReadonlyArray<number>>,recipe:any}} options design points as [x, y, z] from (880, 4000) to (1048, 0)
 */
export function buildFarShoreline({ designPoints, recipe }) {
    const first = designPoints[0], last = designPoints[designPoints.length - 1];
    if (first[0] !== DESIGN_ENDS.north.x || first[2] !== DESIGN_ENDS.north.z || last[0] !== DESIGN_ENDS.south.x || last[2] !== DESIGN_ENDS.south.z) throw new Error('[Surround] the design shoreline must run from (880, 4000) to (1048, 0)');
    const coast = farShorelineCoast(recipe), arcs = recipePromontories(recipe).map(feature => ({ feature, ...promontoryArc(feature, coast) }));
    for (const arc of arcs) {
        if (arc.zSouth < DESIGN_ENDS.north.z && arc.zNorth > DESIGN_ENDS.south.z) throw new Error(`[Surround] ${arc.feature.id} reaches into the design shoreline's range`);
        for (const other of arcs) if (other !== arc && other.zSouth < arc.zNorth && other.zNorth > arc.zSouth) throw new Error(`[Surround] the footprints of ${arc.feature.id} and ${other.feature.id} overlap along the coast`);
    }
    // the continued coast from the design end outward (excluding the end itself), its samples inside an arc's span replaced by the arc; items
    // sort by a station key that keeps every arc between the coast samples around it in travel order (south of the design line, keys are negative)
    const continued = (from, to) => {
        const direction = to > from ? 1 : -1, items = [];
        for (let z = from + direction * FAR_SHORELINE_STEP; direction > 0 ? z <= to : z >= to; z += direction * FAR_SHORELINE_STEP) {
            const station = round3(z);
            if (arcs.some(arc => station >= arc.zSouth && station <= arc.zNorth)) continue;
            items.push({ key: station, point: [round3(coast.at(station)), 0, station] });
        }
        for (const arc of arcs) {
            if (direction > 0 ? arc.zSouth <= from : arc.zNorth >= from) continue;
            for (const point of arc.points) items.push({ key: arc.zNorth - (arc.zNorth - arc.zSouth) * point.order, point: [round3(point.x), 0, round3(point.z)] });
        }
        items.sort((p, q) => q.key - p.key);
        return items.map(item => item.point);
    };
    const north = continued(DESIGN_ENDS.north.z, coast.zRange.north[1]), south = continued(DESIGN_ENDS.south.z, coast.zRange.south[0]);
    return { coordinate_order: FAR_SHORELINE_ORDER, points_xyz_m: [...north, ...designPoints.map(point => [point[0], 0, point[2]]), ...south] };
}

/** Reads the v3 design shoreline through the landscape manifest's planning-shoreline reference. @param {string} directory */
async function readDesignShoreline(directory) {
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), reference = manifest.references.find(entry => entry.role === 'planning-shoreline');
    if (!reference) throw new Error(`[Surround] ${directory} has no planning-shoreline reference`);
    return JSON.parse(await readFile(path.join(directory, reference.url), 'utf8')).points_xyz_m;
}

async function main() {
    const landscape = process.argv[2] ?? 'assets/public/landscape/coastal-city-v3', recipe = JSON.parse(await readFile(path.resolve(ROOT, SURROUND_RECIPE_FILE), 'utf8'));
    const coast = farShorelineCoast(recipe);
    for (const feature of recipePromontories(recipe)) {
        const line = coast.at(feature.center[1]), footprint = promontoryFootprintCenterX(feature), expected = round1(line + (feature.kind === 'headland' ? 3 : -3) * feature.lengthMeters / 8), arc = promontoryArc(feature, coast);
        console.log(`${feature.id} (${feature.kind}) center (${feature.center[0]}, ${feature.center[1]}): footprint center x ${round1(footprint)} on coast x ${round1(line)} (displacement ${round1(coast.displacement(feature.center[1]))} m)${Math.abs(footprint - line) > .05 ? `  <- set the recipe center x to ${expected}` : ''}; arc z ${round1(arc.zSouth)}..${round1(arc.zNorth)}, ${arc.points.length} points`);
    }
    for (const headland of farShorelineHeadlands(coast)) console.log(`spur headland at z ${headland.z}: coast x ${headland.x} (base ${headland.baseX}, ${headland.displacementMeters} m seaward)`);
    const designPoints = await readDesignShoreline(path.resolve(ROOT, landscape)), shoreline = buildFarShoreline({ designPoints, recipe });
    await writeFile(path.resolve(ROOT, FAR_SHORELINE_FILE), JSON.stringify(shoreline) + '\n');
    console.log(`${FAR_SHORELINE_FILE}: ${shoreline.points_xyz_m.length} points (${designPoints.length} design points), z ${shoreline.points_xyz_m[0][2]} .. ${shoreline.points_xyz_m[shoreline.points_xyz_m.length - 1][2]}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
