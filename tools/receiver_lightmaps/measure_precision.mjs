// Measures packaged quantization against the corresponding full-precision bake outputs.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { parseIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Supported option: --root <artifact-root>');
const root = path.resolve(args[1] ?? 'tests/artifacts/screens/illumination_548');
const latest = JSON.parse(await readFile(path.join(root, 'bake/latest.json')));
const source = path.join(root, 'bake', latest.directory), results = {};
for (const channel of ['direct_receiver', 'indirect_irradiance']) {
    const parsed = await parseIlluminationBinaryPackage(gunzipSync(await readFile(path.join(source, channel + '.ilpkg.gz'))),
        { runtimeCapabilities: ['receiver_lightmap_sampling_v1', 'receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1'] });
    let square = 0, maximum = 0, count = 0, energy = 0;
    const layers = [];
    for (const chunk of parsed.chunks.filter((c) => c.descriptor.channelId === channel && c.descriptor.mipLevel === 0)) {
        const descriptor = chunk.descriptor, layer = descriptor.coordinateTransform.page;
        const raw = await readFile(path.join(source, `${channel}.${layer}.mip0.f32`));
        const reference = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        const { scale, bias } = descriptor.coordinateTransform.decode;
        let local = 0, max = 0;
        for (let i = 0; i < reference.length; i++) {
            if (channel === 'direct_receiver' && i % 4 === 3) continue;
            const value = chunk.data[i] / 255 * scale[i % 4] + bias[i % 4], error = value - reference[i];
            local += error * error; max = Math.max(max, Math.abs(error)); count++; energy += reference[i] ** 2;
        }
        square += local; maximum = Math.max(maximum, max);
        layers.push({ layer, scale, bias, maximumError: max });
    }
    results[channel] = { rms: Math.sqrt(square / count), normalizedRms: Math.sqrt(square / energy), maximumError: maximum, count, layers };
}
await writeFile(path.join(root, 'quantization.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
