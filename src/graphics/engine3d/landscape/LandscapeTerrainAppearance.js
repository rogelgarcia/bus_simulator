// Declares the terrain-driven natural appearance of the landscape (AI577 D5), its landscape-scale appearance layer and exact JavaScript mirrors.
// @ts-check
// Design (landscape-terrain-appearance-v1). Broad natural variation is derived from the D5 terrain fields, never from added noise:
// - landscape-scale layer: when the root terrain-field page (15.625 m on the coast, tent-prefiltered) is decoded, the appearance worker derives one
//   RGBA8 layer from it and the root heights and land cover, stored after the page layers of the terrain-field array (no sampler, no uniform): the
//   catena moisture index, deposition, the coastal reach and the rock-exposure modulation. Planning-only cover (graded pads, road embankments
//   and their ditches, displayed as inferred natural ground since D5d) grades the terrain around it (the coastal prototype feathers districts
//   over 65-150 m and road shoulders over 72 m), so terrain near it carries no confidence: 0 within nearMeters of planning cover, rising to 1 at
//   farMeters. Terrain position comes from first-order normalized convolution (Knutsson & Westin 1993) over the confident land samples only, which
//   fits one-sided neighborhoods without bias, and the catena of the confident samples is continued over planning, stale and submerged samples
//   by pull-push (Gortler, Grzeszczuk, Szeliski & Cohen 1996), as is deposition. Inferred ground thus continues the natural variation around it
//   instead of showing ghost roads, embankment rims or district outlines. The shader reconstructs the layer with a C2 cubic B-spline from four
//   bilinear taps (Sigg & Hadwiger 2005), so its texel grid never shows; every term fades to neutral with the root page's arrival, near stale
//   8 x 8 cells (distance fade on the fresh side, no seam), below the waterline and at footprints beyond the root spacing;
// - catena (soil-landscape sequence, Milne 1935; terrain attributes of digital soil mapping, McBratney, Mendonça Santos & Minasny 2003): the
//   moisture index combines the multi-scale topographic position index of the natural land (Weiss 2001; De Reu et al. 2013: hollows and
//   footslopes moist, ridges and shoulders dry), topographic wetness, flow and steepness, soft-clipped and low-passed; it drives the existing
//   landscape-scale field (landscapeMacroField, the documented D5 input point) through the unchanged per-material responses, each soil by its
//   development role (developed soils fully, mobile sand half, seabed and rock not): moist hollows darker, richer and smoother, lusher on grass;
//   convex ridges and steep slopes drier, lighter and grayer; depositional flats finer, slightly lighter and less saturated;
// - exposed rock: the D5a rockExposure formula at the fragment's own geometric slope with the landscape-scale convexity, flow and deposition
//   moves a share of susceptible soils' coverage to the exposed-rock soil before the D1a height competition and D2 clumps, which reveal rock
//   relief through the soil; semantic soil, cover and queries are unchanged;
// - coastal wetting (visual only, no hydrology): wave runup R2 of Stockdon et al. (2006) for a light swell at the local beach slope, the
//   intertidal sand of a falling microtidal tide (seepage face, Turner 1993), the capillary fringe of beach sand (Horn 2002; Namikas et al.
//   2010) and seepage at drainage outlets give the height above sea level the sea wets; saturated sand darkens by the Lekner & Dorf (1988) water-film model with the water optics' own interface constants, so it meets the
//   submerged sand of the water column continuously, and its film is smooth and specular (GGX kept, no natural-surface shadowing or opposition);
// - rock: weathering rinds and lichen darken stable gentle outcrops, more where the catena keeps them moist, while steep faces stay fresh, and a
//   biofilm zone (Verrucaria black zone, Stephenson & Stephenson 1949/1972) darkens rock wetted by splash just above the sea.
// Shader parameters are compile-time defines (landscapeTerrainAppearanceDefines); each soil's role (development in [0, 1] scaling rock exposure
// and the catena terms, or -1 for the exposed-rock substrate) rides in the otherwise unused uSoilScale.x; the A/B switch is uLandscapeResponse.w
// (LandscapeLightingModel); the planning cover bitmask uPlanningCover serves the dressing diagnostics. Shader chunk:
// chunks/landscape/terrain_appearance.glsl.
import { LANDSCAPE_WATER_OPTICS } from './LandscapeLightingModel.js';
import { LANDSCAPE_DRESSING_INPUTS } from '../../../app/landscape/LandscapeDressingInputs.js';

const GRAVITY = 9.80665;

