#!/usr/bin/env node
// Finalizes deterministic AI 531 release certification from published profile and validation evidence.
// @ts-check

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    ILLUMINATION_VALIDATION_CASES
} from '../../src/app/illumination/validation/IlluminationValidationCaseCatalog.js';
import { sha256Hex } from '../../src/app/illumination/bake_source/Hashing.js';
import {
    validateResolvedCityBakePackage
} from '../../src/graphics/illumination/bake_source/index.js';
import {
    verifyIlluminationBinaryPackage
} from '../../src/app/illumination/package/index.js';
import {
    validateStaticSunDepthTileSetDescriptor
} from '../../src/app/illumination/static_sun_depth/index.js';
import {
    AI531_PRODUCTION_RELEASE_PROFILE_IDS,
    buildLabValidationEvidence,
    buildProductionProfileReleaseCertification,
    buildProductionReleaseCertification,
    buildProductionValidationEvidence,
    validateProductionProfileReleaseCertification
} from './src/ProductionReleaseCertification.mjs';
import {
    PRODUCTION_VALIDATION_CAPTURE_SLOTS,
    authenticateProductionValidationCaptureSet,
    authenticateValidationCaptureSet
} from './src/ValidationCaptureAuthentication.mjs';
import {
    buildProductionStaticSunDepthArtifact,
    validateProductionStaticSunDepthArrayPayload,
    validateProductionStaticSunDepthReceipt
} from './src/ProductionArtifact.mjs';
import {
    createProductionStaticSunRequest,
    deriveProductionSourceIdentityHashes,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';
import {
    requireProductionStaticSunDepthChunkWindows
} from './src/ProductionPackage.mjs';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CAPABILITY_PROFILE_ID = 'development.static_sun_v1';
const FINAL_FILE_HASH_DOMAIN = 'bus-simulator/illumination/bake-source/final-file/v1';
const PUBLICATION_SCHEMA = 'bus-sim-static-sun-depth-production-publication-v1';
const REQUIRED_PUBLICATION_FILES = Object.freeze([
    'alpha_certification.json',
    'artifact_manifest.json',
    'certification.json',
    'descriptor.json',
    'input_identity.json',
    'metrics.json',
    'opaque_certification.json',
    'production_static_sun_receipt.json',
    'release_certification.json',
    'request.json',
    'static_sun_depth.ilpkg',
    'static_sun_depth.rg8'
]);
const REBUILT_EVIDENCE_FILES = new Set([
    'alpha_certification.json',
    'descriptor.json',
    'opaque_certification.json',
    'production_static_sun_receipt.json',
    'release_certification.json',
    'static_sun_depth.ilpkg',
    'static_sun_depth.rg8'
]);
const EXPECTED_LAB_CASE_IDS = Object.freeze(
    ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind === 'lab')
        .map((entry) => entry.id)
        .sort()
);
const EXPECTED_PRODUCTION_CASE_IDS = Object.freeze(
    ILLUMINATION_VALIDATION_CASES
        .filter((entry) => entry.kind !== 'lab')
        .map((entry) => entry.id)
        .sort()
);

export const PRODUCTION_RELEASE_CERTIFICATION_DEFAULTS = Object.freeze({
    artifactRoot: path.join(repoRoot, 'tests/artifacts/illumination_531'),
    expectedLabValidationReportSha256: null,
    expectedValidationReportSha256: null,
    inputPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_528/packages/bigcity2',
        'ai531-production/bigcity2.bsib'
    ),
    packageIndexPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_531/package_index.json'
    ),
    outputPath: path.join(
        repoRoot,
        'tests/artifacts/illumination_531/release_certification.json'
    ),
    repoRoot,
    labValidationReportPath: null,
    validationReportPath: null
});

