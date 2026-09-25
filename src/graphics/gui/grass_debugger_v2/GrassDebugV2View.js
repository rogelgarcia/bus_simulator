// Owns the Grass Debug v2 renderer, camera and baseline diagnostics.
// @ts-check
import * as THREE from 'three';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { createGrassDebugV2Scene, GRASS_V2_TERRAIN } from './GrassDebugV2Scene.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { GrassDebugV2CameraInput } from './GrassDebugV2CameraInput.js';
import { GrassDebugV2Benchmark } from './GrassDebugV2Benchmark.js';
import { GrassDebugV2Grass } from './GrassDebugV2Grass.js';
import { createGrassDebugV2OverviewPose } from './GrassDebugV2CameraPresets.js';

export class GrassDebugV2View {
    /** @param {{canvas: HTMLCanvasElement, perfBar: object, onBenchmarkChange?: Function}} options */
    constructor({ canvas, perfBar, onBenchmarkChange = () => {} }) {
        this.canvas = canvas;
        this.perfBar = perfBar;
        this._onBenchmarkChange = onBenchmarkChange;
        this.ready = false;
        this.frameIndex = 0;
        this._lastTime = 0;
        this._onResize = () => this.resize();
        this._onFrame = time => this.render(time);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1600);
        this.lighting = new GrassDebugV2Lighting({ renderer: this.renderer, scene: this.scene, camera: this.camera });
        this.gpuTimer = getOrCreateGpuFrameTimer(this.renderer);
        this.perfBar.setRenderer(this.renderer);
        window.addEventListener('resize', this._onResize);
        this._resizeObserver = new ResizeObserver(this._onResize);
        this._resizeObserver.observe(this.canvas);
        this.resize();
    }

    async start() {
        const [content] = await Promise.all([
            createGrassDebugV2Scene(this.scene, this.renderer),
            this.lighting.loadEnvironment()
        ]);
        this.content = content;
        this.grass = new GrassDebugV2Grass({ renderer: this.renderer, scene: this.scene, road: content.road, bus: content.bus });
        this.lighting.applyEnvironment();
        const size = new THREE.Box3().setFromObject(content.bus).getSize(new THREE.Vector3());
        const distance = Math.max(8.5, Math.max(size.x, size.y, size.z) * 1.35);
        const height = Math.max(3.2, Math.max(size.x, size.y, size.z) * 0.55);
        this.busPose = {
            position: content.bus.position.clone().add(new THREE.Vector3(0, height, -distance)),
            target: content.bus.position.clone().add(new THREE.Vector3(0, Math.max(1.1, size.y * 0.32), 0))
        };
        this.controls = createToolCameraController(this.camera, this.canvas, {
            minDistance: 0.01, maxDistance: 1100, minHeight: 0.01,
            minPolarAngle: 0.001, maxPolarAngle: Math.PI - 0.001,
            orbitMouseButtons: [0, 2], panMouseButtons: [1],
            getFocusTarget: () => ({ center: this.busPose.target, radius: 12 }),
            initialPose: this.busPose
        });
        this.perfBar.setDebugPoseProvider(() => ({ camera: this.camera, bus: content.bus }));
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.grass.meshes.LOD3.visible = true;
        this.grass.mixed.group.visible = true;
        for (const id of Object.keys(content.land.materials)) {
            content.land.setSurface(id);
            this.lighting.applyEnvironment();
            await this.renderer.compileAsync(this.scene, this.camera);
        }
        content.land.setSurface('gravelly_sand');
        this.grass.setMode('LOD0');
        this.keyboard = new GrassDebugV2CameraInput(this.controls);
        this.benchmark = new GrassDebugV2Benchmark({
            camera: this.camera, controls: this.controls, keyboard: this.keyboard,
            gpuTimer: this.gpuTimer, busPose: this.busPose,
            getViewport: () => ({ width: this.canvas.width, height: this.canvas.height, pixelRatio: this.renderer.getPixelRatio() }),
            getGrass: () => this.grass.getSnapshot(),
            getLand: () => this.content.land.getSnapshot(),
            onChange: this._onBenchmarkChange
        });
        this.renderer.setAnimationLoop(this._onFrame);
    }

    /** @param {'bus'|'overview'|'grass'} id */
    setCamera(id) {
        if (!['bus', 'overview', 'grass'].includes(id)) throw new Error(`Unknown Grass Debug camera: ${id}`);
        if (this.benchmark?.active) return;
        this.controls.setLookAt(id === 'grass' ? this.grass.mixed.getCameraPose(this.camera) : id === 'bus' ? this.busPose : createGrassDebugV2OverviewPose());
    }

    /** @param {'OFF'|'LOD0'|'LOD3'|'MIXED'} mode */
    setGrassMode(mode) {
        if (!this.ready || this.benchmark.active) return false;
        this.grass.setMode(mode);
        return true;
    }

    /** @param {boolean} visible */
    setMixedCardBounds(visible) {
        if (!this.ready || this.benchmark.active || this.grass.mode !== 'MIXED') return false;
        this.grass.mixed.cardBounds.visible = !!visible;
        return true;
    }

    /** @param {'gravelly_sand'|'forest_ground_06'|'brown_mud'} id */
    setLandSurface(id) {
        if (!this.ready || this.benchmark.active) return false;
        this.content.land.setSurface(id);
        return true;
    }

    resize() {
        this.benchmark?.cancel('Viewport resized');
        const width = Math.max(1, this.canvas.clientWidth);
        const height = Math.max(1, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.lighting.resize(width, height);
    }

    render(time) {
        const cpuStart = performance.now();
        const dt = this._lastTime ? (time - this._lastTime) / 1000 : 0;
        this._lastTime = time;
        this.gpuTimer.poll();
        this.benchmark.beforeFrame(time);
        if (!this.benchmark.active) {
            this.controls.update(Math.min(dt, 0.05));
            this.keyboard.update(Math.min(dt, 0.05));
        }
        const near = Math.min(0.1, this.camera.position.y * 0.5);
        if (this.camera.near !== near) {
            this.camera.near = near;
            this.camera.updateProjectionMatrix();
        }
        this.gpuTimer.beginFrame();
        this.lighting.render(dt);
        this.gpuTimer.endFrame();
        this.frameIndex++;
        this.perfBar.onFrame({ dt, nowMs: time, renderer: this.renderer, frameIndex: this.frameIndex });
        this.benchmark.afterFrame({ nowMs: time, frameMs: dt * 1000, cpuMs: performance.now() - cpuStart });
    }

    getSnapshot() {
        const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        return {
            version: 2, ready: this.ready, frame: this.frameIndex,
            terrain: { ...GRASS_V2_TERRAIN, materialId: this.content.land.getSnapshot().materialId },
            land: this.content.land.getSnapshot(),
            groundTextureReady: this.content.ground.material.map.image.width > 0,
            roadTriangles: this.content.road.asphalt.geometry.index.count / 3,
            roadSurfaceY: new THREE.Box3().setFromObject(this.content.road.asphalt).min.y,
            groundSurfaceY: this.content.ground.position.y,
            treeCount: this.content.trees.children.length,
            busReady: this.content.bus.userData.ready,
            camera: {
                position: this.camera.position.toArray(), direction: direction.toArray(),
                target: this.benchmark.active ? this.camera.position.clone().addScaledVector(direction, 10).toArray() : this.controls.target.toArray(),
                fov: this.camera.fov, near: this.camera.near
            },
            viewport: { width: buffer.x, height: buffer.y, pixelRatio: this.renderer.getPixelRatio() },
            render: { ...this.renderer.info.render },
            gpu: this.gpuTimer.getDiagnostics(),
            lighting: this.lighting.getSnapshot(),
            benchmark: this.benchmark.getSnapshot(),
            grass: this.grass.getSnapshot()
        };
    }

    destroy() {
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this._onResize);
        this._resizeObserver.disconnect();
        this.keyboard?.dispose();
        this.benchmark?.dispose();
        this.controls?.dispose();
        this.grass?.dispose();
        this.lighting.dispose();
        this.perfBar.setDebugPoseProvider(null);
        const geometries = new Set();
        const materials = new Set([
            ...Object.values(this.content?.road?.materials ?? {}),
            ...Object.values(this.content?.land?.materials ?? {})
        ]);
        const textures = new Set();
        if (this.scene.environment) textures.add(this.scene.environment);
        if (this.scene.background?.isTexture) textures.add(this.scene.background);
        this.scene.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
            object.shadow?.dispose();
        });
        for (const material of materials) {
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            material.dispose();
        }
        for (const geometry of geometries) geometry.dispose();
        for (const texture of textures) texture.dispose();
        this.scene.clear();
        this.renderer.dispose();
    }
}
