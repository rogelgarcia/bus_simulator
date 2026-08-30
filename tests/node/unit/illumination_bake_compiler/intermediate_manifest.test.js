// Verifies strict canonical intermediate manifests and output rehashing.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CompilerError } from '../../../../tools/illumination_bake_compiler/src/CompilerErrors.mjs';
import {
    INTERMEDIATE_CANONICAL_ENCODING,
    INTERMEDIATE_MANIFEST_SCHEMA,
    INTERMEDIATE_RAW_FORMAT,
    readIntermediateManifest,
    serializeIntermediateManifest,
    validateIntermediateManifest,
    validateIntermediateOutputs,
    writeIntermediateManifest
} from '../../../../tools/illumination_bake_compiler/src/IntermediateManifest.mjs';

const HASH = 'a'.repeat(64);

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function output(id, channel, rawBytes, canonicalBytes) {
    return {
        canonical: {
            byteLength: canonicalBytes.byteLength,
            components: 4,
            encoding: INTERMEDIATE_CANONICAL_ENCODING,
            height: 1,
            path: `canonical/${id}.rgba32f`,
            rowOrigin: 'lower_left',
            sha256: digest(canonicalBytes),
            width: 2
        },
        channel,
        descriptor: { semantic: `${channel}_proof_v1` },
        id,
        raw: {
            byteLength: rawBytes.byteLength,
            format: INTERMEDIATE_RAW_FORMAT,
            path: `raw/${id}.exr`,
            sha256: digest(rawBytes)
        }
    };
}

function manifest(outputs) {
    return {
        checks: [
            { id: 'canonical_pixels_hashed', passed: true },
            { id: 'outputs_complete', passed: true }
        ],
        compiler: {
            archiveSha256: HASH,
            architecture: 'x86_64',
            backend: 'cycles_cpu',
            buildHash: '9e2066aef7ef',
            buildPlatform: 'Windows',
            executableSha256: 'b'.repeat(64),
            threadCount: 1,
            version: [5, 2, 1],
            versionString: '5.2.1 LTS'
        },
        configuration: {
            compilerScriptSha256: 'c'.repeat(64),
            profileSha256: 'd'.repeat(64),
            toolchainSha256: 'e'.repeat(64)
        },
        input: {
            channelSources: [
                { id: 'direct_receiver', sha256: '1'.repeat(64) },
                { id: 'static_sun_depth', sha256: '2'.repeat(64) }
            ],
            format: 'bus-sim-illumination-bake-input-v1',
            geometrySha256: '3'.repeat(64),
            packageRawSha256: '4'.repeat(64),
            resolvedSourceSha256: '5'.repeat(64),
            schemaVersion: 1,
            usedMaterialsSha256: '6'.repeat(64)
        },
        outputs,
        profile: { id: 'ai529.proof.cycles_cpu.threads_1.v1', sha256: '7'.repeat(64) },
        reconstruction: {
            alphaInputCount: 1,
            geometryCount: 1,
            materialCount: 1,
            meshInstanceCount: 1,
            mode: 'scripted_clean_scene_v1',
            objectOrder: 'stable_id_ascending',
            stableIdsPreserved: true,
            textureCount: 0
        },
        schema: INTERMEDIATE_MANIFEST_SCHEMA
    };
}

