// Shared four-leaf field placements keep physical pair spacing independent of blade size.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2RibbonShoot } from './GrassDebugV2RibbonShoot.js?v=lod3-w-1';
import { fitGrassDebugV2RibbonRoot } from './GrassDebugV2RibbonRoot.js';
import { fitGrassDebugV2RibbonLod2Root } from './GrassDebugV2RibbonLod2.js';
import { sampleGrassDebugV2ShootColor, sampleGrassDebugV2Lod2Color } from './GrassDebugV2ShootAppearance.js';

/** @typedef {{id:number, x:number, z:number, scale:number, azimuthDegrees:number, backwardInclinationDegrees:number}} RecordedPair */
/** @typedef {{id:number, sourcePairId:number, page:number, leafScale:number, x:number, z:number, azimuthDegrees:number, backwardInclinationDegrees:number}} TuftPlacement */
/** @typedef {ReturnType<import('./GrassDebugV2RibbonCardAtlas.js').createGrassDebugV2RibbonCardAtlas>} TuftAtlas */

/**
 * Bake size variants instead of stretching the 1 cm pair offset along with each leaf.
 * @param {readonly RecordedPair[]} placements
 */
export function getGrassDebugV2TuftScales(placements) {
    let minimum = Infinity, maximum = 0;
    for (const p of placements) { minimum = Math.min(minimum, p.scale); maximum = Math.max(maximum, p.scale); }
    if (!(minimum > 0) || !Number.isFinite(minimum)) throw new Error('Tufts require positive source scales.');
    return Object.freeze(Array.from({ length: 32 }, (_, i) => minimum + (maximum - minimum) * i / 31));
}

/**
 * Retain 96,000 leaves by replacing each two original pairs with one four-leaf tuft.
 * @param {readonly RecordedPair[]} placements
 * @param {TuftAtlas} atlas
 * @param {number} widthMeters
 * @param {number} depthMeters
 */
export function createGrassDebugV2TuftPlacements(placements, atlas, widthMeters, depthMeters) {
    if (!placements.length || placements.length % 2 || !(widthMeters > 0 && depthMeters > 0))
        throw new Error('Tufts require an even number of pair placements and positive field dimensions.');
    const { scales, frames } = atlas.definition;
    return Object.freeze(placements.filter((_, i) => i % 2 === 0).map((p, id) => {
        const page = scales.reduce((best, scale, i) => Math.abs(scale - p.scale) < Math.abs(scales[best] - p.scale) ? i : best, 0);
        const angle = THREE.MathUtils.degToRad(p.azimuthDegrees), pitch = THREE.MathUtils.degToRad(p.backwardInclinationDegrees);
        const frame = frames[page], halfX = Math.max(Math.abs(frame.minX), Math.abs(frame.maxX));
        const halfZ = Math.sin(pitch) * frame.maxY + .005 + .006 * scales[page];
        // The common card envelope also contains the curved 3D leaves, keeping every LOD inside the soil patch.
        const extentX = Math.abs(Math.cos(angle)) * halfX + Math.abs(Math.sin(angle)) * halfZ;
        const extentZ = Math.abs(Math.sin(angle)) * halfX + Math.abs(Math.cos(angle)) * halfZ;
        return Object.freeze({ id, sourcePairId: p.id, page, leafScale: scales[page],
            x: THREE.MathUtils.clamp(p.x, -widthMeters / 2 + extentX, widthMeters / 2 - extentX),
            z: THREE.MathUtils.clamp(p.z, -depthMeters / 2 + extentZ, depthMeters / 2 - extentZ),
            azimuthDegrees: p.azimuthDegrees, backwardInclinationDegrees: p.backwardInclinationDegrees });
    }));
}

/**
 * Build all geometric LODs and the card from the same tuft placement list.
 * @param {{material: THREE.MeshStandardMaterial, placements: readonly TuftPlacement[], seed:number,
 * lod:'LOD0_SMART'|'LOD1'|'LOD2'|'LOD3', cardTemplates?:readonly THREE.BufferGeometry[]}} options
 */
