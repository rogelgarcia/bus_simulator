// Verifies the exact portable Blender archive and executable bytes.
// @ts-check

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { asCompilerError, failCompiler } from './CompilerErrors.mjs';
import { hashFileRaw } from './FileHashes.mjs';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * @typedef {{fileName: string, byteLength: number, sha256: string}} BlenderArchiveContract
 * @typedef {{sha256: string, fileName: string, byteLength: number}} BlenderExecutableContract
 */

/**
 * @param {{archivePath: string, contract: BlenderArchiveContract}} options
 * @param {{statFn?: typeof stat, hashFileFn?: typeof hashFileRaw}} [deps]
 */
export async function verifyBlenderArchive(options, deps = {}) {
    if (!options || typeof options !== 'object') throw new TypeError('Blender archive verification options are required');
    assertArchiveContract(options.contract);
    assertPath(options.archivePath, 'Blender archive path');
    const actualFileName = path.basename(options.archivePath);
    if (actualFileName !== options.contract.fileName) {
        failCompiler('blender_archive_filename_mismatch', 'Blender archive filename does not match the pinned contract.', {
            expected: options.contract.fileName,
            actual: actualFileName
        });
    }
    await assertRegularFile(options.archivePath, 'blender_archive_missing', 'Pinned Blender archive', deps.statFn ?? stat);
    let raw;
    try {
        raw = await (deps.hashFileFn ?? hashFileRaw)(options.archivePath);
    } catch (error) {
        throw asCompilerError(error, 'blender_archive_unreadable', 'Pinned Blender archive could not be hashed.', {
            fileName: actualFileName
        });
    }
    if (raw.byteLength !== options.contract.byteLength) {
        failCompiler('blender_archive_size_mismatch', 'Blender archive byte length does not match the pinned contract.', {
            expected: options.contract.byteLength,
            actual: raw.byteLength,
            fileName: actualFileName
        });
    }
    if (raw.sha256 !== options.contract.sha256) {
        failCompiler('blender_archive_hash_mismatch', 'Blender archive raw SHA-256 does not match the pinned contract.', {
            expected: options.contract.sha256,
            actual: raw.sha256,
            fileName: actualFileName
        });
    }
    return Object.freeze({ fileName: actualFileName, byteLength: raw.byteLength, sha256: raw.sha256 });
}

/**
 * @param {{executablePath: string, contract: BlenderExecutableContract}} options
 * @param {{statFn?: typeof stat, hashFileFn?: typeof hashFileRaw}} [deps]
 */
export async function verifyBlenderExecutable(options, deps = {}) {
    if (!options || typeof options !== 'object') throw new TypeError('Blender executable verification options are required');
    assertExecutableContract(options.contract);
    assertPath(options.executablePath, 'Blender executable path');
    const actualFileName = path.basename(options.executablePath);
    if (options.contract.fileName !== undefined && actualFileName !== options.contract.fileName) {
        failCompiler('blender_executable_filename_mismatch', 'Blender executable filename does not match the pinned contract.', {
            expected: options.contract.fileName,
            actual: actualFileName
        });
    }
    await assertRegularFile(options.executablePath, 'blender_executable_missing', 'Pinned Blender executable', deps.statFn ?? stat);
    let raw;
    try {
        raw = await (deps.hashFileFn ?? hashFileRaw)(options.executablePath);
    } catch (error) {
        throw asCompilerError(error, 'blender_executable_unreadable', 'Pinned Blender executable could not be hashed.', {
            fileName: actualFileName
        });
    }
    if (raw.sha256 !== options.contract.sha256) {
        failCompiler('blender_executable_hash_mismatch', 'Blender executable raw SHA-256 does not match the pinned contract.', {
            expected: options.contract.sha256,
            actual: raw.sha256,
            fileName: actualFileName
        });
    }
    if (raw.byteLength !== options.contract.byteLength) {
        failCompiler('blender_executable_size_mismatch', 'Blender executable byte length does not match the pinned contract.', {
            expected: options.contract.byteLength,
            actual: raw.byteLength,
            fileName: actualFileName
        });
    }
    return Object.freeze({ fileName: actualFileName, byteLength: raw.byteLength, sha256: raw.sha256 });
}

/**
 * @param {{
 *   archivePath: string,
 *   executablePath: string,
 *   contract: {archive: BlenderArchiveContract, executable: BlenderExecutableContract}
 * }} options
 * @param {{statFn?: typeof stat, hashFileFn?: typeof hashFileRaw}} [deps]
 */
export async function verifyBlenderToolchain(options, deps = {}) {
    if (!options?.contract) throw new TypeError('Blender toolchain contract is required');
    const contract = normalizeToolchainContract(options.contract);
    const archive = await verifyBlenderArchive({
        archivePath: options.archivePath,
        contract: contract.archive
    }, deps);
    const executable = await verifyBlenderExecutable({
        executablePath: options.executablePath,
        contract: contract.executable
    }, deps);
    return Object.freeze({ archive, executable });
}

