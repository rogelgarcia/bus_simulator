// src/graphics/assets3d/generators/road/builders/AsphaltBuilder.js
import * as THREE from 'three';
import { clamp } from '../math/RoadMath.js';
import { mergeBufferGeometries } from '../geometry/RoadGeometry.js';

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
    const rangeData = [];
    let hasRangeData = false;
    const TRI_ONLY_VERTS = 3;
    const TRI_VERTS = 6;
    const POS_STRIDE = 3;

    function addPlane(x, y, z, sx, sz, ry = 0, colorHex = 0xffffff, meta = null) {
        const base = planeGeo.clone();
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(sx, 1, sz);
        dummy.updateMatrix();
        base.applyMatrix4(dummy.matrix);
        geoms.push(colorizeGeometry(base, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function addRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, colorHex = 0xffffff, meta = null }) {
        if (!(outerR > innerR + 0.01)) return;
        const g = new THREE.RingGeometry(innerR, outerR, clamp(segs ?? 32, 12, 96) | 0, 1, startAng, spanAng);
        g.rotateX(-Math.PI / 2);
        g.translate(centerX, y, centerZ);
        geoms.push(colorizeGeometry(g, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function addRingSectorKey({ key, centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, meta = null }) {
        const desc = palette?.parseKey ? palette.parseKey(key) : { type: 'all', orient: 'all' };
        const c = palette?.instanceColor ? palette.instanceColor('asphalt', desc.type, desc.orient) : 0xffffff;
        addRingSectorXZ({ centerX, centerZ, y, innerR, outerR, startAng, spanAng, segs, colorHex: c, meta });
    }

    function addQuadXZ({ a, b, c, d, y, colorHex = 0xffffff, meta = null }) {
        if (!a || !b || !c || !d) return;
        const positions = new Float32Array(TRI_VERTS * POS_STRIDE);
        let i = 0;
        positions[i++] = a.x;
        positions[i++] = y;
        positions[i++] = a.y;
        positions[i++] = b.x;
        positions[i++] = y;
        positions[i++] = b.y;
        positions[i++] = c.x;
        positions[i++] = y;
        positions[i++] = c.y;
        positions[i++] = a.x;
        positions[i++] = y;
        positions[i++] = a.y;
        positions[i++] = c.x;
        positions[i++] = y;
        positions[i++] = c.y;
        positions[i++] = d.x;
        positions[i++] = y;
        positions[i++] = d.y;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, POS_STRIDE));
        g.computeVertexNormals();
        geoms.push(colorizeGeometry(g, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function addTriangleXZ({ a, b, c, y, colorHex = 0xffffff, meta = null }) {
        if (!a || !b || !c) return;
        const positions = new Float32Array(TRI_ONLY_VERTS * POS_STRIDE);
        let i = 0;
        positions[i++] = a.x;
        positions[i++] = y;
        positions[i++] = a.y;
        positions[i++] = b.x;
        positions[i++] = y;
        positions[i++] = b.y;
        positions[i++] = c.x;
        positions[i++] = y;
        positions[i++] = c.y;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, POS_STRIDE));
        g.computeVertexNormals();
        geoms.push(colorizeGeometry(g, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function addPolygonXZ({ points, y, colorHex = 0xffffff, meta = null }) {
        if (!Array.isArray(points) || points.length < 3) return;
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, points[i].y);
        }
        shape.closePath();
        const g = new THREE.ShapeGeometry(shape);
        g.rotateX(Math.PI / 2);
        g.translate(0, y, 0);
        g.computeVertexNormals();
        geoms.push(colorizeGeometry(g, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function addGeometry(geom, colorHex = 0xffffff, meta = null) {
        if (!geom) return;
        geoms.push(colorizeGeometry(geom, colorHex));
        rangeData.push(meta);
        if (meta !== null && meta !== undefined) hasRangeData = true;
    }

    function finalize() {
        const geo = mergeBufferGeometries(geoms);
        if (geo) {
            mesh.geometry.dispose();
            mesh.geometry = geo;
            if (hasRangeData) {
                mesh.geometry.userData.mergeRangeData = rangeData;
            }
        }
        return geoms.length;
    }

    function buildCurveMeshes() {
        return [];
    }

    return { mesh, addPlane, addRingSectorXZ, addRingSectorKey, addQuadXZ, addTriangleXZ, addPolygonXZ, addGeometry, finalize, buildCurveMeshes };
}
