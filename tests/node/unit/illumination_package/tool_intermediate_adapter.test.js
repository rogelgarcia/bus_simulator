// Verifies the package adapter rehashes authoritative AI 529 raw and canonical intermediates.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    INTERMEDIATE_CANONICAL_ENCODING,
    INTERMEDIATE_MANIFEST_SCHEMA,
    INTERMEDIATE_RAW_FORMAT,
    serializeIntermediateManifest
} from '../../../../tools/illumination_bake_compiler/src/IntermediateManifest.mjs';
import { createPackageDefinitionFromIntermediate } from '../../../../tools/illumination_package/src/IntermediateAdapter.mjs';

const PROFILE_PATH = fileURLToPath(new URL(
    '../../../../tools/illumination_package/profiles/uncompressed_rgba32f.v1.json',
    import.meta.url
));

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function createManifest(rawBytes, canonicalBytes) {
    return {
        checks: [
            { id: 'canonical_pixels_hashed', passed: true },
            { id: 'outputs_complete', passed: true }
        ],
        compiler: {
            archiveSha256: 'a'.repeat(64),
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
            channelSources: [{ id: 'static_sun_depth', sha256: '1'.repeat(64) }],
            format: 'bus-sim-illumination-bake-input-v2',
            geometrySha256: '2'.repeat(64),
            packageRawSha256: '3'.repeat(64),
            resolvedSourceSha256: '4'.repeat(64),
            schemaVersion: 2,
            usedMaterialsSha256: '5'.repeat(64)
        },
        outputs: [{
            canonical: {
                byteLength: canonicalBytes.byteLength,
                components: 4,
                encoding: INTERMEDIATE_CANONICAL_ENCODING,
                height: 1,
                path: 'canonical/sun.rgba32f',
                rowOrigin: 'lower_left',
                sha256: sha256(canonicalBytes),
                width: 1
            },
            channel: 'static_sun_depth',
            descriptor: { semantic: 'static_sun_depth_fixture_v1' },
            id: 'sun-depth',
            raw: {
                byteLength: rawBytes.byteLength,
                format: INTERMEDIATE_RAW_FORMAT,
                path: 'raw/sun.exr',
                sha256: sha256(rawBytes)
            }
        }],
        profile: { id: 'ai529.fixture.cycles_cpu.threads_1.v1', sha256: '6'.repeat(64) },
        reconstruction: {
            alphaInputCount: 0,
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

async function createIntermediateFixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'illumination-package-adapter-'));
    t.after(() => rm(root, { force: true, recursive: true }));
    const rawBytes = Buffer.from('fixture-openexr-bytes');
    const canonicalBytes = Buffer.alloc(16);
    new DataView(canonicalBytes.buffer, canonicalBytes.byteOffset, canonicalBytes.byteLength).setFloat32(0, 0.25, true);
    const manifest = createManifest(rawBytes, canonicalBytes);
    const manifestPath = path.join(root, 'intermediate_manifest.json');
    await mkdir(path.join(root, 'raw'), { recursive: true });
    await mkdir(path.join(root, 'canonical'), { recursive: true });
    await writeFile(path.join(root, 'raw', 'sun.exr'), rawBytes, { flag: 'wx' });
    await writeFile(path.join(root, 'canonical', 'sun.rgba32f'), canonicalBytes, { flag: 'wx' });
    await writeFile(manifestPath, serializeIntermediateManifest(manifest), { encoding: 'utf8', flag: 'wx' });
    return { root, manifestPath, canonicalBytes };
}

test('intermediate adapter returns canonical decoded bytes only after strict AI 529 revalidation', async (t) => {
    const fixture = await createIntermediateFixture(t);
    const adapted = await createPackageDefinitionFromIntermediate({
        manifestPath: fixture.manifestPath,
        profilePath: PROFILE_PATH,
        cityId: 'fixture-city',
        lightingProfileId: 'fixture-light',
        capabilityProfileId: 'development.static_sun_v1'
    });
    assert.equal(adapted.definition.cityId, 'fixture-city');
    assert.equal(adapted.definition.source.resolvedSourceSha256, '4'.repeat(64));
    assert.deepEqual(adapted.definition.channels.map((entry) => entry.id), ['static_sun_depth']);
    assert.deepEqual(adapted.definition.chunks.map((entry) => entry.id), ['sun-depth']);
    assert.deepEqual(adapted.definition.chunks[0].data, new Uint8Array(fixture.canonicalBytes));
    assert.equal(adapted.definition.chunks[0].encoding, 'rgba32f_le');
    assert.equal(adapted.metrics.canonicalByteLength, 16);
    assert.equal(adapted.metrics.intermediateRawByteLength, Buffer.byteLength('fixture-openexr-bytes'));
    assert.equal(adapted.metrics.verifiedOutputCount, 1);
});

test('intermediate adapter rejects canonical payload mutation before packaging', async (t) => {
    const fixture = await createIntermediateFixture(t);
    await writeFile(path.join(fixture.root, 'canonical', 'sun.rgba32f'), Buffer.alloc(16, 9));
    await assert.rejects(
        createPackageDefinitionFromIntermediate({
            manifestPath: fixture.manifestPath,
            profilePath: PROFILE_PATH,
            cityId: 'fixture-city',
            lightingProfileId: 'fixture-light',
            capabilityProfileId: 'development.static_sun_v1'
        }),
        (error) => error.code === 'intermediate_output_hash_mismatch'
    );
});

test('intermediate adapter rejects bytes that differ between validation and the packaging read', async (t) => {
    const fixture = await createIntermediateFixture(t);
    const canonicalPath = path.join(fixture.root, 'canonical', 'sun.rgba32f');
    const changedBytes = Buffer.alloc(16, 7);
    await assert.rejects(
        createPackageDefinitionFromIntermediate({
            manifestPath: fixture.manifestPath,
            profilePath: PROFILE_PATH,
            cityId: 'fixture-city',
            lightingProfileId: 'fixture-light',
            capabilityProfileId: 'development.static_sun_v1'
        }, {
            readFileFn: async (filePath, options) => path.resolve(filePath) === canonicalPath
                ? changedBytes
                : readFile(filePath, options)
        }),
        (error) => error.code === 'intermediate_output_hash_mismatch'
    );
});
