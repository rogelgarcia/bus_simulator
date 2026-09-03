#!/usr/bin/env node
// Captures exact live Three foliage depth on the production cache lattice.

import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {canonicalJsonBytes, canonicalJsonStringify} from
    '../../src/app/illumination/bake_source/CanonicalJson.js';
import {validateResolvedCityBakePackage} from
    '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';
import {validateStaticSunDepthTileSetDescriptor} from
    '../../src/app/illumination/static_sun_depth/StaticSunDepthContract.js';
import {validateProductionStaticSunDepthReceipt} from
    './src/ProductionArtifact.mjs';
import {
    createProductionStaticSunRequest,
    deriveProductionSourceIdentityHashes,
    prepareProductionAuthority,
    selectProductionStaticSunProfiles
} from
    './src/ProductionOrchestrator.mjs';
import {PRODUCTION_STATIC_SUN_DEFAULTS} from './production.mjs';
import {authenticateCandidateRoot} from './build_alpha_cutout_texture_grad_field.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.join(repoRoot, 'tests/artifacts/illumination_531');
const defaultInputPath = path.join(
    repoRoot,
    'tests/artifacts/illumination_528/packages/bigcity2/ai531-production/bigcity2.bsib'
);
const runnerPath = fileURLToPath(import.meta.url);
const producerPaths = Object.freeze([
    runnerPath,
    path.join(here, 'browser/ProductionAlphaCutoutNativeFieldCapture.js'),
    path.join(here, 'browser/NativeShadowDepthTextureCapture.js'),
    path.join(here, 'browser/ProductionAlphaCutoutSamplePlan.js'),
    path.join(here, 'src/ThreeShadowSide.mjs')
]);

export function parseAlphaCutoutNativeFieldArguments(argv) {
    const options = {
        inputPath: defaultInputPath,
        layoutRoot: path.join(artifactRoot, 'production'),
        port: 4173,
        profileId: 'ai527.sun.az135.el08'
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === '--help' || flag === '-h') return Object.freeze({help: true});
        const value = argv[index + 1];
        if (typeof value !== 'string' || !value || value.startsWith('--')) {
            throw new TypeError(`Missing value for ${flag}`);
        }
        index += 1;
        switch (flag) {
            case '--input':
                options.inputPath = path.resolve(repoRoot, value);
                break;
            case '--candidate-root':
                options.candidateRoot = assertArtifactPath(value, true);
                break;
            case '--layout-root':
                options.layoutRoot = assertArtifactPath(value, true);
                break;
            case '--output-root':
                options.outputRoot = assertArtifactPath(value, false);
                break;
            case '--profile-id':
                options.profileId = value;
                break;
            case '--tiles':
                options.tileIndices = parseTileIndices(value);
                break;
            case '--url':
                options.baseUrl = requireLoopbackUrl(value);
                break;
            case '--port':
                options.port = positiveInteger(value, flag);
                break;
            default:
                throw new TypeError(`Unknown option '${flag}'`);
        }
    }
    if (!options.outputRoot) throw new TypeError('--output-root is required');
    selectProductionStaticSunProfiles([options.profileId]);
    return Object.freeze(options);
}

export function alphaCutoutNativeFieldUsage() {
    return `AI 531 production native cutout field

Usage:
  node tools/static_sun_depth/capture_alpha_cutout_native_field.mjs \\
    --profile-id <release-profile> --output-root <illumination_531 child>

Options:
  --layout-root <dir> Existing authenticated production layout root
  --candidate-root <dir> Fresh authenticated Blender candidate root (preferred)
  --input <path>      Authenticated BigCity2 BSIB source
  --tiles <csv>       Diagnostic tile-index subset; omission captures all
  --url <loopback>    Reuse an existing repository server
  --port <number>     Preferred local server port
`;
}

