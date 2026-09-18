// Binds one validated static receiver; stale profiles restore ordinary pane shadows.
// @ts-check
import * as THREE from 'three';
import { thinGlassProfileKey, validateThinGlassBake } from '../../../app/illumination/ThinGlassTransport.js';
import { registerMaterialShaderHook, getMaterialShaderHookRegistrySnapshot } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { thinGlassTransportShaders as sources } from '../../shaders/materials/ThinGlassTransportShaderLoader.js';

/** @param {{bake:any, profile:any, receiver:any, panes:any[], scene:any, offset?:number[]}} options */
export function bindThinGlassTransport({ bake, profile, receiver, panes, scene, offset = [0, 0] }) {
    validateThinGlassBake(bake, profile);
    if (!receiver?.isMesh || !receiver.material?.isMeshStandardMaterial || Array.isArray(receiver.material)
        || receiver.material.transparent || receiver.material.opacity !== 1 || receiver.material.transmission
        || receiver.material.clearcoat || receiver.material.userData?.receiverLightmapUniforms) {
        throw new Error('Thin-glass receiver must be an unmapped opaque standard material without clearcoat');
    }
    if (getMaterialShaderHookRegistrySnapshot(receiver.material).hooks.some(hook => /receiver/.test(hook.id))) throw new Error('Receiver already has a baked-light owner');
    if (!scene?.isScene) throw new Error('Thin-glass binding requires its scene lighting inventory');
    scene.traverse(object => {
        if (object.isLight && !object.isDirectionalLight && !object.isHemisphereLight && !object.isAmbientLight) throw new Error('Thin-glass receiver supports a directional sun only');
    });
    if (panes.length !== profile.panes.length || panes.some(pane => !pane?.isMesh)) throw new Error('Glass caster inventory mismatch');
    const pixels = new Float32Array(bake.width * bake.height * 4);
    for (let i = 0; i < bake.width * bake.height; i++) pixels.set([...bake.data.slice(i * 3, i * 3 + 3), 1], i * 4);
    const texture = new THREE.DataTexture(pixels, bake.width, bake.height, THREE.RGBAFormat, THREE.FloatType);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const bounds = profile.receiver.bounds;
    const uniforms = { thinGlassMap: { value: texture }, thinGlassEnabled: { value: 0 },
        thinGlassBounds: { value: new THREE.Vector4(bounds[0] + offset[0], bounds[1] + offset[1], bounds[2] + offset[0], bounds[3] + offset[1]) } };
    const originalShadows = panes.map(pane => pane.castShadow);
    let status = 'disabled';
    const registration = registerMaterialShaderHook(receiver.material, {
        id: 'illumination.thin_glass_transport', priority: 95,
        variantKey: sources.declarations.variantKey + sources.apply.variantKey, uniforms,
        apply(shader) {
            Object.assign(shader.uniforms, uniforms);
            const anchor = '#include <lights_fragment_end>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Thin glass direct-light anchor changed');
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + sources.declarations.vertexSource)
                .replace('#include <project_vertex>', sources.apply.vertexSource + '\n#include <project_vertex>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + sources.declarations.fragmentSource)
                .replace(anchor, anchor + '\n' + sources.apply.fragmentSource);
        }
    });
    const update = (current, enabled = true) => {
        let valid = false;
        try { valid = thinGlassProfileKey(current) === bake.profileKey; } catch { valid = false; }
        const active = valid && enabled;
        uniforms.thinGlassEnabled.value = active ? 1 : 0;
        panes.forEach((pane, i) => { pane.castShadow = active ? false : originalShadows[i]; });
        status = !valid ? 'stale-profile-opaque-shadow-fallback' : active ? 'active' : 'disabled';
        return status;
    };
    update(profile);
    return Object.freeze({ update, getStatus: () => status, textureBytes: pixels.byteLength,
        dispose() { registration.remove(); texture.dispose(); panes.forEach((pane, i) => { pane.castShadow = originalShadows[i]; }); } });
}
