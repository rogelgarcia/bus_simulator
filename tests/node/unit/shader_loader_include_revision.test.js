// Program and nested includes must share a cache revision through successive loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShaderSourceSet } from '../../../src/graphics/shaders/core/ShaderLoader.js';

test('shader revisions propagate to nested includes without reusing old source', async t => {
    const requests = [];
    t.mock.method(globalThis, 'fetch', async address => {
        const url = new URL(address); requests.push(url);
        const body = url.pathname.endsWith('/outer.glsl') ? '#include <shaderlib:test/inner>'
            : url.pathname.endsWith('/inner.glsl') ? '// nested revision ' + url.search : '#include <shaderlib:test/outer.glsl>';
        return { ok: true, text: async () => body };
    });
    for (const revision of ['one', 'two']) {
        const result = await loadShaderSourceSet({ vertexPath: `test/program.vert.glsl?v=${revision}`, fragmentPath: `test/program.frag.glsl?v=${revision}` });
        assert.equal(result.vertexSource, '// nested revision ?v=' + revision);
        assert.equal(result.fragmentSource, result.vertexSource);
        for (const name of ['outer', 'inner']) assert.ok(requests.some(url => url.pathname.endsWith(`/${name}.glsl`) && url.search === '?v=' + revision));
    }
    assert.ok(requests.every(url => url.search), 'an include was fetched without its revision');
});