async function run(argv = process.argv.slice(2)) {
    const options = parseAlphaCutoutNativeFieldArguments(argv);
    if (options.help) {
        process.stdout.write(alphaCutoutNativeFieldUsage());
        return;
    }
    if (existsSync(options.outputRoot)) {
        throw new Error('native cutout field output root already exists');
    }
    const profile = selectProductionStaticSunProfiles([options.profileId])[0];
    const [inputBytes, producerEntries] = await Promise.all([
        readFile(options.inputPath),
        Promise.all(producerPaths.map(async (producerPath) => {
            const bytes = await readFile(producerPath);
            return sourceDescriptor(producerPath, bytes);
        }))
    ]);
    const validated = await validateResolvedCityBakePackage(inputBytes);
    let descriptorBytes;
    let receiptBytes;
    let receipt;
    if (options.candidateRoot) {
        const request = createProductionStaticSunRequest(profile);
        const authority = await prepareProductionAuthority({
            ...PRODUCTION_STATIC_SUN_DEFAULTS,
            inputPath: options.inputPath
        });
        const candidate = await authenticateCandidateRoot({
            authority,
            candidateRoot: options.candidateRoot,
            profile,
            request
        });
        const compilerProfile = JSON.parse(await readFile(
            PRODUCTION_STATIC_SUN_DEFAULTS.profilePath,
            'utf8'
        ));
        receipt = createCandidateLayoutAuthority({
            candidate: candidate.receipt,
            inputBytes,
            manifest: validated.manifest,
            profile,
            request,
            sourceCameraClipStartMeters: compilerProfile.camera.clipStartMeters
        });
        receiptBytes = candidate.bytes;
        descriptorBytes = candidate.bytes;
    } else {
        const profileRoot = path.join(options.layoutRoot, options.profileId);
        const receiptPath = path.join(profileRoot, 'production_static_sun_receipt.json');
        const descriptorPath = path.join(profileRoot, 'descriptor.json');
        [receiptBytes, descriptorBytes] = await Promise.all([
            readFile(receiptPath),
            readFile(descriptorPath)
        ]);
        const rawReceipt = parseCanonicalJson(receiptBytes, 'layout receipt');
        const descriptor = validateStaticSunDepthTileSetDescriptor(
            parseCanonicalJson(descriptorBytes, 'layout descriptor')
        );
        receipt = validateAlphaCutoutNativeFieldLayoutAuthority({
            descriptor,
            inputBytes,
            manifest: validated.manifest,
            profile,
            receipt: rawReceipt
        });
        if (receipt.request.lightingProfileId !== options.profileId
            || descriptor.identity?.compilerSignatureSha256
                !== receipt.compilerSignatureSha256
            || descriptor.identity?.cityId !== receipt.identity.cityId
            || descriptor.identity?.layout?.tileCount?.[0]
                !== receipt.layout.layout.tileCount[0]
            || descriptor.identity?.layout?.tileCount?.[1]
                !== receipt.layout.layout.tileCount[1]
            || descriptor.identity?.layout?.interiorTexels?.[0]
                !== receipt.layout.layout.interiorPixels[0]
            || descriptor.identity?.layout?.interiorTexels?.[1]
                !== receipt.layout.layout.interiorPixels[1]
            || descriptor.identity?.channelId !== 'static_sun_depth'
            || descriptor.identity?.cityId !== receipt.identity.cityId
            || descriptor.tiles?.length !== receipt.layout.layout.layerCount) {
            throw new Error('native cutout field layout receipt/descriptor identity is invalid');
        }
    }
    if (validated.report?.valid !== true
        || validated.manifest.source?.cityId !== receipt.identity.cityId
        || sha256(inputBytes) !== receipt.input.packageRawSha256) {
        throw new Error('native cutout field BSIB differs from layout authority');
    }
    const cutoutMappings = validated.manifest.casterMappings
        .filter((entry) => (
            entry.channelRelevance?.static_sun_depth === true
            && entry.coverageMode === 'cutout'
        ));
    const expectedCasterIds = cutoutMappings
        .map((entry) => entry.id)
        .sort(compareStrings);
    const nativeOwnedMeshInstanceIds = [...new Set(
        cutoutMappings.map((entry) => entry.meshInstanceId)
    )].sort(compareStrings);
    if (expectedCasterIds.length !== 124) {
        throw new Error('native cutout field requires exactly 124 cutout casters');
    }
    if (nativeOwnedMeshInstanceIds.length === 0) {
        throw new Error('native foliage field requires authenticated mesh ownership');
    }
    const allTileIndices = receipt.layout.tiles.map((_tile, index) => index);
    const tileIndices = options.tileIndices ?? allTileIndices;
    if (tileIndices.some((index) => index >= allTileIndices.length)) {
        throw new RangeError('native cutout field tile index exceeds the layout');
    }
    const productionEligible = tileIndices.length === allTileIndices.length
        && tileIndices.every((value, index) => value === index);
    await mkdir(path.join(options.outputRoot, 'tiles'), {recursive: true});
    const capture = await captureProfile({
        baseUrl: options.baseUrl,
        cameraFarMeters: receipt.profile.productionOverrides.cameraClipEndMeters,
        cameraNearMeters: receipt.profile.productionOverrides.cameraClipStartMeters,
        cameraOriginDepthMeters:
            receipt.profile.productionOverrides.cameraOriginDepthMeters,
        expectedCasterIds,
        expectedNativeOwnedMeshCount: nativeOwnedMeshInstanceIds.length,
        layout: receipt.layout,
        port: options.port,
        profile,
        tileIndices,
        onTile: async (tileCapture) => {
            const output = encodeLightDepthTile(
                tileCapture.depthValues,
                receipt.profile.productionOverrides,
                receipt.layout.depth,
                receipt.layout.layout.interiorPixels
            );
            const relativePath =
                `tiles/${tileCapture.tileId}.cutout-first-hit.f32le`;
            await writeFile(
                path.join(options.outputRoot, relativePath),
                output.bytes
            );
            return {
                byteLength: output.bytes.byteLength,
                coordinates: tileCapture.coordinates,
                maximumDepthMeters: output.maximumDepthMeters,
                minimumDepthMeters: output.minimumDepthMeters,
                nativeCapture: tileCapture.nativeCapture,
                occupiedTexelCount: output.occupiedTexelCount,
                path: relativePath,
                rowOrigin: 'min-light-y-v1',
                sha256: sha256(output.bytes),
                tileId: tileCapture.tileId,
                tileIndex: tileCapture.tileIndex,
                transparentTexelCount: output.transparentTexelCount,
                xAxis: 'increasing-cache-light-right-v1'
            };
        }
    });
    const outputRecords = capture.outputs.sort(
        (left, right) => left.tileIndex - right.tileIndex
    );
    const receiptRecord = {
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v2',
        method:
            'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2',
        status: 'complete',
        productionEligible,
        profile: {
            directionThree: [...profile.directionThree],
            id: profile.id
        },
        source: {
            bsib: {
                byteLength: inputBytes.byteLength,
                sha256: sha256(inputBytes)
            },
            cutoutCasterCount: expectedCasterIds.length,
            cutoutCasterIdsSha256: sha256(canonicalJsonBytes(expectedCasterIds)),
            nativeOwnedMeshInstanceCount: nativeOwnedMeshInstanceIds.length,
            nativeOwnedMeshInstanceIdsSha256:
                sha256(canonicalJsonBytes(nativeOwnedMeshInstanceIds)),
            descriptor: {
                byteLength: descriptorBytes.byteLength,
                sha256: sha256(descriptorBytes)
            },
            layoutReceipt: {
                byteLength: receiptBytes.byteLength,
                compilerSignatureSha256: receipt.compilerSignatureSha256,
                sha256: sha256(receiptBytes)
            }
        },
        producers: producerEntries,
        session: capture.session,
        layout: {
            basis: receipt.layout.basis,
            depth: receipt.layout.depth,
            layout: receipt.layout.layout,
            tilesSha256: sha256(canonicalJsonBytes(receipt.layout.tiles))
        },
        outputs: outputRecords,
        aggregate: {
            occupiedTexelCount: outputRecords.reduce(
                (sum, entry) => sum + entry.occupiedTexelCount,
                0
            ),
            outputByteLength: outputRecords.reduce(
                (sum, entry) => sum + entry.byteLength,
                0
            ),
            outputCount: outputRecords.length,
            requiredOutputCount: receipt.layout.layout.layerCount,
            transparentTexelCount: outputRecords.reduce(
                (sum, entry) => sum + entry.transparentTexelCount,
                0
            )
        },
        performance: {
            eligibleForPromotion: false,
            reason: 'host-load-and-gpu-contention-declared-by-user'
        }
    };
    const outputReceiptBytes = canonicalJsonBytes(receiptRecord);
    await writeFile(
        path.join(options.outputRoot, 'native_cutout_field_receipt.json'),
        outputReceiptBytes
    );
    process.stdout.write(`${JSON.stringify({
        outputRoot: artifactPath(options.outputRoot),
        productionEligible,
        receipt: {
            byteLength: outputReceiptBytes.byteLength,
            sha256: sha256(outputReceiptBytes)
        },
        aggregate: receiptRecord.aggregate
    })}\n`);
}

