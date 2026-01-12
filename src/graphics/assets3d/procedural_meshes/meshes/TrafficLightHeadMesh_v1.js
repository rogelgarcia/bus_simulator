// src/graphics/assets3d/procedural_meshes/meshes/TrafficLightHeadMesh_v1.js
// Generates a traffic light head mesh with stable region identifiers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTrafficLightHeadSkeletonApi } from '../skeletons/TrafficLightHeadSkeleton_v1.js';

export const MESH_ID = 'mesh.traffic_light_head.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Traffic light head' });

export const REGIONS = Object.freeze([
    { id: 'traffic_light_head:housing', label: 'Housing', tag: 'housing', color: 0x93a3b8 },
    { id: 'traffic_light_head:light_red', label: 'Red light', tag: 'light', color: 0xff4d4d },
    { id: 'traffic_light_head:light_yellow', label: 'Yellow light', tag: 'light', color: 0xffd166 },
    { id: 'traffic_light_head:light_green', label: 'Green light', tag: 'light', color: 0x5dff91 }
]);

function buildHeadGeometry({
    housingWidth = 0.32,
    housingHeight = 0.78,
    housingDepth = 0.28 / 3,
    lightRadius = 0.082,
    lightDepth = 0.055 / 3,
    lightYOffset = 0.22
} = {}) {
    const housing = new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth, 1, 1, 1);
    housing.translate(0, housingHeight / 2, housingDepth / 2);

    const centerY = housingHeight / 2;
    const makeLight = (y) => {
        const geo = new THREE.CylinderGeometry(lightRadius, lightRadius, lightDepth, 28, 1, false);
        geo.rotateX(Math.PI / 2);
        geo.translate(0, centerY + y, housingDepth + lightDepth / 2);
        return geo;
    };

    const red = makeLight(lightYOffset);
    const yellow = makeLight(0);
    const green = makeLight(-lightYOffset);

    const merged = mergeGeometries([housing, red, yellow, green], true);
    if (!merged) return null;
    merged.computeVertexNormals();
    return merged;
}

function makeRegionMaterials(regions, { wireframe = false } = {}) {
    return regions.map((region) => new THREE.MeshStandardMaterial({
        color: region.color ?? 0xffffff,
        metalness: 0.0,
        roughness: 0.6,
        wireframe: !!wireframe
    }));
}

function makeHousingMaterial({ wireframe = false } = {}) {
    return new THREE.MeshPhysicalMaterial({
        color: 0x1b232d,
        metalness: 0.1,
        roughness: 0.62,
        clearcoat: 0.25,
        clearcoatRoughness: 0.35,
        wireframe: !!wireframe
    });
}

function makeLightMaterial(color, { wireframe = false } = {}) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.8,
        metalness: 0.0,
        roughness: 0.25,
        wireframe: !!wireframe
    });
}

export function createAsset() {
    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    const geometry = buildHeadGeometry();

    const semanticMaterials = makeRegionMaterials(regions, { wireframe: false });
    const solidMaterials = [
        makeHousingMaterial({ wireframe: false }),
        makeLightMaterial(0xff3d3d, { wireframe: false }),
        makeLightMaterial(0xffd166, { wireframe: false }),
        makeLightMaterial(0x3dff7a, { wireframe: false })
    ];

    const mesh = new THREE.Mesh(geometry, semanticMaterials);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    mesh.userData.api = createTrafficLightHeadSkeletonApi({
        regions,
        materials: { semantic: semanticMaterials, solid: solidMaterials }
    });

    return {
        id,
        name: 'Traffic light head',
        source: { type: 'TrafficLightHeadMesh', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterials }
    };
}
