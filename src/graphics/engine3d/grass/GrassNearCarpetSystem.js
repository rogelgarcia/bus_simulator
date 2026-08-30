// Renders deterministic one-metre grass carpet patches with cell-stable GPU instance buffers.
// @ts-check

import * as THREE from 'three';
import {
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodMaskedVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';
import { makeRng } from './GrassRng.js';
import {
    createGrassNearCarpetCellSet,
    diffGrassNearCarpetCellSets,
    getGrassNearCarpetBladesPerPatch,
    getGrassNearCarpetChunkKey,
    GRASS_NEAR_CARPET_MODE,
    sanitizeGrassNearCarpetConfig
} from './GrassNearCarpetLayout.js';

function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, Number(value) || 1)));
}

function writeTransform(array, offset, descriptor) {
    const yaw = descriptor.yaw;
    const scale = descriptor.scale;
    const cosine = Math.cos(yaw) * scale;
    const sine = Math.sin(yaw) * scale;
    array[offset] = cosine;
    array[offset + 1] = 0;
    array[offset + 2] = -sine;
    array[offset + 3] = 0;
    array[offset + 4] = 0;
    array[offset + 5] = scale;
    array[offset + 6] = 0;
    array[offset + 7] = 0;
    array[offset + 8] = sine;
    array[offset + 9] = 0;
    array[offset + 10] = cosine;
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
    return (y00 + (y10 - y00) * fx) + ((y01 + (y11 - y01) * fx) - (y00 + (y10 - y00) * fx)) * fz;
}

function createPatchGeometry(config) {
    const bladeCount = getGrassNearCarpetBladesPerPatch(config);
    const positions = new Float32Array(bladeCount * 9);
    const colors = new Float32Array(bladeCount * 9);
    const indices = new Uint32Array(bladeCount * 3);
    const baseColor = new THREE.Color(config.baseColor);
    const tipColor = new THREE.Color(config.tipColor);
    const columns = Math.ceil(Math.sqrt(bladeCount));
    const rows = Math.ceil(bladeCount / columns);
    const cellWidth = config.patchSizeMeters / columns;
    const cellDepth = config.patchSizeMeters / rows;
    const random = makeRng(`${config.seed}|near-carpet-geometry|${bladeCount}`);

    for (let index = 0; index < bladeCount; index++) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const rootX = -config.patchSizeMeters * 0.5 + (column + 0.5 + (random() - 0.5) * 0.58) * cellWidth;
        const rootZ = -config.patchSizeMeters * 0.5 + (row + 0.5 + (random() - 0.5) * 0.58) * cellDepth;
        const height = config.bladeHeightMeters.min + (config.bladeHeightMeters.max - config.bladeHeightMeters.min) * random();
        const width = config.bladeWidthMeters.min + (config.bladeWidthMeters.max - config.bladeWidthMeters.min) * random();
        const yaw = random() * Math.PI * 2;
        const bendDegrees = config.bendDegrees.min + (config.bendDegrees.max - config.bendDegrees.min) * random();
        const inclinationDegrees = config.inclinationDegrees.min + (config.inclinationDegrees.max - config.inclinationDegrees.min) * random();
        const bend = Math.sin(bendDegrees * Math.PI / 180) * height * 0.35;
        const inclination = Math.sin(inclinationDegrees * Math.PI / 180) * height * 0.25;
        const tangentX = Math.cos(yaw) * width * 0.5;
        const tangentZ = Math.sin(yaw) * width * 0.5;
        const directionX = -Math.sin(yaw);
        const directionZ = Math.cos(yaw);
        const positionOffset = index * 9;
        positions.set([
            rootX - tangentX, 0, rootZ - tangentZ,
            rootX + tangentX, 0, rootZ + tangentZ,
            rootX + directionX * bend, height, rootZ + directionZ * (bend + inclination)
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
    geometry.name = `GrassNearCarpetPatch_${bladeCount}`;
    return geometry;
}

function createMaterial(config) {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: config.roughness,
        metalness: 0,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
    });
}

function createDescriptor(cell, config, terrainMesh, terrainGrid) {
    const random = makeRng(`${config.seed}|near-carpet-cell:${cell.key}`);
    const variation = config.patchScaleVariation;
    const brightness = 1 + (random() * 2 - 1) * config.colorBrightnessVariation;
    return Object.freeze({
        ...cell,
        y: sampleTerrainHeight(terrainMesh, terrainGrid, cell.x, cell.z) + config.yOffsetMeters,
        yaw: Math.floor(random() * 4) * Math.PI * 0.5,
        scale: 1 + (random() * 2 - 1) * variation,
        brightness
    });
}

