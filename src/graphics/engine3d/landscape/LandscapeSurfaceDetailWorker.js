// Generates fine surface-coverage pages and point inspections from authenticated native cover away from the render thread.
// The worker validates its manifest once, builds the shared natural presentation and keeps a bounded least-recently-used
// set of authenticated native cover channels, so neighboring pages reuse the canonical support they share. Under a v4
// recipe it also keeps an equally bounded set of authenticated natural-soil pages (content addressed, so chunks sharing
// identical labels share one entry); each job names the pages and fallback natives in its natural soil request.
import { validateLandscapeManifest } from '../../../app/landscape/LandscapeManifest.js';
import { loadLandscapeCoverChannel } from '../../../app/landscape/LandscapeAppearancePayload.js';
import { loadLandscapeTerrainFieldPage } from '../../../app/landscape/LandscapeTerrainFieldsPayload.js';
import { createLandscapeNaturalPresentation } from './LandscapeNaturalPresentation.js';
import { createLandscapeSurfaceDetailPage, sampleLandscapeSurfaceDetail } from './LandscapeSurfaceDetailField.js';

let context = null;
let contextError = 'worker received work before its context';

function createContext(data) {
    if (!Number.isSafeInteger(data.coverPages) || data.coverPages < 1) throw new Error('[LandscapeSurfaceDetail] worker cover cache needs at least one page');
    const manifest = validateLandscapeManifest(data.manifest), presentation = createLandscapeNaturalPresentation(manifest, data.root), covers = new Map(), naturals = new Map();
    async function loadCover(id) {
        const cached = covers.get(id);
        if (cached) { covers.delete(id); covers.set(id, cached); return cached; }
        const loaded = await loadLandscapeCoverChannel(manifest, id, { manifestUrl: data.manifestUrl });
        covers.set(id, loaded);
        while (covers.size > data.coverPages) covers.delete(covers.keys().next().value);
        return loaded;
    }
    async function loadNatural(entry, url) {
        const cached = naturals.get(entry.sha256);
        if (cached) { naturals.delete(entry.sha256); naturals.set(entry.sha256, cached); return cached; }
        const bytes = await loadLandscapeTerrainFieldPage(entry, { manifestUrl: url });
        naturals.set(entry.sha256, bytes);
        while (naturals.size > data.coverPages) naturals.delete(naturals.keys().next().value);
        return bytes;
    }
    return { manifest, presentation, recipe: data.recipe, seed: data.seed, loadCover, loadNatural };
}

self.onmessage = async ({ data }) => {
    if (data.type === 'initialize') {
        try { context = createContext(data); } catch (error) { context = null; contextError = `worker context failed: ${error.message}`; }
        return;
    }
    const { id } = data;
    try {
        if (!context) throw new Error(`[LandscapeSurfaceDetail] ${contextError}`);
        const options = { manifest: context.manifest, descriptor: data.pageId, recipe: context.recipe, seed: context.seed, presentation: context.presentation, loadCover: context.loadCover,
            natural: data.natural ?? null, loadNatural: context.loadNatural };
        if (data.type === 'detail') {
            const page = await createLandscapeSurfaceDetailPage(options);
            self.postMessage({ id, pixels: page.pixels, soils: page.soils, sourceIds: page.sourceIds, metadata: page.metadata }, [page.pixels.buffer]);
        } else if (data.type === 'detail-sample') {
            self.postMessage({ id, sample: await sampleLandscapeSurfaceDetail({ ...options, x: data.x, z: data.z }) });
        } else throw new Error(`[LandscapeSurfaceDetail] Unknown worker job ${data.type}`);
    } catch (error) { self.postMessage({ id, error: error.message }); }
};