export const LANDSCAPE_TERRAIN_APPEARANCE = Object.freeze({
    id: 'landscape-terrain-appearance-v1',
    layer: Object.freeze({ id: 'landscape-appearance-layer-v1', source: 'resident root terrain-field page and root land cover', placement: 'last layer of the terrain-field array',
        channels: Object.freeze({ r: 'catena moisture index, signed linear', g: 'deposition, linear', b: 'coastal reach, centimeters (0-2.55 m)', a: 'rock exposure modulation, linear' }),
        reconstruction: 'cubic-b-spline-from-four-bilinear-taps', derivation: 'appearance worker',
        // every typed array one derivation allocates per root sample (measured 182 B on the coast), reserved while it runs
        workBytesPerSample: 192 }),
    // planning exclusion: the natural weight rises from 0 at nearMeters to 1 at farMeters from planning-only cover (root samples) and weights the
    // terrain-position fit; the catena and deposition count with its catenaWeightPower power before the pull-push fill, so terrain graded over
    // feathers up to 150 m (the widest district feather of the coastal prototype) cannot leak into the fill (synthetic pads and roads: worst mean
    // deviation 0.03-0.09 against 0.7-0.9 without exclusion); final Gaussian low-pass in root samples
    exclusion: Object.freeze({ nearMeters: 60, farMeters: 200, catenaWeightPower: 4, fill: 'pull-push', lowPassSamples: 1 }),
    footprintFadeSpacings: Object.freeze([1, 4]),
    freshness: Object.freeze({ fadeMeters: 32, grid: 8, model: 'distance-to-nearest-stale-cell-on-the-fresh-side' }),
    planning: Object.freeze({ coverIds: 128 }),
    landFadeMeters: Object.freeze([-.25, .5]),
    // moisture index = -TPI / tpiScale + wetness (TWI - center) + flow - steepness; TPI is the mean of the residuals from the normalized-convolution
    // planes at the given root-sample Gaussian scales (about 62 and 188 m on the coast), valid where the neighborhood holds minimumSupport of a full one
    catena: Object.freeze({ tpiScalesSamples: Object.freeze([4, 12]), tpiScaleMeters: 1.5, minimumSupport: .05, wetnessCenter: .35, wetness: .5, flow: .2, steepness: .3,
        steepDegrees: Object.freeze([12, 30]), clip: 1.5 }),
    // added to the landscape-scale (tone, chroma) field per unit moisture index or deposition, times each soil's development role; the D4
    // per-material responses turn them into log2 value, saturation, hue and roughness (forest: -24% value in a saturated hollow, +32% on a dry
    // ridge; grass also greener and more saturated in hollows, yellower and grayer on ridges)
    response: Object.freeze({ toneMoisture: -4.5, toneDeposition: 1.5, chromaMoisture: 2.2, chromaDeposition: -1 }),
    rockExposure: Object.freeze({ slopeDegrees: Object.freeze([18, 32]), convexBase: .65, convexGain: .35, flowSuppression: .75, depositionSuppression: .8, gain: .75 }),
    // soil development per soil, the share of rock exposure a soil reveals and of the catena terms it expresses: developed vegetated and bare
    // soils fully, mobile sand half, the seabed never; -1 marks the exposed-rock substrate (no catena terms, its own weathering)
    roles: Object.freeze({ unknown: 1, seabed: 0, sand: .5, loam: 1, forest: 1, rock: -1 }),
    coastal: Object.freeze({
        // light swell: deep-water significant wave height and peak period; R2 = 1.1 (0.35 beta sqrt(H L) + 0.5 sqrt(H L (0.563 beta^2 + 0.004)))
        waveHeightMeters: .5, wavePeriodSeconds: 6, maximumBeachSlopeDegrees: 14,
        // the falling mid-tide of a microtidal coast (about 1 m range): the intertidal sand the last high water covered is still saturated, its
        // water table outcropping as a seepage face (Turner 1993); sea level itself never moves
        tidalMeters: .5,
        capillaryMeters: .35, seepageFlowMeters: .6, shoreFadeMeters: Object.freeze([80, 160]), maximumReachMeters: 2.55,
        // saturated up to coreFraction of the reach, dry at the reach; the glossy water film covers the lower swash zone
        coreFraction: .45, filmFraction: Object.freeze([.15, .45]), darkeningExponent: .7,
        wetRoughness: .18, filmNormalFlattening: .7, wetDiffuseRoughness: .1
    }),
    rock: Object.freeze({
        // weathering rinds and crustose lichens darken every stable gentle outcrop (log2 -0.7: granite 0.24 -> 0.15); moss and biofilm add darkening
        // where the catena keeps rock moist: x (1 + moistureGain x the positive weighted moisture index)
        weatheredSlopeDegrees: Object.freeze([28, 50]), weatheredLog2: -.7, moistureGain: .4,
        // near-neutral tint of weathered, lichen-covered rock: takes the pink cast off fresh granite toward a warm gray
        weatheredTint: Object.freeze([.95, 1, .93]),
        biofilm: Object.freeze({ splashFactor: 1.8, albedoFactor: .4, cover: .85, tint: Object.freeze([.974, 1.026, .82]), heightFadeMeters: Object.freeze([-.4, 0]), reachFadeMeters: Object.freeze([.05, .2]) })
    }),
    sources: Object.freeze({
        catena: 'Milne 1935 catena; Weiss 2001 and De Reu et al. 2013 (TPI); moist soils 0.5-2 Munsell value units darker (Soil Survey Manual, USDA 2017), Lobell & Asner 2002 SSSAJ 66:722',
        inpainting: 'Knutsson & Westin 1993, CVPR (normalized convolution); Gortler, Grzeszczuk, Szeliski & Cohen 1996, The Lumigraph (pull-push); Sigg & Hadwiger 2005, GPU Gems 2 ch. 20 (B-spline from bilinear taps)',
        runup: 'Stockdon, Holman, Howd & Sallenger 2006, Coastal Engineering 53:573, R2 runup',
        capillary: 'Horn 2002, Geomorphology 48:121; Namikas, Edwards, Bitton, Booth & Zhu 2010, Geomorphology 114:303; seepage face: Turner 1993, Marine Geology 115:227',
        wetting: 'Lekner & Dorf 1988, Applied Optics 27:1278; Twomey, Bohren & Mergenthaler 1986, Applied Optics 25:431; Nolet et al. 2014, PLoS ONE 9:e112151',
        rock: 'Stephenson & Stephenson 1949/1972 littoral zonation (Verrucaria black zone); ASTER library granite 0.2-0.35, weathered outcrops toward 0.15'
    })
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
const smoothstep = (edge0, edge1, value) => { const t = clamp((value - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** Lekner-Dorf transmission of a water film: light entering it (diffuse transmission) and escaping it (1 - internal reflectance). */
export function landscapeWetFilmTransmission() { return LANDSCAPE_WATER_OPTICS.diffuseTransmission * (1 - LANDSCAPE_WATER_OPTICS.internalReflectance); }

/** Deep-water H0 L0 of the light swell (m^2), L0 = g T^2 / (2 pi). */
export function landscapeSwellHeightLength() {
    const { waveHeightMeters, wavePeriodSeconds } = LANDSCAPE_TERRAIN_APPEARANCE.coastal;
    return waveHeightMeters * GRAVITY * wavePeriodSeconds * wavePeriodSeconds / (2 * Math.PI);
}

/** Terrain role of a catalog soil: development in [0, 1] or -1 for the exposed-rock substrate (unknown soil IDs are inert). @param {string} soilId */
export function landscapeSoilTerrainRole(soilId) {
    return typeof soilId === 'string' && Object.hasOwn(LANDSCAPE_TERRAIN_APPEARANCE.roles, soilId) ? LANDSCAPE_TERRAIN_APPEARANCE.roles[soilId] : 0;
}

/** Share of the catena terms a catalog soil expresses (its development role, none for the rock substrate). @param {string} soilId */
export function landscapeSoilCatenaShare(soilId) { return Math.max(0, landscapeSoilTerrainRole(soilId)); }

/** Bitmask uvec4 of the planning-only land-cover IDs (below 128). @param {ReadonlyArray<{id:number,planningOnly:boolean}>} catalog */
export function landscapePlanningCoverMask(catalog) {
    if (!Array.isArray(catalog)) throw new Error('[LandscapeTerrainAppearance] The land-cover catalog is required');
    const mask = new Uint32Array(4);
    for (const entry of catalog) {
        if (!entry.planningOnly) continue;
        if (!Number.isSafeInteger(entry.id) || entry.id < 0 || entry.id >= LANDSCAPE_TERRAIN_APPEARANCE.planning.coverIds) throw new Error(`[LandscapeTerrainAppearance] Planning cover ${entry.id} is outside the 0-127 shader bitmask`);
        mask[entry.id >> 5] = (mask[entry.id >> 5] | (1 << (entry.id & 31))) >>> 0;
    }
    return mask;
}

/** Whether a cover ID is planning-only in a bitmask. @param {ArrayLike<number>} mask @param {number} cover */
export function landscapePlanningCover(mask, cover) { return cover < 128 && ((mask[cover >> 5] >>> (cover & 31)) & 1) === 1; }

/** Cubic B-spline tap weights and offsets (from the left sample) of a fractional position: two bilinear taps per axis. @param {number} f in [0, 1) */
export function landscapeBSplineTaps(f) {
    const f2 = f * f, f3 = f2 * f, g = 1 - f;
    const w0 = g * g * g / 6, w1 = (3 * f3 - 6 * f2 + 4) / 6, w2 = (-3 * f3 + 3 * f2 + 3 * f + 1) / 6, w3 = f3 / 6;
    return { weights: [w0 + w1, w2 + w3], offsets: [-1 + w1 / (w0 + w1), 1 + w3 / (w2 + w3)], cubic: [w0, w1, w2, w3] };
}

/**
 * Cubic B-spline of one RGBA8 layer at a world position from four bilinear taps (unit values), the mirror of landscapeAppearanceLayer.
 * @param {Uint8Array} pixels @param {number} offset byte offset of the layer @param {{width:number,halo:number,samples:number}} layout
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {number} x @param {number} z @returns {number[]} four unit values
 */
export function landscapeAppearanceLayerUnits(pixels, offset, layout, bounds, x, z) {
    const intervals = layout.samples - 1;
    const gx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * intervals, 0, intervals), gz = clamp((bounds.maxZ - z) / (bounds.maxZ - bounds.minZ) * intervals, 0, intervals);
    const bx = Math.floor(gx), bz = Math.floor(gz), tx = landscapeBSplineTaps(gx - bx), tz = landscapeBSplineTaps(gz - bz), units = [0, 0, 0, 0];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const px = bx + tx.offsets[i] + layout.halo, pz = bz + tz.offsets[j] + layout.halo, weight = tx.weights[i] * tz.weights[j];
        const ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
        const at = (column, row, component) => pixels[offset + (row * layout.width + column) * 4 + component];
        for (let component = 0; component < 4; component++) {
            const value = (at(ix, iz, component) * (1 - fx) + at(ix + 1, iz, component) * fx) * (1 - fz) + (at(ix, iz + 1, component) * (1 - fx) + at(ix + 1, iz + 1, component) * fx) * fz;
            units[component] += weight * value / 255;
        }
    }
    return units;
}

/**
 * Freshness of terrain fields at a world position: 1 away from stale cells, rising from 0 at a stale cell's border over fadeMeters on the
 * fresh side (mirror of landscapeTerrainFreshness).
 * @param {readonly number[]} staleCells two uint32 words of the 8 x 8 cell bits @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 * @param {number} x @param {number} z
 */
export function landscapeTerrainFreshness(staleCells, bounds, x, z) {
    if (!staleCells[0] && !staleCells[1]) return 1;
    const grid = LANDSCAPE_TERRAIN_APPEARANCE.freshness.grid, cellX = (bounds.maxX - bounds.minX) / grid, cellZ = (bounds.maxZ - bounds.minZ) / grid;
    const px = x - bounds.minX, pz = bounds.maxZ - z, column = clamp(Math.floor(px / cellX), 0, grid - 1), row = clamp(Math.floor(pz / cellZ), 0, grid - 1);
    let distance = 1e9;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c = column + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= grid || r >= grid) continue;
        const bit = r * grid + c;
        if (((staleCells[bit >> 5] >>> (bit & 31)) & 1) === 0) continue;
        const dx = Math.max(c * cellX - px, px - (c + 1) * cellX, 0), dz = Math.max(r * cellZ - pz, pz - (r + 1) * cellZ, 0);
        distance = Math.min(distance, Math.hypot(dx, dz));
    }
    return smoothstep(0, LANDSCAPE_TERRAIN_APPEARANCE.freshness.fadeMeters, distance);
}

/**
 * Soft-clipped catena moisture index (positive moist hollows and footslopes, negative dry ridges and steep slopes).
 * @param {{tpi:number,wetness:number,flow:number,slopeDegrees:number}} terrain topographic position (m) and slope of the natural heights, wetness and flow
 */
export function landscapeCatenaMoisture({ tpi, wetness, flow, slopeDegrees }) {
    const c = LANDSCAPE_TERRAIN_APPEARANCE.catena;
    const index = -tpi / c.tpiScaleMeters + c.wetness * (wetness - c.wetnessCenter) + c.flow * flow - c.steepness * smoothstep(c.steepDegrees[0], c.steepDegrees[1], slopeDegrees);
    const x = clamp(index, -c.clip, c.clip);
    return x - x * x * x / (3 * c.clip * c.clip);
}

/** Landscape-scale modulation of the D5a rock exposure (everything but its slope term). @param {{convexity:number,flow:number,deposition:number}} fields */
export function landscapeRockExposureModulation({ convexity, flow, deposition }) {
    const r = LANDSCAPE_TERRAIN_APPEARANCE.rockExposure;
    return (r.convexBase + r.convexGain * Math.max(0, convexity)) * (1 - r.flowSuppression * flow) * (1 - r.depositionSuppression * deposition);
}

/** D5a rock exposure at a slope with a modulation (landscapeRockExposureModulation). @param {number} slopeDegrees @param {number} modulation */
export function landscapeRockExposure(slopeDegrees, modulation) {
    const r = LANDSCAPE_TERRAIN_APPEARANCE.rockExposure;
    return smoothstep(r.slopeDegrees[0], r.slopeDegrees[1], slopeDegrees) * modulation;
}

/** Stockdon et al. (2006) R2 runup of the light swell at a beach slope (degrees, capped). @param {number} slopeDegrees */
export function landscapeRunupHeight(slopeDegrees) {
    const beta = Math.tan(Math.min(slopeDegrees, LANDSCAPE_TERRAIN_APPEARANCE.coastal.maximumBeachSlopeDegrees) * Math.PI / 180), hl = landscapeSwellHeightLength();
    return 1.1 * (.35 * beta * Math.sqrt(hl) + .5 * Math.sqrt(hl * (.563 * beta * beta + .004)));
}

/** Height above sea level wetted by the sea for the layer: runup at the field slope, the falling tide, the capillary fringe and seepage, faded inland. @param {{slopeDegrees:number,flow:number,shoreDistance:number}} fields */
export function landscapeLayerReach({ slopeDegrees, flow, shoreDistance }) {
    const c = LANDSCAPE_TERRAIN_APPEARANCE.coastal;
    return Math.min(c.maximumReachMeters, (landscapeRunupHeight(slopeDegrees) + c.tidalMeters + c.capillaryMeters + c.seepageFlowMeters * flow)
        * (1 - smoothstep(c.shoreFadeMeters[0], c.shoreFadeMeters[1], shoreDistance)));
}

/** Moisture (darkening) and water film (gloss) of a surface at a height above sea level under a reach. @param {number} height @param {number} reach */
export function landscapeCoastalWetting(height, reach) {
    const c = LANDSCAPE_TERRAIN_APPEARANCE.coastal;
    if (!(reach > 0 && height < reach)) return { moisture: 0, film: 0 };
    return { moisture: 1 - smoothstep(c.coreFraction * reach, reach, height), film: 1 - smoothstep(c.filmFraction[0] * reach, c.filmFraction[1] * reach, height) };
}

/** Lekner-Dorf water-film albedo of a linear albedo channel. @param {number} albedo */
export function landscapeWetAlbedo(albedo) { return albedo * landscapeWetFilmTransmission() / (1 - LANDSCAPE_WATER_OPTICS.internalReflectance * albedo); }

/**
 * Wetted surface of the dry radiance path (mirror of landscapeCoastalWetSurface): albedo mixed toward the film albedo by moisture^exponent, roughness
 * toward the film roughness and the normal toward the geometric normal by the film, and the natural-ground response toward a smooth wet surface.
 * @param {{albedo:number[],normal:number[],geometricNormal:number[],roughness:number,response:number[],height:number,reach:number}} surface
 */
export function landscapeCoastalWetSurface({ albedo, normal, geometricNormal, roughness, response, height, reach }) {
    const c = LANDSCAPE_TERRAIN_APPEARANCE.coastal, { moisture, film } = landscapeCoastalWetting(height, reach);
    if (moisture <= 0) return { albedo: [...albedo], normal: [...normal], roughness, response: [...response], moisture, film };
    const darkening = moisture ** c.darkeningExponent, mixed = normal.map((value, axis) => mix(value, geometricNormal[axis], c.filmNormalFlattening * film)), length = Math.hypot(...mixed);
    return { albedo: albedo.map(value => mix(value, landscapeWetAlbedo(value), darkening)), normal: mixed.map(value => value / length), roughness: mix(roughness, c.wetRoughness, film),
        response: [mix(response[0], c.wetDiffuseRoughness, moisture), mix(response[1], 0, film), mix(response[2], 0, moisture)], moisture, film };
}

/**
 * Rock albedo factor of weathering and the splash biofilm (mirror of landscapeRockFactor); moisture is the weighted moisture index of the fragment.
 * @param {{slopeDegrees:number,height:number,reach:number,moisture?:number}} input
 */
export function landscapeRockFactor({ slopeDegrees, height, reach, moisture = 0 }) {
    const r = LANDSCAPE_TERRAIN_APPEARANCE.rock, b = r.biofilm, weathered = 1 - smoothstep(r.weatheredSlopeDegrees[0], r.weatheredSlopeDegrees[1], slopeDegrees);
    const darkening = r.weatheredLog2 * weathered * (1 + r.moistureGain * clamp(moisture, 0, 1));
    const factor = r.weatheredTint.map(tint => 2 ** darkening * mix(1, tint, weathered));
    const top = Math.max(b.splashFactor * reach, .01);
    const biofilm = smoothstep(b.heightFadeMeters[0], b.heightFadeMeters[1], height) * (1 - smoothstep(.75 * top, top, height)) * smoothstep(b.reachFadeMeters[0], b.reachFadeMeters[1], reach);
    return factor.map((value, channel) => mix(value, b.tint[channel] * b.albedoFactor, b.cover * biofilm));
}

// exact Euclidean distance transform of a binary grid (Felzenszwalb & Huttenlocher 2012), in samples; Infinity without any set sample
function distanceTransform(binary, n) {
    const grid = new Float32Array(n * n), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), inf = 1e20;
    if (!binary.some(Boolean)) return grid.fill(Infinity);
    const pass = () => {
        let k = 0;
        v[0] = 0; z[0] = -inf; z[1] = inf;
        for (let q = 1; q < n; q++) {
            let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
            while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
            k++; v[k] = q; z[k] = s; z[k + 1] = inf;
        }
        k = 0;
        for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    };
    for (let i = 0; i < n * n; i++) grid[i] = binary[i] ? 0 : inf;
    for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) f[y] = grid[y * n + x]; pass(); for (let y = 0; y < n; y++) grid[y * n + x] = d[y]; }
    for (let y = 0; y < n; y++) { for (let x = 0; x < n; x++) f[x] = grid[y * n + x]; pass(); for (let x = 0; x < n; x++) grid[y * n + x] = Math.sqrt(d[x]); }
    return grid;
}

