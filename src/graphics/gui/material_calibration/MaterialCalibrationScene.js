// src/graphics/gui/material_calibration/MaterialCalibrationScene.js
// Controlled scene for side-by-side PBR material calibration.
import * as THREE from 'three';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getPbrMaterialTileMeters } from '../../content3d/catalogs/PbrMaterialCatalog.js';
import { PbrTextureLoaderService } from '../../content3d/materials/PbrTexturePipeline.js';
import { getResolvedCalibrationPresetLightingSettings, getResolvedDefaultLightingSettings, LIGHTING_RESOLUTION_MODES } from '../../lighting/LightingSettings.js';
import { getMaterialCalibrationIlluminationPresetById, isMaterialCalibrationLightingSnapshotComplete } from './MaterialCalibrationIlluminationPresets.js';

const EPS = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);

const SLOT_COUNT = 3;
const SLOT_X_SPACING = 3.9;
const SLOT_LAYOUT_MODES = Object.freeze({
    FULL: 'full',
    PANEL: 'panel',
    SPHERE: 'sphere'
});

const PLATE_SIZE = 2.7;
const PLATE_THICKNESS = 0.12;

const PANEL_WIDTH = 2.4;
const PANEL_HEIGHT = 2.2;

const SPHERE_RADIUS = 0.65;
const CUBE_SIZE = 0.92;

const BACKGROUND_FALLBACK = 0x858585;

const RULER_LINE_COLOR = 0xfff1a6;
const RULER_LINEWIDTH = 3;
const RULER_LINE_OPACITY = 0.92;
const SLOT_EMPTY_MATERIAL_STYLE = Object.freeze({
    roughness: 1.0,
    metalness: 0.0,
    aoMapIntensity: 1.0,
    normalStrength: 1.0,
    color: Object.freeze({ r: 0.75, g: 0.75, b: 0.75 })
});
const SLOT_PLATE_STYLE = Object.freeze({
    active: Object.freeze({ colorHex: 0x2a3b46, emissiveHex: 0x0a141c, emissiveIntensity: 0.25 }),
    inactive: Object.freeze({ colorHex: 0x1f242c, emissiveHex: 0x000000, emissiveIntensity: 0.0 })
});
const EMPTY_OVERRIDES = Object.freeze({});
const CALIB_SHADER_CACHE_KEY_PREFIX = 'material_calibration_shader_v2';
const CALIB_SHADER_TOKENS = Object.freeze({
    common: '#include <common>',
    mapFragment: '#include <map_fragment>',
    colorFragment: '#include <color_fragment>',
    roughnessFragment: '#include <roughnessmap_fragment>'
});
const CALIB_SHADER_COMMON_APPEND = `uniform vec2 uBusSimRoughnessRange;
uniform vec2 uBusSimRoughnessInputNorm;
uniform float uBusSimRoughnessGamma;
uniform float uBusSimRoughnessRemapEnabled;
uniform float uBusSimRoughnessInvertInput;
uniform float uBusSimAlbedoSaturationAdjust;
vec3 busSimSaturateColor(vec3 c, float amount) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float t = clamp(1.0 + amount, 0.0, 2.0);
    return mix(vec3(l), c, t);
}`;
const CALIB_SHADER_SATURATION_APPEND = 'diffuseColor.rgb = busSimSaturateColor(diffuseColor.rgb, uBusSimAlbedoSaturationAdjust);';
const CALIB_SHADER_ROUGHNESS_REMAP_APPEND = `if (uBusSimRoughnessRemapEnabled > 0.5) {
    float busSimInput = roughnessFactor;
    if (uBusSimRoughnessInvertInput > 0.5) busSimInput = 1.0 - busSimInput;
    float busSimNormSpan = max(1e-5, uBusSimRoughnessInputNorm.y - uBusSimRoughnessInputNorm.x);
    float busSimT = clamp((busSimInput - uBusSimRoughnessInputNorm.x) / busSimNormSpan, 0.0, 1.0);
    busSimT = pow(busSimT, max(0.001, uBusSimRoughnessGamma));
    float busSimMinR = clamp(uBusSimRoughnessRange.x, 0.0, 1.0);
    float busSimMaxR = clamp(uBusSimRoughnessRange.y, busSimMinR, 1.0);
    roughnessFactor = mix(busSimMinR, busSimMaxR, busSimT);
}`;
const DEFAULT_SCENE_ILLUMINATION = Object.freeze({
    backgroundColorHex: BACKGROUND_FALLBACK,
    hemi: Object.freeze({ intensity: 0.95 }),
    sun: Object.freeze({
        enabled: true,
        intensity: 1.0,
        colorHex: 0xffffff,
        position: Object.freeze({ x: 4, y: 7, z: 4 })
    })
});

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function ensureUv2(geo) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    if (g.attributes.uv2) return;
    g.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
}

function scaleUv(geo, scaleU, scaleV) {
    const g = geo?.isBufferGeometry ? geo : null;
    const uv = g?.attributes?.uv ?? null;
    if (!uv || !uv.isBufferAttribute) return;
    const uMul = Number(scaleU);
    const vMul = Number(scaleV);
    if (!Number.isFinite(uMul) || !Number.isFinite(vMul)) return;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * uMul, uv.getY(i) * vMul);
    }
    uv.needsUpdate = true;
}

function disposeObject3D(obj) {
    if (!obj) return;
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();

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
                m.dispose?.();
            }
        } else if (!disposedMaterials.has(mat)) {
            disposedMaterials.add(mat);
            mat.dispose?.();
        }
    });
}

function isValidVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function sanitizeSlotIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const idx = Math.round(n);
    if (idx < 0 || idx >= SLOT_COUNT) return null;
    return idx;
}

function sanitizeOptionalSlotIndex(value) {
    if (value === null || value === undefined || value === '') return null;
    return sanitizeSlotIndex(value);
}

function toFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeRoughnessRemap(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return null;

    const min = Number(src.min);
    const maxRaw = Number(src.max);
    const gamma = Number(src.gamma);
    if (!(Number.isFinite(min) && Number.isFinite(maxRaw) && Number.isFinite(gamma))) return null;

    const lowPercentile = Number(src.lowPercentile);
    const highPercentile = Number(src.highPercentile);
    const out = {
        min: clamp(min, 0, 1),
        max: clamp(Math.max(min, maxRaw), 0, 1),
        gamma: clamp(gamma, 0.1, 4),
        invertInput: src.invertInput === true,
        lowPercentile: 0,
        highPercentile: 100
    };

    if (Number.isFinite(lowPercentile) && Number.isFinite(highPercentile)) {
        const lo = clamp(lowPercentile, 0, 100);
        const hi = clamp(highPercentile, 0, 100);
        if (hi > lo) {
            out.lowPercentile = lo;
            out.highPercentile = hi;
        }
    }
    return Object.freeze(out);
}

function normalizeOverrides(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return EMPTY_OVERRIDES;

    const out = {};
    if (Number.isFinite(Number(src.tileMeters))) out.tileMeters = Math.max(EPS, Number(src.tileMeters));
    if (Number.isFinite(Number(src.normalStrength))) out.normalStrength = clamp(src.normalStrength, 0, 8);
    if (Number.isFinite(Number(src.roughness))) out.roughness = clamp(src.roughness, 0, 1);
    if (Number.isFinite(Number(src.metalness))) out.metalness = clamp(src.metalness, 0, 1);
    if (Number.isFinite(Number(src.aoIntensity))) out.aoIntensity = clamp(src.aoIntensity, 0, 2);
    if (Number.isFinite(Number(src.albedoBrightness))) out.albedoBrightness = clamp(src.albedoBrightness, 0, 4);
    if (Number.isFinite(Number(src.albedoTintStrength))) out.albedoTintStrength = clamp(src.albedoTintStrength, 0, 1);
    if (Number.isFinite(Number(src.albedoHueDegrees))) out.albedoHueDegrees = clamp(src.albedoHueDegrees, -180, 180);
    if (Number.isFinite(Number(src.albedoSaturation))) out.albedoSaturation = clamp(src.albedoSaturation, -1, 1);
    const roughnessRemap = normalizeRoughnessRemap(src.roughnessRemap);
    if (roughnessRemap) out.roughnessRemap = roughnessRemap;
    return Object.freeze(out);
}

function computeTintColor({
    albedoBrightness = 1.0,
    albedoTintStrength = 0.0,
    albedoHueDegrees = 0.0,
    albedoSaturation = 0.0
} = {}) {
    const bright = clamp(albedoBrightness, 0, 4);
    const tintStrength = clamp(albedoTintStrength, 0, 1);
    const hueDeg = clamp(albedoHueDegrees, -180, 180);
    const satAdj = clamp(albedoSaturation, -1, 1);

    let hue01 = (hueDeg / 360.0) % 1.0;
    if (hue01 < 0) hue01 += 1.0;

    const tint = new THREE.Color().setHSL(hue01, 1.0, 0.5);
    const base = new THREE.Color(1, 1, 1);
    base.lerp(tint, tintStrength);

    if (Math.abs(satAdj) > 1e-6) {
        const hsl = {};
        base.getHSL(hsl);
        const nextSat = clamp(hsl.s + satAdj, 0, 1);
        base.setHSL(hsl.h, nextSat, hsl.l);
    }

    base.multiplyScalar(bright);
    return base;
}

export class MaterialCalibrationScene {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.canvas = engine.canvas;

        this.root = null;
        this.controls = null;
        this._uiRoot = null;

        this.hemi = null;
        this.sun = null;

        this._prevSceneBackground = null;
        this._prevRendererClear = null;
        this._backgroundColor = new THREE.Color(BACKGROUND_FALLBACK);

        this._texLoader = new THREE.TextureLoader();
        this._pbrLoader = new PbrTextureLoaderService({
            renderer: this.engine?.renderer ?? null,
            textureLoader: this._texLoader
        });
        this._slotMaterialIds = Array(SLOT_COUNT).fill(null);
        this._slotOverrides = Array(SLOT_COUNT).fill(null);
        this._slotMaterials = Array(SLOT_COUNT).fill(null);
        this._slotGroups = Array(SLOT_COUNT).fill(null);
        this._slotBasePositions = Array(SLOT_COUNT).fill(null);
        this._slotPlates = Array(SLOT_COUNT).fill(null);
        this._slotFocusSphere = Array(SLOT_COUNT).fill(null);

        this._materialTextures = new Map();
        this._layoutMode = 'full';
        this._tilingMultiplier = 1.0;
        this._activeSlotIndex = 0;
        this._plateVisible = true;
        this._isolatedSlotIndex = null;
        this._centeredCaptureSlotIndex = null;

        this._pickRaycaster = new THREE.Raycaster();
        this._pickHits = [];

