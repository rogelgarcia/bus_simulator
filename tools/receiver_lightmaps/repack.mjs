// Repackages the unchanged AI 533 bake for an isolated same-coverage AI 548 comparison.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { parseIlluminationBinaryPackage, buildIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
import { decodeRgba16fLittleEndian } from '../../src/app/illumination/package/IlluminationEncoding.js';

const originalRoot = path.resolve('tests/artifacts/screens/illumination_533/bake');
const latest = JSON.parse(await readFile(path.join(originalRoot, 'latest.json')));
const original = path.join(originalRoot, latest.directory);
const output = path.resolve('tests/artifacts/screens/illumination_548/same-coverage');
await mkdir(output, { recursive: true });
const sourceIndex = JSON.parse(await readFile(path.join(original, 'package_index.json')));
const mapping = structuredClone(sourceIndex.mapping);
mapping.profile.id = 'ai548.same-coverage.compact.v1'; mapping.profile.compact = true;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const profileHash = sha(JSON.stringify(mapping.profile));
const index = { ...sourceIndex, profileId: mapping.profile.id, mapping, channels: {} }, metrics = {};
for (const [channel, descriptor] of Object.entries(sourceIndex.channels)) {
    const parsed = await parseIlluminationBinaryPackage(gunzipSync(await readFile(path.join(original, descriptor.url))), {
        runtimeCapabilities: ['receiver_lightmap_sampling_v1'] });
    const coordinates = parsed.chunks.find((v) => v.descriptor.id === 'mapping.coordinates');
    const mappingHash = sha(Buffer.concat([Buffer.from(JSON.stringify(mapping)), coordinates.data]));
    const chunks = [{ ...coordinates.descriptor, coordinateTransform: { ...coordinates.descriptor.coordinateTransform, mapping }, data: coordinates.data }];
    const ranges = new Map();
    for (const chunk of parsed.chunks.filter((v) => v.descriptor.channelId === channel && v.descriptor.mipLevel === 0)) {
        const values = decodeRgba16fLittleEndian(chunk.data), low = [Infinity,Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity,-Infinity];
        for (let i = 0; i < values.length; i++) { low[i % 4] = Math.min(low[i % 4], values[i]); high[i % 4] = Math.max(high[i % 4], values[i]); }
        ranges.set(chunk.descriptor.coordinateTransform.page, { bias: low, scale: high.map((v, c) => v - low[c]) });
    }
    let squared = 0, maximum = 0, count = 0;
    for (const chunk of parsed.chunks.filter((v) => v.descriptor.channelId === channel)) {
        const decode = ranges.get(chunk.descriptor.coordinateTransform.page), values = decodeRgba16fLittleEndian(chunk.data), bytes = new Uint8Array(values.length);
        for (let i = 0; i < values.length; i++) {
            const c = i % 4; bytes[i] = decode.scale[c] ? Math.max(0, Math.min(255, Math.round((values[i] - decode.bias[c]) / decode.scale[c] * 255))) : 0;
            const error = Math.abs(bytes[i] / 255 * decode.scale[c] + decode.bias[c] - values[i]);
            if (c < 3) { squared += error * error; maximum = Math.max(maximum, error); count++; }
        }
        chunks.push({ ...chunk.descriptor, encoding: 'rgba8_unorm', precision: 'unorm8', data: bytes,
            coordinateTransform: { ...chunk.descriptor.coordinateTransform, schema: 'bus-sim-directional-lightmap-page-v1', decode },
            requiredRuntimeCapabilities: ['receiver_directional_sampling_v1'] });
    }
    const built = await buildIlluminationBinaryPackage({ cityId: sourceIndex.cityId, lightingProfileId: mapping.profile.id,
        selectedCapabilityProfileId: `development.directional_${channel === 'direct_receiver' ? 'direct' : 'indirect'}_v1`,
        source: parsed.manifest.source.descriptor,
        compilerDescriptor: { sourcePublication: latest.directory, policy: 'same-samples-layout-linear-rgba8-v1' },
        channels: [{ id: channel, required: true, sourceSha256: descriptor.sourceSha256, profileSha256: profileHash },
            { id: 'receiver_mapping', required: true, sourceSha256: mappingHash, profileSha256: profileHash }], chunks });
    const packed = gzipSync(built.bytes, { level: 9 });
    await writeFile(path.join(output, channel + '.ilpkg.gz'), packed);
    index.channels[channel] = { ...descriptor, url: channel + '.ilpkg.gz', aggregateSha256: built.aggregateSha256, mappingSha256: mappingHash,
        profileSha256: profileHash, bytes: built.bytes.byteLength, compressedBytes: packed.byteLength };
    metrics[channel] = { rms: Math.sqrt(squared / count), maximum, values: count, bytes: built.bytes.byteLength, compressedBytes: packed.byteLength };
}
await writeFile(path.join(output, 'package_index.json'), JSON.stringify(index));
await writeFile(path.join(output, 'precision.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify({ output, metrics }));