// pull-push inpainting (Gortler et al. 1996): weighted 2x2 pulls up a pyramid (weights clamped to 1), bilinear pushes back down; samples with
// weight 1 keep their value, weight 0 take the interpolation of their surroundings
function pullPush(values, weights, n) {
    const levels = [{ size: n, value: Float32Array.from(values), weight: Float32Array.from(weights) }];
    while (levels.at(-1).size > 1) {
        const fine = levels.at(-1), size = Math.ceil(fine.size / 2), value = new Float32Array(size * size), weight = new Float32Array(size * size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            let sum = 0, total = 0;
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
                const fx = 2 * x + dx, fy = 2 * y + dy;
                if (fx >= fine.size || fy >= fine.size) continue;
                const w = fine.weight[fy * fine.size + fx];
                sum += w * fine.value[fy * fine.size + fx]; total += w;
            }
            value[y * size + x] = total > 0 ? sum / total : 0;
            weight[y * size + x] = Math.min(1, total);
        }
        levels.push({ size, value, weight });
    }
    for (let k = levels.length - 2; k >= 0; k--) {
        const level = levels[k], coarse = levels[k + 1];
        for (let y = 0; y < level.size; y++) for (let x = 0; x < level.size; x++) {
            const cx = clamp((x + .5) / 2 - .5, 0, coarse.size - 1), cy = clamp((y + .5) / 2 - .5, 0, coarse.size - 1);
            const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(coarse.size - 1, x0 + 1), y1 = Math.min(coarse.size - 1, y0 + 1), tx = cx - x0, ty = cy - y0;
            const filled = (coarse.value[y0 * coarse.size + x0] * (1 - tx) + coarse.value[y0 * coarse.size + x1] * tx) * (1 - ty) + (coarse.value[y1 * coarse.size + x0] * (1 - tx) + coarse.value[y1 * coarse.size + x1] * tx) * ty;
            const index = y * level.size + x, w = level.weight[index];
            level.value[index] = w * level.value[index] + (1 - w) * filled;
        }
    }
    return levels[0].value;
}

