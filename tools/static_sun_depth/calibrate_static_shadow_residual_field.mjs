#!/usr/bin/env node
// Applies authenticated same-session live-shadow residuals to production fields.

import {createHash} from 'node:crypto';
import {copyFile, link, lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
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

export const RESIDUAL_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v11';
export const RESIDUAL_FIELD_SESSION_SCHEMA =
    'ai531-production-static-shadow-residual-field-session-v11';
export const RESIDUAL_FIELD_METHOD =
    'authenticated-static-shadow-residual-live-depth-corrections-v11';
export const RESIDUAL_CALIBRATION_SCHEMA =
    'ai531-production-static-shadow-residual-calibration-v4';
export const RESIDUAL_CALIBRATION_METHOD =
    'apply-authenticated-same-session-nearer-live-depth-residuals-v4';
export const RESIDUAL_TILE_METHOD =
    'stable-field-plus-authenticated-nearer-live-depth-residuals-v4';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const screenshotRoot = path.join(repoRoot, 'tests/artifacts/screens/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);

export function applyMeasuredResidualCorrections(options) {
    const {bytes, corrections, height, tileCoordinates, width} = options ?? {};
    if (!(bytes instanceof Uint8Array)
        || bytes.byteLength !== width * height * 4
        || !Number.isSafeInteger(width) || width < 1
        || !Number.isSafeInteger(height) || height < 1
        || !Array.isArray(tileCoordinates) || tileCoordinates.length !== 2
        || !Array.isArray(corrections)) {
        throw new TypeError('residual field tile inputs are invalid');
    }
    const output = Uint8Array.from(bytes);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const [tileX, tileY] = tileCoordinates;
    const applied = [];
    for (const correction of corrections) {
        const [globalX, globalY] = correction.globalTexel;
        const localX = globalX - tileX * width;
        const localY = globalY - tileY * height;
        if (localX < 0 || localY < 0 || localX >= width || localY >= height) continue;
        const offset = (localY * width + localX) * 4;
        const formerDepthMeters = view.getFloat32(offset, true);
        const correctedDepthMeters = Math.fround(correction.liveDepthMeters);
        if (!Number.isFinite(formerDepthMeters)
            || !Number.isFinite(correctedDepthMeters)
            || correctedDepthMeters === 0
            || formerDepthMeters !== 0 && correctedDepthMeters >= formerDepthMeters) {
            throw new Error(
                `Residual correction ${globalX},${globalY} is not a nearer finite depth`
            );
        }
        view.setFloat32(offset, correctedDepthMeters, true);
        applied.push({...correction, correctedDepthMeters, formerDepthMeters});
    }
    return Object.freeze({applied, bytes: output});
}

export function getResidualDepthParitySamples(sample) {
    return Array.isArray(sample?.depthTapParity?.samples)
        ? sample.depthTapParity.samples
        : [];
}

async function run(argv = process.argv.slice(2)) {
    const cli = parseArguments(argv);
    if (cli.help) {
        process.stdout.write('AI 531 authenticated production residual calibration\n');
        return;
    }
    await requireNewDirectory(cli.outputRoot);
    await mkdir(cli.outputRoot, {recursive: false});
    const options = {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        inputPath: cli.inputPath,
        nativeCutoutRoot: cli.inputRoot,
        alphaParityRoot: cli.alphaParityRoot,
        profiles: cli.profiles
    };
    const authority = await prepareProductionAuthority(options);
    const reportPaths = [...new Set((await Promise.all(
        cli.localizationRoots.map(findLocalizationReports)
    )).flat())].sort(compareStrings);
    const producers = await producerInventory();
    const profiles = [];
    for (const profile of selectProductionStaticSunProfiles(cli.profiles)) {
        const sourceField = await loadProductionNativeCutoutField({
            allowUnpromotedNativeCutoutField: true,
            authority,
            options,
            profile
        });
        if (![
            'ai531-production-alpha-cutout-native-field-receipt-v9',
            'ai531-production-alpha-cutout-native-field-receipt-v10',
            'ai531-production-alpha-cutout-native-field-receipt-v11'
        ].includes(sourceField.receipt.schema)) {
            throw new Error(`Residual source '${profile.id}' must be a v9, v10, or v11 field`);
        }
        const diagnostic = await authenticateResidualReports({
            authority,
            productionRoot: cli.productionRoot,
            profile,
            reportPaths,
            sourceField
        });
        const [width, height] = sourceField.receipt.layout.layout.interiorPixels;
        const profileRoot = path.join(cli.outputRoot, profile.id);
        await mkdir(path.join(profileRoot, 'tiles'), {recursive: true});
        const outputs = [];
        const changes = [];
        let occupiedTexelCount = 0;
        let transparentTexelCount = 0;
        let outputByteLength = 0;
        for (const sourceOutput of sourceField.receipt.outputs) {
            const sourcePath = path.join(path.dirname(sourceField.path), sourceOutput.path);
            const sourceBytes = new Uint8Array(await readFile(sourcePath));
            if (sourceBytes.byteLength !== sourceOutput.byteLength
                || sha256(sourceBytes) !== sourceOutput.sha256) {
                throw new Error(`Residual source tile '${sourceOutput.tileId}' changed`);
            }
            const calibrated = applyMeasuredResidualCorrections({
                bytes: sourceBytes,
                corrections: diagnostic.corrections,
                height,
                tileCoordinates: sourceOutput.coordinates,
                width
            });
            changes.push(...calibrated.applied);
            const relativePath = `tiles/${sourceOutput.tileId}.cutout-first-hit.f32le`;
            const outputPath = path.join(profileRoot, relativePath);
            if (calibrated.applied.length === 0) await linkOrCopy(sourcePath, outputPath);
            else await writeFile(outputPath, calibrated.bytes);
            const measured = measureDepthField(calibrated.bytes);
            outputs.push({
                ...sourceOutput,
                maximumDepthMeters: measured.maximumDepthMeters,
                minimumDepthMeters: measured.minimumDepthMeters,
                nativeCapture: {
                    ...sourceOutput.nativeCapture,
                    method: RESIDUAL_TILE_METHOD,
                    residualCalibration: {
                        correctedTexelCount: calibrated.applied.length,
                        sourceByteLength: sourceOutput.byteLength,
                        sourceSha256: sourceOutput.sha256
                    }
                },
                occupiedTexelCount: measured.occupiedTexelCount,
                path: relativePath,
                sha256: sha256(calibrated.bytes),
                transparentTexelCount: measured.transparentTexelCount
            });
            occupiedTexelCount += measured.occupiedTexelCount;
            transparentTexelCount += measured.transparentTexelCount;
            outputByteLength += calibrated.bytes.byteLength;
        }
        changes.sort(compareCorrections);
        const expected = diagnostic.corrections.map((entry) => {
            const actual = changes.find((candidate) => (
                canonicalJsonStringify(candidate.globalTexel)
                    === canonicalJsonStringify(entry.globalTexel)
            ));
            return {...entry,
                correctedDepthMeters: actual?.correctedDepthMeters,
                formerDepthMeters: actual?.formerDepthMeters};
        }).sort(compareCorrections);
        if (canonicalJsonStringify(changes) !== canonicalJsonStringify(expected)) {
            throw new Error(`Residual corrections for '${profile.id}' were not applied once`);
        }
        const source = structuredClone(sourceField.receipt.source);
        source.residualCalibration = {
            correctedTexelCount: changes.length,
            correctedTexels: changes,
            localizationReports: diagnostic.reportProofs,
            method: RESIDUAL_CALIBRATION_METHOD,
            productionPackage: diagnostic.productionPackage,
            schema: RESIDUAL_CALIBRATION_SCHEMA,
            sourceField: sourceFieldProof(sourceField),
            sourceProductionReport: diagnostic.sourceProductionReport
        };
        const session = structuredClone(sourceField.receipt.session);
        session.begin.schema = RESIDUAL_FIELD_SESSION_SCHEMA;
        session.begin.method = RESIDUAL_FIELD_METHOD;
        session.end.schema = RESIDUAL_FIELD_SESSION_SCHEMA;
        session.end.method = RESIDUAL_FIELD_METHOD;
        session.end.stateRestoration =
            'authenticated-source-field-and-live-residual-evidence-disposed-v1';
        const receipt = {
            aggregate: {
                occupiedTexelCount,
                outputByteLength,
                outputCount: outputs.length,
                requiredOutputCount: outputs.length,
                transparentTexelCount
            },
            layout: sourceField.receipt.layout,
            method: RESIDUAL_FIELD_METHOD,
            outputs,
            performance: {
                eligibleForPromotion: false,
                reason: 'host-load-and-gpu-contention-declared-by-user'
            },
            producers,
            productionEligible: false,
            profile: sourceField.receipt.profile,
            schema: RESIDUAL_FIELD_SCHEMA,
            session,
            source,
            status: 'complete_unpromoted'
        };
        const receiptBytes = canonicalJsonBytes(receipt);
        await writeFile(path.join(profileRoot, 'native_cutout_field_receipt.json'), receiptBytes);
        profiles.push({
            correctedTexelCount: changes.length,
            lightingProfileId: profile.id,
            receiptSha256: sha256(receiptBytes)
        });
    }
    process.stdout.write(canonicalJsonStringify({
        profiles,
        schema: 'ai531-production-static-shadow-residual-calibration-run-v1',
        status: 'complete_unpromoted'
    }) + '\n');
}

async function authenticateResidualReports(context) {
    const matching = [];
    const sourceReports = new Map();
    for (const reportPath of context.reportPaths) {
        const reportBytes = new Uint8Array(await readFile(reportPath));
        const report = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(reportBytes));
        if (report.lightingProfileId !== context.profile.id) continue;
        if (report.schema !== 'ai531-production-mismatch-localization-report-v1'
            || report.status !== 'completed'
            || report.productionEligible !== false
            || report.promotable !== false
            || report.currentSource !== 'preactivation'
            || report.direction !== 'cache_brighter'
            || report.casterLocalization?.schema
                !== 'ai531-production-live-shadow-caster-id-pass-v2'
            || report.casterLocalization?.method
                !== 'cropped-live-shadow-camera-rgba8-caster-id-alpha-sampler-v2'
            || report.comparison?.metrics?.missingOccluderPixelCount < 1
            || report.activation?.sourceShadowTexelPhaseEvidence?.status !== 'verified') {
            throw new Error(`Residual report '${repositoryRelative(reportPath)}' is incompatible`);
        }
        await authenticateCaptureSet(reportPath, report.freshCaptureAuthentication);
        const sourceProof = report.sourceProductionReport;
        const sourcePath = path.resolve(repoRoot, ...sourceProof.path.split('/'));
        requireInside(screenshotRoot, sourcePath, false, 'source production report');
        let sourceRecord = sourceReports.get(sourceProof.sha256);
        if (!sourceRecord) {
            const bytes = new Uint8Array(await readFile(sourcePath));
            if (bytes.byteLength !== sourceProof.byteLength || sha256(bytes) !== sourceProof.sha256) {
                throw new Error('Residual source production report failed authentication');
            }
            const value = JSON.parse(new TextDecoder().decode(bytes));
            if (value.schema !== sourceProof.schema || value.status !== 'failed') {
                throw new Error('Residual source production report is incompatible');
            }
            sourceRecord = {proof: {
                byteLength: bytes.byteLength,
                path: repositoryRelative(sourcePath),
                sha256: sourceProof.sha256,
                schema: value.schema
            }, value};
            sourceReports.set(sourceProof.sha256, sourceRecord);
        }
        const sourceCase = sourceRecord.value.cases?.find(
            (entry) => entry.caseId === report.targetCaseId
        );
        if (sourceCase?.lightingProfileId !== context.profile.id
            || sourceCase.metrics?.missingOccluderPixelCount < 1) {
            throw new Error('Residual source case is missing or mismatched');
        }
        matching.push({report, reportBytes, reportPath, sourceRecord});
    }
    if (matching.length === 0) {
        throw new Error(`No residual reports target '${context.profile.id}'`);
    }
    if (sourceReports.size !== 1) {
        throw new Error(`Residual reports for '${context.profile.id}' use different source runs`);
    }
    const [{sourceRecord}] = matching;
    const group = sourceRecord.value.profileGroups?.find(
        (entry) => entry.lightingProfileId === context.profile.id
    );
    const packagePath = path.resolve(repoRoot, ...group.packagePath.split('/'));
    requireInside(context.productionRoot, packagePath, false, 'residual production package');
    const profileRoot = path.dirname(packagePath);
    const alphaPath = path.join(profileRoot, 'alpha_certification.json');
    const alphaBytes = new Uint8Array(await readFile(alphaPath));
    const alpha = JSON.parse(new TextDecoder().decode(alphaBytes));
    if (alpha.nativeCutoutField?.receiptSha256 !== context.sourceField.sha256
        || alpha.nativeCutoutField?.schema !== context.sourceField.receipt.schema
        || alpha.nativeCutoutField?.method !== context.sourceField.receipt.method) {
        throw new Error(`Residual package for '${context.profile.id}' uses a different field`);
    }
    const byTexel = new Map();
    const reportProofs = [];
    for (const {report, reportBytes, reportPath} of matching) {
        const classes = report.casterLocalization.aggregate?.classCounts ?? [];
        const classKeys = classes.map((entry) => entry.key).sort(compareStrings);
        const reportSha256 = sha256(reportBytes);
        reportProofs.push({
            byteLength: reportBytes.byteLength,
            captureSetSha256: report.freshCaptureAuthentication.captureSetSha256,
            casterClasses: classKeys.length ? classKeys : ['unresolved'],
            path: repositoryRelative(reportPath),
            sha256: reportSha256,
            targetCaseId: report.targetCaseId
        });
        for (const [sampleIndex, sample] of report.casterLocalization.samples.entries()) {
            for (const vogel of getResidualDepthParitySamples(sample)) {
                for (const [tapIndex, tap] of vogel.taps.entries()) {
                    if (!tap.cacheVisible || tap.currentVisible
                        || !Number.isFinite(tap.currentDepthMeters)
                        || tap.currentDepthMeters === 0) continue;
                    const key = canonicalJsonStringify(tap.cacheGlobalTexel);
                    const entry = byTexel.get(key) ?? {
                        casterClasses: new Set(),
                        globalTexel: [...tap.cacheGlobalTexel],
                        observations: [],
                        reportSha256s: new Set()
                    };
                    for (const classKey of classKeys) entry.casterClasses.add(classKey);
                    if (classKeys.length === 0) entry.casterClasses.add('unresolved');
                    entry.observations.push({
                        liveDepthMeters: tap.currentDepthMeters,
                        reportSha256,
                        sampleIndex,
                        tapIndex,
                        vogelSampleIndex: vogel.sampleIndex
                    });
                    entry.reportSha256s.add(reportSha256);
                    byTexel.set(key, entry);
                }
            }
        }
    }
    const corrections = [...byTexel.values()].map((entry) => {
        const depths = entry.observations.map((item) => item.liveDepthMeters);
        const liveDepthMeters = Math.fround(depths[0]);
        if (depths.some((value) => Math.fround(value) !== liveDepthMeters)) {
            throw new Error(`Residual texel ${entry.globalTexel} has inconsistent live depths`);
        }
        return {
            casterClasses: [...entry.casterClasses].sort(compareStrings),
            globalTexel: entry.globalTexel,
            liveDepthMeters,
            observationCount: entry.observations.length,
            observationSha256: sha256(canonicalJsonBytes(entry.observations)),
            reportSha256s: [...entry.reportSha256s].sort(compareStrings)
        };
    }).sort(compareCorrections);
    if (corrections.length === 0) {
        throw new Error(`Residual reports for '${context.profile.id}' resolve no depth corrections`);
    }
    reportProofs.sort((left, right) => compareStrings(left.path, right.path));
    return {
        corrections,
        productionPackage: {
            alphaCertification: {
                byteLength: alphaBytes.byteLength,
                path: repositoryRelative(alphaPath),
                sha256: sha256(alphaBytes)
            },
            packagePath: repositoryRelative(packagePath)
        },
        reportProofs,
        sourceProductionReport: sourceRecord.proof
    };
}

async function authenticateCaptureSet(reportPath, record) {
    if (record?.captureCount !== 5 || record?.method
            !== 'sha256-byte-length-rehash-five-one-case-pngs-v1') {
        throw new Error('Residual capture authentication is incomplete');
    }
    const entries = Object.entries(record.captures ?? {}).sort(
        ([left], [right]) => compareStrings(left, right)
    );
    if (entries.length !== 5) throw new Error('Residual capture inventory is incomplete');
    for (const [label, proof] of entries) {
        const absolute = path.resolve(repoRoot, ...proof.path.split('/'));
        requireInside(path.dirname(reportPath), absolute, false, `residual ${label} capture`);
        const bytes = new Uint8Array(await readFile(absolute));
        if (bytes.byteLength !== proof.byteLength || sha256(bytes) !== proof.sha256) {
            throw new Error(`Residual ${label} capture failed authentication`);
        }
    }
}

async function findLocalizationReports(root) {
    const reports = [];
    async function visit(directory) {
        for (const entry of await readdir(directory, {withFileTypes: true})) {
            const child = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(child);
            else if (entry.isFile() && entry.name === 'production_mismatch_localization_report.json') {
                reports.push(child);
            }
        }
    }
    await visit(root);
    return reports.sort(compareStrings);
}

function measureDepthField(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let occupiedTexelCount = 0;
    let minimumDepthMeters = Infinity;
    let maximumDepthMeters = -Infinity;
    for (let offset = 0; offset < bytes.byteLength; offset += 4) {
        const value = view.getFloat32(offset, true);
        if (!Number.isFinite(value)) throw new Error('Residual field contains non-finite depth');
        if (value === 0) continue;
        occupiedTexelCount += 1;
        minimumDepthMeters = Math.min(minimumDepthMeters, value);
        maximumDepthMeters = Math.max(maximumDepthMeters, value);
    }
    return {
        maximumDepthMeters: occupiedTexelCount ? maximumDepthMeters : null,
        minimumDepthMeters: occupiedTexelCount ? minimumDepthMeters : null,
        occupiedTexelCount,
        transparentTexelCount: bytes.byteLength / 4 - occupiedTexelCount
    };
}

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return {help: true};
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
        index += 1;
        if (flag === '--input') options.inputPath = path.resolve(repoRoot, value);
        else if (flag === '--input-root') options.inputRoot = artifactChild(value, true);
        else if (flag === '--alpha-parity-root') {
            options.alphaParityRoot = artifactChild(value, true);
        }
        else if (flag === '--localization-root') {
            options.localizationRoots ??= [];
            options.localizationRoots.push(screenshotChild(value, true));
        } else if (flag === '--production-root') {
            options.productionRoot = artifactChild(value, true);
        } else if (flag === '--output-root') options.outputRoot = artifactChild(value, false);
        else if (flag === '--profiles') options.profiles = value.split(',');
        else throw new TypeError(`Unknown option '${flag}'`);
    }
    for (const key of [
        'inputPath', 'inputRoot', 'alphaParityRoot', 'productionRoot',
        'outputRoot', 'profiles'
    ]) if (!options[key]) throw new TypeError(`Residual calibration ${key} is required`);
    if (!Array.isArray(options.localizationRoots)
        || options.localizationRoots.length < 1) {
        throw new TypeError('Residual calibration localizationRoots is required');
    }
    options.profiles = selectProductionStaticSunProfiles(options.profiles)
        .map((profile) => profile.id);
    return options;
}

