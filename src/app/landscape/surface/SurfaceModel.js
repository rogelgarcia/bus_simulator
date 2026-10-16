// Defines the landscape-surface-model v1 contract: the substrate and cover catalogs, the input vector, strict recipe validation, canonical JSON and identity.
// @ts-check
// AI 598 D1. The surface model refines each of the six semantic soils (catalog order unknown, seabed, sand, loam, forest, rock; never rewritten)
// into a substrate material and a cover material per pixel from the resident data: the display soil weights, the terrain fields, the geology
// channels (fields and categorical labels as one-hot fractions of the four nearest aligned samples), the fragment's own slope and height, the
// landscape-scale appearance layer and the disturbance (0 until D5). Rules are recipe data, never code branches: a rule is a base times a product of
// smoothstep terms on named inputs (edges may descend: [a, b] is 0 at a and 1 at b, so [40, 25] falls with slope), several rules may feed one
// class and add, class weights normalize per soil, the soils blend by their weights. Every input has a documented neutral value, so an unbound
// source leaves its rules inert and the output fades to each soil's default classes by the field availability. The GLSL mirror
// (chunks/landscape/surface_model.glsl) evaluates the same tables from compile-time defines (landscapeSurfaceModelDefines), so the JavaScript and
// GPU derivations agree to float precision.
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger } from '../internal/LandscapeValidation.js';
import { LANDSCAPE_GEOLOGY_CATEGORIES } from '../LandscapeGeology.js';

export const LANDSCAPE_SURFACE_MODEL = Object.freeze({
    id: 'landscape-surface-model-v1',
    recipe: Object.freeze({ format: 'landscape-surface-recipe', schemaVersion: 1, identityPrefix: 'surface-recipe-' }),
    overrides: Object.freeze({ format: 'landscape-surface-overrides', schemaVersion: 1, identityPrefix: 'surface-overrides-' }),
    definePrefix: 'LANDSCAPE_SURFACE_',
    soils: Object.freeze(['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock']),
    // the GLSL tables are compile-time constant arrays sized by these
    limits: Object.freeze({ rules: 255, termsPerRule: 8, regions: 256, overridesBytes: 256 * 1024 }),
    strata: Object.freeze({ wrap: 'index = L - 1 for L <= 128, L - 256 otherwise; slot = ((index mod 4) + 4) mod 4; label 0 is unstratified (hardness 0.5)', unstratifiedHardness: .5 })
});

const entry = (id, label, description) => Object.freeze({ id, label, description });

/** Substrate classes in catalog order (the material a pixel is made of). */
export const LANDSCAPE_SURFACE_SUBSTRATES = Object.freeze([
    entry('sandstone', 'Sandstone', 'layered coastal sandstone (the soft strata)'),
    entry('caprock', 'Caprock', 'the hard strata of escarpment rims and ledges'),
    entry('scree', 'Scree', 'talus, scree and gravel'),
    entry('dirt', 'Dirt', 'colluvial dirt (the plain soil)'),
    entry('mud', 'Mud', 'alluvial silt and mud of wet floors'),
    entry('sand', 'Sand', 'dry beach sand'),
    entry('wet-sand', 'Wet sand', 'saturated sand at and below the waterline'),
    entry('compacted-sand', 'Compacted sand', 'the firm damp foreshore inside the swash reach'),
    entry('dune-sand', 'Dune sand', 'wind-blown sand of the foredune'),
    entry('cobble', 'Cobble', 'pebble and cobble beach, the wave-cut platform'),
    entry('shell-grit', 'Shell grit', 'shell fragments of exposed berms')
]);

/** Cover classes in catalog order (what grows or lies on the substrate); `none` binds no material. */
export const LANDSCAPE_SURFACE_COVERS = Object.freeze([
    entry('none', 'None', 'bare substrate'),
    entry('turf', 'Turf', 'turf and grass sward'),
    entry('dry-grass', 'Dry grass', 'dry grass of ridges, dunes and steep ground'),
    entry('moss', 'Moss', 'moss of shaded, moist ground and rock'),
    entry('broadleaf-litter', 'Broadleaf litter', 'leaf litter under the canopy'),
    entry('needle-litter', 'Needle litter', 'needle litter of exposed, dry crowns'),
    entry('lichen', 'Lichen', 'crustose lichen of stable rock'),
    entry('algae', 'Algae', 'intertidal algae of the platform and the bluff toe'),
    entry('wrack', 'Wrack', 'the wrack line at the upper swash limit')
]);

