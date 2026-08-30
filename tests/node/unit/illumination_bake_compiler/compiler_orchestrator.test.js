// Verifies cross-runtime script hashing, environment isolation, receipt adaptation, and CLI parsing.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import { validateIntermediateManifest } from '../../../../tools/illumination_bake_compiler/src/IntermediateManifest.mjs';
import { CompilerError } from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';
import {
    adaptBlenderCompileReceipt,
    computeCompilerScriptInventory,
    createIsolatedBlenderEnvironment
} from '../../../../tools/illumination_bake_compiler/src/CompilerOrchestrator.mjs';
import { parseCompilerCli } from '../../../../tools/illumination_bake_compiler/run.mjs';

const HASHES = Object.freeze({
    archive: '0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c',
    executable: '8f7a131ad8bc148edc218b334f07d92a57f5a357fa66d913b290537fd8353c06',
    profile: 'a'.repeat(64),
    toolchain: 'b'.repeat(64),
    script: 'c'.repeat(64),
    package: 'd'.repeat(64)
});

async function realContracts() {
    const toolchain = JSON.parse(await readFile('tools/illumination_bake_compiler/toolchain.v1.json', 'utf8'));
    const profile = JSON.parse(await readFile('tools/illumination_bake_compiler/profiles/proof_cpu_1.v1.json', 'utf8'));
    return { toolchain, profile };
}

function fixture(toolchain, profile) {
    const channelSources = [
        { id: 'direct_receiver', sha256: '1'.repeat(64) },
        { id: 'indirect_irradiance', sha256: '2'.repeat(64) },
        { id: 'static_ao_bent_normal', sha256: '3'.repeat(64) },
        { id: 'static_sun_depth', sha256: '4'.repeat(64) }
    ];
    const inputManifest = {
        format: 'bus-sim-illumination-bake-input-v1',
        schemaVersion: 1,
        hashes: {
            channelSources,
            geometry: '5'.repeat(64),
            resolvedSource: '6'.repeat(64),
            usedMaterials: '7'.repeat(64)
        },
        buffers: [{}], casterMappings: [{}], geometries: [{}], meshInstances: [{}],
        materials: [{}], objects: [{}], receiverMappings: [{}], textures: []
    };
    const context = {
        toolchain,
        profile,
        profileSha256: HASHES.profile,
        toolchainSha256: HASHES.toolchain,
        compilerScriptSha256: HASHES.script,
        packageRawSha256: HASHES.package,
        inputManifest,
        reconstructionPlan: {
            summary: {
                alphaInputCount: 1,
                geometryCount: 1,
                materialCount: 1,
                meshInstanceCount: 1,
                objectOrder: 'stable_id_ascending',
                stableIdsPreserved: true,
                textureCount: 0
            }
        },
        reconstructionMode: 'validate',
        jobs: ['direct']
    };
    const outputId = 'proof_diffuse_direct_only';
    const receipt = {
        checks: {
            alphaCutout: {
                coveredCells: 33,
                opaqueTriangleCount: 66,
                policy: 'exact_scalar_coverage_threshold_compiled_to_silhouette_geometry',
                status: 'verified',
                transparentCells: 31
            },
            channelIsolation: {
                aoSeparate: true,
                diffuseDirectPassFilter: ['DIRECT'],
                diffuseIndirectPassFilter: true,
                pairwiseDecodedPixelsDistinct: true,
                receiverColorExcludedFromLightOnlyChannels: true,
                status: 'verified'
            },
            normal: { expected: ['0', '0', '1'], status: 'verified' },
            profile: { adaptiveSampling: false, denoise: false, samples: 32, seed: 529 },
            transform: { sourcePoint: ['1', '2', '3'], status: 'verified', targetPoint: ['1', '-3', '2'] },
            uv: { logicalOrigin: 'lower_left', status: 'verified', vFlip: false }
        },
        compiler: {
            archiveSha256: HASHES.archive,
            architecture: 'x86_64',
            backend: 'cycles_cpu',
            blenderBuildHash: '9e2066aef7ef',
            blenderVersion: [5, 2, 1],
            blenderVersionString: '5.2.1 LTS',
            executableSha256: HASHES.executable,
            fixedThreadCount: 1,
            operatingSystem: 'Windows'
        },
        configuration: { compilerScriptSha256: HASHES.script, profileSha256: HASHES.profile, toolchainSha256: HASHES.toolchain },
        input: {
            channelSourceSha256: Object.fromEntries(channelSources.map((entry) => [entry.id, entry.sha256])),
            finalFileDomainSha256: '8'.repeat(64),
            geometrySha256: '5'.repeat(64),
            packageRawSha256: HASHES.package,
            resolvedSourceSha256: '6'.repeat(64),
            usedMaterialsSha256: '7'.repeat(64)
        },
        intermediateManifests: [{ byteLength: 1, jobId: outputId, path: `channels/${outputId}/${outputId}.manifest.json`, sha256: '9'.repeat(64) }],
        outputs: [{
            canonicalDecoded: {
                byteLength: 32 * 32 * 4 * 4,
                encoding: 'little_endian_ieee754_float32_rgba_tightly_packed',
                path: `canonical/${outputId}.rgba.f32le`,
                sha256: 'a'.repeat(64)
            },
            channelDescriptor: { semantic: 'diffuse_direct_only_proof_v1' },
            dimensions: { channels: 4, height: 32, width: 32 },
            jobId: outputId,
            pixelStatistics: { alphaNonzeroCount: 1024, alphaZeroCount: 0, componentMaximumF32: '0000803f', componentMinimumF32: '00000000' },
            rawContainer: {
                byteLength: 100,
                codec: 'openexr_zip_lossless',
                path: `raw/${outputId}.raw.exr`,
                precision: 'float32_per_channel',
                sha256: 'b'.repeat(64)
            },
            rowOrder: 'blender_image_buffer_lower_left_origin_rows'
        }],
        profile: {
            applied: {
                alphaCutoutPolicy: 'compile_exact_coverage_threshold_to_silhouette_geometry',
                bakeTarget: 'IMAGE_TEXTURES',
                colorManagement: 'scene_linear_raw_no_display_transform',
                cyclesDevice: 'CPU',
                depthPrecision: 'rgba_float32_openexr_and_canonical_f32le',
                depthSampling: 'orthographic_nearest_visible_surface',
                dof: false,
                motionBlur: false,
                profileId: profile.id,
                samplingPattern: 'TABULATED_SOBOL',
                threadCount: 1,
                uvOrigin: 'lower_left',
                world: 'explicit_profile_linear_color_and_strength'
            },
            id: profile.id,
            rawSha256: HASHES.profile
        },
        reconstruction: {
            inventory: {
                bufferCount: 1,
                casterMappingCount: 1,
                channelIds: ['direct_receiver', 'indirect_irradiance', 'static_ao_bent_normal', 'static_sun_depth'],
                geometryCount: 1,
                instanceCount: 1,
                materialCount: 1,
                objectCount: 1,
                receiverMappingCount: 1,
                semanticBufferDigestsVerified: true,
                textureCount: 0
            },
            mode: 'validate',
            stableIdOrdering: 'canonical_ascending',
            stableIdsPreservedAsCustomMetadata: true
        },
        schema: 'bus-sim-illumination-blender-compile-receipt-v1',
        status: 'complete'
    };
    return { context, receipt };
}

