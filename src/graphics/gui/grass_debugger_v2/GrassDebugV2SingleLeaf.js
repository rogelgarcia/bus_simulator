// One upright authoring blade opens from a continuous sheath around a small central shoot.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2DetailedBladeSampler, GRASS_V2_DETAILED_BLADE } from './GrassDebugV2DetailedBlade.js';
import { sampleGrassDebugV2BladeColor } from './GrassDebugV2Blade.js';

export const GRASS_V2_SINGLE_LEAF = Object.freeze({
    bodySegments: 96, tipSegments: 16, acrossSegments: 32, tipStart: 0.72, azimuthDegrees: 180,
    taperStart: 0.35, taperShoulderReduction: 0.65,
    sheathRadiusMeters: 0.00175, sheathHalfAngle: 2.95, sheathHold: 0.012, sheathOpeningEnd: 0.11,
    sheathSegments: 32, sheathSamplingEnd: 0.13,
    shootRadiusMeters: 0.00132, shootHalfLengthMeters: 0.006, shootCenterT: 0.013,
    curve: Object.freeze([[0, -0.006, 0], [0, 0.068, 0.025], [0, 0.142, 0.058], [0, 0.195, 0.105]].map(point => Object.freeze(point)))
});

/** @param {number} t Normalized root-to-tip coordinate. @returns {number} Half-width in meters. */
export function sampleGrassDebugV2SingleLeafHalfWidth(t) {
    const { widthMeters, rootWidthRatio } = GRASS_V2_DETAILED_BLADE;
    const { taperStart, taperShoulderReduction } = GRASS_V2_SINGLE_LEAF;
    const opening = THREE.MathUtils.lerp(rootWidthRatio, 1, THREE.MathUtils.smootherstep(t, 0, 0.25));
    const taper = THREE.MathUtils.clamp((t - taperStart) / (1 - taperStart), 0, 1);
    const squaredTaper = taper * taper;
    return widthMeters * 0.5 * opening * (1 - taperShoulderReduction * squaredTaper) * Math.sqrt(1 - squaredTaper);
}

