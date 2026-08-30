// Renders the opaque polygon grass cap and one continuous batched root/thatch cut edge.
// @ts-check

import * as THREE from 'three';
import {
    createGrassCoveragePartition,
    createGrassCoverageStaticGeometryConfig,
    sampleGrassCoverageContract,
    sampleGrassRootEligibility,
    sanitizeGrassCoverageConfig
} from '../../../app/grass/GrassCoverageContract.js';
import { makeRng } from './GrassRng.js';

function pushVertex(array, point) {
    array.push(point.x, point.y, point.z);
}

function pushTriangle(positions, uvs, colors, a, b, c, uvA, uvB, uvC, colorA, colorB, colorC) {
    pushVertex(positions, a);
    pushVertex(positions, b);
    pushVertex(positions, c);
    uvs.push(...uvA, ...uvB, ...uvC);
    colors.push(...colorA, ...colorB, ...colorC);
}

function createGeometry(positions, uvs, colors) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function buildSurfaceGeometry(partition, bounds) {
    const contour = partition.contour.map((point) => new THREE.Vector2(point.x, point.z));
    const holes = partition.holeLoops.map((loop) => loop.map((point) => new THREE.Vector2(point.x, point.z)));
    const vertices = [...contour, ...holes.flat()];
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const positions = [];
    const uvs = [];
    const colors = [];
    const y = partition.config.structuralBaseHeightMeters;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const color = [1, 1, 1];
    const uv = (point) => [(point.x - bounds.minX) / width, (point.y - bounds.minZ) / depth];
    for (const face of faces) {
        const a2 = vertices[face[0]];
        const b2 = vertices[face[1]];
        const c2 = vertices[face[2]];
        const a = { x: a2.x, y, z: a2.y };
        const b = { x: b2.x, y, z: b2.y };
        const c = { x: c2.x, y, z: c2.y };
        pushTriangle(positions, uvs, colors, a, b, c, uv(a2), uv(b2), uv(c2), color, color, color);
    }
    const geometry = createGeometry(positions, uvs, colors);
    geometry.name = 'GrassCoverageOpaquePolygonCap';
    geometry.userData.grassCoverageCounts = Object.freeze({ capTriangles: faces.length });
    return geometry;
}

function pushCutBlade(positions, uvs, colors, center, axis, tip, brightness) {
    const halfWidth = 0.0012;
    const rootColor = [0.62 * brightness, 0.74 * brightness, 0.34 * brightness];
    const tipColor = [0.92 * brightness, 1.0 * brightness, 0.62 * brightness];
    const rootA = { x: center.x - axis.x * halfWidth, y: center.y, z: center.z - axis.z * halfWidth };
    const rootB = { x: center.x + axis.x * halfWidth, y: center.y, z: center.z + axis.z * halfWidth };
    pushTriangle(positions, uvs, colors, rootA, rootB, tip, [0, 0], [1, 0], [0.5, 1], rootColor, rootColor, tipColor);
}

