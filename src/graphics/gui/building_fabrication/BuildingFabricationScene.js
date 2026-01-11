// src/graphics/gui/building_fabrication/BuildingFabricationScene.js
// Renders the building fabrication 3D grid and generated buildings/roads.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { CityMap, TILE } from '../../../app/city/CityMap.js';
import { createCityWorld } from '../../../app/city/CityWorld.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { generateRoads } from '../../assets3d/generators/RoadGenerator.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { createRoadHighlightMesh } from '../../visuals/city/RoadHighlightMesh.js';

const QUANT = 1000;
const ROAD_LANES_F = 1;
const ROAD_LANES_B = 1;
const BUILDING_LINE_COLOR = 0xff3b30;
const BUILDING_BORDER_COLOR = 0x64d2ff;

const EPS = 1e-6;
const HALF = 0.5;
const DOUBLE = 2;
const MIN_LANES_ONEWAY = 2;
const ROAD_HIGHLIGHT_COLOR = 0xfff3a3;
const ROAD_HIGHLIGHT_OPACITY = 0.25;
const ROAD_HIGHLIGHT_LIFT = 0.04;
const ROAD_HIGHLIGHT_PAD_TILE_FRACTION = 0.18;
const ROAD_HIGHLIGHT_PAD_LANE_FACTOR = 0.6;
const ROAD_HIGHLIGHT_PAD_CURB_FACTOR = 2.4;
const ROAD_HIGHLIGHT_PAD_MIN = 1.2;

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function q(value) {
    return Math.round(value * QUANT);
}

function uq(value) {
    return value / QUANT;
}

function signedArea(points) {
    let sum = 0;
    const n = points.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function disposeTextureProps(mat) {
    if (!mat) return;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (v && v.isTexture && !v.userData?.buildingFabShared) v.dispose?.();
    }
}

function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isLineSegments && !o.isLine2 && !o.isLineSegments2) return;
        o.geometry?.dispose?.();
        const mat = o.material;
        if (!mat) return;
        if (Array.isArray(mat)) {
            for (const m of mat) {
                disposeTextureProps(m);
                m?.dispose?.();
            }
        } else {
            disposeTextureProps(mat);
            mat.dispose?.();
        }
    });
}

function makeDeterministicColor(seed) {
    const s = Math.sin(seed * 999.123) * 43758.5453;
    const r = s - Math.floor(s);
    const color = new THREE.Color();
    color.setHSL(r, 0.55, 0.58);
    return color;
}

function tileIdFromXY(x, y) {
    return `${x},${y}`;
}

function normalizeDir(x, y) {
    const len = Math.hypot(x, y);
    if (!(len > EPS)) return null;
    const inv = 1 / len;
    return { x: x * inv, y: y * inv };
}

function laneCount(lanesF, lanesB) {
    const f = lanesF ?? 0;
    const b = lanesB ?? 0;
    const total = f + b;
    if (total <= 0) return 0;
    if (f === 0 || b === 0) return Math.max(MIN_LANES_ONEWAY, total);
    return total;
}

function roadWidth(lanesF, lanesB, laneWidth, shoulder, tileSize) {
    const lanes = laneCount(lanesF, lanesB);
    const raw = lanes * laneWidth + shoulder * DOUBLE;
    return clamp(raw, laneWidth, tileSize);
}

function offsetEndpoints(p0, p1, normal, offset) {
    return {
        start: { x: p0.x + normal.x * offset, y: p0.y + normal.y * offset },
        end: { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset }
    };
}

export class BuildingFabricationScene {
    constructor(engine, {
        gridSize = 5,
        tileSize = 24,
        occupyRatio = 1.0,
        floorHeight = null
    } = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.gridSize = clampInt(gridSize, 3, 25);
        this.tileSize = Math.max(4, Number(tileSize) || 24);
        this.occupyRatio = clamp(occupyRatio, 0.5, 1.0);

        this.tileMeters = 2;
        this.generatorConfig = createGeneratorConfig({
            render: { roadMode: 'normal', treesEnabled: false }
        });

        const laneWidth = this.generatorConfig?.road?.laneWidth ?? 4.8;
        const defaultFloorHeight = laneWidth * (3.2 / 3.6);
        this.floorHeight = clamp(
            Number.isFinite(floorHeight) ? floorHeight : defaultFloorHeight,
            1.0,
            12.0
        );

        this.root = null;
        this.controls = null;

        this.map = null;
        this.world = null;
        this.roads = null;
        this.sky = null;
        this.sun = null;
        this.hemi = null;

        this._restore = null;
        this._overlayGeo = null;
        this._overlayY = 0.06;
        this._tiles = [];
        this._tileMeshes = [];
        this._tileById = new Map();

        this._selectedTiles = new Set();
        this._buildings = [];
        this._buildingsByTile = new Map();
        this._hoveredTile = null;

        this._showWireframe = false;
        this._showFloorDivisions = false;
        this._showFloorplan = false;

        this._buildingModeEnabled = false;
        this._selectionPlanGroup = null;

        this._selectedBuildingId = null;
        this._hoveredBuildingId = null;
        this._hideSelectionBorder = false;

        this._roadModeEnabled = false;
        this._roadStartTileId = null;
        this._roadEndTileId = null;
        this._roadIdCounter = 0;

        this._hoveredRoadId = null;
        this._roadHighlightMesh = null;
        this._roadHighlightGeo = null;
        this._roadHighlightMat = null;
        this._roadHighlightPos = null;
        this._roadHighlightY = 0;

        this._lineResolution = new THREE.Vector2();
        this._wallTextureLoader = new THREE.TextureLoader();
        this._wallTextureCache = new Map();
    }

    enter() {
        if (this.root) return;
        this.root = new THREE.Group();
        this.root.name = 'building_fabrication_root';
        this.scene.add(this.root);

        this._restore = {
            bg: this.scene.background ?? null,
            fog: this.scene.fog ?? null,
            far: Number.isFinite(this.camera?.far) ? this.camera.far : null
        };

        const span = this.tileSize * this.gridSize;
        this.scene.background = null;
        this.scene.fog = new THREE.Fog(0xdff3ff, Math.max(40, span * 0.5), Math.max(240, span * 3.2));

        if (this.camera && Number.isFinite(this.camera.far)) {
            this.camera.far = Math.max(this.camera.far, 2500);
            this.camera.updateProjectionMatrix();
        }

        this._buildMap();
        this._buildLights();
        this._buildSky();
        this._buildWorld();
        this._buildRoads();
        this._buildTileOverlays();
        this._buildSelectionPreview();
        this._setupRoadHighlight();
        this._buildCamera();
    }

    dispose() {
        this._clearRoadHighlight();
        this._hoveredRoadId = null;

        this.controls?.dispose?.();
        this.controls = null;

        if (this.root) {
            this.scene.remove(this.root);
            disposeObject3D(this.root);
            this.root = null;
        }

        this._disposeWallTextureCache();

        if (this._restore) {
            this.scene.background = this._restore.bg ?? null;
            this.scene.fog = this._restore.fog ?? null;
            if (this.camera && Number.isFinite(this._restore.far)) {
                this.camera.far = this._restore.far;
                this.camera.updateProjectionMatrix();
            }
        }

        this._restore = null;
        this._overlayGeo = null;
        this._tiles.length = 0;
        this._tileMeshes.length = 0;
        this._tileById.clear();
        this._selectedTiles.clear();
        this._buildings.length = 0;
        this._buildingsByTile.clear();
        this._hoveredTile = null;
        this._buildingModeEnabled = false;
        this._selectionPlanGroup = null;
        this._selectedBuildingId = null;

        this.map = null;
        this.world = null;
        this.roads = null;
        this.sky = null;
        this.sun = null;
        this.hemi = null;
    }

