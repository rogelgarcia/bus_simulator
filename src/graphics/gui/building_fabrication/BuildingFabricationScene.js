// src/graphics/gui/building_fabrication/BuildingFabricationScene.js
// Renders the building fabrication 3D grid and generated building blocks.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function disposeMeshHierarchy(root) {
    if (!root) return;
    root.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isLineSegments) return;
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) {
            for (const mat of o.material) mat?.dispose?.();
        } else {
            o.material?.dispose?.();
        }
    });
}

export class BuildingFabricationScene {
    constructor(engine, {
        gridSize = 3,
        tileSize = 6,
        occupyRatio = 0.9,
        floorHeight = 3.0
    } = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.gridSize = clampInt(gridSize, 1, 99);
        this.tileSize = Math.max(0.5, Number(tileSize) || 6);
        this.occupyRatio = Math.max(0.1, Math.min(0.98, Number(occupyRatio) || 0.9));
        this.floorHeight = Math.max(0.2, Number(floorHeight) || 3.0);

        this.root = null;
        this.controls = null;

        this._prevBackground = null;
        this._prevFog = null;
        this._tiles = [];
        this._tileMeshes = [];
        this._buildingsByTile = new Map();
        this._hoveredTile = null;

        this._groundMesh = null;
        this._gridHelper = null;
    }

    enter() {
        if (this.root) return;
        this.root = new THREE.Group();
        this.root.name = 'building_fabrication_root';
        this.scene.add(this.root);

        this._prevBackground = this.scene.background ?? null;
        this._prevFog = this.scene.fog ?? null;
        this.scene.background = new THREE.Color(0x0b0f14);
        this.scene.fog = new THREE.Fog(0x0b0f14, 22, 90);

        this._buildLights();
        this._buildGround();
        this._buildTiles();
        this._buildCamera();
    }

    dispose() {
        this.controls?.dispose?.();
        this.controls = null;

        if (this.root) {
            this.scene.remove(this.root);
            disposeMeshHierarchy(this.root);
            this.root = null;
        }

        this.scene.background = this._prevBackground;
        this.scene.fog = this._prevFog;
        this._prevBackground = null;
        this._prevFog = null;
        this._tiles.length = 0;
        this._tileMeshes.length = 0;
        this._buildingsByTile.clear();
        this._hoveredTile = null;
        this._groundMesh = null;
        this._gridHelper = null;
    }

    update() {
        this.controls?.update?.();
    }