/**
 * First-order normalized convolution (Knutsson & Westin 1993) of an n x n grid: at every sample, the Gaussian-weighted least-squares plane through
 * the samples weighted by their confidence (zero outside the grid). Excluded samples (confidence 0) never pull the plane, and a one-sided
 * neighborhood still fits a slope exactly, so the residual of a sample measures its curvature, not the exclusion around it. Samples whose
 * neighborhood holds less than minimumSupport of a full Gaussian's confidence are invalid; a degenerate neighborhood (samples on a line) falls back
 * to the weighted mean.
 * @param {ArrayLike<number>} values @param {ArrayLike<number>} confidence in [0, 1] @param {number} n @param {number} sigma in samples
 * @returns {{value:Float64Array,gradientX:Float64Array,gradientRow:Float64Array,valid:Uint8Array}} fitted value and gradient per sample (per column and per row)
 */
export function landscapeNormalizedPlaneFit(values, confidence, n, sigma) {
    const radius = Math.ceil(3 * sigma), taps = 2 * radius + 1, count = n * n, g0 = new Float64Array(taps), g1 = new Float64Array(taps), g2 = new Float64Array(taps);
    let mass = 0;
    for (let k = -radius; k <= radius; k++) { const g = Math.exp(-k * k / (2 * sigma * sigma)); g0[k + radius] = g; g1[k + radius] = g * k; g2[k + radius] = g * k * k; mass += g; }
    const c = new Float64Array(count), ch = new Float64Array(count);
    for (let i = 0; i < count; i++) { c[i] = clamp(confidence[i], 0, 1); ch[i] = c[i] * values[i]; }
    // out[x] = sum over k of kernel(k) input[x + k] along rows or columns, zero outside the grid
    const rows = (input, kernel) => {
        const out = new Float64Array(count);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            let sum = 0;
            for (let k = Math.max(-radius, -x), last = Math.min(radius, n - 1 - x), at = y * n + x; k <= last; k++) sum += kernel[k + radius] * input[at + k];
            out[y * n + x] = sum;
        }
        return out;
    };
    const columns = (input, kernel) => {
        const out = new Float64Array(count);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            let sum = 0;
            for (let k = Math.max(-radius, -y), last = Math.min(radius, n - 1 - y); k <= last; k++) sum += kernel[k + radius] * input[(y + k) * n + x];
            out[y * n + x] = sum;
        }
        return out;
    };
    const c0 = rows(c, g0), c1 = rows(c, g1), c2 = rows(c, g2), h0 = rows(ch, g0), h1 = rows(ch, g1);
    const m00 = columns(c0, g0), m10 = columns(c1, g0), m01 = columns(c0, g1), m20 = columns(c2, g0), m11 = columns(c1, g1), m02 = columns(c0, g2);
    const r0 = columns(h0, g0), r1 = columns(h1, g0), r2 = columns(h0, g1);
    const value = new Float64Array(count), gradientX = new Float64Array(count), gradientRow = new Float64Array(count), valid = new Uint8Array(count);
    const support = LANDSCAPE_TERRAIN_APPEARANCE.catena.minimumSupport * mass * mass;
    for (let i = 0; i < count; i++) {
        if (!(m00[i] > support)) continue;
        valid[i] = 1;
        const a00 = m20[i] * m02[i] - m11[i] * m11[i], a01 = m11[i] * m01[i] - m10[i] * m02[i], a02 = m10[i] * m11[i] - m20[i] * m01[i];
        const det = m00[i] * a00 + m10[i] * a01 + m01[i] * a02;
        if (!(det > 1e-9 * m00[i] * m20[i] * m02[i])) { value[i] = r0[i] / m00[i]; continue; }
        const a11 = m00[i] * m02[i] - m01[i] * m01[i], a12 = m01[i] * m10[i] - m00[i] * m11[i], a22 = m00[i] * m20[i] - m10[i] * m10[i];
        value[i] = (r0[i] * a00 + r1[i] * a01 + r2[i] * a02) / det;
        gradientX[i] = (r0[i] * a01 + r1[i] * a11 + r2[i] * a12) / det;
        gradientRow[i] = (r0[i] * a02 + r1[i] * a12 + r2[i] * a22) / det;
    }
    return { value, gradientX, gradientRow, valid };
}

