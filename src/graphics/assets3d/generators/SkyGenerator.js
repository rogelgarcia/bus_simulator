// src/graphics/assets3d/generators/SkyGenerator.js
// Gradient percent is based on sky-dome direction y: 0=horizon, 1=zenith.
import * as THREE from 'three';
import { ATMOSPHERE_DEFAULTS } from '../../visuals/atmosphere/AtmosphereSettings.js';

let _hexAlreadyLinearProbe = null;

function srgbToLinearColor(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) {
        if (_hexAlreadyLinearProbe === null) {
            const probe = new THREE.Color('#808080');
            _hexAlreadyLinearProbe = probe.r < 0.3;
        }
        if (!_hexAlreadyLinearProbe) c.convertSRGBToLinear();
    }
    return c;
}

export function shouldShowSkyDome({ skyIblBackgroundMode = 'ibl', lightingIblSetBackground = false, sceneBackground = null } = {}) {
    const bgMode = skyIblBackgroundMode === 'gradient' ? 'gradient' : 'ibl';
    if (bgMode === 'gradient') return true;
    const bg = sceneBackground ?? null;
    const bgIsTexture = !!bg && !!bg.isTexture;
    return !(lightingIblSetBackground && bgIsTexture);
}

function degToSigma2(deg) {
    const d = Number(deg);
    const rad = (Math.max(0, d) * Math.PI) / 180;
    return rad * rad;
}

function getDebugModeId(mode) {
    const raw = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    if (raw === 'baseline') return 1;
    if (raw === 'glare') return 2;
    if (raw === 'disc') return 3;
    return 0;
}

