// src/graphics/assets3d/generators/building_fabrication/PortalOrnamentParts.js
// AI 510: registered custom mesh parts for the portal fabrication framework
// (sculpted ornaments the prismatic-extrusion kit cannot express — foliate
// capitals, keystones, finials). Parts are GLB assets loaded the way the bus
// models are: URL-relative asset, cached template, cloned per placement.
//
// The building generator is synchronous, so parts must be PRELOADED before a
// building that references them is built (`preloadPortalOrnamentParts`) —
// the same contract PBR calibration configs follow. An un-preloaded part is
// skipped with a warning, never a stall.
// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// heightMeters: the authored height of the part, used to derive the uniform
// scale for a requested `scaleMeters` (target height).
const PART_DEFS = Object.freeze({
    foliate_capital: Object.freeze({
        url: new URL('../../../../../assets/ornaments/foliate_capital.glb', import.meta.url).toString(),
        heightMeters: 0.517
    })
});

const templates = new Map();
const pending = new Map();

export function getPortalOrnamentPartIds() {
    return Object.keys(PART_DEFS);
}

export function getPortalOrnamentPartDef(partId) {
    return PART_DEFS[partId] ?? null;
}

/**
 * Loads part templates into the module cache. Safe to call repeatedly;
 * unknown ids are ignored. Resolves when every requested part settled
 * (failures are logged and leave the part unavailable).
 */
export function preloadPortalOrnamentParts(partIds = null) {
    const ids = Array.isArray(partIds) && partIds.length ? partIds : Object.keys(PART_DEFS);
    const jobs = [];
    for (const id of ids) {
        const def = PART_DEFS[id];
        if (!def || templates.has(id)) continue;
        let job = pending.get(id);
        if (!job) {
            const loader = new GLTFLoader();
            job = loader.loadAsync(def.url).then((gltf) => {
                templates.set(id, gltf.scene);
            }).catch((err) => {
                console.error(`Portal ornament part "${id}" failed to load`, err);
            }).finally(() => {
                pending.delete(id);
            });
            pending.set(id, job);
        }
        jobs.push(job);
    }
    return Promise.all(jobs).then(() => undefined);
}

/** Synchronous template access for the generator; null when not preloaded. */
export function getPortalOrnamentTemplate(partId) {
    return templates.get(partId) ?? null;
}

/**
 * Clones a preloaded part as one placeable Object3D. Materials are cloned so
 * a per-placement override cannot bleed into other clones; when `material`
 * is given, every mesh in the clone uses it.
 */
export function instantiatePortalOrnamentPart(partId, { material = null } = {}) {
    const template = templates.get(partId) ?? null;
    if (!template) return null;
    const clone = template.clone(true);
    clone.traverse((obj) => {
        if (!obj.isMesh) return;
        if (material) {
            obj.material = material;
        } else if (Array.isArray(obj.material)) {
            obj.material = obj.material.map((m) => (m ? m.clone() : m));
        } else if (obj.material) {
            obj.material = obj.material.clone();
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
    });
    return clone;
}

export const __portalOrnamentTestOnly = Object.freeze({
    _injectTemplateForTests(partId, object3d) {
        templates.set(partId, object3d);
    },
    _clearTemplatesForTests() {
        templates.clear();
    }
});
