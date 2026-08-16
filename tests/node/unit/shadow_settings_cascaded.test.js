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

test('ShadowSettings: only the cascade tiers carry a cascade count', () => {
    for (const id of ['cascade_low', 'cascade_med', 'cascade_high']) {
        const preset = SHADOW_QUALITY_PRESETS[id];
        assert.equal(preset.enabled, true, id);
        assert.ok(preset.cascades >= 2 && preset.cascades <= 4, `${id} cascade count`);
        assert.ok(preset.mapSize >= 1024, `${id} base map size`);
    }
    for (const id of ['off', 'single_low', 'single_med', 'single_high']) {
        assert.equal(SHADOW_QUALITY_PRESETS[id].cascades, undefined, `preset '${id}'`);
    }
});

test('ShadowSettings: the old Cascade Ultra id still lands on a cascade preset', () => {
    const preset = getShadowQualityPreset('cascade_ultra');
    assert.equal(preset, SHADOW_QUALITY_PRESETS.cascade_high);
    assert.equal(preset.cascades, 4);
    assert.ok(Array.isArray(preset.splits), 'splits array');
    assert.ok(Array.isArray(preset.mapSizeScales), 'mapSizeScales array');
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
