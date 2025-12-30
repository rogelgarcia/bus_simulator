// graphics/visuals/city/AdjustedEndRingMarkers.js
// Creates instanced adjusted-end ring markers for connector debug views.
import * as THREE from 'three';
import { createInstancedMarkerMesh } from '../shared/InstancedMarkerMesh.js';

export function createAdjustedEndRingMarkers({
    points,
    innerRadius,
    outerRadius,
    y = 0,
    color = 0x34c759,
    opacity = 0.85,
    segments = 32,
    renderOrder = 26,
    visible = true
} = {}) {
    const list = Array.isArray(points) ? points : [];
    if (!list.length || !Number.isFinite(innerRadius) || !Number.isFinite(outerRadius)) return null;

    const geo = new THREE.RingGeometry(innerRadius, outerRadius, segments);
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
