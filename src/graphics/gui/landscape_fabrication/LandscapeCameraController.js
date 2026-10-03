// Adapts the shared first-person camera to focus-scoped landscape navigation and picking.
// @ts-check
import * as THREE from 'three';
import { FirstPersonCameraController } from '../../engine3d/camera/FirstPersonCameraController.js';
import { LandscapeNavigationState, LANDSCAPE_NAVIGATION } from './LandscapeNavigationState.js';

export class LandscapeCameraController extends FirstPersonCameraController {
    /** @param {THREE.Camera} camera @param {HTMLCanvasElement} canvas @param {{uiRoot:HTMLElement,onClick:(event:PointerEvent)=>unknown,onZoom:()=>unknown,onNavigate:()=>unknown}} options */
    constructor(camera, canvas, { uiRoot, onClick, onZoom, onNavigate }) {
        super(camera, canvas, { uiRoot, onClick, requireCanvasFocus: true, dragThreshold: LANDSCAPE_NAVIGATION.dragThreshold, minPitchDeg: -90, maxPitchDeg: 90 });
        this.navigation = new LandscapeNavigationState();
        this.navigationAbort = new AbortController();
        this.onZoom = onZoom;
        this.onNavigate = onNavigate;
        this.yawEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        canvas.tabIndex = 0;
        canvas.focus({ preventScroll: true });
        const signal = this.navigationAbort.signal;
        canvas.addEventListener('keydown', event => {
            if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) { this.navigation.clear(); return; }
            if (this.navigation.setKey(event.code, true)) { event.preventDefault(); this.onNavigate(); }
        }, { signal });
        window.addEventListener('keyup', event => this.navigation.setKey(event.code, false), { signal });
        canvas.addEventListener('blur', () => this.clearInput(), { signal });
        window.addEventListener('blur', () => this.clearInput(), { signal });
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); }, { signal });
        canvas.addEventListener('contextmenu', event => event.preventDefault(), { signal });
    }

    update(dt) {
        if (!this.enabled || document.hidden || document.activeElement !== this.canvas) { this.navigation.clear(); return; }
        this.yawEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
        const movement = this.navigation.step(Math.max(0, dt), this.yawEuler.y);
        this.panWorld(movement.x, movement.y, movement.z);
    }

    clearInput() { this.navigation.clear(); this.cancelInteraction(); }

    _handleKeyDown(event) {
        if (this.enabled && document.activeElement === this.canvas && ['f', 'F', 'r', 'R'].includes(event.key)) this.onNavigate?.();
        super._handleKeyDown(event);
    }

    _handlePointerDown(event) {
        if (this.enabled && !this._isEventOverUi(event)) this.onNavigate?.();
        super._handlePointerDown(event);
    }

    _handleWheel(event) {
        if (!this.enabled || this._isEventOverUi(event)) return;
        this.onNavigate();
        if (this.camera.isOrthographicCamera) {
            this.camera.zoom = Math.max(.1, Math.min(100, this.camera.zoom * Math.exp(-event.deltaY * .001)));
            this.camera.updateProjectionMatrix();
            this.onZoom();
        } else {
            const distance = this.camera.position.distanceTo(this.target);
            const delta = Math.max(-250, Math.min(250, event.deltaY));
            this.dollyBy(Math.max(2, distance) * (Math.exp(delta * .001) - 1));
        }
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    _panFromScreenDelta(dx, dy) {
        if (!this.camera.isOrthographicCamera) return super._panFromScreenDelta(dx, dy);
        const rect = this.canvas.getBoundingClientRect();
        this.camera.updateMatrixWorld(true);
        const right = this._tmpV3.setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = this._tmpV3b.setFromMatrixColumn(this.camera.matrixWorld, 1);
        right.multiplyScalar(-dx * (this.camera.right - this.camera.left) / this.camera.zoom / Math.max(1, rect.width));
        up.multiplyScalar(dy * (this.camera.top - this.camera.bottom) / this.camera.zoom / Math.max(1, rect.height));
        right.add(up);
        this.panWorld(right.x, right.y, right.z);
    }

    dispose() { this.clearInput(); this.navigationAbort.abort(); super.dispose(); }
}
