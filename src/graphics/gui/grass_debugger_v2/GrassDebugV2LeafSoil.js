// A continuous terrain surface with small smooth shoulders around authored leaf sheaths.
// World-aligned soil UVs and a flat outer boundary avoid separate contact-patch seams.
// @ts-check
import * as THREE from 'three';

/** @typedef {{x:number,z:number,scale:number,burialMeters:number}} SoilRoot */
export const GRASS_V2_LEAF_SOIL = Object.freeze({ radiusMeters: 0.018, shoulderHeightMeters: 0.0018, samples: 48 });

function rootHeight(x, z, root) {
    const radius = Math.hypot((x - root.x) / root.scale, (z - root.z + 0.001 * root.scale) / root.scale);
    const envelope = 1 - THREE.MathUtils.smootherstep(radius, 0.006, GRASS_V2_LEAF_SOIL.radiusMeters);
    const shoulder = GRASS_V2_LEAF_SOIL.shoulderHeightMeters * Math.exp(-(((radius - 0.003) / 0.004) ** 2));
    const grain = 0.000035 * (Math.sin(x * 870 + z * 430) + Math.sin(z * 1100 - x * 590));
    return envelope * Math.max(0, shoulder + grain) * root.scale * Math.exp(-root.burialMeters / 0.004);
}

/**
 * @param {{material:THREE.MeshStandardMaterial, terrain:{width:number,depth:number,centerX:number,centerZ:number}}} options
 */
export function createGrassDebugV2LeafSoil({ material, terrain }) {
    if (!material?.isMeshStandardMaterial || ![terrain.width, terrain.depth, terrain.centerX, terrain.centerZ].every(Number.isFinite)
        || terrain.width <= 0 || terrain.depth <= 0) throw new Error('Leaf soil requires a finite terrain and standard material.');
    const group = new THREE.Group(); group.name = 'GrassV2LeafSoil';
    const surface = new THREE.Mesh(new THREE.BufferGeometry(), material); surface.name = 'GrassV2LeafSoilSurface';
    surface.castShadow = surface.receiveShadow = true; group.add(surface);
    /** @type {SoilRoot[]} */
    let roots = [];
    let signature = null, maxHeight = 0;
    const getHeightAt = (x, z) => roots.reduce((height, root) => Math.max(height, rootHeight(x, z, root)), 0);

    /** @param {SoilRoot[]} values */
    function setRoots(values) {
        if (!Array.isArray(values) || values.some(root =>
            ![root.x, root.z, root.scale, root.burialMeters].every(Number.isFinite) || root.scale <= 0 || root.burialMeters < 0
            || Math.abs(root.x - terrain.centerX) + GRASS_V2_LEAF_SOIL.radiusMeters * root.scale >= terrain.width / 2
            || Math.abs(root.z - terrain.centerZ) + GRASS_V2_LEAF_SOIL.radiusMeters * root.scale + 0.001 * root.scale >= terrain.depth / 2
        )) throw new Error('Leaf soil roots must be finite and inside the terrain.');
        const next = JSON.stringify(values);
        if (next === signature) return;
        roots = values.map(root => ({ ...root })); signature = next;
        const axes = ['x', 'z'].map((axis, a) => {
            const center = a ? terrain.centerZ : terrain.centerX, extent = (a ? terrain.depth : terrain.width) / 2;
            const coordinates = new Set([center - extent, center + extent]);
            for (const root of roots) {
                const radius = GRASS_V2_LEAF_SOIL.radiusMeters * root.scale;
                for (let i = 0; i <= GRASS_V2_LEAF_SOIL.samples; i++)
                    coordinates.add(root[axis] - (a ? 0.001 * root.scale : 0) + radius * (2 * i / GRASS_V2_LEAF_SOIL.samples - 1));
            }
            return [...coordinates].sort((a, b) => a - b);
        });
        const [xs, zs] = axes, stride = xs.length, count = stride * zs.length;
        const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uv = new Float32Array(count * 2);
        const indices = [], normal = new THREE.Vector3(), epsilon = 0.00001;
        maxHeight = 0;
        let vertex = 0;
        for (const z of zs) for (const x of xs) {
            const y = getHeightAt(x, z); maxHeight = Math.max(maxHeight, y);
            positions.set([x, y, z], vertex * 3);
            normal.set(-(getHeightAt(x + epsilon, z) - getHeightAt(x - epsilon, z)) / (2 * epsilon), 1,
                -(getHeightAt(x, z + epsilon) - getHeightAt(x, z - epsilon)) / (2 * epsilon)).normalize().toArray(normals, vertex * 3);
            uv.set([0.5 + (x - terrain.centerX) / terrain.width, 0.5 - (z - terrain.centerZ) / terrain.depth], vertex * 2);
            vertex++;
        }
        for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < xs.length - 1; x++) {
            const a = z * stride + x, b = a + stride;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        surface.geometry.dispose(); surface.geometry = geometry;
    }
    setRoots([{ x: 0, z: 0, scale: 1, burialMeters: 0 }]);
    return Object.freeze({ group, surface, setRoots, getHeightAt,
        getSnapshot: () => ({ definition: GRASS_V2_LEAF_SOIL, roots: roots.map(root => ({ ...root })), maxHeight,
            surfaceTriangles: surface.geometry.index.count / 3, material: material.name }),
        dispose: () => surface.geometry.dispose()
    });
}
