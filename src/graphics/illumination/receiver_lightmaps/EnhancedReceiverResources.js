// Loads AI 548 directional pages with linear per-component quantization and shared coordinates.
// @ts-check
import * as THREE from 'three';
import { parseIlluminationBinaryPackage } from '../../../app/illumination/package/index.js';

/** @param {THREE.WebGLRenderer} renderer */
export function createEnhancedReceiverLoader(renderer) {
    const mappings = new Map();
    return async function load({ url, descriptor, channel, sourceHash, cityId, profileId, signal }) {
        const start = performance.now();
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('Directional lightmap HTTP ' + response.status);
        const packed = await response.arrayBuffer(), downloaded = performance.now();
        if (packed.byteLength !== descriptor.compressedBytes || descriptor.bytes > 512 * 1024 * 1024) throw new Error('Directional transport budget or length mismatch');
        const raw = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const inflated = performance.now();
        if (raw.byteLength !== descriptor.bytes) throw new Error('Directional package length mismatch');
        const parsed = await parseIlluminationBinaryPackage(raw, { expectations: { cityId, lightingProfileId: profileId,
            aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
            runtimeCapabilities: ['receiver_lightmap_sampling_v1', 'receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1'] });
        if (!parsed.compatibility.compatible || parsed.manifest.channels.find((v) => v.id === channel)?.sourceSha256 !== sourceHash) throw new Error('Directional package source or capability mismatch');
        signal.throwIfAborted();
        const coordinates = parsed.chunks.find((v) => v.descriptor.id === 'mapping.coordinates');
        const mapping = coordinates?.descriptor.coordinateTransform.mapping;
        const directional = mapping?.profile.directional === 'chart-affine-irradiance-v1';
        if (!mapping || mapping.schema !== 'bus-sim-receiver-atlas-v1' || mapping.profile.id !== profileId) throw new Error('Directional mapping/profile mismatch');
        if (mapping.profile.directional && !directional) throw new Error('Unsupported directional representation');
        if (mapping.profile.coefficientLayout && (!directional || mapping.profile.coefficientLayout !== 'flat-first-rgb-v1')) throw new Error('Unsupported directional coefficient layout');
        const layers = mapping.pageCount * (channel === 'indirect_irradiance' && directional ? 3 : 1);
        const gl = renderer.getContext(), maximum = renderer.capabilities.maxTextureSize;
        if (!Number.isInteger(mapping.pageCount) || mapping.pageCount < 1 || layers > 24 || layers > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)
            || mapping.profile.pageSize > maximum || mapping.tableWidth > maximum || mapping.tableHeight > maximum
            || coordinates.data.byteLength !== mapping.tableWidth * mapping.tableHeight * 16
            || !Number.isInteger(mapping.profile.mipLevels) || mapping.profile.mipLevels < 1 || mapping.profile.mipLevels > 4) throw new Error('Directional atlas exceeds supported device budget');
        const scale = [], bias = [], levels = [];
        const entries = new Map();
        for (const chunk of parsed.chunks.filter((v) => v.descriptor.channelId === channel)) {
            const d = chunk.descriptor, key = `${d.coordinateTransform.page}/${d.mipLevel}`;
            if (mapping.profile.coefficientLayout === 'flat-first-rgb-v1'
                && !d.requiredRuntimeCapabilities.includes('receiver_directional_flat_first_v1')) throw new Error('Flat-first layout capability is missing');
            if (entries.has(key)) throw new Error('Duplicate directional page/mip');
            entries.set(key, chunk);
        }
        for (let mip = 0; mip < mapping.profile.mipLevels; mip++) {
            const size = mapping.profile.pageSize >> mip, data = new Uint8Array(size * size * 4 * layers);
            for (let layer = 0; layer < layers; layer++) {
                const chunk = entries.get(`${layer}/${mip}`), d = chunk?.descriptor;
                if (!chunk || d.encoding !== 'rgba8_unorm' || d.coordinateTransform.schema !== 'bus-sim-directional-lightmap-page-v1'
                    || d.dimensions.width !== size || d.dimensions.height !== size || chunk.data.byteLength !== size * size * 4) throw new Error('Incomplete directional page/mip');
                const decode = d.coordinateTransform.decode;
                if (!decode || ![decode.scale, decode.bias].every((v) => Array.isArray(v) && v.length === 4 && v.every(Number.isFinite))
                    || decode.scale.some((v) => v < 0)) throw new Error('Invalid directional decoding range');
                if (mip === 0) { scale.push(new THREE.Vector4(...decode.scale)); bias.push(new THREE.Vector4(...decode.bias)); }
                else if (!scale[layer].equals(new THREE.Vector4(...decode.scale)) || !bias[layer].equals(new THREE.Vector4(...decode.bias))) throw new Error('Directional mip decoding range changed');
                data.set(chunk.data, layer * size * size * 4);
            }
            levels.push({ data, width: size, height: size, depth: layers });
        }
        const key = parsed.manifest.channels.find((v) => v.id === 'receiver_mapping').sourceSha256;
        let shared = mappings.get(key);
        if (shared && (shared.hash !== coordinates.descriptor.decodedSha256 || shared.description !== JSON.stringify(mapping))) throw new Error('Shared directional coordinate mismatch');
        if (!shared) {
            const data = new Float32Array(coordinates.data.buffer.slice(coordinates.data.byteOffset, coordinates.data.byteOffset + coordinates.data.byteLength));
            const texture = new THREE.DataTexture(data, mapping.tableWidth, mapping.tableHeight, THREE.RGBAFormat, THREE.FloatType);
            texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
            shared = { texture, references: 0, hash: coordinates.descriptor.decodedSha256, description: JSON.stringify(mapping) };
            mappings.set(key, shared);
        }
        shared.references++;
        const texture = new THREE.CompressedArrayTexture(levels, mapping.profile.pageSize, mapping.profile.pageSize, layers, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false; texture.needsUpdate = true;
        const decoded = performance.now(); let disposed = false;
        function dispose() {
            if (disposed) return; disposed = true; texture.dispose();
            if (--shared.references === 0) { shared.texture.dispose(); mappings.delete(key); }
        }
        try {
            signal.throwIfAborted(); renderer.initTexture(shared.texture); renderer.initTexture(texture);
            if (gl.getError() !== gl.NO_ERROR) throw new Error('Directional GPU upload failed');
        } catch (error) { dispose(); throw error; }
        const pageBytes = levels.reduce((sum, v) => sum + v.data.byteLength, 0);
        return { mapping, mappingTexture: shared.texture, texture, scale, bias, directional,
            identity: { aggregateSha256: descriptor.aggregateSha256, profileId }, dispose,
            metrics: { downloadMs: downloaded - start, inflateMs: inflated - downloaded,
                validateDecodeMs: decoded - inflated, uploadMs: performance.now() - decoded,
                gpuBytes: pageBytes, cpuBytes: pageBytes, sharedMappingBytes: shared.texture.image.data.byteLength,
                compressedBytes: packed.byteLength, layers, encoding: 'linear_rgba8_per_component' } };
    };
}
