// src/graphics/visuals/city/ConnectionPoleMarkers.js
// Creates instanced connection pole marker circles for city debug mode.
import * as THREE from 'three';
import { createInstancedMarkerMesh } from '../shared/InstancedMarkerMesh.js';

export function createConnectionPoleMarkers({
    points,
    radius,
    y = 0,
    color = 0x34c759,
    opacity = 0.7,
    segments = 32,
    renderOrder = 24,
    visible = true
} = {}) {
    const list = Array.isArray(points) ? points : [];
    if (!list.length || !Number.isFinite(radius)) return null;

    const geo = new THREE.CircleGeometry(radius, segments);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false
    });
    const mesh = createInstancedMarkerMesh({ geometry: geo, material: mat, points: list, y, renderOrder, visible });
    if (!mesh) {
        geo.dispose();
        mat.dispose();
        return null;
    }
    return { mesh, geo, mat };
}