// tent-decimated (2:1, vertex aligned) confidence and confidence-weighted mean values of an n x n grid
function decimateConfident(values, confidence, n) {
    const size = Math.floor((n - 1) / 2) + 1, decimatedValues = new Float64Array(size * size), decimatedConfidence = new Float64Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let total = 0, weight = 0, sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const fx = 2 * x + dx, fy = 2 * y + dy;
            if (fx < 0 || fy < 0 || fx >= n || fy >= n) continue;
            const k = (2 - Math.abs(dx)) * (2 - Math.abs(dy)), w = k * confidence[fy * n + fx];
            total += k; weight += w; sum += w * values[fy * n + fx];
        }
        decimatedConfidence[y * size + x] = weight / total;
        decimatedValues[y * size + x] = weight > 0 ? sum / weight : 0;
    }
    return { size, values: decimatedValues, confidence: decimatedConfidence };
}

// bilinear plane fit at a fractional position of its grid; null when a contributing sample is invalid
function interpolateFit(fit, size, x, y) {
    const cx = Math.min(x, size - 1), cy = Math.min(y, size - 1), x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
    const tx = cx - x0, ty = cy - y0, corners = [[y0 * size + x0, (1 - tx) * (1 - ty)], [y0 * size + x1, tx * (1 - ty)], [y1 * size + x0, (1 - tx) * ty], [y1 * size + x1, tx * ty]];
    let value = 0, gradientX = 0, gradientRow = 0;
    for (const [index, weight] of corners) {
        if (weight === 0) continue;
        if (!fit.valid[index]) return null;
        value += weight * fit.value[index]; gradientX += weight * fit.gradientX[index]; gradientRow += weight * fit.gradientRow[index];
    }
    return { value, gradientX, gradientRow };
}

