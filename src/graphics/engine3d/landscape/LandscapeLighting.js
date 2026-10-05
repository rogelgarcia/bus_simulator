// Lights the landscape like the game: resolved calibrated sun, exposure, tone mapping and HDR sky, as shared terrain/water uniforms.
// @ts-check
// Design: the game's own resolvers (getResolvedLightingSettings, getResolvedAtmosphereSettings, with their saved and URL overrides) and IBL
// helpers are the only sources, without GameEngine or City. The calibrated HDR stays in the game frame: a city binding yaw rotates the sun,
// the sky harmonics, the background and the water reflections into landscape space. No PMREM is generated: the terrain lights from sky
// harmonics, and the water's single Cox-Munk roughness reads one CPU-prefiltered GGX map (LandscapeSkyReflection.js), because three.js's
// PMREM GGX convolution shader raises Direct3D X4122 compiler warnings. The environment textures (HDR, its background cube and the reflection
// map) are renderer-owned like the game's and stay outside the landscape residency ledger; their sizes are reported.
import * as THREE from 'three';
import { getResolvedLightingSettings, loadSavedLightingSettings } from '../../lighting/LightingSettings.js';
import { loadIBLBackgroundTexture } from '../../lighting/IBL.js';
import { getResolvedAtmosphereSettings, loadSavedAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { validateLandscapeCityBinding } from '../../../app/landscape/LandscapeCityBinding.js';
import { LANDSCAPE_LIGHTING, LANDSCAPE_WATER_LEVEL_DISABLED, createLandscapeLightingUniforms, landscapeHazeCalibration, landscapeLightingConstants,
    landscapeLightingTier, landscapeLightingUniformValues, landscapeResponseUniformValue, landscapeSunDirection, landscapeWaterSurfaceRoughness } from './LandscapeLightingModel.js';
import { landscapeMaterialResponseSnapshot } from './LandscapeMaterialResponse.js';
import { LANDSCAPE_SKY_REFLECTION, prefilterLandscapeSkyReflection } from './LandscapeSkyReflection.js';
import { evaluateLandscapeSkyIrradiance, landscapeSkyHorizonRadiance, projectLandscapeSkyIrradiance, LANDSCAPE_SKY_IRRADIANCE } from './LandscapeSkyIrradiance.js';

const TONE_MAPPING = Object.freeze({ aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping });
const URL_OVERRIDES = Object.freeze(['exposure', 'toneMapping', 'hemiIntensity', 'sunIntensity', 'ibl', 'iblIntensity', 'iblBackground', 'iblId', 'sunAzimuth', 'sunElevation']);
// the game's City hemisphere light colors (sky white, ground #2a3b1f), added to the sky harmonics when a saved or URL setting enables it
const HEMISPHERE = Object.freeze({ sky: Object.freeze([1, 1, 1]), ground: Object.freeze(new THREE.Color(0x2a3b1f).toArray()) });

/** @param {any} texture @returns {import('./LandscapeSkyIrradiance.js').LandscapeEquirectImage} */
function equirectImage(texture) {
    const { data, width, height } = texture?.image ?? {};
    if (texture?.format !== THREE.RGBAFormat || !data) throw new Error('[Landscape] The sky environment texture must be decoded RGBA data');
    if (texture.type === THREE.HalfFloatType) return { width, height, data, channels: 4, encoding: 'half' };
    if (texture.type === THREE.FloatType) return { width, height, data, channels: 4, encoding: 'float' };
    throw new Error(`[Landscape] Unsupported sky environment texel type ${texture.type}`);
}

export class LandscapeLighting {
    /**
     * @param {{renderer:any,scene:any,tier?:string,binding?:any,includeUrlOverrides?:boolean}} options binding is an optional city landscape
     *   binding whose yaw rotates the game frame into landscape space
     */
    constructor({ renderer, scene, tier = LANDSCAPE_LIGHTING.defaultTier, binding = null, includeUrlOverrides = true }) {
        if (!renderer || !scene) throw new Error('[Landscape] Lighting needs the view renderer and scene');
        this.renderer = renderer;
        this.scene = scene;
        this.tier = landscapeLightingTier(tier);
        this.binding = binding ? validateLandscapeCityBinding(binding) : null;
        this.yawDegrees = this.binding ? this.binding.transform.yawDegrees : 0;
        this.settings = getResolvedLightingSettings({ includeUrlOverrides });
        this.atmosphere = getResolvedAtmosphereSettings({ includeUrlOverrides });
        const parameters = includeUrlOverrides && typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
        this.sources = { lighting: 'getResolvedLightingSettings', atmosphere: 'getResolvedAtmosphereSettings', savedLighting: loadSavedLightingSettings() !== null,
            savedAtmosphere: loadSavedAtmosphereSettings() !== null, urlOverrides: Object.fromEntries(URL_OVERRIDES.filter(key => parameters.has(key)).map(key => [key, parameters.get(key)])) };
        this.toneMapping = TONE_MAPPING[this.settings.toneMapping];
        if (this.toneMapping === undefined) throw new Error(`[Landscape] Unsupported resolved tone mapping ${this.settings.toneMapping}`);
        renderer.toneMapping = this.toneMapping;
        renderer.toneMappingExposure = this.settings.exposure;
        this.sunDirection = landscapeSunDirection(this.atmosphere.sun.azimuthDeg, this.atmosphere.sun.elevationDeg, this.yawDegrees);
        this.sunIrradiance = this.settings.sunColorLinear.map(value => value * this.settings.sunIntensity);
        this.hemisphere = this.settings.hemiIntensity;
        this.seaLevel = 0;
        this.waterVisible = true;
        // AI577 D5c switches of the natural-ground response, terrain-reflected light and terrain-field visibility (all enabled when shipped)
        this.response = { ...LANDSCAPE_LIGHTING.response };
        this.sky = null;
        this.horizonRadiance = null;
        this.background = null;
        this.reflection = null;
        this.reflectionTexture = null;
        this.reflectionMilliseconds = null;
        this.status = 'loading';
        this.error = null;
        this.loadMilliseconds = null;
        this.projectionMilliseconds = null;
        this.disposed = false;
        this.uniforms = createLandscapeLightingUniforms(this.state());
        this.ready = this.load();
    }

    /** @returns {number[]} sky coefficients: the projected environment plus the game's hemisphere light, if any */
    skyCoefficients() {
        const coefficients = Array.from(this.sky?.coefficients ?? new Array(LANDSCAPE_SKY_IRRADIANCE.coefficients * 3).fill(0));
        for (let channel = 0; channel < 3; channel++) {
            coefficients[channel] += this.hemisphere * (HEMISPHERE.sky[channel] + HEMISPHERE.ground[channel]) / 2;
            coefficients[6 + channel] += this.hemisphere * (HEMISPHERE.sky[channel] - HEMISPHERE.ground[channel]) / 2;
        }
        return coefficients;
    }

    /** @returns {import('./LandscapeLightingModel.js').LandscapeLightingState & {waterLevel:number}} the state the uniforms hold, recalibrated */
    state() {
        const base = { seaLevel: this.seaLevel, sunDirection: this.sunDirection, sunIrradiance: this.sunIrradiance, skyCoefficients: this.skyCoefficients() };
        this.calibration = this.horizonRadiance ? landscapeHazeCalibration(base, this.horizonRadiance, this.tier) : null;
        this.current = { ...base, calibration: this.calibration?.calibration ?? [1, 1, 1], waterLevel: this.waterVisible ? this.seaLevel : LANDSCAPE_WATER_LEVEL_DISABLED, response: { ...this.response } };
        return this.current;
    }

    update() {
        const values = landscapeLightingUniformValues(this.state());
        this.uniforms.uLandscapeSky.value.set(values.uLandscapeSky);
        this.uniforms.uLandscapeSun.value.set(values.uLandscapeSun);
        this.uniforms.uLandscapeSunIrradiance.value.set(values.uLandscapeSunIrradiance);
        this.uniforms.uLandscapeResponse.value.set(values.uLandscapeResponse);
    }

    /**
     * Switches the natural-ground material response, terrain-reflected light and terrain-field visibility for A/B evidence; omitted keys keep their
     * state. Runtime uniforms only: no program recompiles.
     * @param {{model?:boolean,bounce?:boolean,terrainVisibility?:boolean}} response
     */
    setResponse(response) {
        landscapeResponseUniformValue(response);
        this.response = { ...this.response, ...response };
        this.update();
    }

    async load() {
        const started = performance.now(), ibl = this.settings.ibl;
        try {
            if (!ibl.enabled || !ibl.hdrUrl) {
                this.status = 'ready';
                this.scene.background = null;
                return this;
            }
            // a missing environment fails here explicitly (loadIBLTexture would substitute a generated room)
            const background = await loadIBLBackgroundTexture(ibl.hdrUrl);
            if (this.disposed) return this;
            const projection = performance.now();
            const image = equirectImage(background);
            this.sky = projectLandscapeSkyIrradiance(image, { yawDegrees: this.yawDegrees });
            this.horizonRadiance = landscapeSkyHorizonRadiance(image, { maxElevationDeg: landscapeLightingConstants().atmosphere.horizonBandDegrees })
                .map(value => value * ibl.envMapIntensity);
            if (ibl.envMapIntensity !== 1) this.sky = Object.freeze({ ...this.sky, coefficients: this.sky.coefficients.map(value => value * ibl.envMapIntensity) });
            this.projectionMilliseconds = performance.now() - projection;
            const prefilter = performance.now();
            this.reflection = prefilterLandscapeSkyReflection(image, { roughness: landscapeWaterSurfaceRoughness().roughness, intensity: ibl.envMapIntensity });
            this.reflectionTexture = new THREE.DataTexture(Uint16Array.from(this.reflection.data, value => THREE.DataUtils.toHalfFloat(value)), this.reflection.width, this.reflection.height, THREE.RGBAFormat, THREE.HalfFloatType);
            Object.assign(this.reflectionTexture, { name: 'Landscape sky reflection', colorSpace: THREE.NoColorSpace, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, flipY: false, needsUpdate: true });
            this.reflectionMilliseconds = performance.now() - prefilter;
            // the game's background (applyIBLToScene with setBackground): the HDR itself, drawn unscaled; scene.environment stays unset because no
            // landscape material reads it. three.js samples a rotated background at the inverse rotation, so landscape direction d shows the
            // game-frame sky at yaw(d)
            this.background = background;
            this.scene.background = ibl.setBackground ? background : null;
            this.scene.backgroundRotation.set(0, -this.yawDegrees * Math.PI / 180, 0);
            this.status = 'ready';
        } catch (error) {
            this.status = 'failed';
            this.error = error?.message ?? String(error);
            this.sky = null;
            this.horizonRadiance = null;
            this.reflection = null;
            this.reflectionTexture?.dispose();
            this.reflectionTexture = null;
            this.scene.background = null;
            console.warn(`[Landscape] Calibrated sky unavailable (${ibl.hdrUrl}); the terrain keeps the calibrated sun without sky light: ${this.error}`);
        } finally {
            this.loadMilliseconds = performance.now() - started;
            if (!this.disposed) this.update();
        }
        return this;
    }

    /** @param {string} tier recalibrates the aerial perspective for the tier's sky in-scattering; programs recompile separately */
    setTier(tier) {
        this.tier = landscapeLightingTier(tier);
        this.update();
    }

    /** @param {number} seaLevel retained coordinates.seaLevel of the loaded landscape */
    setSeaLevel(seaLevel) {
        if (!Number.isFinite(seaLevel)) throw new Error('[Landscape] Sea level must be finite');
        this.seaLevel = seaLevel;
        this.update();
    }

    /** @param {boolean} visible a hidden water reference has no optical water body: submerged terrain is shaded as dry ground */
    setWaterVisible(visible) {
        if (typeof visible !== 'boolean') throw new Error('[Landscape] Water visibility must be boolean');
        this.waterVisible = visible;
        this.update();
    }

    /**
     * @returns {{texture:any,rotation:any,model:string}|null} the prefiltered sky reflection of the water (game frame, environment intensity
     *   applied) with the landscape → game rotation of its lookups
     */
    reflectionEnvironment() {
        if (!this.reflectionTexture) return null;
        return { texture: this.reflectionTexture, rotation: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(this.yawDegrees * Math.PI / 180)), model: this.reflection.model };
    }

    snapshot() {
        const state = this.current, coefficients = state.skyCoefficients, background = this.scene.background;
        const irradiance = Object.fromEntries([['up', [0, 1, 0]], ['east', [1, 0, 0]], ['north', [0, 0, -1]], ['west', [-1, 0, 0]], ['south', [0, 0, 1]], ['down', [0, -1, 0]]]
            .map(([name, normal]) => [name, evaluateLandscapeSkyIrradiance(coefficients, normal)]));
        const image = this.background?.image, reflection = this.reflection;
        return {
            model: LANDSCAPE_LIGHTING.model, status: this.status, error: this.error, tier: this.tier, tiers: Object.keys(LANDSCAPE_LIGHTING.tiers), tierDescriptions: LANDSCAPE_LIGHTING.tiers,
            sources: this.sources, toneMapping: this.settings.toneMapping, toneMappingThree: this.renderer.toneMapping, exposure: this.renderer.toneMappingExposure,
            sun: { azimuthDeg: this.atmosphere.sun.azimuthDeg, elevationDeg: this.atmosphere.sun.elevationDeg, direction: [...this.sunDirection],
                directionGame: landscapeSunDirection(this.atmosphere.sun.azimuthDeg, this.atmosphere.sun.elevationDeg), irradiance: [...this.sunIrradiance],
                intensity: this.settings.sunIntensity, colorLinear: [...this.settings.sunColorLinear], angularDiameterDeg: LANDSCAPE_LIGHTING.sunAngularDiameterDeg },
            hemisphereIntensity: this.hemisphere,
            binding: this.binding ? { landscapeId: this.binding.landscapeId, yawDegrees: this.yawDegrees, translation: { ...this.binding.transform.translation } } : null,
            environment: { iblId: this.settings.ibl.iblId, hdrUrl: this.settings.ibl.hdrUrl, enabled: this.settings.ibl.enabled, intensity: this.settings.ibl.envMapIntensity,
                setBackground: this.settings.ibl.setBackground, background: background?.isTexture ? 'hdr-equirect' : background ? 'other' : 'none', pmrem: false,
                // three.js draws a texture background as one 12-triangle box per frame
                backgroundDrawCalls: background?.isTexture ? 1 : 0, backgroundTriangles: background?.isTexture ? 12 : 0,
                loadMilliseconds: this.loadMilliseconds, projectionMilliseconds: this.projectionMilliseconds,
                reflection: reflection ? { model: reflection.model, width: reflection.width, height: reflection.height, roughness: reflection.roughness, alpha: reflection.alpha,
                    supportDegrees: reflection.supportDegrees, retainedWeight: reflection.retainedWeight, estimator: LANDSCAPE_SKY_REFLECTION.estimator, mapping: LANDSCAPE_SKY_REFLECTION.mapping,
                    milliseconds: this.reflectionMilliseconds } : null },
            sky: { model: LANDSCAPE_SKY_IRRADIANCE.model, basis: LANDSCAPE_SKY_IRRADIANCE.basis, coefficients: Array.from({ length: LANDSCAPE_SKY_IRRADIANCE.coefficients }, (_, index) => coefficients.slice(index * 3, index * 3 + 3)),
                irradiance, horizonRadiance: this.horizonRadiance, solidAngle: this.sky?.solidAngle ?? null },
            haze: { ...landscapeLightingConstants().atmosphere, calibration: state.calibration, calibrationRaw: this.calibration?.raw ?? null, asymptote: this.calibration?.asymptote ?? null,
                calibrationClamped: this.calibration?.clamped ?? false, enabled: this.tier !== 'low' },
            water: { ...landscapeLightingConstants().water, seaLevel: this.seaLevel, opticalLevel: this.waterVisible ? this.seaLevel : null, column: this.tier === 'low' ? 'constant-deep-water-source' : 'depth-decaying-source' },
            // terrain program binding: tiers standard and high read the terrain fields (stale or absent pages stay neutral); tier low and the water surface keep neutral hooks
            hooks: { sunVisibility: this.tier !== 'low' && this.response.terrainVisibility ? 'terrain-fields' : 'neutral', skyVisibility: this.tier !== 'low' && this.response.terrainVisibility ? 'terrain-fields' : 'neutral',
                waterSurface: 'neutral', binding: LANDSCAPE_LIGHTING.visibility, names: LANDSCAPE_LIGHTING.hooks },
            response: { switches: { ...this.response }, ...landscapeMaterialResponseSnapshot(), occluderBounce: this.tier !== 'low' && this.response.bounce && this.response.terrainVisibility },
            uniforms: { vectors: LANDSCAPE_LIGHTING.uniformVectors, layout: LANDSCAPE_LIGHTING.uniforms, sun: Array.from(this.uniforms.uLandscapeSun.value), sunIrradiance: Array.from(this.uniforms.uLandscapeSunIrradiance.value),
                response: Array.from(this.uniforms.uLandscapeResponse.value) },
            resources: { ledger: 'renderer-owned, outside the landscape residency ledger', hdrCpuBytes: image?.data?.byteLength ?? 0, hdrGpuBytes: image && background?.isTexture ? image.width * image.height * 8 : 0,
                backgroundCubeGpuBytes: image && background?.isTexture ? 6 * image.height * image.height * 8 : 0, reflectionCpuBytes: reflection ? reflection.width * reflection.height * 8 : 0,
                reflectionGpuBytes: reflection ? reflection.width * reflection.height * 8 : 0, halfFloatTableCpuBytes: this.sky ? 65536 * 4 : 0 }
        };
    }

    dispose() {
        this.disposed = true;
        this.scene.background = null;
        this.background = null;
        this.reflectionTexture?.dispose();
        this.reflectionTexture = null;
        this.reflection = null;
    }
}
