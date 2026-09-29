// Overlay every triangle edge of the final leaf mesh, including clipped boundaries and tip fans.
// @ts-check
import * as THREE from 'three';

function makeTriangleGeometry(source) {
    const { position } = source.attributes, edges = new Map();
    for (let i = 0; i < source.index.count; i += 3) for (let j = 0; j < 3; j++) {
        const a = source.index.getX(i + j), b = source.index.getX(i + (j + 1) % 3);
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (!edges.has(key)) edges.set(key, { a, b });
    }
    const indices = [], emitted = new Set();
    const pointKey = i => [position.getX(i), position.getY(i), position.getZ(i)]
        .map(value => Math.round(value * 1e9)).join(':');
    for (const { a, b } of edges.values()) {
        const ends = [pointKey(a), pointKey(b)].sort(), key = ends.join('/');
        if (ends[0] === ends[1] || emitted.has(key)) continue;
        emitted.add(key); indices.push(a, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position); geometry.setIndex(indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{meshes: THREE.Mesh[] | readonly THREE.Mesh[]}} options */
export function createGrassDebugV2TriangleWireframe({ meshes }) {
    for (const mesh of meshes) if (!mesh.geometry.index || !mesh.geometry.attributes.position || Array.isArray(mesh.material))
        throw new Error('Leaf triangle wireframe requires indexed meshes with positions and a single material.');
    const material = new THREE.LineBasicMaterial({ color: '#102415', depthTest: true, depthWrite: false, toneMapped: false });
    const fillMaterials = new Map(meshes.map(mesh => [mesh.material, {
        polygonOffset: mesh.material.polygonOffset,
        polygonOffsetFactor: mesh.material.polygonOffsetFactor,
        polygonOffsetUnits: mesh.material.polygonOffsetUnits
    }]));
    const lines = meshes.map(mesh => {
        const line = new THREE.LineSegments(makeTriangleGeometry(mesh.geometry), material);
        line.name = mesh.name + '-TriangleWireframe'; line.renderOrder = 1; line.visible = false;
        mesh.add(line);
        return line;
    });
    let visible = false;
    const setVisible = value => {
        visible = !!value;
        for (const line of lines) line.visible = visible;
        for (const [fill, original] of fillMaterials)
            Object.assign(fill, visible ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : original);
    };
    return Object.freeze({
        setVisible,
        getSnapshot: () => ({ visible, meshes: lines.length,
            segments: lines.reduce((total, line) => total + line.geometry.index.count / 2, 0) }),
        dispose: () => {
            setVisible(false);
            for (const line of lines) { line.removeFromParent(); line.geometry.dispose(); }
            material.dispose();
        }
    });
}
