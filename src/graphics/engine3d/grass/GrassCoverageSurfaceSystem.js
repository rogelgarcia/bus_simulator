// Renders the binary raised grass surface, boundary lip, and sparse cut-edge fringe.
// @ts-check

import * as THREE from 'three';
import { createGrassCoveragePartition, sanitizeGrassCoverageConfig } from '../../../app/grass/GrassCoverageContract.js';
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
    const positions = [];
    const uvs = [];
    const colors = [];
    const y = partition.config.layerHeightMeters;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const color = [1, 1, 1];
    const uv = (x, z) => [(x - bounds.minX) / width, (z - bounds.minZ) / depth];
    for (const cell of partition.cells) {
        const a = { x: cell.x0, y, z: cell.z0 };
        const b = { x: cell.x0, y, z: cell.z1 };
        const c = { x: cell.x1, y, z: cell.z1 };
        const d = { x: cell.x1, y, z: cell.z0 };
        pushTriangle(positions, uvs, colors, a, b, c, uv(a.x, a.z), uv(b.x, b.z), uv(c.x, c.z), color, color, color);
        pushTriangle(positions, uvs, colors, a, c, d, uv(a.x, a.z), uv(c.x, c.z), uv(d.x, d.z), color, color, color);
    }
    const geometry = createGeometry(positions, uvs, colors);
    geometry.name = 'GrassCoverageRaisedSurface';
    return geometry;
}

function buildLipGeometry(partition) {
    const positions = [];
    const uvs = [];
    const colors = [];
    const top = partition.config.layerHeightMeters;
    const bottomColor = [0.045, 0.075, 0.032];
    const topColor = [0.095, 0.16, 0.065];
    for (const segment of partition.boundarySegments) {
        const a = { x: segment.a.x, y: 0.0015, z: segment.a.z };
        const b = { x: segment.b.x, y: 0.0015, z: segment.b.z };
        const c = { x: segment.b.x, y: top, z: segment.b.z };
        const d = { x: segment.a.x, y: top, z: segment.a.z };
        pushTriangle(positions, uvs, colors, a, b, c, [0, 0], [1, 0], [1, 1], bottomColor, bottomColor, topColor);
        pushTriangle(positions, uvs, colors, a, c, d, [0, 0], [1, 1], [0, 1], bottomColor, topColor, topColor);
    }
    const geometry = createGeometry(positions, uvs, colors);
    geometry.name = 'GrassCoverageBoundaryLip';
    return geometry;
}

function buildFringeGeometry(partition, seed) {
    const positions = [];
    const uvs = [];
    const colors = [];
    const config = partition.config;
    const baseColor = [0.18, 0.39, 0.16];
    const tipColor = [0.39, 0.60, 0.28];
    for (const segment of partition.boundarySegments) {
        const count = Math.max(1, Math.floor(segment.length / config.fringeSpacingMeters));
        const dx = segment.b.x - segment.a.x;
        const dz = segment.b.z - segment.a.z;
        const invLength = 1 / Math.max(1e-6, segment.length);
        const tangentX = dx * invLength;
        const tangentZ = dz * invLength;
        const random = makeRng(`${seed}|fringe:${segment.id}|${count}`);
        for (let index = 0; index < count; index++) {
            const t = (index + 0.25 + random() * 0.5) / count;
            const inset = config.fringeInsetMeters * (0.7 + random() * 0.6);
            const x = segment.a.x + dx * t - segment.normal.x * inset;
            const z = segment.a.z + dz * t - segment.normal.z * inset;
            const y = config.layerHeightMeters;
            const width = 0.0022 + random() * 0.0018;
            const height = 0.024 + random() * 0.012;
            const bend = (random() - 0.35) * 0.012;
            const brightness = 0.84 + random() * 0.25;
            const rootA = { x: x - tangentX * width, y, z: z - tangentZ * width };
            const rootB = { x: x + tangentX * width, y, z: z + tangentZ * width };
            const tip = {
                x: x + segment.normal.x * bend,
                y: y + height,
                z: z + segment.normal.z * bend
            };
            pushTriangle(
                positions,
                uvs,
                colors,
                rootA,
                rootB,
                tip,
                [0, 0],
                [1, 0],
                [0.5, 1],
                baseColor.map((value) => value * brightness),
                baseColor.map((value) => value * brightness),
                tipColor.map((value) => value * brightness)
            );
        }
    }
    const geometry = createGeometry(positions, uvs, colors);
    geometry.name = 'GrassCoverageBoundaryFringe';
    return geometry;
}

function createEdgeMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
    });
}

export class GrassCoverageSurfaceSystem {
    constructor({ parent, definition, config, surfaceMaterial } = {}) {
        if (!parent?.isObject3D) throw new Error('[GrassCoverageSurfaceSystem] A THREE.Object3D parent is required.');
        if (!definition) throw new Error('[GrassCoverageSurfaceSystem] A coverage definition is required.');
        if (!surfaceMaterial?.isMaterial) throw new Error('[GrassCoverageSurfaceSystem] A surface material is required.');
        this.group = new THREE.Group();
        this.group.name = 'GrassCoverageSurfaceSystem';
        parent.add(this.group);
        this._definition = definition;
        this._config = sanitizeGrassCoverageConfig(config);
        this._surfaceMaterial = surfaceMaterial;
        this._edgeMaterial = createEdgeMaterial();
        this._partition = null;
        this._surface = null;
        this._lip = null;
        this._fringe = null;
        this._visibility = { surface: true, lip: true, fringe: true };
        this._rebuild();
    }

    setConfig(value) {
        const next = sanitizeGrassCoverageConfig(value);
        const changed = JSON.stringify(next) !== JSON.stringify(this._config);
        this._config = next;
        if (changed) this._rebuild();
        else this._syncVisibility();
    }

    setVisibility(value) {
        const source = value && typeof value === 'object' ? value : {};
        this._visibility = {
            surface: source.surface !== false,
            lip: source.lip !== false,
            fringe: source.fringe !== false
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

    getStats() {
        const enabled = this._config.enabled;
        const surfaceTriangles = enabled && this._visibility.surface ? (this._surface?.geometry?.attributes?.position?.count ?? 0) / 3 : 0;
        const lipTriangles = enabled && this._visibility.lip ? (this._lip?.geometry?.attributes?.position?.count ?? 0) / 3 : 0;
        const fringeTriangles = enabled && this._visibility.fringe && this._config.fringeEnabled ? (this._fringe?.geometry?.attributes?.position?.count ?? 0) / 3 : 0;
        const drawCalls = Number(surfaceTriangles > 0) + Number(lipTriangles > 0) + Number(fringeTriangles > 0);
        return {
            enabled,
            layerHeightMeters: this._config.layerHeightMeters,
            occupancy: 'binary',
            substrateBlendIndependent: true,
            densityMultiplier: this._config.densityMultiplier,
            humidity: this._config.humidity,
            dryness: this._config.dryness,
            accentEligibility: this._config.accentEligibility,
            farCoverageThreshold: this._config.farCoverageThreshold,
            farCoverageMap: 'far_coverage.png',
            materialPaths: drawCalls > 0 ? 2 : 0,
            drawCalls,
            surfaceTriangles,
            lipTriangles,
            fringeTriangles,
            triangles: surfaceTriangles + lipTriangles + fringeTriangles,
            fringeBlades: fringeTriangles,
            castShadow: false,
            transparentSurface: false,
            alphaTestedSurface: true,
            frustumCulled: true,
            ...(this._partition?.diagnostics ?? {})
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
        if (this._lip) this._lip.visible = this._config.enabled && this._visibility.lip;
        if (this._fringe) this._fringe.visible = this._config.enabled && this._visibility.fringe && this._config.fringeEnabled;
    }

    _disposeMeshes() {
        for (const mesh of [this._surface, this._lip, this._fringe]) {
            mesh?.geometry?.dispose?.();
            mesh?.removeFromParent?.();
        }
        this._surface = null;
        this._lip = null;
        this._fringe = null;
    }

    _rebuild() {
        this._disposeMeshes();
        this._partition = createGrassCoveragePartition(this._definition, this._config);
        const surface = new THREE.Mesh(buildSurfaceGeometry(this._partition, this._definition.bounds), this._surfaceMaterial);
        const lip = new THREE.Mesh(buildLipGeometry(this._partition), this._edgeMaterial);
        const fringe = new THREE.Mesh(buildFringeGeometry(this._partition, this._definition.seed), this._edgeMaterial);
        surface.name = 'GrassCoverageSurface';
        lip.name = 'GrassCoverageLip';
        fringe.name = 'GrassCoverageFringe';
        for (const mesh of [surface, lip, fringe]) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = true;
            this.group.add(mesh);
        }
        surface.renderOrder = 2;
        lip.renderOrder = 3;
        fringe.renderOrder = 4;
        this._surface = surface;
        this._lip = lip;
        this._fringe = fringe;
        this._syncVisibility();
    }
}
