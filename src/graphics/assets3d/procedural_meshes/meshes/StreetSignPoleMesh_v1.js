// src/graphics/assets3d/procedural_meshes/meshes/StreetSignPoleMesh_v1.js
// Generates a street sign pole mesh with stable region identifiers.
import * as THREE from 'three';

export const MESH_ID = 'mesh.street_sign_pole.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Street sign pole' });

export const REGIONS = Object.freeze([
    { id: 'street_sign_pole:body', label: 'Pole', tag: 'pole', color: 0x6c8cff }
]);

function groupSpanCount(geometry) {
    const index = geometry?.index;
    if (index && index.isBufferAttribute) return index.count;
    const pos = geometry?.attributes?.position;
    if (pos && pos.isBufferAttribute) return pos.count;
    return 0;
}

function buildPoleGeometry({ radius = 0.055 * 0.9, height = 3.0 * 0.8, radialSegments = 6 } = {}) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    geometry.translate(0, -1.2 + height / 2, 0);
    geometry.clearGroups();
    const span = groupSpanCount(geometry);
    if (span > 0) geometry.addGroup(0, span, 0);
    geometry.computeVertexNormals();
    return geometry;
}

function makeRegionMaterials(regions, { wireframe = false } = {}) {
    return regions.map((region) => new THREE.MeshStandardMaterial({
        color: region.color ?? 0xffffff,
        metalness: 0.0,
        roughness: 0.65,
        wireframe: !!wireframe
    }));
}

function makePoleMaterial({ wireframe = false } = {}) {
    return new THREE.MeshPhysicalMaterial({
        color: 0x0b0f14,
        metalness: 0.15,
        roughness: 0.55,
        clearcoat: 0.35,
        clearcoatRoughness: 0.25,
        wireframe: !!wireframe
    });
}

export function createAsset() {
    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    const geometry = buildPoleGeometry();

    const semanticMaterials = makeRegionMaterials(regions, { wireframe: false });
    const solidMaterial = makePoleMaterial({ wireframe: false });
    const mesh = new THREE.Mesh(geometry, semanticMaterials);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    return {
        id,
        name: 'Street sign pole',
        source: { type: 'StreetSignPoleMesh', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterial }
    };
}
