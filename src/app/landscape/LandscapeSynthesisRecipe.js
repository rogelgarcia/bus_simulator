// Defines the landscape-synthesis-recipe v1 contract: strict validation against the operator catalog, canonical JSON, identity and seeds.
// @ts-check
// A recipe is validated once at this boundary: unknown operators, unknown or missing parameters, out-of-range values, bad seeds, a grid
// that is not a dyadic chunk hierarchy, a working spacing that does not divide the extent, duplicate operator ids, malformed masks and
// a data flow that reads a layer no earlier operator writes are all rejected with actionable messages. Defaults are never filled into
// the validated copy, so the canonical JSON (sorted keys) and the identity hash cover exactly what the author wrote; the executor
// resolves defaults from the catalog through resolveLandscapeSynthesisParameters. The identity also covers the sorted input hashes,
// so two runs with one identity are bit-identical. Operator seeds derive from the recipe seed and the operator id with integer hashing
// only, so re-seeding one operator never reshuffles the others.
import { LANDSCAPE_SYNTHESIS_FAMILIES, LANDSCAPE_SYNTHESIS_LAYERS, LANDSCAPE_SYNTHESIS_OPERATORS, LANDSCAPE_SYNTHESIS_SELECTORS } from './LandscapeSynthesisOperators.js';
import { validateLandscapeRegion } from './LandscapeRegions.js';
import { clonePlainData, freezeData, nearlyEqual, requireCondition, requireFinite, requireId, requireInteger, requireRelativeUrl, requireSha256 } from './internal/LandscapeValidation.js';

export { LANDSCAPE_SYNTHESIS_FAMILIES, LANDSCAPE_SYNTHESIS_LAYERS, LANDSCAPE_SYNTHESIS_OPERATORS, LANDSCAPE_SYNTHESIS_SELECTORS };
export const LANDSCAPE_SYNTHESIS_RECIPE_FORMAT = 'landscape-synthesis-recipe';
export const LANDSCAPE_SYNTHESIS_SCHEMA_VERSION = 1;
export const LANDSCAPE_SYNTHESIS_LIMITS = Object.freeze({ operators: 256, maskDepth: 8, maskBranches: 16, imports: 32, inputHashes: 4096 });
export const LANDSCAPE_SYNTHESIS_COVER_POLICIES = Object.freeze(['keep-source', 'derive']);
export const LANDSCAPE_SYNTHESIS_OUTPUT_CHANNELS = Object.freeze(['height']);
const IMPORT_KINDS = Object.freeze(['heights', 'mask']);
const IMPORT_ENCODINGS = Object.freeze(['raw-float32', 'png-gray8', 'png-gray16', 'exr-float32']);
const PLAN_FILES = Object.freeze(['districts', 'roads', 'shoreline', 'beachPoints', 'landCover']);
const KEYS = Object.freeze({
    recipe: 'format,grid,id,inputs,operators,outputs,overrides,schemaVersion,seaLevel,seed,working',
    grid: 'bounds,chunkIntervals,columns,maxLevel,rows,spacingX,spacingZ',
    bounds: 'maxX,maxZ,minX,minZ',
    working: 'spacing',
    inputs: 'imports,landscape,plan',
    landscape: 'directory,expectedRevision',
    plan: 'beachPoints,districts,landCover,roads,shoreline',
    importEntry: 'encoding,file,id,kind',
    operator: 'enabled,id,mask,op,params,seed',
    outputs: 'channels,coverPolicy,heightCap',
    edge: 'from,to'
});
const encoder = new TextEncoder();

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    const actual = Object.keys(value).sort().join(',');
    requireCondition(actual === keys, `${label} must have exactly the fields ${keys.split(',').join(', ')} (got ${actual || 'none'})`);
}

function requireUint32(value, label) {
    requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff, `${label} must be an unsigned 32-bit integer`);
}

function fmix32(value) {
    let h = Math.imul(value ^ value >>> 16, 0x85ebca6b);
    h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
    return (h ^ h >>> 16) >>> 0;
}

function validatePoint(value, label) {
    requireCondition(Array.isArray(value) && value.length === 2, `${label} must be a world [x, z] pair`);
    requireFinite(value[0], `${label}[0]`); requireFinite(value[1], `${label}[1]`);
}

