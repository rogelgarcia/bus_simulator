// src/graphics/gui/material_calibration/MaterialCalibrationScene.js
// Controlled scene for side-by-side PBR material calibration.
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getPbrMaterialTileMeters, resolvePbrMaterialUrls } from '../../content3d/catalogs/PbrMaterialCatalog.js';
import { getMaterialCalibrationIlluminationPresetById } from './MaterialCalibrationIlluminationPresets.js';

const EPS = 1e-6;
const UP = new THREE.Vector3(0, 1, 0);

const SLOT_COUNT = 3;
const SLOT_X_SPACING = 3.9;

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

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
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

function normalizeOverrides(value) {
    const src = value && typeof value === 'object' ? value : null;
    if (!src) return Object.freeze({});

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
        this._slotMaterialIds = Array(SLOT_COUNT).fill(null);
        this._slotOverrides = Array(SLOT_COUNT).fill(null);
        this._slotMaterials = Array(SLOT_COUNT).fill(null);
        this._slotGroups = Array(SLOT_COUNT).fill(null);
        this._slotPlates = Array(SLOT_COUNT).fill(null);
        this._slotFocusSphere = Array(SLOT_COUNT).fill(null);

        this._materialTextures = new Map();
        this._layoutMode = 'full';
        this._tilingMultiplier = 1.0;
        this._activeSlotIndex = 0;

        this._pickRaycaster = new THREE.Raycaster();
        this._pickHits = [];

        this._rulerRaycaster = new THREE.Raycaster();
        this._rulerRayHits = [];
        this._rulerLine = null;
        this._lineResolution = new THREE.Vector2(1, 1);
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
        this._slotPlates = Array(SLOT_COUNT).fill(null);
        this._slotFocusSphere = Array(SLOT_COUNT).fill(null);

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
        const next = id === 'panel' || id === 'sphere' || id === 'full' ? id : 'full';
        if (next === this._layoutMode) return;
        this._layoutMode = next;
        this._applyLayoutMode();
        this._recomputeFocusSpheres();
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

    focusSlot(slotIndex, { keepOrbit = true, immediate = false } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return false;
        if (!this.controls) return false;
        const sphere = this._slotFocusSphere[idx] ?? null;
        const center = sphere?.center && isValidVector3(sphere.center) ? sphere.center : null;
        if (!center) return false;

        if (!keepOrbit) {
            this.controls.frame?.();
            return true;
        }

        const orbit = this.controls.getOrbit?.() ?? null;
        const radius = Number(orbit?.radius);
        const theta = Number(orbit?.theta);
        const phi = Number(orbit?.phi);
        if (!Number.isFinite(radius) || !Number.isFinite(theta) || !Number.isFinite(phi)) return false;
        this.controls.setOrbit({
            radius,
            theta,
            phi,
            target: { x: center.x, y: center.y, z: center.z }
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
        if (geo?.setPositions) geo.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
        this._rulerLine.visible = true;
    }

    clearRuler() {
        this._clearRulerLine();
    }

    applyIlluminationPreset(presetId) {
        const preset = getMaterialCalibrationIlluminationPresetById(presetId);
        if (!preset) return false;

        const bg = Number(preset.scene?.backgroundColorHex);
        if (Number.isFinite(bg)) {
            this._backgroundColor.setHex(bg >>> 0);
            this.scene.background = this._backgroundColor;
            this.engine?.renderer?.setClearColor?.(this._backgroundColor, 1);
        }

        const hemiIntensity = Number(preset.scene?.hemi?.intensity);
        if (this.hemi && Number.isFinite(hemiIntensity)) this.hemi.intensity = clamp(hemiIntensity, 0, 5);

        const sunEnabled = preset.scene?.sun?.enabled !== false;
        const sunIntensity = Number(preset.scene?.sun?.intensity);
        const sunColorHex = Number(preset.scene?.sun?.colorHex);
        const sunPos = preset.scene?.sun?.position ?? null;
        if (this.sun) {
            this.sun.visible = !!sunEnabled;
            if (Number.isFinite(sunIntensity)) this.sun.intensity = clamp(sunIntensity, 0, 10);
            if (Number.isFinite(sunColorHex)) this.sun.color.setHex(sunColorHex >>> 0);
            const x = Number(sunPos?.x);
            const y = Number(sunPos?.y);
            const z = Number(sunPos?.z);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) this.sun.position.set(x, y, z);
            if (this.sun.target) this.sun.target.position.set(0, 0.9, 0);
        }

        const engineLighting = preset.engineLighting ?? null;
        if (engineLighting && this.engine?.setLightingSettings) {
            this.engine.setLightingSettings({
                exposure: engineLighting.exposure,
                hemiIntensity: engineLighting.hemiIntensity,
                sunIntensity: engineLighting.sunIntensity,
                ibl: engineLighting.ibl ?? null
            });
        }

        return true;
    }

    setSlotMaterial(slotIndex, materialId, { overrides = null } = {}) {
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return false;
        const id = typeof materialId === 'string' ? materialId.trim() : '';
        const nextId = id || null;

        const prevId = this._slotMaterialIds[idx] ?? null;
        const prevWas = prevId;
        if (prevId === nextId) {
            this._slotOverrides[idx] = normalizeOverrides(overrides);
            this._applySlotMaterial(idx);
            return true;
        }

        this._slotMaterialIds[idx] = nextId;
        this._slotOverrides[idx] = normalizeOverrides(overrides);

        this._applySlotMaterial(idx);
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

    _applySlotMaterial(slotIndex) {
        if (!this.root) return;
        const idx = sanitizeSlotIndex(slotIndex);
        if (idx === null) return;
        const mat = this._slotMaterials[idx] ?? null;
        if (!mat) return;

        const materialId = this._slotMaterialIds[idx] ?? null;
        if (!materialId) {
            mat.map = null;
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
            mat.aoMap = null;
            mat.roughness = 1.0;
            mat.metalness = 0.0;
            mat.aoMapIntensity = 1.0;
            mat.color.setRGB(0.75, 0.75, 0.75);
            if (mat.normalScale?.set) mat.normalScale.set(1, 1);
            mat.needsUpdate = true;
            return;
        }

        const textureSet = this._ensureMaterialTextures(materialId);
        const tex = textureSet?.textures ?? {};

        mat.map = tex.baseColor ?? null;
        mat.normalMap = tex.normal ?? null;

        if (tex.orm) {
            mat.roughnessMap = tex.orm;
            mat.metalnessMap = tex.orm;
            mat.aoMap = tex.orm;
            mat.metalness = 1.0;
        } else {
            mat.aoMap = tex.ao ?? null;
            mat.roughnessMap = tex.roughness ?? null;
            mat.metalnessMap = tex.metalness ?? null;
            mat.metalness = tex.metalness ? 1.0 : 0.0;
        }

        const ovr = this._slotOverrides[idx] ?? {};
        const normalStrength = Number.isFinite(ovr.normalStrength) ? ovr.normalStrength : 1.0;
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);
        mat.roughness = Number.isFinite(ovr.roughness) ? ovr.roughness : 1.0;
        if (Number.isFinite(ovr.metalness)) mat.metalness = ovr.metalness;
        mat.aoMapIntensity = Number.isFinite(ovr.aoIntensity) ? ovr.aoIntensity : 1.0;

        mat.color.copy(computeTintColor({
            albedoBrightness: Number.isFinite(ovr.albedoBrightness) ? ovr.albedoBrightness : 1.0,
            albedoTintStrength: Number.isFinite(ovr.albedoTintStrength) ? ovr.albedoTintStrength : 0.0,
            albedoHueDegrees: Number.isFinite(ovr.albedoHueDegrees) ? ovr.albedoHueDegrees : 0.0,
            albedoSaturation: Number.isFinite(ovr.albedoSaturation) ? ovr.albedoSaturation : 0.0
        }));

        this._applySlotTiling(idx, materialId, ovr);
        mat.needsUpdate = true;
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
        const tileMeters = (Number.isFinite(tileCandidate) && tileCandidate > EPS) ? tileCandidate : getPbrMaterialTileMeters(id);
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
        for (let i = 0; i < SLOT_COUNT; i++) {
            const id = this._slotMaterialIds[i] ?? null;
            if (!id) continue;
            const ovr = this._slotOverrides[i] ?? null;
            this._applySlotTiling(i, id, ovr);
        }
    }

    _ensureMaterialTextures(materialId) {
        const id = typeof materialId === 'string' ? materialId : '';
        if (!id) return null;
        const existing = this._materialTextures.get(id);
        if (existing) return existing;

        const urls = resolvePbrMaterialUrls(id);
        const baseColorUrl = urls?.baseColorUrl ?? null;
        const normalUrl = urls?.normalUrl ?? null;
        const ormUrl = urls?.ormUrl ?? null;
        const aoUrl = urls?.aoUrl ?? null;
        const roughUrl = urls?.roughnessUrl ?? null;
        const metalUrl = urls?.metalnessUrl ?? null;

        const textures = {
            baseColor: this._loadTexture(baseColorUrl, { srgb: true }),
            normal: this._loadTexture(normalUrl, { srgb: false }),
            orm: this._loadTexture(ormUrl, { srgb: false }),
            ao: this._loadTexture(aoUrl, { srgb: false }),
            roughness: this._loadTexture(roughUrl, { srgb: false }),
            metalness: this._loadTexture(metalUrl, { srgb: false })
        };

        const payload = { urls, textures };
        this._materialTextures.set(id, payload);
        return payload;
    }

    _loadTexture(url, { srgb = true } = {}) {
        const safeUrl = typeof url === 'string' && url ? url : null;
        const renderer = this.engine?.renderer ?? null;
        if (!safeUrl || !renderer) return null;

        const tex = this._texLoader.load(safeUrl);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy?.() ?? 16);
        applyTextureColorSpace(tex, { srgb: !!srgb });
        return tex;
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

    _buildSlots() {
        const plateGeo = new THREE.BoxGeometry(PLATE_SIZE, PLATE_THICKNESS, PLATE_SIZE);
        const plateMatBase = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 1.0, metalness: 0.0 });

        const panelGeo = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT, 1, 1);
        scaleUv(panelGeo, PANEL_WIDTH, PANEL_HEIGHT);
        ensureUv2(panelGeo);

        const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 48, 32);
        scaleUv(sphereGeo, 2 * Math.PI * SPHERE_RADIUS, Math.PI * SPHERE_RADIUS);
        ensureUv2(sphereGeo);

        const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
        scaleUv(cubeGeo, CUBE_SIZE, CUBE_SIZE);
        ensureUv2(cubeGeo);

        for (let i = 0; i < SLOT_COUNT; i++) {
            const group = new THREE.Group();
            group.name = `material_calibration_slot_${i}`;
            group.position.set((i - 1) * SLOT_X_SPACING, 0, 0);
            this.root.add(group);
            this._slotGroups[i] = group;

            const plateMat = plateMatBase.clone();
            const plate = new THREE.Mesh(plateGeo, plateMat);
            plate.name = 'plate';
            plate.position.set(0, PLATE_THICKNESS * 0.5, 0);
            plate.receiveShadow = true;
            plate.userData.materialCalibrationSlotIndex = i;
            group.add(plate);
            this._slotPlates[i] = plate;

            const slotMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 1.0,
                metalness: 0.0
            });

            const panel = new THREE.Mesh(panelGeo, slotMat);
            panel.name = 'panel';
            panel.position.set(0, PLATE_THICKNESS + 1.15, -0.95);
            panel.receiveShadow = true;
            panel.userData.materialCalibrationSlotIndex = i;
            group.add(panel);

            const sphere = new THREE.Mesh(sphereGeo, slotMat);
            sphere.name = 'sphere';
            sphere.position.set(-0.55, PLATE_THICKNESS + SPHERE_RADIUS, 0.55);
            sphere.castShadow = true;
            sphere.receiveShadow = true;
            sphere.userData.materialCalibrationSlotIndex = i;
            group.add(sphere);

            const cube = new THREE.Mesh(cubeGeo, slotMat);
            cube.name = 'cube';
            cube.position.set(0.7, PLATE_THICKNESS + (CUBE_SIZE * 0.5), 0.25);
            cube.rotation.y = Math.PI * 0.25;
            cube.castShadow = true;
            cube.receiveShadow = true;
            cube.userData.materialCalibrationSlotIndex = i;
            group.add(cube);

            this._slotMaterials[i] = slotMat;
            this._slotMaterialIds[i] = null;
            this._slotOverrides[i] = Object.freeze({});
        }

        this._applyLayoutMode();
        this._recomputeFocusSpheres();
    }

    _applyLayoutMode() {
        for (let i = 0; i < SLOT_COUNT; i++) {
            const group = this._slotGroups[i];
            if (!group) continue;
            group.traverse((obj) => {
                if (!obj?.isMesh) return;
                if (obj.name === 'plate') return;
                if (this._layoutMode === 'full') obj.visible = true;
                else if (this._layoutMode === 'panel') obj.visible = obj.name === 'panel';
                else if (this._layoutMode === 'sphere') obj.visible = obj.name === 'sphere';
                else obj.visible = true;
            });
        }
    }

    _recomputeFocusSpheres() {
        const box = new THREE.Box3();
        const sphere = new THREE.Sphere();
        for (let i = 0; i < SLOT_COUNT; i++) {
            const group = this._slotGroups[i];
            if (!group) continue;
            box.setFromObject(group);
            if (box.isEmpty()) {
                this._slotFocusSphere[i] = null;
                continue;
            }
            box.getBoundingSphere(sphere);
            this._slotFocusSphere[i] = { center: sphere.center.clone(), radius: Math.max(0.1, sphere.radius) };
        }
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
        for (let i = 0; i < SLOT_COUNT; i++) {
            const plate = this._slotPlates[i] ?? null;
            const mat = plate?.material ?? null;
            if (!mat || Array.isArray(mat)) continue;
            if (i === this._activeSlotIndex) {
                mat.color.setHex(0x2a3b46);
                mat.emissive?.setHex?.(0x0a141c);
                if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.25;
            } else {
                mat.color.setHex(0x1f242c);
                mat.emissive?.setHex?.(0x000000);
                if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0;
            }
        }
    }
}

