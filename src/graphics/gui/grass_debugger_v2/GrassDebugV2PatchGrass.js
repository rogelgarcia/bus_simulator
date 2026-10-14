// Exercise the production patch renderer and runtime package in the bus lab before gameplay adoption.
// @ts-check
import * as THREE from 'three';
import { loadGrassRuntimeAsset } from '../../engine3d/grass/runtime/GrassRuntimeAsset.js';
import { createGrassPatchRenderer } from '../../engine3d/grass/runtime/GrassPatchRenderer.js';
import { createGrassBoundaryMask } from '../../engine3d/grass/runtime/GrassBoundaryMask.js';
import { GrassSceneShadows } from '../../engine3d/grass/runtime/GrassSceneShadows.js';
import { GRASS_FIELD_BUS_CAMERA } from './GrassDebugV2BusCamera.js';
import { configureGrassDebugV2FieldShadows } from './GrassDebugV2FieldShadows.js';

/** @param {{renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,lighting:object,land:object,curve:object|null,placements:object[],placement:object,bounds:object,onProgress:Function}} input */
export async function createGrassDebugV2PatchGrass({ renderer, scene, camera, lighting, land, curve, placements, placement, bounds, onProgress }) {
    onProgress('Loading shared grass patches…');
    const asset = await loadGrassRuntimeAsset({ renderer, leafFill: new URLSearchParams(location.search).get('leafFill') === 'baked' });
    let coverage, patches, shadows, disposed = false;
    try {
        const outline = p => [{ x: p.minX, z: p.minZ }, { x: p.maxX, z: p.minZ }, { x: p.maxX, z: p.maxZ }, { x: p.minX, z: p.maxZ }];
        coverage = createGrassBoundaryMask({ bounds, outlines: [...placements.map(outline), ...(curve ? [curve.layout.outline] : [])],
            exclusions: curve?.road.sidewalkOuterBoundaryLoops ?? [] });
        asset.settings.brightness.value = lighting.sunRef.intensity / (asset.manifest.leafColor[0] * 2 * Math.PI);
        patches = createGrassPatchRenderer({ asset, coverage, bounds,
            terminalTransition: new URLSearchParams(location.search).get('handoff') || 'dissolve' }); scene.add(patches.group);
        land.setGrassPatches(placements); land.setGrassBoundary(coverage); land.setGrassVisible(true);
        lighting.applyEnvironment(); configureGrassDebugV2FieldShadows({ sun: lighting.sun, renderer, bounds }); scene.updateMatrixWorld(true);
        shadows = new GrassSceneShadows({ renderer, groundY: 0, resolution: 2048 });
        const casters = [];
        scene.traverseVisible(mesh => { if (mesh.isMesh && mesh.castShadow) casters.push(mesh); });
        shadows.update(casters, new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ), lighting.sunRef.direction);
        asset.shadowUniforms.grassCanopyShadowVisibility.value = shadows.target.texture;
        asset.shadowUniforms.grassCanopyShadowBounds.value = shadows.bounds;
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
        patches.update(camera); await patches.prewarm(renderer, scene, camera);
        renderer.shadowMap.needsUpdate = lighting.sun.shadow.needsUpdate = true;
        const getCurvePose = id => {
            const { center, radius } = curve.layout;
            if (id === 'curve') return { position: new THREE.Vector3(center.x + radius + 24, 65, center.z - radius - 36), target: new THREE.Vector3(center.x, 0, center.z + radius / 3) };
            const r = radius + (id === 'curve-inner' ? -8 : 8), a = Math.PI * .25;
            const position = new THREE.Vector3(center.x + Math.cos(a) * r, .65, center.z + Math.sin(a) * r);
            return { position, target: position.clone().add(new THREE.Vector3(-7, -.4, 7)) };
        };
        return Object.freeze({ group: patches.group, coverage,
            curve: curve ? Object.freeze({ getCameraPose: getCurvePose }) : null,
            get mode() { return patches.getSnapshot().mode; },
            update() { patches.update(camera); },
            setMode(value) { patches.setMode(value); land.setGrassVisible(value !== 'OFF'); patches.update(camera); },
            setFadeStyle(value) { if (value !== 'dissolve') throw new Error('[Grass] Fixed patches use the stable dissolve transition.'); },
            getCameraPose() {
                const position = new THREE.Vector3((placement.minX + placement.maxX) / 2, GRASS_FIELD_BUS_CAMERA.heightMeters, placement.minZ - 2);
                const target = position.clone().add(new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees)) * 20, 20));
                return { position, target };
            },
            getSnapshot() {
                const field = patches.getSnapshot();
                return { mode: field.mode, strategy: 'patches', system: 'immutable-patches', appearance: asset.manifest.appearance,
                    placement, placements, fieldCount: placements.length, columnsPerSide: 3, rowsPerSide: 5, gapMeters: 1,
                    patches: field.occupiedPatches, triangles: field.triangles, levels: field.levels, field,
                    selection: { effectiveDistances: field.distances, distances: field.distances, scans: field.scans },
                    curve: curve ? { radius: curve.layout.radius, field: { triangles: 0, levels: [0, 0, 0, 0, 0, 0] } } : null,
                    shadows: { generations: shadows.generations, externalCasters: casters.length },
                    leafFill: asset.leafFill ? { source: 'offline', views: asset.leafFill.manifest.views, bytes: asset.leafFill.manifest.bytes } : null,
                    packageHash: asset.manifest.sha256 };
            },
            dispose() {
                if (disposed) return; disposed = true; land.setGrassVisible(false);
                patches.dispose(); coverage.dispose(); shadows.dispose(); asset.dispose();
            }
        });
    } catch (error) {
        land.setGrassVisible(false); patches?.dispose(); coverage?.dispose(); shadows?.dispose(); asset.dispose(); throw error;
    }
}
