// Isolated LOD0 authoring blade: a low channel with a continuous arch and an elevated rounded tip.
// This high-detail source is reviewed before replacing field geometry or deriving cheaper representations.
// @ts-check
import * as THREE from 'three';
import { sampleGrassDebugV2BladeColor } from './GrassDebugV2Blade.js';

const TRANSVERSE_STATIONS = Object.freeze([-1, -0.72, -0.42, -0.12, 0, 0.12, 0.42, 0.72, 1]);

export const GRASS_V2_DETAILED_BLADE = Object.freeze({
    lengthSegments: 48, widthSegments: TRANSVERSE_STATIONS.length - 1, widthMeters: 0.015,
    rootDepthMeters: 0.006, transverseHalfAngle: 0.8,
    midribHeightMeters: 0.00035, midribHalfWidthRatio: 0.22,
    tipStart: 0.72, tipSegments: 16, rootWidthRatio: 0.62, tipWidthRatio: 0.8
});

/** @param {number} t Normalized root-to-tip coordinate. @returns {number} Half-width in meters. */
export function sampleGrassDebugV2DetailedBladeHalfWidth(t) {
    const { widthMeters, rootWidthRatio, tipWidthRatio, tipStart } = GRASS_V2_DETAILED_BLADE;
    const opening = THREE.MathUtils.lerp(rootWidthRatio, 1, THREE.MathUtils.smootherstep(t, 0, 0.25));
    const taper = THREE.MathUtils.lerp(1, tipWidthRatio, THREE.MathUtils.smootherstep(t, 0.35, tipStart));
    const cap = THREE.MathUtils.clamp((t - tipStart) / (1 - tipStart), 0, 1);
    return widthMeters * 0.5 * opening * taper * Math.sqrt(1 - cap * cap * cap);
}

/**
 * @param {THREE.Curve<THREE.Vector3>|null} curve
 * @param {(t: number) => number} sampleHalfWidth
 * @returns {(t: number, s: number, target: THREE.Vector3) => THREE.Vector3}
 */
export function createGrassDebugV2DetailedBladeSampler(curve = null, sampleHalfWidth = sampleGrassDebugV2DetailedBladeHalfWidth) {
    const { widthMeters, rootDepthMeters, transverseHalfAngle, midribHeightMeters, midribHalfWidthRatio, tipStart } = GRASS_V2_DETAILED_BLADE;
    const root = new THREE.Vector3(0, -rootDepthMeters, 0);
    curve ??= new THREE.CubicBezierCurve3(
        root, new THREE.Vector3(0, 0.0255, 0.04),
        new THREE.Vector3(0.001, 0.064, 0.125), new THREE.Vector3(0.007, 0.0592, 0.22)
    );
    const center = new THREE.Vector3(), tangent = new THREE.Vector3();
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    return (t, s, target) => {
        curve.getPoint(t, center);
        curve.getTangent(t, tangent).normalize();
        right.set(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
        up.crossVectors(tangent, right).normalize();
        const halfWidth = sampleHalfWidth(t);
        const channelStrength = 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.72);
        const midribTaper = 1 - THREE.MathUtils.smoothstep(t, tipStart, 1);
        const angle = s * transverseHalfAngle;
        const across = halfWidth * Math.sin(angle) / Math.sin(transverseHalfAngle);
        const channel = halfWidth * (1 - Math.cos(angle)) / Math.sin(transverseHalfAngle) * channelStrength;
        const midrib = midribHeightMeters * (2 * halfWidth / widthMeters) * midribTaper * Math.max(0, 1 - (s / midribHalfWidthRatio) ** 2) ** 2;
        return target.copy(center).addScaledVector(right, across).addScaledVector(up, channel + midrib);
    };
}

/** @returns {THREE.BufferGeometry} */
export function createGrassDebugV2DetailedBlade() {
    const { lengthSegments, widthSegments, tipStart, tipSegments } = GRASS_V2_DETAILED_BLADE;
    const sample = createGrassDebugV2DetailedBladeSampler();
    const positions = [], colors = [], uv = [], indices = [];
    const color = new THREE.Color(), point = new THREE.Vector3();
    const stride = widthSegments + 1;
    const bodySegments = lengthSegments - tipSegments;
    for (let station = 0; station <= lengthSegments; station++) {
        const t = station <= bodySegments ? tipStart * station / bodySegments
            : tipStart + (1 - tipStart) * Math.sin((station - bodySegments) / tipSegments * Math.PI / 2);
        sampleGrassDebugV2BladeColor(t, color);
        const sides = station === lengthSegments ? [widthSegments / 2] : Array.from({ length: stride }, (_, side) => side);
        for (const side of sides) {
            const s = TRANSVERSE_STATIONS[side];
            sample(t, s, point);
            positions.push(point.x, point.y, point.z);
            colors.push(color.r, color.g, color.b);
            uv.push((s + 1) / 2, t);
        }
    }
    for (let span = 0; span < lengthSegments - 1; span++) {
        const a = span * stride, b = a + stride;
        for (let side = 0; side < widthSegments; side++) indices.push(a + side, b + side, a + side + 1, a + side + 1, b + side, b + side + 1);
    }
    const last = (lengthSegments - 1) * stride, apex = lengthSegments * stride;
    for (let side = 0; side < widthSegments; side++) indices.push(last + side, apex, last + side + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = 'GrassV2DetailedBlade';
    return geometry;
}
