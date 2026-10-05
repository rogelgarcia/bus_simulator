// Decodes Radiance RGBE (.hdr) images exactly as three.js HDRLoader stores them, for landscape lighting tests.

/** @param {Uint8Array} buffer @returns {{width:number,height:number,data:Float32Array,channels:4,encoding:'float'}} RGBA floats, rows from +Y down */
export function decodeRadianceHdr(buffer) {
    let offset = 0, width = 0, height = 0;
    for (;;) {
        const end = buffer.indexOf(10, offset);
        if (end < 0) throw new Error('No Radiance HDR resolution line');
        const line = new TextDecoder('latin1').decode(buffer.subarray(offset, end));
        offset = end + 1;
        const size = /^-Y (\d+) \+X (\d+)$/.exec(line);
        if (size) { height = Number(size[1]); width = Number(size[2]); break; }
    }
    const data = new Float32Array(width * height * 4), scan = new Uint8Array(width * 4);
    for (let y = 0; y < height; y++) {
        if (buffer[offset] !== 2 || buffer[offset + 1] !== 2) throw new Error('Only new-style run-length scanlines are supported');
        offset += 4;
        for (let channel = 0; channel < 4; channel++) {
            for (let x = 0; x < width;) {
                let count = buffer[offset++];
                if (count > 128) { count -= 128; const value = buffer[offset++]; for (let k = 0; k < count; k++) scan[(x++) * 4 + channel] = value; }
                else for (let k = 0; k < count; k++) scan[(x++) * 4 + channel] = buffer[offset++];
            }
        }
        for (let x = 0; x < width; x++) {
            // three.js RGBEByteToRGBFloat / RGBEByteToRGBHalf: byte · 2^(e-128) / 255
            const scale = 2 ** (scan[x * 4 + 3] - 128) / 255, target = (y * width + x) * 4;
            data[target] = scan[x * 4] * scale; data[target + 1] = scan[x * 4 + 1] * scale; data[target + 2] = scan[x * 4 + 2] * scale; data[target + 3] = 1;
        }
    }
    return { width, height, data, channels: 4, encoding: 'float' };
}

/** IEEE binary16 bits of a float with the mantissa truncation of three.js DataUtils.toHalfFloat (subnormals flush to zero). @param {number} value */
export function landscapeHalfFloatBits(value) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, Math.min(65504, Math.max(-65504, value)));
    const bits = view.getUint32(0), sign = (bits >>> 16) & 0x8000, exponent = ((bits >>> 23) & 0xff) - 127 + 15;
    return exponent <= 0 ? sign : sign | (exponent << 10) | ((bits >>> 13) & 0x3ff);
}

/** The half-float RGBA image three.js HDRLoader uploads (HalfFloatType). @param {{width:number,height:number,data:Float32Array}} image */
export function toHalfFloatImage(image) {
    const data = new Uint16Array(image.data.length);
    for (let index = 0; index < data.length; index++) data[index] = landscapeHalfFloatBits(image.data[index]);
    return { width: image.width, height: image.height, data, channels: 4, encoding: 'half' };
}
