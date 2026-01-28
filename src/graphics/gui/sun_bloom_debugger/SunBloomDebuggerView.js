// src/graphics/gui/sun_bloom_debugger/SunBloomDebuggerView.js
// Orchestrates UI, input, and rendering for the Sun Bloom Debug tool.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { applyIBLIntensity, applyIBLToScene } from '../../lighting/IBL.js';
import { DEFAULT_IBL_ID, getIblEntryById, getIblOptions } from '../../content3d/catalogs/IBLCatalog.js';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';
import { applyAtmosphereToSkyDome, createGradientSkyDome, shouldShowSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { getPbrMaterialTileMeters } from '../../assets3d/materials/PbrMaterialCatalog.js';
import { getResolvedAtmosphereSettings, sanitizeAtmosphereSettings } from '../../visuals/atmosphere/AtmosphereSettings.js';
import { azimuthElevationDegToDir, dirToAzimuthElevationDeg } from '../../visuals/atmosphere/SunDirection.js';
import { getResolvedSunFlareSettings } from '../../visuals/sun/SunFlareSettings.js';
import { SunFlareRig } from '../../visuals/sun/SunFlareRig.js';
import { SunBloomDebuggerUI } from './SunBloomDebuggerUI.js';
import { loadHdriEnvironment } from '../atmosphere_debugger/AtmosphereDebuggerHdri.js';

const UP = new THREE.Vector3(0, 1, 0);
const BLOOM_LAYER_ID = 1;
const BLOOM_LAYER = new THREE.Layers();
BLOOM_LAYER.set(BLOOM_LAYER_ID);
const PBR_FLOOR_ID = 'pbr.rocky_terrain_02';
const PBR_BASE_URL = new URL('../../../../assets/public/pbr/', import.meta.url);

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function isInteractiveElement(target) {
    const tag = target?.tagName;
    if (!tag) return false;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable;
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function makePbrMapUrls(slug) {
    const dir = new URL(`${slug}/`, PBR_BASE_URL);
    return {
        baseColorUrl: new URL('basecolor.jpg', dir).toString(),
        normalUrl: new URL('normal_gl.png', dir).toString(),
        ormUrl: new URL('arm.png', dir).toString()
    };
}

function makeFinalCompositePass(bloomTexture) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: bloomTexture ?? null },
            uBloomStrength: { value: 0.0 },
            uBloomBrightnessOnly: { value: 1.0 },
            uViewMode: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;
            uniform float uBloomStrength;
            uniform float uBloomBrightnessOnly;
            uniform float uViewMode;
            varying vec2 vUv;

            float luma(vec3 c) {
                return dot(c, vec3(0.2126, 0.7152, 0.0722));
            }

            void main() {
                vec3 base = texture2D(baseTexture, vUv).rgb;
                vec3 bloom = texture2D(bloomTexture, vUv).rgb * uBloomStrength;
                if (uBloomBrightnessOnly > 0.5) {
                    float y = luma(bloom);
                    bloom = vec3(y);
                }
                vec3 outColor = base + bloom;
                if (uViewMode > 0.5) outColor = bloom;
                gl_FragColor = vec4(outColor, 1.0);
            }
        `,
        depthWrite: false,
        depthTest: false,
        toneMapped: true
    });

    return new ShaderPass(mat, 'baseTexture');
}

function createSunDiscEmitter() {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uIntensity: { value: 25.0 },
            uFalloff: { value: 2.2 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uIntensity;
            uniform float uFalloff;
            varying vec2 vUv;

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                float r = length(p);
                float a = exp(-pow(r, max(0.05, uFalloff)) * 6.0);
                vec3 col = vec3(1.0) * (a * uIntensity);
                gl_FragColor = vec4(col, a);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sun_disc_emitter';
    mesh.frustumCulled = false;
    mesh.renderOrder = 940;
    mesh.layers.set(0);
    mesh.layers.enable(BLOOM_LAYER_ID);
    return mesh;
}

export class SunBloomDebuggerView {
    constructor({ canvas } = {}) {
        this.canvas = canvas;

        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;

        this._ui = null;
        this._settings = null;

        this._root = null;
        this._floor = null;
        this._floorMat = null;
        this._floorTex = [];

        this._hemi = null;
        this._sun = null;
        this._sky = null;

        this._sunEmitter = null;
        this._sunWorldPos = new THREE.Vector3();
        this._sunNdc = new THREE.Vector3();

        this._occluder = null;
        this._tmpV3 = new THREE.Vector3();
        this._tmpRay = new THREE.Vector3();

        this._flare = null;

        this._env = null;
        this._loadingEnv = null;
        this._loadingIblId = null;
        this._iblId = null;
        this._envLoadSeq = 0;

        this._post = null;
        this._darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this._materialCache = new Map();

        this._compare = { enabled: true, slot: 0, toggleReq: 0 };
        this._lastCameraPresetReq = 0;

        this._perf = { lastMs: 0, emaMs: 0 };

        this._raf = 0;
        this._lastT = 0;

        this._keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            KeyW: false,
            KeyA: false,
            KeyS: false,
            KeyD: false,
            ShiftLeft: false,
            ShiftRight: false
        };
        this._onResize = () => this._resize();
        this._onKeyDown = (e) => this._handleKey(e, true);
        this._onKeyUp = (e) => this._handleKey(e, false);
    }

    async start() {
        if (!this.canvas) throw new Error('[SunBloomDebugger] Missing canvas');
        if (this.renderer) return;

        if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;

        const renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

        if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
        else renderer.outputEncoding = THREE.sRGBEncoding;

        if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);

        const lighting = getResolvedLightingSettings({ includeUrlOverrides: true });
        const atmosphere = getResolvedAtmosphereSettings({ includeUrlOverrides: true });
        const initialIblId = lighting?.ibl?.iblId ?? DEFAULT_IBL_ID;
        const initialHdrEntry = getIblEntryById(initialIblId) ?? getIblEntryById(DEFAULT_IBL_ID);

        const initialSettings = {
            iblId: initialHdrEntry?.id ?? DEFAULT_IBL_ID,
            iblEnabled: lighting?.ibl?.enabled ?? false,
            backgroundEnabled: true,
            envMapIntensity: lighting?.ibl?.envMapIntensity ?? 0.25,
            exposure: lighting?.exposure ?? 1.6,
            sunIntensity: lighting?.sunIntensity ?? 1.2,
            hemiIntensity: lighting?.hemiIntensity ?? 0.85,
            sunAzimuthDeg: atmosphere?.sun?.azimuthDeg ?? 45,
            sunElevationDeg: atmosphere?.sun?.elevationDeg ?? 35,
            skyBgMode: atmosphere?.sky?.iblBackgroundMode ?? 'ibl',
            skyHorizonColor: atmosphere?.sky?.horizonColor ?? '#EAF9FF',
            skyZenithColor: atmosphere?.sky?.zenithColor ?? '#7BCFFF',
            skyGroundColor: atmosphere?.sky?.groundColor ?? (atmosphere?.sky?.horizonColor ?? '#EAF9FF'),
            skyExposure: atmosphere?.sky?.exposure ?? 1.0,
            skyCurve: atmosphere?.sky?.curve ?? 1.0,
            skyDither: atmosphere?.sky?.ditherStrength ?? 0.85,
            hazeEnabled: atmosphere?.haze?.enabled ?? true,
            hazeIntensity: atmosphere?.haze?.intensity ?? 0.22,
            hazeThickness: atmosphere?.haze?.thickness ?? 0.22,
            hazeCurve: atmosphere?.haze?.curve ?? 1.6,
            glareEnabled: atmosphere?.glare?.enabled ?? true,
            glareIntensity: atmosphere?.glare?.intensity ?? 0.95,
            glareSigmaDeg: atmosphere?.glare?.sigmaDeg ?? 10,
            glarePower: atmosphere?.glare?.power ?? 1.0,
            discEnabled: false,
            discIntensity: atmosphere?.disc?.intensity ?? 4.0,
            discSigmaDeg: atmosphere?.disc?.sigmaDeg ?? 0.22,
            discCoreIntensity: atmosphere?.disc?.coreIntensity ?? 2.5,
            discCoreSigmaDeg: atmosphere?.disc?.coreSigmaDeg ?? 0.06,
            skyDebugMode: atmosphere?.debug?.mode ?? 'full',
            skySunRing: atmosphere?.debug?.showSunRing ?? false,
            sunBloomVariationA: 'baseline',
            sunBloomVariationB: 'occlusion',
            sunBloomCompareEnabled: true,
            sunBloomToggleRequested: 0,
            sunBloomEnabled: true,
            sunBloomStrength: 0.9,
            sunBloomRadius: 0.25,
            sunBloomThreshold: 1.05,
            sunBloomBrightnessOnly: true,
            sunBloomShowEmitter: true,
            sunBloomDebugView: 'final',
            sunDiscRadiusDeg: 0.55,
            sunDiscIntensity: 25,
            sunDiscFalloff: 2.2,
            occluderEnabled: true,
            occluderOffsetX: 0,
            occluderOffsetY: 0,
            occluderDistance: 60,
            occluderScale: 12,
            occluderRotationDeg: 0,
            cameraPreset: 'default',
            cameraPresetApplyRequested: 0
        };
        this._settings = { ...initialSettings };

        this._ui = new SunBloomDebuggerUI({
            initialSettings,
            iblOptions: getIblOptions(),
            onChange: (next) => this._applySettings(next),
            onDetectSun: () => this._detectSunFromHdr()
        });
        this._ui.mount();

        this._root = new THREE.Group();
        this._root.name = 'SunBloomDebugger';
        this.scene.add(this._root);

        this._setupSceneContent();
        this._setupPost();

        this.controls = createToolCameraController(this.camera, this.canvas, {
            uiRoot: this._ui.root,
            enabled: true,
            enableDamping: true,
            dampingFactor: 0.08,
            rotateSpeed: 0.95,
            panSpeed: 0.9,
            zoomSpeed: 1.0,
            minDistance: 0.25,
            maxDistance: 500,
            minPolarAngle: 0.001,
            maxPolarAngle: Math.PI - 0.001,
            getFocusTarget: () => ({
                center: new THREE.Vector3(0, 1, 0),
                radius: 18
            }),
            initialPose: {
                position: new THREE.Vector3(10, 6, 10),
                target: new THREE.Vector3(0, 1, 0)
            }
        });

        this._applySettings(initialSettings);
        await this._loadEnvironment(initialSettings.iblId);

        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('keydown', this._onKeyDown, { passive: false });
        window.addEventListener('keyup', this._onKeyUp, { passive: false });
        this._resize();
        this._raf = requestAnimationFrame((t) => this._tick(t));
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);

        this.controls?.dispose?.();
        this.controls = null;

        this._ui?.destroy?.();
        this._ui = null;

        if (this._flare) {
            this._root?.remove?.(this._flare.group);
            this._flare.dispose?.();
        }
        this._flare = null;

        if (this._sunEmitter) {
            this._root?.remove?.(this._sunEmitter);
            this._sunEmitter.geometry?.dispose?.();
            this._sunEmitter.material?.dispose?.();
        }
        this._sunEmitter = null;

        if (this._occluder) {
            this._root?.remove?.(this._occluder);
            this._occluder.geometry?.dispose?.();
            this._occluder.material?.dispose?.();
        }
        this._occluder = null;

        if (this._sky) {
            this._root?.remove?.(this._sky);
            this._sky.geometry?.dispose?.();
            this._sky.material?.dispose?.();
        }
        this._sky = null;

        if (this._floor) {
            this._root?.remove?.(this._floor);
            this._floor.geometry?.dispose?.();
            this._floorMat?.dispose?.();
            for (const tex of this._floorTex) tex?.dispose?.();
        }

        if (this._hemi) this._root?.remove?.(this._hemi);
        if (this._sun) {
            this._root?.remove?.(this._sun);
            this._sun?.target?.removeFromParent?.();
        }

        if (this._env?.envMap) this._env.envMap.dispose?.();
        if (this._env?.hdrTexture) this._env.hdrTexture.dispose?.();
        this._env = null;
        this._loadingEnv = null;

        this._post?.dispose?.();
        this._post = null;

        this._darkMaterial?.dispose?.();
        this._darkMaterial = null;
        this._materialCache?.clear?.();
        this._materialCache = null;

        this.scene?.remove?.(this._root);
        this._root = null;
        this.scene = null;

        this.renderer?.dispose?.();
        this.renderer = null;
        this.camera = null;
    }

    toggleCompare() {
        const enabled = !!this._settings?.sunBloomCompareEnabled;
        if (!enabled) return;
        this._compare.slot = this._compare.slot ? 0 : 1;
    }

    _setupSceneContent() {
        const floorSize = 80;
        const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize, 1, 1);
        floorGeo.rotateX(-Math.PI / 2);
        const uv = floorGeo.attributes.uv ?? null;
        if (uv?.array) floorGeo.setAttribute('uv2', new THREE.BufferAttribute(uv.array, 2));

        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0
        });
        this._floorMat = floorMat;

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.name = 'sunbloom_floor';
        floor.receiveShadow = true;
        this._root.add(floor);
        this._floor = floor;

        this._loadFloorPbrTextures({ floorSizeMeters: floorSize });

        const hemi = new THREE.HemisphereLight(0xffffff, 0x0b0f14, 0.85);
        hemi.position.set(0, 50, 0);
        this._root.add(hemi);
        this._hemi = hemi;

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 350;
        sun.shadow.camera.left = -60;
        sun.shadow.camera.right = 60;
        sun.shadow.camera.top = 60;
        sun.shadow.camera.bottom = -60;
        sun.target.position.set(0, 0, 0);
        this._root.add(sun.target);
        this._root.add(sun);
        this._sun = sun;

        const sky = createGradientSkyDome({
            radius: 450,
            atmosphere: null,
            sunIntensity: 0.28
        });
        this._root.add(sky);
        this._sky = sky;

        const emitter = createSunDiscEmitter();
        this._root.add(emitter);
        this._sunEmitter = emitter;

        const occGeo = new THREE.BoxGeometry(1, 1, 0.6);
        const occMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.95, metalness: 0.0 });
        const occluder = new THREE.Mesh(occGeo, occMat);
        occluder.name = 'sunbloom_occluder';
        occluder.castShadow = true;
        occluder.receiveShadow = true;
        this._root.add(occluder);
        this._occluder = occluder;

        const sphereGeo = new THREE.SphereGeometry(1, 64, 32);

        const metalSphere = new THREE.Mesh(
            sphereGeo,
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 1.0,
                roughness: 0.18
            })
        );
        metalSphere.position.set(-2.2, 1.0, -1.4);
        metalSphere.castShadow = true;
        metalSphere.receiveShadow = true;
        metalSphere.name = 'sunbloom_sphere_metal';
        this._root.add(metalSphere);

        const glassSphere = new THREE.Mesh(
            sphereGeo,
            new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                metalness: 0.0,
                roughness: 0.04,
                transmission: 1.0,
                thickness: 0.8,
                ior: 1.5
            })
        );
        glassSphere.position.set(2.2, 1.0, -1.4);
        glassSphere.castShadow = true;
        glassSphere.receiveShadow = true;
        glassSphere.name = 'sunbloom_sphere_glass';
        this._root.add(glassSphere);

        const flareSettings = getResolvedSunFlareSettings({ includeUrlOverrides: true });
        const flare = new SunFlareRig({
            light: sun,
            settings: {
                ...(flareSettings ?? {}),
                enabled: true,
                components: { core: true, halo: true, starburst: true, ghosting: true }
            }
        });
        this._root.add(flare.group);
        this._flare = flare;
    }

    _setupPost() {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        if (!renderer || !scene || !camera) return;

        const bloomComposer = new EffectComposer(renderer);
        bloomComposer.renderToScreen = false;
        const bloomRender = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.25, 1.05);
        bloomComposer.addPass(bloomRender);
        bloomComposer.addPass(bloomPass);

        const finalComposer = new EffectComposer(renderer);
        finalComposer.renderToScreen = true;
        const finalRender = new RenderPass(scene, camera);
        const finalPass = makeFinalCompositePass(bloomComposer.renderTarget2.texture);
        const outputPass = new OutputPass();
        finalComposer.addPass(finalRender);
        finalComposer.addPass(finalPass);
        finalComposer.addPass(outputPass);

        this._post = {
            bloomComposer,
            bloomPass,
            finalComposer,
            finalPass,
            dispose: () => {
                bloomPass?.dispose?.();
                outputPass?.dispose?.();
                finalPass?.material?.dispose?.();
                bloomComposer?.dispose?.();
                finalComposer?.dispose?.();
                bloomComposer?.renderTarget1?.dispose?.();
                bloomComposer?.renderTarget2?.dispose?.();
                finalComposer?.renderTarget1?.dispose?.();
                finalComposer?.renderTarget2?.dispose?.();
            }
        };
    }

    _loadFloorPbrTextures({ floorSizeMeters }) {
        const mat = this._floorMat;
        const renderer = this.renderer;
        if (!mat || !renderer) return;

        const slug = PBR_FLOOR_ID.startsWith('pbr.') ? PBR_FLOOR_ID.slice(4) : PBR_FLOOR_ID;
        const urls = makePbrMapUrls(slug);

        const tileMeters = getPbrMaterialTileMeters(PBR_FLOOR_ID);
        const rep = (Number.isFinite(tileMeters) && tileMeters > 0) ? (floorSizeMeters / tileMeters) : 10;
        const repeat = Number.isFinite(rep) ? Math.max(0.25, rep) : 10;

        const loader = new THREE.TextureLoader();
        const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 8;
        const configure = (tex, { srgb }) => {
            if (!tex) return;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeat, repeat);
            tex.anisotropy = Math.min(16, Number(maxAniso) || 8);
            applyTextureColorSpace(tex, { srgb });
            tex.needsUpdate = true;
            this._floorTex.push(tex);
        };

        loader.load(
            urls.baseColorUrl,
            (tex) => {
                configure(tex, { srgb: true });
                mat.map = tex;
                mat.color.setHex(0xffffff);
                mat.needsUpdate = true;
            },
            undefined,
            (err) => console.warn('[SunBloomDebugger] Floor baseColor failed to load', err)
        );

        loader.load(
            urls.normalUrl,
            (tex) => {
                configure(tex, { srgb: false });
                mat.normalMap = tex;
                mat.normalScale?.set?.(0.9, 0.9);
                mat.needsUpdate = true;
            },
            undefined,
            (err) => console.warn('[SunBloomDebugger] Floor normal failed to load', err)
        );

        loader.load(
            urls.ormUrl,
            (tex) => {
                configure(tex, { srgb: false });
                mat.roughnessMap = tex;
                mat.metalnessMap = tex;
                mat.aoMap = tex;
                mat.roughness = 1.0;
                mat.metalness = 1.0;
                mat.needsUpdate = true;
            },
            undefined,
            (err) => console.warn('[SunBloomDebugger] Floor ORM failed to load', err)
        );
    }

    async _loadEnvironment(iblId) {
        const requestedId = typeof iblId === 'string' && iblId ? iblId : DEFAULT_IBL_ID;
        if (this._loadingEnv && this._loadingIblId === requestedId) return this._loadingEnv;
        if (this._env && this._iblId === requestedId) return this._env;

        const entry = getIblEntryById(requestedId) ?? getIblEntryById(DEFAULT_IBL_ID);
        const hdrUrl = entry?.hdrUrl ?? null;
        if (!hdrUrl) return null;

        const renderer = this.renderer;
        if (!renderer) return null;

        this._loadingIblId = requestedId;
        const seq = ++this._envLoadSeq;
        this._loadingEnv = loadHdriEnvironment(renderer, hdrUrl)
            .then((env) => {
                if (seq !== this._envLoadSeq) {
                    env?.envMap?.dispose?.();
                    env?.hdrTexture?.dispose?.();
                    return null;
                }
                if (this._env?.envMap) this._env.envMap.dispose?.();
                if (this._env?.hdrTexture) this._env.hdrTexture.dispose?.();
                env.iblId = requestedId;
                this._env = env;
                this._iblId = requestedId;
                this._loadingEnv = null;
                this._loadingIblId = null;

                const { azimuthDeg, elevationDeg } = dirToAzimuthElevationDeg(env?.sunDirection);
                const nextAngles = { sunAzimuthDeg: azimuthDeg, sunElevationDeg: elevationDeg };
                this._ui?.setDraft?.(nextAngles);
                this._settings = { ...(this._settings ?? {}), ...nextAngles, iblId: requestedId };
                this._applySettings(this._settings);
                return env;
            })
            .catch((err) => {
                if (seq === this._envLoadSeq) {
                    this._loadingEnv = null;
                    this._loadingIblId = null;
                }
                console.error('[SunBloomDebugger] HDRI failed to load', err);
                return null;
            });

        return this._loadingEnv;
    }

    _detectSunFromHdr() {
        const dir = this._env?.sunDirection ?? null;
        if (!dir) return;
        const { azimuthDeg, elevationDeg } = dirToAzimuthElevationDeg(dir);
        this._ui?.setDraft?.({ sunAzimuthDeg: azimuthDeg, sunElevationDeg: elevationDeg });
        this._applySettings(this._ui?._draft ?? {});
    }

    _applySettings(nextSettings) {
        const next = nextSettings && typeof nextSettings === 'object' ? nextSettings : {};
        this._settings = { ...(this._settings ?? {}), ...next };

        if (Number(this._settings.sunBloomToggleRequested ?? 0) !== Number(this._compare.toggleReq ?? 0)) {
            this._compare.toggleReq = Number(this._settings.sunBloomToggleRequested ?? 0);
            this.toggleCompare();
        }

        const desiredIblId = String(this._settings.iblId ?? DEFAULT_IBL_ID);
        if (desiredIblId && desiredIblId !== this._iblId && desiredIblId !== this._loadingIblId) {
            this._loadEnvironment(desiredIblId).catch(() => {});
        }

        const renderer = this.renderer;
        const hemi = this._hemi;
        const sun = this._sun;
        const scene = this.scene;
        const post = this._post;
        if (!renderer || !scene || !hemi || !sun || !post) return;

        const exposure = clamp(this._settings.exposure ?? 1.6, 0.1, 5);
        renderer.toneMappingExposure = exposure;

        hemi.intensity = clamp(this._settings.hemiIntensity ?? 0.85, 0, 5);
        sun.intensity = clamp(this._settings.sunIntensity ?? 1.2, 0, 10);

        const atmo = sanitizeAtmosphereSettings({
            sun: {
                azimuthDeg: this._settings.sunAzimuthDeg,
                elevationDeg: this._settings.sunElevationDeg
            },
            sky: {
                horizonColor: this._settings.skyHorizonColor,
                zenithColor: this._settings.skyZenithColor,
                groundColor: this._settings.skyGroundColor,
                curve: this._settings.skyCurve,
                exposure: this._settings.skyExposure,
                ditherStrength: this._settings.skyDither,
                iblBackgroundMode: this._settings.skyBgMode
            },
            haze: {
                enabled: this._settings.hazeEnabled,
                intensity: this._settings.hazeIntensity,
                thickness: this._settings.hazeThickness,
                curve: this._settings.hazeCurve
            },
            glare: {
                enabled: this._settings.glareEnabled,
                intensity: this._settings.glareIntensity,
                sigmaDeg: this._settings.glareSigmaDeg,
                power: this._settings.glarePower
            },
            disc: {
                enabled: !!this._settings.discEnabled,
                intensity: this._settings.discIntensity,
                sigmaDeg: this._settings.discSigmaDeg,
                coreIntensity: this._settings.discCoreIntensity,
                coreSigmaDeg: this._settings.discCoreSigmaDeg
            },
            debug: {
                mode: this._settings.skyDebugMode,
                showSunRing: this._settings.skySunRing
            }
        });

        const sunDir = azimuthElevationDegToDir(atmo.sun.azimuthDeg, atmo.sun.elevationDeg);
        sun.position.copy(sunDir).multiplyScalar(120);
        sun.target.position.set(0, 0, 0);
        sun.target.updateMatrixWorld?.();

        const iblEnabled = !!this._settings.iblEnabled;
        const envMapIntensity = clamp(this._settings.envMapIntensity ?? 0.25, 0, 5);

        if (this._env?.envMap) {
            applyIBLToScene(scene, this._env.envMap, { enabled: iblEnabled, setBackground: false });
            if (iblEnabled) applyIBLIntensity(scene, { enabled: true, envMapIntensity }, { force: true });
        } else {
            applyIBLToScene(scene, null, { enabled: false, setBackground: false });
        }

        scene.background = (this._settings.backgroundEnabled && this._env?.hdrTexture) ? this._env.hdrTexture : null;

        if (this._sky) {
            applyAtmosphereToSkyDome(this._sky, atmo, { sunDir: sun.position });
            this._sky.visible = shouldShowSkyDome({
                skyIblBackgroundMode: atmo?.sky?.iblBackgroundMode ?? 'ibl',
                lightingIblSetBackground: !!this._settings.backgroundEnabled,
                sceneBackground: scene.background ?? null
            });
        }

        if (this._sunEmitter?.material?.uniforms) {
            this._sunEmitter.material.uniforms.uIntensity.value = clamp(this._settings.sunDiscIntensity ?? 25, 0, 200);
            this._sunEmitter.material.uniforms.uFalloff.value = clamp(this._settings.sunDiscFalloff ?? 2.2, 0.5, 10);
            this._sunEmitter.visible = !!this._settings.sunBloomShowEmitter;
        }

        post.bloomPass.strength = clamp(this._settings.sunBloomStrength ?? 0.9, 0, 5);
        post.bloomPass.radius = clamp(this._settings.sunBloomRadius ?? 0.25, 0, 1);
        post.bloomPass.threshold = clamp(this._settings.sunBloomThreshold ?? 1.05, 0, 5);

        const compositeMat = post.finalPass?.material ?? null;
        if (compositeMat?.uniforms?.uBloomBrightnessOnly) compositeMat.uniforms.uBloomBrightnessOnly.value = this._settings.sunBloomBrightnessOnly ? 1.0 : 0.0;

        if (compositeMat?.uniforms?.uViewMode) compositeMat.uniforms.uViewMode.value = this._settings.sunBloomDebugView === 'bloom' ? 1.0 : 0.0;

        const hdrLabel = getIblEntryById(desiredIblId)?.label ?? '-';
        const variation = this._getActiveVariationId();
        const hud = [
            `HDR: ${hdrLabel}`,
            `Exposure: ${exposure.toFixed(2)}`,
            `Sun: az ${Math.round(atmo.sun.azimuthDeg)}° el ${Math.round(atmo.sun.elevationDeg)}°`,
            `Var: ${variation}${this._settings.sunBloomCompareEnabled ? ` (${this._compare.slot ? 'B' : 'A'})` : ''}`,
            `IBL: ${iblEnabled ? 'on' : 'off'} · Env: ${envMapIntensity.toFixed(2)}`,
            `Frame: ${this._perf.emaMs.toFixed(2)}ms`
        ].join('\n');
        this._ui?.setHudText?.(hud);
    }

    _getActiveVariationId() {
        const a = String(this._settings?.sunBloomVariationA ?? 'baseline');
        const b = String(this._settings?.sunBloomVariationB ?? 'occlusion');
        const enabled = !!this._settings?.sunBloomCompareEnabled;
        if (!enabled) return a;
        return this._compare.slot ? b : a;
    }

    _applyCameraPreset() {
        const controls = this.controls;
        if (!controls) return;

        const id = String(this._settings?.cameraPreset ?? 'default');
        if (id === 'tele') {
            controls.setLookAt({ position: { x: 6.5, y: 2.2, z: 6.5 }, target: { x: 0, y: 1, z: 0 } });
            return;
        }
        if (id === 'low') {
            controls.setLookAt({ position: { x: 10, y: 1.4, z: 10 }, target: { x: 0, y: 1.0, z: 0 } });
            return;
        }
        controls.setLookAt({ position: { x: 10, y: 6, z: 10 }, target: { x: 0, y: 1, z: 0 } });
    }

    _handleKey(e, isDown) {
        if (!e) return;
        if (isInteractiveElement(e.target) || isInteractiveElement(document.activeElement)) return;
        const code = e.code;
        if (!(code in this._keys)) return;
        e.preventDefault();
        this._keys[code] = !!isDown;
    }

    _resize() {
        const renderer = this.renderer;
        const camera = this.camera;
        const canvas = this.canvas;
        const post = this._post;
        if (!renderer || !camera || !canvas || !post) return;

        const rect = canvas.getBoundingClientRect?.() ?? null;
        const w = Math.max(1, Math.floor(rect?.width ?? canvas.clientWidth ?? 1));
        const h = Math.max(1, Math.floor(rect?.height ?? canvas.clientHeight ?? 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix?.();
        post.bloomComposer?.setSize?.(w, h);
        post.finalComposer?.setSize?.(w, h);
        post.bloomPass?.setSize?.(w, h);
    }

    _tick(t) {
        const renderer = this.renderer;
        const scene = this.scene;
        const camera = this.camera;
        const post = this._post;
        if (!renderer || !scene || !camera || !post) return;

        const now = Number(t) || 0;
        const dt = this._lastT ? Math.min(0.05, Math.max(0, (now - this._lastT) / 1000)) : 0;
        this._lastT = now;

        this._updateCameraFromKeys(dt);
        this.controls?.update?.(dt);

        if (Number(this._settings?.cameraPresetApplyRequested ?? 0) !== Number(this._lastCameraPresetReq ?? 0)) {
            this._lastCameraPresetReq = Number(this._settings.cameraPresetApplyRequested ?? 0);
            this._applyCameraPreset();
        }

        if (this._sky) this._sky.position.copy(camera.position);

        this._updateSunEmitter();
        this._updateOccluder();
        this._flare?.update?.({ camera, renderer });

        const t0 = performance.now();
        this._renderActiveVariation();
        const t1 = performance.now();
        this._perf.lastMs = t1 - t0;
        this._perf.emaMs = this._perf.emaMs ? (this._perf.emaMs * 0.9 + this._perf.lastMs * 0.1) : this._perf.lastMs;

        this._raf = requestAnimationFrame((ts) => this._tick(ts));
    }

    _updateSunEmitter() {
        const emitter = this._sunEmitter;
        const sun = this._sun;
        const camera = this.camera;
        if (!emitter || !sun || !camera) return;

        const far = Number.isFinite(camera.far) ? camera.far : 1200;
        const dist = Math.max(60, far * 0.9);
        const sunDir = this._tmpV3.copy(sun.position).normalize();
        this._sunWorldPos.copy(camera.position).addScaledVector(sunDir, dist);

        const rDeg = clamp(this._settings?.sunDiscRadiusDeg ?? 0.55, 0.05, 6);
        const rRad = (rDeg * Math.PI) / 180;
        const radius = dist * Math.tan(rRad);
        const size = Math.max(0.01, radius * 2);

        emitter.position.copy(this._sunWorldPos);
        emitter.scale.set(size, size, 1);
        emitter.quaternion.copy(camera.quaternion);
        emitter.updateMatrixWorld?.();

        this._sunNdc.copy(this._sunWorldPos).project(camera);
    }

    _updateOccluder() {
        const occ = this._occluder;
        const camera = this.camera;
        if (!occ || !camera) return;

        const enabled = !!this._settings?.occluderEnabled;
        occ.visible = enabled;
        if (!enabled) return;

        const offX = clamp(this._settings?.occluderOffsetX ?? 0, -1, 1);
        const offY = clamp(this._settings?.occluderOffsetY ?? 0, -1, 1);
        const ndcX = clamp((this._sunNdc.x ?? 0) + offX, -1.25, 1.25);
        const ndcY = clamp((this._sunNdc.y ?? 0) + offY, -1.25, 1.25);

        const depth = clamp(this._settings?.occluderDistance ?? 60, 2, 250);
        const sample = this._tmpV3.set(ndcX, ndcY, 0.5).unproject(camera);
        this._tmpRay.copy(sample).sub(camera.position).normalize();
        occ.position.copy(camera.position).addScaledVector(this._tmpRay, depth);

        const s = clamp(this._settings?.occluderScale ?? 12, 0.5, 80);
        occ.scale.set(s, s, s);
        const rotZ = (clamp(this._settings?.occluderRotationDeg ?? 0, -180, 180) * Math.PI) / 180;
        occ.rotation.set(0, 0, rotZ);
        occ.updateMatrixWorld?.();
    }

    _renderActiveVariation() {
        const variation = this._getActiveVariationId();
        const post = this._post;
        const mat = post?.finalPass?.material ?? null;
        if (!post || !mat?.uniforms?.uBloomStrength) return;

        const bloomEnabled = !!this._settings?.sunBloomEnabled;
        const strength = bloomEnabled ? clamp(this._settings?.sunBloomStrength ?? 0.9, 0, 5) : 0;

        const wantBloom = variation === 'selective' || variation === 'occlusion';
        mat.uniforms.uBloomStrength.value = (wantBloom ? strength : 0);

        if (variation === 'analytic_glare') {
            post.bloomComposer?.renderTarget2?.texture && (mat.uniforms.uBloomStrength.value = 0);
            post.finalComposer.render();
            return;
        }

        if (!wantBloom) {
            post.finalComposer.render();
            return;
        }

        if (variation === 'selective') {
            this._renderBloomSunOnly({ occlusion: false });
            post.finalComposer.render();
            return;
        }

        this._renderBloomSunOnly({ occlusion: true });
        post.finalComposer.render();
    }

    _renderBloomSunOnly({ occlusion }) {
        const post = this._post;
        const camera = this.camera;
        const scene = this.scene;
        if (!post || !camera || !scene) return;

        const prevLayers = camera.layers.mask;
        const prevFlareVisible = this._flare?.group?.visible ?? true;
        const prevBackground = scene.background ?? null;
        scene.background = null;

        if (!occlusion) {
            camera.layers.set(BLOOM_LAYER_ID);
            if (this._flare?.group) this._flare.group.visible = false;
            post.bloomComposer.render();
            camera.layers.mask = prevLayers;
            scene.background = prevBackground;
            if (this._flare?.group) this._flare.group.visible = prevFlareVisible;
            return;
        }

        camera.layers.set(0);
        camera.layers.enable(BLOOM_LAYER_ID);

        this._materialCache.clear();
        scene.traverse((obj) => {
            if (!obj?.isMesh) return;
            const inBloom = BLOOM_LAYER.test(obj.layers);
            if (inBloom) return;
            const mat = obj.material ?? null;
            if (!mat) return;
            this._materialCache.set(obj, mat);
            obj.material = this._darkMaterial;
        });

        if (this._flare?.group) this._flare.group.visible = false;

        post.bloomComposer.render();

        for (const [obj, mat] of this._materialCache.entries()) {
            if (obj && obj.isMesh) obj.material = mat;
        }
        this._materialCache.clear();

        camera.layers.mask = prevLayers;
        scene.background = prevBackground;
        if (this._flare?.group) this._flare.group.visible = prevFlareVisible;
    }

    _updateCameraFromKeys(dt) {
        const controls = this.controls;
        const camera = this.camera;
        if (!controls || !camera) return;

        const moveX = (this._keys.ArrowRight || this._keys.KeyD ? 1 : 0) - (this._keys.ArrowLeft || this._keys.KeyA ? 1 : 0);
        const moveZ = (this._keys.ArrowDown || this._keys.KeyS ? 1 : 0) - (this._keys.ArrowUp || this._keys.KeyW ? 1 : 0);
        if (!moveX && !moveZ) return;

        const isFast = this._keys.ShiftLeft || this._keys.ShiftRight;
        const speed = (isFast ? 18 : 8) * Math.max(0.001, dt);

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-8) return;
        forward.normalize();

        const right = forward.clone().cross(UP).normalize();
        const move = new THREE.Vector3();
        move.addScaledVector(right, moveX);
        move.addScaledVector(forward, moveZ);
        if (move.lengthSq() < 1e-8) return;
        move.normalize().multiplyScalar(speed);
        controls.panWorld?.(move.x, move.y, move.z);
    }
}
