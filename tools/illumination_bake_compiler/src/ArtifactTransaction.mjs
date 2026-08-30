// Stages compiler artifacts and promotes complete content-addressed directories without overwrites.
// @ts-check

import { lstat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { asCompilerError, CompilerError, failCompiler } from './CompilerErrors.mjs';
import { assertFileSnapshotsUnchanged, snapshotFiles } from './FileHashes.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * @typedef {{id: string, filePath: string}} SnapshotInput
 * @typedef {{id: string, fileName: string, byteLength: number, sha256: string}} Snapshot
 */

/**
 * @param {{artifactRoot: string, contentSha256: string, runId: string}} options
 * @returns {Readonly<{stagingPath: string, finalPath: string}>}
 */
export function createArtifactPaths(options) {
    assertArtifactOptions(options);
    const artifactRoot = path.resolve(options.artifactRoot);
    if (artifactRoot === path.parse(artifactRoot).root) {
        throw new TypeError('Artifact root may not be a filesystem root');
    }
    const stagingPath = path.join(
        artifactRoot,
        'staging',
        `${options.contentSha256}.${options.runId}.partial`
    );
    const finalPath = path.join(artifactRoot, 'promoted', options.contentSha256);
    assertSameVolume(stagingPath, finalPath);
    return Object.freeze({ stagingPath, finalPath });
}

/**
 * Creates a unique partial directory. Existing stages and promoted objects are never reused.
 * @param {{artifactRoot: string, contentSha256: string, runId: string}} options
 * @param {{mkdirFn?: typeof mkdir, lstatFn?: typeof lstat, renameFn?: typeof rename}} [deps]
 */
export async function createArtifactTransaction(options, deps = {}) {
    const paths = createArtifactPaths(options);
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const lstatFn = deps.lstatFn ?? lstat;
    const renameFn = deps.renameFn ?? rename;
    try {
        await mkdirFn(path.dirname(paths.stagingPath), { recursive: true });
        await mkdirFn(path.dirname(paths.finalPath), { recursive: true });
        await assertPathAbsent(paths.finalPath, 'artifact_collision', lstatFn);
        await mkdirFn(paths.stagingPath, { recursive: false });
    } catch (error) {
        throw asCompilerError(error, 'artifact_stage_create_failed', 'Could not create a unique compiler staging directory.', {
            stagingPath: paths.stagingPath,
            finalPath: paths.finalPath
        });
    }

    return Object.freeze({
        ...paths,
        /**
         * @param {{
         *   validateStage: (stagingPath: string) => unknown | Promise<unknown>,
         *   expectedSnapshots?: readonly Snapshot[],
         *   snapshotInputs?: readonly SnapshotInput[]
         * }} promotion
         */
        promote: async (promotion) => promoteArtifactDirectory({
            ...paths,
            ...promotion
        }, { lstatFn, renameFn })
    });
}

/**
 * Validates the complete stage and atomically renames it to a previously absent final path.
 * @param {{
 *   stagingPath: string,
 *   finalPath: string,
 *   validateStage: (stagingPath: string) => unknown | Promise<unknown>,
 *   expectedSnapshots?: readonly Snapshot[],
 *   snapshotInputs?: readonly SnapshotInput[]
 * }} options
 * @param {{
 *   lstatFn?: typeof lstat,
 *   renameFn?: typeof rename,
 *   snapshotFilesFn?: typeof snapshotFiles
 * }} [deps]
 */
export async function promoteArtifactDirectory(options, deps = {}) {
    assertPromotionOptions(options);
    assertSameVolume(options.stagingPath, options.finalPath);
    const lstatFn = deps.lstatFn ?? lstat;
    const renameFn = deps.renameFn ?? rename;
    let stage;
    try {
        stage = await lstatFn(options.stagingPath);
    } catch (error) {
        throw asCompilerError(error, 'artifact_stage_missing', 'Compiler staging directory does not exist.', {
            stagingPath: options.stagingPath
        });
    }
    if (!stage.isDirectory()) {
        failCompiler('artifact_stage_invalid', 'Compiler staging path must be a directory.', {
            stagingPath: options.stagingPath
        });
    }
    await assertPathAbsent(options.finalPath, 'artifact_collision', lstatFn);
    try {
        await options.validateStage(options.stagingPath);
    } catch (error) {
        throw asCompilerError(error, 'artifact_stage_invalid', 'Compiler staging directory is incomplete or invalid.', {
            stagingPath: options.stagingPath
        });
    }
    const hasExpected = options.expectedSnapshots !== undefined;
    const hasInputs = options.snapshotInputs !== undefined;
    if (hasExpected !== hasInputs) {
        throw new TypeError('Artifact promotion requires expectedSnapshots and snapshotInputs together');
    }
    if (hasExpected && hasInputs) {
        let actual;
        try {
            actual = await (deps.snapshotFilesFn ?? snapshotFiles)(options.snapshotInputs);
        } catch (error) {
            throw new CompilerError('artifact_inputs_stale', 'Compiler source, scripts, or configuration became unreadable before promotion.', {
                expectedSnapshotIds: options.expectedSnapshots.map((entry) => entry.id)
            }, { cause: error });
        }
        assertFileSnapshotsUnchanged(options.expectedSnapshots, actual, {
            code: 'artifact_inputs_stale',
            label: 'Compiler source, scripts, or configuration'
        });
    }
    await assertPathAbsent(options.finalPath, 'artifact_collision', lstatFn);
    try {
        await renameFn(options.stagingPath, options.finalPath);
    } catch (error) {
        const causeCode = typeof error === 'object' && error && 'code' in error
            ? String(/** @type {{code?: unknown}} */ (error).code ?? '')
            : '';
        if (['EEXIST', 'ENOTEMPTY'].includes(causeCode)) {
            failCompiler('artifact_collision', 'A promoted artifact already exists at the content address.', {
                finalPath: options.finalPath
            }, error);
        }
        throw asCompilerError(error, 'artifact_promotion_failed', 'Could not rename the validated stage into the content-addressed artifact store.', {
            stagingPath: options.stagingPath,
            finalPath: options.finalPath
        });
    }
    return Object.freeze({ promoted: true, finalPath: options.finalPath });
}

/**
 * @param {string} stagingPath
 * @param {string} finalPath
 */
export function assertSameVolume(stagingPath, finalPath) {
    assertPath(stagingPath, 'Staging path');
    assertPath(finalPath, 'Final artifact path');
    const stagingRoot = path.parse(path.resolve(stagingPath)).root.toLocaleLowerCase('en-US');
    const finalRoot = path.parse(path.resolve(finalPath)).root.toLocaleLowerCase('en-US');
    if (stagingRoot !== finalRoot) {
        failCompiler('artifact_cross_volume', 'Artifact staging and promotion paths must be on the same filesystem volume.', {
            stagingRoot,
            finalRoot
        });
    }
}

/**
 * @param {string} targetPath
 * @param {string} code
 * @param {typeof lstat} lstatFn
 */
async function assertPathAbsent(targetPath, code, lstatFn) {
    try {
        await lstatFn(targetPath);
    } catch (error) {
        if (typeof error === 'object' && error && 'code' in error
            && /** @type {{code?: unknown}} */ (error).code === 'ENOENT') return;
        throw asCompilerError(error, 'artifact_path_check_failed', 'Could not prove that the artifact destination is absent.', {
            targetPath
        });
    }
    failCompiler(code, 'Artifact destination already exists and may not be overwritten.', { targetPath });
}

/** @param {{artifactRoot: string, contentSha256: string, runId: string}} options */
function assertArtifactOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Artifact transaction options are required');
    assertPath(options.artifactRoot, 'Artifact root');
    if (!SHA256_PATTERN.test(options.contentSha256)) {
        throw new TypeError('Artifact contentSha256 must be 64 lowercase hexadecimal characters');
    }
    if (typeof options.runId !== 'string' || !RUN_ID_PATTERN.test(options.runId)) {
        throw new TypeError('Artifact runId must be a filesystem-safe stable identifier');
    }
}

/** @param {Parameters<typeof promoteArtifactDirectory>[0]} options */
function assertPromotionOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Artifact promotion options are required');
    assertPath(options.stagingPath, 'Staging path');
    assertPath(options.finalPath, 'Final artifact path');
    if (path.resolve(options.stagingPath) === path.resolve(options.finalPath)) {
        throw new TypeError('Artifact staging and final paths must be different');
    }
    if (typeof options.validateStage !== 'function') {
        throw new TypeError('Artifact promotion requires a stage validation function');
    }
}

/** @param {string} value @param {string} label */
function assertPath(value, label) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${label} must be a non-empty string`);
}
