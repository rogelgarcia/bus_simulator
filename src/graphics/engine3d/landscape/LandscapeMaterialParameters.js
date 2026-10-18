// Declares the per-material parameter texture of the terrain programs: its row catalog, the exact packer of the former per-soil uniforms and its cache-key hash.
// @ts-check
// Design (AI 598 D3a, landscape-material-parameters-v1). Until D3a every per-material value of the terrain programs lived in a six-entry uniform
// array (uSoilScale/Tiling/Albedo/Roughness/Range/State/Response/Clumps/ClumpSalts/Stochastic/Macro), so the uniform vectors grew with the
// material count and the WebGL2 minimum of 224 vectors was already at its limit. The values now live in one RGBA32F texture of
// LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT texels per material row and LANDSCAPE_MATERIAL_SLOTS_MAX rows, read with texelFetch by the material index,
// so the shader's uniform vectors no longer depend on how many materials a landscape draws (the six soils today, the layers companion in D3b).
// Every component keeps the bit pattern the uniform held: floats are stored as the float32 the uniform upload would have produced, and the
// uint32 salts (two's-complement ivec4 uniforms before) travel as two exact 16-bit halves per salt that the shader reassembles, since a uint32
// does not fit a float. The residency row (which array holds a material's tier, which slot, and the arriving array and slot of a transition)
// replaces the six per-soil sampler pairs and the blend pair (LandscapeMaterialSlots). The components that follow residency (the micro tiling
// and micro relief strength that appear with a resident micro layer, the bound resolution, the residency row itself) are volatile: they do not
// enter the parameter hash the surface cache's global key carries, because a page identity already carries the material tier keys.

export const LANDSCAPE_MATERIAL_SLOTS_MAX = 32;
/** Resolution of each material array by tier index: 0 coarse (every material, the resident floor), 1 mid, 2 fine (streamed slots). */
export const LANDSCAPE_MATERIAL_TIERS = Object.freeze([128, 512, 1024]);
export const LANDSCAPE_MATERIAL_TIER_NAMES = Object.freeze(['coarse', 'mid', 'fine']);

const row = (id, former, components, volatileComponents = []) => Object.freeze({ id, former, components: Object.freeze(components), volatile: Object.freeze(volatileComponents) });

/** The row catalog: one vec4 texel per row and material; `former` names the uniform array the row replaces, `volatile` the components the hash skips. */
export const LANDSCAPE_MATERIAL_PARAMETER_ROWS = Object.freeze([
    row('scale', 'uSoilScale', ['terrainRole', 'normalStrength', 'aoIntensity', 'metalness']),
    row('tiling', 'uSoilTiling', ['tileMeters', 'microTileMeters', 'microNormalStrength', 'microLuminanceScale'], [1, 2, 3]),
    row('albedo', 'uSoilAlbedo', ['brightness', 'hueRadians', 'saturation', 'tintStrength']),
    row('roughness', 'uSoilRoughness', ['remapMin', 'remapMax', 'remapGamma', 'invertInput']),
    row('range', 'uSoilRange', ['inputMin', 'inputMax', 'roughnessScale', 'uvRotationRadians']),
    row('state', 'uSoilState', ['relief', 'resolution', 'microHeightStrength', 'opposition'], [1, 2]),
    row('response', 'uSoilResponse', ['diffuseRoughness', 'specularShadowing', 'meanSlopeX', 'meanSlopeY']),
    row('clumps', 'uSoilClumps', ['inverseWavelength', 'weight', 'textureReliefGain', 'billowCenter']),
    row('stochastic', 'uSoilStochastic', ['cellsPerPeriod', 'rotationRangeRadians', 'offsetSpreadV', 'contrastExponent']),
    row('macro', 'uSoilMacro', ['log2Value', 'saturation', 'hueRadians', 'roughness']),
    row('residency', 'uSoilBase*/uSoilSurface*/uBlend*/uMaterialBlendIndex', ['tier', 'slot', 'arrivingTier', 'arrivingSlot'], [0, 1, 2, 3]),
    row('saltsA', 'uSoilClumpSalts', ['clumpSalt0Low', 'clumpSalt0High', 'clumpSalt1Low', 'clumpSalt1High']),
    row('saltsB', 'uSoilClumpSalts', ['clumpSalt2Low', 'clumpSalt2High', 'clumpSalt3Low', 'clumpSalt3High']),
    row('saltsC', 'uSoilStochasticSalts', ['stochasticSaltLow', 'stochasticSaltHigh', 'unused0', 'unused1'])
]);
export const LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT = LANDSCAPE_MATERIAL_PARAMETER_ROWS.length;
/** Row index by id. @type {Readonly<Record<'scale'|'tiling'|'albedo'|'roughness'|'range'|'state'|'response'|'clumps'|'stochastic'|'macro'|'residency'|'saltsA'|'saltsB'|'saltsC', number>>} */
export const LANDSCAPE_MATERIAL_PARAMETER_ROW = Object.freeze(/** @type {any} */ (Object.fromEntries(LANDSCAPE_MATERIAL_PARAMETER_ROWS.map((entry, index) => [entry.id, index]))));
export const LANDSCAPE_MATERIAL_PARAMETERS = Object.freeze({ id: 'landscape-material-parameters-v1', rows: LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT, capacity: LANDSCAPE_MATERIAL_SLOTS_MAX, format: 'RGBA32F', fetch: 'texelFetch(uMaterialParameters, ivec2(row, material), 0)' });

