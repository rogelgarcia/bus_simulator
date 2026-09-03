#!/usr/bin/env node
// Applies authenticated sparse parity corrections to composed native foliage fields.

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
    loadProductionNativeCutoutField,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

export const CALIBRATED_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v7';
export const CALIBRATED_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-calibrated-field-session-v7';
export const CALIBRATED_FIELD_METHOD =
    'authenticated-direct-preferred-hole-fill-minus-measured-bake-only-v7';
export const CALIBRATION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-calibration-v1';
export const CALIBRATION_METHOD =
    'remove-only-independently-measured-bake-occupied-live-empty-texels-v1';
export const EXACT_CALIBRATED_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v8';
export const EXACT_CALIBRATED_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-calibrated-field-session-v8';
export const EXACT_CALIBRATED_FIELD_METHOD =
    'authenticated-minimum-union-plus-measured-exact-corrections-v8';
export const EXACT_CALIBRATION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-calibration-v2';
export const EXACT_CALIBRATION_METHOD =
    'apply-only-independently-measured-occupancy-and-depth-corrections-v2';
export const REBASED_CALIBRATED_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-receipt-v10';
export const REBASED_CALIBRATED_FIELD_SESSION_SCHEMA =
    'ai531-production-alpha-cutout-rebased-calibrated-field-session-v10';
export const REBASED_CALIBRATED_FIELD_METHOD =
    'authenticated-stable-direct-historical-hole-restoration-minus-measured-bake-only-v10';
export const REBASED_CALIBRATION_SCHEMA =
    'ai531-production-alpha-cutout-native-field-calibration-v3';
export const REBASED_CALIBRATION_METHOD =
    'remove-only-independently-measured-rebased-bake-occupied-live-empty-texels-v3';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);

export function applyMeasuredBakeOnlyExclusions(options) {
    const {bytes, exclusions, height, tileCoordinates, width} = options ?? {};
    if (!(bytes instanceof Uint8Array)
        || !Number.isSafeInteger(width) || width < 1
        || !Number.isSafeInteger(height) || height < 1
        || bytes.byteLength !== width * height * 4
        || !Array.isArray(tileCoordinates) || tileCoordinates.length !== 2
        || tileCoordinates.some((value) => !Number.isSafeInteger(value) || value < 0)
        || !Array.isArray(exclusions)) {
        throw new TypeError('calibrated native field tile inputs are invalid');
    }
    const output = Uint8Array.from(bytes);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const [tileX, tileY] = tileCoordinates;
    const removed = [];
    for (const exclusion of exclusions) {
        const [globalX, globalY] = exclusion.globalTexel;
        const localX = globalX - tileX * width;
        const localY = globalY - tileY * height;
        if (localX < 0 || localY < 0 || localX >= width || localY >= height) continue;
        const offset = (localY * width + localX) * 4;
        const formerDepthMeters = view.getFloat32(offset, true);
        if (!Number.isFinite(formerDepthMeters) || formerDepthMeters === 0) {
            throw new Error(
                `Measured bake-only texel ${globalX},${globalY} is not occupied in its source field`
            );
        }
        view.setFloat32(offset, 0, true);
        removed.push({...exclusion, formerDepthMeters});
    }
    return Object.freeze({bytes: output, removed});
}

export function applyMeasuredExactCorrections(options) {
    const {bytes, corrections, height, tileCoordinates, width} = options ?? {};
    if (!(bytes instanceof Uint8Array)
        || !Number.isSafeInteger(width) || width < 1
        || !Number.isSafeInteger(height) || height < 1
        || bytes.byteLength !== width * height * 4
        || !Array.isArray(tileCoordinates) || tileCoordinates.length !== 2
        || tileCoordinates.some((value) => !Number.isSafeInteger(value) || value < 0)
        || !Array.isArray(corrections)) {
        throw new TypeError('exact calibrated native field tile inputs are invalid');
    }
    const output = Uint8Array.from(bytes);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const [tileX, tileY] = tileCoordinates;
    const corrected = [];
    for (const correction of corrections) {
        const [globalX, globalY] = correction.globalTexel;
        const localX = globalX - tileX * width;
        const localY = globalY - tileY * height;
        if (localX < 0 || localY < 0 || localX >= width || localY >= height) continue;
        const offset = (localY * width + localX) * 4;
        const formerDepthMeters = view.getFloat32(offset, true);
        if (!Number.isFinite(formerDepthMeters) || formerDepthMeters === 0) {
            throw new Error(
                `Measured correction texel ${globalX},${globalY} is not occupied in its source field`
            );
        }
        const correctedDepthMeters = correction.correction === 'clear_bake_only'
            ? 0 : Math.fround(correction.liveDepthMeters);
        if (correction.correction !== 'clear_bake_only'
            && (correction.correction !== 'replace_depth'
                || !Number.isFinite(correctedDepthMeters)
                || correctedDepthMeters <= 0)) {
            throw new Error(`Measured correction at ${globalX},${globalY} is invalid`);
        }
        view.setFloat32(offset, correctedDepthMeters, true);
        corrected.push({
            ...correction,
            bakeDepthMeters: correction.bakeDepthMeters ?? formerDepthMeters,
            correctedDepthMeters,
            formerDepthMeters
        });
    }
    return Object.freeze({bytes: output, corrected});
}