function validatePolygon(value, label) {
    requireCondition(Array.isArray(value), `${label} must be an array of world [x, z] vertices`);
    value.forEach((entry, i) => validatePoint(entry, `${label}[${i}]`));
    try { validateLandscapeRegion({ type: 'polygon', points: value.map(([x, z]) => ({ x, z })) }); }
    catch (error) { throw new Error(`[Landscape] ${label}: ${String(error.message).replace(/^\[Landscape\] /, '')}`); }
}

function validateItem(value, definition, label) {
    if (definition.type === 'number') {
        requireFinite(value, label);
        requireCondition((definition.min === undefined || value >= definition.min) && (definition.max === undefined || value <= definition.max), `${label} must be in ${definition.min ?? '-inf'}..${definition.max ?? 'inf'} (got ${value})`);
    } else if (definition.type === 'integer') requireInteger(value, definition.min ?? Number.MIN_SAFE_INTEGER, definition.max ?? Number.MAX_SAFE_INTEGER, label);
    else if (definition.type === 'string') {
        requireCondition(typeof value === 'string' && value.length > 0 && value.length <= 512, `${label} must be a non-empty string of at most 512 characters`);
        if (definition.format === 'relative-path') requireRelativeUrl(value, label);
        if (definition.format === 'id') requireId(value, label);
    } else if (definition.type === 'boolean') requireCondition(typeof value === 'boolean', `${label} must be a boolean`);
    else if (definition.type === 'enum') requireCondition(definition.values.includes(value), `${label} must be one of ${definition.values.join(', ')} (got ${JSON.stringify(value)})`);
    else if (definition.type === 'point') validatePoint(value, label);
    else if (definition.type === 'polygon') validatePolygon(value, label);
    else if (definition.type === 'array') {
        requireCondition(Array.isArray(value) && value.length >= (definition.minItems ?? 0) && value.length <= (definition.maxItems ?? 65536), `${label} must be an array of ${definition.minItems ?? 0}..${definition.maxItems ?? 65536} items`);
        value.forEach((entry, i) => validateItem(entry, definition.items, `${label}[${i}]`));
    } else if (definition.type === 'edge') {
        requireKeys(value, KEYS.edge, label);
        requireFinite(value.from, `${label}.from`); requireFinite(value.to, `${label}.to`);
        requireCondition(value.from !== value.to, `${label} needs two different edge values`);
    } else throw new Error(`[Landscape] ${label} has an unsupported catalog type ${definition.type}`);
}

function validateParameters(params, catalog, label) {
    requireCondition(!!params && typeof params === 'object' && !Array.isArray(params), `${label} must be an object`);
    for (const name of Object.keys(params)) requireCondition(Object.hasOwn(catalog, name), `${label}.${name} is not a declared parameter (declared: ${Object.keys(catalog).join(', ')})`);
    for (const [name, definition] of Object.entries(catalog)) {
        const value = params[name];
        if (value === undefined) { requireCondition(!definition.required, `${label}.${name} is required`); continue; }
        if (value === null) { requireCondition((definition.default === null || definition.nullable === true) && !definition.required, `${label}.${name} may not be null`); continue; }
        validateItem(value, definition, `${label}.${name}`);
    }
}

function strictlyDecreasing(values, label) {
    values.forEach((value, i) => requireCondition(i === 0 || value < values[i - 1], `${label} must be strictly decreasing`));
}

