// Runtime side of landscape-surface-model v1: the rule tables as compile-time defines, the geology layers of the field array, the diagnostics catalog and the exact JavaScript sampler over the resident data.
// @ts-check
// AI 598 D1. The geology streams into the terrain-field array as three layers per native slot after the four field layers (the two geology field
// layers verbatim, then one packed categorical layer whose RGBA bytes are depositType, lithology, drainage and coastalZone in the halo'd page layout,
// read with texelFetch at the four aligned samples and never filtered), so no sampler is added; uTerrainFieldsState.w becomes 7 and bit 2 of its z
// flags says the geology is bound (bit 3: the override layer is resident before the appearance layer). The model's constants are compile-time tables
// (landscapeSurfaceModelDefines), never uniforms, and the chunk compiles into the diagnostics variant only until D3 composites materials with it.
import { LANDSCAPE_GEOLOGY_CATEGORIES, LANDSCAPE_GEOLOGY_CHANNELS, LANDSCAPE_SURFACE_CATEGORIES, LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_INPUTS, LANDSCAPE_SURFACE_INPUT_INDEX,
    LANDSCAPE_SURFACE_MODEL, LANDSCAPE_SURFACE_SUBSTRATES, LANDSCAPE_SURFACE_TARGETS, applyLandscapeSurfaceOverride, compileLandscapeSurfaceRecipe, createLandscapeSurfaceOverride,
    createLandscapeSurfaceResult, describeLandscapeSurface, encodeLandscapeGeologyChannel, landscapeSurfaceInputsFrom, sampleLandscapeSurface, sampleLandscapeSurfaceOverrideLayer } from '../../../app/landscape/index.js';
import { landscapePlanningCover } from './LandscapeTerrainAppearance.js';

const INDEX = LANDSCAPE_SURFACE_INPUT_INDEX;

export const LANDSCAPE_SURFACE_MODEL_RUNTIME = Object.freeze({
    id: 'landscape-surface-model-runtime-v1', modes: Object.freeze(['on', 'off']), defaultMode: 'on',
    // array layers per native slot: the four field layers, then the two geology field layers and the packed categorical layer
    layers: Object.freeze({ fields: 4, geology: 3, perPageWithGeology: 7, geologyStart: 4, categorical: 6, categoricalChannels: Object.freeze(['depositType', 'lithology', 'drainage', 'coastalZone']) }),
    flags: Object.freeze({ fields: 1, appearanceLayer: 2, geology: 4, overrides: 8, model: 16 }),
    diagnostics: Object.freeze(['surface-substrate', 'surface-cover', 'surface-fraction', 'surface-wetness', 'surface-disturbance']),
    geologyStatuses: Object.freeze(['pending', 'active', 'active-partial', 'absent', 'invalid', 'binding-mismatch', 'stale', 'budget-denied', 'disabled']),
    chunk: 'chunks/landscape/surface_model.glsl'
});

/** @param {string} mode */
export function landscapeSurfaceModelMode(mode) {
    if (!LANDSCAPE_SURFACE_MODEL_RUNTIME.modes.includes(mode)) throw new Error(`[LandscapeSurface] landscapeSurfaceModel must be one of ${LANDSCAPE_SURFACE_MODEL_RUNTIME.modes.join(', ')}; received ${mode}`);
    return mode;
}

const glslFloat = value => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`[LandscapeSurface] Constant ${value} is not finite`);
    const text = String(value);
    return /[.e]/.test(text) ? text : `${text}.0`;
};
const glslInt = value => {
    if (!Number.isSafeInteger(value)) throw new Error(`[LandscapeSurface] Constant ${value} is not an integer`);
    return `(${value})`;
};
const vectorList = (values, stride, type) => Array.from({ length: values.length / stride }, (_, i) => `${type}(${Array.from({ length: stride }, (_, k) => type.startsWith('i') ? String(values[i * stride + k]) : glslFloat(values[i * stride + k])).join(', ')})`).join(', ');

// the GLSL writes consecutive input blocks: this pins the vector layout the defines describe
function requireConsecutive(ids, label) {
    ids.forEach((id, k) => { if (INDEX[id] !== INDEX[ids[0]] + k) throw new Error(`[LandscapeSurface] The ${label} inputs are not consecutive in the input vector`); });
    return INDEX[ids[0]];
}

