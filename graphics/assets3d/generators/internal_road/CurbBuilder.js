// graphics/assets3d/generators/internal_road/CurbBuilder.js
import * as THREE from 'three';
import { clamp, pushToMap } from './RoadMath.js';
import { mergeBufferGeometries } from './RoadGeometry.js';

export function createCurbBuilder({
                                      boxGeo,
                                      instancedMaterial,
                                      baseMaterial,
                                      palette,
                                      capacity,
                                      curbT,
                                      curbH,
                                      curbBottom,
                                      name = 'CurbBlocks'
                                  } = {}) {
    const mesh = new THREE.InstancedMesh(boxGeo, instancedMaterial, Math.max(1, capacity | 0));
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    let count = 0;

    const curvesByKey = new Map();

    function addBox(x, y, z, sx, sy, sz, ry = 0, colorHex = 0xffffff) {
        const i = count;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tmpColor.setHex(colorHex);
        mesh.setColorAt(i, tmpColor);
        count++;
    }

    function addArcSolidKey({ key, centerX, centerZ, radiusCenter, startAng, spanAng, curveSegs }) {
        const innerR = Math.max(0.01, radiusCenter - curbT * 0.5);
        const outerR = radiusCenter + curbT * 0.5;

        const a0 = startAng;
        const a1 = startAng + spanAng;

        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerR, a0, a1, false);
        shape.absarc(0, 0, innerR, a1, a0, true);
        shape.closePath();

        const g = new THREE.ExtrudeGeometry(shape, {
            depth: curbH,
            bevelEnabled: false,
            curveSegments: clamp(curveSegs ?? 24, 8, 128) | 0
        });

        g.rotateX(-Math.PI / 2);
        g.translate(centerX, curbBottom, centerZ);

        pushToMap(curvesByKey, key, g);
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
            const mat = palette.curvedMaterial(baseMaterial, 'curb', desc.type, desc.orient);
            const m = new THREE.Mesh(geo, mat);
            m.name = palette.meshName('curb', desc.type, desc.orient);
            m.castShadow = true;
            m.receiveShadow = true;
            out.push(m);
        }
        return out;
    }

    return { mesh, addBox, addArcSolidKey, finalize, buildCurveMeshes };
}
