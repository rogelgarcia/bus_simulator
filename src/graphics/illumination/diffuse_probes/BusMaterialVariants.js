// Owns reversible, vehicle-local materials; lamp controllers retain their original materials.
// @ts-check
import * as THREE from 'three';
import { applyIBLIntensity, applyIBLToScene } from '../../engine3d/lighting/IBL.js';
import { busReflectionKind, addBusReflections } from './BusReflections.js';
import { registerObjectForSceneShadows } from '../../lighting/SceneShadowMaterials.js';

const isVehicleSurface = mesh => mesh.isMesh && mesh.name !== 'ibl_probe_sphere';
const retainsControllerMaterial = material => material.userData?.noTune
    || (!material.name && material.emissive?.getHex() > 0)
    || /light|lamp|brake|reverse|revese|turn|sign/i.test(material.name);

/** @param {any} original @param {boolean} enhanced @returns {any} */
export function createBusMaterialVariant(original, enhanced) {
    // Some rig-created lamps are unnamed and start with intensity zero. Their
    // controllers retain this material reference, so emissive identity matters.
    if (!original || retainsControllerMaterial(original)) return original;
    if (original.isMeshStandardMaterial) return original.clone();
    if (!enhanced || !original.isMeshPhongMaterial) return original;
    const material = new THREE.MeshPhysicalMaterial();
    for (const key of ['name', 'map', 'alphaMap', 'normalMap', 'normalMapType', 'bumpMap', 'bumpScale',
        'aoMap', 'aoMapIntensity', 'emissiveMap', 'emissiveIntensity', 'transparent', 'opacity', 'alphaTest',
        'side', 'shadowSide', 'depthWrite', 'depthTest', 'colorWrite', 'blending', 'premultipliedAlpha',
        'vertexColors', 'flatShading', 'fog', 'toneMapped', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits']) {
        if (original[key] !== undefined) material[key] = original[key];
    }
    material.color.copy(original.color);
    material.emissive.copy(original.emissive);
    material.normalScale.copy(original.normalScale);
    material.userData = { ...original.userData };
    const glass = /glass|window/i.test(original.name);
    const paint = /paint/i.test(original.name);
    const mirror = /mirror/i.test(original.name), metal = mirror || /rimmetal/i.test(original.name);
    material.metalness = mirror ? 1 : metal ? .25 : 0;
    material.roughness = mirror ? .04 : metal ? .3 : /tire/i.test(original.name) ? .88 : glass ? .14 : paint ? .32 : .62;
    if (/^(glossy|plastic)$/i.test(original.name)) material.specularIntensity = .15;
    material.clearcoat = paint ? .25 : 0;
    material.clearcoatRoughness = .2;
    return material;
}

export class BusMaterialVariants {
    /** @param {any} engine */
    constructor(engine) { this.engine = engine; this.roots = new Map(); this.materials = new Set(); }

    /** @param {any} settings */
    configure(settings) {
        this.stage(settings).commit();
    }

    /** Build a detached material candidate without changing any visible mesh. */
    stage(settings) {
        const { enabled, materials, probes, glassReflections, bodyReflections, rimShine } = settings;
        const reflections = glassReflections || bodyReflections || rimShine;
        const enhanced = enabled && materials, useProbes = enabled && probes;
        const roots = new Set((this.engine.getDynamicIlluminationObjects?.() ?? []).filter(v => v.id.startsWith('vehicle.')).map(v => v.root));
        for (const [root, record] of this.roots) if (!roots.has(root)) { this.release(record); this.roots.delete(root); }
        const candidateMaterials = new Set(), assignments = new Map();
        let unsupported = 0;
        for (const root of roots) {
            let record = this.roots.get(root);
            if (record) {
                const meshes = []; root.traverse(mesh => { if (isVehicleSurface(mesh)) meshes.push(mesh); });
                if (meshes.length !== record.meshes.length || meshes.some((mesh, i) => mesh !== record.meshes[i].mesh)) {
                    this.release(record); this.roots.delete(root); record = null;
                }
            }
            if (!record && (enhanced || useProbes || reflections)) {
                record = { meshes: [], variants: new Map() };
                root.traverse(mesh => { if (isVehicleSurface(mesh)) record.meshes.push({ mesh, original: mesh.material }); });
                this.roots.set(root, record);
            }
            if (!record) continue;
            for (const item of record.meshes) {
                const map = original => {
                    const reflectionKind = retainsControllerMaterial(original) ? null : busReflectionKind(original, settings);
                    if (!enhanced && !useProbes && !reflectionKind) return original;
                    const key = original.uuid + ':' + enhanced + ':' + useProbes + ':' + (reflectionKind ?? 'original');
                    if (!record.variants.has(key)) {
                        let variant = createBusMaterialVariant(original, enhanced);
                        if (reflectionKind) {
                            if (variant === original) variant = original.clone();
                            addBusReflections(variant, reflectionKind);
                        }
                        record.variants.set(key, variant);
                    }
                    const variant = record.variants.get(key);
                    if (variant !== original && variant.isMeshStandardMaterial) candidateMaterials.add(variant);
                    else if (useProbes && original.isMeshPhongMaterial && !retainsControllerMaterial(original)) unsupported++;
                    return variant;
                };
                assignments.set(item.mesh, enhanced || useProbes || reflections
                    ? Array.isArray(item.original) ? item.original.map(map) : map(item.original) : item.original);
            }
        }
        const scene = new THREE.Scene();
        if (!assignments.size) return { scene, assignments, materials: candidateMaterials, unsupported,
            commit: () => { this.materials = candidateMaterials; this.unsupported = unsupported; } };
        scene.environment = this.engine.scene.environment;
        scene.environmentRotation.copy(this.engine.scene.environmentRotation);
        for (const [mesh, material] of assignments) {
            const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const next = Array.isArray(material) ? material : [material];
            if (previous.length === next.length && previous.every((value, i) => value === next[i])) continue;
            const copy = mesh.clone(false);
            copy.material = Array.isArray(material) ? next.filter((value,i)=>value!==previous[i]) : material;
            copy.matrixAutoUpdate = false; copy.matrix.copy(mesh.matrixWorld);
            copy.visible = true; copy.frustumCulled = false; scene.add(copy);
        }
        applyIBLToScene(scene, scene.environment, this.engine.lightingSettings?.ibl ?? {});
        applyIBLIntensity(scene, this.engine.lightingSettings?.ibl ?? {});
        registerObjectForSceneShadows(scene);
        return { scene, assignments, materials: candidateMaterials, unsupported,
            commit: () => {
                for (const root of roots) this.engine.context?.city?.unregisterShadowReceivers?.(root);
                for (const [mesh, material] of assignments) mesh.material = material;
                this.materials = candidateMaterials; this.unsupported = unsupported;
                for (const root of roots) this.engine.context?.city?.registerShadowReceivers?.(root);
            } };
    }

    release(record) {
        for (const item of record.meshes) item.mesh.material = item.original;
        const originals = new Set(record.meshes.flatMap(item => Array.isArray(item.original) ? item.original : [item.original]));
        for (const material of new Set(record.variants.values())) if (!originals.has(material)) material.dispose();
    }
    getDiagnostics() {
        return { activeMaterials: this.materials.size, unsupportedLegacyMaterials: this.unsupported ?? 0,
            cachedVariants: [...this.roots.values()].reduce((n, record) => n + record.variants.size, 0),
            policy: 'vehicle_local_variants_original_texture_storage_shared' };
    }
    dispose() { for (const record of this.roots.values()) this.release(record); this.roots.clear(); this.materials.clear(); }
}
