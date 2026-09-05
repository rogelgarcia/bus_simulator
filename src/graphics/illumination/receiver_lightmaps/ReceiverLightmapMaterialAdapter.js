// Adds independent linear diffuse terms while retaining the live PBR and shadow lobes.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { getReceiverLightmapShaderPayload } from '../../shaders/materials/ReceiverLightmapShaderLoader.js';
import { STATIC_SUN_DEPTH_DIRECT_ANCHOR as ANCHOR } from '../static_sun_depth/StaticSunDepthShaderContract.js';

const sources = getReceiverLightmapShaderPayload();
const { indirect, direct } = sources;
const HOOK = 'illumination.receiver_lightmaps';
let bindingSerial = 0;

/** @param {any} shader @param {Record<string, {value: any}>} uniforms */
export function patchReceiverLightmapShader(shader, uniforms) {
    if (THREE.REVISION !== '183') throw new Error('Receiver lightmaps require the audited Three r183 shader contract.');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + sources.vertexSource)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + sources.vertexApply);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + sources.fragmentSource)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + indirect)
        .replace('#include <opaque_fragment>', sources.fragmentApply + '\n#include <opaque_fragment>');
    const hybrid = shader.fragmentShader.includes('void staticSunDepthApplyDirectional(');
    if (hybrid) {
        const begin = shader.fragmentShader.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
        const end = shader.fragmentShader.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 )', begin);
        if (begin < 0 || end < begin) throw new Error('Receiver direct-light shader anchors changed.');
        const chunk = shader.fragmentShader.slice(begin, end);
        if (!chunk.includes(ANCHOR)) throw new Error('Receiver direct-light call is absent.');
        shader.fragmentShader = '#define RECEIVER_ATLAS_HYBRID_SUN\n' + shader.fragmentShader.slice(0, begin)
            + chunk.replaceAll(ANCHOR, direct) + shader.fragmentShader.slice(end);
    }
    Object.assign(shader.uniforms, uniforms);
}

/**
 * @param {{objects: Array<{id: string, referenceCount: number, base: number, instances?: Array<unknown>}>}} mapping
 * @param {Map<string, any>} references
 * @param {Record<string, {value: any}>} uniforms
 */
export function installReceiverLightmapBindings(mapping, references, uniforms) {
    const materials = new Set();
    const geometries = [];
    const hooks = [];
    const variantKey = sources.variantKey + ':binding-' + (++bindingSerial);
    function restore() {
        for (const entry of geometries) { if (entry.object.geometry === entry.geometry) entry.object.geometry = entry.original; entry.geometry.dispose(); }
        for (const entry of hooks) { entry.registration?.remove(); entry.material.defaultAttributeValues = entry.defaults; }
    }
    try {
        for (const record of mapping.objects) {
            const object = references.get(record.id);
            if (!object?.geometry) throw new Error('Missing live receiver ' + record.id);
            const original = object.geometry;
            const geometry = original.index ? original.toNonIndexed() : original.clone();
            geometries.push({ object, original, geometry });
            if (geometry.attributes.position.count !== record.referenceCount) throw new Error('Receiver geometry reference count changed: ' + record.id);
            geometry.setAttribute('receiverAtlasVertex', new THREE.Float32BufferAttribute(
                Float32Array.from({ length: record.referenceCount }, (_, i) => record.base + i), 1));
            if (object.isInstancedMesh) {
                if (object.count !== record.instances.length) throw new Error('Receiver instance count changed: ' + record.id);
                geometry.setAttribute('receiverAtlasInstance', new THREE.InstancedBufferAttribute(
                    Float32Array.from({ length: object.count }, (_, i) => i * record.referenceCount), 1));
            }
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material.isMeshStandardMaterial) materials.add(material);
            }
        }
        for (const material of materials) {
            const defaults = material.defaultAttributeValues;
            const entry = { material, defaults, registration: null };
            hooks.push(entry);
            material.defaultAttributeValues = { ...defaults, receiverAtlasVertex: [0], receiverAtlasInstance: [0] };
            const registration = registerMaterialShaderHook(material, { id: HOOK, priority: 300, variantKey,
                apply: (shader) => patchReceiverLightmapShader(shader, uniforms) });
            entry.registration = registration;
        }
        for (const entry of geometries) entry.object.geometry = entry.geometry;
        return { restore, geometries };
    } catch (error) { restore(); throw error; }
}
