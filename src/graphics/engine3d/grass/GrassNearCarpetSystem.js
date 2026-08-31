// Renders a deterministic, cohesive, exact-clipped near grass carpet.
// @ts-check

import * as THREE from 'three';
import {
    createGrassAutoLodFieldUnitHandoff,
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    resolveGrassAutoLodUnitVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';
import { makeRng } from './GrassRng.js';
import {
    createGrassNearCarpetCellSet,
    diffGrassNearCarpetCellSets,
    getGrassNearCarpetBladesPerPatch,
    getGrassNearCarpetChunkKey,
    getGrassNearCarpetCoverageIdentity,
    getGrassNearCarpetRootsPerPatch,
    GRASS_NEAR_CARPET_MODE,
    sanitizeGrassNearCarpetConfig
} from './GrassNearCarpetLayout.js';

const DEG_TO_RAD = Math.PI / 180;

function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, Number(value) || 1)));
}

function writeTransform(array, offset, descriptor) {
    const cosine = Math.cos(descriptor.yaw);
    const sine = Math.sin(descriptor.yaw);
    const width = descriptor.widthMeters;
    array[offset] = cosine * width;
    array[offset + 1] = 0;
    array[offset + 2] = -sine * width;
    array[offset + 3] = 0;
    array[offset + 4] = descriptor.leanX;
    array[offset + 5] = descriptor.visibleLengthMeters;
    array[offset + 6] = descriptor.leanZ;
    array[offset + 7] = 0;
    array[offset + 8] = sine * width;
    array[offset + 9] = 0;
    array[offset + 10] = cosine * width;
    array[offset + 11] = 0;
    array[offset + 12] = descriptor.x;
    array[offset + 13] = descriptor.y;
    array[offset + 14] = descriptor.z;
    array[offset + 15] = 1;
}

function sampleTerrainHeight(terrainMesh, terrainGrid, x, z) {
    const position = terrainMesh?.geometry?.attributes?.position;
    if (!position?.isBufferAttribute) return 0;
    const nx = Math.max(1, Number(terrainGrid?.nx) || 1);
    const nz = Math.max(1, Number(terrainGrid?.nz) || 1);
    const minX = Number(terrainGrid?.minX) || 0;
    const minZ = Number(terrainGrid?.minZ) || 0;
    const dx = Math.max(1e-6, Number(terrainGrid?.dx) || 1);
    const dz = Math.max(1e-6, Number(terrainGrid?.dz) || 1);
    const gx = (x - minX) / dx;
    const gz = (z - minZ) / dz;
    const ix0 = Math.max(0, Math.min(nx - 1, Math.floor(gx)));
    const iz0 = Math.max(0, Math.min(nz - 1, Math.floor(gz)));
    const ix1 = Math.min(nx, ix0 + 1);
    const iz1 = Math.min(nz, iz0 + 1);
    const fx = Math.max(0, Math.min(1, gx - ix0));
    const fz = Math.max(0, Math.min(1, gz - iz0));
    const stride = nx + 1;
    const y00 = position.getY(iz0 * stride + ix0);
    const y10 = position.getY(iz0 * stride + ix1);
    const y01 = position.getY(iz1 * stride + ix0);
    const y11 = position.getY(iz1 * stride + ix1);
    const y0 = y00 + (y10 - y00) * fx;
    const y1 = y01 + (y11 - y01) * fx;
    return y0 + (y1 - y0) * fz;
}

