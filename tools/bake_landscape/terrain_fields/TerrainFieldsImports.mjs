// Reads optional retained interoperable field maps (for example Gaea erosion flow, wear or deposits) as authenticated bake overrides.
// @ts-check
// A request (landscape-terrain-field-imports v1) names grayscale 8- or 16-bit PNG maps exactly covering the native grid (row 0 north),
// the field each one overrides (flow, deposition, wetness, rockExposure; Gaea "wear" belongs to rockExposure), a combination mode
// (replace, max, blend) with its weight, and retained provenance. Maps are decoded here at bake time into normalized [0, 1] values and
// recorded by SHA-256; no proprietary tool or file is a runtime dependency, and runs without a request ignore this module entirely.
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { authoringHash, readAuthoringFile } from '../../landscape_authoring/AuthoringFiles.mjs';

export const TERRAIN_FIELD_IMPORTS_FORMAT = 'landscape-terrain-field-imports';
const MAX_REQUEST_BYTES = 64 * 1024, MAX_MAP_BYTES = 256 * 1024 * 1024;
const FIELDS = new Set(['flow', 'deposition', 'wetness', 'rockExposure']);
const keys = value => Object.keys(value).sort().join(',');

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

/**
 * Decodes a non-interlaced grayscale PNG of bit depth 8 or 16 into normalized values (row 0 first).
 * @param {Uint8Array} bytes @returns {{width:number,height:number,bitDepth:number,values:Float32Array}}
 */
export function decodeGrayscalePng(bytes) {
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('[TerrainFields] Import map is not a PNG');
    let offset = 8, width = 0, height = 0, bitDepth = 0, ended = false;
    const compressed = [];
    while (offset + 12 <= buffer.length && !ended) {
        const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + size);
        if (offset + 12 + size > buffer.length) throw new Error('[TerrainFields] Truncated PNG chunk');
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8];
            if (data[9] !== 0 || ![8, 16].includes(bitDepth) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('[TerrainFields] Import maps must be non-interlaced 8- or 16-bit grayscale PNG');
        } else if (type === 'IDAT') compressed.push(data);
        else if (type === 'IEND') ended = true;
        else if (type[0] === type[0].toUpperCase()) throw new Error(`[TerrainFields] Unsupported critical PNG chunk ${type}`);
        offset += 12 + size;
    }
    if (!ended || !width || !height || !compressed.length) throw new Error('[TerrainFields] Incomplete PNG');
    const pixel = bitDepth / 8, stride = width * pixel, expected = (stride + 1) * height;
    const filtered = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
    if (filtered.length !== expected) throw new Error('[TerrainFields] PNG decoded length mismatch');
    const raw = new Uint8Array(stride * height), values = new Float32Array(width * height), maximum = bitDepth === 16 ? 65535 : 255;
    for (let y = 0; y < height; y++) {
        const filter = filtered[y * (stride + 1)], source = y * (stride + 1) + 1, target = y * stride;
        if (filter > 4) throw new Error(`[TerrainFields] Unsupported PNG row filter ${filter}`);
        for (let x = 0; x < stride; x++) {
            const left = x >= pixel ? raw[target + x - pixel] : 0, up = y ? raw[target - stride + x] : 0, corner = y && x >= pixel ? raw[target - stride + x - pixel] : 0;
            const value = filtered[source + x];
            raw[target + x] = (filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up : filter === 3 ? value + ((left + up) >> 1) : value + paeth(left, up, corner)) & 255;
        }
        for (let x = 0; x < width; x++) values[y * width + x] = (bitDepth === 16 ? raw[target + x * 2] * 256 + raw[target + x * 2 + 1] : raw[target + x]) / maximum;
    }
    return { width, height, bitDepth, values };
}

/**
 * @param {string} file request path @param {any} manifest validated landscape manifest
 * @returns {Promise<{request:any,sha256:string,files:string[],entries:{id:string,field:string,mode:string,weight:number,values:Float32Array,sha256:string,byteLength:number,encoding:string,provenance:any}[]}>}
 */
export async function readTerrainFieldImports(file, manifest) {
    const bytes = await readAuthoringFile(file, MAX_REQUEST_BYTES), request = JSON.parse(bytes.toString('utf8'));
    if (keys(request) !== 'format,landscapeId,maps,schemaVersion' || request.format !== TERRAIN_FIELD_IMPORTS_FORMAT || request.schemaVersion !== 1 || request.landscapeId !== manifest.id
        || !Array.isArray(request.maps) || !request.maps.length || request.maps.length > 8) {
        throw new Error(`[TerrainFields] Import request must be ${TERRAIN_FIELD_IMPORTS_FORMAT} schema 1 for landscape ${manifest.id} with 1..8 maps`);
    }
    const entries = [], files = [file], ids = new Set();
    for (const map of request.maps) {
        if (keys(map) !== 'encoding,field,file,id,mode,provenance,rowOrder,weight' || typeof map.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(map.id) || ids.has(map.id)
            || !FIELDS.has(map.field) || !['replace', 'max', 'blend'].includes(map.mode) || !['png-gray8', 'png-gray16'].includes(map.encoding) || map.rowOrder !== 'north-first'
            || !(typeof map.weight === 'number' && map.weight > 0 && map.weight <= 1) || typeof map.file !== 'string' || !map.file || path.isAbsolute(map.file) || map.file.split(/[\\/]/).includes('..')
            || !map.provenance || typeof map.provenance !== 'object' || typeof map.provenance.tool !== 'string' || !map.provenance.tool) {
            throw new Error(`[TerrainFields] Invalid import map ${map?.id ?? '(unnamed)'}: requires id, field, file, encoding, mode, weight, rowOrder north-first and tool provenance`);
        }
        ids.add(map.id);
        const location = path.resolve(path.dirname(file), map.file), payload = await readAuthoringFile(location, MAX_MAP_BYTES), decoded = decodeGrayscalePng(payload);
        if (decoded.width !== manifest.grid.columns || decoded.height !== manifest.grid.rows) throw new Error(`[TerrainFields] Import map ${map.id} is ${decoded.width}x${decoded.height}; the native grid is ${manifest.grid.columns}x${manifest.grid.rows}`);
        if ((map.encoding === 'png-gray16') !== (decoded.bitDepth === 16)) throw new Error(`[TerrainFields] Import map ${map.id} declares ${map.encoding} but is ${decoded.bitDepth}-bit`);
        files.push(location);
        entries.push({ id: map.id, field: map.field, mode: map.mode, weight: map.weight, values: decoded.values, sha256: authoringHash(payload), byteLength: payload.length,
            encoding: map.encoding, provenance: JSON.parse(JSON.stringify(map.provenance)) });
    }
    return { request, sha256: authoringHash(bytes), files, entries };
}