const CATEGORY_PREFIX = Object.freeze({ depositType: 'deposit', drainage: 'drainage', coastalZone: 'zone' });
const input = (id, neutral, range, source, description) => Object.freeze({ id, neutral, range: Object.freeze(range), source, description });
const categoryInputs = () => LANDSCAPE_GEOLOGY_CATEGORIES.filter(category => category.labels !== null).flatMap(category =>
    /** @type {readonly string[]} */ (category.labels).map((label, index) => input(`${CATEGORY_PREFIX[category.name]}.${label}`, index === 0 ? 1 : 0, [0, 1], 'category', `one-hot fraction of ${category.name} ${label} over the four nearest aligned samples`)));

/** The input vector of the model: index = position; every input with its neutral value (used while its source is unbound), range and source. */
export const LANDSCAPE_SURFACE_INPUTS = Object.freeze([
    ...LANDSCAPE_SURFACE_MODEL.soils.map(soil => input(`soil.${soil}`, 0, [0, 1], 'soil', `display coverage weight of the ${soil} soil (normalized)`)),
    input('planningShare', 0, [0, 1], 'planning', 'share of planning-only cover at the fragment'),
    input('wetness', .5, [0, 1], 'fields', 'terrain-field topographic wetness'), input('flow', 0, [0, 1], 'fields', 'terrain-field flow'), input('deposition', 0, [0, 1], 'fields', 'terrain-field deposition'),
    input('rockExposure', 0, [0, 1], 'fields', 'terrain-field rock exposure'), input('skyView', 1, [0, 1], 'fields', 'terrain-field sky view'), input('shoreDistance', 256, [-256, 256], 'fields', 'signed meters to the shoreline, land positive'),
    input('convexity', 0, [-1, 1], 'fields', 'terrain-field convexity, ridges positive'), input('slopeDegrees', 0, [0, 90], 'fields', 'terrain-field slope'),
    input('bedrockOffset', 2, [0, 32], 'geology', 'meters of mantle (regolith and deposit) over the bedrock'), input('regolith', .5, [0, 8], 'geology', 'meters of weathered mantle'),
    input('depositThickness', 0, [0, 30], 'geology', 'meters of the dominant loose deposit'), input('wear', 0, [0, 1], 'geology', 'normalized erosion depth'),
    input('geologyDeposition', 0, [0, 1], 'geology', 'normalized sediment deposition (geology channel)'), input('geologyFlow', 0, [0, 1], 'geology', 'normalized flow of the final surface (geology channel)'),
    input('waveExposure', 0, [0, 1], 'geology', 'exposure of the shore to the open-sea fetch'), input('faceMask', 0, [0, 1], 'geology', 'share of the slope beyond what the heightfield represents'),
    ...categoryInputs(),
    input('hardness', .5, [0, 1], 'geology', 'stratum hardness unwrapped from the lithology label (0.5 unstratified), bilinear over the four samples'),
    input('geometricSlopeDegrees', 0, [0, 90], 'fragment', 'the fragment\'s own geometric slope'), input('heightAboveSea', 10, [-100, 200], 'fragment', 'the fragment\'s height above sea level'),
    input('catenaMoisture', 0, [-1, 1], 'appearance', 'catena moisture index of the landscape-scale appearance layer'), input('coastalReach', 0, [0, 2.55], 'appearance', 'height above sea level the sea wets here'),
    input('reachFraction', 10, [-10, 10], 'derived', 'heightAboveSea / max(coastalReach, 0.01), clamped: 0 at sea level, 1 at the reach limit'),
    input('disturbance', 0, [0, 1], 'disturbance', 'worn-ground disturbance (0 until AI 598 D5 publishes the disturbance pages)'),
    input('fieldsAvailability', 0, [0, 1], 'availability', 'availability of the terrain fields at the fragment (arrival progress times freshness): the fade from the default classes'),
    input('availability', 0, [0, 1], 'availability', 'share of the model\'s sources bound at the fragment: the fields and the geology, each by its availability')
]);

/** Input id -> vector index. */
export const LANDSCAPE_SURFACE_INPUT_INDEX = Object.freeze(Object.fromEntries(LANDSCAPE_SURFACE_INPUTS.map((definition, index) => [definition.id, index])));

/** Rule targets of the compiled tables: substrate classes, then cover classes, then the cover fraction and the wetness of a soil. */
export const LANDSCAPE_SURFACE_TARGETS = Object.freeze({ substrate: 0, cover: LANDSCAPE_SURFACE_SUBSTRATES.length, fraction: LANDSCAPE_SURFACE_SUBSTRATES.length + LANDSCAPE_SURFACE_COVERS.length,
    wetness: LANDSCAPE_SURFACE_SUBSTRATES.length + LANDSCAPE_SURFACE_COVERS.length + 1 });

const KEYS = Object.freeze({
    recipe: 'defaults,format,id,materials,model,schemaVersion,soils,strata',
    soil: 'coverFraction,covers,defaults,substrates,wetness',
    soilDefaults: 'cover,coverFraction,substrate,wetness',
    classRule: 'base,class,terms', levelRule: 'base,terms', term: 'input,smoothstep,weight',
    material: 'materialId,parameters'
});