export function createCandidateLayoutAuthority(options) {
    const {candidate, inputBytes, manifest, profile, request} = options;
    if (candidate?.schema
            !== 'ai531-production-alpha-cutout-full-lattice-candidate-receipt-v1'
        || candidate.status !== 'complete'
        || candidate.input?.packageRawSha256 !== sha256(inputBytes)
        || candidate.profile?.id !== profile.id
        || canonicalJsonStringify(candidate.profile?.directionThree)
            !== canonicalJsonStringify(profile.directionThree)
        || canonicalJsonStringify(candidate.layout?.sunPointDirectionWorld)
            !== canonicalJsonStringify(profile.directionThree)) {
        throw new Error('candidate layout authority differs from the current source/profile');
    }
    const sourceCameraClipStartMeters = Number(options.sourceCameraClipStartMeters);
    if (!Number.isFinite(sourceCameraClipStartMeters)
        || sourceCameraClipStartMeters <= 0) {
        throw new TypeError('candidate layout authority requires a positive camera clip start');
    }
    const sourceIdentity = deriveProductionSourceIdentityHashes(manifest);
    const compilerSignatureSha256 = sha256(canonicalJsonBytes(candidate.compiler));
    const cameraOriginDepthMeters = candidate.layout.depth.minDepthMeters
        - sourceCameraClipStartMeters;
    return {
        compilerSignatureSha256,
        identity: {
            alphaSemanticsSha256: sourceIdentity.alphaSemanticsSha256,
            casterInventorySha256: sourceIdentity.casterInventorySha256,
            cityId: manifest.source.cityId,
            compilerSignatureSha256
        },
        input: {
            alphaSemanticsSha256: sourceIdentity.alphaSemanticsSha256,
            casterInventorySha256: sourceIdentity.casterInventorySha256,
            packageRawSha256: sha256(inputBytes)
        },
        layout: candidate.layout,
        profile: {
            productionOverrides: {
                cameraClipEndMeters: Math.fround(
                    candidate.layout.depth.maxDepthMeters
                        - cameraOriginDepthMeters
                        + sourceCameraClipStartMeters
                ),
                cameraClipStartMeters: Math.fround(
                    sourceCameraClipStartMeters * 0.5
                ),
                cameraOriginDepthMeters
            }
        },
        request
    };
}

