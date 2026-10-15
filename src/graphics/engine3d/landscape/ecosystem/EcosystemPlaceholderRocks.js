// Builds the deterministic placeholder boulder and pebble geometries of a placeholder-rocks asset set (AI 599 D4): noise-displaced polyhedral spheres flattened to a base, with normals and a crease-shade attribute, merged over the variants for one instanced draw per LOD.
// @ts-check
// Design: every LOD subdivides an icosahedron (an octahedron below 20 triangles) to the largest count within the recipe's triangle budget, so the
// reported count never exceeds it. The displacement is the landscape's integer-hashed gradient noise (no Math.random) evaluated triplanarly on the
// unit sphere, salted by the asset seed and the variant, with a per-variant anisotropic stretch so the variants read as different stones; every LOD
// of a variant displaces the same field, so the LODs agree in silhouette. The underside is cut at a plane and the body is scaled so the cut's radius
// is the footprint radius and the top reaches the asset height: a rock stands on its anchor. The variants are merged into one geometry with a
// per-vertex variant index (the vertex program collapses the other variants), which keeps one draw per tile and LOD.
import * as THREE from 'three';
import { landscapeNoiseHash, landscapeNoiseSalt, landscapeRotatedNoise } from '../LandscapeSurfaceNoise.js';

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON = Object.freeze({
    vertices: [[-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0], [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN], [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1]],
    faces: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
});
const OCTAHEDRON = Object.freeze({ vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], faces: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]] });
// displacement octaves in unit-sphere units and the plane that cuts the underside
const WAVELENGTHS = [1.6, .8, .4], AMPLITUDES = [.26, .13, .06], ROTATIONS = [[1, 0], [.8, .6], [.6, .8]], BASE_CUT = -.35, SHADE_FLOOR = .45;

const normalize = ([x, y, z]) => { const length = Math.hypot(x, y, z); return [x / length, y / length, z / length]; };
const hash01 = (seed, variant, salt) => landscapeNoiseHash(((seed ^ Math.imul(variant + 1, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca77)) >>> 0)) / 4294967296;

/** The seed polyhedron and subdivision count whose triangle count is the largest at or below the budget. @param {number} budget */
function subdivisionFor(budget) {
    const seed = budget >= 20 ? ICOSAHEDRON : OCTAHEDRON, base = seed.faces.length;
    if (budget < base) throw new Error(`[LandscapeEcosystem] A placeholder rock LOD needs at least ${OCTAHEDRON.faces.length} triangles; the recipe allows ${budget}`);
    return { seed, subdivisions: Math.floor(Math.log(budget / base) / Math.log(4) + 1e-9) };
}

function subdivided(seed, subdivisions) {
    let vertices = seed.vertices.map(normalize), faces = seed.faces.map(face => [...face]);
    for (let step = 0; step < subdivisions; step++) {
        const cache = new Map(), next = [];
        const midpoint = (a, b) => {
            const key = a < b ? a * 65536 + b : b * 65536 + a;
            let index = cache.get(key);
            if (index === undefined) { index = vertices.length; vertices.push(normalize([vertices[a][0] + vertices[b][0], vertices[a][1] + vertices[b][1], vertices[a][2] + vertices[b][2]])); cache.set(key, index); }
            return index;
        };
        for (const [a, b, c] of faces) { const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
        faces = next;
    }
    return { vertices, faces };
}

/** The displacement field of a variant: three octaves of triplanar gradient noise on the unit sphere, in (-0.45, 0.45). */
function displacementField(seed, variant) {
    const salts = WAVELENGTHS.map((_, octave) => landscapeNoiseSalt(seed, variant, octave));
    return ([x, y, z]) => {
        let value = 0;
        const weights = Math.abs(x) + Math.abs(y) + Math.abs(z);
        for (let octave = 0; octave < WAVELENGTHS.length; octave++) {
            const inverse = 1 / WAVELENGTHS[octave], rotation = /** @type {[number, number]} */ (ROTATIONS[octave]), salt = salts[octave];
            value += AMPLITUDES[octave] * (Math.abs(y) * landscapeRotatedNoise(x, z, inverse, rotation, salt) + Math.abs(x) * landscapeRotatedNoise(y + 3.1, z - 1.7, inverse, rotation, salt)
                + Math.abs(z) * landscapeRotatedNoise(x - 2.3, y + 1.3, inverse, rotation, salt)) / weights;
        }
        return value;
    };
}

/**
 * One variant at one triangle budget: positions in metres (base at y = 0, top at heightMeters, cut radius footprintRadiusMeters), smooth normals,
 * crease shade (darker where a vertex sits below its neighbours' mean radius) and the triangle list.
 */
function variantMesh({ seed, variant, budget, footprintRadiusMeters, heightMeters }) {
    const { seed: polyhedron, subdivisions } = subdivisionFor(budget), { vertices, faces } = subdivided(polyhedron, subdivisions), field = displacementField(seed, variant);
    const stretchX = .8 + .45 * hash01(seed, variant, 1), stretchZ = .8 + .45 * hash01(seed, variant, 2), radii = vertices.map(direction => 1 + field(direction));
    const raw = vertices.map((direction, i) => [direction[0] * radii[i] * stretchX, Math.max(direction[1] * radii[i], BASE_CUT), direction[2] * radii[i] * stretchZ]);
    let minY = Infinity, maxY = -Infinity, baseRadius = 0;
    for (const [, y] of raw) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (const [x, y, z] of raw) if (y <= minY + 1e-9) baseRadius = Math.max(baseRadius, Math.hypot(x, z));
    const horizontal = footprintRadiusMeters / baseRadius, vertical = heightMeters / (maxY - minY);
    const positions = new Float32Array(raw.length * 3), normals = new Float32Array(raw.length * 3), shade = new Float32Array(raw.length), index = new Uint16Array(faces.length * 3);
    raw.forEach(([x, y, z], i) => { positions[i * 3] = x * horizontal; positions[i * 3 + 1] = (y - minY) * vertical; positions[i * 3 + 2] = z * horizontal; });
    const neighbourSum = new Float64Array(raw.length), neighbourCount = new Uint16Array(raw.length);
    // the body is star-shaped about the sphere centre, so a face whose normal points toward the centre is wound inward and is flipped
    const centreY = -minY * vertical;
    faces.forEach(([a, first, second], f) => {
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
        const outward = (() => {
            const ux = positions[first * 3] - ax, uy = positions[first * 3 + 1] - ay, uz = positions[first * 3 + 2] - az, vx = positions[second * 3] - ax, vy = positions[second * 3 + 1] - ay, vz = positions[second * 3 + 2] - az;
            return (uy * vz - uz * vy) * ax + (uz * vx - ux * vz) * (ay - centreY) + (ux * vy - uy * vx) * az >= 0;
        })();
        const b = outward ? first : second, c = outward ? second : first;
        index[f * 3] = a; index[f * 3 + 1] = b; index[f * 3 + 2] = c;
        const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az, vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) { normals[v * 3] += nx; normals[v * 3 + 1] += ny; normals[v * 3 + 2] += nz; }
        for (const [v, w] of [[a, b], [b, c], [c, a]]) { neighbourSum[v] += radii[w]; neighbourCount[v]++; neighbourSum[w] += radii[v]; neighbourCount[w]++; }
    });
    for (let i = 0; i < raw.length; i++) {
        const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
        normals[i * 3] /= length; normals[i * 3 + 1] /= length; normals[i * 3 + 2] /= length;
        shade[i] = Math.max(SHADE_FLOOR, Math.min(1, 1 - 2.5 * Math.max(0, neighbourSum[i] / Math.max(neighbourCount[i], 1) - radii[i])));
    }
    return { positions, normals, shade, index, triangles: faces.length };
}

