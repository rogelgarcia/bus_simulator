// src/graphics/assets3d/generators/SkyGenerator.js
// Gradient percent is based on sky-dome direction y: 0=horizon, 1=zenith.
import * as THREE from 'three';

function srgbToLinearColor(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
}

export const NATURAL_SKY_GRADIENT = Object.freeze({
    stops: Object.freeze([
        Object.freeze({ t: 0.00, color: '#7BCFFF' }),
        Object.freeze({ t: 0.10, color: '#31AFFF' }),
        Object.freeze({ t: 0.30, color: '#1082E4' }),
        Object.freeze({ t: 0.50, color: '#0B5AB0' }),
        Object.freeze({ t: 1.00, color: '#0B5AB0' })
    ]),
    fogColor: '#7BCFFF'
});

function readUrlFlag(key) {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(key)) return false;
    const raw = params.get(key);
    if (raw === null) return true;
    const v = String(raw).trim().toLowerCase();
    if (!v) return true;
    return !(['0', 'false', 'no', 'off'].includes(v));
}

function normalizeStops(stops) {
    const raw = Array.isArray(stops) ? stops : NATURAL_SKY_GRADIENT.stops;
    const out = [];
    for (const s of raw) {
        const t = Number(s?.t);
        const color = typeof s?.color === 'string' ? s.color : null;
        if (!Number.isFinite(t) || !color) continue;
        out.push({ t: Math.max(0, Math.min(1, t)), color });
    }
    out.sort((a, b) => a.t - b.t);
    if (!out.length) return Array.from(NATURAL_SKY_GRADIENT.stops);
    const first = out[0];
    const last = out[out.length - 1];
    if (first.t !== 0) out.unshift({ t: 0, color: first.color });
    if (last.t !== 1) out.push({ t: 1, color: last.color });
    while (out.length < 5) out.splice(out.length - 1, 0, out[out.length - 2]);
    return out.slice(0, 5);
}

export function createGradientSkyDome({
    radius = 1400,
    stops = null,
    debugStops = null,
    sunDir = new THREE.Vector3(0.6, 0.9, 0.25).normalize(),
    sunIntensity = 0.28
} = {}) {
    const geom = new THREE.SphereGeometry(radius, 32, 16);

    const resolvedStops = normalizeStops(stops);
    const t1 = resolvedStops[1]?.t ?? 0.1;
    const t2 = resolvedStops[2]?.t ?? 0.3;
    const t3 = resolvedStops[3]?.t ?? 0.5;
    const c0 = srgbToLinearColor(resolvedStops[0]?.color ?? '#7BCFFF');
    const c1 = srgbToLinearColor(resolvedStops[1]?.color ?? '#31AFFF');
    const c2 = srgbToLinearColor(resolvedStops[2]?.color ?? '#1082E4');
    const c3 = srgbToLinearColor(resolvedStops[3]?.color ?? '#0B5AB0');
    const showStops = debugStops !== null ? !!debugStops : readUrlFlag('skyDebug');

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uC0: { value: c0 },
            uC1: { value: c1 },
            uC2: { value: c2 },
            uC3: { value: c3 },
            uT1: { value: t1 },
            uT2: { value: t2 },
            uT3: { value: t3 },
            uSunDir: { value: sunDir.clone().normalize() },
            uSunIntensity: { value: sunIntensity },
            uDebugStops: { value: showStops ? 1 : 0 }
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uC0;
            uniform vec3 uC1;
            uniform vec3 uC2;
            uniform vec3 uC3;
            uniform float uT1;
            uniform float uT2;
            uniform float uT3;
            uniform vec3 uSunDir;
            uniform float uSunIntensity;
            uniform float uDebugStops;
            varying vec3 vDir;

            void main() {
                float t = clamp(vDir.y, 0.0, 1.0);
                vec3 col;
                if (t < uT1) {
                    float a = t / max(1e-6, uT1);
                    col = mix(uC0, uC1, a);
                } else if (t < uT2) {
                    float a = (t - uT1) / max(1e-6, (uT2 - uT1));
                    col = mix(uC1, uC2, a);
                } else if (t < uT3) {
                    float a = (t - uT2) / max(1e-6, (uT3 - uT2));
                    col = mix(uC2, uC3, a);
                } else {
                    col = uC3;
                }

                float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
                float sun = pow(s, 900.0) * uSunIntensity;
                float glow = pow(s, 12.0) * uSunIntensity * 0.35;
                col += vec3(1.0) * (sun + glow);

                if (uDebugStops > 0.5) {
                    float w = 0.004;
                    float l1 = 1.0 - smoothstep(0.0, w, abs(t - uT1));
                    float l2 = 1.0 - smoothstep(0.0, w, abs(t - uT2));
                    float l3 = 1.0 - smoothstep(0.0, w, abs(t - uT3));
                    float lines = max(l1, max(l2, l3));
                    col = mix(col, vec3(1.0), lines * 0.75);
                }

                gl_FragColor = vec4(col, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: false
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'CitySkyDome';
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return mesh;
}
