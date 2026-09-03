#!/usr/bin/env node
// Composes authenticated direct and textureGrad foliage first-hit fields.

import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {PRODUCTION_STATIC_SUN_DEFAULTS} from './production.mjs';
import {
    loadProductionNativeCutoutField,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

export const COMPOSED_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v6';
export const COMPOSED_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-composed-field-session-v6';
export const COMPOSED_FIELD_METHOD =
    'authenticated-direct-depth24-texture-grad-hole-fill-v6';
export const REBASED_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v9';
export const REBASED_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-rebased-field-session-v9';
export const REBASED_FIELD_METHOD =
    'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9';
const COMPOSITION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-composition-v2';
const REBASED_COMPOSITION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-composition-v3';
const REBASED_COMPOSITION_METHOD =
    'authenticated-current-direct-plus-candidate-equivalent-historical-texture-grad-hole-fill-v3';
const MIGRATION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-migration-v1';
const MIGRATION_METHOD =
    'current-and-historical-direct-byte-identity-plus-candidate-source-equivalence-v1';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);

export function composeNativeDepthFields(direct, textureGrad) {
    if (!(direct instanceof Float32Array) || !(textureGrad instanceof Float32Array)) {
        throw new TypeError('native depth fields must be Float32Array values');
    }
    if (direct.length !== textureGrad.length) {
        throw new RangeError('native depth fields must have equal lengths');
    }
    const output = new Float32Array(direct.length);
    for (let index = 0; index < output.length; index += 1) {
        const left = direct[index];
        const right = textureGrad[index];
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
            throw new RangeError('native depth fields must contain finite values');
        }
        // Direct Depth24 already has exact measured first-hit parity. Preserve it
        // whenever present and use native textureGrad only to fill silhouette
        // holes that the direct capture left empty.
        output[index] = left === 0 ? right : left;
    }
    return output;
}

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return {help: true};
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
        index += 1;
        if (flag === '--direct-root') options.directRoot = artifactChild(value, true);
        else if (flag === '--texture-grad-root') options.textureGradRoot = artifactChild(value, true);
        else if (flag === '--historical-direct-root') {
            options.historicalDirectRoot = artifactChild(value, true);
        } else if (flag === '--current-texture-grad-root') {
            options.currentTextureGradRoot = artifactChild(value, true);
        }
        else if (flag === '--output-root') options.outputRoot = artifactChild(value, false);
        else if (flag === '--input') options.inputPath = path.resolve(repoRoot, value);
        else if (flag === '--historical-input') {
            options.historicalInputPath = path.resolve(repoRoot, value);
        }
        else if (flag === '--profiles') options.profiles = value.split(',');
        else throw new TypeError(`Unknown option '${flag}'`);
    }
    for (const key of ['directRoot', 'textureGradRoot', 'outputRoot']) {
        if (!options[key]) throw new TypeError(`${key} is required`);
    }
    const migrationKeys = [
        'currentTextureGradRoot', 'historicalDirectRoot', 'historicalInputPath'
    ];
    const migrationCount = migrationKeys.filter((key) => options[key]).length;
    if (migrationCount !== 0 && migrationCount !== migrationKeys.length) {
        throw new TypeError(
            'historical-input, historical-direct-root, and current-texture-grad-root '
            + 'must be supplied together'
        );
    }
    options.profiles = selectProductionStaticSunProfiles(options.profiles)
        .map((profile) => profile.id);
    return options;
}

