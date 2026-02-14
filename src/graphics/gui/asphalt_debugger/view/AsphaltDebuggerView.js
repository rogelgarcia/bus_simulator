// src/graphics/gui/asphalt_debugger/view/AsphaltDebuggerView.js
// Renders a small road/asphalt scene using the gameplay GameEngine + docked options panel.
// @ts-check

import * as THREE from 'three';
import { GameEngine } from '../../../../app/core/GameEngine.js';
import { City } from '../../../visuals/city/City.js';
import { createCityConfig } from '../../../../app/city/CityConfig.js';
import { OptionsUI } from '../../options/OptionsUI.js';
import { createToolCameraController } from '../../../engine3d/camera/ToolCameraPrefab.js';
import { applyAsphaltRoadVisualsToMeshStandardMaterial } from '../../../visuals/city/AsphaltRoadVisuals.js';
import { applyAsphaltEdgeWearVisualsToMeshStandardMaterial } from '../../../visuals/city/AsphaltEdgeWearVisuals.js';
import { applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial } from '../../../visuals/city/AsphaltMarkingsNoiseVisuals.js';
import { applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial, getSidewalkEdgeDirtStripConfig } from '../../../visuals/city/SidewalkEdgeDirtStripVisuals.js';
import { getResolvedAsphaltNoiseSettings, saveAsphaltNoiseSettings } from '../../../visuals/city/AsphaltNoiseSettings.js';
import { getResolvedBuildingWindowVisualsSettings, saveBuildingWindowVisualsSettings } from '../../../visuals/buildings/BuildingWindowVisualsSettings.js';
import { ROAD_MARKING_WHITE_TARGET_SUN_HEX, ROAD_MARKING_YELLOW_TARGET_SUN_HEX, hexToCssColor } from '../../../assets3d/materials/RoadMarkingsColors.js';
import { saveLightingSettings } from '../../../lighting/LightingSettings.js';
import { saveBloomSettings } from '../../../visuals/postprocessing/BloomSettings.js';
import { saveSunBloomSettings } from '../../../visuals/postprocessing/SunBloomSettings.js';
import { saveColorGradingSettings } from '../../../visuals/postprocessing/ColorGradingSettings.js';
import { getResolvedSunFlareSettings, saveSunFlareSettings } from '../../../visuals/sun/SunFlareSettings.js';

function deepClone(obj) {
    return obj && typeof obj === 'object' ? JSON.parse(JSON.stringify(obj)) : null;
}

function makeStraightRoadSpec({ config, seed }) {
    const tileSize = config.map.tileSize;
    const origin = config.map.origin;
    const toWorld = ([x, y]) => ({ x: origin.x + (x | 0) * tileSize, z: origin.z + (y | 0) * tileSize });

    return {
        version: 1,
        seed,
        width: config.map.width,
        height: config.map.height,
        tileSize,
        origin,
        roads: [
            {
                points: [toWorld([1, 4]), toWorld([7, 4])],
                lanesF: 2,
                lanesB: 2,
                tag: 'straight'
            }
        ],
        buildings: []
    };
}

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function getDrawSize(renderer) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    return { w: Math.max(1, Math.floor(size.x)), h: Math.max(1, Math.floor(size.y)) };
}

function sampleAverageSrgbHexAtWorldPos(renderer, camera, worldPos, { size = 7 } = {}) {
    const { w, h } = getDrawSize(renderer);
    const ndc = worldPos.clone().project(camera);

    const cx = Math.round((ndc.x * 0.5 + 0.5) * (w - 1));
    const cy = Math.round((ndc.y * 0.5 + 0.5) * (h - 1));

    const s = Math.max(1, Math.floor(size));
    const half = Math.floor(s / 2);
    const x0 = Math.max(0, Math.min(w - s, cx - half));
    const y0 = Math.max(0, Math.min(h - s, cy - half));

    const gl = renderer.getContext();
    const pixels = new Uint8Array(s * s * 4);
    gl.readPixels(x0, y0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let r = 0;
    let g = 0;
    let b = 0;
    const n = s * s;
    for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
    }
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    return {
        hex: `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`,
        sample: { x: cx, y: cy, size: s }
    };
}

