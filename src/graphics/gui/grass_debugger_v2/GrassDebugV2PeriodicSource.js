// Extend a periodic source with exact boundary continuations from all eight neighboring tiles.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Object3D} source @param {number} paddingMeters @param {number} periodMeters */
export function createGrassDebugV2PeriodicSource(source, paddingMeters = 0, periodMeters = 1) {
    if (!Number.isFinite(periodMeters) || periodMeters <= 0) throw new Error('Periodic capture requires a positive tile size.');
    if (!Number.isFinite(paddingMeters) || paddingMeters < 0 || paddingMeters > periodMeters / 2) throw new Error('Periodic capture padding must not exceed half a tile.');
    const limit = periodMeters / 2 + paddingMeters;
    const group = new THREE.Group(), matrix = new THREE.Matrix4(), relative = new THREE.Matrix4();
    const bounds = new THREE.Box3();
    const geometries = [];
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
        // Merged field leaves have separate index ranges. Repeat only crossing
        // leaves, sharing their attributes instead of drawing nine whole tiles.
        const ranges = mesh.userData.grassLeafRanges;
        if (ranges?.length) {
            const position = mesh.geometry.attributes.position, index = mesh.geometry.index, point = new THREE.Vector3();
            const selected = neighbors.map(() => []);
            originalInstances += ranges.length;
            for (const range of ranges) {
                bounds.makeEmpty();
                for (let i = range.start; i < range.start + range.count; i++)
                    bounds.expandByPoint(point.fromBufferAttribute(position, index.getX(i)).applyMatrix4(relative));
                neighbors.forEach((neighbor, n) => {
                    const x = neighbor.x * periodMeters, z = neighbor.z * periodMeters;
                    if (bounds.max.x + x <= -limit || bounds.min.x + x >= limit
                        || bounds.max.z + z <= -limit || bounds.min.z + z >= limit) return;
                    for (let i = range.start; i < range.start + range.count; i++) selected[n].push(index.getX(i));
                    neighbor.instances++;
                });
            }
            neighbors.forEach((neighbor, n) => {
                if (!selected[n].length) return;
                const geometry = new THREE.BufferGeometry();
                for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
                geometry.setIndex(selected[n]); geometries.push(geometry);
                const copy = new THREE.Mesh(geometry, mesh.material);
                copy.matrix.makeTranslation(neighbor.x * periodMeters, 0, neighbor.z * periodMeters).multiply(relative);
                copy.matrixAutoUpdate = false; group.add(copy);
            });
            return;
        }
        const transforms = [], count = mesh.isInstancedMesh ? mesh.count : 1;
        originalInstances += count;
        for (let i = 0; i < count; i++) {
            if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix); else matrix.identity();
            matrix.premultiply(relative);
            bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
            for (const neighbor of neighbors) {
                const x = neighbor.x * periodMeters, z = neighbor.z * periodMeters;
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
        getSnapshot: () => ({ periodMeters, paddingMeters, originalInstances,
            renderedInstances: neighbors.reduce((sum, neighbor) => sum + neighbor.instances, 0),
            neighbors: neighbors.map(neighbor => ({ ...neighbor })) }),
        dispose() {
            group.children.forEach(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
            geometries.forEach(geometry => geometry.dispose());
        }
    });
}
