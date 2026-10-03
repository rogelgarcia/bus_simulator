// Select a representative metre of the live field and complete its periodic boundary leaves.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';

/** @param {THREE.Mesh} source @param {number} width @param {number} depth */
export function createGrassDebugV2ImpostorSource(source, width, depth) {
    const ranges = source.userData.grassLeafRanges;
    if (!ranges?.length || width % 1 || depth % 1) throw new Error('Runtime impostors need leaf ranges and whole-metre field dimensions.');
    const geometry = source.geometry, p = geometry.attributes.position, uv = geometry.attributes.uv, index = geometry.index;
    const cells = Array.from({ length: width * depth }, (_, id) => ({ id, x: id % width - width / 2 + .5,
        z: Math.floor(id / width) - depth / 2 + .5, leafIds: [], edge: false }));
    const tileIds = [], edgeIds = [];
    for (const [id, range] of ranges.entries()) {
        const vertices = new Set(); let minV = Infinity, x = 0, z = 0, n = 0;
        for (let i = range.start; i < range.start + range.count; i++) { const v = index.getX(i); vertices.add(v); minV = Math.min(minV, uv.getY(v)); }
        for (const v of vertices) if (uv.getY(v) <= minV + 1e-6) { x += p.getX(v); z += p.getZ(v); n++; }
        x /= n; z /= n;
        const cx = Math.min(width - 1, Math.max(0, Math.floor(x + width / 2)));
        const cz = Math.min(depth - 1, Math.max(0, Math.floor(z + depth / 2)));
        cells[cz * width + cx].leafIds.push(id);
        if (Math.abs(x) < .5 && Math.abs(z) < .5) tileIds.push(id);
    }
    for (const cell of cells) {
        cell.edge = Math.abs(cell.x) > width / 2 - 1 || Math.abs(cell.z) > depth / 2 - 1;
        if (cell.edge) edgeIds.push(...cell.leafIds);
    }
    const selected = [], selectedRanges = [];
    for (const id of tileIds) {
        const range = ranges[id]; selectedRanges.push({ start: selected.length, count: range.count });
        for (let i = range.start; i < range.start + range.count; i++) selected.push(index.getX(i));
    }
    const vertices = [...new Set(selected)], remap = new Map(vertices.map((v, i) => [v, i]));
    const compact = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const target = new THREE.BufferAttribute(new attribute.array.constructor(vertices.length * attribute.itemSize), attribute.itemSize, attribute.normalized);
        vertices.forEach((v, i) => target.copyAt(i, attribute, v)); compact.setAttribute(name, target);
    }
    compact.setIndex(selected.map(v => remap.get(v))); compact.computeBoundingBox(); compact.computeBoundingSphere();
    const original = new THREE.Mesh(compact, source.material); original.userData.grassLeafRanges = selectedRanges;
    const periodic = createGrassDebugV2PeriodicSource(original, 0, 1);
    periodic.group.updateMatrixWorld(true);
    const parts = periodic.group.children.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const completed = mergeGeometries(parts); parts.forEach(part => part.dispose());
    completed.computeBoundingBox(); completed.computeBoundingSphere();
    const mesh = new THREE.Mesh(completed, source.material), periodicSnapshot = periodic.getSnapshot();
    periodic.dispose(); compact.dispose();
    return Object.freeze({ mesh, cells, ranges, edgeIds, sourceLeaves: tileIds.length, periodic: periodicSnapshot,
        dispose() { completed.dispose(); } });
}
