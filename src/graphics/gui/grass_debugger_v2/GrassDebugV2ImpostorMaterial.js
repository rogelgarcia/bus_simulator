// Relight runtime patch captures and restore source-surface depth on two-triangle proxies.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js?v=lod3-w-1';
import { grassImpostorParsShader, grassImpostorPositionShader, grassImpostorNormalShader, grassImpostorSurfaceShader, grassImpostorDepthShader, grassImpostorDirectionalShadowShader, grassImpostorSpotShadowShader, grassImpostorPointShadowShader, grassImpostorVisibilityShader, grassImpostorCoverageShader } from '../../shaders/materials/grass/GrassImpostorShaderLoader.js?v=lod3-runtime-transitions-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachGrassImpostorTransition } from './GrassDebugV2ImpostorTransitionMaterial.js';

/**
 * @typedef {{albedo:THREE.Texture,normal:THREE.Texture,surface:THREE.Texture,depth:THREE.Texture,
 * viewProjection:THREE.Matrix4,inverseViewProjection:THREE.Matrix4,center:THREE.Vector3,
 * right:THREE.Vector3,up:THREE.Vector3,forward:THREE.Vector3,width:number,height:number,resolution:number}} GrassImpostorCapture
 */

function assertCapture(capture) {
    for (const channel of ['albedo', 'normal', 'surface', 'depth']) {
        if (!capture?.[channel]?.isTexture) throw new Error('Grass impostor requires capture texture: ' + channel);
    }
    for (const key of ['viewProjection', 'inverseViewProjection']) {
        if (!capture[key]?.isMatrix4) throw new Error('Grass impostor requires capture matrix: ' + key);
    }
    for (const key of ['center', 'right', 'up', 'forward']) {
        if (!capture[key]?.isVector3) throw new Error('Grass impostor requires capture vector: ' + key);
    }
    if (![capture.width, capture.height, capture.resolution].every(value => Number.isFinite(value) && value > 0))
        throw new Error('Grass impostor requires positive capture dimensions and resolution.');
}

function replace(shader, stage, anchor, replacement) {
    if (!shader[stage].includes(anchor)) throw new Error('Grass impostor shader contract changed: ' + anchor);
    shader[stage] = shader[stage].replace(anchor, replacement);
}

