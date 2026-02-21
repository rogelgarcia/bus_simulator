// src/graphics/gui/building_fabrication2/BuildingFabrication2Scene.js
// Minimal Building Fabrication 2 3D scene (map + building, no roads).
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { CityMap } from '../../../app/city/CityMap.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { BuildingWallTextureCache } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { createProceduralMeshAsset, PROCEDURAL_MESH } from '../../content3d/catalogs/ProceduralMeshCatalog.js';
import { ToolCameraController } from '../../engine3d/camera/ToolCameraController.js';

const DOUBLE = 2;
const EPS = 1e-6;
const BACKGROUND_COLOR = 0xeaf9ff;
const FACE_HIGHLIGHT_COLOR = 0x64d2ff;
const FACE_HIGHLIGHT_LINEWIDTH = 6;
const FACE_HIGHLIGHT_OPACITY = 0.85;
const FACE_HIGHLIGHT_Y_LIFT = 0.08;
const LAYER_HIGHLIGHT_COLOR = FACE_HIGHLIGHT_COLOR;
const LAYER_HIGHLIGHT_LINEWIDTH = 3;
const LAYER_HIGHLIGHT_OPACITY = 0.28;
const RULER_LINE_COLOR = 0xfff1a6;
const RULER_LINEWIDTH = 3;
const RULER_LINE_OPACITY = 0.92;
const LAYOUT_FACE_OVERLAY_OPACITY = 0.2;
const LAYOUT_FACE_OVERLAY_COLOR = 0x7ee1ff;
const LAYOUT_FACE_LINE_Y_LIFT = 0.012;
const LAYOUT_WIDTH_GUIDE_COLOR = 0xffe08f;
const LAYOUT_WIDTH_GUIDE_LINEWIDTH = 3;
const LAYOUT_WIDTH_GUIDE_OPACITY = 0.9;
const LAYOUT_WIDTH_GUIDE_Y_LIFT = 0.014;
const LAYOUT_VERTEX_RING_COLOR = 0xffdf8e;
const LAYOUT_VERTEX_RING_RADIUS = 0.4;
const LAYOUT_VERTEX_RING_TUBE = 0.06;

function isFaceId(faceId) {
    return faceId === 'A' || faceId === 'B' || faceId === 'C' || faceId === 'D';
}

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
}

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function computeBuildingBaseAndSidewalk({ generatorConfig, floorHeight }) {
    const roadCfg = generatorConfig?.road ?? {};
    const baseRoadY = Number.isFinite(roadCfg.surfaceY) ? roadCfg.surfaceY : 0;
    const curbHeight = Number.isFinite(roadCfg?.curb?.height) ? roadCfg.curb.height : 0;
    const curbExtra = Number.isFinite(roadCfg?.curb?.extraHeight) ? roadCfg.curb.extraHeight : 0;
    const sidewalkLift = Number.isFinite(roadCfg?.sidewalk?.lift) ? roadCfg.sidewalk.lift : 0;
    const sidewalkWidth = Number.isFinite(roadCfg?.sidewalk?.extraWidth) ? roadCfg.sidewalk.extraWidth : 0;
    const hasSidewalk = sidewalkWidth > EPS;

    const groundY = generatorConfig?.ground?.surfaceY ?? baseRoadY;
    const sidewalkSurfaceY = hasSidewalk ? (baseRoadY + curbHeight + curbExtra + sidewalkLift) : null;
    const baseSurfaceY = (hasSidewalk && Number.isFinite(sidewalkSurfaceY)) ? sidewalkSurfaceY : groundY;
    const baseY = (Number(baseSurfaceY) || 0) + 0.01;

    const extraFirstFloor = (hasSidewalk && Number.isFinite(sidewalkSurfaceY) && Number.isFinite(groundY))
        ? Math.max(0, sidewalkSurfaceY - groundY)
        : 0;

    const fh = clamp(floorHeight, 1.0, 12.0);
    const extra = clamp(extraFirstFloor, 0, Math.max(0, fh * 2));

    const planBase = (hasSidewalk && Number.isFinite(sidewalkSurfaceY))
        ? sidewalkSurfaceY
        : (Number.isFinite(baseRoadY) ? baseRoadY : (Number.isFinite(groundY) ? groundY : 0));
    const planY = planBase + 0.07;

    return { baseY, extraFirstFloor: extra, planY };
}

function disposeTextureProps(mat, disposedTextures) {
    if (!mat) return;
    const seen = disposedTextures instanceof Set ? disposedTextures : null;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (!v || !v.isTexture || v.userData?.buildingShared) continue;
        if (seen) {
            if (seen.has(v)) continue;
            seen.add(v);
        }
        v.dispose?.();
    }
}

