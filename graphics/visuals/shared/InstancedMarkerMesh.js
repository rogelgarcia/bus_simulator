// graphics/visuals/shared/InstancedMarkerMesh.js
// Creates instanced marker meshes from point lists for debug overlays.
import * as THREE from 'three';

export function createInstancedMarkerMesh({ geometry, material, points, y = 0, renderOrder = 0, visible = true } = {}) {
    const list = Array.isArray(points) ? points : [];
    if (!geometry || !material || !list.length) return null;

    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    let count = 0;
    for (const p of list) {
        if (!p || !Number.isFinite(p.x)) continue;
        const z = Number.isFinite(p.z) ? p.z : p.y;
        if (!Number.isFinite(z)) continue;
        dummy.position.set(p.x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(count, dummy.matrix);
        count += 1;
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = !!visible;
    return mesh;
}