/** @param {readonly string[]} argv */
export function parseProductionReleaseCertificationArgs(argv) {
    if (!Array.isArray(argv)) throw new TypeError('CLI arguments must be an array');
    const options = { ...PRODUCTION_RELEASE_CERTIFICATION_DEFAULTS };
    const specified = new Set();
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({ help: true });
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        specified.add(flag);
        switch (flag) {
            case '--artifact-root':
                options.artifactRoot = path.resolve(value);
                break;
            case '--input':
                options.inputPath = path.resolve(value);
                break;
            case '--package-index':
                options.packageIndexPath = path.resolve(value);
                break;
            case '--output':
                options.outputPath = path.resolve(value);
                break;
            case '--validation-report':
                options.validationReportPath = path.resolve(value);
                break;
            case '--lab-validation-report':
                options.labValidationReportPath = path.resolve(value);
                break;
            case '--lab-validation-report-sha256':
                if (!HASH_PATTERN.test(value)) {
                    throw new TypeError('--lab-validation-report-sha256 must be a lowercase SHA-256');
                }
                options.expectedLabValidationReportSha256 = value;
                break;
            case '--validation-report-sha256':
                if (!HASH_PATTERN.test(value)) {
                    throw new TypeError('--validation-report-sha256 must be a lowercase SHA-256');
                }
                options.expectedValidationReportSha256 = value;
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (specified.has('--artifact-root')) {
        if (!specified.has('--package-index')) {
            options.packageIndexPath = path.join(options.artifactRoot, 'package_index.json');
        }
        if (!specified.has('--output')) {
            options.outputPath = path.join(options.artifactRoot, 'release_certification.json');
        }
    }
    return Object.freeze(options);
}

export function createProductionReleaseCertificationUsageText() {
    return `AI 531 production release certification finalizer

Usage:
  node tools/static_sun_depth/certify_release.mjs [options]

Options:
  --artifact-root <directory>          AI 531 production artifact authority
  --input <package.bsib>               Fresh semantically validated AI 528 source
  --package-index <json>               Exact eight-profile package index
  --validation-report <json>           Passed 197-case production report
  --validation-report-sha256 <sha256>  Required independent hash for a passed report
  --lab-validation-report <json>       Passed exact eight-case Lab report
  --lab-validation-report-sha256 <sha256>
                                       Required independent hash for the Lab report
  --output <json>                       Release certification output
  --help                                Show this help
`;
}

/**
 * @param {{
 *   artifactRoot: string,
 *   expectedLabValidationReportSha256?: string|null,
 *   expectedValidationReportSha256?: string|null,
 *   inputPath: string,
 *   labValidationReportPath?: string|null,
 *   outputPath: string,
 *   packageIndexPath: string,
 *   repoRoot: string,
 *   validationReportPath?: string|null
 * }} options
 * @param {{
 *   readFileFn?: typeof readFile,
 *   writeFileFn?: typeof writeFile,
 *   mkdirFn?: typeof mkdir,
 *   lstatFn?: typeof lstat,
 *   buildArtifactFn?: typeof buildProductionStaticSunDepthArtifact,
 *   validateReceiptFn?: typeof validateProductionStaticSunDepthReceipt,
 *   validatePayloadFn?: typeof validateProductionStaticSunDepthArrayPayload,
 *   validateSourcePackageFn?: typeof validateResolvedCityBakePackage,
 *   verifyPackageFn?: typeof verifyIlluminationBinaryPackage
 * }} [deps]
 */
export async function finalizeProductionReleaseCertification(options, deps = {}) {
    const normalized = normalizeOptions(options);
    const readFileFn = deps.readFileFn ?? readFile;
    const writeFileFn = deps.writeFileFn ?? writeFile;
    const mkdirFn = deps.mkdirFn ?? mkdir;
    const lstatFn = deps.lstatFn ?? lstat;
    const buildArtifactFn = deps.buildArtifactFn
        ?? buildProductionStaticSunDepthArtifact;
    const validateReceiptFn = deps.validateReceiptFn
        ?? validateProductionStaticSunDepthReceipt;
    const validatePayloadFn = deps.validatePayloadFn
        ?? validateProductionStaticSunDepthArrayPayload;
    const validateSourcePackageFn = deps.validateSourcePackageFn
        ?? validateResolvedCityBakePackage;
    const verifyPackageFn = deps.verifyPackageFn ?? verifyIlluminationBinaryPackage;
    await assertNoSymlinkPathSegments(
        normalized.repoRoot,
        normalized.artifactRoot,
        lstatFn
    );
    await assertNoSymlinkPathSegments(
        normalized.artifactRoot,
        normalized.outputPath,
        lstatFn,
        true
    );
    const sourcePackageBytes = await readTrustedBytes(
        normalized.repoRoot,
        normalized.inputPath,
        'AI531 source package',
        readFileFn,
        lstatFn
    );
    const sourcePackageRawSha256 = rawSha256(sourcePackageBytes);
    const validatedSource = await validateSourcePackageFn(sourcePackageBytes);
    if (!validatedSource?.manifest || validatedSource?.report?.valid !== true) {
        throw new Error('AI531 source package semantic validation did not pass');
    }
    const sourceAuthority = await buildSourceAuthority(
        validatedSource.manifest,
        sourcePackageBytes,
        sourcePackageRawSha256
    );
    const releaseProfiles = new Map(
        selectProductionStaticSunProfiles(AI531_PRODUCTION_RELEASE_PROFILE_IDS)
            .map((profile) => [profile.id, profile])
    );
    const packageIndexBytes = await readTrustedBytes(
        normalized.artifactRoot,
        normalized.packageIndexPath,
        'production package index',
        readFileFn,
        lstatFn
    );
    const packageIndex = parseCanonicalJsonBytes(
        packageIndexBytes,
        'production package index'
    );
    const profileCertifications = [];
    for (const lightingProfileId of AI531_PRODUCTION_RELEASE_PROFILE_IDS) {
        const indexed = packageIndex.profiles?.[lightingProfileId];
        if (!indexed) {
            throw new Error(`Production package index is missing '${lightingProfileId}'`);
        }
        const packagePath = resolveRepositoryFile(
            normalized.repoRoot,
            indexed.packagePath,
            `package '${lightingProfileId}'`
        );
        const profileRoot = path.dirname(packagePath);
        requireInsideArtifactRoot(normalized.artifactRoot, profileRoot, false);
        const publication = parseCanonicalJsonBytes(
            await readTrustedBytes(
                normalized.artifactRoot,
                path.join(profileRoot, 'publication.json'),
                `publication '${lightingProfileId}'`,
                readFileFn,
                lstatFn
            ),
            `publication '${lightingProfileId}'`
        );
        validatePublicationBoundary(publication, lightingProfileId, indexed);
        const files = new Map(publication.files?.map((entry) => [entry.path, entry]));
        const readPublishedEntry = async (entry) => {
            const relativePath = entry.path;
            const absolutePath = resolvePublishedFile(
                profileRoot,
                relativePath,
                lightingProfileId
            );
            const bytes = await readTrustedBytes(
                normalized.artifactRoot,
                absolutePath,
                `published '${relativePath}' for '${lightingProfileId}'`,
                readFileFn,
                lstatFn
            );
            if (entry.byteLength !== bytes.byteLength
                || entry.sha256 !== rawSha256(bytes)) {
                throw new Error(
                    `Published '${relativePath}' for '${lightingProfileId}' differs from its digest`
                );
            }
            return bytes;
        };
        const receiptEntry = files.get('production_static_sun_receipt.json');
        const receiptBytes = await readPublishedEntry(receiptEntry);
        const receiptValue = parseCanonicalJsonBytes(
            receiptBytes,
            `production receipt '${lightingProfileId}'`
        );
        const receipt = await validateReceiptFn(receiptValue);
        const expectedRequest = createProductionStaticSunRequest(
            releaseProfiles.get(lightingProfileId)
        );
        if (canonicalJsonStringify(receipt.input)
                !== canonicalJsonStringify(sourceAuthority.receiptInput)
            || receipt.identity?.cityId !== sourceAuthority.cityId
            || canonicalJsonStringify(receipt.request)
                !== canonicalJsonStringify(expectedRequest)
            || rawSha256(canonicalJsonBytes(receipt.compilerDescriptor))
                !== receipt.compilerSignatureSha256
            || receipt.identity?.compilerSignatureSha256
                !== receipt.compilerSignatureSha256) {
            throw new Error(
                `Authenticated receipt '${lightingProfileId}' differs from the fresh source, canonical request, or compiler identity`
            );
        }
        const retainedPaths = new Set([
            ...REBUILT_EVIDENCE_FILES,
            ...receipt.outputs.map((output) => output.path)
        ]);
        const evidenceBytes = new Map();
        for (const entry of publication.files) {
            const relativePath = entry.path;
            const bytes = relativePath === 'production_static_sun_receipt.json'
                ? receiptBytes
                : await readPublishedEntry(entry);
            if (retainedPaths.has(relativePath)) {
                evidenceBytes.set(relativePath, bytes);
            }
        }
        const certificationBytes = evidenceBytes.get('release_certification.json');
        const descriptorBytes = evidenceBytes.get('descriptor.json');
        const alphaBytes = evidenceBytes.get('alpha_certification.json');
        const opaqueBytes = evidenceBytes.get('opaque_certification.json');
        const packageBytes = evidenceBytes.get('static_sun_depth.ilpkg');
        for (const output of receipt.outputs ?? []) {
            const publishedOutput = files.get(output.path);
            if (!publishedOutput
                || publishedOutput.byteLength !== output.byteLength
                || publishedOutput.sha256 !== output.sha256) {
                throw new Error(
                    `Authenticated receipt output '${output.path}' for '${lightingProfileId}' differs from its publication`
                );
            }
        }
        const descriptor = parseCanonicalJsonBytes(
            descriptorBytes,
            `descriptor '${lightingProfileId}'`
        );
        const alpha = parseCanonicalJsonBytes(
            alphaBytes,
            `alpha certification '${lightingProfileId}'`
        );
        const opaque = parseCanonicalJsonBytes(
            opaqueBytes,
            `opaque certification '${lightingProfileId}'`
        );
        const staticSunPayload = evidenceBytes.get('static_sun_depth.rg8');
        const rebuiltArtifact = await buildArtifactFn({
            interiorTiles: receipt.outputs.map((output) => ({
                bytes: evidenceBytes.get(output.path),
                coordinates: output.coordinates,
                id: output.tileId
            })),
            receipt
        });
        if (canonicalJsonStringify(rebuiltArtifact.descriptor)
                !== canonicalJsonStringify(descriptor)
            || !bytesEqual(rebuiltArtifact.payload, staticSunPayload)) {
            throw new Error(
                `Published artifact '${lightingProfileId}' does not match the canonical artifact rebuilt from authenticated receipt interiors`
            );
        }
        await validatePayloadFn({ descriptor, payload: staticSunPayload });
        if (canonicalJsonStringify(alpha)
                !== canonicalJsonStringify(receipt.alphaCertification)
            || canonicalJsonStringify(opaque)
                !== canonicalJsonStringify(receipt.opaqueCertification)) {
            throw new Error(
                `Published certification evidence for '${lightingProfileId}' differs from its authenticated receipt`
            );
        }
        const certification = validateProductionProfileReleaseCertification(
            parseCanonicalJsonBytes(
                certificationBytes,
                `release certification '${lightingProfileId}'`
            ),
            {
                lightingProfileId,
                liveIdentity: indexed.liveIdentity,
                packagePath: indexed.packagePath
            }
        );
        if (certification.source.packageRawSha256 !== sourcePackageRawSha256) {
            throw new Error(
                `Release certification '${lightingProfileId}' differs from the authenticated source package`
            );
        }
        const rebuiltCertification = buildProductionProfileReleaseCertification({
            descriptor,
            manifest: validatedSource.manifest,
            packageAggregateSha256: publication.packageAggregateSha256,
            packagePath: indexed.packagePath,
            receipt,
            receiptSha256: rawSha256(receiptBytes),
            sourceValidationReport: validatedSource.report
        });
        if (canonicalJsonStringify(certification)
                !== canonicalJsonStringify(rebuiltCertification)) {
            throw new Error(
                `Release certification '${lightingProfileId}' differs from authenticated source and receipt evidence`
            );
        }
        if (canonicalJsonStringify(publication.packageIndexEntry)
                !== canonicalJsonStringify({
                    lightingProfileId,
                    liveIdentity: indexed.liveIdentity,
                    packagePath: indexed.packagePath
                })
            || certification.packageAggregateSha256
                !== publication.packageAggregateSha256
            || certification.receiptSha256
                !== files.get('production_static_sun_receipt.json')?.sha256
            || certification.descriptorSha256
                !== files.get('descriptor.json')?.sha256) {
            throw new Error(
                `Release certification '${lightingProfileId}' is not bound to its publication`
            );
        }
        if (resolvePublishedFile(
            profileRoot,
            'static_sun_depth.ilpkg',
            lightingProfileId
        ) !== packagePath) {
            throw new Error(
                `Package '${lightingProfileId}' path differs from its publication root`
            );
        }
        const verified = await verifyPackageFn(packageBytes, {
            expectations: {
                aggregateSha256: certification.packageAggregateSha256,
                cityId: indexed.liveIdentity.cityId,
                compilerSignatureSha256: receipt.compilerSignatureSha256,
                lightingProfileId,
                profileSha256: sourceAuthority.channelProfileSha256,
                resolvedSourceSha256: indexed.liveIdentity.resolvedSourceSha256,
                selectedCapabilityProfileId: CAPABILITY_PROFILE_ID,
                staticSunDepthSourceSha256:
                    indexed.liveIdentity.staticSunDepthSourceSha256
            }
        });
        if (verified.compatibility?.compatible !== true) {
            throw new Error(`Package '${lightingProfileId}' is not runtime compatible`);
        }
        if (canonicalJsonStringify(verified.manifest?.source)
                !== canonicalJsonStringify(sourceAuthority.packageManifestSource)
            || canonicalJsonStringify(verified.manifest?.compiler?.descriptor)
                !== canonicalJsonStringify(receipt.compilerDescriptor)
            || verified.manifest?.compiler?.signatureSha256
                !== receipt.compilerSignatureSha256) {
            throw new Error(
                `Package '${lightingProfileId}' source or compiler differs from authenticated evidence`
            );
        }
        authenticatePublishedStaticSunDepthPackage(
            verified,
            descriptor,
            staticSunPayload,
            lightingProfileId
        );
        profileCertifications.push(certification);
    }

    let labValidationEvidence = null;
    if (normalized.labValidationReportPath !== null) {
        const labValidationBytes = await readTrustedBytes(
            normalized.repoRoot,
            normalized.labValidationReportPath,
            'Lab validation report',
            readFileFn,
            lstatFn
        );
        const labValidationRawSha256 = rawSha256(labValidationBytes);
        if (normalized.expectedLabValidationReportSha256
            !== labValidationRawSha256) {
            throw new Error('Lab validation report differs from its explicit expected hash');
        }
        const labReport = parseJsonBytes(
            labValidationBytes,
            'Lab validation report'
        );
        const labCaptureAuthentication = await authenticateValidationCaptureSet({
            authorityRoot: normalized.validationCaptureAuthorityRoot,
            cases: labReport.cases,
            expectedCaseIds: EXPECTED_LAB_CASE_IDS,
            expectedCaptureCount: 24,
            expectedDimensionsPixels: [1280, 720],
            lstatFn,
            readFileFn,
            repoRoot: normalized.repoRoot
        });
        if (canonicalJsonStringify(labCaptureAuthentication)
            !== canonicalJsonStringify(labReport.captureAuthentication)) {
            throw new Error(
                'Lab validation capture summary differs from the independent rehash'
            );
        }
        labValidationEvidence = buildLabValidationEvidence({
            rawSha256: labValidationRawSha256,
            report: labReport
        });
    }
    let validationEvidence = null;
    if (normalized.validationReportPath !== null) {
        const validationBytes = await readTrustedBytes(
            normalized.repoRoot,
            normalized.validationReportPath,
            'production validation report',
            readFileFn,
            lstatFn
        );
        const validationRawSha256 = rawSha256(validationBytes);
        if (normalized.expectedValidationReportSha256 !== validationRawSha256) {
            throw new Error('Production validation report differs from its explicit expected hash');
        }
        const productionReport = parseJsonBytes(
            validationBytes,
            'production validation report'
        );
        const productionCaptureAuthentication =
            await authenticateProductionValidationCaptureSet({
                authorityRoot: normalized.validationCaptureAuthorityRoot,
                cases: productionReport.cases,
                expectedCaseIds: EXPECTED_PRODUCTION_CASE_IDS,
                expectedCaptureCount:
                    EXPECTED_PRODUCTION_CASE_IDS.length
                    * PRODUCTION_VALIDATION_CAPTURE_SLOTS.length,
                expectedDimensionsPixels: [1280, 720],
                lstatFn,
                readFileFn,
                repoRoot: normalized.repoRoot
            });
        if (canonicalJsonStringify(productionCaptureAuthentication)
            !== canonicalJsonStringify(productionReport.captureAuthentication)) {
            throw new Error(
                'Production validation capture summary differs from the independent rehash'
            );
        }
        validationEvidence = buildProductionValidationEvidence({
            packageIndex,
            packageIndexPath: repositoryRelativePath(
                normalized.repoRoot,
                normalized.packageIndexPath
            ),
            profileCertifications,
            rawSha256: validationRawSha256,
            report: productionReport
        });
    }
    const certification = buildProductionReleaseCertification({
        expectedLabValidationReportSha256:
            normalized.expectedLabValidationReportSha256,
        expectedValidationReportSha256: normalized.expectedValidationReportSha256,
        labValidationEvidence,
        packageIndex,
        packageIndexSha256: rawSha256(packageIndexBytes),
        profileCertifications,
        validationEvidence
    });
    await mkdirFn(path.dirname(normalized.outputPath), { recursive: true });
    await writeFileFn(normalized.outputPath, canonicalJsonBytes(certification));
    return Object.freeze({ certification, outputPath: normalized.outputPath });
}

function normalizeOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Release certification options must be an object');
    }
    const normalized = {};
    for (const key of [
        'artifactRoot',
        'inputPath',
        'outputPath',
        'packageIndexPath',
        'repoRoot'
    ]) {
        if (typeof options[key] !== 'string' || !options[key]) {
            throw new TypeError(`Release certification option '${key}' must be a path`);
        }
        normalized[key] = path.resolve(options[key]);
    }
    requireInsideArtifactRoot(normalized.artifactRoot, normalized.outputPath, true);
    requireInsideArtifactRoot(normalized.artifactRoot, normalized.packageIndexPath, false);
    const expectedArtifactAuthority = path.join(
        normalized.repoRoot,
        'tests',
        'artifacts',
        'illumination_531'
    );
    requireInsideArtifactRoot(expectedArtifactAuthority, normalized.artifactRoot, true);
    requireInsideRepository(normalized.repoRoot, normalized.inputPath, false);
    normalized.validationCaptureAuthorityRoot = path.join(
        normalized.repoRoot,
        'tests',
        'artifacts',
        'screens',
        'illumination_531'
    );
    requireInsideRepository(
        normalized.repoRoot,
        normalized.validationCaptureAuthorityRoot,
        false
    );
    if (path.dirname(normalized.outputPath) !== normalized.artifactRoot
        || normalized.outputPath === normalized.packageIndexPath) {
        throw new Error(
            'Release certification output must be a distinct file at the artifact root'
        );
    }
    const expected = options.expectedValidationReportSha256 ?? null;
    if (expected !== null && (typeof expected !== 'string' || !HASH_PATTERN.test(expected))) {
        throw new TypeError('expectedValidationReportSha256 must be a lowercase SHA-256');
    }
    normalized.expectedValidationReportSha256 = expected;
    const validationReportPath = options.validationReportPath ?? null;
    normalized.validationReportPath = validationReportPath === null
        ? null
        : path.resolve(validationReportPath);
    if (normalized.validationReportPath !== null) {
        requireInsideRepository(normalized.repoRoot, normalized.validationReportPath, false);
        requireInsideArtifactRoot(
            normalized.validationCaptureAuthorityRoot,
            normalized.validationReportPath,
            false
        );
        if (normalized.validationReportPath === normalized.outputPath) {
            throw new Error('Release certification output must differ from its validation report');
        }
        if (expected === null) {
            throw new Error(
                'A production validation report requires an independent --validation-report-sha256'
            );
        }
    }
    const expectedLab = options.expectedLabValidationReportSha256 ?? null;
    if (expectedLab !== null
        && (typeof expectedLab !== 'string' || !HASH_PATTERN.test(expectedLab))) {
        throw new TypeError(
            'expectedLabValidationReportSha256 must be a lowercase SHA-256'
        );
    }
    normalized.expectedLabValidationReportSha256 = expectedLab;
    const labValidationReportPath = options.labValidationReportPath ?? null;
    normalized.labValidationReportPath = labValidationReportPath === null
        ? null
        : path.resolve(labValidationReportPath);
    if (normalized.labValidationReportPath !== null) {
        requireInsideRepository(
            normalized.repoRoot,
            normalized.labValidationReportPath,
            false
        );
        requireInsideArtifactRoot(
            normalized.validationCaptureAuthorityRoot,
            normalized.labValidationReportPath,
            false
        );
        if (normalized.labValidationReportPath === normalized.outputPath
            || normalized.labValidationReportPath === normalized.validationReportPath) {
            throw new Error(
                'Lab validation report must differ from release output and production report'
            );
        }
        if (expectedLab === null) {
            throw new Error(
                'A Lab validation report requires an independent --lab-validation-report-sha256'
            );
        }
    }
    return Object.freeze(normalized);
}

