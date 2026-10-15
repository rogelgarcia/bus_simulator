// Computes the world-anchored site lattice of an ecosystem layer and every per-site deterministic quantity: hashes, jitter, variation, clumping and cell addressing.
// @ts-check
// Design: every quantity of a site is a pure function of the recipe seed, the layer id and the integer site (plus a child index for spawned
// features), evaluated with the murmur hash of the surface noise and IEEE arithmetic only (no Math.random, Math.sin, Math.exp or Math.pow), so the
// Node bake and the browser worker produce identical bytes and a regenerated region keeps every site elsewhere unchanged. The log-uniform scale and
// the child directions use exact-rounding constructions (repeated square roots, Taylor series over a quarter turn) instead of the engine's
// transcendental functions, whose last bits are not specified.
import { createLandscapeNoiseOctaves, landscapeNoiseHash } from '../../../graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { requireCondition, requireFinite, requireInteger } from '../internal/LandscapeValidation.js';
import { ecosystemLayerSpacing } from './EcosystemRecipe.js';

/** Hash channels of a lattice site. */
export const ECOSYSTEM_SITE_CHANNELS = Object.freeze({ jitterX: 0, jitterZ: 1, scale: 2, yaw: 3, variant: 4, tintValue: 5, tintR: 6, tintG: 7, tintB: 8 });
/** Hash channels of a spawned child (childIndex −1 addresses the parent-level channels, only `count`). */
export const ECOSYSTEM_CHILD_CHANNELS = Object.freeze({ count: 0, radius: 1, angle: 2, keep: 3, scale: 4, yaw: 5, variant: 6, tintValue: 7, tintR: 8, tintG: 9, tintB: 10 });
export const ECOSYSTEM_TWO_PI = 6.283185307179586;
const UNIT = 1 / 4294967296, HALF_PI = 1.5707963267948966, utf8 = new TextEncoder();
// 2^(1/2^(k+1)) for k = 0..51 by repeated correctly rounded square roots
const ROOTS = new Float64Array(52);
for (let k = 0, value = 2; k < ROOTS.length; k++) { value = Math.sqrt(value); ROOTS[k] = value; }

