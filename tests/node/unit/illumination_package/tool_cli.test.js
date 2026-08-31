// Verifies deterministic package CLI parsing, full verification, and atomic publication.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJsonStringify } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import { buildIlluminationBinaryPackage } from '../../../../src/app/illumination/package/index.js';
import {
    main,
    parseCliArgs,
    runIlluminationPackageCommand
} from '../../../../tools/illumination_package/run.mjs';

const SOURCE_SHA256 = 'a'.repeat(64);
const PROFILE_SHA256 = 'b'.repeat(64);

function createDefinition() {
    return {
        cityId: 'fixture-city',
        lightingProfileId: 'fixture-light',
        selectedCapabilityProfileId: 'development.static_sun_v1',
        source: {
            schema: 'fixture-source-v1',
            resolvedSourceSha256: SOURCE_SHA256
        },
        compilerDescriptor: {
            schema: 'fixture-compiler-v1',
            build: 'deterministic'
        },
        channels: [{
            id: 'static_sun_depth',
            required: true,
            sourceSha256: SOURCE_SHA256,
            profileSha256: PROFILE_SHA256,
            schemaVersion: 1
        }],
        chunks: [{
            id: 'sun-depth-0',
            channelId: 'static_sun_depth',
            data: Uint8Array.of(127),
            resourceType: 'texture_2d',
            encoding: 'r8_unorm',
            precision: 'unorm8',
            dimensions: { width: 1, height: 1, depth: 1, components: 1 },
            rowOrigin: 'lower_left',
            coordinateTransform: null,
            mipLevel: 0,
            requiredRuntimeCapabilities: ['webgl2']
        }]
    };
}

async function createPackageFixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'illumination-package-cli-'));
    t.after(() => rm(root, { force: true, recursive: true }));
    const built = await buildIlluminationBinaryPackage(createDefinition());
    const packagePath = path.join(root, 'fixture.ilpkg');
    await writeFile(packagePath, built.bytes, { flag: 'wx' });
    return { root, built, packagePath };
}

test('package CLI parser validates commands, required flags, hashes, and canonical capability lists', () => {
    const parsed = parseCliArgs([
        'verify',
        '--package=fixture.ilpkg',
        '--expected-city-id',
        'fixture-city',
        '--expected-source-sha256',
        SOURCE_SHA256,
        '--capability',
        'webgl2,static_receiver_sampling_v1',
        '--runtime-capability',
        'webgl2'
    ]);
    assert.equal(parsed.command, 'verify');
    assert.equal(parsed.packagePath, 'fixture.ilpkg');
    assert.deepEqual(parsed.runtimeCapabilities, ['static_receiver_sampling_v1', 'webgl2']);
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(parsed.runtimeCapabilities));

    assert.throws(
        () => parseCliArgs(['unknown']),
        (error) => error.code === 'cli_command_unknown'
    );
    assert.throws(
        () => parseCliArgs(['inspect']),
        (error) => error.code === 'cli_option_required'
    );
    assert.throws(
        () => parseCliArgs(['verify', '--package', 'fixture.ilpkg', '--expected-source-sha256', 'ABC']),
        (error) => error.code === 'cli_sha256_invalid'
    );
    assert.throws(
        () => parseCliArgs(['inspect', '--package', 'fixture.ilpkg', '--capability', 'webgl2']),
        (error) => error.code === 'cli_option_not_allowed'
    );
});

test('inspect and verify parse authoritative package bytes and enforce exact compatibility', async (t) => {
    const fixture = await createPackageFixture(t);
    const inspected = await runIlluminationPackageCommand(['inspect', '--package', fixture.packagePath]);
    assert.equal(inspected.schema, 'bus-sim-illumination-package-inspection-v1');
    assert.equal(inspected.aggregateSha256, fixture.built.aggregateSha256);
    assert.equal(inspected.identity.cityId, 'fixture-city');
    assert.deepEqual(inspected.channels.map((entry) => entry.id), ['static_sun_depth']);
    assert.deepEqual(inspected.chunks.map((entry) => entry.id), ['sun-depth-0']);
    assert.equal(Object.prototype.hasOwnProperty.call(inspected.chunks[0], 'data'), false);

    const verified = await runIlluminationPackageCommand([
        'verify',
        '--package', fixture.packagePath,
        '--expected-city-id', 'fixture-city',
        '--expected-lighting-profile-id', 'fixture-light',
        '--expected-capability-profile-id', 'development.static_sun_v1',
        '--expected-source-sha256', SOURCE_SHA256,
        '--expected-profile-sha256', PROFILE_SHA256,
        '--expected-compiler-signature-sha256', fixture.built.manifest.compiler.signatureSha256,
        '--expected-aggregate-sha256', fixture.built.aggregateSha256,
        '--capability', 'webgl2',
        '--capability', 'static_receiver_sampling_v1'
    ]);
    assert.equal(verified.passed, true);
    assert.equal(verified.inspection.compatibility.compatible, true);

    await assert.rejects(
        runIlluminationPackageCommand([
            'verify', '--package', fixture.packagePath, '--expected-city-id', 'other-city'
        ]),
        (error) => error.code === 'package_incompatible'
            && error.details.compatibility.reason === 'wrong_city'
    );
    await assert.rejects(
        runIlluminationPackageCommand([
            'verify', '--package', fixture.packagePath, '--capability', 'webgl2'
        ]),
        (error) => error.code === 'package_incompatible'
            && error.details.compatibility.reason === 'unsupported_capability'
    );
});

