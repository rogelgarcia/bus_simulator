// Verifies the AI577 D6 compile-time terrain program variants: defaults, validation, flag defines and their consumption by the terrain shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_TERRAIN_PROGRAM_VARIANT, landscapeProgramVariant, landscapeProgramVariantDefines, sameLandscapeProgramVariant } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainProgramVariant.js';

const read = path => readFile(new URL(`../../../src/${path}`, import.meta.url), 'utf8');
const terrain = await read('graphics/shaders/materials/landscape/terrain.frag.glsl');
const appearance = await read('graphics/shaders/chunks/landscape/terrain_appearance.glsl');
const loader = await read('graphics/shaders/materials/landscape/LandscapeShaderLoader.js');

// keeps only the lines of a source that a define selects (#ifdef NAME ... #endif blocks, no #else for these flags)
function resolveFlag(source, name, defined) {
    const out = [], stack = [];
    let active = true;
    for (const line of source.split('\n')) {
        const directive = line.trim();
        if (new RegExp(`^#ifdef\\s+${name}\\b`).test(directive)) { stack.push({ mine: true, outer: active }); active = active && defined; continue; }
        if (/^#if/.test(directive)) { stack.push({ mine: false, outer: active }); if (active) out.push(line); continue; }
        if (/^#endif\b/.test(directive)) { const top = stack.pop(); active = top.outer; if (!top.mine && active) out.push(line); continue; }
        if (active) out.push(line);
    }
    assert.equal(stack.length, 0);
    return out.join('\n');
}

test('Terrain program variant: the default draws the shaded surface with the terrain-driven appearance and no inspection views', () => {
    assert.deepEqual(LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults, { diagnostics: false, terrainAppearance: true, surfaceCache: false });
    assert.deepEqual(landscapeProgramVariant(), { diagnostics: false, terrainAppearance: true, surfaceCache: false });
    assert.deepEqual(landscapeProgramVariant({ diagnostics: true }), { diagnostics: true, terrainAppearance: true, surfaceCache: false });
    assert.ok(Object.isFrozen(landscapeProgramVariant()));
    for (const invalid of [{ diagnostics: 1 }, { terrainAppearance: 'off' }, { diagnostics: null }, { surfaceCache: 'on' }]) assert.throws(() => landscapeProgramVariant(invalid), /switches must be boolean/);
    assert.equal(sameLandscapeProgramVariant(landscapeProgramVariant(), { diagnostics: false, terrainAppearance: true }), true, 'an omitted surface cache switch is off');
    assert.equal(sameLandscapeProgramVariant(landscapeProgramVariant(), landscapeProgramVariant({ terrainAppearance: false })), false);
    assert.equal(sameLandscapeProgramVariant(landscapeProgramVariant(), landscapeProgramVariant({ surfaceCache: true })), false);
});

test('Terrain program variant: valueless flag defines select the compiled code', () => {
    assert.deepEqual(landscapeProgramVariantDefines({}), { LANDSCAPE_TERRAIN_APPEARANCE: true });
    assert.deepEqual(landscapeProgramVariantDefines({ diagnostics: true }), { LANDSCAPE_TERRAIN_DIAGNOSTICS: true, LANDSCAPE_TERRAIN_APPEARANCE: true });
    assert.deepEqual(landscapeProgramVariantDefines({ terrainAppearance: false }), {});
    assert.deepEqual(landscapeProgramVariantDefines({ surfaceCache: true }), { LANDSCAPE_TERRAIN_APPEARANCE: true, LANDSCAPE_SURFACE_CACHE: true });
    assert.deepEqual(landscapeProgramVariantDefines({ surfaceCache: true, diagnostics: true }), { LANDSCAPE_TERRAIN_DIAGNOSTICS: true, LANDSCAPE_TERRAIN_APPEARANCE: true },
        'inspection views evaluate coverage and materials, so they take precedence over the cached frame');
    assert.deepEqual(LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defines, { diagnostics: 'LANDSCAPE_TERRAIN_DIAGNOSTICS', terrainAppearance: 'LANDSCAPE_TERRAIN_APPEARANCE', surfaceCache: 'LANDSCAPE_SURFACE_CACHE' });
    assert.match(loader, /const variant = surfaceCacheGeneration \|\| surfaceCacheNear \? \{ diagnostics: false, terrainAppearance, surfaceCache: false \} : \{ diagnostics, terrainAppearance, surfaceCache \};\s+const variantDefines = landscapeProgramVariantDefines\(variant\)/,
        'the loader builds the terrain payload defines from the variant; the generation program and the near pass never compile the cached frame or the inspection views');
    assert.match(terrain, /#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS/);
    assert.match(appearance, /#ifdef LANDSCAPE_TERRAIN_APPEARANCE/);
});

test('Terrain program variant: with the appearance switch off the terrain-driven inputs stay neutral; on, the body runs without a loop or branch', () => {
    const body = source => source.slice(source.indexOf('LandscapeTerrainAppearance landscapeTerrainAppearance('), source.indexOf('\n}\n', source.indexOf('LandscapeTerrainAppearance landscapeTerrainAppearance(')));
    const off = body(resolveFlag(appearance, 'LANDSCAPE_TERRAIN_APPEARANCE', false)), on = body(resolveFlag(appearance, 'LANDSCAPE_TERRAIN_APPEARANCE', true));
    assert.match(off, /LandscapeTerrainAppearance result = LandscapeTerrainAppearance\(vec2\(0\.0\), 0\.0, 0\.0, 0\.0, 0\.0\);\s+return result;/, 'off returns the neutral inputs');
    assert.doesNotMatch(off, /landscapeAppearanceLayer/);
    assert.match(on, /landscapeAppearanceLayer\(position\.xz\)/);
    assert.doesNotMatch(on, /\bfor \(|if \(uLandscapeResponse/, 'on evaluates the inputs unconditionally (measured faster than the D5 loop of uniform trip count once the diagnostics left the default program)');
    // the rock factor keeps its uniform gate, so the switch state of the lighting stays authoritative for the weathering in both variants
    assert.match(appearance, /vec3 factor = vec3\(1\.0\);\s+if \(uLandscapeResponse\.w > 0\.5\) \{/);
});
