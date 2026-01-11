// src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js
// Defines procedural meshes with stable ids and stable region identifiers.
import * as THREE from 'three';

export const PROCEDURAL_MESH = Object.freeze({
    BALL_V1: 'mesh.ball.v1'
});

const BALL_REGIONS = Object.freeze([
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

    const regionOrder = BALL_REGIONS.map((r) => r.id);
    const trianglesByRegion = new Map(regionOrder.map((id) => [id, []]));

    const triCount = Math.floor(index.count / 3);
    for (let t = 0; t < triCount; t++) {
        const a = index.getX(t * 3 + 0);
        const b = index.getX(t * 3 + 1);
        const c = index.getX(t * 3 + 2);
        const y = computeTriangleCentroidY(positions, a, b, c);
        const regionId = classifyBallRegionId(y / radius);
        const bucket = trianglesByRegion.get(regionId);
        if (!bucket) continue;
        bucket.push(a, b, c);
    }

    const newIndex = [];
    const groupRanges = [];
    let start = 0;

    for (const regionId of regionOrder) {
        const tris = trianglesByRegion.get(regionId) ?? [];
        if (!tris.length) continue;
        newIndex.push(...tris);
        groupRanges.push({ regionId, start, count: tris.length });
        start += tris.length;
    }

    const out = base.clone();
    out.clearGroups();
    out.setIndex(newIndex);
    for (const [matIndex, group] of groupRanges.entries()) {
        out.addGroup(group.start, group.count, matIndex);
    }
    out.computeVertexNormals();
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

export function getProceduralMeshOptions() {
    return [
        { id: PROCEDURAL_MESH.BALL_V1, label: 'Ball' }
    ];
}

export function createProceduralMeshAsset(meshId) {
    const id = typeof meshId === 'string' ? meshId : PROCEDURAL_MESH.BALL_V1;
    if (id !== PROCEDURAL_MESH.BALL_V1) return createProceduralMeshAsset(PROCEDURAL_MESH.BALL_V1);

    const regions = BALL_REGIONS.map((r) => ({ ...r }));
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

