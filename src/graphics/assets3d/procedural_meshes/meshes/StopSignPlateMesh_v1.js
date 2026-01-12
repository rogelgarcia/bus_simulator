// src/graphics/assets3d/procedural_meshes/meshes/StopSignPlateMesh_v1.js
// Generates a textured stop sign plate mesh with stable region identifiers.
import * as THREE from 'three';
import { getSignAssetById } from '../../textures/signs/SignAssets.js';

export const MESH_ID = 'mesh.stop_sign_plate.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Stop sign plate' });

export const STOP_SIGN_TEXTURE_ID = 'sign.basic.stop';

export const REGIONS = Object.freeze([
    { id: 'stop_sign_plate:edge', label: 'Edge', tag: 'plate', color: 0x5e6b7a },
    { id: 'stop_sign_plate:face', label: 'Face', tag: 'plate', color: 0xff3d3d },
    { id: 'stop_sign_plate:back', label: 'Back', tag: 'plate', color: 0x2a343f }
]);

function applyAtlasUvToGroup(geometry, materialIndex, { offset, repeat }) {
    const group = (geometry?.groups ?? []).find((g) => g?.materialIndex === materialIndex) ?? null;
    const uv = geometry?.attributes?.uv ?? null;
    const index = geometry?.index ?? null;
    if (!group || !uv?.isBufferAttribute || !index?.isBufferAttribute) return;

    const offX = Number(offset?.x) || 0;
    const offY = Number(offset?.y) || 0;
    const repX = Number(repeat?.x) || 1;
    const repY = Number(repeat?.y) || 1;

    const start = group.start ?? 0;
    const end = start + (group.count ?? 0);
    const seen = new Set();
    for (let i = start; i < end; i++) {
        const vi = index.getX(i);
        if (seen.has(vi)) continue;
        seen.add(vi);
        const u = uv.getX(vi);
        const v = uv.getY(vi);
        uv.setXY(vi, offX + u * repX, offY + v * repY);
    }
    uv.needsUpdate = true;
}

function buildPlateGeometry({
    radius = 0.34,
    thickness = 0.04,
    radialSegments = 6
} = {}) {
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, radialSegments, 1, false);
    geometry.rotateX(Math.PI / 2);

    const sign = getSignAssetById(STOP_SIGN_TEXTURE_ID);
    const { offset, repeat } = sign.getTextureDescriptor();
    applyAtlasUvToGroup(geometry, 1, { offset, repeat });

    geometry.computeVertexNormals();
    return geometry;
}

function makeRegionMaterials(regions, { wireframe = false, map = null } = {}) {
    return regions.map((region) => {
        if (region?.id === 'stop_sign_plate:face' && map) {
            return new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map,
                metalness: 0.0,
                roughness: 0.75,
                wireframe: !!wireframe
            });
        }
        return new THREE.MeshStandardMaterial({
            color: region.color ?? 0xffffff,
            metalness: 0.0,
            roughness: 0.72,
            wireframe: !!wireframe
        });
    });
}

function makeSolidMaterials(regions, { map = null } = {}) {
    return regions.map((region) => {
        if (region?.id === 'stop_sign_plate:face' && map) {
            return new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map,
                metalness: 0.02,
                roughness: 0.65
            });
        }
        return new THREE.MeshPhysicalMaterial({
            color: region.color ?? 0xffffff,
            metalness: 0.12,
            roughness: 0.55,
            clearcoat: 0.15,
            clearcoatRoughness: 0.35
        });
    });
}

export function createAsset() {
    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    const geometry = buildPlateGeometry();

    const atlasTexture = getSignAssetById(STOP_SIGN_TEXTURE_ID).getAtlasTexture();
    const semanticMaterials = makeRegionMaterials(regions, { wireframe: false, map: atlasTexture });
    const solidMaterials = makeSolidMaterials(regions, { map: atlasTexture });

    const mesh = new THREE.Mesh(geometry, semanticMaterials);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    return {
        id,
        name: 'Stop sign plate',
        source: { type: 'StopSignPlateMesh', version: 1, textureId: STOP_SIGN_TEXTURE_ID },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterials }
    };
}

