// Fetches and validates raw material pages and rasterizes semantic masks away from the render thread.
import { loadLandscapeAppearancePage } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask } from './LandscapeCoverageMask.js';

let context = null;
let presentation = null;
self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { context = data; presentation = createLandscapeNaturalPresentation(data.manifest, data.root); return; }
    const { id } = data;
    try {
        if (data.type === 'mask') {
            const result = await createLandscapeCoverageMask({ manifest: context.manifest, manifestUrl: context.manifestUrl, presentation, chunkId: data.chunkId, landCover: data.landCover });
            self.postMessage({ id, ...result }, [result.pixels.buffer]);
        } else if (data.type === 'material') {
            const options = { manifestUrl: context.appearanceUrl };
            const baseColor = await loadLandscapeAppearancePage(data.tier.channels.baseColor, options);
            const surface = new Uint8Array(baseColor.length * 2);
            for (const [layer, channel] of ['normal', 'orm'].entries()) surface.set(await loadLandscapeAppearancePage(data.tier.channels[channel], options), layer * baseColor.length);
            self.postMessage({ id, baseColor, surface }, [baseColor.buffer, surface.buffer]);
        } else throw new Error(`Unknown appearance work ${data.type}`);
    } catch (error) { self.postMessage({ id, error: error.message }); }
};
