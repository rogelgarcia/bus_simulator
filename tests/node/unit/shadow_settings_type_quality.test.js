// Node unit tests: the shadow `type` + `quality` settings model
// (AI_graphics_499) — legacy back-compatibility, ladder monotonicity, and the
// derivation rules the preset literals are supposed to satisfy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SHADOW_DEFAULTS,
    SHADOW_QUALITY_PRESETS,
    getShadowPresetId,
    getShadowQualityPreset,
    sanitizeShadowSettings
} from '../../../src/graphics/lighting/ShadowSettings.js';

const TIERS = ['low', 'med', 'high'];
const REFERENCE_TEXEL_METERS = 220 / 4096;
const singleDensity = (p) => (2 * p.radiusMeters) / p.mapSize;

test('ShadowSettings: every legacy flat quality id still resolves', () => {
    const expected = {
        off: { type: 'off' },
        0: { type: 'off' },
        none: { type: 'off' },
        disabled: { type: 'off' },
        low: { type: 'single', quality: 'low' },
        1: { type: 'single', quality: 'low' },
        medium: { type: 'single', quality: 'med' },
        2: { type: 'single', quality: 'med' },
        high: { type: 'single', quality: 'high' },
        3: { type: 'single', quality: 'high' },
        ultra: { type: 'single', quality: 'high' },
        4: { type: 'single', quality: 'high' },
        max: { type: 'single', quality: 'high' },
        cascade_ultra: { type: 'cascade', quality: 'high' },
        'cascade ultra': { type: 'cascade', quality: 'high' },
        cascadeultra: { type: 'cascade', quality: 'high' },
        CASCADED: { type: 'cascade', quality: 'high' },
        cascade: { type: 'cascade', quality: 'high' },
        ' csm ': { type: 'cascade', quality: 'high' },
        5: { type: 'cascade', quality: 'high' }
    };
    for (const [raw, want] of Object.entries(expected)) {
        const got = sanitizeShadowSettings({ quality: raw });
        assert.equal(got.type, want.type, `type for legacy '${raw}'`);
        if (want.quality) assert.equal(got.quality, want.quality, `quality for legacy '${raw}'`);
    }
});

test('ShadowSettings: new-model ids and separators resolve', () => {
    for (const raw of ['single_low', 'single:low', 'SINGLE_LOW']) {
        const got = sanitizeShadowSettings({ quality: raw });
        assert.deepEqual([got.type, got.quality], ['single', 'low'], `selector '${raw}'`);
    }
    for (const [type, quality] of [['single', 'med'], ['cascade', 'low'], ['cascade', 'high']]) {
        const got = sanitizeShadowSettings({ type, quality });
        assert.deepEqual([got.type, got.quality], [type, quality]);
    }
});

test('ShadowSettings: type and quality are independent; off keeps the tier', () => {
    const off = sanitizeShadowSettings({ type: 'off', quality: 'low' });
    assert.equal(off.type, 'off');
    assert.equal(off.quality, 'low', 'turning shadows off must not forget the tier');
    assert.equal(getShadowQualityPreset(off).enabled, false);

    // ...and switching back on lands where it left.
    const backOn = sanitizeShadowSettings({ ...off, type: 'cascade' });
    assert.equal(getShadowPresetId(backOn), 'cascade_low');
});

test('ShadowSettings: an unknown quality falls back to a real preset', () => {
    const s = sanitizeShadowSettings({ quality: 'nope' });
    assert.equal(s.type, SHADOW_DEFAULTS.type);
    assert.equal(s.quality, SHADOW_DEFAULTS.quality);
    assert.ok(SHADOW_QUALITY_PRESETS[getShadowPresetId(s)], 'resolves to a defined preset');
});

test('ShadowSettings: defaults match the legacy id they replace', () => {
    // The pinned options preset stores `shadows: { quality: 'high' }`, so the
    // code defaults and that record must resolve identically.
    assert.deepEqual(sanitizeShadowSettings(SHADOW_DEFAULTS), sanitizeShadowSettings({ quality: 'high' }));
});

test('ShadowSettings: legacy records drop the retired cascade knobs', () => {
    // `cascades: 4` and a Shadow-distance splitScale were never deliberate
    // choices; carrying them forward would hand a 2-cascade tier a 4-cascade
    // layout, whose split array does not fit.
    const migrated = sanitizeShadowSettings({ quality: 'cascade_ultra', cascades: 4, splitScale: 0.6 });
    assert.equal(migrated.type, 'cascade');
    assert.equal(migrated.cascades, 0, '0 means follow the tier');
    assert.equal(migrated.splitScale, 1);

    // New-model records still honour them, so dev overrides work.
    const dev = sanitizeShadowSettings({ type: 'cascade', quality: 'high', cascades: 3, splitScale: 0.8 });
    assert.equal(dev.cascades, 3);
    assert.equal(dev.splitScale, 0.8);
});

