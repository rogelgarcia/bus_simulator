// Sizes the terrain coverage slot arrays from the terrain fragment shader and the device uniform capacity.
// @ts-check
// Uniform usage is counted conservatively: every scalar, vector, sampler and array element occupies one
// four-component vector and every matrix one vector per column, as in unpacked D3D register allocation.
// Three.js adds viewMatrix, cameraPosition, isOrthographic and toneMappingExposure to each fragment shader.

export const LANDSCAPE_MASK_SLOTS = 17;
export const LANDSCAPE_DETAIL_SLOTS_MAX = 64;
export const LANDSCAPE_COVERAGE_SLOTS_MAX = LANDSCAPE_MASK_SLOTS + LANDSCAPE_DETAIL_SLOTS_MAX;
export const LANDSCAPE_COVERAGE_SLOT_DEFINE = 'LANDSCAPE_COVERAGE_SLOTS';
export const LANDSCAPE_THREE_FRAGMENT_UNIFORM_VECTORS = 7;

const SINGLE_VECTOR_TYPES = ['float', 'int', 'uint', 'bool', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
    'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DArray', 'sampler2DShadow', 'sampler2DArrayShadow', 'samplerCubeShadow',
    'isampler2D', 'isampler3D', 'isamplerCube', 'isampler2DArray', 'usampler2D', 'usampler3D', 'usamplerCube', 'usampler2DArray'];
const UNIFORM_VECTORS = Object.freeze({ ...Object.fromEntries(SINGLE_VECTOR_TYPES.map(type => [type, 1])), mat2: 2, mat3: 3, mat4: 4 });
const DECLARATION = /^\s*(?:(?:lowp|mediump|highp)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[\s*([A-Za-z0-9_]+)\s*\])?\s*$/;

/**
 * @param {string} source terrain fragment shader source (includes expanded) before Three.js prefixing
 * @param {Readonly<Record<string, number>>} [arraySizes] compile-time array-size defines other than the coverage slot count
 * @returns {Readonly<{fixedVectors:number,slotVectors:number}>}
 */
export function landscapeFragmentUniformVectors(source, arraySizes = {}) {
    if (typeof source !== 'string' || !source.length) throw new Error('[Landscape] Terrain fragment source is required to size coverage slots');
    for (const [name, value] of Object.entries(arraySizes)) {
        if (name === LANDSCAPE_COVERAGE_SLOT_DEFINE || !Number.isSafeInteger(value) || value < 1) throw new Error(`[Landscape] Terrain array size ${name} must be a positive integer other than the coverage slot define; received ${value}`);
    }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let fixedVectors = LANDSCAPE_THREE_FRAGMENT_UNIFORM_VECTORS, slotVectors = 0;
    for (const statement of code.matchAll(/\buniform\b([^;]*);/g)) {
        const declaration = DECLARATION.exec(statement[1]);
        if (!declaration) throw new Error(`[Landscape] Unsupported terrain uniform declaration: uniform${statement[1]};`);
        const [, type, name, size] = declaration, vectors = UNIFORM_VECTORS[type];
        if (!vectors) throw new Error(`[Landscape] Terrain uniform ${name} has unsupported type ${type}`);
        if (size === LANDSCAPE_COVERAGE_SLOT_DEFINE) slotVectors += vectors;
        else if (size === undefined) fixedVectors += vectors;
        else if (/^[1-9][0-9]*$/.test(size)) fixedVectors += vectors * Number(size);
        else if (Object.hasOwn(arraySizes, size)) fixedVectors += vectors * arraySizes[size];
        else throw new Error(`[Landscape] Terrain uniform ${name} has unsupported array size ${size}`);
    }
    if (!slotVectors) throw new Error(`[Landscape] Terrain shader declares no ${LANDSCAPE_COVERAGE_SLOT_DEFINE} arrays`);
    return Object.freeze({ fixedVectors, slotVectors });
}

/** @param {number} coverageSlots @returns {number} */
export function assertLandscapeCoverageSlots(coverageSlots) {
    if (!Number.isSafeInteger(coverageSlots) || coverageSlots < LANDSCAPE_MASK_SLOTS || coverageSlots > LANDSCAPE_COVERAGE_SLOTS_MAX) {
        throw new Error(`[Landscape] Coverage slot count must be an integer from ${LANDSCAPE_MASK_SLOTS} to ${LANDSCAPE_COVERAGE_SLOTS_MAX}; received ${coverageSlots}`);
    }
    return coverageSlots;
}

/**
 * @param {{maxFragmentUniforms:number,fixedVectors:number,slotVectors:number}} options
 * @returns {Readonly<{total:number,native:number,detail:number,detailMax:number,maxFragmentUniforms:number,fixedUniformVectors:number,slotUniformVectors:number}>}
 */
export function resolveLandscapeCoverageSlots({ maxFragmentUniforms, fixedVectors, slotVectors }) {
    for (const [label, value] of [['maxFragmentUniforms', maxFragmentUniforms], ['fixedVectors', fixedVectors], ['slotVectors', slotVectors]]) {
        if (!Number.isSafeInteger(value) || value < 1) throw new Error(`[Landscape] Coverage slot sizing requires a positive integer ${label}; received ${value}`);
    }
    const fitting = Math.floor((maxFragmentUniforms - fixedVectors) / slotVectors);
    if (fitting < LANDSCAPE_MASK_SLOTS) {
        throw new Error(`[Landscape] Device MAX_FRAGMENT_UNIFORM_VECTORS ${maxFragmentUniforms} fits ${Math.max(0, fitting)} terrain coverage slots; ${LANDSCAPE_MASK_SLOTS} native mask slots need ${fixedVectors + LANDSCAPE_MASK_SLOTS * slotVectors} vectors (${fixedVectors} fixed + ${slotVectors} per slot)`);
    }
    const total = Math.min(LANDSCAPE_COVERAGE_SLOTS_MAX, fitting);
    return Object.freeze({ total, native: LANDSCAPE_MASK_SLOTS, detail: total - LANDSCAPE_MASK_SLOTS, detailMax: LANDSCAPE_DETAIL_SLOTS_MAX,
        maxFragmentUniforms, fixedUniformVectors: fixedVectors, slotUniformVectors: slotVectors });
}
