// Node unit tests: Anti-aliasing settings sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDefaultResolvedAntiAliasingSettings,
    getResolvedAntiAliasingSettings,
    loadSavedAntiAliasingSettings,
    saveAntiAliasingSettings,
    sanitizeAntiAliasingSettings
} from '../../../src/graphics/visuals/postprocessing/AntiAliasingSettings.js';

test('AntiAliasingSettings: defaults are sane', () => {
    const d = getDefaultResolvedAntiAliasingSettings();
    assert.ok(['off', 'msaa', 'taa', 'smaa', 'fxaa'].includes(d.mode));
    assert.equal(typeof d.msaa.samples, 'number');
    assert.ok([0, 2, 4, 8].includes(d.msaa.samples));
    assert.ok(['low', 'medium', 'high', 'ultra', 'custom'].includes(String(d.taa?.preset)));
    assert.equal(typeof d.taa.historyStrength, 'number');
    assert.equal(typeof d.taa.jitter, 'number');
    assert.equal(typeof d.taa.sharpen, 'number');
    assert.equal(typeof d.taa.clampStrength, 'number');
    assert.equal(typeof d.smaa.threshold, 'number');
    assert.equal(typeof d.smaa.maxSearchSteps, 'number');
    assert.equal(typeof d.smaa.maxSearchStepsDiag, 'number');
    assert.equal(typeof d.smaa.cornerRounding, 'number');
    assert.equal(typeof d.fxaa.edgeThreshold, 'number');
});

test('AntiAliasingSettings: sanitize clamps and normalizes', () => {
    const s = sanitizeAntiAliasingSettings({
        mode: ' NONE ',
        msaa: { samples: 5 },
        smaa: { preset: ' ULTRA ', threshold: -1, maxSearchSteps: 999, maxSearchStepsDiag: -5, cornerRounding: 999 },
        fxaa: { preset: 'Sharp', edgeThreshold: 999 }
    });

    assert.equal(s.mode, 'off');
    assert.equal(s.msaa.samples, 8);
    assert.equal(s.smaa.preset, 'ultra');
    assert.equal(s.smaa.threshold, 0.01);
    assert.equal(s.smaa.maxSearchSteps, 64);
    assert.equal(s.smaa.maxSearchStepsDiag, 0);
    assert.equal(s.smaa.cornerRounding, 100);
    assert.equal(s.fxaa.preset, 'sharp');
    assert.equal(s.fxaa.edgeThreshold, 0.5);
});

test('AntiAliasingSettings: TAA mode aliases + clamps', () => {
    const s = sanitizeAntiAliasingSettings({
        mode: ' SMAA T2x ',
        taa: {
            preset: 'ULTRA',
            historyStrength: 999,
            jitter: -1,
            sharpen: '0.5',
            clampStrength: 999
        }
    });

    assert.equal(s.mode, 'taa');
    assert.equal(s.taa.preset, 'ultra');
    assert.equal(s.taa.historyStrength, 0.98);
    assert.equal(s.taa.jitter, 0);
    assert.equal(s.taa.sharpen, 0.5);
    assert.equal(s.taa.clampStrength, 1);
});

test('AntiAliasingSettings: save/load persists TAA', () => {
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
        const ok = saveAntiAliasingSettings({
            mode: 'taa',
            taa: {
                preset: 'custom',
                historyStrength: 0.9,
                jitter: 0.75,
                sharpen: 0.2,
                clampStrength: 0.8
            }
        });
        assert.equal(ok, true);

        const loaded = loadSavedAntiAliasingSettings();
        assert.ok(loaded && typeof loaded === 'object');
        assert.equal(loaded.mode, 'taa');
        assert.equal(loaded.taa.preset, 'custom');
        assert.equal(loaded.taa.historyStrength, 0.9);
        assert.equal(loaded.taa.jitter, 0.75);
        assert.equal(loaded.taa.sharpen, 0.2);
        assert.equal(loaded.taa.clampStrength, 0.8);
    } finally {
        globalThis.window = prevWindow;
    }
});

test('AntiAliasingSettings: URL overrides apply to TAA', () => {
    const prevWindow = globalThis.window;
    globalThis.window = {
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        location: { search: '?aa=taa&taaHistory=0.85&taaJitter=0.5&taaSharpen=0.25&taaClamp=0.9' }
    };

    try {
        const r = getResolvedAntiAliasingSettings({ includeUrlOverrides: true });
        assert.equal(r.mode, 'taa');
        assert.equal(r.taa.historyStrength, 0.85);
        assert.equal(r.taa.jitter, 0.5);
        assert.equal(r.taa.sharpen, 0.25);
        assert.equal(r.taa.clampStrength, 0.9);
    } finally {
        globalThis.window = prevWindow;
    }
});