export function validateAlphaCutoutNativeFieldLayoutAuthority(options) {
    const {descriptor, inputBytes, manifest, profile} = options;
    const raw = options.receipt;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError('native cutout field layout receipt must be an object');
    }
    if (raw.schema === 'ai531-static-sun-production-render-receipt-v5') {
        return validateProductionStaticSunDepthReceipt(raw);
    }
    if (raw.schema !== 'ai531-static-sun-production-render-receipt-v4') {
        throw new Error('native cutout field layout authority must use production receipt v4 or v5');
    }
    requireExactObjectKeys(raw, [
        'alphaCertification', 'assumptions', 'casterSidedness', 'compiler',
        'compilerDescriptor', 'compilerSignatureSha256', 'configuration',
        'identity', 'input', 'layout', 'opaqueCertification', 'outputs',
        'profile', 'quantizationMeasurements', 'reconstruction', 'request',
        'schema', 'status'
    ], 'legacy layout receipt');
    if (raw.status !== 'complete'
        || !canonicalValuesEqual(
            raw.request,
            createProductionStaticSunRequest(profile)
        )) {
        throw new Error('legacy layout receipt request is not the exact current production request');
    }
    const sourceIdentity = deriveProductionSourceIdentityHashes(manifest);
    if (raw.identity?.cityId !== manifest.source?.cityId
        || raw.identity?.alphaSemanticsSha256
            !== sourceIdentity.alphaSemanticsSha256
        || raw.identity?.casterInventorySha256
            !== sourceIdentity.casterInventorySha256
        || raw.input?.alphaSemanticsSha256
            !== sourceIdentity.alphaSemanticsSha256
        || raw.input?.casterInventorySha256
            !== sourceIdentity.casterInventorySha256
        || raw.input?.packageRawSha256 !== sha256(inputBytes)
        || raw.compilerSignatureSha256
            !== raw.identity?.compilerSignatureSha256) {
        throw new Error('legacy layout receipt differs from the authenticated BSIB identity');
    }
    validateLegacyLayoutProjection(raw, descriptor);
    return raw;
}

