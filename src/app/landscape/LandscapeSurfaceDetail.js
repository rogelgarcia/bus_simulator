// Addresses generated fine surface-coverage pages and derives their canonical support windows and content identity.
// @ts-check
// Fine pages extend the categorical coverage quadtree below the native level. Their descriptors are derived on demand
// from the manifest grid (never enumerated, persisted or presented as measured data) and they store the D1 page format.
// A page samples smoothed vector boundaries extracted from a canonical native label window at warped positions, so its
// native window covers the evaluated samples plus the maximum warp, the override reach (search radius plus the probe
// that reads the soil just outside an override edge), the nearest-boundary query reach and the boundary smoothing
// dependency radius. Identity keys hash exactly the inputs that can change a page's bytes, so a soil edit
// changes only the keys of pages whose influence bounds it intersects, while revisions, heights and materials never do.
// Recipes whose base labels are natural-terrain-inference-v1 (v4 on) also hash, per native owner of the support window, the natural-soil
// policy and the content address of the published labels it reads (inputs schema 2), so terrain-driven and overview-fallback pages never
// share an identity; a height or cover edit therefore renews exactly the keys of pages whose owners it made stale (their fallback changes).
import { createLandscapeChunkId, validateLandscapeManifest } from './LandscapeManifest.js';
import { landscapeRegionIntersectsBounds } from './LandscapeRegions.js';
import { LANDSCAPE_NATURAL_SOIL, landscapeNaturalSoilIdentity } from './LandscapeNaturalSoil.js';
import { clonePlainData, freezeData, requireCondition, requireFinite, requireId, requireInteger } from './internal/LandscapeValidation.js';

export const LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS = 4;
export const LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS = 3;
export const LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE = .8;
export const LANDSCAPE_SURFACE_DETAIL_FORMAT = Object.freeze({
    storedHaloSamples: 2,
    uniformMinOffset: -2,
    uniformMaxOffset: 3,
    overrideProbeMeters: .001
});

const INPUT_FORMAT = 'landscape-surface-detail-inputs';
const FINE_ID = /^l(\d{1,2})\/c(\d{1,7})\/r(\d{1,7})$/;
const WARP_SHAPES = Object.freeze(['none', 'quintic-odd']);
const BREAKUP_SHAPES = Object.freeze(['none', 'ridged-mix']);
const encoder = new TextEncoder();

function fmix32(value) {
    let h = Math.imul(value ^ value >>> 16, 0x85ebca6b);
    h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
    return (h ^ h >>> 16) >>> 0;
}

function fnv1a32(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
    return h >>> 0;
}

function murmur32(bytes, seed) {
    const length = bytes.length, blocks = length & ~3;
    let h = seed | 0;
    for (let i = 0; i < blocks; i += 4) {
        let k = bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24;
        k = Math.imul(k, 0xcc9e2d51); k = k << 15 | k >>> 17; k = Math.imul(k, 0x1b873593);
        h ^= k; h = h << 13 | h >>> 19; h = Math.imul(h, 5) + 0xe6546b64 | 0;
    }
    const tail = length & 3;
    if (tail) {
        let k = bytes[blocks];
        if (tail > 1) k |= bytes[blocks + 1] << 8;
        if (tail > 2) k |= bytes[blocks + 2] << 16;
        k = Math.imul(k, 0xcc9e2d51); k = k << 15 | k >>> 17; h ^= Math.imul(k, 0x1b873593);
    }
    return fmix32(h ^ length);
}

function canonicalJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { requireFinite(value, 'surface detail identity number'); return JSON.stringify(value); }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    requireCondition(!!value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'surface detail identity requires plain JSON data');
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function hash64(value) {
    const bytes = encoder.encode(canonicalJson(value));
    return fmix32(fnv1a32(bytes)).toString(16).padStart(8, '0') + murmur32(bytes, 0x9747b28c).toString(16).padStart(8, '0');
}

