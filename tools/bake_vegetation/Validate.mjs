// Authenticates mature vegetation payloads, geometry budgets and physically paired linden surfaces.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { hashFile } from '../baking/Files.mjs';
import { readAccessor, primitiveFingerprint } from './Accessors.mjs';

export function glbDocument(bytes) {
    if (bytes.toString('utf8', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length
        || bytes.toString('utf8', 16, 20) !== 'JSON') throw new Error('Invalid vegetation GLB envelope');
    const end = 20 + bytes.readUInt32LE(12);
    return { json: JSON.parse(bytes.toString('utf8', 20, end)), remainder: bytes.subarray(end), bin: bytes.subarray(end + 8) };
}

function accessorValues(document, index) {
    const accessor = document.json.accessors[index], view = document.json.bufferViews[accessor.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    if (!width || !bytes || accessor.sparse) throw new Error('Unsupported vegetation accessor');
    const result = [];
    for (let row = 0; row < accessor.count; row++) {
        const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + row * (view.byteStride ?? width * bytes);
        result.push(Array.from({ length: width }, (_, column) => {
            const offset = start + column * bytes;
            const value = accessor.componentType === 5126 ? document.bin.readFloatLE(offset)
                : bytes === 1 ? document.bin.readUInt8(offset) : bytes === 2 ? document.bin.readUInt16LE(offset) : document.bin.readUInt32LE(offset);
            return accessor.normalized ? value / (bytes === 1 ? 255 : bytes === 2 ? 65535 : 4294967295) : value;
        }));
    }
    return result;
}

/** Fingerprint accepted foliage using platform-independent little-endian accessor values. */
export function foliageFingerprint(document) {
    return primitiveFingerprint(document, 'foliage');
}

function pngAlpha(bytes) {
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes[24] !== 8 || bytes[25] !== 6) throw new Error('Expected original RGBA foliage atlas');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), chunks = [];
    for (let offset = 8; offset < bytes.length;) {
        const size = bytes.readUInt32BE(offset);
        if (bytes.toString('utf8', offset + 4, offset + 8) === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
        offset += size + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
    const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4) throw new Error('Invalid foliage PNG filter');
        for (let x = 0; x < stride; x++) {
            const offset = y * stride + x, a = x >= 4 ? pixels[offset - 4] : 0, b = y ? pixels[offset - stride] : 0;
            const c = x >= 4 && y ? pixels[offset - stride - 4] : 0;
            const predictors = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)];
            pixels[offset] = (raw[y * (stride + 1) + 1 + x] + predictors[filter]) & 255;
        }
    }
    return { width, height, alpha: Uint8Array.from({ length: width * height }, (_, i) => pixels[i * 4 + 3]) };
}

