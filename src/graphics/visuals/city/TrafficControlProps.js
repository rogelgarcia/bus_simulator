// src/graphics/visuals/city/TrafficControlProps.js
// Renders traffic control props (traffic lights / stop signs) from placement data.
import * as THREE from 'three';
import { createProceduralMeshAsset, PROCEDURAL_MESH } from '../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';
import { TRAFFIC_CONTROL } from '../../../app/city/TrafficControlPlacement.js';

function applySolidMaterials(asset) {
    const mesh = asset?.mesh ?? null;
    const solid = asset?.materials?.solid ?? null;
    if (!mesh || !solid) return;
    mesh.material = solid;
}

function setTrafficLightArmLength(asset, armLength) {
    const mesh = asset?.mesh ?? null;
    const prefab = mesh?.userData?.prefab ?? null;
    if (prefab && typeof prefab.setParam === 'function') {
        prefab.setParam('armLength', armLength);
        return;
    }
    const legacy = mesh?.userData?.api ?? null;
    if (legacy && typeof legacy.setValue === 'function') legacy.setValue('armLength', armLength);
}

function setTrafficLightActive(asset, activeLight) {
    const mesh = asset?.mesh ?? null;
    const rig = mesh?.userData?.rig ?? null;
    if (rig && typeof rig.setValue === 'function') {
        rig.setValue('signal', activeLight);
        return;
    }
    const legacy = mesh?.userData?.api ?? null;
    const children = Array.isArray(legacy?.children) ? legacy.children : [];
    const head = children.find((child) => child?.schema?.id === 'skeleton.traffic_light_head.v1') ?? null;
    if (head && typeof head.setValue === 'function') head.setValue('activeLight', activeLight);
}

export function createTrafficControlProps({ placements = [], useSolidMaterials = true } = {}) {
    const group = new THREE.Group();
    group.name = 'TrafficControls';

    const list = Array.isArray(placements) ? placements : [];
    for (const placement of list) {
        const kind = placement?.kind ?? null;
        const meshId = kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT
            ? PROCEDURAL_MESH.TRAFFIC_LIGHT_V1
            : (kind === TRAFFIC_CONTROL.STOP_SIGN ? PROCEDURAL_MESH.STOP_SIGN_V1 : null);
        if (!meshId) continue;

        const asset = createProceduralMeshAsset(meshId);
        const mesh = asset?.mesh ?? null;
        if (!mesh) continue;

        if (useSolidMaterials) applySolidMaterials(asset);

        if (kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT) {
            if (Number.isFinite(placement?.armLength)) setTrafficLightArmLength(asset, placement.armLength);
            setTrafficLightActive(asset, 'red');
        }

        const instance = new THREE.Group();
        instance.name = kind === TRAFFIC_CONTROL.TRAFFIC_LIGHT ? 'TrafficLight' : 'StopSign';

        const p = placement?.position ?? null;
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
            instance.position.set(p.x, p.y, p.z);
        }

        const yaw = placement?.rotationY;
        if (Number.isFinite(yaw)) instance.rotation.y = yaw;

        const scale = placement?.scale;
        if (Number.isFinite(scale) && scale > 0) instance.scale.setScalar(scale);

        instance.userData.trafficControl = {
            kind,
            tile: placement?.tile ?? null,
            corner: placement?.corner ?? null,
            approach: placement?.approach ?? null
        };

        instance.add(mesh);
        group.add(instance);
    }

    return { group, placements: list };
}