test('ShadowSettings: cascades clamps to 0 (auto) or 2..4; splitScale to 0.5..2.5', () => {
    const at = (over) => sanitizeShadowSettings({ type: 'cascade', quality: 'high', ...over });
    assert.equal(at({ cascades: 1 }).cascades, 2);
    assert.equal(at({ cascades: 9 }).cascades, 4);
    assert.equal(at({ cascades: '2' }).cascades, 2);
    assert.equal(at({ cascades: 0 }).cascades, 0);
    assert.equal(at({ cascades: -3 }).cascades, 0);
    assert.equal(at({ cascades: 'garbage' }).cascades, 0);
    assert.equal(at({ splitScale: 0.1 }).splitScale, 0.5);
    assert.equal(at({ splitScale: 99 }).splitScale, 2.5);
    assert.equal(at({ splitScale: '1.5' }).splitScale, 1.5);
    assert.equal(at({ splitScale: 0 }).splitScale, 1);
    assert.equal(at({ splitScale: 'garbage' }).splitScale, 1);
});

test('ShadowSettings: the single ladder spends every step on reach', () => {
    const presets = TIERS.map((t) => SHADOW_QUALITY_PRESETS[`single_${t}`]);
    for (const p of presets) {
        assert.equal(p.enabled, true);
        assert.equal(p.cascades, undefined, 'single tiers are not cascaded');
        assert.ok(Number.isFinite(p.radiusMeters), 'single tiers declare their reach');
    }
    for (let i = 1; i < presets.length; i++) {
        const prev = presets[i - 1];
        const next = presets[i];
        // Nothing may get cheaper as quality rises, and nothing may get more
        // expensive as it falls: that is the whole point of folding distance in.
        assert.ok(next.mapSize > prev.mapSize, `map size grows at step ${i}`);
        assert.ok(next.radiusMeters > prev.radiusMeters, `reach grows at step ${i}`);
        // Density holds roughly constant (and never gets coarser) while reach
        // triples, which is what keeps a step down unambiguously cheaper.
        assert.ok(singleDensity(next) <= singleDensity(prev) + 1e-9, `density does not coarsen at step ${i}`);
        assert.ok(singleDensity(next) > singleDensity(prev) * 0.6, `density stays in the same band at step ${i}`);
    }
});

test('ShadowSettings: single bias terms follow their derivation rules', () => {
    for (const tier of TIERS) {
        const p = SHADOW_QUALITY_PRESETS[`single_${tier}`];
        // normalBias must scale WITH texel size — a value tuned for a coarse
        // map detaches the shadow on a fine one. Anchor: 0.03 at 0.0537 m/texel.
        const wantNormalBias = 0.03 * (singleDensity(p) / REFERENCE_TEXEL_METERS);
        assert.ok(
            Math.abs(p.normalBias - wantNormalBias) < 1e-4,
            `single_${tier} normalBias ${p.normalBias} ~= ${wantNormalBias.toFixed(5)}`
        );
        // `bias` is normalized depth and the light frustum deepens with reach,
        // so it scales down as the box grows.
        const wantBias = -0.00015 * (110 / p.radiusMeters);
        assert.ok(
            Math.abs(p.bias - wantBias) < 1e-6,
            `single_${tier} bias ${p.bias} ~= ${wantBias.toExponential(3)}`
        );
    }
});

test('ShadowSettings: the cascade ladder adds lanes without moving the horizon', () => {
    const presets = TIERS.map((t) => SHADOW_QUALITY_PRESETS[`cascade_${t}`]);
    for (const p of presets) {
        assert.equal(p.enabled, true);
        assert.equal(p.splits.length, p.cascades, 'one split per cascade');
        assert.equal(p.mapSizeScales.length, p.cascades, 'one scale per cascade');
        for (let i = 1; i < p.splits.length; i++) {
            assert.ok(p.splits[i] > p.splits[i - 1], 'splits increase outward');
        }
        // Texel snapping needs every cascade's texel size to divide the
        // smallest, which holds only while the scales are powers of two.
        for (const s of p.mapSizeScales) {
            assert.ok(s > 0 && Number.isInteger(Math.log2(s)), `scale ${s} is a power of two`);
        }
        assert.equal(p.splits[p.splits.length - 1], 340, 'every cascade tier reaches the same horizon');
        // Cascades multiply the base size by their scales; the ladder tops out
        // at 8192 per cascade, and four 16384 maps would be 4 GiB.
        assert.ok(p.mapSize * Math.max(...p.mapSizeScales) <= 8192, 'no cascade map exceeds 8192');
    }
    for (let i = 1; i < presets.length; i++) {
        assert.ok(presets[i].cascades > presets[i - 1].cascades, `cascade count grows at step ${i}`);
    }
});

test('ShadowSettings: getShadowQualityPreset accepts settings objects and bare selectors', () => {
    assert.equal(getShadowQualityPreset({ type: 'cascade', quality: 'med' }), SHADOW_QUALITY_PRESETS.cascade_med);
    assert.equal(getShadowQualityPreset('cascade_ultra'), SHADOW_QUALITY_PRESETS.cascade_high);
    assert.equal(getShadowQualityPreset('ultra'), SHADOW_QUALITY_PRESETS.single_high);
    assert.equal(getShadowQualityPreset('off'), SHADOW_QUALITY_PRESETS.off);
    assert.equal(getShadowQualityPreset(null), SHADOW_QUALITY_PRESETS[`${SHADOW_DEFAULTS.type}_${SHADOW_DEFAULTS.quality}`]);
});
