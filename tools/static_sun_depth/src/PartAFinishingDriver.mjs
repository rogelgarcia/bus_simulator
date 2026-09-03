// Runs and checkpoints the deterministic AI 531 Part A finishing stages.
// @ts-check

import { createHash } from 'node:crypto';
import {
    mkdir,
    readFile,
    rename,
    writeFile
} from 'node:fs/promises';
import path from 'node:path';
import {
    canonicalJsonBytes,
    canonicalJsonStringify,
    cloneCanonicalJson,
    compareCanonicalStrings
} from '../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    AI531_PRODUCTION_RELEASE_PROFILE_IDS
} from './ProductionReleaseCertification.mjs';

export const PART_A_CHECKPOINT_SCHEMA =
    'bus-sim-static-sun-depth-part-a-checkpoint-v1';
export const PART_A_FAILURE_INVENTORY_SCHEMA =
    'bus-sim-static-sun-depth-part-a-failure-inventory-v1';
export const PART_A_ISOLATION_REPORT_SCHEMA =
    'bus-sim-static-sun-depth-part-a-determinism-isolation-v1';

export const PART_A_VISUAL_FAILURE_CODES = Object.freeze(new Set([
    'continuous_seam',
    'maximum_rgb_error',
    'mean_rgb_error',
    'missing_occluder',
    'pixels_over_four',
    'seam_error'
]));

const STAGE_IDS = Object.freeze([
    'production',
    'determinismIsolation',
    'labValidation',
    'productionValidation',
    'failureInventory'
]);
const CHECKPOINT_PATH_KEYS = Object.freeze([
    'checkpointPath',
    'failureInventoryPath',
    'isolationProbePath',
    'labOutputRoot',
    'productionOutputRoot'
]);

/**
 * @param {Record<string, any>} options
 * @param {Record<string, any>} [deps]
 */