function validatePublicationBoundary(publication, lightingProfileId, indexed) {
    if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
        throw new TypeError(`Publication '${lightingProfileId}' must be an object`);
    }
    const keys = Object.keys(publication).sort();
    const expectedKeys = [
        'files',
        'inputIdentitySha256',
        'lightingProfileId',
        'packageAggregateSha256',
        'packageIndexEntry',
        'schema',
        'status'
    ].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)
        || publication.schema !== PUBLICATION_SCHEMA
        || publication.status !== 'complete'
        || publication.lightingProfileId !== lightingProfileId
        || !HASH_PATTERN.test(publication.inputIdentitySha256)
        || !HASH_PATTERN.test(publication.packageAggregateSha256)
        || canonicalJsonStringify(publication.packageIndexEntry)
            !== canonicalJsonStringify({
                lightingProfileId,
                liveIdentity: indexed.liveIdentity,
                packagePath: indexed.packagePath
            })) {
        throw new Error(`Publication '${lightingProfileId}' is incomplete or stale`);
    }
    if (!Array.isArray(publication.files) || publication.files.length === 0) {
        throw new Error(`Publication '${lightingProfileId}' has no file inventory`);
    }
    let previousPath = null;
    for (const entry of publication.files) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)
            || JSON.stringify(Object.keys(entry).sort())
                !== JSON.stringify(['byteLength', 'path', 'sha256'])
            || !Number.isSafeInteger(entry.byteLength)
            || entry.byteLength <= 0
            || typeof entry.path !== 'string'
            || !entry.path
            || !isSafeRelativePath(entry.path)
            || !HASH_PATTERN.test(entry.sha256)
            || (previousPath !== null && previousPath >= entry.path)) {
            throw new Error(`Publication '${lightingProfileId}' file inventory is invalid`);
        }
        previousPath = entry.path;
    }
    for (const requiredPath of REQUIRED_PUBLICATION_FILES) {
        if (!publication.files.some((entry) => entry.path === requiredPath)) {
            throw new Error(
                `Publication '${lightingProfileId}' is missing '${requiredPath}'`
            );
        }
    }
}