function validateLegacyLayoutProjection(receipt, descriptor) {
    const layout = receipt.layout;
    const descriptorLayout = descriptor.identity.layout;
    const receiptLayout = layout?.layout;
    const sameBasis = vectorsNear(
        layout?.basis?.depthAxisWorld,
        descriptor.identity.basis.depthAxisWorld
    ) && vectorsNear(
        layout?.basis?.rightAxisWorld,
        descriptor.identity.basis.rightAxisWorld
    ) && vectorsNear(
        layout?.basis?.upAxisWorld,
        descriptor.identity.basis.upAxisWorld
    ) && vectorsNear(
        layout?.basis?.originWorld,
        descriptor.identity.basis.originWorld
    );
    const sameLayout = receiptLayout?.guardPixels === descriptorLayout.guardTexels
        && receiptLayout?.texelSizeMeters === descriptorLayout.texelSizeMeters
        && canonicalValuesEqual(receiptLayout?.interiorPixels, descriptorLayout.interiorTexels)
        && canonicalValuesEqual(receiptLayout?.tileCount, descriptorLayout.tileCount)
        && canonicalValuesEqual(
            receiptLayout?.boundsLightMeters,
            descriptorLayout.boundsLightMeters
        )
        && layout?.depth?.minDepthMeters === descriptor.identity.encoding.minDepthMeters
        && layout?.depth?.maxDepthMeters === descriptor.identity.encoding.maxDepthMeters
        && vectorsNear(
            layout?.sunPointDirectionWorld,
            descriptor.identity.sunPointDirectionWorld
        );
    const sameTiles = Array.isArray(layout?.tiles)
        && layout.tiles.length === descriptor.tiles.length
        && layout.tiles.every((tile, index) => (
            tile?.id === descriptor.tiles[index].id
            && canonicalValuesEqual(tile.coordinates, descriptor.tiles[index].coordinates)
            && canonicalValuesEqual(
                tile.interiorBoundsLightMeters,
                descriptor.tiles[index].interiorBoundsLightMeters
            )
        ));
    const camera = receipt.profile?.productionOverrides;
    const validCamera = [
        camera?.cameraClipEndMeters,
        camera?.cameraClipStartMeters,
        camera?.cameraOriginDepthMeters
    ].every(Number.isFinite)
        && camera.cameraClipEndMeters > camera.cameraClipStartMeters
        && camera.cameraClipStartMeters > 0;
    if (!sameBasis || !sameLayout || !sameTiles || !validCamera
        || descriptor.identity.cityId !== receipt.identity.cityId
        || descriptor.identity.alpha.semanticsSha256
            !== receipt.identity.alphaSemanticsSha256
        || descriptor.identity.casterInventorySha256
            !== receipt.identity.casterInventorySha256
        || descriptor.identity.compilerSignatureSha256
            !== receipt.compilerSignatureSha256) {
        throw new Error('legacy layout receipt and authenticated descriptor projection differ');
    }
}

function requireExactObjectKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !canonicalValuesEqual(Object.keys(value).sort(), [...keys].sort())) {
        throw new Error(`${label} must contain exactly the expected fields`);
    }
}

function canonicalValuesEqual(left, right) {
    return Buffer.from(canonicalJsonBytes(left)).equals(
        Buffer.from(canonicalJsonBytes(right))
    );
}

function vectorsNear(left, right) {
    return Array.isArray(left) && Array.isArray(right)
        && left.length === right.length
        && left.every((value, index) => (
            Number.isFinite(value)
            && Number.isFinite(right[index])
            && Math.abs(value - right[index]) <= 1e-12
        ));
}

async function captureProfile(options) {
    let server = null;
    let browser = null;
    let page = null;
    let sessionBegan = false;
    const diagnostics = [];
    const outputs = [];
    let begin = null;
    let end = null;
    try {
        const port = options.baseUrl ? options.port : await findFreePort(options.port);
        const baseUrl = options.baseUrl ?? `http://127.0.0.1:${port}`;
        if (!options.baseUrl) {
            server = spawn(
                process.execPath,
                ['tests/headless/e2e/static_server.mjs'],
                {
                    cwd: repoRoot,
                    env: {...process.env, PORT: String(port)},
                    stdio: ['ignore', 'ignore', 'pipe']
                }
            );
            let serverError = '';
            server.stderr.on('data', (chunk) => { serverError += String(chunk); });
            await waitForServer(baseUrl).catch((error) => {
                throw new Error(`${error.message}\n${serverError.trim()}`);
            });
        }
        const chromePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
            || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await chromium.launch({
            headless: true,
            ...(existsSync(chromePath) ? {executablePath: chromePath} : {}),
            args: [
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding'
            ]
        });
        page = await browser.newPage({viewport: {width: 1280, height: 720}});
        page.setDefaultTimeout(0);
        await page.route('**/pbr.material.correction.config.js', async (route) => {
            const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
            const diskPath = path.resolve(repoRoot, `.${pathname}`);
            const relative = path.relative(repoRoot, diskPath);
            if (!relative.startsWith('..') && !path.isAbsolute(relative)
                && existsSync(diskPath)) {
                await route.continue();
                return;
            }
            await route.fulfill({
                body: 'export default null;\n',
                contentType: 'text/javascript; charset=utf-8',
                status: 200
            });
        });
        page.on('pageerror', (error) => diagnostics.push({
            kind: 'pageerror',
            message: error?.message ?? String(error)
        }));
        page.on('console', (message) => {
            if (message.type() === 'error') {
                diagnostics.push({
                    kind: 'console.error',
                    location: message.location(),
                    message: message.text()
                });
            }
        });
        page.on('response', (response) => {
            if (response.status() >= 400) {
                diagnostics.push({
                    kind: 'http.error',
                    status: response.status(),
                    url: response.url()
                });
            }
        });
        await page.goto(
            `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`
        );
        await page.waitForFunction(() => (
            window.__busSim?.sm?.currentName === 'game_mode'
            && window.__busSim?.sm?.current?.city?.cityId === 'bigcity2'
        ), null, {timeout: 180_000});
        begin = await page.evaluate(async (input) => {
            const THREE = await import('three');
            const probe = await import(
                './tools/static_sun_depth/browser/ProductionAlphaCutoutNativeFieldCapture.js'
            );
            const {engine, sm} = window.__busSim;
            const state = sm.current;
            const city = state.city;
            engine.stop();
            if (state.gameLoop) state.gameLoop.paused = true;
            await Promise.all([
                engine.waitForLightingReady?.(),
                city.world?.trees?.readyPromise
            ].filter(Boolean));
            const direction = input.profile.directionThree;
            const elevationDeg = THREE.MathUtils.radToDeg(Math.asin(direction[1]));
            const azimuthDeg = THREE.MathUtils.radToDeg(
                Math.atan2(direction[2], direction[0])
            );
            engine.setAtmosphereSettings({
                ...engine.atmosphereSettings,
                sun: {
                    ...engine.atmosphereSettings?.sun,
                    azimuthDeg,
                    elevationDeg
                }
            });
            city.update(engine);
            engine.renderFrame();
            engine.renderer.getContext().finish();
            return probe.beginProductionAlphaCutoutNativeFieldCapture({
                THREE,
                city,
                engine,
                layout: input.layout,
                expectedCasterIds: input.expectedCasterIds,
                expectedNativeOwnedMeshCount:
                    input.expectedNativeOwnedMeshCount,
                cameraOriginDepthMeters: input.cameraOriginDepthMeters,
                cameraNearMeters: input.cameraNearMeters,
                cameraFarMeters: input.cameraFarMeters,
                lightingProfileId: input.profile.id
            });
        }, {
            cameraFarMeters: options.cameraFarMeters,
            cameraNearMeters: options.cameraNearMeters,
            cameraOriginDepthMeters: options.cameraOriginDepthMeters,
            expectedCasterIds: options.expectedCasterIds,
            expectedNativeOwnedMeshCount:
                options.expectedNativeOwnedMeshCount,
            layout: options.layout,
            profile: options.profile
        });
        sessionBegan = true;
        for (const tileIndex of options.tileIndices) {
            const tileCapture = await page.evaluate(async (index) => {
                const probe = await import(
                    './tools/static_sun_depth/browser/ProductionAlphaCutoutNativeFieldCapture.js'
                );
                return probe.captureProductionAlphaCutoutNativeFieldTile({
                    tileIndex: index
                });
            }, tileIndex);
            if (!(tileCapture.depthValues instanceof Float32Array)) {
                throw new Error('native cutout field tile did not return Float32 depth');
            }
            outputs.push(await options.onTile(tileCapture));
        }
    } finally {
        if (page && sessionBegan) {
            end = await page.evaluate(async () => {
                const probe = await import(
                    './tools/static_sun_depth/browser/ProductionAlphaCutoutNativeFieldCapture.js'
                );
                return probe.endProductionAlphaCutoutNativeFieldCapture();
            }).catch((error) => ({
                status: 'failed',
                error: error?.message ?? String(error)
            }));
        }
        await browser?.close().catch(() => {});
        server?.kill();
    }
    if (diagnostics.length > 0) {
        throw new Error(
            `native cutout field emitted blocking diagnostics: ${JSON.stringify(diagnostics)}`
        );
    }
    if (end?.status !== 'disposed'
        || end.capturedTileCount !== options.tileIndices.length) {
        throw new Error(
            `native cutout field session did not dispose cleanly: ${JSON.stringify(end)}`
        );
    }
    return {
        outputs,
        session: {
            begin,
            diagnostics,
            end
        }
    };
}

