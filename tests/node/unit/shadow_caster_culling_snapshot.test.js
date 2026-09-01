// Verifies that camera culling cannot mutate or erase the authored inventory.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import test from 'node:test';

const cullerUrl = new URL(
    '../../../src/graphics/lighting/ShadowCasterCulling.js?snapshot-mock',
    import.meta.url
);
const threeStubUrl = 'data:text/javascript;charset=utf-8,'
    + encodeURIComponent('export {};');
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if ((context.parentURL ?? '').startsWith(cullerUrl.href)
            && specifier === 'three') {
            return {url: threeStubUrl, shortCircuit: true};
        }
        return nextResolve(specifier, context);
    }
});
const {ShadowCasterCuller} = await import(cullerUrl.href);
hooks.deregister();

test('indexed caster snapshot is fresh, frozen, and independent of camera-mutated flags', () => {
    const firstCaster = {name: 'first', castShadow: true};
    const secondCaster = {name: 'second', castShadow: true};
    const cullerState = {
        _entries: [{mesh: firstCaster}, {mesh: secondCaster}]
    };

    const beforeCull = ShadowCasterCuller.prototype.getIndexedCasterMeshes.call(cullerState);
    firstCaster.castShadow = false;
    const afterCull = ShadowCasterCuller.prototype.getIndexedCasterMeshes.call(cullerState);

    assert.notEqual(beforeCull, afterCull);
    assert.equal(Object.isFrozen(beforeCull), true);
    assert.equal(Object.isFrozen(afterCull), true);
    assert.deepEqual(afterCull, [firstCaster, secondCaster]);
    assert.throws(() => afterCull.push({name: 'injected'}), TypeError);
});

test('canonical bake caster resolver consumes only the public culler snapshot', async () => {
    const source = await readFile(
        new URL('../../../src/graphics/illumination/bake_source/BakeSourceScene.js', import.meta.url),
        'utf8'
    );
    assert.match(source, /getIndexedCasterMeshes\?\.\(\)/);
    assert.doesNotMatch(source, /_shadowCuller\?\._entries/);
});
