// src/states/CityState.js
import * as THREE from 'three';
import { getSharedCity } from '../city/City.js';

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export class CityState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this.canvas = engine.canvas;

        this.uiWelcome = document.getElementById('ui-welcome');
        this.uiSelect = document.getElementById('ui-select');
        this.uiHudTest = document.getElementById('ui-test'); // ok if null

        this.city = null;

        this._keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

        this._yaw = 0;
        this._pitch = 0;

        this._moveSpeed = 10;     // units/sec
        this._lookSpeed = 0.002;  // radians per pixel

        this._look = {
            active: false,
            pointerId: null,
            lastX: 0,
            lastY: 0
        };

        this._onKeyDown = (e) => this._handleKeyDown(e);
        this._onKeyUp = (e) => this._handleKeyUp(e);

        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerCancel = (e) => this._handlePointerUp(e);

        this._onContextMenu = (e) => e.preventDefault();
    }

    enter() {
        document.body.classList.remove('splash-bg');
        if (this.uiSelect) this.uiSelect.classList.add('hidden');
        if (this.uiWelcome) this.uiWelcome.classList.add('hidden');
        if (this.uiHudTest) this.uiHudTest.classList.add('hidden');

        this.engine.clearScene();

        // ✅ FIX: use this.engine (not engine) and don't reference undefined mapSpec
        this.city = getSharedCity(this.engine, {
            size: 800,
            tileMeters: 2,
            mapTileSize: 16,
            seed: 'x'
        });

        this.city.attach(this.engine);

        // camera start
        const cam = this.engine.camera;
        cam.position.set(0, 2.0, 12);
        cam.rotation.order = 'YXZ';
        cam.lookAt(0, 2.0, 0);

        this._yaw = cam.rotation.y;
        this._pitch = cam.rotation.x;

        // input
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });

        if (this.canvas) {
            this.canvas.style.touchAction = 'none';
            this.canvas.addEventListener('pointerdown', this._onPointerDown);
            this.canvas.addEventListener('pointermove', this._onPointerMove);
            this.canvas.addEventListener('pointerup', this._onPointerUp);
            this.canvas.addEventListener('pointercancel', this._onPointerCancel);
            this.canvas.addEventListener('contextmenu', this._onContextMenu);
        }
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._onPointerDown);
            this.canvas.removeEventListener('pointermove', this._onPointerMove);
            this.canvas.removeEventListener('pointerup', this._onPointerUp);
            this.canvas.removeEventListener('pointercancel', this._onPointerCancel);
            this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        }

        this._stopLook();

        this.city?.detach(this.engine);
        this.engine.clearScene();
        this.city = null;
    }

    update(dt) {
        const cam = this.engine.camera;

        this.city?.update(this.engine);

        cam.rotation.order = 'YXZ';
        cam.rotation.y = this._yaw;
        cam.rotation.x = this._pitch;

        const fwd = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
        const right = new THREE.Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));

        const move = new THREE.Vector3();
        if (this._keys.ArrowUp) move.add(fwd);
        if (this._keys.ArrowDown) move.addScaledVector(fwd, -1);
        if (this._keys.ArrowRight) move.add(right);
        if (this._keys.ArrowLeft) move.addScaledVector(right, -1);

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(this._moveSpeed * dt);
            cam.position.add(move);
        }

        cam.position.y = 2.0;
    }

    _handlePointerDown(e) {
        if (e.button !== 0) return;

        e.preventDefault();
        this._look.active = true;
        this._look.pointerId = e.pointerId;
        this._look.lastX = e.clientX;
        this._look.lastY = e.clientY;

        this.canvas?.setPointerCapture?.(e.pointerId);
    }

    _handlePointerMove(e) {
        if (!this._look.active) return;
        if (this._look.pointerId != null && e.pointerId !== this._look.pointerId) return;

        const dx = e.clientX - this._look.lastX;
        const dy = e.clientY - this._look.lastY;

        this._look.lastX = e.clientX;
        this._look.lastY = e.clientY;

        this._yaw -= dx * this._lookSpeed;
        this._pitch -= dy * this._lookSpeed;

        this._pitch = clamp(this._pitch, -Math.PI * 0.49, Math.PI * 0.49);
    }

    _handlePointerUp(e) {
        if (this._look.pointerId != null && e.pointerId !== this._look.pointerId) return;
        this._stopLook();
    }

    _stopLook() {
        this._look.active = false;
        this._look.pointerId = null;
    }

    _handleKeyDown(e) {
        const code = e.code;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = true;
            return;
        }

        if (code === 'Escape') {
            e.preventDefault();
            this.sm.go('welcome');
        }
    }

    _handleKeyUp(e) {
        const code = e.code;

        if (code in this._keys) {
            e.preventDefault();
            this._keys[code] = false;
        }
    }
}