function disposeObject3D(obj) {
    if (!obj) return;
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposedTextures = new Set();

    obj.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isLineSegments && !o.isLine2 && !o.isLineSegments2) return;

        const geo = o.geometry ?? null;
        if (geo && !disposedGeometries.has(geo)) {
            disposedGeometries.add(geo);
            geo.dispose?.();
        }

        const mat = o.material;
        if (!mat) return;
        if (Array.isArray(mat)) {
            for (const m of mat) {
                if (!m || disposedMaterials.has(m)) continue;
                disposedMaterials.add(m);
                disposeTextureProps(m, disposedTextures);
                m.dispose?.();
            }
        } else if (!disposedMaterials.has(mat)) {
            disposedMaterials.add(mat);
            disposeTextureProps(mat, disposedTextures);
            mat.dispose?.();
        }
    });
}

function getCenteredRectFootprintTiles(gridSize, w, h) {
    const size = clampInt(gridSize, 1, 9999);
    const width = clampInt(w, 1, size);
    const height = clampInt(h, 1, size);

    const startX = Math.floor((size - width) * 0.5);
    const startY = Math.floor((size - height) * 0.5);

    const tiles = [];
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            tiles.push([x, y]);
        }
    }
    return tiles;
}

export class BuildingFabrication2Scene {
    constructor(engine, {
        gridSize = 5,
        tileSize = 24,
        occupyRatio = 1.0
    } = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.gridSize = clampInt(gridSize, 3, 25);
        this.tileSize = Math.max(4, Number(tileSize) || 24);
        this.occupyRatio = Math.max(0.5, Math.min(1.0, Number(occupyRatio) || 1.0));

        this.generatorConfig = createGeneratorConfig({
            render: { treesEnabled: false }
        });
        this.tileMeters = 2;

        this.root = null;
        this.controls = null;
        this.map = null;
        this.world = null;

        this._wallTextures = new BuildingWallTextureCache({ renderer: this.engine?.renderer ?? null });
        this._building = null;

        this._showWireframe = false;
        this._showFloorDivisions = false;
        this._showFloorplan = false;
        this._wireframeOriginalByMaterial = new WeakMap();

        this._focusBox = null;
        this._selectedFaceId = null;
        this._activeFaceLayerId = null;
        this._suppressFaceHighlight = false;
        this._faceHighlightLine = null;
        this._hoveredFloorLayerId = null;
        this._hoverHighlightLine = null;
        this._floorLayerYRangeById = new Map();
        this._lineResolution = new THREE.Vector2(1, 1);

        this._backgroundColor = new THREE.Color(BACKGROUND_COLOR);
        this._prevSceneBackground = null;

        this._showDummy = false;
        this._dummy = null;

        this._rulerRaycaster = new THREE.Raycaster();
        this._rulerRayHits = [];
        this._rulerLine = null;
        this._layoutAdjustEnabled = false;
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
        this._layoutWidthGuideFaceIds = null;
        this._layoutFaceOverlay = null;
        this._layoutFaceLine = null;
        this._layoutWidthGuideLine = null;
        this._layoutVertexRing = null;
        this._layoutRayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._layoutRayPoint = new THREE.Vector3();

        this._facadeCornerStrategyId = null;
        this._facadeCornerDebug = false;
    }

    enter() {
        if (!this.scene) return;
        this._prevSceneBackground = this.scene.background ?? null;
        this.scene.background = this._backgroundColor;

        this.root = new THREE.Group();
        this.root.name = 'building_fabrication2_root';
        this.scene.add(this.root);

        this._buildMap();
        this._buildWorld();
        this._buildLights();
        this._buildCamera();
    }

    exit() {
        this.controls?.dispose?.();
        this.controls = null;

        this._setDummyVisible(false);

        this._clearBuilding();
        this._clearFaceHighlight();
        this._clearRulerLine();
        this._clearLayoutOverlays();

        if (this.world?.group) {
            this.world.group.removeFromParent();
            disposeObject3D(this.world.group);
        }
        this.world = null;
        this.map = null;
        this._focusBox = null;

        this._wallTextures?.dispose?.();
        this._wallTextures = null;

        if (this.root) {
            this.root.removeFromParent();
            disposeObject3D(this.root);
        }
        this.root = null;

        if (this.scene) this.scene.background = this._prevSceneBackground ?? null;
        this._prevSceneBackground = null;
        this._layoutAdjustEnabled = false;
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
    }

    update(dt) {
        this.controls?.update?.(dt);
    }

    setUiRoot(uiRoot) {
        this.controls?.setUiRoot?.(uiRoot);
    }

    setShowWireframe(enabled) {
        const next = !!enabled;
        if (next === this._showWireframe) return;
        this._showWireframe = next;
        this._syncSceneWireframe();
        this._syncBuildingRenderMode();
    }

    setShowFloorDivisions(enabled) {
        this._showFloorDivisions = !!enabled;
        this._syncBuildingRenderMode();
    }

    setShowFloorplan(enabled) {
        this._showFloorplan = !!enabled;
        this._syncBuildingRenderMode();
    }

    setSelectedFaceId(faceId) {
        const next = isFaceId(faceId) ? faceId : null;
        if (next === this._selectedFaceId) return;
        this._selectedFaceId = next;
        this._syncFaceHighlight();
    }

