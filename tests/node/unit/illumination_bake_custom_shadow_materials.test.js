// Verifies selected bake casters reject unadapted custom shadow materials without blocking forced-opaque sources.
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertBakeSourceCasterShadowMaterials } from '../../../src/graphics/illumination/bake_source/BakeSourceMaterials.js';
import { BakeSourceValidationError } from '../../../src/graphics/illumination/bake_source/BakeSourceErrors.js';

const context = {
    selectedCaster: true,
    objectId: 'object/building:test/root',
    rootId: 'building:test',
    semanticPath: 'root'
};

for (const [property, type] of [
    ['customDepthMaterial', 'MeshDepthMaterial'],
    ['customDistanceMaterial', 'MeshDistanceMaterial']
]) {
    test(`selected caster rejects unadapted ${property}`, () => {
        const mesh = { name: 'TestCaster', userData: {}, [property]: { type, name: `Test${type}` } };
        assert.throws(
            () => assertBakeSourceCasterShadowMaterials(mesh, context),
            (error) => {
                assert.ok(error instanceof BakeSourceValidationError);
                assert.equal(error.code, 'custom_shadow_material_adapter_missing');
                assert.equal(error.context.objectId, context.objectId);
                assert.equal(error.context.shadowMaterialProperty, property);
                assert.equal(error.context.shadowMaterialType, type);
                assert.match(error.context.remediation, /adapter|caster selection/);
                return true;
            }
        );
    });
}

test('mergeShadowAsOpaque caster preserves the supported forced-opaque path', () => {
    const mesh = {
        userData: { mergeShadowAsOpaque: true },
        customDepthMaterial: { type: 'MeshDepthMaterial' },
        customDistanceMaterial: { type: 'MeshDistanceMaterial' }
    };
    assert.doesNotThrow(() => assertBakeSourceCasterShadowMaterials(mesh, context));
});

test('custom shadow material on an unselected non-caster is ignored', () => {
    const mesh = { userData: {}, customDepthMaterial: { type: 'MeshDepthMaterial' } };
    assert.doesNotThrow(() => assertBakeSourceCasterShadowMaterials(mesh, { ...context, selectedCaster: false }));
});
