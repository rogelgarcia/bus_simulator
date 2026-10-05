// Fetches and validates raw material pages and rasterizes semantic masks away from the render thread.
// Material requests list their pages in surface order (base color, normals, ORM, then the paired micro layer when present); each page
// resolves against the sidecar that declared it, the schema-1 appearance sidecar or the companion multiscale sidecar. Terrain-field pages
// (AI577 D5) are fetched and authenticated here as well, so hashing never runs on the render thread, and the landscape-scale appearance layer
// (landscape-appearance-layer-v1) is derived here from the root field page, heights and land cover the request carries.
import { loadLandscapeAppearancePage } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { loadLandscapeAppearanceMultiscalePage } from '../../../app/landscape/LandscapeAppearanceMultiscalePayload.js';
import { loadLandscapeTerrainFieldPage } from '../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';
import { createLandscapeCoverageMask } from './LandscapeCoverageMask.js';
import { buildLandscapeAppearanceLayer } from './LandscapeTerrainAppearance.js';

let context = null;
let presentation = null;
// authenticated natural-soil pages by content address, bounded by context.naturalPages (reserved with the worker context)
const naturalPages = new Map();

async function loadNatural(entry, url) {
    const cached = naturalPages.get(entry.sha256);
    if (cached) { naturalPages.delete(entry.sha256); naturalPages.set(entry.sha256, cached); return cached; }
    const bytes = await loadLandscapeTerrainFieldPage(entry, { manifestUrl: url });
    if (!(context.naturalPages > 0)) return bytes;
    naturalPages.set(entry.sha256, bytes);
    while (naturalPages.size > context.naturalPages) naturalPages.delete(naturalPages.keys().next().value);
    return bytes;
}

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
            // data.natural (AI577 D5) names the terrain-driven natural-soil pages of the mask's owners and the natives that keep the overview fallback
            const result = await createLandscapeCoverageMask({ manifest: context.manifest, manifestUrl: context.manifestUrl, presentation, chunkId: data.chunkId, landCover: data.landCover,
                natural: data.natural ?? null, loadNatural });
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
        } else if (data.type === 'field') {
            if (!context.fieldsUrl) throw new Error('Terrain field pages are not available to the appearance worker');
            const bytes = await loadLandscapeTerrainFieldPage(data.page, { manifestUrl: context.fieldsUrl });
            self.postMessage({ id, bytes }, [bytes.buffer]);
        } else if (data.type === 'appearance-layer') {
            const { bytes, statistics } = buildLandscapeAppearanceLayer(data.input);
            self.postMessage({ id, bytes, statistics }, [bytes.buffer]);
        } else throw new Error(`Unknown appearance work ${data.type}`);
    } catch (error) { self.postMessage({ id, error: error.message }); }
};