function resolvePublishedFile(profileRoot, relativePath, lightingProfileId) {
    if (!isSafeRelativePath(relativePath)) {
        throw new TypeError(
            `Publication '${lightingProfileId}' contains an unsafe file path`
        );
    }
    const resolved = path.resolve(profileRoot, ...relativePath.split('/'));
    requireInsideArtifactRoot(profileRoot, resolved, false);
    return resolved;
}

function isSafeRelativePath(value) {
    return typeof value === 'string'
        && value.length > 0
        && !value.includes('\\')
        && !value.startsWith('/')
        && !/^[A-Za-z]:/.test(value)
        && path.posix.normalize(value) === value
        && !value.split('/').includes('..');
}

function resolveRepositoryFile(root, relativePath, label) {
    if (typeof relativePath !== 'string'
        || relativePath.includes('\\')
        || relativePath.startsWith('/')
        || path.posix.normalize(relativePath) !== relativePath
        || relativePath.split('/').includes('..')) {
        throw new TypeError(`${label} path must be canonical and repository-relative`);
    }
    const resolved = path.resolve(root, ...relativePath.split('/'));
    requireInsideRepository(root, resolved, false);
    return resolved;
}

function requireInsideArtifactRoot(root, candidate, allowRoot) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if ((!allowRoot && !relative)
        || relative.startsWith('..')
        || path.isAbsolute(relative)) {
        throw new Error('Release certification path must stay inside the artifact root');
    }
}