function octaves(value, label, shapes) {
    requireCondition(!!value && Array.isArray(value.wavelengths) && Array.isArray(value.amplitudes) && value.wavelengths.length === value.amplitudes.length
        && value.wavelengths.length >= 1 && value.wavelengths.length <= 8, `${label} requires 1..8 matching wavelengths and amplitudes`);
    value.wavelengths.forEach((wavelength, i) => {
        requireFinite(wavelength, `${label}.wavelengths[${i}]`);
        requireCondition(wavelength > 0 && (i === 0 || wavelength < value.wavelengths[i - 1]), `${label} wavelengths must be positive and strictly decreasing`);
    });
    value.amplitudes.forEach((amplitude, i) => { requireFinite(amplitude, `${label}.amplitudes[${i}]`); requireCondition(amplitude >= 0, `${label} amplitudes must be nonnegative`); });
    requireId(value.noise, `${label}.noise`);
    requireCondition(shapes.includes(value.shaping), `${label}.shaping must be one of ${shapes.join(', ')}`);
    return value.amplitudes.reduce((sum, amplitude) => sum + amplitude, 0);
}

function profile(value, label, maxWidth) {
    requireFinite(value?.widthMeters, `${label}.widthMeters`);
    requireFinite(value.breakup, `${label}.breakup`);
    requireCondition(value.widthMeters > 0 && value.widthMeters <= maxWidth && value.breakup >= 0, `${label} needs a width in (0, maxTransitionWidth] and a nonnegative breakup`);
    return value.breakup;
}

function positive(value, label) { requireFinite(value, label); requireCondition(value > 0, `${label} must be positive`); }

function validateBoundary(boundary) {
    requireCondition(!!boundary && !!boundary.loops, 'recipe.boundary with loops is required');
    for (const key of ['saddle', 'smoothing', 'kernel']) requireId(boundary[key], `recipe.boundary.${key}`);
    for (const key of ['sigmaCells', 'windowSigmas', 'maxDisplacementCells', 'gapFraction']) positive(boundary[key], `recipe.boundary.${key}`);
    requireFinite(boundary.turningCosine, 'recipe.boundary.turningCosine');
    requireCondition(boundary.turningCosine >= -1 && boundary.turningCosine <= 1 && boundary.gapFraction <= .5 && boundary.maxDisplacementCells <= 2, 'recipe.boundary turning, gap or displacement limits are out of range');
    requireInteger(boundary.gapSegments, 1, 16, 'recipe.boundary.gapSegments');
    const loops = boundary.loops;
    requireFinite(loops.maxPerimeterCells, 'recipe.boundary.loops.maxPerimeterCells');
    requireCondition(loops.maxPerimeterCells >= 0 && loops.maxPerimeterCells <= 32, 'recipe.boundary.loops.maxPerimeterCells must be in 0..32');
    requireInteger(loops.subdivisions, 1, 16, 'recipe.boundary.loops.subdivisions');
    requireInteger(loops.iterations, 0, 64, 'recipe.boundary.loops.iterations');
    requireFinite(loops.lambda, 'recipe.boundary.loops.lambda'); requireFinite(loops.mu, 'recipe.boundary.loops.mu');
    requireCondition(loops.lambda > 0 && loops.lambda <= 1 && loops.mu < -loops.lambda, 'recipe.boundary.loops needs Taubin factors with 0 < lambda <= 1 and mu < -lambda');
}

function breakupReach(recipe) {
    const profiles = recipe.pairProfiles, factor = Math.max(profiles.default.breakup, ...profiles.pairs.map(entry => entry.breakup), ...profiles.partners.map(entry => entry.breakup));
    const shape = recipe.breakup.shaping === 'ridged-mix' ? 1 + recipe.breakup.ridgedMix / 2 : 1;
    return recipe.breakup.amplitudes.reduce((sum, amplitude) => sum + amplitude, 0) * shape * factor;
}

