// Runs deterministic pack, inspect, verify, and atomic promotion commands for illumination packages.
// @ts-check

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJsonStringify, compareCanonicalStrings } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    buildIlluminationBinaryPackage,
    parseIlluminationBinaryPackage,
    rawSha256Hex
} from '../../src/app/illumination/package/index.js';
import { promotePackageRelease } from './src/AtomicPromotion.mjs';
import { createUsageText, parseCliArgs } from './src/CliArguments.mjs';
import { createPackageDefinitionFromIntermediate } from './src/IntermediateAdapter.mjs';
import { asPackageToolError, PackageToolError } from './src/PackageToolError.mjs';

export { createUsageText, parseCliArgs } from './src/CliArguments.mjs';

const DEFAULT_PROFILE_PATH = fileURLToPath(new URL('./profiles/uncompressed_rgba32f.v1.json', import.meta.url));
const REPORT_SCHEMA = 'bus-sim-illumination-package-validation-report-v1';

/**
 * @typedef {{
 *   createDefinition?: typeof createPackageDefinitionFromIntermediate,
 *   buildPackage?: typeof buildIlluminationBinaryPackage,
 *   parsePackage?: typeof parseIlluminationBinaryPackage,
 *   hashBytes?: typeof rawSha256Hex,
 *   promoteRelease?: typeof promotePackageRelease,
 *   readFileFn?: typeof readFile,
 *   now?: () => number,
 *   stdout?: {write: (text: string) => unknown},
 *   stderr?: {write: (text: string) => unknown}
 * }} PackageCliDependencies
 */

/** @param {readonly string[]} argv @param {PackageCliDependencies} [dependencies] */
export async function runIlluminationPackageCommand(argv, dependencies = {}) {
    const options = parseCliArgs(argv);
    if (options.help) return Object.freeze({ help: createUsageText(options.command), schema: 'bus-sim-illumination-package-cli-help-v1' });
    const deps = resolveDependencies(dependencies);
    try {
        if (options.command === 'pack') return await runPack(options, deps);
        if (options.command === 'inspect') return await runInspect(options, deps);
        if (options.command === 'verify') return await runVerify(options, deps);
        if (options.command === 'promote') return await runPromote(options, deps);
        throw new PackageToolError('cli_command_unknown', 'Unknown illumination package command.', { command: options.command });
    } catch (error) {
        throw asPackageToolError(error, 'package_command_failed', 'Illumination package command failed.', {
            command: options.command
        });
    }
}

/** @param {readonly string[]} argv @param {PackageCliDependencies} [dependencies] */
export async function main(argv = process.argv.slice(2), dependencies = {}) {
    const stdout = dependencies.stdout ?? process.stdout;
    const stderr = dependencies.stderr ?? process.stderr;
    try {
        const result = await runIlluminationPackageCommand(argv, dependencies);
        if (result.schema === 'bus-sim-illumination-package-cli-help-v1') stdout.write(result.help + '\n');
        else stdout.write(canonicalJsonStringify(result) + '\n');
        return 0;
    } catch (error) {
        const structured = asPackageToolError(error, 'package_tool_failed', 'Illumination package tool failed.');
        stderr.write(canonicalJsonStringify(structured.toJSON()) + '\n');
        return 1;
    }
}

async function runPack(options, deps) {
    const adapted = await deps.createDefinition({
        manifestPath: path.resolve(options.input),
        profilePath: path.resolve(options.profilePath ?? DEFAULT_PROFILE_PATH),
        cityId: options.cityId,
        lightingProfileId: options.lightingProfileId,
        capabilityProfileId: options.capabilityProfileId
    });
    const buildStarted = deps.now();
    const built = await deps.buildPackage(adapted.definition);
    const buildMs = metricElapsed(deps.now, buildStarted);
    const verifyStarted = deps.now();
    const parsed = await deps.parsePackage(built.bytes, {
        expectations: buildSelfExpectations(built),
        runtimeCapabilities: collectDeclaredCapabilities(built)
    });
    const verifyMs = metricElapsed(deps.now, verifyStarted);
    requireCompatible(parsed, 'pack');
    const hashStarted = deps.now();
    const fileSha256 = await deps.hashBytes(built.bytes);
    const hashMs = metricElapsed(deps.now, hashStarted);
    const report = createValidationReport({
        operation: 'pack',
        parsed,
        fileSha256,
        adapterMetrics: adapted.metrics,
        buildMetrics: built.metrics,
        timingMs: { buildMs, hashMs, verifyMs }
    });
    const promoted = await publishRelease({
        deps,
        artifactRoot: path.resolve(options.outputRoot),
        runId: options.runId ?? 'pack',
        packageBytes: built.bytes,
        parsed,
        fileSha256,
        report
    });
    return Object.freeze({
        schema: 'bus-sim-illumination-package-pack-result-v1',
        aggregateSha256: parsed.aggregateSha256,
        fileSha256,
        finalPath: promoted.finalPath,
        packageByteLength: built.bytes.byteLength,
        validationReport: report
    });
}