// separable Gaussian low-pass (sigma in samples, edge clamped)
function lowPass(values, n, sigma) {
    if (!(sigma > 0)) return values;
    const radius = Math.ceil(3 * sigma), kernel = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma))), total = kernel.reduce((sum, value) => sum + value, 0);
    const temp = new Float32Array(n * n), out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let sum = 0; for (let k = -radius; k <= radius; k++) sum += kernel[k + radius] * values[y * n + clamp(x + k, 0, n - 1)]; temp[y * n + x] = sum / total; }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let sum = 0; for (let k = -radius; k <= radius; k++) sum += kernel[k + radius] * temp[clamp(y + k, 0, n - 1) * n + x]; out[y * n + x] = sum / total; }
    return out;
}

/**
 * Derives the landscape-scale appearance layer (landscape-appearance-layer-v1) from the root terrain-field page and the root heights and land cover:
 * RGBA8 in the field page layout (two-sample edge-clamped halo, row 0 north), R the catena moisture index (signed linear), G deposition, B the coastal
 * reach in centimeters and A the rock-exposure modulation. Terrain position is fitted over the confident land samples only (away from planning
 * cover, above the sea); the catena of the confident samples and deposition are continued over planning, stale and submerged samples by pull-push.
 * Runs in the appearance worker (LandscapeAppearanceWorker 'appearance-layer'); the caller reserves landscapeAppearanceLayerWorkBytes meanwhile.
 * @param {{fieldPage:Uint8Array,layout:{width:number,halo:number,samples:number,layerBytes:number},heights:Float32Array,cover:Uint8Array,planningMask:ArrayLike<number>,
 *   staleCells:readonly number[],bounds:{minX:number,maxX:number,minZ:number,maxZ:number}}} input heights and cover: the root chunk's samples (samples x samples, row 0 north)
 * @returns {{bytes:Uint8Array,statistics:{samples:number,natural:number,excluded:number,stale:number,sea:number,milliseconds:number}}}
 */