function buildCutEdgeGeometry(partition, seed, definition) {
    const positions = [];
    const uvs = [];
    const colors = [];
    const rootSamples = [];
    const config = partition.config;
    const top = config.structuralBaseHeightMeters;
    const bottomColor = [0.42, 0.34, 0.20];
    const thatchColor = [0.70, 0.78, 0.40];
    let rootThatchTriangles = 0;
    let cutEdgeTriangles = 0;
    let rejectedCutEdgeRoots = 0;

    for (const segment of partition.boundarySegments) {
        const a = { x: segment.a.x, y: 0.0015, z: segment.a.z };
        const b = { x: segment.b.x, y: 0.0015, z: segment.b.z };
        const c = { x: segment.b.x, y: top, z: segment.b.z };
        const d = { x: segment.a.x, y: top, z: segment.a.z };
        pushTriangle(positions, uvs, colors, a, b, c, [0, 0], [1, 0], [1, 1], bottomColor, bottomColor, thatchColor);
        pushTriangle(positions, uvs, colors, a, c, d, [0, 0], [1, 1], [0, 1], bottomColor, thatchColor, thatchColor);
        rootThatchTriangles += 2;

        if (!config.cutEdgeEnabled) continue;
        const count = Math.max(1, Math.ceil(segment.length / config.cutEdgeSpacingMeters));
        const dx = segment.b.x - segment.a.x;
        const dz = segment.b.z - segment.a.z;
        const tangent = { x: dx / segment.length, z: dz / segment.length };
        const diagonalLength = Math.SQRT2;
        const diagonal = {
            x: (tangent.x + segment.grassNormal.x) / diagonalLength,
            z: (tangent.z + segment.grassNormal.z) / diagonalLength
        };
        const random = makeRng(`${seed}|dense-cut-edge:${segment.id}|${count}`);
        for (let index = 0; index < count; index++) {
            const t = Math.min(1, Math.max(0, (index + 0.35 + random() * 0.3) / count));
            const inset = config.cutEdgeInsetMeters * (0.9 + random() * 0.4) + 0.0015;
            const center = {
                x: segment.a.x + dx * t + segment.grassNormal.x * inset,
                y: top,
                z: segment.a.z + dz * t + segment.grassNormal.z * inset
            };
            if (!sampleGrassRootEligibility(definition, center.x, center.z, config)) {
                rejectedCutEdgeRoots++;
                continue;
            }
            const bladeHeight = config.visibleBladeTipMinMeters
                + (config.visibleBladeTipMaxMeters - config.visibleBladeTipMinMeters) * random();
            const forward = inset + 0.003 + random() * 0.005;
            const tangentJitter = (random() - 0.5) * config.cutEdgeSpacingMeters * 0.28;
            const tip = {
                x: segment.a.x + dx * t + segment.grassNormal.x * forward + tangent.x * tangentJitter,
                y: bladeHeight,
                z: segment.a.z + dz * t + segment.grassNormal.z * forward + tangent.z * tangentJitter
            };
            const brightness = 0.82 + random() * 0.2;
            pushCutBlade(positions, uvs, colors, center, tangent, tip, brightness);
            pushCutBlade(positions, uvs, colors, center, diagonal, tip, brightness * 0.94);
            rootSamples.push(Object.freeze({
                x: center.x,
                z: center.z,
                segmentId: segment.id,
                exclusionId: segment.exclusionId,
                kind: segment.kind
            }));
            cutEdgeTriangles += 2;
        }
    }

    const geometry = createGeometry(positions, uvs, colors);
    geometry.name = 'GrassCoverageContinuousCutEdge';
    geometry.userData.grassCoverageCounts = Object.freeze({
        rootThatchTriangles,
        cutEdgeTriangles,
        rejectedCutEdgeRoots
    });
    geometry.userData.grassCoverageRootSamples = Object.freeze(rootSamples);
    return geometry;
}

function createEdgeMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
    });
}

function float32PositionToleranceMeters(x, z) {
    const magnitude = Math.max(1, Math.abs(Number(x) || 0), Math.abs(Number(z) || 0));
    const exponent = Math.floor(Math.log2(magnitude));
    // Two Float32 ULPs distinguish quantized vertices on the polygon itself
    // from geometry that actually crosses a hard boundary at world scale.
    return Math.max(1e-6, 2 ** (exponent - 22));
}

function coverageGeometryConfigKey(config) {
    return JSON.stringify({
        structuralBaseHeightMeters: config.structuralBaseHeightMeters,
        rootClearanceMeters: config.rootClearanceMeters,
        cutEdgeEnabled: config.cutEdgeEnabled,
        cutEdgeSpacingMeters: config.cutEdgeSpacingMeters,
        cutEdgeInsetMeters: config.cutEdgeInsetMeters,
        visibleBladeTipMinMeters: config.visibleBladeTipMinMeters,
        visibleBladeTipMaxMeters: config.visibleBladeTipMaxMeters
    });
}

