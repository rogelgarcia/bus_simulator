// Writes and reads landscape interchange maps (heights or masks as RAW float32, PNG 8/16-bit gray or EXR float32) with an authenticated metadata sidecar.
// @ts-check
// A map file alone cannot say where it sits in the world or what its numbers mean, so every map travels with `<file>.meta.json`
// (format landscape-interchange-map, schema 1): the frame (columns, rows, spacing, bounds, row 0 north, X east / Z north / Y up),
// the units and value range (the quantization range for PNG, the measured extent for float encodings, 0..1 for masks), the sea level,
// the SHA-256 and byte length of the map (an import authenticates the bytes before decoding) and the provenance of the writer. The
// `created` field carries the recipe identity rather than a timestamp, so repeated bakes write identical sidecars. EXR files also embed
// the same metadata (without the hash of the file that contains it) as the string attribute landscapeMeta and an import checks both
// agree. Frames are compared exactly against the expected grid and never resampled here; heights decode to meters and masks to 0..1,
// with RAW and EXR bit exact and PNG exact to its quantization step. External tools (Gaea, World Machine, Houdini) stay optional inputs:
// an external map is adopted by writing its sidecar from declared parameters, never through a runtime dependency on the tool.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicAuthoringWrite, readAuthoringFile } from '../../../landscape_authoring/AuthoringFiles.mjs';
import { decodeExr, encodeExr } from './ExrCodec.mjs';
import { decodePng, encodePng } from './PngCodec.mjs';
import { decodeRaw, encodeRaw } from './RawCodec.mjs';

export const LANDSCAPE_INTERCHANGE_FORMAT = 'landscape-interchange-map';
export const LANDSCAPE_INTERCHANGE_SCHEMA_VERSION = 1;
export const LANDSCAPE_INTERCHANGE_KINDS = Object.freeze(['heights', 'mask']);
export const LANDSCAPE_INTERCHANGE_ENCODINGS = Object.freeze(['raw-float32', 'png-gray16', 'png-gray8', 'exr-float32']);
export const LANDSCAPE_INTERCHANGE_ROW_ORDER = 'north-first';
export const LANDSCAPE_INTERCHANGE_AXES = 'X east, Z north, Y up';
export const LANDSCAPE_INTERCHANGE_META_SUFFIX = '.meta.json';
export const LANDSCAPE_INTERCHANGE_MAP_LIMIT = 1 << 30;
const META_LIMIT = 256 << 10, PROVENANCE_LIMIT = 64 << 10, MAXIMUM_DIMENSION = 65536;
const META_KEYS = 'axes,bounds,byteLength,columns,created,encoding,format,kind,provenance,range,rowOrder,rows,schemaVersion,seaLevel,sha256,spacing,units';
const UNITS = Object.freeze({ heights: 'meters', mask: 'dimensionless' });
const QUANTIZATION = Object.freeze({ 'png-gray8': 255, 'png-gray16': 65535 });
const MASK_RANGE = Object.freeze({ min: 0, max: 1 });

/** @typedef {{columns:number,rows:number,spacingX:number,spacingZ:number,minX:number,maxZ:number}} LandscapeMapFrame */

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`[Interchange] ${message}`); };
const nearly = (a, b) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const round12 = value => Math.round(value * 1e12) / 1e12;

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

function validateFrame(frame, label) {
    if (!frame || typeof frame !== 'object') fail(`${label} must be a grid frame {columns, rows, spacingX, spacingZ, minX, maxZ}`);
    for (const key of ['columns', 'rows']) if (!Number.isInteger(frame[key]) || frame[key] < 1 || frame[key] > MAXIMUM_DIMENSION) fail(`${label}.${key} must be an integer in 1..${MAXIMUM_DIMENSION}`);
    for (const key of ['spacingX', 'spacingZ']) if (!(Number.isFinite(frame[key]) && frame[key] > 0)) fail(`${label}.${key} must be a positive spacing`);
    for (const key of ['minX', 'maxZ']) if (!Number.isFinite(frame[key])) fail(`${label}.${key} must be finite`);
}

