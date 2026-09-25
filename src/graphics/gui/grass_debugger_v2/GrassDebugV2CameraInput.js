// Adds keyboard translation to the v2 orbit camera without changing its viewing direction.
// @ts-check
import * as THREE from 'three';

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const SHIFT_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

function isEditing(target) {
    return target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
}

export class GrassDebugV2CameraInput {
    /** @param {import('../../engine3d/camera/ToolCameraController.js').ToolCameraController} controls */
    constructor(controls) {
        this.controls = controls;
        this._keys = new Set();
        this._move = new THREE.Vector3();
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._clear = () => this._keys.clear();
        this._onKeyDown = event => {
            if (!this.controls.enabled) return;
            if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || isEditing(event.target)) {
                this._clear();
                return;
            }
            if (MOVEMENT_KEYS.has(event.code)) {
                event.preventDefault();
                this._keys.add(event.code);
            } else if (SHIFT_KEYS.has(event.code)) this._keys.add(event.code);
        };
        this._onKeyUp = event => this._keys.delete(event.code);
        this._onVisibilityChange = () => { if (document.hidden) this._clear(); };
        this._onFocusIn = event => { if (isEditing(event.target)) this._clear(); };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._clear);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        document.addEventListener('focusin', this._onFocusIn);
    }

    /** @param {number} dt Frame duration in seconds. */
    update(dt) {
        if (!this.controls.enabled || !this._keys.size) return;
        const right = Number(this._keys.has('KeyD')) - Number(this._keys.has('KeyA'));
        const forward = Number(this._keys.has('KeyW')) - Number(this._keys.has('KeyS'));
        const up = Number(this._keys.has('KeyE')) - Number(this._keys.has('KeyQ'));
        if (!right && !forward && !up) return;
        const camera = this.controls.camera;
        this._forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        this._right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        this._move.set(0, up, 0).addScaledVector(this._forward, forward).addScaledVector(this._right, right);
        const speed = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight') ? 24 : 8;
        this._move.normalize().multiplyScalar(speed * dt);
        this._move.y = Math.max(this.controls.minHeight - camera.position.y, this._move.y);
        this.controls.panWorld(this._move.x, this._move.y, this._move.z);
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._clear);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        document.removeEventListener('focusin', this._onFocusIn);
        this._clear();
    }

    clear() {
        this._clear();
    }
}
