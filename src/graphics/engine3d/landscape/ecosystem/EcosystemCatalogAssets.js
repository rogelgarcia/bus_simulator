// Loads a catalog-distant asset set (AI 599 D4): the distant vegetation catalog's LOD3 and LOD4 cards merged over the variants with their KTX2 atlases, and the LOD5 impostor as one unit quad with the view tables of every variant.
// @ts-check
// Design: the GLBs load through loadDistantVegetation (GLTFLoader + KTX2Loader, the shared leaf atlases pooled per renderer), and only their
// attribute arrays and textures are kept: each card LOD becomes one geometry carrying every variant (a per-vertex variant index the vertex program
// collapses) with a part attribute telling the leaf atlas from the wood atlas; the impostor LOD keeps no catalog geometry at all, its unit quad is
// shaped in the vertex program from the record's 16 views (uv rectangle, card size, root offset) converted exactly as the CPU billboard updater
// converts them (Blender z-up record data to y-up, the root point projected on each view's basis). The loaded handles are disposed with the set, so
// the catalog's own geometries and materials never reach the scene.
import * as THREE from 'three';
import { loadDistantVegetation } from '../../vegetation/DistantVegetationLoader.js';
import { LANDSCAPE_ECOSYSTEM, ecosystemImpostorAngles } from './LandscapeEcosystemModel.js';
import { LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS } from '../../../shaders/materials/landscape/LandscapeEcosystemShaderLoader.js';

const IMPOSTOR_LEVEL = 5;
const toYUp = ([x, y, z]) => [x, z, -y];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function meshesOf(root) {
    const meshes = [];
    root.updateMatrixWorld(true);
    root.traverse(object => { if (object.isMesh) meshes.push(object); });
    return meshes;
}

function texturesOf(material, label) {
    const textures = { color: material.map, normal: material.normalMap, orm: material.roughnessMap ?? material.metalnessMap };
    for (const [channel, texture] of Object.entries(textures)) if (!texture?.isTexture) throw new Error(`[LandscapeEcosystem] ${label} has no ${channel} texture`);
    return Object.freeze(textures);
}

/** Appends a mesh's attributes (world matrix applied) to the merged arrays. */
function appendMesh(mesh, part, variant, target) {
    const geometry = mesh.geometry, position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv, tangent = geometry.attributes.tangent, index = geometry.index;
    if (!position || !normal || !uv || !tangent || !index) throw new Error(`[LandscapeEcosystem] catalog mesh ${mesh.name} needs position, normal, uv, tangent and an index`);
    const matrix = mesh.matrixWorld, normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), point = new THREE.Vector3(), direction = new THREE.Vector3(), base = target.vertexCount;
    for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(matrix);
        target.positions.push(point.x, point.y, point.z);
        direction.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        target.normals.push(direction.x, direction.y, direction.z);
        target.uvs.push(uv.getX(i), uv.getY(i));
        direction.set(tangent.getX(i), tangent.getY(i), tangent.getZ(i)).transformDirection(matrix);
        target.tangents.push(direction.x, direction.y, direction.z, tangent.getW(i));
        target.parts.push(part); target.variants.push(variant);
    }
    for (let i = 0; i < index.count; i++) target.index.push(index.getX(i) + base);
    target.vertexCount += position.count;
}

/** One card LOD (levels 3 and 4): the leaf and wood meshes of every variant merged into one geometry, with the leaf atlas and the per-variant wood atlases. */
function cardLod(handles, level) {
    const target = { positions: [], normals: [], uvs: [], tangents: [], parts: [], variants: [], index: [], vertexCount: 0 }, woodTextures = [];
    let leaf = null, triangles = 0;
    handles.forEach((handle, variant) => {
        let count = 0;
        for (const mesh of meshesOf(handle.root)) {
            const surface = mesh.userData.surface;
            if (surface !== 'leaves' && surface !== 'wood') throw new Error(`[LandscapeEcosystem] catalog LOD ${level} mesh ${mesh.name} has surface ${String(surface)}; expected leaves or wood`);
            appendMesh(mesh, surface === 'leaves' ? 1 : 0, variant, target);
            count += mesh.geometry.index.count / 3;
            const textures = texturesOf(mesh.material, mesh.name);
            if (surface === 'wood') woodTextures[variant] = textures;
            else if (!leaf) leaf = textures;
            else if (leaf.color !== textures.color) throw new Error(`[LandscapeEcosystem] catalog LOD ${level} variant ${variant} does not share the pooled leaf atlas`);
        }
        if (!woodTextures[variant]) throw new Error(`[LandscapeEcosystem] catalog LOD ${level} variant ${variant} has no wood mesh`);
        triangles = Math.max(triangles, count);
    });
    if (!leaf) throw new Error(`[LandscapeEcosystem] catalog LOD ${level} has no leaf mesh`);
    if (target.vertexCount > 65535) throw new Error(`[LandscapeEcosystem] catalog LOD ${level} merges ${target.vertexCount} vertices; the 16-bit index holds 65535`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uvs, 2));
    geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(target.tangents, 4));
    geometry.setAttribute('part', new THREE.Float32BufferAttribute(target.parts, 1));
    geometry.setAttribute('variant', new THREE.Float32BufferAttribute(target.variants, 1));
    geometry.setIndex(new THREE.Uint16BufferAttribute(target.index, 1));
    geometry.name = `Ecosystem catalog LOD ${level}`;
    const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index.array.byteLength);
    return Object.freeze({ level, geometry, impostor: null, textured: true, textures: Object.freeze({ leaf, variants: Object.freeze(woodTextures) }), triangles, drawTriangles: target.index.length / 3, vertices: target.vertexCount, bytes });
}

