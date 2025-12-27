// graphics/assets3d/generators/internal_road/AsphaltBuilder.js
import * as THREE from 'three';
import { clamp } from './RoadMath.js';
import { mergeBufferGeometries } from './RoadGeometry.js';

function colorizeGeometry(geom, colorHex) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const c = new THREE.Color(colorHex ?? 0xffffff);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const j = i * 3;
        arr[j] = c.r;
        arr[j + 1] = c.g;
        arr[j + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
}

export function createAsphaltBuilder({ planeGeo, material, palette, capacity, name = 'Asphalt' } = {}) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = name;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    const geoms = [];

    function addPlane(x, y, z, sx, sz, ry = 0, colorHex = 0xffffff) {
        const base = planeGeo.clone();
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        base.applyMatrix4(dummy.matrix);
        geoms.push(colorizeGeometry(base, colorHex));
    }

    function addRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, colorHex = 0xffffff }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, clamp(segs ?? 32, 12, 96) | 0, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        geoms.push(colorizeGeometry(g, colorHex));
    }

    function addRingSectorKey({ key, centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs }) {
        const desc = palette?.parseKey ? palette.parseKey(key) : { type: 'all', orient: 'all' };
        const c = palette?.instanceColor ? palette.instanceColor('asphalt', desc.type, desc.orient) : 0xffffff;
        addRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, colorHex: c });
    }

    function finalize() {
        const geo = mergeBufferGeometries(geoms);
        if (geo) {
            mesh.geometry.dispose();
            mesh.geometry = geo;
        }
        return geoms.length;
    }

    function buildCurveMeshes() {
        return [];
    }

    return { mesh, addPlane, addRingSectorXZ, addRingSectorKey, finalize, buildCurveMeshes };
}
