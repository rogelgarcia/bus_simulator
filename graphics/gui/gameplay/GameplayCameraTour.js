// graphics/gui/gameplay/GameplayCameraTour.js
// Orbits the camera around a target without changing elevation
import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEFAULT_DURATION = 7.2;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}

function smootherstep(x) {
    return x * x * x * (x * (x * 6 - 15) + 10);
}

export class GameplayCameraTour {
    constructor({ engine, getTarget, durationSec } = {}) {
        this.engine = engine;
        this.getTarget = getTarget;
        this.durationSec = Math.max(0.1, durationSec ?? DEFAULT_DURATION);
        this._tour = null;
        this._tmpCenter = new THREE.Vector3();
        this._tmpOffset = new THREE.Vector3();
    }

    get active() {
        return !!this._tour;
    }

    start() {
        if (this._tour) return false;
        const cam = this.engine?.camera;
        if (!cam) return false;
        const center = this._readCenter(this._tmpCenter);
        if (!center) return false;

        const offset = this._tmpOffset.subVectors(cam.position, center);
        const radius = Math.hypot(offset.x, offset.z);
        const startTheta = Math.atan2(offset.x, offset.z);
        this._tour = {
            elapsed: 0,
            duration: this.durationSec,
            center: center.clone(),
            radius: Math.max(0.001, radius),
            startTheta,
            fixedY: cam.position.y,
            savedPos: cam.position.clone(),
            savedQuat: cam.quaternion.clone(),
            savedUp: cam.up.clone(),
            savedOrder: cam.rotation.order
        };
        return true;
    }

    update(dt) {
        const tour = this._tour;
        if (!tour) return false;

        const dtSec = Math.max(0, dt || 0);
        tour.elapsed = Math.min(tour.duration, tour.elapsed + dtSec);
        const tLinear = clamp(tour.elapsed / tour.duration, 0, 1);
        const t = smootherstep(tLinear);

        const center = this._readCenter(this._tmpCenter);
        if (center) {
            tour.center.x = center.x;
            tour.center.z = center.z;
        }

        const theta = tour.startTheta - TAU * t;
        const x = tour.center.x + Math.sin(theta) * tour.radius;
        const z = tour.center.z + Math.cos(theta) * tour.radius;
        const y = tour.fixedY;

        const cam = this.engine.camera;
        cam.position.set(x, y, z);
        cam.up.copy(WORLD_UP);
        cam.lookAt(tour.center);

        if (tour.elapsed >= tour.duration) {
            this.stop(false);
        }
        return true;
    }

    stop(restore = false) {
        const tour = this._tour;
        if (!tour) return;
        if (restore) {
            const cam = this.engine.camera;
            cam.position.copy(tour.savedPos);
            cam.rotation.order = tour.savedOrder;
            cam.quaternion.copy(tour.savedQuat);
            cam.up.copy(tour.savedUp);
        }
        this._tour = null;
    }

    _readCenter(out) {
        const c = this.getTarget?.();
        if (!c) return null;
        if (c.isVector3) return out.copy(c);
        if (typeof c.x === 'number' && typeof c.z === 'number') {
            return out.set(c.x, c.y ?? 0, c.z);
        }
        return null;
    }
}
