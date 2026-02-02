// src/graphics/gui/building_fabrication2/BuildingFabrication2ThumbnailRenderer.js
// Renders building configs to offscreen buffers for thumbnail previews.
import * as THREE from 'three';

import { CityMap } from '../../../app/city/CityMap.js';
import { createGeneratorConfig } from '../../assets3d/generators/GeneratorParams.js';
import { buildBuildingFabricationVisualParts } from '../../assets3d/generators/building_fabrication/BuildingFabricationGenerator.js';
import { BuildingWallTextureCache } from '../../assets3d/generators/buildings/BuildingGenerator.js';
import { computeFrameDistanceForSphere } from '../../engine3d/camera/ToolCameraController.js';

const DEFAULT_BG = 0x0b0e14;

function clampInt(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

function normalizeMaterialSpec(value) {
    const kind = value?.kind;
    const id = typeof value?.id === 'string' ? value.id : '';
    if ((kind === 'texture' || kind === 'color') && id) return { kind, id };
    return null;
}

function disposeTextureProps(mat, disposedTextures) {
    if (!mat) return;
    const seen = disposedTextures instanceof Set ? disposedTextures : null;
    for (const k of Object.keys(mat)) {
        const v = mat[k];
        if (!v || !v.isTexture || v.userData?.buildingShared) continue;
        if (seen) {
            if (seen.has(v)) continue;
            seen.add(v);
        }
        v.dispose?.();
    }
}

function disposeObject3D(obj) {
    if (!obj) return;
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposedTextures = new Set();

    obj.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isLineSegments && !o.isLine2 && !o.isLineSegments2) return;

        const geo = o.geometry ?? null;
        if (geo && !disposedGeometries.has(geo)) {
            disposedGeometries.add(geo);
            geo.dispose?.();
        }

        const mat = o.material;
        if (!mat) return;
        if (Array.isArray(mat)) {
            for (const m of mat) {
                if (!m || disposedMaterials.has(m)) continue;
                disposedMaterials.add(m);
                disposeTextureProps(m, disposedTextures);
                m.dispose?.();
            }
        } else if (!disposedMaterials.has(mat)) {
            disposedMaterials.add(mat);
            disposeTextureProps(mat, disposedTextures);
            mat.dispose?.();
        }
    });
}

function makeCenteredMap({ width, height, tileSize }) {
    const origin = {
        x: -((width - 1) * 0.5) * tileSize,
        z: -((height - 1) * 0.5) * tileSize
    };
    const map = new CityMap({ width, height, tileSize, origin });
    map.finalize();
    return map;
}