function createRootGeometry(config) {
    const fibers = config.fibersPerRoot;
    const positions = new Float32Array(fibers * 9);
    const colors = new Float32Array(fibers * 9);
    const indices = new Uint16Array(fibers * 3);
    const baseColor = new THREE.Color(config.baseColor);
    const tipColor = new THREE.Color(config.tipColor);

    for (let index = 0; index < fibers; index++) {
        const angle = index * Math.PI / fibers;
        const tangentX = Math.cos(angle) * 0.5;
        const tangentZ = Math.sin(angle) * 0.5;
        const positionOffset = index * 9;
        positions.set([
            -tangentX, 0, -tangentZ,
            tangentX, 0, tangentZ,
            0, 1, 0
        ], positionOffset);
        colors.set([
            baseColor.r, baseColor.g, baseColor.b,
            baseColor.r, baseColor.g, baseColor.b,
            tipColor.r, tipColor.g, tipColor.b
        ], positionOffset);
        indices.set([index * 3, index * 3 + 1, index * 3 + 2], index * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = 'GrassNearCarpetRootCluster_' + fibers;
    geometry.userData = {
        schema: 'near-grass-carpet-v2',
        fibersPerRoot: fibers,
        trianglesPerRoot: fibers
    };
    return geometry;
}

function createMaterial(config) {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: config.roughness,
        metalness: 0,
        emissive: 0x000000,
        emissiveIntensity: 0,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        alphaTest: 0,
        depthWrite: true,
        depthTest: true
    });
    material.name = 'GrassNearCarpetV2Material';
    material.userData = {
        resolvedMaterialId: config.materialId,
        schema: 'near-grass-carpet-v2',
        appearanceSource: 'ai358_shared_catalog',
        normalPolicy: 'shared_geometry_vertex_normals',
        calibrationPath: 'none'
    };
    return material;
}

function createRootDescriptor(root, config, terrainMesh, terrainGrid) {
    const random = makeRng(config.seed + '|near-carpet-root:' + root.key);
    const distributionT = Math.pow(random(), config.heightDistributionExponent);
    const tipRange = config.bladeTipElevationMeters;
    const absoluteTipElevationMeters = tipRange.min + (tipRange.max - tipRange.min) * distributionT;
    const visibleLengthMeters = Math.max(0.001, absoluteTipElevationMeters - config.structuralBaseHeightMeters);
    const requestedWidth = config.bladeWidthMeters.min
        + (config.bladeWidthMeters.max - config.bladeWidthMeters.min) * random();
    const boundaryDistance = Number(root.boundaryDistanceMeters);
    const safeWidth = Number.isFinite(boundaryDistance)
        ? Math.min(requestedWidth, Math.max(0.0008, 2 * Math.max(0.0004, boundaryDistance - config.boundarySafetyMeters)))
        : requestedWidth;
    const bendDegrees = config.bendDegrees.min
        + (config.bendDegrees.max - config.bendDegrees.min) * random();
    const inclinationDegrees = config.inclinationDegrees.min
        + (config.inclinationDegrees.max - config.inclinationDegrees.min) * random();
    const desiredLean = Math.sin((bendDegrees + inclinationDegrees) * DEG_TO_RAD) * visibleLengthMeters * 0.55;
    const safeLean = Number.isFinite(boundaryDistance)
        ? Math.min(desiredLean, Math.max(0, boundaryDistance - safeWidth * 0.5 - config.boundarySafetyMeters))
        : desiredLean;
    const leanYaw = random() * Math.PI * 2;
    const brightness = 1 + (random() * 2 - 1) * config.colorBrightnessVariation;
    return Object.freeze({
        ...root,
        y: sampleTerrainHeight(terrainMesh, terrainGrid, root.x, root.z) + config.structuralBaseHeightMeters,
        yaw: random() * Math.PI * 2,
        widthMeters: safeWidth,
        requestedWidthMeters: requestedWidth,
        absoluteTipElevationMeters,
        visibleLengthMeters,
        leanMeters: safeLean,
        leanX: Math.cos(leanYaw) * safeLean,
        leanZ: Math.sin(leanYaw) * safeLean,
        brightness
    });
}

function getTerrainBounds(terrainGrid) {
    return {
        minX: Number(terrainGrid.minX),
        maxX: Number(terrainGrid.minX) + Number(terrainGrid.widthTiles) * Number(terrainGrid.tileSize),
        minZ: Number(terrainGrid.minZ),
        maxZ: Number(terrainGrid.minZ) + Number(terrainGrid.depthTiles) * Number(terrainGrid.tileSize)
    };
}