test('compiler script inventory exactly matches Python canonical filename-sorted hashing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai529-inventory-'));
    try {
        await writeFile(path.join(root, 'z.py'), 'z');
        await writeFile(path.join(root, 'compiler.py'), 'compiler');
        await writeFile(path.join(root, 'ignored.txt'), 'ignored');
        const result = await computeCompilerScriptInventory(root);
        assert.deepEqual(result.inventory.map((entry) => entry.path), ['compiler.py', 'z.py']);
        assert.equal(result.sha256, createHash('sha256').update(canonicalJsonStringify(result.inventory)).digest('hex'));
        assert.equal(result.serialized, canonicalJsonStringify(result.inventory));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('Blender environment has no inherited user paths and isolates all writable state under stage', () => {
    const isolated = createIsolatedBlenderEnvironment({
        stagingPath: 'C:/artifacts/stage.partial',
        executablePath: 'C:/portable/blender.exe',
        hostEnv: { SystemRoot: 'C:/Windows', COMSPEC: 'C:/Windows/System32/cmd.exe', HOME: 'C:/Users/test', APPDATA: 'C:/Users/test/AppData' }
    });
    assert.equal(isolated.env.HOME, undefined);
    assert.equal(isolated.env.APPDATA, undefined);
    assert.equal(isolated.env.PYTHONNOUSERSITE, '1');
    for (const key of ['TEMP', 'TMP', 'BLENDER_USER_CONFIG', 'BLENDER_USER_SCRIPTS', 'BLENDER_USER_EXTENSIONS', 'BLENDER_USER_DATAFILES']) {
        assert.equal(path.relative(path.resolve('C:/artifacts/stage.partial'), path.resolve(isolated.env[key])).startsWith('..'), false);
    }
});

test('strict Python receipt adaptation produces a valid portable intermediate manifest', async () => {
    const { toolchain, profile } = await realContracts();
    const { receipt, context } = fixture(toolchain, profile);
    const adapted = adaptBlenderCompileReceipt(receipt, context);
    const validated = validateIntermediateManifest(adapted.manifest, { expectedOutputIds: adapted.expectedOutputIds });
    assert.equal(validated.compiler.versionString, '5.2.1 LTS');
    assert.equal(validated.outputs[0].channel, 'direct_receiver');
    assert.equal(canonicalJsonStringify(validated).includes('C:/'), false);

    const altered = structuredClone(receipt);
    altered.compiler.fixedThreadCount = 12;
    assert.throws(
        () => adaptBlenderCompileReceipt(altered, context),
        (error) => error instanceof CompilerError && error.code === 'blender_receipt_invalid'
    );
    const wrongInputHash = structuredClone(receipt);
    wrongInputHash.input.packageRawSha256 = '0'.repeat(64);
    assert.throws(
        () => adaptBlenderCompileReceipt(wrongInputHash, context),
        (error) => error instanceof CompilerError && error.code === 'blender_receipt_invalid'
    );
    const traversal = structuredClone(receipt);
    traversal.outputs[0].rawContainer.path = '../escape.exr';
    assert.throws(
        () => adaptBlenderCompileReceipt(traversal, context),
        (error) => error instanceof CompilerError && error.code === 'blender_receipt_invalid'
    );
});

test('CLI supports documented profiles/repeat/jobs surface and rejects invalid inventories', () => {
    const parsed = parseCompilerCli(['--profiles', 'one.json,two.json', '--repeat', '3', '--jobs', 'depth,ao', '--reconstruction', 'full']);
    assert.equal(parsed.profiles.length, 2);
    assert.equal(parsed.repeat, 3);
    assert.deepEqual(parsed.jobs, ['depth', 'ao']);
    assert.equal(parsed.reconstruction, 'full');
    assert.throws(() => parseCompilerCli(['--jobs', 'depth,depth']), /unique subset/);
    assert.throws(() => parseCompilerCli(['--repeat', '0']), /positive safe integer/);
});