function requireInsideRepository(root, candidate, allowRoot) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    if ((!allowRoot && !relative)
        || relative.startsWith('..')
        || path.isAbsolute(relative)) {
        throw new Error('Release certification input must stay inside the repository');
    }
}

function repositoryRelativePath(root, filePath) {
    requireInsideRepository(root, filePath, false);
    return path.relative(root, filePath).replaceAll('\\', '/');
}

async function buildSourceAuthority(manifest, packageBytes, packageRawSha256) {
    if (manifest.source?.cityId !== 'bigcity2') {
        throw new Error("AI531 source package city must be 'bigcity2'");
    }
    const sourceIdentity = deriveProductionSourceIdentityHashes(manifest);
    const channelProfileSha256 = getNamedSourceHash(
        manifest.hashes?.channels,
        'static_sun_depth',
        'source manifest.hashes.channels'
    );
    const channelSourceSha256 = getNamedSourceHash(
        manifest.hashes?.channelSources,
        'static_sun_depth',
        'source manifest.hashes.channelSources'
    );
    const finalFileDomainSha256 = await sha256Hex(
        FINAL_FILE_HASH_DOMAIN,
        packageBytes
    );
    for (const [label, value] of [
        ['source manifest.hashes.geometry', manifest.hashes?.geometry],
        ['source manifest.hashes.resolvedSource', manifest.hashes?.resolvedSource],
        ['source manifest.hashes.usedMaterials', manifest.hashes?.usedMaterials]
    ]) {
        if (!HASH_PATTERN.test(value)) {
            throw new TypeError(`${label} must be a lowercase SHA-256`);
        }
    }
    const receiptInput = {
        alphaSemanticsSha256: sourceIdentity.alphaSemanticsSha256,
        casterInventorySha256: sourceIdentity.casterInventorySha256,
        channelSourceSha256,
        finalFileDomainSha256,
        geometrySha256: manifest.hashes.geometry,
        packageRawSha256,
        resolvedSourceSha256: manifest.hashes.resolvedSource,
        usedMaterialsSha256: manifest.hashes.usedMaterials
    };
    const packageSource = {
        ...receiptInput,
        cityId: manifest.source.cityId,
        schema: 'bus-sim-static-sun-depth-production-source-v1'
    };
    return Object.freeze({
        channelProfileSha256,
        cityId: manifest.source.cityId,
        packageManifestSource: {
            descriptor: packageSource,
            descriptorSha256: rawSha256(canonicalJsonBytes(packageSource)),
            resolvedSourceSha256: packageSource.resolvedSourceSha256
        },
        receiptInput
    });
}

