// src/assets3d/generators/SkyGenerator.js
import * as THREE from 'three';

function srgbToLinearColor(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
}

export function createGradientSkyDome({
    radius = 1400,
    top = '#2f7fe8',
    horizon = '#eaf7ff',
    sunDir = new THREE.Vector3(0.6, 0.9, 0.25).normalize(),
    sunIntensity = 0.28
} = {}) {
    const geom = new THREE.SphereGeometry(radius, 32, 16);

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTop: { value: srgbToLinearColor(top) },
            uHorizon: { value: srgbToLinearColor(horizon) },
            uSunDir: { value: sunDir.clone().normalize() },
            uSunIntensity: { value: sunIntensity }
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uTop;
            uniform vec3 uHorizon;
            uniform vec3 uSunDir;
            uniform float uSunIntensity;
            varying vec3 vDir;

            void main() {
                float y = clamp(vDir.y, -0.25, 1.0);

                float t = smoothstep(-0.05, 0.85, y);
                t = pow(t, 1.35);

                vec3 col = mix(uHorizon, uTop, t);

                float haze = 1.0 - smoothstep(-0.02, 0.20, y);
                col = mix(col, uHorizon, haze * 0.25);

                float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
                float sun = pow(s, 900.0) * uSunIntensity;
                float glow = pow(s, 12.0) * uSunIntensity * 0.35;
                col += vec3(1.0) * (sun + glow);

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