export function encodeLightDepthTile(
    normalizedDepthValues,
    camera,
    depthBounds,
    interiorPixels
) {
    if (!(normalizedDepthValues instanceof Float32Array)
        || normalizedDepthValues.length
            !== interiorPixels[0] * interiorPixels[1]) {
        throw new TypeError('native normalized depth tile size is invalid');
    }
    const output = new Uint8Array(normalizedDepthValues.length * 4);
    const view = new DataView(output.buffer);
    const width = interiorPixels[0];
    const depthRange = camera.cameraClipEndMeters - camera.cameraClipStartMeters;
    let occupiedTexelCount = 0;
    let minimumDepthMeters = Infinity;
    let maximumDepthMeters = -Infinity;
    for (let y = 0; y < interiorPixels[1]; y += 1) {
        for (let sourceX = 0; sourceX < width; sourceX += 1) {
            const sourceIndex = y * width + sourceX;
            const normalized = normalizedDepthValues[sourceIndex];
            if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
                throw new Error(`native normalized depth[${sourceIndex}] is invalid`);
            }
            const targetX = width - 1 - sourceX;
            const targetIndex = y * width + targetX;
            if (normalized >= 1) {
                view.setFloat32(targetIndex * 4, 0, true);
                continue;
            }
            const lightDepth = Math.fround(
                camera.cameraOriginDepthMeters
                + camera.cameraClipStartMeters
                + normalized * depthRange
            );
            if (lightDepth < depthBounds.minDepthMeters - 1e-3
                || lightDepth > depthBounds.maxDepthMeters + 1e-3) {
                throw new Error('native cutout light depth escaped production bounds');
            }
            view.setFloat32(targetIndex * 4, lightDepth, true);
            occupiedTexelCount += 1;
            minimumDepthMeters = Math.min(minimumDepthMeters, lightDepth);
            maximumDepthMeters = Math.max(maximumDepthMeters, lightDepth);
        }
    }
    return {
        bytes: output,
        maximumDepthMeters: occupiedTexelCount > 0 ? maximumDepthMeters : null,
        minimumDepthMeters: occupiedTexelCount > 0 ? minimumDepthMeters : null,
        occupiedTexelCount,
        transparentTexelCount: normalizedDepthValues.length - occupiedTexelCount
    };
}

