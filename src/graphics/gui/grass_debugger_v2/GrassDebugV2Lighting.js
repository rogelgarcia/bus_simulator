// Reuses the game's resolved daylight, atmosphere and visible sun effects.
// @ts-check
import * as THREE from 'three';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { applyIBLIntensity, applyIBLToScene, loadIBLTexture } from '../../lighting/IBL.js';
import { createGradientSkyDome, shouldShowSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { getResolvedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { azimuthElevationDegToDir } from '../../visuals/atmosphere/SunDirection.js';
import { SunBloomRig } from '../../visuals/sun/SunBloomRig.js';
import { SunRaysRig } from '../../visuals/sun/SunRaysRig.js';
import { SunFlareRig } from '../../visuals/sun/SunFlareRig.js';
import { getResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { getResolvedSunBloomSettings } from '../../visuals/postprocessing/SunBloomSettings.js';
import { PostProcessingPipeline } from '../../visuals/postprocessing/PostProcessingPipeline.js';

export class GrassDebugV2Lighting {
    /** @param {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera}} options */
    constructor({ renderer, scene, camera }) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.settings = getResolvedLightingSettings();
        this.atmosphere = getResolvedAtmosphereSettings();
        this.bloomSettings = getResolvedSunBloomSettings();
        const lighting = this.settings;
        renderer.toneMapping = {
            aces: THREE.ACESFilmicToneMapping,
            agx: THREE.AgXToneMapping,
            neutral: THREE.NeutralToneMapping
        }[lighting.toneMapping];
        renderer.toneMappingExposure = lighting.exposure;
        this.sunRef = {
            direction: azimuthElevationDegToDir(this.atmosphere.sun.azimuthDeg, this.atmosphere.sun.elevationDeg),
            color: new THREE.Color().fromArray(lighting.sunColorLinear),
            intensity: lighting.sunIntensity
        };
        this.sun = new THREE.DirectionalLight(this.sunRef.color, this.sunRef.intensity);
        this.sun.position.copy(this.sunRef.direction).multiplyScalar(200);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 400 });
        this.sun.shadow.normalBias = 0.03;
        this.sun.shadow.autoUpdate = false;
        this.sun.shadow.needsUpdate = true;
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, lighting.hemiIntensity);
        this.hemi.position.set(0, 100, 0);
        this.sky = createGradientSkyDome({ atmosphere: this.atmosphere, sunDir: this.sunRef.direction, sunIntensity: 0.28 });
        this.sunBloom = new SunBloomRig({ sun: this.sunRef, sky: this.sky, settings: this.bloomSettings });
        this.sunRays = new SunRaysRig({ sun: this.sunRef, sky: this.sky, settings: this.bloomSettings });
        this.sunFlare = new SunFlareRig({ sun: this.sunRef, settings: getResolvedSunFlareSettings() });
        scene.add(this.sun, this.sun.target, this.hemi, this.sky, this.sunBloom.group, this.sunRays.group, this.sunFlare.group);
        this.pipeline = this.bloomSettings.enabled ? new PostProcessingPipeline({
            renderer, scene, camera,
            sunBloom: this.bloomSettings,
            bloom: { enabled: false },
            ambientOcclusion: { mode: 'off' },
            antiAliasing: { mode: 'msaa', msaa: { samples: 4 } }
        }) : null;
        this.pipeline?.setToneMapping({ toneMapping: renderer.toneMapping, exposure: lighting.exposure });
    }

    async loadEnvironment() {
        this.environment = await loadIBLTexture(this.renderer, this.settings.ibl);
        if (this.environment?.userData.iblFallback) throw new Error('The game HDR environment did not load.');
    }

    applyEnvironment() {
        applyIBLToScene(this.scene, this.environment, this.settings.ibl);
        applyIBLIntensity(this.scene, this.settings.ibl, { force: true });
        this.sky.visible = shouldShowSkyDome({
            skyIblBackgroundMode: this.atmosphere.sky.iblBackgroundMode,
            lightingIblSetBackground: this.settings.ibl.setBackground,
            sceneBackground: this.scene.background
        });
        this.sun.shadow.needsUpdate = true;
    }

    resize(width, height) {
        this.pipeline?.setPixelRatio(this.renderer.getPixelRatio());
        this.pipeline?.setSize(width, height);
    }

    render(dt) {
        this.sky.position.copy(this.camera.position);
        this.sunBloom.update(this);
        this.sunRays.update(this);
        this.sunFlare.update(this);
        if (this.pipeline) this.pipeline.render(dt);
        else this.renderer.render(this.scene, this.camera);
    }

    getSnapshot() {
        return {
            sunDirection: this.sunRef.direction.toArray(),
            sunColorLinear: this.sun.color.toArray(),
            sunIntensity: this.sun.intensity,
            exposure: this.renderer.toneMappingExposure,
            environmentId: this.settings.ibl.iblId,
            sunBloomEnabled: this.bloomSettings.enabled,
            sunRaysEnabled: this.bloomSettings.enabled && this.bloomSettings.raysEnabled,
            skyVisible: this.sky.visible
        };
    }

    dispose() {
        this.pipeline?.dispose();
        this.sunBloom.dispose();
        this.sunRays.dispose();
        this.sunFlare.dispose();
    }
}
