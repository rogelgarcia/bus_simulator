// Repeat the hybrid square in culled chunks, sharing its PBR maps and live LOD card geometry.
// @ts-check
import * as THREE from 'three';

function createFieldFloorGeometry(chunkX, chunkZ, width, depth, chunkSize, border) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let z = 0; z < chunkSize; z++) for (let x = 0; x < chunkSize; x++) {
        const left = x - 0.5 + (chunkX + x === 0 ? border : 0);
        const right = x + 0.5 - (chunkX + x === width - 1 ? border : 0);
        const back = -z - 0.5 + (chunkZ + z === depth - 1 ? border : 0);
        const front = -z + 0.5 - (chunkZ + z === 0 ? border : 0);
        const first = positions.length / 3;
        for (const [px, pz] of [[left, back], [right, back], [left, front], [right, front]]) {
            positions.push(px, 0.01, pz); normals.push(0, 1, 0);
            uvs.push(px - x + 0.5, 0.5 - (pz + z));
        }
        indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

/** @param {{comparison:ReturnType<import('./GrassDebugV2FloorComparison.js').createGrassDebugV2FloorComparison>}} options */
export function createGrassDebugV2LargeField({ comparison }) {
    const width = 20, depth = 30, chunkSize = 5, gap = comparison.getSnapshot().gapMeters * 2;
    const minX = comparison.bounds.max.x + gap, maxZ = comparison.bounds.max.z;
    const bounds = new THREE.Box3(new THREE.Vector3(minX, 0, maxZ - depth),
        new THREE.Vector3(minX + width, comparison.bounds.max.y, maxZ));
    const group = new THREE.Group(); group.name = 'GrassV2LargeField'; group.visible = false;
    const modes = ['refined', 'detailed', 'curved', 'split'];
    const sources = Object.fromEntries(modes.map(mode => [mode, comparison.hybrid[mode].children.filter(mesh => mesh.isInstancedMesh)]));
    const tile = comparison.tiles.find(mesh => mesh.name === 'GrassV2Floor-hybrid1k');
    const tilesPerChunk = chunkSize * chunkSize, matrix = new THREE.Matrix4(), chunkMeshes = [], floorGeometries = [];
    const textureBorderMeters = 0.03;
    const leafMatrices = sources.refined.map(source => {
        const attribute = new THREE.InstancedBufferAttribute(new Float32Array(source.count * tilesPerChunk * 16), 16);
        for (let z = 0; z < chunkSize; z++) for (let x = 0; x < chunkSize; x++) for (let i = 0; i < source.count; i++) {
            source.getMatrixAt(i, matrix); matrix.elements[12] += x; matrix.elements[14] -= z;
            matrix.toArray(attribute.array, ((z * chunkSize + x) * source.count + i) * 16);
        }
        return attribute;
    });
    const chunkBounds = new THREE.Box3(new THREE.Vector3(-0.5, -0.1, 0.5 - chunkSize),
        new THREE.Vector3(chunkSize - 0.5, bounds.max.y, 0.5));
    const createInstances = (geometry, material, instanceMatrix) => {
        const mesh = new THREE.InstancedMesh(geometry, material, 0);
        mesh.instanceMatrix = instanceMatrix; mesh.count = instanceMatrix.count;
        mesh.boundingBox = chunkBounds.clone(); mesh.boundingSphere = chunkBounds.getBoundingSphere(new THREE.Sphere());
        mesh.receiveShadow = true; return mesh;
    };
    for (let z = 0; z < depth; z += chunkSize) for (let x = 0; x < width; x += chunkSize) {
        const chunk = new THREE.Group(); chunk.position.set(minX + 0.5 + x, 0, maxZ - 0.5 - z);
        chunk.name = 'GrassV2FieldChunk-' + x + '-' + z;
        const floorGeometry = createFieldFloorGeometry(x, z, width, depth, chunkSize, textureBorderMeters);
        floorGeometries.push(floorGeometry);
        const floor = new THREE.Mesh(floorGeometry, tile.material);
        floor.name = 'GrassV2FieldFloor'; floor.castShadow = false; floor.receiveShadow = true; chunk.add(floor);
        const leaves = sources.refined.map((source, i) => {
            const mesh = createInstances(source.geometry, source.material, leafMatrices[i]);
            mesh.name = 'GrassV2FieldLeaves-' + i; mesh.castShadow = true; chunk.add(mesh); return mesh;
        });
        chunkMeshes.push(leaves); group.add(chunk);
    }
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(bounds.min.x, 0.002, bounds.min.z), new THREE.Vector3(bounds.max.x, 0.002, bounds.min.z),
        new THREE.Vector3(bounds.max.x, 0.002, bounds.max.z), new THREE.Vector3(bounds.min.x, 0.002, bounds.max.z)
    ]);
    const outlineMaterial = new THREE.LineBasicMaterial({ color: '#348fff', depthTest: false, depthWrite: false, toneMapped: false });
    const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial); outline.visible = false; outline.renderOrder = 11; group.add(outline);
    let mode = 'refined';
    const leavesPerSquare = sources.refined.reduce((sum, source) => sum + source.count, 0), tiles = width * depth;
    const setMode = value => {
        // LOD0 is the small source study; retain the field's last runtime card level.
        if (value === 'LOD0') return;
        if (!Object.hasOwn(sources, value)) throw new Error('Unknown large field LOD.');
        mode = value;
        for (const leaves of chunkMeshes) leaves.forEach((mesh, i) => { mesh.geometry = sources[mode][i].geometry; });
    };
    const getPatchDetails = (x, z) => {
        if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) return null;
        const column = Math.min(width - 1, Math.floor(x - bounds.min.x));
        const row = Math.min(depth - 1, Math.floor(bounds.max.z - z));
        const leavesByLod = {};
        let leafTriangles = 0;
        for (const source of sources[mode]) {
            const trianglesPerLeaf = source.geometry.index.count / 3;
            const label = 'LOD3 · ' + trianglesPerLeaf / 2;
            leavesByLod[label] = (leavesByLod[label] ?? 0) + source.count;
            leafTriangles += trianglesPerLeaf * source.count;
        }
        return { column, row, textureLeaves: 4000, leavesByLod, leafTriangles, floorTriangles: 2, triangles: leafTriangles + 2 };
    };
    return Object.freeze({
        group, bounds, setMode, getPatchDetails, setVisible: visible => { group.visible = !!visible; },
        setSquareBounds: visible => { outline.visible = !!visible; },
        getSnapshot: () => {
            const cardsPerLeaf = sources[mode][0].geometry.index.count / 6;
            return { visible: group.visible, widthMeters: width, depthMeters: depth, gapMeters: gap, tileSpacingMeters: 1, textureBorderMeters, tiles, textureLeavesPerSquare: 4000,
                leavesPerSquare, leaves: tiles * leavesPerSquare, mode, cardsPerLeaf,
                lods: [{ label: 'LOD0', leaves: 0, triangles: 0 }, ...modes.map(level => {
                    const meshes = sources[level], active = level === mode;
                    return { label: 'LOD3 · ' + meshes[0].geometry.index.count / 6,
                        leaves: active ? tiles * meshes.reduce((sum, mesh) => sum + mesh.count, 0) : 0,
                        triangles: active ? tiles * meshes.reduce((sum, mesh) => sum + mesh.count * mesh.geometry.index.count / 3, 0) : 0 };
                })],
                cards: tiles * leavesPerSquare * cardsPerLeaf, leafTriangles: tiles * leavesPerSquare * cardsPerLeaf * 2,
                floorTriangles: tiles * 2, chunks: chunkMeshes.length, chunkSizeMeters: chunkSize,
                bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
        },
        dispose: () => {
            group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
            floorGeometries.forEach(geometry => geometry.dispose());
            outlineGeometry.dispose(); outlineMaterial.dispose();
        }
    });
}