    update() {
        this.controls?.update?.();
        if (this.sky && this.camera) {
            this.sky.position.copy(this.camera.position);
        }
        this._syncLineResolution();
    }

    resetCamera() {
        if (!this.controls || !this.camera) return;
        const span = this.tileSize * this.gridSize;
        this.camera.position.set(0, span * 0.95, span * 0.95);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    _syncLineResolution() {
        if (!this.root || !this.engine?.renderer || !this._lineResolution) return;
        const size = this.engine.renderer.getSize(this._lineResolution);
        const width = size.x;
        const height = size.y;
        if (!(width > 0 && height > 0)) return;

        this.root.traverse((obj) => {
            const mat = obj?.material;
            if (!mat) return;
            const updateMat = (m) => {
                if (!m?.isLineMaterial) return;
                if (!m.resolution) return;
                m.resolution.set(width, height);
            };
            if (Array.isArray(mat)) {
                for (const m of mat) updateMat(m);
            } else {
                updateMat(mat);
            }
        });
    }

    getTileMeshes() {
        return this._tileMeshes;
    }

    getTileIdFromMesh(mesh) {
        const tileId = mesh?.userData?.tileId;
        return typeof tileId === 'string' ? tileId : null;
    }

    getGridSize() {
        return this.gridSize;
    }

    getFloorHeight() {
        return this.floorHeight;
    }

    getSelectedCount() {
        return this._selectedTiles.size;
    }

    getBuildingCount() {
        return this._buildings.length;
    }

    getRoadTileCount() {
        if (!this.map) return 0;
        return this.map.countRoadTiles();
    }

    getBuildingModeEnabled() {
        return this._buildingModeEnabled;
    }

    getSelectedBuildingId() {
        return this._selectedBuildingId;
    }

    getSelectedBuilding() {
        if (!this._selectedBuildingId) return null;
        return this._buildings.find((b) => b.id === this._selectedBuildingId) ?? null;
    }

    getBuildings() {
        return this._buildings.map((b) => ({
            id: b.id,
            floors: b.floors,
            floorHeight: b.floorHeight,
            tileCount: b.tiles.size
        }));
    }

    getRoadSegments() {
        if (!this.map) return [];
        const segments = Array.isArray(this.map.roadSegments) ? this.map.roadSegments : [];
        const out = [];
        for (const seg of segments) {
            if (!seg) continue;
            out.push({
                id: seg.id,
                a: { x: seg.a?.x ?? 0, y: seg.a?.y ?? 0 },
                b: { x: seg.b?.x ?? 0, y: seg.b?.y ?? 0 },
                lanesF: seg.lanesF ?? 0,
                lanesB: seg.lanesB ?? 0,
                tileCount: Array.isArray(seg.tiles) ? seg.tiles.length : 0
            });
        }
        out.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        return out;
    }

    getRoadModeEnabled() {
        return this._roadModeEnabled;
    }

    getRoadSelection() {
        return {
            startTileId: this._roadStartTileId,
            endTileId: this._roadEndTileId
        };
    }

    getHideSelectionBorder() {
        return this._hideSelectionBorder;
    }

    setHideSelectionBorder(hidden) {
        const next = !!hidden;
        if (next === this._hideSelectionBorder) return;
        this._hideSelectionBorder = next;
        this._syncBuildingBorders();
    }

    _updateHoveredBuildingId() {
        const tileId = this._hoveredTile;
        const hovered = (!this._roadModeEnabled && !this._buildingModeEnabled && tileId)
            ? (this._buildingsByTile.get(tileId)?.id ?? null)
            : null;
        const changed = hovered !== this._hoveredBuildingId;
        this._hoveredBuildingId = hovered;
        return changed;
    }

    setHoveredTile(tileId) {
        const next = tileId || null;
        if (next === this._hoveredTile) return;
        this._hoveredTile = next;
        if (this._updateHoveredBuildingId()) this._syncBuildingBorders();
        this._syncTileVisuals();
    }

    setBuildingModeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._buildingModeEnabled) return;

        if (next) this.setRoadModeEnabled(false);

