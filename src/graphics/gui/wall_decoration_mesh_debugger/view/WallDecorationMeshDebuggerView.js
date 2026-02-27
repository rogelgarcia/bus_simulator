// src/graphics/gui/wall_decoration_mesh_debugger/view/WallDecorationMeshDebuggerView.js
// Orchestrates scene + UI for procedural wall-decoration catalog debugging.
// @ts-check

import * as THREE from 'three';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../../engine3d/perf/GpuFrameTimer.js';
import { createGradientSkyDome } from '../../../assets3d/generators/SkyGenerator.js';
import { getPbrMaterialOptionsForBuildings, getPbrMaterialTileMeters } from '../../../content3d/catalogs/PbrMaterialCatalog.js';
import { PbrTextureLoaderService, applyResolvedPbrToStandardMaterial } from '../../../content3d/materials/PbrTexturePipeline.js';
import { getBeltCourseColorOptions } from '../../../../app/buildings/BeltCourseColor.js';
import { resolveWallBaseTintHexFromWallBase } from '../../../../app/buildings/WallBaseTintModel.js';
import {
    buildRibbonPatternHeightField,
    getDefaultWallDecoratorDebuggerState,
    loadWallDecoratorCatalogEntry,
    loadWallDecoratorPresetEntry,
    normalizeRibbonPatternId,
    sanitizeWallDecoratorDebuggerState,
    WALL_DECORATOR_ID
} from '../../../../app/buildings/wall_decorators/index.js';
import { WallDecoratorCatalogLoader } from './WallDecoratorCatalogLoader.js';
import { WallDecorationMeshDebuggerUI } from './WallDecorationMeshDebuggerUI.js';

const WALL_SPEC = Object.freeze({
    widthMeters: 10.0,
    heightMeters: 3.5,
    depthMeters: 0.30
});
const WALL_MATERIAL_NONE_ID = 'none';
const WALL_BASE_COLOR_HEX = 0x9196a0;

function clamp(value, min, max, fallback = min) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
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

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function disposeMaterialMaps(mat) {
    const material = mat && typeof mat === 'object' ? mat : null;
    if (!material) return;
    const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
    for (const key of maps) {
        const tex = material[key];
        if (tex?.isTexture) tex.dispose?.();
        material[key] = null;
    }
}

function applyTextureTransform(tex, { repeatU = 1, repeatV = 1, offsetU = 0, offsetV = 0, rotationDegrees = 0 } = {}) {
    const texture = tex?.isTexture ? tex : null;
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1e-4, Number(repeatU) || 1), Math.max(1e-4, Number(repeatV) || 1));
    texture.offset.set(Number(offsetU) || 0.0, Number(offsetV) || 0.0);
    texture.center.set(0.5, 0.5);
    texture.rotation = (Number(rotationDegrees) || 0) * Math.PI / 180.0;
    texture.needsUpdate = true;
}

function disposeTrackedRibbonPatternNormalMap(mat) {
    const material = mat && typeof mat === 'object' ? mat : null;
    const tracked = material?.userData?.ribbonPatternNormalMap ?? null;
    if (!tracked?.isTexture) return;
    if (material.normalMap === tracked) material.normalMap = null;
    tracked.dispose?.();
    if (material.userData && Object.prototype.hasOwnProperty.call(material.userData, 'ribbonPatternNormalMap')) {
        delete material.userData.ribbonPatternNormalMap;
    }
}

