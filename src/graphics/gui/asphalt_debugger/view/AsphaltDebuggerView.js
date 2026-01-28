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
import { getResolvedAsphaltNoiseSettings, saveAsphaltNoiseSettings } from '../../../visuals/city/AsphaltNoiseSettings.js';
import { getResolvedBuildingWindowVisualsSettings, saveBuildingWindowVisualsSettings } from '../../../visuals/buildings/BuildingWindowVisualsSettings.js';
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

        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(city.materials.laneWhite, {
            asphaltNoise,
            asphaltFineRoughnessMap: city.materials.road?.roughnessMap ?? null,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength
        });
        applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial(city.materials.laneYellow, {
            asphaltNoise,
            asphaltFineRoughnessMap: city.materials.road?.roughnessMap ?? null,
            asphaltFineScale: asphaltNoise?.fine?.scale,
            asphaltFineBaseRoughness: 0.95,
            asphaltFineRoughnessStrength: asphaltNoise?.fine?.roughnessStrength
        });

        const edgeMats = new Set();
        if (city.materials.roadEdgeWear?.isMeshStandardMaterial) edgeMats.add(city.materials.roadEdgeWear);
        if (city.roads?.asphaltEdgeWear?.material?.isMeshStandardMaterial) edgeMats.add(city.roads.asphaltEdgeWear.material);
        for (const mat of edgeMats) {
            applyAsphaltEdgeWearVisualsToMeshStandardMaterial(mat, {
                asphaltNoise,
                seed: roadSeed,
                maxWidth: 1.25
            });
        }
    }
}