/** Validates, copies and freezes a generated surface-detail recipe. @param {any} input */
export function validateLandscapeSurfaceDetailRecipe(input) {
    const recipe = clonePlainData(input, 'surface detail recipe');
    requireId(recipe.id, 'recipe.id');
    requireId(recipe.family, 'recipe.family');
    requireCondition(recipe.id.startsWith(`${recipe.family}-v`) && /^[1-9][0-9]*$/.test(recipe.id.slice(recipe.family.length + 2)), 'recipe.id must be a version of recipe.family (<family>-v<version>)');
    requireInteger(recipe.levels, 1, LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS, 'recipe.levels');
    requireCondition(recipe.units === 'world-xz-meters' && recipe.generated === true && recipe.measuredDetail === false, 'surface detail recipes describe generated world-meter detail, never measured data');
    for (const key of ['transitionReferenceWidth', 'maxTransitionWidth', 'octaveMinimumSamples']) positive(recipe[key], `recipe.${key}`);
    requireInteger(recipe.search?.minimumSamples, 4, 64, 'recipe.search.minimumSamples');
    requireInteger(recipe.search.guardSamples, 1, 64, 'recipe.search.guardSamples');
    for (const key of ['labelTies', 'distance']) requireId(recipe[key], `recipe.${key}`);
    requireCondition(!!recipe.base && ['labels', 'boundary', 'encoding'].every(key => typeof recipe.base[key] === 'string' && recipe.base[key].length > 0), 'recipe.base must name its label, boundary and encoding algorithms');
    validateBoundary(recipe.boundary);
    requireCondition(octaves(recipe.warp, 'recipe.warp', WARP_SHAPES) <= LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS, `recipe.warp may displace at most ${LANDSCAPE_SURFACE_DETAIL_MAX_WARP_METERS} m per axis`);
    const slope = recipe.warp.amplitudes.reduce((sum, amplitude, i) => sum + 2 * Math.PI * amplitude / recipe.warp.wavelengths[i], 0);
    requireCondition(slope <= LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE, `recipe.warp must keep sum(2*pi*a/lambda) <= ${LANDSCAPE_SURFACE_DETAIL_MAX_WARP_SLOPE} so it cannot fold`);
    requireCondition(recipe.search.guardSamples >= Math.ceil(Math.SQRT2 * (1 + slope)), 'recipe.search.guardSamples must cover a cell diagonal of warped distance change: ceil(sqrt(2) * (1 + sum(2*pi*a/lambda)))');
    octaves(recipe.breakup, 'recipe.breakup', BREAKUP_SHAPES);
    if (recipe.breakup.shaping === 'ridged-mix') { requireFinite(recipe.breakup.ridgedMix, 'recipe.breakup.ridgedMix'); requireCondition(recipe.breakup.ridgedMix >= 0 && recipe.breakup.ridgedMix <= 1, 'recipe.breakup.ridgedMix must be in 0..1'); }
    positive(recipe.breakup.junctionFadeMeters, 'recipe.breakup.junctionFadeMeters');
    requireCondition(recipe.breakup.junctionFadeMeters <= recipe.maxTransitionWidth, 'recipe.breakup.junctionFadeMeters must not exceed maxTransitionWidth');
    const profiles = recipe.pairProfiles;
    requireCondition(!!profiles && !!profiles.default && Array.isArray(profiles.pairs) && Array.isArray(profiles.partners), 'recipe.pairProfiles requires default, pairs and partners');
    profile(profiles.default, 'default pair profile', recipe.maxTransitionWidth);
    const pairs = new Set(), partners = new Set();
    for (const entry of profiles.pairs) {
        requireCondition(Array.isArray(entry?.soils) && entry.soils.length === 2 && entry.soils[0] !== entry.soils[1], 'pair profiles name two different soils');
        entry.soils.forEach(id => requireId(id, 'pair profile soil'));
        const key = [...entry.soils].sort().join('|');
        requireCondition(!pairs.has(key), `duplicate pair profile ${key}`);
        pairs.add(key);
        profile(entry, `pair profile ${key}`, recipe.maxTransitionWidth);
    }
    for (const entry of profiles.partners) {
        requireId(entry?.soil, 'partner profile soil');
        requireCondition(!partners.has(entry.soil), `duplicate partner profile ${entry.soil}`);
        partners.add(entry.soil);
        profile(entry, `partner profile ${entry.soil}`, recipe.maxTransitionWidth);
    }
    requireCondition(breakupReach(recipe) <= 2 * recipe.maxTransitionWidth, 'recipe breakup displacement must stay within twice the maximum transition width');
    return freezeData(recipe);
}

