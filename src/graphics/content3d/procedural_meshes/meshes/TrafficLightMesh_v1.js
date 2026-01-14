// src/graphics/content3d/procedural_meshes/meshes/TrafficLightMesh_v1.js
// Generates a composed traffic light mesh using pole and head assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TrafficLightPoleMeshV1 from './TrafficLightPoleMesh_v1.js';
import * as TrafficLightHeadMeshV1 from './TrafficLightHeadMesh_v1.js';
import { clampNumber, createNumberProperty } from '../../../../app/prefabs/PrefabParamsSchema.js';
import { createCompositeRig } from '../../../../app/rigs/CompositeRig.js';
import { createTrafficLightHeadLegacySkeletonApi, createTrafficLightHeadRig } from '../rigs/TrafficLightHeadRig_v1.js';
import { computeBoundingBox, computeIndexedBoundingBox, extractRegionGeometries } from '../../../engine3d/procedural_meshes/RegionGeometry.js';
import { cloneSolidMaterials, disposeMaterials, makeRegionMaterials } from '../../../engine3d/procedural_meshes/RegionMaterials.js';

export const MESH_ID = 'mesh.traffic_light.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Traffic light' });

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
        const semanticMaterials = makeRegionMaterials(regions, { wireframe: false, metalness: 0.0, roughness: 0.65 });

        const poleSolid = cloneSolidMaterials(poleAsset?.materials?.solid ?? null, poleRegions.length);
        const headSolid = cloneSolidMaterials(headAsset?.materials?.solid ?? null, headRegions.length);
        const solidMaterials = [...poleSolid, ...headSolid];

        const mesh = new THREE.Mesh(geometry, semanticMaterials);
        mesh.name = id;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.rotation.y = Math.PI;

        const headRig = createTrafficLightHeadRig({
            regions,
            materials: { semantic: semanticMaterials, solid: solidMaterials }
        });

        const rig = createCompositeRig({
            id: 'rig.traffic_light.v1',
            label: 'Traffic light',
            children: [{ key: 'head', rig: headRig, label: 'Head' }],
            aliases: [{ id: 'signal', label: 'Signal', path: 'head.signal' }]
        });
        mesh.userData.rig = rig;

        const params = { armLength: armLengthProp.defaultValue };
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

        const prefab = {
            schema: Object.freeze({
                id: 'prefab_params.traffic_light.v1',
                label: 'Traffic light',
                properties: Object.freeze([armLengthProp]),
                children: Object.freeze([])
            }),
            children: [],
            getParam: (propId) => {
                if (propId === 'armLength') return params.armLength;
                return null;
            },
            setParam: (propId, value) => {
                if (propId !== 'armLength') return;
                const next = clampNumber(value, armLengthProp);
                if (Math.abs(next - params.armLength) < 1e-9) return;
                params.armLength = next;
                const nextGeo = rebuildGeometry(next);
                if (!nextGeo) return;
                const prev = mesh.geometry;
                mesh.geometry = nextGeo;
                prev?.dispose?.();
                mesh.userData._meshInspectorNeedsEdgesRefresh = true;
            }
        };
        mesh.userData.prefab = prefab;

        const legacyHead = createTrafficLightHeadLegacySkeletonApi(headRig);
        const legacySchema = Object.freeze({
            id: 'skeleton.traffic_light.v1',
            label: 'Traffic light',
            properties: Object.freeze([armLengthProp]),
            children: Object.freeze([legacyHead?.schema ?? null].filter(Boolean))
        });

        mesh.userData.api = {
            schema: legacySchema,
            children: legacyHead ? [legacyHead] : [],
            getValue: (propId) => prefab.getParam(propId),
            setValue: (propId, value) => prefab.setParam(propId, value)
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