function requireKeys(value, keys, label) {
    requireCondition(!!value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    requireCondition(Object.keys(value).sort().join(',') === keys, `${label} has missing or unsupported fields (expected ${keys})`);
}

const substrateIndex = id => LANDSCAPE_SURFACE_SUBSTRATES.findIndex(definition => definition.id === id);
const coverIndex = id => LANDSCAPE_SURFACE_COVERS.findIndex(definition => definition.id === id);

function validateTerm(term, label) {
    const filled = { ...term, weight: term?.weight === undefined ? 1 : term.weight };
    requireKeys(filled, KEYS.term, label);
    requireCondition(typeof filled.input === 'string' && Object.hasOwn(LANDSCAPE_SURFACE_INPUT_INDEX, filled.input), `${label} names an unknown input ${filled.input}`);
    requireCondition(Array.isArray(filled.smoothstep) && filled.smoothstep.length === 2, `${label}.smoothstep must be [edge0, edge1]`);
    for (const edge of filled.smoothstep) requireFinite(edge, `${label}.smoothstep edge`);
    requireCondition(filled.smoothstep[0] !== filled.smoothstep[1], `${label}.smoothstep edges must differ`);
    requireFinite(filled.weight, `${label}.weight`); requireCondition(filled.weight >= 0 && filled.weight <= 1, `${label}.weight must be in 0..1`);
    return Object.freeze({ input: filled.input, smoothstep: Object.freeze([filled.smoothstep[0], filled.smoothstep[1]]), weight: filled.weight });
}

function validateRules(rules, label, classes) {
    requireCondition(Array.isArray(rules), `${label} must be a list of rules`);
    return Object.freeze(rules.map((rule, i) => {
        const ruleLabel = `${label}[${i}]`;
        requireKeys(rule, classes ? KEYS.classRule : KEYS.levelRule, ruleLabel);
        if (classes) requireCondition(typeof rule.class === 'string' && classes.some(definition => definition.id === rule.class), `${ruleLabel} targets an unknown class ${rule.class}`);
        requireFinite(rule.base, `${ruleLabel}.base`); requireCondition(rule.base >= 0, `${ruleLabel}.base must be nonnegative`);
        requireCondition(Array.isArray(rule.terms) && rule.terms.length <= LANDSCAPE_SURFACE_MODEL.limits.termsPerRule, `${ruleLabel}.terms must hold at most ${LANDSCAPE_SURFACE_MODEL.limits.termsPerRule} terms`);
        const terms = Object.freeze(rule.terms.map((term, k) => validateTerm(term, `${ruleLabel}.terms[${k}]`)));
        return Object.freeze(classes ? { class: rule.class, base: rule.base, terms } : { base: rule.base, terms });
    }));
}

function validateSoil(soil, label) {
    requireKeys(soil, KEYS.soil, label); requireKeys(soil.defaults, KEYS.soilDefaults, `${label}.defaults`);
    requireCondition(substrateIndex(soil.defaults.substrate) >= 0, `${label}.defaults.substrate is not a substrate class`);
    requireCondition(coverIndex(soil.defaults.cover) >= 0, `${label}.defaults.cover is not a cover class`);
    for (const key of ['coverFraction', 'wetness']) { requireFinite(soil.defaults[key], `${label}.defaults.${key}`); requireCondition(soil.defaults[key] >= 0 && soil.defaults[key] <= 1, `${label}.defaults.${key} must be in 0..1`); }
    return Object.freeze({ defaults: Object.freeze({ ...soil.defaults }), substrates: validateRules(soil.substrates, `${label}.substrates`, LANDSCAPE_SURFACE_SUBSTRATES),
        covers: validateRules(soil.covers, `${label}.covers`, LANDSCAPE_SURFACE_COVERS), coverFraction: validateRules(soil.coverFraction, `${label}.coverFraction`, null),
        wetness: validateRules(soil.wetness, `${label}.wetness`, null) });
}

function validateMaterials(materials) {
    requireCondition(!!materials && typeof materials === 'object' && !Array.isArray(materials), 'recipe.materials must map class ids to material bindings');
    const bound = Object.keys(materials).sort(), expected = [...LANDSCAPE_SURFACE_SUBSTRATES.map(definition => definition.id), ...LANDSCAPE_SURFACE_COVERS.filter(definition => definition.id !== 'none').map(definition => definition.id)].sort();
    requireCondition(bound.join(',') === expected.join(','), `recipe.materials must bind exactly the classes ${expected.join(', ')} (none binds nothing)`);
    return Object.freeze(Object.fromEntries(Object.entries(materials).map(([classId, binding]) => {
        requireKeys(binding, KEYS.material, `recipe.materials.${classId}`);
        requireId(binding.materialId, `recipe.materials.${classId}.materialId`);
        requireCondition(!!binding.parameters && typeof binding.parameters === 'object' && !Array.isArray(binding.parameters), `recipe.materials.${classId}.parameters must be an object`);
        for (const [key, value] of Object.entries(binding.parameters)) requireFinite(value, `recipe.materials.${classId}.parameters.${key}`);
        return [classId, Object.freeze({ materialId: binding.materialId, parameters: Object.freeze({ ...binding.parameters }) })];
    })));
}

/**
 * Strictly validates a recipe (plain JSON or the frozen default module), fills term weights, rejects unknown inputs, classes a soil may not use and
 * non-finite numbers, and returns a frozen clone whose soils follow the model's soil order.
 * @param {any} input
 */
export function validateLandscapeSurfaceRecipe(input) {
    const value = clonePlainData(input, 'surface recipe');
    requireKeys(value, KEYS.recipe, 'surface recipe');
    requireCondition(value.format === LANDSCAPE_SURFACE_MODEL.recipe.format && value.schemaVersion === LANDSCAPE_SURFACE_MODEL.recipe.schemaVersion, 'unsupported surface recipe format/schemaVersion');
    requireCondition(value.model === LANDSCAPE_SURFACE_MODEL.id, `surface recipe targets model ${value.model}, not ${LANDSCAPE_SURFACE_MODEL.id}`);
    requireId(value.id, 'surface recipe id');
    requireKeys(value.strata, 'hardnessPattern', 'recipe.strata');
    requireCondition(Array.isArray(value.strata.hardnessPattern) && value.strata.hardnessPattern.length === 4, 'recipe.strata.hardnessPattern must hold four hardness values');
    for (const hardness of value.strata.hardnessPattern) { requireFinite(hardness, 'recipe.strata.hardnessPattern'); requireCondition(hardness >= 0 && hardness <= 1, 'recipe.strata.hardnessPattern values must be in 0..1'); }
    requireKeys(value.defaults, 'coverFraction', 'recipe.defaults');
    requireFinite(value.defaults.coverFraction, 'recipe.defaults.coverFraction'); requireCondition(value.defaults.coverFraction >= 0 && value.defaults.coverFraction <= 1, 'recipe.defaults.coverFraction must be in 0..1');
    requireCondition(!!value.soils && typeof value.soils === 'object' && Object.keys(value.soils).sort().join(',') === [...LANDSCAPE_SURFACE_MODEL.soils].sort().join(','), `recipe.soils must hold exactly ${LANDSCAPE_SURFACE_MODEL.soils.join(', ')}`);
    const soils = Object.freeze(Object.fromEntries(LANDSCAPE_SURFACE_MODEL.soils.map(soil => [soil, validateSoil(value.soils[soil], `recipe.soils.${soil}`)])));
    const rules = LANDSCAPE_SURFACE_MODEL.soils.reduce((sum, soil) => sum + soils[soil].substrates.length + soils[soil].covers.length + soils[soil].coverFraction.length + soils[soil].wetness.length, 0);
    requireInteger(rules, 1, LANDSCAPE_SURFACE_MODEL.limits.rules, 'surface recipe rule count');
    return freezeData({ format: value.format, schemaVersion: value.schemaVersion, id: value.id, model: value.model, strata: { hardnessPattern: [...value.strata.hardnessPattern] },
        defaults: { coverFraction: value.defaults.coverFraction }, soils, materials: validateMaterials(value.materials) });
}

function canonical(value, label) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { requireFinite(value, label); return JSON.stringify(value); }
    if (Array.isArray(value)) return `[${value.map((item, i) => canonical(item, `${label}[${i}]`)).join(',')}]`;
    requireCondition(!!value && typeof value === 'object', `${label} must be plain JSON data`);
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], `${label}.${key}`)}`).join(',')}}`;
}

/** Canonical JSON (sorted keys, weights filled) of a validated recipe or any plain surface document. @param {any} value */
export function canonicalLandscapeSurfaceJson(value) { return canonical(value, 'surface document'); }

/** SHA-256 hex (Web Crypto) of a text. @param {string} text */
export async function landscapeSurfaceSha256(text) {
    requireCondition(!!globalThis.crypto?.subtle, 'surface identity requires Web Crypto');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Identity `surface-recipe-<24 hex>` of a recipe: SHA-256 of its canonical JSON, independent of key order. @param {any} recipe @returns {Promise<string>} */
export async function landscapeSurfaceRecipeIdentity(recipe) {
    return `${LANDSCAPE_SURFACE_MODEL.recipe.identityPrefix}${(await landscapeSurfaceSha256(canonicalLandscapeSurfaceJson(validateLandscapeSurfaceRecipe(recipe)))).slice(0, 24)}`;
}
