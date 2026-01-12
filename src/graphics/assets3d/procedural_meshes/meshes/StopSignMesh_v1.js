// src/graphics/assets3d/procedural_meshes/meshes/StopSignMesh_v1.js
// Generates a composed stop sign mesh using pole and plate assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getSignAssetById } from '../../textures/signs/SignAssets.js';
import * as StreetSignPoleMeshV1 from './StreetSignPoleMesh_v1.js';
import * as StopSignPlateMeshV1 from './StopSignPlateMesh_v1.js';

export const MESH_ID = 'mesh.stop_sign.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Stop sign' });

function computeBoundingBox(geometry) {
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return geometry.boundingBox ?? null;
}

function cloneGeometryGroup(geometry, group) {
    const out = geometry.clone();
    out.clearGroups();

    const index = out.index;
    if (!index || !index.isBufferAttribute) return out;

    const start = Number.isInteger(group?.start) ? group.start : 0;
    const count = Number.isInteger(group?.count) ? group.count : 0;
    const sliced = index.array.slice(start, start + count);
    out.setIndex(new THREE.BufferAttribute(sliced, 1));
    return out;
}

function extractRegionGeometries(geometry, regionCount) {
    const groups = geometry?.groups ?? [];
    const groupByMaterialIndex = new Map();
    for (const group of groups) {
        const materialIndex = group?.materialIndex;
        if (!Number.isInteger(materialIndex) || materialIndex < 0 || materialIndex >= regionCount) continue;
        groupByMaterialIndex.set(materialIndex, group);
    }

    const out = [];
    for (let i = 0; i < regionCount; i++) {
        const group = groupByMaterialIndex.get(i) ?? null;
        if (!group) return null;
        out.push(cloneGeometryGroup(geometry, group));
    }
    return out;
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
            roughness: 0.65,
            wireframe: !!wireframe
        });
    });
}

function disposeMaterials(materials) {
    if (!materials) return;
    if (Array.isArray(materials)) {
        for (const m of materials) m?.dispose?.();
        return;
    }
    materials?.dispose?.();
}

function cloneMaterials(materials, count) {
    if (Array.isArray(materials)) return materials.map((m) => m?.clone?.() ?? null).slice(0, count);
    const base = materials?.clone?.() ?? materials ?? null;
    return new Array(count).fill(null).map(() => base?.clone?.() ?? base);
}

export function createAsset() {
    const poleAsset = StreetSignPoleMeshV1.createAsset();
    const plateAsset = StopSignPlateMeshV1.createAsset();

    try {
        const poleRegions = poleAsset?.regions ?? [];
        const plateRegions = plateAsset?.regions ?? [];
        const regions = [...poleRegions, ...plateRegions].map((r) => ({ ...r }));

        const poleGeo = poleAsset?.mesh?.geometry ?? null;
        const plateGeo = plateAsset?.mesh?.geometry ?? null;
        const poleParts = extractRegionGeometries(poleGeo, poleRegions.length);
        const plateParts = extractRegionGeometries(plateGeo, plateRegions.length);
        if (!poleParts || !plateParts) throw new Error('StopSignMesh: missing region geometry groups.');

        const poleBox = computeBoundingBox(poleGeo);
        const plateBox = computeBoundingBox(plateGeo);

        if (poleBox && plateBox) {
            const plateCenterY = (plateBox.min.y + plateBox.max.y) / 2;
            const plateHeight = plateBox.max.y - plateBox.min.y;
            const targetCenterY = poleBox.max.y - plateHeight * 0.45;

            const poleFrontZ = poleBox.max.z;
            const gap = 0.03;
            const targetBackZ = poleFrontZ + gap;

            const translation = new THREE.Matrix4().makeTranslation(
                0,
                targetCenterY - plateCenterY,
                targetBackZ - plateBox.min.z
            );

            for (const geo of plateParts) geo?.applyMatrix4?.(translation);
        }

        const mergedParts = [...poleParts, ...plateParts];
        const geometry = mergeGeometries(mergedParts, true);
        if (!geometry) throw new Error('StopSignMesh: failed to merge geometries.');
        geometry.computeVertexNormals();

        const id = MESH_ID;
        const atlasTexture = getSignAssetById(StopSignPlateMeshV1.STOP_SIGN_TEXTURE_ID).getAtlasTexture();
        const semanticMaterials = makeRegionMaterials(regions, { wireframe: false, map: atlasTexture });

        const poleSolid = cloneMaterials(poleAsset?.materials?.solid ?? null, poleRegions.length);
        const plateSolid = cloneMaterials(plateAsset?.materials?.solid ?? null, plateRegions.length);
        const solidMaterials = [...poleSolid, ...plateSolid];

        const mesh = new THREE.Mesh(geometry, semanticMaterials);
        mesh.name = id;
        mesh.castShadow = true;
        mesh.receiveShadow = false;

        return {
            id,
            name: 'Stop sign',
            source: {
                type: 'StopSignMesh',
                version: 1,
                parts: [StreetSignPoleMeshV1.MESH_ID, StopSignPlateMeshV1.MESH_ID]
            },
            regions,
            mesh,
            materials: { semantic: semanticMaterials, solid: solidMaterials }
        };
    } finally {
        poleAsset?.mesh?.geometry?.dispose?.();
        plateAsset?.mesh?.geometry?.dispose?.();
        disposeMaterials(poleAsset?.materials?.semantic ?? null);
        disposeMaterials(poleAsset?.materials?.solid ?? null);
        disposeMaterials(plateAsset?.materials?.semantic ?? null);
        disposeMaterials(plateAsset?.materials?.solid ?? null);
    }
}