function parseCanonicalJson(bytes, label) {
    const value = JSON.parse(bytes);
    if (!Buffer.from(canonicalJsonBytes(value)).equals(bytes)) {
        throw new Error(`${label} is not canonical JSON`);
    }
    return value;
}

function sourceDescriptor(value, bytes) {
    return {
        byteLength: bytes.byteLength,
        path: artifactPath(value),
        sha256: sha256(bytes)
    };
}

function parseTileIndices(value) {
    const result = value.split(',').map((entry) => {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(entry)) {
            throw new TypeError('--tiles must be comma-separated non-negative integers');
        }
        return Number(entry);
    });
    if (result.length < 1 || new Set(result).size !== result.length
        || result.some((entry, index) => index > 0 && entry <= result[index - 1])) {
        throw new Error('--tiles must be strictly increasing and unique');
    }
    return result;
}

function assertArtifactPath(value, allowEqual) {
    const resolved = path.resolve(repoRoot, value);
    const relative = path.relative(artifactRoot, resolved);
    if ((!allowEqual && !relative) || relative.startsWith('..')
        || path.isAbsolute(relative)) {
        throw new Error('native cutout field paths must stay below illumination_531');
    }
    return resolved;
}

function artifactPath(value) {
    return path.relative(repoRoot, value).replaceAll('\\', '/');
}

function requireLoopbackUrl(value) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:'
        || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
        throw new TypeError('--url must name a loopback HTTP server');
    }
    return parsed.origin;
}

function positiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return parsed;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

async function findFreePort(preferred) {
    for (let port = preferred; port < preferred + 100; port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error('No free loopback port is available');
}

function canListen(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

async function waitForServer(baseUrl) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/index.html`);
            if (response.ok) return;
        } catch {
            // Server startup is retried until the fixed deadline.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for the local static server');
}

if (process.argv[1] && path.resolve(process.argv[1]) === runnerPath) {
    run().catch((error) => {
        process.stderr.write(`${error?.stack ?? error}\n`);
        process.exitCode = 1;
    });
}
