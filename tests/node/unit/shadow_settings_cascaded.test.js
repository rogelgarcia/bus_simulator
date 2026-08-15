// Node unit tests: shadow settings sanitization for the cascaded quality,
// and the scene-shadow material choke point contract (AI_graphics_484).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SHADOW_QUALITY_PRESETS,
    getShadowQualityPreset,
    sanitizeShadowSettings
} from '../../../src/graphics/lighting/ShadowSettings.js';
import {
    setActiveSceneShadowSystem,
    getActiveSceneShadowSystem,
    isLitMaterial,
    registerMaterialForSceneShadows,
    registerObjectForSceneShadows
} from '../../../src/graphics/lighting/SceneShadowMaterials.js';

test('ShadowSettings: Cascade Ultra sanitizes from aliases, including the old id', () => {
    for (const raw of ['cascade_ultra', 'CASCADE_ULTRA', ' cascade ultra ', 'cascadeultra', 'cascaded', 'CASCADED', ' csm ', 'cascade', '5']) {
        assert.equal(sanitizeShadowSettings({ quality: raw }).quality, 'cascade_ultra', `alias '${raw}'`);
    }
});

test('ShadowSettings: Cascade Ultra carries a cascade count, others do not', () => {
    const preset = getShadowQualityPreset('cascade_ultra');
    assert.equal(preset.enabled, true);
    assert.equal(preset.cascades, 4);
    assert.ok(preset.mapSize >= 1024);
    for (const id of ['off', 'low', 'medium', 'high', 'ultra']) {
        assert.equal(SHADOW_QUALITY_PRESETS[id].cascades, undefined, `preset '${id}'`);
    }
});

test('ShadowSettings: Cascade Ultra describes its own cascade layout', () => {
    const preset = getShadowQualityPreset('cascade_ultra');
    assert.ok(Array.isArray(preset.splits), 'splits array');
    assert.ok(Array.isArray(preset.mapSizeScales), 'mapSizeScales array');
    assert.equal(preset.splits.length, preset.cascades, 'one split per cascade');
    assert.equal(preset.mapSizeScales.length, preset.cascades, 'one scale per cascade');
    // Splits must increase outward; the last is the shadow horizon.
    for (let i = 1; i < preset.splits.length; i++) {
        assert.ok(preset.splits[i] > preset.splits[i - 1], `split ${i} beyond split ${i - 1}`);
    }
    // Texel snapping needs every cascade's texel size to divide the smallest,
    // which holds only while the scales are powers of two.
    for (const s of preset.mapSizeScales) {
        assert.ok(s > 0 && Number.isInteger(Math.log2(s)), `scale ${s} is a power of two`);
    }
});

test('ShadowSettings: cascades field clamps to 2..4 and defaults to 4', () => {
    assert.equal(sanitizeShadowSettings({}).cascades, 4);
    assert.equal(sanitizeShadowSettings({ cascades: 1 }).cascades, 2);
    assert.equal(sanitizeShadowSettings({ cascades: 9 }).cascades, 4);
    assert.equal(sanitizeShadowSettings({ cascades: '2' }).cascades, 2);
    assert.equal(sanitizeShadowSettings({ cascades: 'garbage' }).cascades, 4);
});

test('ShadowSettings: splitScale clamps to 0.5..2.5 and defaults to 1', () => {
    assert.equal(sanitizeShadowSettings({}).splitScale, 1);
    assert.equal(sanitizeShadowSettings({ splitScale: 0.1 }).splitScale, 0.5);
    assert.equal(sanitizeShadowSettings({ splitScale: 99 }).splitScale, 2.5);
    assert.equal(sanitizeShadowSettings({ splitScale: '1.5' }).splitScale, 1.5);
    assert.equal(sanitizeShadowSettings({ splitScale: 0 }).splitScale, 1);
    assert.equal(sanitizeShadowSettings({ splitScale: -2 }).splitScale, 1);
    assert.equal(sanitizeShadowSettings({ splitScale: 'garbage' }).splitScale, 1);
});

test('ShadowSettings: unknown quality still falls back to default', () => {
    const s = sanitizeShadowSettings({ quality: 'nope' });
    assert.ok(['off', 'low', 'medium', 'high', 'ultra', 'cascade_ultra'].includes(s.quality));
});

test('SceneShadowMaterials: everything is a no-op without an active system', () => {
    setActiveSceneShadowSystem(null);
    const mat = { isMeshStandardMaterial: true };
    registerMaterialForSceneShadows(mat);
    assert.deepEqual(mat, { isMeshStandardMaterial: true }, 'material must stay untouched');
    assert.equal(getActiveSceneShadowSystem(), null);
});

test('SceneShadowMaterials: only lit material types register', () => {
    const seen = [];
    setActiveSceneShadowSystem({ registerMaterial: (m) => seen.push(m) });
    try {
        const standard = { isMeshStandardMaterial: true };
        const physical = { isMeshPhysicalMaterial: true };
        const basic = { isMeshBasicMaterial: true };
        const shader = { isShaderMaterial: true };
        registerMaterialForSceneShadows(standard);
        registerMaterialForSceneShadows(physical);
        registerMaterialForSceneShadows(basic);
        registerMaterialForSceneShadows(shader);
        registerMaterialForSceneShadows(null);
        assert.deepEqual(seen, [standard, physical]);
        assert.equal(isLitMaterial(standard), true);
        assert.equal(isLitMaterial(basic), false);
    } finally {
        setActiveSceneShadowSystem(null);
    }
});

test('SceneShadowMaterials: traversal covers single and array materials', () => {
    const seen = [];
    setActiveSceneShadowSystem({ registerMaterial: (m) => seen.push(m) });
    try {
        const a = { isMeshStandardMaterial: true, name: 'a' };
        const b = { isMeshLambertMaterial: true, name: 'b' };
        const c = { isMeshPhongMaterial: true, name: 'c' };
        const nodes = [
            { material: a },
            { material: [b, { isMeshBasicMaterial: true }] },
            { material: c },
            {}
        ];
        const root = { traverse: (fn) => nodes.forEach(fn) };
        registerObjectForSceneShadows(root);
        assert.deepEqual(seen.map((m) => m.name), ['a', 'b', 'c']);
    } finally {
        setActiveSceneShadowSystem(null);
    }
});

test('SceneShadowMaterials: rejects systems without registerMaterial', () => {
    setActiveSceneShadowSystem({});
    assert.equal(getActiveSceneShadowSystem(), null);
    setActiveSceneShadowSystem(null);
});
