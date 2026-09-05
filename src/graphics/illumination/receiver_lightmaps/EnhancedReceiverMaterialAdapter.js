// Applies directional diffuse lightmaps while retaining indexed geometry where coordinates agree.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { enhancedReceiverShaders as source } from '../../shaders/materials/EnhancedReceiverShaderLoader.js';
import { STATIC_SUN_DEPTH_DIRECT_ANCHOR as ANCHOR } from '../static_sun_depth/StaticSunDepthShaderContract.js';
import { hasFlatReceiverNormals } from './EnhancedReceiverFlatNormals.js';

/** @param {any} mapping @param {Map<string, any>} references
 * @param {Record<string, {value: any}>} uniforms @param {Float32Array} coordinates */
export function installEnhancedReceiverBindings(mapping, references, uniforms, coordinates) {
    const geometries = [], hooks = [], materials = new Set(), nonFlatMaterials = new Set();
    function restore() {
        for (const item of geometries) { if (item.object.geometry === item.geometry) item.object.geometry = item.original; item.geometry.dispose(); }
        for (const item of hooks) {
            item.registration?.remove(); item.material.defaultAttributeValues = item.defaults;
            if (item.material.onBeforeRender === item.render) {
                if (item.hadRender) item.material.onBeforeRender = item.previousRender;
                else delete item.material.onBeforeRender;
            }
        }
    }
    try {
        for (const record of mapping.objects) {
            const object = references.get(record.id), original = object?.geometry;
            if (!original) throw new Error('Missing enhanced receiver ' + record.id);
            if (!hasFlatReceiverNormals(object, record, coordinates)) {
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) nonFlatMaterials.add(material);
            }
            let indexedCoordinates = null;
            if (original.index && !object.isInstancedMesh) {
                const count = original.attributes.position.count;
                indexedCoordinates = new Float32Array(count * 4);
                const assigned = new Uint8Array(count);
                for (let i = 0; i < record.referenceCount; i++) {
                    const vertex = original.index.getX(i), offset = (record.base + i) * 4;
                    if (assigned[vertex]) {
                        if ([0, 1, 2, 3].some((c) => indexedCoordinates[vertex * 4 + c] !== coordinates[offset + c])) { indexedCoordinates = null; break; }
                    } else { indexedCoordinates.set(coordinates.subarray(offset, offset + 4), vertex * 4); assigned[vertex] = 1; }
                }
            }
            const geometry = original.index && !indexedCoordinates ? original.toNonIndexed() : original.clone();
            if (object.isInstancedMesh) {
                if (object.count !== record.instances.length) throw new Error('Enhanced receiver instance inventory changed');
                geometry.setAttribute('receiverAtlasVertex', new THREE.Float32BufferAttribute(Float32Array.from({ length: record.referenceCount }, (_, i) => record.base + i), 1));
                geometry.setAttribute('receiverAtlasInstance', new THREE.InstancedBufferAttribute(Float32Array.from({ length: object.count }, (_, i) => i * record.referenceCount), 1));
            } else {
                geometry.setAttribute('receiverAtlasCoordinate', new THREE.Float32BufferAttribute(indexedCoordinates
                    ?? coordinates.slice(record.base * 4, (record.base + record.referenceCount) * 4), 4));
            }
            geometries.push({ object, original, geometry });
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.isMeshStandardMaterial) materials.add(material);
        }
        for (const material of materials) {
            const flatNormal = !nonFlatMaterials.has(material) && !material.normalMap && !material.bumpMap && material.side === THREE.FrontSide;
            const defaults = material.defaultAttributeValues;
            const item = { material, defaults, registration: null, hadRender: Object.hasOwn(material, 'onBeforeRender'),
                previousRender: material.onBeforeRender, render: null }; hooks.push(item);
            item.render = function (renderer, ...args) {
                item.previousRender.call(material, renderer, ...args);
                // Three r183 caches programs but keeps one uniform table per material.
                // A cached program may therefore still point at the legacy bank's table.
                const properties = renderer.properties.get(material);
                if (properties.uniforms && properties.uniforms.receiverAtlasEnabled !== uniforms.receiverAtlasEnabled) {
                    Object.assign(properties.uniforms, uniforms);
                    properties.uniformsList = null;
                }
            };
            material.onBeforeRender = item.render;
            material.defaultAttributeValues = { ...defaults, receiverAtlasVertex: [0], receiverAtlasInstance: [0], receiverAtlasCoordinate: [0, 0, 0, 0] };
            item.registration = registerMaterialShaderHook(material, { id: 'illumination.receiver_lightmaps', priority: 300,
                variantKey: source.variantKey + ':' + String(mapping.profile.directional ?? 'scalar') + ':' + String(mapping.profile.coefficientLayout ?? 'rgb-coefficients') + ':' + flatNormal,
                apply(shader) {
                    if (THREE.REVISION !== '183') throw new Error('Enhanced receiver shader requires audited Three r183');
                    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + source.vertex)
                        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + source.vertexApply);
                    shader.fragmentShader = '#define RECEIVER_DIRECT_LAYERS 24\n#define RECEIVER_INDIRECT_LAYERS 24\n'
                        + (mapping.profile.directional ? '#define RECEIVER_DIRECTIONAL\n' : '')
                        + (flatNormal ? '#define RECEIVER_FLAT_NORMAL\n' : '')
                        + (mapping.profile.coefficientLayout === 'flat-first-rgb-v1' ? '#define RECEIVER_FLAT_FIRST\n' : '') + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + source.fragment)
                        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + source.prepare)
                        .replace('#include <lights_fragment_end>', THREE.ShaderChunk.lights_fragment_end.replace(/RE_IndirectDiffuse\s*\([^;]+;/, source.ambient) + '\n' + source.indirect)
                        .replace('#include <opaque_fragment>', source.fragmentApply + '\n#include <opaque_fragment>');
                    if (shader.fragmentShader.includes('void staticSunDepthApplyDirectional(')) {
                        if (!shader.fragmentShader.includes(ANCHOR)) throw new Error('Enhanced direct-light shader anchor missing');
                        shader.fragmentShader = '#define RECEIVER_ATLAS_HYBRID_SUN\n' + shader.fragmentShader.replaceAll(ANCHOR, source.direct);
                    }
                    Object.assign(shader.uniforms, uniforms);
                }
            });
        }
        for (const item of geometries) item.object.geometry = item.geometry;
        return { geometries, restore };
    } catch (error) { restore(); throw error; }
}