// cross-parameter rules that a per-parameter table cannot express
const OPERATOR_RULES = Object.freeze({
    'import-heights': (params, label) => {
        if (params.source === 'raw-float32') {
            for (const key of ['file', 'columns', 'rows']) requireCondition(params[key] !== undefined && params[key] !== null, `${label}.${key} is required for a raw-float32 import`);
        } else for (const key of ['file', 'columns', 'rows', 'coverFile']) requireCondition(params[key] === undefined || params[key] === null, `${label}.${key} applies only to raw-float32 imports`);
    },
    'landform-plateau': (params, label) => {
        const district = params.districtId !== undefined && params.districtId !== null, polygon = params.polygon !== undefined && params.polygon !== null;
        requireCondition(district !== polygon, `${label} needs exactly one of districtId or polygon`);
        if (polygon && params.insideMode !== 'keep') requireCondition(params.heightMeters !== undefined && params.heightMeters !== null, `${label}.heightMeters is required with an explicit polygon unless insideMode is keep`);
        if (params.insideMode === 'keep') requireCondition(params.heightMeters === undefined || params.heightMeters === null, `${label}.heightMeters does not apply when insideMode is keep`);
        edgeBaseRule(params, label);
    },
    'constrain-districts': edgeBaseRule,
    'landform-hills': octaveRule,
    noise: (params, label, definition) => {
        octaveRule(params, label, definition);
        if ((params.shaping ?? 'none') === 'none') requireCondition(!params.ridgedMix, `${label}.ridgedMix requires shaping ridged-mix`);
    },
    warp: octaveRule,
    'landform-valley': (params, label) => {
        params.polyline.forEach((entry, i) => requireCondition(i === 0 || entry[0] !== params.polyline[i - 1][0] || entry[1] !== params.polyline[i - 1][1], `${label}.polyline repeats vertex ${i}`));
    }
});

function edgeBaseRule(params, label) {
    if (params.baseMode === 'explicit') requireCondition(params.baseHeightMeters !== undefined && params.baseHeightMeters !== null, `${label}.baseHeightMeters is required with baseMode explicit`);
}

function octaveRule(params, label, definition) {
    const wavelengths = params.wavelengthsMeters ?? definition.parameters.wavelengthsMeters.default, amplitudes = params.amplitudes ?? definition.parameters.amplitudes.default;
    strictlyDecreasing(wavelengths, `${label}.wavelengthsMeters`);
    requireCondition(wavelengths.length === amplitudes.length, `${label}.amplitudes must match wavelengthsMeters (${wavelengths.length} octaves)`);
}

