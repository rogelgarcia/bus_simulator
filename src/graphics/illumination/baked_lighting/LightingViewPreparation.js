// Submits city variants incrementally and resolves reflection before their first draw.
// @ts-check
import * as THREE from 'three';
import { prepareLightingPrograms } from './LightingProgramPreparation.js';
import { prepareLightingViewResources } from './LightingViewResources.js';
import { prepareLightingViewRaster } from './LightingViewRasterPreparation.js';

/** @param {any} renderer @param {any} scene @param {any} camera
 * @param {any} target @param {AbortSignal} signal @param {(value:any)=>void} [progress] */
export async function prepareLightingView(renderer, scene, camera, target, signal, progress = () => {}) {
    signal.throwIfAborted();
    const lighting = new THREE.Scene();
    lighting.environment = scene.environment; lighting.fog = scene.fog;
    lighting.environmentRotation.copy(scene.environmentRotation);
    scene.traverseVisible(object => {
        if (object.isLight && object.layers.test(camera.layers)) lighting.add(object.clone(false));
    });
    const objects = [];
    scene.traverse(object => {
        if (object.isMesh || object.isPoints || object.isLine || object.isSprite) objects.push({ object, material: object.material });
    });
    await prepareLightingPrograms(renderer, objects, camera, lighting, target, signal, progress);
    signal.throwIfAborted(); progress({ phase: 'preparing_visible_resources' });
    const resources = await prepareLightingViewResources(renderer, scene, camera, signal);
    signal.throwIfAborted(); progress({ phase: 'preparing_raster', resources });
    const raster = objects.length ? await prepareLightingViewRaster(renderer,scene,camera,target,objects,signal) : null;
    signal.throwIfAborted(); progress({ phase: 'ready', resources, raster });
}