    setActiveFaceLayerId(layerId) {
        const next = typeof layerId === 'string' && layerId ? layerId : null;
        if (next === this._activeFaceLayerId) return;
        this._activeFaceLayerId = next;
        this._syncFaceHighlight();
    }

    setFaceHighlightSuppressed(suppressed) {
        const next = !!suppressed;
        if (next === this._suppressFaceHighlight) return;
        this._suppressFaceHighlight = next;

        if (this._faceHighlightLine) {
            this._faceHighlightLine.visible = !next;
            return;
        }
        if (!next) this._syncFaceHighlight();
    }

    setHoveredFloorLayerId(layerId) {
        const next = typeof layerId === 'string' && layerId ? layerId : null;
        if (next === this._hoveredFloorLayerId) return;
        this._hoveredFloorLayerId = next;
        this._syncHoverHighlight();
    }

    setShowDummy(enabled) {
        const next = !!enabled;
        if (next === this._showDummy) return;
        this._showDummy = next;
        this._syncDummy();
    }

    getLayoutEditPlaneY() {
        if (this._focusBox && Number.isFinite(this._focusBox.min.y)) return Number(this._focusBox.min.y) + 0.02;
        return 0.02;
    }

    raycastHorizontalPlane(pointerNdc, { y = null } = {}) {
        const pointer = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!pointer || !this.camera) return null;

        const planeY = Number.isFinite(y) ? Number(y) : this.getLayoutEditPlaneY();
        this._layoutRayPlane.constant = -planeY;

