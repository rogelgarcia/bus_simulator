// Adapts the transition lab's shared grass renderer to the bus scene's roadside fields.
// @ts-check
import * as THREE from 'three';
import { loadGrassDebugV2TransitionAssets } from './GrassDebugV2TransitionAssets.js?v=card-coverage-2';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js?v=card-coverage-2';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js?v=opaque-dissolve-1';
import { createGrassDebugV2ViewCards } from './GrassDebugV2ViewCards.js?v=card-coverage-2';
import { configureGrassDebugV2TransitionAppearance } from './GrassDebugV2DistanceAppearance.js';
import { createGrassDebugV2CanopyShadows } from './GrassDebugV2CanopyShadows.js?v=bus-distance-grass-1';
import { GRASS_FIELD_BUS_CAMERA } from './GrassDebugV2BusCamera.js';

/** @param {{renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,lighting:object,road:object,bus:THREE.Object3D,land:object,onProgress?:Function}} options */
export async function createGrassDebugV2DistanceGrass({ renderer, scene, camera, lighting, road, bus, land, onProgress = () => {} }) {
    renderer.localClippingEnabled = true;
    const sidewalk = new THREE.Box3().setFromObject(road.sidewalk);
    const columns = 8, rows = 36, gap = 2;
    const placements = Object.freeze([-1, 1].flatMap(side => Array.from({ length: 3 }, (_, index) => {
        const nearEdge = side < 0 ? sidewalk.min.x - .05 : sidewalk.max.x + .05;
        const minZ = bus.position.z - 4 + index * (rows + gap);
        return Object.freeze({ side, index, minX: side < 0 ? nearEdge - columns : nearEdge,
            maxX: side < 0 ? nearEdge : nearEdge + columns, minZ, maxZ: minZ + rows,
            columns, rows });
    })));
    const placement = placements[0];
    const bounds = { minX: Math.min(...placements.map(p => p.minX)), maxX: Math.max(...placements.map(p => p.maxX)),
        minZ: placement.minZ, maxZ: Math.max(...placements.map(p => p.maxZ)) };
    const assets = await loadGrassDebugV2TransitionAssets({ renderer, lighting, externalShadows: true, onProgress });
    let nearCards, bridgeCards, fields, externalShadows;
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    try {
        nearCards = await createGrassDebugV2ViewCards({ renderer, source: assets.sources.LOD2, onProgress });
        bridgeCards = await createGrassDebugV2ViewCards({ renderer, source: assets.sources.LOD2, profile: 'bridge', onProgress });
        const representation = cards => ({ templates: cards.templates.cards, material: cards.material, textureBytes: cards.getSnapshot().textureBytes });
        fields = createGrassDebugV2TransitionFields({ ...assets, fieldSize: placement.columns, fieldDepth: placement.rows,
            origins: placements.map(p => [p.minX, p.minZ]), gap, bridge: representation(bridgeCards) });
        fields.setLod3Representation(representation(nearCards)); fields.setEdgeStrips(true);
        const selection = new GrassDebugV2TransitionSelection({ cells: fields.cells });
        const settings = selection.getSnapshot();
        fields.configureBlend(settings.transitionBands, settings.bridgeEnabled);
        const appearanceMaterials = new Set([nearCards.material, bridgeCards.material]);
        fields.group.traverse(mesh => { if (mesh.isMesh && mesh.material.userData.grassFieldDistance) appearanceMaterials.add(mesh.material); });
        configureGrassDebugV2TransitionAppearance(appearanceMaterials, settings.effectiveDistances);
        scene.add(fields.group);
        land.setGrassPatches(placements); land.setGrassVisible(true);
        lighting.applyEnvironment();
        const sun = lighting.sun;
        sun.shadow.mapSize.set(8192, 8192);
        sun.shadow.normalBias = .0005; sun.shadow.bias = -.00001;
        renderer.shadowMap.autoUpdate = false;
        const allLod2 = new Uint8Array(fields.cells.length).fill(2), allCanopy = new Uint8Array(fields.cells.length).fill(5);
        const noSides = new Uint8Array(fields.cells.length), forcedLevels = new Uint8Array(fields.cells.length);
        let mode = 'AUTO', shadowGenerations = 0, disposed = false;
        function update(position = camera.position, now = performance.now(), force = false) {
            if (mode === 'OFF') return;
            const result = selection.update(position, now, { force });
            if (force || result.changedCount || result.sideLeavesChangedCount || result.renderChangedCount) {
                fields.applyLevels(mode === 'AUTO' ? result.levels : forcedLevels, result.sideLeaves, mode === 'AUTO' ? result.renderMasks : null);
            }
        }
        function refreshShadows() {
            // Cache a complete leaf shadow once, independent of the camera's current LOD selection.
            if (mode !== 'OFF') fields.applyLevels(allLod2, noSides);
            const previousTarget = renderer.getRenderTarget();
            renderer.shadowMap.needsUpdate = sun.shadow.needsUpdate = true;
            try {
                renderer.setRenderTarget(shadowTarget); renderer.render(scene, camera); shadowGenerations++;
            } finally {
                renderer.setRenderTarget(previousTarget); update(camera.position, performance.now(), true);
            }
        }
        onProgress('Preparing grass lighting and scene shadows…');
        fields.applyLevels(allCanopy, noSides);
        externalShadows = createGrassDebugV2CanopyShadows({ renderer, scene, sun, canopy: assets.canopy, fields: {
            getSnapshot: () => ({ bounds }),
            getCanopyMeshes: () => {
                const receivers = [];
                fields.group.traverseVisible(mesh => { if (mesh.isMesh && mesh.userData.grassCanopy) receivers.push(mesh); });
                return receivers;
            }
        } });
        externalShadows.update(); refreshShadows();
        return Object.freeze({
            group: fields.group,
            get mode() { return mode; },
            update,
            setMode(value) {
                if (!['AUTO', 'OFF', 'LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].includes(value)) throw new Error('Unknown grass mode: ' + value);
                if (value === mode) return;
                const visibilityChanged = (mode === 'OFF') !== (value === 'OFF');
                mode = value; fields.group.visible = value !== 'OFF'; land.setGrassVisible(value !== 'OFF');
                if (value.startsWith('LOD')) forcedLevels.fill(Number(value.slice(3)));
                update(camera.position, performance.now(), true);
                if (visibilityChanged) refreshShadows();
            },
            setFadeStyle(value) { fields.setFadeStyle(value); },
            getCameraPose() {
                const position = new THREE.Vector3((placement.minX + placement.maxX) / 2, GRASS_FIELD_BUS_CAMERA.heightMeters, placement.minZ - 2);
                const target = position.clone().add(new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(GRASS_FIELD_BUS_CAMERA.pitchDegrees)) * 20, 20));
                return { position, target };
            },
            getSnapshot() {
                const field = fields.getSnapshot(), visible = mode !== 'OFF';
                return { mode, system: 'distance-lod', placement, placements, fieldCount: placements.length, gapMeters: gap, patches: fields.cells.length,
                    triangles: visible ? field.triangles : 0, levels: visible ? field.levels : [0, 0, 0, 0, 0, 0],
                    field, selection: selection.getSnapshot(), canopy: assets.canopy.getSnapshot(),
                    cards: { near: nearCards.getSnapshot(), bridge: bridgeCards.getSnapshot() },
                    shadows: { generations: shadowGenerations, canopy: externalShadows.getSnapshot() } };
            },
            dispose() {
                if (disposed) return;
                disposed = true; land.setGrassVisible(false); fields.dispose(); externalShadows.dispose();
                nearCards.dispose(); bridgeCards.dispose(); assets.dispose(); shadowTarget.dispose();
            }
        });
    } catch (error) {
        land.setGrassVisible(false); fields?.dispose(); externalShadows?.dispose();
        nearCards?.dispose(); bridgeCards?.dispose(); assets.dispose(); shadowTarget.dispose();
        throw error;
    }
}
