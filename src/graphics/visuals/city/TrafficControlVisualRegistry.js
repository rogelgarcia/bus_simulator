// src/graphics/visuals/city/TrafficControlVisualRegistry.js
// Central registry for traffic-control kind->visual selection and rig parameter application.
import { createProceduralMeshAsset, PROCEDURAL_MESH } from '../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';

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

const TRAFFIC_CONTROL_VISUALS = Object.freeze({
    traffic_light: Object.freeze({
        kind: 'traffic_light',
        meshId: PROCEDURAL_MESH.TRAFFIC_LIGHT_V1,
        instanceName: 'TrafficLight',
        createAsset() {
            return createProceduralMeshAsset(PROCEDURAL_MESH.TRAFFIC_LIGHT_V1);
        },
        applyPlacement(asset, placement) {
            if (Number.isFinite(placement?.armLength)) setTrafficLightArmLength(asset, placement.armLength);
            setTrafficLightActive(asset, 'red');
        }
    }),
    stop_sign: Object.freeze({
        kind: 'stop_sign',
        meshId: PROCEDURAL_MESH.STOP_SIGN_V1,
        instanceName: 'StopSign',
        createAsset() {
            return createProceduralMeshAsset(PROCEDURAL_MESH.STOP_SIGN_V1);
        },
        applyPlacement() {}
    })
});

export function getTrafficControlVisualSpec(kind) {
    const id = typeof kind === 'string' ? kind : '';
    return TRAFFIC_CONTROL_VISUALS[id] ?? null;
}

export function createTrafficControlVisualAsset(kind, { useSolidMaterials = true } = {}) {
    const spec = getTrafficControlVisualSpec(kind);
    if (!spec) return null;
    const asset = spec.createAsset?.() ?? null;
    if (useSolidMaterials) applySolidMaterials(asset);
    return { spec, asset };
}

