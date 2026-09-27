// Select deterministic instances while borrowing the source leaf geometry and materials.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Group} original @param {number} stride @param {number} offset */
export function createGrassDebugV2PatchSubset(original, stride, offset = 0) {
    if (!Number.isInteger(stride) || stride < 1 || !Number.isInteger(offset) || offset < 0 || offset >= stride)
        throw new Error('Invalid grass subset stride or offset.');
    const group = new THREE.Group(), matrix = new THREE.Matrix4();
    for (const mesh of original.children.filter(mesh => mesh.isInstancedMesh)) {
        const count = Math.max(0, Math.ceil((mesh.count - offset) / stride));
        if (!count) continue;
        const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
        for (let i = 0; i < count; i++) { mesh.getMatrixAt(i * stride + offset, matrix); copy.setMatrixAt(i, matrix); }
        copy.castShadow = copy.receiveShadow = true; copy.instanceMatrix.needsUpdate = true;
        copy.computeBoundingBox(); copy.computeBoundingSphere(); group.add(copy);
    }
    return group;
}

/** @param {THREE.Group} group */
export function disposeGrassDebugV2PatchSubset(group) {
    group.children.forEach(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
}

export const countGrassDebugV2Instances = group => group.children.reduce((sum, mesh) => sum + (mesh.isInstancedMesh ? mesh.count : 0), 0);