test('pack uses the AI 529 adapter boundary, fully verifies, and publishes without overwrite', async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'illumination-package-pack-'));
    t.after(() => rm(root, { force: true, recursive: true }));
    const outputRoot = path.join(root, 'output');
    const adapterCalls = [];
    const dependencies = {
        async createDefinition(options) {
            adapterCalls.push(options);
            return {
                definition: createDefinition(),
                metrics: {
                    canonicalByteLength: 1,
                    intermediateRawByteLength: 2,
                    readCanonicalMs: 0.25,
                    validateIntermediateMs: 0.5,
                    verifiedOutputCount: 1
                }
            };
        }
    };
    const args = [
        'pack',
        '--input', path.join(root, 'intermediate_manifest.json'),
        '--city-id', 'fixture-city',
        '--lighting-profile-id', 'fixture-light',
        '--capability-profile-id', 'development.static_sun_v1',
        '--output-root', outputRoot,
        '--run-id', 'fixture-run'
    ];
    const packed = await runIlluminationPackageCommand(args, dependencies);
    assert.equal(packed.schema, 'bus-sim-illumination-package-pack-result-v1');
    assert.equal(packed.validationReport.passed, true);
    assert.equal(packed.validationReport.sizes.intermediateCanonicalByteLength, 1);
    assert.equal(adapterCalls.length, 1);
    assert.equal(adapterCalls[0].manifestPath, path.resolve(root, 'intermediate_manifest.json'));
    assert.match(adapterCalls[0].profilePath, /uncompressed_rgba32f\.v1\.json$/);

    const packageBytes = await readFile(path.join(packed.finalPath, 'package.ilpkg'));
    const manifestText = await readFile(path.join(packed.finalPath, 'manifest.json'), 'utf8');
    const reportText = await readFile(path.join(packed.finalPath, 'validation_report.json'), 'utf8');
    assert.equal(packageBytes.byteLength, packed.packageByteLength);
    assert.equal(canonicalJsonStringify(JSON.parse(manifestText)), manifestText);
    assert.equal(canonicalJsonStringify(JSON.parse(reportText)), reportText);
    assert.equal(JSON.parse(reportText).identity.aggregateSha256, packed.aggregateSha256);

    await assert.rejects(
        runIlluminationPackageCommand([...args.slice(0, -1), 'second-run'], dependencies),
        (error) => error.code === 'package_release_collision'
    );
    assert.deepEqual(await readFile(path.join(packed.finalPath, 'package.ilpkg')), packageBytes);
});

test('promote re-verifies a standalone package and atomically publishes a canonical release', async (t) => {
    const fixture = await createPackageFixture(t);
    const artifactRoot = path.join(fixture.root, 'production');
    const promoted = await runIlluminationPackageCommand([
        'promote',
        '--package', fixture.packagePath,
        '--artifact-root', artifactRoot,
        '--run-id', 'run-01',
        '--expected-city-id', 'fixture-city',
        '--expected-aggregate-sha256', fixture.built.aggregateSha256,
        '--capability', 'webgl2,static_receiver_sampling_v1'
    ]);
    assert.equal(promoted.promoted, true);
    assert.equal(promoted.aggregateSha256, fixture.built.aggregateSha256);
    assert.deepEqual(
        new Uint8Array(await readFile(path.join(promoted.finalPath, 'package.ilpkg'))),
        fixture.built.bytes
    );
    const report = JSON.parse(await readFile(path.join(promoted.finalPath, 'validation_report.json'), 'utf8'));
    assert.equal(report.operation, 'promote');
    assert.equal(report.sizes.intermediateRawByteLength, 'not_measured');
});

test('main writes one canonical JSON record to stdout or structured stderr', async (t) => {
    const fixture = await createPackageFixture(t);
    let stdout = '';
    let stderr = '';
    const writers = {
        stdout: { write(value) { stdout += value; } },
        stderr: { write(value) { stderr += value; } }
    };
    const success = await main(['inspect', '--package', fixture.packagePath], writers);
    assert.equal(success, 0);
    assert.equal(stderr, '');
    const parsedOutput = JSON.parse(stdout);
    assert.equal(canonicalJsonStringify(parsedOutput) + '\n', stdout);
    assert.equal(parsedOutput.aggregateSha256, fixture.built.aggregateSha256);

    stdout = '';
    const failure = await main(['inspect'], writers);
    assert.equal(failure, 1);
    assert.equal(stdout, '');
    const parsedError = JSON.parse(stderr);
    assert.equal(canonicalJsonStringify(parsedError) + '\n', stderr);
    assert.equal(parsedError.name, 'PackageToolError');
    assert.equal(parsedError.code, 'cli_option_required');
});