function createRibbonPatternNormalTexture({
    patternId = 'circle',
    size = 128,
    normalIntensity = 1.4
} = {}) {
    const field = buildRibbonPatternHeightField({ patternId, size });
    const safeSize = Math.max(16, Number(field?.size) || 128);
    const source = field?.pixels instanceof Uint8Array ? field.pixels : new Uint8Array(safeSize * safeSize);
    const out = new Uint8Array(safeSize * safeSize * 4);
    const strength = clamp(normalIntensity, 0.1, 6.0, 1.4);

    const sample = (x, y) => {
        const ix = ((x % safeSize) + safeSize) % safeSize;
        const iy = ((y % safeSize) + safeSize) % safeSize;
        return (Number(source[iy * safeSize + ix]) || 0.0) / 255.0;
    };

    for (let y = 0; y < safeSize; y++) {
        for (let x = 0; x < safeSize; x++) {
            const hL = sample(x - 1, y);
            const hR = sample(x + 1, y);
            const hD = sample(x, y - 1);
            const hU = sample(x, y + 1);
            const dx = (hR - hL) * strength;
            const dy = (hU - hD) * strength;
            const len = Math.hypot(dx, dy, 1.0);
            const nx = -dx / len;
            const ny = -dy / len;
            const nz = 1.0 / len;

            const i = (y * safeSize + x) * 4;
            out[i] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
            out[i + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
            out[i + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
            out[i + 3] = 255;
        }
    }

    const tex = new THREE.DataTexture(out, safeSize, safeSize, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    applyTextureColorSpace(tex, { srgb: false });
    tex.needsUpdate = true;
    tex.userData = tex.userData ?? {};
    tex.userData.ribbonPatternNormal = true;
    tex.userData.ribbonPatternId = normalizeRibbonPatternId(patternId);
    return tex;
}

function flipGeometryWinding(geometry) {
    const geo = geometry?.isBufferGeometry ? geometry : null;
    if (!geo) return;
    const index = geo.getIndex();
    if (index?.array) {
        const idx = index.array;
        for (let i = 0; i + 2 < idx.length; i += 3) {
            const t = idx[i + 1];
            idx[i + 1] = idx[i + 2];
            idx[i + 2] = t;
        }
        index.needsUpdate = true;
        return;
    }

    const attrs = geo.attributes ?? {};
    const keys = Object.keys(attrs);
    if (!keys.length) return;
    const vertexCount = Number(attrs.position?.count) || 0;
    if (vertexCount < 3) return;
    for (let i = 0; i + 2 < vertexCount; i += 3) {
        for (const key of keys) {
            const attr = attrs[key];
            const itemSize = Number(attr?.itemSize) || 0;
            const arr = attr?.array ?? null;
            if (!arr || itemSize <= 0) continue;
            for (let k = 0; k < itemSize; k += 1) {
                const a = (i + 1) * itemSize + k;
                const b = (i + 2) * itemSize + k;
                const t = arr[a];
                arr[a] = arr[b];
                arr[b] = t;
            }
            attr.needsUpdate = true;
        }
    }
}

function createCurvedRingGeometry({
    segmentWidthMeters = 1.0,
    diameterMeters = 1.0,
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const segmentWidth = Math.max(0.01, Number(segmentWidthMeters) || 1.0);
    const diameter = Math.max(0.01, Number(diameterMeters) || 1.0);
    const radius = diameter * 0.5;
    const arcSegments = 28;

    // Profile is a half-circle in side view (Y/Z), then swept along U (X).
    const profile = new THREE.Shape();
    profile.moveTo(0.0, -radius);
    for (let i = 0; i <= arcSegments; i += 1) {
        const t = -Math.PI * 0.5 + (Math.PI * i) / arcSegments;
        const x = radius * Math.cos(t);
        const y = radius * Math.sin(t);
        profile.lineTo(x, y);
    }
    profile.lineTo(0.0, radius);
    profile.lineTo(0.0, -radius);

    let geo = new THREE.ExtrudeGeometry(profile, {
        depth: segmentWidth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: arcSegments
    });

    // Center sweep on X and orient depth to +Z so placement math remains unchanged.
    geo.translate(0.0, 0.0, -segmentWidth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.scale(1.0, 1.0, -1.0);

    if (miterStart45 || miterEnd45) {
        const pos = geo.attributes?.position ?? null;
        const arr = pos?.array ?? null;
        if (arr) {
            geo.computeBoundingBox();
            const box = geo.boundingBox ? geo.boundingBox.clone() : null;
            const minX = Number(box?.min?.x);
            const maxX = Number(box?.max?.x);
            if (Number.isFinite(minX) && Number.isFinite(maxX)) {
                for (let i = 0; i < arr.length; i += 3) {
                    let x = Number(arr[i]) || 0.0;
                    const depthFromWall = Math.max(0.0, Number(arr[i + 2]) || 0.0);
                    if (miterStart45) {
                        const cutMinX = minX + depthFromWall;
                        if (x < cutMinX) x = cutMinX;
                    }
                    if (miterEnd45) {
                        const cutMaxX = maxX - depthFromWall;
                        if (x > cutMaxX) x = cutMaxX;
                    }
                    arr[i] = x;
                }
                pos.needsUpdate = true;
            }
        }
    }

    // This profile does not need a wall-facing cap; remove triangles coplanar with the wall plane.
    {
        const source = geo.index ? geo.toNonIndexed() : geo.clone();
        const pos = source.getAttribute('position');
        const uv = source.getAttribute('uv');
        if (pos?.count >= 3) {
            const outPos = [];
            const outUv = [];
            const eps = 1e-6;
            for (let i = 0; i + 2 < pos.count; i += 3) {
                const z0 = Number(pos.getZ(i)) || 0.0;
                const z1 = Number(pos.getZ(i + 1)) || 0.0;
                const z2 = Number(pos.getZ(i + 2)) || 0.0;
                const isWallTri = Math.abs(z0) <= eps && Math.abs(z1) <= eps && Math.abs(z2) <= eps;
                if (isWallTri) continue;
                for (let v = 0; v < 3; v += 1) {
                    const idx = i + v;
                    outPos.push(
                        Number(pos.getX(idx)) || 0.0,
                        Number(pos.getY(idx)) || 0.0,
                        Number(pos.getZ(idx)) || 0.0
                    );
                    if (uv) {
                        outUv.push(
                            Number(uv.getX(idx)) || 0.0,
                            Number(uv.getY(idx)) || 0.0
                        );
                    }
                }
            }
            const filtered = new THREE.BufferGeometry();
            filtered.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
            if (uv && outUv.length === (outPos.length / 3) * 2) {
                filtered.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
            }
            geo.dispose();
            source.dispose();
            geo = filtered;
        } else {
            source.dispose();
        }
    }
    flipGeometryWinding(geo);

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createAngledSupportProfileGeometry({
    segmentWidthMeters = 1.0,
    offsetMeters = 0.10,
    shiftMeters = 0.0,
    returnHeightMeters = 0.20,
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const segmentWidth = Math.max(0.01, Number(segmentWidthMeters) || 1.0);
    const offset = Math.max(0.005, Number(offsetMeters) || 0.10);
    const shift = Number(shiftMeters) || 0.0;
    const returnHeight = Math.max(0.01, Number(returnHeightMeters) || 0.20);

    // 3-line side profile: wall anchor -> angled offset/shift -> vertical return; close back to wall.
    const shape = new THREE.Shape();
    shape.moveTo(0.0, 0.0);
    shape.lineTo(0.0, returnHeight);
    shape.lineTo(offset, returnHeight + shift);
    shape.lineTo(offset, shift);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: segmentWidth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 2
    });
    geo.translate(0.0, 0.0, -segmentWidth * 0.5);
    geo.rotateY(Math.PI * 0.5);
    geo.scale(1.0, 1.0, -1.0);

    const pos = geo.attributes?.position;
    const arr = pos?.array ?? null;
    if (arr) {
        const rawBox = new THREE.Box3().setFromBufferAttribute(pos);
        const minX = rawBox.min.x;
        const maxX = rawBox.max.x;
        for (let i = 0; i < arr.length; i += 3) {
            let x = Number(arr[i]) || 0.0;
            const z = Number(arr[i + 2]) || 0.0;
            if (miterStart45) {
                const cutMinX = minX + Math.max(0.0, z);
                if (x < cutMinX) x = cutMinX;
            }
            if (miterEnd45) {
                const cutMaxX = maxX - Math.max(0.0, z);
                if (x > cutMaxX) x = cutMaxX;
            }
            arr[i] = x;
        }
        pos.needsUpdate = true;
    }
    flipGeometryWinding(geo);

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

function createMiteredBoxGeometry({
    widthMeters = 1.0,
    heightMeters = 1.0,
    depthMeters = 0.1,
    miterStart45 = false,
    miterEnd45 = false
} = {}) {
    const width = Math.max(0.01, Number(widthMeters) || 1.0);
    const height = Math.max(0.01, Number(heightMeters) || 1.0);
    const depth = Math.max(0.005, Number(depthMeters) || 0.1);
    const geo = new THREE.BoxGeometry(width, height, depth);
    if (miterStart45 || miterEnd45) {
        const pos = geo.attributes?.position;
        const arr = pos?.array ?? null;
        if (arr) {
            const minX = -width * 0.5;
            const maxX = width * 0.5;
            const halfDepth = depth * 0.5;
            for (let i = 0; i < arr.length; i += 3) {
                let x = Number(arr[i]) || 0.0;
                const z = Number(arr[i + 2]) || 0.0;
                const zDepth = Math.max(0.0, z + halfDepth);
                if (miterStart45) {
                    const cutMinX = minX + zDepth;
                    if (x < cutMinX) x = cutMinX;
                }
                if (miterEnd45) {
                    const cutMaxX = maxX - zDepth;
                    if (x > cutMaxX) x = cutMaxX;
                }
                arr[i] = x;
            }
            pos.needsUpdate = true;
        }
    }

    geo.computeBoundingBox();
    const box = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    geo.translate(-center.x, -center.y, -center.z);
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    const finalBox = geo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
    const size = finalBox.getSize(new THREE.Vector3());
    return {
        geometry: geo,
        widthMeters: Math.max(0.01, size.x),
        heightMeters: Math.max(0.01, size.y),
        depthMeters: Math.max(0.005, size.z)
    };
}

export class WallDecorationMeshDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas ?? null;
        this.onFrame = null;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this._gpuFrameTimer = null;

        this._ui = null;
        this._catalogLoader = new WallDecoratorCatalogLoader();
        this._pbrLoader = null;
        this._state = sanitizeWallDecoratorDebuggerState(getDefaultWallDecoratorDebuggerState());
        this._showWireframe = false;
        this._showWallMesh = true;
        this._showDummy = true;
        this._wallMaterialId = WALL_MATERIAL_NONE_ID;
        this._beltColorById = new Map(getBeltCourseColorOptions().map((opt) => [String(opt?.id ?? ''), Number(opt?.hex) || 0xffffff]));

        this._wallMesh = null;
        this._ground = null;
        this._grid = null;
        this._sky = null;
        this._dummyGroup = null;
        this._decoratorGroup = null;
        this._decoratorMeshes = [];

        this._raf = 0;
        this._lastT = 0;

        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    async start() {
        if (!this.canvas) throw new Error('[WallDecorationMeshDebugger] Missing canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.28;
        this.renderer = renderer;
        this._pbrLoader = new PbrTextureLoaderService({ renderer });
        this._gpuFrameTimer = getOrCreateGpuFrameTimer(renderer);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x101620);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
        this.camera.position.set(8.5, 4.0, 8.0);

        this._buildStaticScene();
        this._createUi();

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._ui?.root ?? null,
            minDistance: 0.5,
            maxDistance: 120.0,
            rotateSpeed: 0.95,
            panSpeed: 0.95,
            zoomSpeed: 1.15,
            orbitMouseButtons: [0, 2],
            minPolarAngle: 0.05,
            maxPolarAngle: Math.PI / 2.01,
            getFocusTarget: () => ({
                center: { x: 0, y: WALL_SPEC.heightMeters * 0.5, z: -WALL_SPEC.widthMeters * 0.5 },
                radius: 9.0
            }),
            initialPose: {
                position: { x: 8.5, y: 4.0, z: 8.0 },
                target: { x: 0, y: 1.6, z: -2.8 }
            }
        });

        this._rebuildDecoratorMeshes();
        this._resize();

        window.addEventListener('resize', this._onResize);
        window.addEventListener('keydown', this._onKeyDown, { passive: false });

        this._lastT = performance.now();
        const tick = () => {
            this._raf = requestAnimationFrame(tick);
            const now = performance.now();
            const dt = Math.max(0, (now - this._lastT) / 1000);
            this._lastT = now;

            this.controls?.update(dt);
            this._gpuFrameTimer?.beginFrame?.();
            this.renderer.render(this.scene, this.camera);
            this._gpuFrameTimer?.endFrame?.();
            this.onFrame?.({
                dt,
                nowMs: now,
                gpuMs: this._gpuFrameTimer?.getLastGpuMs?.() ?? null
            });
        };
        tick();
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown, { passive: false });

        this.controls?.dispose?.();
        this.controls = null;

        this._destroyDecoratorMeshes();
        this._ui?.destroy?.();
        this._ui = null;

        this._pbrLoader?.dispose?.();
        this._pbrLoader = null;

        this._disposeSceneResources();

        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this._gpuFrameTimer = null;
    }

    _createUi() {
        const pbrOptions = getPbrMaterialOptionsForBuildings();
        const textureOptions = pbrOptions.map((opt) => ({
            id: String(opt?.id ?? ''),
            label: String(opt?.label ?? opt?.id ?? ''),
            kind: 'texture',
            previewUrl: typeof opt?.previewUrl === 'string' ? opt.previewUrl : null,
            classId: typeof opt?.classId === 'string' ? opt.classId : '',
            classLabel: typeof opt?.classLabel === 'string' ? opt.classLabel : ''
        }));
        const pbrById = new Map(textureOptions.map((opt) => [opt.id, opt]));
        const wallMaterialOptions = [
            { id: WALL_MATERIAL_NONE_ID, label: 'None', kind: 'none', hex: WALL_BASE_COLOR_HEX },
            {
                id: 'pbr.plastered_wall_02',
                label: 'Painted plaster wall',
                kind: 'texture',
                previewUrl: pbrById.get('pbr.plastered_wall_02')?.previewUrl ?? ''
            },
            {
                id: 'pbr.brick_wall_11',
                label: 'Brick Wall 11',
                kind: 'texture',
                previewUrl: pbrById.get('pbr.brick_wall_11')?.previewUrl ?? ''
            }
        ];
        const colorOptions = getBeltCourseColorOptions().map((opt) => ({
            id: String(opt?.id ?? ''),
            label: String(opt?.label ?? opt?.id ?? ''),
            kind: 'color',
            hex: Number.isFinite(opt?.hex) ? Number(opt.hex) : null
        }));
        const typeOptions = this._catalogLoader.listTypeOptions();
        const typeEntries = this._catalogLoader.listTypeEntries();
        const presetOptions = this._catalogLoader.listPresetOptions();

        this._ui = new WallDecorationMeshDebuggerUI({
            initialState: this._state,
            typeOptions,
            typeEntries,
            presetOptions,
            wallMaterialOptions,
            wallMaterialId: this._wallMaterialId,
            textureOptions,
            colorOptions,
            viewMode: this._showWireframe ? 'wireframe' : 'mesh',
            wallMeshVisible: this._showWallMesh,
            dummyVisible: this._showDummy,
            onChange: (nextState) => this._applyState(nextState, { syncUi: false }),
            onLoadTypeEntry: (decoratorId) => {
                const next = loadWallDecoratorCatalogEntry(this._state, decoratorId);
                this._applyState(next, { syncUi: true });
                return this._state;
            },
            onLoadPresetEntry: (presetId) => {
                const next = loadWallDecoratorPresetEntry(this._state, presetId);
                this._applyState(next, { syncUi: true });
                return this._state;
            },
            onViewModeChange: (mode) => this._setWireframeEnabled(mode === 'wireframe'),
            onWallMeshVisibleChange: (visible) => this._setWallMeshVisible(visible),
            onDummyVisibleChange: (visible) => this._setDummyVisible(visible),
            onWallMaterialChange: (materialId) => {
                this._wallMaterialId = String(materialId ?? WALL_MATERIAL_NONE_ID);
                this._applyWallMaterialToWallMesh();
                this._reapplyDecoratorMaterials();
            }
        });
        this._ui.mount(document.body);
    }

    _applyState(nextState, { syncUi = true } = {}) {
        this._state = sanitizeWallDecoratorDebuggerState(nextState);
        if (syncUi) this._ui?.setState?.(this._state);
        this._rebuildDecoratorMeshes();
    }

    _buildStaticScene() {
        if (!this.scene) return;

        this._dummyGroup = new THREE.Group();
        this._dummyGroup.name = 'dummy_context_group';
        this.scene.add(this._dummyGroup);

        this._sky = createGradientSkyDome({
            radius: 420,
            sunDir: new THREE.Vector3(0.58, 0.78, 0.23).normalize(),
            sunIntensity: 0.85,
            atmosphere: {
                sky: {
                    horizonColor: '#A5BFD8',
                    zenithColor: '#4D78B4',
                    groundColor: '#7B8DA7',
                    curve: 0.52,
                    exposure: 1.0
                },
                haze: {
                    enabled: true,
                    intensity: 0.26,
                    thickness: 0.33,
                    curve: 1.8,
                    tintColor: '#BFD0E2',
                    tintStrength: 0.34
                }
            }
        });
        this._dummyGroup.add(this._sky);

        const ambient = new THREE.HemisphereLight(0xe5eeff, 0x463a2a, 0.95);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(11, 14, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 60.0;
        sun.shadow.camera.left = -22;
        sun.shadow.camera.right = 22;
        sun.shadow.camera.top = 22;
        sun.shadow.camera.bottom = -22;
        this.scene.add(sun);

        const fill = new THREE.DirectionalLight(0xc8deff, 0.45);
        fill.position.set(-10, 9, -10);
        this.scene.add(fill);

        const groundGeo = new THREE.PlaneGeometry(90, 90);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x4f5d6d,
            roughness: 0.9,
            metalness: 0.02
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI * 0.5;
        ground.position.set(0, 0, -WALL_SPEC.widthMeters * 0.5);
        ground.receiveShadow = true;
        ground.name = 'ground';
        this._dummyGroup.add(ground);
        this._ground = ground;

        const grid = new THREE.GridHelper(90, 90, 0x7d8d9f, 0x44505e);
        grid.position.y = 0.002;
        grid.position.z = -WALL_SPEC.widthMeters * 0.5;
        this._dummyGroup.add(grid);
        this._grid = grid;

        this._buildWalls();

        this._decoratorGroup = new THREE.Group();
        this._decoratorGroup.name = 'wall_decorator_group';
        this.scene.add(this._decoratorGroup);
        this._syncDummyVisibility();
    }

    _buildWalls() {
        if (!this.scene) return;
        const w = WALL_SPEC.widthMeters;
        const h = WALL_SPEC.heightMeters;
        const d = WALL_SPEC.depthMeters;
        const halfW = w * 0.5;
        const innerX = halfW - d;
        const frontZ = 0.0;
        const innerZ = -d;
        const backZ = -w;

        const shape = new THREE.Shape();
        // Keep the outside corner at 90deg; the 45deg wedge is the internal join from corner to offset intersection.
        shape.moveTo(-halfW, -frontZ);
        shape.lineTo(halfW, -frontZ);
        shape.lineTo(halfW, -backZ);
        shape.lineTo(innerX, -backZ);
        shape.lineTo(innerX, -innerZ);
        shape.lineTo(-halfW, -innerZ);
        shape.closePath();

        const wallGeo = new THREE.ExtrudeGeometry(shape, {
            depth: h,
            bevelEnabled: false,
            steps: 1
        });
        wallGeo.rotateX(-Math.PI * 0.5);
        wallGeo.computeVertexNormals();

        const wallMat = new THREE.MeshStandardMaterial({
            color: WALL_BASE_COLOR_HEX,
            roughness: 0.95,
            metalness: 0.02
        });

        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallMesh.name = 'wall_corner';
        this.scene.add(wallMesh);
        this._wallMesh = wallMesh;

        this._applyWallMaterialToWallMesh();
        this._syncWallMeshVisibility();
        this._syncWireframeVisuals();
    }

    _rebuildDecoratorMeshes() {
        this._destroyDecoratorMeshes();
        if (!this._decoratorGroup) return;

        const specs = this._catalogLoader.loadShapeSpecs({
            state: this._state,
            wallSpec: WALL_SPEC
        });
        if (!Array.isArray(specs) || !specs.length) return;

        for (const spec of specs) {
            const faceId = String(spec?.faceId ?? '').toLowerCase();
            const role = String(spec?.role ?? '').toLowerCase();
            const widthMeters = clamp(spec?.widthMeters, 0.01, 100.0, 1.0);
            const heightMeters = clamp(spec?.heightMeters, 0.01, 100.0, 0.2);
            const depthMeters = clamp(spec?.depthMeters, 0.005, 10.0, 0.08);
            const centerU = Number(spec?.centerU) || 0.0;
            const centerV = Number(spec?.centerV) || 0.0;
            const outsetMeters = clamp(spec?.outsetMeters ?? spec?.surfaceOffsetMeters, 0.0, 10.0, 0.0);
            const yawRadians = clamp(spec?.yawDegrees, -180.0, 180.0, 0.0) * Math.PI / 180.0;
            const geometryKind = String(spec?.geometryKind ?? '').trim().toLowerCase();
            let geo = null;
            let surfaceWidthMeters = widthMeters;
            let surfaceHeightMeters = heightMeters;
            let placementDepthMeters = depthMeters;

            if (geometryKind === 'curved_ring' || geometryKind === 'half_dome') {
                const legacyMiter = String(spec?.cornerMiter45 ?? '').trim().toLowerCase();
                const ring = createCurvedRingGeometry({
                    segmentWidthMeters: widthMeters,
                    diameterMeters: heightMeters,
                    miterStart45: spec?.miterStart45 === true || legacyMiter === 'negative_u',
                    miterEnd45: spec?.miterEnd45 === true || legacyMiter === 'positive_u'
                });
                geo = ring.geometry;
                surfaceWidthMeters = ring.widthMeters;
                surfaceHeightMeters = ring.heightMeters;
                placementDepthMeters = ring.depthMeters;
            } else if (geometryKind === 'edge_brick_chain_course') {
                const mitered = createMiteredBoxGeometry({
                    widthMeters,
                    heightMeters,
                    depthMeters,
                    miterStart45: spec?.miterStart45 === true,
                    miterEnd45: spec?.miterEnd45 === true
                });
                geo = mitered.geometry;
                surfaceWidthMeters = mitered.widthMeters;
                surfaceHeightMeters = mitered.heightMeters;
                placementDepthMeters = mitered.depthMeters;
            } else if (geometryKind === 'angled_support_profile') {
                const profile = createAngledSupportProfileGeometry({
                    segmentWidthMeters: widthMeters,
                    offsetMeters: clamp(spec?.profileOffsetMeters ?? depthMeters, 0.005, 10.0, depthMeters),
                    shiftMeters: clamp(spec?.profileShiftMeters, -10.0, 10.0, 0.0),
                    returnHeightMeters: clamp(spec?.profileReturnHeightMeters ?? heightMeters, 0.01, 10.0, heightMeters),
                    miterStart45: spec?.miterStart45 === true,
                    miterEnd45: spec?.miterEnd45 === true
                });
                geo = profile.geometry;
                surfaceWidthMeters = profile.widthMeters;
                surfaceHeightMeters = profile.heightMeters;
                placementDepthMeters = profile.depthMeters;
            } else {
                const wantsGenericMiter = spec?.miterStart45 === true || spec?.miterEnd45 === true;
                if (wantsGenericMiter) {
                    const mitered = createMiteredBoxGeometry({
                        widthMeters,
                        heightMeters,
                        depthMeters,
                        miterStart45: spec?.miterStart45 === true,
                        miterEnd45: spec?.miterEnd45 === true
                    });
                    geo = mitered.geometry;
                    surfaceWidthMeters = mitered.widthMeters;
                    surfaceHeightMeters = mitered.heightMeters;
                    placementDepthMeters = mitered.depthMeters;
                } else {
                    geo = new THREE.BoxGeometry(widthMeters, heightMeters, depthMeters);
                }
            }
            const mat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.85,
                metalness: 0.0
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (faceId === 'right') {
                mesh.rotation.y = Math.PI * 0.5 + yawRadians;
                mesh.position.set(
                    WALL_SPEC.widthMeters * 0.5 + outsetMeters + placementDepthMeters * 0.5,
                    centerV + WALL_SPEC.heightMeters * 0.5,
                    -centerU
                );
            } else {
                mesh.rotation.y = yawRadians;
                mesh.position.set(
                    centerU,
                    centerV + WALL_SPEC.heightMeters * 0.5,
                    outsetMeters + placementDepthMeters * 0.5
                );
            }

            mesh.userData.surfaceSizeMeters = {
                width: surfaceWidthMeters,
                height: surfaceHeightMeters
            };
            mesh.userData.faceId = faceId || 'front';
            mesh.userData.role = role || 'decorator';
            mesh.userData.geometryKind = geometryKind || 'box';

            this._applyStateMaterialToMesh(mesh);
            this._decoratorGroup.add(mesh);
            this._decoratorMeshes.push(mesh);
        }
    }

    _destroyDecoratorMeshes() {
        for (const mesh of this._decoratorMeshes) {
            if (mesh?.parent) mesh.parent.remove(mesh);
            mesh?.geometry?.dispose?.();
            const mat = mesh?.material;
            if (Array.isArray(mat)) {
                for (const m of mat) {
                    disposeMaterialMaps(m);
                    m?.dispose?.();
                }
            } else if (mat) {
                disposeMaterialMaps(mat);
                mat.dispose?.();
            }
        }
        this._decoratorMeshes.length = 0;
    }

    _reapplyDecoratorMaterials() {
        for (const mesh of this._decoratorMeshes) this._applyStateMaterialToMesh(mesh);
    }

    _isRibbonDecoratorActive() {
        return String(this._state?.decoratorId ?? '').trim().toLowerCase() === WALL_DECORATOR_ID.RIBBON;
    }

    _applyRibbonPatternNormalMapToMaterial(
        mat,
        {
            repeatU = 1.0,
            repeatV = 1.0,
            offsetU = 0.0,
            offsetV = 0.0,
            rotationDegrees = 0.0
        } = {}
    ) {
        if (!mat || !this._isRibbonDecoratorActive()) return;
        const cfg = this._state?.configuration ?? {};
        const patternId = normalizeRibbonPatternId(cfg?.patternId);
        const patternNormalIntensity = clamp(cfg?.patternNormalIntensity, 0.1, 4.0, 1.4);
        const ribbonNormal = createRibbonPatternNormalTexture({
            patternId,
            size: 128,
            normalIntensity: patternNormalIntensity
        });
        const prevNormal = mat.normalMap;
        mat.normalMap = ribbonNormal;
        if (prevNormal?.isTexture && prevNormal !== ribbonNormal) prevNormal.dispose?.();
        applyTextureTransform(mat.normalMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        mat.userData = mat.userData ?? {};
        mat.userData.ribbonPatternNormalMap = ribbonNormal;
    }

    _setMaterialWireframe(mat, enabled) {
        const material = mat && typeof mat === 'object' ? mat : null;
        if (!material) return;
        if (!Object.prototype.hasOwnProperty.call(material, 'wireframe') && !('wireframe' in material)) return;
        const next = !!enabled;
        if (material.wireframe === next) return;
        material.wireframe = next;
        material.needsUpdate = true;
    }

    _setMeshWireframe(mesh, enabled) {
        if (!mesh || !mesh.isMesh) return;
        const mat = mesh.material;
        if (Array.isArray(mat)) {
            for (const material of mat) this._setMaterialWireframe(material, enabled);
            return;
        }
        this._setMaterialWireframe(mat, enabled);
    }

    _syncWireframeVisuals() {
        const enabled = !!this._showWireframe;
        this._setMeshWireframe(this._ground, enabled);
        this._setMeshWireframe(this._wallMesh, enabled);
        for (const mesh of this._decoratorMeshes) this._setMeshWireframe(mesh, enabled);
    }

    _setWireframeEnabled(enabled) {
        const next = !!enabled;
        if (next === this._showWireframe) return;
        this._showWireframe = next;
        this._syncWireframeVisuals();
    }

    _syncWallMeshVisibility() {
        if (!this._wallMesh) return;
        this._wallMesh.visible = !!this._showWallMesh;
    }

    _setWallMeshVisible(enabled) {
        const next = !!enabled;
        if (next === this._showWallMesh) {
            this._syncWallMeshVisibility();
            return;
        }
        this._showWallMesh = next;
        this._syncWallMeshVisibility();
    }

    _syncDummyVisibility() {
        if (this._dummyGroup) {
            this._dummyGroup.visible = !!this._showDummy;
            return;
        }
        if (this._sky) this._sky.visible = !!this._showDummy;
        if (this._ground) this._ground.visible = !!this._showDummy;
        if (this._grid) this._grid.visible = !!this._showDummy;
    }

    _setDummyVisible(enabled) {
        const next = !!enabled;
        if (next === this._showDummy) {
            this._syncDummyVisibility();
            return;
        }
        this._showDummy = next;
        this._syncDummyVisibility();
    }

    _applyWallMaterialToWallMesh() {
        const wallMesh = this._wallMesh?.isMesh ? this._wallMesh : null;
        const mat = wallMesh?.material?.isMeshStandardMaterial ? wallMesh.material : null;
        if (!mat) return;

        const materialId = String(this._wallMaterialId ?? WALL_MATERIAL_NONE_ID).trim() || WALL_MATERIAL_NONE_ID;
        if (materialId === WALL_MATERIAL_NONE_ID) {
            disposeMaterialMaps(mat);
            mat.color.setHex(WALL_BASE_COLOR_HEX);
            mat.roughness = 0.95;
            mat.metalness = 0.02;
            if (mat.normalScale?.set) mat.normalScale.set(1, 1);
            mat.wireframe = !!this._showWireframe;
            mat.needsUpdate = true;
            return;
        }

        const payload = this._pbrLoader?.resolveMaterial(materialId, { cloneTextures: true }) ?? null;
        if (payload) applyResolvedPbrToStandardMaterial(mat, payload, { clearOnMissing: true });
        else disposeMaterialMaps(mat);

        const isPlasterPreview = materialId === 'pbr.plastered_wall_02';
        const tileMeters = isPlasterPreview ? 2.0 : clamp(getPbrMaterialTileMeters(materialId), 0.1, 100.0, 2.0);
        const repeatU = WALL_SPEC.widthMeters / tileMeters;
        const repeatV = WALL_SPEC.heightMeters / tileMeters;
        const rotationDegrees = isPlasterPreview ? 90.0 : 0.0;
        applyTextureTransform(mat.map, { repeatU, repeatV, rotationDegrees });
        applyTextureTransform(mat.normalMap, { repeatU, repeatV, rotationDegrees });
        applyTextureTransform(mat.roughnessMap, { repeatU, repeatV, rotationDegrees });
        applyTextureTransform(mat.metalnessMap, { repeatU, repeatV, rotationDegrees });
        applyTextureTransform(mat.aoMap, { repeatU, repeatV, rotationDegrees });

        mat.color.setHex(0xffffff);
        mat.wireframe = !!this._showWireframe;
        mat.needsUpdate = true;
    }

    _applyStateMaterialToMesh(mesh) {
        const mat = mesh?.material?.isMeshStandardMaterial ? mesh.material : null;
        if (!mat) return;
        disposeTrackedRibbonPatternNormalMap(mat);

        const materialSelection = this._state.materialSelection ?? {};
        const materialKindRaw = typeof materialSelection?.kind === 'string' ? materialSelection.kind.trim().toLowerCase() : '';
        const isMatchWall = materialKindRaw === 'match_wall' || materialKindRaw === 'match wall' || materialKindRaw === 'matchwall';
        const wallBase = this._state.wallBase ?? {};
        const tiling = this._state.tiling ?? {};
        const isTexture = !isMatchWall && materialKindRaw !== 'color';
        const ribbonActive = this._isRibbonDecoratorActive();
        const normalStrength = clamp(wallBase.normalStrength, 0.0, 2.0, 0.9);
        const roughness = clamp(wallBase.roughness, 0.0, 1.0, 0.85);

        const surface = mesh?.userData?.surfaceSizeMeters ?? {};
        const width = clamp(surface.width, 0.01, 100.0, 1.0);
        const height = clamp(surface.height, 0.01, 100.0, 1.0);
        const ribbonRepeatU = Math.max(1.0, width / 0.35);
        const ribbonRepeatV = Math.max(1.0, height / 0.35);

        if (isMatchWall) {
            const wallMaterialId = String(this._wallMaterialId ?? WALL_MATERIAL_NONE_ID).trim() || WALL_MATERIAL_NONE_ID;
            if (wallMaterialId === WALL_MATERIAL_NONE_ID) {
                disposeMaterialMaps(mat);
                mat.color.setHex(WALL_BASE_COLOR_HEX);
                mat.roughness = 0.95;
                mat.metalness = 0.02;
                if (ribbonActive) {
                    this._applyRibbonPatternNormalMapToMaterial(mat, {
                        repeatU: ribbonRepeatU,
                        repeatV: ribbonRepeatV
                    });
                    if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);
                } else if (mat.normalScale?.set) {
                    mat.normalScale.set(1, 1);
                }
                mat.wireframe = !!this._showWireframe;
                mat.needsUpdate = true;
                return;
            }

            const payload = this._pbrLoader?.resolveMaterial(wallMaterialId, { cloneTextures: true }) ?? null;
            if (payload) applyResolvedPbrToStandardMaterial(mat, payload, { clearOnMissing: true });
            else disposeMaterialMaps(mat);

            const isPlasterPreview = wallMaterialId === 'pbr.plastered_wall_02';
            const tileMeters = isPlasterPreview ? 2.0 : clamp(getPbrMaterialTileMeters(wallMaterialId), 0.1, 100.0, 2.0);
            const repeatU = width / tileMeters;
            const repeatV = height / tileMeters;
            const rotationDegrees = isPlasterPreview ? 90.0 : 0.0;
            applyTextureTransform(mat.map, { repeatU, repeatV, rotationDegrees });
            applyTextureTransform(mat.normalMap, { repeatU, repeatV, rotationDegrees });
            applyTextureTransform(mat.roughnessMap, { repeatU, repeatV, rotationDegrees });
            applyTextureTransform(mat.metalnessMap, { repeatU, repeatV, rotationDegrees });
            applyTextureTransform(mat.aoMap, { repeatU, repeatV, rotationDegrees });
            this._applyRibbonPatternNormalMapToMaterial(mat, { repeatU, repeatV, rotationDegrees });
            if (ribbonActive && mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);

            mat.color.setHex(0xffffff);
            mat.wireframe = !!this._showWireframe;
            mat.needsUpdate = true;
            return;
        }

        if (!isTexture) {
            const colorHex = this._beltColorById.get(String(materialSelection.id ?? '')) ?? 0xffffff;
            disposeMaterialMaps(mat);
            mat.color.setHex((Number(colorHex) >>> 0) & 0xffffff);
            mat.roughness = roughness;
            mat.metalness = 0.02;
            if (ribbonActive) {
                this._applyRibbonPatternNormalMapToMaterial(mat, {
                    repeatU: ribbonRepeatU,
                    repeatV: ribbonRepeatV
                });
                if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);
            } else {
                mat.normalMap = null;
                if (mat.normalScale?.set) mat.normalScale.set(1, 1);
            }
            mat.wireframe = !!this._showWireframe;
            mat.needsUpdate = true;
            return;
        }

        const materialId = String(materialSelection.id ?? '').trim() || 'pbr.brick_wall_11';
        const payload = this._pbrLoader?.resolveMaterial(materialId, { cloneTextures: true }) ?? null;
        if (payload) applyResolvedPbrToStandardMaterial(mat, payload, { clearOnMissing: true });
        mat.color.setHex(resolveWallBaseTintHexFromWallBase(wallBase));
        mat.roughness = roughness;
        if (mat.normalScale?.set) mat.normalScale.set(normalStrength, normalStrength);

        const defaultTileMeters = clamp(getPbrMaterialTileMeters(materialId), 0.1, 100.0, 2.0);
        const tileU = tiling.enabled ? clamp(tiling.tileMetersU, 0.1, 100.0, defaultTileMeters) : defaultTileMeters;
        const tileV = tiling.enabled ? clamp(tiling.tileMetersV, 0.1, 100.0, defaultTileMeters) : defaultTileMeters;
        const repeatU = width / tileU;
        const repeatV = height / tileV;
        const uvEnabled = !!tiling.uvEnabled;
        const offsetU = uvEnabled ? clamp(tiling.offsetU, -10.0, 10.0, 0.0) : 0.0;
        const offsetV = uvEnabled ? clamp(tiling.offsetV, -10.0, 10.0, 0.0) : 0.0;
        const rotationDegrees = uvEnabled ? clamp(tiling.rotationDegrees, -180.0, 180.0, 0.0) : 0.0;

        applyTextureTransform(mat.map, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.normalMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.roughnessMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.metalnessMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        applyTextureTransform(mat.aoMap, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });
        this._applyRibbonPatternNormalMapToMaterial(mat, { repeatU, repeatV, offsetU, offsetV, rotationDegrees });

        mat.wireframe = !!this._showWireframe;
        mat.needsUpdate = true;
    }

    _disposeSceneResources() {
        const scene = this.scene;
        if (!scene) return;
        scene.traverse((obj) => {
            if (obj?.isMesh) {
                obj.geometry?.dispose?.();
                const mat = obj.material;
                if (Array.isArray(mat)) {
                    for (const m of mat) {
                        disposeMaterialMaps(m);
                        m?.dispose?.();
                    }
                } else if (mat) {
                    disposeMaterialMaps(mat);
                    mat.dispose?.();
                }
            }
            if (obj?.isLineSegments && obj.geometry) obj.geometry.dispose?.();
        });
    }

    _handleKeyDown(e) {
        if (!e) return;
        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
        const code = String(e.code || e.key || '').toLowerCase();
        if (code === 'keyf' || code === 'f') {
            e.preventDefault();
            this.controls?.frame?.();
            return;
        }
        if (code === 'keyr' || code === 'r') {
            e.preventDefault();
            this.controls?.reset?.();
        }
    }

    _resize() {
        if (!this.renderer || !this.camera || !this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(Number(rect.width) || 1));
        const height = Math.max(1, Math.floor(Number(rect.height) || 1));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}
