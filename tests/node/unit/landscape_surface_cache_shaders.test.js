// Verifies the AI577 D6 surface cache shader programs: the cached frame variant compiles out coverage and materials (samplers, uniforms), and
// the generation variant writes the three cache formats without lighting while the default program keeps its structure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { landscapeFragmentUniformVectors, landscapeFragmentVariantUniformVectors } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageSlots.js';
import { LANDSCAPE_SURFACE_CACHE, landscapeSurfaceCacheDefines } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';

const shaderRoot = new URL('../../../src/graphics/shaders/', import.meta.url);
async function expandShader(relative, seen = new Set()) {
    const source = await readFile(new URL(relative, shaderRoot), 'utf8');
    let output = '', cursor = 0;
    for (const match of source.matchAll(/#include <shaderlib:([^>]+)>/g)) {
        output += source.slice(cursor, match.index);
        cursor = match.index + match[0].length;
        const token = match[1].trim().endsWith('.glsl') ? match[1].trim() : `${match[1].trim()}.glsl`;
        if (seen.has(token)) throw new Error(`circular ${token}`);
        seen.add(token); output += await expandShader(`chunks/${token}`, seen); seen.delete(token);
    }
    return output + source.slice(cursor);
}

// evaluates #ifdef, #ifndef, #if NAME op N, #elif, #else, #endif and #define for a define map; other lines pass through while active
function preprocess(source, initial) {
    const defines = { ...initial }, out = [], stack = [];
    let active = true;
    const evaluate = expression => {
        const match = /^\(?\s*(\w+)\s*(==|!=|>=|<=|>|<)\s*(\d+)\s*\)?$/.exec(expression.trim());
        if (!match) throw new Error(`unsupported #if ${expression}`);
        const value = Number(String(defines[match[1]] ?? 0).replace(/[()]/g, '')), n = Number(match[3]);
        return { '==': value === n, '!=': value !== n, '>=': value >= n, '<=': value <= n, '>': value > n, '<': value < n }[match[2]];
    };
    for (const line of source.split('\n')) {
        const directive = line.trim();
        let match;
        if ((match = /^#ifdef\s+(\w+)/.exec(directive)) || (match = /^#ifndef\s+(\w+)/.exec(directive))) {
            const condition = directive.startsWith('#ifdef') ? match[1] in defines : !(match[1] in defines);
            stack.push({ outer: active, taken: condition }); active = active && condition; continue;
        }
        if ((match = /^#if\s+(.*)$/.exec(directive))) { const condition = active && evaluate(match[1]); stack.push({ outer: active, taken: condition }); active = condition; continue; }
        if ((match = /^#elif\s+(.*)$/.exec(directive))) { const top = stack.at(-1), condition = !top.taken && top.outer && evaluate(match[1]); active = condition; top.taken ||= condition; continue; }
        if (/^#else\b/.test(directive)) { const top = stack.at(-1); active = top.outer && !top.taken; top.taken = true; continue; }
        if (/^#endif\b/.test(directive)) { active = stack.pop().outer; continue; }
        if (active && (match = /^#define\s+(\w+)(?:\s+(.*))?$/.exec(directive))) { defines[match[1]] = match[2] ?? '1'; continue; }
        if (active) out.push(line);
    }
    assert.equal(stack.length, 0, 'balanced conditionals');
    return out.join('\n');
}

const terrainSource = await expandShader('materials/landscape/terrain.frag.glsl');
const vertexSource = await expandShader('materials/landscape/terrain.vert.glsl');
const baseDefines = { LANDSCAPE_COVERAGE_SLOTS: '81', LANDSCAPE_SURFACE_WARP_OCTAVES: '4', LANDSCAPE_MATERIAL_SAMPLING: '(2)', LANDSCAPE_LIGHTING_TIER: '(1)', LANDSCAPE_TERRAIN_APPEARANCE: '1',
    LANDSCAPE_SURFACE_LEVEL_COLOR_LIST: 'x', ...landscapeSurfaceCacheDefines() };
const code = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
// samplers referenced outside their declarations: a conservative bound of the active ones, since compiled-out functions are already gone
function referencedSamplers(source) {
    const body = code(source), declared = [...body.matchAll(/\buniform\s+(?:highp\s+)?u?sampler\w+\s+(\w+)/g)].map(match => match[1]), rest = body.replace(/\buniform\b[^;]*;/g, '');
    return declared.filter(name => new RegExp(`\\b${name}\\b`).test(rest)).sort();
}
const mainOf = source => source.slice(source.lastIndexOf('void main() {'));

test('Surface cache shaders: the cached frame program compiles out coverage and materials and keeps the micro lattice and the lighting', () => {
    const frame = preprocess(terrainSource, { ...baseDefines, LANDSCAPE_SURFACE_CACHE: '1' }), standard = preprocess(terrainSource, baseDefines);
    assert.equal(referencedSamplers(standard).length, 16, 'the default program keeps its sixteen samplers');
    assert.deepEqual(referencedSamplers(frame), ['uBlendSurface', 'uSoilSurface0', 'uSoilSurface1', 'uSoilSurface2', 'uSoilSurface3', 'uSoilSurface4', 'uSoilSurface5', 'uSurfaceCacheAlbedo',
        'uSurfaceCacheIndirection', 'uSurfaceCacheMaterial', 'uSurfaceCacheResponse', 'uTerrainFields'], 'micro surface arrays, the field array and the four cache textures: twelve of sixteen');
    const frameCode = code(frame);
    for (const name of ['hierarchyCoverage', 'appearanceSurface', 'soilSurface', 'maskCoverage', 'soilTextures', 'materialClumpRelief', 'uMaskPages', 'uSoilBase']) {
        assert.doesNotMatch(frameCode.replace(/\buniform\b[^;]*;/g, ''), new RegExp(`\\b${name}`), `${name} is compiled out of the cached frame`);
    }
    assert.doesNotMatch(code(mainOf(frame)), /landscapeSurfaceWarp/, 'the per-pixel surface warp is not evaluated');
    assert.match(frameCode, /vec3 color = landscapeSurfaceCacheRadiance\(world, dx, dy, normal, positionDx, positionDy\);/);
    assert.match(frameCode, /terrainVisibility\(world, dx, dy, normal\);\s+return terrainRadiance\(albedo, surfaceNormal, normal, roughness, 0\.0, ao, response, groundAlbedo, reach\);/,
        'the cached surface takes the unchanged lighting path');
    assert.match(frameCode, /soilLattice\(soil, true,/, 'the micro lattice stays per pixel');
    assert.match(frameCode, /uvec4 entry = texelFetch\(uSurfaceCacheIndirection,/, 'one indirection fetch');
    assert.equal((frameCode.match(/textureGrad\(uSurfaceCache\w+, uv, dx \* scale, dy \* scale\)/g) ?? []).length, 3, 'three filtered page fetches with the fragment gradients');
});

test('Surface cache shaders: cache uniforms are counted apart from the shared coverage slot sizing', () => {
    const sizes = { LANDSCAPE_SURFACE_WARP_OCTAVES: 4 };
    assert.deepEqual(landscapeFragmentUniformVectors(terrainSource, sizes), { fixedVectors: 155, slotVectors: 4 }, 'the shared coverage slot sizing is unchanged');
    assert.deepEqual(landscapeFragmentVariantUniformVectors(terrainSource, sizes), { variantVectors: 7 },
        'four cache samplers and two state vectors of the cached frame, and the near band of the near pass');
    assert.throws(() => landscapeFragmentVariantUniformVectors('#ifdef LANDSCAPE_SURFACE_CACHE\nuniform vec4 a[LANDSCAPE_COVERAGE_SLOTS];\n#endif\n'), /coverage slot define/);
    assert.deepEqual(landscapeFragmentVariantUniformVectors('uniform vec4 a[LANDSCAPE_COVERAGE_SLOTS];\n#ifndef LANDSCAPE_SURFACE_CACHE\nuniform vec4 b;\n#else\nuniform vec4 c[2];\n#endif\n'), { variantVectors: 2 });
    assert.deepEqual(landscapeFragmentUniformVectors('uniform vec4 a[LANDSCAPE_COVERAGE_SLOTS];\n#ifndef LANDSCAPE_SURFACE_CACHE\nuniform vec4 b;\n#else\nuniform vec4 c[2];\n#endif\n'), { fixedVectors: 8, slotVectors: 1 });
});

test('Surface cache shaders: the single-output generation program packs the cache formats without lighting and keeps micro relief, not micro slope or luminance', () => {
    const generation = code(preprocess(terrainSource, { ...baseDefines, LANDSCAPE_SURFACE_CACHE_GENERATION: '1' })), main = mainOf(generation);
    assert.doesNotMatch(generation, /layout\(location/, 'one output: a multiple-output program makes ANGLE compile another pixel executable at its first draw');
    assert.match(main, /SoilSurface surface = appearanceSurface\(coverage, world, dx, dy, normal, positionDx, positionDy, groundAlbedo, response, reach\);\s+landscapeSurfaceCacheWrite\(surface, normal, response, reach, landscapeSurfaceCacheMicroCoverage\);\s+return;/);
    assert.doesNotMatch(main, /terrainRadiance|terrainVisibility/, 'no lighting in the generation program');
    const soil = generation.slice(generation.indexOf('SoilSurface soilSurface('), generation.indexOf('struct Coverage'));
    assert.match(soil, /if \(!microLayer\) perturbation \+= weight \* direction;/);
    assert.match(soil, /microHeight \+= weight \* \(lattice\.orm\.a - 0\.5\) \* state\.z \* micro;/);
    assert.doesNotMatch(soil, /luminance \+= /);
    const write = generation.slice(generation.indexOf('void landscapeSurfaceCacheWrite('));
    assert.match(write, /gl_FragColor = vec4\(landscapeSurfaceCachePack\(landscapeSurfaceCacheSrgb\(surface\.albedo\)\), landscapeSurfaceCachePack\(vec3\(surface\.ao, octahedral\)\),\s+landscapeSurfaceCachePack\(vec3\(surface\.roughness, microWeight, reach \/ LANDSCAPE_SURFACE_CACHE_REACH_SCALE\)\), landscapeSurfaceCachePack\(response\)\);/);
    assert.match(generation, /return bytes\.x \+ bytes\.y \* 256\.0 \+ bytes\.z \* 65536\.0;/, 'three bytes per float, exact below 2^24');
    assert.match(generation, /landscapeSurfaceCacheMicroCoverage = 0\.0;\s+for \(int soil = 0; soil < 6; soil\+\+\) if \(uSoilTiling\[soil\]\.y > 0\.0\) landscapeSurfaceCacheMicroCoverage \+= coverageWeight\(coverage, soil\);/);
    // the generation vertex program draws each tile's own surface
    const vertex = code(preprocess(vertexSource, { LANDSCAPE_SURFACE_CACHE_GENERATION: '1' }));
    assert.match(vertex, /vec3 transformed = position;\s+vLandscapeNormal = normalize\(normal\);/);
    assert.doesNotMatch(mainOf(vertex), /uMorph|uEdges|parentHeight|parentNormal/, 'no LOD morph or coarser-edge heights');
    assert.match(code(preprocess(vertexSource, {})), /vec3 transformed = vec3\(position\.x, mix\(parentHeight, position\.y, morph\), position\.z\);/);
    // tile positions are world positions; each draw's model matrix is its page block's world-to-clip mapping (one identity camera for every block)
    assert.match(mainOf(vertex), /vLandscapeWorld = transformed;\s+gl_Position = modelMatrix \* vec4\(transformed, 1\.0\);/);
    assert.match(mainOf(code(preprocess(vertexSource, {}))), /vLandscapeWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;\s+gl_Position = projectionMatrix \* modelViewMatrix \* vec4\(transformed, 1\.0\);/,
        'the frame programs keep the camera projection');
});

test('Surface cache shaders: the near program is the uncached program plus the near weight test and alpha; the cached frame shades every fragment', () => {
    const standard = mainOf(code(preprocess(terrainSource, baseDefines))), near = mainOf(code(preprocess(terrainSource, { ...baseDefines, LANDSCAPE_SURFACE_CACHE_NEAR: '1' })));
    assert.match(near, /float nearWeight = landscapeSurfaceCacheNearWeight\(dx, dy\);\s+if \(nearWeight <= 0\.0\) discard;\s+if \(uSurfaceCacheNear\.w > 0\.5\) \{ gl_FragColor = vec4\(1\.0, 0\.0, 1\.0, nearWeight\); return; \}/);
    assert.match(near, /gl_FragColor = vec4\(color, nearWeight\);/);
    // removing the weight test, the inspection marker and the alpha leaves the uncached program's main exactly
    const stripped = near.replace(/\s*float nearWeight = landscapeSurfaceCacheNearWeight\(dx, dy\);\s+if \(nearWeight <= 0\.0\) discard;\s+if \(uSurfaceCacheNear\.w > 0\.5\) \{[^}]*\}/, '')
        .replace('gl_FragColor = vec4(color, nearWeight);', 'gl_FragColor = vec4(color, 1.0);');
    assert.equal(stripped.replace(/\s+/g, ' '), standard.replace(/\s+/g, ' '));
    assert.equal(referencedSamplers(preprocess(terrainSource, { ...baseDefines, LANDSCAPE_SURFACE_CACHE_NEAR: '1' })).length, 16, 'the uncached samplers, no cache texture');
    // the cached frame shades every fragment it draws (no discard); the near pass replaces its color where it owns the fragment (alpha 1)
    const frame = code(preprocess(terrainSource, { ...baseDefines, LANDSCAPE_SURFACE_CACHE: '1' }));
    assert.doesNotMatch(frame, /discard|uSurfaceCacheNear/);
    assert.match(mainOf(frame), /vec2 dx = dFdx\(world\), dy = dFdy\(world\);\s+vec3 positionDx = dFdx\(vLandscapeWorld\), positionDy = dFdy\(vLandscapeWorld\);\s+vec3 color = landscapeSurfaceCacheRadiance\(/);
    // the GLSL weight is the JavaScript mirror's metric: max(major / anisotropy, minor) through smoothstep(start, end)
    const chunk = code(terrainSource.slice(terrainSource.indexOf('float landscapeSurfaceCacheNearWeight(')));
    assert.match(chunk, /if \(uSurfaceCacheNear\.y <= 0\.0\) return 0\.0;\s+float a = length\(dx\), b = length\(dy\);\s+return 1\.0 - smoothstep\(uSurfaceCacheNear\.x, uSurfaceCacheNear\.y, max\(max\(a, b\) \/ uSurfaceCacheNear\.z, min\(a, b\)\)\);/);
    assert.doesNotMatch(code(preprocess(terrainSource, baseDefines)), /uSurfaceCacheNear/, 'the default program has no near-pass code');
});

test('Surface cache shaders: the unpack program copies level 0 exactly and box-filters level 1 and the response with variance-widened roughness', async () => {
    const fragment = code(await readFile(new URL('materials/landscape/surface_cache_unpack.frag.glsl', shaderRoot), 'utf8'));
    assert.doesNotMatch(fragment, /layout\(location/, 'one output per draw');
    assert.match(fragment, /if \(uSurfaceCacheTarget == 0\) gl_FragColor = vec4\(landscapeSurfaceCacheLinear\(landscapeSurfaceCacheUnpack\(packed\.x\)\), normal\.x\);\s+else gl_FragColor = vec4\(normal\.yz, detail\.xy\);\s+return;/,
        'level 0: albedo + AO, then normal, roughness and micro coverage');
    assert.match(fragment, /texelFetch\(uSurfaceCacheScratch, origin \+ 2 \* target \+ ivec2\(i & 1, i >> 1\), 0\)/, 'level 1 reads the 2x2 level-0 texels it covers');
    assert.match(fragment, /albedo \+= landscapeSurfaceCacheLinear\(/, 'albedo averages in linear space');
    assert.match(fragment, /if \(uSurfaceCacheTarget == 2\) \{ gl_FragColor = vec4\(response \* 0\.25, reach \* 0\.25\); return; \}/);
    // JavaScript mirror of pack/unpack and the sRGB round trip of every byte
    const pack = bytes => bytes[0] + bytes[1] * 256 + bytes[2] * 65536, unpack = value => { const high = Math.floor(value / 65536), rest = value - high * 65536, middle = Math.floor(rest / 256); return [rest - middle * 256, middle, high]; };
    for (let a = 0; a < 256; a += 17) for (let b = 0; b < 256; b += 13) for (let c = 0; c < 256; c += 29) {
        const value = Math.fround(pack([a, b, c]));
        assert.deepEqual(unpack(value), [a, b, c], 'exact in single precision');
    }
    const srgb = linear => linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055, linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    for (let byte = 0; byte < 256; byte++) assert.equal(Math.round(srgb(linear(byte / 255)) * 255), byte, 'the sRGB attachment re-encodes every unpacked byte');
    // mirror of the level-1 roughness: equal normals keep the mean squared alpha, diverging normals widen it up to the cap
    const roughness = (normals, values) => {
        const sum = normals.reduce((acc, n) => acc.map((v, i) => v + n[i]), [0, 0, 0]), mean = Math.min(1, Math.max(1e-4, Math.hypot(...sum) / 4));
        const variance = (1 - mean * mean) / (3 * mean - mean ** 3), alpha2 = values.reduce((acc, r) => acc + r ** 4, 0) / 4;
        return Math.sqrt(Math.sqrt(Math.min(1, alpha2 + Math.min(2 * variance, .18))));
    };
    const up = [0, 0, 1], tilt = degrees => [Math.sin(degrees * Math.PI / 180), 0, Math.cos(degrees * Math.PI / 180)];
    assert.ok(Math.abs(roughness([up, up, up, up], [.6, .6, .6, .6]) - .6) < 1e-6);
    const widened = [0, 5, 15, 40].map(degrees => roughness([up, tilt(degrees), up, tilt(-degrees)], [.5, .5, .5, .5]));
    for (let i = 1; i < widened.length; i++) assert.ok(widened[i] > widened[i - 1], 'more normal variance, rougher');
    assert.ok(widened[3] <= Math.sqrt(Math.sqrt(.5 ** 4 + .18)) + 1e-9, 'capped');
    assert.match(fragment, /float variance = \(1\.0 - mean \* mean\) \/ \(3\.0 \* mean - mean \* mean \* mean\);\s+float roughness = sqrt\(sqrt\(min\(1\.0, alpha2 \* 0\.25 \+ min\(2\.0 \* variance, LANDSCAPE_SURFACE_CACHE_VARIANCE_CAP\)\)\)\);/);
});

test('Surface cache shaders: the default program keeps its structure and defines no cache code', () => {
    const standard = code(preprocess(terrainSource, baseDefines));
    assert.match(standard.slice(standard.indexOf('SoilSurface soilSurface(')), /\s+perturbation \+= weight \* direction;\s+if \(microLayer\) \{\s+microHeight \+= [^;]+;\s+luminance \+= /);
    assert.doesNotMatch(standard, /gSurfaceCache|landscapeSurfaceCache|uSurfaceCache/);
    assert.match(mainOf(standard), /vec2 warped = uSurfaceWarpEnabled > 0\.5 \? world \+ landscapeSurfaceWarp\(world\) : world;/);
    assert.match(mainOf(standard), /\{\s+terrainVisibility\(world, dx, dy, normal\);\s+color = terrainRadiance\(/);
    const defines = landscapeSurfaceCacheDefines();
    assert.equal(defines.LANDSCAPE_SURFACE_CACHE_TEXEL0, String(LANDSCAPE_SURFACE_CACHE.texel0Meters));
    assert.deepEqual([defines.LANDSCAPE_SURFACE_CACHE_SLOT, defines.LANDSCAPE_SURFACE_CACHE_GUTTER, defines.LANDSCAPE_SURFACE_CACHE_PAGE_TEXELS, defines.LANDSCAPE_SURFACE_CACHE_WINDOW_MASK],
        ['72.0', '4.0', '64.0', '(63)']);
});
