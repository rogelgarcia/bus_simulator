// Node unit tests: GTAO denoise/debug output policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGtaoDenoisePolicy } from '../../../src/graphics/visuals/postprocessing/GtaoDenoisePolicy.js';

test('GtaoDenoisePolicy: denoise stays in composed default output', () => {
    const out = resolveGtaoDenoisePolicy({
        denoiseRequested: true,
        debugViewRequested: false,
        denoiseSupported: true,
        debugOutputSupported: true
    });

    assert.equal(out.denoiseEnabled, true);
    assert.equal(out.debugViewEnabled, false);
    assert.equal(out.outputMode, 'default');
    assert.equal(out.fallbackReason, null);
});

test('GtaoDenoisePolicy: debug visualization uses denoise output mode', () => {
    const out = resolveGtaoDenoisePolicy({
        denoiseRequested: true,
        debugViewRequested: true,
        denoiseSupported: true,
        debugOutputSupported: true
    });

    assert.equal(out.denoiseEnabled, true);
    assert.equal(out.debugViewEnabled, true);
    assert.equal(out.outputMode, 'denoise_debug');
    assert.equal(out.fallbackReason, null);
});

test('GtaoDenoisePolicy: missing denoise support falls back to stable default output', () => {
    const out = resolveGtaoDenoisePolicy({
        denoiseRequested: true,
        debugViewRequested: false,
        denoiseSupported: false,
        debugOutputSupported: false
    });

    assert.equal(out.denoiseEnabled, false);
    assert.equal(out.debugViewEnabled, false);
    assert.equal(out.outputMode, 'default');
    assert.equal(out.fallbackReason, 'denoise_unsupported');
});

test('GtaoDenoisePolicy: debug request falls back when debug output is unavailable', () => {
    const out = resolveGtaoDenoisePolicy({
        denoiseRequested: true,
        debugViewRequested: true,
        denoiseSupported: true,
        debugOutputSupported: false
    });

    assert.equal(out.denoiseEnabled, true);
    assert.equal(out.debugViewEnabled, false);
    assert.equal(out.outputMode, 'default');
    assert.equal(out.fallbackReason, 'debug_output_unsupported');
});