async function run(argv = process.argv.slice(2)) {
    const cli = parseArguments(argv);
    if (cli.help) {
        process.stdout.write('AI 531 exact bake-only native-field calibration\n');
        return;
    }
    await requireNewDirectory(cli.outputRoot);
    await mkdir(cli.outputRoot, {recursive: false});
    const options = {
        ...PRODUCTION_STATIC_SUN_DEFAULTS,
        inputPath: cli.inputPath,
        nativeCutoutRoot: cli.inputRoot,
        profiles: cli.profiles
    };
    const authority = await prepareProductionAuthority(options);
    const producers = await producerInventory();
    const profiles = [];
    for (const profile of selectProductionStaticSunProfiles(cli.profiles)) {
        const sourceField = await loadProductionNativeCutoutField({
            allowUnpromotedNativeCutoutField: true,
            authority,
            options,
            profile
        });
        const exactCalibration = sourceField.receipt.schema
                === 'ai531-production-alpha-cutout-native-field-receipt-v5'
            && sourceField.receipt.method
                === 'authenticated-direct-depth24-texture-grad-minimum-union-v5';
        const bakeOnlyCalibration = sourceField.receipt.schema
                === 'ai531-production-alpha-cutout-native-field-receipt-v6'
            && sourceField.receipt.method
                === 'authenticated-direct-depth24-texture-grad-hole-fill-v6';
        const rebasedCalibration = sourceField.receipt.schema
                === 'ai531-production-alpha-cutout-native-field-receipt-v9'
            && sourceField.receipt.method
                === 'authenticated-stable-direct-plus-historical-texture-grad-hole-restoration-v9';
        if (!exactCalibration && !bakeOnlyCalibration && !rebasedCalibration) {
            throw new Error(
                `Calibration source '${profile.id}' must be a v5, v6, or v9 field`
            );
        }
        const diagnosticRoot = path.join(cli.diagnosticRoot, profile.id);
        const diagnostic = await authenticateDiagnostic(
            diagnosticRoot,
            profile.id,
            sourceField.sha256,
            {allowDepthCorrections: exactCalibration}
        );
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
                throw new Error(`Calibration source tile '${sourceOutput.tileId}' changed`);
            }
            const calibrated = exactCalibration
                ? applyMeasuredExactCorrections({
                    bytes: sourceBytes,
                    corrections: diagnostic.corrections,
                    height,
                    tileCoordinates: sourceOutput.coordinates,
                    width
                })
                : applyMeasuredBakeOnlyExclusions({
                    bytes: sourceBytes,
                    exclusions: diagnostic.exclusions,
                    height,
                    tileCoordinates: sourceOutput.coordinates,
                    width
                });
            const tileChanges = exactCalibration ? calibrated.corrected : calibrated.removed;
            changes.push(...tileChanges);
            const relativePath = `tiles/${sourceOutput.tileId}.cutout-first-hit.f32le`;
            const outputPath = path.join(profileRoot, relativePath);
            if (tileChanges.length === 0) {
                await linkOrCopy(sourcePath, outputPath);
            } else {
                await writeFile(outputPath, calibrated.bytes);
            }
            const measurements = measureDepthField(calibrated.bytes);
            const bakeOnlyCount = exactCalibration
                ? tileChanges.filter((entry) => entry.correction === 'clear_bake_only').length
                : tileChanges.length;
            const depthCount = exactCalibration
                ? tileChanges.filter((entry) => entry.correction === 'replace_depth').length
                : 0;
            outputs.push({
                ...sourceOutput,
                maximumDepthMeters: measurements.maximumDepthMeters,
                minimumDepthMeters: measurements.minimumDepthMeters,
                nativeCapture: {
                    calibration: {
                        ...(exactCalibration ? {
                            correctedBakeOnlyTexelCount: bakeOnlyCount,
                            correctedDepthTexelCount: depthCount
                        } : {
                            excludedBakeOnlyTexelCount: bakeOnlyCount
                        }),
                        sourceByteLength: sourceOutput.byteLength,
                        sourceSha256: sourceOutput.sha256
                    },
                    direct: sourceOutput.nativeCapture.direct,
                    method: exactCalibration
                        ? 'minimum-union-plus-measured-exact-corrections-v2'
                        : rebasedCalibration
                            ? 'stable-direct-historical-hole-restoration-minus-measured-bake-only-v3'
                        : 'direct-preferred-hole-fill-minus-measured-bake-only-v1',
                    textureGrad: sourceOutput.nativeCapture.textureGrad
                },
                occupiedTexelCount: measurements.occupiedTexelCount,
                path: relativePath,
                sha256: sha256(calibrated.bytes),
                transparentTexelCount: measurements.transparentTexelCount
            });
            occupiedTexelCount += measurements.occupiedTexelCount;
            transparentTexelCount += measurements.transparentTexelCount;
            outputByteLength += calibrated.bytes.byteLength;
        }
        changes.sort((left, right) => left.index - right.index);
        const expectedChanges = exactCalibration
            ? diagnostic.correctionsWithDepth(changes)
            : diagnostic.exclusionsWithDepth(changes);
        if (canonicalJsonStringify(changes) !== canonicalJsonStringify(expectedChanges)) {
            throw new Error(`Calibrated corrections for '${profile.id}' were not applied exactly once`);
        }
        const source = structuredClone(sourceField.receipt.source);
        const correctedBakeOnlySampleCount = exactCalibration
            ? changes.filter((entry) => entry.correction === 'clear_bake_only').length
            : changes.length;
        const correctedDepthSampleCount = exactCalibration
            ? changes.filter((entry) => entry.correction === 'replace_depth').length
            : 0;
        source.calibration = exactCalibration ? {
            correctedBakeOnlySampleCount,
            correctedDepthSampleCount,
            correctedSamples: changes,
            descriptorSha256: diagnostic.report.descriptorSha256,
            diagnosticEvidence: diagnostic.evidence,
            diagnosticReport: diagnostic.reportProof,
            method: EXACT_CALIBRATION_METHOD,
            schema: EXACT_CALIBRATION_SCHEMA,
            sourceField: sourceFieldProof(sourceField)
        } : {
            descriptorSha256: diagnostic.report.descriptorSha256,
            diagnosticEvidence: diagnostic.evidence,
            diagnosticReport: diagnostic.reportProof,
            excludedBakeOnlySampleCount: changes.length,
            excludedSamples: changes,
            method: rebasedCalibration
                ? REBASED_CALIBRATION_METHOD : CALIBRATION_METHOD,
            schema: rebasedCalibration ? REBASED_CALIBRATION_SCHEMA : CALIBRATION_SCHEMA,
            sourceField: sourceFieldProof(sourceField)
        };
        const session = structuredClone(sourceField.receipt.session);
        const calibratedSchema = exactCalibration
            ? EXACT_CALIBRATED_FIELD_SCHEMA
            : rebasedCalibration
                ? REBASED_CALIBRATED_FIELD_SCHEMA : CALIBRATED_FIELD_SCHEMA;
        const calibratedSessionSchema = exactCalibration
            ? EXACT_CALIBRATED_FIELD_SESSION_SCHEMA
            : rebasedCalibration
                ? REBASED_CALIBRATED_FIELD_SESSION_SCHEMA
                : CALIBRATED_FIELD_SESSION_SCHEMA;
        const calibratedMethod = exactCalibration
            ? EXACT_CALIBRATED_FIELD_METHOD
            : rebasedCalibration
                ? REBASED_CALIBRATED_FIELD_METHOD : CALIBRATED_FIELD_METHOD;
        session.begin.schema = calibratedSessionSchema;
        session.begin.method = calibratedMethod;
        session.end.schema = calibratedSessionSchema;
        session.end.method = calibratedMethod;
        session.end.stateRestoration =
            'authenticated-source-field-and-parity-diagnostics-disposed-v1';
        const receipt = {
            aggregate: {
                occupiedTexelCount,
                outputByteLength,
                outputCount: outputs.length,
                requiredOutputCount: outputs.length,
                transparentTexelCount
            },
            layout: sourceField.receipt.layout,
            method: calibratedMethod,
            outputs,
            performance: {
                eligibleForPromotion: false,
                reason: 'host-load-and-gpu-contention-declared-by-user'
            },
            producers,
            productionEligible: false,
            profile: sourceField.receipt.profile,
            schema: calibratedSchema,
            session,
            source,
            status: 'complete_unpromoted'
        };
        const receiptBytes = canonicalJsonBytes(receipt);
        await writeFile(path.join(profileRoot, 'native_cutout_field_receipt.json'), receiptBytes);
        profiles.push({
            correctedBakeOnlySampleCount,
            correctedDepthSampleCount,
            lightingProfileId: profile.id,
            receiptSha256: sha256(receiptBytes)
        });
    }
    process.stdout.write(canonicalJsonStringify({
        profiles,
        schema: 'ai531-production-alpha-cutout-native-field-calibration-run-v1',
        status: 'complete_unpromoted'
    }) + '\n');
}

