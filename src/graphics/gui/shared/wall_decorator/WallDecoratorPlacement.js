// src/graphics/gui/shared/wall_decorator/WallDecoratorPlacement.js
// Places a wall decorator shape spec on a wall surface: turns the surface axes
// (along-wall U, world up, outward normal N) into the mesh rotation.
//
// The subtlety this module exists for: callers sometimes want the decorator's
// local +U to run *backwards* along the wall (a corner sitting at the segment
// start, where the shape specs assume the corner is at the end). Flipping U on
// its own turns the (U, up, N) triple into a reflection, and
// `Quaternion.setFromRotationMatrix` silently returns garbage for those — for
// the axis-aligned facades in this project it returns the identity, which
// renders a band 90° out of plane, sticking out of the wall like a fin
// (AI 494). A rotation cannot mirror, so mirror in spec space instead: keep the
// right-handed basis and flip the spec's U-axis fields.
// @ts-check
import * as THREE from 'three';

const EPS = 1e-6;

/**
 * True when (uAxis, up, nAxis) is a right-handed triple, i.e. `makeBasis` on it
 * is a rotation rather than a reflection.
 * @param {THREE.Vector3} uAxis
 * @param {THREE.Vector3} upAxis
 * @param {THREE.Vector3} nAxis
 */
export function isRightHandedSurfaceBasis(uAxis, upAxis, nAxis) {
    if (!uAxis || !upAxis || !nAxis) return false;
    const cross = new THREE.Vector3().crossVectors(upAxis, nAxis);
    return uAxis.dot(cross) > 0;
}

/**
 * Mirror a decorator shape spec along its local U axis, so it lands in the same
 * place when rendered with the opposite U direction.
 *
 * Reflecting local +U flips everything measured along it: `centerU` reflects
 * about 0, a yaw about `up` conjugates to its negation, and the flat-cap corner
 * bridges swap ends. Everything else (widths, heights, depths, V offsets) is
 * unchanged by a mirror in U.
 *
 * @template {object} T
 * @param {T} spec
 * @returns {T}
 */
export function mirrorWallDecoratorSpecAlongU(spec) {
    const src = spec && typeof spec === 'object' ? spec : null;
    if (!src) return spec;
    const next = { ...src };

    const centerU = Number(next.centerU);
    if (Number.isFinite(centerU)) next.centerU = -centerU;

    const yaw = Number(next.yawDegrees);
    if (Number.isFinite(yaw)) next.yawDegrees = yaw === -180.0 ? 180.0 : -yaw;

    const bridgeStart = Number(next.cornerBridgeStartMeters);
    const bridgeEnd = Number(next.cornerBridgeEndMeters);
    if (Number.isFinite(bridgeStart) || Number.isFinite(bridgeEnd)) {
        next.cornerBridgeStartMeters = Number.isFinite(bridgeEnd) ? bridgeEnd : 0.0;
        next.cornerBridgeEndMeters = Number.isFinite(bridgeStart) ? bridgeStart : 0.0;
    }

    return /** @type {T} */ (next);
}

/**
 * Resolve how one decorator shape spec sits on a wall surface.
 *
 * Returns `null` when the axes are degenerate or parallel (nothing placeable).
 * The returned `spec` is the one that must be built and rendered — it is a
 * mirrored copy whenever the requested U direction would have made the basis a
 * reflection — and `uAxis` is the axis the caller must use to offset the mesh
 * by `spec.centerU`.
 *
 * @param {object} params
 * @param {object} params.spec decorator shape spec (`centerU`, `yawDegrees`, …)
 * @param {THREE.Vector3} params.uAxis along-surface axis the spec's +U should follow
 * @param {THREE.Vector3} params.nAxis outward surface normal
 * @param {THREE.Vector3} params.up world up
 * @returns {{quaternion: THREE.Quaternion, uAxis: THREE.Vector3, nAxis: THREE.Vector3, spec: object, mirrored: boolean} | null}
 */
export function resolveWallDecoratorSurfacePlacement({ spec, uAxis, nAxis, up }) {
    if (!spec || !uAxis || !nAxis || !up) return null;
    const u = uAxis.clone();
    const n = nAxis.clone();
    if (u.lengthSq() <= EPS || n.lengthSq() <= EPS) return null;
    u.normalize();
    n.normalize();
    if (Math.abs(u.dot(n)) > 0.999) return null;

    const mirrored = !isRightHandedSurfaceBasis(u, up, n);
    const placedU = mirrored ? u.multiplyScalar(-1.0) : u;
    const placedSpec = mirrored ? mirrorWallDecoratorSpecAlongU(spec) : spec;

    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(placedU, up, n)
    );

    const yaw = Number(placedSpec?.yawDegrees);
    const yawRadians = (Number.isFinite(yaw) ? Math.max(-180.0, Math.min(180.0, yaw)) : 0.0) * Math.PI / 180.0;
    if (Math.abs(yawRadians) > 1e-8) {
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(up, yawRadians));
    }

    return { quaternion, uAxis: placedU, nAxis: n, spec: placedSpec, mirrored };
}

export default resolveWallDecoratorSurfacePlacement;
