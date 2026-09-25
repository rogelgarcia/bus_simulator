// Local soil contact for the isolated blade study, separate from grass bake inputs.
// One continuous surface shares the terrain material and avoids patch or sampling seams.
// @ts-check
import * as THREE from 'three';

export const GRASS_V2_SOIL_INTEGRATION = Object.freeze({
    widthMeters: 0.06, depthMeters: 0.08, centerZ: 0.012,
    widthSegments: 240, depthSegments: 320, stepMeters: 0.00025
});

function hash(x, z) {
    let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 197901;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const u = THREE.MathUtils.smootherstep(x - ix, 0, 1), v = THREE.MathUtils.smootherstep(z - iz, 0, 1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
        THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

function soilHeight(x, z) {
    const { widthMeters, depthMeters, centerZ } = GRASS_V2_SOIL_INTEGRATION;
    const radius = Math.hypot(x / (widthMeters / 2), (z - centerZ) / (depthMeters / 2));
    const weight = 1 - THREE.MathUtils.smootherstep(radius, 0.15, 0.92);
    if (weight === 0) return 0;
    const grain = (noise(x * 100 + 3, z * 100 + 7) - 0.5) * 0.00045
        + (noise(x * 450 + 13, z * 450 + 27) - 0.5) * 0.00014;
    const flank = Math.abs(x) - (0.0067 + 0.0007 * Math.sin((z - 0.008) * 90));
    const sides = 0.0021 * Math.exp(-((flank / 0.0042) ** 2) - (((z - 0.017) / 0.012) ** 2));
    const back = 0.0017 * Math.exp(-((x / 0.0085) ** 2) - (((z - 0.007) / 0.008) ** 2));
    const support = 0.0006 * Math.exp(-((x / 0.013) ** 2) - (((z - 0.014) / 0.016) ** 2));
    return weight * (grain + sides + back + support);
}

function crownSoilHeight(x, z) {
    const radius = Math.hypot(x, z);
    const weight = 1 - THREE.MathUtils.smootherstep(radius, 0.006, 0.022);
    if (weight === 0) return 0;
    const shoulder = 0.0021 * Math.exp(-(((radius - 0.0028) / 0.0034) ** 2));
    const support = 0.00045 * Math.exp(-((radius / 0.009) ** 2));
    const grain = (noise(x * 450 + 13, z * 450 + 27) - 0.5) * 0.00014;
    return weight * (shoulder + support + grain);
}

function makeSurface(terrain, getHeightAt, rootCentersX) {
    const { widthMeters, depthMeters, centerZ, depthSegments, stepMeters } = GRASS_V2_SOIL_INTEGRATION;
    const minX = Math.min(...rootCentersX) - widthMeters / 2, maxX = Math.max(...rootCentersX) + widthMeters / 2;
    const widthSegments = Math.ceil((maxX - minX) / stepMeters);
    const xs = [terrain.centerX - terrain.width / 2, ...Array.from({ length: widthSegments + 1 }, (_, i) => minX + i * (maxX - minX) / widthSegments), terrain.centerX + terrain.width / 2];
    const zs = [terrain.centerZ - terrain.depth / 2, ...Array.from({ length: depthSegments + 1 }, (_, i) => centerZ - depthMeters / 2 + i * depthMeters / depthSegments), terrain.centerZ + terrain.depth / 2];
    const positions = [], uv = [], indices = [];
    let minHeight = Infinity, maxHeight = -Infinity;
    for (const z of zs) for (const x of xs) {
        const y = getHeightAt(x, z);
        minHeight = Math.min(minHeight, y); maxHeight = Math.max(maxHeight, y);
        positions.push(x, y, z);
        uv.push(0.5 + (x - terrain.centerX) / terrain.width, 0.5 - (z - terrain.centerZ) / terrain.depth);
    }
    for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
        const a = z * xs.length + x, b = a + xs.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, minHeight, maxHeight };
}


// A single continuous ground mesh supports arbitrarily placed crowns. Splat the
// compact height profiles only near each root, avoiding roots × terrain vertices.
function makeCrownSurface(terrain, roots) {
    const radius = 0.022, step = 0.001;
    const minX = Math.min(...roots.map(root => root.x)) - radius, maxX = Math.max(...roots.map(root => root.x)) + radius;
    const minZ = Math.min(...roots.map(root => root.z)) - radius, maxZ = Math.max(...roots.map(root => root.z)) + radius;
    const nx = Math.ceil((maxX - minX) / step), nz = Math.ceil((maxZ - minZ) / step);
    const dx = (maxX - minX) / nx, dz = (maxZ - minZ) / nz, stride = nx + 3;
    const heights = new Float32Array(stride * (nz + 3));
    for (const root of roots) {
        const fromX = Math.max(0, Math.ceil((root.x - radius - minX) / dx)), toX = Math.min(nx, Math.floor((root.x + radius - minX) / dx));
        const fromZ = Math.max(0, Math.ceil((root.z - radius - minZ) / dz)), toZ = Math.min(nz, Math.floor((root.z + radius - minZ) / dz));
        for (let z = fromZ; z <= toZ; z++) for (let x = fromX; x <= toX; x++) {
            heights[(z + 1) * stride + x + 1] += crownSoilHeight(minX + x * dx - root.x, minZ + z * dz - root.z);
        }
    }
    const xs = [terrain.centerX - terrain.width / 2, ...Array.from({ length: nx + 1 }, (_, i) => minX + i * dx), terrain.centerX + terrain.width / 2];
    const zs = [terrain.centerZ - terrain.depth / 2, ...Array.from({ length: nz + 1 }, (_, i) => minZ + i * dz), terrain.centerZ + terrain.depth / 2];
    const positions = new Float32Array(heights.length * 3), uv = new Float32Array(heights.length * 2);
    const indices = new Uint32Array((xs.length - 1) * (zs.length - 1) * 6);
    let minHeight = 0, maxHeight = 0, vertex = 0, index = 0;
    for (const z of zs) for (const x of xs) {
        const y = heights[vertex];
        minHeight = Math.min(minHeight, y); maxHeight = Math.max(maxHeight, y);
        positions.set([x, y, z], vertex * 3);
        uv.set([0.5 + (x - terrain.centerX) / terrain.width, 0.5 - (z - terrain.centerZ) / terrain.depth], vertex * 2);
        vertex++;
    }
    for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
        const a = z * stride + x, b = a + stride;
        indices.set([a, b, a + 1, a + 1, b, b + 1], index); index += 6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, minHeight, maxHeight };
}

