// Adapts the transition lab's shared grass renderer to the bus scene's roadside fields.
// @ts-check
import * as THREE from 'three';
import { loadGrassDebugV2TransitionAssets } from './GrassDebugV2TransitionAssets.js?v=card-distribution-1';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js?v=card-distribution-1';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js?v=opaque-dissolve-1';
import { createGrassDebugV2ViewCards } from './GrassDebugV2ViewCards.js?v=card-distribution-1';
import { configureGrassDebugV2TransitionAppearance } from './GrassDebugV2DistanceAppearance.js';
import { createGrassDebugV2CanopyShadows } from './GrassDebugV2CanopyShadows.js?v=canopy-cached-1';
import { GRASS_FIELD_BUS_CAMERA } from './GrassDebugV2BusCamera.js';
import { createGrassDebugV2BakedLightingAssets } from './GrassDebugV2BakedLightingAssets.js';

/** @param {{renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,lighting:object,road:object,bus:THREE.Object3D,land:object,strategy?:'baked'|'current',onProgress?:Function}} options */
export async function createGrassDebugV2DistanceGrass({ renderer, scene, camera, lighting, road, bus, land, strategy = 'baked', onProgress = () => {} }) {
    if (!['baked', 'current'].includes(strategy)) throw new Error('Unknown roadside grass strategy: ' + strategy);
    const useBaked = strategy === 'baked';
    renderer.localClippingEnabled = true;
    const sidewalk = new THREE.Box3().setFromObject(road.sidewalk);
    const columns = 8, rows = 36, gap = 1;
    const placements = Object.freeze([-1, 1].flatMap(side => Array.from({ length: 15 }, (_, index) => {
        const column = Math.floor(index / 5), row = index % 5 - 1;
        const nearEdge = (side < 0 ? sidewalk.min.x - .05 : sidewalk.max.x + .05) + side * column * (columns + gap);
        const minZ = bus.position.z - 4 + row * (rows + gap);
        return Object.freeze({ side, index, column, row, minX: side < 0 ? nearEdge - columns : nearEdge,
            maxX: side < 0 ? nearEdge : nearEdge + columns, minZ, maxZ: minZ + rows,
            columns, rows });
    })));
    // Keep the existing grass camera and flyover in the original roadside column.
    const placement = placements.find(p => p.side === -1 && p.column === 0 && p.row === 0);
    const bounds = { minX: Math.min(...placements.map(p => p.minX)), maxX: Math.max(...placements.map(p => p.maxX)),
        minZ: Math.min(...placements.map(p => p.minZ)), maxZ: Math.max(...placements.map(p => p.maxZ)) };
    const assets = await loadGrassDebugV2TransitionAssets({ renderer, lighting, externalShadows: true, extraCardBaseDensity: useBaked ? .6 : 0, onProgress });
    let nearCards, bridgeCards, bakedAssets, fields, externalShadows;
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    const shadowReceiver = useBaked ? new THREE.ShadowMaterial({ color: 0, side: THREE.DoubleSide }) : null;
    try {
        if (useBaked) bakedAssets = await createGrassDebugV2BakedLightingAssets({ renderer, assets, lighting, onProgress, appearance: 'detailed' });
        else {
            nearCards = await createGrassDebugV2ViewCards({ renderer, source: assets.sources.LOD2, onProgress });
            bridgeCards = await createGrassDebugV2ViewCards({ renderer, source: assets.sources.LOD2, profile: 'bridge', onProgress });
        }
        const [near, bridge] = bakedAssets?.blades ?? [nearCards, bridgeCards];
        const representation = cards => ({ templates: cards.templates.cards, material: cards.material, textureBytes: cards.getSnapshot().textureBytes });
        fields = createGrassDebugV2TransitionFields({ ...assets, ...bakedAssets, fieldSize: placement.columns, fieldDepth: placement.rows,
            origins: placements.map(p => [p.minX, p.minZ]), gap, bridge: representation(bridge) });
        fields.setLod3Representation(representation(near)); fields.setEdgeStrips(true);
        if (useBaked) fields.group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
        const selection = new GrassDebugV2TransitionSelection({ cells: fields.cells,
            ...(useBaked ? { distances: [.6, .8, 20, 30, 40], transitionFraction: .3 } : {}) });
        const settings = selection.getSnapshot();
        fields.configureBlend(settings.transitionBands, settings.bridgeEnabled);
        if (!useBaked) {
            const appearanceMaterials = new Set([nearCards.material, bridgeCards.material]);
            fields.group.traverse(mesh => { if (mesh.isMesh && mesh.material.userData.grassFieldDistance) appearanceMaterials.add(mesh.material); });
            configureGrassDebugV2TransitionAppearance(appearanceMaterials, settings.effectiveDistances);
        }
        scene.add(fields.group);
        land.setGrassPatches(placements); land.setGrassVisible(true);
        lighting.applyEnvironment();
        const sun = lighting.sun;
        sun.shadow.mapSize.set(8192, 8192);
        sun.shadow.normalBias = .0005; sun.shadow.bias = -.00001;
        // Include the expanded fields in the fixed shadow camera without changing the game sun.
        sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true); sun.shadow.updateMatrices(sun);
        const shadowCamera = sun.shadow.camera, shadowBounds = new THREE.Box3();
        for (const x of [bounds.minX - 2, bounds.maxX + 2]) for (const z of [bounds.minZ - 2, bounds.maxZ + 2])
            for (const y of [0, 16]) shadowBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(shadowCamera.matrixWorldInverse));
        shadowCamera.left = Math.min(shadowCamera.left, shadowBounds.min.x);
        shadowCamera.right = Math.max(shadowCamera.right, shadowBounds.max.x);
        shadowCamera.bottom = Math.min(shadowCamera.bottom, shadowBounds.min.y);
        shadowCamera.top = Math.max(shadowCamera.top, shadowBounds.max.y);
        shadowCamera.near = Math.min(shadowCamera.near, Math.max(.1, -shadowBounds.max.z - 16));
        shadowCamera.far = Math.max(shadowCamera.far, -shadowBounds.min.z + 16);
        shadowCamera.updateProjectionMatrix();
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
            // Baked grass contains its root/self shading; cache only external scene shadows.
            // The preserved lit strategy still needs the complete LOD2 shadow population.
            if (mode !== 'OFF' && !useBaked) fields.applyLevels(allLod2, noSides);
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
        externalShadows = createGrassDebugV2CanopyShadows({ renderer, scene, sun, canopy: assets.canopy, receiverMaterial: shadowReceiver, fields: {
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
                return { mode, system: 'distance-lod', strategy, appearance: bakedAssets?.getSnapshot() ?? null, placement, placements, fieldCount: placements.length, columnsPerSide: 3, rowsPerSide: 5, gapMeters: gap, patches: fields.cells.length,
                    triangles: visible ? field.triangles : 0, levels: visible ? field.levels : [0, 0, 0, 0, 0, 0],
                    field, selection: selection.getSnapshot(), canopy: assets.canopy.getSnapshot(),
                    cards: useBaked ? null : { near: nearCards.getSnapshot(), bridge: bridgeCards.getSnapshot() },
                    shadows: { generations: shadowGenerations, canopy: externalShadows.getSnapshot() } };
            },
            dispose() {
                if (disposed) return;
                disposed = true; land.setGrassVisible(false); fields.dispose(); externalShadows.dispose();
                nearCards?.dispose(); bridgeCards?.dispose(); bakedAssets?.dispose(); assets.dispose(); shadowTarget.dispose(); shadowReceiver?.dispose();
            }
        });
    } catch (error) {
        land.setGrassVisible(false); fields?.dispose(); externalShadows?.dispose();
        nearCards?.dispose(); bridgeCards?.dispose(); bakedAssets?.dispose(); assets.dispose(); shadowTarget.dispose(); shadowReceiver?.dispose();
        throw error;
    }
}