        this._buildingModeEnabled = next;
        this._selectedTiles.clear();
        this._selectedBuildingId = null;
        this._updateHoveredBuildingId();
        this._syncSelectionPreview();
        this._syncModeVisibility();
        this._syncBuildingBorders();
        this._syncTileVisuals();
    }

    setSelectedBuildingId(buildingId) {
        const next = typeof buildingId === 'string' ? buildingId : null;
        if (next === this._selectedBuildingId) return;
        this._selectedBuildingId = next;
        this._syncBuildingBorders();
        this._syncTileVisuals();
    }

    selectBuildingByTileId(tileId) {
        const existing = tileId ? this._buildingsByTile.get(tileId) : null;
        this.setSelectedBuildingId(existing?.id ?? null);
    }

    removeSelectedBuilding() {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        this._removeBuilding(building);
        this._selectedBuildingId = null;
        this._syncBuildingBorders();
        this._syncTileVisuals();
        return true;
    }

    setSelectedBuildingFloors(floors) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clampInt(floors, 1, 30);
        if (next === building.floors) return false;
        building.floors = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingFloorHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(height, 1.0, 12.0);
        const cur = Number.isFinite(building.floorHeight) ? building.floorHeight : this.floorHeight;
        if (Math.abs(next - cur) < 1e-6) return false;
        building.floorHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingType(type) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const raw = typeof type === 'string' ? type : '';
        const next = raw === 'business' || raw === 'industrial' || raw === 'apartments' || raw === 'house'
            ? raw
            : 'business';
        if (next === building.type) return false;
        building.type = next;
        return true;
    }

    setSelectedBuildingWallTexture(textureUrl) {
        const building = this.getSelectedBuilding();
        if (!building) return false;

        const next = typeof textureUrl === 'string' && textureUrl ? textureUrl : null;
        if (next === building.wallTextureUrl) return false;
        building.wallTextureUrl = next;

        if (!next) {
            this._applyWallTextureToBuilding(building, null);
            return true;
        }

        const tex = this._getOrRequestWallTexture(next);
        if (tex) this._applyWallTextureToBuilding(building, tex);
        else this._applyWallTextureToBuilding(building, null);
        return true;
    }

    setShowWireframe(enabled) {
        const next = !!enabled;
        if (next === this._showWireframe) return;
        this._showWireframe = next;
        this._syncBuildingRenderModes();
    }

    setShowFloorDivisions(enabled) {
        const next = !!enabled;
        if (next === this._showFloorDivisions) return;
        this._showFloorDivisions = next;
        this._syncBuildingRenderModes();
    }

    setShowFloorplan(enabled) {
        const next = !!enabled;
        if (next === this._showFloorplan) return;
        this._showFloorplan = next;
        this._syncBuildingRenderModes();
    }

    setRoadModeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._roadModeEnabled) return;
        if (next) this.setBuildingModeEnabled(false);
        this._roadModeEnabled = next;
        this._roadStartTileId = null;
        this._roadEndTileId = null;
        this._syncModeVisibility();
        this._updateHoveredBuildingId();
        this._syncBuildingBorders();
        this._syncTileVisuals();
    }

    setHoveredRoadId(roadId) {
        const next = (roadId === null || roadId === undefined)
            ? null
            : Math.round(Number(roadId));
        const safe = Number.isFinite(next) && next >= 0 ? next : null;
        if (safe === this._hoveredRoadId) return;
        this._hoveredRoadId = safe;
        this._updateRoadHighlight();
    }

    removeRoad(roadId) {
        if (!this.map) return false;
        const id = (roadId === null || roadId === undefined) ? null : Math.round(Number(roadId));
        if (!Number.isFinite(id) || id < 0) return false;

        const segments = Array.isArray(this.map.roadSegments) ? this.map.roadSegments : [];
        const removed = segments[id];
        if (!removed) return false;

        const kept = [];
        for (const seg of segments) {
            if (!seg) continue;
            if (seg.id === id) continue;
            kept.push(seg);
        }

        const { width, height, tileSize, origin } = this.map;
        const nextMap = new CityMap({
            width,
            height,
            tileSize,
            origin: { x: origin.x, z: origin.z }
        });

        for (const seg of kept) {
            nextMap.addRoadSegment({
                a: [seg.a?.x ?? 0, seg.a?.y ?? 0],
                b: [seg.b?.x ?? 0, seg.b?.y ?? 0],
                lanesF: seg.lanesF ?? 0,
                lanesB: seg.lanesB ?? 0,
                id: seg.id
            });
        }
        nextMap.finalize();
        this.map = nextMap;

        if (this._hoveredRoadId === id) this._hoveredRoadId = null;
        this._updateRoadHighlight();

        this._rebuildRoads();
        this._refreshGroundTiles();
        this._rebuildBuildings();
        this._syncSelectionPreview();
        this._syncTileVisuals();
        return true;
    }

    setGridSize(size) {
        const next = clampInt(size, 3, 25);
        if (next === this.gridSize) return;
        this.gridSize = next;
        this._roadIdCounter = 0;
        this._clearBuildings();
        this._rebuildScene({ keepMode: true });
    }

    setFloorHeight(height) {
        const next = clamp(height, 1.0, 12.0);
        if (Math.abs(next - this.floorHeight) < 1e-6) return;
        this.floorHeight = next;
        this._rebuildBuildings();
    }

    _syncBuildingRenderMode(building) {
        if (!building) return;
        const floorplan = this._showFloorplan;

        if (building.planGroup) building.planGroup.visible = floorplan;
        if (building.solidGroup) building.solidGroup.visible = !floorplan && !this._showWireframe;
        if (building.wireGroup) building.wireGroup.visible = !floorplan && this._showWireframe;
        if (building.floorsGroup) building.floorsGroup.visible = !floorplan && this._showFloorDivisions;
    }

    _syncBuildingRenderModes() {
        for (const building of this._buildings) {
            this._syncBuildingRenderMode(building);
        }
    }

    _syncBuildingBorder(building) {
        if (!building?.borderGroup) return;
        const hovered = !!this._hoveredBuildingId && building.id === this._hoveredBuildingId;
        const selected = !!this._selectedBuildingId && building.id === this._selectedBuildingId;
        const showSelected = selected && !this._hideSelectionBorder;
        building.borderGroup.visible = hovered || showSelected;
    }

    _syncBuildingBorders() {
        for (const building of this._buildings) {
            this._syncBuildingBorder(building);
        }
    }

    clearSelection() {
        if (!this._selectedTiles.size) return;
        this._selectedTiles.clear();
        this._syncSelectionPreview();
        this._syncTileVisuals();
    }

    toggleTileSelection(tileId) {
        if (!this._buildingModeEnabled) return;
        if (!tileId) return;
        const meta = this._tileById.get(tileId);
        if (!meta || !this.map) return;
        if (this.map.kind[meta.idx] === TILE.ROAD) return;

        if (this._selectedTiles.has(tileId)) this._selectedTiles.delete(tileId);
        else this._selectedTiles.add(tileId);
        this._syncSelectionPreview();
        this._syncTileVisuals();
    }

    createBuildingsFromSelection({ floors, floorHeight } = {}) {
        if (!this.root) return;
        if (!this._selectedTiles.size) return;

        const clampedFloors = clampInt(floors, 1, 30);
        const clampedFloorHeight = clamp(
            Number.isFinite(floorHeight) ? floorHeight : this.floorHeight,
            1.0,
            12.0
        );
        const selection = new Set(this._selectedTiles);
        const overlaps = new Set();
        for (const tileId of selection) {
            const existing = this._buildingsByTile.get(tileId);
            if (existing) overlaps.add(existing);
        }
        for (const building of overlaps) {
            this._removeBuilding(building);
        }

        const clusters = this._clusterTiles(selection);
        let best = null;
        let bestSize = 0;
        for (const cluster of clusters) {
            const created = this._createBuilding(cluster, clampedFloors, clampedFloorHeight);
            const size = created?.tiles?.size ?? 0;
            if (created && size >= bestSize) {
                best = created;
                bestSize = size;
            }
        }

        this._selectedTiles.clear();
        this._syncSelectionPreview();
        this._syncTileVisuals();
        this.setBuildingModeEnabled(false);
        if (best?.id) this.setSelectedBuildingId(best.id);
    }

    handleRoadTileClick(tileId) {
        if (!this._roadModeEnabled) return;
        if (!this.map) return;
        const meta = this._tileById.get(tileId);
        if (!meta) return;

        if (!this._roadStartTileId) {
            this._roadStartTileId = tileId;
            this._roadEndTileId = null;
            this._syncTileVisuals();
            return;
        }

        if (!this._roadEndTileId) {
            this._roadEndTileId = tileId;
            const start = this._roadStartTileId;
            const end = this._roadEndTileId;
            this._roadStartTileId = null;
            this._roadEndTileId = null;
            this._addRoadBetween(start, end);
            this._syncTileVisuals();
        }
    }

    cancelRoadSelection() {
        if (!this._roadModeEnabled) return;
        if (!this._roadStartTileId && !this._roadEndTileId) return;
        this._roadStartTileId = null;
        this._roadEndTileId = null;
        this._syncTileVisuals();
    }

    resetScene({ gridSize = null } = {}) {
        if (gridSize !== null && gridSize !== undefined) {
            this.gridSize = clampInt(gridSize, 3, 25);
        }
        this._selectedTiles.clear();
        this._roadStartTileId = null;
        this._roadEndTileId = null;
        this._roadIdCounter = 0;
        this._selectedBuildingId = null;
        this._clearBuildings();
        this._rebuildScene({ keepCamera: true, keepMode: true });
    }

    _buildLights() {
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, 0.85);
        this.hemi.position.set(0, 100, 0);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sun.position.set(80, 140, 60);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 600;
        this.sun.shadow.camera.left = -220;
        this.sun.shadow.camera.right = 220;
        this.sun.shadow.camera.top = 220;
        this.sun.shadow.camera.bottom = -220;
        this.sun.shadow.bias = -0.00008;
        this.root.add(this.sun);
    }

    _buildSky() {
        if (!this.sun) return;
        this.sky = createGradientSkyDome({
            top: '#2f7fe8',
            horizon: '#eaf7ff',
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.root.add(this.sky);
    }

    _buildMap() {
        const origin = {
            x: -((this.gridSize - 1) * 0.5) * this.tileSize,
            z: -((this.gridSize - 1) * 0.5) * this.tileSize
        };
        this.map = new CityMap({
            width: this.gridSize,
            height: this.gridSize,
            tileSize: this.tileSize,
            origin
        });
        this.map.finalize();

        const roadSurfaceY = this.generatorConfig?.road?.surfaceY ?? 0;
        this._overlayY = roadSurfaceY + 0.06;
    }

    _buildWorld() {
        if (!this.map) return;
        const size = this.tileSize * this.gridSize;
        this.world = createCityWorld({
            size,
            tileMeters: this.tileMeters,
            map: this.map,
            config: this.generatorConfig,
            rng: null
        });
        if (this.world?.group) this.root.add(this.world.group);
    }

    _buildRoads() {
        if (!this.map) return;
        const base = getCityMaterials();
        const materials = {
            road: base.road.clone(),
            sidewalk: base.sidewalk.clone(),
            curb: base.curb.clone(),
            laneWhite: base.laneWhite.clone(),
            laneYellow: base.laneYellow.clone()
        };

        this.roads = generateRoads({
            map: this.map,
            config: this.generatorConfig,
            materials
        });
        if (this.roads?.group) this.root.add(this.roads.group);
    }

    _buildTileOverlays() {
        this._tileMeshes.length = 0;
        this._tiles.length = 0;
        this._tileById.clear();

        if (!this.map) return;
        if (this._overlayGeo) {
            this._overlayGeo.dispose?.();
            this._overlayGeo = null;
        }

        this._overlayGeo = new THREE.PlaneGeometry(this.tileSize, this.tileSize, 1, 1);
        this._overlayGeo.rotateX(-Math.PI / 2);

        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const idx = this.map.index(x, y);
                const tileId = tileIdFromXY(x, y);
                const p = this.map.tileToWorldCenter(x, y);

                const mat = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.0,
                    depthWrite: false
                });

                const mesh = new THREE.Mesh(this._overlayGeo, mat);
                mesh.position.set(p.x, this._overlayY, p.z);
                mesh.name = `tile_overlay_${tileId}`;
                mesh.renderOrder = 100;
                mesh.userData.tileId = tileId;
                mesh.userData.tileX = x;
                mesh.userData.tileY = y;
                this.root.add(mesh);

                const meta = {
                    id: tileId,
                    idx,
                    x,
                    y,
                    seed: idx + 1,
                    center: new THREE.Vector3(p.x, 0, p.z)
                };
                this._tiles.push(meta);
                this._tileMeshes.push(mesh);
                this._tileById.set(tileId, meta);
            }
        }

        this._syncTileVisuals();
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
        this.controls.minDistance = Math.max(16, dist * 0.35);
        this.controls.maxDistance = dist * 2.2;

        this.resetCamera();
    }

    _rebuildScene({ keepCamera = false, keepMode = false } = {}) {
        if (!this.root) return;
        const cameraPos = keepCamera && this.camera ? this.camera.position.clone() : null;
        const cameraTarget = keepCamera && this.controls ? this.controls.target.clone() : null;
        const roadMode = keepMode ? this._roadModeEnabled : false;
        const buildingMode = keepMode ? this._buildingModeEnabled : false;
        const showWireframe = this._showWireframe;
        const showFloors = this._showFloorDivisions;

        this._selectedTiles.clear();
        this._roadStartTileId = null;
        this._roadEndTileId = null;
        this._roadModeEnabled = false;
        this._buildingModeEnabled = false;
        this._selectedBuildingId = null;
        this._syncSelectionPreview();
        this._syncModeVisibility();

        if (this.world?.group) {
            this.world.group.removeFromParent();
            disposeObject3D(this.world.group);
        }
        this.world = null;

        if (this.roads?.group) {
            this.roads.group.removeFromParent();
            disposeObject3D(this.roads.group);
        }
        this.roads = null;

        this._clearRoadHighlight();
        this._hoveredRoadId = null;

        for (const mesh of this._tileMeshes) {
            mesh.removeFromParent();
        }
        this._tileMeshes.length = 0;
        this._tiles.length = 0;
        this._tileById.clear();

        this.map = null;
        this._buildMap();
        this._buildWorld();
        this._buildRoads();
        this._buildTileOverlays();
        this._buildSelectionPreview();
        this._setupRoadHighlight();

        if (this.controls && this.camera) {
            if (cameraPos && cameraTarget) {
                this.camera.position.copy(cameraPos);
                this.controls.target.copy(cameraTarget);
                this.controls.update();
            } else {
                this.resetCamera();
            }
        }

        this.setShowWireframe(showWireframe);
        this.setShowFloorDivisions(showFloors);
        this.setBuildingModeEnabled(buildingMode);
        this.setRoadModeEnabled(roadMode);
    }

    _clusterTiles(tileIds) {
        const remaining = new Set(tileIds);
        const clusters = [];

        while (remaining.size) {
            const startId = remaining.values().next().value;
            remaining.delete(startId);

            const cluster = new Set([startId]);
            const stack = [startId];

            while (stack.length) {
                const currentId = stack.pop();
                const meta = this._tileById.get(currentId);
                if (!meta) continue;

                const neighbors = [
                    tileIdFromXY(meta.x - 1, meta.y),
                    tileIdFromXY(meta.x + 1, meta.y),
                    tileIdFromXY(meta.x, meta.y - 1),
                    tileIdFromXY(meta.x, meta.y + 1)
                ];

                for (const neighborId of neighbors) {
                    if (!remaining.has(neighborId)) continue;
                    remaining.delete(neighborId);
                    cluster.add(neighborId);
                    stack.push(neighborId);
                }
            }

            clusters.push(cluster);
        }

        return clusters;
    }

    _clearBuildings() {
        for (const building of this._buildings) {
            building.group.removeFromParent();
            disposeObject3D(building.group);
        }
        this._buildings.length = 0;
        this._buildingsByTile.clear();
    }

    _removeBuilding(building) {
        if (!building) return;
        if (building.id && building.id === this._selectedBuildingId) this._selectedBuildingId = null;
        for (const tileId of building.tiles) {
            this._buildingsByTile.delete(tileId);
        }
        building.group.removeFromParent();
        disposeObject3D(building.group);
        const idx = this._buildings.indexOf(building);
        if (idx >= 0) this._buildings.splice(idx, 1);
    }

    _setBuildingsVisible(visible) {
        for (const building of this._buildings) {
            building.group.visible = !!visible;
        }
    }

    _syncModeVisibility() {
        const showBuildings = !this._roadModeEnabled;
        this._setBuildingsVisible(showBuildings);
    }

    _buildSelectionPreview() {
        if (!this.root) return;
        if (this._selectionPlanGroup) return;
        this._selectionPlanGroup = new THREE.Group();
        this._selectionPlanGroup.name = 'selection_floorplan';
        this.root.add(this._selectionPlanGroup);
        this._syncSelectionPreview();
    }

    _syncSelectionPreview() {
        const group = this._selectionPlanGroup;
        if (!group) return;

        for (const child of [...group.children]) {
            child.removeFromParent();
            disposeObject3D(child);
        }

        if (!this._buildingModeEnabled || !this._selectedTiles.size) {
            group.visible = false;
            return;
        }

        const rects = this._rectsForBuildingTiles(this._selectedTiles);
        const loops = this._loopsFromRects(rects);
        if (!loops.length) {
            group.visible = false;
            return;
        }

        const groundY = this.generatorConfig?.ground?.surfaceY ?? this.generatorConfig?.road?.surfaceY ?? 0;
        const planY = (this.generatorConfig?.road?.surfaceY ?? groundY) + 0.07;
        const planPositions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                planPositions.push(a.x, planY, a.z, b.x, planY, b.z);
            }
        }

        if (!planPositions.length) {
            group.visible = false;
            return;
        }

        const planGeo = new LineSegmentsGeometry();
        planGeo.setPositions(planPositions);

        const planMat = new LineMaterial({
            color: BUILDING_LINE_COLOR,
            linewidth: 5,
            worldUnits: false,
            transparent: true,
            opacity: 1.0,
            depthTest: false,
            depthWrite: false
        });
        if (this.engine?.renderer) {
            const size = this.engine.renderer.getSize(this._lineResolution);
            planMat.resolution.set(size.x, size.y);
        }

        const line = new LineSegments2(planGeo, planMat);
        line.renderOrder = 145;
        line.frustumCulled = false;
        group.add(line);

        group.visible = true;
    }

    _rebuildBuildings() {
        for (const building of this._buildings) {
            this._rebuildBuildingMesh(building);
        }
        this._syncTileVisuals();
    }

    _createBuilding(tileIds, floors, floorHeight, { type = 'business', wallTextureUrl = null } = {}) {
        const group = new THREE.Group();
        group.name = `building_${this._buildings.length + 1}`;
        this.root.add(group);

        const solidGroup = new THREE.Group();
        solidGroup.name = 'solid';
        const wireGroup = new THREE.Group();
        wireGroup.name = 'wire';
        const floorsGroup = new THREE.Group();
        floorsGroup.name = 'floors';
        const planGroup = new THREE.Group();
        planGroup.name = 'floorplan';
        const borderGroup = new THREE.Group();
        borderGroup.name = 'selection_border';

        group.add(solidGroup);
        group.add(wireGroup);
        group.add(floorsGroup);
        group.add(planGroup);
        group.add(borderGroup);

        const building = {
            id: group.name,
            type,
            wallTextureUrl: typeof wallTextureUrl === 'string' && wallTextureUrl ? wallTextureUrl : null,
            baseColorHex: null,
            tiles: new Set(tileIds),
            floors,
            floorHeight: clamp(Number.isFinite(floorHeight) ? floorHeight : this.floorHeight, 1.0, 12.0),
            group,
            solidGroup,
            wireGroup,
            floorsGroup,
            planGroup,
            borderGroup
        };

        this._buildings.push(building);
        for (const tileId of building.tiles) this._buildingsByTile.set(tileId, building);
        this._rebuildBuildingMesh(building);

        this._syncBuildingRenderMode(building);
        this._syncBuildingBorder(building);
        building.group.visible = !this._roadModeEnabled;
        return building;
    }

    _addRoadBetween(startTileId, endTileId) {
        if (!this.map) return;
        const a = this._tileById.get(startTileId);
        const b = this._tileById.get(endTileId);
        if (!a || !b) return;

        const id = this._roadIdCounter;
        this._roadIdCounter += 1;

        this.map.addRoadSegment({
            a: [a.x, a.y],
            b: [b.x, b.y],
            lanesF: ROAD_LANES_F,
            lanesB: ROAD_LANES_B,
            id
        });
        this.map.finalize();

        const segment = this.map.roadSegments[id];
        const tiles = Array.isArray(segment?.tiles) ? segment.tiles : [];

        const roadTileIds = new Set();
        const intersects = new Set();
        for (const tile of tiles) {
            const tileId = tileIdFromXY(tile.x, tile.y);
            roadTileIds.add(tileId);
            const existing = this._buildingsByTile.get(tileId);
            if (existing) intersects.add(existing);
            this._selectedTiles.delete(tileId);
        }
        for (const building of intersects) {
            this._trimBuildingTilesForRoad(building, roadTileIds);
        }

        this._rebuildRoads();
        this._refreshGroundTiles();
        this._rebuildBuildings();
    }

    _trimBuildingTilesForRoad(building, roadTileIds) {
        if (!building || !roadTileIds || !roadTileIds.size) return;

        let changed = false;
        const remaining = new Set();
        for (const tileId of building.tiles) {
            if (roadTileIds.has(tileId)) {
                changed = true;
                continue;
            }
            remaining.add(tileId);
        }
        if (!changed) return;

        for (const tileId of building.tiles) {
            this._buildingsByTile.delete(tileId);
        }

        if (!remaining.size) {
            this._removeBuilding(building);
            return;
        }

        const clusters = this._clusterTiles(remaining);
        if (!clusters.length) {
            this._removeBuilding(building);
            return;
        }

        clusters.sort((a, b) => b.size - a.size);
        const main = clusters[0];

        building.tiles = main;
        for (const tileId of building.tiles) {
            this._buildingsByTile.set(tileId, building);
        }

        for (let i = 1; i < clusters.length; i++) {
            this._createBuilding(clusters[i], building.floors, building.floorHeight, {
                type: building.type,
                wallTextureUrl: building.wallTextureUrl
            });
        }
    }

    _rebuildRoads() {
        if (this.roads?.group) {
            this.roads.group.removeFromParent();
            disposeObject3D(this.roads.group);
        }
        this.roads = null;
        this._buildRoads();
    }

    _refreshGroundTiles() {
        if (!this.map || !this.world?.groundTiles) return;
        const groundTiles = this.world.groundTiles;
        const y = this.generatorConfig?.ground?.surfaceY ?? this.generatorConfig?.road?.surfaceY ?? 0;
        const dummy = new THREE.Object3D();

        let k = 0;
        for (let ty = 0; ty < this.map.height; ty++) {
            for (let tx = 0; tx < this.map.width; tx++) {
                const idx = this.map.index(tx, ty);
                if (this.map.kind[idx] === TILE.ROAD) continue;
                const p = this.map.tileToWorldCenter(tx, ty);
                dummy.position.set(p.x, y, p.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                groundTiles.setMatrixAt(k++, dummy.matrix);
            }
        }

        groundTiles.count = k;
        groundTiles.instanceMatrix.needsUpdate = true;
    }

    _buildingFootprintMargins() {
        const baseMargin = this.tileSize * (1 - this.occupyRatio) * 0.5;

        const roadCfg = this.generatorConfig?.road ?? {};
        const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
        const curbT = Number.isFinite(roadCfg?.curb?.thickness) ? roadCfg.curb.thickness : 0;
        const roadMargin = baseMargin + Math.max(0, sidewalkWidth + curbT * 0.5);
        return { baseMargin, roadMargin };
    }

    _setupRoadHighlight() {
        this._clearRoadHighlight();
        if (!this.root || !this.map) return;

        const highlight = createRoadHighlightMesh({
            color: ROAD_HIGHLIGHT_COLOR,
            opacity: ROAD_HIGHLIGHT_OPACITY,
            renderOrder: 200,
            depthTest: false,
            depthWrite: false
        });
        this._roadHighlightGeo = highlight.geo;
        this._roadHighlightPos = highlight.positions;
        this._roadHighlightMat = highlight.mat;
        this._roadHighlightMesh = highlight.mesh;

        const roadY = this.generatorConfig?.road?.surfaceY ?? 0.02;
        this._roadHighlightY = roadY + ROAD_HIGHLIGHT_LIFT;
        this.root.add(this._roadHighlightMesh);
    }

    _clearRoadHighlight() {
        if (this._roadHighlightMesh) this._roadHighlightMesh.removeFromParent();
        if (this._roadHighlightGeo) this._roadHighlightGeo.dispose?.();
        if (this._roadHighlightMat) this._roadHighlightMat.dispose?.();
        this._roadHighlightMesh = null;
        this._roadHighlightGeo = null;
        this._roadHighlightMat = null;
        this._roadHighlightPos = null;
        this._roadHighlightY = 0;
    }

    _updateRoadHighlight() {
        const map = this.map;
        const mesh = this._roadHighlightMesh;
        const geo = this._roadHighlightGeo;
        const pos = this._roadHighlightPos;

        if (!map || !mesh || !geo || !pos) return;

        const id = this._hoveredRoadId;
        if (id === null || id === undefined) {
            mesh.visible = false;
            return;
        }

        const road = Array.isArray(map.roadSegments) ? map.roadSegments[id] : null;
        if (!road) {
            mesh.visible = false;
            return;
        }

        const x0 = road?.a?.x ?? 0;
        const y0 = road?.a?.y ?? 0;
        const x1 = road?.b?.x ?? 0;
        const y1 = road?.b?.y ?? 0;
        const dir = normalizeDir(x1 - x0, y1 - y0);
        if (!dir) {
            mesh.visible = false;
            return;
        }

        const normal = { x: -dir.y, y: dir.x };

        const startCenter = map.tileToWorldCenter(x0, y0);
        const endCenter = map.tileToWorldCenter(x1, y1);
        const halfTile = map.tileSize * HALF;
        const centerlineStart = {
            x: startCenter.x - dir.x * halfTile,
            y: startCenter.z - dir.y * halfTile
        };
        const centerlineEnd = {
            x: endCenter.x + dir.x * halfTile,
            y: endCenter.z + dir.y * halfTile
        };

        const roadCfg = this.generatorConfig?.road ?? {};
        const laneWidth = roadCfg.laneWidth ?? 4.8;
        const shoulder = roadCfg.shoulder ?? 0.525;
        const curbT = roadCfg.curb?.thickness ?? 0.48;
        const width = roadWidth(road.lanesF, road.lanesB, laneWidth, shoulder, map.tileSize);
        const halfWidth = width * HALF;
        const pad = Math.max(
            map.tileSize * ROAD_HIGHLIGHT_PAD_TILE_FRACTION,
            curbT * ROAD_HIGHLIGHT_PAD_CURB_FACTOR,
            laneWidth * ROAD_HIGHLIGHT_PAD_LANE_FACTOR,
            ROAD_HIGHLIGHT_PAD_MIN
        );
        const expandedStart = {
            x: centerlineStart.x - dir.x * pad,
            y: centerlineStart.y - dir.y * pad
        };
        const expandedEnd = {
            x: centerlineEnd.x + dir.x * pad,
            y: centerlineEnd.y + dir.y * pad
        };

        const leftEdge = offsetEndpoints(expandedStart, expandedEnd, normal, halfWidth + pad);
        const rightEdge = offsetEndpoints(expandedStart, expandedEnd, normal, -(halfWidth + pad));
        const y = this._roadHighlightY;

        pos[0] = leftEdge.start.x;
        pos[1] = y;
        pos[2] = leftEdge.start.y;
        pos[3] = leftEdge.end.x;
        pos[4] = y;
        pos[5] = leftEdge.end.y;
        pos[6] = rightEdge.end.x;
        pos[7] = y;
        pos[8] = rightEdge.end.y;
        pos[9] = leftEdge.start.x;
        pos[10] = y;
        pos[11] = leftEdge.start.y;
        pos[12] = rightEdge.end.x;
        pos[13] = y;
        pos[14] = rightEdge.end.y;
        pos[15] = rightEdge.start.x;
        pos[16] = y;
        pos[17] = rightEdge.start.y;

        geo.attributes.position.needsUpdate = true;
        geo.computeBoundingSphere?.();
        mesh.visible = true;
    }

    _rectsForBuildingTiles(tileSet) {
        const rects = [];
        const { baseMargin, roadMargin } = this._buildingFootprintMargins();
        const halfTile = this.tileSize * 0.5;
        const maxMargin = halfTile * 0.85;

        const getMargin = (internal, neighborRoad) => {
            if (internal) return 0;
            if (neighborRoad) return roadMargin;
            return baseMargin;
        };

        const isRoad = (x, y) => {
            if (!this.map?.inBounds(x, y)) return false;
            const idx = this.map.index(x, y);
            return this.map.kind[idx] === TILE.ROAD;
        };

        for (const tileId of tileSet) {
            const meta = this._tileById.get(tileId);
            if (!meta) continue;
            if (this.map?.kind?.[meta.idx] === TILE.ROAD) continue;

            const westId = tileIdFromXY(meta.x - 1, meta.y);
            const eastId = tileIdFromXY(meta.x + 1, meta.y);
            const southId = tileIdFromXY(meta.x, meta.y - 1);
            const northId = tileIdFromXY(meta.x, meta.y + 1);

            const wMargin = clamp(getMargin(tileSet.has(westId), isRoad(meta.x - 1, meta.y)), 0, maxMargin);
            const eMargin = clamp(getMargin(tileSet.has(eastId), isRoad(meta.x + 1, meta.y)), 0, maxMargin);
            const sMargin = clamp(getMargin(tileSet.has(southId), isRoad(meta.x, meta.y - 1)), 0, maxMargin);
            const nMargin = clamp(getMargin(tileSet.has(northId), isRoad(meta.x, meta.y + 1)), 0, maxMargin);

            const cx = meta.center.x;
            const cz = meta.center.z;
            const x0 = cx - halfTile + wMargin;
            const x1 = cx + halfTile - eMargin;
            const z0 = cz - halfTile + sMargin;
            const z1 = cz + halfTile - nMargin;

            if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) continue;
            rects.push({
                x0: q(x0),
                x1: q(x1),
                z0: q(z0),
                z1: q(z1)
            });
        }

        return rects;
    }

    _loopsFromRects(rects) {
        if (!rects.length) return [];

        const xs = [];
        const zs = [];
        for (const r of rects) {
            xs.push(r.x0, r.x1);
            zs.push(r.z0, r.z1);
        }

        xs.sort((a, b) => a - b);
        zs.sort((a, b) => a - b);

        const uniq = (arr) => {
            const out = [];
            let last = null;
            for (const v of arr) {
                if (last === null || v !== last) out.push(v);
                last = v;
            }
            return out;
        };

        const ux = uniq(xs);
        const uz = uniq(zs);
        if (ux.length < 2 || uz.length < 2) return [];

        const nx = ux.length - 1;
        const nz = uz.length - 1;
        const filled = new Uint8Array(nx * nz);

        const cellIndex = (ix, iz) => ix + iz * nx;

        for (let iz = 0; iz < nz; iz++) {
            const zc = (uz[iz] + uz[iz + 1]) * 0.5;
            for (let ix = 0; ix < nx; ix++) {
                const xc = (ux[ix] + ux[ix + 1]) * 0.5;
                let inside = false;
                for (const r of rects) {
                    if (xc > r.x0 && xc < r.x1 && zc > r.z0 && zc < r.z1) {
                        inside = true;
                        break;
                    }
                }
                if (inside) filled[cellIndex(ix, iz)] = 1;
            }
        }

        const segments = [];
        const addSegment = (ax, az, bx, bz) => {
            segments.push({ ax, az, bx, bz });
        };

        for (let iz = 0; iz < nz; iz++) {
            for (let ix = 0; ix < nx; ix++) {
                if (!filled[cellIndex(ix, iz)]) continue;

                const x0 = ux[ix];
                const x1 = ux[ix + 1];
                const z0 = uz[iz];
                const z1 = uz[iz + 1];

                const westEmpty = ix === 0 || !filled[cellIndex(ix - 1, iz)];
                const eastEmpty = ix === nx - 1 || !filled[cellIndex(ix + 1, iz)];
                const southEmpty = iz === 0 || !filled[cellIndex(ix, iz - 1)];
                const northEmpty = iz === nz - 1 || !filled[cellIndex(ix, iz + 1)];

                if (westEmpty) addSegment(x0, z1, x0, z0);
                if (eastEmpty) addSegment(x1, z0, x1, z1);
                if (southEmpty) addSegment(x0, z0, x1, z0);
                if (northEmpty) addSegment(x1, z1, x0, z1);
            }
        }

        const nextByKey = new Map();
        const pointByKey = new Map();
        const keyFor = (x, z) => `${x},${z}`;

        for (const s of segments) {
            const aKey = keyFor(s.ax, s.az);
            const bKey = keyFor(s.bx, s.bz);
            nextByKey.set(aKey, bKey);
            pointByKey.set(aKey, { x: uq(s.ax), z: uq(s.az) });
            pointByKey.set(bKey, { x: uq(s.bx), z: uq(s.bz) });
        }

        const visited = new Set();
        const loops = [];

        for (const [startKey] of nextByKey) {
            if (visited.has(startKey)) continue;
            const loop = [];
            let cur = startKey;
            let guard = 0;
            while (cur && !visited.has(cur) && guard++ < 100000) {
                visited.add(cur);
                const p = pointByKey.get(cur);
                if (p) loop.push(p);
                const next = nextByKey.get(cur);
                if (!next) break;
                cur = next;
                if (cur === startKey) break;
            }
            if (loop.length >= 3) loops.push(loop);
        }

        return loops;
    }

    _disposeWallTextureCache() {
        for (const entry of this._wallTextureCache.values()) {
            entry?.texture?.dispose?.();
        }
        this._wallTextureCache.clear();
    }

    _getOrRequestWallTexture(url) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        if (!safeUrl) return null;

        const cached = this._wallTextureCache.get(safeUrl);
        if (cached?.texture) return cached.texture;
        if (cached?.promise) return null;

        const promise = new Promise((resolve, reject) => {
            this._wallTextureLoader.load(
                safeUrl,
                (tex) => resolve(tex),
                undefined,
                (err) => reject(err)
            );
        });

        this._wallTextureCache.set(safeUrl, { promise });

        promise.then((tex) => {
            const entry = this._wallTextureCache.get(safeUrl);
            if (!entry || entry.promise !== promise) {
                tex.dispose?.();
                return;
            }

            tex.userData = tex.userData ?? {};
            tex.userData.buildingFabShared = true;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            if (this.engine?.renderer?.capabilities?.getMaxAnisotropy) {
                tex.anisotropy = Math.min(16, this.engine.renderer.capabilities.getMaxAnisotropy());
            } else {
                tex.anisotropy = 16;
            }
            applyTextureColorSpace(tex, { srgb: true });
            tex.needsUpdate = true;

            this._wallTextureCache.set(safeUrl, { texture: tex });
            for (const building of this._buildings) {
                if (building.wallTextureUrl === safeUrl) {
                    this._applyWallTextureToBuilding(building, tex);
                }
            }
        }).catch(() => {
            const entry = this._wallTextureCache.get(safeUrl);
            if (entry?.promise === promise) this._wallTextureCache.delete(safeUrl);
        });

        return null;
    }

    _applyWallTextureToBuilding(building, tex) {
        if (!building?.solidGroup) return;
        const baseColor = Number.isFinite(building.baseColorHex) ? building.baseColorHex : 0xffffff;
        const useTexture = !!tex;

        building.solidGroup.traverse((obj) => {
            if (!obj?.isMesh) return;
            const mats = obj.material;
            if (!Array.isArray(mats) || mats.length < 2) return;
            const wallMat = mats[1];
            if (!wallMat) return;

            wallMat.map = useTexture ? tex : null;
            wallMat.color.setHex(useTexture ? 0xffffff : baseColor);
            wallMat.needsUpdate = true;
        });
    }

    _rebuildBuildingMesh(building) {
        if (!this.root || !building?.group) return;

        for (const child of [...building.solidGroup.children, ...building.wireGroup.children, ...building.floorsGroup.children, ...building.planGroup.children, ...building.borderGroup.children]) {
            child.removeFromParent();
            disposeObject3D(child);
        }

        const rects = this._rectsForBuildingTiles(building.tiles);
        const loops = this._loopsFromRects(rects);
        if (!loops.length) return;

        const groundY = this.generatorConfig?.ground?.surfaceY ?? this.generatorConfig?.road?.surfaceY ?? 0;
        const baseY = groundY + 0.01;
        const floorHeight = Number.isFinite(building.floorHeight) ? building.floorHeight : this.floorHeight;
        const height = building.floors * floorHeight;

        const outerLoops = [];
        const holeLoops = [];
        for (const loop of loops) {
            if (signedArea(loop) >= 0) outerLoops.push(loop);
            else holeLoops.push(loop);
        }

        const color = makeDeterministicColor(building.tiles.size * 97 + building.floors * 31).getHex();
        building.baseColorHex = color;

        const roofMat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0.05
        });

        const wallMat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0.05
        });

        const wallTextureUrl = typeof building.wallTextureUrl === 'string' ? building.wallTextureUrl : null;
        if (wallTextureUrl) {
            wallMat.color.setHex(0xffffff);
            const tex = this._getOrRequestWallTexture(wallTextureUrl);
            if (tex) wallMat.map = tex;
        }

        const appendPositions = (dst, src) => {
            for (let i = 0; i < src.length; i++) dst.push(src[i]);
        };

        const wirePositions = [];

        for (const outer of outerLoops) {
            const shapePts = outer.map((p) => new THREE.Vector2(p.x, -p.z));
            shapePts.reverse();
            const shape = new THREE.Shape(shapePts);

            for (const hole of holeLoops) {
                const holePts = hole.map((p) => new THREE.Vector2(p.x, -p.z));
                holePts.reverse();
                shape.holes.push(new THREE.Path(holePts));
            }

            const geo = new THREE.ExtrudeGeometry(shape, {
                depth: height,
                bevelEnabled: false,
                steps: 1
            });
            geo.rotateX(-Math.PI / 2);
            geo.computeVertexNormals();

            const mesh = new THREE.Mesh(geo, [roofMat.clone(), wallMat.clone()]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.position.y = baseY;
            building.solidGroup.add(mesh);

            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
            appendPositions(wirePositions, edgeGeo.attributes.position.array);
            edgeGeo.dispose();
        }

        if (wirePositions.length) {
            const wireGeo = new LineSegmentsGeometry();
            wireGeo.setPositions(wirePositions);

            const wireMat = new LineMaterial({
                color: BUILDING_LINE_COLOR,
                linewidth: 4,
                worldUnits: false,
                transparent: true,
                opacity: 0.98,
                depthTest: false,
                depthWrite: false
            });
            if (this.engine?.renderer) {
                const size = this.engine.renderer.getSize(this._lineResolution);
                wireMat.resolution.set(size.x, size.y);
            }

            const edges = new LineSegments2(wireGeo, wireMat);
            edges.position.y = baseY;
            edges.renderOrder = 120;
            edges.frustumCulled = false;
            building.wireGroup.add(edges);
        }

        const planY = (this.generatorConfig?.road?.surfaceY ?? groundY) + 0.07;
        const planPositions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                planPositions.push(a.x, planY, a.z, b.x, planY, b.z);
            }
        }
        if (planPositions.length) {
            const planGeo = new LineSegmentsGeometry();
            planGeo.setPositions(planPositions);

            const planMat = new LineMaterial({
                color: BUILDING_LINE_COLOR,
                linewidth: 4,
                worldUnits: false,
                transparent: true,
                opacity: 1.0,
                depthTest: false,
                depthWrite: false
            });
            if (this.engine?.renderer) {
                const size = this.engine.renderer.getSize(this._lineResolution);
                planMat.resolution.set(size.x, size.y);
            }

            const line = new LineSegments2(planGeo, planMat);
            line.renderOrder = 140;
            line.frustumCulled = false;
            building.planGroup.add(line);
        }

        const borderY = planY + 0.02;
        const borderPositions = [];
        for (const loop of loops) {
            if (!loop || loop.length < 2) continue;
            for (let i = 0; i < loop.length; i++) {
                const a = loop[i];
                const b = loop[(i + 1) % loop.length];
                borderPositions.push(a.x, borderY, a.z, b.x, borderY, b.z);
            }
        }
        if (borderPositions.length) {
            const borderGeo = new LineSegmentsGeometry();
            borderGeo.setPositions(borderPositions);

            const borderMat = new LineMaterial({
                color: BUILDING_BORDER_COLOR,
                linewidth: 6,
                worldUnits: false,
                transparent: true,
                opacity: 0.98,
                depthTest: false,
                depthWrite: false
            });
            if (this.engine?.renderer) {
                const size = this.engine.renderer.getSize(this._lineResolution);
                borderMat.resolution.set(size.x, size.y);
            }

            const outline = new LineSegments2(borderGeo, borderMat);
            outline.renderOrder = 160;
            outline.frustumCulled = false;
            building.borderGroup.add(outline);
        }

        const floorCount = Math.max(0, clampInt(building.floors, 0, 30) - 1);
        if (floorCount) {
            const floorPositions = [];
            for (let i = 1; i <= floorCount; i++) {
                const y = baseY + i * floorHeight;
                for (const loop of loops) {
                    if (!loop || loop.length < 2) continue;
                    for (let k = 0; k < loop.length; k++) {
                        const a = loop[k];
                        const b = loop[(k + 1) % loop.length];
                        floorPositions.push(a.x, y, a.z, b.x, y, b.z);
                    }
                }
            }

            if (floorPositions.length) {
                const floorsGeo = new LineSegmentsGeometry();
                floorsGeo.setPositions(floorPositions);

                const floorsMat = new LineMaterial({
                    color: BUILDING_LINE_COLOR,
                    linewidth: 3,
                    worldUnits: false,
                    transparent: true,
                    opacity: 0.72,
                    depthTest: false,
                    depthWrite: false
                });
                if (this.engine?.renderer) {
                    const size = this.engine.renderer.getSize(this._lineResolution);
                    floorsMat.resolution.set(size.x, size.y);
                }

                const line = new LineSegments2(floorsGeo, floorsMat);
                line.renderOrder = 130;
                line.frustumCulled = false;
                building.floorsGroup.add(line);
            }
        }

        this._syncBuildingRenderMode(building);
        this._syncBuildingBorder(building);
    }

    _syncTileVisuals() {
        const roadColor = new THREE.Color(0x0a84ff);
        const occupiedColor = new THREE.Color(0x2ec27e);
        const selectedColor = new THREE.Color(0xffd60a);
        const hoveredColor = new THREE.Color(0xffffff);
        const selectedBuildingColor = new THREE.Color(0x64d2ff);
        const startColor = new THREE.Color(0xbf5af2);
        const endColor = new THREE.Color(0xff3b30);

        for (const mesh of this._tileMeshes) {
            const tileId = mesh.userData.tileId;
            const meta = this._tileById.get(tileId);
            const isRoad = !!meta && !!this.map && this.map.kind[meta.idx] === TILE.ROAD;
            const occupied = this._buildingsByTile.has(tileId);
            const selectedBuilding = this._selectedBuildingId
                ? this._buildingsByTile.get(tileId)?.id === this._selectedBuildingId
                : false;
            const selected = this._selectedTiles.has(tileId);
            const hovered = this._hoveredTile === tileId;
            const isStart = this._roadStartTileId === tileId;
            const isEnd = this._roadEndTileId === tileId;

            let color = hoveredColor;
            let opacity = 0.0;

            if (isRoad) {
                color = roadColor;
                opacity = 0.06;
            }

            if (occupied) {
                color = occupiedColor;
                opacity = Math.max(opacity, 0.12);
            }

            if (selectedBuilding) {
                color = selectedBuildingColor;
                opacity = Math.max(opacity, 0.26);
            }

            if (selected) {
                color = selectedColor;
                opacity = Math.max(opacity, this._buildingModeEnabled ? 0.38 : 0.20);
            }

            if (hovered) {
                color = hoveredColor;
                opacity = Math.max(opacity, 0.14);
            }

            if (this._roadModeEnabled && isStart) {
                color = startColor;
                opacity = Math.max(opacity, 0.28);
            }

            if (this._roadModeEnabled && isEnd) {
                color = endColor;
                opacity = Math.max(opacity, 0.28);
            }

            mesh.material.color.copy(color);
            mesh.material.opacity = opacity;
            mesh.material.needsUpdate = true;
        }
    }
}