function getMeshTriangleCentroidWorld(mesh, { sampleTriangleIndex = 0.5 } = {}) {
    const m = mesh?.isMesh ? mesh : null;
    const geo = m?.geometry ?? null;
    const posAttr = geo?.getAttribute?.('position') ?? geo?.attributes?.position ?? null;
    if (!posAttr || !posAttr.isBufferAttribute || posAttr.itemSize !== 3) return null;
    const arr = posAttr.array;
    const vertCount = posAttr.count | 0;
    if (!arr || vertCount < 3) return null;

    const triCount = Math.floor(vertCount / 3);
    const triIdx = clamp(sampleTriangleIndex, 0, 1, 0.5);
    const t = Math.max(0, Math.min(triCount - 1, Math.floor(triCount * triIdx)));
    const v0 = t * 3;
    const i0 = v0 * 3;
    const i1 = (v0 + 1) * 3;
    const i2 = (v0 + 2) * 3;

    const cx = (arr[i0] + arr[i1] + arr[i2]) / 3;
    const cy = (arr[i0 + 1] + arr[i1 + 1] + arr[i2 + 1]) / 3;
    const cz = (arr[i0 + 2] + arr[i1 + 2] + arr[i2 + 2]) / 3;

    const out = new THREE.Vector3(cx, cy, cz);
    m.updateMatrixWorld?.(true);
    return out.applyMatrix4(m.matrixWorld);
}

