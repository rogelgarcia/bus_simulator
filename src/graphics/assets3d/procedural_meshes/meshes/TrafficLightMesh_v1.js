// src/graphics/assets3d/procedural_meshes/meshes/TrafficLightMesh_v1.js
// Generates a composed traffic light mesh using pole and head assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TrafficLightPoleMeshV1 from './TrafficLightPoleMesh_v1.js';
import * as TrafficLightHeadMeshV1 from './TrafficLightHeadMesh_v1.js';

export const MESH_ID = 'mesh.traffic_light.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Traffic light' });

function computeBoundingBox(geometry) {
    if (!geometry) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return geometry.boundingBox ?? null;
}

function computeIndexedBoundingBox(geometry) {
    const positions = geometry?.attributes?.position;
    if (!positions || !positions.isBufferAttribute) return computeBoundingBox(geometry);

    const index = geometry?.index;
    const out = new THREE.Box3();
    out.makeEmpty();

    if (index && index.isBufferAttribute) {
        const idxCount = index.count;
        const v = new THREE.Vector3();
        for (let i = 0; i < idxCount; i++) {
            const vi = index.getX(i);
            v.fromBufferAttribute(positions, vi);
            out.expandByPoint(v);
        }
        return out;
    }

    out.setFromBufferAttribute(positions);
    return out;
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

function makeRegionMaterials(regions, { wireframe = false } = {}) {
    return regions.map((region) => new THREE.MeshStandardMaterial({
        color: region.color ?? 0xffffff,
        metalness: 0.0,
        roughness: 0.65,
        wireframe: !!wireframe
    }));
}

function disposeMaterials(materials) {
    if (!materials) return;
    if (Array.isArray(materials)) {
        for (const m of materials) m?.dispose?.();
        return;
    }
    materials?.dispose?.();
}

function cloneSolidMaterials(materials, count) {
    if (Array.isArray(materials)) return materials.map((m) => m?.clone?.() ?? null).slice(0, count);
    const base = materials?.clone?.() ?? materials ?? null;
    return new Array(count).fill(null).map(() => base?.clone?.() ?? base);
}

export function createAsset() {
    const poleAsset = TrafficLightPoleMeshV1.createAsset();
    const headAsset = TrafficLightHeadMeshV1.createAsset();
    let rotatedHeadGeo = null;

    try {
        const poleRegions = poleAsset?.regions ?? [];
        const headRegions = headAsset?.regions ?? [];
        const regions = [...poleRegions, ...headRegions].map((r) => ({ ...r }));

        const poleGeo = poleAsset?.mesh?.geometry ?? null;
        const headGeo = headAsset?.mesh?.geometry ?? null;
        const poleParts = extractRegionGeometries(poleGeo, poleRegions.length);
        const headParts = extractRegionGeometries(headGeo, headRegions.length);
        if (!poleParts || !headParts) throw new Error('TrafficLightMesh: missing region geometry groups.');

        const poleCounterRotation = new THREE.Matrix4().makeRotationY(Math.PI);
        for (const geo of poleParts) geo?.applyMatrix4?.(poleCounterRotation);

        const armRegionIndex = poleRegions.findIndex((r) => r?.id === 'traffic_light_pole:arm');
        const armGeo = armRegionIndex >= 0 ? poleParts[armRegionIndex] : null;
        const armBox = computeIndexedBoundingBox(armGeo);

        const headRotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
        rotatedHeadGeo = headGeo?.clone?.() ?? null;
        if (!rotatedHeadGeo) throw new Error('TrafficLightMesh: missing head geometry.');
        rotatedHeadGeo.applyMatrix4(headRotation);
        rotatedHeadGeo.computeBoundingBox();
        const headBox = rotatedHeadGeo.boundingBox ?? null;
        const headSourceBox = computeBoundingBox(headGeo);
        const headDepth = headSourceBox ? headSourceBox.max.z - headSourceBox.min.z : 0;

        if (armBox && headBox) {
            const attachX = armBox.max.x;
            const attachY = (armBox.min.y + armBox.max.y) / 2;
            const attachZ = (armBox.min.z + armBox.max.z) / 2;

            const headCenterX = (headBox.min.x + headBox.max.x) / 2;
            const headMaxY = headBox.max.y;
            const headHeight = headBox.max.y - headBox.min.y;
            const headCenterZ = (headBox.min.z + headBox.max.z) / 2;

            const translation = new THREE.Matrix4().makeTranslation(
                attachX - headCenterX,
                attachY - headMaxY + headHeight * 0.5,
                attachZ - headCenterZ - headDepth
            );

            const transform = new THREE.Matrix4().copy(translation).multiply(headRotation);
            for (const geo of headParts) geo?.applyMatrix4?.(transform);
        }

        const mergedParts = [...poleParts, ...headParts];
        const geometry = mergeGeometries(mergedParts, true);
        if (!geometry) throw new Error('TrafficLightMesh: failed to merge geometries.');
        geometry.computeVertexNormals();

        const id = MESH_ID;
        const semanticMaterials = makeRegionMaterials(regions, { wireframe: false });

        const poleSolid = cloneSolidMaterials(poleAsset?.materials?.solid ?? null, poleRegions.length);
        const headSolid = cloneSolidMaterials(headAsset?.materials?.solid ?? null, headRegions.length);
        const solidMaterials = [...poleSolid, ...headSolid];

        const mesh = new THREE.Mesh(geometry, semanticMaterials);
        mesh.name = id;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.rotation.y = Math.PI;

        return {
            id,
            name: 'Traffic light',
            source: {
                type: 'TrafficLightMesh',
                version: 1,
                parts: [TrafficLightPoleMeshV1.MESH_ID, TrafficLightHeadMeshV1.MESH_ID]
            },
            regions,
            mesh,
            materials: { semantic: semanticMaterials, solid: solidMaterials }
        };
    } finally {
        rotatedHeadGeo?.dispose?.();
        poleAsset?.mesh?.geometry?.dispose?.();
        headAsset?.mesh?.geometry?.dispose?.();
        disposeMaterials(poleAsset?.materials?.semantic ?? null);
        disposeMaterials(poleAsset?.materials?.solid ?? null);
        disposeMaterials(headAsset?.materials?.semantic ?? null);
        disposeMaterials(headAsset?.materials?.solid ?? null);
    }
}
