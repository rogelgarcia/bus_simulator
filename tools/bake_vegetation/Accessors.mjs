// Reads large glTF accessors without expanding them into millions of JavaScript objects.
// @ts-check
import { createHash } from 'node:crypto';

export function readAccessor(document, index) {
    const accessor = document.json.accessors[index], view = document.json.bufferViews[accessor.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    if (!width || !size || accessor.sparse) throw new Error('Unsupported vegetation accessor');
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? width * size;
    return { count: accessor.count, width, get(row, column = 0) {
        const offset = start + row * stride + column * size;
        const value = accessor.componentType === 5126 ? document.bin.readFloatLE(offset)
            : size === 1 ? document.bin.readUInt8(offset) : size === 2 ? document.bin.readUInt16LE(offset) : document.bin.readUInt32LE(offset);
        return accessor.normalized ? value / (size === 1 ? 255 : size === 2 ? 65535 : 4294967295) : value;
    } };
}

export function primitiveFingerprint(document, materialName) {
    const primitive = document.json.meshes.flatMap(mesh => mesh.primitives).find(item => document.json.materials[item.material].name === materialName);
    const result = {};
    for (const [name, index] of [['positions', primitive.attributes.POSITION], ['uvs', primitive.attributes.TEXCOORD_0], ['indices', primitive.indices], ['normals', primitive.attributes.NORMAL], ['colors', primitive.attributes.COLOR_0]]) {
        if (index === undefined) { result[name] = null; continue; }
        const accessor = readAccessor(document, index), hash = createHash('sha256'), chunk = Buffer.allocUnsafe(65536);
        let offset = 0;
        for (let row = 0; row < accessor.count; row++) for (let column = 0; column < accessor.width; column++) {
            const value = accessor.get(row, column);
            if (name === 'indices') chunk.writeUInt32LE(value, offset); else chunk.writeFloatLE(value, offset);
            offset += 4;
            if (offset === chunk.length) { hash.update(chunk); offset = 0; }
        }
        if (offset) hash.update(chunk.subarray(0, offset));
        result[name] = hash.digest('hex');
    }
    return result;
}
