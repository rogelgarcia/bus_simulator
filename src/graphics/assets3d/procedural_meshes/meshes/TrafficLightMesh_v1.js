// src/graphics/assets3d/procedural_meshes/meshes/TrafficLightMesh_v1.js
// Generates a composed traffic light mesh using pole and head assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TrafficLightPoleMeshV1 from './TrafficLightPoleMesh_v1.js';
import * as TrafficLightHeadMeshV1 from './TrafficLightHeadMesh_v1.js';
import { clampNumber, createNumberProperty } from '../skeletons/MeshSkeletonSchema.js';
import { createTrafficLightHeadSkeletonApi } from '../skeletons/TrafficLightHeadSkeleton_v1.js';

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
    const armLengthProp = createNumberProperty({
        id: 'armLength',
        label: 'Arm length',
        min: 0.8,
        max: 4.2,
        step: 0.1,
        defaultValue: 2.2
    });

    const poleAsset = TrafficLightPoleMeshV1.createAsset({ armLength: armLengthProp.defaultValue });
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

        const headRotation = new THREE.Matrix4().makeRotationY(Math.PI);
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
            const headCenterY = (headBox.min.y + headBox.max.y) / 2;
            const headCenterZ = (headBox.min.z + headBox.max.z) / 2;

            const translation = new THREE.Matrix4().makeTranslation(
                attachX - headCenterX,
                attachY - headCenterY,
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

        const headSkeleton = createTrafficLightHeadSkeletonApi({
            regions,
            materials: { semantic: semanticMaterials, solid: solidMaterials }
        });

        const rootSchema = Object.freeze({
            id: 'skeleton.traffic_light.v1',
            label: 'Traffic light',
            properties: Object.freeze([armLengthProp]),
            children: Object.freeze([headSkeleton.schema])
        });

        const state = { armLength: armLengthProp.defaultValue };
        const rebuildGeometry = (armLength) => {
            const poleRebuild = TrafficLightPoleMeshV1.createAsset({ armLength });
            const headRebuild = TrafficLightHeadMeshV1.createAsset();
            let rotated = null;

            try {
                const poleRebuildRegions = poleRebuild?.regions ?? [];
                const headRebuildRegions = headRebuild?.regions ?? [];

                const poleGeo = poleRebuild?.mesh?.geometry ?? null;
                const headGeo = headRebuild?.mesh?.geometry ?? null;
                const poleParts = extractRegionGeometries(poleGeo, poleRebuildRegions.length);
                const headParts = extractRegionGeometries(headGeo, headRebuildRegions.length);
                if (!poleParts || !headParts) return null;

                const poleCounterRotation = new THREE.Matrix4().makeRotationY(Math.PI);
                for (const geo of poleParts) geo?.applyMatrix4?.(poleCounterRotation);

                const armRegionIndex = poleRebuildRegions.findIndex((r) => r?.id === 'traffic_light_pole:arm');
                const armGeo = armRegionIndex >= 0 ? poleParts[armRegionIndex] : null;
                const armBox = computeIndexedBoundingBox(armGeo);

                const headRotation = new THREE.Matrix4().makeRotationY(Math.PI);
                rotated = headGeo?.clone?.() ?? null;
                if (!rotated) return null;
                rotated.applyMatrix4(headRotation);
                rotated.computeBoundingBox();

                const headBox = rotated.boundingBox ?? null;
                const headSourceBox = computeBoundingBox(headGeo);
                const headDepth = headSourceBox ? headSourceBox.max.z - headSourceBox.min.z : 0;

                if (armBox && headBox) {
                    const attachX = armBox.max.x;
                    const attachY = (armBox.min.y + armBox.max.y) / 2;
                    const attachZ = (armBox.min.z + armBox.max.z) / 2;

                    const headCenterX = (headBox.min.x + headBox.max.x) / 2;
                    const headCenterY = (headBox.min.y + headBox.max.y) / 2;
                    const headCenterZ = (headBox.min.z + headBox.max.z) / 2;

                    const translation = new THREE.Matrix4().makeTranslation(
                        attachX - headCenterX,
                        attachY - headCenterY,
                        attachZ - headCenterZ - headDepth
                    );

                    const transform = new THREE.Matrix4().copy(translation).multiply(headRotation);
                    for (const geo of headParts) geo?.applyMatrix4?.(transform);
                }

                const mergedParts = [...poleParts, ...headParts];
                const rebuilt = mergeGeometries(mergedParts, true);
                rebuilt?.computeVertexNormals?.();
                return rebuilt ?? null;
            } finally {
                rotated?.dispose?.();
                poleRebuild?.mesh?.geometry?.dispose?.();
                headRebuild?.mesh?.geometry?.dispose?.();
                disposeMaterials(poleRebuild?.materials?.semantic ?? null);
                disposeMaterials(poleRebuild?.materials?.solid ?? null);
                disposeMaterials(headRebuild?.materials?.semantic ?? null);
                disposeMaterials(headRebuild?.materials?.solid ?? null);
            }
        };

        mesh.userData.api = {
            schema: rootSchema,
            children: [headSkeleton],
            getValue: (propId) => {
                if (propId === 'armLength') return state.armLength;
                return null;
            },
            setValue: (propId, value) => {
                if (propId !== 'armLength') return;
                const next = clampNumber(value, armLengthProp);
                if (Math.abs(next - state.armLength) < 1e-9) return;
                state.armLength = next;
                const nextGeo = rebuildGeometry(next);
                if (!nextGeo) return;
                const prev = mesh.geometry;
                mesh.geometry = nextGeo;
                prev?.dispose?.();
                mesh.userData._meshInspectorNeedsEdgesRefresh = true;
            }
        };

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
