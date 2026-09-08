// Adds selective HDRI specular response while retaining the authored shading model.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { busReflectionShaders } from '../../shaders/materials/BusReflectionShaderLoader.js';

const PROFILES = Object.freeze({
    glass: { roughness: .18, f0: .04, strength: .65, pbrBoost: .2 },
    body: { roughness: .34, f0: .025, strength: .3, pbrBoost: .1 },
    rim: { roughness: .3, f0: .16, strength: .55, pbrBoost: .1 }
});

/** @param {any} material @param {any} settings @returns {'glass'|'body'|'rim'|null} */
export function busReflectionKind(material, settings) {
    if (!material.isMeshPhongMaterial && !material.isMeshStandardMaterial) return null;
    const name = material.name.toLowerCase();
    if (settings.glassReflections && /glass|window/.test(name)) return 'glass';
    if (settings.bodyReflections && /^(paint|bus_body.*|dubledecker-(body|red).*)$/.test(name)) return 'body';
    if (settings.rimShine && name === 'rimmetal') return 'rim';
    return null;
}

/** @param {any} material @param {'glass'|'body'|'rim'} kind */
export function addBusReflections(material, kind) {
    const profile = PROFILES[kind];
    const uniforms = { busReflectionProfile: { value: new THREE.Vector4(profile.roughness, profile.f0, profile.strength, profile.pbrBoost) } };
    const hook = registerMaterialShaderHook(material, {
        id: 'illumination.bus_reflections', priority: 315, variantKey: busReflectionShaders.variantKey,
        uniforms,
        apply(shader) {
            if (THREE.REVISION !== '183' || !shader.fragmentShader.includes('#include <lights_fragment_end>')) {
                throw new Error('Unsupported bus reflection shader contract');
            }
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\n' + busReflectionShaders.fragment)
                .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + busReflectionShaders.apply);
            Object.assign(shader.uniforms, uniforms);
        }
    });
    material.addEventListener('dispose', () => hook.remove());
}
