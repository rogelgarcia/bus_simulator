// graphics/gui/connector_debugger/ConnectorCameraTour.js
// Animates camera orbits for the connector debugger tour mode.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const ORBIT_DURATION = 6;
const TILT_DURATION = 2;
const RETURN_START = ORBIT_DURATION - TILT_DURATION;
const ELEVATION = Math.PI * 40 / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}

function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function rotateVector(vec, axis, angle) {
    vec.applyAxisAngle(axis, angle);
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
        const center = this._getTourCenter();
        if (!center) return false;
        const cam = this.engine?.camera;
        if (!cam) return false;

        const savedPos = cam.position.clone();
        const savedRot = cam.rotation.clone();
        const savedQuat = cam.quaternion.clone();
        const savedOrder = cam.rotation.order;

        const offset = savedPos.clone().sub(center);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const startPhi = spherical.phi;
        const targetPhi = Math.max(0.01, ELEVATION);
        const tiltAngle = targetPhi - startPhi;

        const azimuth = new THREE.Vector3(offset.x, 0, offset.z);
        if (azimuth.lengthSq() < 1e-6) {
            azimuth.set(1, 0, 0);
        } else {
            azimuth.normalize();
        }
        const tiltAxis = azimuth.clone().cross(WORLD_UP).normalize();

        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(savedQuat).normalize();

        this._tour = {
            elapsed: 0,
            orbitElapsed: 0,
            center,
            offset,
            tiltAxis,
            tiltAngle,
            tiltValue: 0,
            up,
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

        const orbitStep = Math.min(dtSec, Math.max(0, ORBIT_DURATION - tour.orbitElapsed));
        if (orbitStep > 0) {
            const deltaOrbit = TAU * (orbitStep / ORBIT_DURATION);
            rotateVector(tour.offset, WORLD_UP, deltaOrbit);
            rotateVector(tour.tiltAxis, WORLD_UP, deltaOrbit);
            tour.orbitElapsed += orbitStep;
        }

        const tiltValue = this._getTiltValue(tour.elapsed);
        const deltaTiltValue = tiltValue - tour.tiltValue;
        if (deltaTiltValue !== 0 && tour.tiltAngle !== 0) {
            const deltaTilt = deltaTiltValue * tour.tiltAngle;
            rotateVector(tour.offset, tour.tiltAxis, deltaTilt);
        }
        tour.tiltValue = tiltValue;

        const cam = this.engine.camera;
        cam.position.copy(tour.center).add(tour.offset);
        const forward = new THREE.Vector3().subVectors(tour.center, cam.position).normalize();
        let right = new THREE.Vector3().crossVectors(forward, tour.up);
        if (right.lengthSq() < 1e-8) {
            right = new THREE.Vector3().crossVectors(forward, WORLD_UP);
        }
        if (right.lengthSq() < 1e-8) {
            right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
        }
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        tour.up.copy(up);
        const zAxis = forward.clone().negate();
        const m = new THREE.Matrix4().makeBasis(right, up, zAxis);
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

    _getTiltValue(elapsed) {
        if (elapsed <= TILT_DURATION) {
            return easeInOutCubic(clamp(elapsed / TILT_DURATION, 0, 1));
        }
        if (elapsed >= RETURN_START) {
            return 1 - easeInOutCubic(clamp((elapsed - RETURN_START) / TILT_DURATION, 0, 1));
        }
        return 1;
    }

}
