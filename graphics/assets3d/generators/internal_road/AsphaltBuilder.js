// graphics/assets3d/generators/internal_road/AsphaltBuilder.js
import * as THREE from 'three';
import { clamp } from './RoadMath.js';
import { mergeBufferGeometries } from './RoadGeometry.js';

export function createAsphaltBuilder({ planeGeo, material, capacity, name = 'Asphalt' } = {}) {
    const mesh = new THREE.InstancedMesh(planeGeo, material, Math.max(1, capacity | 0));
    mesh.name = name;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let count = 0;

    const curves = [];

    function addPlane(x, y, z, sx, sz, ry = 0) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(count++, dummy.matrix);
    }

    function addRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, clamp(segs ?? 32, 12, 96) | 0, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        curves.push(g);
    }

    function finalize() {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        return count;
    }

    function buildCurveMesh({ name: curveName = 'AsphaltCurves' } = {}) {
        const geo = mergeBufferGeometries(curves);
        if (!geo) return null;
        const m = new THREE.Mesh(geo, material);
        m.name = curveName;
        m.receiveShadow = true;
        return m;
    }

    return { mesh, addPlane, addRingSectorXZ, finalize, buildCurveMesh };
}