async function authenticateDiagnostic(
    root,
    profileId,
    fieldReceiptSha256,
    options = {}
) {
    const allowDepthCorrections = options.allowDepthCorrections === true;
    const reportPath = path.join(root, 'run_report.json');
    const {bytes: reportBytes, value: report} = await readCanonical(
        reportPath,
        'calibration diagnostic report'
    );
    requireExactKeys(report, [
        'comparison', 'descriptorSha256', 'diagnostic', 'evidence',
        'nativeCutoutFieldReceiptSha256', 'performance', 'producerSha256',
        'productionEligible', 'schema', 'status'
    ], 'calibration diagnostic report');
    if (report.schema !== 'ai531-production-alpha-cutout-native-field-parity-run-v3'
        || report.status !== 'diagnostic_complete'
        || report.diagnostic !== true
        || report.productionEligible !== false
        || report.nativeCutoutFieldReceiptSha256 !== fieldReceiptSha256
        || report.comparison?.schema
            !== 'ai531-production-alpha-cutout-spatial-comparison-diagnostic-v1'
        || report.comparison?.status !== 'mismatched'
        || (!allowDepthCorrections && (
            report.comparison?.depthMismatchCount !== 0
            || report.comparison?.depthMismatches?.length !== 0
        ))) {
        throw new Error(`Diagnostic evidence for '${profileId}' is not an eligible exact correction source`);
    }
    const evidence = {};
    const evidenceBytes = {};
    for (const key of [
        'bakeFirstHitDepth', 'bakeOccupancy', 'comparison',
        'liveFirstHitDepth', 'liveOccupancy', 'samplePlan'
    ]) {
        const authenticated = await authenticateEvidenceRecord(root, report.evidence[key], key);
        evidence[key] = report.evidence[key];
        evidenceBytes[key] = authenticated;
    }
    const samplePlan = parseCanonicalBytes(evidenceBytes.samplePlan, 'calibration sample plan');
    if (samplePlan.lightingProfileId !== profileId
        || samplePlan.samples?.length !== evidenceBytes.liveOccupancy.byteLength
        || evidenceBytes.liveOccupancy.byteLength !== evidenceBytes.bakeOccupancy.byteLength
        || evidenceBytes.comparison.byteLength !== evidenceBytes.liveOccupancy.byteLength
        || evidenceBytes.liveFirstHitDepth.byteLength
            !== report.comparison.commonOccupiedSampleCount * 4
        || evidenceBytes.bakeFirstHitDepth.byteLength
            !== report.comparison.commonOccupiedSampleCount * 4) {
        throw new Error(`Diagnostic evidence dimensions for '${profileId}' do not align`);
    }
    const liveDepth = new DataView(
        evidenceBytes.liveFirstHitDepth.buffer,
        evidenceBytes.liveFirstHitDepth.byteOffset,
        evidenceBytes.liveFirstHitDepth.byteLength
    );
    const bakeDepth = new DataView(
        evidenceBytes.bakeFirstHitDepth.buffer,
        evidenceBytes.bakeFirstHitDepth.byteOffset,
        evidenceBytes.bakeFirstHitDepth.byteLength
    );
    const exclusions = [];
    const corrections = [];
    const occupancyMismatches = [];
    const depthMismatches = [];
    let commonDepthIndex = 0;
    for (let index = 0; index < evidenceBytes.liveOccupancy.byteLength; index += 1) {
        const live = evidenceBytes.liveOccupancy[index];
        const bake = evidenceBytes.bakeOccupancy[index];
        const classification = evidenceBytes.comparison[index];
        if ((live !== 0 && live !== 1) || (bake !== 0 && bake !== 1)) {
            throw new Error(`Diagnostic occupancy for '${profileId}' is not binary`);
        }
        const sample = samplePlan.samples[index];
        if (live !== bake) {
            const expected = live === 1 ? 2 : 3;
            if (classification !== expected) {
                throw new Error(`Diagnostic comparison for '${profileId}' differs at sample ${index}`);
            }
            const mismatch = {
                bakeOccupied: bake,
                casterId: sample.casterId,
                globalTexel: [...sample.globalTexel],
                index,
                liveOccupied: live
            };
            occupancyMismatches.push(mismatch);
            if (live !== 0 || bake !== 1) {
                throw new Error(`Diagnostic '${profileId}' contains a missing live occluder`);
            }
            const exclusion = {
                casterId: sample.casterId,
                globalTexel: [...sample.globalTexel],
                index
            };
            exclusions.push(exclusion);
            corrections.push({
                ...exclusion,
                correction: 'clear_bake_only',
                liveDepthMeters: 0
            });
            continue;
        }
        if (live === 0) {
            if (classification !== 0) {
                throw new Error(`Diagnostic comparison for '${profileId}' differs at sample ${index}`);
            }
            continue;
        }
        const liveDepthMeters = liveDepth.getFloat32(commonDepthIndex * 4, true);
        const bakeDepthMeters = bakeDepth.getFloat32(commonDepthIndex * 4, true);
        commonDepthIndex += 1;
        if (!Number.isFinite(liveDepthMeters) || liveDepthMeters <= 0
            || !Number.isFinite(bakeDepthMeters) || bakeDepthMeters <= 0) {
            throw new Error(`Diagnostic depth for '${profileId}' is invalid at sample ${index}`);
        }
        const errorMeters = Math.abs(bakeDepthMeters - liveDepthMeters);
        const expected = errorMeters > report.comparison.firstHitDepthToleranceMeters ? 4 : 1;
        if (classification !== expected) {
            throw new Error(`Diagnostic comparison for '${profileId}' differs at sample ${index}`);
        }
        if (errorMeters <= report.comparison.firstHitDepthToleranceMeters) continue;
        const mismatch = {
            bakeDepthMeters,
            casterId: sample.casterId,
            errorMeters,
            globalTexel: [...sample.globalTexel],
            index,
            liveDepthMeters
        };
        depthMismatches.push(mismatch);
        if (allowDepthCorrections) {
            corrections.push({
                bakeDepthMeters,
                casterId: sample.casterId,
                correction: 'replace_depth',
                globalTexel: [...sample.globalTexel],
                index,
                liveDepthMeters
            });
        }
    }
    if (commonDepthIndex !== report.comparison.commonOccupiedSampleCount
        || (allowDepthCorrections ? corrections.length : exclusions.length) === 0
        || report.comparison.mismatchCount
            !== occupancyMismatches.length + depthMismatches.length
        || report.comparison.occupancyMismatchCount !== exclusions.length
        || canonicalJsonStringify(report.comparison.occupancyMismatches)
            !== canonicalJsonStringify(occupancyMismatches)
        || report.comparison.depthMismatchCount !== depthMismatches.length
        || canonicalJsonStringify(report.comparison.depthMismatches)
            !== canonicalJsonStringify(depthMismatches)) {
        throw new Error(`Diagnostic mismatch inventory for '${profileId}' is inconsistent`);
    }
    const seenTexels = new Set();
    for (const correction of corrections) {
        const texel = canonicalJsonStringify(correction.globalTexel);
        if (seenTexels.has(texel)) {
            throw new Error(`Diagnostic corrections for '${profileId}' target a texel more than once`);
        }
        seenTexels.add(texel);
    }
    return {
        corrections,
        correctionsWithDepth: (actual) => corrections.map((entry, index) => ({
            ...entry,
            bakeDepthMeters: entry.bakeDepthMeters
                ?? actual[index]?.formerDepthMeters,
            correctedDepthMeters: actual[index]?.correctedDepthMeters,
            formerDepthMeters: actual[index]?.formerDepthMeters
        })),
        evidence,
        exclusions,
        exclusionsWithDepth: (actual) => exclusions.map((entry, index) => ({
            ...entry,
            formerDepthMeters: actual[index]?.formerDepthMeters
        })),
        report,
        reportProof: {
            byteLength: reportBytes.byteLength,
            path: repositoryRelative(reportPath),
            sha256: sha256(reportBytes)
        }
    };
}

