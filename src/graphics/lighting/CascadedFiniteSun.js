// Finite angular sunlight with each cascade's native orthographic depth and world scale.
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../shaders/core/MaterialShaderHookRegistry.js';
import { loadShaderSourceSet, createShaderPayload } from '../shaders/core/ShaderLoader.js';
import { createFiniteSunShadowShader } from '../shaders/lighting/FiniteSunShadowShader.js';

const sources = await loadShaderSourceSet({
    vertexPath: 'lighting/finite_sun_shadow.vert.glsl',
    fragmentPath: 'lighting/cascaded_finite_sun.frag.glsl'
});
const payload = createShaderPayload({ shaderId: 'lighting/cascaded_finite_sun', sourceSet: sources });

export class CascadedFiniteSun {
    constructor(csm, diameterDegrees) {
        this.csm = csm;
        this.tangent = Math.tan(THREE.MathUtils.degToRad(diameterDegrees) / 2);
        this.uniforms = { cityFiniteSunGeometry: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) } };
        this.update();
    }

    update() {
        this.csm.lights.forEach((light, i) => {
            const camera = light.shadow.camera;
            this.uniforms.cityFiniteSunGeometry.value[i].set(
                camera.zoom / (camera.right - camera.left), camera.zoom / (camera.top - camera.bottom),
                camera.far - camera.near, this.tangent
            );
        });
    }

    attach(material) {
        const finite = createFiniteSunShadowShader();
        return registerMaterialShaderHook(material, {
            id: 'city.finite_sun', priority: 250, variantKey: payload.variantKey + finite.variantKey,
            uniforms: this.uniforms,
            apply: shader => {
                const anchor = '#include <shadowmap_pars_fragment>';
                const lighting = '#include <lights_fragment_begin>';
                const call = 'getShadow( directionalShadowMap[ i ],';
                if (!shader.fragmentShader.includes(anchor)) throw new Error('Finite cascaded sun shader contract changed');
                let fragment = shader.fragmentShader.replace(lighting, THREE.ShaderChunk.lights_fragment_begin);
                // A static-depth adapter can already own all directional visibility during transition.
                if (!fragment.includes(call)) return;
                Object.assign(shader.uniforms, this.uniforms);
                fragment = fragment.replace(anchor, anchor + '\n#define FINITE_SUN_BLOCKER_SAMPLES 8\n#define FINITE_SUN_FILTER_SAMPLES 16\n'
                    + payload.fragmentSource + '\n' + finite.fragmentSource);
                shader.fragmentShader = fragment.replaceAll(call,
                    'getFiniteSunShadowForGeometry( cityFiniteSunGeometry[ i ], directionalShadowMap[ i ],');
            }
        });
    }
}
