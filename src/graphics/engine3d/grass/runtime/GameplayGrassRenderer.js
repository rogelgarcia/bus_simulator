// Own the gameplay grass lifecycle; a stable tiled window bounds detailed geometry around the camera.
// @ts-check
import * as THREE from 'three';
import { loadGrassRuntimeAsset } from './GrassRuntimeAsset.js';
import { createGrassDebugV2TransitionFields } from './GrassDebugV2TransitionFields.js';
import { GrassDebugV2TransitionSelection } from './GrassDebugV2TransitionSelection.js';
import { cloneMaterialShaderContract } from '../../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassCoverageMask } from './GrassCoverageMask.js';
import { applyGrassRuntimeMask } from './GrassRuntimeMaterials.js';
import { GrassSceneShadows } from './GrassSceneShadows.js';

const WINDOW_METERS = 128, HALF = WINDOW_METERS / 2, ANCHOR_STEP = 16;

/** @param {{engine:object,city:object,coverage:object}} options */
export class GameplayGrassRenderer {
    constructor({ engine, city, coverage }) {
        this.engine = engine; this.city = city; this.coverageInput = coverage;
        this.mode = engine.grassSettings.mode; this.disposed = false; this.error = null; this.updates = 0;
        this.group = new THREE.Group(); this.group.name = 'GameplayGrass'; this.group.visible = false;
        this.window = { value: new THREE.Vector4() }; this.localCamera = new THREE.Vector3();
        this.anchor = new THREE.Vector2(Infinity, Infinity); this.groundY = city.generatorConfig.ground.surfaceY;
        this.group.position.y = this.groundY; engine.scene.add(this.group);
        this.loading = this.mode === '3d';
        this.ready = this.loading ? this.load() : Promise.resolve();
        this.ready.catch(() => {});
    }

    async load() {
        try {
            const asset = await loadGrassRuntimeAsset({ renderer: this.engine.renderer });
            if (this.disposed) { asset.dispose(); return; }
            this.asset = asset;
            await this.city.world.readyPromise;
            if (this.disposed) return;
            this.coverage = createGrassCoverageMask(this.coverageInput);
            this.staticShadows = new GrassSceneShadows({ renderer: this.engine.renderer, groundY: this.groundY, resolution: 4096 });
            this.dynamicShadows = new GrassSceneShadows({ renderer: this.engine.renderer, groundY: this.groundY, resolution: 1024 });
            asset.shadowUniforms.grassCanopyShadowVisibility.value = this.dynamicShadows.target.texture;
            asset.shadowUniforms.grassCanopyShadowBounds.value = this.dynamicShadows.bounds;
            const farMaterial = cloneMaterialShaderContract(asset.canopy.materials.all);
            applyGrassRuntimeMask(farMaterial, this.coverage, this.window, this.staticShadows, true);
            this.farMaterial = farMaterial;
            asset.materials.forEach(material => applyGrassRuntimeMask(material, this.coverage, this.window, this.staticShadows));
            this.fields = createGrassDebugV2TransitionFields({ ...asset, fieldSize: WINDOW_METERS, origins: [[-HALF, -HALF]], continuous: true });
            this.fields.setEdgeStrips(true);
            this.fields.group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
            this.group.add(this.fields.group);
            this.selection = new GrassDebugV2TransitionSelection({ cells: this.fields.cells, distances: [.6, .8, 20, 30, 40],
                transitionFraction: .3, canopyTransitionFraction: .85, sideLeafDistance: 0 });
            const settings = this.selection.getSnapshot(); this.fields.configureBlend(settings.transitionBands, settings.bridgeEnabled);
            this.visibility = new Uint8Array(this.fields.cells.length);
            this.createDistantCanopy();
            this.group.visible = this.mode === '3d'; this.update(true);
        } catch (error) {
            this.error = error.message; this.group.visible = false;
            console.error('[Grass] ' + this.error);
            throw error;
        }
    }

    createDistantCanopy() {
        const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
        this.farGeometry = geometry; this.farMeshes = [];
        const half = this.coverage.size / 2, matrix = new THREE.Matrix4(), size = 32;
        for (let z = Math.floor(-half); z < half; z += size) for (let x = Math.floor(-half); x < half; x += size) {
            const cells = [];
            for (let dz = 0; dz < size && z + dz < half; dz++) for (let dx = 0; dx < size && x + dx < half; dx++)
                if (this.coverage.intersectsCell(x + dx + .5, z + dz + .5)) cells.push([x + dx + .5, z + dz + .5]);
            if (!cells.length) continue;
            const mesh = new THREE.InstancedMesh(geometry, this.farMaterial, cells.length); mesh.name = `GrassCanopy_${x}_${z}`;
            mesh.userData.grassRuntimeCanopy = true;
            cells.forEach(([cx, cz], i) => { matrix.makeTranslation(cx, this.asset.manifest.definition.height, cz); mesh.setMatrixAt(i, matrix); });
            mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
            this.group.add(mesh); this.farMeshes.push(mesh);
        }
    }

