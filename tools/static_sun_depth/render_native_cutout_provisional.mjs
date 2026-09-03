#!/usr/bin/env node
// Produces the provisional descriptor required to bind native cutout parity.

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {canonicalJsonBytes} from
    '../../src/app/illumination/bake_source/CanonicalJson.js';
import {createIsolatedBlenderEnvironment} from
    '../illumination_bake_compiler/src/CompilerOrchestrator.mjs';
import {runBlenderProcess} from
    '../illumination_bake_compiler/src/BlenderProcess.mjs';
import {
    buildProvisionalStaticSunDepthArtifact,
    validateProvisionalStaticSunDepthReceipt
} from './src/ProductionArtifact.mjs';
import {
    authenticateProductionStaticSunDepthReceipt,
    createProductionStaticSunRequest,
    loadProductionNativeCutoutField,
    parseProductionReceiptStdoutDescriptor,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from './src/ProductionOrchestrator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const runnerPath = fileURLToPath(import.meta.url);

export function parseNativeProvisionalArguments(argv) {
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
        outputRoot: path.join(artifactRoot, 'provisional_native_v1'),
        profileId: 'ai527.sun.az135.el08',
        profilePath: path.join(
            repoRoot,
            'tools/illumination_bake_compiler/profiles/proof_cpu_12.v1.json'
        ),
        rendererPath: path.join(here, 'blender/production_static_sun.py'),
        resume: false,
        timeoutMs: 21_600_000,
        toolchainPath: path.join(repoRoot, 'tools/illumination_bake_compiler/toolchain.v1.json')
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        if (flag === '--resume') {
            options.resume = true;
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
            case '--native-cutout-root':
                options.nativeCutoutRoot = assertArtifactChild(value);
                break;
            case '--timeout-ms': options.timeoutMs = positiveInteger(value, flag); break;
            default: throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    selectProductionStaticSunProfiles([options.profileId]);
    return Object.freeze(options);
}

async function run(argv = process.argv.slice(2)) {
    const options = parseNativeProvisionalArguments(argv);
    if (options.help) {
        process.stdout.write('AI 531 provisional native cutout renderer\n');
        return;
    }
    const profile = selectProductionStaticSunProfiles([options.profileId])[0];
    const profileRoot = path.join(options.outputRoot, profile.id);
    const reuseRendered = existsSync(profileRoot);
    if (reuseRendered && !options.resume) {
        throw new Error('Provisional profile output already exists; refusing to overwrite it');
    }
    await mkdir(options.outputRoot, {recursive: true});
    const stagingRoot = path.join(options.outputRoot, '.staging', profile.id);
    await mkdir(stagingRoot, {recursive: true});
    const authority = await prepareProductionAuthority(options);
    const context = {
        allowUnpromotedNativeCutoutField: true,
        authority,
        options,
        profile
    };
    const nativeField = await loadProductionNativeCutoutField(context);
    const request = createProductionStaticSunRequest(profile);
    const requestBytes = canonicalJsonBytes(request);
    const requestPath = path.join(stagingRoot, 'request.json');
    await writeFile(requestPath, requestBytes);
    let marker = null;
    if (!reuseRendered) {
        const isolated = createIsolatedBlenderEnvironment({
            executablePath: options.executablePath,
            stagingPath: stagingRoot
        });
        for (const directory of isolated.directories) {
            await mkdir(directory, {recursive: true});
        }
        const result = await runBlenderProcess({
            cwd: path.dirname(options.executablePath),
            env: isolated.env,
            executablePath: options.executablePath,
            pythonScriptPath: options.rendererPath,
            scriptArgs: [
                '--input', path.resolve(options.inputPath),
                '--output', path.resolve(profileRoot),
                '--profile', path.resolve(options.profilePath),
                '--request', path.resolve(requestPath),
                '--archive-sha256', authority.verifiedToolchain.archive.sha256,
                '--executable-sha256', authority.verifiedToolchain.executable.sha256,
                '--toolchain-sha256', authority.toolchainSha256,
                '--profile-sha256', authority.profileSha256,
                '--request-sha256', sha256(requestBytes),
                '--renderer-script-sha256', authority.rendererScriptSha256,
                '--ai529-script-sha256', authority.ai529ScriptSha256,
                '--package-raw-sha256', authority.packageRawSha256,
                '--native-cutout-field-receipt', path.resolve(nativeField.path),
                '--native-cutout-field-receipt-sha256', nativeField.sha256,
                '--allow-unpromoted-native-cutout-field',
                '--output-encoding', 'rg8',
                '--row-strip-pixels', '1821'
            ],
            timeoutMs: options.timeoutMs
        });
        marker = parseProductionReceiptStdoutDescriptor(result.stdout);
    }
    const receiptBytes = await readFile(
        path.join(profileRoot, 'production_static_sun_receipt.json')
    );
    marker ??= {byteLength: receiptBytes.byteLength, sha256: sha256(receiptBytes)};
    if (receiptBytes.byteLength !== marker.byteLength
        || sha256(receiptBytes) !== marker.sha256) {
        throw new Error('Provisional Blender receipt differs from its stdout descriptor');
    }
    const receipt = validateProvisionalStaticSunDepthReceipt(
        parseCanonicalJson(receiptBytes, 'provisional Blender receipt')
    );
    authenticateProductionStaticSunDepthReceipt(receipt, authority, request);
    if (receipt.alphaCertification.nativeCutoutField.receiptSha256
            !== nativeField.sha256) {
        throw new Error('Provisional Blender receipt used a different native cutout field');
    }
    const interiorTiles = await Promise.all(receipt.outputs.map(async (output) => {
        const bytes = new Uint8Array(await readFile(path.join(profileRoot, output.path)));
        if (bytes.byteLength !== output.byteLength || sha256(bytes) !== output.sha256) {
            throw new Error(`Provisional tile '${output.tileId}' failed authentication`);
        }
        return {bytes, coordinates: output.coordinates, id: output.tileId};
    }));
    const artifact = buildProvisionalStaticSunDepthArtifact({receipt, interiorTiles});
    if (artifact.artifactManifest.productionEligible !== false
        || artifact.artifactManifest.artifactClass !== 'provisional') {
        throw new Error('Provisional render produced an invalid eligibility class');
    }
    await Promise.all([
        writeFile(path.join(profileRoot, 'descriptor.json'), canonicalJsonBytes(artifact.descriptor)),
        writeFile(path.join(profileRoot, 'request.json'), requestBytes),
        writeFile(path.join(profileRoot, 'provisional_report.json'), canonicalJsonBytes({
            descriptorSha256: sha256(canonicalJsonBytes(artifact.descriptor)),
            nativeCutoutFieldReceiptSha256: nativeField.sha256,
            performance: {
                eligibleForPromotion: false,
                reason: 'host-load-and-gpu-contention-declared-by-user'
            },
            producerSha256: sha256(await readFile(runnerPath)),
            receiptSha256: marker.sha256,
            schema: 'ai531-production-native-cutout-provisional-render-v1',
            status: 'complete'
        }))
    ]);
    process.stdout.write(JSON.stringify({
        descriptorSha256: sha256(canonicalJsonBytes(artifact.descriptor)),
        lightingProfileId: profile.id,
        status: 'complete'
    }) + '\n');
}

function parseCanonicalJson(bytes, label) {
    const value = JSON.parse(bytes);
    if (!Buffer.from(canonicalJsonBytes(value)).equals(bytes)) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function assertArtifactChild(value) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Provisional native paths must stay below illumination_531');
    }
    return resolved;
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

if (process.argv[1] && path.resolve(process.argv[1]) === runnerPath) {
    run().catch((error) => {
        const structured = typeof error?.toJSON === 'function'
            ? JSON.stringify(error.toJSON()) : null;
        process.stderr.write(`${structured ?? error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
