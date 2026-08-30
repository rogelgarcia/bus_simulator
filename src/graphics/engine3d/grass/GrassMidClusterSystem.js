// Renders the automatic mid-distance grass tier as one atlas-backed instanced batch.
// @ts-check

import * as THREE from 'three';
import {
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    getGrassAutoLodStableSample,
    resolveGrassAutoLodMaskedVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';
import {
    LOW_CUT_GRASS_ASSET_FAMILY,
    LOW_CUT_GRASS_ATLAS_ROLE,
    LOW_CUT_GRASS_NORMAL_POLICY
} from '../../content3d/catalogs/LowCutGrassMaterialCatalog.js';
import { sanitizeGrassMidClusterConfig } from './GrassMidClusterConfig.js';
import { makeRng } from './GrassRng.js';

const ATLAS_SHADER_VERSION = 6;

function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(Math.max(1, Number(value) || 1)));
}

function replaceRequiredShaderChunk(source, token, replacement, stage) {
    if (!source.includes(token)) {
        throw new Error(`[GrassMidClusterSystem] Missing ${stage} shader anchor: ${token}`);
    }
    return source.replace(token, replacement);
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

function createClusterGeometry(config, capacity) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const halfWidth = config.cardWidthMeters * 0.5;
    for (let card = 0; card < config.cardsPerPatch; card++) {
        const angle = card * Math.PI / config.cardsPerPatch;
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
    geometry.name = `GrassMidCluster_${config.cardsPerPatch}Cards`;
    return geometry;
}

function writeTransform(array, offset, descriptor) {
    const cosine = Math.cos(descriptor.yaw) * descriptor.scale;
    const sine = Math.sin(descriptor.yaw) * descriptor.scale;
    array[offset] = cosine;
    array[offset + 1] = 0;
    array[offset + 2] = -sine;
    array[offset + 3] = 0;
    array[offset + 4] = 0;
    array[offset + 5] = descriptor.scale;
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

function sanitizeAtlasContract(value) {
    const source = value && typeof value === 'object' ? value : null;
    if (!source) throw new Error('[GrassMidClusterSystem] An atlas contract is required.');
    const columns = Number(source.columns);
    const rows = Number(source.rows);
    const width = Number(source.resolution?.width);
    const height = Number(source.resolution?.height);
    const gutterPixels = Number(source.gutterPixels);
    if (![columns, rows, width, height, gutterPixels].every(Number.isFinite)) {
        throw new Error('[GrassMidClusterSystem] Atlas grid, resolution, and gutter must be finite.');
    }
    if (columns < 1 || rows < 1 || width < columns || height < rows || gutterPixels < 0) {
        throw new Error('[GrassMidClusterSystem] Atlas grid, resolution, or gutter is out of range.');
    }
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    if (gutterPixels * 2 >= cellWidth || gutterPixels * 2 >= cellHeight) {
        throw new Error('[GrassMidClusterSystem] Atlas gutter consumes the complete cell.');
    }
    const normalPolicy = String(source.lighting?.normalPolicy ?? LOW_CUT_GRASS_NORMAL_POLICY.MESH);
    if (!Object.values(LOW_CUT_GRASS_NORMAL_POLICY).includes(normalPolicy)) {
        throw new Error(`[GrassMidClusterSystem] Unsupported atlas normal policy: ${normalPolicy}`);
    }
    const requestedWorldUpBlend = Number(source.lighting?.worldUpBlend);
    if (
        normalPolicy === LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND
        && (!Number.isFinite(requestedWorldUpBlend) || requestedWorldUpBlend < 0 || requestedWorldUpBlend > 1)
    ) {
        throw new Error('[GrassMidClusterSystem] World-up normal blend must be between zero and one.');
    }
    const worldUpBlend = normalPolicy === LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND
        ? requestedWorldUpBlend
        : 0;
    const alphaLayoutPolicy = String(source.alphaLayout?.policy ?? 'packed_basecolor_alpha');
    if (alphaLayoutPolicy !== 'packed_basecolor_alpha' && alphaLayoutPolicy !== 'separate_alpha_map') {
        throw new Error(`[GrassMidClusterSystem] Unsupported alpha layout: ${alphaLayoutPolicy}`);
    }
    const alphaLayoutChannel = alphaLayoutPolicy === 'separate_alpha_map'
        ? String(source.alphaLayout?.channel ?? '')
        : 'alpha';
    if (alphaLayoutPolicy === 'separate_alpha_map' && alphaLayoutChannel !== 'green') {
        throw new Error(`[GrassMidClusterSystem] Unsupported separate alpha channel: ${alphaLayoutChannel}`);
    }
    return Object.freeze({
        role: String(source.role ?? LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER),
        columns,
        rows,
        resolution: Object.freeze({ width, height }),
        gutterPixels,
        lighting: Object.freeze({ normalPolicy, worldUpBlend }),
        alphaLayout: Object.freeze({ policy: alphaLayoutPolicy, channel: alphaLayoutChannel })
    });
}

function applyGrassCardShader(material, atlasContract, { remapAtlasVariant }) {
    if (!material?.isMeshStandardMaterial) throw new Error('[GrassMidClusterSystem] A MeshStandardMaterial is required.');
    const atlas = sanitizeAtlasContract(atlasContract);
    material.userData = material.userData ?? {};
    const signature = [
        remapAtlasVariant ? 'variant' : 'preview',
        `${atlas.role}:${atlas.columns}x${atlas.rows}`,
        `${atlas.resolution.width}x${atlas.resolution.height}:g${atlas.gutterPixels}`,
        `n:${atlas.lighting.normalPolicy}:${String(atlas.lighting.worldUpBlend)}`,
        `a:${atlas.alphaLayout.policy}:${atlas.alphaLayout.channel}`
    ].join(':');
    const config = Object.freeze({ atlas, remapAtlasVariant });
    if (material.userData.grassCardShaderVersion === ATLAS_SHADER_VERSION) {
        material.userData.grassCardShaderSignature = signature;
        material.userData.grassCardShaderConfig = config;
        material.needsUpdate = true;
        return material;
    }
    material.userData.grassCardShaderVersion = ATLAS_SHADER_VERSION;
    material.userData.grassCardShaderSignature = signature;
    material.userData.grassCardShaderConfig = config;
    const previousCacheKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
    material.customProgramCacheKey = () => {
        const activeSignature = material.userData?.grassCardShaderSignature ?? '';
        return `${previousCacheKey ? previousCacheKey() : ''}|grass-card:${ATLAS_SHADER_VERSION}:${activeSignature}`;
    };
    const previousCompile = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile.bind(material) : null;
    material.onBeforeCompile = (shader, renderer) => {
        previousCompile?.(shader, renderer);
        const activeConfig = material.userData?.grassCardShaderConfig ?? config;
        const activeAtlas = activeConfig.atlas;
        if (activeConfig.remapAtlasVariant) {
            shader.uniforms.grassAtlasGrid = { value: new THREE.Vector2(activeAtlas.columns, activeAtlas.rows) };
            shader.uniforms.grassAtlasInset = {
                value: new THREE.Vector2(
                    activeAtlas.gutterPixels / activeAtlas.resolution.width,
                    activeAtlas.gutterPixels / activeAtlas.resolution.height
                )
            };
            shader.vertexShader = replaceRequiredShaderChunk(
                shader.vertexShader,
                '#include <common>',
                [
                    '#include <common>',
                    'attribute float grassAtlasVariant;',
                    'uniform vec2 grassAtlasGrid;',
                    'uniform vec2 grassAtlasInset;'
                ].join('\n'),
                'vertex common'
            );
            shader.vertexShader = replaceRequiredShaderChunk(
                shader.vertexShader,
                '#include <uv_vertex>',
                [
                    '#include <uv_vertex>',
                    'float grassAtlasColumn = mod(floor(grassAtlasVariant + 0.5), grassAtlasGrid.x);',
                    'float grassAtlasRow = floor(floor(grassAtlasVariant + 0.5) / grassAtlasGrid.x);',
                    'vec2 grassAtlasCellScale = vec2(1.0) / grassAtlasGrid;',
                    'vec2 grassAtlasScale = grassAtlasCellScale - grassAtlasInset * 2.0;',
                    'vec2 grassAtlasOffset = vec2(grassAtlasColumn, grassAtlasRow) * grassAtlasCellScale + grassAtlasInset;',
                    '#ifdef USE_MAP',
                    'vMapUv = vMapUv * grassAtlasScale + grassAtlasOffset;',
                    '#endif',
                    '#ifdef USE_NORMALMAP',
                    'vNormalMapUv = vNormalMapUv * grassAtlasScale + grassAtlasOffset;',
                    '#endif',
                    '#ifdef USE_ROUGHNESSMAP',
                    'vRoughnessMapUv = vRoughnessMapUv * grassAtlasScale + grassAtlasOffset;',
                    '#endif',
                    '#ifdef USE_AOMAP',
                    'vAoMapUv = vAoMapUv * grassAtlasScale + grassAtlasOffset;',
                    '#endif',
                    '#ifdef USE_ALPHAMAP',
                    'vAlphaMapUv = vAlphaMapUv * grassAtlasScale + grassAtlasOffset;',
                    '#endif'
                ].join('\n'),
                'vertex UV'
            );
        }
        if (activeAtlas.lighting.normalPolicy === LOW_CUT_GRASS_NORMAL_POLICY.WORLD_UP_BLEND) {
            shader.uniforms.grassWorldUpNormalBlend = { value: activeAtlas.lighting.worldUpBlend };
            shader.fragmentShader = replaceRequiredShaderChunk(
                shader.fragmentShader,
                '#include <common>',
                [
                    '#include <common>',
                    'uniform float grassWorldUpNormalBlend;'
                ].join('\n'),
                'fragment common'
            );
            shader.fragmentShader = replaceRequiredShaderChunk(
                shader.fragmentShader,
                '#include <normal_fragment_maps>',
                [
                    '#include <normal_fragment_maps>',
                    'if (grassWorldUpNormalBlend > 0.0) {',
                    '    vec3 grassWorldUpViewNormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));',
                    '    normal = normalize(mix(normal, grassWorldUpViewNormal, grassWorldUpNormalBlend));',
                    '}'
                ].join('\n'),
                'fragment normal-map'
            );
        }
        material.userData.grassCardShaderCompiledSignature = material.userData.grassCardShaderSignature;
        material.userData.grassCardShaderCompiledAlphaLayout = activeAtlas.alphaLayout.policy;
        material.userData.grassCardShaderCompiledNormalPolicy = activeAtlas.lighting.normalPolicy;
    };
    material.needsUpdate = true;
    return material;
}

export function applyGrassAtlasPreviewShader(
    material,
    atlasContract = LOW_CUT_GRASS_ASSET_FAMILY.atlases[LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER]
) {
    return applyGrassCardShader(material, atlasContract, { remapAtlasVariant: false });
}

export function applyGrassClusterAtlasVariantShader(
    material,
    atlasContract = LOW_CUT_GRASS_ASSET_FAMILY.atlases[LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER]
) {
    return applyGrassCardShader(material, atlasContract, { remapAtlasVariant: true });
}

export class GrassMidClusterSystem {
    constructor({ parent, terrainMesh, terrainGrid, getExclusionRects, material } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassMidClusterSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassMidClusterSystem';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._getExclusionRects = typeof getExclusionRects === 'function' ? getExclusionRects : (() => []);
        this._material = material?.isMaterial ? material : null;
        this._config = sanitizeGrassMidClusterConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._mesh = null;
        this._visibleKeys = new Set();
        this._layoutKey = '';
        this._lastAngleScale = 1;
        this._stats = {
            bufferUpdates: 0,
            stationaryFrames: 0,
            transitionPatches: 0,
            rejectedPatches: 0,
            geometryBeyondCutoff: 0,
            maxVisibleEffectiveDistanceMeters: 0
        };
    }

    attach(parent) {
        if (!parent?.isObject3D) throw new Error('[GrassMidClusterSystem] A THREE.Object3D parent is required.');
        if (this.group.parent !== parent) parent.add(this.group);
    }

    setTerrain({ terrainMesh, terrainGrid } = {}) {
        this._terrainMesh = terrainMesh ?? this._terrainMesh;
        this._terrainGrid = terrainGrid ?? this._terrainGrid;
        this._invalidate();
    }

    setMaterial(material) {
        if (!material?.isMaterial) throw new Error('[GrassMidClusterSystem] A material is required.');
        this._material = material;
        if (this._mesh) this._mesh.material = material;
    }

    setConfig(value) {
        const next = sanitizeGrassMidClusterConfig(value);
        if (JSON.stringify(next) !== JSON.stringify(this._config)) {
            this._config = next;
            this._disposeMesh();
            this._invalidate();
        }
    }

    setAutoLodConfig(value) {
        const next = sanitizeGrassAutoLodConfig(value);
        if (JSON.stringify(next) !== JSON.stringify(this._autoLod)) {
            this._autoLod = next;
            this._invalidate();
        }
    }

    update({ camera, viewAngleDeg = 0 } = {}) {
        const grid = this._terrainGrid;
        const config = this._config;
        const radius = getGrassAutoLodCandidateRadius(this._autoLod, 'cluster', viewAngleDeg);
        if (!config.enabled || !camera?.isCamera || !grid || !this._material || radius <= 0) {
            this.group.visible = false;
            if (this._mesh) this._mesh.count = 0;
            this._visibleKeys.clear();
            this._stats.geometryBeyondCutoff = 0;
            this._stats.maxVisibleEffectiveDistanceMeters = 0;
            return;
        }

        const centerCellX = Math.floor(camera.position.x / config.patchSizeMeters);
        const centerCellZ = Math.floor(camera.position.z / config.patchSizeMeters);
        const angleBucket = Math.round(Number(viewAngleDeg) * 2) / 2;
        const exclusions = this._getExclusionRects();
        const layoutKey = `${centerCellX},${centerCellZ}|${angleBucket}|${JSON.stringify(this._autoLod)}|${JSON.stringify(exclusions)}`;
        if (layoutKey === this._layoutKey) {
            this._stats.stationaryFrames++;
            return;
        }

        const minX = Number(grid.minX);
        const minZ = Number(grid.minZ);
        const maxX = minX + Number(grid.widthTiles) * Number(grid.tileSize);
        const maxZ = minZ + Number(grid.depthTiles) * Number(grid.tileSize);
        const cellRadius = Math.ceil((radius + config.patchSizeMeters) / config.patchSizeMeters);
        const descriptors = [];
        const nextVisibleKeys = new Set();
        let transitionPatches = 0;
        let rejectedPatches = 0;
        let geometryBeyondCutoff = 0;
        let maxVisibleEffectiveDistanceMeters = 0;

        for (let cellZ = centerCellZ - cellRadius; cellZ <= centerCellZ + cellRadius; cellZ++) {
            for (let cellX = centerCellX - cellRadius; cellX <= centerCellX + cellRadius; cellX++) {
                const x = (cellX + 0.5) * config.patchSizeMeters;
                const z = (cellZ + 0.5) * config.patchSizeMeters;
                if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
                const dx = x - camera.position.x;
                const dz = z - camera.position.z;
                const distance = Math.hypot(dx, dz);
                if (distance > radius + config.patchSizeMeters) continue;
                if (exclusions.some((rect) => x >= Number(rect?.x0) && x <= Number(rect?.x1) && z >= Number(rect?.z0) && z <= Number(rect?.z1))) {
                    rejectedPatches++;
                    continue;
                }
                const key = `${cellX},${cellZ}`;
                const evaluation = evaluateGrassAutoLod({ distanceMeters: distance, viewAngleDeg, config: this._autoLod });
                if (evaluation.weights.cluster > 0 && evaluation.weights.cluster < 1) transitionPatches++;
                const visible = resolveGrassAutoLodMaskedVisibility({
                    weight: evaluation.weights.cluster,
                    stableSample: getGrassAutoLodStableSample(key, 'cluster'),
                    previousVisible: this._visibleKeys.has(key),
                    config: this._autoLod
                });
                if (!visible) continue;
                if (evaluation.beyondGeometryCutoff) geometryBeyondCutoff++;
                maxVisibleEffectiveDistanceMeters = Math.max(maxVisibleEffectiveDistanceMeters, evaluation.effectiveDistanceMeters);
                const random = makeRng(`${config.seed}|${key}`);
                descriptors.push({
                    key,
                    x,
                    z,
                    y: sampleTerrainHeight(this._terrainMesh, grid, x, z) + config.yOffsetMeters,
                    yaw: random() * Math.PI * 2,
                    scale: 1 + (random() * 2 - 1) * config.scaleVariation,
                    brightness: 1 + (random() * 2 - 1) * config.brightnessVariation,
                    variant: Math.floor(random() * config.atlasVariants)
                });
                nextVisibleKeys.add(key);
            }
        }

        descriptors.sort((a, b) => a.key.localeCompare(b.key));
        this._writeDescriptors(descriptors);
        this._visibleKeys = nextVisibleKeys;
        this._layoutKey = layoutKey;
        this._lastAngleScale = descriptors.length
            ? evaluateGrassAutoLod({ distanceMeters: 0, viewAngleDeg, config: this._autoLod }).angleScale
            : 1;
        this._stats.bufferUpdates++;
        this._stats.transitionPatches = transitionPatches;
        this._stats.rejectedPatches = rejectedPatches;
        this._stats.geometryBeyondCutoff = geometryBeyondCutoff;
        this._stats.maxVisibleEffectiveDistanceMeters = maxVisibleEffectiveDistanceMeters;
        this.group.visible = true;
    }

    getStats() {
        const instances = this._mesh?.visible ? Math.max(0, this._mesh.count | 0) : 0;
        const atlasChannelRoles = Object.values(this._material?.userData?.grassClusterAtlasMaps ?? {})
            .filter((value) => typeof value === 'string' && value);
        return {
            enabled: this._config.enabled,
            instances,
            cardsPerPatch: this._config.cardsPerPatch,
            trianglesPerPatch: this._config.cardsPerPatch * 2,
            triangles: instances * this._config.cardsPerPatch * 2,
            drawCalls: instances > 0 ? 1 : 0,
            materialPaths: instances > 0 ? 1 : 0,
            atlasVariants: this._config.atlasVariants,
            atlasMaps: Object.freeze(atlasChannelRoles.length
                ? atlasChannelRoles
                : ['clusterColor', 'clusterNormal', 'clusterRoughness', 'clusterAo']),
            atlasRole: this._material?.userData?.grassClusterAtlasRole ?? null,
            resolvedMaterialId: this._material?.userData?.resolvedMaterialId ?? null,
            alphaCutoff: Number(this._material?.alphaTest) || 0,
            alphaToCoverage: this._material?.alphaToCoverage === true,
            transparent: this._material?.transparent === true,
            frustumCulled: this._mesh?.frustumCulled !== false,
            castShadow: this._mesh?.castShadow === true,
            angleScale: this._lastAngleScale,
            ...this._stats
        };
    }

    dispose() {
        this._disposeMesh();
        this._material?.dispose?.();
        this._material = null;
        this.group.removeFromParent();
    }

    _invalidate() {
        this._layoutKey = '';
    }

    _disposeMesh() {
        this._mesh?.geometry?.dispose?.();
        this._mesh?.removeFromParent?.();
        this._mesh = null;
        this._visibleKeys.clear();
    }

    _ensureMesh(count) {
        const required = Math.max(1, count);
        const existingCapacity = this._mesh?.instanceMatrix?.count ?? 0;
        if (this._mesh?.isInstancedMesh && existingCapacity >= required) return this._mesh;
        this._disposeMesh();
        const capacity = nextPowerOfTwo(required);
        const geometry = createClusterGeometry(this._config, capacity);
        const mesh = new THREE.InstancedMesh(geometry, this._material, capacity);
        mesh.name = 'GrassMidClusterBatch';
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = 4;
        this.group.add(mesh);
        this._mesh = mesh;
        return mesh;
    }

    _writeDescriptors(descriptors) {
        if (!descriptors.length) {
            if (this._mesh) {
                this._mesh.count = 0;
                this._mesh.visible = false;
            }
            return;
        }
        const mesh = this._ensureMesh(descriptors.length);
        const matrices = mesh.instanceMatrix.array;
        const colors = mesh.instanceColor.array;
        const variants = mesh.geometry.attributes.grassAtlasVariant;
        for (let index = 0; index < descriptors.length; index++) {
            const descriptor = descriptors[index];
            writeTransform(matrices, index * 16, descriptor);
            colors[index * 3] = descriptor.brightness;
            colors[index * 3 + 1] = descriptor.brightness;
            colors[index * 3 + 2] = descriptor.brightness;
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
}