function validateSelector(value, label, depth, requires) {
    requireCondition(depth <= LANDSCAPE_SYNTHESIS_LIMITS.maskDepth, `${label} nests deeper than ${LANDSCAPE_SYNTHESIS_LIMITS.maskDepth} levels`);
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be a selector object`);
    const definition = LANDSCAPE_SYNTHESIS_SELECTORS[value.type];
    requireCondition(!!definition, `${label}.type must be one of ${Object.keys(LANDSCAPE_SYNTHESIS_SELECTORS).join(', ')} (got ${JSON.stringify(value.type)})`);
    if (value.invert !== undefined) requireCondition(typeof value.invert === 'boolean', `${label}.invert must be a boolean`);
    const { type, invert, selectors, ...params } = value;
    if (definition.combinator) {
        requireCondition(Object.keys(params).length === 0, `${label} (${type}) takes only selectors and invert`);
        requireCondition(Array.isArray(selectors) && selectors.length >= 1 && selectors.length <= LANDSCAPE_SYNTHESIS_LIMITS.maskBranches, `${label}.selectors must hold 1..${LANDSCAPE_SYNTHESIS_LIMITS.maskBranches} selectors`);
        selectors.forEach((entry, i) => validateSelector(entry, `${label}.selectors[${i}]`, depth + 1, requires));
    } else {
        requireCondition(selectors === undefined, `${label} (${type}) does not nest selectors`);
        validateParameters(params, definition.parameters, `${label}`);
        for (const layer of definition.requires) requires.add(layer);
        if (type === 'distance') requires.add(params.feature === 'road' ? 'roadDistance' : 'shoreSigned');
    }
}

function validateGrid(grid) {
    requireKeys(grid, KEYS.grid, 'recipe.grid');
    requireKeys(grid.bounds, KEYS.bounds, 'recipe.grid.bounds');
    for (const key of ['minX', 'maxX', 'minZ', 'maxZ']) requireFinite(grid.bounds[key], `recipe.grid.bounds.${key}`);
    requireCondition(grid.bounds.maxX > grid.bounds.minX && grid.bounds.maxZ > grid.bounds.minZ, 'recipe.grid.bounds must have positive area');
    requireInteger(grid.maxLevel, 0, 12, 'recipe.grid.maxLevel'); requireInteger(grid.chunkIntervals, 1, 4096, 'recipe.grid.chunkIntervals');
    const dimension = grid.chunkIntervals * 2 ** grid.maxLevel + 1;
    requireCondition(grid.columns === dimension && grid.rows === dimension, `recipe.grid must be a dyadic chunk hierarchy: columns = rows = chunkIntervals * 2^maxLevel + 1 = ${dimension}`);
    for (const key of ['spacingX', 'spacingZ']) { requireFinite(grid[key], `recipe.grid.${key}`); requireCondition(grid[key] > 0, `recipe.grid.${key} must be positive`); }
    requireCondition(nearlyEqual((grid.columns - 1) * grid.spacingX, grid.bounds.maxX - grid.bounds.minX) && nearlyEqual((grid.rows - 1) * grid.spacingZ, grid.bounds.maxZ - grid.bounds.minZ),
        'recipe.grid bounds must equal (columns - 1) * spacingX by (rows - 1) * spacingZ');
}

function validateWorking(working, grid) {
    if (working === null) return;
    requireKeys(working, KEYS.working, 'recipe.working');
    requireFinite(working.spacing, 'recipe.working.spacing');
    requireCondition(working.spacing >= Math.max(grid.spacingX, grid.spacingZ), `recipe.working.spacing must be at least the output spacing ${Math.max(grid.spacingX, grid.spacingZ)}`);
    for (const [axis, extent] of [['X', grid.bounds.maxX - grid.bounds.minX], ['Z', grid.bounds.maxZ - grid.bounds.minZ]]) {
        const intervals = extent / working.spacing;
        requireCondition(nearlyEqual(intervals, Math.round(intervals)) && Math.round(intervals) >= 1, `recipe.working.spacing must divide the ${axis} extent ${extent} exactly (got ${intervals} intervals)`);
    }
}

function validateInputs(inputs) {
    requireKeys(inputs, KEYS.inputs, 'recipe.inputs');
    if (inputs.landscape !== null) {
        requireKeys(inputs.landscape, KEYS.landscape, 'recipe.inputs.landscape');
        requireCondition(typeof inputs.landscape.directory === 'string' && inputs.landscape.directory.length > 0 && inputs.landscape.directory.length <= 1024, 'recipe.inputs.landscape.directory must be a path');
        if (inputs.landscape.expectedRevision !== null) requireId(inputs.landscape.expectedRevision, 'recipe.inputs.landscape.expectedRevision');
    }
    if (inputs.plan !== null) {
        requireKeys(inputs.plan, KEYS.plan, 'recipe.inputs.plan');
        for (const key of PLAN_FILES) if (!(key === 'landCover' && inputs.plan[key] === null)) requireRelativeUrl(inputs.plan[key], `recipe.inputs.plan.${key}`);
    }
    requireCondition(Array.isArray(inputs.imports) && inputs.imports.length <= LANDSCAPE_SYNTHESIS_LIMITS.imports, `recipe.inputs.imports must be an array of at most ${LANDSCAPE_SYNTHESIS_LIMITS.imports} entries`);
    const ids = new Set();
    inputs.imports.forEach((entry, i) => {
        requireKeys(entry, KEYS.importEntry, `recipe.inputs.imports[${i}]`);
        requireId(entry.id, `recipe.inputs.imports[${i}].id`); requireCondition(!ids.has(entry.id), `recipe.inputs.imports repeats id ${entry.id}`); ids.add(entry.id);
        requireRelativeUrl(entry.file, `recipe.inputs.imports[${i}].file`);
        requireCondition(IMPORT_KINDS.includes(entry.kind), `recipe.inputs.imports[${i}].kind must be one of ${IMPORT_KINDS.join(', ')}`);
        requireCondition(IMPORT_ENCODINGS.includes(entry.encoding), `recipe.inputs.imports[${i}].encoding must be one of ${IMPORT_ENCODINGS.join(', ')}`);
    });
}

function validateOperators(operators, recipe) {
    requireCondition(Array.isArray(operators) && operators.length >= 1 && operators.length <= LANDSCAPE_SYNTHESIS_LIMITS.operators, `recipe.operators must hold 1..${LANDSCAPE_SYNTHESIS_LIMITS.operators} operators`);
    const ids = new Set(), written = new Set();
    operators.forEach((entry, i) => {
        const label = `recipe.operators[${i}]`;
        requireKeys(entry, KEYS.operator, label);
        requireId(entry.id, `${label}.id`); requireCondition(!ids.has(entry.id), `recipe.operators repeats id ${entry.id}`); ids.add(entry.id);
        const definition = LANDSCAPE_SYNTHESIS_OPERATORS[entry.op];
        requireCondition(!!definition, `${label}.op ${JSON.stringify(entry.op)} is not a declared operator (declared: ${Object.keys(LANDSCAPE_SYNTHESIS_OPERATORS).join(', ')})`);
        requireCondition(typeof entry.enabled === 'boolean', `${label}.enabled must be a boolean`);
        if (entry.seed !== null) requireUint32(entry.seed, `${label}.seed`);
        validateParameters(entry.params, definition.parameters, `${label}.params`);
        OPERATOR_RULES[entry.op]?.(entry.params, `${label} (${entry.op})`, definition);
        const requires = new Set(definition.layers.reads);
        if (entry.mask !== null) validateSelector(entry.mask, `${label}.mask`, 1, requires);
        if (!entry.enabled) return;
        if (entry.op === 'plan-inputs') requireCondition(recipe.inputs.plan !== null, `${label} (plan-inputs) requires recipe.inputs.plan`);
        if (entry.op === 'import-heights' && (entry.params.source ?? 'landscape') === 'landscape') requireCondition(recipe.inputs.landscape !== null, `${label} (import-heights) requires recipe.inputs.landscape for a landscape source`);
        for (const layer of requires) requireCondition(written.has(layer), `${label} (${entry.op}) reads layer ${layer} before any enabled operator writes it`);
        for (const layer of definition.layers.writes) written.add(layer);
    });
    const enabled = operators.filter(entry => entry.enabled), resamples = enabled.filter(entry => entry.op === 'resample');
    requireCondition(resamples.length <= 1, 'recipe.operators may enable at most one resample operator');
    if (resamples.length === 1) requireCondition(enabled[enabled.length - 1].op === 'resample', 'the resample operator must be the last enabled operator');
    if (recipe.working !== null && recipe.working.spacing > Math.max(recipe.grid.spacingX, recipe.grid.spacingZ)) requireCondition(resamples.length === 1, 'a coarser working grid requires an enabled resample operator at the end of recipe.operators');
}

function validateOutputs(outputs) {
    requireKeys(outputs, KEYS.outputs, 'recipe.outputs');
    if (outputs.heightCap !== null) requireFinite(outputs.heightCap, 'recipe.outputs.heightCap');
    requireCondition(LANDSCAPE_SYNTHESIS_COVER_POLICIES.includes(outputs.coverPolicy), `recipe.outputs.coverPolicy must be one of ${LANDSCAPE_SYNTHESIS_COVER_POLICIES.join(', ')}`);
    requireCondition(Array.isArray(outputs.channels) && outputs.channels.every(channel => LANDSCAPE_SYNTHESIS_OUTPUT_CHANNELS.includes(channel)) && new Set(outputs.channels).size === outputs.channels.length,
        `recipe.outputs.channels must list distinct channels among ${LANDSCAPE_SYNTHESIS_OUTPUT_CHANNELS.join(', ')}`);
}

/**
 * Validates, copies and deep-freezes a synthesis recipe. Defaults are not filled in (see resolveLandscapeSynthesisParameters).
 * @param {any} input @returns {any} frozen validated copy
 */
export function validateLandscapeSynthesisRecipe(input) {
    const recipe = clonePlainData(input, 'synthesis recipe');
    requireKeys(recipe, KEYS.recipe, 'recipe');
    requireCondition(recipe.format === LANDSCAPE_SYNTHESIS_RECIPE_FORMAT && recipe.schemaVersion === LANDSCAPE_SYNTHESIS_SCHEMA_VERSION, `recipe must be ${LANDSCAPE_SYNTHESIS_RECIPE_FORMAT} schema ${LANDSCAPE_SYNTHESIS_SCHEMA_VERSION}`);
    requireId(recipe.id, 'recipe.id');
    requireUint32(recipe.seed, 'recipe.seed');
    requireFinite(recipe.seaLevel, 'recipe.seaLevel');
    validateGrid(recipe.grid);
    validateWorking(recipe.working, recipe.grid);
    validateInputs(recipe.inputs);
    validateOutputs(recipe.outputs);
    requireCondition(Array.isArray(recipe.overrides) && recipe.overrides.length === 0, 'recipe.overrides must be an empty array (override evaluation arrives with D2)');
    validateOperators(recipe.operators, recipe);
    return freezeData(recipe);
}

/**
 * Parameters of one validated operator with catalog defaults filled in (frozen).
 * @param {{op:string,params:any}} operator
 */
export function resolveLandscapeSynthesisParameters(operator) {
    const definition = LANDSCAPE_SYNTHESIS_OPERATORS[operator?.op];
    requireCondition(!!definition, `unknown synthesis operator ${JSON.stringify(operator?.op)}`);
    validateParameters(operator.params, definition.parameters, `operator ${operator.op} params`);
    const resolved = {};
    for (const [name, parameter] of Object.entries(definition.parameters)) resolved[name] = operator.params[name] === undefined ? parameter.default ?? null : operator.params[name];
    return freezeData(clonePlainData(resolved, 'resolved parameters'));
}

function canonical(value, label) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { requireFinite(value, label); return JSON.stringify(value); }
    if (Array.isArray(value)) return `[${value.map((entry, i) => canonical(entry, `${label}[${i}]`)).join(',')}]`;
    requireCondition(!!value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be plain JSON data`);
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], `${label}.${key}`)}`).join(',')}}`;
}

