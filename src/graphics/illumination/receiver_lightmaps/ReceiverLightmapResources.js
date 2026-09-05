// Stages AI 530 authenticated half-float atlas pages and explicit mip levels.
// @ts-check
import * as THREE from 'three';
import { parseIlluminationBinaryPackage } from '../../../app/illumination/package/index.js';

/** @param {Array<{data: Uint16Array, width: number, height: number}>} levels @param {number} pageCount */
export function createReceiverAtlasTexture(levels, pageCount) {
    // r183 uploads only level zero for DataArrayTexture. Its uncompressed RGBA
    // CompressedArrayTexture path uploads every explicitly supplied mip level.
    const texture = new THREE.CompressedArrayTexture(levels, levels[0].width, levels[0].height, pageCount, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
}

/** @param {{url: string, descriptor: any, channel: string, sourceHash: string, cityId: string, profileId: string, renderer: any, signal: AbortSignal}} options */
export async function loadReceiverChannel({ url, descriptor, channel, sourceHash, cityId, profileId, renderer, signal }) {
    const began = performance.now();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Receiver lightmap HTTP ${response.status}`);
    const compressed = await response.arrayBuffer();
    if (compressed.byteLength !== descriptor.compressedBytes || descriptor.bytes > 512 * 1024 * 1024) throw new Error('Receiver transport size mismatch or preview budget exceeded.');
    const downloaded = performance.now();
    const raw = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const inflated = performance.now();
    if (raw.byteLength !== descriptor.bytes) throw new Error('Receiver package length mismatch.');
    const parsed = await parseIlluminationBinaryPackage(raw, { expectations: { cityId, lightingProfileId: profileId,
        aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
        runtimeCapabilities: ['receiver_lightmap_sampling_v1'] });
    if (!parsed.compatibility.compatible) throw new Error('Receiver package incompatible: ' + parsed.compatibility.reason);
    const physical = parsed.manifest.channels.find((v) => v.id === channel);
    if (!physical || physical.sourceSha256 !== sourceHash) throw new Error('Receiver channel source mismatch.');
    const mappingChunk = parsed.chunks.find((v) => v.descriptor.id === 'mapping.coordinates');
    if (!mappingChunk) throw new Error('Missing receiver coordinate table.');
    const mapping = mappingChunk.descriptor.coordinateTransform.mapping;
    if (mapping.schema !== 'bus-sim-receiver-atlas-v1') throw new Error('Unknown receiver mapping schema.');
    const gl = renderer.getContext();
    const maximum = renderer.capabilities.maxTextureSize;
    if (mapping.profile.id !== profileId || !Number.isInteger(mapping.pageCount) || mapping.pageCount < 1
        || mapping.pageCount > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)
        || mapping.profile.pageSize > maximum || mapping.tableWidth > maximum || mapping.tableHeight > maximum
        || !Number.isInteger(mapping.profile.mipLevels) || mapping.profile.mipLevels < 1 || mapping.profile.mipLevels > 4
        || mappingChunk.data.byteLength !== mapping.tableWidth * mapping.tableHeight * 16) throw new Error('Receiver atlas layout exceeds the supported device/profile.');
    const mappingTexture = new THREE.DataTexture(new Float32Array(mappingChunk.data.buffer.slice(mappingChunk.data.byteOffset,
        mappingChunk.data.byteOffset + mappingChunk.data.byteLength)), mapping.tableWidth, mapping.tableHeight, THREE.RGBAFormat, THREE.FloatType);
    mappingTexture.minFilter = THREE.NearestFilter; mappingTexture.magFilter = THREE.NearestFilter;
    mappingTexture.generateMipmaps = false; mappingTexture.needsUpdate = true;
    const levels = [];
    for (let mip = 0; mip < mapping.profile.mipLevels; mip++) {
        const size = mapping.profile.pageSize >> mip;
        const data = new Uint16Array(size * size * 4 * mapping.pageCount);
        for (let page = 0; page < mapping.pageCount; page++) {
            const entry = parsed.chunks.find((v) => v.descriptor.channelId === channel && v.descriptor.mipLevel === mip
                && v.descriptor.coordinateTransform.page === page);
            if (!entry || entry.data.byteLength !== size * size * 8) throw new Error('Incomplete receiver atlas page/mip.');
            data.set(new Uint16Array(entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength)), page * size * size * 4);
        }
        levels.push({ data, width: size, height: size, depth: mapping.pageCount });
    }
    const texture = createReceiverAtlasTexture(levels, mapping.pageCount);
    const decoded = performance.now();
    try {
        renderer.initTexture(mappingTexture); renderer.initTexture(texture);
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error('Receiver GPU upload failed: ' + error);
    }
    catch (error) { mappingTexture.dispose(); texture.dispose(); throw error; }
    return { mapping, mappingTexture, texture, identity: { aggregateSha256: descriptor.aggregateSha256, profileId },
        metrics: { downloadMs: downloaded - began, inflateMs: inflated - downloaded,
        validateDecodeMs: decoded - inflated, uploadMs: performance.now() - decoded,
        gpuBytes: levels.reduce((s, v) => s + v.data.byteLength, mappingTexture.image.data.byteLength), compressedBytes: compressed.byteLength },
        dispose() { mappingTexture.dispose(); texture.dispose(); } };
}
