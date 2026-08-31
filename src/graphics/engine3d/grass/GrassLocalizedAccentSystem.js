// Renders exact-coverage V2 localized grass accents in one crossed-card batch.
// @ts-check

import * as THREE from 'three';
import {
    GRASS_LOCALIZED_ACCENT_SCHEMA,
    GRASS_LOCALIZED_ACCENT_VERSION,
    createGrassLocalizedAccentHandoffIdentity,
    createGrassLocalizedAccentLayout,
    sanitizeGrassLocalizedAccentConfig
} from '../../../app/grass/GrassLocalizedAccentContract.js';
import {
    evaluateGrassAutoLod,
    getGrassAutoLodAngleScale,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodMaskedVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';

const EPS = 1e-7;

function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, Number(value) || 1)));
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

function createAccentGeometry(capacity, config) {
    const halfWidth = config.cardWidthMeters * 0.5;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let card = 0; card < config.cardsPerCluster; card++) {
        const angle = card * Math.PI / config.cardsPerCluster;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const vertex = positions.length / 3;
        positions.push(
            -halfWidth * cosine, 0, halfWidth * sine,
            halfWidth * cosine, 0, -halfWidth * sine,
            halfWidth * cosine, config.cardHeightMeters, -halfWidth * sine,
            -halfWidth * cosine, config.cardHeightMeters, halfWidth * sine
        );
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('grassAtlasVariant', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = 'GrassLocalizedAccentV2CrossedClump';
    geometry.userData = Object.freeze({
        schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
        version: GRASS_LOCALIZED_ACCENT_VERSION,
        cardsPerCluster: config.cardsPerCluster,
        trianglesPerCluster: config.cardsPerCluster * 2
    });
    return geometry;
}

function writeTransform(array, offset, { x, y, z, yawRadians, scale }) {
    const cosine = Math.cos(yawRadians) * scale;
    const sine = Math.sin(yawRadians) * scale;
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
    array[offset + 12] = x;
    array[offset + 13] = y;
    array[offset + 14] = z;
    array[offset + 15] = 1;
}

function getAccentCandidateRadius(config, viewAngleDeg) {
    if (!config.enabled || config.force === 'texture') return 0;
    return config.middleEndMeters / Math.max(EPS, getGrassAutoLodAngleScale(config, viewAngleDeg));
}

function normalizeEvidenceMode(value) {
    const mode = value === null || value === undefined ? null : String(value);
    if (mode === null || mode === 'auto') return mode;
    if (mode === 'accent' || mode === 'texture_only') return mode;
    return 'texture_only';
}

export class GrassLocalizedAccentSystem {
    constructor({ parent, terrainMesh, terrainGrid, accentMaterial } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassLocalizedAccentSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassLocalizedAccentSystem';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._accentMaterial = accentMaterial?.isMaterial ? accentMaterial : null;
        this._config = sanitizeGrassLocalizedAccentConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._evidenceMode = null;
        this._input = { treePlacements: [], featurePlacements: [], coverageDefinition: null, coverageConfig: null };
        this._layout = createGrassLocalizedAccentLayout({ config: { enabled: false } });
        this._accentMesh = null;
        this._frameKey = '';
        this._batchSignature = '';
        this._visibleKeys = new Set();
        this._stats = {
            bufferUpdates: 0,
            lastBufferUpdates: 0,
            stationaryFrames: 0,
            transitionClusters: 0,
            overlapClusters: 0,
            retainedRoots: 0,
            enteringRoots: 0,
            leavingRoots: 0,
            cutoffClampedClusters: 0,
            geometryBeyondCutoff: 0,
            maxVisibleEffectiveDistanceMeters: 0
        };
    }

    attach(parent) {
        if (!parent?.isObject3D) throw new Error('[GrassLocalizedAccentSystem] A THREE.Object3D parent is required.');
        if (this.group.parent !== parent) parent.add(this.group);
    }

    setTerrain({ terrainMesh, terrainGrid } = {}) {
        this._terrainMesh = terrainMesh ?? this._terrainMesh;
        this._terrainGrid = terrainGrid ?? this._terrainGrid;
        this._rebuildLayout();
    }

    setConfig(value) {
        const next = sanitizeGrassLocalizedAccentConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._config)) return;
        this._config = next;
        this._disposeMesh();
        this._rebuildLayout();
    }

    setAutoLodConfig(value) {
        const next = sanitizeGrassAutoLodConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._autoLod)) return;
        this._autoLod = next;
        this._frameKey = '';
    }

    setEvidenceMode(mode = null) {
        const next = normalizeEvidenceMode(mode);
        if (next === this._evidenceMode) return;
        this._evidenceMode = next;
        this.resetLodHysteresis();
    }

    resetLodHysteresis() {
        this._visibleKeys.clear();
        this._frameKey = '';
        this._batchSignature = '';
        if (this._accentMesh) {
            this._accentMesh.count = 0;
            this._accentMesh.visible = false;
        }
        this._stats.lastBufferUpdates = 0;
    }

    setCoverageInput({ definition = null, config = null } = {}) {
        if (
            definition === this._input.coverageDefinition
            && JSON.stringify(config ?? null) === JSON.stringify(this._input.coverageConfig ?? null)
        ) return;
        this._input = {
            ...this._input,
            coverageDefinition: definition,
            coverageConfig: config
        };
        this._rebuildLayout();
    }

    setInput(value) {
        const source = value && typeof value === 'object' ? value : {};
        this._input = {
            treePlacements: Array.isArray(source.treePlacements) ? source.treePlacements : [],
            featurePlacements: Array.isArray(source.featurePlacements) ? source.featurePlacements : [],
            coverageDefinition: source.coverageDefinition ?? this._input.coverageDefinition ?? null,
            coverageConfig: source.coverageConfig ?? this._input.coverageConfig ?? null
        };
        this._rebuildLayout();
    }

    update({ camera, viewAngleDeg = 0 } = {}) {
        const forcedAccent = this._evidenceMode === 'accent';
        const visibilityConfig = forcedAccent
            ? sanitizeGrassAutoLodConfig({ ...this._autoLod, force: 'middle' })
            : this._autoLod;
        const radius = getAccentCandidateRadius(visibilityConfig, viewAngleDeg);
        const active = this._config.enabled
            && this._evidenceMode !== 'texture_only'
            && camera?.isCamera
            && this._terrainGrid
            && this._accentMaterial
            && radius > 0;
        if (!active) {
            this.group.visible = false;
            if (this._accentMesh) {
                this._accentMesh.count = 0;
                this._accentMesh.visible = false;
            }
            this._visibleKeys.clear();
            this._frameKey = '';
            this._batchSignature = '';
            this._stats.lastBufferUpdates = 0;
            this._stats.geometryBeyondCutoff = 0;
            this._stats.maxVisibleEffectiveDistanceMeters = 0;
            return;
        }
        this.group.visible = true;
        const frameKey = [
            camera.position.x.toFixed(6),
            camera.position.z.toFixed(6),
            Number(viewAngleDeg).toFixed(4),
            JSON.stringify(visibilityConfig),
            this._layout.placementSignature,
            this._evidenceMode ?? 'auto'
        ].join('|');
        if (frameKey === this._frameKey) {
            this._stats.stationaryFrames++;
            this._stats.lastBufferUpdates = 0;
            return;
        }

        const visible = [];
        const nextKeys = new Set();
        let transitionClusters = 0;
        let overlapClusters = 0;
        let cutoffClampedClusters = 0;
        let geometryBeyondCutoff = 0;
        let maxVisibleEffectiveDistanceMeters = 0;
        for (const descriptor of this._layout.accents) {
            const distance = Math.hypot(descriptor.x - camera.position.x, descriptor.z - camera.position.z);
            if (distance >= radius) continue;
            const evaluation = evaluateGrassAutoLod({
                distanceMeters: distance,
                viewAngleDeg,
                config: visibilityConfig
            });
            const geometryWeight = Math.max(0, Math.min(1, 1 - evaluation.weights.texture));
            if (geometryWeight > 0 && geometryWeight < 1) transitionClusters++;
            const handoffIdentity = createGrassLocalizedAccentHandoffIdentity({
                accentKey: descriptor.key,
                seed: this._config.seed,
                boundarySignature: this._layout.boundarySignature
            });
            const keep = forcedAccent || resolveGrassAutoLodMaskedVisibility({
                weight: geometryWeight,
                stableSample: getGrassAutoLodStableSample(handoffIdentity, 'middle_to_texture'),
                previousVisible: this._visibleKeys.has(descriptor.key),
                config: visibilityConfig
            });
            if (!keep || evaluation.beyondGeometryCutoff) continue;
            const requestedRadius = this._config.cardWidthMeters * descriptor.scale * 0.5;
            const remainingWorldMeters = Math.max(
                0,
                (visibilityConfig.middleEndMeters - evaluation.effectiveDistanceMeters)
                    / Math.max(EPS, evaluation.angleScale)
            );
            const cutoffFootprintScale = requestedRadius > EPS
                ? Math.min(1, remainingWorldMeters / requestedRadius)
                : 1;
            if (cutoffFootprintScale <= EPS) continue;
            if (cutoffFootprintScale < 1 - EPS) cutoffClampedClusters++;
            const renderScale = descriptor.scale * cutoffFootprintScale;
            const maximumEffectiveDistance = evaluation.effectiveDistanceMeters
                + this._config.cardWidthMeters * renderScale * 0.5 * evaluation.angleScale;
            if (maximumEffectiveDistance > visibilityConfig.middleEndMeters + EPS) {
                geometryBeyondCutoff++;
                continue;
            }
            if (geometryWeight > 0 && geometryWeight < 1 && this._visibleKeys.has(descriptor.key)) {
                overlapClusters++;
            }
            visible.push(Object.freeze({
                ...descriptor,
                scale: renderScale,
                cutoffFootprintScale
            }));
            nextKeys.add(descriptor.key);
            maxVisibleEffectiveDistanceMeters = Math.max(maxVisibleEffectiveDistanceMeters, maximumEffectiveDistance);
        }

        let retainedRoots = 0;
        let enteringRoots = 0;
        let leavingRoots = 0;
        for (const key of nextKeys) {
            if (this._visibleKeys.has(key)) retainedRoots++;
            else enteringRoots++;
        }
        for (const key of this._visibleKeys) if (!nextKeys.has(key)) leavingRoots++;
        const batchSignature = visible.map((descriptor) => (
            `${descriptor.key}:${descriptor.scale.toFixed(9)}`
        )).join('|');
        const batchChanged = batchSignature !== this._batchSignature;
        if (batchChanged) this._writeAccentDescriptors(visible);
        this._visibleKeys = nextKeys;
        this._frameKey = frameKey;
        this._batchSignature = batchSignature;
        this._stats.bufferUpdates += Number(batchChanged);
        this._stats.lastBufferUpdates = Number(batchChanged);
        this._stats.transitionClusters = transitionClusters;
        this._stats.overlapClusters = overlapClusters;
        this._stats.retainedRoots = retainedRoots;
        this._stats.enteringRoots = enteringRoots;
        this._stats.leavingRoots = leavingRoots;
        this._stats.cutoffClampedClusters = cutoffClampedClusters;
        this._stats.geometryBeyondCutoff = geometryBeyondCutoff;
        this._stats.maxVisibleEffectiveDistanceMeters = maxVisibleEffectiveDistanceMeters;
    }

    getStats() {
        const enabled = this._config.enabled && this._evidenceMode !== 'texture_only';
        const visibleClusters = enabled && this._accentMesh?.visible
            ? Math.max(0, this._accentMesh.count | 0)
            : 0;
        const visibleCards = visibleClusters * this._config.cardsPerCluster;
        const grassTriangles = visibleCards * 2;
        const grassDrawCalls = visibleClusters > 0 ? 1 : 0;
        const atlasChannelRoles = Object.values(this._accentMaterial?.userData?.grassClusterAtlasMaps ?? {})
            .filter((value) => typeof value === 'string' && value);
        return {
            schema: GRASS_LOCALIZED_ACCENT_SCHEMA,
            version: GRASS_LOCALIZED_ACCENT_VERSION,
            enabled,
            evidenceMode: this._evidenceMode,
            layout: 'localized_v2_clumps',
            substrateOwnership: this._layout.substrateOwnership,
            coverageMode: this._layout.coverageMode,
            boundarySignature: this._layout.boundarySignature,
            sourceLoopIdentity: this._layout.sourceLoopIdentity,
            rootClearanceMeters: this._layout.rootClearanceMeters,
            placementSignature: this._layout.placementSignature,
            deterministicSignature: this._layout.deterministicSignature,
            handoffSeed: this._config.seed,
            handoffBoundarySignature: this._layout.boundarySignature,
            handoffIdentityPolicy: 'auto_lod_v2_seed_boundary_accent_key',
            treePlacements: this._layout.treePlacements.length,
            eligibleTrees: this._layout.eligibleTrees,
            optionalFeatures: this._layout.featurePlacements.length,
            clustersPerTree: this._config.clustersPerTree,
            clustersPerFeature: this._config.clustersPerFeature,
            cardsPerCluster: this._config.cardsPerCluster,
            trianglesPerCluster: this._config.cardsPerCluster * 2,
            trianglesPerTreeAccent: this._config.clustersPerTree * this._config.cardsPerCluster * 2,
            candidateRoots: this._layout.candidateRoots,
            eligibleRoots: this._layout.eligibleRoots,
            representedRoots: this._layout.representedRoots,
            unrepresentedEligibleRoots: this._layout.unrepresentedEligibleRoots,
            potentialClusters: this._layout.accents.length,
            visibleClusters,
            instances: visibleClusters,
            visibleCards,
            grassTriangles,
            triangles: grassTriangles,
            grassDrawCalls,
            drawCalls: grassDrawCalls,
            grassMaterialPaths: grassDrawCalls,
            materialPaths: grassDrawCalls,
            wornPatches: 0,
            wornTriangles: 0,
            wornDrawCalls: 0,
            wornMaterialPaths: 0,
            totalTriangles: grassTriangles,
            totalDrawCalls: grassDrawCalls,
            rejectedCoverage: this._layout.rejectedCoverage,
            rejectedInsideTrunk: this._layout.rejectedInsideTrunk,
            rejectedByKind: { ...this._layout.rejectedByKind },
            exactPostcheckFailures: this._layout.exactPostcheckFailures,
            exactEnvelopeFailures: this._layout.exactEnvelopeFailures,
            envelopeSamples: this._layout.envelopeSamples,
            footprintClampedRoots: this._layout.footprintClampedRoots,
            minimumEmittedBoundaryDistanceMeters: this._layout.minimumEmittedBoundaryDistanceMeters,
            atlasVariants: this._config.atlasVariants,
            atlasMaps: Object.freeze(atlasChannelRoles.length
                ? atlasChannelRoles
                : ['accentClumpColor', 'accentClumpNormal', 'accentClumpRoughness', 'accentClumpAo', 'accentClumpCoverage']),
            atlasRole: this._accentMaterial?.userData?.grassClusterAtlasRole ?? null,
            resolvedMaterialId: this._accentMaterial?.userData?.resolvedMaterialId ?? null,
            alphaCutoff: Number(this._accentMaterial?.alphaTest) || 0,
            alphaToCoverage: this._accentMaterial?.alphaToCoverage === true,
            transparent: this._accentMaterial?.transparent === true,
            depthWrite: this._accentMaterial?.depthWrite !== false,
            emissiveIntensity: Number(this._accentMaterial?.emissiveIntensity) || 0,
            grayscaleAppearanceVariation: true,
            frustumCulled: this._accentMesh?.frustumCulled !== false,
            castShadow: this._accentMesh?.castShadow === true,
            stationaryUploadsZero: this._stats.stationaryFrames === 0 || this._stats.lastBufferUpdates === 0,
            ...this._stats
        };
    }

    dispose() {
        this._disposeMesh();
        this._accentMaterial = null;
        this.group.removeFromParent();
    }

    _rebuildLayout() {
        this._layout = createGrassLocalizedAccentLayout({ config: this._config, ...this._input });
        this.resetLodHysteresis();
    }

    _ensureAccentMesh(count) {
        const capacity = nextPowerOfTwo(count);
        if (this._accentMesh?.instanceMatrix?.count >= capacity) return this._accentMesh;
        this._accentMesh?.geometry?.dispose?.();
        this._accentMesh?.removeFromParent?.();
        const mesh = new THREE.InstancedMesh(createAccentGeometry(capacity, this._config), this._accentMaterial, capacity);
        mesh.name = 'GrassLocalizedAccentV2Batch';
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = 6;
        this.group.add(mesh);
        this._accentMesh = mesh;
        return mesh;
    }

    _writeAccentDescriptors(descriptors) {
        if (!descriptors.length || !this._accentMaterial) {
            if (this._accentMesh) {
                this._accentMesh.count = 0;
                this._accentMesh.visible = false;
            }
            return;
        }
        const mesh = this._ensureAccentMesh(descriptors.length);
        const matrices = mesh.instanceMatrix.array;
        const colors = mesh.instanceColor.array;
        const variants = mesh.geometry.attributes.grassAtlasVariant;
        for (let index = 0; index < descriptors.length; index++) {
            const descriptor = descriptors[index];
            writeTransform(matrices, index * 16, {
                ...descriptor,
                y: sampleTerrainHeight(this._terrainMesh, this._terrainGrid, descriptor.x, descriptor.z)
                    + this._config.yOffsetMeters
            });
            const appearanceScale = Number(descriptor.appearanceScale) || 1;
            colors[index * 3] = appearanceScale;
            colors[index * 3 + 1] = appearanceScale;
            colors[index * 3 + 2] = appearanceScale;
            variants.setX(index, descriptor.variant);
        }
        mesh.count = descriptors.length;
        mesh.visible = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        variants.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
    }

    _disposeMesh() {
        this._accentMesh?.geometry?.dispose?.();
        this._accentMesh?.removeFromParent?.();
        this._accentMesh = null;
        this._visibleKeys.clear();
        this._frameKey = '';
        this._batchSignature = '';
    }
}