export function createGrassDebugV2TuftField({ material, placements, seed, lod, cardTemplates }) {
    if (!['LOD0_SMART', 'LOD1', 'LOD2', 'LOD3'].includes(lod) || !placements.length || !Number.isInteger(seed))
        throw new Error('Unknown tuft LOD or invalid placements.');
    const isCard = lod === 'LOD3', variants = new Map();
    for (const p of placements) {
        const key = p.page + ':' + p.backwardInclinationDegrees;
        if (variants.has(key)) continue;
        const source = createGrassDebugV2RibbonShoot({ material, lod, layout: 'tuft', leafScale: p.leafScale,
            cardTemplates: isCard ? [cardTemplates[p.page]] : null });
        source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true);
        const pitch = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(p.backwardInclinationDegrees));
        const roots = source.getSnapshot().pairRoots;
        variants.set(key, source.leaves.map((leaf, i) => {
            const root = roots[Math.floor(i / 2)], transform = isCard ? pitch.clone() :
                new THREE.Matrix4().makeTranslation(root.x, 0, root.z).multiply(pitch)
                    .multiply(new THREE.Matrix4().makeTranslation(-root.x, 0, -root.z));
            transform.multiply(leaf.matrixWorld);
            const geometry = leaf.geometry.clone().applyMatrix4(transform);
            if (transform.determinant() < 0) {
                const index = geometry.index.array;
                for (let j = 0; j < index.length; j += 3) [index[j + 1], index[j + 2]] = [index[j + 2], index[j + 1]];
            }
            const mesh = new THREE.Mesh(geometry, material);
            if (isCard || lod === 'LOD2') fitGrassDebugV2RibbonLod2Root(mesh, () => 0);
            else fitGrassDebugV2RibbonRoot(mesh, () => 0);
            return geometry;
        }));
        source.dispose();
    }
    let vertexCount = 0, indexCount = 0;
    for (const p of placements) for (const part of variants.get(p.page + ':' + p.backwardInclinationDegrees)) {
        vertexCount += part.attributes.position.count; indexCount += part.index.count;
    }
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2), indices = new Uint32Array(indexCount);
    const cardDryness = isCard ? new Float32Array(vertexCount * 4) : null, color = new THREE.Color();
    let vertexOffset = 0, indexOffset = 0, state = seed;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    for (const p of placements) {
        const angle = THREE.MathUtils.degToRad(p.azimuthDegrees), cosine = Math.cos(angle), sine = Math.sin(angle);
        const brightness = .94 + random() * .12;
        const dryness = Array.from({ length: 4 }, (_, blade) => {
            const variation = ((Math.imul(p.id * 4 + blade + 1, 1597334677) ^ seed) >>> 0) / 4294967296;
            return variation < .12 ? .65 + variation / .12 * .35 : (variation - .12) * .22;
        });
        for (const [blade, part] of variants.get(p.page + ':' + p.backwardInclinationDegrees).entries()) {
            const a = part.attributes;
            for (let j = 0; j < a.position.count; j++) {
                const v = vertexOffset + j, v3 = v * 3;
                positions[v3] = p.x + cosine * a.position.getX(j) + sine * a.position.getZ(j);
                positions[v3 + 1] = a.position.getY(j);
                positions[v3 + 2] = p.z + cosine * a.position.getZ(j) - sine * a.position.getX(j);
                normals[v3] = cosine * a.normal.getX(j) + sine * a.normal.getZ(j);
                normals[v3 + 1] = a.normal.getY(j);
                normals[v3 + 2] = cosine * a.normal.getZ(j) - sine * a.normal.getX(j);
                uvs[v * 2] = a.uv.getX(j); uvs[v * 2 + 1] = a.uv.getY(j);
                if (isCard) { color.setRGB(1, 1, 1); cardDryness.set(dryness, v * 4); }
                else (lod === 'LOD2' ? sampleGrassDebugV2Lod2Color : sampleGrassDebugV2ShootColor)(
                    THREE.MathUtils.clamp((a.uv.getY(j) - .18) / .82, 0, 1), color, dryness[blade]);
                colors[v3] = color.r * brightness; colors[v3 + 1] = color.g * brightness; colors[v3 + 2] = color.b * brightness;
            }
            for (const index of part.index.array) indices[indexOffset++] = vertexOffset + index;
            vertexOffset += a.position.count;
        }
    }
    variants.forEach(parts => parts.forEach(part => part.dispose()));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (isCard) geometry.setAttribute('grassDryness', new THREE.BufferAttribute(cardDryness, 4));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'GrassField-' + lod;
    mesh.castShadow = mesh.receiveShadow = true;
    const trianglesPerLeaf = indexCount / 3 / (placements.length * 4);
    return Object.freeze({ mesh,
        getSnapshot: () => ({ layout: 'four-leaf-tufts', leaves: placements.length * 4, tufts: placements.length,
            cards: isCard ? placements.length : 0, triangles: indexCount / 3,
            trianglesPerLeaf: { min: trianglesPerLeaf, max: trianglesPerLeaf }, maximumTrianglesPerLeaf: trianglesPerLeaf,
            pairSpacingMeters: .01, pairDepthMeters: .01 }),
        dispose: () => { mesh.removeFromParent(); geometry.dispose(); }
    });
}
