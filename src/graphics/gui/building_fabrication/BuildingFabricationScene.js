// src/graphics/gui/building_fabrication/BuildingFabricationScene.js
// Renders the building fabrication 3D grid and generated buildings/roads.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { CityMap, TILE } from '../../../app/city/CityMap.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { BUILDING_STYLE, isBuildingStyle } from '../../../app/buildings/BuildingStyle.js';
import { WINDOW_STYLE, isWindowStyle } from '../../../app/buildings/WindowStyle.js';
import { BELT_COURSE_COLOR, isBeltCourseColor } from '../../../app/buildings/BeltCourseColor.js';
import { ROOF_COLOR, isRoofColor } from '../../../app/buildings/RoofColor.js';
import { WINDOW_TYPE, isWindowTypeId } from '../../assets3d/generators/buildings/WindowTextureGenerator.js';
import {
    legacyWindowStyleFromWindowTypeId,
    normalizeWindowParams as normalizeWindowParamsCompat,
    normalizeWindowTypeIdOrLegacyStyle
} from '../../assets3d/generators/buildings/WindowTypeCompatibility.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { applyAtmosphereToSkyDome, createGradientSkyDome, shouldShowSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { createRoadEngineRoads } from '../../visuals/city/RoadEngineRoads.js';
import { BuildingWallTextureCache, buildBuildingVisualParts } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { cloneBuildingLayers, createDefaultFloorLayer, createDefaultRoofLayer, normalizeBuildingLayers } from '../../assets3d/generators/building_fabrication/BuildingFabricationTypes.js';
import {
    createLegacyWindowSpacingFacadeFillPattern,
    createLegacyWindowSpacingOnlyFacadeFillPattern,
    solveFacadeLayoutFillPattern
} from '../../assets3d/generators/building_fabrication/FacadeLayoutFillSolver.js';
import { getCityMaterials } from '../../assets3d/textures/CityMaterials.js';
import { createRoadHighlightMesh } from '../../visuals/city/RoadHighlightMesh.js';
import { ToolCameraController } from '../../engine3d/camera/ToolCameraController.js';
import { getBuildingConfigById } from '../../content3d/catalogs/BuildingConfigCatalog.js';
import { getResolvedBuildingWindowVisualsSettings } from '../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { azimuthElevationDegToDir } from '../../visuals/atmosphere/SunDirection.js';
import { updateMaterialVariationDebugOnMeshStandardMaterial } from '../../assets3d/materials/MaterialVariationSystem.js';
import { getDefaultWindowMeshSettings, sanitizeWindowMeshSettings } from '../../../app/buildings/window_mesh/index.js';

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
const BUILDING_FABRICATION_FOG_NEAR = 200;
const BUILDING_FABRICATION_FOG_FAR = 2000;

const FACE_IDS_RECT = Object.freeze(['A', 'B', 'C', 'D']);
const FACE_HIGHLIGHT_COLOR = 0x64d2ff;
const FACE_HIGHLIGHT_OPACITY = 0.85;
const FACE_HIGHLIGHT_LINEWIDTH = 6;
const FACE_HIGHLIGHT_Y_LIFT = 0.075;
const MIN_FACADE_BAY_WIDTH_M = 1.0;
const MIN_FACADE_PADDING_WIDTH_M = 0.25;
const WEDGE_ANGLE_STEP_DEG = 15;
const WEDGE_ANGLE_MAX_DEG = 75;

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

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
        return out;
    }
    return value;
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