/** Canonical JSON (sorted keys, no defaults filled) of a validated recipe. @param {any} recipe */
export function canonicalLandscapeSynthesisJson(recipe) {
    return canonical(validateLandscapeSynthesisRecipe(recipe), 'recipe');
}

/**
 * Identity `synthesis-<24 hex>`: SHA-256 (Web Crypto) over the canonical recipe JSON and the sorted input hashes.
 * @param {any} recipe @param {Array<{id:string,sha256:string}>} inputs hash of every input file and the bound landscape manifest
 * @returns {Promise<string>}
 */
export async function landscapeSynthesisRecipeIdentity(recipe, inputs) {
    const json = canonicalLandscapeSynthesisJson(recipe);
    requireCondition(Array.isArray(inputs) && inputs.length <= LANDSCAPE_SYNTHESIS_LIMITS.inputHashes, 'synthesis identity inputs must be an array of {id, sha256}');
    const ids = new Set();
    const sorted = inputs.map((entry, i) => {
        requireKeys(entry, 'id,sha256', `synthesis identity inputs[${i}]`);
        requireId(entry.id, `synthesis identity inputs[${i}].id`); requireSha256(entry.sha256, `synthesis identity inputs[${i}].sha256`);
        requireCondition(!ids.has(entry.id), `synthesis identity inputs repeat id ${entry.id}`); ids.add(entry.id);
        return { id: entry.id, sha256: entry.sha256 };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    requireCondition(!!globalThis.crypto?.subtle, 'synthesis identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(`{"inputs":${canonical(sorted, 'inputs')},"recipe":${json}}`));
    return `synthesis-${[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 24)}`;
}

/**
 * Deterministic unsigned 32-bit operator seed: murmur-style integer hashing of the operator id bytes salted by the recipe seed.
 * @param {number} recipeSeed @param {string} operatorId
 */
export function landscapeSynthesisOperatorSeed(recipeSeed, operatorId) {
    requireUint32(recipeSeed, 'recipe seed');
    requireId(operatorId, 'operator id');
    const bytes = encoder.encode(operatorId);
    let h = fmix32((recipeSeed ^ 0x9e3779b9) >>> 0);
    for (let i = 0; i < bytes.length; i++) {
        let k = Math.imul(bytes[i] + 1, 0xcc9e2d51);
        k = (k << 15 | k >>> 17) >>> 0;
        h = (h ^ Math.imul(k, 0x1b873593)) >>> 0;
        h = (Math.imul((h << 13 | h >>> 19) >>> 0, 5) + 0xe6546b64) >>> 0;
    }
    return fmix32((h ^ bytes.length) >>> 0);
}

/** Effective seed of an operator: its own seed when set, otherwise derived from the recipe seed and its id. @param {any} recipe @param {{id:string,seed:number|null}} operator */
export function landscapeSynthesisEffectiveSeed(recipe, operator) {
    return operator.seed === null ? landscapeSynthesisOperatorSeed(recipe.seed, operator.id) : operator.seed;
}