async function authenticateEvidenceRecord(root, record, label) {
    requireExactKeys(record, ['byteLength', 'path', 'sha256'], `diagnostic ${label}`);
    const absolute = path.resolve(repoRoot, ...record.path.split('/'));
    requireInside(root, absolute, false, `diagnostic ${label}`);
    const entry = await lstat(absolute);
    if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`Diagnostic ${label} must be a regular non-symbolic file`);
    }
    const bytes = new Uint8Array(await readFile(absolute));
    if (bytes.byteLength !== record.byteLength || sha256(bytes) !== record.sha256) {
        throw new Error(`Diagnostic ${label} failed authentication`);
    }
    return bytes;
}

function measureDepthField(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let occupiedTexelCount = 0;
    let minimumDepthMeters = Infinity;
    let maximumDepthMeters = -Infinity;
    for (let offset = 0; offset < bytes.byteLength; offset += 4) {
        const value = view.getFloat32(offset, true);
        if (!Number.isFinite(value)) throw new Error('Calibrated field contains non-finite depth');
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
        else if (flag === '--diagnostic-root') options.diagnosticRoot = artifactChild(value, true);
        else if (flag === '--output-root') options.outputRoot = artifactChild(value, false);
        else if (flag === '--profiles') options.profiles = value.split(',');
        else throw new TypeError(`Unknown option '${flag}'`);
    }
    for (const key of ['inputPath', 'inputRoot', 'diagnosticRoot', 'outputRoot', 'profiles']) {
        if (!options[key]) throw new TypeError(`Calibration ${key} is required`);
    }
    options.profiles = selectProductionStaticSunProfiles(options.profiles)
        .map((profile) => profile.id);
    return options;
}

