// src/graphics/engine3d/camera/FirstPersonCameraController.js
// First-person camera controller (LMB look, wheel dolly) for tool scenes.
// @ts-check

import * as THREE from 'three';
import { computeFrameDistanceForSphere } from './ToolCameraController.js';

const EPS = 1e-6;

function clamp(value, min, max, fallback = min) {
    const v = Number(value);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function canUsePointerCapture(canvas) {
    if (!canvas?.setPointerCapture) return false;
    if (canvas.isConnected) return true;
    const doc = canvas.ownerDocument ?? document;
    return !!doc?.contains?.(canvas);
}

function resolveFocusSphere(focus) {
    if (!focus) return null;

    const center = focus.center ?? focus.position ?? focus.pos ?? null;
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y) && Number.isFinite(center.z)) {
        const radius = Number(focus.radius) || 0;
        return { center: new THREE.Vector3(center.x, center.y, center.z), radius: Math.max(0, radius) };
    }

    const box = focus.box ?? null;
    const min = box?.min ?? focus.min ?? null;
    const max = box?.max ?? focus.max ?? null;
    if (min && max && Number.isFinite(min.x) && Number.isFinite(min.y) && Number.isFinite(min.z)
        && Number.isFinite(max.x) && Number.isFinite(max.y) && Number.isFinite(max.z)) {
        const b = new THREE.Box3(
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, max.z)
        );
        const sphere = new THREE.Sphere();
        b.getBoundingSphere(sphere);
        if (!Number.isFinite(sphere.radius)) return null;
        return { center: sphere.center.clone(), radius: Math.max(0, sphere.radius) };
    }

    return null;
}

export class FirstPersonCameraController {
    constructor(camera, canvas, {
        uiRoot = null,
        enabled = true,
        lookSpeed = 1.0,
        panSpeed = 1.0,
        zoomSpeed = 1.0,
        minPitchDeg = -89.0,
        maxPitchDeg = 89.0,
        getFocusTarget = null
    } = {}) {
        this.camera = camera ?? null;
        this.canvas = canvas ?? null;
        this.enabled = !!enabled;

        this.lookSpeed = clamp(lookSpeed, 0.01, 10.0, 1.0);
        this.panSpeed = clamp(panSpeed, 0.01, 10.0, 1.0);
        this.zoomSpeed = clamp(zoomSpeed, 0.01, 10.0, 1.0);

        const minPitch = clamp(minPitchDeg, -89.9, 0.0, -89.0);
        const maxPitch = clamp(maxPitchDeg, 0.0, 89.9, 89.0);
        this._minPitchRad = THREE.MathUtils.degToRad(minPitch);
        this._maxPitchRad = THREE.MathUtils.degToRad(Math.max(minPitch, maxPitch));

        this.minDistance = 0.01;
        this.maxDistance = 1e6;

        this.target = new THREE.Vector3();
        this._targetDistance = 12;

        this._yaw = 0;
        this._pitch = 0;

        this._state = null;
        this._activePointerId = null;
        this._activeButton = null;
        this._pointerStart = { x: 0, y: 0 };
        this._lookStart = { yaw: 0, pitch: 0 };
        this._orbitStart = { yaw: 0, pitch: 0, distance: 12, target: new THREE.Vector3() };

        this._uiRoot = uiRoot;
        this._getFocusTarget = typeof getFocusTarget === 'function' ? getFocusTarget : null;

        this._home = {
            position: new THREE.Vector3(),
            yaw: 0,
            pitch: 0,
            targetDistance: 12
        };

        this._tmpV3 = new THREE.Vector3();
        this._tmpV3b = new THREE.Vector3();
        this._tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerCancel = (e) => this._handlePointerUp(e);
        this._onWheel = (e) => this._handleWheel(e);
        this._onKeyDown = (e) => this._handleKeyDown(e);

        this._connect();
        this._syncFromCamera();
        this.setHomeFromCurrent();
    }

    dispose() {
        this._disconnect();
        this.camera = null;
        this.canvas = null;
    }

    update() {}

    setLookAt({ position = null, target = null } = {}) {
        const cam = this.camera;
        if (!cam) return false;

        const pos = position && typeof position === 'object' ? position : null;
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
            cam.position.set(pos.x, pos.y, pos.z);
        }

        const tgt = target && typeof target === 'object' ? target : null;
        if (tgt && Number.isFinite(tgt.x) && Number.isFinite(tgt.y) && Number.isFinite(tgt.z)) {
            this.target.set(tgt.x, tgt.y, tgt.z);
            const dist = cam.position.distanceTo(this.target);
            this._targetDistance = Math.max(0.01, Number.isFinite(dist) ? dist : this._targetDistance);
        }

        if (tgt) {
            cam.lookAt(this.target);
            this._syncFromCamera();
        } else {
            this._updateTargetFromOrientation();
        }

