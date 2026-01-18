// src/graphics/content3d/catalogs/ProceduralMeshCatalog.js
// Defines procedural meshes with stable ids and stable region identifiers.
import * as BallMeshV1 from '../../assets3d/procedural_meshes/meshes/BallMesh_v1.js';
import * as StreetSignPoleMeshV1 from '../../assets3d/procedural_meshes/meshes/StreetSignPoleMesh_v1.js';
import * as StopSignPlateMeshV1 from '../../assets3d/procedural_meshes/meshes/StopSignPlateMesh_v1.js';
import * as StopSignMeshV1 from '../../assets3d/procedural_meshes/meshes/StopSignMesh_v1.js';
import * as TrafficLightPoleMeshV1 from '../procedural_meshes/meshes/TrafficLightPoleMesh_v1.js';
import * as TrafficLightHeadMeshV1 from '../procedural_meshes/meshes/TrafficLightHeadMesh_v1.js';
import * as TrafficLightMeshV1 from '../procedural_meshes/meshes/TrafficLightMesh_v1.js';

export const PROCEDURAL_MESH = Object.freeze({
    BALL_V1: BallMeshV1.MESH_ID,
    STREET_SIGN_POLE_V1: StreetSignPoleMeshV1.MESH_ID,
    TRAFFIC_LIGHT_POLE_V1: TrafficLightPoleMeshV1.MESH_ID,
    TRAFFIC_LIGHT_HEAD_V1: TrafficLightHeadMeshV1.MESH_ID,
    TRAFFIC_LIGHT_V1: TrafficLightMeshV1.MESH_ID,
    STOP_SIGN_PLATE_V1: StopSignPlateMeshV1.MESH_ID,
    STOP_SIGN_V1: StopSignMeshV1.MESH_ID
});

export const PROCEDURAL_MESH_COLLECTION = Object.freeze({
    DEBUG: 'mesh_collection.debug',
    URBAN: 'mesh_collection.urban'
});

export const PROCEDURAL_MESH_COLLECTIONS = Object.freeze([
    { id: PROCEDURAL_MESH_COLLECTION.URBAN, label: 'Urban' },
    { id: PROCEDURAL_MESH_COLLECTION.DEBUG, label: 'Debug' }
]);

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

const COLLECTION_BY_MESH_ID = new Map([
    [PROCEDURAL_MESH.BALL_V1, PROCEDURAL_MESH_COLLECTION.DEBUG],
    [PROCEDURAL_MESH.STREET_SIGN_POLE_V1, PROCEDURAL_MESH_COLLECTION.URBAN],
    [PROCEDURAL_MESH.STOP_SIGN_PLATE_V1, PROCEDURAL_MESH_COLLECTION.URBAN],
    [PROCEDURAL_MESH.STOP_SIGN_V1, PROCEDURAL_MESH_COLLECTION.URBAN],
    [PROCEDURAL_MESH.TRAFFIC_LIGHT_POLE_V1, PROCEDURAL_MESH_COLLECTION.URBAN],
    [PROCEDURAL_MESH.TRAFFIC_LIGHT_HEAD_V1, PROCEDURAL_MESH_COLLECTION.URBAN],
    [PROCEDURAL_MESH.TRAFFIC_LIGHT_V1, PROCEDURAL_MESH_COLLECTION.URBAN]
]);

export function getProceduralMeshCollectionId(meshId) {
    const id = typeof meshId === 'string' ? meshId : '';
    return COLLECTION_BY_MESH_ID.get(id) ?? null;
}

export function getProceduralMeshCollections() {
    const options = getProceduralMeshOptions();
    const counts = new Map(PROCEDURAL_MESH_COLLECTIONS.map((c) => [c.id, 0]));
    for (const opt of options) {
        const id = opt?.collectionId ?? null;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return PROCEDURAL_MESH_COLLECTIONS
        .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
        .filter((c) => c.count > 0);
}

export function getProceduralMeshOptions() {
    return MESH_MODULES.map((mesh) => {
        const id = mesh.MESH_ID;
        const collectionId = COLLECTION_BY_MESH_ID.get(id) ?? PROCEDURAL_MESH_COLLECTION.DEBUG;
        return { ...mesh.MESH_OPTION, collectionId };
    });
}

export function getProceduralMeshOptionsForCollection(collectionId) {
    const id = typeof collectionId === 'string' ? collectionId : '';
    const list = getProceduralMeshOptions();
    if (!id) return list;
    return list.filter((opt) => opt?.collectionId === id);
}

export function createProceduralMeshAsset(meshId) {
    const id = typeof meshId === 'string' ? meshId : PROCEDURAL_MESH.BALL_V1;
    const mesh = MESH_BY_ID.get(id) ?? MESH_BY_ID.get(PROCEDURAL_MESH.BALL_V1);
    return mesh.createAsset();
}