async function run(argv = process.argv.slice(2)) {
    const cli = parseArguments(argv);
    if (cli.help) {
        process.stdout.write('AI 531 authenticated native-field composition\n');
        return;
    }
    if (os.endianness() !== 'LE') throw new Error('native field composition requires little endian');
    await requireNewDirectory(cli.outputRoot);
    await mkdir(cli.outputRoot, {recursive: false});
    const options = {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        ...(cli.inputPath ? {inputPath: cli.inputPath} : {}),
        profiles: cli.profiles
    };
    const authority = await prepareProductionAuthority(options);
    const historicalOptions = cli.historicalInputPath ? {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        inputPath: cli.historicalInputPath,
        profiles: cli.profiles
    } : null;
    const historicalAuthority = historicalOptions
        ? await prepareProductionAuthority(historicalOptions)
        : null;
    const producers = await producerInventory();
    const profiles = [];
    for (const profile of selectProductionStaticSunProfiles(cli.profiles)) {
        const direct = await loadProductionNativeCutoutField({
            authority,
            options: {...options, nativeCutoutRoot: cli.directRoot},
            profile
        });
        const textureGrad = await loadProductionNativeCutoutField({
            allowUnpromotedNativeCutoutField: true,
            authority: historicalAuthority ?? authority,
            options: {
                ...(historicalOptions ?? options),
                nativeCutoutRoot: cli.textureGradRoot
            },
            profile
        });
        const migration = historicalAuthority
            ? await authenticateHistoricalHoleMigration({
                authority,
                currentDirect: direct,
                currentTextureGrad: await loadProductionNativeCutoutField({
                    allowUnpromotedNativeCutoutField: true,
                    authority,
                    options: {
                        ...options,
                        nativeCutoutRoot: cli.currentTextureGradRoot
                    },
                    profile
                }),
                historicalAuthority,
                historicalDirect: await loadProductionNativeCutoutField({
                    authority: historicalAuthority,
                    options: {
                        ...historicalOptions,
                        nativeCutoutRoot: cli.historicalDirectRoot
                    },
                    profile
                }),
                historicalTextureGrad: textureGrad,
                profile
            })
            : null;
        if (direct.receipt.schema !== 'ai531-production-alpha-cutout-native-field-receipt-v2'
            || textureGrad.receipt.schema
                !== 'ai531-production-alpha-cutout-native-field-receipt-v3') {
            throw new Error(`Composite inputs for '${profile.id}' have unsupported methods`);
        }
        const profileRoot = path.join(cli.outputRoot, profile.id);
        await mkdir(path.join(profileRoot, 'tiles'), {recursive: true});
        const outputs = [];
        let occupiedTexelCount = 0;
        let transparentTexelCount = 0;
        let outputByteLength = 0;
        for (let index = 0; index < direct.receipt.outputs.length; index += 1) {
            const directOutput = direct.receipt.outputs[index];
            const textureOutput = textureGrad.receipt.outputs[index];
            if (directOutput.tileId !== textureOutput.tileId
                || directOutput.sha256 === textureOutput.sha256
                    && direct.sha256 === textureGrad.sha256) {
                throw new Error(`Composite tile '${profile.id}:${index}' has invalid sources`);
            }
            const [directBytes, textureBytes] = await Promise.all([
                readFile(path.join(path.dirname(direct.path), directOutput.path)),
                readFile(path.join(path.dirname(textureGrad.path), textureOutput.path))
            ]);
            const composed = composeNativeDepthFields(
                decodeFloat32(directBytes),
                decodeFloat32(textureBytes)
            );
            const bytes = new Uint8Array(composed.buffer);
            let occupied = 0;
            let minimum = Infinity;
            let maximum = -Infinity;
            for (const value of composed) {
                if (value === 0) continue;
                occupied += 1;
                minimum = Math.min(minimum, value);
                maximum = Math.max(maximum, value);
            }
            const transparent = composed.length - occupied;
            const relativePath = `tiles/${directOutput.tileId}.cutout-first-hit.f32le`;
            await writeFile(path.join(profileRoot, relativePath), bytes);
            outputs.push({
                byteLength: bytes.byteLength,
                coordinates: directOutput.coordinates,
                maximumDepthMeters: occupied ? maximum : null,
                minimumDepthMeters: occupied ? minimum : null,
                nativeCapture: {
                    direct: sourceTileProof(directOutput),
                    method: migration
                        ? 'stable-direct-first-hit-plus-historical-texture-grad-hole-restoration-v3'
                        : 'direct-depth24-first-hit-plus-texture-grad-hole-fill-v2',
                    textureGrad: sourceTileProof(textureOutput)
                },
                occupiedTexelCount: occupied,
                path: relativePath,
                rowOrigin: 'min-light-y-v1',
                sha256: sha256(bytes),
                tileId: directOutput.tileId,
                tileIndex: index,
                transparentTexelCount: transparent,
                xAxis: 'increasing-cache-light-right-v1'
            });
            occupiedTexelCount += occupied;
            transparentTexelCount += transparent;
            outputByteLength += bytes.byteLength;
        }
        const source = structuredClone(
            migration ? direct.receipt.source : textureGrad.receipt.source
        );
        delete source.candidateAuthority;
        delete source.nativeResultAuthority;
        source.composition = {
            direct: sourceFieldProof(direct),
            method: migration ? REBASED_COMPOSITION_METHOD
                : 'authenticated-source-fields-plus-direct-preferred-hole-fill-v2',
            ...(migration ? {migration} : {}),
            schema: migration ? REBASED_COMPOSITION_SCHEMA : COMPOSITION_SCHEMA,
            textureGrad: sourceFieldProof(textureGrad)
        };
        const session = structuredClone(
            migration ? direct.receipt.session : textureGrad.receipt.session
        );
        session.begin.schema = migration
            ? REBASED_FIELD_SESSION_SCHEMA : COMPOSED_FIELD_SESSION_SCHEMA;
        session.begin.method = migration ? REBASED_FIELD_METHOD : COMPOSED_FIELD_METHOD;
        delete session.begin.liveSourceToCacheLightAxisTransform;
        session.end.schema = migration
            ? REBASED_FIELD_SESSION_SCHEMA : COMPOSED_FIELD_SESSION_SCHEMA;
        session.end.method = migration ? REBASED_FIELD_METHOD : COMPOSED_FIELD_METHOD;
        session.end.stateRestoration = 'authenticated-source-fields-disposed-v1';
        const receipt = {
            aggregate: {
                occupiedTexelCount,
                outputByteLength,
                outputCount: outputs.length,
                requiredOutputCount: outputs.length,
                transparentTexelCount
            },
            layout: textureGrad.receipt.layout,
            method: migration ? REBASED_FIELD_METHOD : COMPOSED_FIELD_METHOD,
            outputs,
            performance: {
                eligibleForPromotion: false,
                reason: 'host-load-and-gpu-contention-declared-by-user'
            },
            producers,
            productionEligible: false,
            profile: textureGrad.receipt.profile,
            schema: migration ? REBASED_FIELD_SCHEMA : COMPOSED_FIELD_SCHEMA,
            session,
            source,
            status: 'complete_unpromoted'
        };
        const receiptBytes = canonicalJsonBytes(receipt);
        await writeFile(path.join(profileRoot, 'native_cutout_field_receipt.json'), receiptBytes);
        profiles.push({lightingProfileId: profile.id, receiptSha256: sha256(receiptBytes)});
    }
    process.stdout.write(canonicalJsonStringify({
        profiles,
        schema: historicalAuthority
            ? 'ai531-production-alpha-cutout-native-field-composition-run-v3'
            : 'ai531-production-alpha-cutout-native-field-composition-run-v2',
        status: 'complete'
    }) + '\n');
}

