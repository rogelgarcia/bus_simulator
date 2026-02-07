// Node unit tests: Ambient occlusion settings sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultResolvedAmbientOcclusionSettings,
    loadSavedAmbientOcclusionSettings,
    saveAmbientOcclusionSettings,
    sanitizeAmbientOcclusionSettings
} from '../../../src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js';

test('AmbientOcclusionSettings: defaults are sane', () => {
    const d = getDefaultResolvedAmbientOcclusionSettings();
    assert.ok(['off', 'ssao', 'gtao'].includes(d.mode));
    assert.ok(['alpha_test', 'exclude'].includes(String(d.alpha?.handling)));
    assert.equal(typeof d.alpha?.threshold, 'number');
    assert.ok(d.alpha.threshold >= 0.01 && d.alpha.threshold <= 0.99);
    assert.ok(['off', 'vertex'].includes(String(d.staticAo?.mode)));
    assert.equal(typeof d.staticAo?.intensity, 'number');
    assert.ok(['low', 'medium', 'high'].includes(String(d.staticAo?.quality)));
    assert.equal(typeof d.staticAo?.radius, 'number');
    assert.equal(typeof d.staticAo?.wallHeight, 'number');
    assert.equal(typeof d.staticAo?.debugView, 'boolean');
    assert.equal(typeof d.busContactShadow?.enabled, 'boolean');
    assert.equal(typeof d.busContactShadow?.intensity, 'number');
    assert.equal(typeof d.busContactShadow?.radius, 'number');
    assert.equal(typeof d.busContactShadow?.softness, 'number');
    assert.equal(typeof d.busContactShadow?.maxDistance, 'number');
    assert.ok(['every_frame', 'when_camera_moves', 'half_rate', 'third_rate', 'quarter_rate'].includes(String(d.gtao?.updateMode)));
    assert.equal(typeof d.gtao?.motionThreshold?.positionMeters, 'number');
    assert.equal(typeof d.gtao?.motionThreshold?.rotationDeg, 'number');
    assert.equal(typeof d.gtao?.motionThreshold?.fovDeg, 'number');
});

test('AmbientOcclusionSettings: sanitize clamps and normalizes', () => {
    const s = sanitizeAmbientOcclusionSettings({
        mode: ' NONE ',
        alpha: { handling: ' EXCLUDE ', threshold: 999 },
        staticAo: { mode: ' VERTEX ', intensity: 999, quality: ' LOW ', radius: -1, wallHeight: 0, debugView: 'true' },
        busContactShadow: { enabled: true, intensity: 999, radius: -1, softness: 0, maxDistance: -2 },
        ssao: { intensity: -1, radius: 0, quality: 'ULTRA' },
        gtao: {
            intensity: 999,
            radius: -1,
            quality: ' LOW ',
            denoise: false,
            updateMode: ' THIRD_RATE ',
            motionThreshold: {
                positionMeters: -1,
                rotationDeg: 999,
                fovDeg: -2
            }
        }
    });

    assert.equal(s.mode, 'off');
    assert.equal(s.alpha.handling, 'exclude');
    assert.equal(s.alpha.threshold, 0.99);
    assert.equal(s.staticAo.mode, 'vertex');
    assert.equal(s.staticAo.intensity, 2);
    assert.equal(s.staticAo.quality, 'low');
    assert.equal(s.staticAo.radius, 0.25);
    assert.equal(s.staticAo.wallHeight, 0.25);
    assert.equal(s.staticAo.debugView, true);
    assert.equal(s.busContactShadow.enabled, true);
    assert.equal(s.busContactShadow.intensity, 2);
    assert.equal(s.busContactShadow.radius, 0.05);
    assert.equal(s.busContactShadow.softness, 0.02);
    assert.equal(s.busContactShadow.maxDistance, 0);
    assert.equal(s.ssao.intensity, 0);
    assert.equal(s.ssao.radius, 0.1);
    assert.equal(s.ssao.quality, 'medium');
    assert.equal(s.gtao.intensity, 2);
    assert.equal(s.gtao.radius, 0.05);
    assert.equal(s.gtao.quality, 'low');
    assert.equal(s.gtao.denoise, false);
    assert.equal(s.gtao.updateMode, 'third_rate');
    assert.equal(s.gtao.motionThreshold.positionMeters, 0);
    assert.equal(s.gtao.motionThreshold.rotationDeg, 180);
    assert.equal(s.gtao.motionThreshold.fovDeg, 0);
});

