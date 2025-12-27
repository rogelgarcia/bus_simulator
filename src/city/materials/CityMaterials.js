// src/city/materials/CityMaterials.js
import * as THREE from 'three';

let _cached = null;

export function getCityMaterials() {
    if (_cached) return _cached;

    const road = new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.95,
        metalness: 0.0
    });

    const sidewalk = new THREE.MeshStandardMaterial({
        color: 0x8b8b8b,
        roughness: 1.0,
        metalness: 0.0
    });

    const curb = new THREE.MeshStandardMaterial({
        color: 0x6f6f6f,
        roughness: 1.0,
        metalness: 0.0
    });

    _cached = { road, sidewalk, curb };
    return _cached;
}