/** The frame a sidecar describes, in the engine's grid shape. @param {any} meta @returns {LandscapeMapFrame} */
export function landscapeMapFrame(meta) {
    return { columns: meta.columns, rows: meta.rows, spacingX: meta.spacing.x, spacingZ: meta.spacing.z, minX: meta.bounds.minX, maxZ: meta.bounds.maxZ };
}

/** Exact frame equality (the only acceptance an import makes; nothing is resampled). @param {LandscapeMapFrame} a @param {LandscapeMapFrame} b */
export function sameLandscapeMapFrame(a, b) {
    return ['columns', 'rows', 'spacingX', 'spacingZ', 'minX', 'maxZ'].every(key => a[key] === b[key]);
}

/** @param {LandscapeMapFrame} frame */
export const describeLandscapeMapFrame = frame => `${frame.columns}x${frame.rows} at ${frame.spacingX}x${frame.spacingZ} m from (${frame.minX}, ${frame.maxZ})`;

function validateProvenance(provenance, label) {
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) fail(`${label} must be an object`);
    if (typeof provenance.tool !== 'string' || !provenance.tool) fail(`${label}.tool must name the tool that wrote the map`);
    const json = JSON.stringify(provenance);
    if (json.length > PROVENANCE_LIMIT) fail(`${label} exceeds ${PROVENANCE_LIMIT} bytes`);
    return JSON.parse(json);
}

/** Strict sidecar validation; returns the meta unchanged. @param {any} meta */
export function validateLandscapeMapMeta(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail('metadata must be an object');
    const keys = Object.keys(meta).sort().join(',');
    if (keys !== META_KEYS) fail(`metadata must have exactly the fields ${META_KEYS.split(',').join(', ')} (got ${keys || 'none'})`);
    if (meta.format !== LANDSCAPE_INTERCHANGE_FORMAT || meta.schemaVersion !== LANDSCAPE_INTERCHANGE_SCHEMA_VERSION) fail(`metadata must be ${LANDSCAPE_INTERCHANGE_FORMAT} schema ${LANDSCAPE_INTERCHANGE_SCHEMA_VERSION}`);
    if (!LANDSCAPE_INTERCHANGE_KINDS.includes(meta.kind)) fail(`metadata.kind must be one of ${LANDSCAPE_INTERCHANGE_KINDS.join(', ')}`);
    if (!LANDSCAPE_INTERCHANGE_ENCODINGS.includes(meta.encoding)) fail(`metadata.encoding must be one of ${LANDSCAPE_INTERCHANGE_ENCODINGS.join(', ')}`);
    if (!meta.spacing || typeof meta.spacing !== 'object' || !meta.bounds || typeof meta.bounds !== 'object') fail('metadata.spacing and metadata.bounds must be objects');
    validateFrame({ columns: meta.columns, rows: meta.rows, spacingX: meta.spacing.x, spacingZ: meta.spacing.z, minX: meta.bounds.minX, maxZ: meta.bounds.maxZ }, 'metadata');
    for (const key of ['maxX', 'minZ']) if (!Number.isFinite(meta.bounds[key])) fail(`metadata.bounds.${key} must be finite`);
    if (!nearly(meta.bounds.maxX, meta.bounds.minX + (meta.columns - 1) * meta.spacing.x) || !nearly(meta.bounds.minZ, meta.bounds.maxZ - (meta.rows - 1) * meta.spacing.z)) fail('metadata.bounds must equal (columns - 1) * spacing.x by (rows - 1) * spacing.z');
    if (meta.rowOrder !== LANDSCAPE_INTERCHANGE_ROW_ORDER) fail(`metadata.rowOrder must be ${LANDSCAPE_INTERCHANGE_ROW_ORDER}`);
    if (meta.axes !== LANDSCAPE_INTERCHANGE_AXES) fail(`metadata.axes must be "${LANDSCAPE_INTERCHANGE_AXES}"`);
    if (meta.units !== UNITS[meta.kind]) fail(`metadata.units must be ${UNITS[meta.kind]} for ${meta.kind}`);
    if (!meta.range || typeof meta.range !== 'object' || !Number.isFinite(meta.range.min) || !Number.isFinite(meta.range.max) || meta.range.max < meta.range.min) fail('metadata.range must be {min, max} with max >= min');
    if (meta.kind === 'mask' && (meta.range.min !== 0 || meta.range.max !== 1)) fail('metadata.range of a mask must be 0..1');
    if (meta.encoding in QUANTIZATION && !(meta.range.max > meta.range.min)) fail('metadata.range of a PNG map must span a positive interval');
    if (!Number.isFinite(meta.seaLevel)) fail('metadata.seaLevel must be finite');
    if (typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sha256)) fail('metadata.sha256 must be a lowercase SHA-256');
    if (!Number.isInteger(meta.byteLength) || meta.byteLength < 1) fail('metadata.byteLength must be a positive integer');
    validateProvenance(meta.provenance, 'metadata.provenance');
    if (typeof meta.created !== 'string' || !meta.created || meta.created.length > 256) fail('metadata.created must be a non-empty string (the recipe identity for engine exports)');
    return meta;
}

