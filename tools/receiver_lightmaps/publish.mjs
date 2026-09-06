// Publishes authenticated, content-addressed receiver channels and switches the index last.
import { copyFile, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
import { canonicalJsonStringify } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import { assertCompleteReceiverCoverage, assertReceiverRasterPage } from '../../src/app/illumination/receiver_lightmaps/ReceiverCoverageContract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enhanced = process.argv.slice(2).includes('--enhanced');
const args = process.argv.slice(2).filter((v) => v !== '--enhanced');
if (args.length && (args.length !== 2 || args[0] !== '--from')) throw new Error('Supported options: --enhanced --from <bake-root>');
const bakeRoot = args.length ? await realpath(path.resolve(args[1])) : path.join(root, `tests/artifacts/screens/illumination_${enhanced ? '548' : '533'}/bake`);
if (!bakeRoot.startsWith(path.join(root, 'tests', 'artifacts') + path.sep)) throw new Error('Bake source must be inside workspace test artifacts');
const latest = JSON.parse(await readFile(path.join(bakeRoot, 'latest.json')));
if (!/^[a-f0-9]{64}$/.test(latest.directory)) throw new Error('Invalid promoted bake identity.');
const source = path.join(bakeRoot, latest.directory);
const index = JSON.parse(await readFile(path.join(source, 'package_index.json')));
assertCompleteReceiverCoverage(index.mapping);
const assets = await realpath(path.join(root, 'assets'));
const destination = path.join(assets, 'baked_lighting/receivers', enhanced ? 'enhanced' : '');
if (enhanced !== !!(index.mapping.profile.directional || index.mapping.profile.irradianceRepresentation === 'surface-diffuse-v1')) throw new Error('Receiver publication mode mismatch');
const extraFiles=[];
for (const [channel, descriptor] of Object.entries(index.channels)) {
    if (!['direct_receiver', 'indirect_irradiance'].includes(channel)) throw new Error('Unknown channel.');
    const name = `${channel}.ilpkg.gz`;
    if (descriptor.url !== name) throw new Error('Unexpected package path.');
    const packed = await readFile(path.join(source, name));
    if (packed.byteLength !== descriptor.compressedBytes) throw new Error('Transport length mismatch.');
    const parsed = await parseIlluminationBinaryPackage(gunzipSync(packed), {
        expectations: { cityId: index.cityId, lightingProfileId: index.profileId,
            aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
        runtimeCapabilities: enhanced ? ['receiver_lightmap_sampling_v1', 'receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1', 'receiver_rgb9e5_sampling_v1'] : ['receiver_lightmap_sampling_v1']
    });
    if (!parsed.compatibility.compatible) throw new Error('Incompatible receiver package.');
    const mapping = parsed.chunks.find(c => c.descriptor.id === 'mapping.coordinates' || c.descriptor.id === 'mapping.coordinates.0000')?.descriptor.coordinateTransform.mapping;
    if (canonicalJsonStringify(mapping) !== canonicalJsonStringify(index.mapping)
        || parsed.manifest.source.resolvedSourceSha256 !== index.sourceHash
        || parsed.manifest.channels.find(c => c.id === channel)?.sourceSha256 !== descriptor.sourceSha256
        || parsed.manifest.channels.find(c => c.id === 'receiver_mapping')?.sourceSha256 !== descriptor.mappingSha256) throw new Error('Receiver index differs from its authenticated package');
    for (const chunk of parsed.chunks) assertReceiverRasterPage(mapping, chunk.descriptor);
    for(const shard of parsed.manifest.source.descriptor.receiverPageShards ?? []) {
        if(!new RegExp('^'+channel+'\\.part[1-9][0-9]*\\.ilpkg\\.gz$').test(shard.url))throw new Error('Invalid receiver page package path');
        const packed=await readFile(path.join(source,shard.url));
        if(packed.byteLength!==shard.compressedBytes)throw new Error('Receiver page transport length mismatch');
        const raw=gunzipSync(packed);
        if(raw.byteLength!==shard.bytes)throw new Error('Receiver page package length mismatch');
        const child=await parseIlluminationBinaryPackage(raw,{expectations:{cityId:index.cityId,lightingProfileId:index.profileId,
            aggregateSha256:shard.aggregateSha256,profileSha256:descriptor.profileSha256},
            runtimeCapabilities:['receiver_lightmap_sampling_v1','receiver_rgb9e5_sampling_v1']});
        if(!child.compatibility.compatible || child.manifest.source.descriptor.receiverPageShards
            ||child.manifest.source.resolvedSourceSha256!==index.sourceHash
            ||child.manifest.channels.find(v=>v.id===channel)?.sourceSha256!==descriptor.sourceSha256
            ||child.manifest.channels.find(v=>v.id==='receiver_mapping')?.sourceSha256!==descriptor.mappingSha256)throw new Error('Receiver page package source mismatch');
        for (const chunk of child.chunks) assertReceiverRasterPage(mapping, chunk.descriptor);
        extraFiles.push(shard.url);
    }
}
const version = path.join(destination, latest.directory);
await mkdir(version, { recursive: true });
for(const name of extraFiles)await copyFile(path.join(source,name),path.join(version,name));
for (const [channel, descriptor] of Object.entries(index.channels)) {
    const name = `${channel}.ilpkg.gz`;
    await copyFile(path.join(source, name), path.join(version, name));
    descriptor.url = `${latest.directory}/${name}`;
}
await copyFile(path.join(source, 'receipt.json'), path.join(version, 'receipt.json'));
await copyFile(path.join(source, 'job.json'), path.join(version, 'provenance.json'));
await copyFile(path.join(source, 'metrics.json'), path.join(version, 'metrics.json'));
const temporary = path.join(destination, 'package_index.partial.json');
await writeFile(temporary, JSON.stringify(index));
await rename(temporary, path.join(destination, 'package_index.json'));
console.log(JSON.stringify({ destination, directory: latest.directory, channels: Object.keys(index.channels) }));
