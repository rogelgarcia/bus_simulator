// Versioned, lossless pose columns with compact metrics and gzip clipboard transport.
// @ts-check
/** @typedef {Record<string, Float64Array | Float32Array | Uint32Array>} FrameColumns */
/** @typedef {{metadata: object, chunks: FrameColumns[], count: number}} FrameRecordingInput */
/** @typedef {{metadata: object, columns: FrameColumns, count: number}} DecodedFrameRecording */
export const RECORDING_PREFIX = 'BUSREC1:';
export const MAX_RECORDING_FRAMES = 36000;
const TYPES = { f64: [Float64Array, 8, 'Float64'], f32: [Float32Array, 4, 'Float32'], u32: [Uint32Array, 4, 'Uint32'] };
export const FRAME_FIELDS = Object.freeze([
    ['frame', 'f64'], ['timeMs', 'f64'], ['dtMs', 'f32'], ['cpuMs', 'f32'], ['gpuMs', 'f32'], ['gpuSubmission', 'u32'],
    ...['bus', 'camera'].flatMap(name => ['X','Y','Z','Qx','Qy','Qz','Qw'].map(key => [`${name}${key}`, 'f64'])),
    ...['fov','zoom','near','far','aspect','steering','throttle','brake','handbrake','heapMiB','recorderCpuMs'].map(key => [key, 'f32']),
    ...['calls','triangles','geometries','textures','programs','width','height','flags','bakeGeneration','gpuDisjoint'].map(key => [key, 'u32'])
].map(entry => Object.freeze(entry)));
const ROW_BYTES = FRAME_FIELDS.reduce((sum, [, type]) => sum + TYPES[type][1], 0);
const MAX_BYTES = MAX_RECORDING_FRAMES * ROW_BYTES + 1024 * 1024;

/** @param {number} capacity @returns {FrameColumns} */
export function createFrameChunk(capacity = 1024) {
    return Object.fromEntries(FRAME_FIELDS.map(([name, type]) => [name, new TYPES[type][0](capacity)]));
}

/** @param {FrameRecordingInput} recording @returns {Uint8Array} */
export function packFrameRecording({ metadata, chunks, count }) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_RECORDING_FRAMES) throw new Error('Invalid recording frame count.');
    const header = new TextEncoder().encode(JSON.stringify(metadata));
    if (header.length > 1024 * 1024 - 12) throw new Error('Recording metadata exceeds its size limit.');
    const bytes = new Uint8Array(12 + header.length + count * ROW_BYTES), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x42535231); view.setUint32(4, header.length, true); view.setUint32(8, count, true);
    bytes.set(header, 12);
    let offset = 12 + header.length;
    for (const [name, type] of FRAME_FIELDS) {
        let written = 0;
        for (const chunk of chunks) {
            const length = Math.min(chunk[name].length, count - written);
            for (let i = 0; i < length; i++, offset += TYPES[type][1]) view[`set${TYPES[type][2]}`](offset, chunk[name][i], true);
            written += length;
        }
        if (written !== count) throw new Error('Recording columns are incomplete.');
    }
    return bytes;
}

/** @param {Uint8Array} bytes @returns {DecodedFrameRecording} */
export function unpackFrameRecording(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > MAX_BYTES) throw new Error('Invalid recording size.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0) !== 0x42535231) throw new Error('Unsupported recording version.');
    const headerLength = view.getUint32(4, true), count = view.getUint32(8, true);
    if (count > MAX_RECORDING_FRAMES || 12 + headerLength + count * ROW_BYTES !== bytes.length) throw new Error('Truncated or oversized recording.');
    const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLength)));
    const columns = createFrameChunk(count);
    let offset = 12 + headerLength;
    for (const [name, type] of FRAME_FIELDS) {
        for (let i = 0; i < count; i++, offset += TYPES[type][1]) columns[name][i] = view[`get${TYPES[type][2]}`](offset, true);
    }
    return { metadata, count, columns };
}

/** @param {FrameRecordingInput} recording @returns {Promise<string>} */
export async function encodeFrameRecording(recording) {
    const bytes = packFrameRecording(recording);
    const compressed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let binary = '';
    for (let i = 0; i < compressed.length; i += 8192) binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
    return RECORDING_PREFIX + btoa(binary);
}

/** @param {string} text @returns {Promise<DecodedFrameRecording>} */
export async function decodeFrameRecording(text) {
    const compact = text.trim();
    if (!compact.startsWith(RECORDING_PREFIX) || compact.length > MAX_BYTES * 2) throw new Error('Expected a BUSREC1 recording.');
    const binary = atob(compact.slice(RECORDING_PREFIX.length).replace(/\s/g, ''));
    const compressed = Uint8Array.from(binary, value => value.charCodeAt(0));
    const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = []; let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > MAX_BYTES) throw new Error('Decompressed recording exceeds its size limit.');
            chunks.push(value);
        }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return unpackFrameRecording(bytes);
}

/** @param {DecodedFrameRecording} recording @param {number} index */
export function recordingFramePose(recording, index) {
    if (!Number.isInteger(index) || index < 0 || index >= recording.count) throw new RangeError('Recording frame is out of range.');
    const c = recording.columns;
    const position = name => ({x:c[`${name}X`][index], y:c[`${name}Y`][index], z:c[`${name}Z`][index]});
    const quaternion = name => ({x:c[`${name}Qx`][index], y:c[`${name}Qy`][index], z:c[`${name}Qz`][index], w:c[`${name}Qw`][index]});
    return { version:1, city:recording.metadata.city, bus:{modelId:recording.metadata.busModelId,
        transform:{position:position('bus'),quaternion:quaternion('bus')}},
        camera:{position:position('camera'),quaternion:quaternion('camera'),fovDeg:c.fov[index],locked:true}, simulation:{paused:true} };
}
