// Loads AI 548 directional pages with linear per-component quantization and shared coordinates.
// @ts-check
import * as THREE from 'three';
import { loadReceiverPackage } from './ReceiverPackageLoading.js';
import { receiverCoordinateChunks } from '../../../app/illumination/receiver_lightmaps/ReceiverCoordinateTransport.js';
import { createReceiverHdrTexture } from './ReceiverHdrTexture.js';
import { prepareReceiverTexture } from './ReceiverTexturePreparation.js';
import { createReceiverBufferAssembly } from './ReceiverBufferAssembly.js';
import { SUPPORTED_RECEIVER_TRANSPORTS } from '../../../app/illumination/receiver_lightmaps/ReceiverTransportPolicy.js';
import { assertCompleteReceiverCoverage, assertReceiverRasterPage } from '../../../app/illumination/receiver_lightmaps/ReceiverCoverageContract.js';

/** @param {THREE.WebGLRenderer} renderer */
export function createEnhancedReceiverLoader(renderer) {
    const mappings = new Map();
    return async function load({ url, descriptor, channel, sourceHash, resolvedSourceHash, cityId, profileId, signal, onMappingReady }) {
        const start = performance.now();
        const { parsed, timings } = await loadReceiverPackage({ url, descriptor, signal, options: { expectations: { cityId, lightingProfileId: profileId,
            aggregateSha256: descriptor.aggregateSha256, profileSha256: descriptor.profileSha256 },
            runtimeCapabilities: ['receiver_lightmap_sampling_v1', 'receiver_directional_sampling_v1', 'receiver_directional_flat_first_v1', 'receiver_rgb9e5_sampling_v1'] } });
        if (!parsed.compatibility.compatible || parsed.manifest.channels.find((v) => v.id === channel)?.sourceSha256 !== sourceHash) throw new Error('Directional package source or capability mismatch');
        signal.throwIfAborted();
        const coordinates = parsed.chunks.find((v) => v.descriptor.id === 'mapping.coordinates' || v.descriptor.id === 'mapping.coordinates.0000');
        const mapping = coordinates?.descriptor.coordinateTransform.mapping;
        const directional = mapping?.profile.directional === 'chart-affine-irradiance-v1';
        if (!mapping || mapping.schema !== 'bus-sim-receiver-atlas-v1' || mapping.profile.id !== profileId) throw new Error('Directional mapping/profile mismatch');
        if (mapping.profile.irradianceRepresentation === 'surface-diffuse-v1') {
            assertCompleteReceiverCoverage(mapping);
            if (!SUPPORTED_RECEIVER_TRANSPORTS.includes(mapping.profile.transportPolicy)
                || parsed.manifest.source.resolvedSourceSha256 !== resolvedSourceHash) throw new Error('Complete receiver source mismatch');
        }
        if (mapping.profile.directional && !directional) throw new Error('Unsupported directional representation');
        if (mapping.profile.coefficientLayout && (!directional || mapping.profile.coefficientLayout !== 'flat-first-rgb-v1')) throw new Error('Unsupported directional coefficient layout');
        const sharedSun = mapping.profile.directRepresentation === 'hybrid-sun-visibility-v1';
        if (mapping.profile.directRepresentation && (!sharedSun || mapping.profile.irradianceRepresentation !== 'surface-diffuse-v1')) throw new Error('Unsupported receiver sun representation');
        const reference = sharedSun && channel === 'direct_receiver';
        const hdr = channel === 'indirect_irradiance' && mapping.profile.indirectEncoding === 'rgb9e5_le';
        const layers = reference ? 1 : mapping.pageCount * (channel === 'indirect_irradiance' && directional ? 3 : 1);
        const pageSize = reference ? 1 : mapping.profile.pageSize;
        const mipLevels = reference ? 1 : mapping.profile.mipLevels;
        const gl = renderer.getContext(), maximum = renderer.capabilities.maxTextureSize;
        if (!Number.isInteger(mapping.pageCount) || mapping.pageCount < 1 || layers > 24 || layers > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)
            || mapping.profile.pageSize > maximum || mapping.tableWidth > maximum || mapping.tableHeight > maximum
            || (!mapping.profile.coordinateLayout && coordinates.data.byteLength !== mapping.tableWidth * mapping.tableHeight * 16)
            || !Number.isInteger(mapping.profile.mipLevels) || mapping.profile.mipLevels < 1 || mapping.profile.mipLevels > 4) throw new Error('Directional atlas exceeds supported device budget');
        const key = parsed.manifest.channels.find((v) => v.id === 'receiver_mapping').sourceSha256;
        if (mapping.profile.coordinateLayout && mapping.profile.coordinateLayout !== 'row-chunks-v1') throw new Error('Unsupported receiver coordinates');
        const coordinateRows = mapping.profile.coordinateLayout ? receiverCoordinateChunks(parsed.chunks, mapping) : [coordinates];
        const coordinateHash = coordinateRows.map(c => c.descriptor.decodedSha256).join('/');
        const assembly = createReceiverBufferAssembly(signal);
        const coordinateData = new Float32Array(mapping.tableWidth*mapping.tableHeight*4);
        for (const row of coordinateRows) {
            await assembly.copy(new Uint8Array(coordinateData.buffer), row.data,
                (row.descriptor.coordinateTransform.firstRow ?? 0)*mapping.tableWidth*16);
        }
        onMappingReady?.({ mapping, coordinates: coordinateData });
        const pageChunks=parsed.chunks.filter(v=>v.descriptor.channelId===channel);
        let compressedBytes=descriptor.compressedBytes;
        const shards=parsed.manifest.source.descriptor.receiverPageShards ?? [];
        if(!Array.isArray(shards)||shards.length>5 || (shards.length && mapping.profile.pageTransport!=='bounded-page-shards-v1')) throw new Error('Unsupported receiver page transport');
        for(const shard of shards) {
            if(!new RegExp('^'+channel+'\\.part[1-9][0-9]*\\.ilpkg\\.gz$').test(shard.url)
                ||!Number.isInteger(shard.bytes)||shard.bytes<1||shard.bytes>512*1024*1024) throw new Error('Invalid receiver page package');
            const {parsed:child,timings:childTimings}=await loadReceiverPackage({url:new URL(shard.url,url).href,descriptor:shard,signal,options:{expectations:{cityId,lightingProfileId:profileId,
                aggregateSha256:shard.aggregateSha256,profileSha256:descriptor.profileSha256},
                runtimeCapabilities:['receiver_lightmap_sampling_v1','receiver_rgb9e5_sampling_v1']}});
            compressedBytes+=shard.compressedBytes;
            for(const key of Object.keys(timings)) timings[key]+=childTimings[key];
            if(!child.compatibility.compatible || child.manifest.source.descriptor.receiverPageShards
                ||child.manifest.source.resolvedSourceSha256!==resolvedSourceHash
                ||child.manifest.channels.find(v=>v.id===channel)?.sourceSha256!==sourceHash
                ||child.manifest.channels.find(v=>v.id==='receiver_mapping')?.sourceSha256!==parsed.manifest.channels.find(v=>v.id==='receiver_mapping').sourceSha256) throw new Error('Receiver page package source mismatch');
            signal.throwIfAborted();pageChunks.push(...child.chunks.filter(v=>v.descriptor.channelId===channel));
        }
        if (mapping.profile.indirectEncoding && mapping.profile.indirectEncoding !== 'rgb9e5_le') throw new Error('Unsupported receiver HDR encoding');
        const scale = [], bias = [], levels = [];
        const entries = new Map();
        for (const chunk of pageChunks) {
            const d = chunk.descriptor, key = `${d.coordinateTransform.page}/${d.mipLevel}`;
            assertReceiverRasterPage(mapping, d);
            if (mapping.profile.coefficientLayout === 'flat-first-rgb-v1'
                && !d.requiredRuntimeCapabilities.includes('receiver_directional_flat_first_v1')) throw new Error('Flat-first layout capability is missing');
            if (entries.has(key)) throw new Error('Duplicate directional page/mip');
            entries.set(key, chunk);
        }
        if (entries.size !== layers*mipLevels) throw new Error('Unexpected receiver page/mip inventory');
        for (let mip = 0; mip < mipLevels; mip++) {
            const size = pageSize >> mip, data = hdr ? new Uint32Array(size*size*layers) : new Uint8Array(size * size * 4 * layers);
            for (let layer = 0; layer < layers; layer++) {
                const chunk = entries.get(`${layer}/${mip}`), d = chunk?.descriptor;
                if (!chunk || d.encoding !== (hdr ? 'rgb9e5_le' : 'rgba8_unorm') || d.coordinateTransform.schema !== (hdr ? 'bus-sim-rgb9e5-lightmap-page-v1' : 'bus-sim-directional-lightmap-page-v1')
                    || d.dimensions.width !== size || d.dimensions.height !== size || chunk.data.byteLength !== size * size * 4) throw new Error('Incomplete directional page/mip');
                const decode = hdr ? {scale:[1,1,1,1],bias:[0,0,0,0]} : d.coordinateTransform.decode;
                if (!decode || ![decode.scale, decode.bias].every((v) => Array.isArray(v) && v.length === 4 && v.every(Number.isFinite))
                    || decode.scale.some((v) => v < 0)) throw new Error('Invalid directional decoding range');
                if (mip === 0) { scale.push(new THREE.Vector4(...decode.scale)); bias.push(new THREE.Vector4(...decode.bias)); }
                else if (!scale[layer].equals(new THREE.Vector4(...decode.scale)) || !bias[layer].equals(new THREE.Vector4(...decode.bias))) throw new Error('Directional mip decoding range changed');
                await assembly.copy(new Uint8Array(data.buffer), chunk.data, layer * size * size * 4);
                await new Promise(resolve => setTimeout(resolve, 0)); signal.throwIfAborted();
            }
            levels.push({ data, width: size, height: size, depth: layers });
        }
        let shared = mappings.get(key);
        if (shared && (shared.hash !== coordinateHash || shared.description !== JSON.stringify(mapping))) throw new Error('Shared directional coordinate mismatch');
        if (!shared) {
            const texture = new THREE.DataTexture(coordinateData, mapping.tableWidth, mapping.tableHeight, THREE.RGBAFormat, THREE.FloatType);
            texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
            shared = { texture, references: 0, hash: coordinateHash, description: JSON.stringify(mapping) };
            mappings.set(key, shared);
        }
        shared.references++;
        let texture;
        const decoded = performance.now(); let disposed = false, preparation;
        function dispose() {
            if (disposed) return; disposed = true; texture?.dispose();
            if (--shared.references === 0) { shared.texture.dispose(); mappings.delete(key); }
        }
        try {
            texture = hdr ? createReceiverHdrTexture(renderer, levels)
                : new THREE.CompressedArrayTexture(levels, pageSize, pageSize, layers, THREE.RGBAFormat, THREE.UnsignedByteType);
            texture.minFilter = mipLevels > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false; texture.needsUpdate = true;
            signal.throwIfAborted();
            if (!shared.prepared) {
                await prepareReceiverTexture(renderer, shared.texture, [shared.texture.image], signal);
                shared.prepared = true;
            }
            if (hdr) preparation = await prepareReceiverTexture(renderer, texture, levels, signal);
            else renderer.initTexture(texture);
            if (gl.getError() !== gl.NO_ERROR) throw new Error('Directional GPU upload failed');
        } catch (error) { dispose(); throw error; }
        const pageBytes = levels.reduce((sum, v) => sum + v.data.byteLength, 0);
        return { mapping, mappingTexture: shared.texture, texture, scale, bias, directional,
            identity: { aggregateSha256: descriptor.aggregateSha256, profileId }, dispose,
            metrics: { downloadMs: timings.downloadMs, inflateMs: timings.inflateMs, workerValidationMs: timings.validateMs,
                validateDecodeMs: decoded - start - timings.downloadMs - timings.inflateMs, uploadMs: performance.now() - decoded,
                gpuBytes: pageBytes, cpuBytes: pageBytes, sharedMappingBytes: shared.texture.image.data.byteLength,
                compressedBytes, layers, preparation, assembly: { ...assembly.metrics }, encoding: hdr ? 'rgb9e5_hdr' : 'linear_rgba8_per_component' } };
    };
}