/** The root offset of a view along its right and up axes (the CPU billboard updater's rootOffsets), from the record's z-up data. */
function viewFrame(record, view) {
    const pivot = [0, record.bounds[0][2], 0], center = toYUp(view.center), offset = [pivot[0] - center[0], pivot[1] - center[1], pivot[2] - center[2]];
    const right = toYUp(view.basis.map(row => row[0])), up = toYUp(view.basis.map(row => row[1]));
    return [view.size[0], view.size[1], dot(offset, right), dot(offset, up)];
}

/** The impostor LOD (level 5): the unit quad, the per-variant atlases and the packed view tables (uv rectangles and card frames) in record order. */
function impostorLod(handles) {
    const layout = LANDSCAPE_ECOSYSTEM.impostor, variants = handles.length, views = new Float32Array(variants * layout.views * 4), frames = new Float32Array(variants * layout.views * 4), shape = new Float32Array(variants * 4), textures = [];
    let triangles = 0;
    handles.forEach((handle, variant) => {
        const record = handle.record, meshes = meshesOf(handle.root);
        if (meshes.length !== 1 || meshes[0].userData.surface !== 'mixed' || record.views?.length !== layout.views) throw new Error(`[LandscapeEcosystem] catalog LOD 5 variant ${record.id} is not a 16-view billboard`);
        record.views.forEach((view, index) => {
            const angles = ecosystemImpostorAngles(index);
            if (Math.abs(view.azimuthDegrees - angles.azimuthDegrees) > 1e-6 || Math.abs(view.elevationDegrees - angles.elevationDegrees) > 1e-6) throw new Error(`[LandscapeEcosystem] catalog LOD 5 variant ${record.id} view ${index} is at ${view.azimuthDegrees}/${view.elevationDegrees} degrees; the impostor layout expects ${angles.azimuthDegrees}/${angles.elevationDegrees}`);
            views.set(view.uv, (variant * layout.views + index) * 4);
            frames.set(viewFrame(record, view), (variant * layout.views + index) * 4);
        });
        const low = toYUp(record.bounds[0]), high = toYUp(record.bounds[1]);
        shape.set([(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2, record.bounds[0][2]], variant * 4);
        textures[variant] = texturesOf(meshes[0].material, meshes[0].name);
        triangles = Math.max(triangles, meshes[0].geometry.index.count / 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.5, 1, 0, .5, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geometry.setAttribute('tangent', new THREE.Float32BufferAttribute([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4));
    geometry.setIndex(new THREE.Uint16BufferAttribute([0, 1, 2, 2, 1, 3], 1));
    geometry.name = 'Ecosystem catalog impostor';
    const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index.array.byteLength) + views.byteLength + frames.byteLength + shape.byteLength;
    return Object.freeze({ level: IMPOSTOR_LEVEL, geometry, impostor: Object.freeze({ views, frames, shape }), textured: true, textures: Object.freeze({ leaf: null, variants: Object.freeze(textures) }), triangles, drawTriangles: 2, vertices: 4, bytes });
}

/** The GPU bytes of a record's textures, deduplicated by content across the set's records (the leaf atlases are shared). @param {Map<string, number>} seen */
function textureBytes(record, seen) {
    for (const entry of record.compression) if (!seen.has(entry.sha256)) seen.set(entry.sha256, entry.blockGpuBytes);
}

/**
 * Loads a catalog-distant asset set of a validated recipe: per LOD the merged card geometry (levels 3, 4) or the impostor quad and tables (level 5)
 * with the variants' textures, the bytes to reserve (geometry plus the transcoded texture blocks, shared atlases counted once) and a disposer.
 * @param {{asset:{kind:string,species:string,variants:ReadonlyArray<string>,footprintRadiusMeters:number,heightMeters:number,lods:ReadonlyArray<{level:number}>},renderer:any,signal?:AbortSignal}} options
 */
export async function loadEcosystemCatalogAsset({ asset, renderer, signal }) {
    if (asset?.kind !== 'catalog-distant') throw new Error(`[LandscapeEcosystem] catalog assets need a catalog-distant asset set; received ${String(asset?.kind)}`);
    if (asset.variants.length > LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS) throw new Error(`[LandscapeEcosystem] a catalog asset set binds at most ${LANDSCAPE_ECOSYSTEM_MAX_TEXTURE_VARIANTS} variants; ${asset.species} lists ${asset.variants.length}`);
    const started = performance.now(), handles = [], lods = [], seen = new Map();
    const dispose = () => { for (const lod of lods) lod.geometry.dispose(); for (const handle of handles) handle.dispose(); };
    try {
        for (const lod of asset.lods) {
            const loaded = await Promise.all(asset.variants.map(variant => loadDistantVegetation({ species: asset.species, variant, level: lod.level, renderer })));
            handles.push(...loaded);
            signal?.throwIfAborted();
            for (const handle of loaded) textureBytes(handle.record, seen);
            lods.push(lod.level === IMPOSTOR_LEVEL ? impostorLod(loaded) : cardLod(loaded, lod.level));
        }
    } catch (error) { dispose(); throw error; }
    const geometryBytes = lods.reduce((sum, lod) => sum + lod.bytes, 0), textureGpuBytes = [...seen.values()].reduce((sum, bytes) => sum + bytes, 0);
    return Object.freeze({ kind: asset.kind, species: asset.species, variants: asset.variants.length, footprintRadiusMeters: asset.footprintRadiusMeters, heightMeters: asset.heightMeters, lods: Object.freeze(lods),
        bytes: Object.freeze({ cpuBytes: geometryBytes + textureGpuBytes, gpuBytes: geometryBytes + textureGpuBytes }), loadMs: performance.now() - started, dispose });
}
