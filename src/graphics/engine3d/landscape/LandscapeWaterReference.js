// Owns a sea-level reference surface that never participates in authoritative terrain sampling or picking.
// @ts-check
import * as THREE from 'three';

/** @param {{manifest:any,budget:any,scene:any,visible?:boolean}} options @returns {any} */
export function createLandscapeWaterReference({ manifest, budget, scene, visible = true }) {
    const key = `water/${crypto.randomUUID()}`;
    const bytes = 140;
    const admission = budget.reserve(key, { cpuBytes: bytes, gpuBytes: bytes, kind: 'landscape-water-reference' });
    if (!admission.admitted) throw new Error(`Water reference cannot fit: ${admission.reason}`);
    const { bounds, coordinates } = manifest;
    const geometry = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x477d8c, roughness: .2, metalness: .05, transparent: true, opacity: .44, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Landscape sea-level reference';
    mesh.position.set((bounds.minX + bounds.maxX) / 2, coordinates.seaLevel, (bounds.minZ + bounds.maxZ) / 2);
    mesh.visible = visible;
    scene.add(mesh);
    return Object.freeze({
        setVisible(value) { mesh.visible = value; },
        snapshot() { return { visible: mesh.visible, seaLevel: coordinates.seaLevel, cpuBytes: bytes, gpuBytes: bytes, separateFromTerrain: true }; },
        dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); budget.release(key); }
    });
}