/** Compile-time constants of chunks/landscape/surface_model.glsl: the catalog sizes, the input layout, the rule tables and the neutrals of a recipe. @param {any} recipe */
export function landscapeSurfaceModelDefines(recipe) {
    const program = compileLandscapeSurfaceRecipe(recipe), categories = Object.fromEntries(LANDSCAPE_SURFACE_CATEGORIES.map(category => [category.name, category]));
    const fields = requireConsecutive(['wetness', 'flow', 'deposition', 'rockExposure', 'skyView', 'shoreDistance', 'convexity', 'slopeDegrees'], 'terrain field');
    const geology = requireConsecutive(['bedrockOffset', 'regolith', 'depositThickness', 'wear', 'geologyDeposition', 'geologyFlow', 'waveExposure', 'faceMask'], 'geology');
    const soils = requireConsecutive(LANDSCAPE_SURFACE_MODEL.soils.map(soil => `soil.${soil}`), 'soil');
    for (const category of LANDSCAPE_SURFACE_CATEGORIES) requireConsecutive(LANDSCAPE_SURFACE_INPUTS.slice(category.inputStart, category.inputStart + category.count).map(definition => definition.id), category.name);
    return Object.freeze({
        LANDSCAPE_SURFACE_SUBSTRATE_COUNT: glslInt(LANDSCAPE_SURFACE_SUBSTRATES.length), LANDSCAPE_SURFACE_COVER_COUNT: glslInt(LANDSCAPE_SURFACE_COVERS.length),
        LANDSCAPE_SURFACE_SOIL_COUNT: glslInt(LANDSCAPE_SURFACE_MODEL.soils.length), LANDSCAPE_SURFACE_INPUT_COUNT: glslInt(LANDSCAPE_SURFACE_INPUTS.length),
        LANDSCAPE_SURFACE_RULE_COUNT: glslInt(program.ruleCount), LANDSCAPE_SURFACE_TERM_COUNT: glslInt(program.termCount),
        LANDSCAPE_SURFACE_DEPOSIT_COUNT: glslInt(categories.depositType.count), LANDSCAPE_SURFACE_DRAINAGE_COUNT: glslInt(categories.drainage.count), LANDSCAPE_SURFACE_ZONE_COUNT: glslInt(categories.coastalZone.count),
        LANDSCAPE_SURFACE_TARGET_COVER: glslInt(LANDSCAPE_SURFACE_TARGETS.cover), LANDSCAPE_SURFACE_TARGET_FRACTION: glslInt(LANDSCAPE_SURFACE_TARGETS.fraction), LANDSCAPE_SURFACE_TARGET_WETNESS: glslInt(LANDSCAPE_SURFACE_TARGETS.wetness),
        LANDSCAPE_SURFACE_INPUT_SOIL: glslInt(soils), LANDSCAPE_SURFACE_INPUT_PLANNING: glslInt(INDEX.planningShare), LANDSCAPE_SURFACE_INPUT_FIELDS: glslInt(fields), LANDSCAPE_SURFACE_INPUT_GEOLOGY: glslInt(geology),
        LANDSCAPE_SURFACE_INPUT_DEPOSIT: glslInt(categories.depositType.inputStart), LANDSCAPE_SURFACE_INPUT_DRAINAGE: glslInt(categories.drainage.inputStart), LANDSCAPE_SURFACE_INPUT_ZONE: glslInt(categories.coastalZone.inputStart),
        LANDSCAPE_SURFACE_INPUT_HARDNESS: glslInt(INDEX.hardness), LANDSCAPE_SURFACE_INPUT_SLOPE: glslInt(INDEX.geometricSlopeDegrees), LANDSCAPE_SURFACE_INPUT_HEIGHT: glslInt(INDEX.heightAboveSea),
        LANDSCAPE_SURFACE_INPUT_MOISTURE: glslInt(INDEX.catenaMoisture), LANDSCAPE_SURFACE_INPUT_REACH: glslInt(INDEX.coastalReach), LANDSCAPE_SURFACE_INPUT_REACH_FRACTION: glslInt(INDEX.reachFraction),
        LANDSCAPE_SURFACE_INPUT_DISTURBANCE: glslInt(INDEX.disturbance), LANDSCAPE_SURFACE_INPUT_FIELDS_AVAILABILITY: glslInt(INDEX.fieldsAvailability), LANDSCAPE_SURFACE_INPUT_AVAILABILITY: glslInt(INDEX.availability),
        LANDSCAPE_SURFACE_SOIL_RULE_LIST: vectorList(program.soils, 2, 'ivec2'), LANDSCAPE_SURFACE_SOIL_DEFAULT_LIST: vectorList(program.defaults, 2, 'ivec2'), LANDSCAPE_SURFACE_SOIL_LEVEL_LIST: vectorList(program.levels, 2, 'vec2'),
        LANDSCAPE_SURFACE_RULE_LIST: vectorList(program.rules, 4, 'ivec4'), LANDSCAPE_SURFACE_BASE_LIST: Array.from(program.bases, glslFloat).join(', '), LANDSCAPE_SURFACE_TERM_LIST: vectorList(program.terms, 4, 'vec4'),
        LANDSCAPE_SURFACE_NEUTRAL_LIST: LANDSCAPE_SURFACE_INPUTS.map(definition => glslFloat(definition.neutral)).join(', '), LANDSCAPE_SURFACE_HARDNESS: `vec4(${Array.from(program.hardnessPattern, glslFloat).join(', ')})`
    });
}

