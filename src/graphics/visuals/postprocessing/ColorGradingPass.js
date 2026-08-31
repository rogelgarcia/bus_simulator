// Final display transform: tone mapping, display-referred 3D LUT, then output encoding.
// @ts-check

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { createPostProcessingOutputShaderPayload } from '../../shaders/postprocessing/PostProcessingOutputShader.js';

export function createColorGradingOutputPass() {
    const payload = createPostProcessingOutputShaderPayload();
    const pass = new ShaderPass({
        uniforms: THREE.UniformsUtils.clone(payload.uniforms),
        vertexShader: payload.vertexSource,
        fragmentShader: payload.fragmentSource
    });
    if (pass.material) {
        attachShaderMetadata(pass.material, payload, 'postprocessing-display-output');
        pass.material.toneMapped = true;
        pass.material.needsUpdate = true;
    }
    return pass;
}

export function setColorGradingOutputState(pass, { lutTexture = null, intensity = 0 } = {}) {
    const p = pass && typeof pass === 'object' ? pass : null;
    if (!p?.uniforms) return;

    const rawIntensity = Number(intensity);
    const strength = Number.isFinite(rawIntensity)
        ? Math.max(0, Math.min(1, rawIntensity))
        : 0;
    const image = lutTexture?.image ?? null;
    const size = Number(image?.width) || Number(image?.depth) || 2;

    p.uniforms.tLut.value = lutTexture ?? null;
    p.uniforms.uColorGradingIntensity.value = strength;
    p.uniforms.uLutSize.value = Math.max(2, size);
    p.uniforms.uEnableColorGrading.value = lutTexture && strength > 0 ? 1 : 0;
}
