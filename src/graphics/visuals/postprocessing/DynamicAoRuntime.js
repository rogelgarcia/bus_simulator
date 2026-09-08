// Adds ambient-only contact for registered moving objects, including when parked.
import * as THREE from 'three';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { dynamicAoShader as source } from '../../shaders/materials/DynamicAoShader.js';
import { isWholeObjectAoExcludedReceiver, shouldApplyAoAlphaCutout } from './AoAlphaCutoutSupport.js';
import { DynamicGtaoPass } from './DynamicGtaoPass.js';

export class DynamicAoRuntime {
    constructor() {
        this.shaderFlags = '#define DYNAMIC_AO_ANALYTIC\n#define DYNAMIC_AO_GENERIC\n';
        this.materials = new Map();
        this.geometries = new Map();
        this.depthMaterials = new Map();
        this.worldBounds = new WeakMap();
        this.boundsTexture = null;
        this.target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
        this.uniforms = {
            dynamicAoEnabled: { value: 0 }, dynamicAoIntensity: { value: 1 }, dynamicAoRadius: { value: 1.5 },
            dynamicAoDebug: { value: 0 }, dynamicAoCount: { value: 0 },
            dynamicAoBounds: { value: null },
            dynamicAoMap: { value: null }, dynamicAoStaticMap: { value: null }, dynamicAoGeneric: { value: 0 },
            dynamicAoProjection: { value: new THREE.Matrix4() },
            dynamicAoViewInverse: { value: new THREE.Matrix4() },
            dynamicAoReachMin: { value: new THREE.Vector3() }, dynamicAoReachMax: { value: new THREE.Vector3() }
        };
        this.diagnostics = { enabled: false, method: 'inactive', calls: 0, triangles: 0, cpuMs: 0, targetBytes: 0, activeTargetBytes: 0 };
    }

