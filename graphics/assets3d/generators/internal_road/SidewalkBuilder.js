// graphics/assets3d/generators/internal_road/SidewalkBuilder.js
import * as THREE from 'three';
import { clamp, pushToMap } from './RoadMath.js';
import { mergeBufferGeometries } from './RoadGeometry.js';

export function createSidewalkBuilder({
                                          planeGeo,
                                          instancedMaterial,
                                          baseMaterial,
                                          palette,
                                          capacity,
                                          name = 'Sidewalk'
                                      } = {}) {
    const mesh = new THREE.InstancedMesh(planeGeo, instancedMaterial, Math.max(1, capacity | 0));
    mesh.name = name;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    let count = 0;

    const curvesByKey = new Map();

    function addPlane(x, y, z, sx, sz, ry = 0, colorHex = 0xffffff) {
        const i = count;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(colorHex);
        mesh.setColorAt(i, tmpColor);
        count++;
    }

    function addRingSectorKey({ key, centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, clamp(segs ?? 24, 8, 128) | 0, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        pushToMap(curvesByKey, key, g);
    }

    function addGeometryKey(key, geom) {
        if (!geom) return;
        pushToMap(curvesByKey, key, geom);
    }

    function finalize() {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return count;
    }

    function buildCurveMeshes() {
        const out = [];
        for (const [key, geoms] of curvesByKey.entries()) {
            const geo = mergeBufferGeometries(geoms);
            if (!geo) continue;
            const desc = palette.parseKey(key);
            const mat = palette.curvedMaterial(baseMaterial, 'sidewalk', desc.type, desc.orient);
            const m = new THREE.Mesh(geo, mat);
            m.name = palette.meshName('sidewalk', desc.type, desc.orient);
            m.receiveShadow = true;
            out.push(m);
        }
        return out;
    }

    return { mesh, addPlane, addRingSectorKey, addGeometryKey, finalize, buildCurveMeshes };
}
