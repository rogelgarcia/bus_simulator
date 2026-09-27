// Extend a one-metre source with exact boundary continuations from all eight neighboring tiles.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Group} source @param {number} paddingMeters */
export function createGrassDebugV2PeriodicSource(source, paddingMeters = 0) {
    if (!Number.isFinite(paddingMeters) || paddingMeters < 0 || paddingMeters > 0.5) throw new Error('Periodic capture padding must be 0–0.5 m.');
    const limit = 0.5 + paddingMeters;
    const group = new THREE.Group(), matrix = new THREE.Matrix4(), relative = new THREE.Matrix4();
    const bounds = new THREE.Box3();
    const neighbors = [];
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++)
        neighbors.push({ x, z, instances: 0 });
    source.updateWorldMatrix(true, true);
    const inverse = source.matrixWorld.clone().invert();
    let originalInstances = 0;
    source.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        const transforms = [], count = mesh.isInstancedMesh ? mesh.count : 1;
        originalInstances += count;
        for (let i = 0; i < count; i++) {
            if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix); else matrix.identity();
            matrix.premultiply(relative);
            bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
            for (const neighbor of neighbors) {
                const { x, z } = neighbor;
                if (bounds.max.x + x <= -limit || bounds.min.x + x >= limit
                    || bounds.max.z + z <= -limit || bounds.min.z + z >= limit) continue;
                const copy = matrix.clone();
                copy.elements[12] += x; copy.elements[14] += z;
                transforms.push({ matrix: copy, index: i });
                neighbor.instances++;
            }
        }
        const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
        transforms.forEach((transform, i) => {
            copy.setMatrixAt(i, transform.matrix);
            if (mesh.instanceColor) {
                const color = new THREE.Color(); mesh.getColorAt(transform.index, color); copy.setColorAt(i, color);
            }
        });
        copy.instanceMatrix.needsUpdate = true;
        copy.computeBoundingBox(); copy.computeBoundingSphere(); group.add(copy);
    });
    group.name = 'GrassV2PeriodicBakeSource';
    return Object.freeze({ group,
        getSnapshot: () => ({ periodMeters: 1, paddingMeters, originalInstances,
            renderedInstances: neighbors.reduce((sum, neighbor) => sum + neighbor.instances, 0),
            neighbors: neighbors.map(neighbor => ({ ...neighbor })) }),
        dispose: () => group.children.forEach(mesh => mesh.dispose())
    });
}