    resetCamera() {
        if (!this.controls || !this.camera) return;
        const span = this.tileSize * this.gridSize;
        this.camera.position.set(0, span * 0.9, span * 0.9);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    getTileMeshes() {
        return this._tileMeshes;
    }

    getTileIdFromMesh(mesh) {
        const tileId = mesh?.userData?.tileId;
        return typeof tileId === 'string' ? tileId : null;
    }

    getOccupiedCount() {
        return this._buildingsByTile.size;
    }

    setHoveredTile(tileId) {
        const next = tileId || null;
        if (next === this._hoveredTile) return;
        this._hoveredTile = next;
        this._syncTileVisuals();
    }

    toggleBuilding(tileId, { floors } = {}) {
        if (!tileId || !this.root) return;
        const prev = this._buildingsByTile.get(tileId);
        if (prev) {
            prev.removeFromParent();
            disposeMeshHierarchy(prev);
            this._buildingsByTile.delete(tileId);
            this._syncTileVisuals();
            return;
        }

        const tile = this._tiles.find((t) => t.id === tileId);
        if (!tile) return;

        const clampedFloors = clampInt(floors, 1, 9999);
        const height = clampedFloors * this.floorHeight;
        const footprint = this.tileSize * this.occupyRatio;
        const baseY = 0.01;

        const geo = new THREE.BoxGeometry(footprint, height, footprint);
        const mat = new THREE.MeshStandardMaterial({
            color: makeDeterministicColor(tile.seed + clampedFloors).getHex(),
            roughness: 0.85,
            metalness: 0.05
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `building_${tileId}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(tile.center.x, height / 2 + baseY, tile.center.z);
        mesh.userData.tileId = tileId;
        mesh.userData.floors = clampedFloors;

        this.root.add(mesh);
        this._buildingsByTile.set(tileId, mesh);
        this._syncTileVisuals();
    }

    resetScene() {
        for (const mesh of this._buildingsByTile.values()) {
            mesh.removeFromParent();
            disposeMeshHierarchy(mesh);
        }
        this._buildingsByTile.clear();
        this._hoveredTile = null;
        this._syncTileVisuals();
    }

    _buildLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.55);
        this.root.add(ambient);

        const dir = new THREE.DirectionalLight(0xffffff, 0.95);
        dir.position.set(9, 16, 10);
        dir.castShadow = true;
        dir.shadow.mapSize.set(1024, 1024);
        dir.shadow.camera.near = 0.1;
        dir.shadow.camera.far = 80;
        dir.shadow.camera.left = -25;
        dir.shadow.camera.right = 25;
        dir.shadow.camera.top = 25;
        dir.shadow.camera.bottom = -25;
        dir.shadow.bias = -0.00008;
        this.root.add(dir);
    }

    _buildGround() {
        const span = this.tileSize * this.gridSize;
        const geo = new THREE.PlaneGeometry(span * 1.25, span * 1.25);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x0f1520,
            roughness: 0.98,
            metalness: 0.0
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.002;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.name = 'building_fab_ground';
        this.root.add(mesh);
        this._groundMesh = mesh;
    }

    _buildTiles() {
        const baseColor = new THREE.Color(0x172030);
        const span = this.tileSize * this.gridSize;
        const half = span / 2;
        const halfTile = this.tileSize / 2;
        const offset = (this.gridSize - 1) / 2;

        const tileGeo = new THREE.PlaneGeometry(this.tileSize, this.tileSize, 1, 1);
        const tileY = 0.0;

        for (let z = 0; z < this.gridSize; z++) {
            for (let x = 0; x < this.gridSize; x++) {
                const centerX = (x - offset) * this.tileSize;
                const centerZ = (z - offset) * this.tileSize;
                const idx = z * this.gridSize + x;
                const tileId = `${x},${z}`;

                const mat = new THREE.MeshStandardMaterial({
                    color: baseColor.getHex(),
                    roughness: 0.98,
                    metalness: 0.0
                });

                const mesh = new THREE.Mesh(tileGeo, mat);
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.set(centerX, tileY, centerZ);
                mesh.receiveShadow = true;
                mesh.castShadow = false;
                mesh.name = `tile_${tileId}`;
                mesh.userData.tileId = tileId;

                this.root.add(mesh);
                this._tileMeshes.push(mesh);
                this._tiles.push({
                    id: tileId,
                    seed: idx + 1,
                    center: new THREE.Vector3(centerX, 0, centerZ),
                    corners: {
                        minX: centerX - halfTile,
                        maxX: centerX + halfTile,
                        minZ: centerZ - halfTile,
                        maxZ: centerZ + halfTile
                    }
                });
            }
        }

        const grid = new THREE.GridHelper(span, this.gridSize, 0x3b4a60, 0x233044);
        grid.position.y = 0.001;
        grid.name = 'building_fab_grid';
        this.root.add(grid);
        this._gridHelper = grid;

        const borderGeo = new THREE.BufferGeometry();
        const corners = [
            new THREE.Vector3(-half, 0.002, -half),
            new THREE.Vector3(half, 0.002, -half),
            new THREE.Vector3(half, 0.002, half),
            new THREE.Vector3(-half, 0.002, half),
            new THREE.Vector3(-half, 0.002, -half)
        ];
        borderGeo.setFromPoints(corners);
        const borderMat = new THREE.LineBasicMaterial({ color: 0x6ea8ff, opacity: 0.9, transparent: true });
        const border = new THREE.Line(borderGeo, borderMat);
        border.name = 'building_fab_border';
        this.root.add(border);
    }

    _buildCamera() {
        if (!this.camera) return;
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = false;
        this.controls.maxPolarAngle = Math.PI / 2.05;
        this.controls.minPolarAngle = 0.12;
        this.controls.enablePan = true;

        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls.minDistance = Math.max(4, dist * 0.35);
        this.controls.maxDistance = dist * 2.2;

        this.resetCamera();
    }

    _syncTileVisuals() {
        const occupiedColor = new THREE.Color(0x2ec27e);
        const baseColor = new THREE.Color(0x172030);

        for (const mesh of this._tileMeshes) {
            const tileId = mesh.userData.tileId;
            const occupied = this._buildingsByTile.has(tileId);
            const hovered = this._hoveredTile === tileId;

            const target = occupied ? occupiedColor : baseColor;
            mesh.material.color.copy(target);

            const emissiveStrength = hovered ? 1 : 0;
            const e = mesh.material.emissive ?? new THREE.Color(0x000000);
            const emissive = new THREE.Color().copy(target).lerp(new THREE.Color(0xffffff), 0.2);
            e.copy(emissive).multiplyScalar(lerp(0, 0.35, emissiveStrength));
            mesh.material.emissive = e;
            mesh.material.needsUpdate = true;
        }
    }
}