function disposeTextureProps(mat) {
    if (!mat) return;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (v && v.isTexture && !v.userData?.buildingShared) v.dispose?.();
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

export function getCentered2x1FootprintTileIds(gridSize) {
    const size = Math.round(Number(gridSize));
    if (!Number.isFinite(size) || size < 1) return [];

    const footprintW = 2;
    const footprintH = 1;
    if (size < footprintW || size < footprintH) return [];

    const startX = Math.floor((size - footprintW) * 0.5);
    const startY = Math.floor((size - footprintH) * 0.5);
    const tiles = [];
    for (let y = startY; y < startY + footprintH; y++) {
        for (let x = startX; x < startX + footprintW; x++) {
            tiles.push(tileIdFromXY(x, y));
        }
    }
    return tiles;
}

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function getMirroredFaceId(faceId) {
    switch (faceId) {
        case 'A': return 'C';
        case 'C': return 'A';
        case 'B': return 'D';
        case 'D': return 'B';
        default: return null;
    }
}

function normalizeWedgeAngleDeg(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    const snapped = Math.round(num / WEDGE_ANGLE_STEP_DEG) * WEDGE_ANGLE_STEP_DEG;
    return clampInt(snapped, 0, WEDGE_ANGLE_MAX_DEG);
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
        this._wallTextures = new BuildingWallTextureCache({ renderer: this.engine?.renderer ?? null });
        this._buildingWindowVisuals = getResolvedBuildingWindowVisualsSettings();
        this._materialVariationDebug = null;

        this._selectedFaceId = 'A';
        this._faceMirrorLockEnabled = true;
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

        this._syncSkyVisibility();
        const bg = this.scene.background ?? null;
        const bgIsTexture = !!bg && !!bg.isTexture;
        const wantsIblBackground = !!this.engine?.lightingSettings?.ibl?.setBackground;
        if (!wantsIblBackground || !bgIsTexture) this.scene.background = null;
        const fogColor = this.engine?.atmosphereSettings?.sky?.horizonColor ?? '#EAF9FF';
        this.scene.fog = new THREE.Fog(fogColor, BUILDING_FABRICATION_FOG_NEAR, BUILDING_FABRICATION_FOG_FAR);

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
        this._applyAtmosphere();
        this._resetToSingleBuilding();
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

        this._wallTextures?.dispose?.();
        this._wallTextures = null;

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

    update(dt = 0) {
        this._applyAtmosphere();
        this._syncSkyVisibility();
        this.controls?.update?.(dt);
        if (this.sky && this.camera) {
            this.sky.position.copy(this.camera.position);
        }
        this._syncLineResolution();
    }

    panCameraOnGround(deltaX, deltaZ) {
        if (!this.camera || !this.controls) return;
        const dx = Number(deltaX) || 0;
        const dz = Number(deltaZ) || 0;
        if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
        if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
        this.controls.panWorld(dx, 0, dz);
    }

    resetCamera() {
        if (!this.controls || !this.camera) return;
        const span = this.tileSize * this.gridSize;
        this.controls.setLookAt({
            position: new THREE.Vector3(0, span * 0.95, span * 0.95),
            target: new THREE.Vector3(0, 0, 0)
        });
        this.controls.setHomeFromCurrent?.();
    }

    setUiRoot(uiRoot) {
        this.controls?.setUiRoot?.(uiRoot);
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

    getFaceIds() {
        return FACE_IDS_RECT.slice();
    }

    getSelectedFaceId() {
        return this._selectedFaceId;
    }

    setSelectedFaceId(faceId) {
        const next = isFaceId(faceId) ? faceId : 'A';
        if (next === this._selectedFaceId) return;
        this._selectedFaceId = next;
        this._syncSelectedBuildingFaceHighlight();
    }

    getFaceMirrorLockEnabled() {
        return this._faceMirrorLockEnabled;
    }

    setFaceMirrorLockEnabled(enabled) {
        const next = !!enabled;
        if (next === this._faceMirrorLockEnabled) return;
        this._faceMirrorLockEnabled = next;

        if (!next) return;
        const building = this.getSelectedBuilding();
        if (!building?.facades) return;

        const preferred = this._selectedFaceId;
        const resolvePreferred = (a, b) => (preferred === a || preferred === b) ? preferred : a;

        const syncPair = (a, b) => {
            const sourceId = resolvePreferred(a, b);
            const dstId = sourceId === a ? b : a;
            const src = building.facades[sourceId];
            if (!src) return;
            building.facades[dstId] = deepClone(src);
        };

        syncPair('A', 'C');
        syncPair('B', 'D');
    }

    getFaceEditorState() {
        const building = this.getSelectedBuilding();
        const selectedFaceId = this._selectedFaceId;
        const facade = building?.facades?.[selectedFaceId] ?? null;
        const faceLengthMeters = building ? this._getFaceLengthMeters(building, selectedFaceId) : null;
        const validation = facade && Number.isFinite(faceLengthMeters)
            ? this._validateFacadeLayout(facade, faceLengthMeters, { building })
            : null;
        return {
            faceIds: this.getFaceIds(),
            selectedFaceId,
            mirrorLockEnabled: this._faceMirrorLockEnabled,
            faceLengthMeters: Number.isFinite(faceLengthMeters) ? faceLengthMeters : null,
            validation: validation ? deepClone(validation) : null,
            generationWarnings: Array.isArray(building?.generationWarnings) ? building.generationWarnings.slice() : null,
            facadeSolverDebug: building?.generationFacadeSolverDebug?.[selectedFaceId] ?? null,
            facade: facade ? deepClone(facade) : null,
            windowDefinitions: building?.windowDefinitions ? deepClone(building.windowDefinitions) : null
        };
    }

    setSelectedFaceWallMaterial(materialSpec) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const current = building.facades[faceId] ?? null;
        if (!current) return false;
        if (!materialSpec || typeof materialSpec !== 'object') return false;
        const kind = materialSpec.kind;
        const id = materialSpec.id;
        if ((kind !== 'texture' && kind !== 'color') || typeof id !== 'string' || !id) return false;

        current.wallMaterial = deepClone({ kind, id });
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceDepthOffset(offset) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const current = building.facades[faceId] ?? null;
        if (!current) return false;
        const next = clamp(offset, -2.0, 2.0);
        if (Math.abs(next - (Number(current.depthOffset) || 0)) < 1e-6) return false;
        current.depthOffset = next;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    addSelectedFaceFacadeBay({ type = 'bay' } = {}) {
        return this._addSelectedFaceLayoutItem({ type });
    }

    addSelectedFaceFacadePadding() {
        return this._addSelectedFaceLayoutItem({ type: 'padding' });
    }

    removeSelectedFaceFacadeItem(itemId) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const layout = facade?.layout ?? null;
        const items = Array.isArray(layout?.items) ? layout.items : null;
        if (!facade || !items || !items.length) return false;

        const idx = items.findIndex((it) => it?.id === itemId);
        if (idx < 0) return false;

        if (items.length <= 1) return false;

        const removing = items[idx];
        const isBay = removing?.type === 'bay';
        if (isBay) {
            const bayCount = items.filter((it) => it?.type === 'bay').length;
            if (bayCount <= 1) return false;
        }

        const removedFrac = clamp(removing?.widthFrac, 0, 1);
        const leftIdx = idx - 1;
        const hadRight = idx + 1 < items.length;
        items.splice(idx, 1);

        if (items.length === 1) {
            items[0].widthFrac = 1.0;
            this._syncMirroredFacadeIfLocked(building, faceId);
            return true;
        }

        if (leftIdx >= 0 && hadRight) {
            const shareLeft = removedFrac * 0.5;
            const shareRight = removedFrac - shareLeft;
            items[leftIdx].widthFrac = clamp((Number(items[leftIdx].widthFrac) || 0) + shareLeft, 0, 1);
            items[idx].widthFrac = clamp((Number(items[idx].widthFrac) || 0) + shareRight, 0, 1);
        } else if (leftIdx >= 0) {
            items[leftIdx].widthFrac = clamp((Number(items[leftIdx].widthFrac) || 0) + removedFrac, 0, 1);
        } else {
            items[0].widthFrac = clamp((Number(items[0].widthFrac) || 0) + removedFrac, 0, 1);
        }

        this._normalizeLayoutWidthFractions(items);
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    moveSelectedFaceFacadeItem(itemId, direction) {
        const dir = direction === 'down' ? 'down' : 'up';
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items || items.length < 2) return false;

        const idx = items.findIndex((it) => it?.id === itemId);
        if (idx < 0) return false;
        const nextIdx = dir === 'down' ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= items.length) return false;

        const tmp = items[idx];
        items[idx] = items[nextIdx];
        items[nextIdx] = tmp;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeItemWidth(itemId, widthMeters) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items || !items.length) return false;

        const faceLength = this._getFaceLengthMeters(building, faceId);
        if (!Number.isFinite(faceLength) || faceLength <= EPS) return false;

        const idx = items.findIndex((it) => it?.id === itemId);
        if (idx < 0) return false;
        if (items.length === 1) return false;

        const minFracs = items.map((it) => this._minWidthMetersForLayoutItem(it, faceLength, { building }) / faceLength);
        const minFrac = clamp(minFracs[idx], 0, 1);
        let sumOthersMin = 0;
        for (let i = 0; i < minFracs.length; i++) {
            if (i === idx) continue;
            sumOthersMin += clamp(minFracs[i], 0, 1);
        }
        const maxFrac = clamp(1.0 - sumOthersMin, minFrac, 1.0);

        const desired = clamp(widthMeters, 0, faceLength);
        const nextFracRaw = desired / faceLength;
        const nextFrac = clamp(nextFracRaw, minFrac, maxFrac);

        const currentFrac = clamp(items[idx]?.widthFrac, 0, 1);
        if (Math.abs(nextFrac - currentFrac) < 1e-8) return false;

        const delta = nextFrac - currentFrac;
        items[idx].widthFrac = nextFrac;

        const leftIndices = [];
        const rightIndices = [];
        for (let i = idx - 1; i >= 0; i--) leftIndices.push(i);
        for (let i = idx + 1; i < items.length; i++) rightIndices.push(i);

        const shrink = (indices, amount) => {
            let remaining = amount;
            for (const j of indices) {
                if (!(remaining > 1e-10)) break;
                const cur = clamp(items[j]?.widthFrac, 0, 1);
                const min = clamp(minFracs[j], 0, 1);
                const avail = cur - min;
                if (!(avail > 1e-10)) continue;
                const take = Math.min(avail, remaining);
                items[j].widthFrac = cur - take;
                remaining -= take;
            }
            return remaining;
        };

        if (delta > 0) {
            let remaining = delta;
            if (leftIndices.length && rightIndices.length) {
                const half = remaining * 0.5;
                const remLeft = shrink(leftIndices, half);
                const remRight = shrink(rightIndices, half);
                remaining = remLeft + remRight;
            } else if (leftIndices.length) {
                remaining = shrink(leftIndices, remaining);
            } else if (rightIndices.length) {
                remaining = shrink(rightIndices, remaining);
            }

            if (remaining > 1e-8) {
                const cap = (indices) => indices.reduce((sum, j) => sum + Math.max(0, clamp(items[j]?.widthFrac, 0, 1) - clamp(minFracs[j], 0, 1)), 0);
                const capLeft = cap(leftIndices);
                const capRight = cap(rightIndices);
                if (capLeft >= capRight) {
                    remaining = shrink(leftIndices, remaining);
                    remaining = shrink(rightIndices, remaining);
                } else {
                    remaining = shrink(rightIndices, remaining);
                    remaining = shrink(leftIndices, remaining);
                }
            }

            if (remaining > 1e-6) {
                const back = delta - remaining;
                items[idx].widthFrac = currentFrac + back;
            }
        } else {
            const extra = -delta;
            const left = idx - 1;
            const right = idx + 1;
            if (left >= 0 && right < items.length) {
                const shareLeft = extra * 0.5;
                const shareRight = extra - shareLeft;
                items[left].widthFrac = clamp((Number(items[left].widthFrac) || 0) + shareLeft, 0, 1);
                items[right].widthFrac = clamp((Number(items[right].widthFrac) || 0) + shareRight, 0, 1);
            } else if (left >= 0) {
                items[left].widthFrac = clamp((Number(items[left].widthFrac) || 0) + extra, 0, 1);
            } else if (right < items.length) {
                items[right].widthFrac = clamp((Number(items[right].widthFrac) || 0) + extra, 0, 1);
            }
        }

        this._normalizeLayoutWidthFractions(items);
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWallMaterialOverride(itemId, materialSpec) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        let next = null;
        if (materialSpec !== null && materialSpec !== undefined) {
            if (!materialSpec || typeof materialSpec !== 'object') return false;
            const kind = materialSpec.kind;
            const id = materialSpec.id;
            if ((kind !== 'texture' && kind !== 'color') || typeof id !== 'string' || !id) return false;
            next = { kind, id };
        }

        const prev = bay.wallMaterialOverride ?? null;
        const changed = (prev?.kind ?? null) !== (next?.kind ?? null) || (prev?.id ?? null) !== (next?.id ?? null);
        if (!changed) return false;

        bay.wallMaterialOverride = next ? deepClone(next) : null;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayDepthOffset(itemId, offset) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const next = clamp(offset, -2.0, 2.0);
        const prev = Number(bay.depthOffset) || 0;
        if (Math.abs(next - prev) < 1e-6) return false;
        bay.depthOffset = next;

        const faceLength = this._getFaceLengthMeters(building, faceId);
        if (Number.isFinite(faceLength) && faceLength > EPS) {
            const required = this._minWidthMetersForLayoutItem(bay, faceLength, { building });
            const width = this._getLayoutItemWidthMeters(bay, faceLength);
            if (width + 1e-6 < required) {
                this.setSelectedFaceFacadeItemWidth(itemId, required);
            }
        }

        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWedgeAngleDeg(itemId, wedgeAngleDeg) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const next = normalizeWedgeAngleDeg(wedgeAngleDeg);
        const prev = normalizeWedgeAngleDeg(bay.wedgeAngleDeg);
        if (next === prev) return false;
        bay.wedgeAngleDeg = next;

        const faceLength = this._getFaceLengthMeters(building, faceId);
        if (Number.isFinite(faceLength) && faceLength > EPS) {
            const required = this._minWidthMetersForLayoutItem(bay, faceLength, { building });
            const width = this._getLayoutItemWidthMeters(bay, faceLength);
            if (width + 1e-6 < required) {
                this.setSelectedFaceFacadeItemWidth(itemId, required);
            }
        }

        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    createSelectedBuildingWindowDefinition({ cloneFromId = null } = {}) {
        const building = this.getSelectedBuilding();
        if (!building) return null;

        building.windowDefinitions ??= {};
        const lib = building.windowDefinitions;
        lib.items ??= [];
        lib.nextWindowIndex = clampInt(lib.nextWindowIndex ?? 1, 1, 9999);

        const existing = new Set();
        for (const entry of lib.items) {
            const id = typeof entry?.id === 'string' ? entry.id : '';
            if (id) existing.add(id);
        }

        let idx = lib.nextWindowIndex;
        let id = '';
        while (idx < 100000) {
            const candidate = `win_${idx}`;
            if (!existing.has(candidate)) {
                id = candidate;
                break;
            }
            idx += 1;
        }
        if (!id) return null;

        lib.nextWindowIndex = idx + 1;

        const cloneSource = typeof cloneFromId === 'string' && cloneFromId
            ? (lib.items.find((d) => d?.id === cloneFromId) ?? null)
            : null;
        const settingsSrc = cloneSource?.settings && typeof cloneSource.settings === 'object'
            ? deepClone(cloneSource.settings)
            : getDefaultWindowMeshSettings();

        lib.items.push({
            id,
            label: `Window ${idx}`,
            settings: sanitizeWindowMeshSettings(settingsSrc)
        });
        return id;
    }

    setSelectedBuildingWindowDefinitionSettings(windowDefId, settings) {
        const building = this.getSelectedBuilding();
        if (!building?.windowDefinitions?.items) return false;
        const id = typeof windowDefId === 'string' ? windowDefId : '';
        if (!id) return false;

        const entry = building.windowDefinitions.items.find((d) => d?.id === id) ?? null;
        if (!entry) return false;

        const next = sanitizeWindowMeshSettings(settings);
        entry.settings = deepClone(next);
        return true;
    }

    setSelectedFaceFacadeBayWindowEnabled(itemId, enabled) {
        const wants = !!enabled;
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;
        bay.features ??= {};

        const cur = bay.features?.window ?? null;
        const has = cur && typeof cur === 'object';
        if (!wants && !has) return false;

        if (!wants) {
            delete bay.features.window;
            this._syncMirroredFacadeIfLocked(building, faceId);
            return true;
        }

        const defs = Array.isArray(building?.windowDefinitions?.items) ? building.windowDefinitions.items : [];
        let defId = typeof cur?.defId === 'string' ? cur.defId : '';
        if (!defId || !defs.some((d) => d?.id === defId)) {
            defId = typeof defs[0]?.id === 'string' ? defs[0].id : '';
        }
        if (!defId) {
            defId = this.createSelectedBuildingWindowDefinition() ?? '';
        }
        if (!defId) return false;

        bay.features.window = {
            defId,
            widthMeters: null,
            heightMeters: null,
            floorSkip: 1
        };

        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWindowDefinition(itemId, windowDefId) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const win = bay?.features?.window ?? null;
        if (!win || typeof win !== 'object') return false;

        const nextId = typeof windowDefId === 'string' ? windowDefId : '';
        if (!nextId) return false;
        const defs = Array.isArray(building?.windowDefinitions?.items) ? building.windowDefinitions.items : [];
        if (!defs.some((d) => d?.id === nextId)) return false;

        if (win.defId === nextId) return false;
        win.defId = nextId;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWindowWidthOverride(itemId, widthMeters) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const win = bay?.features?.window ?? null;
        if (!win || typeof win !== 'object') return false;

        const raw = widthMeters === '' ? null : widthMeters;
        const num = Number(raw);
        const faceLength = this._getFaceLengthMeters(building, faceId);
        const max = Number.isFinite(faceLength) && faceLength > EPS ? faceLength : 9999;
        const next = Number.isFinite(num) ? clamp(num, 0.1, max) : null;

        const prev = Number.isFinite(win.widthMeters) ? win.widthMeters : null;
        if ((prev === null && next === null) || (prev !== null && next !== null && Math.abs(prev - next) < 1e-6)) return false;

        win.widthMeters = next;

        if (Number.isFinite(faceLength) && faceLength > EPS) {
            const required = this._minWidthMetersForLayoutItem(bay, faceLength, { building });
            const width = this._getLayoutItemWidthMeters(bay, faceLength);
            if (width + 1e-6 < required) this.setSelectedFaceFacadeItemWidth(itemId, required);
        }

        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWindowHeightOverride(itemId, heightMeters) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const win = bay?.features?.window ?? null;
        if (!win || typeof win !== 'object') return false;

        const raw = heightMeters === '' ? null : heightMeters;
        const num = Number(raw);
        const next = Number.isFinite(num) ? clamp(num, 0.1, 99) : null;

        const prev = Number.isFinite(win.heightMeters) ? win.heightMeters : null;
        if ((prev === null && next === null) || (prev !== null && next !== null && Math.abs(prev - next) < 1e-6)) return false;

        win.heightMeters = next;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    setSelectedFaceFacadeBayWindowFloorSkip(itemId, floorSkip) {
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        const items = Array.isArray(facade?.layout?.items) ? facade.layout.items : null;
        if (!items) return false;

        const bay = items.find((it) => it?.id === itemId) ?? null;
        if (!bay || bay.type !== 'bay') return false;

        const win = bay?.features?.window ?? null;
        if (!win || typeof win !== 'object') return false;

        const next = clampInt(floorSkip ?? 1, 1, 99);
        const prev = clampInt(win.floorSkip ?? 1, 1, 99);
        if (next === prev) return false;
        win.floorSkip = next;
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    getBuildings() {
        return this._buildings.map((b) => ({
            id: b.id,
            floors: b.floors,
            floorHeight: b.floorHeight,
            tileCount: b.tiles.size,
            style: b.style,
            roofColor: b.roofColor,
            wallInset: b.wallInset,
            streetEnabled: b.streetEnabled,
            streetFloors: b.streetFloors,
            streetFloorHeight: b.streetFloorHeight,
            streetStyle: b.streetStyle,
            beltCourseEnabled: b.beltCourseEnabled,
            beltCourseMargin: b.beltCourseMargin,
            beltCourseHeight: b.beltCourseHeight,
            beltCourseColor: b.beltCourseColor,
            topBeltEnabled: b.topBeltEnabled,
            topBeltWidth: b.topBeltWidth,
            topBeltInnerWidth: b.topBeltInnerWidth,
            topBeltHeight: b.topBeltHeight,
            topBeltColor: b.topBeltColor,
            windowSpacerEnabled: b.windowSpacerEnabled,
            windowSpacerEvery: b.windowSpacerEvery,
            windowSpacerWidth: b.windowSpacerWidth,
            windowSpacerExtrude: b.windowSpacerExtrude,
            windowSpacerExtrudeDistance: b.windowSpacerExtrudeDistance,
            windowStyle: b.windowStyle,
            windowTypeId: b.windowTypeId,
            windowParams: b.windowParams,
            streetWindowStyle: b.streetWindowStyle,
            streetWindowTypeId: b.streetWindowTypeId,
            streetWindowParams: b.streetWindowParams,
            streetWindowSpacerEnabled: b.streetWindowSpacerEnabled,
            streetWindowSpacerEvery: b.streetWindowSpacerEvery,
            streetWindowSpacerWidth: b.streetWindowSpacerWidth,
            streetWindowSpacerExtrude: b.streetWindowSpacerExtrude,
            streetWindowSpacerExtrudeDistance: b.streetWindowSpacerExtrudeDistance,
            streetWindowWidth: b.streetWindowWidth,
            streetWindowGap: b.streetWindowGap,
            streetWindowHeight: b.streetWindowHeight,
            streetWindowY: b.streetWindowY,
            windowWidth: b.windowWidth,
            windowGap: b.windowGap,
            windowHeight: b.windowHeight,
            windowY: b.windowY
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

    setMaterialVariationDebugConfig(debugConfig) {
        const next = debugConfig && typeof debugConfig === 'object' ? { ...debugConfig } : null;
        this._materialVariationDebug = next;
        this._applyMaterialVariationDebugToObject(this.root);
    }

    _applyMaterialVariationDebugToObject(obj) {
        const root = obj && typeof obj.traverse === 'function' ? obj : null;
        if (!root) return;
        const debug = this._materialVariationDebug;

        root.traverse((o) => {
            const mat = o?.material ?? null;
            if (!mat) return;
            if (Array.isArray(mat)) {
                for (const entry of mat) updateMaterialVariationDebugOnMeshStandardMaterial(entry, debug);
                return;
            }
            updateMaterialVariationDebugOnMeshStandardMaterial(mat, debug);
        });
    }

    setHoveredTile(tileId) {
        const next = tileId || null;
        if (next === this._hoveredTile) return;
        this._hoveredTile = next;
        this._syncTileVisuals();
    }

    setBuildingModeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._buildingModeEnabled) return;

        if (next) this.setRoadModeEnabled(false);

        this._buildingModeEnabled = next;
        this._selectedTiles.clear();
        this._selectedBuildingId = null;
        this._syncSelectionPreview();
        this._syncModeVisibility();
        this._syncTileVisuals();
    }

    setSelectedBuildingId(buildingId) {
        const next = typeof buildingId === 'string' ? buildingId : null;
        if (next === this._selectedBuildingId) return;
        this._selectedBuildingId = next;
        this._syncSelectedBuildingFaceHighlight();
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
        this._syncTileVisuals();
        return true;
    }

    setSelectedBuildingFloors(floors) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clampInt(floors, 1, 30);
        if (next === building.floors) return false;
        building.floors = next;
        building.streetFloors = clampInt(building.streetFloors, 0, next);
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingLayers(layers) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        if (!Array.isArray(layers) || !layers.length) return false;

        const nextLayers = cloneBuildingLayers(layers);
        building.layers = nextLayers;

        const totalFloors = nextLayers
            .filter((layer) => layer?.type === 'floor')
            .reduce((sum, layer) => sum + clampInt(layer.floors, 0, 99), 0);
        if (totalFloors > 0) building.floors = clampInt(totalFloors, 1, 30);

        const firstFloor = nextLayers.find((layer) => layer?.type === 'floor') ?? null;
        if (Number.isFinite(firstFloor?.floorHeight)) {
            building.floorHeight = clamp(firstFloor.floorHeight, 1.0, 12.0);
        }

        const firstRoof = nextLayers.find((layer) => layer?.type === 'roof') ?? null;
        const roofColor = typeof firstRoof?.roof?.color === 'string' ? firstRoof.roof.color : null;
        if (isRoofColor(roofColor)) building.roofColor = roofColor;

        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingMaterialVariationSeed(seed) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = Number.isFinite(seed) ? clampInt(seed, 0, 4294967295) : null;
        const cur = Number.isFinite(building.materialVariationSeed) ? building.materialVariationSeed : null;
        if (next === cur) return false;
        building.materialVariationSeed = next;
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
        if (!building.streetEnabled) building.streetFloorHeight = next;
        if (!building.streetEnabled) {
            building.streetWindowHeight = clamp(building.windowHeight, 0.3, next * 0.95);
            building.streetWindowY = clamp(building.windowY, 0.0, Math.max(0, next - building.streetWindowHeight));
        }
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWallInset(inset) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(inset, 0.0, 4.0);
        if (Math.abs(next - (Number(building.wallInset) || 0)) < 1e-6) return false;
        building.wallInset = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowVisuals(windowVisuals) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = windowVisuals && typeof windowVisuals === 'object' ? deepClone(windowVisuals) : null;
        const cur = building.windowVisuals ?? null;
        if (next === null && cur === null) return false;
        if (next !== null && cur !== null) {
            try {
                if (JSON.stringify(cur) === JSON.stringify(next)) return false;
            } catch {
                // Treat as changed.
            }
        }
        building.windowVisuals = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.3, 12.0);
        if (Math.abs(next - (Number(building.windowWidth) || 0)) < 1e-6) return false;
        building.windowWidth = next;
        if (!building.streetEnabled) building.streetWindowWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowGap(gap) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(gap, 0.0, 24.0);
        if (Math.abs(next - (Number(building.windowGap) || 0)) < 1e-6) return false;
        building.windowGap = next;
        if (!building.streetEnabled) building.streetWindowGap = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const floorH = clamp(Number.isFinite(building.floorHeight) ? building.floorHeight : this.floorHeight, 1.0, 12.0);
        const next = clamp(height, 0.3, floorH * 0.95);
        if (Math.abs(next - (Number(building.windowHeight) || 0)) < 1e-6) return false;
        building.windowHeight = next;
        if (!building.streetEnabled) building.streetWindowHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowY(offset) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const floorH = clamp(Number.isFinite(building.floorHeight) ? building.floorHeight : this.floorHeight, 1.0, 12.0);
        const winH = clamp(Number.isFinite(building.windowHeight) ? building.windowHeight : 1.4, 0.3, floorH * 0.95);
        const next = clamp(offset, 0.0, Math.max(0, floorH - winH));
        if (Math.abs(next - (Number(building.windowY) || 0)) < 1e-6) return false;
        building.windowY = next;
        if (!building.streetEnabled) building.streetWindowY = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowStyle(style) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const raw = typeof style === 'string' ? style : '';
        const nextTypeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const nextLegacy = isWindowStyle(raw) ? raw : legacyWindowStyleFromWindowTypeId(nextTypeId);

        const changed = nextTypeId !== building.windowTypeId || nextLegacy !== building.windowStyle;
        if (!changed) return false;
        building.windowTypeId = nextTypeId;
        building.windowStyle = nextLegacy;
        building.windowParams = normalizeWindowParamsCompat(nextTypeId, null);
        if (!building.streetEnabled) {
            building.streetWindowTypeId = nextTypeId;
            building.streetWindowStyle = nextLegacy;
            building.streetWindowParams = normalizeWindowParamsCompat(nextTypeId, null);
        }
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowFrameWidth(value) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.windowParams && typeof building.windowParams === 'object' ? building.windowParams : {};
        const next = clamp(value, 0.02, 0.2);
        if (Math.abs(next - (Number(params.frameWidth) || 0)) < 1e-6) return false;
        building.windowParams = { ...params, frameWidth: next };
        if (!building.streetEnabled) building.streetWindowParams = building.windowParams;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowFrameColor(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.windowParams && typeof building.windowParams === 'object' ? building.windowParams : {};
        const next = Number.isFinite(hex) ? hex : params.frameColor;
        if (next === params.frameColor) return false;
        building.windowParams = { ...params, frameColor: next };
        if (!building.streetEnabled) building.streetWindowParams = building.windowParams;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowGlassTop(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.windowParams && typeof building.windowParams === 'object' ? building.windowParams : {};
        const next = Number.isFinite(hex) ? hex : params.glassTop;
        if (next === params.glassTop) return false;
        building.windowParams = { ...params, glassTop: next };
        if (!building.streetEnabled) building.streetWindowParams = building.windowParams;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowGlassBottom(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.windowParams && typeof building.windowParams === 'object' ? building.windowParams : {};
        const next = Number.isFinite(hex) ? hex : params.glassBottom;
        if (next === params.glassBottom) return false;
        building.windowParams = { ...params, glassBottom: next };
        if (!building.streetEnabled) building.streetWindowParams = building.windowParams;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowSpacerEnabled(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.windowSpacerEnabled) return false;
        building.windowSpacerEnabled = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowSpacerEvery(count) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clampInt(count, 1, 99);
        if (next === building.windowSpacerEvery) return false;
        building.windowSpacerEvery = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowSpacerWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.1, 10.0);
        if (Math.abs(next - (Number(building.windowSpacerWidth) || 0)) < 1e-6) return false;
        building.windowSpacerWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowSpacerExtrude(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.windowSpacerExtrude) return false;
        building.windowSpacerExtrude = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingWindowSpacerExtrudeDistance(distance) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(distance, 0.0, 1.0);
        if (Math.abs(next - (Number(building.windowSpacerExtrudeDistance) || 0)) < 1e-6) return false;
        building.windowSpacerExtrudeDistance = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.3, 12.0);
        if (Math.abs(next - (Number(building.streetWindowWidth) || 0)) < 1e-6) return false;
        building.streetWindowWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowGap(gap) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(gap, 0.0, 24.0);
        if (Math.abs(next - (Number(building.streetWindowGap) || 0)) < 1e-6) return false;
        building.streetWindowGap = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const floorH = clamp(Number.isFinite(building.streetFloorHeight) ? building.streetFloorHeight : building.floorHeight, 1.0, 12.0);
        const next = clamp(height, 0.3, floorH * 0.95);
        if (Math.abs(next - (Number(building.streetWindowHeight) || 0)) < 1e-6) return false;
        building.streetWindowHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowY(offset) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const floorH = clamp(Number.isFinite(building.streetFloorHeight) ? building.streetFloorHeight : building.floorHeight, 1.0, 12.0);
        const winH = clamp(Number.isFinite(building.streetWindowHeight) ? building.streetWindowHeight : 1.4, 0.3, floorH * 0.95);
        const next = clamp(offset, 0.0, Math.max(0, floorH - winH));
        if (Math.abs(next - (Number(building.streetWindowY) || 0)) < 1e-6) return false;
        building.streetWindowY = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowStyle(style) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const raw = typeof style === 'string' ? style : '';
        const nextTypeId = normalizeWindowTypeIdOrLegacyStyle(raw);
        const nextLegacy = isWindowStyle(raw)
            ? raw
            : (isWindowTypeId(raw) ? legacyWindowStyleFromWindowTypeId(nextTypeId) : building.windowStyle);

        const changed = nextTypeId !== building.streetWindowTypeId || nextLegacy !== building.streetWindowStyle;
        if (!changed) return false;
        building.streetWindowTypeId = nextTypeId;
        building.streetWindowStyle = nextLegacy;
        building.streetWindowParams = normalizeWindowParamsCompat(nextTypeId, null);
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowFrameWidth(value) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : {};
        const next = clamp(value, 0.02, 0.2);
        if (Math.abs(next - (Number(params.frameWidth) || 0)) < 1e-6) return false;
        building.streetWindowParams = { ...params, frameWidth: next };
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowFrameColor(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : {};
        const next = Number.isFinite(hex) ? hex : params.frameColor;
        if (next === params.frameColor) return false;
        building.streetWindowParams = { ...params, frameColor: next };
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowGlassTop(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : {};
        const next = Number.isFinite(hex) ? hex : params.glassTop;
        if (next === params.glassTop) return false;
        building.streetWindowParams = { ...params, glassTop: next };
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowGlassBottom(hex) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const params = building.streetWindowParams && typeof building.streetWindowParams === 'object' ? building.streetWindowParams : {};
        const next = Number.isFinite(hex) ? hex : params.glassBottom;
        if (next === params.glassBottom) return false;
        building.streetWindowParams = { ...params, glassBottom: next };
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowSpacerEnabled(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.streetWindowSpacerEnabled) return false;
        building.streetWindowSpacerEnabled = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowSpacerEvery(count) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clampInt(count, 1, 99);
        if (next === building.streetWindowSpacerEvery) return false;
        building.streetWindowSpacerEvery = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowSpacerWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.1, 10.0);
        if (Math.abs(next - (Number(building.streetWindowSpacerWidth) || 0)) < 1e-6) return false;
        building.streetWindowSpacerWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowSpacerExtrude(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.streetWindowSpacerExtrude) return false;
        building.streetWindowSpacerExtrude = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetWindowSpacerExtrudeDistance(distance) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(distance, 0.0, 1.0);
        if (Math.abs(next - (Number(building.streetWindowSpacerExtrudeDistance) || 0)) < 1e-6) return false;
        building.streetWindowSpacerExtrudeDistance = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetEnabled(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.streetEnabled) return false;
        building.streetEnabled = next;
        if (!isBuildingStyle(building.streetStyle)) building.streetStyle = building.style;
        if (!Number.isFinite(building.streetFloorHeight)) building.streetFloorHeight = building.floorHeight;
        if (next) {
            if (!isWindowStyle(building.windowStyle)) building.windowStyle = WINDOW_STYLE.DEFAULT;
            building.streetWindowWidth = building.windowWidth;
            building.streetWindowGap = building.windowGap;
            building.streetWindowHeight = building.windowHeight;
            building.streetWindowY = building.windowY;
            building.streetWindowStyle = building.windowStyle;
        }
        building.streetFloors = clampInt(building.streetFloors, 0, building.floors);
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetFloors(count) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clampInt(count, 0, building.floors);
        if (next === building.streetFloors) return false;
        building.streetFloors = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetFloorHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(height, 1.0, 12.0);
        if (Math.abs(next - (Number(building.streetFloorHeight) || 0)) < 1e-6) return false;
        building.streetFloorHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingStreetStyle(style) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = isBuildingStyle(style) ? style : building.style;
        if (next === building.streetStyle) return false;
        building.streetStyle = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingBeltCourseEnabled(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.beltCourseEnabled) return false;
        building.beltCourseEnabled = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingBeltCourseMargin(margin) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(margin, 0.0, 4.0);
        if (Math.abs(next - (Number(building.beltCourseMargin) || 0)) < 1e-6) return false;
        building.beltCourseMargin = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingBeltCourseHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(height, 0.02, 1.2);
        if (Math.abs(next - (Number(building.beltCourseHeight) || 0)) < 1e-6) return false;
        building.beltCourseHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingBeltCourseColor(color) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = isBeltCourseColor(color) ? color : BELT_COURSE_COLOR.OFFWHITE;
        if (next === building.beltCourseColor) return false;
        building.beltCourseColor = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingTopBeltEnabled(enabled) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = !!enabled;
        if (next === building.topBeltEnabled) return false;
        building.topBeltEnabled = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingTopBeltWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.0, 4.0);
        if (Math.abs(next - (Number(building.topBeltWidth) || 0)) < 1e-6) return false;
        building.topBeltWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingTopBeltHeight(height) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(height, 0.02, 1.2);
        if (Math.abs(next - (Number(building.topBeltHeight) || 0)) < 1e-6) return false;
        building.topBeltHeight = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingTopBeltInnerWidth(width) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = clamp(width, 0.0, 4.0);
        if (Math.abs(next - (Number(building.topBeltInnerWidth) || 0)) < 1e-6) return false;
        building.topBeltInnerWidth = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingTopBeltColor(color) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = isBeltCourseColor(color) ? color : BELT_COURSE_COLOR.OFFWHITE;
        if (next === building.topBeltColor) return false;
        building.topBeltColor = next;
        this._rebuildBuildingMesh(building);
        return true;
    }

    setSelectedBuildingRoofColor(color) {
        const building = this.getSelectedBuilding();
        if (!building) return false;
        const next = isRoofColor(color) ? color : ROOF_COLOR.DEFAULT;
        if (next === building.roofColor) return false;
        building.roofColor = next;
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

    setSelectedBuildingStyle(style) {
        const building = this.getSelectedBuilding();
        if (!building) return false;

        const next = isBuildingStyle(style) ? style : BUILDING_STYLE.DEFAULT;
        if (next === building.style) return false;
        building.style = next;
        if (!building.streetEnabled) building.streetStyle = next;

        this._rebuildBuildingMesh(building);
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
        this._resetToSingleBuilding();
    }

    setFloorHeight(height) {
        const next = clamp(height, 1.0, 12.0);
        if (Math.abs(next - this.floorHeight) < 1e-6) return;
        this.floorHeight = next;
        this._rebuildBuildings();
    }

    _findBestCenteredRectFootprintTileIds(footprintW, footprintH) {
        if (!this.map) return [];
        const size = this.gridSize;
        const w = clampInt(footprintW, 1, size);
        const h = clampInt(footprintH, 1, size);
        if (size < w || size < h) return [];

        const centerX = (size - 1) * 0.5;
        const centerY = (size - 1) * 0.5;

        let bestTileIds = null;
        let bestDist2 = Number.POSITIVE_INFINITY;

        for (let y = 0; y <= size - h; y++) {
            for (let x = 0; x <= size - w; x++) {
                const tileIds = [];
                let ok = true;

                for (let dy = 0; dy < h && ok; dy++) {
                    for (let dx = 0; dx < w; dx++) {
                        const tileId = tileIdFromXY(x + dx, y + dy);
                        const meta = this._tileById.get(tileId);
                        if (!meta) {
                            ok = false;
                            break;
                        }
                        if (this.map.kind[meta.idx] === TILE.ROAD) {
                            ok = false;
                            break;
                        }
                        tileIds.push(tileId);
                    }
                }

                if (!ok) continue;

                const footprintCenterX = x + (w - 1) * 0.5;
                const footprintCenterY = y + (h - 1) * 0.5;
                const dx = footprintCenterX - centerX;
                const dy = footprintCenterY - centerY;
                const dist2 = dx * dx + dy * dy;

                if (dist2 < bestDist2) {
                    bestDist2 = dist2;
                    bestTileIds = tileIds;
                }
            }
        }

        return bestTileIds ?? [];
    }

    _getDefaultSingleBuildingFootprintTileIds() {
        const primary = this._findBestCenteredRectFootprintTileIds(2, 1);
        if (primary.length) return primary;
        return this._findBestCenteredRectFootprintTileIds(1, 1);
    }

    _resetToSingleBuilding({ floors = 8, floorHeight = null, createOptions = null } = {}) {
        if (!this.root) return null;
        this._clearBuildings();

        const tileIds = this._getDefaultSingleBuildingFootprintTileIds();
        if (!tileIds.length) return null;

        const created = this._createBuilding(tileIds, floors, floorHeight ?? this.floorHeight, createOptions ?? {});
        this.setSelectedBuildingId(created?.id ?? null);
        return created;
    }

    _syncBuildingRenderMode(building) {
        if (!building) return;
        const floorplan = this._showFloorplan;

        if (building.planGroup) building.planGroup.visible = floorplan;
        if (building.solidGroup) building.solidGroup.visible = !floorplan && !this._showWireframe;
        if (building.featuresGroup) building.featuresGroup.visible = !floorplan && !this._showWireframe;
        if (building.wireGroup) building.wireGroup.visible = !floorplan && this._showWireframe;
        if (building.floorsGroup) building.floorsGroup.visible = !floorplan && this._showFloorDivisions;
        if (building.windowsGroup) building.windowsGroup.visible = !floorplan && !this._showWireframe;
    }

    _syncBuildingRenderModes() {
        for (const building of this._buildings) {
            this._syncBuildingRenderMode(building);
        }
    }

    _syncBuildingBorder(building) {
        if (!building?.borderGroup) return;
        building.borderGroup.visible = false;
    }

    _syncBuildingBorders() {
        for (const building of this._buildings) {
            this._syncBuildingBorder(building);
        }
    }

    _syncSelectedBuildingFaceHighlight() {
        for (const building of this._buildings) {
            this._syncFaceHighlight(building);
        }
    }

    _syncFaceHighlight(building) {
        const group = building?.faceHighlightGroup ?? null;
        if (!group) return;

        for (const child of [...group.children]) {
            child.removeFromParent();
            disposeObject3D(child);
        }

        const isSelected = !!this._selectedBuildingId && building?.id === this._selectedBuildingId;
        const faceId = this._selectedFaceId;
        if (!isSelected || !isFaceId(faceId) || !building?.tiles?.size) {
            group.visible = false;
            return;
        }

        const rects = this._rectsForBuildingTiles(building.tiles);
        const loops = this._loopsFromRects(rects);
        if (!loops.length) {
            group.visible = false;
            return;
        }

        let outer = loops[0];
        let bestArea = Math.abs(signedArea(outer));
        for (let i = 1; i < loops.length; i++) {
            const loop = loops[i];
            const area = Math.abs(signedArea(loop));
            if (area > bestArea) {
                bestArea = area;
                outer = loop;
            }
        }

        if (!outer || outer.length < 2) {
            group.visible = false;
            return;
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const p of outer) {
            if (!p) continue;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
            group.visible = false;
            return;
        }

        const groundY = this.generatorConfig?.ground?.surfaceY ?? this.generatorConfig?.road?.surfaceY ?? 0;
        const roadCfg = this.generatorConfig?.road ?? {};
        const baseRoadY = Number.isFinite(roadCfg?.surfaceY) ? roadCfg.surfaceY : (Number.isFinite(groundY) ? groundY : 0);
        const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
        const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
        const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
        const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
        const sidewalkY = baseRoadY + curbHeight + curbExtra + sidewalkLift;
        const base = sidewalkWidth > EPS ? sidewalkY : baseRoadY;
        const y = base + FACE_HIGHLIGHT_Y_LIFT;

        const tol = 1e-4;
        const positions = [];

        const wantsSegment = (a, b) => {
            if (!a || !b) return false;
            switch (faceId) {
                case 'A': return Math.abs(a.z - maxZ) <= tol && Math.abs(b.z - maxZ) <= tol;
                case 'C': return Math.abs(a.z - minZ) <= tol && Math.abs(b.z - minZ) <= tol;
                case 'B': return Math.abs(a.x - maxX) <= tol && Math.abs(b.x - maxX) <= tol;
                case 'D': return Math.abs(a.x - minX) <= tol && Math.abs(b.x - minX) <= tol;
                default: return false;
            }
        };

        for (let i = 0; i < outer.length; i++) {
            const a = outer[i];
            const b = outer[(i + 1) % outer.length];
            if (!wantsSegment(a, b)) continue;
            positions.push(a.x, y, a.z, b.x, y, b.z);
        }

        if (!positions.length) {
            group.visible = false;
            return;
        }

        const geo = new LineSegmentsGeometry();
        geo.setPositions(positions);

        const mat = new LineMaterial({
            color: FACE_HIGHLIGHT_COLOR,
            linewidth: FACE_HIGHLIGHT_LINEWIDTH,
            worldUnits: false,
            transparent: true,
            opacity: FACE_HIGHLIGHT_OPACITY,
            depthTest: false,
            depthWrite: false
        });

        if (this.engine?.renderer) {
            const size = this.engine.renderer.getSize(this._lineResolution);
            mat.resolution.set(size.x, size.y);
        }

        const line = new LineSegments2(geo, mat);
        line.renderOrder = 146;
        line.frustumCulled = false;
        group.add(line);
        group.visible = true;
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

    createBuildingsFromSelection({ floors, floorHeight, layers = null, materialVariationSeed = null, windowVisuals = null } = {}) {
        if (!this.root) return;
        if (!this._selectedTiles.size) return;

        const selection = new Set(this._selectedTiles);
        const clusters = this._clusterTiles(selection);
        if (!clusters.length) return;

        clusters.sort((a, b) => b.size - a.size);
        const main = clusters[0];
        if (!main?.size) return;

        const resolvedLayers = Array.isArray(layers) && layers.length
            ? cloneBuildingLayers(layers)
            : null;

        let clampedFloors = clampInt(floors, 1, 30);
        let clampedFloorHeight = clamp(
            Number.isFinite(floorHeight) ? floorHeight : this.floorHeight,
            1.0,
            12.0
        );

        if (resolvedLayers) {
            const total = resolvedLayers
                .filter((layer) => layer?.type === 'floor')
                .reduce((sum, layer) => sum + clampInt(layer.floors, 0, 99), 0);
            if (total > 0) clampedFloors = clampInt(total, 1, 30);

            const first = resolvedLayers.find((layer) => layer?.type === 'floor') ?? null;
            if (Number.isFinite(first?.floorHeight)) {
                clampedFloorHeight = clamp(first.floorHeight, 1.0, 12.0);
            }
        }

        this._selectedTiles.clear();
        this._syncSelectionPreview();
        this.setBuildingModeEnabled(false);

        this._clearBuildings();
        const created = this._createBuilding(main, clampedFloors, clampedFloorHeight, {
            layers: resolvedLayers ? cloneBuildingLayers(resolvedLayers) : null,
            materialVariationSeed,
            windowVisuals
        });

        this._syncTileVisuals();
        if (created?.id) this.setSelectedBuildingId(created.id);
    }

    loadBuildingConfigFromCatalog(configId) {
        if (!this.root) return null;

        const cfg = getBuildingConfigById(configId);
        if (!cfg) return null;

        const resolvedLayers = Array.isArray(cfg.layers) && cfg.layers.length
            ? cloneBuildingLayers(cfg.layers)
            : null;

        let floors = clampInt(cfg.floors, 1, 30);
        let floorHeight = clamp(
            Number.isFinite(cfg.floorHeight) ? cfg.floorHeight : this.floorHeight,
            1.0,
            12.0
        );

        if (resolvedLayers) {
            const total = resolvedLayers
                .filter((layer) => layer?.type === 'floor')
                .reduce((sum, layer) => sum + clampInt(layer.floors, 0, 99), 0);
            if (total > 0) floors = clampInt(total, 1, 30);

            const first = resolvedLayers.find((layer) => layer?.type === 'floor') ?? null;
            if (Number.isFinite(first?.floorHeight)) floorHeight = clamp(first.floorHeight, 1.0, 12.0);
        }

        const style = isBuildingStyle(cfg.style) ? cfg.style : BUILDING_STYLE.DEFAULT;
        const win = cfg.windows && typeof cfg.windows === 'object' ? cfg.windows : null;
        const wallInset = Number.isFinite(cfg.wallInset) ? cfg.wallInset : 0.0;
        const importedFacades = cfg.facades && typeof cfg.facades === 'object' ? deepClone(cfg.facades) : null;
        const importedWindowDefinitions = cfg.windowDefinitions && typeof cfg.windowDefinitions === 'object'
            ? deepClone(cfg.windowDefinitions)
            : null;

        let nextFacades = importedFacades;
        let nextWindowDefinitions = importedWindowDefinitions;

        if (!nextFacades && resolvedLayers) {
            const firstFloor = resolvedLayers.find((layer) => layer?.type === 'floor') ?? null;
            const winCfg = firstFloor?.windows ?? null;
            const spacing = Number.isFinite(winCfg?.spacing) ? winCfg.spacing : (Number.isFinite(win?.gap) ? win.gap : null);
            const widthMeters = Number.isFinite(winCfg?.width) ? winCfg.width : (Number.isFinite(win?.width) ? win.width : null);
            const heightMeters = Number.isFinite(winCfg?.height) ? winCfg.height : (Number.isFinite(win?.height) ? win.height : null);

            if (!!winCfg?.enabled && Number.isFinite(spacing) && Number.isFinite(widthMeters)) {
                const cols = winCfg?.spaceColumns ?? null;
                const wantsColumns = !!cols?.enabled && clampInt(cols?.every ?? 0, 0, 99) > 0 && (Number(cols?.width) || 0) > EPS;

                const pattern = wantsColumns
                    ? createLegacyWindowSpacingFacadeFillPattern({
                        windowWidthMeters: widthMeters,
                        spacingMeters: spacing,
                        columnsEvery: cols?.every ?? 4,
                        columnWidthMeters: cols?.width ?? 0.9
                    })
                    : createLegacyWindowSpacingOnlyFacadeFillPattern({
                        windowWidthMeters: widthMeters,
                        spacingMeters: spacing,
                        maxWindows: 9999
                    });

                const wallMaterial = firstFloor?.material && typeof firstFloor.material === 'object'
                    ? deepClone(firstFloor.material)
                    : { kind: 'texture', id: style };

                const makeFacade = () => ({
                    wallMaterial,
                    depthOffset: 0.0,
                    layout: {
                        pattern: deepClone(pattern),
                        nextBayIndex: 1,
                        nextPaddingIndex: 1,
                        items: []
                    }
                });

                nextFacades = {
                    A: makeFacade(),
                    B: makeFacade(),
                    C: makeFacade(),
                    D: makeFacade()
                };

                if (!nextWindowDefinitions && Number.isFinite(heightMeters)) {
                    const settings = getDefaultWindowMeshSettings();
                    settings.width = clamp(widthMeters, 0.2, 12.0);
                    settings.height = clamp(heightMeters, 0.2, 12.0);
                    nextWindowDefinitions = {
                        nextWindowIndex: 2,
                        items: [{
                            id: 'win_1',
                            label: 'Window 1',
                            settings: sanitizeWindowMeshSettings(settings)
                        }]
                    };
                }
            }
        }

        this._selectedTiles.clear();
        this._syncSelectionPreview();
        this.setRoadModeEnabled(false);
        this.setBuildingModeEnabled(false);
        return this._resetToSingleBuilding({
            floors,
            floorHeight,
            createOptions: {
                id: typeof cfg.id === 'string' ? cfg.id : null,
                style,
                wallInset,
                windowWidth: win?.width,
                windowGap: win?.gap,
                windowHeight: win?.height,
                windowY: win?.y,
                layers: resolvedLayers,
                materialVariationSeed: Number.isFinite(cfg?.materialVariationSeed) ? cfg.materialVariationSeed : null,
                windowVisuals: cfg?.windowVisuals ?? null,
                facades: nextFacades,
                windowDefinitions: nextWindowDefinitions
            }
        });
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
        this._resetToSingleBuilding();
    }

    _buildLights() {
        const lighting = this.engine?.lightingSettings ?? {};
        const hemiIntensity = Number.isFinite(lighting.hemiIntensity) ? lighting.hemiIntensity : 0.85;
        const sunIntensity = Number.isFinite(lighting.sunIntensity) ? lighting.sunIntensity : 1.2;

        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, hemiIntensity);
        this.hemi.position.set(0, 100, 0);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
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
            atmosphere: this.engine?.atmosphereSettings ?? null,
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.root.add(this.sky);
        this._syncSkyVisibility();
    }

    _applyAtmosphere() {
        const atmo = this.engine?.atmosphereSettings ?? null;
        if (!atmo) return;

        const azimuthDeg = atmo?.sun?.azimuthDeg ?? null;
        const elevationDeg = atmo?.sun?.elevationDeg ?? null;
        if (this.sun && Number.isFinite(azimuthDeg) && Number.isFinite(elevationDeg)) {
            const dir = azimuthElevationDegToDir(azimuthDeg, elevationDeg);
            const dist = this.sun.position.length() > 1e-6 ? this.sun.position.length() : 200;
            this.sun.position.copy(dir).multiplyScalar(dist);
            this.sun.target.position.set(0, 0, 0);
            this.sun.target.updateMatrixWorld?.();
        }

        applyAtmosphereToSkyDome(this.sky, atmo, { sunDir: this.sun?.position ?? null });

        const fog = this.scene?.fog ?? null;
        const fogColor = atmo?.sky?.horizonColor ?? null;
        if (fog?.isFog && typeof fogColor === 'string' && fogColor) fog.color.set(fogColor);
    }

    _syncSkyVisibility() {
        const wantsIblBackground = !!this.engine?.lightingSettings?.ibl?.setBackground;
        const showSky = shouldShowSkyDome({
            skyIblBackgroundMode: this.engine?.atmosphereSettings?.sky?.iblBackgroundMode ?? 'ibl',
            lightingIblSetBackground: wantsIblBackground,
            sceneBackground: this.scene?.background ?? null
        });
        if (this.sky) this.sky.visible = showSky;
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

        this.roads = createRoadEngineRoads({
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
        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls = new ToolCameraController(this.camera, this.canvas, {
            enableDamping: true,
            dampingFactor: 0.08,
            minPolarAngle: 0.12,
            maxPolarAngle: Math.PI / 2.05,
            minDistance: Math.max(16, dist * 0.35),
            maxDistance: dist * 2.2,
            getFocusTarget: () => this._getCameraFocusTarget()
        });

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
                this.controls.setLookAt({ position: cameraPos, target: cameraTarget });
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
        const roadCfg = this.generatorConfig?.road ?? {};
        const baseRoadY = Number.isFinite(roadCfg?.surfaceY) ? roadCfg.surfaceY : (Number.isFinite(groundY) ? groundY : 0);
        const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
        const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
        const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
        const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
        const sidewalkY = baseRoadY + curbHeight + curbExtra + sidewalkLift;
        const planBase = sidewalkWidth > EPS ? sidewalkY : baseRoadY;
        const planY = planBase + 0.07;
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

    _createBuilding(tileIds, floors, floorHeight, {
        id = null,
        type = 'business',
        style = BUILDING_STYLE.DEFAULT,
        roofColor = ROOF_COLOR.DEFAULT,
        wallInset = 0.0,
        windowStyle = WINDOW_STYLE.DEFAULT,
        windowTypeId = null,
        windowParams = null,
        windowWidth = 2.2,
        windowGap = 1.6,
        windowHeight = 1.4,
        windowY = 1.0,
        streetEnabled = false,
        streetFloors = 0,
        streetFloorHeight = null,
        streetStyle = null,
        streetWindowStyle = null,
        streetWindowTypeId = null,
        streetWindowParams = null,
        streetWindowWidth = null,
        streetWindowGap = null,
        streetWindowHeight = null,
        streetWindowY = null,
        beltCourseEnabled = false,
        beltCourseMargin = 0.4,
        beltCourseHeight = 0.18,
        beltCourseColor = BELT_COURSE_COLOR.OFFWHITE,
        topBeltEnabled = false,
        topBeltWidth = 0.4,
        topBeltHeight = 0.18,
        topBeltInnerWidth = 0.0,
        topBeltColor = BELT_COURSE_COLOR.OFFWHITE,
        windowSpacerEnabled = false,
        windowSpacerEvery = 4,
        windowSpacerWidth = 0.9,
        windowSpacerExtrude = false,
        windowSpacerExtrudeDistance = 0.12,
        streetWindowSpacerEnabled = false,
        streetWindowSpacerEvery = 4,
        streetWindowSpacerWidth = 0.9,
        streetWindowSpacerExtrude = false,
        streetWindowSpacerExtrudeDistance = 0.12,
        layers = null,
        materialVariationSeed = null,
        windowVisuals = null,
        facades = null,
        windowDefinitions = null
    } = {}) {
        const group = new THREE.Group();
        const baseName = typeof id === 'string' ? id.trim() : '';
        if (!baseName) {
            group.name = `building_${this._buildings.length + 1}`;
        } else {
            let nextName = baseName;
            if (this._buildings.some((b) => b?.id === nextName)) {
                let suffix = 2;
                while (this._buildings.some((b) => b?.id === `${baseName}_${suffix}`)) suffix += 1;
                nextName = `${baseName}_${suffix}`;
            }
            group.name = nextName;
        }
        this.root.add(group);

        const solidGroup = new THREE.Group();
        solidGroup.name = 'solid';
        const featuresGroup = new THREE.Group();
        featuresGroup.name = 'features';
        const wireGroup = new THREE.Group();
        wireGroup.name = 'wire';
        const floorsGroup = new THREE.Group();
        floorsGroup.name = 'floors';
        const planGroup = new THREE.Group();
        planGroup.name = 'floorplan';
        const borderGroup = new THREE.Group();
        borderGroup.name = 'selection_border';
        const faceHighlightGroup = new THREE.Group();
        faceHighlightGroup.name = 'face_highlight';
        const windowsGroup = new THREE.Group();
        windowsGroup.name = 'windows';

        group.add(solidGroup);
        group.add(featuresGroup);
        group.add(wireGroup);
        group.add(floorsGroup);
        group.add(planGroup);
        group.add(borderGroup);
        group.add(faceHighlightGroup);
        group.add(windowsGroup);

        const clampedFloorHeight = clamp(Number.isFinite(floorHeight) ? floorHeight : this.floorHeight, 1.0, 12.0);
        const safeStyle = isBuildingStyle(style) ? style : BUILDING_STYLE.DEFAULT;
        const safeWindowStyle = isWindowStyle(windowStyle) ? windowStyle : WINDOW_STYLE.DEFAULT;
        const safeStreetWindowStyle = isWindowStyle(streetWindowStyle) ? streetWindowStyle : safeWindowStyle;
        const safeWindowTypeId = isWindowTypeId(windowTypeId)
            ? windowTypeId
            : normalizeWindowTypeIdOrLegacyStyle(safeWindowStyle);
        const safeStreetWindowTypeId = isWindowTypeId(streetWindowTypeId)
            ? streetWindowTypeId
            : normalizeWindowTypeIdOrLegacyStyle(safeStreetWindowStyle);
        const safeWindowParams = normalizeWindowParamsCompat(safeWindowTypeId, windowParams);
        const safeStreetWindowParams = normalizeWindowParamsCompat(safeStreetWindowTypeId, streetWindowParams);
        const safeStreetWindowWidth = Number.isFinite(streetWindowWidth) ? clamp(streetWindowWidth, 0.3, 12.0) : clamp(windowWidth, 0.3, 12.0);
        const safeStreetWindowGap = Number.isFinite(streetWindowGap) ? clamp(streetWindowGap, 0.0, 24.0) : clamp(windowGap, 0.0, 24.0);
        const safeStreetWindowHeight = Number.isFinite(streetWindowHeight) ? clamp(streetWindowHeight, 0.3, 10.0) : clamp(windowHeight, 0.3, 10.0);
        const safeStreetWindowY = Number.isFinite(streetWindowY) ? clamp(streetWindowY, 0.0, 12.0) : clamp(windowY, 0.0, 12.0);

        const totalFloors = clampInt(floors, 1, 99);
        const safeStreetFloors = streetEnabled ? clampInt(streetFloors, 0, totalFloors) : 0;
        const upperFloors = Math.max(0, totalFloors - safeStreetFloors);

        const buildFloorLayer = ({
            floors: layerFloors,
            floorHeight: layerFloorHeight,
            style: layerStyle,
            beltEnabled,
            beltHeight,
            beltColor,
            windowTypeId: layerWindowTypeId,
            windowParams: layerWindowParams,
            windowWidth: layerWindowWidth,
            windowSpacing: layerWindowSpacing,
            windowHeight: layerWindowHeight,
            windowSillHeight: layerWindowSillHeight,
            spacerEnabled,
            spacerEvery,
            spacerWidth,
            spacerMaterialColor,
            spacerExtrude,
            spacerExtrudeDistance
        }) => createDefaultFloorLayer({
            floors: layerFloors,
            floorHeight: layerFloorHeight,
            style: layerStyle,
            belt: {
                enabled: beltEnabled,
                height: beltHeight,
                material: { color: beltColor }
            },
            windows: {
                enabled: true,
                typeId: layerWindowTypeId,
                params: layerWindowParams,
                width: layerWindowWidth,
                height: layerWindowHeight,
                sillHeight: layerWindowSillHeight,
                spacing: layerWindowSpacing,
                spaceColumns: {
                    enabled: spacerEnabled,
                    every: spacerEvery,
                    width: spacerWidth,
                    material: { color: spacerMaterialColor },
                    extrude: spacerExtrude,
                    extrudeDistance: spacerExtrudeDistance
                }
            }
        });

        const fallbackLayers = [];
        if (safeStreetFloors > 0) {
            fallbackLayers.push(buildFloorLayer({
                floors: safeStreetFloors,
                floorHeight: clamp(
                    Number.isFinite(streetFloorHeight) ? streetFloorHeight : clampedFloorHeight,
                    1.0,
                    12.0
                ),
                style: isBuildingStyle(streetStyle) ? streetStyle : safeStyle,
                beltEnabled: !!beltCourseEnabled,
                beltHeight: clamp(beltCourseHeight, 0.02, 1.2),
                beltColor: isBeltCourseColor(beltCourseColor) ? beltCourseColor : BELT_COURSE_COLOR.OFFWHITE,
                windowTypeId: safeStreetWindowTypeId,
                windowParams: safeStreetWindowParams,
                windowWidth: safeStreetWindowWidth,
                windowSpacing: safeStreetWindowGap,
                windowHeight: safeStreetWindowHeight,
                windowSillHeight: safeStreetWindowY,
                spacerEnabled: !!streetWindowSpacerEnabled,
                spacerEvery: clampInt(streetWindowSpacerEvery, 1, 99),
                spacerWidth: clamp(streetWindowSpacerWidth, 0.1, 10.0),
                spacerMaterialColor: isBeltCourseColor(beltCourseColor) ? beltCourseColor : BELT_COURSE_COLOR.OFFWHITE,
                spacerExtrude: !!streetWindowSpacerExtrude,
                spacerExtrudeDistance: clamp(streetWindowSpacerExtrudeDistance, 0.0, 1.0)
            }));
        }

        if (upperFloors > 0) {
            fallbackLayers.push(buildFloorLayer({
                floors: upperFloors,
                floorHeight: clampedFloorHeight,
                style: safeStyle,
                beltEnabled: safeStreetFloors > 0 ? false : !!beltCourseEnabled,
                beltHeight: clamp(beltCourseHeight, 0.02, 1.2),
                beltColor: isBeltCourseColor(beltCourseColor) ? beltCourseColor : BELT_COURSE_COLOR.OFFWHITE,
                windowTypeId: safeWindowTypeId,
                windowParams: safeWindowParams,
                windowWidth: clamp(windowWidth, 0.3, 12.0),
                windowSpacing: clamp(windowGap, 0.0, 24.0),
                windowHeight: clamp(windowHeight, 0.3, 10.0),
                windowSillHeight: clamp(windowY, 0.0, 12.0),
                spacerEnabled: !!windowSpacerEnabled,
                spacerEvery: clampInt(windowSpacerEvery, 1, 99),
                spacerWidth: clamp(windowSpacerWidth, 0.1, 10.0),
                spacerMaterialColor: isBeltCourseColor(beltCourseColor) ? beltCourseColor : BELT_COURSE_COLOR.OFFWHITE,
                spacerExtrude: !!windowSpacerExtrude,
                spacerExtrudeDistance: clamp(windowSpacerExtrudeDistance, 0.0, 1.0)
            }));
        }

        fallbackLayers.push(createDefaultRoofLayer({
            ring: {
                enabled: !!topBeltEnabled,
                outerRadius: clamp(topBeltWidth, 0.0, 8.0),
                innerRadius: clamp(topBeltInnerWidth, 0.0, 8.0),
                height: clamp(topBeltHeight, 0.02, 2.0),
                material: { color: isBeltCourseColor(topBeltColor) ? topBeltColor : BELT_COURSE_COLOR.OFFWHITE }
            },
            roof: { color: isRoofColor(roofColor) ? roofColor : ROOF_COLOR.DEFAULT }
        }));

        const resolvedLayers = Array.isArray(layers) && layers.length
            ? cloneBuildingLayers(layers)
            : normalizeBuildingLayers(null, { fallback: fallbackLayers });

        const firstFloorLayer = resolvedLayers.find((layer) => layer?.type === 'floor') ?? null;
        const defaultWallMaterial = firstFloorLayer?.material && typeof firstFloorLayer.material === 'object'
            ? deepClone(firstFloorLayer.material)
            : { kind: 'texture', id: safeStyle };
        const defaultFacade = {
            wallMaterial: defaultWallMaterial,
            depthOffset: 0.0,
            layout: {
                nextBayIndex: 2,
                nextPaddingIndex: 1,
                items: [{
                    type: 'bay',
                    id: 'bay_1',
                    widthFrac: 1.0,
                    minWidthMeters: MIN_FACADE_BAY_WIDTH_M,
                    wallMaterialOverride: null,
                    depthOffset: 0.0,
                    wedgeAngleDeg: 0,
                    features: {}
                }]
            }
        };

        const defaultWindowDefinitions = {
            nextWindowIndex: 2,
            items: [{
                id: 'win_1',
                label: 'Window 1',
                settings: getDefaultWindowMeshSettings()
            }]
        };

        const resolvedWindowDefinitions = windowDefinitions && typeof windowDefinitions === 'object'
            ? deepClone(windowDefinitions)
            : deepClone(defaultWindowDefinitions);

        const resolvedFacadesRaw = facades && typeof facades === 'object'
            ? deepClone(facades)
            : null;

        const resolvedFacades = {
            A: resolvedFacadesRaw?.A ?? deepClone(defaultFacade),
            B: resolvedFacadesRaw?.B ?? deepClone(defaultFacade),
            C: resolvedFacadesRaw?.C ?? deepClone(defaultFacade),
            D: resolvedFacadesRaw?.D ?? deepClone(defaultFacade)
        };

        const building = {
            id: group.name,
            type,
            style: safeStyle,
            roofColor: isRoofColor(roofColor) ? roofColor : ROOF_COLOR.DEFAULT,
            wallInset: clamp(wallInset, 0.0, 4.0),
            materialVariationSeed: Number.isFinite(materialVariationSeed) ? clampInt(materialVariationSeed, 0, 4294967295) : null,
            windowVisuals: windowVisuals ? deepClone(windowVisuals) : null,
            windowDefinitions: resolvedWindowDefinitions,
            baseColorHex: null,
            tiles: new Set(tileIds),
            facades: resolvedFacades,
            floors,
            floorHeight: clampedFloorHeight,
            streetEnabled: !!streetEnabled,
            streetFloors: clampInt(streetFloors, 0, floors),
            streetFloorHeight: clamp(
                Number.isFinite(streetFloorHeight) ? streetFloorHeight : clampedFloorHeight,
                1.0,
                12.0
            ),
            streetStyle: isBuildingStyle(streetStyle) ? streetStyle : safeStyle,
            beltCourseEnabled: !!beltCourseEnabled,
            beltCourseMargin: clamp(beltCourseMargin, 0.0, 4.0),
            beltCourseHeight: clamp(beltCourseHeight, 0.02, 1.2),
            beltCourseColor: isBeltCourseColor(beltCourseColor) ? beltCourseColor : BELT_COURSE_COLOR.OFFWHITE,
            topBeltEnabled: !!topBeltEnabled,
            topBeltWidth: clamp(topBeltWidth, 0.0, 4.0),
            topBeltHeight: clamp(topBeltHeight, 0.02, 1.2),
            topBeltInnerWidth: clamp(topBeltInnerWidth, 0.0, 4.0),
            topBeltColor: isBeltCourseColor(topBeltColor) ? topBeltColor : BELT_COURSE_COLOR.OFFWHITE,
            windowStyle: safeWindowStyle,
            windowTypeId: safeWindowTypeId,
            windowParams: safeWindowParams,
            windowWidth: clamp(windowWidth, 0.3, 12.0),
            windowGap: clamp(windowGap, 0.0, 24.0),
            windowHeight: clamp(windowHeight, 0.3, 10.0),
            windowY: clamp(windowY, 0.0, 12.0),
            windowSpacerEnabled: !!windowSpacerEnabled,
            windowSpacerEvery: clampInt(windowSpacerEvery, 1, 99),
            windowSpacerWidth: clamp(windowSpacerWidth, 0.1, 10.0),
            windowSpacerExtrude: !!windowSpacerExtrude,
            windowSpacerExtrudeDistance: clamp(windowSpacerExtrudeDistance, 0.0, 1.0),
            streetWindowStyle: safeStreetWindowStyle,
            streetWindowTypeId: safeStreetWindowTypeId,
            streetWindowParams: safeStreetWindowParams,
            streetWindowWidth: safeStreetWindowWidth,
            streetWindowGap: safeStreetWindowGap,
            streetWindowHeight: safeStreetWindowHeight,
            streetWindowY: safeStreetWindowY,
            streetWindowSpacerEnabled: !!streetWindowSpacerEnabled,
            streetWindowSpacerEvery: clampInt(streetWindowSpacerEvery, 1, 99),
            streetWindowSpacerWidth: clamp(streetWindowSpacerWidth, 0.1, 10.0),
            streetWindowSpacerExtrude: !!streetWindowSpacerExtrude,
            streetWindowSpacerExtrudeDistance: clamp(streetWindowSpacerExtrudeDistance, 0.0, 1.0),
            layers: resolvedLayers,
            group,
            solidGroup,
            featuresGroup,
            wireGroup,
            floorsGroup,
            planGroup,
            borderGroup,
            faceHighlightGroup,
            windowsGroup
        };

        this._seedFacadeLayoutItemsFromPatterns(building);

        this._buildings.push(building);
        for (const tileId of building.tiles) this._buildingsByTile.set(tileId, building);
        this._rebuildBuildingMesh(building);

        this._syncBuildingRenderMode(building);
        this._syncBuildingBorder(building);
        building.group.visible = !this._roadModeEnabled;
        return building;
    }

    _seedFacadeLayoutItemsFromPatterns(building) {
        const facades = building?.facades && typeof building.facades === 'object' ? building.facades : null;
        if (!facades) return;
        for (const faceId of FACE_IDS_RECT) {
            const facade = facades?.[faceId] ?? null;
            const pattern = facade?.layout?.pattern ?? null;
            if (!pattern || typeof pattern !== 'object') continue;
            const len = this._getFaceLengthMeters(building, faceId);
            if (!Number.isFinite(len) || !(len > EPS)) continue;
            const res = solveFacadeLayoutFillPattern({ pattern, faceLengthMeters: len, topology: null, warnings: null });
            if (Array.isArray(res?.items) && res.items.length) {
                facade.layout ??= {};
                facade.layout.items = res.items;
            }
        }
    }

    _syncMirroredFacadeIfLocked(building, faceId) {
        if (!this._faceMirrorLockEnabled) return;
        const srcId = isFaceId(faceId) ? faceId : this._selectedFaceId;
        const otherId = getMirroredFaceId(srcId);
        if (!otherId) return;
        if (!building?.facades?.[srcId]) return;
        building.facades[otherId] = deepClone(building.facades[srcId]);
    }

    _getBuildingFootprintOuterLoop(building) {
        if (!building?.tiles?.size) return null;
        const rects = this._rectsForBuildingTiles(building.tiles);
        const loops = this._loopsFromRects(rects);
        if (!loops.length) return null;

        let outer = loops[0];
        let bestArea = Math.abs(signedArea(outer));
        for (let i = 1; i < loops.length; i++) {
            const loop = loops[i];
            const area = Math.abs(signedArea(loop));
            if (area > bestArea) {
                bestArea = area;
                outer = loop;
            }
        }
        return outer?.length ? outer : null;
    }

    _getFaceLengthMeters(building, faceId) {
        const loop = this._getBuildingFootprintOuterLoop(building);
        if (!loop) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const p of loop) {
            if (!p) continue;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;

        if (faceId === 'A' || faceId === 'C') return maxX - minX;
        if (faceId === 'B' || faceId === 'D') return maxZ - minZ;
        return null;
    }

    _getLayoutItemWidthMeters(item, faceLength) {
        const frac = clamp(item?.widthFrac, 0, 1);
        return frac * faceLength;
    }

    _minWidthMetersForLayoutItem(item, faceLength, { building = null } = {}) {
        const kind = item?.type;
        const baseMin = clamp(item?.minWidthMeters, 0, faceLength);
        if (kind !== 'bay') return baseMin > 0 ? baseMin : MIN_FACADE_PADDING_WIDTH_M;

        let required = baseMin > 0 ? baseMin : MIN_FACADE_BAY_WIDTH_M;

        const windowFeature = item?.features?.window ?? null;
        if (windowFeature && typeof windowFeature === 'object') {
            let windowWidth = Number.isFinite(windowFeature?.widthMeters) ? windowFeature.widthMeters : null;
            if (!Number.isFinite(windowWidth)) {
                const defId = typeof windowFeature?.defId === 'string' ? windowFeature.defId : '';
                const defs = Array.isArray(building?.windowDefinitions?.items) ? building.windowDefinitions.items : [];
                const def = defId ? (defs.find((d) => d?.id === defId) ?? null) : null;
                windowWidth = Number(def?.settings?.width);
            }
            if (Number.isFinite(windowWidth)) required = Math.max(required, clamp(windowWidth, 0, faceLength));
        }

        const absDepth = Math.abs(Number(item?.depthOffset) || 0);
        const angleDeg = normalizeWedgeAngleDeg(item?.wedgeAngleDeg);
        if (absDepth > EPS && angleDeg > 0) {
            const rad = angleDeg * (Math.PI / 180);
            const tan = Math.tan(rad);
            const wedgeMin = tan > EPS ? (DOUBLE * absDepth / tan) : faceLength;
            required = Math.max(required, wedgeMin);
        }

        return clamp(required, 0, faceLength);
    }

    _validateFacadeLayout(facade, faceLengthMeters, { building = null } = {}) {
        const faceLength = Number(faceLengthMeters);
        if (!Number.isFinite(faceLength) || faceLength <= EPS) return { ok: false, warnings: ['Face length is invalid.'], items: [] };

        const layout = facade?.layout ?? null;
        const items = Array.isArray(layout?.items) ? layout.items : [];
        if (!items.length) {
            return { ok: false, warnings: ['No bays defined.'], items: [] };
        }

        const warnings = [];
        const sumFrac = items.reduce((sum, it) => sum + (Number(it?.widthFrac) || 0), 0);
        if (Math.abs(sumFrac - 1.0) > 1e-3) warnings.push(`Layout widths sum to ${(sumFrac || 0).toFixed(4)} (expected 1.0).`);

        const bayCount = items.filter((it) => it?.type === 'bay').length;
        if (bayCount === 0) warnings.push('Layout contains no bays (only padding).');

        const defs = Array.isArray(building?.windowDefinitions?.items) ? building.windowDefinitions.items : [];
        const defById = new Map(defs.map((d) => [d?.id ?? '', d]));

        const itemInfo = items.map((it) => {
            const id = typeof it?.id === 'string' ? it.id : '';
            const type = it?.type === 'padding' ? 'padding' : 'bay';
            const widthMeters = this._getLayoutItemWidthMeters(it, faceLength);
            const minWidthMeters = this._minWidthMetersForLayoutItem(it, faceLength, { building });
            if (widthMeters + 1e-6 < minWidthMeters) {
                warnings.push(`${id || type}: width ${widthMeters.toFixed(2)}m < min ${minWidthMeters.toFixed(2)}m.`);
            }
            if (type === 'bay') {
                const windowFeature = it?.features?.window ?? null;
                if (windowFeature && typeof windowFeature === 'object') {
                    const defId = typeof windowFeature?.defId === 'string' ? windowFeature.defId : '';
                    if (!defId) {
                        warnings.push(`${id || type}: window feature is enabled but no definition is selected.`);
                    } else if (!defById.has(defId)) {
                        warnings.push(`${id || type}: window definition "${defId}" not found.`);
                    }

                    const floorSkipRaw = windowFeature?.floorSkip;
                    const floorSkipRawNum = Number(floorSkipRaw);
                    if (floorSkipRaw !== undefined && floorSkipRaw !== null) {
                        const isInt = Number.isFinite(floorSkipRawNum) && Math.abs(floorSkipRawNum - Math.round(floorSkipRawNum)) < 1e-6;
                        if (!isInt || floorSkipRawNum < 1) warnings.push(`${id || type}: window floorSkip must be an integer >= 1.`);
                    }

                    const def = defId ? (defById.get(defId) ?? null) : null;
                    const defWidth = Number(def?.settings?.width);
                    const overrideWidth = Number.isFinite(windowFeature?.widthMeters) ? windowFeature.widthMeters : null;
                    const windowWidth = Number.isFinite(overrideWidth)
                        ? clamp(overrideWidth, 0, faceLength)
                        : (Number.isFinite(defWidth) ? clamp(defWidth, 0, faceLength) : null);
                    if (Number.isFinite(windowWidth) && windowWidth > widthMeters + 1e-6) {
                        warnings.push(`${id || type}: window width ${windowWidth.toFixed(2)}m exceeds bay width ${widthMeters.toFixed(2)}m (will be omitted).`);
                    }
                }

                const angleDeg = normalizeWedgeAngleDeg(it?.wedgeAngleDeg);
                const absDepth = Math.abs(Number(it?.depthOffset) || 0);
                if (angleDeg > 0 && !(absDepth > EPS)) warnings.push(`${id || type}: wedge angle set but depth is 0.`);
            }
            return { id, type, widthMeters, minWidthMeters };
        });

        return { ok: warnings.length === 0, warnings, items: itemInfo };
    }

    _normalizeLayoutWidthFractions(items) {
        if (!Array.isArray(items) || !items.length) return;
        let sum = 0;
        for (const it of items) {
            const next = clamp(it?.widthFrac, 0, 1);
            if (it) it.widthFrac = next;
            sum += next;
        }
        if (!(sum > EPS)) {
            for (const it of items) if (it) it.widthFrac = 1 / items.length;
            return;
        }
        for (const it of items) if (it) it.widthFrac = (Number(it.widthFrac) || 0) / sum;
    }

    _addSelectedFaceLayoutItem({ type = 'bay' } = {}) {
        const kind = type === 'padding' ? 'padding' : 'bay';
        const building = this.getSelectedBuilding();
        if (!building?.facades) return false;
        const faceId = this._selectedFaceId;
        const facade = building.facades[faceId] ?? null;
        if (!facade) return false;

        facade.layout ??= {};
        facade.layout.items ??= [];
        facade.layout.nextBayIndex = clampInt(facade.layout.nextBayIndex ?? 1, 1, 9999);
        facade.layout.nextPaddingIndex = clampInt(facade.layout.nextPaddingIndex ?? 1, 1, 9999);

        const items = facade.layout.items;
        if (!items.length) {
            const id = kind === 'padding' ? `pad_${facade.layout.nextPaddingIndex++}` : `bay_${facade.layout.nextBayIndex++}`;
            items.push(kind === 'padding'
                ? { type: 'padding', id, widthFrac: 1.0, minWidthMeters: MIN_FACADE_PADDING_WIDTH_M }
                : {
                    type: 'bay',
                    id,
                    widthFrac: 1.0,
                    minWidthMeters: MIN_FACADE_BAY_WIDTH_M,
                    wallMaterialOverride: null,
                    depthOffset: 0.0,
                    wedgeAngleDeg: 0,
                    features: {}
                });
            this._syncMirroredFacadeIfLocked(building, faceId);
            return true;
        }

        const faceLength = this._getFaceLengthMeters(building, faceId);
        if (!Number.isFinite(faceLength) || faceLength <= EPS) return false;

        const donorIndex = items.length - 1;
        const donor = items[donorIndex];
        const donorMin = this._minWidthMetersForLayoutItem(donor, faceLength, { building }) / faceLength;

        const baseMin = kind === 'padding' ? MIN_FACADE_PADDING_WIDTH_M : MIN_FACADE_BAY_WIDTH_M;
        const minFracNew = clamp(baseMin / faceLength, 0, 1);

        const donorFrac = clamp(donor?.widthFrac, 0, 1);
        const maxDonate = donorFrac - clamp(donorMin, 0, 1);
        if (maxDonate + 1e-8 < minFracNew) return false;

        const desired = Math.max(minFracNew, donorFrac * 0.25);
        const newFrac = clamp(desired, minFracNew, maxDonate);
        donor.widthFrac = donorFrac - newFrac;

        const id = kind === 'padding' ? `pad_${facade.layout.nextPaddingIndex++}` : `bay_${facade.layout.nextBayIndex++}`;
        const nextItem = kind === 'padding'
            ? { type: 'padding', id, widthFrac: newFrac, minWidthMeters: MIN_FACADE_PADDING_WIDTH_M }
            : {
                type: 'bay',
                id,
                widthFrac: newFrac,
                minWidthMeters: MIN_FACADE_BAY_WIDTH_M,
                wallMaterialOverride: null,
                depthOffset: 0.0,
                wedgeAngleDeg: 0,
                features: {}
            };
        items.push(nextItem);

        this._normalizeLayoutWidthFractions(items);
        this._syncMirroredFacadeIfLocked(building, faceId);
        return true;
    }

    _getCameraFocusTarget() {
        const y = 0;
        if (this._selectedTiles?.size) {
            const box = new THREE.Box3();
            for (const tileId of this._selectedTiles) {
                const meta = this._tileById.get(tileId);
                if (meta?.center) box.expandByPoint(meta.center);
            }
            if (!box.isEmpty()) return { box };
        }

        const span = this.tileSize * this.gridSize;
        const half = span * 0.5;
        return {
            center: new THREE.Vector3(0, y, 0),
            radius: Math.max(1, half)
        };
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

    _relocateBuildingToDefaultFootprint(building) {
        if (!building) return false;
        const tileIds = this._getDefaultSingleBuildingFootprintTileIds();
        if (!tileIds.length) return false;
        building.tiles = new Set(tileIds);
        for (const tileId of building.tiles) {
            this._buildingsByTile.set(tileId, building);
        }
        return true;
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
            if (!this._relocateBuildingToDefaultFootprint(building)) this._removeBuilding(building);
            return;
        }

        const clusters = this._clusterTiles(remaining);
        if (!clusters.length) {
            if (!this._relocateBuildingToDefaultFootprint(building)) this._removeBuilding(building);
            return;
        }

        clusters.sort((a, b) => b.size - a.size);
        const main = clusters[0];

        building.tiles = main;
        for (const tileId of building.tiles) {
            this._buildingsByTile.set(tileId, building);
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

    _rebuildBuildingMesh(building) {
        if (!this.root || !building?.group) return;

        for (const child of [
            ...building.solidGroup.children,
            ...building.featuresGroup.children,
            ...building.wireGroup.children,
            ...building.floorsGroup.children,
            ...building.planGroup.children,
            ...building.borderGroup.children,
            ...building.windowsGroup.children
        ]) {
            child.removeFromParent();
            disposeObject3D(child);
        }

        const tiles = [];
        for (const tileId of building.tiles) {
            const meta = this._tileById.get(tileId);
            if (meta) tiles.push([meta.x, meta.y]);
        }

        const overrideWindowVisuals = building?.windowVisuals ?? null;
        const resolvedWindowVisuals = overrideWindowVisuals ?? this._buildingWindowVisuals;
        const windowVisualsIsOverride = !!overrideWindowVisuals && typeof overrideWindowVisuals === 'object';

        const useLayers = Array.isArray(building.layers) && building.layers.length;
        const parts = useLayers
            ? buildBuildingFabricationVisualParts({
                map: this.map,
                tiles,
                generatorConfig: this.generatorConfig,
                tileSize: this.tileSize,
                occupyRatio: this.occupyRatio,
                layers: building.layers,
                materialVariationSeed: building.materialVariationSeed,
                textureCache: this._wallTextures,
                renderer: this.engine?.renderer ?? null,
                windowVisuals: resolvedWindowVisuals,
                windowVisualsIsOverride,
                facades: building.facades ?? null,
                windowDefinitions: building.windowDefinitions ?? null,
                colors: { line: BUILDING_LINE_COLOR, border: BUILDING_BORDER_COLOR },
                overlays: { wire: true, floorplan: true, border: true, floorDivisions: true },
                walls: {
                    inset: building.wallInset
                }
            })
            : buildBuildingVisualParts({
                map: this.map,
                tiles,
                generatorConfig: this.generatorConfig,
                tileSize: this.tileSize,
                occupyRatio: this.occupyRatio,
                floors: building.floors,
                floorHeight: Number.isFinite(building.floorHeight) ? building.floorHeight : this.floorHeight,
                style: building.style,
                textureCache: this._wallTextures,
                renderer: this.engine?.renderer ?? null,
                windowVisuals: resolvedWindowVisuals,
                windowVisualsIsOverride,
                colors: { line: BUILDING_LINE_COLOR, border: BUILDING_BORDER_COLOR },
                overlays: { wire: true, floorplan: true, border: true, floorDivisions: true },
                roof: {
                    color: building.roofColor
                },
                walls: {
                    inset: building.wallInset
                },
                windows: {
                    enabled: true,
                    style: building.windowStyle,
                    typeId: building.windowTypeId,
                    params: building.windowParams,
                    width: building.windowWidth,
                    gap: building.windowGap,
                    height: building.windowHeight,
                    y: building.windowY,
                    spacer: {
                        enabled: !!building.windowSpacerEnabled,
                        every: building.windowSpacerEvery,
                        width: building.windowSpacerWidth,
                        extrude: !!building.windowSpacerExtrude,
                        extrudeDistance: building.windowSpacerExtrudeDistance
                    },
                    cornerEps: 0.12,
                    offset: 0.05
                },
                street: {
                    enabled: !!building.streetEnabled,
                    floors: building.streetFloors,
                    floorHeight: building.streetFloorHeight,
                    style: building.streetStyle,
                    windows: {
                        width: building.streetWindowWidth,
                        gap: building.streetWindowGap,
                        height: building.streetWindowHeight,
                        y: building.streetWindowY,
                        style: building.streetWindowStyle,
                        typeId: building.streetWindowTypeId,
                        params: building.streetWindowParams,
                        spacer: {
                            enabled: !!building.streetWindowSpacerEnabled,
                            every: building.streetWindowSpacerEvery,
                            width: building.streetWindowSpacerWidth,
                            extrude: !!building.streetWindowSpacerExtrude,
                            extrudeDistance: building.streetWindowSpacerExtrudeDistance
                        }
                    }
                },
                beltCourse: {
                    enabled: !!building.beltCourseEnabled,
                    margin: building.beltCourseMargin,
                    height: building.beltCourseHeight,
                    color: building.beltCourseColor
                },
                topBelt: {
                    enabled: !!building.topBeltEnabled,
                    width: building.topBeltWidth,
                    height: building.topBeltHeight,
                    innerWidth: building.topBeltInnerWidth,
                    color: building.topBeltColor
                }
            });
        if (!parts) return;

        building.baseColorHex = parts.baseColorHex;
        building.generationWarnings = Array.isArray(parts.warnings) ? parts.warnings.slice() : null;
        building.generationFacadeSolverDebug = parts?.facadeSolverDebug && typeof parts.facadeSolverDebug === 'object'
            ? deepClone(parts.facadeSolverDebug)
            : null;
        for (const mesh of parts.solidMeshes) building.solidGroup.add(mesh);
        if (parts.beltCourse) building.featuresGroup.add(parts.beltCourse);
        if (parts.topBelt) building.featuresGroup.add(parts.topBelt);
        if (parts.wire) building.wireGroup.add(parts.wire);
        if (parts.plan) building.planGroup.add(parts.plan);
        if (parts.border) building.borderGroup.add(parts.border);
        if (parts.floorDivisions) building.floorsGroup.add(parts.floorDivisions);
        if (parts.windows) building.windowsGroup.add(parts.windows);

        this._syncBuildingRenderMode(building);
        this._syncBuildingBorder(building);
        this._syncFaceHighlight(building);
        this._applyMaterialVariationDebugToObject(building.group);
    }

    _syncTileVisuals() {
        const roadColor = new THREE.Color(0x0a84ff);
        const occupiedColor = new THREE.Color(0x2ec27e);
        const hoveredColor = new THREE.Color(0xffffff);
        const startColor = new THREE.Color(0xbf5af2);
        const endColor = new THREE.Color(0xff3b30);

        for (const mesh of this._tileMeshes) {
            const tileId = mesh.userData.tileId;
            const meta = this._tileById.get(tileId);
            const isRoad = !!meta && !!this.map && this.map.kind[meta.idx] === TILE.ROAD;
            const occupied = this._buildingsByTile.has(tileId);
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