    /** @param {'texture'|'3d'} mode */
    setMode(mode) {
        if (!['texture', '3d'].includes(mode)) throw new Error('[Grass] Unknown rendering mode: ' + mode);
        this.mode = mode; this.group.visible = mode === '3d' && !!this.asset && !this.error;
        if (mode === '3d' && !this.asset && !this.loading) { this.loading = true; this.ready = this.load(); this.ready.catch(() => {}); }
        if (this.group.visible) this.update(true);
    }

    update(force = false) {
        if (!this.group.visible || this.disposed || !this.fields) return;
        const position = this.engine.camera.position, x = Math.floor(position.x / ANCHOR_STEP) * ANCHOR_STEP, z = Math.floor(position.z / ANCHOR_STEP) * ANCHOR_STEP;
        if (x !== this.anchor.x || z !== this.anchor.y) {
            this.anchor.set(x, z); this.fields.group.position.set(x, 0, z); this.window.value.set(x - HALF, z - HALF, x + HALF, z + HALF);
            this.fields.cells.forEach(cell => { this.visibility[cell.id] = Number(this.coverage.intersectsCell(cell.centerX + x, cell.centerZ + z)); });
            this.fields.setCellVisibility(this.visibility); force = true;
        }
        this.localCamera.set(position.x - x, position.y - this.groundY, position.z - z);
        const selected = this.selection.update(this.localCamera, performance.now(), { force });
        if (force || selected.changedCount || selected.renderChangedCount) this.fields.applyLevels(selected.levels, selected.sideLeaves, selected.renderMasks);
        this.updateShadows(force);
        this.updates++;
    }

    updateShadows(force) {
        const sun = this.city.sunRef.direction, key = sun.toArray().join(',');
        const enabled = this.engine.shadowSettings?.quality !== 'off' || this.engine.bakedLightingSettings?.shadows?.enabled === true;
        this.asset.settings.shadows.value = enabled ? 1 : 0;
        this.asset.settings.brightness.value = this.city.sunRef.intensity / (this.asset.manifest.leafColor[0] * 2 * Math.PI);
        if (!enabled) return;
        const now = performance.now();
        if (this.shadowSun !== key || !this.staticShadows.generations) {
            this.shadowSun = key; const half = this.coverage.size / 2;
            this.staticShadows.update(this.city.getStaticSunDepthCasterMeshes(), new THREE.Vector4(-half, -half, half, half), sun); force = true;
        }
        if (!force && now - (this.lastShadowTime ?? -Infinity) < 100) return;
        const sources = [], transforms = [];
        for (const participant of this.engine.getDynamicIlluminationObjects()) {
            if (!participant.cast || !participant.root.parent) continue;
            participant.root.updateWorldMatrix(true, true);
            transforms.push(participant.id, ...participant.root.matrixWorld.elements);
            participant.root.traverseVisible(mesh => { if (mesh.isMesh && mesh.castShadow) sources.push(mesh); });
        }
        const dynamicKey = transforms.join(',');
        if (force || dynamicKey !== this.shadowDynamic) {
            this.dynamicShadows.update(sources, this.window.value, sun); this.shadowDynamic = dynamicKey;
        }
        this.lastShadowTime = now;
    }

    getSnapshot() {
        return { mode: this.mode, ready: !!this.fields, error: this.error, active: this.group.visible, updates: this.updates,
            strategy: 'baked', appearance: this.asset?.manifest.appearance ?? null, field: this.fields?.getSnapshot() ?? null,
            selection: this.selection?.getSnapshot() ?? null, anchor: this.anchor.toArray(), window: this.window.value.toArray(),
            farBatches: this.farMeshes?.length ?? 0, packageBytes: this.asset?.manifest.bytes ?? 0,
            shadows: { static: this.staticShadows?.generations ?? 0, dynamic: this.dynamicShadows?.generations ?? 0 } };
    }

    dispose() {
        this.disposed = true; this.group.removeFromParent(); this.fields?.dispose();
        this.farMeshes?.forEach(mesh => mesh.dispose()); this.farGeometry?.dispose(); this.farMaterial?.dispose();
        this.coverage?.dispose(); this.asset?.dispose(); this.group.clear();
        this.staticShadows?.dispose(); this.dynamicShadows?.dispose();
    }
}
