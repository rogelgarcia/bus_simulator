// Promotes complete verified package releases by same-volume atomic rename.
// @ts-check

import { lstat, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJsonStringify } from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import { asPackageToolError, PackageToolError } from './PackageToolError.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * @param {{artifactRoot: string, cityId: string, lightingProfileId: string, capabilityProfileId: string, aggregateSha256: string, runId: string}} options
 */
export function createPackagePromotionPaths(options) {
    assertOptions(options);
    const root = path.resolve(options.artifactRoot);
    if (root === path.parse(root).root) throw new TypeError('Artifact root may not be a filesystem root');
    const profileRoot = path.join(root, options.cityId, options.lightingProfileId, options.capabilityProfileId);
    const stagingPath = path.join(profileRoot, 'staging', `${options.aggregateSha256}.${options.runId}.partial`);
    const finalPath = path.join(profileRoot, 'releases', options.aggregateSha256);
    if (path.parse(stagingPath).root.toLowerCase() !== path.parse(finalPath).root.toLowerCase()) {
        throw new TypeError('Package staging and release paths must share a filesystem volume');
    }
    return Object.freeze({ finalPath, stagingPath });
}

/**
 * @param {{
 *   artifactRoot: string,
 *   cityId: string,
 *   lightingProfileId: string,
 *   capabilityProfileId: string,
 *   aggregateSha256: string,
 *   runId: string,
 *   packageBytes: Uint8Array,
 *   manifest: unknown,
 *   validationReport: unknown,
 *   validateStage: (stagingPath: string) => unknown | Promise<unknown>
 * }} options
 * @param {{mkdirFn?: typeof mkdir, lstatFn?: typeof lstat, renameFn?: typeof rename, writeFileFn?: typeof writeFile}} [deps]
 */
export async function promotePackageRelease(options, deps = {}) {
    if (!(options.packageBytes instanceof Uint8Array)) throw new TypeError('Promotion packageBytes must be a Uint8Array');
    if (typeof options.validateStage !== 'function') throw new TypeError('Promotion requires validateStage');
    const paths = createPackagePromotionPaths(options);
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const lstatFn = deps.lstatFn ?? lstat;
    const renameFn = deps.renameFn ?? rename;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    try {
        await mkdirFn(path.dirname(paths.stagingPath), { recursive: true });
        await mkdirFn(path.dirname(paths.finalPath), { recursive: true });
        await assertAbsent(paths.finalPath, lstatFn, 'package_release_collision');
        await mkdirFn(paths.stagingPath, { recursive: false });
        await writeFileFn(path.join(paths.stagingPath, 'package.ilpkg'), options.packageBytes, { flag: 'wx' });
        await writeFileFn(
            path.join(paths.stagingPath, 'manifest.json'),
            canonicalJsonStringify(options.manifest),
            { encoding: 'utf8', flag: 'wx' }
        );
        await writeFileFn(
            path.join(paths.stagingPath, 'validation_report.json'),
            canonicalJsonStringify(options.validationReport),
            { encoding: 'utf8', flag: 'wx' }
        );
        await options.validateStage(paths.stagingPath);
        await assertAbsent(paths.finalPath, lstatFn, 'package_release_collision');
        await renameFn(paths.stagingPath, paths.finalPath);
    } catch (error) {
        throw asPackageToolError(error, 'package_promotion_failed', 'Illumination package promotion failed before atomic release.', {
            finalPath: paths.finalPath,
            stagingPath: paths.stagingPath
        });
    }
    return Object.freeze({
        aggregateSha256: options.aggregateSha256,
        finalPath: paths.finalPath,
        promoted: true
    });
}

/** @param {string} target @param {typeof lstat} lstatFn @param {string} code */
async function assertAbsent(target, lstatFn, code) {
    try {
        await lstatFn(target);
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error
            && /** @type {{code?: unknown}} */ (error).code === 'ENOENT') return;
        throw error;
    }
    throw new PackageToolError(code, 'A package release already exists and will not be overwritten.', { target });
}

/** @param {Parameters<typeof createPackagePromotionPaths>[0]} options */
function assertOptions(options) {
    if (!options || typeof options !== 'object') throw new TypeError('Package promotion options are required');
    if (typeof options.artifactRoot !== 'string' || !options.artifactRoot) throw new TypeError('artifactRoot is required');
    for (const key of ['cityId', 'lightingProfileId', 'capabilityProfileId', 'runId']) {
        if (typeof options[key] !== 'string' || !SEGMENT_PATTERN.test(options[key])) {
            throw new TypeError(`${key} must be a filesystem-safe stable segment`);
        }
    }
    if (!SHA256_PATTERN.test(options.aggregateSha256)) {
        throw new TypeError('aggregateSha256 must be 64 lowercase hexadecimal characters');
    }
}
