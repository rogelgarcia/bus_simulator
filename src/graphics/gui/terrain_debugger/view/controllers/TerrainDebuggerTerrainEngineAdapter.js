// src/graphics/gui/terrain_debugger/view/controllers/TerrainDebuggerTerrainEngineAdapter.js
// Terrain engine configuration and mask update adapter for TerrainDebuggerView.
// @ts-check

function assertView(view) {
    if (!view || typeof view !== 'object') {
        throw new Error('[TerrainDebuggerTerrainEngineAdapter] Missing TerrainDebuggerView instance');
    }
    return view;
}

function assertCreateTerrainEngine(fn) {
    if (typeof fn !== 'function') {
        throw new Error('[TerrainDebuggerTerrainEngineAdapter] Missing createTerrainEngine factory');
    }
    return fn;
}

export class TerrainDebuggerTerrainEngineAdapter {
    constructor({ view, createTerrainEngineFactory } = {}) {
        this._view = assertView(view);
        this._createTerrainEngine = assertCreateTerrainEngine(createTerrainEngineFactory);
    }

    ensureEngineCreated() {
        const view = this._view;
        if (view._terrainEngine || !view._terrainGrid) return;

        const bounds = view._getTerrainBoundsXZ();
        if (!bounds) return;

        view._terrainEngine = this._createTerrainEngine({
            seed: 'terrain-debugger',
            bounds,
            patch: {
                sizeMeters: 72,
                originX: 0,
                originZ: 0,
                layout: 'voronoi',
                voronoiJitter: 0.85,
                warpScale: 0.02,
                warpAmplitudeMeters: 36
            },
            biomes: {
                mode: 'patch_grid',
                defaultBiomeId: 'land',
                weights: { stone: 0.25, grass: 0.35, land: 0.40 }
            },
            humidity: {
                mode: 'source_map',
                noiseScale: 0.01,
                octaves: 4,
                gain: 0.5,
                lacunarity: 2.0,
                bias: 0.0,
                amplitude: 1.0
            },
            transition: {
                cameraBlendRadiusMeters: 140,
                cameraBlendFeatherMeters: 24,
                boundaryBandMeters: 10
            }
        });
        view._terrainEngineMaskDirty = true;
    }

    applyUiConfig(engineState) {
        const view = this._view;
        if (!view._terrainEngine) return;
        view._applyTerrainEngineUiConfig(engineState);
    }

    updatePerFrame({ nowMs, camera } = {}) {
        const view = this._view;
        if (!view._terrainEngine || !camera?.position) return;

        view._terrainEngine.setViewOrigin({
            x: camera.position.x,
            z: camera.position.z
        });
        view._updateTerrainEngineMasks({ nowMs });
        view._updateTerrainHoverSample({ nowMs });
    }

    dispose() {
        const view = this._view;
        view._terrainEngine?.dispose?.();
        view._terrainEngine = null;
        view._terrainEngineMaskTex?.dispose?.();
        view._terrainEngineMaskTex = null;
        view._terrainEngineMaskKey = '';
        view._terrainEngineMaskDirty = true;
        view._terrainEngineMaskViewKey = '';
        view._terrainEngineLastExport = null;
        view._terrainEngineCompareExport = null;
        view._terrainEngineCompareKey = '';
    }
}