export async function runPartAFinishingDriver(options, deps = {}) {
    const normalized = normalizeOptions(options);
    const readFileFn = deps.readFileFn ?? readFile;
    const configuration = await buildConfigurationIdentity(
        normalized,
        {readFileFn}
    );
    let checkpoint = clearResolvedStageErrors(await loadOrCreateCheckpoint(
        normalized,
        configuration,
        {readFileFn, ...deps}
    ));
    const persist = async (next) => {
        checkpoint = Object.freeze(cloneCanonicalJson({
            ...next,
            revision: checkpoint.revision + 1
        }));
        await writeCanonicalAtomic(
            normalized.checkpointPath,
            checkpoint,
            deps
        );
    };
    if (normalized.acknowledgeFirstFailures) {
        const cases = checkpoint.presentation.cases.map((entry) => ({
            ...entry,
            firstResultDelivered: true
        }));
        await persist(withExitState({
            ...checkpoint,
            presentation: {...checkpoint.presentation, cases}
        }));
        return checkpoint;
    }
    const orchestrateFn = deps.orchestrateFn;
    if (typeof orchestrateFn !== 'function') {
        throw new TypeError('Part A driver requires orchestrateFn');
    }
    if (checkpoint.stages.production.status !== 'passed') {
        await persist(setStage(checkpoint, 'production', {status: 'running'}));
        try {
            const result = await orchestrateFn(normalized.productionOptions, {
                onProfileCompleteFn: async ({profile, result: profileResult}) => {
                    const profiles = checkpoint.stages.production.profiles.map((entry) => (
                        entry.lightingProfileId === profile.id
                            ? {
                                lightingProfileId: profile.id,
                                status: profileResult.resumed === true
                                    ? 'authenticated_reused'
                                    : 'generated'
                            }
                            : entry
                    ));
                    await persist(setStage(checkpoint, 'production', {
                        profiles,
                        status: 'running'
                    }));
                }
            });
            const packageIndex = await fileRecord(
                result.packageIndexPath,
                normalized.repoRoot,
                {readFileFn}
            );
            await persist(setStage(checkpoint, 'production', {
                packageIndex,
                profiles: result.profiles.map((entry) => ({
                    lightingProfileId: entry.lightingProfileId,
                    status: entry.resumed === true
                        ? 'authenticated_reused'
                        : 'generated'
                })),
                status: 'passed'
            }));
        } catch (error) {
            await persist(setStage(checkpoint, 'production', {
                error: errorRecord(error),
                status: normalized.signal?.aborted === true ? 'stopped' : 'failed'
            }));
            throw error;
        }
    } else {
        await authenticateCheckpointFile(
            checkpoint.stages.production.packageIndex,
            normalized.repoRoot,
            {readFileFn}
        );
    }
    if (normalized.stopAfter === 'production' || normalized.signal?.aborted === true) {
        await persist({...checkpoint, exitState: 'stopped'});
        return checkpoint;
    }
    if (checkpoint.stages.determinismIsolation.status !== 'passed') {
        await persist(setStage(
            checkpoint,
            'determinismIsolation',
            {status: 'running'}
        ));
        const absent = await snapshotProductionAuthority(normalized, {readFileFn});
        await writeCanonicalAtomic(normalized.isolationProbePath, {
            schema: 'bus-sim-static-sun-depth-validation-state-probe-v1',
            state: 'present'
        }, deps);
        const presentResult = await orchestrateFn(normalized.productionOptions);
        const present = await snapshotProductionAuthority(normalized, {readFileFn});
        await writeCanonicalAtomic(normalized.isolationProbePath, {
            schema: 'bus-sim-static-sun-depth-validation-state-probe-v1',
            state: 'changed'
        }, deps);
        const changedResult = await orchestrateFn(normalized.productionOptions);
        const changed = await snapshotProductionAuthority(normalized, {readFileFn});
        const isolation = buildDeterminismIsolationReport({
            absent,
            changed,
            changedProfiles: changedResult.profiles,
            configurationSha256: configuration.sha256,
            present,
            presentProfiles: presentResult.profiles
        });
        await persist(setStage(checkpoint, 'determinismIsolation', isolation));
    }
    if (normalized.stopAfter === 'determinismIsolation') {
        await persist({...checkpoint, exitState: 'stopped'});
        return checkpoint;
    }
    const runLabFn = deps.runLabFn;
    if (typeof runLabFn !== 'function') {
        throw new TypeError('Part A driver requires runLabFn');
    }
    if (checkpoint.stages.labValidation.status !== 'passed') {
        await persist(setStage(checkpoint, 'labValidation', {status: 'running'}));
        try {
            const result = await runLabFn({
                outputRoot: normalized.labOutputRoot,
                timingContaminationReason: normalized.timingContaminationReason,
                warmupFrames: normalized.warmupFrames
            });
            await persist(setStage(checkpoint, 'labValidation', {
                report: await fileRecord(
                    result.reportPath,
                    normalized.repoRoot,
                    {readFileFn}
                ),
                status: 'passed'
            }));
        } catch (error) {
            const reportPath = path.join(
                normalized.labOutputRoot,
                'lab_validation_report.json'
            );
            const report = await optionalFileRecord(
                reportPath,
                normalized.repoRoot,
                {readFileFn}
            );
            await persist(setStage(checkpoint, 'labValidation', {
                error: errorRecord(error),
                report,
                status: 'failed'
            }));
            throw error;
        }
    } else {
        await authenticateCheckpointFile(
            checkpoint.stages.labValidation.report,
            normalized.repoRoot,
            {readFileFn}
        );
    }
    if (normalized.stopAfter === 'labValidation') {
        await persist({...checkpoint, exitState: 'stopped'});
        return checkpoint;
    }
    const runProductionValidationFn = deps.runProductionValidationFn;
    if (typeof runProductionValidationFn !== 'function') {
        throw new TypeError('Part A driver requires runProductionValidationFn');
    }
    if (!['passed', 'readiness_passed'].includes(
        checkpoint.stages.productionValidation.status
    )) {
        await persist(setStage(
            checkpoint,
            'productionValidation',
            {status: 'running'}
        ));
        let validationError = null;
        let result = null;
        try {
            result = await runProductionValidationFn({
                outputRoot: normalized.productionOutputRoot,
                packageIndexPath: normalized.packageIndexPath,
                timingContaminationReason: normalized.timingContaminationReason,
                warmupFrames: normalized.warmupFrames
            });
        } catch (error) {
            validationError = error;
        }
        const reportPath = result?.reportPath ?? path.join(
            normalized.productionOutputRoot,
            'production_validation_report.json'
        );
        const bytes = await readFileFn(reportPath);
        const report = parseJson(bytes, 'production validation report');
        const inventory = buildPartAFailureInventory(report, {
            reportPath: repositoryPath(normalized.repoRoot, reportPath),
            reportSha256: rawSha256(bytes)
        });
        await writeCanonicalAtomic(
            normalized.failureInventoryPath,
            inventory,
            deps
        );
        const readiness = evaluatePartAReadiness(report, inventory);
        await persist(setStage(checkpoint, 'productionValidation', {
            ...(validationError ? {error: errorRecord(validationError)} : {}),
            readiness,
            report: await fileRecord(
                reportPath,
                normalized.repoRoot,
                {readFileFn}
            ),
            status: readiness.passed
                ? (report.status === 'passed' ? 'passed' : 'readiness_passed')
                : 'failed'
        }));
        await persist(setStage(checkpoint, 'failureInventory', {
            artifact: await fileRecord(
                normalized.failureInventoryPath,
                normalized.repoRoot,
                {readFileFn}
            ),
            deferredVisualCaseCount: inventory.cases.length,
            status: 'passed'
        }));
        const presentationCases = inventory.cases.map((entry) => ({
            afterCachePath: entry.captures.afterCache.path,
            beforeCurrentPath: entry.captures.beforeCurrent.path,
            caseId: entry.caseId,
            failedGates: entry.failedGates,
            finalPassDelivered: false,
            firstResultDelivered: false
        }));
        await persist(withExitState({
            ...checkpoint,
            presentation: {
                policy: 'human-verification-only-no-action-items-v1',
                cases: presentationCases
            }
        }));
        if (['productionValidation', 'failureInventory'].includes(
            normalized.stopAfter
        )) {
            await persist({...checkpoint, exitState: 'stopped'});
            return checkpoint;
        }
        if (!readiness.passed) {
            throw validationError ?? new Error('Part A production readiness did not pass');
        }
    } else {
        await authenticateCheckpointFile(
            checkpoint.stages.productionValidation.report,
            normalized.repoRoot,
            {readFileFn}
        );
        await authenticateCheckpointFile(
            checkpoint.stages.failureInventory.artifact,
            normalized.repoRoot,
            {readFileFn}
        );
    }
    await persist(withExitState(checkpoint));
    return checkpoint;
}

