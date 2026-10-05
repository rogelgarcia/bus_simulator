// Verifies device-sized terrain coverage slots and the surface diagnostic interface of the production shader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_COVERAGE_SLOT_DEFINE, LANDSCAPE_COVERAGE_SLOTS_MAX, LANDSCAPE_DETAIL_SLOTS_MAX, LANDSCAPE_MASK_SLOTS, LANDSCAPE_THREE_FRAGMENT_UNIFORM_VECTORS,
    assertLandscapeCoverageSlots, landscapeFragmentUniformVectors, resolveLandscapeCoverageSlots } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageSlots.js';
import { LANDSCAPE_DIAGNOSTICS, LANDSCAPE_SURFACE_LEVEL_COLORS, LANDSCAPE_SURFACE_SOIL_COLORS, createLandscapeDiagnosticUniforms, landscapeColorBytes,
    landscapeSurfaceLevelColorDefine, landscapeSurfaceLevelColorValues, landscapeSurfaceSoilColorValues } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainDiagnostics.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';

const shader = await readFile(new URL('../../../src/graphics/shaders/materials/landscape/terrain.frag.glsl', import.meta.url), 'utf8');
const warpChunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/surface_warp.glsl', import.meta.url), 'utf8');
const clumpChunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/material_clumps.glsl', import.meta.url), 'utf8');
const samplingChunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/stochastic_tiling.glsl', import.meta.url), 'utf8');
const macroChunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/macro_variation.glsl', import.meta.url), 'utf8');
const layerChunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/surface_layers.glsl', import.meta.url), 'utf8');
const lightingChunks = Object.fromEntries(await Promise.all(['terrain_fields', 'lighting_visibility', 'lighting', 'atmosphere', 'water_optics', 'terrain_appearance', 'dressing_inputs'].map(async name => [name,
    await readFile(new URL(`../../../src/graphics/shaders/chunks/landscape/${name}.glsl`, import.meta.url), 'utf8')])));