export class GrassNearCarpetSystem {
    constructor({
        parent,
        terrainMesh,
        terrainGrid,
        getExclusionRects,
        getCoverageDefinition,
        getCoverageConfig,
        fieldHandoffSeed = 'cohesive-field-v2'
    } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassNearCarpetSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassNearCarpetSystem';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._getExclusionRects = typeof getExclusionRects === 'function' ? getExclusionRects : (() => []);
        this._getCoverageDefinition = typeof getCoverageDefinition === 'function' ? getCoverageDefinition : (() => null);
        this._getCoverageConfig = typeof getCoverageConfig === 'function' ? getCoverageConfig : (() => null);
        this._coverageDefinition = null;
        this._coverageConfig = null;
        this._coverageInputKey = '';
        this._config = sanitizeGrassNearCarpetConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._evidenceMode = null;
        this._geometry = null;
        this._material = null;
        this._geometryKey = '';
        this._meshes = new Map();
        this._descriptors = new Map();
        this._layoutCache = new Map();
        this._coverageSampleCache = new Map();
        this._cells = new Map();
        this._centerCellKey = '';
        this._layoutKey = '';
        this._visibilityKey = '';
        this._layoutInvalidated = false;
        this._configKey = '';
        this._fieldHandoffSeed = String(fieldHandoffSeed).trim() || 'cohesive-field-v2';
        this._stats = {
            layoutRevision: 0,
            cameraCellMoves: 0,
            cacheInvalidations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            stationaryFrames: 0,
            totalBufferUpdates: 0,
            lastBufferUpdates: 0,
            lastEnteringCells: 0,
            lastLeavingCells: 0,
            retainedCells: 0,
            transitionPatches: 0,
            effectiveRadiusMeters: 0,
            coverageMode: 'terrain_bounds',
            boundarySignature: '',
            placementSignature: '',
            candidateBins: 0,
            eligibleBins: 0,
            representedBins: 0,
            unrepresentedEligibleBins: 0,
            acceptedRoots: 0,
            rejectedRoots: 0,
            clippedRoots: 0,
            rejectedByKind: {},
            partialCells: 0,
            boundaryRootCandidates: 0,
            boundaryRoots: 0,
            boundaryRootRejected: 0,
            exactPostcheckFailures: 0,
            ineligibleRoots: 0,
            sidewalkIntrusions: 0,
            treeIntrusions: 0,
            eligibleAreaSquareMeters: 0,
            representedAreaSquareMeters: 0,
            coverageSampleCacheHits: 0,
            coverageSampleCacheMisses: 0
        };
    }

    attach(parent) {
        if (!parent?.isObject3D) throw new Error('[GrassNearCarpetSystem] A THREE.Object3D parent is required.');
        if (this.group.parent !== parent) parent.add(this.group);
    }

    setTerrain({ terrainMesh, terrainGrid } = {}) {
        this._terrainMesh = terrainMesh ?? this._terrainMesh;
        this._terrainGrid = terrainGrid ?? this._terrainGrid;
        this._invalidatePlacementCaches();
        this._invalidateLayout();
    }

    setCoverageInput({ definition = null, config = null } = {}) {
        const key = getGrassNearCarpetCoverageIdentity(definition) + '|' + JSON.stringify(config ?? null);
        if (key === this._coverageInputKey && definition === this._coverageDefinition) return;
        this._coverageDefinition = definition;
        this._coverageConfig = config;
        this._coverageInputKey = key;
        this._invalidatePlacementCaches();
        this._invalidateLayout();
    }

    setConfig(value) {
        const next = sanitizeGrassNearCarpetConfig(value);
        const configKey = JSON.stringify(next);
        const geometryKey = [
            next.seed,
            next.fibersPerRoot,
            next.baseColor,
            next.tipColor,
            next.materialId,
            next.roughness
        ].join('|');
        const previousGeometryKey = this._geometryKey;
        const configChanged = configKey !== this._configKey;
        this._config = next;
        this._geometryKey = geometryKey;
        if (!configChanged) return;
        this._invalidatePlacementCaches();
        if (previousGeometryKey !== geometryKey) this._rebuildRenderResources();
        else {
            if (this._material) {
                this._material.roughness = next.roughness;
                this._material.userData.resolvedMaterialId = next.materialId;
            }
        }
        this._configKey = configKey;
        this._invalidateLayout();
    }

