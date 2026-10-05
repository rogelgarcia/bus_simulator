// Packages authenticated Khronos UASTC textures and decodes those exact texels for Blender review.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodePng, encodePng, downsample} from './Png.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const save = (file, data) => writeFile(file, JSON.stringify(data, null, 2) + '\n');
const dependencies = {
    'libktx.js': '96422b4d0d0de173b9796711379b1525585aa03f8f662ad7794f2dd088da32c7',
    'libktx.wasm': '839d8f70377b03e41a73f18ffc3839f87418079792cef4d82aae824a8241c7f0'
};
export async function loadEncoder(root) {
    const folder = path.join(root, 'downloads/tools/ktx-4.4.2');
    for (const [file, hash] of Object.entries(dependencies)) {
        if (digest(await readFile(path.join(folder, file))) !== hash) throw new Error(`Unexpected Khronos encoder: ${file}`);
    }
    const host = {exports: {}};
    // The official pinned UMD package expects CommonJS despite this repository's ESM mode.
    new Function('module', 'exports', 'require', '__dirname', '__filename', await readFile(path.join(folder, 'libktx.js'), 'utf8'))(
        host, host.exports, createRequire(import.meta.url), folder, path.join(folder, 'libktx.js'));
    return host.exports({locateFile: name => path.join(folder, name)});
}
function parseGlb(bytes) {
    const size = bytes.readUInt32LE(12);
    return {doc: JSON.parse(bytes.subarray(20, 20 + size)), bin: bytes.subarray(28 + size)};
}
function packGlb(doc, bin, replacements, compressed) {
    doc = structuredClone(doc);
    const blocks = [], imageViews = new Map(doc.images.map((image, index) => [image.bufferView, index]));
    let offset = 0;
    for (const [index, view] of doc.bufferViews.entries()) {
        const image = imageViews.get(index);
        const data = image === undefined ? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength) : replacements[image];
        view.byteOffset = offset; view.byteLength = data.length;
        blocks.push(data, Buffer.alloc((-data.length) & 3)); offset += data.length + ((-data.length) & 3);
    }
    if (compressed) {
        for (const image of doc.images) image.mimeType = 'image/ktx2';
        for (const texture of doc.textures) {
            texture.extensions = {...texture.extensions, KHR_texture_basisu: {source: texture.source}};
            delete texture.source;
        }
        doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), 'KHR_texture_basisu'])];
        doc.extensionsRequired = [...new Set([...(doc.extensionsRequired ?? []), 'KHR_texture_basisu'])];
    }
    doc.buffers[0].byteLength = offset;
    const raw = Buffer.from(JSON.stringify(doc)), encoded = Buffer.concat([raw, Buffer.alloc((-raw.length) & 3, 32)]);
    const header = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
    header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + encoded.length + offset, 8);
    header.writeUInt32LE(encoded.length, 12); header.write('JSON', 16);
    binaryHeader.writeUInt32LE(offset); binaryHeader.write('BIN\0', 4);
    return Buffer.concat([header, encoded, binaryHeader, ...blocks]);
}
function measure(original, decoded, channel) {
    let square = 0, count = 0, coverageA = 0, coverageB = 0, angle = 0;
    for (let i = 0; i < original.length; i += 4) {
        coverageA += original[i + 3] >= 128; coverageB += decoded[i + 3] >= 128;
        if (original[i + 3] < 128) continue;
        for (let c = 0; c < 3; c++) square += (original[i + c] - decoded[i + c]) ** 2;
        if (channel === 'normal') {
            const a = [0, 1, 2].map(c => original[i + c] / 127.5 - 1), b = [0, 1, 2].map(c => decoded[i + c] / 127.5 - 1);
            angle += Math.acos(Math.min(1, Math.max(-1, a.reduce((sum, v, c) => sum + v * b[c], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1))));
        }
        count++;
    }
    return {psnr: square ? 10 * Math.log10(255 ** 2 / (square / Math.max(1, count * 3))) : 100,
        alphaCoverageError: Math.abs(coverageA - coverageB) / (original.length / 4), meanNormalAngleDegrees: channel === 'normal' ? angle / Math.max(1, count) * 180 / Math.PI : null};
}
async function compressImage(ktx, bytes, channel, directory, foliage, highQuality = false) {
    const levels = [decodePng(bytes)];
    for (let level = 1; levels.at(-1).width > 1 || levels.at(-1).height > 1; level++) {
        levels.push(foliage && level <= 5 ? decodePng(await readFile(path.join(directory, `leaf_${channel}_mip${level}.png`))) : downsample(levels.at(-1), channel));
    }
    const info = new ktx.textureCreateInfo();
    Object.assign(info, {vkFormat: channel === 'color' ? ktx.VkFormat.R8G8B8A8_SRGB : ktx.VkFormat.R8G8B8A8_UNORM,
        baseWidth: levels[0].width, baseHeight: levels[0].height, baseDepth: 1, numDimensions: 2, numLevels: levels.length,
        numLayers: 1, numFaces: 1, isArray: false, generateMipmaps: false});
    const texture = new ktx.texture(info, ktx.TextureCreateStorageEnum.ALLOC_STORAGE), params = new ktx.basisParams();
    const check = result => { if (result.value !== 0) throw new Error(`KTX encoder error ${result.value}`); };
    try {
        for (const [level, image] of levels.entries()) check(texture.setImageFromMemory(level, 0, 0, image.data));
        Object.assign(params, {uastc: true, uastcFlags: (highQuality ? ktx.pack_uastc_flag_bits.LEVEL_VERYSLOW : ktx.pack_uastc_flag_bits.LEVEL_DEFAULT).value,
            noSSE: true, threadCount: 1, verbose: false, normalMap: false});
        // glTF expects XYZ normals. The encoder's special normal-map mode swizzles channels.
        check(texture.compressBasis(params)); check(texture.deflateZstd(9));
        const encoded = Buffer.from(texture.writeToMemory()), decoded = new ktx.texture(new Uint8Array(encoded));
        try {
            check(decoded.transcodeBasis(ktx.transcode_fmt.RGBA32, 0));
            const pixels = new Uint8Array(decoded.getImage(0, 0, 0)), quality = measure(levels[0].data, pixels, channel);
            if (quality.psnr < 28 || quality.alphaCoverageError > .015 || (quality.meanNormalAngleDegrees ?? 0) > 6) throw new Error(`Texture compression quality gate failed: ${JSON.stringify(quality)}`);
            const mipQuality = levels.map((image, level) => ({level, ...measure(image.data, decoded.getImage(level, 0, 0), channel)}));
            return {encoded, review: encodePng({...levels[0], data: pixels}), report: {channel, size: [info.baseWidth, info.baseHeight],
                levels: levels.length, bytes: encoded.length, rgbaGpuBytes: levels.reduce((sum, im) => sum + im.width * im.height * 4, 0),
                blockGpuBytes: levels.reduce((sum, im) => sum + Math.ceil(im.width / 4) * Math.ceil(im.height / 4) * 16, 0),
                sha256: digest(encoded), quality, mipQuality, method: 'Khronos KTX 4.4.2 / UASTC + Zstd / ASTC4x4 or BC7 GPU transcode'}};
        } finally { decoded.delete(); }
    } finally { texture.delete(); params.delete(); info.delete(); }
}
export async function compressModels(options) {
    const ktx = await loadEncoder(options.root), cache = new Map();
    for (const id of options.models) {
        const [species, variant] = id.split('/'), directory = path.join(options.output, id), file = path.join(directory, `${variant}_lod0.glb`);
        let bytes = await readFile(file), parsed = parseGlb(bytes);
        const source = path.join(directory, `${variant}_lod0_source.glb`);
        if (parsed.doc.extensionsRequired?.includes('KHR_texture_basisu')) { bytes = await readFile(source); parsed = parseGlb(bytes); }
        else await writeFile(source, bytes);
        const compressed = [], review = [], records = [];
        for (const image of parsed.doc.images) {
            const channel = ['color', 'normal', 'orm'].find(name => image.name.includes(name));
            if (!channel) throw new Error(`Unexpected baked image ${image.name}`);
            const foliage = image.name.startsWith('leaf_'), view = parsed.doc.bufferViews[image.bufferView];
            const png = parsed.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
            const textureDir = foliage ? path.join(options.output, species, 'canopy') : directory;
            const key = digest(png) + ':' + channel + ':' + (foliage ? species : id);
            let result = cache.get(key);
            if (!result) {
                result = await compressImage(ktx, png, channel, textureDir, foliage, options.placement === 'core'); cache.set(key, result);
                await mkdir(path.join(textureDir, 'ktx2'), {recursive: true});
                await writeFile(path.join(textureDir, 'ktx2', `${foliage ? 'leaf' : 'bark'}_${channel}.ktx2`), result.encoded);
                console.log(`[LOD0] Compressed ${id} ${image.name}: ${(result.encoded.length / 1048576).toFixed(2)} MiB; PSNR ${result.report.quality.psnr.toFixed(1)} dB`);
            }
            compressed.push(result.encoded); review.push(result.review); records.push({...result.report, name: image.name, foliage});
        }
        const packed = packGlb(parsed.doc, parsed.bin, compressed, true);
        await writeFile(file, packed);
        await writeFile(path.join(directory, `${variant}_lod0_review.glb`), packGlb(parsed.doc, parsed.bin, review, false));
        await save(path.join(directory, 'compression.json'), {id, textures: records, sourceBytes: bytes.length, compressedBytes: packed.length,
            review: 'Exact UASTC-decoded base-level texels in PNG GLB for Blender. Geometry and material parameters are unchanged.',
            mipPolicy: 'Canopy levels 1–5 preserve per-tile alpha coverage; tiny terminal levels are conventional filtering. Normal vectors are renormalized.'});
        const stats = await json(path.join(directory, 'model.json'));
        stats.glbBytes = packed.length; stats.textureCompression = 'KHR_texture_basisu / UASTC / full mip chains';
        stats.textureGpuBytes = records.reduce((sum, row) => sum + row.blockGpuBytes, 0);
        stats.files = [...new Set([...stats.files, `${variant}_lod0_source.glb`, `${variant}_lod0_review.glb`])];
        await save(path.join(directory, 'model.json'), stats);
        console.log(`[LOD0] Compressed model ${id}: ${(packed.length / 1048576).toFixed(2)} MiB`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await compressModels(await json(process.argv[2]));
