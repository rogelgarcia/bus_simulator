// Owns the Grass Debug v2 renderer, camera and baseline diagnostics.
// @ts-check
import * as THREE from 'three';
import { createToolCameraController } from '../../engine3d/camera/ToolCameraPrefab.js';
import { getOrCreateGpuFrameTimer } from '../../engine3d/perf/GpuFrameTimer.js';
import { createGrassDebugV2Scene, GRASS_V2_TERRAIN } from './GrassDebugV2Scene.js';
import { GrassDebugV2Lighting } from './GrassDebugV2Lighting.js';
import { GrassDebugV2CameraInput } from './GrassDebugV2CameraInput.js';

export class GrassDebugV2View {
    /** @param {{canvas: HTMLCanvasElement, perfBar: object}} options */
    constructor({ canvas, perfBar }) {
        this.canvas = canvas;
        this.perfBar = perfBar;
        this.ready = false;
        this.frameIndex = 0;
        this._lastTime = 0;
        this._onResize = () => this.resize();
        this._onFrame = time => this.render(time);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1600);
        this.lighting = new GrassDebugV2Lighting({ renderer: this.renderer, scene: this.scene, camera: this.camera });
        this.gpuTimer = getOrCreateGpuFrameTimer(this.renderer);
        this.perfBar.setRenderer(this.renderer);
        window.addEventListener('resize', this._onResize);
        this.resize();
    }

    async start() {
        const [content] = await Promise.all([
            createGrassDebugV2Scene(this.scene, this.renderer),
            this.lighting.loadEnvironment()
        ]);
        this.content = content;
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
        await this.renderer.compileAsync(this.scene, this.camera);
        this.keyboard = new GrassDebugV2CameraInput(this.controls);
        this.renderer.setAnimationLoop(this._onFrame);
    }

    /** @param {'bus'|'overview'} id */
    setCamera(id) {
        if (id !== 'bus' && id !== 'overview') throw new Error(`Unknown Grass Debug camera: ${id}`);
        const position = new THREE.Vector3(19, 22, -22);
        const rotation = new THREE.Euler(THREE.MathUtils.degToRad(-38), THREE.MathUtils.degToRad(138), 0, 'YXZ');
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation);
        const target = position.clone().addScaledVector(forward, -position.y / forward.y);
        this.controls.setLookAt(id === 'bus' ? this.busPose : { position, target });
    }

    resize() {
        const width = Math.max(1, this.canvas.clientWidth);
        const height = Math.max(1, this.canvas.clientHeight);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.lighting.resize(width, height);
    }

    render(time) {
        const dt = this._lastTime ? (time - this._lastTime) / 1000 : 0;
        this._lastTime = time;
        this.controls.update(Math.min(dt, 0.05));
        this.keyboard.update(Math.min(dt, 0.05));
        const near = Math.min(0.1, this.camera.position.y * 0.5);
        if (this.camera.near !== near) {
            this.camera.near = near;
            this.camera.updateProjectionMatrix();
        }
        this.gpuTimer.poll();
        this.gpuTimer.beginFrame();
        this.lighting.render(dt);
        this.gpuTimer.endFrame();
        this.frameIndex++;
        this.perfBar.onFrame({ dt, nowMs: time, renderer: this.renderer, frameIndex: this.frameIndex });
    }

    getSnapshot() {
        const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        return {
            version: 2, ready: this.ready, frame: this.frameIndex,
            terrain: { ...GRASS_V2_TERRAIN },
            groundTextureReady: this.content.ground.material.map.image.width > 0,
            roadTriangles: this.content.road.asphalt.geometry.index.count / 3,
            roadSurfaceY: new THREE.Box3().setFromObject(this.content.road.asphalt).min.y,
            groundSurfaceY: this.content.ground.position.y,
            treeCount: this.content.trees.children.length,
            busReady: this.content.bus.userData.ready,
            camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray(), fov: this.camera.fov, near: this.camera.near },
            viewport: { width: buffer.x, height: buffer.y, pixelRatio: this.renderer.getPixelRatio() },
            render: { ...this.renderer.info.render },
            gpu: this.gpuTimer.getDiagnostics(),
            lighting: this.lighting.getSnapshot(),
            grass: { implemented: false, incrementalGpuMs: null, targetGpuMs: 1 }
        };
    }

    destroy() {
        this.renderer.setAnimationLoop(null);
        window.removeEventListener('resize', this._onResize);
        this.keyboard?.dispose();
        this.controls?.dispose();
        this.lighting.dispose();
        this.perfBar.setDebugPoseProvider(null);
        const geometries = new Set();
        const materials = new Set(Object.values(this.content?.road.materials ?? {}));
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
