// Fetches and validates raw material pages and rasterizes semantic masks away from the render thread.
// Material requests list their pages in surface order (base color, normals, ORM, then the paired micro layer when present); each page
// resolves against the sidecar that declared it, the schema-1 appearance sidecar or the companion multiscale sidecar.
import { loadLandscapeAppearancePage } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { loadLandscapeAppearanceMultiscalePage } from '../../../app/landscape/LandscapeAppearanceMultiscalePayload.js';
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask } from './LandscapeCoverageMask.js';

let context = null;
let presentation = null;

function loadPage({ page, source }) {
    if (source === 'appearance') return loadLandscapeAppearancePage(page, { manifestUrl: context.appearanceUrl });
    if (source === 'multiscale' && context.multiscaleUrl) return loadLandscapeAppearanceMultiscalePage(page, { manifestUrl: context.multiscaleUrl, maxDecodedBytes: context.multiscalePageBytes });
    throw new Error(`Material page source ${source} is not available to the appearance worker`);
}

self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') { context = data; presentation = createLandscapeNaturalPresentation(data.manifest, data.root); return; }
    const { id } = data;
    try {
        if (data.type === 'mask') {
            const result = await createLandscapeCoverageMask({ manifest: context.manifest, manifestUrl: context.manifestUrl, presentation, chunkId: data.chunkId, landCover: data.landCover });
            self.postMessage({ id, ...result }, [result.pixels.buffer]);
        } else if (data.type === 'material') {
            const [base, ...layers] = data.pages;
            const baseColor = await loadPage(base);
            if (baseColor.length !== data.resolution * data.resolution * 4) throw new Error(`Material base color does not match its ${data.resolution} tier`);
            const surface = new Uint8Array(baseColor.length * layers.length);
            for (const [layer, page] of layers.entries()) {
                const bytes = await loadPage(page);
                if (bytes.length !== baseColor.length) throw new Error(`Material ${page.role} page does not match its ${data.resolution} tier`);
                surface.set(bytes, layer * baseColor.length);
            }
            self.postMessage({ id, baseColor, surface }, [baseColor.buffer, surface.buffer]);
        } else throw new Error(`Unknown appearance work ${data.type}`);
    } catch (error) { self.postMessage({ id, error: error.message }); }
};
