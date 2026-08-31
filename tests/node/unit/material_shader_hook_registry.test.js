// Verifies deterministic, independently removable built-in material shader hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    getMaterialShaderHookRegistrySnapshot,
    registerMaterialShaderHook,
    removeMaterialShaderHook,
    updateMaterialShaderHook
} from '../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';

function createMaterial({ ownCallbacks = true } = {}) {
    const calls = [];
    const prototype = {
        onBeforeCompile(shader) {
            shader.source.push('base');
        },
        customProgramCacheKey() {
            return `base:${this.onBeforeCompile.name}`;
        }
    };
    const material = Object.create(prototype);
    if (ownCallbacks) {
        material.onBeforeCompile = function originalCompile(shader) {
            shader.source.push('base');
        };
        material.customProgramCacheKey = function originalCacheKey() {
            return 'base:key';
        };
    }
    Object.defineProperty(material, 'needsUpdate', {
        configurable: true,
        set(value) {
            if (value === true) calls.push('needsUpdate');
        }
    });
    return { material, calls, prototype };
}

function compile(material) {
    const shader = { source: [] };
    material.onBeforeCompile(shader, null);
    return shader.source;
}

test('MaterialShaderHookRegistry: runs enabled hooks by priority then id', () => {
    const { material } = createMaterial();
    registerMaterialShaderHook(material, { id: 'z', priority: 20, variantKey: 'z1', apply: (shader) => shader.source.push('z') });
    registerMaterialShaderHook(material, { id: 'first', priority: 10, variantKey: 'f1', apply: (shader) => shader.source.push('first') });
    registerMaterialShaderHook(material, { id: 'a', priority: 20, variantKey: 'a1', apply: (shader) => shader.source.push('a') });

    assert.deepEqual(compile(material), ['base', 'first', 'a', 'z']);
    assert.equal(
        material.customProgramCacheKey(),
        'base:key|material_shader_hooks:[[10,"first","f1"],[20,"a","a1"],[20,"z","z1"]]'
    );
});

test('MaterialShaderHookRegistry: disabled hooks preserve prior shader source and cache key exactly', () => {
    const { material, calls } = createMaterial();
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    const hook = registerMaterialShaderHook(material, {
        id: 'disabled',
        enabled: false,
        variantKey: 'd1',
        apply: (shader) => shader.source.push('disabled')
    });

    assert.deepEqual(compile(material), ['base']);
    assert.equal(material.customProgramCacheKey(), previousKey);
    assert.deepEqual(calls, []);

    hook.update({ enabled: true });
    assert.deepEqual(compile(material), ['base', 'disabled']);
    assert.equal(calls.length, 1);
    hook.update({ enabled: false });
    assert.deepEqual(compile(material), ['base']);
    assert.equal(material.customProgramCacheKey(), previousKey);
    hook.remove();
    assert.strictEqual(material.onBeforeCompile, previousCompile);
});

test('MaterialShaderHookRegistry: removing a CSM-like hook leaves another extension active', () => {
    const { material } = createMaterial();
    const originalCompile = material.onBeforeCompile;
    const originalCacheKey = material.customProgramCacheKey;
    const extension = registerMaterialShaderHook(material, {
        id: 'illumination.static_sun',
        priority: 200,
        variantKey: 'sun1',
        apply: (shader) => shader.source.push('static-sun')
    });
    const csm = registerMaterialShaderHook(material, {
        id: 'city.cascaded_shadows',
        priority: 100,
        variantKey: 'csm1',
        apply: (shader) => shader.source.push('csm')
    });

    assert.deepEqual(compile(material), ['base', 'csm', 'static-sun']);
    assert.equal(csm.remove(), true);
    assert.deepEqual(compile(material), ['base', 'static-sun']);
    assert.doesNotMatch(material.customProgramCacheKey(), /cascaded_shadows/);
    assert.match(material.customProgramCacheKey(), /illumination\.static_sun/);

    assert.equal(extension.remove(), true);
    assert.strictEqual(material.onBeforeCompile, originalCompile);
    assert.strictEqual(material.customProgramCacheKey, originalCacheKey);
    assert.deepEqual(getMaterialShaderHookRegistrySnapshot(material), { installed: false, hooks: [] });
});

