// Node unit tests: GTAO cache support resolver.
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGtaoCacheTexture } from '../../../src/graphics/visuals/postprocessing/GtaoCacheSupport.js';

function makeTexture() {
    return { isTexture: true };
}

test('GtaoCacheSupport: uses native gtaoMap when available', () => {
    const texture = makeTexture();
    const result = resolveGtaoCacheTexture({ gtaoMap: texture });
    assert.equal(result.supported, true);
    assert.equal(result.mode, 'native_map');
    assert.equal(result.texture, texture);
});

test('GtaoCacheSupport: falls back to pdRenderTarget texture', () => {
    const texture = makeTexture();
    const result = resolveGtaoCacheTexture({ pdRenderTarget: { texture } });
    assert.equal(result.supported, true);
    assert.equal(result.mode, 'pd_target');
    assert.equal(result.texture, texture);
});

test('GtaoCacheSupport: falls back to raw gtaoRenderTarget texture', () => {
    const texture = makeTexture();
    const result = resolveGtaoCacheTexture({ gtaoRenderTarget: { texture } });
    assert.equal(result.supported, true);
    assert.equal(result.mode, 'raw_target');
    assert.equal(result.texture, texture);
});

test('GtaoCacheSupport: reports unsupported when no cache texture exists', () => {
    const result = resolveGtaoCacheTexture({ gtaoMap: null, pdRenderTarget: null, gtaoRenderTarget: null });
    assert.equal(result.supported, false);
    assert.equal(result.mode, 'none');
    assert.equal(result.texture, null);
});

