#!/usr/bin/env node
// Promotes authenticated textureGrad foliage fields with file-backed parity.

import {createHash} from 'node:crypto';
import {copyFile, link, lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {PRODUCTION_STATIC_SUN_DEFAULTS} from './production.mjs';
import {
    loadProductionAlphaParityArtifact,
    loadProductionNativeCutoutField,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';
import {
    assertCleanProductionNativeFieldReceipt
} from './src/ProductionProvenance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

export function buildPromotedNativeCutoutFieldReceipt(options) {
    const receipt = options?.receipt;
    const supported = receipt?.schema
            === 'ai531-production-alpha-cutout-native-field-receipt-v3'
        && receipt?.method
            === 'headless-blender-full-lattice-candidates-three-r183-native-texture-grad-v3'
        || receipt?.schema === 'ai531-production-alpha-cutout-native-field-receipt-v6'
        && receipt?.method
            === 'authenticated-direct-depth24-texture-grad-hole-fill-v6';
    if (!supported
        || receipt.status !== 'complete_unpromoted'
        || receipt.productionEligible !== false) {
        throw new Error('promotion requires a complete unpromoted textureGrad receipt or composite receipt');
    }
    const hashes = [
        options.nativeFieldIdentitySha256,
        options.parityArtifactSha256,
        options.parityDescriptorSha256,
        options.unpromotedReceiptSha256
    ];
    if (hashes.some((value) => !HASH_PATTERN.test(String(value)))) {
        throw new TypeError('promotion requires lowercase SHA-256 identities');
    }
    if (!Number.isSafeInteger(options.unpromotedReceiptByteLength)
        || options.unpromotedReceiptByteLength < 1) {
        throw new TypeError('promotion requires a positive receipt byte length');
    }
    const promoted = {
        ...structuredClone(receipt),
        productionEligible: true,
        promotion: {
            method: 'authenticated-unpromoted-field-plus-file-backed-spatial-parity-v1',
            nativeFieldIdentitySha256: options.nativeFieldIdentitySha256,
            parityArtifactSha256: options.parityArtifactSha256,
            parityDescriptorSha256: options.parityDescriptorSha256,
            schema: 'ai531-production-alpha-cutout-native-field-promotion-v1',
            status: 'passed',
            unpromotedReceiptByteLength: options.unpromotedReceiptByteLength,
            unpromotedReceiptSha256: options.unpromotedReceiptSha256
        },
        status: 'complete'
    };
    assertCleanProductionNativeFieldReceipt(promoted);
    return promoted;
}

export function parseNativeFieldPromotionArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        if (flag === '--input') options.inputPath = path.resolve(repoRoot, value);
        else if (flag === '--input-root') options.inputRoot = artifactChild(value, true);
        else if (flag === '--parity-root') options.parityRoot = artifactChild(value, true);
        else if (flag === '--output-root') options.outputRoot = artifactChild(value, false);
        else if (flag === '--profiles') options.profiles = value.split(',');
        else throw new TypeError(`Unknown option '${flag}'`);
    }
    for (const key of ['inputRoot', 'parityRoot', 'outputRoot']) {
        if (!options[key]) throw new TypeError(`--${key.replace(/[A-Z]/gu, (m) => `-${m.toLowerCase()}`)} is required`);
    }
    options.profiles = selectProductionStaticSunProfiles(options.profiles)
        .map((profile) => profile.id);
    return Object.freeze(options);
}