async function producerInventory() {
    const paths = [
        runnerPath,
        path.join(here, 'browser/ProductionMismatchCasterIdPass.js'),
        path.join(here, 'localize_production_mismatch.mjs'),
        path.join(here, 'production.mjs'),
        path.join(here, 'src/ProductionArtifact.mjs'),
        path.join(here, 'src/ProductionOrchestrator.mjs'),
        path.join(here, 'validate_production.mjs')
    ];
    return Promise.all(paths.sort(compareStrings).map(async (filePath) => {
        const bytes = new Uint8Array(await readFile(filePath));
        return {
            byteLength: bytes.byteLength,
            path: repositoryRelative(filePath),
            sha256: sha256(bytes)
        };
    }));
}

function sourceFieldProof(field) {
    return {
        method: field.receipt.method,
        outputProjectionSha256: field.outputProjectionSha256,
        receiptSha256: field.sha256,
        schema: field.receipt.schema
    };
}

function compareCorrections(left, right) {
    return left.globalTexel[1] - right.globalTexel[1]
        || left.globalTexel[0] - right.globalTexel[0];
}

async function linkOrCopy(source, destination) {
    try {
        await link(source, destination);
    } catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
        await copyFile(source, destination);
    }
}

function artifactChild(value) {
    const resolved = path.resolve(repoRoot, value);
    requireInside(artifactRoot, resolved, false, 'illumination_531 artifact');
    return resolved;
}

function screenshotChild(value) {
    const resolved = path.resolve(repoRoot, value);
    requireInside(screenshotRoot, resolved, false, 'illumination_531 screenshot artifact');
    return resolved;
}

function requireInside(root, candidate, allowRoot, label) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if ((!allowRoot && !relative) || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${label} path escaped its authority root`);
    }
}

async function requireNewDirectory(directory) {
    try {
        await lstat(directory);
        throw new Error(`Residual output root already exists: ${directory}`);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
    await mkdir(path.dirname(directory), {recursive: true});
}

function repositoryRelative(filePath) {
    return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === runnerPath) {
    run().catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