const COMPONENTS = LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT * 4;
const HASHED = Uint8Array.from({ length: COMPONENTS }, (_, component) => LANDSCAPE_MATERIAL_PARAMETER_ROWS[component >> 2].volatile.includes(component & 3) ? 0 : 1);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** The two exact 16-bit halves (low, high) of a uint32 salt (a two's-complement int32 is accepted). @param {number} salt @returns {[number, number]} */
export function landscapeMaterialSaltHalves(salt) {
    if (!Number.isInteger(salt) || salt < -0x80000000 || salt > 0xffffffff) throw new Error(`[LandscapeMaterialParameters] A salt must be an int32 or uint32; received ${salt}`);
    const bits = salt >>> 0;
    return [bits & 0xffff, bits >>> 16];
}

/** The uint32 salt of two halves, as the shader reassembles it. @param {number} low @param {number} high */
export function landscapeMaterialSaltFromHalves(low, high) {
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || low > 0xffff || high < 0 || high > 0xffff) throw new Error('[LandscapeMaterialParameters] Salt halves must be integers in 0..65535');
    return ((high << 16) | low) >>> 0;
}

/** Tier index of an array resolution. @param {number} resolution */
export function landscapeMaterialTierIndex(resolution) {
    const tier = LANDSCAPE_MATERIAL_TIERS.indexOf(resolution);
    if (tier < 0) throw new Error(`[LandscapeMaterialParameters] ${resolution} is not a material array resolution (${LANDSCAPE_MATERIAL_TIERS.join(', ')})`);
    return tier;
}

/**
 * Compile-time constants of the parameter chunk (chunks/landscape/material_parameters.glsl): the row indices, the row count, the capacity and the
 * tier resolutions, so the shader and this catalog cannot drift apart.
 * @returns {Readonly<Record<string, string>>}
 */
export function landscapeMaterialParameterDefines() {
    const defines = { LANDSCAPE_MATERIAL_PARAMETER_ROWS: `(${LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT})`, LANDSCAPE_MATERIAL_SLOTS_MAX: `(${LANDSCAPE_MATERIAL_SLOTS_MAX})`,
        LANDSCAPE_MATERIAL_TIER_RESOLUTIONS: `vec3(${LANDSCAPE_MATERIAL_TIERS.map(value => `${value}.0`).join(', ')})` };
    for (const [index, entry] of LANDSCAPE_MATERIAL_PARAMETER_ROWS.entries()) defines[`LANDSCAPE_MATERIAL_ROW_${entry.id.replace(/([A-Z])/g, '_$1').toUpperCase()}`] = `(${index})`;
    return Object.freeze(defines);
}

/**
 * The per-material rows the pages owner writes once per material (the former uSoilScale/Tiling/Albedo/Roughness/Range/State/Response values), with
 * exactly the arithmetic LandscapeMaterialPages used before D3a. tileMeters is the calibrated period; micro is the active micro layer's values
 * (landscapeMicroUniformValues) or null; resolution the bound array resolution.
 * @param {{terrainRole:number,effective:{normalStrength:number,aoIntensity:number,metalness:number,albedoBrightness:number,albedoHueDegrees:number,albedoSaturation:number,albedoTintStrength:number,
 *   roughness:number,roughnessRemap?:{min?:number,max?:number,gamma?:number,invertInput?:boolean,lowPercentile?:number,highPercentile?:number}|null},albedoGain:number,
 *   roughnessInputRange:{min:number,max:number},uvRotationDegrees:number,relief:boolean,resolution:number,tileMeters:number,
 *   micro:{tileMeters:number,normalStrength:number,luminanceScale:number,heightStrength:number}|null,response:{diffuseRoughness:number,specularShadowing:number,opposition:number},
 *   meanNormalSlope:readonly number[]}} input
 * @returns {Readonly<Record<'scale'|'tiling'|'albedo'|'roughness'|'range'|'state'|'response', number[]>>}
 */