test('MaterialShaderHookRegistry: final removal restores inherited property ownership', () => {
    const { material, prototype } = createMaterial({ ownCallbacks: false });
    assert.equal(Object.hasOwn(material, 'onBeforeCompile'), false);
    assert.equal(Object.hasOwn(material, 'customProgramCacheKey'), false);
    const priorKey = material.customProgramCacheKey();
    const hook = registerMaterialShaderHook(material, {
        id: 'temporary',
        variantKey: 't1',
        apply: (shader) => shader.source.push('temporary')
    });

    hook.update({ enabled: false });
    assert.deepEqual(compile(material), ['base']);
    assert.equal(material.customProgramCacheKey(), priorKey);
    hook.remove();
    assert.equal(Object.hasOwn(material, 'onBeforeCompile'), false);
    assert.equal(Object.hasOwn(material, 'customProgramCacheKey'), false);
    assert.strictEqual(material.onBeforeCompile, prototype.onBeforeCompile);
    assert.strictEqual(material.customProgramCacheKey, prototype.customProgramCacheKey);
});

test('MaterialShaderHookRegistry: update and remove invalidate only active variants', () => {
    const { material, calls } = createMaterial();
    registerMaterialShaderHook(material, {
        id: 'active',
        variantKey: 'v1',
        apply: (shader) => shader.source.push('v1')
    });
    assert.equal(calls.length, 1);

    updateMaterialShaderHook(material, 'active', { variantKey: 'v2' });
    assert.equal(calls.length, 2);
    assert.throws(
        () => updateMaterialShaderHook(material, 'active', { apply: (shader) => shader.source.push('v3') }),
        /must change variantKey/
    );
    updateMaterialShaderHook(material, 'active', {
        variantKey: 'v3',
        apply: (shader) => shader.source.push('v3')
    });
    assert.equal(calls.length, 3);
    assert.deepEqual(compile(material), ['base', 'v3']);
    assert.equal(removeMaterialShaderHook(material, 'active'), true);
    assert.equal(calls.length, 4);
    assert.equal(removeMaterialShaderHook(material, 'active'), false);
    assert.equal(calls.length, 4);
});

test('MaterialShaderHookRegistry: validates ids, priorities, booleans, and duplicate ownership', () => {
    const { material } = createMaterial();
    assert.throws(
        () => registerMaterialShaderHook(material, { id: ' bad', apply() {} }),
        /stable non-empty string/
    );
    assert.throws(
        () => registerMaterialShaderHook(material, { id: 'bad-priority', priority: 0.5, apply() {} }),
        /safe integer/
    );
    assert.throws(
        () => registerMaterialShaderHook(material, { id: 'bad-enabled', enabled: 1, apply() {} }),
        /must be boolean/
    );
    const owned = registerMaterialShaderHook(material, { id: 'owned', priority: 5, apply() {} });
    assert.throws(
        () => registerMaterialShaderHook(material, { id: 'owned', apply() {} }),
        /already registered/
    );
    assert.throws(
        () => owned.update({ priority: 1, enabled: 1 }),
        /must be boolean/
    );
    assert.deepEqual(
        getMaterialShaderHookRegistrySnapshot(material).hooks,
        [{ id: 'owned', priority: 5, enabled: true, variantKey: '1' }]
    );
});

test('CityCascadedShadows: owns a registry hook instead of replacing material callbacks', async () => {
    const source = await readFile(new URL('../../../src/graphics/visuals/city/CityCascadedShadows.js', import.meta.url), 'utf8');
    assert.match(source, /registerMaterialShaderHook\(material,/);
    assert.match(source, /id: CSM_MATERIAL_HOOK_ID/);
    assert.match(source, /hook\.remove\(\)/);
    assert.doesNotMatch(source, /material\.onBeforeCompile\s*=/);
    assert.doesNotMatch(source, /delete material\.onBeforeCompile/);
});