export class GrassNearCarpetSystem {
    constructor({ parent, terrainMesh, terrainGrid, getExclusionRects } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassNearCarpetSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassNearCarpetSystem';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._getExclusionRects = typeof getExclusionRects === 'function' ? getExclusionRects : (() => []);
        this._config = sanitizeGrassNearCarpetConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._geometry = null;
        this._material = null;
        this._meshes = new Map();
        this._descriptors = new Map();
        this._cells = new Map();
        this._centerCellKey = '';
        this._layoutKey = '';
        this._configKey = '';
        this._stats = {
            layoutRevision: 0,
            cameraCellMoves: 0,
            stationaryFrames: 0,
            totalBufferUpdates: 0,
            lastBufferUpdates: 0,
            lastEnteringCells: 0,
            lastLeavingCells: 0,
            retainedCells: 0
        };
        this._stats.transitionPatches = 0;
        this._stats.effectiveRadiusMeters = 0;
    }

    attach(parent) {
        if (!parent?.isObject3D) throw new Error('[GrassNearCarpetSystem] A THREE.Object3D parent is required.');
        if (this.group.parent !== parent) parent.add(this.group);
    }

    setTerrain({ terrainMesh, terrainGrid } = {}) {
        this._terrainMesh = terrainMesh ?? this._terrainMesh;
        this._terrainGrid = terrainGrid ?? this._terrainGrid;
        this._clearLayout();
        this._invalidateLayout();
    }

