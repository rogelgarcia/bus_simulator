// src/graphics/visuals/shared/noise/NoiseShaderChunks.js
// Shared GLSL scalar-noise chunk builders for shader injection.
// @ts-check

function normalizeName(value, fallback) {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || fallback;
}

function resolveSmoothingExpr(smoothing) {
    return smoothing === 'quintic'
        ? 'f * f * f * (f * (f * 6.0 - 15.0) + 10.0)'
        : 'f * f * (3.0 - 2.0 * f)';
}

export function createValueNoiseHash12Glsl({ hashFnName = 'noiseHash12' } = {}) {
    const hashName = normalizeName(hashFnName, 'noiseHash12');
    return [
        `float ${hashName}(vec2 p){`,
        'vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
        'p3 += dot(p3, p3.yzx + 33.33);',
        'return fract((p3.x + p3.y) * p3.z);',
        '}'
    ].join('\n');
}

export function createValueNoise2Glsl({
    noiseFnName = 'noise2',
    hashFnName = 'noiseHash12',
    smoothing = 'hermite'
} = {}) {
    const noiseName = normalizeName(noiseFnName, 'noise2');
    const hashName = normalizeName(hashFnName, 'noiseHash12');
    const smoothExpr = resolveSmoothingExpr(smoothing);
    return [
        `float ${noiseName}(vec2 p){`,
        'vec2 i = floor(p);',
        'vec2 f = fract(p);',
        `float a = ${hashName}(i);`,
        `float b = ${hashName}(i + vec2(1.0, 0.0));`,
        `float c = ${hashName}(i + vec2(0.0, 1.0));`,
        `float d = ${hashName}(i + vec2(1.0, 1.0));`,
        `vec2 u = ${smoothExpr};`,
        'return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
        '}'
    ].join('\n');
}

export function createRotatedTwoTapFbmGlsl({
    fbmFnName = 'noiseFbm',
    noiseFnName = 'noise2',
    rotateExpr = 'mat2(0.80, -0.60, 0.60, 0.80)',
    secondScaleExpr = '2.07',
    secondOffsetExpr = 'vec2(21.1, 5.7)',
    weightAExpr = '0.68',
    weightBExpr = '0.32'
} = {}) {
    const fbmName = normalizeName(fbmFnName, 'noiseFbm');
    const noiseName = normalizeName(noiseFnName, 'noise2');
    const rotate = typeof rotateExpr === 'string' && rotateExpr.trim() ? rotateExpr.trim() : 'mat2(0.80, -0.60, 0.60, 0.80)';
    const secondScale = typeof secondScaleExpr === 'string' && secondScaleExpr.trim() ? secondScaleExpr.trim() : '2.07';
    const secondOffset = typeof secondOffsetExpr === 'string' && secondOffsetExpr.trim() ? secondOffsetExpr.trim() : 'vec2(21.1, 5.7)';
    const w0 = typeof weightAExpr === 'string' && weightAExpr.trim() ? weightAExpr.trim() : '0.68';
    const w1 = typeof weightBExpr === 'string' && weightBExpr.trim() ? weightBExpr.trim() : '0.32';
    return [
        `float ${fbmName}(vec2 p){`,
        `mat2 r = ${rotate};`,
        'p = r * p;',
        `float n1 = ${noiseName}(p);`,
        `float n2 = ${noiseName}(p * ${secondScale} + ${secondOffset});`,
        `return n1 * ${w0} + n2 * ${w1};`,
        '}'
    ].join('\n');
}