function makeDataUrlFromRgbaPixels({ pixels, width, height }) {
    if (!pixels || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (pixels.length < w * h * 4) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(w, h);
    const dst = imageData.data;
    for (let y = 0; y < h; y++) {
        const srcY = h - 1 - y;
        const srcRow = srcY * w * 4;
        const dstRow = y * w * 4;
        dst.set(pixels.subarray(srcRow, srcRow + w * 4), dstRow);
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

export class BuildingFabrication2ThumbnailRenderer {
    constructor(engine, {
        size = 256,
        tileSize = 24,
        occupyRatio = 1.0
    } = {}) {
        this.engine = engine;
        this.renderer = engine?.renderer ?? null;
        this.size = clampInt(size, 64, 1024);
        this.tileSize = Math.max(4, Number(tileSize) || 24);
        this.occupyRatio = Math.max(0.5, Math.min(1.0, Number(occupyRatio) || 1.0));

        this.generatorConfig = createGeneratorConfig({
            render: { treesEnabled: false }
        });

        this._wallTextures = new BuildingWallTextureCache({ renderer: this.renderer });
        this._rt = new THREE.WebGLRenderTarget(this.size, this.size, {
            depthBuffer: true,
            stencilBuffer: false
        });
        this._rt.texture.name = 'bf2_thumbnail_rt';
    }

    dispose() {
        this._rt?.dispose?.();
        this._rt = null;
        this._wallTextures?.dispose?.();
        this._wallTextures = null;
    }

    async renderConfigToDataUrl(config) {
        const cfg = config && typeof config === 'object' ? config : null;
        const renderer = this.renderer;
        const rt = this._rt;
        if (!cfg || !renderer || !rt) return null;

        const rawLayers = Array.isArray(cfg.layers) ? cfg.layers : null;
        if (!Array.isArray(rawLayers) || !rawLayers.length) return null;
        const baseWallMaterial = normalizeMaterialSpec(cfg?.baseWallMaterial ?? null);
        const layers = baseWallMaterial
            ? rawLayers.map((layer) => {
                if (layer?.type !== 'floor') return layer;
                const has = !!normalizeMaterialSpec(layer?.material ?? null);
                return has ? layer : { ...layer, material: baseWallMaterial };
            })
            : rawLayers;

        const size = this.size;
        const map = makeCenteredMap({ width: 2, height: 1, tileSize: this.tileSize });
        const tiles = [
            [0, 0],
            [1, 0]
        ];

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(DEFAULT_BG);

        const hemi = new THREE.HemisphereLight(0xe9f2ff, 0x1c1c1e, 0.85);
        hemi.name = 'thumb_hemi';
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 1.35);
        sun.name = 'thumb_sun';
        sun.position.set(42, 55, 36);
        scene.add(sun);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.tileSize * 3, this.tileSize * 3),
            new THREE.MeshStandardMaterial({
                color: 0x0f1720,
                roughness: 1.0,
                metalness: 0.0
            })
        );
        floor.name = 'thumb_floor';
        floor.rotation.x = -Math.PI * 0.5;
        floor.position.y = -0.02;
        scene.add(floor);

        const group = new THREE.Group();
        group.name = 'thumb_building';

        const wallInset = Number.isFinite(cfg.wallInset) ? cfg.wallInset : 0.0;
        const materialVariationSeed = Number.isFinite(cfg.materialVariationSeed) ? cfg.materialVariationSeed : null;
        const windowVisuals = cfg?.windowVisuals && typeof cfg.windowVisuals === 'object' ? cfg.windowVisuals : null;
        const windowVisualsIsOverride = !!windowVisuals;

        const parts = buildBuildingFabricationVisualParts({
            map,
            tiles,
            generatorConfig: this.generatorConfig,
            tileSize: this.tileSize,
            occupyRatio: this.occupyRatio,
            layers,
            materialVariationSeed,
            textureCache: this._wallTextures,
            renderer,
            windowVisuals,
            windowVisualsIsOverride,
            facades: cfg?.facades ?? null,
            windowDefinitions: cfg?.windowDefinitions ?? null,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: wallInset }
        });

        if (!parts) {
            map.dispose?.();
            disposeObject3D(scene);
            return null;
        }

        for (const mesh of parts.solidMeshes ?? []) group.add(mesh);
        if (parts.beltCourse) group.add(parts.beltCourse);
        if (parts.topBelt) group.add(parts.topBelt);
        if (parts.windows) group.add(parts.windows);
        scene.add(group);

        const box = new THREE.Box3().setFromObject(group);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
        const dist = computeFrameDistanceForSphere({
            radius: sphere.radius || 1,
            fovDeg: camera.fov,
            aspect: 1,
            padding: 1.25
        });
        const dir = new THREE.Vector3(1, 0.72, 1).normalize();
        camera.position.copy(sphere.center).addScaledVector(dir, dist);
        camera.lookAt(sphere.center);
        camera.updateProjectionMatrix();

        const prevRenderTarget = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        renderer.getClearColor(prevClearColor);
        const prevClearAlpha = renderer.getClearAlpha();
        const prevAutoClear = renderer.autoClear;

        renderer.autoClear = true;
        renderer.setClearColor(DEFAULT_BG, 1);

        let url = null;
        try {
            renderer.setRenderTarget(rt);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);

            const pixels = new Uint8Array(size * size * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
            url = makeDataUrlFromRgbaPixels({ pixels, width: size, height: size });
        } finally {
            renderer.setRenderTarget(prevRenderTarget);
            renderer.setClearColor(prevClearColor, prevClearAlpha);
            renderer.autoClear = prevAutoClear;

            map.dispose?.();
            disposeObject3D(scene);
        }

        return url;
    }
}
