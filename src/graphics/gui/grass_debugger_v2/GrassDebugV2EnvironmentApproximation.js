// Capture six broad HDR lobes once and borrow them for cheap distant grass lighting.
// @ts-check
import * as THREE from 'three';
import { cloneMaterialShaderContract, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassEnvironmentProbeShader as probe, grassEnvironmentApproximationShader as approximate } from '../../shaders/materials/grass/GrassEnvironmentShaderLoader.js';

export function captureGrassEnvironmentLobes(renderer, environment) {
    if (!environment?.isTexture || environment.mapping !== THREE.CubeUVReflectionMapping) throw new Error('Grass environment approximation requires the scene PMREM texture.');
    const height = environment.image.height, maxMip = Math.log2(height) - 2;
    const material = new THREE.ShaderMaterial({ vertexShader: probe.vertexSource, fragmentShader: probe.fragmentSource,
        uniforms: { envMap: { value: environment } }, depthTest: false, depthWrite: false,
        defines: { ENVMAP_TYPE_CUBE_UV: '', CUBEUV_TEXEL_WIDTH: (1 / (3 * Math.max(2 ** maxMip, 112))).toPrecision(12), CUBEUV_TEXEL_HEIGHT: (1 / height).toPrecision(12), CUBEUV_MAX_MIP: maxMip.toFixed(1) } });
    attachShaderMetadata(material, probe);
    const target = new THREE.WebGLRenderTarget(6, 1, { type: THREE.FloatType, depthBuffer: false });
    const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const previous = renderer.getRenderTarget(), pixels = new Float32Array(24);
    try {
        renderer.setRenderTarget(target); renderer.render(scene, new THREE.Camera()); renderer.readRenderTargetPixels(target, 0, 0, 6, 1, pixels);
        if (pixels.some(value => !Number.isFinite(value)) || !pixels.some(value => value > 0)) throw new Error('Invalid HDR grass environment probe.');
        return Array.from({ length: 6 }, (_, i) => new THREE.Vector3().fromArray(pixels, i * 4));
    } finally { renderer.setRenderTarget(previous); geometry.dispose(); material.dispose(); target.dispose(); }
}

export function createGrassEnvironmentApproximation(source, lobes) {
    const material = cloneMaterialShaderContract(source), uniforms = { grassEnvironmentLobes: { value: lobes } };
    attachShaderMetadata(material, approximate);
    registerMaterialShaderHook(material, { id: 'grass.environment-approximation', priority: 210, variantKey: approximate.variantKey, uniforms,
        apply(shader) {
            const anchor = '#include <envmap_physical_pars_fragment>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Grass environment shader anchor changed.');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, approximate.fragmentSource); Object.assign(shader.uniforms, uniforms);
        } });
    return Object.freeze({ material, dispose: () => material.dispose() });
}
