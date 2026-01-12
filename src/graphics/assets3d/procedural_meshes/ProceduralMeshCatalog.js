// src/graphics/assets3d/procedural_meshes/ProceduralMeshCatalog.js
// Defines procedural meshes with stable ids and stable region identifiers.
import * as BallMeshV1 from './meshes/BallMesh_v1.js';
import * as StreetSignPoleMeshV1 from './meshes/StreetSignPoleMesh_v1.js';
import * as TrafficLightPoleMeshV1 from './meshes/TrafficLightPoleMesh_v1.js';
import * as TrafficLightHeadMeshV1 from './meshes/TrafficLightHeadMesh_v1.js';
import * as TrafficLightMeshV1 from './meshes/TrafficLightMesh_v1.js';
import * as StopSignPlateMeshV1 from './meshes/StopSignPlateMesh_v1.js';
import * as StopSignMeshV1 from './meshes/StopSignMesh_v1.js';

export const PROCEDURAL_MESH = Object.freeze({
    BALL_V1: BallMeshV1.MESH_ID,
    STREET_SIGN_POLE_V1: StreetSignPoleMeshV1.MESH_ID,
    TRAFFIC_LIGHT_POLE_V1: TrafficLightPoleMeshV1.MESH_ID,
    TRAFFIC_LIGHT_HEAD_V1: TrafficLightHeadMeshV1.MESH_ID,
    TRAFFIC_LIGHT_V1: TrafficLightMeshV1.MESH_ID,
    STOP_SIGN_PLATE_V1: StopSignPlateMeshV1.MESH_ID,
    STOP_SIGN_V1: StopSignMeshV1.MESH_ID
});

const MESH_MODULES = [
    BallMeshV1,
    StreetSignPoleMeshV1,
    TrafficLightPoleMeshV1,
    TrafficLightHeadMeshV1,
    TrafficLightMeshV1,
    StopSignPlateMeshV1,
    StopSignMeshV1
];

const MESH_BY_ID = new Map(MESH_MODULES.map((mesh) => [mesh.MESH_ID, mesh]));

export function getProceduralMeshOptions() {
    return MESH_MODULES.map((mesh) => mesh.MESH_OPTION);
}

export function createProceduralMeshAsset(meshId) {
    const id = typeof meshId === 'string' ? meshId : PROCEDURAL_MESH.BALL_V1;
    const mesh = MESH_BY_ID.get(id) ?? MESH_BY_ID.get(PROCEDURAL_MESH.BALL_V1);
    return mesh.createAsset();
}
