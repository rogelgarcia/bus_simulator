// src/app/city/City.js
// Builds and manages the city scene
import * as THREE from 'three';
import { createCityWorld } from './CityWorld.js';
import { createCityConfig } from './CityConfig.js';
import { CityMap } from './CityMap.js';
import { CityRNG } from './CityRNG.js';
import { getCityMaterials } from '../../graphics/assets3d/textures/CityMaterials.js';
import { generateRoads } from '../../graphics/assets3d/generators/RoadGenerator.js';
import { createGradientSkyDome } from '../../graphics/assets3d/generators/SkyGenerator.js';
import { createGeneratorConfig } from '../../graphics/assets3d/generators/GeneratorParams.js';
import { BuildingWallTextureCache, buildBuildingVisualParts } from '../../graphics/assets3d/generators/buildings/BuildingGenerator.js';
import { buildBuildingFabricationVisualParts } from '../../graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';

export class City {
    constructor(options = {}) {
        const {
            size = 400,
            tileMeters = 2,
            mapTileSize = 24,
            seed = 'demo-001',
            mapSpec = null,
            generatorConfig = null
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

        const originAxes = new THREE.AxesHelper(8);
        originAxes.name = 'OriginAxes';
        originAxes.position.set(0, 0, 0);
        this.group.add(originAxes);

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

        this.sky = createGradientSkyDome({
            top: '#2f7fe8',
            horizon: '#eaf7ff',
            sunDir: this.sun.position.clone().normalize(),
            sunIntensity: 0.28
        });
        this.group.add(this.sky);

        this.genConfig = createCityConfig({ size, tileMeters, mapTileSize, seed });
        this.generatorConfig = createGeneratorConfig(generatorConfig ?? {});

        this.rng = new CityRNG(this.genConfig.seed);

        const spec = mapSpec ?? CityMap.demoSpec(this.genConfig);
        this.map = CityMap.fromSpec(spec, this.genConfig);

        this.world = createCityWorld({
            size,
            tileMeters,
            map: this.map,
            config: this.generatorConfig,
            rng: this.rng
        });
        this.group.add(this.world.group);

        this.materials = getCityMaterials();
        this.roads = generateRoads({ map: this.map, config: this.generatorConfig, materials: this.materials });
        this.group.add(this.roads.group);

        this.buildings = null;
        const buildingsList = Array.isArray(this.map.buildings) ? this.map.buildings : [];
        if (buildingsList.length) {
            const buildingsGroup = new THREE.Group();
            buildingsGroup.name = 'Buildings';

            const textures = new BuildingWallTextureCache();
            for (const entry of buildingsList) {
                const wallInset = Number.isFinite(entry?.wallInset) ? entry.wallInset : 0.0;
                const hasLayers = Array.isArray(entry?.layers) && entry.layers.length;
                const windowsSpec = entry?.windows ?? null;
                const windowsEnabled = !!windowsSpec && typeof windowsSpec === 'object';
                const parts = hasLayers
                    ? buildBuildingFabricationVisualParts({
                        map: this.map,
                        tiles: entry.tiles,
                        generatorConfig: this.generatorConfig,
                        tileSize: this.map.tileSize,
                        occupyRatio: 1.0,
                        layers: entry.layers,
                        textureCache: textures,
                        renderer: null,
                        overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
                        walls: { inset: wallInset }
                    })
                    : buildBuildingVisualParts({
                        map: this.map,
                        tiles: entry.tiles,
                        generatorConfig: this.generatorConfig,
                        tileSize: this.map.tileSize,
                        occupyRatio: 1.0,
                        floors: entry.floors,
                        floorHeight: entry.floorHeight,
                        style: entry.style,
                        textureCache: textures,
                        renderer: null,
                        overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
                        walls: { inset: wallInset },
                        windows: windowsEnabled ? {
                            enabled: true,
                            width: windowsSpec.width,
                            gap: windowsSpec.gap,
                            height: windowsSpec.height,
                            y: windowsSpec.y,
                            cornerEps: 0.12,
                            offset: 0.05
                        } : null
                    });
                if (!parts) continue;

                const buildingGroup = new THREE.Group();
                buildingGroup.name = entry.id ?? 'building';
                for (const mesh of parts.solidMeshes) buildingGroup.add(mesh);
                if (parts.windows) buildingGroup.add(parts.windows);
                if (parts.beltCourse) buildingGroup.add(parts.beltCourse);
                if (parts.topBelt) buildingGroup.add(parts.topBelt);
                buildingsGroup.add(buildingGroup);
            }

            this.buildings = { group: buildingsGroup, textures };
            this.group.add(buildingsGroup);
        }

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