async function run(argv = process.argv.slice(2)) {
    const cli = parseNativeFieldPromotionArguments(argv);
    if (cli.help) {
        process.stdout.write('AI 531 native textureGrad field promotion\n');
        return;
    }
    await requireNewDirectory(cli.outputRoot);
    const options = {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        alphaParityRoot: cli.parityRoot,
        artifactRoot: cli.outputRoot,
        inputPath: cli.inputPath ?? PRODUCTION_STATIC_SUN_DEFAULTS.inputPath,
        nativeCutoutRoot: cli.inputRoot,
        profiles: cli.profiles
    };
    const authority = await prepareProductionAuthority(options);
    await mkdir(cli.outputRoot, {recursive: false});
    const promotedProfiles = [];
    for (const profile of selectProductionStaticSunProfiles(cli.profiles)) {
        const context = {
            allowUnpromotedNativeCutoutField: true,
            authority,
            options,
            profile
        };
        const nativeField = await loadProductionNativeCutoutField(context);
        if (nativeField.eligibility !== 'unpromoted') {
            throw new Error(`Native field '${profile.id}' is not unpromoted`);
        }
        const parity = await loadProductionAlphaParityArtifact(context);
        const identityPath = path.join(cli.parityRoot, profile.id, 'native_field_identity.json');
        const identityBytes = await readRegular(identityPath, 'native field identity');
        const identity = parseCanonical(identityBytes, 'native field identity');
        if (identity.schema !== 'ai531-native-mixed-foliage-field-parity-source-v2'
            || identity.method !== nativeField.receipt.method
            || identity.receiptSha256 !== nativeField.sha256
            || identity.outputProjectionSha256 !== nativeField.outputProjectionSha256) {
            throw new Error(`Native field identity '${profile.id}' differs from its field`);
        }
        const originalBytes = await readRegular(nativeField.path, 'unpromoted receipt');
        const promoted = buildPromotedNativeCutoutFieldReceipt({
            nativeFieldIdentitySha256: sha256(identityBytes),
            parityArtifactSha256: parity.sha256,
            parityDescriptorSha256: parity.artifact.descriptorSha256,
            receipt: nativeField.receipt,
            unpromotedReceiptByteLength: originalBytes.byteLength,
            unpromotedReceiptSha256: nativeField.sha256
        });
        const sourceProfileRoot = path.join(cli.inputRoot, profile.id);
        const outputProfileRoot = path.join(cli.outputRoot, profile.id);
        await mkdir(path.join(outputProfileRoot, 'tiles'), {recursive: true});
        for (const output of nativeField.receipt.outputs) {
            const source = resolveInside(sourceProfileRoot, output.path);
            const destination = resolveInside(outputProfileRoot, output.path);
            await link(source, destination).catch(async (error) => {
                if (!['EXDEV', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
                await copyFile(source, destination);
            });
        }
        await Promise.all([
            writeFile(
                path.join(outputProfileRoot, 'unpromoted_native_cutout_field_receipt.json'),
                originalBytes
            ),
            writeFile(
                path.join(outputProfileRoot, 'native_cutout_field_receipt.json'),
                canonicalJsonBytes(promoted)
            )
        ]);
        const verified = await loadProductionNativeCutoutField({
            authority,
            options: {...options, nativeCutoutRoot: cli.outputRoot},
            profile
        });
        if (verified.eligibility !== 'promoted') {
            throw new Error(`Promoted native field '${profile.id}' did not verify`);
        }
        promotedProfiles.push({
            lightingProfileId: profile.id,
            receiptSha256: verified.sha256
        });
    }
    process.stdout.write(canonicalJsonStringify({
        profiles: promotedProfiles,
        schema: 'ai531-production-alpha-cutout-native-field-promotion-run-v1',
        status: 'complete'
    }) + '\n');
}

async function readRegular(filePath, label) {
    const entry = await lstat(filePath);
    if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`${label} must be a regular non-symbolic file`);
    }
    return new Uint8Array(await readFile(filePath));
}

function parseCanonical(bytes, label) {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function artifactChild(value, mustExist) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('promotion paths must stay below illumination_531');
    }
    if (mustExist) return resolved;
    return resolved;
}

async function requireNewDirectory(directory) {
    try {
        await lstat(directory);
    } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
    }
    throw new Error('promotion output root already exists');
}

function resolveInside(root, relativePath) {
    const resolved = path.resolve(root, ...String(relativePath).split('/'));
    const relative = path.relative(path.resolve(root), resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('promotion file path escaped its profile root');
    }
    return resolved;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        process.stderr.write(`[NativeFieldPromotion] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
