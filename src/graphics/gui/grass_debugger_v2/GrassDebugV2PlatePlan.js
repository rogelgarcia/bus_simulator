// Assign each whole leaf once to a front-facing, 50 cm wide plate in a 10 cm root-depth band.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GRASS_PLATE_LAYOUT = Object.freeze({ widthMeters: .5, depthMeters: .1, directions: 4 });

/** @param {readonly THREE.Mesh[]} meshes Merged field meshes provide grassLeafRanges. */
export function createGrassDebugV2PlatePlan(meshes) {
    if (!meshes.length) throw new Error('Dynamic grass plates need source leaves.');
    const parts = [], leaves = [];
    let indexOffset = 0;
    for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        if (mesh.matrixWorld.determinant() < 0) {
            const ix = g.index.array;
            for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        }
        const ranges = mesh.userData.grassLeafRanges ?? [{ start: 0, count: g.index.count }];
        for (const range of ranges) leaves.push({ start: range.start + indexOffset, count: range.count });
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(name)) g.deleteAttribute(name);
        parts.push(g); indexOffset += g.index.count;
    }
    const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
    const p = geometry.attributes.position, uv = geometry.attributes.uv, index = geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    const step = Math.PI * 2 / GRASS_PLATE_LAYOUT.directions;
    const records = [], origins = new Array(GRASS_PLATE_LAYOUT.directions).fill(-Infinity);
    const bands = new Map(), directions = new Uint32Array(GRASS_PLATE_LAYOUT.directions), assignments = new Uint32Array(leaves.length);
    let maxY = 0, minimumFacing = 1;
    for (const [id, leaf] of leaves.entries()) {
        const used = new Set();
        normal.set(0, 0, 0);
        for (let i = leaf.start; i < leaf.start + leaf.count; i += 3) {
            const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
            used.add(ia); used.add(ib); used.add(ic);
            a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
            normal.add(b.sub(a).cross(c.sub(a)));
        }
        if (normal.x * normal.x + normal.z * normal.z < 1e-20) throw new Error('Leaf has no horizontal front: ' + id);
        const yaw = Math.atan2(normal.x, normal.z), direction = (Math.round(yaw / step) + GRASS_PLATE_LAYOUT.directions) % GRASS_PLATE_LAYOUT.directions;
        const angle = direction * step, sine = Math.sin(angle), cosine = Math.cos(angle);
        minimumFacing = Math.min(minimumFacing, (normal.x * sine + normal.z * cosine) / Math.hypot(normal.x, normal.z));
        let minX = Infinity, maxX = -Infinity, minUv = Infinity, rootDepth = 0, roots = 0;
        for (const v of used) minUv = Math.min(minUv, uv.getY(v));
        for (const v of used) {
            const x = p.getX(v) * cosine - p.getZ(v) * sine;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, p.getY(v));
            if (uv.getY(v) <= minUv + 1e-6) { rootDepth += p.getX(v) * sine + p.getZ(v) * cosine; roots++; }
        }
        rootDepth /= roots;
        records.push({ id, ...leaf, direction, minX, maxX, rootDepth });
        origins[direction] = Math.max(origins[direction], rootDepth);
        directions[direction]++;
    }
    for (const leaf of records) {
        const { direction, rootDepth } = leaf;
        const band = Math.ceil((rootDepth - origins[direction]) / .1 - 1e-7), key = direction + ':' + band;
        if (!bands.has(key)) bands.set(key, { direction, front: origins[direction] + band * .1, leaves: [] });
        bands.get(key).leaves.push(leaf);
    }
    const plates = [], order = new Uint32Array(index.count);
    let cursor = 0;
    for (const band of bands.values()) {
        const sorted = band.leaves.sort((a, b) => a.minX - b.minX || a.id - b.id);
        let plate = null;
        for (const leaf of sorted) {
            if (leaf.maxX - leaf.minX > .499) throw new Error('Source leaf is wider than a plate.');
            if (!plate || leaf.maxX > plate.left + .5 - .0005) {
                plate = { id: plates.length, direction: band.direction, front: band.front,
                    left: leaf.minX - .0005, width: .5, contentWidth: 0, start: cursor, count: 0, leafIds: [], rootDepths: [] };
                plates.push(plate);
            }
            plate.contentWidth = Math.max(plate.contentWidth, leaf.maxX - plate.left);
            plate.leafIds.push(leaf.id); plate.rootDepths.push(leaf.rootDepth); assignments[leaf.id] = plate.id;
            order.set(index.array.subarray(leaf.start, leaf.start + leaf.count), cursor);
            cursor += leaf.count; plate.count += leaf.count;
        }
    }
    geometry.setIndex(new THREE.BufferAttribute(order, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return Object.freeze({ geometry, plates, assignments, leaves: leaves.length,
        height: maxY + .0005, minimumFacing, directionLeaves: Array.from(directions),
        dispose: () => geometry.dispose() });
}