async function authenticateHistoricalHoleMigration(context) {
    const {
        authority, currentDirect, currentTextureGrad, historicalAuthority,
        historicalDirect, historicalTextureGrad, profile
    } = context;
    if (historicalAuthority.packageRawSha256 === authority.packageRawSha256) {
        throw new Error(`Historical source for '${profile.id}' is not distinct`);
    }
    if (currentDirect.receipt.schema
            !== 'ai531-production-alpha-cutout-native-field-receipt-v2'
        || historicalDirect.receipt.schema
            !== 'ai531-production-alpha-cutout-native-field-receipt-v2'
        || currentTextureGrad.receipt.schema
            !== 'ai531-production-alpha-cutout-native-field-receipt-v3'
        || historicalTextureGrad.receipt.schema
            !== 'ai531-production-alpha-cutout-native-field-receipt-v3') {
        throw new Error(`Migration inputs for '${profile.id}' have unsupported methods`);
    }
    if (canonicalJsonStringify(currentDirect.receipt.layout)
            !== canonicalJsonStringify(historicalDirect.receipt.layout)
        || canonicalJsonStringify(currentTextureGrad.receipt.layout)
            !== canonicalJsonStringify(historicalTextureGrad.receipt.layout)
        || currentDirect.outputProjectionSha256
            !== historicalDirect.outputProjectionSha256) {
        throw new Error(
            `Historical migration for '${profile.id}' does not preserve the direct field and layout`
        );
    }
    const currentCandidateIdentity = candidateSourceIdentity(currentTextureGrad.receipt);
    const historicalCandidateIdentity = candidateSourceIdentity(
        historicalTextureGrad.receipt
    );
    if (canonicalJsonStringify(currentCandidateIdentity)
            !== canonicalJsonStringify(historicalCandidateIdentity)) {
        throw new Error(
            `Historical migration for '${profile.id}' changed candidate geometry or sampling`
        );
    }
    return {
        candidateSourceIdentity: currentCandidateIdentity,
        current: {
            bsib: {
                byteLength: authority.packageSnapshot.byteLength,
                sha256: authority.packageRawSha256
            },
            direct: sourceFieldProof(currentDirect),
            textureGrad: sourceFieldProof(currentTextureGrad)
        },
        historical: {
            bsib: {
                byteLength: historicalAuthority.packageSnapshot.byteLength,
                sha256: historicalAuthority.packageRawSha256
            },
            direct: sourceFieldProof(historicalDirect),
            textureGrad: sourceFieldProof(historicalTextureGrad)
        },
        method: MIGRATION_METHOD,
        schema: MIGRATION_SCHEMA
    };
}

