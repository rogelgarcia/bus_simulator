// src/graphics/gui/mesh_inspector/MeshInspectorScene.js
// Renders procedural meshes with stable region identifiers.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { createProceduralMeshAsset, getProceduralMeshOptions } from '../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function groupForTriangleOffset(geometry, triOffset) {
    const groups = geometry?.groups ?? [];
    for (const group of groups) {
        const start = group?.start ?? 0;
        const count = group?.count ?? 0;
        if (triOffset >= start && triOffset < start + count) return group;
    }
    return null;
}

export class MeshInspectorScene {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.root = null;
        this.controls = null;
        this.sky = null;
        this.hemi = null;
        this.sun = null;
        this.floor = null;
        this._grid = null;
        this._axes = null;

        this._asset = null;
        this._edges = null;

        this._wireframe = false;
        this._edgesEnabled = false;
        this._colorMode = 'semantic';
        this._meshIndex = 0;
    }

    enter() {
        if (this.root) return;

        this.root = new THREE.Group();
        this.root.name = 'mesh_inspector_root';
        this.scene.add(this.root);

        this.sky = createGradientSkyDome();
        if (this.sky) this.root.add(this.sky);

        this.hemi = new THREE.HemisphereLight(0xe8f0ff, 0x0b0f14, 0.85);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sun.position.set(4, 8, 5);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        this.sun.shadow.camera.near = 0.1;
        this.sun.shadow.camera.far = 50;
        this.root.add(this.sun);

        const planeGeo = new THREE.PlaneGeometry(20, 20);
        const planeMat = new THREE.MeshStandardMaterial({ color: 0x0f1722, metalness: 0.0, roughness: 1.0 });
        this.floor = new THREE.Mesh(planeGeo, planeMat);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = -1.25;
        this.floor.receiveShadow = true;
        this.root.add(this.floor);

        const grid = new THREE.GridHelper(20, 40, 0x2b3544, 0x1a2230);
        grid.position.y = this.floor.position.y + 0.001;
        this.root.add(grid);
        this._grid = grid;

        const axisSize = 2;
        const axes = new THREE.Group();
        axes.name = 'mesh_inspector_axes';
        axes.position.y = this.floor.position.y + 0.002;

        const makeAxis = (dir, color) => {
            const points = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(axisSize)];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({ color });
            return new THREE.Line(geo, mat);
        };

        axes.add(makeAxis(new THREE.Vector3(1, 0, 0), 0xff0000));
        axes.add(makeAxis(new THREE.Vector3(0, 1, 0), 0x00ff00));
        axes.add(makeAxis(new THREE.Vector3(0, 0, 1), 0x0000ff));

        this.root.add(axes);
        this._axes = axes;

        this.camera.position.set(0, 0.65, 4.2);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.4;
        this.controls.maxDistance = 12;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.setSelectedMeshIndex(this._meshIndex);
        this._syncMeshMaterials();
        this._syncEdgesOverlay();
    }

    dispose() {
        this.controls?.dispose?.();
        this.controls = null;

        this._disposeAsset();
        this._disposeEdges();

        if (this._grid) {
            this.root?.remove?.(this._grid);
            this._grid.geometry?.dispose?.();
            if (Array.isArray(this._grid.material)) {
                for (const m of this._grid.material) m?.dispose?.();
            } else {
                this._grid.material?.dispose?.();
            }
            this._grid = null;
        }

        if (this._axes) {
            this.root?.remove?.(this._axes);
            this._axes.traverse?.((obj) => {
                obj.geometry?.dispose?.();
                if (Array.isArray(obj.material)) {
                    for (const m of obj.material) m?.dispose?.();
                } else {
                    obj.material?.dispose?.();
                }
            });
            this._axes = null;
        }

        if (this.floor) {
            this.root?.remove?.(this.floor);
            this.floor.geometry?.dispose?.();
            this.floor.material?.dispose?.();
            this.floor = null;
        }

        if (this.sky) {
            this.root?.remove?.(this.sky);
            this.sky.geometry?.dispose?.();
            this.sky.material?.dispose?.();
            this.sky = null;
        }

        if (this.root) {
            this.scene.remove(this.root);
            this.root = null;
        }
    }

    update() {
        this.controls?.update?.();
    }

    getMeshOptions() {
        return getProceduralMeshOptions();
    }

    getSelectedMeshIndex() {
        return this._meshIndex;
    }

    setSelectedMeshIndex(index) {
        const options = this.getMeshOptions();
        const next = clampInt(index, 0, Math.max(0, options.length - 1));
        this._meshIndex = next;
        const id = options[next]?.id ?? options[0]?.id ?? null;
        if (id) this.setSelectedMeshId(id);
    }

    setSelectedMeshId(meshId) {
        const options = this.getMeshOptions();
        const idx = options.findIndex((opt) => opt?.id === meshId);
        if (idx >= 0) this._meshIndex = idx;

        if (this._asset?.id === meshId) return;
        this._disposeEdges();
        this._disposeAsset();

        const asset = createProceduralMeshAsset(meshId);
        this._asset = asset;
        if (asset?.mesh) {
            asset.mesh.position.set(0, 0, 0);
            this.root.add(asset.mesh);
        }
        this._syncMeshMaterials();
        this._syncEdgesOverlay();
    }

    getSelectedMeshMeta() {
        if (!this._asset) return null;
        return { id: this._asset.id, name: this._asset.name };
    }

    getColorMode() {
        return this._colorMode;
    }

    setColorMode(mode) {
        const next = mode === 'solid' ? 'solid' : 'semantic';
        if (next === this._colorMode) return;
        this._colorMode = next;
        this._syncMeshMaterials();
    }

    getWireframeEnabled() {
        return this._wireframe;
    }

    setWireframeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._wireframe) return;
        this._wireframe = next;
        this._syncMeshMaterials();
    }

    getEdgesEnabled() {
        return this._edgesEnabled;
    }

    setEdgesEnabled(enabled) {
        const next = !!enabled;
        if (next === this._edgesEnabled) return;
        this._edgesEnabled = next;
        this._syncEdgesOverlay();
    }

    getAssetMesh() {
        return this._asset?.mesh ?? null;
    }

    getRegionInfoFromIntersection(hit) {
        const mesh = this._asset?.mesh;
        const geometry = mesh?.geometry;
        if (!hit || hit.object !== mesh || !geometry) return null;

        const faceIndex = Number.isFinite(hit.faceIndex) ? hit.faceIndex : null;
        if (faceIndex === null) return null;

        const triOffset = faceIndex * 3;
        const group = groupForTriangleOffset(geometry, triOffset);
        const matIndex = Number.isFinite(group?.materialIndex) ? group.materialIndex : null;
        if (matIndex === null) return null;

        const region = (this._asset?.regions ?? [])[matIndex] ?? null;
        if (!region) return null;

        const sourceType = this._asset?.source?.type ?? null;
        const sourceVersion = this._asset?.source?.version ?? null;

        return {
            meshId: this._asset.id,
            meshName: this._asset.name,
            sourceType,
            sourceVersion,
            regionId: region.id,
            regionLabel: region.label,
            tag: region.tag,
            triangle: faceIndex
        };
    }

    _syncMeshMaterials() {
        const asset = this._asset;
        const mesh = asset?.mesh;
        if (!asset || !mesh) return;

        const materials = this._colorMode === 'solid'
            ? asset.materials.solid
            : asset.materials.semantic;

        const applyWireframe = (mat) => {
            if (!mat) return;
            mat.wireframe = !!this._wireframe;
            mat.needsUpdate = true;
        };

        if (Array.isArray(materials)) {
            for (const mat of materials) applyWireframe(mat);
        } else {
            applyWireframe(materials);
        }

        mesh.material = materials;
    }

    _syncEdgesOverlay() {
        if (!this._edgesEnabled) {
            if (this._edges) this._edges.visible = false;
            return;
        }

        if (!this._edges && this._asset?.mesh?.geometry) {
            const geo = new THREE.EdgesGeometry(this._asset.mesh.geometry, 14);
            const mat = new THREE.LineBasicMaterial({ color: 0xcfe1ff, transparent: true, opacity: 0.65 });
            this._edges = new THREE.LineSegments(geo, mat);
            this._edges.name = 'mesh_inspector_edges';
            this.root.add(this._edges);
        }

        if (this._edges) {
            this._edges.visible = true;
            const mesh = this._asset?.mesh;
            if (mesh) {
                this._edges.position.copy(mesh.position);
                this._edges.rotation.copy(mesh.rotation);
                this._edges.scale.copy(mesh.scale);
            }
        }
    }

    _disposeEdges() {
        if (!this._edges) return;
        this.root?.remove?.(this._edges);
        this._edges.geometry?.dispose?.();
        this._edges.material?.dispose?.();
        this._edges = null;
    }

    _disposeAsset() {
        if (!this._asset) return;
        const asset = this._asset;
        const mesh = asset.mesh;
        if (mesh) {
            this.root?.remove?.(mesh);
            mesh.geometry?.dispose?.();
            const semantic = asset?.materials?.semantic;
            const solid = asset?.materials?.solid;
            if (Array.isArray(semantic)) {
                for (const m of semantic) m?.dispose?.();
            } else {
                semantic?.dispose?.();
            }
            if (Array.isArray(solid)) {
                for (const m of solid) m?.dispose?.();
            } else {
                solid?.dispose?.();
            }
        }
        this._asset = null;
    }
}