/**
 * The three geology layers of one native slot: the two field layers verbatim, then the categorical page (four planar label planes without halo) packed
 * into the halo'd RGBA layout, the halo ring edge-clamped. @param {Uint8Array} fieldBytes @param {Uint8Array} labels @param {{width:number,halo:number,samples:number,layerBytes:number}} layout
 */
export function packLandscapeSurfaceGeologyPage(fieldBytes, labels, layout) {
    const { width, halo, samples, layerBytes } = layout, count = samples * samples, planes = LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.categoricalChannels.length;
    if (!(fieldBytes instanceof Uint8Array) || fieldBytes.length !== 2 * layerBytes || !(labels instanceof Uint8Array) || labels.length !== count * planes) throw new Error('[LandscapeSurface] geology pages do not match the field page layout');
    const packed = new Uint8Array(layerBytes * LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.geology);
    packed.set(fieldBytes, 0);
    for (let row = 0; row < width; row++) {
        const sampleRow = Math.min(Math.max(row - halo, 0), samples - 1);
        for (let column = 0; column < width; column++) {
            const at = sampleRow * samples + Math.min(Math.max(column - halo, 0), samples - 1), target = 2 * layerBytes + (row * width + column) * 4;
            for (let plane = 0; plane < planes; plane++) packed[target + plane] = labels[plane * count + at];
        }
    }
    return packed;
}

/** The neutral geology layers (every channel at the model's neutral, every label 0) a slot without a usable geology page carries. @param {{layerBytes:number,width:number}} layout */
export function landscapeSurfaceNeutralGeologyPage(layout) {
    const neutral = Object.fromEntries(LANDSCAPE_SURFACE_INPUTS.map(definition => [definition.id, definition.neutral])), rename = { deposition: 'geologyDeposition', flow: 'geologyFlow' };
    const bytes = LANDSCAPE_GEOLOGY_CHANNELS.map(channel => encodeLandscapeGeologyChannel(channel, neutral[rename[channel.name] ?? channel.name])), packed = new Uint8Array(layout.layerBytes * LANDSCAPE_SURFACE_MODEL_RUNTIME.layers.geology);
    for (let texel = 0; texel < layout.width * layout.width; texel++) for (let k = 0; k < 8; k++) packed[(k >> 2) * layout.layerBytes + texel * 4 + (k & 3)] = bytes[k];
    return packed;
}

/**
 * Exact JavaScript mirror of landscapeSurfaceModel (surface_model.glsl) over the resident data: the display coverage and planning cover of the mask
 * pages, the terrain fields and the geology at the same filtered taps and slot walk, the one-hot of the four aligned categorical samples, the fragment
 * slope and height the caller resolves from the rendered chunk, the appearance terms, and the resident override layer.
 * With the model off (modelOn false, state bit 4 clear in the shader) the field and geology inputs stay neutral and every output is the soil default.
 * @param {{masks:any,fields:any,recipe:any,planningCoverMask:ArrayLike<number>,seaLevel:number,terrainAppearance:(x:number,z:number,options:{height:number,slopeDegrees:number,enabled:boolean})=>any,modelOn?:boolean}} options
 */
