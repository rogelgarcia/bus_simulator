#!/usr/bin/env node
// Builds per-caster spatial parity from the authenticated full native cutout field.

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
    canonicalJsonBytes,
    canonicalJsonStringify
} from '../../src/app/illumination/bake_source/CanonicalJson.js';
import {validateResolvedCityBakePackage} from
    '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import {
    captureLiveEvidence,
    compareAlphaCutoutEvidenceStreams,
    deriveAlphaCutoutParityEvidenceStreams
} from './capture_alpha_cutout_evidence.mjs';
import {
    buildProductionAlphaCutoutSpatialParityArtifactFromFiles
} from './src/ProductionAlphaCutoutParity.mjs';
import {
    buildProvisionalStaticSunDepthArtifact,
    validateProvisionalStaticSunDepthReceipt
} from './src/ProductionArtifact.mjs';
import {
    authenticateProductionStaticSunDepthReceipt,
    createProductionStaticSunRequest,
    loadProductionNativeCutoutField,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';
import {
    deriveProductionAlphaCutoutCoverageIdentity
} from './src/ProductionReleaseCertification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);

export function parseNativeFieldParityArguments(argv) {
    const options = {
        ai529Directory: path.join(repoRoot, 'tools/illumination_bake_compiler/blender'),
        archivePath: path.join(
            repoRoot,
            'tests/artifacts/illumination_529/toolchain/blender-5.2.1-windows-x64.zip'
        ),
        executablePath: path.join(
            repoRoot,
            'tests/artifacts/illumination_529/toolchain/portable',
            'blender-5.2.1-windows-x64/blender.exe'
        ),
        inputPath: path.join(
            repoRoot,
            'tests/artifacts/illumination_528/packages/bigcity2/ai531-production/bigcity2.bsib'
        ),
        nativeCutoutRoot: path.join(
            artifactRoot,
            'native_cutout_fields/release-v1'
        ),
        diagnostic: false,
        port: 4173,
        productionRoot: path.join(artifactRoot, 'provisional_native_v1'),
        profileId: 'ai527.sun.az135.el08',
        profilePath: path.join(
            repoRoot,
            'tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'
        ),
        rendererPath: path.join(here, 'blender/production_static_sun.py'),
        toolchainPath: path.join(repoRoot, 'tools/illumination_bake_compiler/toolchain.v1.json')
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        if (flag === '--diagnostic') {
            options.diagnostic = true;
            continue;
        }
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--input': options.inputPath = path.resolve(repoRoot, value); break;
            case '--profile-id': options.profileId = value; break;
            case '--output-root': options.outputRoot = assertArtifactChild(value); break;
            case '--production-root':
                options.productionRoot = assertArtifactChild(value, true);
                break;
            case '--native-cutout-root':
                options.nativeCutoutRoot = assertArtifactChild(value, true);
                break;
            case '--url': options.baseUrl = requireLoopbackUrl(value); break;
            case '--port': options.port = positiveInteger(value, flag); break;
            default: throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (!options.outputRoot) throw new TypeError('--output-root is required');
    selectProductionStaticSunProfiles([options.profileId]);
    return Object.freeze(options);
}

export function nativeFieldParityUsage() {
    return `AI 531 native-field alpha parity\n\nUsage:\n  node tools/static_sun_depth/build_alpha_cutout_native_field_parity.mjs --profile-id <id> --output-root <artifact-child> [--diagnostic]\n`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseNativeFieldParityArguments(argv);
    if (options.help) {
        process.stdout.write(nativeFieldParityUsage());
        return;
    }
    await requireNewRoot(options.outputRoot);
    await mkdir(path.dirname(options.outputRoot), {recursive: true});
    await mkdir(options.outputRoot, {recursive: false});
    const profile = selectProductionStaticSunProfiles([options.profileId])[0];
    const authority = await prepareProductionAuthority(options);
    const sourceBytes = await readFile(options.inputPath);
    const source = await validateResolvedCityBakePackage(sourceBytes);
    if (source.report?.valid !== true) {
        throw new Error('Native-field parity source BSIB is invalid');
    }
    const expectedCasterIds = source.manifest.casterMappings
        .filter((entry) => entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout')
        .map((entry) => entry.id)
        .sort(compareStrings);
    const provisional = await loadProvisionalProductionProfile(
        options.productionRoot,
        profile,
        authority
    );
    const nativeField = await loadProductionNativeCutoutField({
        allowUnpromotedNativeCutoutField: true,
        authority,
        options,
        profile
    });
    const receiptField = provisional.receipt.alphaCertification.nativeCutoutField;
    if (receiptField.receiptSha256 !== nativeField.sha256
        || receiptField.outputProjectionSha256
            !== nativeField.outputProjectionSha256) {
        throw new Error('Provisional production output and native cutout authority differ');
    }
    const live = await captureLiveEvidence({
        baseUrl: options.baseUrl,
        coverageDomain: 'mixed_foliage_meshes',
        descriptor: provisional.descriptor,
        expectedCasterIds,
        port: options.port,
        profile
    });
    const samplePlanBytes = canonicalJsonBytes(live.samplePlan);
    const liveOccupancyBytes = Uint8Array.from(live.liveOccupancy);
    const liveDepthBytes = encodeFloat32Le(live.liveFirstHitDepthMeters);
    const bake = await sampleNativeField({
        field: nativeField.receipt,
        fieldRoot: path.dirname(nativeField.path),
        samplePlan: live.samplePlan,
        sourceCameraOriginDepthMetersInCacheBasis:
            live.bakeSampleRequest.depthReference
                .sourceCameraOriginDepthMetersInCacheBasis
    });
    const comparison = compareAlphaCutoutEvidenceStreams({
        bakeDepthBytes: bake.depthBytes,
        bakeOccupancyBytes: bake.occupancyBytes,
        liveDepthBytes,
        liveOccupancyBytes,
        samplePlan: live.samplePlan
    });
    if (comparison.status !== 'passed' && !options.diagnostic) {
        throw new Error(`Native-field parity mismatch: ${canonicalJsonStringify(comparison)}`);
    }
    const compact = deriveAlphaCutoutParityEvidenceStreams({
        bakeDepthBytes: bake.depthBytes,
        bakeOccupancyBytes: bake.occupancyBytes,
        liveDepthBytes,
        liveOccupancyBytes
    });
    const parityRoot = path.join(options.outputRoot, 'parity');
    await mkdir(parityRoot, {recursive: false});
    const evidence = await writeEvidenceFiles(parityRoot, {
        bakeFirstHitDepth: compact.bakeFirstHitDepthBytes,
        bakeOccupancy: bake.occupancyBytes,
        comparison: compact.comparisonBytes,
        liveFirstHitDepth: compact.liveFirstHitDepthBytes,
        liveOccupancy: liveOccupancyBytes,
        samplePlan: samplePlanBytes
    });
    const coverage = deriveProductionAlphaCutoutCoverageIdentity(source.manifest);
    const metadata = {
        alphaSemanticsSha256: authority.sourceIdentityHashes.alphaSemanticsSha256,
        casterInventorySha256: authority.sourceIdentityHashes.casterInventorySha256,
        cutoutBindingProjectionSha256: coverage.cutoutBindingProjectionSha256,
        cutoutCasterCount: coverage.cutoutCasterCount,
        cutoutCasterIdsSha256: coverage.cutoutCasterIdsSha256,
        descriptorSha256: sha256(canonicalJsonBytes(provisional.descriptor)),
        lightingProfileId: profile.id,
        liveDepthAttachmentIdentitySha256: sha256(canonicalJsonBytes({
            captureMethod: live.receipt.captureMethod,
            captureSchema: live.receipt.captureSchema,
            coverageDomain: live.receipt.coverage.domain,
            schema: 'ai531-production-mixed-foliage-live-depth-attachment-proof-v2',
            sourceProof: live.receipt.nativeCapture.sourceProof,
            transfer: live.receipt.nativeCapture.transfer
        })),
        samplePlanSha256: sha256(samplePlanBytes),
        unsupportedBindingIds: coverage.unsupportedBindingIds
    };
    const artifact = options.diagnostic ? null
        : await buildProductionAlphaCutoutSpatialParityArtifactFromFiles({
            authorityRoot: parityRoot,
            evidence,
            metadata,
            repoRoot
        });
    const files = {
        'bake_sample_request.json': canonicalJsonBytes(live.bakeSampleRequest),
        'comparison.json': canonicalJsonBytes(comparison),
        'live_capture_receipt.json': canonicalJsonBytes(live.receipt),
        'native_field_identity.json': canonicalJsonBytes({
            method: nativeField.receipt.method,
            outputProjectionSha256: nativeField.outputProjectionSha256,
            receiptSha256: nativeField.sha256,
            schema: 'ai531-native-mixed-foliage-field-parity-source-v2'
        }),
        'sample_plan.json': samplePlanBytes,
        ...(artifact ? {
            'spatial_parity_artifact.json': canonicalJsonBytes(artifact)
        } : {})
    };
    for (const [name, bytes] of Object.entries(files)) {
        await writeFile(path.join(options.outputRoot, name), bytes);
    }
    const report = {
        comparison,
        descriptorSha256: metadata.descriptorSha256,
        diagnostic: options.diagnostic,
        evidence,
        nativeCutoutFieldReceiptSha256: nativeField.sha256,
        performance: {
            eligibleForPromotion: false,
            reason: 'host-load-and-gpu-contention-declared-by-user'
        },
        producerSha256: sha256(await readFile(runnerPath)),
        productionEligible: !options.diagnostic && comparison.status === 'passed',
        schema: 'ai531-production-alpha-cutout-native-field-parity-run-v3',
        status: options.diagnostic ? 'diagnostic_complete' : 'complete'
    };
    await writeFile(
        path.join(options.outputRoot, 'run_report.json'),
        canonicalJsonBytes(report)
    );
    process.stdout.write(canonicalJsonStringify(report) + '\n');
}

async function loadProvisionalProductionProfile(root, profile, authority) {
    const profileRoot = path.join(root, profile.id);
    const receiptBytes = await readFile(
        path.join(profileRoot, 'production_static_sun_receipt.json')
    );
    const receipt = validateProvisionalStaticSunDepthReceipt(
        parseCanonicalJson(receiptBytes, 'provisional production receipt')
    );
    authenticateProductionStaticSunDepthReceipt(
        receipt,
        authority,
        createProductionStaticSunRequest(profile)
    );
    const interiorTiles = await Promise.all(receipt.outputs.map(async (output) => {
        const bytes = new Uint8Array(await readFile(path.join(profileRoot, output.path)));
        if (bytes.byteLength !== output.byteLength || sha256(bytes) !== output.sha256) {
            throw new Error(`Provisional production tile '${output.tileId}' failed authentication`);
        }
        return {bytes, coordinates: output.coordinates, id: output.tileId};
    }));
    const artifact = buildProvisionalStaticSunDepthArtifact({receipt, interiorTiles});
    if (artifact.artifactManifest.productionEligible !== false
        || artifact.artifactManifest.artifactClass !== 'provisional') {
        throw new Error('Parity bootstrap requires an explicitly provisional artifact');
    }
    return {descriptor: artifact.descriptor, receipt};
}

export async function sampleNativeField(options) {
    const {field, fieldRoot, samplePlan, sourceCameraOriginDepthMetersInCacheBasis} = options;
    const width = field.layout.layout.interiorPixels[0];
    const height = field.layout.layout.interiorPixels[1];
    const tileCountX = field.layout.layout.tileCount[0];
    const occupancyBytes = new Uint8Array(samplePlan.samples.length);
    const depths = new Float32Array(samplePlan.samples.length);
    const grouped = new Map();
    samplePlan.samples.forEach((sample, index) => {
        const [globalX, globalY] = sample.globalTexel;
        const tileX = Math.floor(globalX / width);
        const tileY = Math.floor(globalY / height);
        const localX = globalX - tileX * width;
        const localY = globalY - tileY * height;
        const tileIndex = tileY * tileCountX + tileX;
        if (tileX < 0 || tileY < 0
            || tileX >= field.layout.layout.tileCount[0]
            || tileY >= field.layout.layout.tileCount[1]
            || localX < 0 || localY < 0 || localX >= width || localY >= height) {
            throw new Error(`Sample ${index} escaped the native production lattice`);
        }
        if (!grouped.has(tileIndex)) grouped.set(tileIndex, []);
        grouped.get(tileIndex).push({index, localIndex: localY * width + localX});
    });
    for (const [tileIndex, samples] of grouped) {
        const output = field.outputs[tileIndex];
        const bytes = new Uint8Array(await readFile(path.join(fieldRoot, output.path)));
        if (bytes.byteLength !== output.byteLength || sha256(bytes) !== output.sha256) {
            throw new Error(`Native cutout field tile ${tileIndex} changed during parity sampling`);
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (const sample of samples) {
            const signedDepth = view.getFloat32(sample.localIndex * 4, true);
            if (signedDepth === 0) continue;
            const cameraDepth = Math.fround(
                signedDepth - sourceCameraOriginDepthMetersInCacheBasis
            );
            if (!Number.isFinite(cameraDepth) || cameraDepth <= 0) {
                throw new Error(`Native cutout sample ${sample.index} has invalid camera depth`);
            }
            occupancyBytes[sample.index] = 1;
            depths[sample.index] = cameraDepth;
        }
    }
    return {depthBytes: new Uint8Array(depths.buffer), occupancyBytes};
}

async function writeEvidenceFiles(root, streams) {
    const names = {
        bakeFirstHitDepth: 'bake_first_hit_depth.f32le',
        bakeOccupancy: 'bake_occupancy.u8',
        comparison: 'comparison.u8',
        liveFirstHitDepth: 'live_first_hit_depth.f32le',
        liveOccupancy: 'live_occupancy.u8',
        samplePlan: 'sample_plan.json'
    };
    const records = {};
    for (const [key, name] of Object.entries(names)) {
        const bytes = streams[key];
        const absolute = path.join(root, name);
        await writeFile(absolute, bytes);
        records[key] = {
            byteLength: bytes.byteLength,
            path: path.relative(repoRoot, absolute).replaceAll('\\', '/'),
            sha256: sha256(bytes)
        };
    }
    return records;
}

function parseCanonicalJson(bytes, label) {
    const value = JSON.parse(bytes);
    if (!Buffer.from(canonicalJsonBytes(value)).equals(bytes)) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function encodeFloat32Le(values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return bytes;
}

function assertArtifactChild(value, allowExisting = false) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Native-field parity paths must stay below illumination_531');
    }
    if (!allowExisting && existsSync(resolved)) {
        throw new Error('Native-field parity output already exists');
    }
    return resolved;
}

async function requireNewRoot(root) {
    try {
        await stat(root);
        throw new Error('Native-field parity output already exists');
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function requireLoopbackUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:'
        || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        throw new Error('--url must name a loopback HTTP server');
    }
    return url.origin;
}

function positiveInteger(value, label) {
    if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return Number(value);
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === runnerPath) {
    run().catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
