// src/graphics/visuals/postprocessing/ColorGradingPass.js
// 3D LUT color grading post-processing pass (WebGL2).
// @ts-check

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GRADING_SHADER = Object.freeze({
    uniforms: {
        tDiffuse: { value: null },
        tLut: { value: null },
        intensity: { value: 0 }
    },
    vertexShader: `
out vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`,
    fragmentShader: `
precision highp float;
precision highp sampler3D;

uniform sampler2D tDiffuse;
uniform sampler3D tLut;
uniform float intensity;

in vec2 vUv;
out vec4 outColor;

vec3 applyLut(vec3 rgb) {
    vec3 uvw = clamp(rgb, 0.0, 1.0);
    return texture(tLut, uvw).rgb;
}

void main() {
    vec4 base = texture(tDiffuse, vUv);
    vec3 src = clamp(base.rgb, 0.0, 1.0);
    vec3 graded = applyLut(src);
    float k = clamp(intensity, 0.0, 1.0);
    outColor = vec4(mix(src, graded, k), base.a);
}
`
});

export function createColorGradingPass() {
    const pass = new ShaderPass({
        uniforms: THREE.UniformsUtils.clone(GRADING_SHADER.uniforms),
        vertexShader: GRADING_SHADER.vertexShader,
        fragmentShader: GRADING_SHADER.fragmentShader
    });
    pass.enabled = false;
    if (pass.material) {
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
