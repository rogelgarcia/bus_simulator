// Fetches and validates raw material pages and rasterizes semantic masks away from the render thread.
import { loadLandscapeAppearancePage, loadLandscapeCoverMask, rasterizeLandscapeSoilMask } from '../../../app/landscape/LandscapeAppearancePayload.js';

let context = null;
self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { context = data; return; }
    const { id } = data;
    try {
        if (data.type === 'mask') {
            const mask = data.landCover
                ? { descriptor: context.manifest.chunks.find(chunk => chunk.id === data.chunkId), landCover: data.landCover, sourceRevision: context.manifest.revision }
                : await loadLandscapeCoverMask(context.manifest, data.chunkId, { manifestUrl: context.manifestUrl });
            const soilIndices = mask.soilIndices ?? rasterizeLandscapeSoilMask(context.manifest, mask.descriptor, mask.landCover);
            const pixels = new Uint8Array(mask.landCover.length * 2);
            const soils = new Set();
            for (let i = 0; i < soilIndices.length; i++) { pixels[i * 2] = soilIndices[i]; pixels[i * 2 + 1] = mask.landCover[i]; soils.add(soilIndices[i]); }
            self.postMessage({ id, pixels, soils: [...soils].sort((a, b) => a - b), sourceRevision: mask.sourceRevision }, [pixels.buffer]);
        } else if (data.type === 'material') {
            const options = { manifestUrl: context.appearanceUrl };
            const baseColor = await loadLandscapeAppearancePage(data.tier.channels.baseColor, options);
            const surface = new Uint8Array(baseColor.length * 2);
            for (const [layer, channel] of ['normal', 'orm'].entries()) surface.set(await loadLandscapeAppearancePage(data.tier.channels[channel], options), layer * baseColor.length);
            self.postMessage({ id, baseColor, surface }, [baseColor.buffer, surface.buffer]);
        } else throw new Error(`Unknown appearance work ${data.type}`);
    } catch (error) { self.postMessage({ id, error: error.message }); }
};
