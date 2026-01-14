// src/graphics/gui/inspector_room/InspectorRoomMeshesProvider.js
// Mesh inspection content provider for the Inspector Room.
import * as THREE from 'three';
import {
    createProceduralMeshAsset,
    getProceduralMeshCollectionId,
    getProceduralMeshCollections,
    getProceduralMeshOptionsForCollection
} from '../../assets3d/procedural_meshes/ProceduralMeshCatalog.js';
import { isRigApi } from '../../../app/rigs/RigSchema.js';
import { isPrefabParamsApi } from '../../../app/prefabs/PrefabParamsSchema.js';

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

export class InspectorRoomMeshesProvider {
    constructor(engine) {
        this.engine = engine;

        this.root = null;
        this._parent = null;

        this._asset = null;
        this._edges = null;
        this._pivotGizmo = null;

        this._wireframe = false;
        this._edgesEnabled = false;
        this._pivotEnabled = false;
        this._colorMode = 'semantic';
        this._collectionId = this.getCollectionOptions()[0]?.id ?? null;
        this._meshId = null;
        this._meshIndex = 0;
    }

    getId() {
        return 'meshes';
    }

    getLabel() {
        return 'Meshes';
    }

    getRoomConfig() {
        return {
            planeSize: 20,
            planeY: 0,
            planeColor: 0x0f1722,
            planeRoughness: 1.0,
            planeMetalness: 0.0,
            gridSize: 20,
            gridDivisions: 40
        };
    }

    mount(parent) {
        const target = parent && typeof parent === 'object' ? parent : null;
        if (!target) return;
        this._parent = target;

        if (!this.root) {
            this.root = new THREE.Group();
            this.root.name = 'inspector_room_meshes_root';
        }

        if (!this.root.parent) target.add(this.root);

        if (!this._asset) {
            if (this._meshId) this.setSelectedMeshId(this._meshId);
            else this.setSelectedMeshIndex(this._meshIndex);
        }
    }

    unmount() {
        this._parent?.remove?.(this.root);
        this._parent = null;
    }

    dispose() {
        this._disposePivotGizmo();
        this._disposeEdges();
        this._disposeAsset();
        this._parent?.remove?.(this.root);
        this._parent = null;
        this.root = null;
    }

    update() {
        const mesh = this._asset?.mesh ?? null;
        if (mesh?.userData?._meshInspectorNeedsEdgesRefresh) {
            mesh.userData._meshInspectorNeedsEdgesRefresh = false;
            this._disposeEdges();
            this._syncEdgesOverlay();
        }
    }

    getCollectionOptions() {
        return getProceduralMeshCollections();
    }

    getSelectedCollectionId() {
        return this._collectionId;
    }

    setSelectedCollectionId(collectionId) {
        const list = this.getCollectionOptions();
        const next = list.find((c) => c?.id === collectionId)?.id ?? list[0]?.id ?? null;
        if (!next || next === this._collectionId) return;
        this._collectionId = next;
        const options = this.getMeshOptions();
        const keep = options.find((opt) => opt?.id === this._meshId)?.id ?? options[0]?.id ?? null;
        this._meshIndex = 0;
        if (keep) this.setSelectedMeshId(keep);
    }