const expandedShader = shader.replace('#include <shaderlib:landscape/surface_warp>', warpChunk).replace('#include <shaderlib:landscape/material_clumps>', clumpChunk)
    .replace('#include <shaderlib:landscape/stochastic_tiling>', samplingChunk).replace('#include <shaderlib:landscape/macro_variation>', macroChunk)
    .replace('#include <shaderlib:landscape/surface_layers>', layerChunk)
    .replace(/#include <shaderlib:landscape\/(terrain_fields|lighting_visibility|lighting|atmosphere|water_optics|terrain_appearance|dressing_inputs)>/g, (_, name) => lightingChunks[name]);
const warpSizes = { LANDSCAPE_SURFACE_WARP_OCTAVES: 4 };
const count = (pattern) => (shader.match(pattern) ?? []).length;

/**
 * Resolves only the AI577 D6 diagnostics conditionals (#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS ... #endif) of a shader source; every other preprocessor
 * block passes through unchanged. @param {string} source @param {boolean} defined
 */
function resolveTerrainDiagnostics(source, defined) {
    const out = [], stack = [];
    let active = true;
    for (const line of source.split('\n')) {
        const directive = line.trim();
        if (/^#ifdef\s+LANDSCAPE_TERRAIN_DIAGNOSTICS\b/.test(directive)) { stack.push({ mine: true, outer: active }); active = active && defined; continue; }
        if (/^#if/.test(directive)) { stack.push({ mine: false, outer: active }); if (active) out.push(line); continue; }
        if (/^#else\b/.test(directive)) {
            const top = stack.at(-1);
            if (top.mine) active = top.outer && !defined; else if (active) out.push(line);
            continue;
        }
        if (/^#endif\b/.test(directive)) {
            const top = stack.pop();
            active = top.outer;
            if (!top.mine && active) out.push(line);
            continue;
        }
        if (active) out.push(line);
    }
    assert.equal(stack.length, 0, 'balanced conditionals');
    return out.join('\n');
}

test('Coverage slots: the native mask count is unchanged and fine pages may add at most 64 slots', () => {
    assert.equal(LANDSCAPE_MASK_SLOTS, 17);
    assert.equal(LANDSCAPE_DETAIL_SLOTS_MAX, 64);
    assert.equal(LANDSCAPE_COVERAGE_SLOTS_MAX, 81);
    assert.equal(assertLandscapeCoverageSlots(17), 17);
    assert.equal(assertLandscapeCoverageSlots(81), 81);
    for (const invalid of [16, 82, 17.5, undefined, '33']) assert.throws(() => assertLandscapeCoverageSlots(invalid), /\[Landscape\] Coverage slot count/);
});

test('Coverage slots: every slot array and slot loop in the terrain shader uses the compile-time define', () => {
    assert.match(shader, /#ifndef LANDSCAPE_COVERAGE_SLOTS\s+#error /);
    assert.equal(count(/(?<![\w.])17(?![\w.])/g), 0, 'No hardcoded native slot count may remain in the terrain shader');
    for (const name of ['uMaskBounds', 'uMaskMeta', 'uMaskNeighbors0', 'uMaskNeighbors1']) assert.match(shader, new RegExp(`uniform vec4 ${name}\\[${LANDSCAPE_COVERAGE_SLOT_DEFINE}\\];`));
    assert.equal(count(new RegExp(`\\[${LANDSCAPE_COVERAGE_SLOT_DEFINE}\\]`, 'g')), 4);
    assert.equal(count(new RegExp(`for \\(int (?:i|depth) = 0; (?:i|depth) < ${LANDSCAPE_COVERAGE_SLOT_DEFINE}; (?:i|depth)\\+\\+\\)`, 'g')), 4,
        'maskAt, filteredMaskCoverage, hierarchyCoverage and surfaceLevelColor iterate every slot');
    assert.match(shader, /int layers = textureSize\(uMaskPages, 0\)\.z;\s+for \(int i = 0; i < LANDSCAPE_COVERAGE_SLOTS; i\+\+\) \{\s+if \(i >= layers\) break;/,
        'the finest-page search stops at the mask array depth, beyond which no slot can be active');
});

test('Coverage slots: conservative uniform accounting sizes the arrays from device fragment-uniform capacity', () => {
    assert.match(shader, /#include <shaderlib:landscape\/surface_warp>\s+#include <shaderlib:landscape\/material_clumps>\s+#include <shaderlib:landscape\/stochastic_tiling>\s+#include <shaderlib:landscape\/macro_variation>\s+#include <shaderlib:landscape\/surface_layers>\s+#include <shaderlib:landscape\/terrain_fields>\s+#include <shaderlib:landscape\/lighting_visibility>\s+#include <shaderlib:landscape\/lighting>\s+#include <shaderlib:landscape\/atmosphere>\s+#include <shaderlib:landscape\/water_optics>\s+#include <shaderlib:landscape\/terrain_appearance>\s+#include <shaderlib:landscape\/dressing_inputs>/,
        'the terrain shader compiles the shared recipe warp chunk, the clump, stochastic tiling, macro variation and surface layer chunks that reuse its hashing, the AI577 D5 terrain fields, '
        + 'the lighting chunks, the terrain-driven appearance and the dressing-input diagnostics');
    assert.throws(() => landscapeFragmentUniformVectors(expandedShader), /unsupported array size LANDSCAPE_SURFACE_WARP_OCTAVES/, 'the warp octave arrays need their compile-time size');
    const vectors = landscapeFragmentUniformVectors(expandedShader, warpSizes);
    assert.deepEqual(vectors, { fixedVectors: 155, slotVectors: 4 },
        '81 historical vectors, the slot ranges, the warp enable flag, three four-octave warp arrays, 18 clump relief vectors, 9 stochastic tiling vectors, '
        + '6 packed soil state vectors (replacing the 12 scalar height/resolution vectors), 12 macro variation vectors, 2 surface layer vectors, '
        + 'the 11 AI577 D5 lighting vectors (9 sky harmonic, 1 sun direction, 1 sun irradiance), the D5 terrain-field sampler and state vector, the D5c '
        + 'response (6 soil response vectors, 1 switch vector) and the D5 planning cover bitmask of the terrain-driven appearance (its parameters are '
        + 'compile-time constants and its switch and soil roles reuse spare components), less the 8 surface-level tints that became compile-time constants');
    assert.equal(LANDSCAPE_THREE_FRAGMENT_UNIFORM_VECTORS, 7);
    assert.ok(vectors.fixedVectors <= 156, 'the AI577 D5 hard cap keeps 17 native slots plus one spare vector at the WebGL2 minimum');
    assert.deepEqual(resolveLandscapeCoverageSlots({ maxFragmentUniforms: 1024, ...vectors }),
        { total: 81, native: 17, detail: 64, detailMax: 64, maxFragmentUniforms: 1024, fixedUniformVectors: 155, slotUniformVectors: 4 });
    assert.equal(resolveLandscapeCoverageSlots({ maxFragmentUniforms: 224, ...vectors }).total, 17, 'the WebGL2 minimum still fits the 17 native slots (no fine detail slot)');
    assert.equal(resolveLandscapeCoverageSlots({ maxFragmentUniforms: 228, ...vectors }).detail, 1);
    assert.ok(vectors.fixedVectors <= 224 - 17 * vectors.slotVectors, 'fixed vectors stay within the WebGL2 minimum budget for 17 native slots');
    assert.throws(() => resolveLandscapeCoverageSlots({ maxFragmentUniforms: 220, ...vectors }), /\[Landscape\] Device MAX_FRAGMENT_UNIFORM_VECTORS 220 fits 16 terrain coverage slots/);
    assert.throws(() => resolveLandscapeCoverageSlots({ maxFragmentUniforms: 1024.5, ...vectors }), /positive integer maxFragmentUniforms/);
});

test('Coverage slots: unsupported uniform declarations fail instead of undercounting', () => {
    const slots = 'uniform vec4 a[LANDSCAPE_COVERAGE_SLOTS];\n';
    assert.deepEqual(landscapeFragmentUniformVectors(`${slots}// uniform mat4 ignored;\n/* uniform mat4 ignored; */ uniform highp mat3 m; uniform float f[3];`), { fixedVectors: 7 + 3 + 3, slotVectors: 1 });
    assert.throws(() => landscapeFragmentUniformVectors(`${slots}uniform float f[COUNT];`), /unsupported array size COUNT/);
    assert.throws(() => landscapeFragmentUniformVectors(`${slots}uniform Light light;`), /unsupported type Light/);
    assert.throws(() => landscapeFragmentUniformVectors(`${slots}uniform float a, b;`), /Unsupported terrain uniform declaration/);
    assert.throws(() => landscapeFragmentUniformVectors('uniform vec4 a[17];'), /declares no LANDSCAPE_COVERAGE_SLOTS arrays/);
    assert.deepEqual(landscapeFragmentUniformVectors(`${slots}uniform ivec2 s[COUNT];`, { COUNT: 3 }), { fixedVectors: 7 + 3, slotVectors: 1 });
    for (const sizes of [{ COUNT: 0 }, { COUNT: 1.5 }, { [LANDSCAPE_COVERAGE_SLOT_DEFINE]: 4 }]) assert.throws(() => landscapeFragmentUniformVectors(`${slots}uniform float f[COUNT];`, sizes), /Terrain array size/);
});

test('Terrain diagnostics: the default program carries no inspection code and LANDSCAPE_TERRAIN_DIAGNOSTICS compiles every view (AI577 D6)', () => {
    const shaded = resolveTerrainDiagnostics(shader, false), inspected = resolveTerrainDiagnostics(shader, true);
    // the selector and review uniforms stay declared (conservative uniform accounting) but the default program never reads them
    assert.doesNotMatch(shaded.replace(/\/\/[^\n]*/g, '').replace(/\buniform\b[^;]*;/g, ''), /\b(uDiagnostic|uDiagnosticRange|uSurfaceSoilColors)\b/,
        'no diagnostic selector or palette is read by the default program');
    for (const name of ['surfaceLevelColor', 'surfaceCoverageColor', 'diagnosticDisplay', 'terrainInputDiagnostic', 'landscapeSurfaceLevelColors', 'landscapeDressingInputs']) {
        assert.doesNotMatch(shaded, new RegExp(`\\b${name}\\b`), `${name} is compiled only into the diagnostics program`);
        assert.match(inspected, new RegExp(`\\b${name}\\b`));
    }
    const main = shaded.slice(shaded.indexOf('void main() {'));
    assert.match(main, /vec3 color = vec3\(0\.0\);\s+\{\s+\/\/ the vertex-color fallback/, 'the default program enters the shaded path directly');
    assert.match(main, /\{\s+terrainVisibility\(world, dx, dy, normal\);\s+color = terrainRadiance\(/, 'and lights every fragment');
    assert.match(main, /#include <colorspace_fragment>\s+\}\s*$/, 'and writes the tone-mapped output');
    for (const [index, name] of LANDSCAPE_DIAGNOSTICS.entries()) if (index) assert.match(inspected, new RegExp(`uDiagnostic == ${index}\\b`), `${name} is a branch of the diagnostics program`);
    assert.ok(inspected.replace(/\s+/g, ' ').includes('if (uAppearanceReady < 0.5 || uDiagnostic < 5) { terrainVisibility(world, dx, dy, normal);'), 'unlit diagnostics skip the lighting');
    assert.equal(count(/#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS/g), 8,
        'the level tints, the two diagnostic helper groups and five points of main (unlit views, unlit coverage and inputs, level tint, lighting condition, unlit output)');
});

test('Terrain diagnostics: shader branches, palettes and soil review colors match the selector catalog', () => {
    assert.deepEqual(LANDSCAPE_DIAGNOSTICS, ['none', 'elevation', 'slope', 'water', 'surface-level', 'surface-coverage', 'terrain-appearance',
        'dressing', 'dressing-grass', 'dressing-shrub', 'dressing-tree', 'dressing-rock', 'dressing-debris']);
    for (const [index, name] of LANDSCAPE_DIAGNOSTICS.entries()) if (index) assert.match(shader, new RegExp(`uDiagnostic == ${index}\\b`), `${name} has a shader branch`);
    assert.match(shader, /if \(uDiagnostic == 5\) color = surfaceCoverageColor\(coverage\);/, 'surface coverage shows unlit weights');
    assert.match(shader, /else if \(uDiagnostic >= 6\) color = terrainInputDiagnostic\(coverage, world, dx, dy, normal, positionDx, positionDy\);/, 'the AI577 D5 inspection views are unlit');
    assert.match(shader, /#include <colorspace_fragment>\s+#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS\s+if \(uDiagnostic >= 5 && uAppearanceReady > 0\.5\) gl_FragColor = vec4\(color, 1\.0\);\s+#endif/,
        'unlit diagnostics bypass tone mapping');
    assert.equal(count(/hierarchyCoverage\(world, dx, dy, warped, warpedDx, warpedDy\)/g), 1, 'the inlined hierarchy reconstruction is evaluated once, keeping FXC compile time unchanged');
    assert.match(shader, /vec2 warped = uSurfaceWarpEnabled > 0\.5 \? world \+ landscapeSurfaceWarp\(world\) : world;\s+vec2 warpedDx = dFdx\(warped\), warpedDy = dFdy\(warped\);/,
        'warped coordinates and their footprint derivatives are taken in uniform control flow at the top of main');
    assert.equal(count(/maskCoverage\(/g), 2,'one maskCoverage definition and its single frame-selected call keep FXC inlining unchanged');
    assert.match(shader, new RegExp(`const vec3 landscapeSurfaceLevelColors\\[${LANDSCAPE_SURFACE_LEVEL_COLORS.length}\\] = vec3\\[${LANDSCAPE_SURFACE_LEVEL_COLORS.length}\\]\\(LANDSCAPE_SURFACE_LEVEL_COLOR_LIST\\);`),
        'level tints are compile-time constants since AI577 D5c, so they occupy no uniform vectors');
    assert.doesNotMatch(shader, /uniform vec3 uSurfaceLevelColors/);
    assert.match(shader, /uniform vec3 uSurfaceSoilColors\[6\];/);
    assert.deepEqual(LANDSCAPE_SURFACE_LEVEL_COLORS.map(entry => entry.level), [0, 1, 2, 3, 4, 5, 6, 7], 'native levels 0-3 plus up to four generated levels');
    assert.equal(new Set(LANDSCAPE_SURFACE_LEVEL_COLORS.map(entry => entry.hex)).size, 8);
    assert.match(shader, /landscapeSurfaceLevelColors\[clamp\(int\(uMaskMeta\[current\]\.x \+ 0\.5\), 0, 7\)\]/);
    const uniforms = createLandscapeDiagnosticUniforms(), levels = landscapeSurfaceLevelColorValues();
    assert.deepEqual(Object.keys(uniforms), ['uSurfaceSoilColors']);
    assert.equal(uniforms.uSurfaceSoilColors.value.length, 18);
    assert.equal(levels.length, 24);
    assert.ok(Math.abs(levels[9 + 1] - ((0xd6 / 255 + 0.055) / 1.055) ** 2.4) < 1e-6, 'level tints are linear albedo');
    const listed = [...landscapeSurfaceLevelColorDefine().matchAll(/vec3\(([^)]*)\)/g)].map(match => match[1].split(',').map(Number));
    assert.equal(listed.length, 8, 'the define lists every level tint');
    listed.forEach((rgb, level) => rgb.forEach((value, channel) => assert.ok(Math.abs(value - levels[level * 3 + channel]) < 1e-7, `level ${level} channel ${channel}`)));
    assert.deepEqual(Object.keys(LANDSCAPE_SURFACE_SOIL_COLORS).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    assert.deepEqual(LANDSCAPE_SOIL_CATALOG.map(soil => landscapeColorBytes(LANDSCAPE_SURFACE_SOIL_COLORS[soil.id].hex)),
        [[210, 60, 210], [96, 124, 138], [217, 197, 143], [118, 160, 78], [104, 76, 48], [186, 183, 176]], 'same bytes as the D2 generator review images');
    const values = landscapeSurfaceSoilColorValues(LANDSCAPE_SOIL_CATALOG);
    LANDSCAPE_SOIL_CATALOG.forEach((soil, index) => landscapeColorBytes(LANDSCAPE_SURFACE_SOIL_COLORS[soil.id].hex)
        .forEach((byte, channel) => assert.equal(values[index * 3 + channel], Math.fround(byte / 255))));
    assert.throws(() => landscapeSurfaceSoilColorValues([{ id: 'mud' }]), /no color for soil mud/);
});