/** @param {Record<string, any>} report @param {Record<string, string>} binding */
export function buildPartAFailureInventory(report, binding) {
    requirePlainObject(report, 'production validation report');
    const casesById = new Map((report.cases ?? []).map((entry) => [entry.caseId, entry]));
    const cases = [];
    const nonvisualFailures = [];
    for (const failure of report.failures ?? []) {
        const failedGates = [...new Set(failure.failures ?? [])].sort(compareCanonicalStrings);
        const validationCase = casesById.get(failure.caseId);
        const visualOnly = validationCase
            && failedGates.length > 0
            && failedGates.every((code) => PART_A_VISUAL_FAILURE_CODES.has(code));
        if (!visualOnly) {
            nonvisualFailures.push(cloneCanonicalJson({
                caseId: failure.caseId,
                failedGates
            }));
            continue;
        }
        const captures = requirePlainObject(
            validationCase.captures,
            `captures for '${failure.caseId}'`
        );
        cases.push(cloneCanonicalJson({
            actionItems: [],
            captures: {
                afterCache: captures.cache,
                beforeCurrent: captures.current,
                comparison: captures.comparison
            },
            caseId: failure.caseId,
            classification: 'visual_only',
            failedGates,
            lightingProfileId: validationCase.lightingProfileId,
            metrics: validationCase.metrics
        }));
    }
    cases.sort((left, right) => compareCanonicalStrings(left.caseId, right.caseId));
    nonvisualFailures.sort((left, right) => (
        compareCanonicalStrings(left.caseId, right.caseId)
    ));
    return Object.freeze(cloneCanonicalJson({
        actionItems: [],
        cases,
        nonvisualFailures,
        policy: 'human-verification-only-no-action-items-v1',
        report: binding,
        schema: PART_A_FAILURE_INVENTORY_SCHEMA,
        status: 'complete'
    }));
}

/** @param {Record<string, any>} report @param {Record<string, any>} inventory */
export function evaluatePartAReadiness(report, inventory) {
    const passedCaseCount = (report.cases ?? []).filter((entry) => entry.passed === true).length;
    const deferredVisualCaseCount = inventory.cases.length;
    const nonvisualFailureCount = inventory.nonvisualFailures.length;
    const complete = report.caseCount === 197
        && report.expectedCaseCount === 197
        && Array.isArray(report.cases)
        && report.cases.length === 197;
    return Object.freeze(cloneCanonicalJson({
        complete,
        deferredVisualCaseCount,
        minimumPassingCaseCount: 188,
        nonvisualFailureCount,
        passed: complete
            && passedCaseCount >= 188
            && deferredVisualCaseCount <= 9
            && nonvisualFailureCount === 0,
        passedCaseCount,
        strictStatus: report.status
    }));
}

