// src/graphics/engine3d/camera/ToolCameraController.js
// Provides RMB-orbit / MMB-pan / wheel-zoom camera controls for tool scenes without consuming LMB.
import * as THREE from 'three';

const EPS = 1e-8;

function clamp(value, min, max) {
    const v = Number(value);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

export function computeFrameDistanceForSphere({ radius, fovDeg, aspect, padding = 1.15 } = {}) {
    const r = Math.max(0, Number(radius) || 0) * Math.max(1.0, Number(padding) || 1.15);
    if (!(r > EPS)) return 0;

    const vfov = THREE.MathUtils.degToRad(clamp(fovDeg, 1e-3, 179.0));
    const a = clamp(aspect, 1e-6, 1e6);
    const hfov = 2 * Math.atan(Math.tan(vfov * 0.5) * a);
    const minFov = Math.min(vfov, hfov);
    const denom = Math.tan(minFov * 0.5);
    if (!(denom > EPS)) return r;
    return r / denom;
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

function getHitElementFromPoint(canvas, e) {
    if (!canvas || !e || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el || null;
}

export class ToolCameraController {
    constructor(camera, canvas, {
        uiRoot = null,
        enabled = true,
        enableDamping = true,
        dampingFactor = 0.08,
        rotateSpeed = 1.0,
        panSpeed = 1.0,
        zoomSpeed = 1.0,
        minDistance = 0.1,
        maxDistance = 1e6,
        minPolarAngle = 0.0,
        maxPolarAngle = Math.PI,
        getFocusTarget = null
    } = {}) {
        this.camera = camera;
        this.canvas = canvas;
        this.enabled = !!enabled;

        this.enableDamping = !!enableDamping;
        this.dampingFactor = clamp(dampingFactor, 0.0, 1.0);
        this.rotateSpeed = clamp(rotateSpeed, 0.01, 10.0);
        this.panSpeed = clamp(panSpeed, 0.01, 10.0);
        this.zoomSpeed = clamp(zoomSpeed, 0.01, 10.0);
        this.minDistance = Math.max(0.01, Number(minDistance) || 0.1);
        this.maxDistance = Math.max(this.minDistance, Number(maxDistance) || 1e6);
        this.minPolarAngle = clamp(minPolarAngle, 0.0, Math.PI);
        this.maxPolarAngle = clamp(maxPolarAngle, this.minPolarAngle, Math.PI);

        this.target = new THREE.Vector3();
        this._targetEnd = this.target.clone();
        this._spherical = new THREE.Spherical(10, Math.PI * 0.25, 0);
        this._sphericalEnd = this._spherical.clone();

        this._state = null;
        this._activePointerId = null;
        this._pointerStart = { x: 0, y: 0 };
        this._orbitStart = { theta: 0, phi: 0 };
        this._touchPointers = new Map();
        this._pinchStartDist = 0;
        this._pinchStartRadius = 0;
        this._suppressContextMenuUntil = 0;
        this._activeButton = null;

        this._uiRoot = uiRoot;
        this._getFocusTarget = typeof getFocusTarget === 'function' ? getFocusTarget : null;

        this._tmpV3 = new THREE.Vector3();
        this._tmpRight = new THREE.Vector3();
        this._tmpUp = new THREE.Vector3();
        this._tmpOffset = new THREE.Vector3();
        this._homePosition = null;
        this._homeTarget = null;

        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerCancel = (e) => this._handlePointerUp(e);
        this._onWheel = (e) => this._handleWheel(e);
        this._onContextMenu = (e) => this._handleContextMenu(e);
        this._onContextMenuWindow = (e) => this._handleWindowContextMenu(e);
        this._onKeyDown = (e) => this._handleKeyDown(e);

        this.syncFromCamera();
        this.setHomeFromCurrent();
        this._connect();
    }

    setUiRoot(uiRoot) {
        this._uiRoot = uiRoot;
    }

    setFocusTargetProvider(fn) {
        this._getFocusTarget = typeof fn === 'function' ? fn : null;
    }

    dispose() {
        this._disconnect();
        this._touchPointers.clear();
        this._state = null;
        this._activePointerId = null;
    }

    syncFromCamera() {
        if (!this.camera) return;

        const target = this._targetEnd ?? this.target;
        const offset = this.camera.position.clone().sub(target);
        const r = offset.length();
        this._sphericalEnd.set(r, Math.acos(clamp(offset.y / Math.max(EPS, r), -1, 1)), Math.atan2(offset.x, offset.z));
        this._sphericalEnd.radius = clamp(this._sphericalEnd.radius, this.minDistance, this.maxDistance);
        this._sphericalEnd.phi = clamp(this._sphericalEnd.phi, this.minPolarAngle, this.maxPolarAngle);

        this._spherical.copy(this._sphericalEnd);
        this.target.copy(target);
    }

    setTarget(target) {
        if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return;
        this._targetEnd.set(target.x, target.y, target.z);
        this.target.copy(this._targetEnd);
    }

    setLookAt({ position, target } = {}) {
        if (position && this.camera && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
            this.camera.position.set(position.x, position.y, position.z);
        }
        if (target) this.setTarget(target);
        this.syncFromCamera();
        this._applyCamera();
    }

    setHome({ position, target } = {}) {
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
            this._homePosition = new THREE.Vector3(position.x, position.y, position.z);
        }
        if (target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z)) {
            this._homeTarget = new THREE.Vector3(target.x, target.y, target.z);
        }
    }

    setHomeFromCurrent() {
        if (!this.camera) return false;
        this._homePosition = this.camera.position.clone();
        this._homeTarget = this.target.clone();
        return true;
    }

    reset() {
        if (!this.camera || !this._homePosition || !this._homeTarget) return false;
        this.setLookAt({ position: this._homePosition, target: this._homeTarget });
        return true;
    }

    panWorld(dx, dy, dz) {
        const ox = Number(dx) || 0;
        const oy = Number(dy) || 0;
        const oz = Number(dz) || 0;
        if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(oz)) return;
        if (Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6 && Math.abs(oz) < 1e-6) return;
        this._targetEnd.add(new THREE.Vector3(ox, oy, oz));
        this.target.copy(this._targetEnd);
        this._applyCamera();
    }

    frame() {
        if (!this.camera || !this._getFocusTarget) return false;
        const focus = this._getFocusTarget();
        const sphere = resolveFocusSphere(focus);
        if (!sphere) return false;

        const aspect = (this.camera.aspect && Number.isFinite(this.camera.aspect)) ? this.camera.aspect : 1.0;
        const fovDeg = (this.camera.fov && Number.isFinite(this.camera.fov)) ? this.camera.fov : 50;
        const distance = computeFrameDistanceForSphere({
            radius: sphere.radius,
            fovDeg,
            aspect,
            padding: 1.2
        });

        this._targetEnd.copy(sphere.center);
        this._sphericalEnd.radius = clamp(distance, this.minDistance, this.maxDistance);
        this.target.copy(this._targetEnd);
        this._spherical.radius = this._sphericalEnd.radius;
        this._applyCamera();
        return true;
    }

    update(dt = 0) {
        if (!this.enabled || !this.camera) return;
        const delta = Math.max(0, Number(dt) || 0);

        if (this.enableDamping) {
            const alpha = 1 - Math.pow(1 - this.dampingFactor, Math.min(60, delta * 60));
            this.target.lerp(this._targetEnd, alpha);
            this._spherical.radius = THREE.MathUtils.lerp(this._spherical.radius, this._sphericalEnd.radius, alpha);
            this._spherical.theta = THREE.MathUtils.lerp(this._spherical.theta, this._sphericalEnd.theta, alpha);
            this._spherical.phi = THREE.MathUtils.lerp(this._spherical.phi, this._sphericalEnd.phi, alpha);
        } else {
            this.target.copy(this._targetEnd);
            this._spherical.copy(this._sphericalEnd);
        }

        this._spherical.radius = clamp(this._spherical.radius, this.minDistance, this.maxDistance);
        this._spherical.phi = clamp(this._spherical.phi, this.minPolarAngle, this.maxPolarAngle);
        this._applyCamera();
    }

    _connect() {
        if (!this.canvas) return;
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
        this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
        this.canvas.addEventListener('pointercancel', this._onPointerCancel, { capture: true });
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
        this.canvas.addEventListener('contextmenu', this._onContextMenu, { capture: true });
        window.addEventListener('contextmenu', this._onContextMenuWindow, { capture: true });
        window.addEventListener('keydown', this._onKeyDown);
    }

    _disconnect() {
        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
            this.canvas.removeEventListener('pointermove', this._onPointerMove, { capture: true });
            this.canvas.removeEventListener('pointerup', this._onPointerUp, { capture: true });
            this.canvas.removeEventListener('pointercancel', this._onPointerCancel, { capture: true });
            this.canvas.removeEventListener('wheel', this._onWheel, { capture: true });
            this.canvas.removeEventListener('contextmenu', this._onContextMenu, { capture: true });
        }
        window.removeEventListener('contextmenu', this._onContextMenuWindow, { capture: true });
        window.removeEventListener('keydown', this._onKeyDown);
    }

    _isEventOverUi(e) {
        if (!this._uiRoot) return false;
        const hit = getHitElementFromPoint(this.canvas, e) ?? e?.target ?? null;
        if (!hit) return false;
        if (hit === this.canvas) return false;
        return this._uiRoot.contains(hit);
    }

    _handleContextMenu(e) {
        if (!this.enabled) return;
        if (this._isEventOverUi(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    _handleWindowContextMenu(e) {
        if (!this.enabled) return;
        if (this._isEventOverUi(e)) return;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
        const shouldSuppress = this._activeButton === 2
            || this._state === 'orbit'
            || this._state === 'pan'
            || now <= this._suppressContextMenuUntil;
        if (!shouldSuppress) return;
        e.preventDefault();
        e.stopImmediatePropagation();
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
        if (!this.enabled || !e) return;
        if (this._isEventOverUi(e)) return;

        if (e.pointerType === 'touch') {
            this._touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._touchPointers.size === 2) {
                const pts = Array.from(this._touchPointers.values());
                this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                this._pinchStartRadius = this._sphericalEnd.radius;
                this._state = 'pinch';
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            return;
        }

        const btn = e.button;
        if (btn !== 1 && btn !== 2) return;
        this._activeButton = btn;
        if (btn === 2) {
            const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            this._suppressContextMenuUntil = now + 10000;
        }
        if (btn === 2 && e.shiftKey) this._state = 'pan';
        else if (btn === 1) this._state = 'pan';
        else this._state = 'orbit';

        this._activePointerId = e.pointerId;
        this._pointerStart.x = e.clientX;
        this._pointerStart.y = e.clientY;
        this._orbitStart.theta = this._sphericalEnd.theta;
        this._orbitStart.phi = this._sphericalEnd.phi;
        this.canvas?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    _handlePointerMove(e) {
        if (!this.enabled || !e) return;
        if (this._isEventOverUi(e)) return;

        if (e.pointerType === 'touch') {
            if (!this._touchPointers.has(e.pointerId)) return;
            this._touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._state === 'pinch' && this._touchPointers.size === 2) {
                const pts = Array.from(this._touchPointers.values());
                const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                const ratio = (this._pinchStartDist > EPS && dist > EPS) ? (this._pinchStartDist / dist) : 1;
                this._sphericalEnd.radius = clamp(this._pinchStartRadius * ratio, this.minDistance, this.maxDistance);
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            return;
        }

        if (!this._state || e.pointerId !== this._activePointerId) return;

        const dx = (e.clientX - this._pointerStart.x) || 0;
        const dy = (e.clientY - this._pointerStart.y) || 0;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

        if (this._state === 'orbit') {
            const rot = 2 * Math.PI * 0.002 * this.rotateSpeed;
            this._sphericalEnd.theta = this._orbitStart.theta - dx * rot;
            this._sphericalEnd.phi = clamp(this._orbitStart.phi - dy * rot, this.minPolarAngle, this.maxPolarAngle);
        } else if (this._state === 'pan') {
            this._panFromScreenDelta(dx, dy);
            this._pointerStart.x = e.clientX;
            this._pointerStart.y = e.clientY;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
    }

    _handlePointerUp(e) {
        if (!e) return;
        if (e.pointerType === 'touch') {
            this._touchPointers.delete(e.pointerId);
            if (this._touchPointers.size < 2 && this._state === 'pinch') this._state = null;
            return;
        }

        if (e.pointerId === this._activePointerId) {
            this._activePointerId = null;
            this._state = null;
            this._activeButton = null;
            const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            this._suppressContextMenuUntil = Math.max(this._suppressContextMenuUntil, now + 250);
        }
    }

    _handleWheel(e) {
        if (!this.enabled || !e) return;
        if (this._isEventOverUi(e)) return;
        const dy = Number(e.deltaY) || 0;
        if (!Number.isFinite(dy) || Math.abs(dy) < 1e-6) return;

        const scale = Math.exp(dy * 0.001 * this.zoomSpeed);
        this._sphericalEnd.radius = clamp(this._sphericalEnd.radius * scale, this.minDistance, this.maxDistance);
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    _panFromScreenDelta(dx, dy) {
        if (!this.camera || !this.canvas) return;

        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);

        const dist = clamp(this._sphericalEnd.radius, this.minDistance, this.maxDistance);
        const fovRad = THREE.MathUtils.degToRad(Number(this.camera.fov) || 50);
        const worldPerPixelY = 2 * Math.tan(fovRad * 0.5) * dist / h;
        const worldPerPixelX = worldPerPixelY * (w / h);

        this.camera.getWorldDirection(this._tmpV3);
        this._tmpUp.set(0, 1, 0);
        this._tmpRight.crossVectors(this._tmpV3, this._tmpUp).normalize();
        this._tmpUp.crossVectors(this._tmpRight, this._tmpV3).normalize();

        this._tmpOffset.set(0, 0, 0);
        this._tmpOffset.addScaledVector(this._tmpRight, -dx * worldPerPixelX * this.panSpeed);
        this._tmpOffset.addScaledVector(this._tmpUp, dy * worldPerPixelY * this.panSpeed);

        this._targetEnd.add(this._tmpOffset);
    }

    _applyCamera() {
        if (!this.camera) return;
        this._tmpV3.setFromSpherical(this._spherical);
        this.camera.position.copy(this.target).add(this._tmpV3);
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld?.();
    }
}