export class AsphaltDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;
        this.engine = null;
        this.city = null;
        this.controls = null;
        this._ui = null;
        this._original = null;
        this._raf = 0;
        this._lastT = 0;
    }

    async start() {
        if (!this.canvas) throw new Error('[AsphaltDebugger] Missing canvas');
        if (this.engine) return;

        const engine = new GameEngine({
            canvas: this.canvas,
            autoResize: true
        });
        this.engine = engine;

        const seed = 'asphalt-debug';
        const cfg = createCityConfig({ size: 220, tileMeters: 2, mapTileSize: 24, seed });
        const mapSpec = makeStraightRoadSpec({ config: cfg, seed });
        const city = new City({
            size: 220,
            tileMeters: 2,
            mapTileSize: 24,
            seed,
            mapSpec,
            generatorConfig: { render: { treesEnabled: false } }
        });
        this.city = city;
        city.attach(engine);
        engine.context.city = city;

        engine.camera.position.set(0, 55, 65);
        engine.camera.lookAt(0, 0, 0);

        const lighting = deepClone(engine.lightingSettings);
        const bloom = deepClone(engine.bloomSettings);
        const grading = deepClone(engine.colorGradingSettings);
        const postActive = !!engine.isPostProcessingActive;
        const gradingDebug = engine.getColorGradingDebugInfo?.() ?? null;
        const sunFlare = deepClone(getResolvedSunFlareSettings());
        const buildingWindowVisuals = deepClone(getResolvedBuildingWindowVisualsSettings());
        const asphaltNoise = deepClone(getResolvedAsphaltNoiseSettings());

        this._original = {
            lighting: deepClone(lighting),
            bloom: deepClone(bloom),
            colorGrading: deepClone(grading),
            buildingWindowVisuals: deepClone(buildingWindowVisuals),
            sunFlare: deepClone(sunFlare),
            asphaltNoise: deepClone(asphaltNoise)
        };

        this._ui = new OptionsUI({
            visibleTabs: ['asphalt'],
            titleText: 'Asphalt Debugger',
            subtitleText: 'Straight road preset · Esc returns to Welcome',
            initialTab: 'asphalt',
            initialLighting: lighting,
            initialBloom: bloom,
            initialColorGrading: grading,
            initialBuildingWindowVisuals: buildingWindowVisuals,
            initialAsphaltNoise: asphaltNoise,
            initialSunFlare: sunFlare,
            initialPostProcessingActive: postActive,
            initialColorGradingDebug: gradingDebug,
            markingsCalibration: {
                targetYellow: hexToCssColor(ROAD_MARKING_YELLOW_TARGET_SUN_HEX).toUpperCase(),
                targetWhite: hexToCssColor(ROAD_MARKING_WHITE_TARGET_SUN_HEX).toUpperCase(),
                noteText: 'Samples lane marking meshes (fixed camera pose; uses current lighting + tone mapping).',
                onSample: () => this._sampleMarkingsCalibration()
            },
            getIblDebugInfo: () => engine.getIBLDebugInfo?.() ?? null,
            getPostProcessingDebugInfo: () => ({
                postActive: !!engine.isPostProcessingActive,
                bloom: engine.getBloomDebugInfo?.() ?? null,
                colorGrading: engine.getColorGradingDebugInfo?.() ?? null
            }),
            onCancel: () => this._restoreOriginal(),
            onLiveChange: (draft) => this._applyDraft(draft),
            onSave: (draft) => this._save(draft)
        });
        this._ui.mount();

        this.controls = createToolCameraController(engine.camera, this.canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.95,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 0.25,
            maxDistance: 600,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({ center: new THREE.Vector3(0, 0, 0), radius: 70 }),
            initialPose: {
                position: new THREE.Vector3(0, 55, 65),
                target: new THREE.Vector3(0, 0, 0)
            }
        });

        requestAnimationFrame(() => this.engine?.resize?.());
        this._lastT = performance.now();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        this.controls?.dispose?.();
        this.controls = null;

        this._ui?.unmount?.();
        this._ui = null;

        if (this.city && this.engine) this.city.detach(this.engine);
        this.city = null;

        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
    }

    _tick(t) {
        if (!this.engine) return;
        const dt = Math.min((t - this._lastT) / 1000, 0.05);
        this._lastT = t;
        this.controls?.update?.(dt);
        this.engine.updateFrame(dt, { render: true, nowMs: t });
        this._raf = requestAnimationFrame((tt) => this._tick(tt));
    }

    _restoreOriginal() {
        if (!this._original) return;
        this._applyDraft(this._original);
    }

    _save(draft) {
        saveLightingSettings(draft?.lighting ?? null);
        saveBloomSettings(draft?.bloom ?? null);
        saveSunBloomSettings(draft?.sunBloom ?? null);
        saveColorGradingSettings(draft?.colorGrading ?? null);
        saveBuildingWindowVisualsSettings(draft?.buildingWindowVisuals ?? null);
        saveSunFlareSettings(draft?.sunFlare ?? null);
        saveAsphaltNoiseSettings(draft?.asphaltNoise ?? null);
    }

    _applyDraft(draft) {
        const d = draft && typeof draft === 'object' ? draft : null;
        const lighting = d?.lighting ?? null;
        const bloom = d?.bloom ?? null;
        const sunBloom = d?.sunBloom ?? null;
        const grading = d?.colorGrading ?? null;
        const sunFlare = d?.sunFlare ?? null;
        const asphaltNoise = d?.asphaltNoise ?? null;

        this.engine?.setLightingSettings?.(lighting ?? null);
        if (bloom) this.engine?.setBloomSettings?.(bloom);
        if (sunBloom) this.engine?.setSunBloomSettings?.(sunBloom);
        if (grading) this.engine?.setColorGradingSettings?.(grading);

        const city = this.city ?? null;
        if (lighting && city) {
            if (city?.hemi) city.hemi.intensity = lighting.hemiIntensity;
            if (city?.sun) city.sun.intensity = lighting.sunIntensity;
        }

        if (sunFlare && city?.sunFlare?.setSettings) {
            city.sunFlare.setSettings(sunFlare);
        }
        if (sunBloom && city?.sunBloom?.setSettings) {
            city.sunBloom.setSettings(sunBloom);
        }
        if (sunBloom && city?.sunRays?.setSettings) {
            city.sunRays.setSettings(sunBloom);
        }

        if (!asphaltNoise || !city?.materials?.road) return;
        const roadSeed = city?.map?.roadNetwork?.seed ?? 'roads';

        const mats = new Set();
        if (city.materials.road?.isMeshStandardMaterial) mats.add(city.materials.road);
        if (city.roads?.asphalt?.material?.isMeshStandardMaterial) mats.add(city.roads.asphalt.material);
        for (const mat of mats) {
            applyAsphaltRoadVisualsToMeshStandardMaterial(mat, {
                asphaltNoise,
                seed: roadSeed,
                baseColorHex: 0x2b2b2b,
                baseRoughness: 0.95
            });
        }

        const asphaltFineRoughnessMap = city.materials.road?.userData?.asphaltFineTextures?.roughnessMap ?? city.materials.road?.roughnessMap ?? null;
        const asphaltFineNormalMap = city.materials.road?.userData?.asphaltFineTextures?.normalMap ?? city.materials.road?.normalMap ?? null;
        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(city.materials.laneWhite, {
            asphaltNoise,
            asphaltFineRoughnessMap,
            asphaltFineNormalMap,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength,
            asphaltFineNormalStrength: asphaltNoise?.fine?.normalStrength
        });
        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(city.materials.laneYellow, {
            asphaltNoise,
            asphaltFineRoughnessMap,
            asphaltFineNormalMap,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength,
            asphaltFineNormalStrength: asphaltNoise?.fine?.normalStrength
        });

        const edgeMats = new Set();
        if (city.materials.roadEdgeWear?.isMeshStandardMaterial) edgeMats.add(city.materials.roadEdgeWear);
        if (city.roads?.asphaltEdgeWear?.material?.isMeshStandardMaterial) edgeMats.add(city.roads.asphaltEdgeWear.material);
        for (const mat of edgeMats) {
            applyAsphaltEdgeWearVisualsToMeshStandardMaterial(mat, {
                asphaltNoise,
                seed: roadSeed,
                maxWidth: 2.5
            });
        }

        const stripConfig = getSidewalkEdgeDirtStripConfig(asphaltNoise);
        const stripMats = new Set();
        if (city.materials.sidewalkEdgeDirt?.isMeshStandardMaterial) stripMats.add(city.materials.sidewalkEdgeDirt);
        if (city.roads?.sidewalkEdgeDirt?.material?.isMeshStandardMaterial) stripMats.add(city.roads.sidewalkEdgeDirt.material);
        for (const mat of stripMats) {
            applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial(mat, { asphaltNoise });
        }
        if (city.roads?.sidewalkEdgeDirt?.isMesh) {
            city.roads.sidewalkEdgeDirt.visible = stripConfig.enabled;
        }
    }

    _sampleMarkingsCalibration() {
        const engine = this.engine;
        const city = this.city;
        const controls = this.controls;
        const renderer = engine?.renderer ?? null;
        const camera = engine?.camera ?? null;
        if (!renderer || !camera || !city?.roads) throw new Error('Missing renderer/camera/city roads.');

        const yellowMesh = city.roads.markingsYellow ?? null;
        const whiteMesh = city.roads.markingsWhite ?? null;
        const yellowPos = getMeshTriangleCentroidWorld(yellowMesh, { sampleTriangleIndex: 0.5 });
        const whitePos = getMeshTriangleCentroidWorld(whiteMesh, { sampleTriangleIndex: 0.5 });
        if (!yellowPos || !whitePos) throw new Error('Missing lane marking meshes (yellow/white).');

        const prevPosition = camera.position.clone();
        const prevTarget = controls?.target?.clone?.() ?? new THREE.Vector3(0, 0, 0);

        try {
            const focus = yellowPos.clone().add(whitePos).multiplyScalar(0.5);
            const dir = new THREE.Vector3(0.0, 0.33, 1.0).normalize();
            const dist = 18;
            const position = focus.clone().addScaledVector(dir, dist);
            position.y = Math.max(position.y, focus.y + 2.5);

            if (controls?.setLookAt) controls.setLookAt({ position, target: focus });
            else {
                camera.position.copy(position);
                camera.lookAt(focus);
                camera.updateMatrixWorld?.();
            }

            engine.updateFrame(0, { render: true, nowMs: performance.now() });

            const yellow = sampleAverageSrgbHexAtWorldPos(renderer, camera, yellowPos, { size: 9 });
            const white = sampleAverageSrgbHexAtWorldPos(renderer, camera, whitePos, { size: 9 });
            return { yellow, white };
        } finally {
            if (controls?.setLookAt) controls.setLookAt({ position: prevPosition, target: prevTarget });
            else {
                camera.position.copy(prevPosition);
                camera.lookAt(prevTarget);
                camera.updateMatrixWorld?.();
            }
        }
    }
}