function validatePairedFoliage(document, primitive) {
    const positions = accessorValues(document, primitive.attributes.POSITION), normals = accessorValues(document, primitive.attributes.NORMAL);
    const uvs = accessorValues(document, primitive.attributes.TEXCOORD_0), indices = accessorValues(document, primitive.indices).flat();
    const pending = new Map();
    const positionKey = index => positions[index].map(value => value.toFixed(6)).join(',');
    for (let i = 0; i < indices.length; i += 3) {
        const triangle = indices.slice(i, i + 3), key = triangle.map(positionKey).sort().join('|');
        const other = pending.get(key);
        if (!other) { pending.set(key, triangle); continue; }
        for (const vertex of triangle) {
            const matched = other.find(index => positionKey(index) === positionKey(vertex));
            const dot = normals[matched].reduce((sum, value, axis) => sum + value * normals[vertex][axis], 0);
            if (dot > -.98 || Math.abs(uvs[matched][0] - uvs[vertex][0]) > .000001
                || Math.abs(Math.abs(uvs[matched][1] - uvs[vertex][1]) - .5) > .000001) throw new Error('Linden paired normals or atlas coordinates disagree');
        }
        const order = triangle.map(vertex => other.findIndex(index => positionKey(index) === positionKey(vertex)));
        if ((order[1] - order[0] + 3) % 3 !== 2) throw new Error('Linden leaf faces must have opposite winding');
        pending.delete(key);
    }
    if (pending.size) throw new Error('Linden foliage contains unpaired triangles');
    const material = document.json.materials[primitive.material];
    const image = document.json.images[document.json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source];
    const view = document.json.bufferViews[image.bufferView];
    const atlas = pngAlpha(document.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    for (let i = 0; i < atlas.width * atlas.height / 2; i++) {
        if (atlas.alpha[i] !== atlas.alpha[i + atlas.width * atlas.height / 2]) throw new Error('Linden upper and underside alpha silhouettes differ');
    }
}

/** @param {{directory:string}} result */
export async function validateVegetation(result) {
    const manifest = JSON.parse(await readFile(path.join(result.directory, 'index.json'), 'utf8'));
    const ids = manifest.prototype ? ['mature_01'] : ['mature_01', 'mature_02', 'mature_03'];
    if (manifest.schema !== 'bus-sim-original-vegetation-v3' || manifest.variants.length !== ids.length || manifest.growthStage !== 'mature') throw new Error('Incomplete mature vegetation publication');
    const solid = manifest.foliageRepresentation === 'solid-leaves-v1';
    const paired = !solid && manifest.speciesId === 'silver-linden';
    if (solid) {
        const study = await hashFile(path.join(result.directory, manifest.leafStudy.file));
        const source = await hashFile(path.join(result.directory, manifest.leafStudy.sourceBlend.file));
        if (study.sha256 !== manifest.leafStudy.sha256 || source.sha256 !== manifest.leafStudy.sourceBlend.sha256) throw new Error('Leaf study authentication failed');
    }
    for (const source of manifest.thirdPartySources ?? []) {
        if (source.license !== 'CC0-1.0' || !source.source || !source.author) throw new Error('Missing CC0 bark provenance');
        for (const record of Object.values(source.maps)) {
            const measured = await hashFile(path.join(result.directory, source.directory, record.file));
            if (measured.sha256 !== record.sha256 || measured.bytes !== record.bytes) throw new Error('Photographic bark source authentication failed');
        }
    }
    for (const id of ids) {
        const record = manifest.variants.find(item => item.id === id);
        if (!record || record.file !== id + '.glb' || record.growthStage !== 'mature' || !record.morphology || 'quality' in record) throw new Error('Invalid mature variant contract');
        const file = path.join(result.directory, record.file), document = glbDocument(await readFile(file)), json = document.json;
        const hash = await hashFile(file);
        if (record.sha256 !== hash.sha256 || record.bytes !== hash.bytes) throw new Error(`Unauthenticated asset ${record.file}`);
        if (json.materials?.length !== 2 || !json.materials.some(v => v.name === 'bark') || !json.materials.some(v => v.name === 'foliage')) throw new Error('Vegetation requires exactly bark and foliage materials');
        const foliage = json.materials.find(v => v.name === 'foliage');
        if (solid ? foliage.alphaMode !== 'OPAQUE' || foliage.doubleSided !== false || foliage.alphaCutoff !== undefined
            : foliage.alphaMode !== 'MASK' || foliage.alphaCutoff !== .5 || foliage.doubleSided !== !paired) throw new Error('Invalid foliage coverage/sidedness contract');
        const primitives = json.meshes.flatMap(mesh => mesh.primitives);
        const triangles = primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
        const bark = primitives.find(primitive => json.materials[primitive.material].name === 'bark');
        const woody = record.woodyDetail;
        if (bark.attributes.COLOR_0 === undefined || !woody?.surfaceColor || !(woody.blendedJunctionVertices > 0)) throw new Error('Missing blended bark surface colors');
        const barkColors = readAccessor(document, bark.attributes.COLOR_0);
        let painted = false;
        for (let row = 0; row < barkColors.count; row++) for (let column = 0; column < barkColors.width; column++) {
            const value = barkColors.get(row, column);
            if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid bark surface colors');
            if (column === 0 && value < .8) painted = true;
        }
        if (barkColors.count !== json.accessors[bark.attributes.POSITION].count || !painted) throw new Error('Unpainted bark surface colors');
        if (primitives.length !== 2 || triangles !== record.triangles || triangles > record.safetyTriangleLimit
            || record.safetyTriangleLimit > (solid ? (manifest.speciesId === 'american-elm' ? 46000000 : 18000000) : 6000000) || !woody || woody.barkTriangles !== json.accessors[bark.indices].count / 3
            || woody.boundaryEdges !== 0 || woody.nonManifoldEdges !== 0 || woody.connectedComponents < 1
            || (manifest.kind === 'tree' && woody.connectedComponents !== 1)
            || woody.measuredReliefMetres <= 0) throw new Error(`Vegetation woody integrity mismatch: ${record.file}: ${triangles}`);
        if (JSON.stringify(foliageFingerprint(document)) !== JSON.stringify(record.foliageFingerprint)) throw new Error('Foliage fingerprint mismatch');
        if (solid) {
            const leaf = primitives.find(primitive => json.materials[primitive.material].name === 'foliage');
            const detail = record.foliageDetail;
            if (!detail?.closedBlades || !detail.closedPetioles || detail.alphaPlates !== 0 || record.cardCount !== 0
                || detail.leafCount < 5000 || detail.templateBoundaryEdges || detail.templateNonManifoldEdges
                || detail.leafTriangles !== json.accessors[leaf.indices].count / 3 || leaf.attributes.COLOR_0 === undefined
                || !(detail.thicknessLengthRatio > 0)) throw new Error('Incomplete solid leaf geometry');
            if (JSON.stringify(primitiveFingerprint(document, 'bark')) !== JSON.stringify(record.woodFingerprint)) throw new Error('Preserved wood fingerprint mismatch');
            const image = json.images[json.textures[foliage.pbrMetallicRoughness.baseColorTexture.index].source];
            const view = json.bufferViews[image.bufferView];
            const alpha = pngAlpha(document.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
            if (alpha.alpha.some(value => value !== 255)) throw new Error('Solid leaves must not depend on texture alpha');
        }
        const source = await hashFile(path.join(result.directory, woody.sourceBlend.file));
        if (source.sha256 !== woody.sourceBlend.sha256 || source.bytes !== woody.sourceBlend.bytes) throw new Error('Detailed Blender source authentication failed');
        if (record.bounds.min[1] !== 0 || record.bounds.max[1] < (manifest.kind === 'shrub' ? 1.5 : 10) || record.bounds.max[1] > 21) throw new Error('Vegetation metric bounds failed');
        for (const primitive of primitives) {
            const positions = readAccessor(document, primitive.attributes.POSITION), normals = readAccessor(document, primitive.attributes.NORMAL);
            for (let row = 0; row < positions.count; row++) {
                for (let column = 0; column < 3; column++) if (!Number.isFinite(positions.get(row, column))) throw new Error('Invalid vegetation position');
                const length = Math.hypot(normals.get(row, 0), normals.get(row, 1), normals.get(row, 2));
                if (!Number.isFinite(length) || Math.abs(length - 1) > .02) throw new Error('Invalid vegetation normal');
            }
            if (paired && json.materials[primitive.material].name === 'foliage') validatePairedFoliage(document, primitive);
        }
        if (json.images?.length !== 6 || json.images.some(image => image.uri || image.mimeType !== 'image/png')) throw new Error('All vegetation maps must be embedded PNGs');
    }
    for (const [name, expected] of Object.entries(manifest.textures)) {
        const file = path.join(result.directory, 'textures', name), data = await readFile(file), hash = await hashFile(file);
        if (hash.sha256 !== expected.sha256 || hash.bytes !== expected.bytes || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
            || data.readUInt32BE(16) !== expected.width || data.readUInt32BE(20) !== expected.height
            || expected.width !== (name.startsWith('bark_') ? 2048 : 1024)) throw new Error(`Vegetation texture authentication failed: ${name}`);
    }
}