function measureGeometrySafety(definition, config, surfaceGeometry, edgeGeometry) {
    const safetyConfig = createGrassCoverageStaticGeometryConfig(config);
    let hardExclusionIntrusions = 0;
    let grassOnsetIntrusions = 0;
    let hardExclusionBoundaryContacts = 0;
    let grassOnsetBoundaryContacts = 0;
    let maxHardExclusionBoundaryContactDepthMeters = 0;
    let maxGrassOnsetBoundaryContactDepthMeters = 0;
    let maxPositionQuantizationToleranceMeters = 1e-6;
    let geometrySafetySamples = 0;
    const hardIntrusionsByGeometry = { surfaceVertices: 0, surfaceCentroids: 0, edgeVertices: 0, edgeCentroids: 0 };
    const onsetIntrusionsByGeometry = { surfaceVertices: 0, surfaceCentroids: 0, edgeVertices: 0, edgeCentroids: 0 };
    const geometries = [
        ['surface', surfaceGeometry],
        ['edge', edgeGeometry]
    ];
    const recordSample = (sample, bucket, x, z) => {
        const tolerance = float32PositionToleranceMeters(x, z);
        maxPositionQuantizationToleranceMeters = Math.max(maxPositionQuantizationToleranceMeters, tolerance);
        const sourceDistance = sample.sourceBoundaryDistanceMeters;
        if (sourceDistance !== null && sourceDistance < -tolerance) {
            hardExclusionIntrusions++;
            hardIntrusionsByGeometry[bucket]++;
        } else if (sourceDistance !== null && sourceDistance < -1e-6) {
            hardExclusionBoundaryContacts++;
            maxHardExclusionBoundaryContactDepthMeters = Math.max(
                maxHardExclusionBoundaryContactDepthMeters,
                -sourceDistance
            );
        }
        const onsetDistance = sample.boundaryDistanceMeters;
        if (onsetDistance !== null && onsetDistance < -tolerance) {
            grassOnsetIntrusions++;
            onsetIntrusionsByGeometry[bucket]++;
        } else if (onsetDistance !== null && onsetDistance < -1e-6) {
            grassOnsetBoundaryContacts++;
            maxGrassOnsetBoundaryContactDepthMeters = Math.max(
                maxGrassOnsetBoundaryContactDepthMeters,
                -onsetDistance
            );
        }
        geometrySafetySamples++;
    };
    for (const [name, geometry] of geometries) {
        const position = geometry?.attributes?.position;
        if (!position) continue;
        for (let index = 0; index < position.count; index++) {
            const x = position.getX(index);
            const z = position.getZ(index);
            const sample = sampleGrassCoverageContract(definition, x, z, safetyConfig);
            recordSample(sample, `${name}Vertices`, x, z);
        }
        for (let index = 0; index + 2 < position.count; index += 3) {
            const x = (position.getX(index) + position.getX(index + 1) + position.getX(index + 2)) / 3;
            const z = (position.getZ(index) + position.getZ(index + 1) + position.getZ(index + 2)) / 3;
            const sample = sampleGrassCoverageContract(definition, x, z, safetyConfig);
            recordSample(sample, `${name}Centroids`, x, z);
        }
    }
    const rootSamples = edgeGeometry?.userData?.grassCoverageRootSamples ?? [];
    let ineligibleCutEdgeRoots = 0;
    const ineligibleRootSegments = new Set();
    const ineligibleRootsByKind = {};
    for (const sample of rootSamples) {
        if (sampleGrassRootEligibility(definition, sample.x, sample.z, safetyConfig)) continue;
        ineligibleCutEdgeRoots++;
        ineligibleRootSegments.add(String(sample.segmentId ?? 'unknown'));
        const kind = String(sample.kind ?? 'unknown');
        ineligibleRootsByKind[kind] = (ineligibleRootsByKind[kind] ?? 0) + 1;
    }
    return Object.freeze({
        hardExclusionIntrusions,
        grassOnsetIntrusions,
        hardExclusionBoundaryContacts,
        grassOnsetBoundaryContacts,
        maxHardExclusionBoundaryContactDepthMeters,
        maxGrassOnsetBoundaryContactDepthMeters,
        maxPositionQuantizationToleranceMeters,
        geometrySafetySamples,
        hardIntrusionsByGeometry: Object.freeze(hardIntrusionsByGeometry),
        onsetIntrusionsByGeometry: Object.freeze(onsetIntrusionsByGeometry),
        cutEdgeRootSamples: rootSamples.length,
        ineligibleCutEdgeRoots,
        ineligibleRootSegmentCount: ineligibleRootSegments.size,
        ineligibleRootSegmentIds: Object.freeze([...ineligibleRootSegments].sort()),
        ineligibleRootsByKind: Object.freeze(ineligibleRootsByKind)
    });
}

