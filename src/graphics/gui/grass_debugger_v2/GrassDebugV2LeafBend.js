// Bend the current leaf around its centerline while preserving section shape and source length.
// @ts-check
import * as THREE from 'three';
// Relative tip displacement preserves the bend profile when the source leaf changes size.
const TIP_DROP_FRACTION = 0.022 / 0.201, TIP_REACH_FRACTION = 0.050 / 0.105;

/** @param {ReturnType<import('./GrassDebugV2SingleLeaf.js').createGrassDebugV2SingleLeaf>} plant @param {number} factor @param {{upperBend?:number}} options */
export function varyGrassDebugV2LeafBend(plant, factor, { upperBend = 0 } = {}) {
    if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(upperBend) || upperBend < 0 || upperBend > 1)
        throw new Error('Leaf bending requires a positive factor and upper bend between zero and one.');
    const definition = plant.getSnapshot().definition;
    const curve = new THREE.CubicBezierCurve3(...definition.curve.map(p => new THREE.Vector3(...p)));
    const changed = new THREE.CubicBezierCurve3(...definition.curve.map(([x, y, z]) => new THREE.Vector3(x, y, z * factor)));
    const sourceBounds = new THREE.Box3().setFromPoints(definition.curve.map(point => new THREE.Vector3(...point)));
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    changed.v3.y -= TIP_DROP_FRACTION * upperBend * sourceSize.y;
    changed.v3.z += TIP_REACH_FRACTION * upperBend * sourceSize.z;
    const root = curve.v0, correction = curve.getLength() / changed.getLength();
    for (const point of [changed.v1, changed.v2, changed.v3]) point.sub(root).multiplyScalar(correction).add(root);
    changed.updateArcLengths();
    const point = new THREE.Vector3(), oldCenter = new THREE.Vector3(), center = new THREE.Vector3(), quaternion = new THREE.Quaternion();
    const sourceRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(definition.azimuthDegrees));
    const inverseRotation = sourceRotation.clone().invert();
    for (const mesh of plant.bakeMeshes) {
        const geometry = mesh.geometry, p = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < p.count; i++) {
            const t = mesh === plant.leaves[0] ? uv.getY(i) : definition.shootCenterT;
            curve.getPoint(t, oldCenter); changed.getPoint(t, center);
            quaternion.setFromUnitVectors(curve.getTangent(t).normalize(), changed.getTangent(t).normalize());
            point.fromBufferAttribute(p, i).applyQuaternion(inverseRotation);
            point.sub(oldCenter).applyQuaternion(quaternion).add(center).applyQuaternion(sourceRotation);
            p.setXYZ(i, point.x, point.y, point.z);
        }
        p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const facing = geometry.attributes.grassFacingNormal, normal = geometry.attributes.normal;
        const stride = definition.acrossSegments + 1;
        for (let i = 0; i < p.count; i++) {
            const row = Math.floor(i / stride);
            const index = mesh === plant.leaves[0] ? Math.min(row * stride + definition.acrossSegments / 2, p.count - 1) : i;
            facing.setXYZ(i, normal.getX(index), normal.getY(index), normal.getZ(index));
        }
        facing.needsUpdate = true;
    }
    const inclination = t => { const tangent = changed.getTangent(t); return THREE.MathUtils.radToDeg(Math.atan2(tangent.y, tangent.z)); };
    const tipFraction = plant.getSnapshot().tipFraction;
    let lengthMeters = 0;
    const previous = changed.getPoint(0);
    for (let i = 1; i <= 200; i++) { changed.getPoint(tipFraction * i / 200, point); lengthMeters += previous.distanceTo(point); previous.copy(point); }
    return { factor, upperBend, lengthMeters, tipFraction, tip: changed.getPoint(tipFraction).toArray(),
        rootInclinationDegrees: inclination(0), tipInclinationDegrees: inclination(tipFraction) };
}
