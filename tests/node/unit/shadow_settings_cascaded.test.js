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

test('ShadowSettings: cascaded quality sanitizes from aliases', () => {
    for (const raw of ['cascaded', 'CASCADED', ' csm ', 'cascade', '5']) {
        assert.equal(sanitizeShadowSettings({ quality: raw }).quality, 'cascaded', `alias '${raw}'`);
    }
});

test('ShadowSettings: cascaded preset carries a cascade count, others do not', () => {
    const preset = getShadowQualityPreset('cascaded');
    assert.equal(preset.enabled, true);
    assert.equal(preset.cascades, 4);
    assert.ok(preset.mapSize >= 1024);
    for (const id of ['off', 'low', 'medium', 'high', 'ultra']) {
        assert.equal(SHADOW_QUALITY_PRESETS[id].cascades, undefined, `preset '${id}'`);
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
    assert.ok(['off', 'low', 'medium', 'high', 'ultra', 'cascaded'].includes(s.quality));
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
