// Partition selected instances spatially while preserving authored geometry, materials and cell membership.
// @ts-check
import * as THREE from 'three';

export function createGrassTransitionChunks({ parent, entries, cells, fieldSize }) {
    const group = new THREE.Group(), cache = new Map(), geometries = new Set();
    group.name = 'GrassTransitionSpatialBatches';
    let size = fieldSize, uploads = 0, totalCpuMs = 0;
    function sync() {
        const started = performance.now();
        if (size === fieldSize) {
            group.removeFromParent();
            for (const entry of entries) entry.mesh.visible = entry.mesh.count > 0;
            return;
        }
        parent.add(group);
        for (const mesh of group.children) mesh.visible = false;
        for (const entry of entries) {
            const source = entry.mesh; source.visible = false;
            if (!source.count) continue;
            const members = new Map();
            entry.members.forEach((id, index) => {
                const cell = cells[id], key = Math.floor(cell.x / size) + Math.floor(cell.z / size) * (fieldSize / size);
                if (!members.has(key)) members.set(key, []);
                members.get(key).push(index);
            });
            for (const [chunk, indices] of members) {
                const key = source.uuid + ':' + chunk;
                let target = cache.get(key);
                if (target && target.sourceGeometry !== source.geometry) {
                    target.mesh.removeFromParent(); target.mesh.dispose();
                    if (geometries.delete(target.mesh.geometry)) target.mesh.geometry.dispose();
                    cache.delete(key); target = null;
                }
                if (!target) {
                    let geometry = source.geometry;
                    if (geometry.attributes.grassTransitionOpenEdges) {
                        geometry = geometry.clone();
                        geometry.setAttribute('grassTransitionOpenEdges', new THREE.InstancedBufferAttribute(new Float32Array(size * size * 4), 4).setUsage(THREE.DynamicDrawUsage));
                        geometries.add(geometry);
                    }
                    const mesh = new THREE.InstancedMesh(geometry, source.material, Math.min(source.instanceMatrix.count, size * size));
                    mesh.name = source.name + '-Chunk' + size + '-' + chunk; mesh.userData = { ...source.userData };
                    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
                    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.matrixAutoUpdate = false;
                    group.add(mesh); target = { mesh, members: [], sourceGeometry: source.geometry }; cache.set(key, target);
                }
                const mesh = target.mesh, ids = indices.map(index => entry.members[index]);
                const changed = ids.length !== target.members.length || ids.some((id, i) => id !== target.members[i]);
                mesh.material = source.material; mesh.position.copy(source.position); mesh.updateMatrix(); mesh.visible = true;
                const sourceEdges = source.geometry.attributes.grassTransitionOpenEdges, targetEdges = mesh.geometry.attributes.grassTransitionOpenEdges;
                let edgesChanged = false;
                if (sourceEdges) indices.forEach((index, i) => {
                    for (let side = 0; side < 4; side++) if (targetEdges.array[i * 4 + side] !== sourceEdges.array[index * 4 + side]) {
                        targetEdges.array[i * 4 + side] = sourceEdges.array[index * 4 + side]; edgesChanged = true;
                    }
                });
                if (edgesChanged) { targetEdges.needsUpdate = true; uploads++; }
                if (changed) {
                    indices.forEach((index, i) => mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(index * 16, index * 16 + 16), i * 16));
                    mesh.count = indices.length; mesh.instanceMatrix.needsUpdate = true; uploads++; target.members = ids;
                    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
                }
            }
        }
        totalCpuMs += performance.now() - started;
    }
    function clear() { group.removeFromParent(); for (const target of cache.values()) target.mesh.dispose(); cache.clear();
        geometries.forEach(geometry => geometry.dispose()); geometries.clear(); group.clear(); }
    return Object.freeze({
        sync,
        setSize(value) {
            if (![4, 8, fieldSize].includes(value) || fieldSize % value) throw new Error('Chunk size must be 4 m, 8 m or the whole field.');
            if (size === value) return;
            clear(); size = value; sync();
        },
        getMeshes: () => size === fieldSize ? [] : group.children.filter(mesh => mesh.visible),
        getSnapshot: () => ({ meters: size, allocatedBatches: cache.size, uploads, totalCpuMs,
            geometryBytes: [...geometries].reduce((sum, geometry) => sum + (geometry.index?.array.byteLength ?? 0)
                + Object.values(geometry.attributes).reduce((n, attribute) => n + attribute.array.byteLength, 0), 0),
            instanceBytes: [...cache.values()].reduce((sum, target) => sum + target.mesh.instanceMatrix.array.byteLength, 0) }),
        dispose: clear
    });
}
