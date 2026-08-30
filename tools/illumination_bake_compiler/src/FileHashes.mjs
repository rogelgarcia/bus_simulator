// Streams raw file hashes and creates stable snapshots for compiler inputs.
// @ts-check

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJsonStringify, compareCanonicalStrings } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { asCompilerError, failCompiler } from './CompilerErrors.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * @typedef {{algorithm: 'sha256', byteLength: number, sha256: string}} RawFileHash
 * @typedef {{id: string, fileName: string, byteLength: number, sha256: string}} FileSnapshot
 * @typedef {{id: string, filePath: string}} FileSnapshotInput
 */

/**
 * Computes the ordinary, unframed SHA-256 used by published archives and files.
 * @param {string} filePath
 * @param {{createReadStreamFn?: typeof createReadStream}} [deps]
 * @returns {Promise<Readonly<RawFileHash>>}
 */
export async function hashFileRaw(filePath, deps = {}) {
    assertFilePath(filePath);
    const createReadStreamFn = deps.createReadStreamFn ?? createReadStream;
    const digest = createHash('sha256');
    let byteLength = 0;
    try {
        const stream = createReadStreamFn(filePath);
        for await (const chunk of stream) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.byteLength;
            if (!Number.isSafeInteger(byteLength)) {
                failCompiler('file_size_unsupported', 'File byte length exceeds the safe integer range.', { filePath });
            }
            digest.update(bytes);
        }
    } catch (error) {
        throw asCompilerError(error, 'file_hash_failed', 'Could not stream the file for raw SHA-256 verification.', { filePath });
    }
    return Object.freeze({ algorithm: 'sha256', byteLength, sha256: digest.digest('hex') });
}

/**
 * Hashes one file and rejects a file that changes while its bytes are read.
 * @param {FileSnapshotInput} input
 * @param {{statFn?: typeof stat, hashFileFn?: typeof hashFileRaw}} [deps]
 * @returns {Promise<Readonly<FileSnapshot>>}
 */
export async function snapshotFile(input, deps = {}) {
    assertSnapshotInput(input);
    const statFn = deps.statFn ?? stat;
    const hashFileFn = deps.hashFileFn ?? hashFileRaw;
    let before;
    let after;
    let hashed;
    try {
        before = await statFn(input.filePath);
        if (!before.isFile()) {
            failCompiler('snapshot_not_file', 'Compiler snapshot input must be a regular file.', {
                id: input.id,
                filePath: input.filePath
            });
        }
        hashed = await hashFileFn(input.filePath);
        after = await statFn(input.filePath);
    } catch (error) {
        throw asCompilerError(error, 'snapshot_failed', 'Could not snapshot a compiler input file.', {
            id: input.id,
            filePath: input.filePath
        });
    }
    const changed = before.size !== after.size
        || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs
        || ('ino' in before && 'ino' in after && before.ino !== after.ino)
        || hashed.byteLength !== after.size;
    if (changed) {
        failCompiler('file_changed_during_snapshot', 'Compiler input changed while it was being hashed.', {
            id: input.id,
            beforeByteLength: before.size,
            hashedByteLength: hashed.byteLength,
            afterByteLength: after.size
        });
    }
    return Object.freeze({
        id: input.id,
        fileName: path.basename(input.filePath),
        byteLength: hashed.byteLength,
        sha256: hashed.sha256
    });
}

/**
 * @param {readonly FileSnapshotInput[]} inputs
 * @param {{snapshotFileFn?: typeof snapshotFile}} [deps]
 * @returns {Promise<readonly Readonly<FileSnapshot>[]>}
 */
export async function snapshotFiles(inputs, deps = {}) {
    if (!Array.isArray(inputs)) throw new TypeError('Compiler snapshot inputs must be an array');
    const snapshotFileFn = deps.snapshotFileFn ?? snapshotFile;
    const seen = new Set();
    const normalized = inputs.map((input) => {
        assertSnapshotInput(input);
        if (seen.has(input.id)) throw new TypeError(`Compiler snapshot input ID '${input.id}' is duplicated`);
        seen.add(input.id);
        return { id: input.id, filePath: input.filePath };
    }).sort((left, right) => compareCanonicalStrings(left.id, right.id));
    const snapshots = [];
    for (const input of normalized) snapshots.push(await snapshotFileFn(input));
    return Object.freeze(snapshots);
}

/**
 * @param {readonly FileSnapshot[]} expected
 * @param {readonly FileSnapshot[]} actual
 * @param {{code?: string, label?: string}} [options]
 */
export function assertFileSnapshotsUnchanged(expected, actual, options = {}) {
    const expectedCanonical = canonicalSnapshots(expected, 'Expected snapshots');
    const actualCanonical = canonicalSnapshots(actual, 'Actual snapshots');
    if (canonicalJsonStringify(expectedCanonical) !== canonicalJsonStringify(actualCanonical)) {
        failCompiler(
            options.code ?? 'compiler_inputs_stale',
            `${options.label ?? 'Compiler inputs'} changed after the authoritative snapshot.`,
            { expected: expectedCanonical, actual: actualCanonical }
        );
    }
}

/**
 * @param {readonly FileSnapshot[]} snapshots
 * @param {string} label
 * @returns {readonly FileSnapshot[]}
 */
function canonicalSnapshots(snapshots, label) {
    if (!Array.isArray(snapshots)) throw new TypeError(`${label} must be an array`);
    const ids = new Set();
    const result = snapshots.map((snapshot, index) => {
        if (!snapshot || typeof snapshot !== 'object') throw new TypeError(`${label}[${index}] must be an object`);
        if (typeof snapshot.id !== 'string' || !snapshot.id || ids.has(snapshot.id)) {
            throw new TypeError(`${label}[${index}].id must be a unique non-empty string`);
        }
        if (typeof snapshot.fileName !== 'string' || !snapshot.fileName || path.basename(snapshot.fileName) !== snapshot.fileName) {
            throw new TypeError(`${label}[${index}].fileName must be a base filename`);
        }
        if (!Number.isSafeInteger(snapshot.byteLength) || snapshot.byteLength < 0 || !SHA256_PATTERN.test(snapshot.sha256)) {
            throw new TypeError(`${label}[${index}] has an invalid byte length or SHA-256`);
        }
        ids.add(snapshot.id);
        return snapshot;
    });
    result.sort((left, right) => compareCanonicalStrings(left.id, right.id));
    return result;
}

/**
 * @param {FileSnapshotInput} input
 */
function assertSnapshotInput(input) {
    if (!input || typeof input !== 'object') throw new TypeError('Compiler snapshot input must be an object');
    if (typeof input.id !== 'string' || !input.id || input.id.trim() !== input.id) {
        throw new TypeError('Compiler snapshot input ID must be a non-empty stable string');
    }
    assertFilePath(input.filePath);
}

/**
 * @param {string} filePath
 */
function assertFilePath(filePath) {
    if (typeof filePath !== 'string' || !filePath) throw new TypeError('File path must be a non-empty string');
}
