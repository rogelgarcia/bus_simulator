// Capture authored static casters once and moving vehicles separately; never change the game's shadow ownership.
// @ts-check
import * as THREE from 'three';

/** @param {{renderer:THREE.WebGLRenderer,groundY:number,resolution:number}} options */
export class GrassSceneShadows {
    constructor({ renderer, groundY, resolution }) {
        this.renderer = renderer; this.groundY = groundY; this.resolution = resolution;
        this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera();
        this.light = new THREE.DirectionalLight(0xffffff, 1); this.light.castShadow = true;
        this.light.shadow.mapSize.set(resolution, resolution); this.light.shadow.bias = -.00002; this.light.shadow.normalBias = .01;
        this.light.shadow.autoUpdate = false; this.scene.add(this.light, this.light.target);
        this.geometry = new THREE.PlaneGeometry(1, 1); this.geometry.rotateX(-Math.PI / 2);
        this.receiver = new THREE.Mesh(this.geometry, new THREE.ShadowMaterial({ color: 0 })); this.receiver.receiveShadow = true; this.scene.add(this.receiver);
        this.target = new THREE.WebGLRenderTarget(resolution, resolution, { format: THREE.RedFormat, depthBuffer: false, colorSpace: THREE.NoColorSpace });
        this.target.texture.minFilter = this.target.texture.magFilter = THREE.LinearFilter;
        this.bounds = new THREE.Vector4(); this.copies = new Map(); this.materials = new Map(); this.generations = 0;
    }

    /** @param {THREE.Mesh[]} sources @param {THREE.Vector4} bounds @param {THREE.Vector3} direction */
    update(sources, bounds, direction) {
        const { renderer, light, camera } = this, width = bounds.z - bounds.x, depth = bounds.w - bounds.y;
        const x = (bounds.x + bounds.z) / 2, z = (bounds.y + bounds.w) / 2;
        this.bounds.set(bounds.x, bounds.w, 1 / width, 1 / depth);
        this.receiver.position.set(x, this.groundY + .1, z); this.receiver.scale.set(width, 1, depth);
        Object.assign(camera, { left: -width / 2, right: width / 2, bottom: -depth / 2, top: depth / 2, near: .01, far: 4 });
        camera.position.set(x, this.groundY + 2, z); camera.up.set(0, 0, -1); camera.lookAt(x, this.groundY, z); camera.updateProjectionMatrix();
        light.target.position.set(x, this.groundY, z); light.position.copy(light.target.position).addScaledVector(direction, 800);
        const extent = Math.hypot(width, depth) / 2 + 90;
        Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 1800 });
        light.shadow.camera.updateProjectionMatrix();
        for (const mesh of this.copies.values()) mesh.visible = false;
        const material = source => {
            if (!this.materials.has(source)) this.materials.set(source, new THREE.MeshBasicMaterial({
                map: source.map, alphaMap: source.alphaMap, alphaTest: source.alphaTest, side: source.side,
                shadowSide: source.shadowSide, colorWrite: false, depthWrite: false }));
            return this.materials.get(source);
        };
        for (const source of sources) {
            let copy = this.copies.get(source);
            if (!copy) {
                const proxyMaterial = Array.isArray(source.material) ? source.material.map(material) : material(source.material);
                copy = source.isInstancedMesh ? new THREE.InstancedMesh(source.geometry, proxyMaterial, source.count)
                    : source.isSkinnedMesh ? new THREE.SkinnedMesh(source.geometry, proxyMaterial) : new THREE.Mesh(source.geometry, proxyMaterial);
                if (source.isSkinnedMesh) {
                    copy.bindMode = source.bindMode; copy.bindMatrix.copy(source.bindMatrix); copy.bindMatrixInverse.copy(source.bindMatrixInverse); copy.skeleton = source.skeleton;
                }
                copy.castShadow = true; copy.receiveShadow = false; copy.matrixAutoUpdate = false; this.copies.set(source, copy); this.scene.add(copy);
            }
            source.updateWorldMatrix(true, false); copy.matrix.copy(source.matrixWorld); copy.visible = true;
            if (source.isInstancedMesh) { copy.instanceMatrix.copy(source.instanceMatrix); copy.instanceMatrix.needsUpdate = true; copy.count = source.count; }
            if (source.morphTargetInfluences) copy.morphTargetInfluences = source.morphTargetInfluences;
        }
        const previous = { target: renderer.getRenderTarget(), tone: renderer.toneMapping, autoClear: renderer.autoClear,
            color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), viewport: renderer.getViewport(new THREE.Vector4()),
            scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
            enabled: renderer.shadowMap.enabled, auto: renderer.shadowMap.autoUpdate, update: renderer.shadowMap.needsUpdate, type: renderer.shadowMap.type };
        try {
            renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = light.shadow.needsUpdate = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true; renderer.setScissorTest(false);
            renderer.setRenderTarget(this.target); renderer.setClearColor(0xffffff, 1); renderer.render(this.scene, camera); this.generations++;
        } finally {
            renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
            renderer.setClearColor(previous.color, previous.alpha); renderer.toneMapping = previous.tone; renderer.autoClear = previous.autoClear;
            Object.assign(renderer.shadowMap, { enabled: previous.enabled, autoUpdate: previous.auto, needsUpdate: previous.update, type: previous.type });
        }
    }

    dispose() {
        this.target.dispose(); this.light.shadow.dispose(); this.geometry.dispose(); this.receiver.material.dispose();
        for (const mesh of this.copies.values()) mesh.dispose?.();
        for (const material of this.materials.values()) material.dispose(); this.copies.clear(); this.materials.clear(); this.scene.clear();
    }
}