export class GrassCoverageSurfaceSystem {
    constructor({ parent, definition, config, surfaceMaterial, edgeMaterial = null } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassCoverageSurfaceSystem] A THREE.Object3D parent is required.');
        if (!definition) throw new Error('[GrassCoverageSurfaceSystem] A coverage definition is required.');
        if (!surfaceMaterial?.isMaterial) throw new Error('[GrassCoverageSurfaceSystem] A surface material is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassCoverageSurfaceSystem';
        parent.add(this.group);
        this._definition = definition;
        this._config = sanitizeGrassCoverageConfig(config);
        this._surfaceMaterial = surfaceMaterial;
        this._edgeMaterial = edgeMaterial?.isMaterial ? edgeMaterial : createEdgeMaterial();
        this._partition = null;
        this._surface = null;
        this._edge = null;
        this._safety = Object.freeze({
            hardExclusionIntrusions: 0,
            grassOnsetIntrusions: 0,
            hardExclusionBoundaryContacts: 0,
            grassOnsetBoundaryContacts: 0,
            maxHardExclusionBoundaryContactDepthMeters: 0,
            maxGrassOnsetBoundaryContactDepthMeters: 0,
            maxPositionQuantizationToleranceMeters: 1e-6,
            geometrySafetySamples: 0,
            hardIntrusionsByGeometry: Object.freeze({}),
            onsetIntrusionsByGeometry: Object.freeze({}),
            cutEdgeRootSamples: 0,
            ineligibleCutEdgeRoots: 0,
            ineligibleRootSegmentCount: 0,
            ineligibleRootSegmentIds: Object.freeze([]),
            ineligibleRootsByKind: Object.freeze({})
        });
        this._visibility = { surface: true, edge: true };
        this._rebuild();
    }

    setConfig(value) {
        const next = sanitizeGrassCoverageConfig(value);
        const geometryChanged = coverageGeometryConfigKey(next) !== coverageGeometryConfigKey(this._config);
        this._config = next;
        if (geometryChanged) this._rebuild();
        else this._syncVisibility();
    }

    setDefinition(definition) {
        if (!definition) throw new Error('[GrassCoverageSurfaceSystem] A coverage definition is required.');
        if (definition === this._definition) return;
        this._definition = definition;
        this._rebuild();
    }

    setVisibility(value) {
        const source = value && typeof value === 'object' ? value : {};
        this._visibility = {
            surface: source.surface !== false,
            edge: source.edge !== false && !(source.lip === false && source.fringe === false)
        };
        this._syncVisibility();
    }

    setSurfaceMaterial(material) {
        if (!material?.isMaterial) throw new Error('[GrassCoverageSurfaceSystem] A surface material is required.');
        if (material === this._surfaceMaterial) return;
        this._surfaceMaterial?.dispose?.();
        this._surfaceMaterial = material;
        if (this._surface) this._surface.material = material;
    }

    setEdgeMaterial(material) {
        if (!material?.isMaterial) throw new Error('[GrassCoverageSurfaceSystem] An edge material is required.');
        if (material === this._edgeMaterial) return;
        this._edgeMaterial?.dispose?.();
        this._edgeMaterial = material;
        if (this._edge) this._edge.material = material;
    }