function radiusFor(recipe, spacing) {
    return Math.max(recipe.search.minimumSamples, Math.ceil((recipe.maxTransitionWidth / 2 + breakupReach(recipe)) / spacing) + recipe.search.guardSamples);
}

/**
 * Boundary search radius in samples: max(minimum, ceil((maxTransitionWidth/2 + max breakup)/spacing) + guard). A ramp is
 * unsaturated only within maxTransitionWidth/2 + max breakup of a boundary, and the validated guard covers the warped
 * distance change across a cell diagonal (distances are (1 + sum(2*pi*a/lambda))-Lipschitz in world space), so every
 * corner of a cell that an unsaturated ramp reaches carries a valid code and the uniform marker can never be written there.
 * @param {any} recipe @param {number} spacing
 */
export function landscapeSurfaceDetailSearchRadius(recipe, spacing) {
    requireFinite(spacing, 'surface detail spacing');
    requireCondition(spacing > 0, 'surface detail spacing must be positive');
    return radiusFor(validateLandscapeSurfaceDetailRecipe(recipe), spacing);
}

/** @param {any} recipe @returns {string} */
export function landscapeSurfaceDetailRecipeHash(recipe) { return hash64(validateLandscapeSurfaceDetailRecipe(recipe)); }

/**
 * Default 32-bit FNV-1a seed of `${landscapeId}|${recipe.family}`. It is independent of the recipe version, so tuning a
 * family keeps every boundary's warp and breakup realization while the recipe hash still renews page identities.
 * @param {string} landscapeId @param {any} recipe @returns {number}
 */
export function landscapeSurfaceDetailSeed(landscapeId, recipe) {
    requireId(landscapeId, 'surface detail landscapeId');
    return fnv1a32(encoder.encode(`${landscapeId}|${validateLandscapeSurfaceDetailRecipe(recipe).family}`));
}

/** Stable 64-bit hexadecimal identity of canonical surface-detail inputs. @param {any} inputs @returns {string} */
export function landscapeSurfaceDetailKey(inputs) {
    requireCondition(inputs?.format === INPUT_FORMAT && (inputs.schemaVersion === 1 && inputs.natural === undefined || inputs.schemaVersion === 2 && Array.isArray(inputs.natural)),
        'surface detail key requires landscape-surface-detail-inputs v1, or v2 with natural soil entries');
    return hash64(inputs);
}

/** Whether a recipe's base labels are the terrain-driven natural inference (natural-soil entries are part of page identity). @param {any} recipe */
export function landscapeSurfaceDetailUsesNaturalSoil(recipe) { return validateLandscapeSurfaceDetailRecipe(recipe).base.labels === LANDSCAPE_NATURAL_SOIL.terrain; }