async function runInspect(options, deps) {
    const bytes = await readPackageBytes(options.packagePath, deps.readFileFn);
    const hashStarted = deps.now();
    const fileSha256 = await deps.hashBytes(bytes);
    const hashMs = metricElapsed(deps.now, hashStarted);
    const parseStarted = deps.now();
    const parsed = await deps.parsePackage(bytes);
    const parseMs = metricElapsed(deps.now, parseStarted);
    return createInspection(parsed, fileSha256, { hashMs, parseMs });
}

async function runVerify(options, deps) {
    const loaded = await loadAndVerify(options, deps, 'verify');
    return Object.freeze({
        schema: 'bus-sim-illumination-package-verify-result-v1',
        passed: true,
        inspection: createInspection(loaded.parsed, loaded.fileSha256, loaded.timingMs)
    });
}

async function runPromote(options, deps) {
    const loaded = await loadAndVerify(options, deps, 'promote');
    const report = createValidationReport({
        operation: 'promote',
        parsed: loaded.parsed,
        fileSha256: loaded.fileSha256,
        adapterMetrics: null,
        buildMetrics: null,
        timingMs: loaded.timingMs
    });
    const promoted = await publishRelease({
        deps,
        artifactRoot: path.resolve(options.artifactRoot),
        runId: options.runId,
        packageBytes: loaded.bytes,
        parsed: loaded.parsed,
        fileSha256: loaded.fileSha256,
        report
    });
    return Object.freeze({
        schema: 'bus-sim-illumination-package-promote-result-v1',
        aggregateSha256: loaded.parsed.aggregateSha256,
        fileSha256: loaded.fileSha256,
        finalPath: promoted.finalPath,
        promoted: true,
        validationReport: report
    });
}

async function loadAndVerify(options, deps, operation) {
    const readStarted = deps.now();
    const bytes = await readPackageBytes(options.packagePath, deps.readFileFn);
    const readMs = metricElapsed(deps.now, readStarted);
    const hashStarted = deps.now();
    const fileSha256 = await deps.hashBytes(bytes);
    const hashMs = metricElapsed(deps.now, hashStarted);
    const parseStarted = deps.now();
    const parseOptions = { expectations: buildCliExpectations(options) };
    if (options.runtimeCapabilities.length > 0) parseOptions.runtimeCapabilities = options.runtimeCapabilities;
    const parsed = await deps.parsePackage(bytes, parseOptions);
    const parseMs = metricElapsed(deps.now, parseStarted);
    requireCompatible(parsed, operation);
    return Object.freeze({ bytes, parsed, fileSha256, timingMs: Object.freeze({ readMs, hashMs, parseMs }) });
}

async function publishRelease({ deps, artifactRoot, runId, packageBytes, parsed, fileSha256, report }) {
    return deps.promoteRelease({
        artifactRoot,
        cityId: parsed.manifest.cityId,
        lightingProfileId: parsed.manifest.lightingProfileId,
        capabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
        aggregateSha256: parsed.aggregateSha256,
        runId,
        packageBytes,
        manifest: parsed.manifest,
        validationReport: report,
        validateStage: async (stagingPath) => validatePublishedStage(stagingPath, {
            deps,
            expectedParsed: parsed,
            expectedFileSha256: fileSha256,
            expectedReport: report
        })
    });
}

