// Verifies and installs a local landscape cache bundle: a copy of one generated landscape directory, never tracked by Git or Git LFS.
// Every payload, page and source file must authenticate by its content-addressed name or a hashed manifest record before installation.
// @ts-check
import path from 'node:path';
import { lstat, mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { hashFile } from '../baking/Files.mjs';
import { acquireAuthoringLock, atomicAuthoringWrite, authoringFile, authoringHash, readAuthoringFile, writeImmutableAuthoringFile } from '../landscape_authoring/AuthoringFiles.mjs';
import { LANDSCAPE_MANIFEST_BYTE_LIMIT, validateLandscapeManifest } from '../../src/app/landscape/index.js';

/** Current pointers switch after every immutable file, sidecars first and the terrain manifest last. */
export const LANDSCAPE_CACHE_POINTERS = Object.freeze(['appearance/manifest.json', 'appearance/multiscale.json', 'fields/manifest.json', 'manifest.json']);
const BINDING_ALIAS = /^appearance\/binding\.[a-f0-9]{64}\.json$/;
const CONTENT_ADDRESSED = /^(?:(?:manifest|multiscale)\.([a-f0-9]{64})\.json|([a-f0-9]{64})\.[a-z0-9]+)$/;
const TRANSIENT = /(?:^|\/)(?:authoring\.lock(?:\.recovering)?|authoring-interrupted-[^/]+\.json|[^/]+\.partial)$/;

/** @param {string} root @param {string} [prefix] @returns {Promise<string[]>} sorted relative POSIX paths of regular files */
async function listBundleFiles(root, prefix = '') {
    const files = [];
    for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const info = await lstat(path.join(root, relative));
        if (info.isDirectory()) files.push(...await listBundleFiles(root, relative));
        else if (info.isFile()) files.push(relative);
        else throw new Error(`[LandscapeCache] ${relative} is not a regular file; bundles may not contain links or devices`);
    }
    return files;
}

function visitRecords(node, visit) {
    if (Array.isArray(node)) { for (const value of node) visitRecords(value, visit); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.url === 'string' && typeof node.sha256 === 'string') visit(node);
    for (const value of Object.values(node)) visitRecords(value, visit);
}

/**
 * Authenticates every file of one landscape cache directory. Payloads, pages and source files must be verified by name or by a hashed record;
 * JSON outside `source/` must parse within the manifest limit and the terrain manifest must validate.
 * @param {string} directory @param {{signal?:AbortSignal}} [options]
 */
export async function verifyLandscapeCacheBundle(directory, { signal } = {}) {
    const root = path.resolve(directory);
    const relatives = await listBundleFiles(root);
    const problems = [], files = new Map();
    for (const relative of relatives) {
        signal?.throwIfAborted();
        authoringFile(root, relative);
        if (TRANSIENT.test(relative)) { problems.push(`${relative} is transient authoring state`); continue; }
        files.set(relative, { relative, ...await hashFile(path.join(root, relative)), verifiedBy: null });
    }
    if (!files.has('manifest.json')) throw new Error(`[LandscapeCache] ${root} has no manifest.json; it is not a landscape cache directory`);
    for (const file of files.values()) {
        const match = path.posix.basename(file.relative).match(CONTENT_ADDRESSED);
        if (!match || file.relative.startsWith('source/')) continue;
        if (file.sha256 === (match[1] ?? match[2])) file.verifiedBy = 'name';
        else problems.push(`${file.relative} does not match its content-addressed name`);
    }
    let records = 0, manifest = null;
    for (const file of files.values()) {
        if (!file.relative.endsWith('.json') || file.relative.startsWith('source/')) continue;
        signal?.throwIfAborted();
        if (file.bytes > LANDSCAPE_MANIFEST_BYTE_LIMIT) { problems.push(`${file.relative} exceeds the ${LANDSCAPE_MANIFEST_BYTE_LIMIT}-byte metadata limit`); continue; }
        let document;
        try { document = JSON.parse(await readFile(path.join(root, file.relative), 'utf8')); }
        catch (error) { problems.push(`${file.relative} is not valid JSON: ${error.message}`); continue; }
        if (file.relative === 'manifest.json') {
            try { manifest = validateLandscapeManifest(document); }
            catch (error) { problems.push(`manifest.json is invalid: ${error.message}`); }
        }
        if (!file.verifiedBy && (LANDSCAPE_CACHE_POINTERS.includes(file.relative) || BINDING_ALIAS.test(file.relative) || file.relative === 'PROVENANCE.json')) file.verifiedBy = 'schema';
        visitRecords(document, record => {
            records++;
            const candidates = [path.posix.join(path.posix.dirname(file.relative), record.url), path.posix.normalize(record.url)];
            const target = candidates.map(value => files.get(value)).find(Boolean);
            if (!target) { problems.push(`${file.relative} references missing ${record.url}`); return; }
            if (target.sha256 !== record.sha256 || (typeof record.byteLength === 'number' && target.bytes !== record.byteLength)) problems.push(`${file.relative} -> ${record.url} hash or size mismatch`);
            else target.verifiedBy ??= 'record';
        });
    }
    for (const file of files.values()) if (!file.verifiedBy) problems.push(`${file.relative} is not authenticated by its name or any hashed record`);
    const pointers = Object.fromEntries(LANDSCAPE_CACHE_POINTERS.filter(relative => files.has(relative)).map(relative => [relative, files.get(relative).sha256]));
    return Object.freeze({
        directory: root, passed: problems.length === 0, problems, files: [...files.values()], records, pointers,
        landscapeId: manifest?.id ?? null, revision: manifest?.revision ?? null, bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0)
    });
}