/**
 * The merged geometry of every variant at one LOD: position, normal, rockShade and variant attributes with one index list; per-variant
 * triangle counts stay within the budget, the draw submits variants x triangles.
 * @param {{seed:number,variants:number,footprintRadiusMeters:number,heightMeters:number}} asset @param {{level:number,triangles:number}} lod
 */
export function createEcosystemRockLod(asset, lod) {
    const meshes = Array.from({ length: asset.variants }, (_, variant) => variantMesh({ seed: asset.seed, variant, budget: lod.triangles, footprintRadiusMeters: asset.footprintRadiusMeters, heightMeters: asset.heightMeters }));
    const vertexCount = meshes.reduce((sum, mesh) => sum + mesh.shade.length, 0), indexCount = meshes.reduce((sum, mesh) => sum + mesh.index.length, 0);
    if (vertexCount > 65535) throw new Error(`[LandscapeEcosystem] placeholder rock LOD ${lod.level} merges ${vertexCount} vertices; the 16-bit index holds 65535`);
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), shade = new Float32Array(vertexCount), variants = new Float32Array(vertexCount), index = new Uint16Array(indexCount);
    let vertexOffset = 0, indexOffset = 0;
    meshes.forEach((mesh, variant) => {
        positions.set(mesh.positions, vertexOffset * 3); normals.set(mesh.normals, vertexOffset * 3); shade.set(mesh.shade, vertexOffset); variants.fill(variant, vertexOffset, vertexOffset + mesh.shade.length);
        for (let i = 0; i < mesh.index.length; i++) index[indexOffset + i] = mesh.index[i] + vertexOffset;
        vertexOffset += mesh.shade.length; indexOffset += mesh.index.length;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('rockShade', new THREE.BufferAttribute(shade, 1));
    geometry.setAttribute('variant', new THREE.BufferAttribute(variants, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.name = `Ecosystem rocks LOD ${lod.level}`;
    const triangles = Math.max(...meshes.map(mesh => mesh.triangles));
    return Object.freeze({ level: lod.level, geometry, impostor: null, textures: null, textured: false, triangles, drawTriangles: indexCount / 3, vertices: vertexCount,
        bytes: positions.byteLength + normals.byteLength + shade.byteLength + variants.byteLength + index.byteLength });
}

/**
 * A placeholder-rocks asset set of a validated recipe: every LOD's merged variant geometry, the triangle counts and the bytes to reserve.
 * @param {{kind:string,variants:number,seed:number,footprintRadiusMeters:number,heightMeters:number,lods:ReadonlyArray<{level:number,triangles:number}>}} asset
 */
export function createEcosystemPlaceholderRocks(asset) {
    if (asset?.kind !== 'placeholder-rocks') throw new Error(`[LandscapeEcosystem] placeholder rocks need a placeholder-rocks asset set; received ${String(asset?.kind)}`);
    const started = performance.now(), lods = asset.lods.map(lod => createEcosystemRockLod(asset, lod));
    for (const lod of lods) if (lod.triangles > asset.lods.find(entry => entry.level === lod.level).triangles) throw new Error(`[LandscapeEcosystem] placeholder rock LOD ${lod.level} exceeds its triangle budget`);
    const bytes = lods.reduce((sum, lod) => sum + lod.bytes, 0);
    return Object.freeze({ kind: asset.kind, variants: asset.variants, footprintRadiusMeters: asset.footprintRadiusMeters, heightMeters: asset.heightMeters, lods: Object.freeze(lods),
        bytes: Object.freeze({ cpuBytes: bytes, gpuBytes: bytes }), loadMs: performance.now() - started,
        dispose() { for (const lod of lods) lod.geometry.dispose(); } });
}