function stripHash(meta) {
    const { sha256: _sha, byteLength: _length, ...rest } = meta;
    return rest;
}

// the sidecar without its hash fields; `extent` is the measured value extent that float-encoded heights record as their range
function buildMeta({ kind, encoding, grid, seaLevel, range, extent, provenance, created }) {
    if (!LANDSCAPE_INTERCHANGE_KINDS.includes(kind)) fail(`kind must be one of ${LANDSCAPE_INTERCHANGE_KINDS.join(', ')}`);
    if (!LANDSCAPE_INTERCHANGE_ENCODINGS.includes(encoding)) fail(`encoding must be one of ${LANDSCAPE_INTERCHANGE_ENCODINGS.join(', ')}`);
    validateFrame(grid, 'grid');
    if (!Number.isFinite(seaLevel)) fail('seaLevel must be finite');
    const tracked = validateProvenance(provenance, 'provenance'), stamp = created ?? tracked.recipeIdentity ?? null;
    if (typeof stamp !== 'string' || !stamp) fail('created (or provenance.recipeIdentity) is required: sidecars carry the recipe identity, never a timestamp');
    let span;
    if (kind === 'mask') {
        if (range !== null) fail('range applies to heights only; masks are always 0..1');
        span = MASK_RANGE;
    } else if (encoding in QUANTIZATION) {
        if (!range || typeof range !== 'object' || !Number.isFinite(range.minMeters) || !Number.isFinite(range.maxMeters) || !(range.maxMeters > range.minMeters)) fail(`${encoding} heights need range {minMeters, maxMeters} with maxMeters > minMeters`);
        span = { min: range.minMeters, max: range.maxMeters };
    } else {
        if (range !== null) fail(`range applies only to the PNG encodings of heights (${encoding} stores meters exactly)`);
        span = extent;
    }
    return { format: LANDSCAPE_INTERCHANGE_FORMAT, schemaVersion: LANDSCAPE_INTERCHANGE_SCHEMA_VERSION, kind, encoding, columns: grid.columns, rows: grid.rows,
        spacing: { x: grid.spacingX, z: grid.spacingZ }, bounds: { minX: grid.minX, maxX: round12(grid.minX + (grid.columns - 1) * grid.spacingX), minZ: round12(grid.maxZ - (grid.rows - 1) * grid.spacingZ), maxZ: grid.maxZ },
        rowOrder: LANDSCAPE_INTERCHANGE_ROW_ORDER, axes: LANDSCAPE_INTERCHANGE_AXES, units: UNITS[kind], range: { min: span.min, max: span.max }, seaLevel, sha256: '', byteLength: 0, provenance: tracked, created: stamp };
}

function measure(values, label) {
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!Number.isFinite(value)) fail(`${label} sample ${i} is not finite`);
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
    }
    return { min: round12(minimum), max: round12(maximum) };
}

function quantize(values, range, maximum, Type) {
    const span = range.max - range.min, data = new Type(values.length);
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value < range.min || value > range.max) fail(`sample ${i} (${value}) lies outside the declared range ${range.min}..${range.max}; widen the range instead of clamping`);
        data[i] = Math.round((value - range.min) / span * maximum);
    }
    return data;
}

function dequantize(data, range, maximum) {
    const span = range.max - range.min, values = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) values[i] = range.min + data[i] / maximum * span;
    return values;
}