/**
 * Installs a verified bundle into a landscape cache directory under the authoring lock: immutable files first (an existing different file is
 * refused), binding aliases next, then the current pointers in LANDSCAPE_CACHE_POINTERS order. A current pointer the bundle does not retain
 * is never overwritten. A failed pointer switch restores every previous pointer.
 * @param {Awaited<ReturnType<typeof verifyLandscapeCacheBundle>>} bundle @param {string} destination @param {{signal?:AbortSignal}} [options]
 */
export async function installLandscapeCacheBundle(bundle, destination, { signal } = {}) {
    if (!bundle.passed) throw new Error(`[LandscapeCache] Refusing an unverified bundle: ${bundle.problems.slice(0, 5).join('; ')}`);
    const target = path.resolve(destination);
    if (target === bundle.directory) throw new Error('[LandscapeCache] The bundle is already the destination directory');
    await mkdir(target, { recursive: true });
    const release = await acquireAuthoringLock(target);
    const installed = [], retained = new Set(bundle.files.map(file => file.sha256));
    try {
        const read = async file => {
            const bytes = await readAuthoringFile(path.join(bundle.directory, file.relative), file.bytes, { signal });
            if (authoringHash(bytes) !== file.sha256) throw new Error(`[LandscapeCache] Bundle file changed after verification: ${file.relative}`);
            return bytes;
        };
        const previous = new Map();
        for (const relative of Object.keys(bundle.pointers)) {
            const bytes = await readAuthoringFile(path.join(target, relative), LANDSCAPE_MANIFEST_BYTE_LIMIT, { signal }).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
            if (bytes && authoringHash(bytes) !== bundle.pointers[relative] && !retained.has(authoringHash(bytes))) {
                throw new Error(`[LandscapeCache] ${relative} in ${target} is a local revision the bundle does not retain; preserve it before installing over it`);
            }
            previous.set(relative, bytes);
        }
        const mutable = file => LANDSCAPE_CACHE_POINTERS.includes(file.relative) || BINDING_ALIAS.test(file.relative);
        for (const file of bundle.files.filter(file => !mutable(file))) {
            signal?.throwIfAborted();
            await writeImmutableAuthoringFile(path.join(target, file.relative), await read(file), { signal });
            installed.push(path.join(target, file.relative));
        }
        for (const file of bundle.files.filter(file => BINDING_ALIAS.test(file.relative))) {
            await atomicAuthoringWrite(path.join(target, file.relative), await read(file), { signal });
            installed.push(path.join(target, file.relative));
        }
        const switched = [];
        try {
            for (const relative of LANDSCAPE_CACHE_POINTERS.filter(value => value in bundle.pointers)) {
                const file = bundle.files.find(value => value.relative === relative);
                await atomicAuthoringWrite(path.join(target, relative), await read(file), { signal });
                switched.push(relative); installed.push(path.join(target, relative));
            }
        } catch (error) {
            for (const relative of switched.reverse()) {
                const bytes = previous.get(relative);
                if (bytes) await atomicAuthoringWrite(path.join(target, relative), bytes);
                else await unlink(path.join(target, relative)).catch(() => {});
            }
            throw error;
        }
        return installed;
    } finally { await release(); }
}
