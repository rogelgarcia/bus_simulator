// Authenticates the installed historical comparison asset without claiming a fresh bake.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseIlluminationBinaryPackage } from '../../../src/app/illumination/package/index.js';

export const previewReferenceJob = {
    id: 'lighting/preview-reference', always: true,
    description: 'Verify installed historical comparison channels; not a new or current-source bake',
    outputs: ['comparison/original-preview'],
    async run(ctx) {
        const directory = path.join(ctx.root, 'assets/baked_lighting/receivers');
        const file = path.join(directory, 'package_index.json');
        const index = JSON.parse(await readFile(file, 'utf8'));
        const files = [file];
        for (const channel of ['direct_receiver', 'indirect_irradiance']) {
            const descriptor = index.channels[channel];
            if (!/^[a-f0-9]{64}\/(direct_receiver|indirect_irradiance)\.ilpkg\.gz$/.test(descriptor.url)) throw new Error('Unsafe historical receiver URL');
            const packagePath = path.join(directory, descriptor.url);
            const packed = await readFile(packagePath);
            if (packed.byteLength !== descriptor.compressedBytes) throw new Error('Historical receiver transport mismatch');
            const parsed = await parseIlluminationBinaryPackage(gunzipSync(packed), { expectations: { cityId: index.cityId,
                lightingProfileId: index.profileId, aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
                runtimeCapabilities: ['receiver_lightmap_sampling_v1'] });
            if (!parsed.compatibility.compatible || parsed.manifest.source.resolvedSourceSha256 !== index.sourceHash) throw new Error('Historical receiver identity mismatch');
            files.push(packagePath);
        }
        ctx.log.line(ctx.id, 'Historical comparison authenticated; current-source completeness is not asserted and no files were replaced.');
        return { state: 'validated', files, historical: true, profileId: index.profileId };
    }
};
