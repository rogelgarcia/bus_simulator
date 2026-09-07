// Verifies AO scope activation, explicit overrides and lossless settings migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAmbientOcclusionSettings as sanitize } from '../../../src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js';
import { resolveAmbientOcclusionScope as resolve } from '../../../src/graphics/visuals/postprocessing/AmbientOcclusionScope.js';
test('Only effective indirect switches AO scope, preserving Off and both banks', () => {
    const settings = sanitize({ mode: 'gtao', gtao: { intensity: 1.37 }, staticAo: { mode: 'vertex' }, busContactShadow: { enabled: true } });
    const saved = JSON.stringify(settings);
    for (let i = 0; i < 10; i++) {
        assert.equal(resolve(settings, false).scope, 'all');
        assert.equal(resolve(settings, true).scope, 'dynamic');
        assert.equal(resolve(settings, true).pipeline.mode, 'off');
        assert.equal(resolve(settings, true).pipeline.staticAo.mode, 'off');
        assert.equal(resolve(settings, true).pipeline.busContactShadow.enabled, false);
        assert.equal(resolve(settings, false).pipeline, settings);
    }
    assert.equal(JSON.stringify(settings), saved);
    assert.equal(resolve(sanitize({ ...settings, mode: 'off' }), true).enabled, false);
    assert.equal(resolve(sanitize({ ...settings, indirectScope: 'all' }), true).scope, 'all');
    assert.deepEqual(sanitize(JSON.parse(saved)), settings);
    const edited = sanitize({ ...settings, dynamic: { intensity: .4, radius: 2, quality: 'high' } });
    assert.deepEqual(edited.gtao, settings.gtao);
    assert.equal(edited.dynamic.intensity, .4);
    assert.equal(edited.dynamic.busMethod, 'analytic');
    assert.equal(sanitize({ dynamic: { busMethod: 'gtao' } }).dynamic.busMethod, 'gtao');
    assert.equal(sanitize({ dynamic: { busMethod: 'unknown' } }).dynamic.busMethod, 'analytic');
    const ssao = sanitize({ mode: 'ssao' });
    assert.equal(sanitize({ ...ssao, mode: 'off' }).allMethod, 'ssao');
});
