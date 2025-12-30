// graphics/visuals/city/RoadHighlightMesh.js
// Creates the road highlight mesh used for hover selection in city view.
import * as THREE from 'three';

export function createRoadHighlightMesh({
    color = 0xfff3a3,
    opacity = 0.25,
    renderOrder = 20,
    depthTest = false,
    depthWrite = false
} = {}) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(18);
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite,
        depthTest,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, geo, mat, positions };
}