/**
 * Encodes a map and builds its sidecar metadata (sha256 and byteLength included).
 * @param {{kind:'heights'|'mask',encoding:string,grid:LandscapeMapFrame,values:Float32Array,seaLevel:number,range?:{minMeters:number,maxMeters:number}|null,provenance:any,created?:string|null}} map
 * @returns {{bytes:Buffer,meta:any}}
 */
export function encodeLandscapeMap({ kind, encoding, grid, values, seaLevel, range = null, provenance, created = null }) {
    if (!(values instanceof Float32Array)) fail('values must be a Float32Array');
    const extent = measure(values, 'map'), meta = buildMeta({ kind, encoding, grid, seaLevel, range, extent, provenance, created }), n = meta.columns * meta.rows;
    if (values.length !== n) fail(`values must hold ${n} samples (${meta.columns}x${meta.rows}), got ${values.length}`);
    if (kind === 'mask' && (extent.min < 0 || extent.max > 1)) fail(`mask values must lie in 0..1 (got ${extent.min}..${extent.max})`);
    let bytes;
    if (encoding === 'raw-float32') bytes = encodeRaw(values);
    else if (encoding === 'exr-float32') bytes = encodeExr({ width: grid.columns, height: grid.rows, values, landscapeMeta: JSON.stringify(stripHash(meta)) });
    else bytes = encodePng({ width: grid.columns, height: grid.rows, channels: 1, bitDepth: encoding === 'png-gray16' ? 16 : 8, data: quantize(values, meta.range, QUANTIZATION[encoding], encoding === 'png-gray16' ? Uint16Array : Uint8Array) });
    meta.sha256 = sha256(bytes); meta.byteLength = bytes.length;
    return { bytes, meta: validateLandscapeMapMeta(meta) };
}

function decodeBytes(bytes, meta, label) {
    const { columns, rows, encoding } = meta;
    let values;
    if (encoding === 'raw-float32') values = decodeRaw(bytes, columns, rows);
    else if (encoding === 'exr-float32') {
        const exr = decodeExr(bytes);
        if (exr.width !== columns || exr.height !== rows) fail(`${label} is ${exr.width}x${exr.height}, the metadata declares ${columns}x${rows}`);
        if (exr.landscapeMeta !== null) {
            let embedded;
            try { embedded = JSON.parse(exr.landscapeMeta); } catch { fail(`${label} embeds a landscapeMeta attribute that is not JSON`); }
            if (canonical(embedded) !== canonical(stripHash(meta))) fail(`${label} embeds landscapeMeta that differs from its sidecar; the sidecar or the file was edited after the export`);
        }
        values = exr.values;
    } else {
        const png = decodePng(bytes), bitDepth = encoding === 'png-gray16' ? 16 : 8;
        if (png.channels !== 1 || png.bitDepth !== bitDepth) fail(`${label} is a ${png.channels}-channel ${png.bitDepth}-bit PNG, ${encoding} needs 1-channel ${bitDepth}-bit gray`);
        if (png.width !== columns || png.height !== rows) fail(`${label} is ${png.width}x${png.height}, the metadata declares ${columns}x${rows}`);
        values = dequantize(png.data, meta.range, QUANTIZATION[encoding]);
    }
    const extent = measure(values, label);
    if (meta.kind === 'mask' && (extent.min < 0 || extent.max > 1)) fail(`${label} mask values ${extent.min}..${extent.max} lie outside 0..1`);
    return { values, extent };
}

/**
 * Authenticates and decodes a map against its sidecar (and the expected grid when given): heights in meters, masks in 0..1.
 * @param {Uint8Array} bytes @param {any} meta sidecar object @param {{expectedGrid?:LandscapeMapFrame|null,label?:string}} [options]
 * @returns {{values:Float32Array,meta:any}}
 */
export function decodeLandscapeMap(bytes, meta, { expectedGrid = null, label = 'map' } = {}) {
    validateLandscapeMapMeta(meta);
    if (!(bytes instanceof Uint8Array)) fail(`${label} bytes must be a byte array`);
    if (bytes.byteLength !== meta.byteLength) fail(`${label} holds ${bytes.byteLength} bytes, the metadata declares ${meta.byteLength}`);
    const digest = sha256(bytes);
    if (digest !== meta.sha256) fail(`${label} sha256 ${digest} differs from the metadata ${meta.sha256}: the map changed after its sidecar was written`);
    if (expectedGrid !== null && !sameLandscapeMapFrame(landscapeMapFrame(meta), expectedGrid)) fail(`${label} frame ${describeLandscapeMapFrame(landscapeMapFrame(meta))} differs from the expected grid ${describeLandscapeMapFrame(expectedGrid)}; interchange maps are never resampled`);
    return { values: decodeBytes(bytes, meta, label).values, meta };
}