async function validatePublishedStage(stagingPath, options) {
    const [packageValue, manifestValue, reportValue] = await Promise.all([
        options.deps.readFileFn(path.join(stagingPath, 'package.ilpkg')),
        options.deps.readFileFn(path.join(stagingPath, 'manifest.json')),
        options.deps.readFileFn(path.join(stagingPath, 'validation_report.json'))
    ]);
    const packageBytes = copyFileBytes(packageValue, 'staged package');
    const stagedFileSha256 = await options.deps.hashBytes(packageBytes);
    if (stagedFileSha256 !== options.expectedFileSha256) {
        throw new PackageToolError('staged_package_hash_mismatch', 'Staged package file SHA-256 changed before promotion.', {
            expected: options.expectedFileSha256,
            actual: stagedFileSha256
        });
    }
    const parsed = await options.deps.parsePackage(packageBytes, {
        expectations: buildSelfExpectations(options.expectedParsed),
        runtimeCapabilities: collectDeclaredCapabilities(options.expectedParsed)
    });
    requireCompatible(parsed, 'stage_validation');
    const manifest = parseCanonicalSidecar(manifestValue, 'manifest.json');
    const report = parseCanonicalSidecar(reportValue, 'validation_report.json');
    if (canonicalJsonStringify(manifest) !== canonicalJsonStringify(parsed.manifest)) {
        throw new PackageToolError('staged_manifest_mismatch', 'Staged manifest sidecar differs from the embedded manifest.', {});
    }
    if (canonicalJsonStringify(report) !== canonicalJsonStringify(options.expectedReport)) {
        throw new PackageToolError('staged_report_mismatch', 'Staged validation report differs from the verified report.', {});
    }
}

function createInspection(parsed, fileSha256, timingMs) {
    return Object.freeze({
        schema: 'bus-sim-illumination-package-inspection-v1',
        aggregateSha256: parsed.aggregateSha256,
        fileSha256,
        identity: Object.freeze({
            cityId: parsed.manifest.cityId,
            lightingProfileId: parsed.manifest.lightingProfileId,
            capabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
            resolvedSourceSha256: parsed.manifest.source.resolvedSourceSha256,
            sourceDescriptorSha256: parsed.manifest.source.descriptorSha256,
            compilerSignatureSha256: parsed.manifest.compiler.signatureSha256
        }),
        container: Object.freeze({
            magic: parsed.header.magic,
            major: parsed.header.major,
            minor: parsed.header.minor,
            byteLength: parsed.header.fileLength,
            byteOrder: parsed.manifest.byteOrder,
            alignment: parsed.header.alignment
        }),
        channels: Object.freeze(parsed.manifest.channels.map((channel) => Object.freeze({
            id: channel.id,
            required: channel.required,
            chunkIds: channel.chunkIds,
            sourceSha256: channel.sourceSha256,
            profileSha256: channel.profileSha256,
            outputIntegritySha256: channel.outputIntegritySha256
        }))),
        chunks: Object.freeze(parsed.chunkTable.chunks.map((chunk) => Object.freeze({
            id: chunk.id,
            channelId: chunk.channelId,
            byteLength: chunk.byteLength,
            decodedByteLength: chunk.decodedByteLength,
            compression: chunk.compression,
            encoding: chunk.encoding,
            precision: chunk.precision,
            dimensions: chunk.dimensions,
            mipLevel: chunk.mipLevel,
            requiredRuntimeCapabilities: chunk.requiredRuntimeCapabilities,
            sha256: chunk.sha256,
            decodedSha256: chunk.decodedSha256
        }))),
        compatibility: parsed.compatibility,
        metrics: Object.freeze({ ...parsed.metrics, ...timingMs })
    });
}

function createValidationReport({ operation, parsed, fileSha256, adapterMetrics, buildMetrics, timingMs }) {
    return Object.freeze({
        schema: REPORT_SCHEMA,
        passed: true,
        operation,
        identity: Object.freeze({
            aggregateSha256: parsed.aggregateSha256,
            fileSha256,
            cityId: parsed.manifest.cityId,
            lightingProfileId: parsed.manifest.lightingProfileId,
            capabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
            resolvedSourceSha256: parsed.manifest.source.resolvedSourceSha256,
            compilerSignatureSha256: parsed.manifest.compiler.signatureSha256
        }),
        sizes: Object.freeze({
            packageByteLength: parsed.metrics.packageByteLength,
            manifestByteLength: parsed.metrics.manifestByteLength,
            chunkTableByteLength: parsed.metrics.chunkTableByteLength,
            payloadByteLength: parsed.metrics.payloadByteLength,
            decodedByteLength: parsed.metrics.decodedByteLength,
            intermediateCanonicalByteLength: adapterMetrics?.canonicalByteLength ?? 'not_measured',
            intermediateRawByteLength: adapterMetrics?.intermediateRawByteLength ?? 'not_measured',
            compressionRatio: buildMetrics?.compressionRatio ?? 'not_measured'
        }),
        timingMs: Object.freeze({
            validateIntermediateMs: adapterMetrics?.validateIntermediateMs ?? 'not_measured',
            readCanonicalMs: adapterMetrics?.readCanonicalMs ?? 'not_measured',
            buildMs: timingMs.buildMs ?? 'not_measured',
            readMs: timingMs.readMs ?? 'not_measured',
            hashMs: timingMs.hashMs,
            verifyMs: timingMs.verifyMs ?? timingMs.parseMs
        }),
        compatibility: parsed.compatibility
    });
}