        return true;
    }

    setHomeFromCurrent() {
        const cam = this.camera;
        if (!cam) return false;
        this._home.position.copy(cam.position);
        this._home.yaw = this._yaw;
        this._home.pitch = this._pitch;
        this._home.targetDistance = this._targetDistance;
        return true;
    }

    reset() {
        const cam = this.camera;
        if (!cam) return false;
        cam.position.copy(this._home.position);
        this._yaw = Number(this._home.yaw) || 0;
        this._pitch = clamp(this._home.pitch, this._minPitchRad, this._maxPitchRad, 0);
        this._targetDistance = Math.max(0.01, Number(this._home.targetDistance) || 12);
        this._applyOrientation();
        return true;
    }

    frame() {
        const cam = this.camera;
        if (!cam || !this._getFocusTarget) return false;

        const focus = this._getFocusTarget();
        const sphere = resolveFocusSphere(focus);
        if (!sphere) return false;

        const aspect = (cam.aspect && Number.isFinite(cam.aspect)) ? cam.aspect : 1.0;
        const fovDeg = (cam.fov && Number.isFinite(cam.fov)) ? cam.fov : 50;
        const dist = computeFrameDistanceForSphere({ radius: sphere.radius, fovDeg, aspect, padding: 1.2 });

        this._tmpV3.copy(cam.position).sub(sphere.center);
        if (this._tmpV3.lengthSq() < EPS) this._tmpV3.set(0.55, 0.32, 0.72);
        this._tmpV3.normalize();

        const position = this._tmpV3b.copy(sphere.center).addScaledVector(this._tmpV3, dist);
        this.setLookAt({ position, target: sphere.center });
        return true;
    }

    moveLocal(dx, dy, dz, { constrainToGroundPlane = true } = {}) {
        const cam = this.camera;
        if (!cam) return;

        const ox = Number(dx) || 0;
        const oy = Number(dy) || 0;
        const oz = Number(dz) || 0;
        if (!(Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz))) return;
        if (Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6 && Math.abs(oz) < 1e-6) return;

        this._tmpV3.set(ox, oy, oz).applyQuaternion(cam.quaternion);
        if (constrainToGroundPlane) this._tmpV3.y = 0;
        cam.position.add(this._tmpV3);
        this.target.add(this._tmpV3);
    }

    panWorld(dx, dy, dz) {
        const cam = this.camera;
        if (!cam) return;

        const ox = Number(dx) || 0;
        const oy = Number(dy) || 0;
        const oz = Number(dz) || 0;
        if (!(Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz))) return;
        if (Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6 && Math.abs(oz) < 1e-6) return;

        this._tmpV3.set(ox, oy, oz);
        cam.position.add(this._tmpV3);
        this.target.add(this._tmpV3);
    }

    dollyBy(delta, { constrainToGroundPlane = false } = {}) {
        const d = Number(delta) || 0;
        if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return false;
        this.moveLocal(0, 0, d, { constrainToGroundPlane: !!constrainToGroundPlane });
        return true;
    }

    _connect() {
        if (!this.canvas) return;
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
        this.canvas.addEventListener('pointercancel', this._onPointerCancel, { capture: true });
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
        window.addEventListener('keydown', this._onKeyDown);
    }

    _disconnect() {
        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
            this.canvas.removeEventListener('pointermove', this._onPointerMove, { capture: true });
            this.canvas.removeEventListener('pointerup', this._onPointerUp, { capture: true });
            this.canvas.removeEventListener('pointercancel', this._onPointerCancel, { capture: true });
            this.canvas.removeEventListener('wheel', this._onWheel, { capture: true });
        }
        window.removeEventListener('keydown', this._onKeyDown);
    }

    _isEventOverUi(e) {
        if (!this._uiRoot) return false;
        if (e?.target === this.canvas) return false;
        if (!Number.isFinite(e?.clientX) || !Number.isFinite(e?.clientY)) return false;
        const hit = document.elementFromPoint(e.clientX, e.clientY) ?? e?.target ?? null;
        if (!hit || hit === this.canvas) return false;
        if (!this._uiRoot.contains(hit)) return false;
        return true;
    }

    _handleKeyDown(e) {
        if (!this.enabled) return;
        const key = e?.key;
        if (key !== 'f' && key !== 'F' && key !== 'r' && key !== 'R') return;
        if (isInteractiveElement(document.activeElement)) return;
        e.preventDefault?.();
        if (key === 'r' || key === 'R') this.reset();
        else this.frame();
    }

    _handlePointerDown(e) {
        if (!this.enabled || !e || !this.canvas) return;
        if (this._isEventOverUi(e)) return;
        if (e.pointerType === 'touch') return;

        if (e.button === 0) {
            this._state = 'look';
        } else if (e.button === 1) {
            this._state = 'pan';
        } else if (e.button === 2) {
            this._state = e.shiftKey ? 'pan' : 'orbit';
        } else {
            return;
        }
        this._activePointerId = e.pointerId;
        this._activeButton = e.button;
        this._pointerStart.x = e.clientX;
        this._pointerStart.y = e.clientY;
        this._lookStart.yaw = this._yaw;
        this._lookStart.pitch = this._pitch;

        if (this._state === 'orbit') {
            this._orbitStart.yaw = this._yaw;
            this._orbitStart.pitch = this._pitch;
            this._orbitStart.target.copy(this.target);
            const dist = this.camera?.position?.distanceTo?.(this.target);
            this._orbitStart.distance = clamp(dist, this.minDistance, this.maxDistance, this._targetDistance);
        }

        if (canUsePointerCapture(this.canvas)) {
            try {
                this.canvas.setPointerCapture(e.pointerId);
            } catch (err) {}
        }

        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handlePointerMove(e) {
        if (!this.enabled || !e) return;
        if (e.pointerId !== this._activePointerId) return;
        if (this._state !== 'look' && this._state !== 'pan' && this._state !== 'orbit') return;

        const dx = (e.clientX - this._pointerStart.x) || 0;
        const dy = (e.clientY - this._pointerStart.y) || 0;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

        if (this._state === 'look') {
            const rot = 0.002 * this.lookSpeed;
            this._yaw = this._lookStart.yaw - dx * rot;
            this._pitch = clamp(this._lookStart.pitch - dy * rot, this._minPitchRad, this._maxPitchRad, 0);
            this._applyOrientation();
        } else if (this._state === 'orbit') {
            const rot = 0.002 * this.lookSpeed;
            this._yaw = this._orbitStart.yaw - dx * rot;
            this._pitch = clamp(this._orbitStart.pitch - dy * rot, this._minPitchRad, this._maxPitchRad, 0);
            this._applyOrbitFromTarget(this._orbitStart.target, this._orbitStart.distance);
        } else if (this._state === 'pan') {
            this._panFromScreenDelta(dx, dy);
            this._pointerStart.x = e.clientX;
            this._pointerStart.y = e.clientY;
        }

        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handlePointerUp(e) {
        if (!e) return;
        if (e.pointerType === 'touch') return;
        if (e.pointerId !== this._activePointerId) return;
        this._state = null;
        this._activePointerId = null;
        this._activeButton = null;
        if (canUsePointerCapture(this.canvas) && this.canvas?.releasePointerCapture) {
            try {
                this.canvas.releasePointerCapture(e.pointerId);
            } catch (err) {}
        }
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
    }

    _handleWheel(e) {
        if (!this.enabled || !e) return;
        if (this._isEventOverUi(e)) return;
        e.preventDefault?.();

        const dy = clamp(e.deltaY, -250, 250, 0);
        const amt = dy * 0.02 * this.zoomSpeed;
        this.dollyBy(amt, { constrainToGroundPlane: false });

        e.stopImmediatePropagation?.();
    }

    _syncFromCamera() {
        const cam = this.camera;
        if (!cam) return;
        this._tmpEuler.setFromQuaternion(cam.quaternion, 'YXZ');
        this._yaw = Number(this._tmpEuler.y) || 0;
        this._pitch = clamp(this._tmpEuler.x, this._minPitchRad, this._maxPitchRad, 0);
        this._applyOrientation();
    }

    _applyOrientation() {
        const cam = this.camera;
        if (!cam) return;
        this._tmpEuler.set(this._pitch, this._yaw, 0);
        cam.quaternion.setFromEuler(this._tmpEuler);
        this._updateTargetFromOrientation();
    }

    _panFromScreenDelta(dx, dy) {
        const cam = this.camera;
        const canvas = this.canvas;
        if (!cam || !canvas) return;

        const rect = canvas.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Number(rect?.width) || canvas.clientWidth || 1);
        const h = Math.max(1, Number(rect?.height) || canvas.clientHeight || 1);

        const dist = clamp(this._targetDistance, this.minDistance, this.maxDistance, this._targetDistance);
        const fovRad = THREE.MathUtils.degToRad(Number(cam.fov) || 50);
        const worldPerPixelY = 2 * Math.tan(fovRad * 0.5) * dist / h;
        const worldPerPixelX = worldPerPixelY * (w / h);

        cam.updateMatrixWorld?.(true);
        const m = cam.matrixWorld.elements;
        this._tmpV3.set(m[0], m[1], m[2]).normalize();
        this._tmpV3b.set(m[4], m[5], m[6]).normalize();

        const ox = -dx * worldPerPixelX * this.panSpeed;
        const oy = dy * worldPerPixelY * this.panSpeed;
        cam.position.addScaledVector(this._tmpV3, ox);
        cam.position.addScaledVector(this._tmpV3b, oy);
        this.target.addScaledVector(this._tmpV3, ox);
        this.target.addScaledVector(this._tmpV3b, oy);
    }

    _updateTargetFromOrientation() {
        const cam = this.camera;
        if (!cam) return;
        this._tmpV3.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
        this.target.copy(cam.position).addScaledVector(this._tmpV3, Math.max(0.01, this._targetDistance));
    }

    _applyOrbitFromTarget(target, distance) {
        const cam = this.camera;
        if (!cam || !target) return;
        const dist = clamp(distance, this.minDistance, this.maxDistance, this._targetDistance);
        this._tmpEuler.set(this._pitch, this._yaw, 0);
        cam.quaternion.setFromEuler(this._tmpEuler);
        this._tmpV3.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
        cam.position.copy(target).addScaledVector(this._tmpV3, -dist);
        this.target.copy(target);
        this._targetDistance = dist;
    }
}