    patch(material) {
        if (this.materials.has(material) || !(material.isMeshStandardMaterial || material.isMeshPhongMaterial)) return;
        const uniforms = this.uniforms;
        const runtime = this;
        const hook = registerMaterialShaderHook(material, { id: 'ao.dynamic_contact', priority: 400, variantKey: source.variantKey + this.shaderFlags.replaceAll('\n', '|'),
            apply(shader) {
                Object.assign(shader.uniforms, uniforms);
                shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + source.vertex)
                    .replace('#include <project_vertex>', source.vertexApply + '\n#include <project_vertex>');
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + source.fragment)
                    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + source.apply)
                    .replace('#include <opaque_fragment>', source.debug + '\n#include <opaque_fragment>');
                shader.fragmentShader = runtime.shaderFlags + shader.fragmentShader;
            }
        });
        const previous = material.onBeforeRender, had = Object.hasOwn(material, 'onBeforeRender');
        const render = (renderer, ...args) => {
            previous.call(material, renderer, ...args);
            const properties = renderer.properties.get(material);
            if (properties.uniforms && properties.uniforms.dynamicAoEnabled !== uniforms.dynamicAoEnabled) {
                Object.assign(properties.uniforms, uniforms); properties.uniformsList = null;
            }
        };
        material.onBeforeRender = render;
        material.defaultAttributeValues ??= {};
        const oldDefault = material.defaultAttributeValues.dynamicAoParticipant;
        material.defaultAttributeValues.dynamicAoParticipant = [0];
        const record = { hook, restore: () => {
            hook.remove();
            if (material.onBeforeRender === render) { if (had) material.onBeforeRender = previous; else delete material.onBeforeRender; }
            if (oldDefault) material.defaultAttributeValues.dynamicAoParticipant = oldDefault;
            else delete material.defaultAttributeValues.dynamicAoParticipant;
            material.removeEventListener('dispose', onDispose);
        } };
        const onDispose = () => { record.restore(); this.materials.delete(material); };
        material.addEventListener('dispose', onDispose);
        this.materials.set(material, record);
    }

    participant(mesh, id) {
        let record = this.geometries.get(mesh);
        if (!record && !id) return;
        if (record && mesh.geometry !== record.geometry && mesh.geometry !== record.original) {
            record.geometry.dispose(); this.geometries.delete(mesh); record = null;
        }
        if (!record) {
            const original = mesh.geometry, geometry = original.clone();
            geometry.setAttribute('dynamicAoParticipant', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(id), 1));
            record = { original, geometry, id }; this.geometries.set(mesh, record); mesh.geometry = geometry;
        }
        if (record.id !== id) {
            record.geometry.attributes.dynamicAoParticipant.array.fill(id);
            record.geometry.attributes.dynamicAoParticipant.needsUpdate = true; record.id = id;
        }
        mesh.geometry = record.geometry;
    }

    depthMaterial(material, mesh, alpha) {
        const cutout = shouldApplyAoAlphaCutout(material, mesh);
        if (material.visible === false || material.depthWrite === false && !cutout
            || material.transparent && !cutout || cutout && alpha.handling === 'exclude') return null;
        let depth = this.depthMaterials.get(material);
        if (!depth) {
            depth = new THREE.MeshDepthMaterial(); this.depthMaterials.set(material, depth);
            const release = () => { depth.dispose(); this.depthMaterials.delete(material); material.removeEventListener('dispose', release); };
            material.addEventListener('dispose', release); depth.userData.release = () => material.removeEventListener('dispose', release);
        }
        const map = cutout ? material.map ?? material.userData?.aoAlphaMap ?? null : null;
        const alphaMap = cutout ? material.alphaMap : null;
        const threshold = cutout ? Math.max(material.alphaTest || 0, alpha.threshold) : 0;
        if (depth.map !== map || depth.alphaMap !== alphaMap || depth.alphaTest !== threshold || depth.side !== material.side) {
            depth.map = map; depth.alphaMap = alphaMap; depth.alphaTest = threshold; depth.side = material.side; depth.needsUpdate = true;
        }
        return depth;
    }

    objectBounds(mesh) {
        const geometry = mesh.geometry;
        let cached = this.worldBounds.get(mesh);
        const matrix = mesh.matrixWorld.elements;
        if (cached?.geometry === geometry && cached.matrix.every((v, i) => v === matrix[i]) && !mesh.isSkinnedMesh
            && cached.instanceVersion === mesh.instanceMatrix?.version && cached.count === mesh.count) return cached.box;
        if (mesh.isInstancedMesh || mesh.isSkinnedMesh) mesh.computeBoundingBox();
        else if (!geometry.boundingBox) geometry.computeBoundingBox();
        const box = (mesh.boundingBox ?? geometry.boundingBox).clone().applyMatrix4(mesh.matrixWorld);
        cached = { geometry, matrix: [...matrix], box, instanceVersion: mesh.instanceMatrix?.version, count: mesh.count };
        this.worldBounds.set(mesh, cached); return box;
    }

    update({ renderer, scene, camera, participants, settings, enabled }) {
        const start = performance.now(), uniforms = this.uniforms;
        this.restoreBindings();
        uniforms.dynamicAoEnabled.value = 0;
        Object.assign(this.diagnostics, { enabled: !!enabled, method: 'inactive', calls: 0, triangles: 0, cpuMs: 0, activeTargetBytes: 0 });
        if (!enabled) return;
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const roots = participants.filter(p => p.root?.parent && (p.cast || p.receive));
        const rootIds = new Map(roots.map((p, i) => [p.root, i + 1]));
        if (!roots.length) return;
        const rows = Math.max(1, roots.length);
        if (this.boundsTexture?.image.height !== rows) {
            this.boundsTexture?.dispose();
            this.boundsTexture = new THREE.DataTexture(new Float32Array(rows * 36), 9, rows, THREE.RGBAFormat, THREE.FloatType);
            this.boundsTexture.needsUpdate = true; uniforms.dynamicAoBounds.value = this.boundsTexture;
        }
        const bounds = roots.map(() => new THREE.Box3()), inverse = roots.map(p => p.root.matrixWorld.clone().invert());
        const analytic = roots.map(p => p.aoUnderbody && settings.dynamic.busMethod !== 'gtao');
        const hasGeneric = roots.some((p,i) => p.cast && !analytic[i]);
        const flags = (roots.some((p,i) => p.cast && analytic[i]) ? '#define DYNAMIC_AO_ANALYTIC\n' : '')
            + (hasGeneric ? '#define DYNAMIC_AO_GENERIC\n' : '');
        if (flags !== this.shaderFlags) {
            this.shaderFlags = flags;
            for (const record of this.materials.values()) record.hook.update({ variantKey: source.variantKey + flags.replaceAll('\n', '|') });
        }
        const meshes = [], keepGeometry = new Set();
        scene.traverseVisible(mesh => {
            if (mesh.isLine || mesh.isPoints || mesh.isSprite) { meshes.push({ mesh, hidden: true }); return; }
            if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
            let parent = mesh, id = 0;
            while (parent && !id) { id = rootIds.get(parent) ?? 0; parent = parent.parent; }
            let excluded = false;
            for (let owner = mesh; owner; owner = owner.parent) {
                if (owner.userData.excludeFromAmbientOcclusion === true || owner.userData.isContactShadow === true) excluded = true;
            }
            const receiverExcluded = excluded || isWholeObjectAoExcludedReceiver(mesh);
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const receive = !receiverExcluded && (!id || roots[id-1].receive);
            keepGeometry.add(mesh);
            if (receive) for (const material of mats) {
                if (material.transparent || shouldApplyAoAlphaCutout(material, mesh) && settings.alpha.handling === 'exclude') continue;
                this.patch(material);
            }
            if (excluded) { meshes.push({ mesh, hidden: true, receive, id, mats }); return; }
            if (id && mats.some(m => !m.transparent && !shouldApplyAoAlphaCutout(m, mesh))) {
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                bounds[id-1].union(mesh.geometry.boundingBox.clone().applyMatrix4(inverse[id-1].clone().multiply(mesh.matrixWorld)));
            }
            const depth = mats.map(m => this.depthMaterial(m, mesh, settings.alpha));
            meshes.push({ mesh, depth, hidden: depth.every(m => !m), receive, id, mats });
        });
        const reach = new THREE.Box3();
        bounds.forEach((box, i) => { if (!box.isEmpty()) reach.union(box.clone().applyMatrix4(roots[i].root.matrixWorld)); });
        reach.expandByScalar(settings.dynamic.radius);
        uniforms.dynamicAoReachMin.value.copy(reach.min);
        uniforms.dynamicAoReachMax.value.copy(reach.max);
        for (const item of meshes) {
            if (!item.mats) continue;
            this.participant(item.mesh, item.receive ? item.id : (item.mats.some(m => this.materials.has(m)) || item.id ? -1 : 0));
            if (!item.hidden && !this.objectBounds(item.mesh).intersectsBox(reach)) item.hidden = true;
        }
        for (const [mesh, record] of this.geometries) if (!keepGeometry.has(mesh)) {
            if (mesh.geometry === record.geometry) mesh.geometry = record.original;
            record.geometry.dispose(); this.geometries.delete(mesh);
        }
        const data = this.boundsTexture.image.data;
        roots.forEach((p, i) => {
            inverse[i].toArray(data, i * 36);
            if (bounds[i].isEmpty()) bounds[i].set(new THREE.Vector3(), new THREE.Vector3());
            bounds[i].min.toArray(data, i*36+16); bounds[i].max.toArray(data, i*36+20);
            data[i*36+19] = roots[i].cast ? 1 : 0;
            if (analytic[i]) {
                data.set(p.aoUnderbody.min, i*36+16); data.set(p.aoUnderbody.max, i*36+20);
                // Audited floor footprint with height from the loaded opaque body.
                data[i*36+21] = Math.max(p.aoUnderbody.min[1], bounds[i].max.y);
            }
            data[i*36+23] = analytic[i] ? 1 : 0;
            const axes = p.root.matrixWorld.elements;
            for (let column = 0; column < 3; column++) data.set(axes.slice(column*4,column*4+4), i*36+24+column*4);
        });
        this.boundsTexture.needsUpdate = true;
        uniforms.dynamicAoCount.value = roots.length;
        uniforms.dynamicAoProjection.value.copy(camera.projectionMatrix);
        uniforms.dynamicAoViewInverse.value.copy(camera.matrixWorld);
        uniforms.dynamicAoIntensity.value = settings.dynamic.intensity;
        uniforms.dynamicAoRadius.value = settings.dynamic.radius;
        uniforms.dynamicAoDebug.value = settings.dynamic.debugView ? 1 : 0;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        this.target.setSize(Math.max(1, Math.ceil(size.x/2)), Math.max(1, Math.ceil(size.y/2)));
        const previousTarget = renderer.getRenderTarget(), background = scene.background, override = scene.overrideMaterial;
        const auto = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate;
        const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
        const before = { ...renderer.info.render }, autoInfo = renderer.info.autoReset;
        const saved = meshes.map(({ mesh }) => [mesh, mesh.material, mesh.visible]);
        const hiddenDepth = this.hiddenDepth ??= new THREE.MeshDepthMaterial({ visible: false });
        try {
            renderer.info.autoReset = false; renderer.autoClear = true;
            renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
            scene.background = null; scene.overrideMaterial = null;
            for (const item of meshes) {
                if (item.hidden) item.mesh.visible = false;
                else item.mesh.material = Array.isArray(item.mesh.material) ? item.depth.map(m => m ?? hiddenDepth) : item.depth[0];
            }
            renderer.setRenderTarget(this.target); renderer.setClearColor(0xffffff, 1); renderer.render(scene, camera);
            this.gtao ??= new DynamicGtaoPass(scene, camera, this.target.depthTexture);
            uniforms.dynamicAoMap.value = this.gtao.render(renderer, camera, this.target, settings.dynamic, reach);
            uniforms.dynamicAoStaticMap.value = uniforms.dynamicAoMap.value;
            uniforms.dynamicAoGeneric.value = hasGeneric ? 1 : 0;
            if (hasGeneric) {
                this.staticTarget ??= this.target.clone();
                this.staticTarget.setSize(this.target.width, this.target.height);
                for (const item of meshes) if (item.id && roots[item.id-1].cast && !analytic[item.id-1]) item.mesh.visible = false;
                renderer.setRenderTarget(this.staticTarget); renderer.setClearColor(0xffffff, 1); renderer.render(scene, camera);
                this.staticGtao ??= new DynamicGtaoPass(scene, camera, this.staticTarget.depthTexture, this.gtao.pass.pdNoiseTexture);
                uniforms.dynamicAoStaticMap.value = this.staticGtao.render(renderer, camera, this.staticTarget, settings.dynamic, reach);
            }
        } finally {
            for (const [mesh, material, visible] of saved) { mesh.material = material; mesh.visible = visible; }
            scene.background = background; scene.overrideMaterial = override;
            renderer.setRenderTarget(previousTarget); renderer.setClearColor(clearColor, clearAlpha); renderer.autoClear = auto;
            renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds;
            renderer.info.autoReset = autoInfo;
        }
        uniforms.dynamicAoEnabled.value = 1;
        Object.assign(this.diagnostics, { calls: renderer.info.render.calls-before.calls, triangles: renderer.info.render.triangles-before.triangles,
            cpuMs: performance.now()-start, participants: roots.length, targetBytes: this.target.width*this.target.height*24*(this.staticTarget ? 2 : 1)+data.byteLength,
            activeTargetBytes: this.target.width*this.target.height*24*(hasGeneric ? 2 : 1)+data.byteLength,
            method: analytic.some(Boolean) ? 'analytic-bus-volume-with-gtao-detail' : 'generic-dynamic-gtao',
            analyticUnderbodies: analytic.filter(Boolean).length, genericCasters: hasGeneric,
            intensity: settings.dynamic.intensity, factorRange: [Math.max(.1, 1-settings.dynamic.intensity), 1],
            staticToStatic: false, depthSize: [this.target.width, this.target.height] });
    }

    dispose() {
        for (const record of this.materials.values()) record.restore(); this.materials.clear();
        for (const [mesh, record] of this.geometries) { if (mesh.geometry === record.geometry) mesh.geometry = record.original; record.geometry.dispose(); }
        this.geometries.clear();
        for (const material of this.depthMaterials.values()) { material.userData.release(); material.dispose(); } this.depthMaterials.clear();
        this.hiddenDepth?.dispose(); this.target.dispose(); this.staticTarget?.dispose(); this.boundsTexture?.dispose();
        this.gtao?.dispose(); this.staticGtao?.dispose();
    }

    restoreBindings() {
        for (const [mesh, record] of this.geometries) if (mesh.geometry === record.geometry) mesh.geometry = record.original;
    }
}