export function landscapeMaterialParameterRows({ terrainRole, effective, albedoGain, roughnessInputRange, uvRotationDegrees, relief, resolution, tileMeters, micro, response, meanNormalSlope }) {
    const remap = effective.roughnessRemap, normalize = Number.isFinite(remap?.lowPercentile) && Number.isFinite(remap?.highPercentile);
    const rows = {
        scale: [terrainRole, effective.normalStrength, effective.aoIntensity, effective.metalness],
        tiling: [tileMeters, micro?.tileMeters ?? 0, micro?.normalStrength ?? 0, micro?.luminanceScale ?? 0],
        albedo: [effective.albedoBrightness * albedoGain, effective.albedoHueDegrees * Math.PI / 180, effective.albedoSaturation, effective.albedoTintStrength],
        roughness: [remap?.min ?? 0, remap?.max ?? 1, remap?.gamma ?? 1, remap?.invertInput ? 1 : 0],
        range: [normalize ? roughnessInputRange.min : 0, normalize ? roughnessInputRange.max : 1, effective.roughness, (uvRotationDegrees ?? 0) * Math.PI / 180],
        state: [relief ? 1 : 0, resolution, micro?.heightStrength ?? 0, response.opposition],
        response: [response.diffuseRoughness, response.specularShadowing, meanNormalSlope[0], meanNormalSlope[1]]
    };
    for (const [id, values] of Object.entries(rows)) if (!values.every(finite)) throw new Error(`[LandscapeMaterialParameters] The ${id} row needs finite values; received ${values.join(', ')}`);
    return Object.freeze(rows);
}

/** The parameter table of an appearance uniform set (the CPU mirror of uMaterialParameters). @param {any} uniforms */
export function landscapeMaterialParameterTable(uniforms) {
    const table = uniforms?.uMaterialParameters?.table;
    if (!(table instanceof LandscapeMaterialParameterTable)) throw new Error('[LandscapeMaterialParameters] The appearance uniforms carry no material parameter table');
    return table;
}

/** The CPU mirror of the parameter texture: capacity rows of LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT RGBA32F texels, versioned, with its cache-key hash. */
// the former uniform defaults an unwritten material carries (uSoilScale/Tiling/Albedo/Roughness/Range/State), and a residency naming no array (tier -1)
const ROW_DEFAULTS = Object.freeze({ scale: [0, 1, 1, 0], tiling: [4, 0, 0, 0], albedo: [1, 0, 0, 0], roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], state: [0, 32, 0, 0], residency: [-1, 0, -1, 0] });

