// src/graphics/assets3d/textures/CityMaterials.js
// Defines shared city materials (roads, sidewalks, curbs, markings).
import * as THREE from 'three';
import { ROAD_MARKING_WHITE_TARGET_SUN_HEX, ROAD_MARKING_YELLOW_TARGET_SUN_HEX } from '../materials/RoadMarkingsColors.js';

let _cached = null;

function applyPolygonOffset(mat, { factor = -2, units = -2 } = {}) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = factor;
    mat.polygonOffsetUnits = units;
    return mat;
}

export function getCityMaterials() {
    if (_cached) return _cached;

    const road = new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.95,
        metalness: 0.0
    });

    const roadEdgeWear = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: 0x141414,
        roughness: 1.0,
        metalness: 0.0,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
    }), { factor: 0, units: -2 });
    roadEdgeWear.blending = THREE.NormalBlending;
    if (!roadEdgeWear.userData) roadEdgeWear.userData = {};
    roadEdgeWear.userData.bloomExclude = true;

    const sidewalk = new THREE.MeshStandardMaterial({
        color: 0x8f8f8f,
        roughness: 1.0,
        metalness: 0.0
    });

    const curb = new THREE.MeshStandardMaterial({
        color: 0x7a7a7a,
        roughness: 0.9,
        metalness: 0.0
    });

    const laneWhite = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: ROAD_MARKING_WHITE_TARGET_SUN_HEX,
        roughness: 0.55,
        metalness: 0.0,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
    }), { factor: 0, units: -1 });
    laneWhite.blending = THREE.NoBlending;
    if (!laneWhite.userData) laneWhite.userData = {};
    laneWhite.userData.bloomExclude = true;

    const laneYellow = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: ROAD_MARKING_YELLOW_TARGET_SUN_HEX,
        roughness: 0.55,
        metalness: 0.0,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
    }), { factor: 0, units: -1 });
    laneYellow.blending = THREE.NoBlending;
    if (!laneYellow.userData) laneYellow.userData = {};
    laneYellow.userData.bloomExclude = true;

    _cached = { road, roadEdgeWear, sidewalk, curb, laneWhite, laneYellow };
    return _cached;
}
