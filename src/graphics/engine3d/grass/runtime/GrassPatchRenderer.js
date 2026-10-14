// Select bounded world-grid patches while leaving all blade and ground buffers immutable.
// @ts-check
import * as THREE from 'three';
import { createGrassPatchGeometry } from './GrassPatchGeometry.js';
import { createGrassPatchMaterials } from './GrassPatchMaterials.js';
import { createGrassPatchGrid } from './GrassPatchGrid.js';

/** @param {{asset:object,coverage:object,bounds:object,groundY?:number,patchSize?:number,distances?:number[],terminalTransition?:'dissolve'|'rise'|'trim'|'shorten'}} options */
export function createGrassPatchRenderer({ asset, coverage, bounds, groundY = 0, patchSize = 4, distances = [.6, .8, 8, 16, 24], terminalTransition = 'dissolve' }) {
    if (!Number.isInteger(patchSize) || patchSize < 2 || patchSize > 8 || patchSize % 2
        || ![bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, groundY].every(Number.isFinite)
        || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ || distances.length !== 5
        || distances.some((value, i) => !Number.isFinite(value) || value <= (distances[i - 1] ?? 0)) || distances[4] > 48
        || !['dissolve', 'rise', 'trim', 'shorten'].includes(terminalTransition))
        throw new Error('[Grass] Invalid immutable patch bounds or distances.');
    const group = new THREE.Group(); group.name = 'GrassImmutablePatches'; group.position.y = groundY;
    const geometry = createGrassPatchGeometry(asset, patchSize);
    const material = createGrassPatchMaterials({ asset, distances, groundY, terminalTransition });
    material.materials.forEach(value => coverage.bind(value));
    const grids = new Map([...new Set(geometry.sizes)].map(size => [size, createGrassPatchGrid(bounds, size, coverage)]));
    const radius = distances[4], poolRadii = distances.map((distance, level) => Math.max(distance, level < 2 ? 4 : radius));
    const capacities = geometry.sizes.map((size, level) => (Math.ceil(2 * poolRadii[level] / size) + 4) ** 2);
    const pools = geometry.geometries.map((template, level) => Array.from({ length: capacities[level] }, (_, index) => {
        const mesh = new THREE.Mesh(template, material.leaves[level]); mesh.name = `GrassPatch-LOD${level}-${index}`;
        mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
        mesh.userData.grassPatchLevel = level; group.add(mesh); return mesh;
    }));
    const surfaceGeometry = new THREE.PlaneGeometry(1, 1); surfaceGeometry.rotateX(-Math.PI / 2);
    const surfaces = [], surfaceSize = 32;
    for (let z = bounds.minZ; z < bounds.maxZ; z += surfaceSize) for (let x = bounds.minX; x < bounds.maxX; x += surfaceSize) {
        const width = Math.min(surfaceSize, bounds.maxX - x), depth = Math.min(surfaceSize, bounds.maxZ - z);
        const mesh = new THREE.Mesh(surfaceGeometry, material.surface); mesh.name = 'GrassPatchGround';
        mesh.position.set(x + width / 2, .005, z + depth / 2); mesh.scale.set(width, 1, depth);
        mesh.userData.grassCanopy = true; mesh.updateMatrix(); mesh.matrixAutoUpdate = false; group.add(mesh); surfaces.push(mesh);
    }
    group.updateMatrix(); group.matrixAutoUpdate = false; group.updateMatrixWorld(true);
    const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere();
    const levels = [0, 0, 0, 0, 0, 0], active = [0, 0, 0, 0, 0];
    let mode = 'AUTO', scans = 0, updateMs = 0, triangles = 0, disposed = false;
    function update(camera) {
        if (disposed || mode === 'OFF') return;
        const started = performance.now(), position = camera.position;
        camera.updateMatrixWorld(true); projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projection); material.camera.value.copy(position);
        const forced = material.mode.value;
        levels.fill(0); triangles = 0;
        for (let level = 0; level < 5; level++) {
            const previous = active[level]; active[level] = 0;
            const grid = grids.get(geometry.sizes[level]), { size, minX, minZ, columns, rows, occupied } = grid;
            const extent = geometry.extents[level];
            const band = material.bands[level], range = forced >= 0 ? Infinity : band.w;
            const left = Math.max(minX, Math.floor((position.x - range - size) / size));
            const right = Math.min(minX + columns - 1, Math.floor((position.x + range + size) / size));
            const top = Math.max(minZ, Math.floor((position.z - range - size) / size));
            const bottom = Math.min(minZ + rows - 1, Math.floor((position.z + range + size) / size));
            if (forced < 0 || forced === level) for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) {
                if (!occupied[(z - minZ) * columns + x - minX]) continue;
                const px = x * size, pz = z * size, cx = px + size / 2, cz = pz + size / 2;
                const dx = Math.abs(position.x - cx), dz = Math.abs(position.z - cz), dy = Math.abs(position.y - groundY);
                const nearest = Math.hypot(Math.max(0, dx - size / 2 - extent.overhang), Math.max(0, dz - size / 2 - extent.overhang), dy);
                const farthest = Math.hypot(dx + size / 2 + extent.overhang, dz + size / 2 + extent.overhang, dy);
                if (nearest >= range || (forced < 0 && farthest <= band.x)) continue;
                sphere.center.set(cx, groundY + extent.centerY, cz); sphere.radius = extent.radius;
                if (!frustum.intersectsSphere(sphere)) continue;
                const mesh = pools[level][active[level]++];
                if (mesh.position.x !== px || mesh.position.z !== pz) { mesh.position.set(px, 0, pz); mesh.updateMatrix(); }
                mesh.visible = true;
                levels[level]++; triangles += geometry.triangles[level];
            }
            for (let i = active[level]; i < previous; i++) pools[level][i].visible = false;
        }
        for (const mesh of surfaces) if (frustum.intersectsObject(mesh)) { levels[5]++; triangles += 2; }
        scans++; updateMs = performance.now() - started;
    }
    return Object.freeze({ group, surfaces, material,
        update,
        setMode(value) {
            if (!['AUTO', 'OFF', 'LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].includes(value)) throw new Error('[Grass] Unknown patch mode: ' + value);
            mode = value; material.mode.value = value.startsWith('LOD') ? Number(value.slice(3)) : -1;
            for (let level = 0; level < 5; level++) {
                const count = material.mode.value === level ? Math.max(capacities[level], grids.get(geometry.sizes[level]).count) : capacities[level];
                while (pools[level].length > count) pools[level].pop().removeFromParent();
                while (pools[level].length < count) {
                    const mesh = pools[level][0].clone(false); mesh.visible = false;
                    mesh.name = `GrassPatch-LOD${level}-${pools[level].length}`; group.add(mesh); pools[level].push(mesh);
                }
                active[level] = Math.min(active[level], count);
            }
            group.visible = value !== 'OFF';
        },
        getSnapshot() { return { geometryPolicy: 'immutable', mode, patchSize, patchSizes: geometry.sizes,
            capacityPerLevel: pools.map(pool => pool.length), autoCapacityPerLevel: capacities, forcedCoverage: 'full-field',
            occupiedPatches: grids.get(patchSize).count,
            triangles: mode === 'OFF' ? 0 : triangles, levels: mode === 'OFF' ? [0, 0, 0, 0, 0, 0] : [...levels],
            fadeStyle: 'dissolve', terminalTransition, surfacePatches: surfaces.length, scans, updateMs, distances: [...distances],
            placementBytes: geometry.placementBytes }; },
        async prewarm(renderer, scene, camera) {
            const warm = new THREE.Scene(); warm.fog = scene.fog;
            for (let level = 0; level < 5; level++) {
                const mesh = new THREE.Mesh(geometry.geometries[level], material.leaves[level]); mesh.frustumCulled = false; warm.add(mesh);
            }
            const surface = new THREE.Mesh(surfaceGeometry, material.surface); surface.frustumCulled = false; warm.add(surface);
            await renderer.compileAsync(warm, camera);
            if (disposed) { warm.clear(); return; }
            const target = new THREE.WebGLRenderTarget(1, 1), previous = renderer.getRenderTarget();
            const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4());
            const scissorTest = renderer.getScissorTest(), shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
            try {
                renderer.setScissorTest(false); renderer.setRenderTarget(target); renderer.render(warm, camera);
            } finally {
                renderer.setRenderTarget(previous); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
                renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
                target.dispose(); warm.clear();
            }
        },
        dispose() { if (disposed) return; disposed = true; group.removeFromParent(); group.clear(); geometry.dispose(); surfaceGeometry.dispose(); material.dispose(); }
    });
}
