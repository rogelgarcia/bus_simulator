// src/city/City.js
import * as THREE from 'three';
import { createCityWorld } from './CityWorld.js';
import { createCityConfig } from './CityConfig.js';
import { CityMap } from './CityMap.js';
import { CityRNG } from './CityRNG.js';
import { getCityMaterials } from '../assets3d/textures/CityMaterials.js';
import { generateRoads } from '../assets3d/generators/RoadGenerator.js';

function srgbToLinearColor(hex) {
    const c = new THREE.Color(hex);
    if (c.convertSRGBToLinear) c.convertSRGBToLinear();
    return c;
}

function createGradientSkyDome({
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

export class City {
    constructor(options = {}) {
        const {
            size = 800,
            tileMeters = 2,
            mapTileSize = 16,
            seed = 'demo-001',
            mapSpec = null
        } = options;

        this.config = {
            size,
            tileMeters,
            fogColor: '#dff3ff',
            fogNear: 80,
            fogFar: 900,
            cameraFar: 2500
        };

        this.group = new THREE.Group();
        this.group.name = 'City';

        // Lights
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a3b1f, 0.85);
        this.hemi.position.set(0, 100, 0);
        this.group.add(this.hemi);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sun.position.set(80, 140, 60);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 600;
        this.sun.shadow.camera.left = -220;
        this.sun.shadow.camera.right = 220;
        this.sun.shadow.camera.top = 220;
        this.sun.shadow.camera.bottom = -220;
        this.group.add(this.sun);

        // Sky
        this.sky = createGradientSkyDome({
            top: '#2f7fe8',
            horizon: '#eaf7ff',
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        // Generation config + deterministic RNG
        this.genConfig = createCityConfig({ size, tileMeters, mapTileSize, seed });
        this.rng = new CityRNG(this.genConfig.seed);

        // Map
        const spec = mapSpec ?? CityMap.demoSpec(this.genConfig);
        this.map = CityMap.fromSpec(spec, this.genConfig);

        // World (raised ground tiles using map)
        this.world = createCityWorld({
            size,
            tileMeters,
            map: this.map,
            groundY: this.genConfig.ground.surfaceY
        });
        this.group.add(this.world.group);

        // Roads + sidewalks + curbs
        this.materials = getCityMaterials();
        this.roads = generateRoads({ map: this.map, config: this.genConfig, materials: this.materials });
        this.group.add(this.roads.group);

        this._attached = false;
        this._restore = null;
    }

    attach(engine) {
        if (this._attached) return;

        this._restore = {
            bg: engine.scene.background,
            fog: engine.scene.fog,
            far: engine.camera.far
        };

        engine.scene.background = null;
        engine.scene.fog = new THREE.Fog(this.config.fogColor, this.config.fogNear, this.config.fogFar);

        engine.camera.far = Math.max(engine.camera.far, this.config.cameraFar);
        engine.camera.updateProjectionMatrix();

        engine.scene.add(this.group);
        this._attached = true;
    }

    detach(engine) {
        if (!this._attached) return;

        engine.scene.remove(this.group);

        if (this._restore) {
            engine.scene.background = this._restore.bg ?? null;
            engine.scene.fog = this._restore.fog ?? null;
            engine.camera.far = this._restore.far ?? engine.camera.far;
            engine.camera.updateProjectionMatrix();
        }

        this._restore = null;
        this._attached = false;
    }

    update(engine) {
        this.sky.position.copy(engine.camera.position);
    }
}

export function getSharedCity(engine, options = {}) {
    engine.context.city ??= new City(options);
    return engine.context.city;
}