export function buildLandscapeAppearanceLayer({ fieldPage, layout, heights, cover, planningMask, staleCells, bounds }) {
    const started = typeof performance === 'undefined' ? Date.now() : performance.now(), n = layout.samples, count = n * n, model = LANDSCAPE_TERRAIN_APPEARANCE;
    if (!(fieldPage instanceof Uint8Array) || fieldPage.length < 2 * layout.layerBytes || !(cover instanceof Uint8Array) || cover.length !== count || !(heights instanceof Float32Array) || heights.length !== count) {
        throw new Error('[LandscapeTerrainAppearance] The appearance layer needs the root field page and the root chunk heights and land cover on the page grid');
    }
    const spacingX = (bounds.maxX - bounds.minX) / (n - 1), spacingZ = (bounds.maxZ - bounds.minZ) / (n - 1);
    const unit = (layer, component, index) => fieldPage[layer * layout.layerBytes + ((Math.floor(index / n) + layout.halo) * layout.width + index % n + layout.halo) * 4 + component] / 255;
    const planning = new Uint8Array(count);
    for (let i = 0; i < count; i++) planning[i] = landscapePlanningCover(planningMask, cover[i]) ? 1 : 0;
    const distance = distanceTransform(planning, n), natural = new Float32Array(count), fieldWeight = new Float32Array(count);
    const wetness = new Float32Array(count), flow = new Float32Array(count), deposition = new Float32Array(count), reach = new Float32Array(count), modulation = new Float32Array(count);
    const seaSamples = new Uint8Array(count), statistics = { samples: count, natural: 0, excluded: 0, stale: 0, sea: 0, milliseconds: 0 };
    for (let i = 0; i < count; i++) {
        const shore = unit(1, 1, i) * 2 - 1, fields = { wetness: unit(0, 0, i), flow: unit(0, 1, i), deposition: unit(0, 2, i), shoreDistance: Math.sign(shore) * shore * shore * 256,
            convexity: unit(1, 2, i) * 2 - 1, slopeDegrees: unit(1, 3, i) * 90 };
        const x = bounds.minX + (i % n) * spacingX, z = bounds.maxZ - Math.floor(i / n) * spacingZ, stale = !!(staleCells[0] || staleCells[1]) && landscapeTerrainFreshness(staleCells, bounds, x, z) === 0;
        const sea = fields.shoreDistance < 0;
        seaSamples[i] = sea ? 1 : 0;
        natural[i] = smoothstep(model.exclusion.nearMeters, model.exclusion.farMeters, distance[i] * Math.min(spacingX, spacingZ));
        fieldWeight[i] = stale || sea ? 0 : natural[i];
        wetness[i] = fields.wetness; flow[i] = fields.flow; deposition[i] = fields.deposition;
        reach[i] = landscapeLayerReach(fields);
        modulation[i] = landscapeRockExposureModulation(fields) * natural[i];
        if (stale) statistics.stale++; else if (sea) statistics.sea++; else if (natural[i] >= 1) statistics.natural++; else statistics.excluded++;
    }
    const inpaint = (values, weights) => { const filled = pullPush(values, weights, n); return values.map((value, i) => weights[i] * value + (1 - weights[i]) * filled[i]); };
    // terrain position of the natural land: the residual of each sample from the Gaussian-weighted least-squares plane through the natural land samples
    // (graded terrain near planning cover and the seabed carry no confidence), averaged over the scales; slope from the finest plane. The planes are
    // fitted on the tent-decimated grid (half the samples per axis, half the sigma) and interpolated back; the residual keeps every root sample
    const land = Float32Array.from(natural, (weight, i) => seaSamples[i] ? 0 : weight), coarse = decimateConfident(heights, land, n);
    const tpi = new Float32Array(count), slope = new Float32Array(count), positioned = new Uint8Array(count).fill(1);
    for (const [index, scale] of model.catena.tpiScalesSamples.entries()) {
        const fit = landscapeNormalizedPlaneFit(coarse.values, coarse.confidence, coarse.size, scale / 2);
        for (let row = 0; row < n; row++) for (let column = 0; column < n; column++) {
            const i = row * n + column, plane = interpolateFit(fit, coarse.size, column / 2, row / 2);
            if (!plane) { positioned[i] = 0; continue; }
            tpi[i] += (heights[i] - plane.value) / model.catena.tpiScalesSamples.length;
            if (index === 0) slope[i] = Math.atan(Math.hypot(plane.gradientX / (2 * spacingX), plane.gradientRow / (2 * spacingZ))) * 180 / Math.PI;
        }
    }
    // the catena of the natural samples, continued over planning, stale and sea samples by pull-push
    const moisture = new Float32Array(count), moistureWeight = new Float32Array(count), trusted = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        trusted[i] = fieldWeight[i] ** model.exclusion.catenaWeightPower;
        moistureWeight[i] = positioned[i] ? trusted[i] : 0;
        moisture[i] = moistureWeight[i] > 0 ? landscapeCatenaMoisture({ tpi: tpi[i], wetness: wetness[i], flow: flow[i], slopeDegrees: slope[i] }) : 0;
    }
    const naturalMoisture = inpaint(moisture, moistureWeight), naturalDeposition = inpaint(deposition, trusted);
    const finalMoisture = lowPass(naturalMoisture, n, model.exclusion.lowPassSamples), finalDeposition = lowPass(naturalDeposition, n, model.exclusion.lowPassSamples);
    const bytes = new Uint8Array(layout.layerBytes);
    for (let row = 0; row < layout.width; row++) for (let column = 0; column < layout.width; column++) {
        const i = clamp(row - layout.halo, 0, n - 1) * n + clamp(column - layout.halo, 0, n - 1), target = (row * layout.width + column) * 4;
        bytes[target] = Math.round((clamp(finalMoisture[i], -1, 1) + 1) / 2 * 255);
        bytes[target + 1] = Math.round(clamp(finalDeposition[i], 0, 1) * 255);
        bytes[target + 2] = Math.round(clamp(reach[i], 0, model.coastal.maximumReachMeters) * 100);
        bytes[target + 3] = Math.round(clamp(modulation[i], 0, 1) * 255);
    }
    statistics.milliseconds = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
    return { bytes, statistics };
}

/** Working memory reserved for one appearance-layer derivation. @param {number} samples root samples per axis */
export function landscapeAppearanceLayerWorkBytes(samples) { return samples * samples * LANDSCAPE_TERRAIN_APPEARANCE.layer.workBytesPerSample; }

/** Decodes four layer unit values (landscapeAppearanceLayerUnits) like the shader. @param {number[]} units */
export function decodeLandscapeAppearanceLayer(units) {
    return { moisture: units[0] * 2 - 1, deposition: units[1], reach: units[2] * LANDSCAPE_TERRAIN_APPEARANCE.coastal.maximumReachMeters, exposureModulation: units[3] };
}

/**
 * Terrain appearance inputs of one fragment (mirror of landscapeTerrainAppearance): the (tone, chroma) added to the landscape-scale field, the rock
 * exposure share and the coastal reach. layer is the decoded appearance layer at the fragment (null while it is not resident), availability the root
 * page's arrival progress times freshness, footprintSpacings the footprint over the root spacing.
 * @param {{layer:{moisture:number,deposition:number,reach:number,exposureModulation:number}|null,availability:number,height:number,geometricSlopeDegrees:number,
 *   footprintSpacings:number,enabled?:boolean}} input
 */
export function landscapeTerrainAppearanceInputs({ layer, availability, height, geometricSlopeDegrees, footprintSpacings, enabled = true }) {
    for (const [name, value] of Object.entries({ availability, height, geometricSlopeDegrees, footprintSpacings })) if (!finite(value)) throw new Error(`[LandscapeTerrainAppearance] ${name} must be finite`);
    if (!enabled) return { tone: 0, chroma: 0, exposure: 0, reach: 0, moisture: 0, weight: 0 };
    const model = LANDSCAPE_TERRAIN_APPEARANCE, a = layer ? availability : 0, l = layer ?? { moisture: 0, deposition: 0, reach: 0, exposureModulation: 0 };
    const land = smoothstep(model.landFadeMeters[0], model.landFadeMeters[1], height), fade = 1 - smoothstep(model.footprintFadeSpacings[0], model.footprintFadeSpacings[1], footprintSpacings);
    const weight = a * land, r = model.response;
    return { tone: weight * fade * (r.toneMoisture * l.moisture + r.toneDeposition * l.deposition), chroma: weight * fade * (r.chromaMoisture * l.moisture + r.chromaDeposition * l.deposition),
        exposure: weight * model.rockExposure.gain * landscapeRockExposure(geometricSlopeDegrees, l.exposureModulation),
        reach: mix(landscapeRunupHeight(geometricSlopeDegrees) + model.coastal.tidalMeters + model.coastal.capillaryMeters, l.reach, a), moisture: l.moisture, weight: weight * fade };
}