    getMeshOptions() {
        return getProceduralMeshOptionsForCollection(this._collectionId);
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

    getSelectedMeshId() {
        return this._meshId;
    }

    setSelectedMeshId(meshId) {
        const desiredCollection = getProceduralMeshCollectionId(meshId);
        if (desiredCollection && desiredCollection !== this._collectionId) {
            this._collectionId = desiredCollection;
        }

        const options = this.getMeshOptions();
        const idx = options.findIndex((opt) => opt?.id === meshId);
        const resolved = idx >= 0 ? meshId : (options[0]?.id ?? null);
        if (!resolved) return;
        const resolvedIndex = idx >= 0 ? idx : 0;
        this._meshIndex = resolvedIndex;
        this._meshId = resolved;

        if (this._asset?.id === resolved) return;
        this._disposeEdges();
        this._disposeAsset();

        const asset = createProceduralMeshAsset(resolved);
        this._asset = asset;
        if (asset?.mesh && this.root) {
            asset.mesh.position.set(0, 0, 0);
            asset.mesh.castShadow = true;
            asset.mesh.receiveShadow = true;
            this.root.add(asset.mesh);
        }
        this._syncMeshMaterials();
        this._syncEdgesOverlay();
        this._syncPivotGizmo();
    }

    getSelectedMeshMeta() {
        if (!this._asset) return null;
        return { id: this._asset.id, name: this._asset.name };
    }

    getPickMesh() {
        return this._asset?.mesh ?? null;
    }

    getPrefabParamsApi() {
        const api = this._asset?.mesh?.userData?.prefab ?? null;
        return isPrefabParamsApi(api) ? api : null;
    }

    getRigApi() {
        const api = this._asset?.mesh?.userData?.rig ?? null;
        return isRigApi(api) ? api : null;
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

    getPivotEnabled() {
        return this._pivotEnabled;
    }

    setPivotEnabled(enabled) {
        const next = !!enabled;
        if (next === this._pivotEnabled) return;
        this._pivotEnabled = next;
        this._syncPivotGizmo();
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

    getFocusBounds() {
        const mesh = this._asset?.mesh ?? null;
        if (!mesh) return null;
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty()) return null;
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        return {
            center: sphere.center.clone(),
            radius: Number.isFinite(sphere.radius) ? Math.max(0.001, sphere.radius) : 1
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

        if (!this._edges && this._asset?.mesh?.geometry && this.root) {
            const geo = new THREE.EdgesGeometry(this._asset.mesh.geometry, 14);
            const mat = new THREE.LineBasicMaterial({ color: 0xcfe1ff, transparent: true, opacity: 0.65 });
            this._edges = new THREE.LineSegments(geo, mat);
            this._edges.name = 'inspector_room_mesh_edges';
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

    _syncPivotGizmo() {
        const mesh = this._asset?.mesh ?? null;
        if (!mesh || !this._pivotEnabled) {
            if (this._pivotGizmo) this._pivotGizmo.visible = false;
            return;
        }

        if (!this._pivotGizmo) {
            const gizmo = new THREE.Group();
            gizmo.name = 'inspector_room_mesh_pivot';

            const makeAxis = (dir, color, len) => {
                const pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(len)];
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
                const line = new THREE.Line(geo, mat);
                line.renderOrder = 999;
                return line;
            };

            const len = this._getPivotScale();
            gizmo.add(makeAxis(new THREE.Vector3(1, 0, 0), 0xff0000, len));
            gizmo.add(makeAxis(new THREE.Vector3(0, 1, 0), 0x00ff00, len));
            gizmo.add(makeAxis(new THREE.Vector3(0, 0, 1), 0x0000ff, len));
            gizmo.renderOrder = 999;
            this._pivotGizmo = gizmo;
        }

        this._pivotGizmo.visible = true;
        if (!mesh.children.includes(this._pivotGizmo)) mesh.add(this._pivotGizmo);
        this._pivotGizmo.position.set(0, 0, 0);

        const len = this._getPivotScale();
        for (const child of this._pivotGizmo.children) {
            const geo = child?.geometry ?? null;
            const pos = geo?.attributes?.position ?? null;
            if (!pos || !pos.array || pos.array.length < 6) continue;
            pos.array[3] = (pos.array[3] > 0 ? 1 : (pos.array[3] < 0 ? -1 : 0)) * len;
            pos.array[4] = (pos.array[4] > 0 ? 1 : (pos.array[4] < 0 ? -1 : 0)) * len;
            pos.array[5] = (pos.array[5] > 0 ? 1 : (pos.array[5] < 0 ? -1 : 0)) * len;
            pos.needsUpdate = true;
        }
    }

    _getPivotScale() {
        const mesh = this._asset?.mesh ?? null;
        if (!mesh) return 0.5;
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty()) return 0.5;
        const size = new THREE.Vector3();
        box.getSize(size);
        const extent = Math.max(size.x, size.y, size.z);
        return Math.max(0.25, Math.min(1.8, extent * 0.22));
    }

    _disposePivotGizmo() {
        const pivot = this._pivotGizmo ?? null;
        if (!pivot) return;
        pivot.parent?.remove?.(pivot);
        pivot.traverse?.((obj) => {
            obj.geometry?.dispose?.();
            if (Array.isArray(obj.material)) {
                for (const m of obj.material) m?.dispose?.();
            } else {
                obj.material?.dispose?.();
            }
        });
        this._pivotGizmo = null;
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