export function createLandscapeSurfaceSampler({ masks, fields, recipe, planningCoverMask, seaLevel, terrainAppearance, modelOn = true }) {
    if (!masks || !fields || typeof terrainAppearance !== 'function' || !Number.isFinite(seaLevel) || typeof modelOn !== 'boolean') throw new Error('[LandscapeSurface] The surface sampler needs the mask pages, the field pages, the sea level, the terrain appearance mirror and the model switch');
    const program = compileLandscapeSurfaceRecipe(recipe), vector = new Float64Array(LANDSCAPE_SURFACE_INPUTS.length), result = createLandscapeSurfaceResult(), override = createLandscapeSurfaceOverride();
    return Object.freeze({
        recipe: program.recipe,
        /** @param {number} x @param {number} z @param {{dx?:number[],dy?:number[],height:number,slopeDegrees:number,enabled?:boolean,disturbance?:number}} options */
        sample(x, z, { dx = [0, 0], dy = [0, 0], height, slopeDegrees, enabled = true, disturbance = 0 }) {
            if (![x, z, height, slopeDegrees].every(Number.isFinite)) throw new Error('[LandscapeSurface] surface samples need a finite position, height and slope');
            const coverage = masks.coverageSample(x, z, { dx, dy }), categorical = masks.sample(x, z);
            if (!coverage || !categorical) return null;
            const soilWeights = Object.fromEntries(coverage.soilIds.map((soilId, index) => [soilId, coverage.weights[index]]));
            const planningShare = landscapePlanningCover(planningCoverMask, categorical.coverId) ? 1 : 0;
            const fieldSample = fields.sample(x, z, { dx, dy }), geologySample = fields.geologySample(x, z, { dx, dy }), fieldsAvailability = modelOn ? fieldSample.availability : 0;
            const appearance = terrainAppearance(x, z, { height, slopeDegrees, enabled });
            landscapeSurfaceInputsFrom({ soilWeights, planningShare, fields: fieldsAvailability > 0 ? fieldSample.fields : null, geology: modelOn ? geologySample.geology : null, categories: modelOn ? geologySample.categories : null,
                slopeDegrees, heightAboveSea: height - seaLevel, appearanceLayer: appearance ? { moisture: appearance.moisture, reach: appearance.reach } : null, disturbance,
                fieldsAvailability, geologyAvailability: modelOn ? geologySample.availability : 0 }, vector);
            sampleLandscapeSurface(vector, program.recipe, { out: result });
            const source = fields.overrideLayerSource();
            if (source) applyLandscapeSurfaceOverride(result, sampleLandscapeSurfaceOverrideLayer(source.pixels, source.offset, source.layout, source.bounds, x, z, override));
            return { model: LANDSCAPE_SURFACE_MODEL.id, recipe: program.recipe.id, modelOn, ...describeLandscapeSurface(result), inputs: Object.fromEntries(LANDSCAPE_SURFACE_INPUTS.map((definition, index) => [definition.id, vector[index]])),
                soilWeights, planningShare, displaySoilId: categorical.displaySoilId, fieldsAvailability, geologyAvailability: modelOn ? geologySample.availability : 0, geologyStatus: geologySample.status,
                slot: geologySample.slot ?? fieldSample.contributions?.[0]?.slot ?? null, contributions: geologySample.contributions ?? fieldSample.contributions ?? [],
                geology: geologySample.geology, categories: geologySample.categories ? { ...geologySample.categories, depositType: [...geologySample.categories.depositType], drainage: [...geologySample.categories.drainage], coastalZone: [...geologySample.categories.coastalZone] } : null,
                override: source ? { ...override } : null, appearance: appearance ? { reach: appearance.reach, moisture: appearance.moisture, availability: appearance.availability, enabled } : null };
        }
    });
}

/** The labels of LANDSCAPE_GEOLOGY_CATEGORIES by name, for inspection output. */
export const LANDSCAPE_SURFACE_CATEGORY_LABELS = Object.freeze(Object.fromEntries(LANDSCAPE_GEOLOGY_CATEGORIES.map(category => [category.name, category.labels])));