/** Coverage after rock exposure (mirror of landscapeRevealRock): soil weights by catalog index, roles per index. @param {number[]} weights @param {number[]} roles @param {number} exposure */
export function landscapeRevealRock(weights, roles, exposure) {
    const target = roles.findLastIndex(role => role < 0);
    if (!(exposure > 0) || target < 0) return [...weights];
    let moved = 0;
    const result = weights.map((weight, index) => { const share = clamp(roles[index], 0, 1) * exposure; moved += weight * share; return weight * (1 - share); });
    result[target] += moved;
    return result;
}

const glslFloat = value => {
    if (!finite(value)) throw new Error(`[LandscapeTerrainAppearance] Constant ${value} is not finite`);
    const text = String(value);
    return /[.e]/.test(text) ? text : `${text}.0`;
};
const glslVector = values => `vec${values.length}(${values.map(glslFloat).join(', ')})`;

/** Compile-time constants of chunks/landscape/terrain_appearance.glsl (vector values or decimals, never valueless flags for the shared define builder). */
export function landscapeTerrainAppearanceDefines() {
    const m = LANDSCAPE_TERRAIN_APPEARANCE, c = m.coastal, r = m.rock, hl = landscapeSwellHeightLength();
    return Object.freeze({
        LANDSCAPE_TERRAIN_FOOTPRINT_FADE: glslVector(m.footprintFadeSpacings),
        LANDSCAPE_TERRAIN_FRESH_FADE_METERS: glslFloat(m.freshness.fadeMeters),
        LANDSCAPE_TERRAIN_LAND_FADE: glslVector(m.landFadeMeters),
        LANDSCAPE_TERRAIN_RESPONSE: glslVector([m.response.toneMoisture, m.response.toneDeposition, m.response.chromaMoisture, m.response.chromaDeposition]),
        LANDSCAPE_TERRAIN_ROCK_EXPOSURE: glslVector([...m.rockExposure.slopeDegrees, m.rockExposure.gain]),
        LANDSCAPE_TERRAIN_SWELL: glslVector([hl, Math.sqrt(hl), c.maximumBeachSlopeDegrees]),
        LANDSCAPE_TERRAIN_COASTAL: glslVector([c.tidalMeters + c.capillaryMeters, c.maximumReachMeters]),
        LANDSCAPE_TERRAIN_WETTING: glslVector([c.coreFraction, ...c.filmFraction, c.darkeningExponent]),
        LANDSCAPE_TERRAIN_WET_SURFACE: glslVector([c.wetRoughness, c.filmNormalFlattening, c.wetDiffuseRoughness, landscapeWetFilmTransmission()]),
        LANDSCAPE_TERRAIN_WEATHERING: glslVector([...r.weatheredSlopeDegrees, r.weatheredLog2, r.moistureGain]),
        LANDSCAPE_TERRAIN_WEATHERED_TINT: glslVector(r.weatheredTint),
        LANDSCAPE_TERRAIN_BIOFILM: glslVector([r.biofilm.splashFactor, r.biofilm.albedoFactor, r.biofilm.cover]),
        LANDSCAPE_TERRAIN_BIOFILM_FADE: glslVector([...r.biofilm.heightFadeMeters, ...r.biofilm.reachFadeMeters]),
        LANDSCAPE_TERRAIN_BIOFILM_TINT: glslVector(r.biofilm.tint)
    });
}

// host classes of the dressing diagnostics (chunks/landscape/dressing_inputs.glsl): 0 none, 1 sand, 2 loam, 3 forest, 4 rock
const DRESSING_CLASSES = Object.freeze({ sand: 1, loam: 2, forest: 3, rock: 4 });

/** Dressing host class of a catalog soil for the dressing diagnostics. @param {string} soilId */
export function landscapeDressingClass(soilId) { return Object.hasOwn(DRESSING_CLASSES, soilId) ? DRESSING_CLASSES[soilId] : 0; }

/** Compile-time constants of chunks/landscape/dressing_inputs.glsl from the landscape-dressing-inputs v1 parameters. */
export function landscapeDressingDefines() {
    const p = LANDSCAPE_DRESSING_INPUTS.parameters;
    return Object.freeze({
        LANDSCAPE_DRESSING_GRASS: glslVector([p.grass.loam, p.grass.forestUnderstory, ...p.grass.slopeDegrees]),
        LANDSCAPE_DRESSING_GRASS_TERMS: glslVector([p.grass.rockSuppression, p.grass.moistureBase, ...p.grass.shoreMeters]),
        LANDSCAPE_DRESSING_SHRUB: glslVector([p.shrub.loam, p.shrub.forest, ...p.shrub.slopeDegrees]),
        LANDSCAPE_DRESSING_SHRUB_TERMS: glslVector([p.shrub.rockSuppression, p.shrub.moistureBase, ...p.shrub.shoreMeters]),
        LANDSCAPE_DRESSING_TREE: glslVector([p.tree.forest, ...p.tree.slopeDegrees, p.tree.rockSuppression]),
        LANDSCAPE_DRESSING_TREE_TERMS: glslVector([...p.tree.waterlogged, p.tree.waterloggedSuppression]),
        LANDSCAPE_DRESSING_TREE_SHORE: glslVector(p.tree.shoreMeters),
        LANDSCAPE_DRESSING_ROCK: glslVector([p.rock.rockSoil, p.rock.rockSoilExposure, p.rock.vegetatedExposure]),
        LANDSCAPE_DRESSING_DEBRIS: glslVector([p.debris.sand, ...p.debris.waterlineMeters]),
        LANDSCAPE_DRESSING_DEBRIS_TERMS: glslVector([...p.debris.reachMeters, ...p.debris.slopeDegrees])
    });
}

/** Model description for snapshots and evidence. */
export function landscapeTerrainAppearanceSnapshot() {
    return { ...LANDSCAPE_TERRAIN_APPEARANCE, swellHeightLength: landscapeSwellHeightLength(), wetFilmTransmission: landscapeWetFilmTransmission(),
        runupMeters: Object.fromEntries([1, 2, 3, 5, 8, 14].map(degrees => [degrees, landscapeRunupHeight(degrees)])),
        wetToDryAlbedo: Object.fromEntries([.1, .2, .25, .3, .4].map(albedo => [albedo, landscapeWetAlbedo(albedo) / albedo])) };
}
