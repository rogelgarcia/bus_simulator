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

test('BakedLightingSettings: defaults preserve the legacy renderer', () => {
    const medium = { shadows: { enabled: false, dynamicResolution: 'medium' } };
    assert.deepEqual(BAKED_LIGHTING_DEFAULTS, medium);
    assert.deepEqual(getDefaultResolvedBakedLightingSettings(), medium);
    assert.deepEqual(sanitizeBakedLightingSettings({ shadows: { enabled: 'true' } }), medium);
    assert.deepEqual(sanitizeBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'ultra' } }), {
        shadows: { enabled: true, dynamicResolution: 'medium' }
    });
    assert.deepEqual(sanitizeBakedLightingSettings({ shadows: { enabled: true, dynamicResolution: 'high' } }), {
        shadows: { enabled: true, dynamicResolution: 'high' }
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
            shadows: { enabled: true, dynamicResolution: 'high' },
            future: 'ignored'
        }), true);
        assert.deepEqual(getResolvedBakedLightingSettings(), {
            shadows: { enabled: true, dynamicResolution: 'high' }
        });
        assert.equal(clearSavedBakedLightingSettings(), true);
        assert.deepEqual(getResolvedBakedLightingSettings(), {
            shadows: { enabled: false, dynamicResolution: 'medium' }
        });
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
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