        this._rulerRaycaster = new THREE.Raycaster();
        this._rulerRayHits = [];
        this._rulerLine = null;
    }

    enter() {
        if (this.root) return;

        this._prevSceneBackground = this.scene.background ?? null;
        this.scene.background = this._backgroundColor;

        const renderer = this.engine?.renderer ?? null;
        if (renderer && !this._prevRendererClear) {
            const prevColor = new THREE.Color();
            renderer.getClearColor(prevColor);
            this._prevRendererClear = { color: prevColor, alpha: renderer.getClearAlpha?.() ?? 0 };
        }
        renderer?.setClearColor?.(this._backgroundColor, 1);

        this.root = new THREE.Group();
        this.root.name = 'material_calibration_root';
        this.scene.add(this.root);

        this._buildLights();
        this._buildSlots();
        this._buildCamera();
        this._syncActiveSlotHighlight();
    }

    exit() {
        this.controls?.dispose?.();
        this.controls = null;
        this._uiRoot = null;

        this._clearRulerLine();

        for (const set of this._materialTextures.values()) {
            for (const tex of Object.values(set?.textures ?? {})) tex?.dispose?.();
        }
        this._materialTextures.clear();
        this._pbrLoader?.dispose?.();

        if (this.root) {
            this.root.removeFromParent();
            disposeObject3D(this.root);
        }
        this.root = null;

        this.hemi = null;
        this.sun = null;

        this._slotMaterialIds = Array(SLOT_COUNT).fill(null);
        this._slotOverrides = Array(SLOT_COUNT).fill(null);
        this._slotMaterials = Array(SLOT_COUNT).fill(null);
        this._slotGroups = Array(SLOT_COUNT).fill(null);
        this._slotBasePositions = Array(SLOT_COUNT).fill(null);
        this._slotPlates = Array(SLOT_COUNT).fill(null);
        this._slotFocusSphere = Array(SLOT_COUNT).fill(null);
        this._plateVisible = true;
        this._isolatedSlotIndex = null;
        this._centeredCaptureSlotIndex = null;

        this.scene.background = this._prevSceneBackground ?? null;
        this._prevSceneBackground = null;

        const r = this.engine?.renderer ?? null;
        const clear = this._prevRendererClear ?? null;
        if (r && clear?.color) r.setClearColor(clear.color, clear.alpha ?? 0);
        this._prevRendererClear = null;
    }

    update(dt) {
        this.controls?.update?.(dt);
    }

    setUiRoot(uiRoot) {
        this._uiRoot = uiRoot ?? null;
        this.controls?.setUiRoot?.(this._uiRoot);
    }

    setLayoutMode(layoutMode) {
        const id = typeof layoutMode === 'string' ? layoutMode.trim() : '';
        const next = id === SLOT_LAYOUT_MODES.PANEL || id === SLOT_LAYOUT_MODES.SPHERE || id === SLOT_LAYOUT_MODES.FULL
            ? id
            : SLOT_LAYOUT_MODES.FULL;
        if (next === this._layoutMode) return;
        this._layoutMode = next;
        this._refreshSlotVisibilityAndBounds();
    }

    setTilingMultiplier(multiplier) {
        const m = Number(multiplier);
        const next = Number.isFinite(m) ? clamp(m, 0.01, 25) : 1.0;
        if (Math.abs(next - this._tilingMultiplier) <= 1e-9) return;
        this._tilingMultiplier = next;
        this._syncAllSlotTilings();
    }

    setActiveSlotIndex(slotIndex) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        if (idx === this._activeSlotIndex) return;
        this._activeSlotIndex = idx;
        this._syncActiveSlotHighlight();
    }

    setPlateVisible(visible) {
        const next = visible !== false;
        if (next === this._plateVisible) return;
        this._plateVisible = next;
        this._refreshSlotVisibilityAndBounds();
    }

    isPlateVisible() {
        return this._plateVisible;
    }

    setIsolatedSlotIndex(slotIndex = null) {
        const idx = sanitizeOptionalSlotIndex(slotIndex);
        if (slotIndex !== null && idx === null) return;
        if (idx === this._isolatedSlotIndex) return;
        this._isolatedSlotIndex = idx;
        this._refreshSlotVisibilityAndBounds();
    }

    getIsolatedSlotIndex() {
        return this._isolatedSlotIndex;
    }

    setCenteredCaptureSlot(slotIndex = null) {
        const idx = sanitizeOptionalSlotIndex(slotIndex);
        if (slotIndex !== null && idx === null) return;
        if (idx === this._centeredCaptureSlotIndex) return;
        this._centeredCaptureSlotIndex = idx;

        this._forEachSlot((i) => this._setSlotGroupPositionFromBase(i, { centerX: idx !== null && i === idx }));
        this._recomputeFocusSpheres();
    }

    getCenteredCaptureSlot() {
        return this._centeredCaptureSlotIndex;
    }

    getActiveSlotIndex() {
        return this._activeSlotIndex;
    }

    getSlotMaterialId(slotIndex) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return null;
        return this._slotMaterialIds[idx] ?? null;
    }

    getSlotIndexForMaterialId(materialId) {
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return null;
        const idx = this._slotMaterialIds.findIndex((v) => v === id);
        return idx >= 0 ? idx : null;
    }

    getSlotMaterialIds() {
        return this._slotMaterialIds.slice();
    }

    _forEachSlot(callback) {
        if (typeof callback !== 'function') return;
        for (let i = 0; i < SLOT_COUNT; i++) callback(i);
    }

    _forEachSlotGroup(callback) {
        if (typeof callback !== 'function') return;
        this._forEachSlot((slotIndex) => {
            const group = this._slotGroups[slotIndex] ?? null;
            if (!group) return;
            callback(slotIndex, group);
        });
    }

    _getSlotBasePosition(slotIndex) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return { x: 0, y: 0, z: 0 };
        const base = this._slotBasePositions[idx] ?? null;
        return {
            x: toFinite(base?.x, 0),
            y: toFinite(base?.y, 0),
            z: toFinite(base?.z, 0)
        };
    }

    _setSlotGroupPositionFromBase(slotIndex, { centerX = false } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        const group = this._slotGroups[idx] ?? null;
        if (!group) return;

        const base = this._getSlotBasePosition(idx);
        group.position.set(centerX ? 0 : base.x, base.y, base.z);
    }

    _refreshSlotVisibilityAndBounds() {
        this._applyLayoutMode();
        this._recomputeFocusSpheres();
    }

    _isSlotObjectVisibleForLayout(objectName) {
        if (objectName === 'plate') return this._plateVisible;
        if (this._layoutMode === SLOT_LAYOUT_MODES.FULL) return true;
        if (this._layoutMode === SLOT_LAYOUT_MODES.PANEL) return objectName === 'panel';
        if (this._layoutMode === SLOT_LAYOUT_MODES.SPHERE) return objectName === 'sphere';
        return true;
    }

    _clampControlDistance(distance) {
        const minDist = Number(this.controls?.minDistance);
        const maxDist = Number(this.controls?.maxDistance);
        return clamp(
            distance,
            Number.isFinite(minDist) ? minDist : 0.1,
            Number.isFinite(maxDist) ? maxDist : 1e6
        );
    }

    _getSlotOverrides(slotIndex) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return EMPTY_OVERRIDES;
        return this._slotOverrides[idx] ?? EMPTY_OVERRIDES;
    }

    _resolveSlotFocusOrbit(slotIndex, { distanceScale = null } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return null;
        if (!this.controls) return null;
        const sphere = this._slotFocusSphere[idx] ?? null;
        const center = sphere?.center && isValidVector3(sphere.center) ? sphere.center : null;
        if (!center) return null;

        const orbit = this.controls.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        const theta = Number(orbit?.theta);
        const phi = Number(orbit?.phi);
        if (!Number.isFinite(radius) || !Number.isFinite(theta) || !Number.isFinite(phi)) return null;

        let nextRadius = radius;
        const scale = Number(distanceScale);
        const sphereRadius = Number(sphere?.radius);
        if (Number.isFinite(scale) && scale > 0 && Number.isFinite(sphereRadius) && sphereRadius > 0) {
            nextRadius = this._clampControlDistance(sphereRadius * scale);
        }

        return {
            radius: nextRadius,
            theta,
            phi,
            target: { x: center.x, y: center.y, z: center.z }
        };
    }

    getSlotCapturePose(slotIndex, { distanceScale = null } = {}) {
        const orbit = this._resolveSlotFocusOrbit(slotIndex, { distanceScale });
        if (!orbit) return null;
        const spherical = new THREE.Spherical(orbit.radius, orbit.phi, orbit.theta);
        const position = new THREE.Vector3().setFromSpherical(spherical).add(
            new THREE.Vector3(orbit.target.x, orbit.target.y, orbit.target.z)
        );
        return {
            position,
            target: new THREE.Vector3(orbit.target.x, orbit.target.y, orbit.target.z),
            orbit
        };
    }

    getSlotPanelCapturePose(slotIndex, { framing = 1.0, fit = 'cover' } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return null;
        const group = this._slotGroups[idx] ?? null;
        if (!group) return null;

        const panel = group.getObjectByName?.('panel') ?? null;
        if (!panel?.isMesh) return null;

        const geoParams = panel.geometry?.parameters ?? null;
        let width = Number(geoParams?.width);
        let height = Number(geoParams?.height);
        if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
            const bbox = new THREE.Box3().setFromObject(panel);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            width = Math.max(0.01, Math.abs(size.x));
            height = Math.max(0.01, Math.abs(size.y));
        }

        const worldScale = new THREE.Vector3();
        panel.getWorldScale(worldScale);
        const halfW = Math.max(0.01, Math.abs(width * worldScale.x) * 0.5);
        const halfH = Math.max(0.01, Math.abs(height * worldScale.y) * 0.5);

        const center = new THREE.Vector3();
        panel.getWorldPosition(center);

        const normal = new THREE.Vector3(0, 0, 1);
        const worldQuat = new THREE.Quaternion();
        panel.getWorldQuaternion(worldQuat);
        normal.applyQuaternion(worldQuat).normalize();

        const camera = this.camera ?? null;
        const aspect = Number.isFinite(camera?.aspect) && camera.aspect > EPS ? camera.aspect : 1.0;
        const vFov = THREE.MathUtils.degToRad(clamp(camera?.fov ?? 50, 1, 179));
        const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);

        const safeFraming = clamp(framing, 0.8, 3.0);
        const distV = (halfH * safeFraming) / Math.max(EPS, Math.tan(vFov * 0.5));
        const distH = (halfW * safeFraming) / Math.max(EPS, Math.tan(hFov * 0.5));
        const fitMode = fit === 'contain' ? 'contain' : 'cover';
        const baseDistance = fitMode === 'contain'
            ? Math.max(distV, distH)
            : Math.min(distV, distH);
        const distance = this._clampControlDistance(baseDistance);

        const position = center.clone().addScaledVector(normal, distance);
        return {
            position,
            target: center.clone()
        };
    }

    focusSlot(slotIndex, { keepOrbit = true, immediate = false, distanceScale = null } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return false;
        if (!this.controls) return false;

        if (!keepOrbit) {
            this.controls.frame?.();
            return true;
        }

        const orbit = this._resolveSlotFocusOrbit(idx, { distanceScale });
        if (!orbit) return false;

        this.controls.setOrbit({
            radius: orbit.radius,
            theta: orbit.theta,
            phi: orbit.phi,
            target: orbit.target
        }, { immediate: !!immediate });
        return true;
    }

    pickSlot(pointerNdc) {
        const p = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!p || !this.camera || !this.root) return null;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;

        const hits = this._pickHits;
        hits.length = 0;
        this._pickRaycaster.setFromCamera(p, this.camera);
        this._pickRaycaster.intersectObject(this.root, true, hits);
        if (!hits.length) return null;

        hits.sort((a, b) => a.distance - b.distance);
        for (const hit of hits) {
            const obj = hit?.object ?? null;
            const idx = obj?.userData?.materialCalibrationSlotIndex ?? null;
            const slotIndex = sanitizeSlotIndex(idx);
            if (slotIndex !== null) return slotIndex;
        }
        return null;
    }

    raycastSurface(pointerNdc) {
        const pointer = pointerNdc && typeof pointerNdc === 'object' ? pointerNdc : null;
        if (!pointer || !this.camera || !this.root) return null;
        if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;

        const hits = this._rulerRayHits;
        hits.length = 0;
        this._rulerRaycaster.setFromCamera(pointer, this.camera);
        this._rulerRaycaster.intersectObject(this.root, true, hits);
        if (!hits.length) return null;

        hits.sort((a, b) => a.distance - b.distance);
        const hit = hits[0];
        if (!hit?.point) return null;
        return hit.point.clone();
    }

    setRulerSegment(pointA, pointB) {
        const a = pointA && typeof pointA === 'object' ? pointA : null;
        const b = pointB && typeof pointB === 'object' ? pointB : null;
        if (!isValidVector3(a) || !isValidVector3(b)) {
            this._clearRulerLine();
            return;
        }
        if (!this.root) return;

        if (!this._rulerLine) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute([
                a.x, a.y, a.z,
                b.x, b.y, b.z
            ], 3));

            const mat = new THREE.LineBasicMaterial({
                color: RULER_LINE_COLOR,
                linewidth: RULER_LINEWIDTH,
                transparent: true,
                opacity: RULER_LINE_OPACITY,
                depthTest: false,
                depthWrite: false
            });
            const line = new THREE.Line(geo, mat);
            line.name = 'material_calibration_ruler_line';
            line.renderOrder = 190;
            line.frustumCulled = false;
            line.raycast = () => {};
            line.userData = line.userData ?? {};
            line.userData.materialCalibrationRuler = true;
            this.root.add(line);
            this._rulerLine = line;
            return;
        }

        const geo = this._rulerLine.geometry;
        const pos = geo?.attributes?.position ?? null;
        if (pos?.setXYZ) {
            pos.setXYZ(0, a.x, a.y, a.z);
            pos.setXYZ(1, b.x, b.y, b.z);
            pos.needsUpdate = true;
            geo.computeBoundingSphere?.();
        }
        this._rulerLine.visible = true;
    }

    clearRuler() {
        this._clearRulerLine();
    }

    applyIlluminationPreset(presetId) {
        const requestedId = typeof presetId === 'string' ? presetId.trim() : '';
        const preset = requestedId
            ? getMaterialCalibrationIlluminationPresetById(requestedId, { fallbackToFirst: false })
            : null;
        const snapshot = preset?.lightingSnapshot ?? null;

        const missingPreset = !!requestedId && !preset;
        const incompletePreset = !!preset && !isMaterialCalibrationLightingSnapshotComplete(snapshot);
        const usePreset = !!preset && !incompletePreset;

        if (usePreset) {
            this._applySceneIllumination(preset.scene);
            const resolved = getResolvedCalibrationPresetLightingSettings({
                calibrationSnapshot: snapshot,
                includeUrlOverrides: false
            });
            this.engine?.setLightingSettings?.(resolved);
            return {
                mode: LIGHTING_RESOLUTION_MODES.CALIBRATION_PRESET,
                presetId: preset.id,
                reason: null
            };
        }

        const resolved = getResolvedDefaultLightingSettings({ includeUrlOverrides: true });
        this._applySceneIllumination({
            ...DEFAULT_SCENE_ILLUMINATION,
            hemi: {
                ...(DEFAULT_SCENE_ILLUMINATION.hemi ?? {}),
                intensity: resolved.hemiIntensity
            },
            sun: {
                ...(DEFAULT_SCENE_ILLUMINATION.sun ?? {}),
                intensity: resolved.sunIntensity
            }
        });
        this.engine?.setLightingSettings?.(resolved);
        return {
            mode: LIGHTING_RESOLUTION_MODES.DEFAULT,
            presetId: null,
            reason: missingPreset ? 'missing_preset' : (incompletePreset ? 'incomplete_preset' : null)
        };
    }

    _applySceneIllumination(sceneLighting) {
        const scenePreset = sceneLighting && typeof sceneLighting === 'object'
            ? sceneLighting
            : DEFAULT_SCENE_ILLUMINATION;

        const bg = Number(scenePreset.backgroundColorHex);
        if (Number.isFinite(bg)) {
            this._backgroundColor.setHex(bg >>> 0);
            this.scene.background = this._backgroundColor;
            this.engine?.renderer?.setClearColor?.(this._backgroundColor, 1);
        }

        const hemiIntensity = Number(scenePreset.hemi?.intensity);
        if (this.hemi && Number.isFinite(hemiIntensity)) this.hemi.intensity = clamp(hemiIntensity, 0, 5);

        const sunEnabled = scenePreset.sun?.enabled !== false;
        const sunIntensity = Number(scenePreset.sun?.intensity);
        const sunColorHex = Number(scenePreset.sun?.colorHex);
        const sunPos = scenePreset.sun?.position ?? null;
        if (!this.sun) return;

        this.sun.visible = !!sunEnabled;
        if (Number.isFinite(sunIntensity)) this.sun.intensity = clamp(sunIntensity, 0, 10);
        if (Number.isFinite(sunColorHex)) this.sun.color.setHex(sunColorHex >>> 0);
        const x = Number(sunPos?.x);
        const y = Number(sunPos?.y);
        const z = Number(sunPos?.z);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) this.sun.position.set(x, y, z);
        if (this.sun.target) this.sun.target.position.set(0, 0.9, 0);
    }

    setSlotMaterial(slotIndex, materialId, { overrides = null, forceMaterialUpdate = false } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return false;
        const id = typeof materialId === 'string' ? materialId.trim() : '';
        const nextId = id || null;
        const force = forceMaterialUpdate === true;

        const prevId = this._slotMaterialIds[idx] ?? null;
        const prevWas = prevId;
        if (prevId === nextId) {
            this._slotOverrides[idx] = normalizeOverrides(overrides);
            this._applySlotMaterial(idx, { forceMaterialUpdate: force });
            return true;
        }

        this._slotMaterialIds[idx] = nextId;
        this._slotOverrides[idx] = normalizeOverrides(overrides);

        this._applySlotMaterial(idx, { forceMaterialUpdate: true });
        this._releaseMaterialIfUnused(prevWas);
        return true;
    }

    _releaseMaterialIfUnused(materialId) {
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return;
        if (this._slotMaterialIds.some((slotId) => slotId === id)) return;
        const existing = this._materialTextures.get(id) ?? null;
        if (!existing) return;
        for (const tex of Object.values(existing?.textures ?? {})) tex?.dispose?.();
        this._materialTextures.delete(id);
    }

    _applySlotMaterial(slotIndex, { forceMaterialUpdate = false } = {}) {
        if (!this.root) return;
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        const mat = this._slotMaterials[idx] ?? null;
        if (!mat) return;

        const materialId = this._slotMaterialIds[idx] ?? null;
        if (!materialId) {
            this._applyEmptySlotMaterial(mat, { forceMaterialUpdate });
            return;
        }

        const textureSet = this._ensureMaterialTextures(materialId);
        const tex = textureSet?.textures ?? {};
        const ovr = this._getSlotOverrides(idx);

        this._assignSlotTextureMaps(mat, tex);
        this._applySlotOverridesToMaterial(mat, ovr, { forceMaterialUpdate });

        this._applySlotTiling(idx, materialId, ovr);
        if (forceMaterialUpdate) mat.needsUpdate = true;
    }

    _applyEmptySlotMaterial(mat, { forceMaterialUpdate = false } = {}) {
        if (!mat) return;
        mat.map = null;
        mat.normalMap = null;
        mat.roughnessMap = null;
        mat.metalnessMap = null;
        mat.aoMap = null;
        mat.roughness = SLOT_EMPTY_MATERIAL_STYLE.roughness;
        mat.metalness = SLOT_EMPTY_MATERIAL_STYLE.metalness;
        mat.aoMapIntensity = SLOT_EMPTY_MATERIAL_STYLE.aoMapIntensity;
        mat.color.setRGB(
            SLOT_EMPTY_MATERIAL_STYLE.color.r,
            SLOT_EMPTY_MATERIAL_STYLE.color.g,
            SLOT_EMPTY_MATERIAL_STYLE.color.b
        );
        if (mat.normalScale?.set) mat.normalScale.set(SLOT_EMPTY_MATERIAL_STYLE.normalStrength, SLOT_EMPTY_MATERIAL_STYLE.normalStrength);
        this._applyRoughnessRemapOnMaterial(mat, null, { forceRebind: forceMaterialUpdate, albedoSaturation: 0.0 });
        if (forceMaterialUpdate) mat.needsUpdate = true;
    }

    _assignSlotTextureMaps(mat, textures) {
        const tex = textures && typeof textures === 'object' ? textures : {};
        mat.map = tex.baseColor ?? null;
        mat.normalMap = tex.normal ?? null;

        if (tex.orm) {
            mat.roughnessMap = tex.orm;
            mat.metalnessMap = tex.orm;
            mat.aoMap = tex.orm;
            mat.metalness = 1.0;
            return;
        }

        mat.aoMap = tex.ao ?? null;
        mat.roughnessMap = tex.roughness ?? null;
        mat.metalnessMap = tex.metalness ?? null;
        mat.metalness = tex.metalness ? 1.0 : 0.0;
    }

    _applySlotOverridesToMaterial(mat, overrides, { forceMaterialUpdate = false } = {}) {
        const ovr = overrides && typeof overrides === 'object' ? overrides : EMPTY_OVERRIDES;

        const normalStrength = Number.isFinite(ovr.normalStrength) ? ovr.normalStrength : 1.0;
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);

        mat.roughness = Number.isFinite(ovr.roughness) ? ovr.roughness : 1.0;
        if (Number.isFinite(ovr.metalness)) mat.metalness = ovr.metalness;
        mat.aoMapIntensity = Number.isFinite(ovr.aoIntensity) ? ovr.aoIntensity : 1.0;

        mat.color.copy(computeTintColor({
            albedoBrightness: Number.isFinite(ovr.albedoBrightness) ? ovr.albedoBrightness : 1.0,
            albedoTintStrength: Number.isFinite(ovr.albedoTintStrength) ? ovr.albedoTintStrength : 0.0,
            albedoHueDegrees: Number.isFinite(ovr.albedoHueDegrees) ? ovr.albedoHueDegrees : 0.0,
            albedoSaturation: 0.0
        }));
        this._applyRoughnessRemapOnMaterial(mat, ovr.roughnessRemap ?? null, {
            forceRebind: forceMaterialUpdate,
            albedoSaturation: Number.isFinite(ovr.albedoSaturation) ? ovr.albedoSaturation : 0.0
        });
    }

    _getMaterialCalibrationUserData(material) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat) return null;
        return mat.userData ?? (mat.userData = {});
    }

    _getMaterialCalibrationStateFromMaterial(material) {
        const data = this._getMaterialCalibrationUserData(material) ?? EMPTY_OVERRIDES;
        const remap = normalizeRoughnessRemap(data.materialCalibrationRoughnessRemap ?? null);
        const saturationRaw = Number(data.materialCalibrationAlbedoSaturationAmount);
        const saturationAmount = Number.isFinite(saturationRaw) ? clamp(saturationRaw, -1, 1) : 0.0;
        return { remap, saturationAmount };
    }

    _buildMaterialCalibrationRemapSignature(remap) {
        const rr = normalizeRoughnessRemap(remap);
        if (!rr) return 'off';
        return `on:${rr.min.toFixed(6)}:${rr.max.toFixed(6)}:${rr.gamma.toFixed(6)}:${rr.invertInput ? 1 : 0}:${rr.lowPercentile.toFixed(6)}:${rr.highPercentile.toFixed(6)}`;
    }

    _createMaterialCalibrationShaderUniforms() {
        return {
            uBusSimRoughnessRange: { value: new THREE.Vector2(0, 1) },
            uBusSimRoughnessInputNorm: { value: new THREE.Vector2(0, 1) },
            uBusSimRoughnessGamma: { value: 1.0 },
            uBusSimRoughnessRemapEnabled: { value: 0.0 },
            uBusSimRoughnessInvertInput: { value: 0.0 },
            uBusSimAlbedoSaturationAdjust: { value: 0.0 }
        };
    }

    _applyMaterialCalibrationUniformValues(uniforms, { remap = null, saturationAmount = 0.0 } = {}) {
        const u = uniforms && typeof uniforms === 'object' ? uniforms : null;
        if (!u) return;

        const min = remap ? remap.min : 0;
        const max = remap ? remap.max : 1;
        const lowNorm = remap ? (remap.lowPercentile / 100) : 0;
        const highNorm = remap ? (remap.highPercentile / 100) : 1;
        const gamma = remap ? remap.gamma : 1.0;
        const enabled = remap ? 1.0 : 0.0;
        const invertInput = remap?.invertInput ? 1.0 : 0.0;

        if (u.uBusSimRoughnessRange?.value?.set) u.uBusSimRoughnessRange.value.set(min, max);
        if (u.uBusSimRoughnessInputNorm?.value?.set) u.uBusSimRoughnessInputNorm.value.set(lowNorm, highNorm);
        if (u.uBusSimRoughnessGamma) u.uBusSimRoughnessGamma.value = gamma;
        if (u.uBusSimRoughnessRemapEnabled) u.uBusSimRoughnessRemapEnabled.value = enabled;
        if (u.uBusSimRoughnessInvertInput) u.uBusSimRoughnessInvertInput.value = invertInput;
        if (u.uBusSimAlbedoSaturationAdjust) u.uBusSimAlbedoSaturationAdjust.value = saturationAmount;
    }

    _patchMaterialCalibrationFragmentShader(fragmentShader) {
        let source = typeof fragmentShader === 'string' ? fragmentShader : '';
        source = source.replace(
            CALIB_SHADER_TOKENS.common,
            `${CALIB_SHADER_TOKENS.common}\n${CALIB_SHADER_COMMON_APPEND}`
        );

        if (source.includes(CALIB_SHADER_TOKENS.mapFragment)) {
            source = source.replace(
                CALIB_SHADER_TOKENS.mapFragment,
                `${CALIB_SHADER_TOKENS.mapFragment}\n${CALIB_SHADER_SATURATION_APPEND}`
            );
        } else if (source.includes(CALIB_SHADER_TOKENS.colorFragment)) {
            source = source.replace(
                CALIB_SHADER_TOKENS.colorFragment,
                `${CALIB_SHADER_TOKENS.colorFragment}\n${CALIB_SHADER_SATURATION_APPEND}`
            );
        }

        const roughnessPatched = source.includes(CALIB_SHADER_TOKENS.roughnessFragment);
        if (roughnessPatched) {
            source = source.replace(
                CALIB_SHADER_TOKENS.roughnessFragment,
                `${CALIB_SHADER_TOKENS.roughnessFragment}\n${CALIB_SHADER_ROUGHNESS_REMAP_APPEND}`
            );
        }

        return { fragmentShader: source, roughnessPatched };
    }

    _shouldRebindMaterialCalibrationShader({ data = null, previousSignature = '', nextSignature = '', forceRebind = false } = {}) {
        const installed = data?.materialCalibrationShaderInstalled === true;
        if (nextSignature !== previousSignature) return true;
        if (forceRebind === true) return true;
        return !installed;
    }

    _bindMaterialCalibrationShader(material, data) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat || !data) return;

        mat.onBeforeCompile = (shader) => {
            const shaderUniforms = shader.uniforms && typeof shader.uniforms === 'object' ? shader.uniforms : {};
            shader.uniforms = shaderUniforms;
            Object.assign(shaderUniforms, this._createMaterialCalibrationShaderUniforms());

            const state = this._getMaterialCalibrationStateFromMaterial(mat);
            this._applyMaterialCalibrationUniformValues(shaderUniforms, state);

            const patched = this._patchMaterialCalibrationFragmentShader(shader.fragmentShader);
            shader.fragmentShader = patched.fragmentShader;

            data.materialCalibrationRoughnessRemapPatched = patched.roughnessPatched;
            data.materialCalibrationShaderUniforms = shaderUniforms;
            data.materialCalibrationShaderInstalled = true;
        };
        mat.customProgramCacheKey = () => `${CALIB_SHADER_CACHE_KEY_PREFIX}:${mat.userData?.materialCalibrationRoughnessRemapSignature ?? 'off'}`;
        mat.needsUpdate = true;
    }

    _applyRoughnessRemapOnMaterial(material, roughnessRemap, { forceRebind = false, albedoSaturation = 0.0 } = {}) {
        const mat = material?.isMeshStandardMaterial ? material : null;
        if (!mat) return;

        const remap = normalizeRoughnessRemap(roughnessRemap);
        const saturationAmount = clamp(albedoSaturation, -1, 1);
        const data = this._getMaterialCalibrationUserData(mat);
        if (!data) return;

        const previousSignature = typeof data.materialCalibrationRoughnessRemapSignature === 'string'
            ? data.materialCalibrationRoughnessRemapSignature
            : '';
        const nextSignature = this._buildMaterialCalibrationRemapSignature(remap);
        data.materialCalibrationRoughnessRemap = remap;
        data.materialCalibrationAlbedoSaturationAmount = saturationAmount;
        data.materialCalibrationRoughnessRemapSignature = nextSignature;

        this._applyMaterialCalibrationUniformValues(data.materialCalibrationShaderUniforms, { remap, saturationAmount });

        const shouldRebind = this._shouldRebindMaterialCalibrationShader({
            data,
            previousSignature,
            nextSignature,
            forceRebind
        });
        if (!shouldRebind) return;
        this._bindMaterialCalibrationShader(mat, data);
    }

    _applySlotTiling(slotIndex, materialId, overrides) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return;
        const set = this._materialTextures.get(id) ?? null;
        if (!set) return;
        const ovr = overrides && typeof overrides === 'object' ? overrides : {};

        const tileCandidate = Number(ovr.tileMeters);
        const resolvedTileMeters = Number(set?.resolved?.overrides?.effective?.tileMeters);
        const tileMeters = (Number.isFinite(tileCandidate) && tileCandidate > EPS)
            ? tileCandidate
            : ((Number.isFinite(resolvedTileMeters) && resolvedTileMeters > EPS) ? resolvedTileMeters : getPbrMaterialTileMeters(id));
        const safeTile = Math.max(EPS, Number(tileMeters) || 1.0);
        const rep = this._tilingMultiplier / safeTile;

        for (const tex of Object.values(set.textures ?? {})) {
            if (!tex) continue;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(rep, rep);
            tex.needsUpdate = true;
        }
    }

    _syncAllSlotTilings() {
        this._forEachSlot((slotIndex) => {
            const materialId = this._slotMaterialIds[slotIndex] ?? null;
            if (!materialId) return;
            this._applySlotTiling(slotIndex, materialId, this._getSlotOverrides(slotIndex));
        });
    }

    _ensureMaterialTextures(materialId) {
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return null;
        const existing = this._materialTextures.get(id);
        if (existing) return existing;

        const resolved = this._pbrLoader.resolveMaterial(id, {
            cloneTextures: true,
            diagnosticsTag: 'MaterialCalibrationScene'
        });
        const textures = {
            baseColor: resolved?.textures?.baseColor ?? null,
            normal: resolved?.textures?.normal ?? null,
            orm: resolved?.textures?.orm ?? null,
            ao: resolved?.textures?.ao ?? null,
            roughness: resolved?.textures?.roughness ?? null,
            metalness: resolved?.textures?.metalness ?? null
        };

        const payload = { urls: resolved?.urls ?? null, textures, resolved };
        this._materialTextures.set(id, payload);
        return payload;
    }

    _clearRulerLine() {
        if (!this._rulerLine) return;
        const line = this._rulerLine;
        this._rulerLine = null;
        line.removeFromParent();
        line.geometry?.dispose?.();
        line.material?.dispose?.();
    }

    _buildLights() {
        this.hemi = new THREE.HemisphereLight(0xe8f0ff, 0x0b0f14, 0.95);
        this.root.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
        this.sun.position.set(4, 7, 4);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        this.sun.shadow.camera.near = 0.1;
        this.sun.shadow.camera.far = 80;
        this.root.add(this.sun);
        this.root.add(this.sun.target);
    }

    _createSlotGeometryAssets() {
        const plateGeo = new THREE.BoxGeometry(PLATE_SIZE, PLATE_THICKNESS, PLATE_SIZE);
        const plateMatBase = new THREE.MeshStandardMaterial({ color: SLOT_PLATE_STYLE.inactive.colorHex, roughness: 1.0, metalness: 0.0 });

        const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT, 1, 1);
        scaleUv(panelGeo, PANEL_WIDTH, PANEL_HEIGHT);
        ensureUv2(panelGeo);

        const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 48, 32);
        scaleUv(sphereGeo, 2 * Math.PI * SPHERE_RADIUS, Math.PI * SPHERE_RADIUS);
        ensureUv2(sphereGeo);

        const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
        scaleUv(cubeGeo, CUBE_SIZE, CUBE_SIZE);
        ensureUv2(cubeGeo);

        return { plateGeo, plateMatBase, panelGeo, sphereGeo, cubeGeo };
    }

    _createSlotSurfaceMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
    }

    _createSlotMesh({
        name,
        geometry,
        material,
        position = null,
        rotationY = 0,
        castShadow = false,
        receiveShadow = false,
        slotIndex = null
    } = {}) {
        if (!geometry || !material) return null;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = String(name ?? '');

        const pos = position && typeof position === 'object' ? position : null;
        mesh.position.set(toFinite(pos?.x, 0), toFinite(pos?.y, 0), toFinite(pos?.z, 0));
        mesh.rotation.y = Number.isFinite(Number(rotationY)) ? Number(rotationY) : 0;
        mesh.castShadow = castShadow === true;
        mesh.receiveShadow = receiveShadow === true;
        mesh.userData.materialCalibrationSlotIndex = sanitizeSlotIndex(slotIndex) ?? 0;
        return mesh;
    }

    _buildSlotGroup(slotIndex, assets) {
        const i = sanitizeSlotIndex(slotIndex);
        if (i === null || !assets) return;

        const group = new THREE.Group();
        group.name = `material_calibration_slot_${i}`;
        const baseX = (i - 1) * SLOT_X_SPACING;
        group.position.set(baseX, 0, 0);
        this.root.add(group);
        this._slotGroups[i] = group;
        this._slotBasePositions[i] = group.position.clone();

        const plate = this._createSlotMesh({
            name: 'plate',
            geometry: assets.plateGeo,
            material: assets.plateMatBase.clone(),
            position: { x: 0, y: PLATE_THICKNESS * 0.5, z: 0 },
            castShadow: false,
            receiveShadow: true,
            slotIndex: i
        });
        if (plate) {
            group.add(plate);
            this._slotPlates[i] = plate;
        }

        const slotMat = this._createSlotSurfaceMaterial();
        const panel = this._createSlotMesh({
            name: 'panel',
            geometry: assets.panelGeo,
            material: slotMat,
            position: { x: 0, y: PLATE_THICKNESS + 1.15, z: -0.95 },
            castShadow: false,
            receiveShadow: true,
            slotIndex: i
        });
        if (panel) group.add(panel);

        const sphere = this._createSlotMesh({
            name: 'sphere',
            geometry: assets.sphereGeo,
            material: slotMat,
            position: { x: -0.55, y: PLATE_THICKNESS + SPHERE_RADIUS, z: 0.55 },
            castShadow: true,
            receiveShadow: true,
            slotIndex: i
        });
        if (sphere) group.add(sphere);

        const cube = this._createSlotMesh({
            name: 'cube',
            geometry: assets.cubeGeo,
            material: slotMat,
            position: { x: 0.7, y: PLATE_THICKNESS + (CUBE_SIZE * 0.5), z: 0.25 },
            rotationY: Math.PI * 0.25,
            castShadow: true,
            receiveShadow: true,
            slotIndex: i
        });
        if (cube) group.add(cube);

        this._slotMaterials[i] = slotMat;
        this._slotMaterialIds[i] = null;
        this._slotOverrides[i] = EMPTY_OVERRIDES;
    }

    _buildSlots() {
        const assets = this._createSlotGeometryAssets();
        this._forEachSlot((slotIndex) => this._buildSlotGroup(slotIndex, assets));
        this._refreshSlotVisibilityAndBounds();
    }

    _applyLayoutMode() {
        this._forEachSlotGroup((slotIndex, group) => {
            group.visible = this._isolatedSlotIndex === null || this._isolatedSlotIndex === slotIndex;
            group.traverse((obj) => {
                if (!obj?.isMesh) return;
                obj.visible = this._isSlotObjectVisibleForLayout(obj.name);
            });
        });
    }

    _recomputeFocusSpheres() {
        const box = new THREE.Box3();
        const sphere = new THREE.Sphere();
        this._forEachSlot((slotIndex) => {
            const group = this._slotGroups[slotIndex] ?? null;
            if (!group) return;
            box.setFromObject(group);
            if (box.isEmpty()) {
                this._slotFocusSphere[slotIndex] = null;
                return;
            }
            box.getBoundingSphere(sphere);
            this._slotFocusSphere[slotIndex] = { center: sphere.center.clone(), radius: Math.max(0.1, sphere.radius) };
        });
    }

    _buildCamera() {
        const focusCenter = new THREE.Vector3(0, PLATE_THICKNESS + 1.05, 0);
        const initialPos = new THREE.Vector3(0.25, PLATE_THICKNESS + 2.25, 7.0);

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._uiRoot,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.9,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 0.3,
            maxDistance: 120,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: focusCenter, radius: 6.0 }),
            initialPose: { position: initialPos, target: focusCenter }
        });
    }

    _syncActiveSlotHighlight() {
        this._forEachSlot((slotIndex) => {
            const plate = this._slotPlates[slotIndex] ?? null;
            const mat = plate?.material ?? null;
            if (!mat || Array.isArray(mat)) return;
            const style = slotIndex === this._activeSlotIndex ? SLOT_PLATE_STYLE.active : SLOT_PLATE_STYLE.inactive;
            mat.color.setHex(style.colorHex);
            mat.emissive?.setHex?.(style.emissiveHex);
            if ('emissiveIntensity' in mat) mat.emissiveIntensity = style.emissiveIntensity;
        });
    }
}
