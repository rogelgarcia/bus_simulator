// Installs immutable coastal resources before atomically switching the current manifest.
// @ts-check
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { publishBakeFile } from '../baking/Publication.mjs';
import { validatePreparedCoastal } from './CoastalValidation.mjs';

/** @param {any|null} existing @param {any} candidate */
export function assertCoastalPublicationCompatible(existing, candidate) {
    if (!existing) return;
    if (existing.id !== candidate.id || existing.revision !== candidate.revision
        || existing.provenance?.sourceSha256 !== candidate.provenance.sourceSha256
        || !Array.isArray(existing.operations) || existing.operations.length
        || !Array.isArray(existing.soil?.overrides) || existing.soil.overrides.length
        || JSON.stringify(existing) !== JSON.stringify(candidate)) {
        throw new Error('Coastal import refuses to replace a changed or authored current landscape; preserve that revision and use an explicit migration');
    }
}

/** @param {{directory:string,manifestFile:string,files:string[]}} prepared @param {string} destination @param {{signal?:AbortSignal}} [options] */
export async function publishPreparedCoastal(prepared, destination, { signal } = {}) {
    await validatePreparedCoastal(prepared.directory);
    const candidate = JSON.parse(await readFile(prepared.manifestFile, 'utf8'));
    const currentFile = path.join(destination, 'manifest.json');
    let existing = null;
    try { existing = JSON.parse(await readFile(currentFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    assertCoastalPublicationCompatible(existing, candidate);
    const installed = [];
    for (const file of prepared.files) {
        if (file === prepared.manifestFile) continue;
        signal?.throwIfAborted();
        const output = path.join(destination, path.relative(prepared.directory, file));
        await publishBakeFile(file, output); installed.push(output);
    }
    signal?.throwIfAborted();
    await publishBakeFile(prepared.manifestFile, currentFile); installed.push(currentFile);
    return installed;
}
