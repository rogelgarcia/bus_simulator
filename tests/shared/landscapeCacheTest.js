// Lets tests that read the local, gitignored landscape cache skip with the generate/install guidance when it is not installed (AI 595).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDSCAPE_CACHE_GUIDE, LANDSCAPE_DEFAULT_DIRECTORY } from '../../src/app/landscape/LandscapeCache.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Skip reason for a test that reads the installed coastal cache, or false when every listed file is present.
 * @param {string[]} [files] files the test reads, relative to the coastal cache directory
 * @returns {false|string}
 */
export function landscapeCacheSkip(files = ['manifest.json']) {
    const missing = files.find(file => !existsSync(path.join(root, LANDSCAPE_DEFAULT_DIRECTORY, file)));
    return missing === undefined ? false : `local landscape cache not installed (${LANDSCAPE_DEFAULT_DIRECTORY}/${missing}); see ${LANDSCAPE_CACHE_GUIDE}`;
}
