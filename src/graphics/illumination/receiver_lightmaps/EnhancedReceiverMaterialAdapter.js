// Applies directional diffuse lightmaps while retaining indexed geometry where coordinates agree.
// @ts-check
import * as THREE from 'three';
import { registerEnhancedReceiverShader } from './EnhancedReceiverShaderBinding.js';
import { hasFlatReceiverNormals } from './EnhancedReceiverFlatNormals.js';
import { bindReceiverUniforms } from './ReceiverUniformBinding.js';
import { omitPartialReceiverSurfaces } from './EnhancedReceiverCoverage.js';
import { prepareEnhancedReceiverCoplanarGeometry } from './EnhancedReceiverCoplanarGeometry.js';

/** @param {any} mapping @param {Map<string, any>} references
 * @param {Record<string, {value: any}>} uniforms @param {Float32Array} coordinates */
export function installEnhancedReceiverBindings(mapping, references, uniforms, coordinates) {
    const preparation = prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates);
    let result; do { result = preparation.next(); } while (!result.done);
    return result.value;
}

/** @param {any} mapping @param {Map<string, any>} references @param {any} uniforms
 * @param {Float32Array} coordinates @param {AbortSignal} signal */
export async function installEnhancedReceiverBindingsAsync(mapping, references, uniforms, coordinates, signal, cityInputs = null) {
    const preparation = prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates, cityInputs);
    let started = performance.now();
    let value;
    try {
        while (true) {
            signal.throwIfAborted();
            const result = preparation.next(value);
            value = undefined;
            if (result.done) return result.value;
            if (result.value instanceof Promise) value = await result.value;
            if (performance.now() - started >= 4) {
                await (globalThis.scheduler?.yield() ?? new Promise(resolve => setTimeout(resolve, 0)));
                started = performance.now();
            }
        }
    } catch (error) { preparation.throw(error); throw error; }
}

function* prepareEnhancedReceiverBindings(mapping, references, uniforms, coordinates, cityInputs = null) {
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
                    if (i % 1024 === 0) yield;
                    const vertex = original.index.getX(i), offset = i * 4;
                    if (assigned[vertex]) {
                        if ([0, 1, 2, 3].some((c) => indexedCoordinates[vertex * 4 + c] !== localCoordinates[offset + c])) { indexedCoordinates = null; break; }
                    } else { indexedCoordinates.set(localCoordinates.subarray(offset, offset + 4), vertex * 4); assigned[vertex] = 1; }
                }
            }
            let geometry = original.index && !indexedCoordinates ? original.toNonIndexed() : original.clone();
            // Own the private allocation before a resumable repair can be cancelled.
            const item = { object, original, geometry, omittedTriangles }; geometries.push(item);
            if (object.isInstancedMesh) {
                if (object.count !== record.instances.length) throw new Error('Enhanced receiver instance inventory changed');
                geometry.setAttribute('receiverAtlasVertex', new THREE.Float32BufferAttribute(Float32Array.from({ length: record.referenceCount }, (_, i) => record.base + i), 1));
                geometry.setAttribute('receiverAtlasInstance', new THREE.InstancedBufferAttribute(Float32Array.from({ length: object.count }, (_, i) => i * record.referenceCount), 1));
            } else {
                geometry.setAttribute('receiverAtlasCoordinate', new THREE.Float32BufferAttribute(indexedCoordinates
                    ?? localCoordinates, 4));
            }
            if(surface && !object.isInstancedMesh) {
                const repaired=yield* prepareEnhancedReceiverCoplanarGeometry(geometry,original,mapping,cityInputs);
                geometry=repaired.geometry;item.geometry=geometry;coverage.overlappingTriangles+=repaired.overlappingTriangles;
                coverage.removedOverlapArea+=repaired.removedArea;
            }
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material.isMeshStandardMaterial) materials.add(material);
            yield;
        }
        for (const material of materials) {
            const flatNormal = surface || (!nonFlatMaterials.has(material) && !material.normalMap && !material.bumpMap && material.side === THREE.FrontSide);
            const defaults = material.defaultAttributeValues;
            const item = { material, defaults, registration: null, restoreUniforms: bindReceiverUniforms(material, uniforms) }; hooks.push(item);
            material.defaultAttributeValues = { ...defaults, receiverAtlasVertex: [0], receiverAtlasInstance: [0], receiverAtlasCoordinate: [0, 0, 0, 0] };
            item.registration = registerEnhancedReceiverShader(material, mapping, uniforms, flatNormal);
        }
        for (const item of geometries) item.object.geometry = item.geometry;
        coverage.boundObjects = geometries.length;
        return { geometries, restore, coverage };
    } catch (error) { restore(); throw error; }
}