function getNamedSourceHash(entries, id, label) {
    if (!Array.isArray(entries)) throw new TypeError(`${label} must be an array`);
    const matches = entries.filter((entry) => entry?.id === id);
    if (matches.length !== 1 || !HASH_PATTERN.test(matches[0].sha256)) {
        throw new Error(`${label} must contain exactly one valid '${id}' hash`);
    }
    return matches[0].sha256;
}

function bytesEqual(leftValue, rightValue) {
    let left;
    let right;
    try {
        left = copyBytes(leftValue, 'verified package chunk');
        right = copyBytes(rightValue, 'published static-sun RG8 payload');
    } catch {
        return false;
    }
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

/**
 * @param {Readonly<Record<string, any>>} verified
 * @param {unknown} publishedDescriptor
 * @param {ArrayBufferView|ArrayBuffer} publishedPayloadValue
 * @param {string} lightingProfileId
 */
export function authenticatePublishedStaticSunDepthPackage(
    verified,
    publishedDescriptor,
    publishedPayloadValue,
    lightingProfileId
) {
    if (verified?.compatibility?.compatible !== true) {
        throw new Error(`Package '${lightingProfileId}' is not runtime compatible`);
    }
    const normalizedPublishedDescriptor = validateStaticSunDepthTileSetDescriptor(
        publishedDescriptor
    );
    let resolved;
    try {
        resolved = requireProductionStaticSunDepthChunkWindows(verified.chunks);
    } catch (cause) {
        throw new Error(
            `Package chunk '${lightingProfileId}' differs from the published descriptor or RG8 payload`,
            {cause}
        );
    }
    const stored = normalizedPublishedDescriptor.tiles[0].storedTexels;
    const expectedDimensions = {
        components: 2,
        depth: normalizedPublishedDescriptor.tiles.length,
        height: stored[1],
        width: stored[0]
    };
    const publishedPayload = copyBytes(
        publishedPayloadValue,
        `published static-sun RG8 payload '${lightingProfileId}'`
    );
    const assembled = new Uint8Array(resolved.assembledByteLength);
    let writeOffset = 0;
    if (!Array.isArray(verified.chunks)
        || verified.chunks.length !== resolved.sourceChunks.length) {
        throw new Error(
            `Package chunk '${lightingProfileId}' differs from the published descriptor or RG8 payload`
        );
    }
    for (let index = 0; index < verified.chunks.length; index += 1) {
        const verifiedChunk = verified.chunks[index];
        const sourceChunk = resolved.sourceChunks[index];
        const data = copyBytes(
            verifiedChunk?.data,
            `verified package chunk '${sourceChunk.id}'`
        );
        if (verifiedChunk?.descriptor?.id !== sourceChunk.id
            || data.byteLength !== sourceChunk.byteLength
            || rawSha256(data) !== sourceChunk.sha256
            || writeOffset + data.byteLength > assembled.byteLength) {
            throw new Error(
                `Package chunk '${lightingProfileId}' differs from the published descriptor or RG8 payload`
            );
        }
        assembled.set(data, writeOffset);
        writeOffset += data.byteLength;
    }
    const mismatches = [];
    if (canonicalJsonStringify(resolved.dimensions)
            !== canonicalJsonStringify(expectedDimensions)) mismatches.push('dimensions');
    if (canonicalJsonStringify(resolved.outputDescriptor)
            !== canonicalJsonStringify(normalizedPublishedDescriptor)) mismatches.push('descriptor');
    if (writeOffset !== resolved.assembledByteLength) mismatches.push('assembled_byte_length');
    if (rawSha256(assembled) !== resolved.assembledSha256) mismatches.push('assembled_sha256');
    if (publishedPayload.byteLength !== resolved.assembledByteLength) {
        mismatches.push('published_byte_length');
    }
    if (rawSha256(publishedPayload) !== resolved.assembledSha256) {
        mismatches.push('published_sha256');
    }
    if (!bytesEqual(assembled, publishedPayload)) mismatches.push('published_bytes');
    if (mismatches.length > 0) {
        throw new Error(
            `Package chunk '${lightingProfileId}' differs from the published descriptor or RG8 payload:`
            + ` ${mismatches.join(', ')}`
        );
    }
    return Object.freeze({
        assembledByteLength: resolved.assembledByteLength,
        assembledSha256: resolved.assembledSha256,
        dimensions: resolved.dimensions,
        outputDescriptor: resolved.outputDescriptor
    });
}

async function readTrustedBytes(root, filePath, label, readFileFn, lstatFn) {
    await assertNoSymlinkPathSegments(root, filePath, lstatFn);
    return copyBytes(await readFileFn(filePath), label);
}

async function assertNoSymlinkPathSegments(root, candidate, lstatFn, allowMissingLeaf = false) {
    const absoluteRoot = path.resolve(root);
    const absoluteCandidate = path.resolve(candidate);
    const relative = path.relative(absoluteRoot, absoluteCandidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Release certification path escapes its trusted root');
    }
    const segments = relative === '' ? [] : relative.split(path.sep);
    const paths = [absoluteRoot];
    let current = absoluteRoot;
    for (const segment of segments) {
        current = path.join(current, segment);
        paths.push(current);
    }
    for (let index = 0; index < paths.length; index += 1) {
        let entry;
        try {
            entry = await lstatFn(paths[index]);
        } catch (error) {
            const missingLeaf = allowMissingLeaf
                && index === paths.length - 1
                && error?.code === 'ENOENT';
            if (missingLeaf) return;
            throw error;
        }
        if (entry?.isSymbolicLink?.() === true) {
            throw new Error(
                `Release certification rejects symbolic-link path segment '${paths[index]}'`
            );
        }
    }
}

function parseCanonicalJsonBytes(bytes, label) {
    const value = parseJsonBytes(bytes, label);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (canonicalJsonStringify(value) !== text) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function parseJsonBytes(bytes, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
        throw new Error(`${label} is not valid UTF-8`, { cause: error });
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${label} is not valid JSON`, { cause: error });
    }
}

function copyBytes(value, label) {
    if (value instanceof Uint8Array) return value.slice();
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    throw new TypeError(`${label} must be bytes`);
}

function rawSha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

async function run(argv = process.argv.slice(2)) {
    const options = parseProductionReleaseCertificationArgs(argv);
    if (options.help) {
        process.stdout.write(createProductionReleaseCertificationUsageText());
        return;
    }
    const result = await finalizeProductionReleaseCertification(options);
    process.stdout.write(canonicalJsonStringify({
        output: repositoryRelativePath(repoRoot, result.outputPath),
        performancePromotionEligible:
            result.certification.performancePromotionEligible,
        releaseEligible: result.certification.releaseEligible,
        status: result.certification.status
    }) + '\n');
    if (!result.certification.releaseEligible) process.exitCode = 2;
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch((error) => {
        process.stderr.write(`[StaticSunDepthReleaseCertification] ${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
