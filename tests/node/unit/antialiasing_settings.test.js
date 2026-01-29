// Node unit tests: Anti-aliasing settings sanitization.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultResolvedAntiAliasingSettings, sanitizeAntiAliasingSettings } from '../../../src/graphics/visuals/postprocessing/AntiAliasingSettings.js';

test('AntiAliasingSettings: defaults are sane', () => {
    const d = getDefaultResolvedAntiAliasingSettings();
    assert.ok(['off', 'msaa', 'smaa', 'fxaa'].includes(d.mode));
    assert.equal(typeof d.msaa.samples, 'number');
    assert.ok([0, 2, 4, 8].includes(d.msaa.samples));
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