        this._rulerRaycaster.setFromCamera(pointer, this.camera);
        const hit = this._rulerRaycaster.ray.intersectPlane(this._layoutRayPlane, this._layoutRayPoint);
        if (!hit) return null;
        return hit.clone();
    }

    setLayoutEditState({
        enabled = false,
        loop = null,
        hoverFaceId = null,
        hoverVertexIndex = null,
        widthGuideFaceIds = null
    } = {}) {
        const nextEnabled = !!enabled;
        const nextLoop = Array.isArray(loop) ? loop : null;
        const nextFaceId = isFaceId(hoverFaceId) ? hoverFaceId : null;
        const nextVertexIndex = Number.isInteger(hoverVertexIndex) ? Math.max(0, hoverVertexIndex | 0) : null;
        const nextWidthGuideFaceIds = Array.isArray(widthGuideFaceIds)
            ? widthGuideFaceIds.filter((faceId) => isFaceId(faceId))
            : null;

        this._layoutAdjustEnabled = nextEnabled;
        this._layoutLoop = nextLoop;
        this._layoutHoverFaceId = nextFaceId;
        this._layoutHoverVertexIndex = nextVertexIndex;
        this._layoutWidthGuideFaceIds = nextWidthGuideFaceIds;
        this._syncLayoutEditOverlays();
    }

    raycastSurface(pointerNdc) {
        const pointer = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!pointer || !this.camera) return null;

        const targets = [];
        if (this._building?.group) targets.push(this._building.group);
        if (this.world?.groundTiles) targets.push(this.world.groundTiles);
        if (this.world?.floor) targets.push(this.world.floor);
        if (!targets.length) return null;

        const hits = this._rulerRayHits;
        hits.length = 0;
        this._rulerRaycaster.setFromCamera(pointer, this.camera);
        for (const target of targets) {
            this._rulerRaycaster.intersectObject(target, true, hits);
        }
        if (!hits.length) return null;

        hits.sort((a, b) => a.distance - b.distance);
        const hit = hits[0];
        if (!hit?.point) return null;
        return hit.point.clone();
    }

    setRulerSegment(pointA, pointB) {
        const a = pointA && typeof pointA === 'object' ? pointA : null;
        const b = pointB && typeof pointB === 'object' ? pointB : null;
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)
            || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) {
            this._clearRulerLine();
            return;
        }
        if (!this.root) return;

        if (!this._rulerLine) {
            const geo = new LineSegmentsGeometry();
            geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);

            const mat = new LineMaterial({
                color: RULER_LINE_COLOR,
                linewidth: RULER_LINEWIDTH,
                worldUnits: false,
                transparent: true,
                opacity: RULER_LINE_OPACITY,
                depthTest: false,
                depthWrite: false
            });

            if (this.engine?.renderer) {
                const size = this.engine.renderer.getSize(this._lineResolution);
                mat.resolution.set(size.x, size.y);
            }

            const line = new LineSegments2(geo, mat);
            line.name = 'bf2_ruler_line';
            line.renderOrder = 190;
            line.frustumCulled = false;
            line.raycast = () => {};
            line.userData = line.userData ?? {};
            line.userData.bf2Ruler = true;
            this.root.add(line);
            this._rulerLine = line;
            return;
        }

        const geo = this._rulerLine.geometry;
        if (geo?.setPositions) geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
        this._rulerLine.visible = true;
    }

    getHasBuilding() {
        return !!this._building;
    }

    setFacadeCornerStrategyId(strategyId) {
        this._facadeCornerStrategyId = typeof strategyId === 'string' ? strategyId : null;
    }

    setFacadeCornerDebug(enabled) {
        this._facadeCornerDebug = !!enabled;
    }

    clearBuilding() {
        this._clearBuilding();
    }

    loadBuildingConfig(config, { preserveCamera = true } = {}) {
        if (!config || typeof config !== 'object') return false;
        const rawLayers = Array.isArray(config.layers) ? config.layers : null;
        if (!Array.isArray(rawLayers) || !rawLayers.length) return false;
        if (!this.root || !this.map) return false;

        const baseWallMaterial = normalizeMaterialSpec(config?.baseWallMaterial ?? null);
        const layers = baseWallMaterial
            ? rawLayers.map((layer) => {
                if (layer?.type !== 'floor') return layer;
                const has = !!normalizeMaterialSpec(layer?.material ?? null);
                return has ? layer : { ...layer, material: baseWallMaterial };
            })
            : rawLayers;

        const hadBuilding = this.getHasBuilding();
        const keepCamera = !!preserveCamera && hadBuilding && !!this.camera && !!this.controls;
        const cameraPos = keepCamera ? this.camera.position.clone() : null;
        const cameraTarget = keepCamera ? this.controls.target.clone() : null;

        this._clearBuilding();

        const group = new THREE.Group();
        group.name = 'building_fabrication2_building';

        const solidGroup = new THREE.Group();
        solidGroup.name = 'solid';
        const featuresGroup = new THREE.Group();
        featuresGroup.name = 'features';
        const wireGroup = new THREE.Group();
        wireGroup.name = 'wire';
        const floorsGroup = new THREE.Group();
        floorsGroup.name = 'floors';
        const planGroup = new THREE.Group();
        planGroup.name = 'plan';
        const windowsGroup = new THREE.Group();
        windowsGroup.name = 'windows';

        group.add(solidGroup);
        group.add(featuresGroup);
        group.add(wireGroup);
        group.add(floorsGroup);
        group.add(planGroup);
        group.add(windowsGroup);

        const tiles = getCenteredRectFootprintTiles(this.gridSize, DOUBLE, 1);
        const footprintLoops = Array.isArray(config?.footprintLoops) ? config.footprintLoops : null;
        const wallInset = Number.isFinite(config.wallInset) ? config.wallInset : 0.0;
        const materialVariationSeed = Number.isFinite(config.materialVariationSeed) ? config.materialVariationSeed : null;
        const windowVisuals = config?.windowVisuals && typeof config.windowVisuals === 'object' ? config.windowVisuals : null;
        const windowVisualsIsOverride = !!windowVisuals;

        const parts = buildBuildingFabricationVisualParts({
            map: this.map,
            tiles,
            footprintLoops,
            generatorConfig: this.generatorConfig,
            tileSize: this.tileSize,
            occupyRatio: this.occupyRatio,
            layers,
            materialVariationSeed,
            textureCache: this._wallTextures,
            renderer: this.engine?.renderer ?? null,
            windowVisuals,
            windowVisualsIsOverride,
            facades: config?.facades ?? null,
            facadeCornerStrategyId: this._facadeCornerStrategyId,
            facadeCornerDebug: this._facadeCornerDebug,
            windowDefinitions: config?.windowDefinitions ?? null,
            overlays: { wire: true, floorplan: true, border: false, floorDivisions: true },
            walls: { inset: wallInset }
        });
        if (!parts) {
            disposeObject3D(group);
            return false;
        }

        for (const mesh of parts.solidMeshes ?? []) solidGroup.add(mesh);
        if (parts.beltCourse) featuresGroup.add(parts.beltCourse);
        if (parts.topBelt) featuresGroup.add(parts.topBelt);
        if (parts.wire) wireGroup.add(parts.wire);
        if (parts.floorDivisions) floorsGroup.add(parts.floorDivisions);
        if (parts.plan) planGroup.add(parts.plan);
        if (parts.windows) windowsGroup.add(parts.windows);

        this.root.add(group);
        group.userData = group.userData ?? {};
        group.userData.facadeCornerDebug = parts.facadeCornerDebug ?? null;

        this._building = { group, solidGroup, featuresGroup, wireGroup, floorsGroup, planGroup, windowsGroup };
        this._syncBuildingRenderMode();
        this._syncSceneWireframe();
        this._updateFocusBoxFromObject(group);
        this._syncDummy();

        this._floorLayerYRangeById = this._computeFloorLayerYRangeById(layers);
        this._syncHoverHighlight();
        this._syncFaceHighlight();
        this._syncLayoutEditOverlays();

        if (keepCamera && cameraPos && cameraTarget) {
            this.controls.setLookAt({ position: cameraPos, target: cameraTarget });
        } else {
            this.controls?.frame?.();
        }
        return true;
    }

    resetCamera() {
        if (!this.camera || !this.controls) return false;
        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls.setLookAt({
            position: new THREE.Vector3(0, dist * 0.75, dist * 0.9),
            target: new THREE.Vector3(0, 0, 0)
        });
        this.controls.setHomeFromCurrent();
        return true;
    }

    _syncBuildingRenderMode() {
        const b = this._building;
        if (!b) return;

        const floorplan = this._showFloorplan;
        if (b.planGroup) b.planGroup.visible = floorplan;
        if (b.solidGroup) b.solidGroup.visible = !floorplan;
        if (b.featuresGroup) b.featuresGroup.visible = !floorplan;
        if (b.wireGroup) b.wireGroup.visible = false;
        if (b.floorsGroup) b.floorsGroup.visible = !floorplan && this._showFloorDivisions;
        if (b.windowsGroup) b.windowsGroup.visible = !floorplan;
    }

    _syncSceneWireframe() {
        if (!this.root) return;
        const enabled = this._showWireframe;
        const floor = this.world?.floor ?? null;
        const tiles = this.world?.groundTiles ?? null;

        const setMaterialWireframe = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            if (!('wireframe' in mat)) return;

            if (enabled) {
                if (!this._wireframeOriginalByMaterial.has(mat)) {
                    this._wireframeOriginalByMaterial.set(mat, !!mat.wireframe);
                }
                if (!mat.wireframe) {
                    mat.wireframe = true;
                    mat.needsUpdate = true;
                }
                return;
            }

            if (!this._wireframeOriginalByMaterial.has(mat)) return;
            const prev = this._wireframeOriginalByMaterial.get(mat);
            if (mat.wireframe !== prev) {
                mat.wireframe = prev;
                mat.needsUpdate = true;
            }
        };

        this.root.traverse((obj) => {
            if (!obj?.isMesh && !obj?.isInstancedMesh) return;
            if (obj === floor || obj === tiles) return;

            const mat = obj.material ?? null;
            if (Array.isArray(mat)) {
                for (const m of mat) setMaterialWireframe(m);
                return;
            }
            setMaterialWireframe(mat);
        });

        if (!enabled) this._wireframeOriginalByMaterial = new WeakMap();
    }

    _clearFaceHighlight() {
        if (!this._faceHighlightLine) return;
        this._faceHighlightLine.removeFromParent();
        disposeObject3D(this._faceHighlightLine);
        this._faceHighlightLine = null;
    }

    _clearHoverHighlight() {
        if (!this._hoverHighlightLine) return;
        this._hoverHighlightLine.removeFromParent();
        disposeObject3D(this._hoverHighlightLine);
        this._hoverHighlightLine = null;
    }

    _clearRulerLine() {
        if (!this._rulerLine) return;
        this._rulerLine.removeFromParent();
        disposeObject3D(this._rulerLine);
        this._rulerLine = null;
    }

    _clearLayoutOverlays() {
        if (this._layoutFaceOverlay) {
            this._layoutFaceOverlay.removeFromParent();
            disposeObject3D(this._layoutFaceOverlay);
            this._layoutFaceOverlay = null;
        }
        if (this._layoutFaceLine) {
            this._layoutFaceLine.removeFromParent();
            disposeObject3D(this._layoutFaceLine);
            this._layoutFaceLine = null;
        }
        if (this._layoutWidthGuideLine) {
            this._layoutWidthGuideLine.removeFromParent();
            disposeObject3D(this._layoutWidthGuideLine);
            this._layoutWidthGuideLine = null;
        }
        if (this._layoutVertexRing) {
            this._layoutVertexRing.removeFromParent();
            disposeObject3D(this._layoutVertexRing);
            this._layoutVertexRing = null;
        }
    }

    _getLayoutLoopFaceVertices(loop, faceId) {
        const points = Array.isArray(loop) ? loop : [];
        if (points.length < 4) return null;
        switch (faceId) {
            case 'A': return { a: points[0], b: points[1] };
            case 'B': return { a: points[1], b: points[2] };
            case 'C': return { a: points[2], b: points[3] };
            case 'D': return { a: points[3], b: points[0] };
            default: return null;
        }
    }

    _syncLayoutEditOverlays() {
        this._clearLayoutOverlays();

        if (!this.root || !this._layoutAdjustEnabled || !this._building) return;
        const loop = Array.isArray(this._layoutLoop) ? this._layoutLoop : null;
        if (!loop || loop.length < 4) return;

        const baseY = this.getLayoutEditPlaneY();
        const topY = this._focusBox && Number.isFinite(this._focusBox.max.y)
            ? Number(this._focusBox.max.y)
            : (baseY + 1.0);
        const yHeight = Math.max(0.5, topY - baseY);
        const widthGuideFaceIds = Array.isArray(this._layoutWidthGuideFaceIds) ? this._layoutWidthGuideFaceIds : [];
        if (widthGuideFaceIds.length) {
            const seen = new Set();
            const positions = [];
            for (const faceId of widthGuideFaceIds) {
                if (!isFaceId(faceId) || seen.has(faceId)) continue;
                seen.add(faceId);
                const edge = this._getLayoutLoopFaceVertices(loop, faceId);
                const a = edge?.a ?? null;
                const b = edge?.b ?? null;
                if (!a || !b) continue;
                positions.push(
                    Number(a.x) || 0, baseY + LAYOUT_WIDTH_GUIDE_Y_LIFT, Number(a.z) || 0,
                    Number(b.x) || 0, baseY + LAYOUT_WIDTH_GUIDE_Y_LIFT, Number(b.z) || 0
                );
            }
            if (positions.length >= 6) {
                const lineGeo = new LineSegmentsGeometry();
                lineGeo.setPositions(positions);
                const lineMat = new LineMaterial({
                    color: LAYOUT_WIDTH_GUIDE_COLOR,
                    linewidth: LAYOUT_WIDTH_GUIDE_LINEWIDTH,
                    worldUnits: false,
                    transparent: true,
                    opacity: LAYOUT_WIDTH_GUIDE_OPACITY,
                    depthTest: false,
                    depthWrite: false
                });
                if (this.engine?.renderer) {
                    const size = this.engine.renderer.getSize(this._lineResolution);
                    lineMat.resolution.set(size.x, size.y);
                }
                const line = new LineSegments2(lineGeo, lineMat);
                line.name = 'bf2_layout_width_guides';
                line.renderOrder = 209;
                line.frustumCulled = false;
                this.root.add(line);
                this._layoutWidthGuideLine = line;
            }
        }

        const faceId = this._layoutHoverFaceId;
        if (faceId) {
            const edge = this._getLayoutLoopFaceVertices(loop, faceId);
            const a = edge?.a ?? null;
            const b = edge?.b ?? null;
            if (a && b) {
                const dx = (Number(b.x) || 0) - (Number(a.x) || 0);
                const dz = (Number(b.z) || 0) - (Number(a.z) || 0);
                const len = Math.hypot(dx, dz);
                if (len > EPS) {
                    const tx = dx / len;
                    const tz = dz / len;
                    const nxRaw = { x: tz, z: -tx };
                    const cx = loop.reduce((sum, p) => sum + (Number(p?.x) || 0), 0) / loop.length;
                    const cz = loop.reduce((sum, p) => sum + (Number(p?.z) || 0), 0) / loop.length;
                    const mid = { x: (Number(a.x) + Number(b.x)) * 0.5, z: (Number(a.z) + Number(b.z)) * 0.5 };
                    const toMid = { x: mid.x - cx, z: mid.z - cz };
                    const dot = nxRaw.x * toMid.x + nxRaw.z * toMid.z;
                    const nx = dot >= 0 ? nxRaw.x : -nxRaw.x;
                    const nz = dot >= 0 ? nxRaw.z : -nxRaw.z;

                    const faceGeo = new THREE.PlaneGeometry(len, yHeight, 1, 1);
                    const faceMat = new THREE.MeshBasicMaterial({
                        color: LAYOUT_FACE_OVERLAY_COLOR,
                        transparent: true,
                        opacity: LAYOUT_FACE_OVERLAY_OPACITY,
                        depthTest: false,
                        depthWrite: false,
                        side: THREE.DoubleSide
                    });
                    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
                    faceMesh.name = `bf2_layout_face_overlay_${faceId}`;
                    faceMesh.renderOrder = 210;
                    faceMesh.position.set(mid.x, baseY + yHeight * 0.5, mid.z);
                    const basisX = new THREE.Vector3(tx, 0, tz);
                    const basisY = new THREE.Vector3(0, 1, 0);
                    const basisZ = new THREE.Vector3(nx, 0, nz);
                    const basis = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
                    faceMesh.quaternion.setFromRotationMatrix(basis);
                    this.root.add(faceMesh);

                    const lineGeo = new LineSegmentsGeometry();
                    lineGeo.setPositions([a.x, baseY + LAYOUT_FACE_LINE_Y_LIFT, a.z, b.x, baseY + LAYOUT_FACE_LINE_Y_LIFT, b.z]);
                    const lineMat = new LineMaterial({
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
                        lineMat.resolution.set(size.x, size.y);
                    }
                    const line = new LineSegments2(lineGeo, lineMat);
                    line.name = `bf2_layout_face_line_${faceId}`;
                    line.renderOrder = 211;
                    line.frustumCulled = false;
                    this.root.add(line);

                    this._layoutFaceOverlay = faceMesh;
                    this._layoutFaceLine = line;
                }
            }
        }

        if (Number.isInteger(this._layoutHoverVertexIndex) && this._layoutHoverVertexIndex >= 0 && this._layoutHoverVertexIndex < loop.length) {
            const p = loop[this._layoutHoverVertexIndex];
            const x = Number(p?.x);
            const z = Number(p?.z);
            if (Number.isFinite(x) && Number.isFinite(z)) {
                const geo = new THREE.TorusGeometry(LAYOUT_VERTEX_RING_RADIUS, LAYOUT_VERTEX_RING_TUBE, 12, 32);
                const mat = new THREE.MeshBasicMaterial({
                    color: LAYOUT_VERTEX_RING_COLOR,
                    transparent: true,
                    opacity: 0.95,
                    depthTest: false,
                    depthWrite: false
                });
                const ring = new THREE.Mesh(geo, mat);
                ring.name = `bf2_layout_vertex_ring_${this._layoutHoverVertexIndex}`;
                ring.rotation.x = Math.PI * 0.5;
                ring.position.set(x, baseY + 0.08, z);
                ring.renderOrder = 212;
                ring.frustumCulled = false;
                this.root.add(ring);
                this._layoutVertexRing = ring;
            }
        }
    }

    _syncFaceHighlight() {
        this._clearFaceHighlight();

        if (this._layoutAdjustEnabled) return;
        if (!this.root || !this._building || !this._selectedFaceId || !this._focusBox) return;

        const faceId = this._selectedFaceId;
        const box = this._focusBox;
        const minX = box.min.x;
        const maxX = box.max.x;
        const minZ = box.min.z;
        const maxZ = box.max.z;
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;

        const baseLayerId = this._activeFaceLayerId ?? this._hoveredFloorLayerId;
        const range = baseLayerId ? (this._floorLayerYRangeById.get(baseLayerId) ?? null) : null;
        const baseY = Number.isFinite(range?.startY) ? Number(range.startY) : (Number.isFinite(box.min.y) ? box.min.y : 0);
        const y = baseY + FACE_HIGHLIGHT_Y_LIFT;

        let positions = null;
        switch (faceId) {
            case 'A':
                positions = [minX, y, maxZ, maxX, y, maxZ];
                break;
            case 'C':
                positions = [minX, y, minZ, maxX, y, minZ];
                break;
            case 'B':
                positions = [maxX, y, minZ, maxX, y, maxZ];
                break;
            case 'D':
                positions = [minX, y, minZ, minX, y, maxZ];
                break;
            default:
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
        line.name = `bf2_face_${faceId}`;
        line.renderOrder = 180;
        line.frustumCulled = false;
        line.visible = !this._suppressFaceHighlight;
        this.root.add(line);
        this._faceHighlightLine = line;
    }

    _syncHoverHighlight() {
        this._clearHoverHighlight();

        if (!this.root || !this._building || !this._focusBox) return;
        const layerId = this._hoveredFloorLayerId;
        if (!layerId) return;
        const range = this._floorLayerYRangeById.get(layerId) ?? null;
        if (!range) return;

        const box = this._focusBox;
        const minX = box.min.x;
        const maxX = box.max.x;
        const minZ = box.min.z;
        const maxZ = box.max.z;
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;

        const y0 = Number(range.startY) + 0.002;
        const y1 = Number(range.endY) + 0.002;
        if (!(y1 > y0 + EPS)) return;

        const positions = [
            // Bottom
            minX, y0, minZ, maxX, y0, minZ,
            maxX, y0, minZ, maxX, y0, maxZ,
            maxX, y0, maxZ, minX, y0, maxZ,
            minX, y0, maxZ, minX, y0, minZ,
            // Top
            minX, y1, minZ, maxX, y1, minZ,
            maxX, y1, minZ, maxX, y1, maxZ,
            maxX, y1, maxZ, minX, y1, maxZ,
            minX, y1, maxZ, minX, y1, minZ,
            // Vertical edges
            minX, y0, minZ, minX, y1, minZ,
            maxX, y0, minZ, maxX, y1, minZ,
            maxX, y0, maxZ, maxX, y1, maxZ,
            minX, y0, maxZ, minX, y1, maxZ
        ];

        const geo = new LineSegmentsGeometry();
        geo.setPositions(positions);

        const mat = new LineMaterial({
            color: LAYER_HIGHLIGHT_COLOR,
            linewidth: LAYER_HIGHLIGHT_LINEWIDTH,
            worldUnits: false,
            transparent: true,
            opacity: LAYER_HIGHLIGHT_OPACITY,
            depthTest: false,
            depthWrite: false
        });

        if (this.engine?.renderer) {
            const size = this.engine.renderer.getSize(this._lineResolution);
            mat.resolution.set(size.x, size.y);
        }

        const line = new LineSegments2(geo, mat);
        line.name = `bf2_layer_${layerId}`;
        line.renderOrder = 170;
        line.frustumCulled = false;
        this.root.add(line);
        this._hoverHighlightLine = line;
    }

    _computeFloorLayerYRangeById(layers) {
        const list = Array.isArray(layers) ? layers : [];
        const floorLayers = list.filter((l) => l?.type === 'floor');
        const firstFloor = floorLayers[0] ?? null;
        const firstFloorHeight = clamp(firstFloor?.floorHeight ?? 3.2, 1.0, 12.0);
        const { baseY, extraFirstFloor } = computeBuildingBaseAndSidewalk({
            generatorConfig: this.generatorConfig,
            floorHeight: firstFloorHeight
        });

        const map = new Map();
        let yCursor = baseY;
        let firstFloorPendingExtra = extraFirstFloor;

        for (const layer of floorLayers) {
            const id = typeof layer?.id === 'string' ? layer.id : '';
            if (!id) continue;

            const startY = yCursor;
            const floors = clampInt(layer?.floors ?? 0, 0, 99);
            const floorHeight = clamp(layer?.floorHeight ?? firstFloorHeight, 1.0, 12.0);
            const beltEnabled = !!layer?.belt?.enabled;
            const beltHeight = beltEnabled ? clamp(layer?.belt?.height ?? 0.12, 0.02, 1.2) : 0.0;

            for (let floor = 0; floor < floors; floor++) {
                const segHeight = floorHeight + (floor === 0 ? firstFloorPendingExtra : 0);
                if (floor === 0) firstFloorPendingExtra = 0;
                yCursor += Math.max(0, segHeight);
                if (beltEnabled && beltHeight > EPS) yCursor += beltHeight;
            }

            const endY = yCursor;
            map.set(id, { startY, endY });
        }

        return map;
    }

    _updateFocusBoxFromObject(obj) {
        if (!obj) {
            this._focusBox = null;
            return;
        }
        const box = new THREE.Box3().setFromObject(obj);
        if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
            this._focusBox = null;
            return;
        }
        this._focusBox = box;
    }

    _getCameraFocusTarget() {
        if (this._focusBox) return { box: this._focusBox };
        const span = this.tileSize * this.gridSize;
        return {
            center: { x: 0, y: 0, z: 0 },
            radius: span * 0.75
        };
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
    }

    _buildWorld() {
        if (!this.map || !this.root) return;
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

    _buildLights() {
        if (!this.root) return;
        const hemi = new THREE.HemisphereLight(0xe9f2ff, 0x1c1c1e, 0.65);
        hemi.name = 'bf2_hemi';

        const sun = new THREE.DirectionalLight(0xffffff, 1.35);
        sun.name = 'bf2_sun';
        sun.position.set(60, 70, 45);
        sun.castShadow = true;
        sun.shadow.bias = -0.0001;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 240;
        sun.shadow.camera.left = -120;
        sun.shadow.camera.right = 120;
        sun.shadow.camera.top = 120;
        sun.shadow.camera.bottom = -120;

        this.root.add(hemi);
        this.root.add(sun);
        this.root.add(sun.target);
    }

    _buildCamera() {
        if (!this.camera) return;
        const span = this.tileSize * this.gridSize;
        const dist = span * 1.2;
        this.controls = new ToolCameraController(this.camera, this.canvas, {
            enableDamping: true,
            dampingFactor: 0.08,
            minPolarAngle: 0.12,
            maxPolarAngle: Math.PI - 0.12,
            minDistance: Math.max(16, dist * 0.35),
            maxDistance: dist * 2.2,
            orbitMouseButtons: [0, 2],
            panMouseButtons: [1],
            getFocusTarget: () => this._getCameraFocusTarget()
        });
        this.resetCamera();
    }

    _clearBuilding() {
        if (!this._building) {
            this._clearLayoutOverlays();
            this._layoutLoop = null;
            this._layoutHoverFaceId = null;
            this._layoutHoverVertexIndex = null;
            this._layoutWidthGuideFaceIds = null;
            return;
        }
        this._building.group?.removeFromParent?.();
        disposeObject3D(this._building.group);
        this._building = null;
        this._focusBox = null;
        this._floorLayerYRangeById.clear();
        this._hoveredFloorLayerId = null;
        this._activeFaceLayerId = null;
        this._clearHoverHighlight();
        this._clearLayoutOverlays();
        this._layoutLoop = null;
        this._layoutHoverFaceId = null;
        this._layoutHoverVertexIndex = null;
        this._layoutWidthGuideFaceIds = null;
        this._syncFaceHighlight();
        this._syncDummy();
    }

    _setDummyVisible(visible) {
        const root = this.root;
        const dummy = this._dummy;
        if (!root || !dummy) return;
        dummy.visible = !!visible;
    }

    _syncDummy() {
        if (!this._showDummy || !this.root || !this._focusBox) {
            if (this._dummy) {
                this._dummy.removeFromParent?.();
                disposeObject3D(this._dummy);
                this._dummy = null;
            }
            return;
        }

        if (!this._dummy) {
            const asset = createProceduralMeshAsset(PROCEDURAL_MESH.BALL_V1);
            const mesh = asset?.mesh ?? null;
            if (!mesh) return;
            mesh.name = 'bf2_dummy';
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData = mesh.userData ?? {};
            mesh.userData.bf2Dummy = true;
            mesh.raycast = () => {};
            this._dummy = mesh;
            this.root.add(mesh);
        }

        const box = this._focusBox;
        const padding = 1.25;
        const x = box.min.x - padding;
        const y = box.min.y;
        const z = box.max.z + padding;
        this._dummy.position.set(x, y, z);
        this._dummy.visible = true;
    }
}