test('AmbientOcclusionSettings: save/load persists alpha controls', () => {
    const prevWindow = globalThis.window;
    const storage = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, String(value)); },
            removeItem: (key) => { storage.delete(key); }
        },
        location: { search: '' }
    };

    try {
        const ok = saveAmbientOcclusionSettings({
            mode: 'ssao',
            alpha: { handling: 'alpha_test', threshold: 0.42 },
            ssao: { intensity: 0.2, radius: 9, quality: 'high' }
        });
        assert.equal(ok, true);

        const loaded = loadSavedAmbientOcclusionSettings();
        assert.ok(loaded && typeof loaded === 'object');
        assert.equal(loaded.mode, 'ssao');
        assert.equal(loaded.alpha.handling, 'alpha_test');
        assert.equal(loaded.alpha.threshold, 0.42);
        assert.equal(loaded.ssao.intensity, 0.2);
        assert.equal(loaded.ssao.radius, 9);
        assert.equal(loaded.ssao.quality, 'high');
    } finally {
        globalThis.window = prevWindow;
    }
});

test('AmbientOcclusionSettings: save/load persists gtao update settings', () => {
    const prevWindow = globalThis.window;
    const storage = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, String(value)); },
            removeItem: (key) => { storage.delete(key); }
        },
        location: { search: '' }
    };

    try {
        const ok = saveAmbientOcclusionSettings({
            mode: 'gtao',
            gtao: {
                intensity: 0.4,
                radius: 0.3,
                quality: 'high',
                denoise: true,
                updateMode: 'when_camera_moves',
                motionThreshold: { positionMeters: 0.05, rotationDeg: 0.25, fovDeg: 0.1 }
            }
        });
        assert.equal(ok, true);

        const loaded = loadSavedAmbientOcclusionSettings();
        assert.ok(loaded && typeof loaded === 'object');
        assert.equal(loaded.mode, 'gtao');
        assert.equal(loaded.gtao.intensity, 0.4);
        assert.equal(loaded.gtao.radius, 0.3);
        assert.equal(loaded.gtao.quality, 'high');
        assert.equal(loaded.gtao.denoise, true);
        assert.equal(loaded.gtao.updateMode, 'when_camera_moves');
        assert.equal(loaded.gtao.motionThreshold.positionMeters, 0.05);
        assert.equal(loaded.gtao.motionThreshold.rotationDeg, 0.25);
        assert.equal(loaded.gtao.motionThreshold.fovDeg, 0.1);
    } finally {
        globalThis.window = prevWindow;
    }
});

test('AmbientOcclusionSettings: save/load persists bus contact shadow', () => {
    const prevWindow = globalThis.window;
    const storage = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, String(value)); },
            removeItem: (key) => { storage.delete(key); }
        },
        location: { search: '' }
    };

    try {
        const ok = saveAmbientOcclusionSettings({
            mode: 'off',
            busContactShadow: { enabled: true, intensity: 0.5, radius: 1.1, softness: 0.6, maxDistance: 1.25 }
        });
        assert.equal(ok, true);

        const loaded = loadSavedAmbientOcclusionSettings();
        assert.ok(loaded && typeof loaded === 'object');
        assert.equal(loaded.mode, 'off');
        assert.equal(loaded.busContactShadow.enabled, true);
        assert.equal(loaded.busContactShadow.intensity, 0.5);
        assert.equal(loaded.busContactShadow.radius, 1.1);
        assert.equal(loaded.busContactShadow.softness, 0.6);
        assert.equal(loaded.busContactShadow.maxDistance, 1.25);
    } finally {
        globalThis.window = prevWindow;
    }
});

test('AmbientOcclusionSettings: save/load persists static ao', () => {
    const prevWindow = globalThis.window;
    const storage = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => { storage.set(key, String(value)); },
            removeItem: (key) => { storage.delete(key); }
        },
        location: { search: '' }
    };

    try {
        const ok = saveAmbientOcclusionSettings({
            mode: 'off',
            staticAo: { mode: 'vertex', intensity: 0.5, quality: 'high', radius: 5.5, wallHeight: 2.1, debugView: true }
        });
        assert.equal(ok, true);

        const loaded = loadSavedAmbientOcclusionSettings();
        assert.ok(loaded && typeof loaded === 'object');
        assert.equal(loaded.mode, 'off');
        assert.equal(loaded.staticAo.mode, 'vertex');
        assert.equal(loaded.staticAo.intensity, 0.5);
        assert.equal(loaded.staticAo.quality, 'high');
        assert.equal(loaded.staticAo.radius, 5.5);
        assert.equal(loaded.staticAo.wallHeight, 2.1);
        assert.equal(loaded.staticAo.debugView, true);
    } finally {
        globalThis.window = prevWindow;
    }
});
