// Own gameplay's immutable grass patches, coverage and cached external shadows.
// @ts-check
import * as THREE from 'three';
import { GRASS_QUALITY_PRESETS } from '../../../../app/grass/GrassSettings.js';
import { loadGrassRuntimeAsset } from './GrassRuntimeAsset.js';
import { createGrassPatchRenderer } from './GrassPatchRenderer.js';
import { createGrassCoverageMask } from './GrassCoverageMask.js';
import { applyGrassRuntimeShadows } from './GrassRuntimeMaterials.js';
import { GrassSceneShadows } from './GrassSceneShadows.js';

const WINDOW_METERS = 128, HALF = WINDOW_METERS / 2, ANCHOR_STEP = 16;

/** @param {{engine:object,city:object,coverage:object}} options */
export class GameplayGrassRenderer {
    constructor({ engine, city, coverage }) {
        this.engine = engine; this.city = city; this.coverageInput = coverage;
        this.mode = engine.grassSettings.mode; this.disposed = false; this.error = null; this.updates = 0;
        this.group = new THREE.Group(); this.group.name = 'GameplayGrass'; this.group.visible = false;
        this.group.userData.excludeFromAmbientOcclusion = true;
        this.window = { value: new THREE.Vector4() };
        this.anchor = new THREE.Vector2(Infinity, Infinity); this.groundY = city.generatorConfig.ground.surfaceY;
        engine.scene.add(this.group);
        this.prepared = false; this.loading = this.mode !== 'flat';
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
            this.patches = createGrassPatchRenderer({ asset, coverage: this.coverage, bounds: this.coverage.bounds, groundY: this.groundY,
                distances: GRASS_QUALITY_PRESETS[this.mode].distances, maxDistance: 42, terminalTransition: 'shorten' });
            this.patches.material.materials.forEach(material => applyGrassRuntimeShadows(material, this.staticShadows));
            this.group.add(this.patches.group);
            await this.patches.prewarm(this.engine.renderer, this.engine.scene, this.engine.camera);
            if (this.disposed) return;
            this.prepared = true; this.setMode(this.mode);
        } catch (error) {
            this.error = error.message; this.group.visible = false;
            console.error('[Grass] ' + this.error);
            throw error;
        }
    }

    /** @param {'flat'|'low'|'medium'|'high'|'ultra'} mode */
    setMode(mode) {
        if (!Object.hasOwn(GRASS_QUALITY_PRESETS, mode)) throw new Error('[Grass] Unknown rendering mode: ' + mode);
        const preset = GRASS_QUALITY_PRESETS[mode];
        this.mode = mode; this.group.visible = mode !== 'flat' && this.prepared && !this.error;
        if (this.patches) { this.patches.setDistances(preset.distances); this.patches.setMode(preset.fieldMode); }
        if (mode !== 'flat' && !this.asset && !this.loading) { this.loading = true; this.ready = this.load(); this.ready.catch(() => {}); }
        if (this.group.visible) this.update(true);
    }

    update(force = false) {
        if (!this.group.visible || this.disposed || !this.patches) return;
        const position = this.engine.camera.position, x = Math.floor(position.x / ANCHOR_STEP) * ANCHOR_STEP, z = Math.floor(position.z / ANCHOR_STEP) * ANCHOR_STEP;
        if (x !== this.anchor.x || z !== this.anchor.y) {
            this.anchor.set(x, z); this.window.value.set(x - HALF, z - HALF, x + HALF, z + HALF); force = true;
        }
        this.patches.update(this.engine.camera);
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
        return { mode: this.mode, ready: this.prepared, error: this.error, active: this.group.visible, updates: this.updates,
            strategy: 'patches', appearance: this.asset?.manifest.appearance ?? null, field: this.patches?.getSnapshot() ?? null,
            anchor: this.anchor.toArray(), window: this.window.value.toArray(),
            farBatches: this.patches?.surfaces.length ?? 0, packageBytes: this.asset?.manifest.bytes ?? 0,
            shadows: { static: this.staticShadows?.generations ?? 0, dynamic: this.dynamicShadows?.generations ?? 0 } };
    }

    dispose() {
        this.disposed = true; this.group.removeFromParent(); this.patches?.dispose();
        this.coverage?.dispose(); this.asset?.dispose(); this.group.clear();
        this.staticShadows?.dispose(); this.dynamicShadows?.dispose();
    }
}