export function applyAtmosphereToSkyDome(skyDome, atmosphere, { sunDir = null } = {}) {
    const mesh = skyDome && typeof skyDome === 'object' ? skyDome : null;
    const mat = mesh?.material ?? null;
    const uniforms = mat?.uniforms ?? null;
    if (!uniforms) return false;

    const atmo = atmosphere && typeof atmosphere === 'object' ? atmosphere : ATMOSPHERE_DEFAULTS;
    const sky = atmo.sky && typeof atmo.sky === 'object' ? atmo.sky : ATMOSPHERE_DEFAULTS.sky;
    const haze = atmo.haze && typeof atmo.haze === 'object' ? atmo.haze : ATMOSPHERE_DEFAULTS.haze;
    const glare = atmo.glare && typeof atmo.glare === 'object' ? atmo.glare : ATMOSPHERE_DEFAULTS.glare;
    const disc = atmo.disc && typeof atmo.disc === 'object' ? atmo.disc : ATMOSPHERE_DEFAULTS.disc;
    const dbg = atmo.debug && typeof atmo.debug === 'object' ? atmo.debug : ATMOSPHERE_DEFAULTS.debug;

    const setColor = (u, hex) => {
        if (!u?.value) return;
        u.value.copy(srgbToLinearColor(hex));
    };

    setColor(uniforms.uHorizon, sky.horizonColor ?? ATMOSPHERE_DEFAULTS.sky.horizonColor);
    setColor(uniforms.uZenith, sky.zenithColor ?? ATMOSPHERE_DEFAULTS.sky.zenithColor);
    setColor(uniforms.uGround, sky.groundColor ?? ATMOSPHERE_DEFAULTS.sky.groundColor);
    setColor(uniforms.uHazeTint, haze.tintColor ?? ATMOSPHERE_DEFAULTS.haze.tintColor);

    if (uniforms.uSkyCurve) uniforms.uSkyCurve.value = Number.isFinite(sky.curve) ? sky.curve : ATMOSPHERE_DEFAULTS.sky.curve;
    if (uniforms.uSkyExposure) uniforms.uSkyExposure.value = Number.isFinite(sky.exposure) ? sky.exposure : ATMOSPHERE_DEFAULTS.sky.exposure;
    if (uniforms.uDitherStrength) uniforms.uDitherStrength.value = Number.isFinite(sky.ditherStrength) ? sky.ditherStrength : ATMOSPHERE_DEFAULTS.sky.ditherStrength;

    if (uniforms.uHazeEnabled) uniforms.uHazeEnabled.value = haze.enabled === false ? 0.0 : 1.0;
    if (uniforms.uHazeIntensity) uniforms.uHazeIntensity.value = Number.isFinite(haze.intensity) ? haze.intensity : ATMOSPHERE_DEFAULTS.haze.intensity;
    if (uniforms.uHazeThickness) uniforms.uHazeThickness.value = Number.isFinite(haze.thickness) ? haze.thickness : ATMOSPHERE_DEFAULTS.haze.thickness;
    if (uniforms.uHazeCurve) uniforms.uHazeCurve.value = Number.isFinite(haze.curve) ? haze.curve : ATMOSPHERE_DEFAULTS.haze.curve;
    if (uniforms.uHazeTintStrength) uniforms.uHazeTintStrength.value = Number.isFinite(haze.tintStrength) ? haze.tintStrength : ATMOSPHERE_DEFAULTS.haze.tintStrength;

    if (uniforms.uGlareEnabled) uniforms.uGlareEnabled.value = glare.enabled === false ? 0.0 : 1.0;
    if (uniforms.uGlareIntensity) uniforms.uGlareIntensity.value = Number.isFinite(glare.intensity) ? glare.intensity : ATMOSPHERE_DEFAULTS.glare.intensity;
    if (uniforms.uGlareSigma2) uniforms.uGlareSigma2.value = degToSigma2(glare.sigmaDeg ?? ATMOSPHERE_DEFAULTS.glare.sigmaDeg);
    if (uniforms.uGlarePower) uniforms.uGlarePower.value = Number.isFinite(glare.power) ? glare.power : ATMOSPHERE_DEFAULTS.glare.power;

    if (uniforms.uDiscEnabled) uniforms.uDiscEnabled.value = disc.enabled === false ? 0.0 : 1.0;
    if (uniforms.uDiscIntensity) uniforms.uDiscIntensity.value = Number.isFinite(disc.intensity) ? disc.intensity : ATMOSPHERE_DEFAULTS.disc.intensity;
    if (uniforms.uDiscSigma2) uniforms.uDiscSigma2.value = degToSigma2(disc.sigmaDeg ?? ATMOSPHERE_DEFAULTS.disc.sigmaDeg);
    if (uniforms.uDiscCoreIntensity) uniforms.uDiscCoreIntensity.value = Number.isFinite(disc.coreIntensity) ? disc.coreIntensity : ATMOSPHERE_DEFAULTS.disc.coreIntensity;
    if (uniforms.uDiscCoreSigma2) uniforms.uDiscCoreSigma2.value = degToSigma2(disc.coreSigmaDeg ?? ATMOSPHERE_DEFAULTS.disc.coreSigmaDeg);

    if (uniforms.uDebugMode) uniforms.uDebugMode.value = getDebugModeId(dbg.mode);
    if (uniforms.uShowSunRing) uniforms.uShowSunRing.value = dbg.showSunRing ? 1.0 : 0.0;
    if (uniforms.uSunRingRadius) uniforms.uSunRingRadius.value = Number.isFinite(dbg.sunRingRadiusDeg) ? (dbg.sunRingRadiusDeg * Math.PI) / 180 : (ATMOSPHERE_DEFAULTS.debug.sunRingRadiusDeg * Math.PI) / 180;
    if (uniforms.uSunRingThickness) uniforms.uSunRingThickness.value = Number.isFinite(dbg.sunRingThicknessDeg) ? (dbg.sunRingThicknessDeg * Math.PI) / 180 : (ATMOSPHERE_DEFAULTS.debug.sunRingThicknessDeg * Math.PI) / 180;

    if (sunDir && uniforms.uSunDir?.value?.isVector3) uniforms.uSunDir.value.copy(sunDir).normalize();
    mat.needsUpdate = true;
    return true;
}