/** @param {{material: THREE.MeshStandardMaterial, tipFraction?:number}} options */
export function createGrassDebugV2SingleLeaf({ material, tipFraction = 1 }) {
    if (!Number.isFinite(tipFraction) || tipFraction < 0.5 || tipFraction > 1) throw new Error('Leaf tip fraction must be between 0.5 and 1.');
    if (!material.isMeshStandardMaterial || !material.vertexColors) throw new Error('Single leaf requires a standard vertex-color material.');
    const definition = GRASS_V2_SINGLE_LEAF, pointed = tipFraction === 1;
    const curve = new THREE.CubicBezierCurve3(...definition.curve.map(point => new THREE.Vector3(...point)));
    const sample = createGrassDebugV2DetailedBladeSampler(curve, sampleGrassDebugV2SingleLeafHalfWidth);
    const { bodySegments, tipSegments, acrossSegments, tipStart } = definition;
    const segments = bodySegments + tipSegments, stride = acrossSegments + 1;
    const positions = [], colors = [], uvs = [], indices = [];
    const point = new THREE.Vector3(), center = new THREE.Vector3(), tangent = new THREE.Vector3();
    const right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(), color = new THREE.Color();
    for (let row = 0; row <= segments; row++) {
        const station = row <= definition.sheathSegments ? definition.sheathSamplingEnd * row / definition.sheathSegments
            : row <= bodySegments ? THREE.MathUtils.lerp(definition.sheathSamplingEnd, tipStart,
                (row - definition.sheathSegments) / (bodySegments - definition.sheathSegments))
                : tipStart + (1 - tipStart) * Math.sin((row - bodySegments) / tipSegments * Math.PI / 2);
        const t = station * tipFraction;
        const count = row === segments && pointed ? 1 : stride;
        const opening = THREE.MathUtils.smootherstep(t, definition.sheathHold, definition.sheathOpeningEnd);
        curve.getPoint(t, center); curve.getTangent(t, tangent).normalize(); up.crossVectors(tangent, right).normalize();
        sampleGrassDebugV2BladeColor(t, color);
        for (let side = 0; side < count; side++) {
            const u = count === 1 ? 0.5 : side / acrossSegments;
            const s = 2 * u - 1;
            sample(t, s, point);
            if (opening < 1) {
                const detail = GRASS_V2_DETAILED_BLADE, halfWidth = sampleGrassDebugV2SingleLeafHalfWidth(t);
                const halfAngle = THREE.MathUtils.lerp(definition.sheathHalfAngle, detail.transverseHalfAngle, opening), angle = s * halfAngle;
                const radius = THREE.MathUtils.lerp(definition.sheathRadiusMeters, halfWidth, opening)
                    / Math.sin(Math.min(Math.PI / 2, halfAngle));
                const channel = radius * (1 - Math.cos(angle)) * THREE.MathUtils.lerp(1, 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.72), opening);
                const midrib = detail.midribHeightMeters * (2 * halfWidth / detail.widthMeters)
                    * Math.max(0, 1 - (s / detail.midribHalfWidthRatio) ** 2) ** 2 * THREE.MathUtils.lerp(0.1, 1, opening);
                point.copy(center).addScaledVector(right, radius * Math.sin(angle)).addScaledVector(up, channel + midrib);
            }
            positions.push(point.x, point.y, point.z); colors.push(color.r, color.g, color.b); uvs.push(u, t);
        }
    }
    for (let row = 0; row < segments - (pointed ? 1 : 0); row++) for (let side = 0; side < acrossSegments; side++) {
        const a = row * stride + side, b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const last = (segments - 1) * stride, apex = segments * stride;
    if (pointed) for (let side = 0; side < acrossSegments; side++) indices.push(last + side, apex, last + side + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.rotateY(THREE.MathUtils.degToRad(definition.azimuthDegrees));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const facing = new Float32Array(positions.length), centerNormal = new THREE.Vector3();
    for (let row = 0; row <= segments; row++) {
        const start = row * stride, count = row === segments && pointed ? 1 : stride;
        centerNormal.fromBufferAttribute(geometry.attributes.normal, start + (count === 1 ? 0 : acrossSegments / 2));
        for (let side = 0; side < count; side++) centerNormal.toArray(facing, (start + side) * 3);
    }
    geometry.setAttribute('grassFacingNormal', new THREE.BufferAttribute(facing, 3));
    geometry.name = 'GrassV2SingleLeaf';
    const leaf = new THREE.Mesh(geometry, material);
    leaf.name = 'GrassV2UprightAuthoringLeaf'; leaf.castShadow = leaf.receiveShadow = true;
    curve.getPoint(definition.shootCenterT, center); curve.getTangent(definition.shootCenterT, tangent).normalize();
    up.crossVectors(tangent, right).normalize(); center.addScaledVector(up, definition.sheathRadiusMeters);
    const shootGeometry = new THREE.SphereGeometry(1, 24, 16);
    shootGeometry.scale(definition.shootRadiusMeters, definition.shootHalfLengthMeters, definition.shootRadiusMeters);
    shootGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent));
    shootGeometry.translate(center.x, center.y, center.z);
    shootGeometry.rotateY(THREE.MathUtils.degToRad(definition.azimuthDegrees));
    shootGeometry.setAttribute('grassFacingNormal', shootGeometry.attributes.normal.clone());
    const shootColors = new Float32Array(shootGeometry.attributes.position.count * 3);
    sampleGrassDebugV2BladeColor(0, color);
    for (let i = 0; i < shootGeometry.attributes.position.count; i++) color.toArray(shootColors, i * 3);
    shootGeometry.setAttribute('color', new THREE.BufferAttribute(shootColors, 3));
    shootGeometry.computeBoundingBox(); shootGeometry.computeBoundingSphere(); shootGeometry.name = 'GrassV2Shoot';
    const shoot = new THREE.Mesh(shootGeometry, material); shoot.name = 'GrassV2CentralShoot';
    shoot.castShadow = shoot.receiveShadow = true;
    const group = new THREE.Group(); group.name = 'GrassV2SingleLeafStudy'; group.add(leaf, shoot);
    const bounds = new THREE.Box3().setFromObject(group);
    const inclination = t => Math.atan2(curve.getTangent(t).y, curve.getTangent(t).z) * 180 / Math.PI;
    let lengthMeters = 0;
    const previous = curve.getPoint(0);
    for (let i = 1; i <= 200; i++) { curve.getPoint(tipFraction * i / 200, point); lengthMeters += previous.distanceTo(point); previous.copy(point); }
    return Object.freeze({
        group, leaves: Object.freeze([leaf]), crowns: Object.freeze([shoot]), bakeMeshes: Object.freeze([leaf, shoot]), roots: Object.freeze([0]),
        getSnapshot: () => ({
            definition, tipFraction, model: 'single-upright-leaf', specimens: 1, leaves: 1, leafTriangles: indices.length / 3, crownTriangles: shootGeometry.index.count / 3,
            lengthMeters, rootInclinationDegrees: inclination(0), tipInclinationDegrees: inclination(tipFraction),
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
        }),
        dispose: () => { geometry.dispose(); shootGeometry.dispose(); }
    });
}
