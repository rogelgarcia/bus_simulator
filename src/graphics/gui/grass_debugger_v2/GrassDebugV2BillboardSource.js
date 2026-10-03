// Collect corresponding source and LOD2 leaves without changing either live mesh.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** @param {readonly THREE.Mesh[]} meshes */
function collect(meshes) {
    const parts = [], ranges = []; let offset = 0;
    for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        if (mesh.matrixWorld.determinant() < 0) {
            const index = geometry.index.array;
            for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
        }
        for (const range of mesh.userData.grassLeafRanges ?? [{ start: 0, count: geometry.index.count }])
            ranges.push({ start: range.start + offset, count: range.count });
        for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(name)) geometry.deleteAttribute(name);
        parts.push(geometry); offset += geometry.index.count;
    }
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, ranges };
}

/** @param {readonly THREE.Mesh[]} meshes @param {readonly THREE.Mesh[]} lod2Meshes */
export function createGrassDebugV2BillboardSource(meshes, lod2Meshes) {
    if (!meshes.length || !lod2Meshes.length) throw new Error('Billboards require source and fallback leaves.');
    const source = collect(meshes), fallback = collect(lod2Meshes);
    if (source.ranges.length !== fallback.ranges.length) throw new Error('Billboard source and fallback leaf counts differ.');
    const p = source.geometry.attributes.position, uv = source.geometry.attributes.uv, index = source.geometry.index, roots = [];
    for (const range of source.ranges) {
        const used = new Set(); let minV = Infinity;
        for (let i = range.start; i < range.start + range.count; i++) { const v = index.getX(i); used.add(v); minV = Math.min(minV, uv.getY(v)); }
        let x = 0, z = 0, count = 0;
        for (const v of used) if (uv.getY(v) <= minV + 1e-6) { x += p.getX(v); z += p.getZ(v); count++; }
        let nx = 0, nz = 0;
        for (let i = range.start; i < range.start + range.count; i += 3) {
            const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
            const ax = p.getX(b) - p.getX(a), ay = p.getY(b) - p.getY(a), az = p.getZ(b) - p.getZ(a);
            const bx = p.getX(c) - p.getX(a), by = p.getY(c) - p.getY(a), bz = p.getZ(c) - p.getZ(a);
            nx += ay * bz - az * by; nz += ax * by - ay * bx;
        }
        const length = Math.hypot(nx, nz);
        roots.push({ x: x / count, z: z / count, nx: length > 1e-10 ? nx / length : 0, nz: length > 1e-10 ? nz / length : 1 });
    }
    return Object.freeze({ source, fallback, roots, height: source.geometry.boundingBox.max.y + .0005 });
}
