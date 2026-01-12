// src/graphics/assets3d/procedural_meshes/meshes/TrafficLightPoleMesh_v1.js
// Generates a traffic light pole mesh with stable region identifiers.
import * as THREE from 'three';

export const MESH_ID = 'mesh.traffic_light_pole.v1';
export const MESH_OPTION = Object.freeze({ id: MESH_ID, label: 'Traffic light pole' });

export const REGIONS = Object.freeze([
    { id: 'traffic_light_pole:vertical', label: 'Vertical', tag: 'pole', color: 0x7ae7ff },
    { id: 'traffic_light_pole:inclined', label: 'Inclined', tag: 'arm', color: 0xffd166 },
    { id: 'traffic_light_pole:arm', label: 'Arm', tag: 'arm', color: 0xff6b6b }
]);

function buildPoleGeometry({
    radius = 0.055,
    radialSegments = 6,
    bottomY = -1.2,
    verticalHeight = 2.4,
    inclinedLength = 0.55,
    inclinedAngleRad = Math.PI * 0.1,
    armLength = 2.2,
    tubularSegments = 96
} = {}) {
    const topY = bottomY + verticalHeight;
    const axisX = Math.sin(inclinedAngleRad);
    const axisY = Math.cos(inclinedAngleRad);

    const p0 = new THREE.Vector3(0, bottomY, 0);
    const p1 = new THREE.Vector3(0, topY, 0);
    const p2 = new THREE.Vector3(axisX * inclinedLength, topY + axisY * inclinedLength, 0);
    const p3 = new THREE.Vector3(axisX * inclinedLength + armLength, topY + axisY * inclinedLength, 0);

    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(p0, p1));
    path.add(new THREE.LineCurve3(p1, p2));
    path.add(new THREE.LineCurve3(p2, p3));

    const geometry = new THREE.TubeGeometry(path, tubularSegments, radius, radialSegments, false);
    const index = geometry.index;
    if (!index || !index.isBufferAttribute) return geometry;

    const lengths = path.getLengths(tubularSegments);
    const L1 = p0.distanceTo(p1);
    const L2 = L1 + p1.distanceTo(p2);

    const indexCountPerSegment = Math.floor(index.count / tubularSegments);

    let segmentsInGroup = 0;
    let currentRegion = null;
    let startIndex = 0;

    geometry.clearGroups();
    for (let s = 0; s < tubularSegments; s++) {
        const midLen = (lengths[s] + lengths[s + 1]) * 0.5;
        const region = midLen < L1 ? 0 : (midLen < L2 ? 1 : 2);
        if (currentRegion === null) {
            currentRegion = region;
            segmentsInGroup = 1;
            continue;
        }
        if (region === currentRegion) {
            segmentsInGroup++;
            continue;
        }

        const count = segmentsInGroup * indexCountPerSegment;
        geometry.addGroup(startIndex, count, currentRegion);
        startIndex += count;
        currentRegion = region;
        segmentsInGroup = 1;
    }

    if (currentRegion !== null) {
        const count = index.count - startIndex;
        geometry.addGroup(startIndex, count, currentRegion);
    }

    geometry.rotateY(Math.PI);
    geometry.computeVertexNormals();
    return geometry;
}

function makeRegionMaterials(regions, { wireframe = false } = {}) {
    return regions.map((region) => new THREE.MeshStandardMaterial({
        color: region.color ?? 0xffffff,
        metalness: 0.0,
        roughness: 0.65,
        wireframe: !!wireframe
    }));
}

function makePoleMaterial({ wireframe = false } = {}) {
    return new THREE.MeshPhysicalMaterial({
        color: 0x0b0f14,
        metalness: 0.18,
        roughness: 0.58,
        clearcoat: 0.3,
        clearcoatRoughness: 0.28,
        wireframe: !!wireframe
    });
}

export function createAsset() {
    const id = MESH_ID;
    const regions = REGIONS.map((r) => ({ ...r }));
    const geometry = buildPoleGeometry();

    const semanticMaterials = makeRegionMaterials(regions, { wireframe: false });
    const solidMaterial = makePoleMaterial({ wireframe: false });
    const mesh = new THREE.Mesh(geometry, semanticMaterials);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    return {
        id,
        name: 'Traffic light pole',
        source: { type: 'TrafficLightPoleMesh', version: 1 },
        regions,
        mesh,
        materials: { semantic: semanticMaterials, solid: solidMaterial }
    };
}
