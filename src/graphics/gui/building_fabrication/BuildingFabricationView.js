// src/graphics/gui/building_fabrication/BuildingFabricationView.js
// Orchestrates UI, input, and 3D rendering for building fabrication.
import * as THREE from 'three';
import { BuildingFabricationScene } from './BuildingFabricationScene.js';
import { BuildingFabricationUI } from './BuildingFabricationUI.js';

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

export class BuildingFabricationView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.scene = new BuildingFabricationScene(engine);
        this.ui = new BuildingFabricationUI();

        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._hoveredTile = null;
        this._pointerDown = null;
        this._pointerMoved = false;

        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerDown = (e) => this._handlePointerDown(e);
        this._onPointerUp = (e) => this._handlePointerUp(e);
        this._onPointerLeave = () => this._handlePointerLeave();
    }

    enter() {
        this.scene.enter();
        this.ui.mount();
        this._syncUiCounts();

        this.ui.onReset = () => {
            this.scene.resetScene();
            this._syncUiCounts();
        };

        this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
        this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: true });
        this.canvas.addEventListener('pointerup', this._onPointerUp, { passive: true });
        this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    }

    exit() {
        this.canvas.removeEventListener('pointermove', this._onPointerMove);
        this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas.removeEventListener('pointerup', this._onPointerUp);
        this.canvas.removeEventListener('pointerleave', this._onPointerLeave);

        this.ui.onReset = null;
        this.ui.unmount();

        this.scene.dispose();

        this._hoveredTile = null;
        this._pointerDown = null;
        this._pointerMoved = false;
        this.canvas.classList.remove('cursor-pointer');
    }

    update(dt) {
        this.scene.update(dt);
    }

    _syncUiCounts() {
        this.ui.setBuildingCount(this.scene.getOccupiedCount());
    }

    _setPointerFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        this._pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _pickTileId(event) {
        this._setPointerFromEvent(event);
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hits = this._raycaster.intersectObjects(this.scene.getTileMeshes(), false);
        if (!hits.length) return null;
        return this.scene.getTileIdFromMesh(hits[0].object);
    }

    _handlePointerMove(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._pointerDown) {
            const dx = event.clientX - this._pointerDown.x;
            const dy = event.clientY - this._pointerDown.y;
            if (dx * dx + dy * dy > 25) this._pointerMoved = true;
        }

        const tileId = this._pickTileId(event);
        if (tileId !== this._hoveredTile) {
            this._hoveredTile = tileId;
            this.scene.setHoveredTile(tileId);
            this.canvas.classList.toggle('cursor-pointer', !!tileId);
        }
    }

    _handlePointerDown(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (event.button !== 0) return;
        this._pointerDown = { x: event.clientX, y: event.clientY };
        this._pointerMoved = false;
    }

    _handlePointerUp(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (event.button !== 0) return;
        const down = this._pointerDown;
        this._pointerDown = null;
        if (!down) return;
        if (this._pointerMoved) return;

        const tileId = this._pickTileId(event);
        if (!tileId) return;
        this.scene.toggleBuilding(tileId, { floors: this.ui.getFloorCount() });
        this._syncUiCounts();
    }

    _handlePointerLeave() {
        if (!this._hoveredTile) return;
        this._hoveredTile = null;
        this.scene.setHoveredTile(null);
        this.canvas.classList.remove('cursor-pointer');
    }
}
