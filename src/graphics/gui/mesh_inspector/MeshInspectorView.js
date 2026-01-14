// src/graphics/gui/mesh_inspector/MeshInspectorView.js
// Orchestrates UI, input, and 3D rendering for mesh inspection.
import * as THREE from 'three';
import { MeshInspectorScene } from './MeshInspectorScene.js';
import { MeshInspectorUI } from './MeshInspectorUI.js';

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

export class MeshInspectorView {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;

        this.scene = new MeshInspectorScene(engine);
        this.ui = new MeshInspectorUI();

        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this._hoverInfo = null;
        this._selectedInfo = null;

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

        this.ui.setCollectionOptions(this.scene.getCollectionOptions());
        this.ui.setSelectedCollectionId(this.scene.getSelectedCollectionId());

        const options = this.scene.getMeshOptions();
        this.ui.setMeshOptions(options);
        this.ui.setSelectedMesh(this.scene.getSelectedMeshMeta() ?? {});
        this.ui.setWireframeEnabled(this.scene.getWireframeEnabled());
        this.ui.setEdgesEnabled(this.scene.getEdgesEnabled());
        this.ui.setColorMode(this.scene.getColorMode());
        this.ui.setPrefabParams(this.scene.getPrefabParamsApi?.() ?? null);
        this.ui.setRig(this.scene.getRigApi?.() ?? null);
        this.ui.setHoverInfo(null);
        this.ui.setSelectedInfo(null);

        this.ui.onCollectionChange = (collectionId) => {
            this.scene.setSelectedCollectionId(collectionId);
            this.ui.setSelectedCollectionId(this.scene.getSelectedCollectionId());
            this.ui.setMeshOptions(this.scene.getMeshOptions());
            this.ui.setSelectedMesh(this.scene.getSelectedMeshMeta() ?? {});
            this.ui.setPrefabParams(this.scene.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(this.scene.getRigApi?.() ?? null);
            this._clearSelection();
        };

        this.ui.onMeshIdChange = (id) => {
            this.scene.setSelectedMeshId(id);
            this.ui.setSelectedMesh(this.scene.getSelectedMeshMeta() ?? {});
            this.ui.setPrefabParams(this.scene.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(this.scene.getRigApi?.() ?? null);
            this._clearSelection();
        };

        this.ui.onMeshPrev = () => {
            const next = this.scene.getSelectedMeshIndex() - 1;
            this.scene.setSelectedMeshIndex(next);
            this.ui.setSelectedMesh(this.scene.getSelectedMeshMeta() ?? {});
            this.ui.setPrefabParams(this.scene.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(this.scene.getRigApi?.() ?? null);
            this._clearSelection();
        };

        this.ui.onMeshNext = () => {
            const next = this.scene.getSelectedMeshIndex() + 1;
            this.scene.setSelectedMeshIndex(next);
            this.ui.setSelectedMesh(this.scene.getSelectedMeshMeta() ?? {});
            this.ui.setPrefabParams(this.scene.getPrefabParamsApi?.() ?? null);
            this.ui.setRig(this.scene.getRigApi?.() ?? null);
            this._clearSelection();
        };

        this.ui.onWireframeChange = (enabled) => {
            this.scene.setWireframeEnabled(enabled);
            this.ui.setWireframeEnabled(this.scene.getWireframeEnabled());
        };

        this.ui.onEdgesChange = (enabled) => {
            this.scene.setEdgesEnabled(enabled);
            this.ui.setEdgesEnabled(this.scene.getEdgesEnabled());
        };

        this.ui.onColorModeChange = (mode) => {
            this.scene.setColorMode(mode);
            this.ui.setColorMode(this.scene.getColorMode());
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

        this.ui.onCollectionChange = null;
        this.ui.onMeshIdChange = null;
        this.ui.onMeshPrev = null;
        this.ui.onMeshNext = null;
        this.ui.onWireframeChange = null;
        this.ui.onEdgesChange = null;
        this.ui.onColorModeChange = null;

        this.ui.unmount();
        this.scene.dispose();

        this._clearSelection();
        this._pointerDown = null;
        this._pointerMoved = false;
        this.canvas.classList.remove('cursor-pointer');
    }

    update() {
        this.scene.update();
    }

    _clearSelection() {
        this._hoverInfo = null;
        this._selectedInfo = null;
        this.ui.setHoverInfo(null);
        this.ui.setSelectedInfo(null);
    }

    _setPointerFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        this._pointer.set(x * 2 - 1, -(y * 2 - 1));
    }

    _pickRegionInfo(event) {
        const mesh = this.scene.getAssetMesh();
        if (!mesh) return null;

        this._setPointerFromEvent(event);
        this._raycaster.setFromCamera(this._pointer, this.engine.camera);
        const hits = this._raycaster.intersectObject(mesh, false);
        if (!hits.length) return null;
        return this.scene.getRegionInfoFromIntersection(hits[0]);
    }

    _handlePointerMove(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (this._pointerDown) {
            const dx = event.clientX - this._pointerDown.x;
            const dy = event.clientY - this._pointerDown.y;
            if (dx * dx + dy * dy > 25) this._pointerMoved = true;
        }

        const info = this._pickRegionInfo(event);
        const changed = (info?.regionId ?? null) !== (this._hoverInfo?.regionId ?? null);
        if (changed) {
            this._hoverInfo = info;
            this.ui.setHoverInfo(info);
        }
        this.canvas.classList.toggle('cursor-pointer', !!info);
    }

    _handlePointerDown(event) {
        if (!event || isInteractiveElement(event.target)) return;
        this._pointerDown = { x: event.clientX, y: event.clientY };
        this._pointerMoved = false;
    }

    _handlePointerUp(event) {
        if (!event || isInteractiveElement(event.target)) return;
        if (!this._pointerDown) return;
        const moved = this._pointerMoved;
        this._pointerDown = null;
        this._pointerMoved = false;
        if (moved) return;

        const info = this._pickRegionInfo(event);
        this._selectedInfo = info;
        this.ui.setSelectedInfo(info);
    }

    _handlePointerLeave() {
        this._pointerDown = null;
        this._pointerMoved = false;
        this._hoverInfo = null;
        this.ui.setHoverInfo(null);
        this.canvas.classList.remove('cursor-pointer');
    }
}