export function createGradientSkyDome({
    radius = 1400,
    atmosphere = null,
    sunDir = new THREE.Vector3(0.6, 0.9, 0.25).normalize(),
    sunIntensity = 1.0
} = {}) {
    const geom = new THREE.SphereGeometry(radius, 32, 16);
    const atmo = atmosphere && typeof atmosphere === 'object' ? atmosphere : ATMOSPHERE_DEFAULTS;
    const sky = atmo.sky && typeof atmo.sky === 'object' ? atmo.sky : ATMOSPHERE_DEFAULTS.sky;
    const haze = atmo.haze && typeof atmo.haze === 'object' ? atmo.haze : ATMOSPHERE_DEFAULTS.haze;
    const glare = atmo.glare && typeof atmo.glare === 'object' ? atmo.glare : ATMOSPHERE_DEFAULTS.glare;
    const disc = atmo.disc && typeof atmo.disc === 'object' ? atmo.disc : ATMOSPHERE_DEFAULTS.disc;
    const dbg = atmo.debug && typeof atmo.debug === 'object' ? atmo.debug : ATMOSPHERE_DEFAULTS.debug;

    const cHorizon = srgbToLinearColor(sky.horizonColor ?? ATMOSPHERE_DEFAULTS.sky.horizonColor);
    const cZenith = srgbToLinearColor(sky.zenithColor ?? ATMOSPHERE_DEFAULTS.sky.zenithColor);
    const cGround = srgbToLinearColor(sky.groundColor ?? ATMOSPHERE_DEFAULTS.sky.groundColor);
    const cHazeTint = srgbToLinearColor(haze.tintColor ?? ATMOSPHERE_DEFAULTS.haze.tintColor);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uHorizon: { value: cHorizon },
            uZenith: { value: cZenith },
            uGround: { value: cGround },
            uSkyCurve: { value: Number.isFinite(sky.curve) ? sky.curve : ATMOSPHERE_DEFAULTS.sky.curve },
            uSkyExposure: { value: Number.isFinite(sky.exposure) ? sky.exposure : ATMOSPHERE_DEFAULTS.sky.exposure },
            uDitherStrength: { value: Number.isFinite(sky.ditherStrength) ? sky.ditherStrength : ATMOSPHERE_DEFAULTS.sky.ditherStrength },
            uHazeEnabled: { value: haze.enabled === false ? 0.0 : 1.0 },
            uHazeIntensity: { value: Number.isFinite(haze.intensity) ? haze.intensity : ATMOSPHERE_DEFAULTS.haze.intensity },
            uHazeThickness: { value: Number.isFinite(haze.thickness) ? haze.thickness : ATMOSPHERE_DEFAULTS.haze.thickness },
            uHazeCurve: { value: Number.isFinite(haze.curve) ? haze.curve : ATMOSPHERE_DEFAULTS.haze.curve },
            uHazeTint: { value: cHazeTint },
            uHazeTintStrength: { value: Number.isFinite(haze.tintStrength) ? haze.tintStrength : ATMOSPHERE_DEFAULTS.haze.tintStrength },
            uGlareEnabled: { value: glare.enabled === false ? 0.0 : 1.0 },
            uGlareIntensity: { value: Number.isFinite(glare.intensity) ? glare.intensity : ATMOSPHERE_DEFAULTS.glare.intensity },
            uGlareSigma2: { value: degToSigma2(glare.sigmaDeg ?? ATMOSPHERE_DEFAULTS.glare.sigmaDeg) },
            uGlarePower: { value: Number.isFinite(glare.power) ? glare.power : ATMOSPHERE_DEFAULTS.glare.power },
            uDiscEnabled: { value: disc.enabled === false ? 0.0 : 1.0 },
            uDiscIntensity: { value: Number.isFinite(disc.intensity) ? disc.intensity : ATMOSPHERE_DEFAULTS.disc.intensity },
            uDiscSigma2: { value: degToSigma2(disc.sigmaDeg ?? ATMOSPHERE_DEFAULTS.disc.sigmaDeg) },
            uDiscCoreIntensity: { value: Number.isFinite(disc.coreIntensity) ? disc.coreIntensity : ATMOSPHERE_DEFAULTS.disc.coreIntensity },
            uDiscCoreSigma2: { value: degToSigma2(disc.coreSigmaDeg ?? ATMOSPHERE_DEFAULTS.disc.coreSigmaDeg) },
            uSunDir: { value: sunDir.clone().normalize() },
            uSunIntensity: { value: Number.isFinite(sunIntensity) ? sunIntensity : 1.0 },
            uDebugMode: { value: getDebugModeId(dbg.mode) },
            uShowSunRing: { value: dbg.showSunRing ? 1.0 : 0.0 },
            uSunRingRadius: { value: (Number.isFinite(dbg.sunRingRadiusDeg) ? dbg.sunRingRadiusDeg : ATMOSPHERE_DEFAULTS.debug.sunRingRadiusDeg) * (Math.PI / 180) },
            uSunRingThickness: { value: (Number.isFinite(dbg.sunRingThicknessDeg) ? dbg.sunRingThicknessDeg : ATMOSPHERE_DEFAULTS.debug.sunRingThicknessDeg) * (Math.PI / 180) }
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uHorizon;
            uniform vec3 uZenith;
            uniform vec3 uGround;
            uniform float uSkyCurve;
            uniform float uSkyExposure;
            uniform float uDitherStrength;
            uniform float uHazeEnabled;
            uniform float uHazeIntensity;
            uniform float uHazeThickness;
            uniform float uHazeCurve;
            uniform vec3 uHazeTint;
            uniform float uHazeTintStrength;
            uniform float uGlareEnabled;
            uniform float uGlareIntensity;
            uniform float uGlareSigma2;
            uniform float uGlarePower;
            uniform float uDiscEnabled;
            uniform float uDiscIntensity;
            uniform float uDiscSigma2;
            uniform float uDiscCoreIntensity;
            uniform float uDiscCoreSigma2;
            uniform vec3 uSunDir;
            uniform float uSunIntensity;
            uniform float uDebugMode;
            uniform float uShowSunRing;
            uniform float uSunRingRadius;
            uniform float uSunRingThickness;
            varying vec3 vDir;

            float hash21(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }

            void main() {
                float y = vDir.y;
                float t = clamp(y, 0.0, 1.0);
                t = pow(t, max(0.001, uSkyCurve));
                vec3 base = mix(uHorizon, uZenith, t);
                float groundMix = smoothstep(0.0, 0.18, -y);
                base = mix(base, uGround, groundMix);

                vec3 dir = normalize(vDir);
                vec3 sunD = normalize(uSunDir);
                float sunDot = clamp(dot(dir, sunD), 0.0, 1.0);
                float theta2 = max(0.0, 2.0 * (1.0 - sunDot));

                float haze = 0.0;
                if (uHazeEnabled > 0.5) {
                    float hz = exp(-pow(t / max(1e-4, uHazeThickness), max(0.01, uHazeCurve)));
                    haze = hz * uHazeIntensity;
                }
                vec3 hazeCol = mix(vec3(1.0), uHazeTint, clamp(uHazeTintStrength, 0.0, 1.0));

                float glare = 0.0;
                if (uGlareEnabled > 0.5) {
                    float sigma2 = max(1e-8, uGlareSigma2);
                    float g = exp(-theta2 / (2.0 * sigma2));
                    g = pow(g, max(0.01, uGlarePower));
                    glare = g * uGlareIntensity * uSunIntensity;
                }

                float disc = 0.0;
                if (uDiscEnabled > 0.5) {
                    float sigma2 = max(1e-8, uDiscSigma2);
                    float soft = exp(-theta2 / (2.0 * sigma2)) * uDiscIntensity;
                    float coreSigma2 = max(1e-8, uDiscCoreSigma2);
                    float core = exp(-theta2 / (2.0 * coreSigma2)) * uDiscCoreIntensity;
                    disc = (soft + core) * uSunIntensity;
                }

                vec3 col = base;

                float mode = uDebugMode;
                if (mode > 0.5 && mode < 1.5) {
                    col = base;
                } else if (mode > 1.5 && mode < 2.5) {
                    col = vec3(glare);
                } else if (mode > 2.5) {
                    col = vec3(disc);
                } else {
                    col = mix(col, hazeCol, clamp(haze, 0.0, 1.0));
                    col *= (1.0 + glare);
                    col += vec3(1.0) * disc;
                }

                col *= uSkyExposure;

                float n = hash21(gl_FragCoord.xy);
                col += vec3((n - 0.5) * (uDitherStrength / 512.0));

                if (uShowSunRing > 0.5) {
                    float theta = sqrt(max(theta2, 0.0));
                    float r = max(1e-6, uSunRingRadius);
                    float w = max(1e-6, uSunRingThickness);
                    float ring = 1.0 - smoothstep(0.0, w, abs(theta - r));
                    col = mix(col, vec3(1.0, 0.0, 1.0), ring);
                }

                gl_FragColor = vec4(col, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: true
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'CitySkyDome';
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return mesh;
}