/** @param {any} input @param {{levels:number}} options */
export function createLandscapeSurfaceDetailIndex(input, options) {
    const manifest = validateLandscapeManifest(input);
    requireCondition(!!options && typeof options === 'object', 'surface detail index options are required');
    requireInteger(options.levels, 0, LANDSCAPE_SURFACE_DETAIL_MAX_LEVELS, 'surface detail levels');
    const levels = options.levels, grid = manifest.grid, maxLevel = grid.maxLevel, finestLevel = maxLevel + levels;
    requireCondition(finestLevel <= 20, 'surface detail levels exceed the 20-level addressing limit');
    const natives = new Map(manifest.chunks.filter(chunk => chunk.level === maxLevel).map(chunk => [chunk.id, chunk]));

    function parse(id) {
        const match = typeof id === 'string' ? FINE_ID.exec(id) : null;
        if (!match) return null;
        const level = Number(match[1]), column = Number(match[2]), row = Number(match[3]);
        if (level <= maxLevel || level > finestLevel || column >= 2 ** level || row >= 2 ** level || id !== `l${level}/c${column}/r${row}`) return null;
        return { level, column, row };
    }

    function address(id) {
        const value = parse(id);
        requireCondition(!!value, `unknown surface detail page ${id}`);
        return value;
    }

    function build(level, column, row) {
        const shift = level - maxLevel, ratio = 2 ** shift, native = natives.get(createLandscapeChunkId(maxLevel, column >> shift, row >> shift));
        const fineStartColumn = column * grid.chunkIntervals, fineStartRow = row * grid.chunkIntervals;
        const startColumn = fineStartColumn / ratio, startRow = fineStartRow / ratio, span = grid.chunkIntervals / ratio;
        return Object.freeze({
            id: createLandscapeChunkId(level, column, row), level, column, row, startColumn, startRow, fineStartColumn, fineStartRow,
            sampleStride: 1 / ratio, columns: grid.chunkIntervals + 1, rows: grid.chunkIntervals + 1,
            bounds: Object.freeze({ minX: manifest.bounds.minX + startColumn * grid.spacingX, maxX: manifest.bounds.minX + (startColumn + span) * grid.spacingX,
                minZ: manifest.bounds.maxZ - (startRow + span) * grid.spacingZ, maxZ: manifest.bounds.maxZ - startRow * grid.spacingZ }),
            minHeight: native.minHeight, maxHeight: native.maxHeight,
            parentId: shift === 1 ? native.id : createLandscapeChunkId(level - 1, column >> 1, row >> 1), nativeAncestorId: native.id,
            spacing: Object.freeze({ x: grid.spacingX / ratio, z: grid.spacingZ / ratio }), generated: true, measured: false
        });
    }

    function descriptor(id) { const { level, column, row } = address(id); return build(level, column, row); }

    function resolve(value) {
        const derived = descriptor(typeof value === 'string' ? value : value?.id);
        if (typeof value !== 'string') requireCondition(value.level === derived.level && value.column === derived.column && value.row === derived.row, `surface detail descriptor ${derived.id} does not match its derived address`);
        return derived;
    }

    function children(id) {
        const native = natives.get(id), { level, column, row } = native ?? address(id);
        if (level >= finestLevel) return Object.freeze([]);
        return Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]].map(([dc, dr]) => build(level + 1, column * 2 + dc, row * 2 + dr)));
    }

    function parentId(id) {
        const { level, column, row } = address(id);
        return level === maxLevel + 1 ? createLandscapeChunkId(maxLevel, column >> 1, row >> 1) : createLandscapeChunkId(level - 1, column >> 1, row >> 1);
    }

    function nativeAncestorId(id) {
        const { level, column, row } = address(id), shift = level - maxLevel;
        return createLandscapeChunkId(maxLevel, column >> shift, row >> shift);
    }

    function spacing(level) {
        requireInteger(level, maxLevel, finestLevel, 'surface detail spacing level');
        return Object.freeze({ x: grid.spacingX / 2 ** (level - maxLevel), z: grid.spacingZ / 2 ** (level - maxLevel) });
    }

    function supportOf(value, input) {
        const recipe = validateLandscapeSurfaceDetailRecipe(input), page = resolve(value), format = LANDSCAPE_SURFACE_DETAIL_FORMAT, bounds = manifest.bounds, boundary = recipe.boundary;
        requireCondition(page.level - maxLevel <= recipe.levels, `surface detail page ${page.id} is deeper than recipe ${recipe.id} allows`);
        const ratio = 2 ** (page.level - maxLevel), spacingX = grid.spacingX / ratio, spacingZ = grid.spacingZ / ratio, fineSpacing = Math.min(spacingX, spacingZ);
        const fineColumns = (grid.columns - 1) * ratio + 1, fineRows = (grid.rows - 1) * ratio + 1, searchRadius = radiusFor(recipe, fineSpacing), searchRadiusMeters = searchRadius * fineSpacing;
        const halo = format.storedHaloSamples;
        const window = (before, after) => Object.freeze({ minColumn: page.fineStartColumn - before, maxColumn: page.fineStartColumn + page.columns - 1 + after,
            minRow: page.fineStartRow - before, maxRow: page.fineStartRow + page.rows - 1 + after });
        const output = window(halo, halo), labels = window(halo - format.uniformMinOffset, halo + format.uniformMaxOffset);
        const fineColumn = c => Math.max(0, Math.min(fineColumns - 1, c)), fineRow = r => Math.max(0, Math.min(fineRows - 1, r));
        const evaluationBounds = Object.freeze({ minX: bounds.minX + fineColumn(labels.minColumn) * spacingX, maxX: bounds.minX + fineColumn(labels.maxColumn) * spacingX,
            minZ: bounds.maxZ - fineRow(labels.maxRow) * spacingZ, maxZ: bounds.maxZ - fineRow(labels.minRow) * spacingZ });
        const maxWarpMeters = recipe.warp.amplitudes.reduce((sum, amplitude) => sum + amplitude, 0), nativeSpacing = Math.max(grid.spacingX, grid.spacingZ);
        const queryRadiusMeters = searchRadiusMeters + Math.max((boundary.maxDisplacementCells + 1.5) * nativeSpacing, recipe.breakup.junctionFadeMeters);
        const influence = maxWarpMeters + searchRadiusMeters + format.overrideProbeMeters;
        const canonical = influence + queryRadiusMeters;
        const influenceBounds = Object.freeze({ minX: evaluationBounds.minX - influence, maxX: evaluationBounds.maxX + influence, minZ: evaluationBounds.minZ - influence, maxZ: evaluationBounds.maxZ + influence });
        const dependencyCells = Math.ceil(boundary.windowSigmas * boundary.sigmaCells + boundary.maxDisplacementCells / boundary.gapFraction + 1 + boundary.loops.maxPerimeterCells / 2) + 2;
        const nativeWindow = Object.freeze({
            minColumn: Math.floor((evaluationBounds.minX - canonical - bounds.minX) / grid.spacingX) - dependencyCells,
            maxColumn: Math.ceil((evaluationBounds.maxX + canonical - bounds.minX) / grid.spacingX) + dependencyCells,
            minRow: Math.floor((bounds.maxZ - evaluationBounds.maxZ - canonical) / grid.spacingZ) - dependencyCells,
            maxRow: Math.ceil((bounds.maxZ - evaluationBounds.minZ + canonical) / grid.spacingZ) + dependencyCells
        });
        const nativeColumn = c => Math.max(0, Math.min(grid.columns - 1, c)), nativeRow = r => Math.max(0, Math.min(grid.rows - 1, r));
        const owner = value => Math.min(2 ** maxLevel - 1, Math.floor(value / grid.chunkIntervals)), owners = [];
        for (let row = owner(nativeRow(nativeWindow.minRow)); row <= owner(nativeRow(nativeWindow.maxRow)); row++) {
            for (let column = owner(nativeColumn(nativeWindow.minColumn)); column <= owner(nativeColumn(nativeWindow.maxColumn)); column++) {
                const chunk = natives.get(createLandscapeChunkId(maxLevel, column, row));
                owners.push(Object.freeze({ id: chunk.id, sha256: chunk.channels.landCover.sha256 }));
            }
        }
        const nativeBounds = Object.freeze({ minX: bounds.minX + nativeColumn(nativeWindow.minColumn) * grid.spacingX, maxX: bounds.minX + nativeColumn(nativeWindow.maxColumn) * grid.spacingX,
            minZ: bounds.maxZ - nativeRow(nativeWindow.maxRow) * grid.spacingZ, maxZ: bounds.maxZ - nativeRow(nativeWindow.minRow) * grid.spacingZ });
        return Object.freeze({ id: page.id, level: page.level, ratio, spacing: Object.freeze({ x: spacingX, z: spacingZ }), searchRadius, searchRadiusMeters, queryRadiusMeters,
            canonicalMeters: canonical, fineColumns, fineRows, windows: Object.freeze({ output, labels }), evaluationBounds, influenceBounds, maxWarpMeters,
            native: Object.freeze({ window: nativeWindow, bounds: nativeBounds, dependencyCells }), owners: Object.freeze(owners) });
    }

    // natural: the landscape-natural-soil-request covering the support owners (null or absent: every owner keeps the overview infill)
    function inputsOf(value, input, seed, natural = null) {
        requireInteger(seed, 0, 0xffffffff, 'surface detail seed');
        const recipe = validateLandscapeSurfaceDetailRecipe(input), support = supportOf(value, recipe), page = resolve(value);
        const overview = manifest.chunks.find(chunk => chunk.id === manifest.overviewId), terrainLabels = recipe.base.labels === LANDSCAPE_NATURAL_SOIL.terrain;
        return freezeData({
            format: INPUT_FORMAT, schemaVersion: terrainLabels ? 2 : 1,
            ...(terrainLabels ? { natural: landscapeNaturalSoilIdentity(manifest, natural, support.owners.map(entry => entry.id)) } : {}),
            recipe: { id: recipe.id, hash: hash64(recipe) }, seed,
            page: { id: page.id, level: page.level, column: page.column, row: page.row },
            frame: { landscapeId: manifest.id, bounds: { minX: manifest.bounds.minX, maxX: manifest.bounds.maxX, minZ: manifest.bounds.minZ, maxZ: manifest.bounds.maxZ },
                grid: { columns: grid.columns, rows: grid.rows, spacingX: grid.spacingX, spacingZ: grid.spacingZ, chunkIntervals: grid.chunkIntervals, maxLevel } },
            soil: { catalog: manifest.soil.catalog.map(soil => soil.id), defaultId: manifest.soil.defaultId,
                landCoverMapping: [...manifest.soil.landCoverMapping].sort((a, b) => a.landCoverId - b.landCoverId).map(entry => ({ landCoverId: entry.landCoverId, soilId: entry.soilId })),
                planningOnly: manifest.landCover.catalog.filter(entry => entry.planningOnly).map(entry => entry.id).sort((a, b) => a - b) },
            cover: support.owners.map(entry => ({ id: entry.id, sha256: entry.sha256 })),
            overview: { id: overview.id, sha256: overview.channels.landCover.sha256 },
            overrides: manifest.soil.overrides.filter(override => landscapeRegionIntersectsBounds(override.region, support.influenceBounds))
                .map(override => ({ soilId: override.soilId, region: clonePlainData(override.region, 'soil override region') }))
        });
    }

    return Object.freeze({ manifest, levels, maxLevel, finestLevel, isFine: id => parse(id) !== null, descriptor, children, parentId, nativeAncestorId, spacing,
        support: supportOf, inputs: inputsOf });
}

/** @param {any} manifest @param {any} descriptor @param {any} recipe */
export function landscapeSurfaceDetailSupport(manifest, descriptor, recipe) {
    const validated = validateLandscapeSurfaceDetailRecipe(recipe);
    return createLandscapeSurfaceDetailIndex(manifest, { levels: validated.levels }).support(descriptor, validated);
}

/**
 * Frozen canonical JSON of every input that determines a fine page's bytes.
 * @param {any} manifest @param {any} descriptor @param {any} recipe @param {number} seed @param {any} [natural] landscape-natural-soil-request of the support owners
 */
export function landscapeSurfaceDetailInputs(manifest, descriptor, recipe, seed, natural = null) {
    const validated = validateLandscapeSurfaceDetailRecipe(recipe);
    return createLandscapeSurfaceDetailIndex(manifest, { levels: validated.levels }).inputs(descriptor, validated, seed, natural);
}