function buildSelfExpectations(packageResult) {
    const manifest = packageResult.manifest;
    return Object.freeze({
        cityId: manifest.cityId,
        lightingProfileId: manifest.lightingProfileId,
        selectedCapabilityProfileId: manifest.selectedCapabilityProfileId,
        resolvedSourceSha256: manifest.source.resolvedSourceSha256,
        compilerSignatureSha256: manifest.compiler.signatureSha256,
        aggregateSha256: packageResult.aggregateSha256
    });
}

function buildCliExpectations(options) {
    const values = {
        cityId: options.expectedCityId,
        lightingProfileId: options.expectedLightingProfileId,
        selectedCapabilityProfileId: options.expectedCapabilityProfileId,
        resolvedSourceSha256: options.expectedSourceSha256,
        profileSha256: options.expectedProfileSha256,
        compilerSignatureSha256: options.expectedCompilerSignatureSha256,
        aggregateSha256: options.expectedAggregateSha256
    };
    return Object.freeze(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)));
}

function collectDeclaredCapabilities(packageResult) {
    const capabilities = new Set();
    for (const profile of packageResult.manifest.capabilityProfiles) {
        for (const id of profile.requiredRuntimeCapabilities) capabilities.add(id);
    }
    for (const chunk of packageResult.chunkTable.chunks) {
        for (const id of chunk.requiredRuntimeCapabilities) capabilities.add(id);
    }
    return Object.freeze([...capabilities].sort(compareCanonicalStrings));
}

function requireCompatible(parsed, operation) {
    if (parsed.compatibility.compatible) return;
    throw new PackageToolError('package_incompatible', 'Illumination package is not compatible with the requested identity or runtime capabilities.', {
        operation,
        compatibility: parsed.compatibility
    });
}

async function readPackageBytes(packagePath, readFileFn) {
    if (typeof packagePath !== 'string' || !packagePath) throw new TypeError('Package path is required');
    try {
        return copyFileBytes(await readFileFn(path.resolve(packagePath)), 'package file');
    } catch (error) {
        throw asPackageToolError(error, 'package_read_failed', 'Illumination package could not be read.', {
            packagePath: path.resolve(packagePath)
        });
    }
}

function parseCanonicalSidecar(value, label) {
    const bytes = copyFileBytes(value, label);
    let text;
    let parsed;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        parsed = JSON.parse(text);
    } catch (error) {
        throw new PackageToolError('staged_sidecar_invalid', 'Staged sidecar is not valid UTF-8 JSON.', { label }, { cause: error });
    }
    if (canonicalJsonStringify(parsed) !== text) {
        throw new PackageToolError('staged_sidecar_noncanonical', 'Staged sidecar is not canonical JSON.', { label });
    }
    return parsed;
}

function copyFileBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    throw new TypeError(label + ' must be binary data');
}

function resolveDependencies(dependencies) {
    return Object.freeze({
        createDefinition: dependencies.createDefinition ?? createPackageDefinitionFromIntermediate,
        buildPackage: dependencies.buildPackage ?? buildIlluminationBinaryPackage,
        parsePackage: dependencies.parsePackage ?? parseIlluminationBinaryPackage,
        hashBytes: dependencies.hashBytes ?? rawSha256Hex,
        promoteRelease: dependencies.promoteRelease ?? promotePackageRelease,
        readFileFn: dependencies.readFileFn ?? readFile,
        now: dependencies.now ?? (() => performance.now())
    });
}

function metricElapsed(now, started) {
    const value = now() - started;
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 1000) / 1000;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main();