    setAutoLodConfig(value) {
        const next = sanitizeGrassAutoLodConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._autoLod)) return;
        this._autoLod = next;
        this._invalidateLayout();
    }

    setFieldHandoffSeed(value) {
        const next = String(value ?? '').trim();
        if (!next) throw new Error('[GrassNearCarpetSystem] A cohesive-field handoff seed is required.');
        if (next === this._fieldHandoffSeed) return;
        this._fieldHandoffSeed = next;
        this.resetLodHysteresis();
    }

    setEvidenceMode(mode = null) {
        const next = mode === 'texture_only' || mode === 'near_mesh' || mode === 'close' ? mode : null;
        if (next === this._evidenceMode) return;
        this._evidenceMode = next;
        if (next === 'texture_only') this._clearLayout();
        this._invalidateLayout();
    }

    resetLodHysteresis() {
        this._clearLayout();
        this._invalidateLayout();
    }

    update({ camera, viewAngleDeg = 0 } = {}) {
        const config = this._config;
        const forcedEvidence = this._evidenceMode === 'near_mesh' || this._evidenceMode === 'close';
        const effectiveRadiusMeters = forcedEvidence
            ? config.radiusMeters
            : getGrassAutoLodCandidateRadius(this._autoLod, 'near', viewAngleDeg);
        const active = config.enabled
            && config.mode !== GRASS_NEAR_CARPET_MODE.DISABLED
            && this._evidenceMode !== 'texture_only'
            && effectiveRadiusMeters > 0;
        const terrainGrid = this._terrainGrid;
        if (!active || !camera?.isCamera || !terrainGrid || !this._geometry || !this._material) {
            this.group.visible = false;
            this._stats.lastBufferUpdates = 0;
            this._stats.effectiveRadiusMeters = 0;
            return;
        }
        this.group.visible = true;

        const coverageDefinition = this._coverageDefinition ?? this._getCoverageDefinition();
        const coverageConfig = this._coverageConfig ?? this._getCoverageConfig();
        const exclusionRects = this._getExclusionRects();
        const terrainBounds = getTerrainBounds(terrainGrid);
        const boundarySignature = String(coverageDefinition?.boundarySignature ?? '');
        const coverageIdentity = getGrassNearCarpetCoverageIdentity(coverageDefinition);
        const angleBucket = forcedEvidence ? 'forced' : String(Math.round(Number(viewAngleDeg) * 2) / 2);
        const layoutKey = [
            this._geometryKey,
            this._configKey,
            effectiveRadiusMeters.toFixed(3),
            angleBucket,
            JSON.stringify(this._autoLod),
            coverageIdentity,
            JSON.stringify(coverageConfig ?? null),
            boundarySignature ? 'exact' : JSON.stringify(exclusionRects),
            JSON.stringify(terrainBounds),
            'evidence:' + (this._evidenceMode ?? 'none')
        ].join('|');
        const centerCellX = Math.floor(camera.position.x / config.patchSizeMeters);
        const centerCellZ = Math.floor(camera.position.z / config.patchSizeMeters);
        const centerCellKey = centerCellX + ',' + centerCellZ;
        const visibilityKey = [
            camera.position.x.toFixed(6),
            camera.position.z.toFixed(6),
            Number(viewAngleDeg).toFixed(4),
            this._fieldHandoffSeed
        ].join('|');
        if (
            !this._layoutInvalidated
            && centerCellKey === this._centerCellKey
            && layoutKey === this._layoutKey
            && visibilityKey === this._visibilityKey
        ) {
            this._stats.stationaryFrames++;
            this._stats.lastBufferUpdates = 0;
            return;
        }
        if (this._cells.size && (this._layoutInvalidated || (this._layoutKey && layoutKey !== this._layoutKey))) {
            this._clearLayout();
            this._stats.cacheInvalidations++;
        }

        const candidateConfig = sanitizeGrassNearCarpetConfig({
            ...config,
            radiusMeters: effectiveRadiusMeters + config.patchSizeMeters / Math.SQRT2
        });
        const candidateCacheKey = centerCellKey + '|' + layoutKey;
        let candidates = this._layoutCache.get(candidateCacheKey) ?? null;
        if (candidates) {
            this._stats.cacheHits++;
        } else {
            this._stats.cacheMisses++;
            candidates = createGrassNearCarpetCellSet({
                cameraX: (centerCellX + 0.5) * config.patchSizeMeters,
                cameraZ: (centerCellZ + 0.5) * config.patchSizeMeters,
                config: candidateConfig,
                terrainBounds,
                coverageDefinition,
                coverageConfig,
                exclusionRects,
                coverageSampleCache: this._coverageSampleCache
            });
            this._layoutCache.set(candidateCacheKey, candidates);
            if (this._layoutCache.size > 9) this._layoutCache.delete(this._layoutCache.keys().next().value);
        }
        const visibleCells = new Map();
        let transitionPatches = 0;
        for (const [key, cell] of candidates.cells) {
            const handoff = createGrassAutoLodFieldUnitHandoff({
                unitKey: key,
                fieldSeed: this._fieldHandoffSeed,
                boundarySignature: candidates.boundarySignature,
                cameraX: camera.position.x,
                cameraZ: camera.position.z
            });
            const evaluation = evaluateGrassAutoLod({
                distanceMeters: handoff.distanceMeters,
                viewAngleDeg,
                config: this._autoLod
            });
            if (evaluation.weights.near > 0 && evaluation.weights.near < 1) transitionPatches++;
            const insideSelectionRadius = handoff.distanceMeters <= effectiveRadiusMeters;
            const visible = insideSelectionRadius && (
                forcedEvidence || resolveGrassAutoLodUnitVisibility({
                    evaluation,
                    tier: 'near',
                    unitKey: handoff.identity,
                    previousVisible: this._cells.has(key),
                    config: this._autoLod
                })
            );
            if (visible) visibleCells.set(key, cell);
        }

        const delta = diffGrassNearCarpetCellSets(this._cells, visibleCells);
        const changedChunks = new Set();
        for (const cell of delta.leaving) {
            changedChunks.add(getGrassNearCarpetChunkKey(cell, config));
            this._descriptors.delete(cell.key);
        }
        for (const cell of delta.entering) {
            changedChunks.add(getGrassNearCarpetChunkKey(cell, config));
            const descriptors = cell.roots.map((root) => createRootDescriptor(root, config, this._terrainMesh, terrainGrid));
            this._descriptors.set(cell.key, Object.freeze(descriptors));
        }

        let bufferUpdates = 0;
        for (const chunkKey of changedChunks) {
            const descriptors = [];
            for (const [cellKey, roots] of this._descriptors) {
                const cell = visibleCells.get(cellKey) ?? this._cells.get(cellKey);
                if (cell && getGrassNearCarpetChunkKey(cell, config) === chunkKey) descriptors.push(...roots);
            }
            this._writeChunk(chunkKey, descriptors);
            bufferUpdates++;
        }

        this._cells = visibleCells;
        if (this._centerCellKey && centerCellKey !== this._centerCellKey) this._stats.cameraCellMoves++;
        this._centerCellKey = centerCellKey;
        this._layoutKey = layoutKey;
        this._visibilityKey = visibilityKey;
        this._layoutInvalidated = false;
        this._stats.layoutRevision++;
        this._stats.lastBufferUpdates = bufferUpdates;
        this._stats.totalBufferUpdates += bufferUpdates;
        this._stats.lastEnteringCells = delta.entering.length;
        this._stats.lastLeavingCells = delta.leaving.length;
        this._stats.retainedCells = delta.retained;
        this._stats.transitionPatches = transitionPatches;
        this._stats.effectiveRadiusMeters = effectiveRadiusMeters;
        this._stats.coverageMode = candidates.coverageMode;
        this._stats.boundarySignature = candidates.boundarySignature;
        this._stats.placementSignature = candidates.placementSignature;
        this._stats.cacheIdentity = candidates.cacheIdentity;
        Object.assign(this._stats, candidates.diagnostics);
    }

    getStats() {
        const enabled = this._config.enabled
            && this._config.mode !== GRASS_NEAR_CARPET_MODE.DISABLED
            && this._evidenceMode !== 'texture_only';
        let rootInstances = 0;
        let observedTipMin = Infinity;
        let observedTipMax = -Infinity;
        let observedVisibleMin = Infinity;
        let observedVisibleMax = -Infinity;
        let observedWidthMin = Infinity;
        let observedWidthMax = -Infinity;
        for (const roots of this._descriptors.values()) {
            rootInstances += roots.length;
            for (const root of roots) {
                observedTipMin = Math.min(observedTipMin, root.absoluteTipElevationMeters);
                observedTipMax = Math.max(observedTipMax, root.absoluteTipElevationMeters);
                observedVisibleMin = Math.min(observedVisibleMin, root.visibleLengthMeters);
                observedVisibleMax = Math.max(observedVisibleMax, root.visibleLengthMeters);
                observedWidthMin = Math.min(observedWidthMin, root.widthMeters);
                observedWidthMax = Math.max(observedWidthMax, root.widthMeters);
            }
        }
        if (!enabled) rootInstances = 0;
        const fiberInstances = rootInstances * this._config.fibersPerRoot;
        let drawCalls = 0;
        if (enabled) {
            for (const mesh of this._meshes.values()) if (mesh.visible && mesh.count > 0) drawCalls++;
        }
        const rejectedByKind = this._stats.rejectedByKind ?? {};
        const treeRejectedRoots = Object.entries(rejectedByKind)
            .filter(([kind]) => /tree/i.test(kind))
            .reduce((sum, [, count]) => sum + Number(count || 0), 0);
        const sidewalkRejectedRoots = Object.entries(rejectedByKind)
            .filter(([kind]) => /sidewalk|road|path/i.test(kind))
            .reduce((sum, [, count]) => sum + Number(count || 0), 0);
        return {
            schema: 'near-grass-carpet-v2',
            enabled,
            evidenceMode: this._evidenceMode,
            mode: this._config.mode,
            fieldHandoffSeed: this._fieldHandoffSeed,
            coverageMode: this._stats.coverageMode,
            boundarySignature: this._stats.boundarySignature,
            placementSignature: this._stats.placementSignature,
            patchSizeMeters: this._config.patchSizeMeters,
            ownershipCellSizeMeters: this._config.patchSizeMeters,
            bladesPerSquareMeter: this._config.bladesPerSquareMeter,
            rootBinsPerSquareMeter: this._config.bladesPerSquareMeter,
            fibersPerRoot: this._config.fibersPerRoot,
            radiusMeters: this._config.radiusMeters,
            patchInstances: enabled ? this._descriptors.size : 0,
            cellInstances: enabled ? this._descriptors.size : 0,
            rootsPerPatch: getGrassNearCarpetRootsPerPatch(this._config),
            bladesPerPatch: getGrassNearCarpetBladesPerPatch(this._config),
            rootInstances,
            instanceCount: rootInstances,
            fiberInstances,
            bladeInstances: fiberInstances,
            triangles: fiberInstances,
            drawCalls,
            chunks: drawCalls,
            materialPaths: drawCalls > 0 ? 1 : 0,
            materialId: this._config.materialId,
            appearanceSource: 'ai358_shared_catalog',
            structuralBaseHeightMeters: this._config.structuralBaseHeightMeters,
            bladeTipElevationMeters: { ...this._config.bladeTipElevationMeters },
            visibleBladeLengthMeters: { ...this._config.bladeHeightMeters },
            observedTipElevationMeters: {
                min: Number.isFinite(observedTipMin) ? observedTipMin : null,
                max: Number.isFinite(observedTipMax) ? observedTipMax : null
            },
            observedVisibleLengthMeters: {
                min: Number.isFinite(observedVisibleMin) ? observedVisibleMin : null,
                max: Number.isFinite(observedVisibleMax) ? observedVisibleMax : null
            },
            observedBladeWidthMeters: {
                min: Number.isFinite(observedWidthMin) ? observedWidthMin : null,
                max: Number.isFinite(observedWidthMax) ? observedWidthMax : null
            },
            rootClearanceMeters: Number(this._coverageConfig?.rootClearanceMeters ?? this._getCoverageConfig()?.rootClearanceMeters ?? 0),
            boundaryRootSpacingMeters: this._config.boundaryRootSpacingMeters,
            rejectedByKind: { ...rejectedByKind },
            sidewalkRejectedRoots,
            treeRejectedRoots,
            castShadow: false,
            transparent: false,
            alphaTest: 0,
            depthWrite: true,
            emissive: false,
            frustumCulled: true,
            stationaryUploadsZero: this._stats.stationaryFrames === 0 || this._stats.lastBufferUpdates === 0,
            ...this._stats,
            coverageSampleCacheEntries: this._coverageSampleCache.size
        };
    }

    dispose() {
        for (const mesh of this._meshes.values()) mesh.removeFromParent();
        this._meshes.clear();
        this._layoutCache.clear();
        this._coverageSampleCache.clear();
        this._geometry?.dispose?.();
        this._material?.dispose?.();
        this._geometry = null;
        this._material = null;
        this.group.removeFromParent();
    }

    _invalidateLayout() {
        this._layoutInvalidated = true;
    }

    _invalidatePlacementCaches() {
        const hadCachedState = this._layoutCache.size > 0
            || this._coverageSampleCache.size > 0
            || this._cells.size > 0;
        this._layoutCache.clear();
        this._coverageSampleCache.clear();
        this._clearLayout();
        if (hadCachedState) this._stats.cacheInvalidations++;
    }

    _clearLayout() {
        for (const mesh of this._meshes.values()) {
            mesh.count = 0;
            mesh.visible = false;
        }
        this._descriptors.clear();
        this._cells.clear();
        this._centerCellKey = '';
        this._visibilityKey = '';
    }

    _rebuildRenderResources() {
        for (const mesh of this._meshes.values()) mesh.removeFromParent();
        this._meshes.clear();
        this._geometry?.dispose?.();
        this._material?.dispose?.();
        this._geometry = createRootGeometry(this._config);
        this._material = createMaterial(this._config);
        this._clearLayout();
    }

    _ensureMesh(chunkKey, count) {
        const existing = this._meshes.get(chunkKey);
        if (existing?.isInstancedMesh && existing.instanceMatrix.count >= count) return existing;
        existing?.removeFromParent?.();
        const capacity = nextPowerOfTwo(count);
        const mesh = new THREE.InstancedMesh(this._geometry, this._material, capacity);
        mesh.name = 'GrassNearCarpetChunk_' + chunkKey;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = 4;
        mesh.userData = {
            schema: 'near-grass-carpet-v2',
            chunkKey,
            sharedGeometry: true,
            sharedMaterial: true
        };
        this.group.add(mesh);
        this._meshes.set(chunkKey, mesh);
        return mesh;
    }

    _writeChunk(chunkKey, descriptors) {
        const existing = this._meshes.get(chunkKey);
        if (!descriptors.length) {
            if (existing) {
                existing.count = 0;
                existing.visible = false;
            }
            return;
        }
        descriptors.sort((a, b) => a.key.localeCompare(b.key));
        const mesh = this._ensureMesh(chunkKey, descriptors.length);
        const matrices = mesh.instanceMatrix.array;
        const colors = mesh.instanceColor.array;
        for (let index = 0; index < descriptors.length; index++) {
            const descriptor = descriptors[index];
            writeTransform(matrices, index * 16, descriptor);
            colors[index * 3] = descriptor.brightness;
            colors[index * 3 + 1] = descriptor.brightness;
            colors[index * 3 + 2] = descriptor.brightness;
        }
        mesh.count = descriptors.length;
        mesh.visible = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
    }
}
