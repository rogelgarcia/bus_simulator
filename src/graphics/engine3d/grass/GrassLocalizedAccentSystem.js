// Renders coverage-bounded localized grass accents and worn tree substrate in two global batches.
// @ts-check

import * as THREE from 'three';
import {
    createGrassLocalizedAccentLayout,
    sanitizeGrassLocalizedAccentConfig
} from '../../../app/grass/GrassLocalizedAccentContract.js';
import {
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodMaskedVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';

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
    const width = config.cardWidthMeters * 0.5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -width, 0, 0,
        width, 0, 0,
        width, config.cardHeightMeters, 0,
        -width, config.cardHeightMeters, 0
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setAttribute('grassAtlasVariant', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.name = 'GrassLocalizedAccentCard';
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

export class GrassLocalizedAccentSystem {
    constructor({ parent, terrainMesh, terrainGrid, accentMaterial, wornMaterial } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassLocalizedAccentSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassLocalizedAccentSystem';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._accentMaterial = accentMaterial?.isMaterial ? accentMaterial : null;
        this._wornMaterial = wornMaterial?.isMaterial ? wornMaterial : null;
        this._config = sanitizeGrassLocalizedAccentConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._input = { treePlacements: [], featurePlacements: [], coverageDefinition: null, coverageConfig: null };
        this._layout = createGrassLocalizedAccentLayout({ config: { enabled: false } });
        this._accentMesh = null;
        this._wornMesh = null;
        this._layoutKey = '';
        this._visibleKeys = new Set();
        this._stats = { bufferUpdates: 0, stationaryFrames: 0, transitionClusters: 0, geometryBeyondCutoff: 0 };
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
        this._disposeMeshes();
        this._rebuildLayout();
    }

    setAutoLodConfig(value) {
        const next = sanitizeGrassAutoLodConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._autoLod)) return;
        this._autoLod = next;
        this._layoutKey = '';
    }

    setInput(value) {
        const source = value && typeof value === 'object' ? value : {};
        this._input = {
            treePlacements: Array.isArray(source.treePlacements) ? source.treePlacements : [],
            featurePlacements: Array.isArray(source.featurePlacements) ? source.featurePlacements : [],
            coverageDefinition: source.coverageDefinition ?? null,
            coverageConfig: source.coverageConfig ?? null
        };
        this._rebuildLayout();
    }

    update({ camera, viewAngleDeg = 0 } = {}) {
        const radius = getGrassAutoLodCandidateRadius(this._autoLod, 'near', viewAngleDeg);
        if (!this._config.enabled || !camera?.isCamera || !this._terrainGrid || radius <= 0) {
            if (this._accentMesh) this._accentMesh.count = 0;
            this._visibleKeys.clear();
            this._stats.geometryBeyondCutoff = 0;
            return;
        }
        const centerX = Math.floor(camera.position.x);
        const centerZ = Math.floor(camera.position.z);
        const angleBucket = Math.round(Number(viewAngleDeg) * 2) / 2;
        const layoutKey = `${centerX},${centerZ}|${angleBucket}|${JSON.stringify(this._autoLod)}|${this._layout.deterministicSignature}`;
        if (layoutKey === this._layoutKey) {
            this._stats.stationaryFrames++;
            return;
        }

        const visible = [];
        const nextKeys = new Set();
        let transitionClusters = 0;
        let geometryBeyondCutoff = 0;
        for (const descriptor of this._layout.accents) {
            const distance = Math.hypot(descriptor.x - camera.position.x, descriptor.z - camera.position.z);
            if (distance > radius + this._config.ringOuterMeters) continue;
            const evaluation = evaluateGrassAutoLod({ distanceMeters: distance, viewAngleDeg, config: this._autoLod });
            if (evaluation.weights.near > 0 && evaluation.weights.near < 1) transitionClusters++;
            const keep = resolveGrassAutoLodMaskedVisibility({
                weight: evaluation.weights.near,
                stableSample: getGrassAutoLodStableSample(descriptor.key, 'accent'),
                previousVisible: this._visibleKeys.has(descriptor.key),
                config: this._autoLod
            });
            if (!keep) continue;
            if (evaluation.beyondGeometryCutoff) geometryBeyondCutoff++;
            visible.push(descriptor);
            nextKeys.add(descriptor.key);
        }
        this._writeAccentDescriptors(visible);
        this._visibleKeys = nextKeys;
        this._layoutKey = layoutKey;
        this._stats.bufferUpdates++;
        this._stats.transitionClusters = transitionClusters;
        this._stats.geometryBeyondCutoff = geometryBeyondCutoff;
    }

    getStats() {
        const visibleClusters = this._accentMesh?.visible ? Math.max(0, this._accentMesh.count | 0) : 0;
        const wornPatches = this._wornMesh?.visible ? Math.max(0, this._wornMesh.count | 0) : 0;
        const grassTriangles = visibleClusters * 2;
        const wornTriangles = wornPatches * 18;
        return {
            enabled: this._config.enabled,
            layout: 'localized_tufts',
            treePlacements: this._layout.treePlacements.length,
            eligibleTrees: this._layout.eligibleTrees,
            optionalFeatures: this._layout.featurePlacements.length,
            clustersPerTree: this._config.clustersPerTree,
            potentialClusters: this._layout.accents.length,
            visibleClusters,
            grassTriangles,
            grassDrawCalls: visibleClusters > 0 ? 1 : 0,
            grassMaterialPaths: visibleClusters > 0 ? 1 : 0,
            wornPatches,
            wornTriangles,
            wornDrawCalls: wornPatches > 0 ? 1 : 0,
            totalTriangles: grassTriangles + wornTriangles,
            totalDrawCalls: (visibleClusters > 0 ? 1 : 0) + (wornPatches > 0 ? 1 : 0),
            trianglesPerTreeAccent: this._config.clustersPerTree * 2,
            rejectedCoverage: this._layout.rejectedCoverage,
            rejectedInsideTrunk: this._layout.rejectedInsideTrunk,
            deterministicSignature: this._layout.deterministicSignature,
            atlasVariants: this._config.atlasVariants,
            alphaCutoff: Number(this._accentMaterial?.alphaTest) || 0,
            alphaToCoverage: this._accentMaterial?.alphaToCoverage === true,
            transparent: this._accentMaterial?.transparent === true,
            frustumCulled: this._accentMesh?.frustumCulled !== false && this._wornMesh?.frustumCulled !== false,
            castShadow: this._accentMesh?.castShadow === true || this._wornMesh?.castShadow === true,
            ...this._stats
        };
    }

    dispose() {
        this._disposeMeshes();
        this._wornMaterial?.dispose?.();
        this._wornMaterial = null;
        this._accentMaterial = null;
        this.group.removeFromParent();
    }

    _rebuildLayout() {
        this._layout = createGrassLocalizedAccentLayout({ config: this._config, ...this._input });
        this._layoutKey = '';
        this._visibleKeys.clear();
        this._writeWornDescriptors(this._layout.wornPatches);
        if (!this._layout.accents.length && this._accentMesh) {
            this._accentMesh.count = 0;
            this._accentMesh.visible = false;
        }
    }

    _ensureAccentMesh(count) {
        const capacity = nextPowerOfTwo(count);
        if (this._accentMesh?.instanceMatrix?.count >= capacity) return this._accentMesh;
        this._accentMesh?.geometry?.dispose?.();
        this._accentMesh?.removeFromParent?.();
        const mesh = new THREE.InstancedMesh(createAccentGeometry(capacity, this._config), this._accentMaterial, capacity);
        mesh.name = 'GrassLocalizedAccentBatch';
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
                y: sampleTerrainHeight(this._terrainMesh, this._terrainGrid, descriptor.x, descriptor.z) + this._config.yOffsetMeters
            });
            colors[index * 3] = descriptor.brightness * 1.02;
            colors[index * 3 + 1] = descriptor.brightness * descriptor.dryTint;
            colors[index * 3 + 2] = descriptor.brightness * 0.68;
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

    _writeWornDescriptors(descriptors) {
        this._wornMesh?.geometry?.dispose?.();
        this._wornMesh?.removeFromParent?.();
        this._wornMesh = null;
        if (!this._config.enabled || !this._config.wornEnabled || !descriptors.length || !this._wornMaterial) return;
        const geometry = new THREE.CircleGeometry(1, 18);
        geometry.rotateX(-Math.PI * 0.5);
        const uv = geometry.attributes.uv;
        geometry.setAttribute('uv2', new THREE.BufferAttribute(uv.array.slice(0), 2));
        const mesh = new THREE.InstancedMesh(geometry, this._wornMaterial, descriptors.length);
        mesh.name = 'GrassLocalizedWornSubstrateBatch';
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        for (let index = 0; index < descriptors.length; index++) {
            const descriptor = descriptors[index];
            position.set(
                descriptor.x,
                sampleTerrainHeight(this._terrainMesh, this._terrainGrid, descriptor.x, descriptor.z) + this._config.wornYOffsetMeters,
                descriptor.z
            );
            quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, descriptor.yawRadians);
            scale.set(descriptor.radiusMeters, 1, descriptor.radiusMeters);
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(index, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = 5;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        this.group.add(mesh);
        this._wornMesh = mesh;
    }

    _disposeMeshes() {
        this._accentMesh?.geometry?.dispose?.();
        this._accentMesh?.removeFromParent?.();
        this._accentMesh = null;
        this._wornMesh?.geometry?.dispose?.();
        this._wornMesh?.removeFromParent?.();
        this._wornMesh = null;
        this._visibleKeys.clear();
    }
}
