// src/states/OptionsState.js
// In-game options overlay state (tabbed, persisted settings).

import { OptionsUI } from '../graphics/gui/options/OptionsUI.js';
import { applyAsphaltRoadVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltRoadVisuals.js';
import { applyAsphaltEdgeWearVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltEdgeWearVisuals.js';
import { applyAsphaltMarkingsNoiseVisualsToMeshStandardMaterial } from '../graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js';
import { saveLightingSettings } from '../graphics/lighting/LightingSettings.js';
import { saveBloomSettings } from '../graphics/visuals/postprocessing/BloomSettings.js';
import { getResolvedAsphaltNoiseSettings, saveAsphaltNoiseSettings } from '../graphics/visuals/city/AsphaltNoiseSettings.js';
import { getResolvedBuildingWindowVisualsSettings, saveBuildingWindowVisualsSettings } from '../graphics/visuals/buildings/BuildingWindowVisualsSettings.js';
import { saveColorGradingSettings } from '../graphics/visuals/postprocessing/ColorGradingSettings.js';
import { getResolvedSunFlareSettings, saveSunFlareSettings } from '../graphics/visuals/sun/SunFlareSettings.js';

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

        document.body.classList.add('options-dock-open');
        requestAnimationFrame(() => this.engine?.resize?.());

        if (!this._overlay) {
            document.body.classList.remove('splash-bg');
            document.body.classList.remove('setup-bg');
        }

        document.activeElement?.blur?.();

        const lighting = this.engine?.lightingSettings ?? null;
        const bloom = this.engine?.bloomSettings ?? null;
        const postActive = this.engine?.isPostProcessingActive ?? false;
        const grading = this.engine?.colorGradingSettings ?? null;
        const gradingDebug = this.engine?.getColorGradingDebugInfo?.() ?? null;
        const sunFlare = getResolvedSunFlareSettings();
        const buildingWindowVisuals = getResolvedBuildingWindowVisualsSettings();
        const asphaltNoise = getResolvedAsphaltNoiseSettings();

        this._original = {
            lighting: lighting && typeof lighting === 'object' ? JSON.parse(JSON.stringify(lighting)) : null,
            bloom: bloom && typeof bloom === 'object' ? JSON.parse(JSON.stringify(bloom)) : null,
            colorGrading: grading && typeof grading === 'object' ? JSON.parse(JSON.stringify(grading)) : null,
            sunFlare: sunFlare && typeof sunFlare === 'object' ? JSON.parse(JSON.stringify(sunFlare)) : null,
            asphaltNoise: asphaltNoise && typeof asphaltNoise === 'object' ? JSON.parse(JSON.stringify(asphaltNoise)) : null
        };

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
                        setBackground: lighting.ibl?.setBackground
                    }
                }
                : null,
            initialBloom: bloom && typeof bloom === 'object'
                ? {
                    enabled: bloom.enabled,
                    strength: bloom.strength,
                    radius: bloom.radius,
                    threshold: bloom.threshold
                }
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
            getIblDebugInfo: () => this.engine?.getIBLDebugInfo?.() ?? null,
            getPostProcessingDebugInfo: () => ({
                postActive: !!this.engine?.isPostProcessingActive,
                bloom: this.engine?.getBloomDebugInfo?.() ?? null,
                colorGrading: this.engine?.getColorGradingDebugInfo?.() ?? null
            }),
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
        document.body.classList.remove('options-dock-open');
        requestAnimationFrame(() => this.engine?.resize?.());
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
        saveBloomSettings(draft?.bloom ?? null);
        saveColorGradingSettings(draft?.colorGrading ?? null);
        saveBuildingWindowVisualsSettings(draft?.buildingWindowVisuals ?? null);
        saveSunFlareSettings(draft?.sunFlare ?? null);
        saveAsphaltNoiseSettings(draft?.asphaltNoise ?? null);
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
        const bloom = d?.bloom ?? null;
        const grading = d?.colorGrading ?? null;
        const sunFlare = d?.sunFlare ?? null;
        const asphaltNoise = d?.asphaltNoise ?? null;

        this.engine?.setLightingSettings?.(lighting ?? null);
        if (bloom) this.engine?.setBloomSettings?.(bloom);
        if (grading) this.engine?.setColorGradingSettings?.(grading);

        const city = this.engine?.context?.city ?? null;
        if (lighting && city) {
            if (city?.hemi) city.hemi.intensity = lighting.hemiIntensity;
            if (city?.sun) city.sun.intensity = lighting.sunIntensity;
        }
        if (sunFlare && city?.sunFlare?.setSettings) {
            city.sunFlare.setSettings(sunFlare);
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

            for (const mat of mats) {
                const cfg = mat?.userData?.roadMarkingsAsphaltNoiseConfig ?? null;
                if (!cfg) continue;
                cfg.enabled = asphaltNoise?.markings?.enabled === true;
                cfg.debug = asphaltNoise?.markings?.debug === true;
                cfg.colorStrength = cfg.enabled ? Math.max(0.0, Math.min(0.5, Number(asphaltNoise?.markings?.colorStrength) || 0)) : 0.0;
                cfg.roughnessStrength = cfg.enabled ? Math.max(0.0, Math.min(0.5, Number(asphaltNoise?.markings?.roughnessStrength) || 0)) : 0.0;
                cfg.fineScale = Math.max(0.1, Math.min(15.0, Number(asphaltNoise?.fine?.scale) || 12.0));
                cfg.fineBaseRoughness = Math.max(0.0, Math.min(1.0, Number(mat?.userData?.asphaltRoadBase?.roughness) || 0.95));
                cfg.fineRoughnessStrength = (asphaltNoise?.fine?.roughness !== false && mat?.roughnessMap)
                    ? Math.max(0.0, Math.min(0.5, Number(asphaltNoise?.fine?.roughnessStrength) || 0))
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
            }

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