async function withFixture(callback) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai529-manifest-'));
    const rawDepth = Buffer.from('raw-depth');
    const rawDirect = Buffer.from('raw-direct');
    const canonicalDepth = Buffer.alloc(32, 1);
    const canonicalDirect = Buffer.alloc(32, 2);
    const outputs = [
        output('diffuse_direct', 'direct_receiver', rawDirect, canonicalDirect),
        output('sun_depth_position', 'static_sun_depth', rawDepth, canonicalDepth)
    ];
    const value = manifest(outputs);
    try {
        await mkdir(path.join(root, 'raw'), { recursive: true });
        await mkdir(path.join(root, 'canonical'), { recursive: true });
        await writeFile(path.join(root, outputs[0].raw.path), rawDirect);
        await writeFile(path.join(root, outputs[0].canonical.path), canonicalDirect);
        await writeFile(path.join(root, outputs[1].raw.path), rawDepth);
        await writeFile(path.join(root, outputs[1].canonical.path), canonicalDepth);
        return await callback({ root, value, outputIds: outputs.map((entry) => entry.id) });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

test('canonical manifest enforces exact shapes, sorted IDs, and portable metadata', async () => {
    await withFixture(async ({ value, outputIds }) => {
        const validated = validateIntermediateManifest(value, { expectedOutputIds: outputIds });
        assert.equal(validated.schema, INTERMEDIATE_MANIFEST_SCHEMA);
        assert.equal(serializeIntermediateManifest(value), JSON.stringify(validated));

        const extra = structuredClone(value);
        extra.hostname = 'workstation';
        assert.throws(
            () => validateIntermediateManifest(extra),
            (error) => error instanceof CompilerError && error.code === 'intermediate_manifest_shape_invalid'
        );
        const hostMetadata = structuredClone(value);
        hostMetadata.outputs[0].descriptor.timestamp = 'today';
        assert.throws(
            () => validateIntermediateManifest(hostMetadata),
            (error) => error instanceof CompilerError && error.code === 'intermediate_manifest_nondeterministic_metadata'
        );
        const absolute = structuredClone(value);
        absolute.outputs[0].raw.path = 'C:/tmp/result.exr';
        assert.throws(() => validateIntermediateManifest(absolute), TypeError);
        const lossy = structuredClone(value);
        lossy.outputs[0].raw.format = 'png_srgb';
        assert.throws(
            () => validateIntermediateManifest(lossy),
            (error) => error instanceof CompilerError && error.code === 'intermediate_raw_format_unsupported'
        );
        const unsorted = structuredClone(value);
        unsorted.outputs.reverse();
        assert.throws(
            () => validateIntermediateManifest(unsorted),
            (error) => error instanceof CompilerError && error.code === 'intermediate_outputs_not_canonical'
        );
    });
});

test('output validation rehashes raw EXR and canonical decoded float32 bytes', async () => {
    await withFixture(async ({ root, value, outputIds }) => {
        const verified = await validateIntermediateOutputs({
            manifest: value,
            artifactDirectory: root,
            expectedOutputIds: outputIds
        });
        assert.deepEqual(verified.outputs.map((entry) => entry.id), outputIds);

        await writeFile(path.join(root, value.outputs[0].canonical.path), Buffer.alloc(32, 9));
        await assert.rejects(
            validateIntermediateOutputs({ manifest: value, artifactDirectory: root, expectedOutputIds: outputIds }),
            (error) => error instanceof CompilerError && error.code === 'intermediate_output_hash_mismatch'
        );
    });
});

test('partial output inventory and invalid canonical dimensions cannot validate', async () => {
    await withFixture(async ({ root, value, outputIds }) => {
        const partial = structuredClone(value);
        partial.outputs.pop();
        assert.throws(
            () => validateIntermediateManifest(partial, { expectedOutputIds: outputIds }),
            (error) => error instanceof CompilerError && error.code === 'intermediate_output_inventory_mismatch'
        );
        const wrongSize = structuredClone(value);
        wrongSize.outputs[0].canonical.byteLength = 16;
        assert.throws(
            () => validateIntermediateManifest(wrongSize),
            (error) => error instanceof CompilerError && error.code === 'intermediate_canonical_size_invalid'
        );
        await rm(path.join(root, value.outputs[1].raw.path));
        await assert.rejects(
            validateIntermediateOutputs({ manifest: value, artifactDirectory: root }),
            (error) => error instanceof CompilerError && error.code === 'intermediate_output_missing'
        );
    });
});

test('manifest files must contain exact canonical JSON bytes and use no-overwrite creation', async () => {
    await withFixture(async ({ root, value, outputIds }) => {
        const manifestPath = path.join(root, 'intermediate.manifest.json');
        const serialized = await writeIntermediateManifest({ manifestPath, manifest: value, expectedOutputIds: outputIds });
        assert.deepEqual(await readIntermediateManifest({ manifestPath, expectedOutputIds: outputIds }), validateIntermediateManifest(value));
        await assert.rejects(
            writeIntermediateManifest({ manifestPath, manifest: value }),
            (error) => error instanceof CompilerError && error.code === 'intermediate_manifest_write_failed'
        );
        const noncanonicalPath = path.join(root, 'noncanonical.json');
        await writeFile(noncanonicalPath, `${serialized}\n`);
        await assert.rejects(
            readIntermediateManifest({ manifestPath: noncanonicalPath }),
            (error) => error instanceof CompilerError && error.code === 'intermediate_manifest_not_canonical'
        );
    });
});
