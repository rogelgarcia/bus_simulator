// 3D LUT color grading post-processing pass (WebGL2).
// @ts-check

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createColorGradingShaderPayload } from '../../shaders/postprocessing/ColorGradingShader.js';

export function createColorGradingPass() {
    const payload = createColorGradingShaderPayload();
    const pass = new ShaderPass({
        uniforms: THREE.UniformsUtils.clone(payload.uniforms),
        vertexShader: payload.vertexSource,
        fragmentShader: payload.fragmentSource
    });
    pass.enabled = false;
    if (pass.material) {
        attachShaderMetadata(pass.material, payload, 'postprocessing-color-grading');
        pass.material.glslVersion = THREE.GLSL3;
        pass.material.needsUpdate = true;
    }
    return pass;
}

export function setColorGradingPassState(pass, { lutTexture = null, intensity = 0 } = {}) {
    const p = pass && typeof pass === 'object' ? pass : null;
    if (!p?.uniforms) return;
    p.uniforms.tLut.value = lutTexture ?? null;
    p.uniforms.intensity.value = Number.isFinite(Number(intensity)) ? Number(intensity) : 0;
    p.enabled = !!lutTexture && (p.uniforms.intensity.value > 0);
}
