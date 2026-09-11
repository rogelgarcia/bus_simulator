// Material reflection suppression must not remove physically calibrated diffuse sky.
import * as THREE from 'three';
import { CALIBRATED_DAYLIGHT } from '../../lighting/CalibratedDaylight.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { calibratedDiffuseIblShader as source } from '../../shaders/lighting/CalibratedDiffuseIblShaderLoader.js';

const bindings = new WeakMap();
const ENVIRONMENT = '#include <envmap_physical_pars_fragment>';
const MAPS = '#include <lights_fragment_maps>';

export function updateCalibratedDiffuseIbl(material, environment, settings) {
    // Legacy Phong buses retain their authored environment response. The calibrated
    // PBR transport contract covers Standard/Physical receiver materials.
    if (!material?.isMeshStandardMaterial) return;
    const texture = environment === undefined ? material.envMap : environment;
    const calibrated = settings.iblId !== undefined
        ? settings.iblId === CALIBRATED_DAYLIGHT.environmentId
        : texture?.userData?.iblHdrUrl?.endsWith('/calibrated/clear-afternoon-55.hdr');
    const active = !!texture && settings.enabled !== false && calibrated;
    let binding = bindings.get(material);
    if (!binding && !active) return;
    if (!binding) {
        const uniforms = { calibratedDiffuseIblIntensity: { value: -1 } };
        const hook = registerMaterialShaderHook(material, {
            id: 'lighting.calibrated_diffuse_ibl', priority: 100, variantKey: source.variantKey, uniforms,
            apply(shader) {
                if (THREE.REVISION !== '183' || !shader.fragmentShader.includes(ENVIRONMENT)
                    || !shader.fragmentShader.includes(MAPS)) throw new Error('Calibrated diffuse IBL shader contract changed');
                const maps = THREE.ShaderChunk.lights_fragment_maps;
                if (!maps.includes('getIBLIrradiance')) throw new Error('Native diffuse IBL call is missing');
                shader.fragmentShader = shader.fragmentShader
                    .replace(ENVIRONMENT, ENVIRONMENT + '\n' + source.fragmentSource)
                    .replace(MAPS, maps.replaceAll('getIBLIrradiance', 'getCalibratedIBLIrradiance'));
                Object.assign(shader.uniforms, uniforms);
            }
        });
        binding = { uniforms, hook };
        bindings.set(material, binding);
        material.addEventListener('dispose', () => { hook.remove(); bindings.delete(material); });
    }
    binding.uniforms.calibratedDiffuseIblIntensity.value = active ? settings.envMapIntensity ?? 1 : -1;
}
