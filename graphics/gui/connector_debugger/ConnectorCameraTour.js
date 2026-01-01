// graphics/gui/connector_debugger/ConnectorCameraTour.js
// Animates camera orbits for the connector debugger tour mode.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const ORBIT_DURATION = 8;
const TILT_IN_DURATION = 3.6;
const TILT_OUT_DURATION = 2;
const TILT_IN_BIAS = 1.0;
const ELEVATION = Math.PI * 40 / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}

function smootherstep(x) {
    return x * x * x * (x * (x * 6 - 15) + 10);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function buildPose({
    center,
    startRadius,
    targetRadius,
    startPhi,
    targetPhi,
    startTheta,
    t
}) {
    const tiltInFrac = clamp(TILT_IN_DURATION / ORBIT_DURATION, 0.001, 0.9);
    const tiltOutFrac = clamp(TILT_OUT_DURATION / ORBIT_DURATION, 0.001, 0.9);
    const tiltOutStart = clamp(1 - tiltOutFrac, tiltInFrac, 1);
    const tiltInRaw = clamp(t / tiltInFrac, 0, 1);
    const tiltIn = Math.pow(tiltInRaw, TILT_IN_BIAS);
    const tiltOutRaw = clamp((t - tiltOutStart) / tiltOutFrac, 0, 1);
    const tiltOut = tiltOutRaw;
    let tilt = lerp(0, 1, tiltIn);
    tilt = lerp(tilt, 0, tiltOut);

    const phi = lerp(startPhi, targetPhi, tilt);
    const radius = lerp(startRadius, targetRadius, tilt);
    const theta = startTheta + TAU * t;

    const position = new THREE.Vector3().setFromSphericalCoords(radius, phi, theta);
    position.add(center);
    return { position, theta };
}

export class ConnectorCameraTour {
    constructor({
        engine,
        getCurbs,
        getCurbEndPosition,
        getCenter,
        getGroundY,
        getZoom,
        setZoom,
        onActiveChange,
        onFinish
    }) {
        this.engine = engine;
        this.getCurbs = getCurbs;
        this.getCurbEndPosition = getCurbEndPosition;
        this.getCenter = getCenter;
        this.getGroundY = getGroundY;
        this.getZoom = getZoom;
        this.setZoom = setZoom;
        this.onActiveChange = onActiveChange;
        this.onFinish = onFinish;

        this._tour = null;
    }

    get active() {
        return !!this._tour;
    }

    start() {
        if (this._tour) return false;
        const cam = this.engine?.camera;
        if (!cam) return false;
        const center = this._getCameraTarget(cam) ?? this._getTourCenter();
        if (!center) return false;

        const savedPos = cam.position.clone();
        const savedRot = cam.rotation.clone();
        const savedQuat = cam.quaternion.clone();
        const savedOrder = cam.rotation.order;

        const offset = savedPos.clone().sub(center);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const startRadius = Math.max(0.001, spherical.radius);
        const startPhi = clamp(spherical.phi, 0.001, Math.PI - 0.001);
        let startTheta = spherical.theta;
        const upGuide = new THREE.Vector3(0, 1, 0).applyQuaternion(savedQuat).normalize();
        const rightGuide = new THREE.Vector3(1, 0, 0).applyQuaternion(savedQuat).normalize();
        if (Math.abs(offset.x) < 1e-4 && Math.abs(offset.z) < 1e-4) {
            const groundDir = new THREE.Vector3(-upGuide.x, 0, -upGuide.z);
            if (groundDir.lengthSq() < 1e-6) {
                groundDir.set(0, 0, 1);
            } else {
                groundDir.normalize();
            }
            startTheta = Math.atan2(groundDir.x, groundDir.z);
        }
        const targetPhi = Math.max(0.01, ELEVATION);
        const baseHeight = Math.max(0.001, offset.y);
        const targetRadius = Math.max(
            startRadius,
            baseHeight / Math.max(Math.cos(targetPhi), 0.1)
        );

        this._tour = {
            elapsed: 0,
            center,
            startRadius,
            targetRadius,
            startPhi,
            targetPhi,
            startTheta,
            right: rightGuide,
            savedPos,
            savedRot,
            savedQuat,
            savedOrder,
            savedZoom: this.getZoom?.() ?? 0
        };
        this.onActiveChange?.(true);
        return true;
    }

    update(dt) {
        const tour = this._tour;
        if (!tour) return false;
        const dtSec = Math.max(0, dt || 0);
        tour.elapsed = Math.min(ORBIT_DURATION, tour.elapsed + dtSec);
        const tLinear = clamp(tour.elapsed / ORBIT_DURATION, 0, 1);
        const t = smootherstep(tLinear);

        const cam = this.engine.camera;
        const pose = buildPose({ ...tour, t });
        cam.position.copy(pose.position);
        const forward = new THREE.Vector3().subVectors(tour.center, cam.position).normalize();
        const rightCandidate = new THREE.Vector3().crossVectors(forward, WORLD_UP);
        if (rightCandidate.lengthSq() < 1e-6) {
            rightCandidate.copy(tour.right);
        } else {
            rightCandidate.normalize();
            if (rightCandidate.dot(tour.right) < 0) rightCandidate.negate();
            const blend = smootherstep(clamp(rightCandidate.length() / 0.35, 0, 1));
            rightCandidate.lerp(tour.right, 1 - blend).normalize();
        }
        tour.right.copy(rightCandidate);
        const correctedUp = new THREE.Vector3().crossVectors(rightCandidate, forward).normalize();
        const zAxis = forward.clone().negate();
        const m = new THREE.Matrix4().makeBasis(rightCandidate, correctedUp, zAxis);
        cam.quaternion.setFromRotationMatrix(m);

        if (tour.elapsed >= ORBIT_DURATION) {
            this.stop();
            return false;
        }
        return true;
    }

    stop() {
        const tour = this._tour;
        if (!tour) return;
        const cam = this.engine.camera;
        cam.position.copy(tour.savedPos);
        cam.rotation.order = tour.savedOrder;
        cam.rotation.copy(tour.savedRot);
        this.setZoom?.(tour.savedZoom);
        this._tour = null;
        this.onActiveChange?.(false);
        this.onFinish?.();
    }

    _getCurbs() {
        const curbs = this.getCurbs?.();
        return Array.isArray(curbs) ? curbs : [];
    }

    _getTourCenter() {
        const provided = this.getCenter?.();
        if (provided) return provided.clone ? provided.clone() : new THREE.Vector3(provided.x, provided.y ?? 0, provided.z);
        const curbs = this._getCurbs();
        if (curbs.length < 2) return null;
        const endA = this.getCurbEndPosition?.(curbs[0]);
        const endB = this.getCurbEndPosition?.(curbs[1]);
        const y = this.getGroundY?.() ?? 0;
        if (endA && endB) {
            return new THREE.Vector3(
                (endA.position.x + endB.position.x) * 0.5,
                y,
                (endA.position.z + endB.position.z) * 0.5
            );
        }
        if (curbs[0]?.mesh && curbs[1]?.mesh) {
            return new THREE.Vector3(
                (curbs[0].mesh.position.x + curbs[1].mesh.position.x) * 0.5,
                y,
                (curbs[0].mesh.position.z + curbs[1].mesh.position.z) * 0.5
            );
        }
        return null;
    }

    _getCameraTarget(cam) {
        const groundY = this.getGroundY?.() ?? 0;
        const plane = new THREE.Plane(WORLD_UP, -groundY);
        const origin = new THREE.Vector3();
        const dir = new THREE.Vector3();
        cam.getWorldPosition(origin);
        cam.getWorldDirection(dir);
        const hit = new THREE.Vector3();
        const ok = new THREE.Ray(origin, dir).intersectPlane(plane, hit);
        return ok ? hit : null;
    }

}
