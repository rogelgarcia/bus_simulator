// src/graphics/assets3d/procedural_meshes/meshes/BallMesh_v1.js
// Generates a ball mesh with stable region identifiers.
import * as THREE from 'three';

export const MESH_ID = 'mesh.ball.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Ball' });

export const REGIONS = Object.freeze([
    { id: 'ball:north_cap', label: 'North cap', tag: 'cap', color: 0xff6b6b },
    { id: 'ball:north', label: 'North', tag: 'hemisphere', color: 0xffd166 },
    { id: 'ball:equator', label: 'Equator', tag: 'equator', color: 0x4ecdc4 },
    { id: 'ball:south', label: 'South', tag: 'hemisphere', color: 0x5f7cff },
    { id: 'ball:south_cap', label: 'South cap', tag: 'cap', color: 0xb46cff }
]);

function classifyBallRegionId(yNorm) {
    if (yNorm > 0.72) return 'ball:north_cap';
    if (yNorm > 0.22) return 'ball:north';
    if (yNorm > -0.22) return 'ball:equator';
    if (yNorm > -0.72) return 'ball:south';
    return 'ball:south_cap';
}

function getPositionAttr(geometry) {
    const pos = geometry?.attributes?.position;
    return pos && pos.isBufferAttribute ? pos : null;
}

function getIndexAttr(geometry) {
    const idx = geometry?.index;
    return idx && idx.isBufferAttribute ? idx : null;
}

function computeTriangleCentroidY(positions, i0, i1, i2) {
    const y0 = positions.getY(i0);
    const y1 = positions.getY(i1);
    const y2 = positions.getY(i2);
    return (y0 + y1 + y2) / 3;
}

function buildBallGeometry({ radius = 1.0, widthSegments = 36, heightSegments = 18 } = {}) {
    const base = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    const positions = getPositionAttr(base);
    const index = getIndexAttr(base);
    if (!positions || !index) return base;

    const regionIds = REGIONS.map((r) => r.id);
    const regionIndexById = new Map(regionIds.map((id, idx) => [id, idx]));
    const trianglesByRegionIndex = regionIds.map(() => []);

    const triCount = Math.floor(index.count / 3);
    for (let t = 0; t < triCount; t++) {
        const a = index.getX(t * 3 + 0);
        const b = index.getX(t * 3 + 1);
        const c = index.getX(t * 3 + 2);
        const y = computeTriangleCentroidY(positions, a, b, c);
        const regionId = classifyBallRegionId(y / radius);
        const regionIndex = regionIndexById.get(regionId);
        if (regionIndex === undefined) continue;
        trianglesByRegionIndex[regionIndex].push(a, b, c);
    }

    const newIndex = [];
    const out = base.clone();
    out.clearGroups();

    let start = 0;
    for (const [regionIndex, tris] of trianglesByRegionIndex.entries()) {
        if (!tris.length) continue;
        newIndex.push(...tris);
        out.addGroup(start, tris.length, regionIndex);
        start += tris.length;
    }

    out.setIndex(newIndex);
    out.computeVertexNormals();
    out.translate(0, radius, 0);
    return out;
}

function makeRegionMaterials(regions, { wireframe = false } = {}) {
    return regions.map((region) => new THREE.MeshStandardMaterial({
        color: region.color ?? 0xffffff,
        metalness: 0.0,
        roughness: 0.65,
        wireframe: !!wireframe
    }));
}

function makeSolidMaterial({ wireframe = false } = {}) {
    return new THREE.MeshStandardMaterial({
        color: 0xd7dde7,
        metalness: 0.0,
        roughness: 0.7,
        wireframe: !!wireframe
    });
}

export function createAsset() {
    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    const geometry = buildBallGeometry({ radius: 1.0, widthSegments: 36, heightSegments: 18 });

    const semanticMaterials = makeRegionMaterials(regions, { wireframe: false });
    const solidMaterial = makeSolidMaterial({ wireframe: false });
    const mesh = new THREE.Mesh(geometry, semanticMaterials);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    return {
        id,
        name: 'Ball',
        source: { type: 'SphereGeometry', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterial }
    };
}
