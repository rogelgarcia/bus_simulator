// Proves when mapped vertex normals coincide with the baked geometric normals.
// @ts-check
import * as THREE from 'three';

/** @param {any} object @param {any} record @param {Float32Array} coordinates */
export function hasFlatReceiverNormals(object, record, coordinates) {
    const geometry = object.geometry, position = geometry.attributes.position, normal = geometry.attributes.normal;
    if (!normal || object.matrixWorld.determinant() <= 0) return false;
    if (object.isInstancedMesh) {
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix);
            if (matrix.determinant() <= 0) return false;
            const e = matrix.elements;
            for (const [a, b] of [[0, 4], [0, 8], [4, 8]]) {
                if (Math.abs(e[a] * e[b] + e[a + 1] * e[b + 1] + e[a + 2] * e[b + 2])
                    > 1e-10 * Math.hypot(e[a], e[a + 1], e[a + 2]) * Math.hypot(e[b], e[b + 1], e[b + 2])) return false;
            }
        }
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const instances = object.isInstancedMesh ? object.count : 1;
    for (let offset = 0; offset < record.referenceCount; offset += 3) {
        let mapped = false;
        for (let i = 0; i < instances; i++) if (coordinates[(record.base + i * record.referenceCount + offset) * 4 + 3] > .5) { mapped = true; break; }
        if (!mapped) continue;
        const indices = [0, 1, 2].map((corner) => geometry.index ? geometry.index.getX(offset + corner) : offset + corner);
        a.fromBufferAttribute(position, indices[0]); b.fromBufferAttribute(position, indices[1]); c.fromBufferAttribute(position, indices[2]);
        b.sub(a).cross(c.sub(a)).normalize();
        for (const index of indices) if (n.fromBufferAttribute(normal, index).normalize().dot(b) < 1 - 1e-10) return false;
    }
    return true;
}