function candidateSourceIdentity(receipt) {
    const candidate = receipt.source?.candidateAuthority;
    const tileQueries = receipt.outputs.map((output) => ({
        candidateCount: output.nativeCapture?.candidateAuthority?.candidateCount,
        chunkCount: output.nativeCapture?.candidateAuthority?.chunkCount,
        queryProjectionSha256:
            output.nativeCapture?.candidateAuthority?.queryProjectionSha256,
        tileId: output.tileId
    }));
    return {
        aggregateCandidateBytesSha256: candidate?.aggregateCandidateBytesSha256,
        candidateCount: candidate?.candidateCount,
        samplerSha256: sha256(canonicalJsonBytes({
            sampling: receipt.outputs[0]?.nativeCapture?.sampling,
            texture: receipt.session?.begin?.texture
        })),
        sourceTriangleAuthority: {
            byteLength: candidate?.sourceTriangleAuthority?.byteLength,
            sha256: candidate?.sourceTriangleAuthority?.sha256
        },
        tileQueriesSha256: sha256(canonicalJsonBytes(tileQueries))
    };
}

function decodeFloat32(bytes) {
    if (bytes.byteLength % 4 !== 0) throw new Error('native field byte length is invalid');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Float32Array.from({length: bytes.byteLength / 4}, (_, index) => (
        view.getFloat32(index * 4, true)
    ));
}

function sourceTileProof(output) {
    return {
        byteLength: output.byteLength,
        occupiedTexelCount: output.occupiedTexelCount,
        sha256: output.sha256
    };
}

function sourceFieldProof(field) {
    return {
        method: field.receipt.method,
        outputProjectionSha256: field.outputProjectionSha256,
        receiptSha256: field.sha256,
        schema: field.receipt.schema
    };
}

async function producerInventory() {
    const paths = [
        runnerPath,
        path.join(here, 'production.mjs'),
        path.join(here, 'src/ProductionArtifact.mjs'),
        path.join(here, 'src/ProductionOrchestrator.mjs'),
        path.join(here, 'src/ProductionAlphaCutoutParity.mjs')
    ];
    return Promise.all(paths.sort().map(async (filePath) => {
        const bytes = await readFile(filePath);
        return {
            byteLength: bytes.byteLength,
            path: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
            sha256: sha256(bytes)
        };
    }));
}

function artifactChild(value, mustExist) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('native field paths must stay below illumination_531');
    }
    if (mustExist && !path.isAbsolute(resolved)) throw new Error('invalid source root');
    return resolved;
}

async function requireNewDirectory(directory) {
    try {
        await lstat(directory);
        throw new Error(`Output root already exists: ${directory}`);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === runnerPath) {
    run().catch((error) => {
        process.stderr.write(`${error.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