const defaultRead = file => readAuthoringFile(file, LANDSCAPE_INTERCHANGE_MAP_LIMIT);

async function readSidecar(file, read) {
    const sidecar = `${file}${LANDSCAPE_INTERCHANGE_META_SUFFIX}`;
    let bytes;
    try { bytes = await read(sidecar); }
    catch (error) {
        if (error?.code === 'ENOENT') fail(`${file} has no metadata sidecar ${path.basename(sidecar)}; every interchange map needs one (adoptLandscapeMap writes it for an external map)`);
        throw error;
    }
    if (bytes.byteLength > META_LIMIT) fail(`${path.basename(sidecar)} exceeds ${META_LIMIT} bytes`);
    try { return JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')); }
    catch { return fail(`${path.basename(sidecar)} is not JSON`); }
}

/**
 * Reads a map and its sidecar (through `read` when given, so a recipe runner can resolve relative names) and decodes it.
 * @param {string} file @param {{expectedGrid?:LandscapeMapFrame|null,read?:(file:string)=>Promise<Uint8Array>}} [options]
 * @returns {Promise<{values:Float32Array,meta:any,sha256:string,byteLength:number}>}
 */
export async function importLandscapeMap(file, { expectedGrid = null, read = defaultRead } = {}) {
    if (typeof file !== 'string' || !file) fail('importLandscapeMap needs a file path');
    const meta = await readSidecar(file, read), bytes = await read(file);
    const decoded = decodeLandscapeMap(bytes, meta, { expectedGrid, label: path.basename(file) });
    return { values: decoded.values, meta: decoded.meta, sha256: decoded.meta.sha256, byteLength: decoded.meta.byteLength };
}

/**
 * Encodes a map, writes it and its sidecar atomically.
 * @param {{file:string}&Parameters<typeof encodeLandscapeMap>[0]} map
 * @returns {Promise<{file:string,metaFile:string,sha256:string,byteLength:number,meta:any}>}
 */
export async function exportLandscapeMap({ file, ...map }) {
    if (typeof file !== 'string' || !file) fail('exportLandscapeMap needs a file path');
    const { bytes, meta } = encodeLandscapeMap(map), metaFile = `${file}${LANDSCAPE_INTERCHANGE_META_SUFFIX}`;
    await atomicAuthoringWrite(file, bytes);
    await atomicAuthoringWrite(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    return { file, metaFile, sha256: meta.sha256, byteLength: meta.byteLength, meta };
}

/**
 * Writes the sidecar of a map produced by an external tool from declared parameters, after checking that the file decodes in that frame.
 * @param {{file:string,kind:'heights'|'mask',encoding:string,grid:LandscapeMapFrame,seaLevel:number,range?:{minMeters:number,maxMeters:number}|null,provenance:any,created:string}} map
 * @returns {Promise<{file:string,metaFile:string,meta:any}>}
 */
export async function adoptLandscapeMap({ file, kind, encoding, grid, seaLevel, range = null, provenance, created }) {
    if (typeof file !== 'string' || !file) fail('adoptLandscapeMap needs a file path');
    const bytes = await defaultRead(file), label = path.basename(file);
    const declared = { ...buildMeta({ kind, encoding, grid, seaLevel, range, extent: { min: 0, max: 0 }, provenance, created }), sha256: sha256(bytes), byteLength: bytes.length };
    const { extent } = decodeBytes(bytes, declared, label);
    const meta = validateLandscapeMapMeta(kind === 'heights' && !(encoding in QUANTIZATION) ? { ...declared, range: extent } : declared), metaFile = `${file}${LANDSCAPE_INTERCHANGE_META_SUFFIX}`;
    await atomicAuthoringWrite(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    return { file, metaFile, meta };
}