    setConfig(value) {
        const next = sanitizeGrassNearCarpetConfig(value);
        const configKey = JSON.stringify(next);
        const geometryKey = [
            next.seed,
            next.patchSizeMeters,
            next.bladesPerSquareMeter,
            next.baseColor,
            next.tipColor,
            next.bladeHeightMeters.min,
            next.bladeHeightMeters.max,
            next.bladeWidthMeters.min,
            next.bladeWidthMeters.max,
            next.bendDegrees.min,
            next.bendDegrees.max,
            next.inclinationDegrees.min,
            next.inclinationDegrees.max
        ].join('|');
        const previousGeometryKey = this._geometryKey;
        this._config = next;
        this._geometryKey = geometryKey;
        if (previousGeometryKey !== geometryKey) this._rebuildRenderResources();
        else if (configKey !== this._configKey) {
            if (this._material) this._material.roughness = next.roughness;
            this._clearLayout();
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

    update({ camera, viewAngleDeg = 0 } = {}) {
        const config = this._config;
        const effectiveRadiusMeters = getGrassAutoLodCandidateRadius(this._autoLod, 'near', viewAngleDeg);
        const active = config.enabled && config.mode !== GRASS_NEAR_CARPET_MODE.DISABLED && effectiveRadiusMeters > 0;
        const terrainGrid = this._terrainGrid;
        if (!active || !camera?.isCamera || !terrainGrid || !this._geometry || !this._material) {
            this.group.visible = false;
            this._stats.lastBufferUpdates = 0;
            this._stats.effectiveRadiusMeters = 0;
            return;
        }
        this.group.visible = true;

        const exclusionRects = this._getExclusionRects();
        const exclusionKey = JSON.stringify(exclusionRects);
        const angleBucket = Math.round(Number(viewAngleDeg) * 2) / 2;
        const layoutKey = `${this._geometryKey}|${effectiveRadiusMeters.toFixed(3)}|${config.chunkSizeMeters}|${angleBucket}|${JSON.stringify(this._autoLod)}|${exclusionKey}`;
        const centerCellX = Math.floor(camera.position.x / config.patchSizeMeters);
        const centerCellZ = Math.floor(camera.position.z / config.patchSizeMeters);
        const centerCellKey = `${centerCellX},${centerCellZ}`;
        if (centerCellKey === this._centerCellKey && layoutKey === this._layoutKey) {
            this._stats.stationaryFrames++;
            this._stats.lastBufferUpdates = 0;
            return;
        }

        const bounds = {
            minX: Number(terrainGrid.minX),
            maxX: Number(terrainGrid.minX) + Number(terrainGrid.widthTiles) * Number(terrainGrid.tileSize),
            minZ: Number(terrainGrid.minZ),
            maxZ: Number(terrainGrid.minZ) + Number(terrainGrid.depthTiles) * Number(terrainGrid.tileSize)
        };
        const candidateConfig = sanitizeGrassNearCarpetConfig({ ...config, radiusMeters: effectiveRadiusMeters });
        const candidates = createGrassNearCarpetCellSet({
            cameraX: camera.position.x,
            cameraZ: camera.position.z,
            config: candidateConfig,
            terrainBounds: bounds,
            exclusionRects
        });
        const visibleCells = new Map();
        let transitionPatches = 0;
        for (const [key, cell] of candidates.cells) {
            const evaluation = evaluateGrassAutoLod({
                distanceMeters: Math.hypot(cell.x - camera.position.x, cell.z - camera.position.z),
                viewAngleDeg,
                config: this._autoLod
            });
            if (evaluation.weights.near > 0 && evaluation.weights.near < 1) transitionPatches++;
            const visible = resolveGrassAutoLodMaskedVisibility({
                weight: evaluation.weights.near,
                stableSample: getGrassAutoLodStableSample(key, 'near'),
                previousVisible: this._cells.has(key),
                config: this._autoLod
            });
            if (visible) visibleCells.set(key, cell);
        }
        const next = { ...candidates, cells: visibleCells };
        const delta = diffGrassNearCarpetCellSets(this._cells, next.cells);
        const changedChunks = new Set();
        for (const cell of delta.leaving) {
            changedChunks.add(getGrassNearCarpetChunkKey(cell, config));
            this._descriptors.delete(cell.key);
        }
        for (const cell of delta.entering) {
            changedChunks.add(getGrassNearCarpetChunkKey(cell, config));
            this._descriptors.set(cell.key, createDescriptor(cell, config, this._terrainMesh, terrainGrid));
        }
        if (!this._cells.size) for (const descriptor of this._descriptors.values()) changedChunks.add(getGrassNearCarpetChunkKey(descriptor, config));

        let bufferUpdates = 0;
        for (const chunkKey of changedChunks) {
            const descriptors = [];
            for (const descriptor of this._descriptors.values()) {
                if (getGrassNearCarpetChunkKey(descriptor, config) === chunkKey) descriptors.push(descriptor);
            }
            this._writeChunk(chunkKey, descriptors);
            bufferUpdates++;
        }

        this._cells = next.cells;
        if (this._centerCellKey && centerCellKey !== this._centerCellKey) this._stats.cameraCellMoves++;
        this._centerCellKey = centerCellKey;
        this._layoutKey = layoutKey;
        this._stats.layoutRevision++;
        this._stats.lastBufferUpdates = bufferUpdates;
        this._stats.totalBufferUpdates += bufferUpdates;
        this._stats.lastEnteringCells = delta.entering.length;
        this._stats.lastLeavingCells = delta.leaving.length;
        this._stats.retainedCells = delta.retained;
        this._stats.transitionPatches = transitionPatches;
        this._stats.effectiveRadiusMeters = effectiveRadiusMeters;
    }

    getStats() {
        const enabled = this._config.enabled && this._config.mode !== GRASS_NEAR_CARPET_MODE.DISABLED;
        const patchInstances = enabled ? this._descriptors.size : 0;
        const bladesPerPatch = getGrassNearCarpetBladesPerPatch(this._config);
        let drawCalls = 0;
        for (const mesh of this._meshes.values()) if (mesh.visible && mesh.count > 0) drawCalls++;
        return {
            enabled,
            mode: this._config.mode,
            patchSizeMeters: this._config.patchSizeMeters,
            bladesPerSquareMeter: this._config.bladesPerSquareMeter,
            radiusMeters: this._config.radiusMeters,
            patchInstances,
            bladesPerPatch,
            bladeInstances: patchInstances * bladesPerPatch,
            triangles: patchInstances * bladesPerPatch,
            drawCalls,
            materialPaths: drawCalls > 0 ? 1 : 0,
            castShadow: false,
            transparent: false,
            frustumCulled: true,
            ...this._stats
        };
    }

    dispose() {
        for (const mesh of this._meshes.values()) mesh.removeFromParent();
        this._meshes.clear();
        this._geometry?.dispose?.();
        this._material?.dispose?.();
        this._geometry = null;
        this._material = null;
        this.group.removeFromParent();
    }

    _invalidateLayout() {
        this._layoutKey = '';
    }

    _clearLayout() {
        for (const mesh of this._meshes.values()) {
            mesh.count = 0;
            mesh.visible = false;
        }
        this._descriptors.clear();
        this._cells.clear();
        this._centerCellKey = '';
    }

    _rebuildRenderResources() {
        for (const mesh of this._meshes.values()) mesh.removeFromParent();
        this._meshes.clear();
        this._geometry?.dispose?.();
        this._material?.dispose?.();
        this._geometry = createPatchGeometry(this._config);
        this._material = createMaterial(this._config);
        this._clearLayout();
    }

    _ensureMesh(chunkKey, count) {
        const existing = this._meshes.get(chunkKey);
        if (existing?.isInstancedMesh && existing.instanceMatrix.count >= count) return existing;
        existing?.removeFromParent?.();
        const capacity = nextPowerOfTwo(count);
        const mesh = new THREE.InstancedMesh(this._geometry, this._material, capacity);
        mesh.name = `GrassNearCarpetChunk_${chunkKey}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = 4;
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
