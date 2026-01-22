// src/graphics/gui/road_debugger/RoadDebuggerScene.js
// Builds and disposes the Road Debugger environment (grass, sky, lights, grid).
import * as THREE from 'three';
import { createGradientSkyDome } from '../../assets3d/generators/SkyGenerator.js';
import { createCityWorld } from '../../assets3d/generators/TerrainGenerator.js';
import { getResolvedLightingSettings } from '../../lighting/LightingSettings.js';

function disposeMaterial(mat) {
    if (!mat) return;
    const maps = ['map', 'alphaMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap'];
    for (const key of maps) {
        const tex = mat[key];
        if (tex?.dispose) tex.dispose();
    }
    mat.dispose?.();
}

function disposeObject3D(obj) {
    if (!obj?.traverse) return;
    obj.traverse((child) => {
        child?.geometry?.dispose?.();
        const mat = child?.material ?? null;
        if (Array.isArray(mat)) {
            for (const entry of mat) disposeMaterial(entry);
        } else {
            disposeMaterial(mat);
        }
    });
}

function makeEmptyGridMap(view) {
    const width = view?._mapWidth ?? 1;
    const height = view?._mapHeight ?? 1;
    const tileSize = view?._tileSize ?? 24;
    const origin = view?._origin ?? { x: 0, z: 0 };
    const kind = new Uint8Array(width * height);
    return {
        width,
        height,
        tileSize,
        origin,
        kind,
        index: (x, y) => (x | 0) + (y | 0) * (width | 0),
        tileToWorldCenter: (x, y) => ({ x: origin.x + (x | 0) * tileSize, z: origin.z + (y | 0) * tileSize })
    };
}

export function setupScene(view) {
    if (view?.scene) {
        view.scene.background = null;
        view.scene.fog = null;
    }

    const group = new THREE.Group();
    group.name = 'RoadDebugger';
    view.root = group;
    view.scene.add(group);

    const lighting = view?.engine?.lightingSettings ?? getResolvedLightingSettings();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x253018, lighting.hemiIntensity);
    hemi.position.set(0, 120, 0);
    group.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, lighting.sunIntensity);
    sun.position.set(80, 140, 60);
    group.add(sun);

    const size = Number.isFinite(view?._worldSize) ? view._worldSize : 800;
    const skyRadius = Math.max(600, size * 2.2);
    const sky = createGradientSkyDome({
        radius: skyRadius,
        top: '#2f7fe8',
        horizon: '#eaf7ff',
        sunDir: sun.position.clone().normalize(),
        sunIntensity: 0.28
    });
    group.add(sky);

    const groundY = Number.isFinite(view?._groundY) ? view._groundY : 0;
    const map = makeEmptyGridMap(view);
    const world = createCityWorld({
        size: view?._worldSize ?? 800,
        tileMeters: view?._tileMeters ?? 2,
        map,
        config: {
            road: { surfaceY: groundY },
            ground: { surfaceY: groundY },
            render: { treesEnabled: false }
        },
        groundY
    });
    if (world?.group) group.add(world.group);

    view.world = world;
    view._gridLines = world?.gridLines ?? null;

    const applyDepthBias = (material) => {
        if (!material) return;
        if (Array.isArray(material)) {
            for (const entry of material) applyDepthBias(entry);
            return;
        }
        material.polygonOffset = true;
        material.polygonOffsetFactor = 2;
        material.polygonOffsetUnits = 8;
    };

    applyDepthBias(world?.floor?.material ?? null);
    applyDepthBias(world?.groundTiles?.material ?? null);

    view._hemi = hemi;
    view._sun = sun;
    view._sky = sky;
}

export function disposeScene(view) {
    if (!view?.root) return;
    view.scene?.remove?.(view.root);
    disposeObject3D(view.root);
    view.root = null;
    view.world = null;
    view._gridLines = null;
    view._hemi = null;
    view._sun = null;
    view._sky = null;
}
