// Compresses revised canopy maps while retaining exact accepted wood texture payloads.
import path from 'node:path';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compressImage, loadEncoder, parseGlb, packGlb} from '../lod0/Compress.mjs';
import {writeJson} from '../../baking/Files.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
const imageBytes = (document, image) => {const v = document.doc.bufferViews[image.bufferView]; return document.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);};

export async function compress(options) {
    const ktx = await loadEncoder(options.root), cache = new Map();
    for (const level of options.levels) for (const id of options.models) {
        const [species, variant] = id.split('/'), stem = `${variant}_lod${level}`;
        const output = path.join(options.output, `lod${level}`, id), source = path.join(options[`source${level}`], id);
        const file = path.join(output, stem+'.glb'); let bytes = await readFile(file), parsed = parseGlb(bytes);
        if (parsed.doc.extensionsRequired?.includes('KHR_texture_basisu')) {bytes = await readFile(path.join(output, stem+'_source.glb')); parsed = parseGlb(bytes);}
        else await writeFile(path.join(output, stem+'_source.glb'), bytes);
        const old = parseGlb(await readFile(path.join(source, stem+'.glb'))), decoded = parseGlb(await readFile(path.join(source, stem+'_review.glb')));
        const previous = await json(path.join(source, 'compression.json'));
        const packed = [], review = [], records = [];
        for (const [index, image] of parsed.doc.images.entries()) {
            if (!image.name.startsWith('leaf_')) {
                if (old.doc.images[index].name !== image.name || decoded.doc.images[index].name !== image.name) throw new Error('Preserved wood image ordering changed');
                packed.push(imageBytes(old, old.doc.images[index])); review.push(imageBytes(decoded, decoded.doc.images[index]));
                records.push({...previous.textures[index], preserved: true}); continue;
            }
            const channel = ['color','normal','orm'].find(key => image.name.includes(key));
            const png = imageBytes(parsed, image), hash = createHash('sha256').update(png).digest('hex');
            const key = `${level}:${species}:${channel}:${hash}`;
            let result = cache.get(key);
            if (!result) {
                const canopy = path.join(options.output, `lod${level}`, species, 'canopy');
                result = await compressImage(ktx, png, channel, canopy, true, true); cache.set(key,result);
                await mkdir(path.join(canopy,'ktx2'),{recursive:true});
                await writeFile(path.join(canopy,'ktx2',`leaf_${channel}.ktx2`),result.encoded);
                console.log(`[Branchlets] LOD${level} ${species} ${channel}: ${result.report.quality.psnr.toFixed(1)} dB`);
            }
            packed.push(result.encoded); review.push(result.review); records.push({...result.report,name:image.name,foliage:true});
        }
        const container = packGlb(parsed.doc,parsed.bin,packed,true);
        await writeFile(file,container); await writeFile(path.join(output,stem+'_review.glb'),packGlb(parsed.doc,parsed.bin,review,false));
        await writeJson(path.join(output,'compression.json'),{id,textures:records,sourceBytes:bytes.length,compressedBytes:container.length,
            review:'Exact decoded UASTC foliage and byte-identical accepted wood textures'});
        const stats = await json(path.join(output,'model.json'));
        await writeJson(path.join(output,'model.json'),{...stats,glbBytes:container.length,textureCompression:'KHR_texture_basisu / UASTC / full mip chains',
            files:[stem+'.glb',stem+'.blend',stem+'_source.glb',stem+'_review.glb']});
    }
}