    getStats() {
        const enabled = this._config.enabled;
        const surfaceTriangles = enabled && this._visibility.surface
            ? Number(this._surface?.geometry?.userData?.grassCoverageCounts?.capTriangles) || 0
            : 0;
        const rootThatchTriangles = enabled && this._visibility.edge
            ? Number(this._edge?.geometry?.userData?.grassCoverageCounts?.rootThatchTriangles) || 0
            : 0;
        const cutEdgeTriangles = enabled && this._visibility.edge && this._config.cutEdgeEnabled
            ? Number(this._edge?.geometry?.userData?.grassCoverageCounts?.cutEdgeTriangles) || 0
            : 0;
        const rejectedCutEdgeRoots = enabled && this._visibility.edge && this._config.cutEdgeEnabled
            ? Number(this._edge?.geometry?.userData?.grassCoverageCounts?.rejectedCutEdgeRoots) || 0
            : 0;
        const edgeTriangles = rootThatchTriangles + cutEdgeTriangles;
        const drawCalls = Number(surfaceTriangles > 0) + Number(edgeTriangles > 0);
        return {
            enabled,
            structuralBaseHeightMeters: this._config.structuralBaseHeightMeters,
            layerHeightMeters: this._config.layerHeightMeters,
            occupancy: 'hard_polygon',
            substrateBlendIndependent: true,
            densityMultiplier: this._config.densityMultiplier,
            humidity: this._config.humidity,
            dryness: this._config.dryness,
            accentEligibility: this._config.accentEligibility,
            farCoverageThreshold: 0,
            farCoverageMap: null,
            opaqueCap: true,
            edgeMaterialId: this._edgeMaterial?.userData?.resolvedMaterialId ?? 'local_fallback',
            materialPaths: drawCalls,
            drawCalls,
            logicalDrawCalls: drawCalls,
            physicalEdgeLogicalDraws: Number(edgeTriangles > 0),
            surfaceTriangles,
            capTriangles: surfaceTriangles,
            rootThatchTriangles,
            cutEdgeTriangles,
            edgeTriangles,
            triangles: surfaceTriangles + edgeTriangles,
            lipTriangles: rootThatchTriangles,
            fringeTriangles: cutEdgeTriangles,
            fringeBlades: cutEdgeTriangles / 2,
            rejectedCutEdgeRoots,
            castShadow: false,
            transparentSurface: false,
            alphaTestedSurface: false,
            frustumCulled: true,
            ...this._safety,
            ...(this._partition?.diagnostics ?? {}),
            antialiasWidthMeters: this._config.edgeAntialiasMeters,
            enabled
        };
    }

    dispose() {
        this._disposeMeshes();
        this._surfaceMaterial?.dispose?.();
        this._edgeMaterial?.dispose?.();
        this._surfaceMaterial = null;
        this._edgeMaterial = null;
        this.group.removeFromParent();
    }

    _syncVisibility() {
        this.group.visible = this._config.enabled;
        if (this._surface) this._surface.visible = this._config.enabled && this._visibility.surface;
        if (this._edge) this._edge.visible = this._config.enabled && this._visibility.edge;
    }

    _disposeMeshes() {
        for (const mesh of [this._surface, this._edge]) {
            mesh?.geometry?.dispose?.();
            mesh?.removeFromParent?.();
        }
        this._surface = null;
        this._edge = null;
    }

    _rebuild() {
        this._disposeMeshes();
        const geometryConfig = createGrassCoverageStaticGeometryConfig(this._config);
        this._partition = createGrassCoveragePartition(this._definition, geometryConfig);
        const surfaceGeometry = buildSurfaceGeometry(this._partition, this._definition.bounds);
        const edgeGeometry = buildCutEdgeGeometry(this._partition, this._definition.seed, this._definition);
        const surface = new THREE.Mesh(surfaceGeometry, this._surfaceMaterial);
        const edge = new THREE.Mesh(edgeGeometry, this._edgeMaterial);
        surface.name = 'GrassCoverageOpaqueCap';
        edge.name = 'GrassCoverageContinuousCutEdge';
        for (const mesh of [surface, edge]) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = true;
            this.group.add(mesh);
        }
        surface.renderOrder = 2;
        edge.renderOrder = 3;
        this._surface = surface;
        this._edge = edge;
        this._safety = measureGeometrySafety(this._definition, geometryConfig, surfaceGeometry, edgeGeometry);
        this._syncVisibility();
    }
}