/** @param {Record<string, any>} value */
export function buildDeterminismIsolationReport(value) {
    const baseline = canonicalJsonStringify(value.absent);
    const present = canonicalJsonStringify(value.present);
    const changed = canonicalJsonStringify(value.changed);
    const allResumed = [...value.presentProfiles, ...value.changedProfiles]
        .every((entry) => entry.resumed === true);
    if (baseline !== present || baseline !== changed || !allResumed) {
        throw new Error(
            'Production authority changed when presentation-only validation state changed'
        );
    }
    return Object.freeze(cloneCanonicalJson({
        authorityInventorySha256: rawSha256(canonicalJsonBytes(value.absent)),
        configurationSha256: value.configurationSha256,
        method:
            'absent-present-changed-validation-state-with-authenticated-production-resume-v1',
        productionRunsByteIdentical: true,
        schema: PART_A_ISOLATION_REPORT_SCHEMA,
        status: 'passed',
        validationStateExcludedFromProductionInputs: true
    }));
}

async function buildConfigurationIdentity(options, deps) {
    const files = [];
    for (const filePath of [
        options.productionOptions.inputPath,
        options.productionOptions.profilePath,
        options.productionOptions.rendererPath,
        options.productionOptions.toolchainPath
    ]) {
        files.push(await fileRecord(filePath, options.repoRoot, deps));
    }
    for (const profileId of AI531_PRODUCTION_RELEASE_PROFILE_IDS) {
        files.push(await fileRecord(path.join(
            options.productionOptions.nativeCutoutRoot,
            profileId,
            'native_cutout_field_receipt.json'
        ), options.repoRoot, deps));
        files.push(await fileRecord(path.join(
            options.productionOptions.alphaParityRoot,
            profileId,
            'spatial_parity_artifact.json'
        ), options.repoRoot, deps));
    }
    files.sort((left, right) => compareCanonicalStrings(left.path, right.path));
    const value = cloneCanonicalJson({
        files,
        production: {
            artifactRoot: repositoryPath(options.repoRoot, options.productionOptions.artifactRoot),
            repeat: options.productionOptions.repeat,
            rowStripPixels: options.productionOptions.rowStripPixels,
            timeoutMs: options.productionOptions.timeoutMs
        },
        schema: 'bus-sim-static-sun-depth-part-a-configuration-v1'
    });
    return Object.freeze({
        sha256: rawSha256(canonicalJsonBytes(value)),
        value
    });
}

