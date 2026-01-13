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

function applyAtlasUvToGroup(geometry, materialIndex, { offset, repeat, rotateRad = 0 } = {}) {
    const group = (geometry?.groups ?? []).find((g) => g?.materialIndex === materialIndex) ?? null;
    const uv = geometry?.attributes?.uv ?? null;
    const index = geometry?.index ?? null;
    const pos = geometry?.attributes?.position ?? null;
    if (!group || !uv?.isBufferAttribute || !index?.isBufferAttribute || !pos?.isBufferAttribute) return;

    const offX = Number(offset?.x) || 0;
    const offY = Number(offset?.y) || 0;
    const repX = Number(repeat?.x) || 1;
    const repY = Number(repeat?.y) || 1;
    const rot = Number(rotateRad) || 0;
    const cos = rot ? Math.cos(rot) : 1;
    const sin = rot ? Math.sin(rot) : 0;

    const start = group.start ?? 0;
    const end = start + (group.count ?? 0);
    const vertSet = new Set();
    let maxR = 0;
    for (let i = start; i < end; i++) {
        const vi = index.getX(i);
        if (vertSet.has(vi)) continue;
        vertSet.add(vi);
        const x = pos.getX(vi);
        const y = pos.getY(vi);
        maxR = Math.max(maxR, Math.hypot(x, y));
    }
    if (maxR <= 0) return;

    for (const vi of vertSet) {
        const x = pos.getX(vi);
        const y = pos.getY(vi);
        const u0 = x / (2 * maxR) + 0.5;
        const v0 = y / (2 * maxR) + 0.5;
        const dx = u0 - 0.5;
        const dy = v0 - 0.5;
        const uu = rot ? (dx * cos - dy * sin + 0.5) : u0;
        const vv = rot ? (dx * sin + dy * cos + 0.5) : v0;
        uv.setXY(vi, offX + uu * repX, offY + vv * repY);
    }
    uv.needsUpdate = true;
}

function buildPlateGeometry({
    radius = 0.34,
    thickness = 0.04,
    radialSegments = 8
} = {}) {
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness * 0.2, radialSegments, 1, false);
    geometry.rotateX(Math.PI / 2);
    geometry.rotateZ(Math.PI / radialSegments);

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
