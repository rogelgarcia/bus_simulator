// decode_vegetation_glb.mjs -- AI 627: the game's published vegetation GLBs (assets/public/vegetation_lod0, KTX2 /
// KHR_texture_basisu maps) as plain-PNG GLBs that Blender's importer reads. The geometry, UVs and materials are the
// game's own; only the textures (external .ktx2 files the GLB names by uri) are transcoded (Khronos libktx 4.4.2, the
// copy the vegetation bake pins under downloads/tools/ktx-4.4.2) to RGBA PNG at full resolution, beside the new GLB, and
// the GLB's images are repointed to them. Nothing under assets/ is written.
//
//   node blender/scripts/terramar/building/rebuild/decode_vegetation_glb.mjs [--output <new-directory>] [ids...]
//        ids like arrowwood_viburnum/mature_01 (default: every model of vegetation_lod0/index.json)
//
// Writes blender_inputs/terramar/vegetation/<species>/<variant>.glb (or --output), its textures/**.png
// and decoded.json (each source's sha256 against the index, so a re-published asset shows up as a mismatch).
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEncoder, parseGlb} from '../../../../../tools/bake_vegetation/lod0/Compress.mjs';
import {encodePng} from '../../../../../tools/bake_vegetation/lod0/Png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SOURCE = path.join(ROOT, 'assets/public/vegetation_lod0');
const argv = process.argv.slice(2);
const outputIndex = argv.indexOf('--output');
if (outputIndex >= 0 && !argv[outputIndex + 1]) throw new Error('--output requires a directory');
const OUT = outputIndex >= 0 ? path.resolve(argv.splice(outputIndex, 2)[1]) : path.join(ROOT, 'blender_inputs/terramar/vegetation');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function packJson(doc, bin) {
    // a GLB with a new JSON chunk and the original BIN chunk (the images are external files, not buffer views)
    let json = Buffer.from(JSON.stringify(doc), 'utf8');
    json = Buffer.concat([json, Buffer.alloc((-json.length) & 3, 0x20)]);
    const binPadded = Buffer.concat([bin, Buffer.alloc((-bin.length) & 3)]);
    const header = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
    header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
    jsonHead.writeUInt32LE(json.length, 0); jsonHead.write('JSON', 4, 'ascii');
    binHead.writeUInt32LE(binPadded.length, 0); binHead.write('BIN\0', 4, 'ascii');
    return Buffer.concat([header, jsonHead, json, binHead, binPadded]);
}

function transcode(ktx, bytes) {
    const texture = new ktx.texture(new Uint8Array(bytes));
    try {
        const result = texture.transcodeBasis(ktx.transcode_fmt.RGBA32, 0);
        if (result.value !== 0) throw new Error(`KTX transcode error ${result.value}`);
        const data = new Uint8Array(texture.getImage(0, 0, 0));
        return encodePng({width: texture.baseWidth, height: texture.baseHeight, data});
    } finally {
        texture.delete();
    }
}

async function main() {
    const index = JSON.parse(await readFile(path.join(SOURCE, 'index.json'), 'utf8'));
    const wanted = argv;
    const models = index.models.filter(m => !wanted.length || wanted.includes(m.id));
    if (!models.length) throw new Error(`no model matches ${wanted.join(', ')}`);
    const ktx = await loadEncoder(ROOT);
    const report = [];
    for (const model of models) {
        const bytes = await readFile(path.join(SOURCE, model.file));
        const parsed = parseGlb(bytes);
        const doc = structuredClone(parsed.doc);
        const out = path.join(OUT, model.file);
        const srcDir = path.dirname(path.join(SOURCE, model.file)), outDir = path.dirname(out);
        for (const image of doc.images) {
            if (!image.uri || !image.uri.endsWith('.ktx2')) throw new Error(`${model.id}: expected external .ktx2 images`);
            const png = transcode(ktx, await readFile(path.join(srcDir, image.uri)));
            image.uri = image.uri.replace(/\.ktx2$/, '.png');
            image.mimeType = 'image/png';
            await mkdir(path.dirname(path.join(outDir, image.uri)), {recursive: true});
            await writeFile(path.join(outDir, image.uri), png);
        }
        doc.textures = doc.textures.map(texture => {
            const {extensions = {}, ...rest} = texture;
            const {KHR_texture_basisu: basis, ...others} = extensions;
            return {...rest, source: basis ? basis.source : texture.source, ...(Object.keys(others).length ? {extensions: others} : {})};
        });
        const drop = list => (list ?? []).filter(e => e !== 'KHR_texture_basisu');
        doc.extensionsUsed = drop(doc.extensionsUsed);
        doc.extensionsRequired = drop(doc.extensionsRequired);
        if (!doc.extensionsRequired.length) delete doc.extensionsRequired;
        await mkdir(outDir, {recursive: true});
        await writeFile(out, packJson(doc, parsed.bin));
        const match = sha(bytes) === model.sha256;
        report.push({id: model.id, source: model.file, sourceSha256: sha(bytes), indexSha256Match: match,
                     images: doc.images.map(image => image.name), output: path.relative(ROOT, out).replaceAll('\\', '/')});
        console.log(`DECODED ${model.id} -> ${path.relative(ROOT, out)}${match ? '' : '  (source differs from index.json)'}`);
    }
    await writeFile(path.join(OUT, 'decoded.json'), JSON.stringify({index: index.revision, models: report}, null, 2) + '\n');
}

main().catch(error => { console.error(error); process.exit(1); });
