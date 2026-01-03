// src/graphics/assets3d/textures/CityMaterials.js
import * as THREE from 'three';

let _cached = null;

function applyPolygonOffset(mat, { factor = -2, units = -2 } = {}) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = factor;
    mat.polygonOffsetUnits = units;
    return mat;
}

export function getCityMaterials() {
    if (_cached) return _cached;

    const road = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.95,
        metalness: 0.0
    }), { factor: -2, units: -2 });

    const sidewalk = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: 0x8f8f8f,
        roughness: 1.0,
        metalness: 0.0
    }), { factor: -3, units: -3 });

    // ✅ Slightly brighter curb for visibility + thicker in geometry
    const curb = new THREE.MeshStandardMaterial({
        color: 0x7a7a7a,
        roughness: 0.9,
        metalness: 0.0
    });

    // ✅ Road markings
    const laneWhite = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: 0xf2f2f2,
        roughness: 0.35,
        metalness: 0.0
    }), { factor: -6, units: -6 });

    const laneYellow = applyPolygonOffset(new THREE.MeshStandardMaterial({
        color: 0xf2d34f,
        roughness: 0.35,
        metalness: 0.0
    }), { factor: -6, units: -6 });

    _cached = { road, sidewalk, curb, laneWhite, laneYellow };
    return _cached;
}
