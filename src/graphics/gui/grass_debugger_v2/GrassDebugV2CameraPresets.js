// Keeps the Overview button and benchmark starting camera on the same pose.
// @ts-check
import * as THREE from 'three';

/** @returns {{position: THREE.Vector3, target: THREE.Vector3}} */
export function createGrassDebugV2OverviewPose() {
    const position = new THREE.Vector3(19, 22, -22);
    const rotation = new THREE.Euler(THREE.MathUtils.degToRad(-38), THREE.MathUtils.degToRad(138), 0, 'YXZ');
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation);
    return { position, target: position.clone().addScaledVector(forward, -position.y / forward.y) };
}
