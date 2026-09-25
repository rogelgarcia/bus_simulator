// Builds the shared folded blade and uniform green gradient for field and line comparisons.
// @ts-check
import * as THREE from 'three';

const BLADE_COLORS = [
    { height: 0, color: new THREE.Color('#466d31') },
    { height: 0.35, color: new THREE.Color('#4a7a2c') },
    { height: 0.8, color: new THREE.Color('#53832f') },
    { height: 1, color: new THREE.Color('#658a36') }
];

/** @param {number} t @param {THREE.Color} color */
export function sampleGrassDebugV2BladeColor(t, color) {
    const end = BLADE_COLORS.findIndex(stop => stop.height >= t);
    const low = BLADE_COLORS[Math.max(0, end - 1)];
    const high = BLADE_COLORS[Math.max(1, end)];
    return color.copy(low.color).lerp(high.color, (t - low.height) / (high.height - low.height));
}

/** @param {{yaw: number, reach: number, height: number, width: number, twist: number}} profile */
export function createGrassDebugV2Blade({ yaw, reach, height, width, twist }) {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const positions = [], colors = [], indices = [];
    const color = new THREE.Color();
    const point = new THREE.Vector3();
    for (let station = 0; station <= 4; station++) {
        const t = station / 4;
        sampleGrassDebugV2BladeColor(t, color);
        const halfWidth = width * [0.32, 0.48, 0.5, 0.33, 0][station];
        const center = forward.clone().multiplyScalar(reach * t).addScaledVector(right, twist * Math.sin(t * Math.PI));
        center.y = height * (1.65 * t - 0.65 * t * t) - 0.012 * t ** 4;
        for (const side of station === 4 ? [0] : [-1, 0, 1]) {
            point.copy(center).addScaledVector(right, side * halfWidth);
            if (!side && station > 0) point.y += halfWidth * 0.22;
            positions.push(point.x, point.y, point.z);
            colors.push(color.r, color.g, color.b);
        }
    }
    for (let span = 0; span < 3; span++) {
        const a = span * 3, b = a + 3;
        for (let side = 0; side < 2; side++) {
            const next = (side + 1) % 3;
            indices.push(a + side, b + side, a + next, a + next, b + side, b + next);
        }
    }
    indices.push(9, 12, 10, 10, 12, 11);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