async function loadOrCreateCheckpoint(options, configuration, deps) {
    let bytes = null;
    try {
        bytes = await deps.readFileFn(options.checkpointPath);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
    if (bytes !== null) {
        const checkpoint = parseJson(bytes, 'Part A checkpoint');
        if (checkpoint.schema !== PART_A_CHECKPOINT_SCHEMA
            || checkpoint.configurationSha256 !== configuration.sha256) {
            throw new Error('Part A checkpoint differs from the authenticated configuration');
        }
        return Object.freeze(checkpoint);
    }
    const checkpoint = Object.freeze(cloneCanonicalJson({
        configuration: configuration.value,
        configurationSha256: configuration.sha256,
        exitState: 'running',
        presentation: {
            policy: 'human-verification-only-no-action-items-v1',
            cases: []
        },
        revision: 0,
        schema: PART_A_CHECKPOINT_SCHEMA,
        stages: {
            determinismIsolation: {status: 'pending'},
            failureInventory: {status: 'pending'},
            labValidation: {status: 'pending'},
            production: {
                profiles: AI531_PRODUCTION_RELEASE_PROFILE_IDS.map((lightingProfileId) => ({
                    lightingProfileId,
                    status: 'pending'
                })),
                status: 'pending'
            },
            productionValidation: {status: 'pending'}
        }
    }));
    await writeCanonicalAtomic(options.checkpointPath, checkpoint, deps);
    return checkpoint;
}

async function snapshotProductionAuthority(options, deps) {
    const packageIndex = await fileRecord(
        options.packageIndexPath,
        options.repoRoot,
        deps
    );
    const publications = [];
    for (const profileId of AI531_PRODUCTION_RELEASE_PROFILE_IDS) {
        publications.push(await fileRecord(path.join(
            options.productionOptions.artifactRoot,
            'production',
            profileId,
            'publication.json'
        ), options.repoRoot, deps));
    }
    return cloneCanonicalJson({packageIndex, publications});
}

function normalizeOptions(options) {
    requirePlainObject(options, 'Part A driver options');
    requirePlainObject(options.productionOptions, 'Part A production options');
    const normalized = {...options};
    for (const key of ['repoRoot', ...CHECKPOINT_PATH_KEYS]) {
        if (typeof normalized[key] !== 'string' || !normalized[key]) {
            throw new TypeError(`Part A option '${key}' must be a path`);
        }
        normalized[key] = path.resolve(normalized[key]);
    }
    normalized.packageIndexPath = path.join(
        path.resolve(options.productionOptions.artifactRoot),
        'package_index.json'
    );
    normalized.stopAfter = options.stopAfter ?? null;
    if (normalized.stopAfter !== null && !STAGE_IDS.includes(normalized.stopAfter)) {
        throw new Error(`Unknown Part A stop stage '${normalized.stopAfter}'`);
    }
    normalized.acknowledgeFirstFailures = options.acknowledgeFirstFailures === true;
    normalized.warmupFrames = options.warmupFrames ?? 2;
    normalized.timingContaminationReason = options.timingContaminationReason;
    normalized.signal = options.signal;
    return Object.freeze(normalized);
}

function setStage(checkpoint, stageId, value) {
    const stage = {
        ...checkpoint.stages[stageId],
        ...value
    };
    if (!Object.hasOwn(value, 'error')
        && ['running', 'passed', 'readiness_passed'].includes(value.status)) {
        delete stage.error;
    }
    return cloneCanonicalJson({
        ...checkpoint,
        stages: {
            ...checkpoint.stages,
            [stageId]: stage
        }
    });
}

function clearResolvedStageErrors(checkpoint) {
    const stages = {};
    for (const [stageId, value] of Object.entries(checkpoint.stages)) {
        const stage = {...value};
        if (['running', 'passed', 'readiness_passed'].includes(stage.status)) {
            delete stage.error;
        }
        stages[stageId] = stage;
    }
    return cloneCanonicalJson({...checkpoint, stages});
}

function withExitState(checkpoint) {
    const validationStatus = checkpoint.stages.productionValidation.status;
    const readinessPassed = ['passed', 'readiness_passed'].includes(validationStatus);
    const deliveryComplete = checkpoint.presentation.cases.every(
        (entry) => entry.firstResultDelivered === true
    );
    const exitState = validationStatus === 'failed'
        ? 'failed_readiness'
        : readinessPassed
            ? (deliveryComplete ? 'complete' : 'awaiting_human_verification')
            : checkpoint.exitState;
    return cloneCanonicalJson({
        ...checkpoint,
        exitState
    });
}

async function authenticateCheckpointFile(record, repoRoot, deps) {
    if (!record) throw new Error('Checkpoint is missing an authenticated file record');
    const current = await fileRecord(
        path.resolve(repoRoot, record.path),
        repoRoot,
        deps
    );
    if (canonicalJsonStringify(current) !== canonicalJsonStringify(record)) {
        throw new Error(`Checkpoint artifact '${record.path}' changed`);
    }
}

async function optionalFileRecord(filePath, repoRoot, deps) {
    try {
        return await fileRecord(filePath, repoRoot, deps);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
}

async function fileRecord(filePath, repoRoot, deps) {
    const bytes = await deps.readFileFn(filePath);
    return cloneCanonicalJson({
        byteLength: bytes.byteLength,
        path: repositoryPath(repoRoot, filePath),
        sha256: rawSha256(bytes)
    });
}

async function writeCanonicalAtomic(filePath, value, deps) {
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const renameFn = deps.renameFn ?? rename;
    await mkdirFn(path.dirname(filePath), {recursive: true});
    const temporaryPath = `${filePath}.partial-${process.pid}`;
    await writeFileFn(temporaryPath, canonicalJsonBytes(value));
    await renameFn(temporaryPath, filePath);
}

function repositoryPath(repoRoot, filePath) {
    const relative = path.relative(repoRoot, path.resolve(filePath));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Part A path must stay below the repository: ${filePath}`);
    }
    return relative.replaceAll('\\', '/');
}

function parseJson(bytes, label) {
    try {
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch (error) {
        throw new Error(`${label} is not valid UTF-8 JSON`, {cause: error});
    }
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function errorRecord(error) {
    return cloneCanonicalJson({
        code: typeof error?.code === 'string' ? error.code : 'part_a_stage_failed',
        message: error instanceof Error ? error.message : String(error)
    });
}

function requirePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${label} must be a plain object`);
    }
    return /** @type {Record<string, any>} */ (value);
}