/**
 * @param {{material: THREE.MeshStandardMaterial, terrain: {width: number, depth: number, centerX: number, centerZ: number}, rootProfile?: 'blade'|'crown', rootCentersX?: readonly number[], rootCenters?: readonly {x: number, z: number}[]}} options
 * @returns {{group: THREE.Group, surface: THREE.Mesh, getHeightAt: (x: number, z: number) => number, getSnapshot: () => object, dispose: () => void}}
 */
export function createGrassDebugV2SoilIntegration({ material, terrain, rootProfile = 'blade', rootCentersX = [0], rootCenters = null }) {
    if (!material.isMeshStandardMaterial || terrain.width < 1 || terrain.depth < 1 || terrain.centerX !== 0 || Math.abs(terrain.centerZ) > 0.25) {
        throw new Error('Soil integration requires a standard ground material and a terrain covering the origin.');
    }
    if (rootProfile !== 'blade' && rootProfile !== 'crown') throw new Error('Unknown soil root profile.');
    if (!rootCentersX.length || rootCentersX.some(x => !Number.isFinite(x) || Math.abs(x) + GRASS_V2_SOIL_INTEGRATION.widthMeters / 2 >= terrain.width / 2)) {
        throw new Error('Soil root centers must be finite and inside the terrain.');
    }
    if (rootCenters && (rootProfile !== 'crown' || !rootCenters.length || rootCenters.some(root =>
        !Number.isFinite(root.x) || !Number.isFinite(root.z)
        || Math.abs(root.x - terrain.centerX) + 0.022 >= terrain.width / 2
        || Math.abs(root.z - terrain.centerZ) + 0.022 >= terrain.depth / 2))) {
        throw new Error('Placed soil crowns require finite roots inside the terrain.');
    }
    const roots = Object.freeze([...rootCentersX]);
    const placedRoots = rootCenters ? Object.freeze(rootCenters.map(root => Object.freeze({ ...root }))) : null;
    const profile = rootProfile === 'crown' ? crownSoilHeight : soilHeight;
    const getHeightAt = placedRoots
        ? (x, z) => placedRoots.reduce((sum, root) => sum + crownSoilHeight(x - root.x, z - root.z), 0)
        : (x, z) => roots.reduce((sum, root) => sum + profile(x - root, z), 0);
    const surfaceData = placedRoots ? makeCrownSurface(terrain, placedRoots) : makeSurface(terrain, getHeightAt, roots);
    const surface = new THREE.Mesh(surfaceData.geometry, material);
    surface.name = 'GrassV2StudySoilContact'; surface.castShadow = surface.receiveShadow = true;
    const group = new THREE.Group(); group.name = 'GrassV2SoilIntegration'; group.add(surface);
    return Object.freeze({ group, surface, getHeightAt,
        getSnapshot: () => ({ definition: GRASS_V2_SOIL_INTEGRATION, rootProfile, rootCentersX: placedRoots ? null : roots, rootCenters: placedRoots, clumps: 0,
            surfaceTriangles: surfaceData.geometry.index.count / 3, clumpTriangles: 0,
            minHeight: surfaceData.minHeight, maxHeight: surfaceData.maxHeight, material: material.name }),
        dispose: () => { surfaceData.geometry.dispose(); }
    });
}
