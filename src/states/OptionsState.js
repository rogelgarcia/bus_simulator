// src/states/OptionsState.js
// In-game options overlay state (tabbed, persisted settings).

import { OptionsUI } from '../graphics/gui/options/OptionsUI.js';
import { applyAsphaltRoadVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltRoadVisuals.js';
import { applyAsphaltEdgeWearVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltEdgeWearVisuals.js';
import { applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js';
import { applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial, getSidewalkEdgeDirtStripConfig } from '../graphics/visuals/city/SidewalkEdgeDirtStripVisuals.js';
import { saveLightingSettings } from '../graphics/lighting/LightingSettings.js';
import { getResolvedShadowSettings, saveShadowSettings } from '../graphics/lighting/ShadowSettings.js';
import { saveAntiAliasingSettings } from '../graphics/visuals/postprocessing/AntiAliasingSettings.js';
import { saveAmbientOcclusionSettings } from '../graphics/visuals/postprocessing/AmbientOcclusionSettings.js';
import { saveBloomSettings } from '../graphics/visuals/postprocessing/BloomSettings.js';
import { saveSunBloomSettings } from '../graphics/visuals/postprocessing/SunBloomSettings.js';
import { getResolvedAsphaltNoiseSettings, saveAsphaltNoiseSettings } from '../graphics/visuals/city/AsphaltNoiseSettings.js';
import { getResolvedBuildingWindowVisualsSettings, sanitizeBuildingWindowVisualsSettings, saveBuildingWindowVisualsSettings } from '../graphics/visuals/buildings/BuildingWindowVisualsSettings.js';
import { applyBuildingWindowVisualsToCityMeshes } from '../graphics/visuals/buildings/BuildingWindowVisualsRuntime.js';
import { saveColorGradingSettings } from '../graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getResolvedSunFlareSettings, saveSunFlareSettings } from '../graphics/visuals/sun/SunFlareSettings.js';
import { saveAtmosphereSettings } from '../graphics/visuals/atmosphere/AtmosphereSettings.js';
import { getResolvedVehicleMotionDebugSettings, saveVehicleMotionDebugSettings } from '../app/vehicle/VehicleMotionDebugSettings.js';

function isEditableTarget(target) {
    const el = target && typeof target === 'object' ? target : null;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!el.isContentEditable;
}

export class OptionsState {
    constructor(engine, sm) {
        this.engine = engine;
        this.sm = sm;

        this._returnTo = 'welcome';
        this._overlay = false;
        this._ui = null;
        this._original = null;
        this._onKeyDown = (e) => this._handleKeyDown(e);
    }

    enter(params = {}) {
        const prev = typeof params?.returnTo === 'string' ? params.returnTo : null;
        this._returnTo = prev && prev !== 'options' ? prev : 'welcome';
        this._overlay = !!params?.overlay;

        if (!this._overlay) {
            document.body.classList.add('options-dock-open');
            requestAnimationFrame(() => this.engine?.resize?.());
        }

        if (!this._overlay) {
            document.body.classList.remove('splash-bg');
            document.body.classList.remove('setup-bg');
        }

        document.activeElement?.blur?.();

        const lighting = this.engine?.lightingSettings ?? null;
        const atmosphere = this.engine?.atmosphereSettings ?? null;
        const shadows = this.engine?.shadowSettings ?? getResolvedShadowSettings();
        const antiAliasing = this.engine?.antiAliasingSettings ?? null;
        const ambientOcclusion = this.engine?.ambientOcclusionSettings ?? null;
        const bloom = this.engine?.bloomSettings ?? null;
        const sunBloom = this.engine?.sunBloomSettings ?? null;
        const postActive = this.engine?.isPostProcessingActive ?? false;
        const grading = this.engine?.colorGradingSettings ?? null;
        const gradingDebug = this.engine?.getColorGradingDebugInfo?.() ?? null;
        const probe = this.engine?.scene?.getObjectByName?.('ibl_probe_sphere') ?? null;
        const showProbeSphere = probe ? probe.visible !== false : false;
        const sunFlare = getResolvedSunFlareSettings();
        const buildingWindowVisuals = getResolvedBuildingWindowVisualsSettings();
        const asphaltNoise = getResolvedAsphaltNoiseSettings();
        const vehicleMotionDebug = this.engine?.vehicleMotionDebugSettings ?? getResolvedVehicleMotionDebugSettings();

        this._original = {
            lighting: lighting && typeof lighting === 'object' ? JSON.parse(JSON.stringify(lighting)) : null,
            atmosphere: atmosphere && typeof atmosphere === 'object' ? JSON.parse(JSON.stringify(atmosphere)) : null,
            shadows: shadows && typeof shadows === 'object' ? JSON.parse(JSON.stringify(shadows)) : null,
            antiAliasing: antiAliasing && typeof antiAliasing === 'object' ? JSON.parse(JSON.stringify(antiAliasing)) : null,
            ambientOcclusion: ambientOcclusion && typeof ambientOcclusion === 'object' ? JSON.parse(JSON.stringify(ambientOcclusion)) : null,
            bloom: bloom && typeof bloom === 'object' ? JSON.parse(JSON.stringify(bloom)) : null,
            sunBloom: sunBloom && typeof sunBloom === 'object' ? JSON.parse(JSON.stringify(sunBloom)) : null,
            colorGrading: grading && typeof grading === 'object' ? JSON.parse(JSON.stringify(grading)) : null,
            buildingWindowVisuals: buildingWindowVisuals && typeof buildingWindowVisuals === 'object'
                ? JSON.parse(JSON.stringify(buildingWindowVisuals))
                : null,
            sunFlare: sunFlare && typeof sunFlare === 'object' ? JSON.parse(JSON.stringify(sunFlare)) : null,
            asphaltNoise: asphaltNoise && typeof asphaltNoise === 'object' ? JSON.parse(JSON.stringify(asphaltNoise)) : null,
            vehicleMotionDebug: vehicleMotionDebug && typeof vehicleMotionDebug === 'object'
                ? JSON.parse(JSON.stringify(vehicleMotionDebug))
                : null
        };
        if (this._original.lighting?.ibl && typeof this._original.lighting.ibl === 'object') {
            this._original.lighting.ibl.showProbeSphere = showProbeSphere;
        }

        this._ui = new OptionsUI({
            initialTab: 'lighting',
            initialLighting: lighting && typeof lighting === 'object'
                ? {
                    exposure: lighting.exposure,
                    hemiIntensity: lighting.hemiIntensity,
                    sunIntensity: lighting.sunIntensity,
                    ibl: {
                        enabled: lighting.ibl?.enabled,
                        envMapIntensity: lighting.ibl?.envMapIntensity,
                        setBackground: lighting.ibl?.setBackground,
                        showProbeSphere
                    }
                }
                : null,
            initialAtmosphere: atmosphere && typeof atmosphere === 'object'
                ? JSON.parse(JSON.stringify(atmosphere))
                : null,
            initialBloom: bloom && typeof bloom === 'object'
                ? {
                    enabled: bloom.enabled,
                    strength: bloom.strength,
                    radius: bloom.radius,
                    threshold: bloom.threshold
                }
                : null,
            initialAntiAliasing: antiAliasing && typeof antiAliasing === 'object'
                ? JSON.parse(JSON.stringify(antiAliasing))
                : null,
            initialAmbientOcclusion: ambientOcclusion && typeof ambientOcclusion === 'object'
                ? JSON.parse(JSON.stringify(ambientOcclusion))
                : null,
            initialColorGrading: grading && typeof grading === 'object'
                ? {
                    preset: grading.preset,
                    intensity: grading.intensity
                }
                : null,
            initialBuildingWindowVisuals: buildingWindowVisuals && typeof buildingWindowVisuals === 'object'
                ? {
                    reflective: {
                        enabled: buildingWindowVisuals.reflective?.enabled,
                        glass: {
                            colorHex: buildingWindowVisuals.reflective?.glass?.colorHex,
                            metalness: buildingWindowVisuals.reflective?.glass?.metalness,
                            roughness: buildingWindowVisuals.reflective?.glass?.roughness,
                            transmission: buildingWindowVisuals.reflective?.glass?.transmission,
                            ior: buildingWindowVisuals.reflective?.glass?.ior,
                            envMapIntensity: buildingWindowVisuals.reflective?.glass?.envMapIntensity
                        }
                    }
                }
                : null,
            initialAsphaltNoise: asphaltNoise && typeof asphaltNoise === 'object'
                ? {
                    coarse: {
                        albedo: asphaltNoise.coarse?.albedo,
                        roughness: asphaltNoise.coarse?.roughness,
                        scale: asphaltNoise.coarse?.scale,
                        colorStrength: asphaltNoise.coarse?.colorStrength,
                        dirtyStrength: asphaltNoise.coarse?.dirtyStrength,
                        roughnessStrength: asphaltNoise.coarse?.roughnessStrength
                    },
                    fine: {
                        albedo: asphaltNoise.fine?.albedo,
                        roughness: asphaltNoise.fine?.roughness,
                        normal: asphaltNoise.fine?.normal,
                        scale: asphaltNoise.fine?.scale,
                        colorStrength: asphaltNoise.fine?.colorStrength,
                        dirtyStrength: asphaltNoise.fine?.dirtyStrength,
                        roughnessStrength: asphaltNoise.fine?.roughnessStrength,
                        normalStrength: asphaltNoise.fine?.normalStrength
                    },
                    markings: {
                        enabled: asphaltNoise.markings?.enabled,
                        colorStrength: asphaltNoise.markings?.colorStrength,
                        roughnessStrength: asphaltNoise.markings?.roughnessStrength,
                        debug: asphaltNoise.markings?.debug
                    },
                    color: {
                        value: asphaltNoise.color?.value,
                        warmCool: asphaltNoise.color?.warmCool,
                        saturation: asphaltNoise.color?.saturation
                    },
                    livedIn: {
                        edgeDirt: {
                            enabled: asphaltNoise.livedIn?.edgeDirt?.enabled,
                            strength: asphaltNoise.livedIn?.edgeDirt?.strength,
                            width: asphaltNoise.livedIn?.edgeDirt?.width,
                            scale: asphaltNoise.livedIn?.edgeDirt?.scale
                        },
                        sidewalkGrassEdgeStrip: {
                            enabled: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.enabled,
                            width: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.width,
                            opacity: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.opacity,
                            roughness: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.roughness,
                            metalness: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.metalness,
                            colorHex: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.colorHex,
                            fadePower: asphaltNoise.livedIn?.sidewalkGrassEdgeStrip?.fadePower
                        },
                        cracks: {
                            enabled: asphaltNoise.livedIn?.cracks?.enabled,
                            strength: asphaltNoise.livedIn?.cracks?.strength,
                            scale: asphaltNoise.livedIn?.cracks?.scale
                        },
                        patches: {
                            enabled: asphaltNoise.livedIn?.patches?.enabled,
                            strength: asphaltNoise.livedIn?.patches?.strength,
                            scale: asphaltNoise.livedIn?.patches?.scale,
                            coverage: asphaltNoise.livedIn?.patches?.coverage
                        },
                        tireWear: {
                            enabled: asphaltNoise.livedIn?.tireWear?.enabled,
                            strength: asphaltNoise.livedIn?.tireWear?.strength,
                            scale: asphaltNoise.livedIn?.tireWear?.scale
                        }
                    }
                }
                : null,
            initialShadows: shadows && typeof shadows === 'object' ? JSON.parse(JSON.stringify(shadows)) : null,
            initialSunFlare: sunFlare && typeof sunFlare === 'object'
                ? {
                    enabled: sunFlare.enabled,
                    preset: sunFlare.preset,
                    strength: sunFlare.strength,
                    components: sunFlare.components ?? null
                }
                : null,
            initialPostProcessingActive: postActive,
            initialColorGradingDebug: gradingDebug,
            initialSunBloom: sunBloom && typeof sunBloom === 'object' ? JSON.parse(JSON.stringify(sunBloom)) : null,
            initialVehicleMotionDebug: vehicleMotionDebug && typeof vehicleMotionDebug === 'object'
                ? JSON.parse(JSON.stringify(vehicleMotionDebug))
                : null,
            getIblDebugInfo: () => this.engine?.getIBLDebugInfo?.() ?? null,
            getPostProcessingDebugInfo: () => ({
                postActive: !!this.engine?.isPostProcessingActive,
                bloom: this.engine?.getBloomDebugInfo?.() ?? null,
                sunBloom: this.engine?.getSunBloomDebugInfo?.() ?? null,
                ambientOcclusion: this.engine?.getAmbientOcclusionDebugInfo?.() ?? null,
                colorGrading: this.engine?.getColorGradingDebugInfo?.() ?? null
            }),
            getAntiAliasingDebugInfo: () => this.engine?.getAntiAliasingDebugInfo?.() ?? null,
            getVehicleMotionDebugInfo: () => this._getVehicleMotionDebugInfo(),
            onCancel: () => this._cancel(),
            onLiveChange: (draft) => this._applyDraft(draft),
            onSave: (draft) => this._save(draft)
        });

        this._ui.mount();
        window.addEventListener('keydown', this._onKeyDown, { passive: false, capture: true });
    }

    exit() {
        window.removeEventListener('keydown', this._onKeyDown, { capture: true });
        this._ui?.unmount?.();
        this._ui = null;
        this._original = null;
        if (!this._overlay) {
            document.body.classList.remove('options-dock-open');
            requestAnimationFrame(() => this.engine?.resize?.());
        }
        document.activeElement?.blur?.();
    }

    _cancel() {
        this._restoreOriginal();
        if (this._overlay) {
            this.sm.popOverlay();
            return;
        }
        this.sm.go(this._returnTo || 'welcome');
    }

    _save(draft) {
        saveLightingSettings(draft?.lighting ?? null);
        saveShadowSettings(draft?.shadows ?? null);
        saveAntiAliasingSettings(draft?.antiAliasing ?? null);
        saveAmbientOcclusionSettings(draft?.ambientOcclusion ?? null);
        saveAtmosphereSettings(draft?.atmosphere ?? null);
        saveBloomSettings(draft?.bloom ?? null);
        saveSunBloomSettings(draft?.sunBloom ?? null);
        saveColorGradingSettings(draft?.colorGrading ?? null);
        saveBuildingWindowVisualsSettings(draft?.buildingWindowVisuals ?? null);
        saveSunFlareSettings(draft?.sunFlare ?? null);
        saveAsphaltNoiseSettings(draft?.asphaltNoise ?? null);
        saveVehicleMotionDebugSettings(draft?.vehicleMotionDebug ?? null);
        if (this._overlay) {
            this.sm.popOverlay();
            return;
        }
        this.sm.go(this._returnTo || 'welcome');
    }

    _restoreOriginal() {
        const src = this._original && typeof this._original === 'object' ? this._original : null;
        if (!src) return;
        this._applyDraft(src);
    }

    _applyDraft(draft) {
        const d = draft && typeof draft === 'object' ? draft : null;
        const lighting = d?.lighting ?? null;
        const atmosphere = d?.atmosphere ?? null;
        const shadows = d?.shadows ?? null;
        const antiAliasing = d?.antiAliasing ?? null;
        const ambientOcclusion = d?.ambientOcclusion ?? null;
        const bloom = d?.bloom ?? null;
        const sunBloom = d?.sunBloom ?? null;
        const grading = d?.colorGrading ?? null;
        const buildingWindowVisuals = d?.buildingWindowVisuals ?? null;
        const sunFlare = d?.sunFlare ?? null;
        const asphaltNoise = d?.asphaltNoise ?? null;
        const vehicleMotionDebug = d?.vehicleMotionDebug ?? null;

        this.engine?.setShadowSettings?.(shadows ?? null);
        this.engine?.setLightingSettings?.(lighting ?? null);
        if (antiAliasing) this.engine?.setAntiAliasingSettings?.(antiAliasing);
        if (ambientOcclusion) this.engine?.setAmbientOcclusionSettings?.(ambientOcclusion);
        this.engine?.setAtmosphereSettings?.(atmosphere ?? null);
        if (bloom) this.engine?.setBloomSettings?.(bloom);
        if (sunBloom) this.engine?.setSunBloomSettings?.(sunBloom);
        if (grading) this.engine?.setColorGradingSettings?.(grading);
        if (vehicleMotionDebug) this.engine?.setVehicleMotionDebugSettings?.(vehicleMotionDebug);
        const desiredProbeVisible = lighting?.ibl?.showProbeSphere !== undefined ? !!lighting.ibl.showProbeSphere : false;
        const probe = this.engine?.scene?.getObjectByName?.('ibl_probe_sphere') ?? null;
        if (probe) probe.visible = desiredProbeVisible;

        const city = this.engine?.context?.city ?? null;
        if (lighting && city) {
            if (city?.hemi) city.hemi.intensity = lighting.hemiIntensity;
            if (city?.sun) city.sun.intensity = lighting.sunIntensity;
        }
        if (city?.applyShadowSettings) city.applyShadowSettings(this.engine);
        if (sunFlare && city?.sunFlare?.setSettings) {
            city.sunFlare.setSettings(sunFlare);
        }
        if (sunBloom && city?.sunBloom?.setSettings) {
            city.sunBloom.setSettings(sunBloom);
        }
        if (sunBloom && city?.sunRays?.setSettings) {
            city.sunRays.setSettings(sunBloom);
        }

        if (asphaltNoise && city?.materials?.road) {
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

            for (const mat of mats) {
                const cfg = mat?.userData?.roadMarkingsAsphaltNoiseConfig ?? null;
                if (!cfg) continue;
                cfg.enabled = asphaltNoise?.markings?.enabled === true;
                cfg.debug = asphaltNoise?.markings?.debug === true;
                cfg.colorStrength = cfg.enabled ? Math.max(0.0, Math.min(0.5, Number(asphaltNoise?.markings?.colorStrength) || 0)) : 0.0;
                cfg.roughnessStrength = cfg.enabled ? Math.max(0.0, Math.min(0.5, Number(asphaltNoise?.markings?.roughnessStrength) || 0)) : 0.0;
                cfg.fineScale = Math.max(0.1, Math.min(15.0, Number(asphaltNoise?.fine?.scale) || 12.0));
                cfg.fineBaseRoughness = Math.max(0.0, Math.min(1.0, Number(mat?.userData?.asphaltRoadBase?.roughness) || 0.95));
                const fineRoughnessMap = mat?.userData?.asphaltFineTextures?.roughnessMap ?? cfg?.fineRoughnessMap ?? mat?.roughnessMap ?? null;
                cfg.fineRoughnessMap = fineRoughnessMap?.isTexture ? fineRoughnessMap : null;
                const fineStrength = Number(asphaltNoise?.fine?.roughnessStrength);
                cfg.fineRoughnessStrength = (cfg.fineRoughnessMap && Number.isFinite(fineStrength))
                    ? Math.max(0.0, Math.min(0.5, fineStrength))
                    : 0.0;

                const uniforms = cfg.shaderUniforms ?? null;
                if (!uniforms) continue;
                if (uniforms.uRoadMarkingsAsphaltNoiseEnabled) uniforms.uRoadMarkingsAsphaltNoiseEnabled.value = cfg.enabled ? 1.0 : 0.0;
                if (uniforms.uRoadMarkingsAsphaltNoiseColorStrength) uniforms.uRoadMarkingsAsphaltNoiseColorStrength.value = cfg.colorStrength;
                if (uniforms.uRoadMarkingsAsphaltNoiseRoughnessStrength) uniforms.uRoadMarkingsAsphaltNoiseRoughnessStrength.value = cfg.roughnessStrength;
                if (uniforms.uRoadMarkingsAsphaltNoiseDebug) uniforms.uRoadMarkingsAsphaltNoiseDebug.value = cfg.debug ? 1.0 : 0.0;
                if (uniforms.uRoadMarkingsAsphaltFineScale) uniforms.uRoadMarkingsAsphaltFineScale.value = cfg.fineScale;
                if (uniforms.uRoadMarkingsAsphaltFineBaseRoughness) uniforms.uRoadMarkingsAsphaltFineBaseRoughness.value = cfg.fineBaseRoughness;
                if (uniforms.uRoadMarkingsAsphaltFineRoughnessStrength) uniforms.uRoadMarkingsAsphaltFineRoughnessStrength.value = cfg.fineRoughnessStrength;
                if (uniforms.uRoadMarkingsAsphaltFineRoughnessMap) uniforms.uRoadMarkingsAsphaltFineRoughnessMap.value = cfg.fineRoughnessMap;
            }

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

            const sidewalkEdgeStrip = getSidewalkEdgeDirtStripConfig(asphaltNoise);
            const stripMats = new Set();
            if (city.materials.sidewalkEdgeDirt?.isMeshStandardMaterial) stripMats.add(city.materials.sidewalkEdgeDirt);
            if (city.roads?.sidewalkEdgeDirt?.material?.isMeshStandardMaterial) stripMats.add(city.roads.sidewalkEdgeDirt.material);
            for (const mat of stripMats) {
                applySidewalkEdgeDirtStripVisualsToMeshStandardMaterial(mat, { asphaltNoise });
            }
            if (city.roads?.sidewalkEdgeDirt?.isMesh) {
                city.roads.sidewalkEdgeDirt.visible = sidewalkEdgeStrip.enabled;
            }
        }

        if (city?.buildings?.group && buildingWindowVisuals) {
            const sanitized = sanitizeBuildingWindowVisualsSettings(buildingWindowVisuals);
            const iblEnabled = !!this.engine?.lightingSettings?.ibl?.enabled && !!this.engine?.scene?.environment;
            const baseEnvMapIntensity = Number.isFinite(this.engine?.lightingSettings?.ibl?.envMapIntensity)
                ? this.engine.lightingSettings.ibl.envMapIntensity
                : 0.25;
            applyBuildingWindowVisualsToCityMeshes(city.buildings.group, sanitized, { iblEnabled, baseEnvMapIntensity });
        }
    }

    _getVehicleMotionDebugInfo() {
        const timing = this.engine?.frameTimingDebugInfo ?? null;
        const physicsLoop = this.engine?.getPhysicsLoopDebugInfo?.() ?? null;

        const base = this.sm?.current ?? null;
        const anchor = base?.busAnchor ?? base?.vehicle?.anchor ?? null;
        const loco = this.engine?.simulation?.physics?.getVehicleState?.('player')?.locomotion ?? null;

        let anchorPose = null;
        if (anchor?.updateMatrixWorld && anchor?.matrixWorld?.elements) {
            anchor.updateMatrixWorld(true);
            const m = anchor.matrixWorld.elements;
            const x = Number(m[12]);
            const y = Number(m[13]);
            const z = Number(m[14]);
            const fx = Number(m[8]);
            const fz = Number(m[10]);
            const yaw = (Number.isFinite(fx) && Number.isFinite(fz)) ? Math.atan2(fx, fz) : 0;
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                anchorPose = { x, y, z, yaw };
            }
        }

        let diff = null;
        if (anchorPose && loco?.position && typeof loco.position === 'object') {
            const px = Number(loco.position.x);
            const py = Number(loco.position.y);
            const pz = Number(loco.position.z);
            const dyaw = Number.isFinite(loco.yaw) ? (anchorPose.yaw - Number(loco.yaw)) : null;
            const dx = Number.isFinite(px) ? anchorPose.x - px : null;
            const dy = Number.isFinite(py) ? anchorPose.y - py : null;
            const dz = Number.isFinite(pz) ? anchorPose.z - pz : null;
            const dist = (dx !== null && dz !== null) ? Math.hypot(dx, dz) : null;
            const yawErrDeg = dyaw !== null ? ((((dyaw + Math.PI) % (Math.PI * 2)) - Math.PI) * (180 / Math.PI)) : null;
            diff = { dx, dy, dz, dist, yawErrDeg };
        }

        let screen = null;
        if (anchorPose && this.engine?.camera && this.engine?.renderer?.domElement) {
            const cam = this.engine.camera;
            const canvas = this.engine.renderer.domElement;
            const width = Number(canvas.clientWidth ?? canvas.width ?? 0);
            const height = Number(canvas.clientHeight ?? canvas.height ?? 0);
            if (cam?.updateMatrixWorld && cam?.projectionMatrix?.elements && cam?.matrixWorldInverse?.elements && width > 0 && height > 0) {
                cam.updateMatrixWorld(true);
                if (cam.matrixWorldInverse?.copy) cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
                const view = cam.matrixWorldInverse.elements;
                const proj = cam.projectionMatrix.elements;
                const x = anchorPose.x;
                const y = anchorPose.y;
                const z = anchorPose.z;
                const mul = (m, vx, vy, vz, vw) => ({
                    x: m[0] * vx + m[4] * vy + m[8] * vz + m[12] * vw,
                    y: m[1] * vx + m[5] * vy + m[9] * vz + m[13] * vw,
                    z: m[2] * vx + m[6] * vy + m[10] * vz + m[14] * vw,
                    w: m[3] * vx + m[7] * vy + m[11] * vz + m[15] * vw
                });
                const v = mul(view, x, y, z, 1);
                const c = mul(proj, v.x, v.y, v.z, v.w);
                if (Number.isFinite(c.w) && Math.abs(c.w) > 1e-9) {
                    const ndcX = c.x / c.w;
                    const ndcY = c.y / c.w;
                    const px = (ndcX * 0.5 + 0.5) * width;
                    const py = (-ndcY * 0.5 + 0.5) * height;
                    if (Number.isFinite(px) && Number.isFinite(py)) screen = { x: px, y: py, width, height };
                }
            }
        }

        return {
            timing,
            physicsLoop,
            anchor: anchorPose,
            locomotion: loco ?? null,
            diff,
            screen
        };
    }

    _handleKeyDown(e) {
        const code = e.code;
        const key = e.key;
        if (isEditableTarget(e.target) && (code !== 'Escape' && key !== 'Escape')) return;

        const isEsc = code === 'Escape' || key === 'Escape';
        if (isEsc) {
            e.preventDefault();
            e.stopImmediatePropagation?.();
            this._cancel();
        }
    }
}