/** Salt of one layer: the recipe seed folded over the UTF-8 bytes of the layer id (FNV-1a) and mixed. @param {number} seed @param {string} layerId */
export function ecosystemLayerSalt(seed, layerId) {
    requireInteger(seed, 0, 0xffffffff, 'ecosystem seed'); requireCondition(typeof layerId === 'string' && layerId.length > 0, 'ecosystem layer id is required');
    let hash = seed >>> 0;
    for (const byte of utf8.encode(layerId)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return landscapeNoiseHash(hash);
}

/** uint32 hash of one channel of a lattice site. @param {number} salt @param {number} siteX @param {number} siteZ @param {number} channel */
export function ecosystemSiteHash(salt, siteX, siteZ, channel) {
    const base = landscapeNoiseHash((landscapeNoiseHash((salt ^ Math.imul(siteX, 0x27d4eb2d)) >>> 0) ^ Math.imul(siteZ, 0x165667b1)) >>> 0);
    return landscapeNoiseHash((base ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0);
}

/**
 * uint32 hash of one channel of the k-th child of a parent instance (parentChild −1 for a site feature; childIndex −1 for parent-level channels).
 * @param {number} salt @param {number} siteX @param {number} siteZ @param {number} parentChild @param {number} childIndex @param {number} channel
 */
export function ecosystemChildHash(salt, siteX, siteZ, parentChild, childIndex, channel) {
    let hash = landscapeNoiseHash((salt ^ Math.imul(siteX, 0x27d4eb2d)) >>> 0);
    hash = landscapeNoiseHash((hash ^ Math.imul(siteZ, 0x165667b1)) >>> 0);
    hash = landscapeNoiseHash((hash ^ Math.imul(parentChild + 3, 0x85ebca77)) >>> 0);
    hash = landscapeNoiseHash((hash ^ Math.imul(childIndex + 2, 0xc2b2ae3d)) >>> 0);
    return landscapeNoiseHash((hash ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0);
}

/** A hash as a unit value in [0, 1). @param {number} hash uint32 */
export function ecosystemHashUnit(hash) { return hash * UNIT; }

/** The unit value of one site channel. */
export function ecosystemSiteUnit(salt, siteX, siteZ, channel) { return ecosystemSiteHash(salt, siteX, siteZ, channel) * UNIT; }

/** 2^fraction for fraction in [0, 1) from the exact binary expansion and the committed roots. @param {number} fraction */
export function ecosystemExp2Unit(fraction) {
    let result = 1, remaining = fraction;
    for (let k = 0; k < ROOTS.length && remaining > 0; k++) { remaining *= 2; if (remaining >= 1) { remaining -= 1; result *= ROOTS[k]; } }
    return result;
}

/** log2 of a positive finite number by exponent extraction and 52 squaring steps (only IEEE multiplications and comparisons). @param {number} value */
export function ecosystemLog2(value) {
    requireFinite(value, 'log2 value'); requireCondition(value > 0, 'log2 needs a positive value');
    let exponent = 0, mantissa = value;
    while (mantissa >= 2) { mantissa /= 2; exponent++; }
    while (mantissa < 1) { mantissa *= 2; exponent--; }
    let fraction = 0, step = .5;
    for (let k = 0; k < 52; k++) { mantissa *= mantissa; if (mantissa >= 2) { mantissa /= 2; fraction += step; } step /= 2; }
    return exponent + fraction;
}

/**
 * Unit direction of an angle given in turns: quadrant reduction then Taylor series over a quarter turn (|error| below 1e-7).
 * @param {number} turns @param {Float64Array|number[]} [out] receives [cos, sin]
 */
export function ecosystemUnitDirection(turns, out = new Float64Array(2)) {
    const scaled = (turns - Math.floor(turns)) * 4, quadrant = Math.floor(scaled), angle = (scaled - quadrant) * HALF_PI, square = angle * angle;
    const sine = angle * (1 - square / 6 * (1 - square / 20 * (1 - square / 42 * (1 - square / 72 * (1 - square / 110 * (1 - square / 156))))));
    const cosine = 1 - square / 2 * (1 - square / 12 * (1 - square / 30 * (1 - square / 56 * (1 - square / 90 * (1 - square / 132 * (1 - square / 182))))));
    if (quadrant === 0) { out[0] = cosine; out[1] = sine; } else if (quadrant === 1) { out[0] = -sine; out[1] = cosine; } else if (quadrant === 2) { out[0] = -cosine; out[1] = -sine; } else { out[0] = sine; out[1] = -cosine; }
    return out;
}

/** World position of a jittered site: `((s + 0.5 + j) × spacing)` with `j` in [−jitter, jitter] from the site hash. @param {any} layer @param {number} salt @param {number} siteX @param {number} siteZ */
export function ecosystemSitePosition(layer, salt, siteX, siteZ) {
    const spacing = ecosystemLayerSpacing(layer), jitter = layer.jitter;
    const jitterX = (ecosystemSiteUnit(salt, siteX, siteZ, ECOSYSTEM_SITE_CHANNELS.jitterX) * 2 - 1) * jitter, jitterZ = (ecosystemSiteUnit(salt, siteX, siteZ, ECOSYSTEM_SITE_CHANNELS.jitterZ) * 2 - 1) * jitter;
    return { x: (siteX + .5 + jitterX) * spacing, z: (siteZ + .5 + jitterZ) * spacing };
}

/** The lattice site whose cell owns a world position (used only for cell addressing; the site itself is jittered). @param {any} layer @param {number} x @param {number} z */
export function ecosystemSiteOf(layer, x, z) { const spacing = ecosystemLayerSpacing(layer); return { siteX: Math.floor(x / spacing), siteZ: Math.floor(z / spacing) }; }

/** The cell of a lattice site. @param {any} layer @param {number} siteX @param {number} siteZ */
export function ecosystemSiteCell(layer, siteX, siteZ) { const n = layer.cell.sitesPerAxis; return { cellX: Math.floor(siteX / n), cellZ: Math.floor(siteZ / n) }; }

/** The site index range of a cell: sites `[minSiteX, minSiteX + count) × [minSiteZ, minSiteZ + count)`. @param {any} layer @param {number} cellX @param {number} cellZ */
export function ecosystemCellSites(layer, cellX, cellZ) {
    requireInteger(cellX, -(2 ** 24), 2 ** 24, 'cellX'); requireInteger(cellZ, -(2 ** 24), 2 ** 24, 'cellZ');
    const count = layer.cell.sitesPerAxis;
    return { minSiteX: cellX * count, minSiteZ: cellZ * count, count };
}

/** Cells of a layer whose half-open world squares intersect closed bounds, row-major (z then x). @param {any} layer @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds */
export function ecosystemCellsIntersecting(layer, bounds) {
    const meters = layer.cell.meters, cells = [];
    const minCellX = Math.floor(bounds.minX / meters), maxCellX = Math.ceil(bounds.maxX / meters) - 1, minCellZ = Math.floor(bounds.minZ / meters), maxCellZ = Math.ceil(bounds.maxZ / meters) - 1;
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) for (let cellX = minCellX; cellX <= maxCellX; cellX++) cells.push({ cellX, cellZ });
    return cells;
}

/** Bounds grown by a margin on every side. @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {number} meters */
export function ecosystemGrownBounds(bounds, meters) { return { minX: bounds.minX - meters, maxX: bounds.maxX + meters, minZ: bounds.minZ - meters, maxZ: bounds.maxZ + meters }; }

/** Number of asset variants a layer can index. @param {any} recipe validated @param {any} layer */
export function ecosystemLayerVariants(recipe, layer) {
    const asset = recipe.assets[layer.assetSet];
    return Array.isArray(asset.variants) ? asset.variants.length : asset.variants;
}

/**
 * Per-layer variation sampler: scale (uniform or log-uniform), yaw (random turns, none, or downslope from the ground normal), variant index and tint
 * (value × per-channel multipliers), each from its own hash channel.
 * @param {any} layer validated @param {number} variants @param {number} salt
 */
export function createEcosystemVariationSampler(layer, variants, salt) {
    requireInteger(variants, 1, 256, 'asset variants');
    const { scale, yaw, tint } = layer.variation, logRatio = scale.distribution === 'log-uniform' ? ecosystemLog2(scale.max / scale.min) : 0;
    const range = (pair, unit) => pair[0] + (pair[1] - pair[0]) * unit;
    const sampleScale = unit => scale.distribution === 'log-uniform' ? scale.min * exp2(unit * logRatio) : range([scale.min, scale.max], unit);
    const sampleYaw = (unit, normal) => {
        if (yaw === 'none') return 0;
        if (yaw === 'random') return unit * ECOSYSTEM_TWO_PI;
        const angle = Math.atan2(normal.x, normal.z);
        return angle < 0 ? angle + ECOSYSTEM_TWO_PI : angle;
    };
    const variation = (unitOf, normal) => {
        const value = range(tint.value, unitOf('tintValue')), variant = Math.min(variants - 1, Math.floor(unitOf('variant') * variants));
        return { scale: sampleScale(unitOf('scale')), yaw: sampleYaw(unitOf('yaw'), normal), variant, tint: [value * range(tint.channels.r, unitOf('tintR')), value * range(tint.channels.g, unitOf('tintG')), value * range(tint.channels.b, unitOf('tintB'))] };
    };
    return Object.freeze({
        /** @param {number} siteX @param {number} siteZ @param {{x:number,y:number,z:number}} normal */
        site(siteX, siteZ, normal) { return variation(channel => ecosystemSiteUnit(salt, siteX, siteZ, ECOSYSTEM_SITE_CHANNELS[channel]), normal); },
        /** @param {number} siteX @param {number} siteZ @param {number} parentChild @param {number} childIndex @param {{x:number,y:number,z:number}} normal */
        child(siteX, siteZ, parentChild, childIndex, normal) { return variation(channel => ecosystemChildHash(salt, siteX, siteZ, parentChild, childIndex, ECOSYSTEM_CHILD_CHANNELS[channel]) * UNIT, normal); }
    });
}

function exp2(value) {
    const integer = Math.floor(value);
    let result = ecosystemExp2Unit(value - integer);
    for (let k = 0; k < integer; k++) result *= 2;
    return result;
}

/**
 * The clumping factor of a layer: fractal rotated gradient noise at the recipe wavelength remapped to [0, 1], smoothstepped around the threshold and
 * mixed as `1 − contrast + contrast × clump`; null for a layer without clumping.
 * @param {any} layer validated @param {number} salt
 */
export function createEcosystemClumping(layer, salt) {
    const rule = layer.rules.clumping;
    if (!rule) return null;
    const wavelengths = Array.from({ length: rule.octaves }, (_, k) => rule.wavelengthMeters / 2 ** k), amplitudes = wavelengths.map((_, k) => 1 / 2 ** k);
    const noise = createLandscapeNoiseOctaves({ seed: salt, component: 7, wavelengths, amplitudes }), low = rule.threshold - rule.contrast / 2, high = rule.threshold + rule.contrast / 2;
    return Object.freeze({
        /** @param {number} x @param {number} z */
        evaluate(x, z) {
            const value = .5 + .5 * noise.evaluate(x, z) / noise.amplitude;
            const t = rule.contrast > 0 ? Math.min(1, Math.max(0, (value - low) / (high - low))) : value >= rule.threshold ? 1 : 0;
            return 1 - rule.contrast + rule.contrast * t * t * (3 - 2 * t);
        }
    });
}
