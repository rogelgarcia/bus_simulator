// Verifies baked-lighting persistence defaults and exact package selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BAKED_LIGHTING_DEFAULTS,
    clearSavedBakedLightingSettings,
    getDefaultResolvedBakedLightingSettings,
    getResolvedBakedLightingSettings,
    resolveExactBakedShadowProfile,
    sanitizeBakedLightingSettings,
    saveBakedLightingSettings
} from '../../../src/app/illumination/runtime/index.js';

const HASH = 'a'.repeat(64);

test('BakedLightingSettings: legacy bus experiment does not survive the appearance-control migration', () => {
    const values = new Map(), previous = globalThis.window;
    globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
    try {
        values.set('bus_sim.bakedLighting.v1', JSON.stringify({ mode: 'auto', shadows: { enabled: true },
            receivers: { indirect: true }, bus: { enabled: true, materials: true, probes: true, glassReflections: true } }));
        const migrated = getResolvedBakedLightingSettings();
        assert.equal(migrated.bus.enabled, false);
        assert.equal(migrated.bus.glassReflections, true);
        assert.equal(migrated.receivers.indirect, true);
        assert.equal(migrated.shadows.enabled, true);
        saveBakedLightingSettings({ ...migrated, bus: { ...migrated.bus, enabled: true } });
        assert.equal(getResolvedBakedLightingSettings().bus.enabled, true, 'A new explicit developer opt-in persists');
    } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

function makeIndex() {
    return {
        schema: 'bus-sim-static-sun-depth-production-package-index-v1',
        profiles: {
            'ai527.sun.az045.el35': {
                packagePath: 'assets/baked_lighting/shadows/production/ai527.sun.az045.el35/static_sun_depth.ilpkg',
                liveIdentity: {
                    alphaSemanticsSha256: HASH,
                    casterInventorySha256: HASH,
                    cityId: 'bigcity2',
                    developmentCacheAllowed: true,
                    lightingProfileId: 'ai527.sun.az045.el35',
                    resolvedSourceSha256: HASH,
                    staticSunDepthSourceSha256: HASH
                }
            }
        }
    };
}

test('BakedLightingSettings: defaults enable the high-resolution moving-object map', () => {
    const defaults = { bus: { enabled: false, materials: true, probes: true, glassReflections: false, bodyReflections: false, rimShine: false }, mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' } };
    assert.deepEqual(BAKED_LIGHTING_DEFAULTS, defaults);
    assert.deepEqual(getDefaultResolvedBakedLightingSettings(), defaults);
    assert.deepEqual(sanitizeBakedLightingSettings({ shadows: { enabled: 'true' } }), {
        mode: 'current', shadows: { enabled: false, dynamicResolution: 'medium' }, receivers: defaults.receivers, bus: defaults.bus
    });
    assert.deepEqual(sanitizeBakedLightingSettings({ mode: 'auto', shadows: { enabled: true, dynamicResolution: 'ultra' } }), {
        mode: 'auto', shadows: { enabled: true, dynamicResolution: 'medium' }, receivers: defaults.receivers, bus: defaults.bus
    });
    assert.deepEqual(sanitizeBakedLightingSettings({ mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' } }), {
        mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: defaults.receivers, bus: defaults.bus
    });
});

test('BakedLightingSettings: saves and restores baked-shadow intent only', () => {
    const values = new Map();
    const previousWindow = globalThis.window;
    globalThis.window = {
        localStorage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        }
    };
    try {
        assert.equal(saveBakedLightingSettings({
            mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' },
            future: 'ignored'
        }), true);
        assert.deepEqual(getResolvedBakedLightingSettings(), {
            bus: { enabled: false, materials: true, probes: true, glassReflections: false, bodyReflections: false, rimShine: false }, mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' }
        });
        saveBakedLightingSettings({ receivers: { direct: false, indirect: false, linked: false } });
        assert.deepEqual(getResolvedBakedLightingSettings().receivers,
            { direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' });
        assert.equal(clearSavedBakedLightingSettings(), true);
        assert.deepEqual(getResolvedBakedLightingSettings(), {
            bus: { enabled: false, materials: true, probes: true, glassReflections: false, bodyReflections: false, rimShine: false }, mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' }
        });
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('BakedLightingSettings: receiver channels are strict independent opt-ins', () => {
    assert.deepEqual(sanitizeBakedLightingSettings({ receivers: { direct: true, indirect: 'true', debug: 'unknown' } }).receivers,
        { direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' });
    assert.deepEqual(sanitizeBakedLightingSettings({ receivers: { indirect: true, debug: 'difference' } }).receivers,
        { direct: false, indirect: true, linked: false, enhanced: true, debug: 'difference' });
});

test('BakedShadowProfile: selects only an exact matching city and sun profile', () => {
    const index = makeIndex();
    const selected = resolveExactBakedShadowProfile(index, {
        cityId: 'bigcity2',
        cityConfigHash: '314e44319dd7a5b9',
        atmosphere: { sun: { azimuthDeg: 45, elevationDeg: 35 } }
    });
    assert.equal(selected.ok, true);
    assert.equal(selected.profileId, 'ai527.sun.az045.el35');

    assert.deepEqual(resolveExactBakedShadowProfile(index, {
        cityId: 'bigcity2',
        cityConfigHash: '314e44319dd7a5b9',
        atmosphere: { sun: { azimuthDeg: 45.1, elevationDeg: 35 } }
    }), { ok: false, reason: 'sun_profile_not_exact', profileId: null });
    assert.deepEqual(resolveExactBakedShadowProfile(index, {
        cityId: 'bigcity',
        cityConfigHash: '314e44319dd7a5b9',
        atmosphere: { sun: { azimuthDeg: 45, elevationDeg: 35 } }
    }), { ok: false, reason: 'city_map_not_current', profileId: 'ai527.sun.az045.el35' });
});


test('BakedLightingSettings: migrate legacy presets and retain inactive channel preferences', () => {
    const input = { mode: 'current', shadows: { enabled: true, dynamicResolution: 'high' },
        receivers: { direct: true, indirect: true, enhanced: false, linked: true, debug: 'direct' } };
    const settings = sanitizeBakedLightingSettings(input);
    assert.equal(settings.mode, 'current');
    assert.equal(settings.shadows.enabled, true);
    assert.equal(settings.receivers.indirect, true);
    assert.equal(settings.receivers.direct, false);
    assert.equal(settings.receivers.enhanced, true);
    assert.equal(settings.receivers.linked, false);
    assert.equal(settings.receivers.debug, 'final');
    assert.deepEqual(sanitizeBakedLightingSettings(settings), settings);
    for (const mode of ['current', 'baked', 'auto']) {
        assert.equal(sanitizeBakedLightingSettings({ ...input, mode }).mode, mode);
    }
    assert.equal(sanitizeBakedLightingSettings({ receivers: { indirect: true, enhanced: false } }).mode, 'auto');
    assert.equal(sanitizeBakedLightingSettings({ receivers: { direct: true } }).mode, 'current');
});