/** @param {{sourceMaterial:THREE.MeshStandardMaterial,capture:GrassImpostorCapture,shadowUniforms?:object}} options */
export function createGrassDebugV2ImpostorMaterial({ sourceMaterial, capture, shadowUniforms }) {
    if (!sourceMaterial?.isMeshStandardMaterial) throw new Error('Grass impostor requires a standard grass source material.');
    assertCapture(capture);
    const uniforms = {
        grassImpostorAlbedo: { value: capture.albedo }, grassImpostorNormal: { value: capture.normal },
        grassImpostorSurface: { value: capture.surface }, grassImpostorDepth: { value: capture.depth },
        grassImpostorViewProjection: { value: capture.viewProjection.clone() },
        grassImpostorInverseViewProjection: { value: capture.inverseViewProjection.clone() },
        grassImpostorCaptureCenter: { value: capture.center.clone() },
        grassImpostorRight: { value: capture.right.clone() }, grassImpostorUp: { value: capture.up.clone() },
        grassImpostorForward: { value: capture.forward.clone() },
        grassImpostorSize: { value: new THREE.Vector2(capture.width + .12, capture.height + .12) },
        grassImpostorResolution: { value: capture.resolution },
        grassCanopyShadowVisibility: shadowUniforms?.grassCanopyShadowVisibility ?? { value: null },
        grassCanopyShadowBounds: shadowUniforms?.grassCanopyShadowBounds ?? { value: new THREE.Vector4() },
        grassCanopyShadowPass: shadowUniforms?.grassCanopyShadowPass ?? { value: 0 }
    };
    const material = createGrassDebugV2Material({
        color: 0xffffff, roughness: 1, metalness: sourceMaterial.metalness,
        side: THREE.FrontSide, transparent: false, alphaTest: 0.5, alphaToCoverage: true,
        envMap: sourceMaterial.envMap, envMapIntensity: sourceMaterial.envMapIntensity,
        toneMapped: sourceMaterial.toneMapped, fog: sourceMaterial.fog,
        defines: { GRASS_LEAF_TRANSLUCENCY: 1, GRASS_RIBBON_CARD: 1 }
    });
    material.name = 'GrassV2RuntimeImpostor';
    material.envMapRotation.copy(sourceMaterial.envMapRotation);
    const payloads = [grassImpostorParsShader, grassImpostorPositionShader, grassImpostorNormalShader,
        grassImpostorSurfaceShader, grassImpostorDepthShader, grassImpostorDirectionalShadowShader,
        grassImpostorSpotShadowShader, grassImpostorPointShadowShader, grassImpostorVisibilityShader, grassImpostorCoverageShader];
    payloads.forEach(payload => attachShaderMetadata(material, payload));
    registerMaterialShaderHook(material, {
        id: 'grass.runtime-impostor', priority: 20, uniforms,
        variantKey: payloads.map(payload => payload.variantKey).join('|'),
        apply: shader => {
            Object.assign(shader.uniforms, uniforms);
            replace(shader, 'vertexShader', '#include <common>', '#include <common>\n' + grassImpostorParsShader.vertexSource);
            replace(shader, 'vertexShader', '#include <beginnormal_vertex>', grassImpostorNormalShader.vertexSource);
            replace(shader, 'vertexShader', '#include <begin_vertex>', grassImpostorPositionShader.vertexSource);
            replace(shader, 'fragmentShader', '#include <common>', '#include <common>\n' + grassImpostorParsShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <map_fragment>', grassImpostorPositionShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <alphatest_fragment>', grassImpostorCoverageShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <roughnessmap_fragment>', grassImpostorSurfaceShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <normal_fragment_maps>', grassImpostorNormalShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + grassImpostorVisibilityShader.fragmentSource);
            replace(shader, 'fragmentShader', '#include <opaque_fragment>', grassImpostorDepthShader.fragmentSource + '\n#include <opaque_fragment>');
            let lights = THREE.ShaderChunk.lights_fragment_begin.replaceAll('vViewPosition', 'grassImpostorViewPosition');
            lights = lights.replaceAll('vDirectionalShadowCoord[ i ]', grassImpostorDirectionalShadowShader.fragmentSource.trim())
                .replaceAll('vSpotLightCoord[ i ]', grassImpostorSpotShadowShader.fragmentSource.trim())
                .replaceAll('vPointShadowCoord[ i ]', grassImpostorPointShadowShader.fragmentSource.trim());
            replace(shader, 'fragmentShader', '#include <lights_fragment_begin>', lights);
        }
    });
    attachGrassImpostorTransition(material, { cards: true });
    /** @param {GrassImpostorCapture} next */
    function updateCapture(next) {
        assertCapture(next);
        uniforms.grassImpostorAlbedo.value = next.albedo; uniforms.grassImpostorNormal.value = next.normal;
        uniforms.grassImpostorSurface.value = next.surface; uniforms.grassImpostorDepth.value = next.depth;
        uniforms.grassImpostorViewProjection.value.copy(next.viewProjection);
        uniforms.grassImpostorInverseViewProjection.value.copy(next.inverseViewProjection);
        uniforms.grassImpostorCaptureCenter.value.copy(next.center);
        uniforms.grassImpostorRight.value.copy(next.right); uniforms.grassImpostorUp.value.copy(next.up);
        uniforms.grassImpostorForward.value.copy(next.forward);
        uniforms.grassImpostorSize.value.set(next.width + .12, next.height + .12); uniforms.grassImpostorResolution.value = next.resolution;
    }
    return Object.freeze({ material, updateCapture, dispose: () => material.dispose() });
}