async function producerInventory() {
    const paths = [
        runnerPath,
        path.join(here, 'build_alpha_cutout_native_field_parity.mjs'),
        path.join(here, 'compose_alpha_cutout_native_field.mjs'),
        path.join(here, 'production.mjs'),
        path.join(here, 'src/ProductionAlphaCutoutParity.mjs'),
        path.join(here, 'src/ProductionArtifact.mjs'),
        path.join(here, 'src/ProductionOrchestrator.mjs')
    ];
    return Promise.all(paths.sort().map(async (filePath) => {
        const bytes = await readFile(filePath);
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

async function linkOrCopy(source, destination) {
    try {
        await link(source, destination);
    } catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
        await copyFile(source, destination);
    }
}

async function readCanonical(filePath, label) {
    const bytes = new Uint8Array(await readFile(filePath));
    return {bytes, value: parseCanonicalBytes(bytes, label)};
}

function parseCanonicalBytes(bytes, label) {
    let text;
    let value;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`${label} must be UTF-8 JSON`, {cause: error});
    }
    if (canonicalJsonStringify(value) !== text) throw new Error(`${label} must be canonical JSON`);
    return value;
}

function requireExactKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJsonStringify(Object.keys(value).sort())
            !== canonicalJsonStringify([...keys].sort())) {
        throw new TypeError(`${label} has unexpected keys`);
    }
    return value;
}

function artifactChild(value, mustExist) {
    const resolved = path.resolve(repoRoot, value);
    requireInside(artifactRoot, resolved, false, 'illumination_531 artifact');
    if (mustExist) return resolved;
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
        throw new Error('Calibration output root already exists');
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
    await mkdir(path.dirname(directory), {recursive: true});
}

function repositoryRelative(filePath) {
    return path.relative(repoRoot, filePath).replaceAll('\\', '/');
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
