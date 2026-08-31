// Renders the automatic billboard and middle grass tiers as two atlas-backed instanced batches.
// @ts-check

import * as THREE from 'three';
import {
    createGrassAutoLodFieldUnitHandoff,
    evaluateGrassAutoLod,
    getGrassAutoLodCandidateRadius,
    resolveGrassAutoLodUnitVisibility,
    sanitizeGrassAutoLodConfig
} from '../../../app/grass/GrassAutoLodContract.js';
import {
    createGrassCohesiveFieldLayout,
    sanitizeGrassCohesiveFieldConfig
} from '../../../app/grass/GrassCohesiveFieldLayout.js';
import {
    LOW_CUT_GRASS_ASSET_FAMILY,
    LOW_CUT_GRASS_ATLAS_ROLE,
    LOW_CUT_GRASS_NORMAL_POLICY
} from '../../content3d/catalogs/LowCutGrassMaterialCatalog.js';
import { sanitizeGrassMidClusterConfig } from './GrassMidClusterConfig.js';

const ATLAS_SHADER_VERSION = 6;
const EPS = 1e-7;

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

function createClusterGeometry(config, capacity, tier) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const halfWidth = config.widthMeters * 0.5;
    const baseY = -config.baseSinkMeters;
    const tipY = baseY + config.heightMeters;
    for (let card = 0; card < config.cardsPerUnit; card++) {
        const angle = card * Math.PI / config.cardsPerUnit;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const vertex = positions.length / 3;
        positions.push(
            -halfWidth * cosine, baseY, halfWidth * sine,
            halfWidth * cosine, baseY, -halfWidth * sine,
            halfWidth * cosine, tipY, -halfWidth * sine,
            -halfWidth * cosine, tipY, halfWidth * sine
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
    geometry.name = `GrassCohesiveField_${tier}_${config.cardsPerUnit}Cards`;
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

function normalizeCardFacingDelta(angle) {
    const halfTurn = Math.PI;
    const quarterTurn = Math.PI * 0.5;
    return ((angle + quarterTurn) % halfTurn + halfTurn) % halfTurn - quarterTurn;
}

function resolveBillboardYaw(worldYaw, cameraX, cameraZ, x, z) {
    const cameraFacingYaw = Math.atan2(cameraX - x, cameraZ - z);
    const facingDelta = normalizeCardFacingDelta(cameraFacingYaw - worldYaw);
    const maximumBias = Math.PI * 11 / 24;
    // Retain enough deterministic world orientation to keep neighboring card
    // tops from collapsing into camera-aligned horizontal rows.
    const boundedBias = Math.max(-maximumBias, Math.min(maximumBias, facingDelta * 0.65));
    return worldYaw + boundedBias;
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

/**
 * V2 cohesive grass renderer. Billboard and middle tiers share one deterministic
 * one-metre world layout and one material, but remain separate global batches.
 */
export class GrassMidClusterSystem {
    constructor({
        parent,
        terrainMesh,
        terrainGrid,
        getExclusionRects,
        getCoverageDefinition,
        getCoverageConfig,
        material
    } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassMidClusterSystem] A THREE.Object3D parent is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassCohesiveFieldSystemV2';
        parent.add(this.group);
        this._terrainMesh = terrainMesh ?? null;
        this._terrainGrid = terrainGrid ?? null;
        this._getExclusionRects = typeof getExclusionRects === 'function' ? getExclusionRects : (() => []);
        this._getCoverageDefinition = typeof getCoverageDefinition === 'function' ? getCoverageDefinition : (() => null);
        this._getCoverageConfig = typeof getCoverageConfig === 'function' ? getCoverageConfig : (() => null);
        this._coverageDefinition = null;
        this._coverageConfig = null;
        this._coverageInputKey = '';
        this._material = material?.isMaterial ? material : null;
        this._config = sanitizeGrassMidClusterConfig(null);
        this._autoLod = sanitizeGrassAutoLodConfig(null);
        this._meshes = { billboard: null, middle: null };
        this._visibleKeys = { billboard: new Set(), middle: new Set() };
        this._batchSignatures = { billboard: '', middle: '' };
        this._coverageSampleCache = new Map();
        this._layout = null;
        this._layoutInputKey = '';
        this._frameKey = '';
        this._evidenceMode = 'auto';
        this._lastAngleScale = 1;
        this._lastBufferUpdates = 0;
        this._geometryBeyondCutoffByTier = { billboard: 0, middle: 0 };
        this._stats = {
            bufferUpdates: 0,
            stationaryFrames: 0,
            layoutCacheHits: 0,
            layoutCacheMisses: 0,
            transitionUnits: 0,
            overlapUnits: 0,
            cutoffRejectedUnits: 0,
            cutoffClampedUnits: 0,
            cutoffCulledUnits: 0,
            rejectedUnits: 0,
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
        this._invalidateLayout();
    }

    setMaterial(material) {
        if (!material?.isMaterial) throw new Error('[GrassMidClusterSystem] A material is required.');
        this._material = material;
        for (const mesh of Object.values(this._meshes)) {
            if (mesh) mesh.material = material;
        }
        this._frameKey = '';
    }

    setConfig(value) {
        const next = sanitizeGrassMidClusterConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._config)) return;
        this._config = next;
        this._disposeMeshes();
        this._invalidateLayout();
    }

    setAutoLodConfig(value) {
        const next = sanitizeGrassAutoLodConfig(value);
        if (JSON.stringify(next) === JSON.stringify(this._autoLod)) return;
        this._autoLod = next;
        this.resetLodHysteresis();
    }

    setCoverageInput({ definition = null, config = null } = {}) {
        const nextKey = [
            String(definition?.boundarySignature ?? 'none'),
            String(definition?.sourceLoopIdentity ?? ''),
            JSON.stringify(definition?.bounds ?? null),
            JSON.stringify(config ?? null)
        ].join('|');
        if (
            nextKey === this._coverageInputKey
            && definition === this._coverageDefinition
            && config === this._coverageConfig
        ) return;
        this._coverageDefinition = definition;
        this._coverageConfig = config;
        this._coverageInputKey = nextKey;
        this._coverageSampleCache.clear();
        this._invalidateLayout();
    }

    setEvidenceMode(mode) {
        const requested = String(mode ?? 'auto');
        const next = requested === 'billboard' || requested === 'middle' || requested === 'texture_only'
            ? requested
            : 'auto';
        if (next === this._evidenceMode) return;
        this._evidenceMode = next;
        this.resetLodHysteresis();
    }

    resetLodHysteresis() {
        this._visibleKeys.billboard.clear();
        this._visibleKeys.middle.clear();
        this._batchSignatures.billboard = '';
        this._batchSignatures.middle = '';
        this._frameKey = '';
    }

    update({ camera, viewAngleDeg = 0 } = {}) {
        const grid = this._terrainGrid;
        const angle = Number(viewAngleDeg) || 0;
        const billboardRadius = getGrassAutoLodCandidateRadius(this._autoLod, 'billboard', angle);
        const middleRadius = getGrassAutoLodCandidateRadius(this._autoLod, 'middle', angle);
        const evidenceRadius = this._evidenceMode === 'billboard' || this._evidenceMode === 'middle'
            ? this._config.radiusMeters
            : 0;
        const radius = Math.max(billboardRadius, middleRadius, evidenceRadius);
        if (!this._config.enabled || !camera?.isCamera || !grid || !this._material || radius <= 0) {
            this._hideAll();
            return;
        }
        const terrainBounds = this._getTerrainBounds(grid);
        if (!terrainBounds) {
            this._hideAll();
            return;
        }
        const definition = this._coverageDefinition ?? this._getCoverageDefinition();
        const coverageConfig = this._coverageConfig ?? this._getCoverageConfig();
        const exclusions = definition ? [] : this._getExclusionRects();
        const centerCellX = Math.floor(camera.position.x);
        const centerCellZ = Math.floor(camera.position.z);
        const layoutConfig = sanitizeGrassCohesiveFieldConfig({
            seed: this._config.seed,
            radiusMeters: Math.max(this._config.radiusMeters, radius),
            rootJitterFactor: this._config.rootJitterFactor,
            boundarySafetyMeters: this._config.boundarySafetyMeters,
            scaleVariation: this._config.scaleVariation,
            atlasVariants: this._config.atlasVariants,
            billboard: this._config.billboard,
            middle: this._config.middle
        });
        const layoutInputKey = [
            centerCellX,
            centerCellZ,
            JSON.stringify(layoutConfig),
            String(definition?.boundarySignature ?? 'compatibility'),
            String(definition?.sourceLoopIdentity ?? ''),
            JSON.stringify(definition?.bounds ?? terrainBounds),
            JSON.stringify(coverageConfig ?? null),
            JSON.stringify(exclusions ?? [])
        ].join('|');
        if (layoutInputKey !== this._layoutInputKey) {
            this._layout = createGrassCohesiveFieldLayout({
                cameraX: camera.position.x,
                cameraZ: camera.position.z,
                terrainBounds,
                config: layoutConfig,
                coverageDefinition: definition,
                coverageConfig,
                exclusionRects: exclusions,
                coverageSampleCache: this._coverageSampleCache
            });
            this._layoutInputKey = layoutInputKey;
            this._frameKey = '';
            this._stats.layoutCacheMisses++;
        } else {
            this._stats.layoutCacheHits++;
        }
        this._updateVisibleBatches(camera, angle);
    }

    _updateVisibleBatches(camera, viewAngleDeg) {
        const layout = this._layout;
        if (!layout) {
            this._hideAll();
            return;
        }
        const frameKey = [
            layout.placementSignature,
            camera.position.x.toFixed(6),
            camera.position.z.toFixed(6),
            Number(viewAngleDeg).toFixed(4),
            JSON.stringify(this._autoLod),
            this._evidenceMode
        ].join('|');
        if (frameKey === this._frameKey) {
            this._lastBufferUpdates = 0;
            this._stats.stationaryFrames++;
            return;
        }

        const descriptors = { billboard: [], middle: [] };
        const nextVisibleKeys = { billboard: new Set(), middle: new Set() };
        let transitionUnits = 0;
        let cutoffClampedUnits = 0;
        let cutoffCulledUnits = 0;
        let geometryBeyondCutoff = 0;
        const geometryBeyondCutoffByTier = { billboard: 0, middle: 0 };
        let maxVisibleEffectiveDistanceMeters = 0;
        let lastAngleScale = 1;

        for (const unit of layout.units) {
            const handoff = createGrassAutoLodFieldUnitHandoff({
                unitKey: unit.key,
                fieldSeed: this._config.seed,
                boundarySignature: layout.boundarySignature,
                cameraX: camera.position.x,
                cameraZ: camera.position.z
            });
            const evaluation = evaluateGrassAutoLod({
                distanceMeters: handoff.distanceMeters,
                viewAngleDeg,
                config: this._autoLod
            });
            const renderRootDistanceMeters = Math.hypot(
                unit.x - camera.position.x,
                unit.z - camera.position.z
            );
            const renderRootEffectiveDistanceMeters = renderRootDistanceMeters * evaluation.angleScale;
            lastAngleScale = evaluation.angleScale;
            if (
                evaluation.transitionState === 'near_to_billboard'
                || evaluation.transitionState === 'billboard_to_middle'
                || evaluation.transitionState === 'middle_to_texture'
            ) transitionUnits++;

            for (const tier of ['billboard', 'middle']) {
                const tierUnit = unit[tier];
                if (!tierUnit?.represented) continue;
                let visible = false;
                if (this._evidenceMode === tier) {
                    visible = !evaluation.beyondGeometryCutoff;
                } else if (this._evidenceMode === 'auto') {
                    visible = resolveGrassAutoLodUnitVisibility({
                        evaluation,
                        tier,
                        unitKey: handoff.identity,
                        previousVisible: this._visibleKeys[tier].has(unit.key),
                        config: this._autoLod
                    });
                }
                if (!visible) continue;
                const remainingWorldMeters = Math.max(
                    0,
                    (this._autoLod.middleEndMeters - renderRootEffectiveDistanceMeters)
                        / Math.max(EPS, evaluation.angleScale)
                        - EPS
                );
                const cutoffFootprintScale = Math.min(
                    1,
                    remainingWorldMeters / Math.max(EPS, tierUnit.footprintRadiusMeters)
                );
                if (cutoffFootprintScale <= EPS) {
                    cutoffCulledUnits++;
                    continue;
                }
                if (cutoffFootprintScale < 1 - EPS) cutoffClampedUnits++;
                const footprintEffectiveDistanceMeters = renderRootEffectiveDistanceMeters
                    + tierUnit.footprintRadiusMeters * cutoffFootprintScale * evaluation.angleScale;
                if (footprintEffectiveDistanceMeters >= this._autoLod.middleEndMeters) {
                    geometryBeyondCutoff++;
                    geometryBeyondCutoffByTier[tier]++;
                    continue;
                }
                maxVisibleEffectiveDistanceMeters = Math.max(
                    maxVisibleEffectiveDistanceMeters,
                    footprintEffectiveDistanceMeters
                );
                descriptors[tier].push({
                    key: unit.key,
                    x: unit.x,
                    z: unit.z,
                    y: sampleTerrainHeight(this._terrainMesh, this._terrainGrid, unit.x, unit.z)
                        + this._config.yOffsetMeters,
                    yaw: tier === 'billboard'
                        ? resolveBillboardYaw(
                            unit.yawRadians,
                            camera.position.x,
                            camera.position.z,
                            unit.x,
                            unit.z
                        )
                        : unit.yawRadians,
                    scale: unit.scale * tierUnit.footprintScale * cutoffFootprintScale,
                    brightness: this._config[tier].brightnessBias
                        * (1 + (unit.stableSample * 2 - 1) * this._config.brightnessVariation),
                    variant: unit.atlasVariant
                });
                nextVisibleKeys[tier].add(unit.key);
            }
        }

        const billboardUpdated = this._writeTier('billboard', descriptors.billboard);
        const middleUpdated = this._writeTier('middle', descriptors.middle);
        let overlapUnits = 0;
        for (const key of nextVisibleKeys.billboard) {
            if (nextVisibleKeys.middle.has(key)) overlapUnits++;
        }
        this._lastBufferUpdates = Number(billboardUpdated) + Number(middleUpdated);
        this._stats.bufferUpdates += this._lastBufferUpdates;
        this._visibleKeys = nextVisibleKeys;
        this._frameKey = frameKey;
        this._lastAngleScale = lastAngleScale;
        this._stats.transitionUnits = transitionUnits;
        this._stats.overlapUnits = overlapUnits;
        this._stats.cutoffRejectedUnits = 0;
        this._stats.cutoffClampedUnits = cutoffClampedUnits;
        this._stats.cutoffCulledUnits = cutoffCulledUnits;
        this._stats.rejectedUnits = Number(layout.diagnostics?.rejectedUnits) || 0;
        this._stats.geometryBeyondCutoff = geometryBeyondCutoff;
        this._geometryBeyondCutoffByTier = geometryBeyondCutoffByTier;
        this._stats.maxVisibleEffectiveDistanceMeters = maxVisibleEffectiveDistanceMeters;
        this.group.visible = descriptors.billboard.length > 0 || descriptors.middle.length > 0;
    }

    getStats() {
        const tierStats = {};
        for (const tier of ['billboard', 'middle']) {
            const mesh = this._meshes[tier];
            const instances = mesh?.visible ? Math.max(0, mesh.count | 0) : 0;
            const cardsPerUnit = this._config[tier].cardsPerUnit;
            const tierDiagnostics = this._layout?.tiers?.[tier]?.diagnostics ?? null;
            tierStats[tier] = Object.freeze({
                instances,
                visibleUnits: instances,
                candidateUnits: Number(tierDiagnostics?.candidateUnits) || 0,
                cardsPerUnit,
                trianglesPerUnit: cardsPerUnit * 2,
                renderedBaseOffsetMeters: this._config.yOffsetMeters - this._config[tier].baseSinkMeters,
                renderedTipOffsetMeters: this._config.yOffsetMeters
                    - this._config[tier].baseSinkMeters
                    + this._config[tier].heightMeters,
                triangles: instances * cardsPerUnit * 2,
                drawCalls: instances > 0 ? 1 : 0,
                batches: instances > 0 ? 1 : 0,
                castShadow: mesh?.castShadow === true,
                frustumCulled: mesh?.frustumCulled !== false,
                geometryBeyondCutoff: this._geometryBeyondCutoffByTier[tier],
                eligibleUnits: Number(tierDiagnostics?.eligibleUnits) || 0,
                representedUnits: Number(tierDiagnostics?.representedUnits) || 0,
                unrepresentedEligibleUnits: Number(tierDiagnostics?.unrepresentedEligibleUnits) || 0,
                eligibleAreaSquareMeters: Number(tierDiagnostics?.eligibleAreaSquareMeters) || 0,
                representedAreaSquareMeters: Number(tierDiagnostics?.representedAreaSquareMeters) || 0,
                missingAreaSquareMeters: Number(tierDiagnostics?.missingAreaSquareMeters) || 0,
                exactEnvelopeFailures: Number(tierDiagnostics?.exactEnvelopeFailures) || 0,
                footprintClampedUnits: Number(tierDiagnostics?.footprintClampedUnits) || 0,
                diagnostics: tierDiagnostics
            });
        }
        const instances = tierStats.billboard.instances + tierStats.middle.instances;
        const triangles = tierStats.billboard.triangles + tierStats.middle.triangles;
        const drawCalls = tierStats.billboard.drawCalls + tierStats.middle.drawCalls;
        const atlasChannelRoles = Object.values(this._material?.userData?.grassClusterAtlasMaps ?? {})
            .filter((value) => typeof value === 'string' && value);
        const diagnostics = this._layout?.diagnostics ?? null;
        return {
            enabled: this._config.enabled,
            schema: 'bus-simulator.grass-cohesive-field-renderer',
            version: 2,
            instances,
            triangles,
            drawCalls,
            batches: drawCalls,
            materialPaths: drawCalls > 0 ? 1 : 0,
            billboard: tierStats.billboard,
            middle: tierStats.middle,
            cardsPerPatch: this._config.middle.cardsPerUnit,
            trianglesPerPatch: this._config.middle.cardsPerUnit * 2,
            atlasVariants: this._config.atlasVariants,
            atlasMaps: Object.freeze(atlasChannelRoles.length
                ? atlasChannelRoles
                : ['clusterColor', 'clusterNormal', 'clusterRoughness', 'clusterAo']),
            atlasRole: this._material?.userData?.grassClusterAtlasRole ?? null,
            resolvedMaterialId: this._material?.userData?.resolvedMaterialId ?? null,
            alphaCutoff: Number(this._material?.alphaTest) || 0,
            alphaToCoverage: this._material?.alphaToCoverage === true,
            transparent: this._material?.transparent === true,
            frustumCulled: Object.values(this._meshes).every((mesh) => !mesh || mesh.frustumCulled !== false),
            castShadow: Object.values(this._meshes).some((mesh) => mesh?.castShadow === true),
            angleScale: this._lastAngleScale,
            lastBufferUpdates: this._lastBufferUpdates,
            totalBufferUpdates: this._stats.bufferUpdates,
            cacheHits: this._stats.layoutCacheHits,
            cacheMisses: this._stats.layoutCacheMisses,
            coverageMode: this._layout?.coverageMode ?? null,
            coverageIdentity: this._layout?.coverageIdentity ?? null,
            boundarySignature: this._layout?.boundarySignature ?? null,
            sourceLoopIdentity: this._layout?.sourceLoopIdentity ?? null,
            placementSignature: this._layout?.placementSignature ?? null,
            candidateUnits: Number(diagnostics?.candidateUnits) || 0,
            eligibleUnits: Number(diagnostics?.eligibleUnits) || 0,
            representedUnits: Number(diagnostics?.representedUnits) || 0,
            unrepresentedEligibleUnits: Number(diagnostics?.unrepresentedEligibleUnits) || 0,
            eligibleAreaSquareMeters: Number(diagnostics?.eligibleAreaSquareMeters) || 0,
            representedAreaSquareMeters: Number(diagnostics?.representedAreaSquareMeters) || 0,
            missingAreaSquareMeters: Number(diagnostics?.missingAreaSquareMeters) || 0,
            rejectedByKind: Object.freeze({ ...(diagnostics?.rejectedByKind ?? {}) }),
            exactPostcheckFailures: Number(diagnostics?.exactPostcheckFailures) || 0,
            exactEnvelopeFailures: Number(diagnostics?.exactEnvelopeFailures) || 0,
            boundaryCompletionProbes: Number(diagnostics?.boundaryCompletionProbes) || 0,
            boundaryCompletionSelectedUnits: Number(diagnostics?.boundaryCompletionSelectedUnits) || 0,
            footprintClampedUnits: (
                Number(tierStats.billboard.diagnostics?.footprintClampedUnits)
                + Number(tierStats.middle.diagnostics?.footprintClampedUnits)
            ) || 0,
            evidenceMode: this._evidenceMode,
            ...this._stats
        };
    }

    dispose() {
        this._disposeMeshes();
        this._material = null;
        this._coverageSampleCache.clear();
        this.group.removeFromParent();
    }

    _getTerrainBounds(grid) {
        const minX = Number(grid?.minX);
        const minZ = Number(grid?.minZ);
        const maxX = minX + Number(grid?.widthTiles) * Number(grid?.tileSize);
        const maxZ = minZ + Number(grid?.depthTiles) * Number(grid?.tileSize);
        if (![minX, minZ, maxX, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) return null;
        return { minX, minZ, maxX, maxZ };
    }

    _invalidateLayout() {
        this._layout = null;
        this._layoutInputKey = '';
        this._frameKey = '';
        this._batchSignatures.billboard = '';
        this._batchSignatures.middle = '';
    }

    _hideAll() {
        for (const mesh of Object.values(this._meshes)) {
            if (mesh) {
                mesh.count = 0;
                mesh.visible = false;
            }
        }
        this.group.visible = false;
        this._visibleKeys.billboard.clear();
        this._visibleKeys.middle.clear();
        this._batchSignatures.billboard = '';
        this._batchSignatures.middle = '';
        this._lastBufferUpdates = 0;
        this._geometryBeyondCutoffByTier = { billboard: 0, middle: 0 };
        this._stats.cutoffRejectedUnits = 0;
        this._stats.cutoffClampedUnits = 0;
        this._stats.cutoffCulledUnits = 0;
        this._stats.geometryBeyondCutoff = 0;
        this._stats.maxVisibleEffectiveDistanceMeters = 0;
    }

    _ensureBillboardMesh(count) {
        const required = Math.max(1, count);
        const current = this._meshes.billboard;
        if (current?.isInstancedMesh && current.instanceMatrix.count >= required) return current;
        this._disposeTier('billboard');
        const capacity = nextPowerOfTwo(required);
        const geometry = createClusterGeometry(this._config.billboard, capacity, 'billboard');
        const mesh = new THREE.InstancedMesh(geometry, this._material, capacity);
        this._configureMesh(mesh, 'billboard', capacity);
        this._meshes.billboard = mesh;
        return mesh;
    }

    _ensureMiddleMesh(count) {
        const required = Math.max(1, count);
        const current = this._meshes.middle;
        if (current?.isInstancedMesh && current.instanceMatrix.count >= required) return current;
        this._disposeTier('middle');
        const capacity = nextPowerOfTwo(required);
        const geometry = createClusterGeometry(this._config.middle, capacity, 'middle');
        const mesh = new THREE.InstancedMesh(geometry, this._material, capacity);
        this._configureMesh(mesh, 'middle', capacity);
        this._meshes.middle = mesh;
        return mesh;
    }

    _configureMesh(mesh, tier, capacity) {
        mesh.name = tier === 'billboard' ? 'GrassBillboardFieldBatch' : 'GrassMiddleFieldBatch';
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        mesh.renderOrder = tier === 'billboard' ? 4 : 5;
        this.group.add(mesh);
    }

    _writeTier(tier, descriptors) {
        descriptors.sort((a, b) => a.key.localeCompare(b.key));
        const signature = [
            this._layout?.placementSignature ?? 'none',
            tier,
            descriptors.map((descriptor) => tier === 'billboard'
                ? `${descriptor.key}:${descriptor.yaw.toFixed(5)}:${descriptor.scale.toFixed(6)}`
                : `${descriptor.key}:${descriptor.scale.toFixed(6)}`).join(',')
        ].join('|');
        if (signature === this._batchSignatures[tier]) return false;
        this._batchSignatures[tier] = signature;
        if (!descriptors.length) {
            const existing = this._meshes[tier];
            if (existing) {
                existing.count = 0;
                existing.visible = false;
            }
            return true;
        }
        const mesh = tier === 'billboard'
            ? this._ensureBillboardMesh(descriptors.length)
            : this._ensureMiddleMesh(descriptors.length);
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
        return true;
    }

    _disposeTier(tier) {
        const mesh = this._meshes[tier];
        mesh?.geometry?.dispose?.();
        mesh?.removeFromParent?.();
        this._meshes[tier] = null;
        this._batchSignatures[tier] = '';
        this._visibleKeys[tier].clear();
    }

    _disposeMeshes() {
        this._disposeTier('billboard');
        this._disposeTier('middle');
    }
}
