// Authenticates one explicitly retained appearance snapshot and publishes bounded compatibility aliases.
// @ts-check
import path from 'node:path';
import { authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile, atomicAuthoringWrite } from '../landscape_authoring/AuthoringFiles.mjs';
import { validateLandscapeAppearanceManifest, landscapeAppearanceBindingKey, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT } from '../../src/app/landscape/index.js';

/** @param {string} value */
export function appearanceCompatibilityOption(value) {
    if (typeof value !== 'string' || !/^manifest\.[a-f0-9]{64}\.json$/.test(value)) throw new Error('Appearance compatibility-snapshot must name one retained manifest.<sha256>.json beside appearance/manifest.json');
    return value;
}

/** @param {string} directory @param {string} filename */
export async function readAppearanceCompatibilitySnapshot(directory, filename) {
    appearanceCompatibilityOption(filename);
    const destination = path.join(directory, 'appearance'), file = authoringFile(destination, filename);
    const bytes = await readAuthoringFile(file, LANDSCAPE_APPEARANCE_MANIFEST_LIMIT);
    if (authoringHash(bytes) !== filename.slice(9, -5)) throw new Error('Appearance compatibility snapshot SHA-256 mismatch');
    const manifest = validateLandscapeAppearanceManifest(JSON.parse(bytes.toString('utf8')));
    const files = [file], seen = new Set();
    for (const material of manifest.materials) for (const tier of material.tiers) for (const page of Object.values(tier.channels)) {
        if (seen.has(page.url)) continue;
        seen.add(page.url);
        const file = authoringFile(destination, page.url), payload = await readAuthoringFile(file, page.byteLength);
        if (payload.length !== page.byteLength || authoringHash(payload) !== page.sha256) throw new Error(`Appearance compatibility page integrity mismatch ${page.url}`);
        files.push(file);
    }
    return { bytes, manifest, files };
}

/** @param {string} destination @param {Uint8Array} bytes */
export async function publishAppearanceBindingAlias(destination, bytes) {
    const manifest = validateLandscapeAppearanceManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    const snapshot = path.join(destination, `manifest.${authoringHash(bytes)}.json`);
    await writeImmutableAuthoringFile(snapshot, bytes);
    const alias = path.join(destination, `binding.${await landscapeAppearanceBindingKey(manifest)}.json`);
    await atomicAuthoringWrite(alias, bytes);
    return [snapshot, alias];
}
