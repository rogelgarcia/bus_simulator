// Prepares the existing bloom targets/programs; never changes the effect or its resolution.
// @ts-check
import * as THREE from 'three';

export class BloomResourcePreparation {
    /** @param {any} renderer @param {any} pipeline @param {any} queue */
    constructor(renderer, pipeline, queue) {
        this.renderer = renderer; this.pipeline = pipeline; this.queue = queue;
        this.done = new WeakSet(); this.ownedJobs = new Set(); this.allocations = new Map(); this.listeners = new Map();
        this.stats = { targets: 0, programs: 0, extraBytes: 0, reservedBytes: 0, peakExtraBytes: 0 };
        this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
        this.mesh = new THREE.Mesh(pipeline._sunBloomPass._fsQuad._mesh.geometry, pipeline._darkMaterial);
        this.mesh.frustumCulled = false; this.scene.add(this.mesh);
        this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
        this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        this.forward = new THREE.Vector3();
    }

    preserve(action) {
        const r = this.renderer, target = r.getRenderTarget(), face = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel();
        const { frame: _frame, ...info } = r.info.render, auto = r.info.autoReset, shadows = r.shadowMap.autoUpdate, needs = r.shadowMap.needsUpdate;
        try { r.info.autoReset = false; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false; return action(); }
        finally { r.setRenderTarget(target, face, mip); r.info.autoReset = auto; Object.assign(r.info.render, info);
            r.shadowMap.autoUpdate = shadows; r.shadowMap.needsUpdate = needs; }
    }

    watch(resource) {
        if (this.listeners.has(resource)) return;
        const disposed = () => {
            this.done.delete(resource); this.queue.cancel(resource); this.ownedJobs.delete(resource);
            this.stats.extraBytes -= this.allocations.get(resource) ?? 0; this.allocations.delete(resource);
        };
        resource.addEventListener('dispose', disposed); this.listeners.set(resource, disposed);
    }

    /** Queue at most one target allocation or program preparation unit per job step. */
    update(city, camera, scene, availableBytes) {
        const p = this.pipeline, pass = p._sunBloomPass, r = this.renderer;
        if (p._sunBloomOcclusion.frameStats.rendered) { this.allocations.clear(); this.stats.extraBytes = 0; }
        const direction = city?.sunRef?.direction;
        const halfFov = THREE.MathUtils.degToRad(camera.fov / 2), margin = THREE.MathUtils.degToRad(20 + (city.sunBloom?._settings.discRadiusDeg ?? 0));
        if (direction) this.forward.copy(direction).transformDirection(camera.matrixWorldInverse);
        const near = p._sunBloom.enabled && direction && this.forward.z < 0
            && Math.atan2(Math.abs(this.forward.x), -this.forward.z) < Math.atan(Math.tan(halfFov) * camera.aspect) + margin
            && Math.atan2(Math.abs(this.forward.y), -this.forward.z) < halfFov + margin;
        if (!near) {
            for (const key of this.ownedJobs) this.queue.cancel(key);
            this.ownedJobs.clear(); this.stats.reservedBytes = 0; return;
        }
        const targets = [p._sunBloomComposer.renderTarget1, p._sunBloomComposer.renderTarget2,
            pass.renderTargetBright, ...pass.renderTargetsHorizontal, ...pass.renderTargetsVertical];
        const missingBytes = targets.filter(t => !r.properties.get(t).__webglFramebuffer)
            .reduce((sum,t) => sum + t.width * t.height * (8 + (t.depthBuffer ? 4 : 0)), 0);
        if (missingBytes > availableBytes() - this.stats.extraBytes) return;
        this.stats.reservedBytes = missingBytes;
        for (const target of targets) {
            if (r.properties.get(target).__webglFramebuffer || this.queue.jobs.has(target)) continue;
            const bytes = target.width * target.height * (8 + (target.depthBuffer ? 4 : 0));
            if (this.queue.add(target, { persistent: true, priority: -2, step: () => {
                if (!r.properties.get(target).__webglFramebuffer) {
                    if (bytes > availableBytes() - this.stats.extraBytes) return { waiting: true };
                    this.preserve(() => r.initRenderTarget(target));
                    this.allocations.set(target, bytes); this.stats.extraBytes += bytes;
                    this.stats.reservedBytes = Math.max(0, this.stats.reservedBytes - bytes);
                    this.stats.peakExtraBytes = Math.max(this.stats.peakExtraBytes, this.stats.extraBytes); this.stats.targets++;
                }
                return { done: true, exclusive: true };
            } })) { this.watch(target); this.ownedJobs.add(target); }
        }
        const materials = [pass.materialHighPassFilter, ...pass.separableBlurMaterials, pass.compositeMaterial,
            pass.blendMaterial, p.compositePass.material, p._darkMaterial, city.sunBloom?._mesh?.material].filter(Boolean);
        for (const material of materials) {
            if (this.done.has(material) || this.queue.jobs.has(material)) continue;
            let compiled = false;
            if (this.queue.add(material, { persistent: true, priority: -1, step: () => {
                if (targets.some(t => !r.properties.get(t).__webglFramebuffer)) return { waiting: true };
                this.mesh.material = material;
                this.scene.fog = material === p._darkMaterial ? scene.fog : null;
                if (!compiled) {
                    this.preserve(() => { r.setRenderTarget(this.target); r.compile(this.scene, this.camera); });
                    compiled = true; return { done: false, exclusive: true };
                }
                const program = r.properties.get(material).currentProgram;
                if (!program || !program.isReady()) return { waiting: true };
                this.preserve(() => { r.setRenderTarget(this.target); r.render(this.scene, this.camera); });
                this.done.add(material); this.stats.programs++;
                return { done: true, exclusive: true };
            } })) { this.watch(material); this.ownedJobs.add(material); }
        }
    }

    /** Cancel borrowed work and free only the preparation-owned target. */
    dispose() {
        for (const key of this.ownedJobs) this.queue.cancel(key);
        for (const [resource, listener] of this.listeners) resource.removeEventListener('dispose', listener);
        this.ownedJobs.clear(); this.listeners.clear(); this.allocations.clear(); this.target.dispose();
        // The fullscreen geometry and materials are owned by the pipeline.
        this.scene.remove(this.mesh);
    }
}