/**
 * Verifies the bpy probe emitted by the pinned executable before any bake begins.
 * @param {unknown} value
 * @param {unknown} contractValue
 */
export function verifyBlenderRuntimeSignature(value, contractValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Blender runtime signature must be an object');
    }
    const contract = normalizeToolchainContract(contractValue);
    const expected = contract.signature;
    if (!expected) throw new TypeError('Blender toolchain contract has no runtime build signature');
    const actual = /** @type {Record<string, unknown>} */ (value);
    const comparisons = [
        ['versionString', actual.versionString, expected.versionString],
        ['buildHash', actual.buildHash, expected.buildHash],
        ['buildPlatform', actual.buildPlatform, expected.buildPlatform],
        ['architecture', actual.architecture, expected.architecture]
    ];
    for (const [field, found, pinned] of comparisons) {
        if (found !== pinned) {
            failCompiler('blender_runtime_signature_mismatch', 'Blender runtime build signature does not match the pinned toolchain.', {
                field,
                expected: pinned ?? null,
                actual: found ?? null
            });
        }
    }
    if (JSON.stringify(actual.version) !== JSON.stringify(expected.version)) {
        failCompiler('blender_runtime_signature_mismatch', 'Blender runtime version tuple does not match the pinned toolchain.', {
            field: 'version',
            expected: expected.version,
            actual: actual.version ?? null
        });
    }
    return Object.freeze({
        version: Object.freeze([...expected.version]),
        versionString: expected.versionString,
        buildHash: expected.buildHash,
        buildPlatform: expected.buildPlatform,
        architecture: expected.architecture
    });
}

/**
 * @param {string} filePath
 * @param {string} missingCode
 * @param {string} label
 * @param {typeof stat} statFn
 */
async function assertRegularFile(filePath, missingCode, label, statFn) {
    try {
        const entry = await statFn(filePath);
        if (!entry.isFile()) failCompiler(missingCode, `${label} must be a regular file.`, { filePath });
    } catch (error) {
        throw asCompilerError(error, missingCode, `${label} does not exist or is not accessible.`, { filePath });
    }
}

/** @param {BlenderArchiveContract} contract */
function assertArchiveContract(contract) {
    if (!contract || typeof contract !== 'object') throw new TypeError('Blender archive contract is required');
    if (typeof contract.fileName !== 'string' || !contract.fileName || path.basename(contract.fileName) !== contract.fileName) {
        throw new TypeError('Blender archive contract fileName must be an exact base filename');
    }
    if (!Number.isSafeInteger(contract.byteLength) || contract.byteLength <= 0) {
        throw new TypeError('Blender archive contract byteLength must be a positive safe integer');
    }
    assertSha256(contract.sha256, 'Blender archive contract SHA-256');
}

/** @param {BlenderExecutableContract} contract */
function assertExecutableContract(contract) {
    if (!contract || typeof contract !== 'object') throw new TypeError('Blender executable contract is required');
    assertSha256(contract.sha256, 'Blender executable contract SHA-256');
    if (typeof contract.fileName !== 'string' || !contract.fileName || path.basename(contract.fileName) !== contract.fileName) {
        throw new TypeError('Blender executable contract fileName must be an exact base filename');
    }
    if (!Number.isSafeInteger(contract.byteLength) || contract.byteLength <= 0) {
        throw new TypeError('Blender executable contract byteLength must be a positive safe integer');
    }
}

/**
 * Accepts the small verifier shape or the checked-in toolchain.v1.json shape.
 * @param {any} value
 */
function normalizeToolchainContract(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Blender toolchain contract must be an object');
    }
    if (value.archive?.sha256 && value.executable?.sha256) {
        return {
            archive: value.archive,
            executable: value.executable,
            signature: value.signature ?? null
        };
    }
    if (value.archive?.officialSha256 && value.blender?.executableSha256) {
        return {
            archive: {
                fileName: value.archive.fileName,
                byteLength: value.archive.byteLength,
                sha256: value.archive.officialSha256
            },
            executable: {
                fileName: path.basename(value.blender.executableRelativePath),
                byteLength: value.blender.executableByteLength,
                sha256: value.blender.executableSha256
            },
            signature: {
                version: value.blender.version,
                versionString: value.blender.versionString,
                buildHash: value.blender.buildHash,
                buildPlatform: value.blender.buildPlatform,
                architecture: value.blender.architecture
            }
        };
    }
    throw new TypeError('Blender toolchain contract has an unsupported shape');
}

/** @param {string} value @param {string} label */
function assertSha256(value, label) {
    if (!SHA256_PATTERN.test(value)) throw new TypeError(`${label} must be 64 lowercase hexadecimal characters`);
}

/** @param {string} value @param {string} label */
function assertPath(value, label) {
    if (typeof value !== 'string' || !value) throw new TypeError(`${label} must be a non-empty string`);
}
