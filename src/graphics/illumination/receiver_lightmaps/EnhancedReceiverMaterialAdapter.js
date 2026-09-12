// Applies directional diffuse lightmaps while retaining indexed geometry where coordinates agree.
// @ts-check
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { enhancedReceiverShaders as source } from '../../shaders/materials/EnhancedReceiverShaderLoader.js';
import { STATIC_SUN_DEPTH_DIRECT_ANCHOR as ANCHOR } from '../static_sun_depth/StaticSunDepthShaderContract.js';
import { hasFlatReceiverNormals } from './EnhancedReceiverFlatNormals.js';
import { bindReceiverUniforms } from './ReceiverUniformBinding.js';
import { omitPartialReceiverSurfaces } from './EnhancedReceiverCoverage.js';
import { repairEnhancedReceiverCoplanarGeometry } from './EnhancedReceiverCoplanarGeometry.js';

/** @param {any} mapping @param {Map<string, any>} references
 * @param {Record<string, {value: any}>} uniforms @param {Float32Array} coordinates */
export function installEnhancedReceiverBindings(mapping, references, uniforms, coordinates) {
    const preparation = prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates);
    let result; do { result = preparation.next(); } while (!result.done);
    return result.value;
}

/** @param {any} mapping @param {Map<string, any>} references @param {any} uniforms
 * @param {Float32Array} coordinates @param {AbortSignal} signal */
export async function installEnhancedReceiverBindingsAsync(mapping, references, uniforms, coordinates, signal) {
    const preparation = prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates);
    let started = performance.now();
    try {
        while (true) {
            signal.throwIfAborted();
            const result = preparation.next();
            if (result.done) return result.value;
            if (performance.now() - started >= 4) {
                await (globalThis.scheduler?.yield() ?? new Promise(resolve => setTimeout(resolve, 0)));
                started = performance.now();
            }
        }
    } catch (error) { preparation.throw(error); throw error; }
}

function* prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates) {
    const surface = mapping.profile.irradianceRepresentation === 'surface-diffuse-v1';
    const geometries = [], hooks = [], materials = new Set(), nonFlatMaterials = new Set();
    const coverage = { omittedTriangles: 0, boundObjects: 0, overlappingTriangles: 0, removedOverlapArea: 0 };
    function restore() {
        for (const item of geometries) { if (item.object.geometry === item.geometry) item.object.geometry = item.original; item.geometry.dispose(); }
        for (const item of hooks) {
            item.registration?.remove(); item.material.defaultAttributeValues = item.defaults;
            item.restoreUniforms();
        }
    }
    try {
        for (const record of mapping.objects) {
            const object = references.get(record.id), original = object?.geometry;
            if (!original) throw new Error('Missing enhanced receiver ' + record.id);
            const localCoordinates = object.isInstancedMesh ? null
                : coordinates.slice(record.base * 4, (record.base + record.referenceCount) * 4);
            const omittedTriangles = localCoordinates && !surface ? omitPartialReceiverSurfaces(original, localCoordinates) : 0;
            coverage.omittedTriangles += omittedTriangles;
            if (localCoordinates && !localCoordinates.some((value, i) => i % 4 === 3 && value > .5)) continue;
            if (!surface && !hasFlatReceiverNormals(object, record, coordinates)) {
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) nonFlatMaterials.add(material);
            }
            let indexedCoordinates = null;
            if (original.index && !object.isInstancedMesh) {
                const count = original.attributes.position.count;
                indexedCoordinates = new Float32Array(count * 4);
                const assigned = new Uint8Array(count);
                for (let i = 0; i < record.referenceCount; i++) {
                    const vertex = original.index.getX(i), offset = i * 4;
                    if (assigned[vertex]) {
                        if ([0, 1, 2, 3].some((c) => indexedCoordinates[vertex * 4 + c] !== localCoordinates[offset + c])) { indexedCoordinates = null; break; }
                    } else { indexedCoordinates.set(localCoordinates.subarray(offset, offset + 4), vertex * 4); assigned[vertex] = 1; }
                }
            }
            let geometry = original.index && !indexedCoordinates ? original.toNonIndexed() : original.clone();
            if (object.isInstancedMesh) {
                if (object.count !== record.instances.length) throw new Error('Enhanced receiver instance inventory changed');
                geometry.setAttribute('receiverAtlasVertex', new THREE.Float32BufferAttribute(Float32Array.from({ length: record.referenceCount }, (_, i) => record.base + i), 1));
                geometry.setAttribute('receiverAtlasInstance', new THREE.InstancedBufferAttribute(Float32Array.from({ length: object.count }, (_, i) => i * record.referenceCount), 1));
            } else {
                geometry.setAttribute('receiverAtlasCoordinate', new THREE.Float32BufferAttribute(indexedCoordinates
                    ?? localCoordinates, 4));
            }
            if(surface && !object.isInstancedMesh) {
                const repaired=repairEnhancedReceiverCoplanarGeometry(geometry,original,mapping);
                geometry=repaired.geometry;coverage.overlappingTriangles+=repaired.overlappingTriangles;
                coverage.removedOverlapArea+=repaired.removedArea;
            }
            geometries.push({ object, original, geometry, omittedTriangles });
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.isMeshStandardMaterial) materials.add(material);
            yield;
        }
        for (const material of materials) {
            const flatNormal = surface || (!nonFlatMaterials.has(material) && !material.normalMap && !material.bumpMap && material.side === THREE.FrontSide);
            const defaults = material.defaultAttributeValues;
            const item = { material, defaults, registration: null, restoreUniforms: bindReceiverUniforms(material, uniforms) }; hooks.push(item);
            material.defaultAttributeValues = { ...defaults, receiverAtlasVertex: [0], receiverAtlasInstance: [0], receiverAtlasCoordinate: [0, 0, 0, 0] };
            item.registration = registerMaterialShaderHook(material, { id: 'illumination.receiver_lightmaps', priority: 300,
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
        for (const item of geometries) item.object.geometry = item.geometry;
        coverage.boundObjects = geometries.length;
        return { geometries, restore, coverage };
    } catch (error) { restore(); throw error; }
}
