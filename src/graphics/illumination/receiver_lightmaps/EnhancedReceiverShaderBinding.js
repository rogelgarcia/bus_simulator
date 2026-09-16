// Shares the exact receiver shader recipe between isolated compilation and live bindings.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { enhancedReceiverShaders as source } from '../../shaders/materials/EnhancedReceiverShaderLoader.js';
import { STATIC_SUN_DEPTH_DIRECT_ANCHOR as ANCHOR } from '../static_sun_depth/StaticSunDepthShaderContract.js';

/** @param {any} material @param {any} mapping
 * @param {Record<string, {value:any}>} uniforms @param {boolean} flatNormal */
export function registerEnhancedReceiverShader(material, mapping, uniforms, flatNormal) {
    return registerMaterialShaderHook(material, { id: 'illumination.receiver_lightmaps', priority: 300,
        variantKey: source.variantKey + ':' + String(mapping.profile.directional ?? 'scalar') + ':' + String(mapping.profile.coefficientLayout ?? 'rgb-coefficients') + ':' + String(mapping.profile.directRepresentation ?? 'atlas') + ':' + flatNormal,
        apply(shader) {
            if (THREE.REVISION !== '183') throw new Error('Enhanced receiver shader requires audited Three r183');
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + source.vertex)
                .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + source.vertexApply);
            shader.fragmentShader = '#define RECEIVER_DIRECT_LAYERS 24\n#define RECEIVER_INDIRECT_LAYERS 24\n'
                + (mapping.profile.directional ? '#define RECEIVER_DIRECTIONAL\n' : '')
                + (mapping.profile.directRepresentation === 'hybrid-sun-visibility-v1' ? '#define RECEIVER_SHARED_SUN\n' : '')
                + (flatNormal ? '#define RECEIVER_FLAT_NORMAL\n' : '')
                + (mapping.profile.coefficientLayout === 'flat-first-rgb-v1' ? '#define RECEIVER_FLAT_FIRST\n' : '') + shader.fragmentShader;
            const prepareAnchor = '#include <clearcoat_normal_fragment_begin>';
            if (!shader.fragmentShader.includes(prepareAnchor)) throw new Error('Enhanced receiver preparation anchor missing');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + source.fragment)
                .replace(prepareAnchor, source.prepare + '\n' + prepareAnchor)
                .replace('#include <lights_fragment_end>', THREE.ShaderChunk.lights_fragment_end.replace(/RE_IndirectDiffuse\s*\([^;]+;/, source.ambient) + '\n' + source.indirect)
                .replace('#include <opaque_fragment>', source.fragmentApply + '\n#include <opaque_fragment>');
            if (shader.fragmentShader.includes('void staticSunDepthApplyDirectional(')) {
                if (!shader.fragmentShader.includes(ANCHOR)) throw new Error('Enhanced direct-light shader anchor missing');
                shader.fragmentShader = '#define RECEIVER_ATLAS_HYBRID_SUN\n' + shader.fragmentShader.replaceAll(ANCHOR, source.direct);
            }
            Object.assign(shader.uniforms, { receiverLightingBlend: { value: 1 } }, uniforms);
        }
    });
}