export class LandscapeMaterialParameterTable {
    /** @param {number} [capacity] */
    constructor(capacity = LANDSCAPE_MATERIAL_SLOTS_MAX) {
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > LANDSCAPE_MATERIAL_SLOTS_MAX) throw new Error(`[LandscapeMaterialParameters] The table holds 1..${LANDSCAPE_MATERIAL_SLOTS_MAX} materials; received ${capacity}`);
        this.capacity = capacity;
        this.rows = LANDSCAPE_MATERIAL_PARAMETER_ROW_COUNT;
        this.data = new Float32Array(capacity * COMPONENTS);
        this.version = 0;
        this.hashedVersion = -1;
        this.hashValue = '';
        /** @type {Array<() => void>} */
        this.listeners = [];
        for (let material = 0; material < capacity; material++) for (const [row, values] of Object.entries(ROW_DEFAULTS)) this.data.set(values, this.offset(material, LANDSCAPE_MATERIAL_PARAMETER_ROW[row]));
    }

    /** @param {number} material @param {number} row */
    offset(material, row) {
        if (!Number.isSafeInteger(material) || material < 0 || material >= this.capacity) throw new Error(`[LandscapeMaterialParameters] Material index ${material} is outside the table's ${this.capacity} rows`);
        if (!Number.isSafeInteger(row) || row < 0 || row >= this.rows) throw new Error(`[LandscapeMaterialParameters] Parameter row ${row} is outside 0..${this.rows - 1}`);
        return (material * this.rows + row) * 4;
    }

    /** Writes one row. @param {number} material @param {number} row @param {number} x @param {number} y @param {number} z @param {number} w */
    set(material, row, x, y, z, w) {
        if (![x, y, z, w].every(finite)) throw new Error(`[LandscapeMaterialParameters] Row ${row} of material ${material} needs finite components`);
        const offset = this.offset(material, row), data = this.data;
        data[offset] = x; data[offset + 1] = y; data[offset + 2] = z; data[offset + 3] = w;
        this.touch();
    }

    /** @param {number} material @param {number} row @param {ArrayLike<number>} values four components */
    setRow(material, row, values) {
        if (values.length !== 4) throw new Error(`[LandscapeMaterialParameters] Row ${row} takes four components; received ${values.length}`);
        this.set(material, row, values[0], values[1], values[2], values[3]);
    }

    /** @param {number} material @param {number} row @param {number} component 0..3 @param {number} value */
    setComponent(material, row, component, value) {
        if (!Number.isSafeInteger(component) || component < 0 || component > 3 || !finite(value)) throw new Error(`[LandscapeMaterialParameters] Component ${component} of row ${row} needs an index 0..3 and a finite value`);
        this.data[this.offset(material, row) + component] = value;
        this.touch();
    }

    /** A live view of one row (four float32 components); write through set, never through the view. @param {number} material @param {number} row */
    row(material, row) { const offset = this.offset(material, row); return this.data.subarray(offset, offset + 4); }

    /** @param {number} material @param {number} row @param {number} component */
    component(material, row, component) { return this.data[this.offset(material, row) + component]; }

    /** The four clump octave salts and the stochastic top-projection salt of a material as exact halves. @param {number} material @param {ArrayLike<number>} clumpSalts @param {number} stochasticSalt */
    setSalts(material, clumpSalts, stochasticSalt) {
        if (clumpSalts.length !== 4) throw new Error('[LandscapeMaterialParameters] A material has four clump octave salts');
        const halves = Array.from(clumpSalts, salt => landscapeMaterialSaltHalves(salt)).flat(), stochastic = landscapeMaterialSaltHalves(stochasticSalt);
        this.set(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsA, halves[0], halves[1], halves[2], halves[3]);
        this.set(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsB, halves[4], halves[5], halves[6], halves[7]);
        this.set(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsC, stochastic[0], stochastic[1], 0, 0);
    }

    /** @param {number} material @param {number} octave 0..3 @returns {number} uint32 */
    clumpSalt(material, octave) {
        if (!Number.isSafeInteger(octave) || octave < 0 || octave > 3) throw new Error('[LandscapeMaterialParameters] Clump octaves are 0..3');
        const values = this.row(material, octave < 2 ? LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsA : LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsB), lane = (octave & 1) * 2;
        return landscapeMaterialSaltFromHalves(values[lane], values[lane + 1]);
    }

    /** @param {number} material @returns {number} uint32 */
    stochasticSalt(material) { const values = this.row(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.saltsC); return landscapeMaterialSaltFromHalves(values[0], values[1]); }

    /** The residency of a material: the array tier and slot it draws from and the arriving pair of a transition (or -1). @param {number} material */
    residency(material) { const values = this.row(material, LANDSCAPE_MATERIAL_PARAMETER_ROW.residency); return { tier: values[0], slot: values[1], arrivingTier: values[2], arrivingSlot: values[3] }; }

    /** @param {() => void} listener called after every write (the texture upload) */
    onChange(listener) { this.listeners.push(listener); }

    touch() { this.version++; for (const listener of this.listeners) listener(); }

    /** 53-bit hash (14 hex) of every non-volatile component as float32 bits, cached by version: the surface cache's parameter key. */
    hash() {
        if (this.hashedVersion === this.version) return this.hashValue;
        const words = new Uint32Array(this.data.buffer, this.data.byteOffset, this.data.length);
        let a = 0x811c9dc5, b = 0x9e3779b9;
        for (let index = 0; index < words.length; index++) {
            if (!HASHED[index % COMPONENTS]) continue;
            a = Math.imul(a ^ words[index], 0x01000193) >>> 0;
            b = Math.imul(b ^ words[index], 0x5bd1e995) >>> 0;
            b ^= b >>> 15;
        }
        this.hashValue = (a >>> 0).toString(16).padStart(8, '0') + ((b >>> 0) & 0x1fffff).toString(16).padStart(6, '0');
        this.hashedVersion = this.version;
        return this.hashValue;
    }
}
