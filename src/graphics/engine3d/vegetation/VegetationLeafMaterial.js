// Binds thin-leaf lighting to standard/physical materials, including Inspector material clones.
// @ts-check
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { vegetationLeafShader } from '../../shaders/materials/VegetationLeafShaderLoader.js';

const bindings = new WeakMap();
const ANCHOR = '#include <lights_physical_pars_fragment>';

/** @param {object} material @param {number} factor */
export function bindVegetationLeafTransmission(material, factor) {
    if (!material.isMeshStandardMaterial || !Number.isFinite(factor) || factor < 0 || factor > 1) {
        throw new Error('[VegetationLeafMaterial] Expected a standard/physical material and a transmission factor in [0, 1].');
    }
    material.userData.leafDiffuseTransmission = factor;
    const previous = bindings.get(material);
    if (previous) {
        previous.value = factor;
        return;
    }
    const uniform = { value: factor };
    registerMaterialShaderHook(material, {
        id: 'vegetation.leaf_transmission',
        priority: 100,
        variantKey: vegetationLeafShader.variantKey,
        uniforms: { uLeafDiffuseTransmission: uniform },
        apply(shader) {
            if (!shader.fragmentShader.includes(ANCHOR)) throw new Error('[VegetationLeafMaterial] Missing physical lighting shader anchor.');
            shader.fragmentShader = shader.fragmentShader.replace(ANCHOR, `${ANCHOR}\n${vegetationLeafShader.fragmentSource}`);
        }
    });
    bindings.set(material, uniform);
}
