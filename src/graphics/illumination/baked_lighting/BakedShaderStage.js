// Owns compile-only city materials until the final validated view acquires their programs.
// @ts-check
import * as THREE from 'three';
import { cloneMaterialShaderContract, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { applyStaticSunDepthShaderPatch } from '../static_sun_depth/StaticSunDepthMaterialAdapter.js';
import { registerEnhancedReceiverShader } from '../receiver_lightmaps/EnhancedReceiverShaderBinding.js';
import { prepareLightingPrograms } from './LightingProgramPreparation.js';
import { DynamicAoRuntime } from '../../visuals/postprocessing/DynamicAoRuntime.js';
import { resolveAmbientOcclusionScope } from '../../visuals/postprocessing/AmbientOcclusionScope.js';
import { isLitMaterial } from '../../lighting/SceneShadowMaterials.js';

/** @param {{engine:any, mapping:any, coordinates:Float32Array, references:Map<string,any>,
 * uniforms:any, binding:any, signal:AbortSignal, progress?:(value:any)=>void}} options */
export async function prepareBakedShaderStage({ engine, mapping, coordinates, references, uniforms, binding, signal, progress = () => {} }) {
    if (mapping.profile.irradianceRepresentation !== 'surface-diffuse-v1') return null;
    const renderer = engine.renderer, city = engine.context.city, scene = engine.scene, camera = engine.camera;
    const materials = new Map(), objects = [], covered = new Set(), handles = [];
    let ao, disposed = false, programs = new Set(), batch = performance.now();
    const pause = async () => {
        signal.throwIfAborted();
        if (performance.now() - batch < 4) return;
        await new Promise(resolve => requestAnimationFrame(resolve));
        signal.throwIfAborted(); batch = performance.now();
    };
    const dispose = () => {
        if (disposed) return { programs: programs.size, reused: 0 };
        disposed = true;
        const owned = new Map();
        for (const material of materials.values()) for (const program of renderer.properties.get(material).programs?.values() ?? []) {
            owned.set(program, (owned.get(program) ?? 0) + 1);
        }
        const unused = [...programs].filter(program => program.usedTimes <= (owned.get(program) ?? 0));
        const reused = programs.size - unused.length;
        ao?.dispose(); for (const handle of handles) handle.remove();
        for (const material of materials.values()) material.dispose();
        return { programs: programs.size, reused };
    };
    try {
        signal.throwIfAborted();
        for (const record of mapping.objects) {
            const object = references.get(record.id);
            if (!object?.geometry) throw new Error('Missing staged receiver ' + record.id);
            let mapped = object.isInstancedMesh;
            for (let i = record.base; !mapped && i < record.base + record.referenceCount; i++) mapped = coordinates[i * 4 + 3] > .5;
            if (mapped) for (const material of Array.isArray(object.material) ? object.material : [object.material]) covered.add(material);
            await pause();
        }
        const sources = [];
        city.group.traverse(object => { if (object.isMesh || object.isPoints || object.isLine || object.isSprite) sources.push(object); });
        for (const object of sources) {
            const originals = Array.isArray(object.material) ? object.material : [object.material];
            const copies = originals.map(material => {
                if (materials.has(material)) return materials.get(material);
                const copy = cloneMaterialShaderContract(material, ['city.cascaded_shadows', 'city.finite_sun',
                    'illumination.static_sun_depth', 'illumination.receiver_lightmaps', 'ao.dynamic_contact']);
                materials.set(material, copy);
                if (copy.defines) for (const key of ['USE_CSM', 'CSM_CASCADES', 'CSM_FADE']) delete copy.defines[key];
                if (isLitMaterial(copy) && !copy.isMeshToonMaterial) handles.push(registerMaterialShaderHook(copy, {
                    id: 'illumination.static_sun_depth', priority: 200, variantKey: binding.variantKey,
                    uniforms: binding.uniforms, apply: shader => applyStaticSunDepthShaderPatch(shader, binding)
                }));
                if (covered.has(material) && copy.isMeshStandardMaterial) handles.push(registerEnhancedReceiverShader(copy, mapping, uniforms, true));
                return copy;
            });
            // compile() reads the object's geometry/instance/skeleton layout only.
            // Borrow those fields without copying buffers or changing the live mesh.
            const candidate = Object.create(Object.getPrototypeOf(object), Object.getOwnPropertyDescriptors(object));
            candidate.material = Array.isArray(object.material) ? copies : copies[0];
            objects.push({ object: candidate, material: candidate.material, source: object });
            await pause();
        }
        const settings = engine._ambientOcclusion?.settings ?? { mode: 'off' };
        const policy = resolveAmbientOcclusionScope(settings, true);
        if (policy.scope === 'dynamic' && policy.enabled) {
            ao = new DynamicAoRuntime();
            const participants = engine.getDynamicIlluminationObjects();
            ao.setShaderParticipants(participants.filter(p => p.root?.parent && (p.cast || p.receive)), settings);
            ao.prepareMaterials(objects.map(({ source, material }) => [source, material]), participants, settings);
        }
        const lighting = new THREE.Scene(), { sun, excluded } = city.getBakedShaderLighting();
        lighting.environment = scene.environment; lighting.fog = scene.fog;
        lighting.environmentRotation.copy(scene.environmentRotation);
        scene.traverseVisible(object => {
            if (!object.isLight || object === sun || excluded.includes(object) || !object.layers.test(camera.layers)) return;
            lighting.add(object.clone(false));
        });
        if (sun.layers.test(camera.layers)) {
            const light = sun.clone(false); light.visible = true; light.castShadow = false; lighting.add(light);
        }
        programs = await prepareLightingPrograms(renderer, objects, camera, lighting,
            engine._post?.pipeline?.getSceneMaterialRenderTarget() ?? null, signal, progress);
        return Object.freeze({ dispose, programCount: programs.size });
    } catch (error) { dispose(); throw error; }
}
