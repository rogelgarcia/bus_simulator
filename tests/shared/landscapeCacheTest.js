// Lets tests that read the local, gitignored landscape cache skip with the generate/install guidance when it is not installed (AI 595).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDSCAPE_CACHE_GUIDE, LANDSCAPE_DEFAULT_DIRECTORY, landscapeCacheDirectory } from '../../src/app/landscape/LandscapeCache.js';
import { createCoastalLandscapeCitySpec } from '../../src/app/city/specs/CoastalLandscapeCitySpec.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Skip reason for a test that reads an installed landscape cache directory, or false when every listed file is present.
 * @param {string[]} [files] files the test reads, relative to the landscape directory
 * @param {string} [directory] repository-relative landscape directory (default: the coastal v2 cache the viewer and server open by default)
 * @returns {false|string}
 */
export function landscapeCacheSkip(files = ['manifest.json'], directory = LANDSCAPE_DEFAULT_DIRECTORY) {
    const missing = files.find(file => !existsSync(path.join(root, directory, file)));
    return missing === undefined ? false : `local landscape cache not installed (${directory}/${missing}); see ${LANDSCAPE_CACHE_GUIDE}`;
}

/** Skip reason for a test that reads the landscape the city spec pins (its directory follows the binding's landscape id, not the viewer default). */
export function pinnedLandscapeCacheSkip(files = []) {
    const binding = createCoastalLandscapeCitySpec().landscape;
    return landscapeCacheSkip([path.posix.basename(binding.manifestUrl), ...files], landscapeCacheDirectory(binding.landscapeId));
}

/**
 * The coastal v2 landscape and the AI 576 city pin it carried until AI 596 D4 re-pinned the city to `coastal-city-v3`. v2 stays immutable in
 * its directory and remains the viewer/server default, so the suites that exercise its retained history (the material-only revisions, the
 * source audit, the browser editing/appearance workflows) keep these constants instead of the city spec.
 */
export const COASTAL_V2 = Object.freeze({
    landscapeId: 'coastal-city', directory: LANDSCAPE_DEFAULT_DIRECTORY,
    manifestUrl: `${LANDSCAPE_DEFAULT_DIRECTORY}/manifest.58fc747102857c7d2b05c0aa991604d958379a4065e709ca3c1da4438b26f7b4.json`,
    revision: 'hierarchy-afaf934f8eb8fe074a0affb0',
    naturePassSnapshot: 'manifest.12fc8d5c72fa47bd41946c98a8acced91b70738a5c6da469a08843683dc0f95b.json',
    materialsSnapshot: 'manifest.496f91b93facbbc9183d939d4da4e758852270fa71ed19e732ad1fa944127c20.json'
});

/** The city spec as it was bound to coastal v2 (same transform, extent and parcels; only the landscape identity, pinned snapshot and revision differ). */
export function createCoastalV2CitySpec() {
    const spec = createCoastalLandscapeCitySpec();
    spec.landscape = { ...spec.landscape, landscapeId: COASTAL_V2.landscapeId, manifestUrl: COASTAL_V2.manifestUrl, revision: COASTAL_V2.revision };
    return spec;
}
