// Measures AI 530 package loading through the real runtime, preferring headless Chromium/WebGL2.
// @ts-check

import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJsonStringify } from '../../src/app/illumination/bake_source/CanonicalJson.js';
import { parseIlluminationBinaryPackage } from '../../src/app/illumination/package/index.js';
import { createIlluminationRuntime } from '../../src/graphics/illumination/runtime/IlluminationRuntime.js';

const WORKSPACE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PROFILE_SCHEMA = 'bus-sim-illumination-package-runtime-profile-v1';
const MAX_SAMPLES = 1000;

export async function main(argv = process.argv.slice(2)) {
    const options = parseArguments(argv);
    if (options.help) {
        process.stdout.write(usageText() + '\n');
        return 0;
    }
    const packagePath = path.resolve(options.packagePath);
    const outputPath = path.resolve(options.outputPath);
    const packageBytes = new Uint8Array(await readFile(packagePath));
    const parsed = await parseIlluminationBinaryPackage(packageBytes);
    const validationReport = await readMatchingValidationReport(packagePath, parsed, packageBytes.byteLength);
    const declaredCapabilities = collectDeclaredCapabilities(parsed);
    const expectations = packageExpectations(parsed);

    let measured;
    let fallbackReason = null;
    const browserSupport = await loadPlaywrightChromium();
    if (browserSupport.available) {
        measured = await measureWithBrowser({
            chromium: browserSupport.chromium,
            packagePath,
            samples: options.samples,
            declaredCapabilities,
            expectations,
            executablePath: browserSupport.executablePath
        });
        if (!measured.available) fallbackReason = measured.reason;
    } else {
        fallbackReason = browserSupport.reason;
    }
    if (!measured?.available) {
        measured = await measureWithNode({
            packageBytes,
            samples: options.samples,
            declaredCapabilities,
            expectations,
            fallbackReason: fallbackReason ?? 'Headless Chromium/WebGL2 was unavailable.'
        });
    }

    const report = createReport({
        packagePath,
        parsed,
        validationReport,
        samples: options.samples,
        measured
    });
    await atomicWriteCanonicalJson(outputPath, report);
    process.stdout.write(canonicalJsonStringify(Object.freeze({
        schema: 'bus-sim-illumination-package-runtime-profile-result-v1',
        outputPath,
        measurementPath: report.environment.measurementPath,
        sampleCount: options.samples,
        aggregateSha256: parsed.aggregateSha256
    })) + '\n');
    return 0;
}

function parseArguments(argv) {
    if (argv.includes('--help') || argv.includes('-h')) {
        return Object.freeze({ help: true, packagePath: '', outputPath: '', samples: 20 });
    }
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index];
        const value = argv[index + 1];
        if (!['--package', '--output', '--samples'].includes(flag)) {
            throw new TypeError(`Unknown profile option '${flag ?? ''}'.`);
        }
        if (value === undefined || value.startsWith('--')) throw new TypeError(`Option '${flag}' requires a value.`);
        if (values.has(flag)) throw new TypeError(`Option '${flag}' may be specified only once.`);
        values.set(flag, value);
    }
    const packagePath = values.get('--package');
    const outputPath = values.get('--output');
    if (!packagePath) throw new TypeError("Profile option '--package' is required.");
    if (!outputPath) throw new TypeError("Profile option '--output' is required.");
    const samplesText = values.get('--samples') ?? '20';
    if (!/^[1-9][0-9]*$/.test(samplesText)) throw new TypeError("Profile option '--samples' must be a positive integer.");
    const samples = Number(samplesText);
    if (!Number.isSafeInteger(samples) || samples > MAX_SAMPLES) {
        throw new RangeError(`Profile sample count must be no greater than ${MAX_SAMPLES}.`);
    }
    return Object.freeze({ help: false, packagePath, outputPath, samples });
}

function usageText() {
    return [
        'Usage:',
        '  node tools/illumination_package/profile.mjs --package <package.ilpkg> --output <report.json> [--samples <count>]',
        '',
        'Runs one warmup and repeated same-package load/stage/commit/deactivate cycles.',
        'Headless Chromium with a real WebGL2 context is preferred; no dependency is downloaded.',
        'If Chromium or WebGL2 is unavailable, a logical Node resource path is measured and unavailable metrics are labeled.'
    ].join('\n');
}

async function loadPlaywrightChromium() {
    try {
        const playwright = await import('@playwright/test');
        if (!playwright.chromium) {
            return Object.freeze({ available: false, reason: 'The installed Playwright package does not expose Chromium.' });
        }
        const executablePath = await locateInstalledChromium(playwright.chromium.executablePath());
        if (!executablePath) {
            return Object.freeze({
                available: false,
                reason: 'No installed Playwright Chromium, Google Chrome, or Microsoft Edge executable was found.'
            });
        }
        return Object.freeze({ available: true, chromium: playwright.chromium, executablePath });
    } catch (error) {
        return Object.freeze({
            available: false,
            reason: `Installed Playwright/Chromium unavailable: ${errorMessage(error)}`
        });
    }
}

async function locateInstalledChromium(playwrightPath) {
    const candidates = [
        process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        process.env.E2E_BROWSER_EXECUTABLE,
        playwrightPath,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);
    const browserRoot = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
        : null;
    if (browserRoot) {
        try {
            const folders = (await readdir(browserRoot, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
                .map((entry) => entry.name)
                .sort()
                .reverse();
            for (const folder of folders) {
                candidates.push(path.join(browserRoot, folder, 'chrome-win64', 'chrome.exe'));
                candidates.push(path.join(browserRoot, folder, 'chrome-win', 'chrome.exe'));
            }
        } catch {
            // System-browser candidates below remain valid when the Playwright cache is absent.
        }
    }
    for (const candidate of candidates) {
        try {
            if ((await stat(candidate)).isFile()) return candidate;
        } catch {
            // Try the next already-installed candidate.
        }
    }
    return null;
}

async function measureWithBrowser({ chromium, packagePath, samples, declaredCapabilities, expectations, executablePath }) {
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            executablePath,
            args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
        });
    } catch (error) {
        return Object.freeze({ available: false, reason: `Headless Chromium launch failed: ${errorMessage(error)}` });
    }
    const server = await startProfileServer(packagePath);
    try {
        const page = await browser.newPage();
        await page.goto(`${server.origin}/profile.html`, { waitUntil: 'load' });
        const result = await page.evaluate(async ({ sampleCount, capabilities, packageExpectations }) => {
            const module = await import('/src/graphics/illumination/runtime/index.js');
            const canvas = document.createElement('canvas');
            canvas.width = 4;
            canvas.height = 4;
            const gl = canvas.getContext('webgl2', {
                alpha: false,
                antialias: false,
                depth: false,
                preserveDrawingBuffer: false
            });
            if (!gl) {
                return { available: false, reason: 'Headless Chromium did not provide a WebGL2 context.' };
            }
            const probe = module.probeWebGl2IlluminationCapabilities(gl);
            if (!probe.supported) {
                return { available: false, reason: 'The Chromium WebGL2 context failed the illumination capability probe.' };
            }
            const capabilityMap = { ...probe.capabilities };
            for (const id of capabilities) {
                if (!(id in capabilityMap)) capabilityMap[id] = true;
            }
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const webglVendor = debugInfo
                ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
                : String(gl.getParameter(gl.VENDOR));
            const webglRenderer = debugInfo
                ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
                : String(gl.getParameter(gl.RENDERER));
            const createResource = module.createWebGl2IlluminationResourceFactory(gl, probe);
            const extensionAvailability = {
                OES_texture_float_linear: Boolean(gl.getExtension('OES_texture_float_linear')),
                EXT_color_buffer_float: Boolean(gl.getExtension('EXT_color_buffer_float')),
                WEBGL_compressed_texture_etc: Boolean(gl.getExtension('WEBGL_compressed_texture_etc')),
                EXT_texture_compression_bptc: Boolean(gl.getExtension('EXT_texture_compression_bptc')),
                WEBGL_compressed_texture_astc: Boolean(gl.getExtension('WEBGL_compressed_texture_astc')),
                WEBGL_compressed_texture_s3tc: Boolean(gl.getExtension('WEBGL_compressed_texture_s3tc'))
            };

            async function cycle(index, warmup) {
                let committed = null;
                const runtime = module.createIlluminationRuntime({
                    initialMode: 'current',
                    capabilities: capabilityMap,
                    createResource,
                    prewarm() {
                        gl.flush();
                        gl.finish();
                    },
                    commitSnapshot(snapshot) {
                        committed = snapshot;
                        return true;
                    },
                    waitUntilSafeToDispose() {
                        gl.finish();
                    }
                });
                const loadStarted = performance.now();
                await runtime.setMode('baked', {
                    url: `/package.ilpkg?sample=${index}&warmup=${warmup ? 1 : 0}`,
                    expectations: packageExpectations
                });
                const readyAt = performance.now();
                const active = runtime.commitFrameBoundary();
                if (active.state !== 'active' || active.effectiveMode !== 'baked' || committed?.mode !== 'baked') {
                    throw new Error(`Runtime did not atomically activate the staged package (state=${active.state}).`);
                }
                runtime.deactivate('profile_cycle');
                const current = runtime.commitFrameBoundary();
                if (current.effectiveMode !== 'current' || committed?.mode !== 'current') {
                    throw new Error('Runtime did not atomically restore the current lighting path.');
                }
                await runtime.waitForIdle();
                const completedAt = performance.now();
                const diagnostics = runtime.getDiagnostics();
                const controller = diagnostics.controller;
                const resources = diagnostics.resources;
                if (!resources) throw new Error('Runtime resource diagnostics are unavailable after a completed load.');
                if (resources.phase !== 'disposed') throw new Error(`Runtime resources ended in '${resources.phase}', not 'disposed'.`);
                const glError = gl.getError();
                if (glError !== gl.NO_ERROR) throw new Error(`WebGL error ${glError} remained after the profile cycle.`);
                const sample = {
                    timingsMs: {
                        fetchRead: controller.timings.fetchReadMs,
                        hash: controller.timings.hashMs,
                        decode: controller.timings.decodeMs,
                        cpuStaging: controller.timings.cpuStagingMs,
                        upload: controller.timings.gpuUploadMs,
                        prewarm: resources.timingsMs.prewarmMs,
                        activation: resources.timingsMs.activationMs,
                        disposal: resources.timingsMs.disposalMs,
                        loadWall: readyAt - loadStarted,
                        cycleWall: completedAt - loadStarted
                    },
                    memoryBytes: {
                        peakLogicalCpu: controller.memory.peakCpuBytes,
                        peakLogicalGpu: controller.memory.peakGpuBytes,
                        residentLogicalCpu: resources.memory.resident.cpuBytes,
                        residentLogicalGpu: resources.memory.resident.gpuBytes
                    }
                };
                await runtime.teardown();
                return sample;
            }

            function syntheticTextureBytes(encoding) {
                const texelCount = 32 * 32;
                if (encoding === 'r8_unorm') {
                    const bytes = new Uint8Array(texelCount);
                    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 37 + 11) & 0xff;
                    return bytes;
                }
                if (encoding === 'rgba16f_le') {
                    const bytes = new Uint8Array(texelCount * 4 * 2);
                    const view = new DataView(bytes.buffer);
                    const halfPatterns = [0x0000, 0x3800, 0x3c00, 0x4000, 0xbc00, 0x7bff];
                    for (let index = 0; index < bytes.byteLength / 2; index += 1) {
                        view.setUint16(index * 2, halfPatterns[index % halfPatterns.length], true);
                    }
                    return bytes;
                }
                const bytes = new Uint8Array(texelCount * 4 * 4);
                const view = new DataView(bytes.buffer);
                for (let index = 0; index < bytes.byteLength / 4; index += 1) {
                    view.setFloat32(index * 4, ((index % 257) - 128) / 128, true);
                }
                return bytes;
            }

            function surveyFormatCycle(format) {
                const uploadStarted = performance.now();
                const created = createResource(format.bytes, {
                    id: `profile_format_${format.encoding}`,
                    upload: {
                        kind: 'texture_2d',
                        encoding: format.encoding,
                        width: 32,
                        height: 32
                    }
                });
                gl.finish();
                const uploadedAt = performance.now();
                if (created.gpuBytes !== format.bytes.byteLength) {
                    throw new Error(`Format survey '${format.encoding}' reported ${created.gpuBytes} GPU bytes; expected ${format.bytes.byteLength}.`);
                }
                created.dispose();
                gl.finish();
                const disposedAt = performance.now();
                const glError = gl.getError();
                if (glError !== gl.NO_ERROR) {
                    throw new Error(`WebGL error ${glError} remained after '${format.encoding}' format survey.`);
                }
                return {
                    uploadMs: uploadedAt - uploadStarted,
                    disposalMs: disposedAt - uploadedAt,
                    cycleMs: disposedAt - uploadStarted
                };
            }

            const formatDefinitions = ['rgba32f_le', 'rgba16f_le', 'r8_unorm'].map((encoding) => ({
                encoding,
                bytes: syntheticTextureBytes(encoding)
            }));
            const surveyedFormats = {};
            for (const format of formatDefinitions) {
                surveyFormatCycle(format);
                const formatSamples = [];
                for (let index = 0; index < sampleCount; index += 1) {
                    formatSamples.push(surveyFormatCycle(format));
                }
                surveyedFormats[format.encoding] = {
                    width: 32,
                    height: 32,
                    byteLength: format.bytes.byteLength,
                    samples: formatSamples
                };
            }

            await cycle(-1, true);
            const values = [];
            for (let index = 0; index < sampleCount; index += 1) values.push(await cycle(index, false));
            return {
                available: true,
                samples: values,
                formatSurvey: {
                    extensionAvailability,
                    formats: surveyedFormats
                },
                environment: {
                    browserUserAgent: navigator.userAgent,
                    platform: navigator.platform,
                    webglVendor,
                    webglRenderer,
                    webglVersion: String(gl.getParameter(gl.VERSION)),
                    webglShadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
                    maxTextureSize: probe.limits.maxTextureSize,
                    maxArrayTextureLayers: probe.limits.maxArrayTextureLayers
                }
            };
        }, { sampleCount: samples, capabilities: declaredCapabilities, packageExpectations: expectations });
        if (!result.available) return Object.freeze(result);
        return Object.freeze({
            ...result,
            measurementPath: 'headless_chromium_webgl2',
            browserVersion: browser.version(),
            fallbackReason: null
        });
    } finally {
        await server.close();
        await browser.close();
    }
}

async function measureWithNode({ packageBytes, samples, declaredCapabilities, expectations, fallbackReason }) {
    const capabilityMap = Object.freeze(Object.fromEntries(declaredCapabilities.map((id) => [id, true])));
    async function cycle() {
        let committed = null;
        const runtime = createIlluminationRuntime({
            initialMode: 'current',
            capabilities: capabilityMap,
            fetchPackage: () => packageBytes.slice(),
            createResource(decoded) {
                const bytes = decoded instanceof Uint8Array
                    ? decoded
                    : new Uint8Array(decoded.buffer ?? decoded, decoded.byteOffset ?? 0, decoded.byteLength);
                return Object.freeze({
                    resource: Object.freeze({ kind: 'logical_profile_resource', byteLength: bytes.byteLength }),
                    cpuBytes: 0,
                    gpuBytes: bytes.byteLength,
                    dispose() {}
                });
            },
            commitSnapshot(snapshot) {
                committed = snapshot;
                return true;
            }
        });
        const loadStarted = performance.now();
        await runtime.setMode('baked', { url: 'memory://package.ilpkg', expectations });
        const readyAt = performance.now();
        const active = runtime.commitFrameBoundary();
        if (active.state !== 'active' || committed?.mode !== 'baked') throw new Error('Node runtime profile activation failed.');
        runtime.deactivate('profile_cycle');
        runtime.commitFrameBoundary();
        await runtime.waitForIdle();
        const completedAt = performance.now();
        const diagnostics = runtime.getDiagnostics();
        const controller = diagnostics.controller;
        const resources = diagnostics.resources;
        if (resources?.phase !== 'disposed') throw new Error(`Runtime resources ended in '${resources?.phase}', not 'disposed'.`);
        const sample = {
            timingsMs: {
                fetchRead: controller.timings.fetchReadMs,
                hash: controller.timings.hashMs,
                decode: controller.timings.decodeMs,
                cpuStaging: controller.timings.cpuStagingMs,
                upload: controller.timings.gpuUploadMs,
                prewarm: resources?.timingsMs.prewarmMs ?? 0,
                activation: resources?.timingsMs.activationMs ?? 0,
                disposal: resources?.timingsMs.disposalMs ?? 0,
                loadWall: readyAt - loadStarted,
                cycleWall: completedAt - loadStarted
            },
            memoryBytes: {
                peakLogicalCpu: controller.memory.peakCpuBytes,
                peakLogicalGpu: controller.memory.peakGpuBytes,
                residentLogicalCpu: resources?.memory.resident.cpuBytes ?? 0,
                residentLogicalGpu: resources?.memory.resident.gpuBytes ?? 0
            }
        };
        await runtime.teardown();
        return sample;
    }
    await cycle();
    const values = [];
    for (let index = 0; index < samples; index += 1) values.push(await cycle());
    return Object.freeze({
        available: true,
        measurementPath: 'node_logical_resource_fallback',
        fallbackReason,
        browserVersion: null,
        environment: Object.freeze({
            platform: `${process.platform}/${process.arch}`,
            nodeVersion: process.version
        }),
        samples: Object.freeze(values)
    });
}

function createReport({ packagePath, parsed, validationReport, samples, measured }) {
    const browserMeasured = measured.measurementPath === 'headless_chromium_webgl2';
    const timingKeys = ['fetchRead', 'hash', 'decode', 'cpuStaging', 'upload', 'prewarm', 'activation', 'disposal', 'loadWall', 'cycleWall'];
    const memoryKeys = ['peakLogicalCpu', 'peakLogicalGpu', 'residentLogicalCpu', 'residentLogicalGpu'];
    const timingsMs = Object.fromEntries(timingKeys.map((key) => [
        key,
        summarize(measured.samples.map((sample) => sample.timingsMs[key]), 'ms')
    ]));
    const memoryBytes = Object.fromEntries(memoryKeys.map((key) => [
        key,
        summarize(measured.samples.map((sample) => sample.memoryBytes[key]), 'bytes')
    ]));
    const rawIntermediateBytes = matchingSize(validationReport, 'intermediateRawByteLength');
    const payloadBytes = parsed.metrics.payloadByteLength;
    const decodedBytes = parsed.metrics.decodedByteLength;
    const compressionRatio = matchingRatio(validationReport)
        ?? (payloadBytes === 0
            ? notMeasured('Payload is empty, so a decoded-to-payload ratio is undefined.')
            : round(decodedBytes / payloadBytes));
    const unavailableBrowserReason = measured.fallbackReason ?? 'Browser/WebGL2 profiling path was unavailable.';
    return Object.freeze({
        schema: PROFILE_SCHEMA,
        generatedAtUtc: new Date().toISOString(),
        identity: Object.freeze({
            aggregateSha256: parsed.aggregateSha256,
            cityId: parsed.manifest.cityId,
            lightingProfileId: parsed.manifest.lightingProfileId,
            capabilityProfileId: parsed.manifest.selectedCapabilityProfileId
        }),
        input: Object.freeze({
            packagePath: portablePath(packagePath),
            packageByteLength: parsed.metrics.packageByteLength
        }),
        conditions: Object.freeze({
            sampleCount: samples,
            warmupSampleCount: 1,
            statistic: 'mean_median_p90',
            sequence: 'fetch_validate_decode_upload_prewarm_frame_boundary_commit_deactivate_safe_disposal',
            cachePolicy: browserMeasured ? 'http_no_store_unique_query_per_cycle' : 'in_memory_copy_per_cycle',
            samePackageAndRuntimeForEverySample: true
        }),
        environment: Object.freeze({
            measurementPath: measured.measurementPath,
            browserVersion: browserMeasured ? measured.browserVersion : notMeasured(unavailableBrowserReason),
            browserUserAgent: browserMeasured ? measured.environment.browserUserAgent : notMeasured(unavailableBrowserReason),
            platform: measured.environment.platform,
            webglVendor: browserMeasured ? measured.environment.webglVendor : notMeasured(unavailableBrowserReason),
            webglRenderer: browserMeasured ? measured.environment.webglRenderer : notMeasured(unavailableBrowserReason),
            webglVersion: browserMeasured ? measured.environment.webglVersion : notMeasured(unavailableBrowserReason),
            webglShadingLanguageVersion: browserMeasured
                ? measured.environment.webglShadingLanguageVersion
                : notMeasured(unavailableBrowserReason),
            maxTextureSize: browserMeasured
                ? measured.environment.maxTextureSize
                : notMeasured(unavailableBrowserReason),
            maxArrayTextureLayers: browserMeasured
                ? measured.environment.maxArrayTextureLayers
                : notMeasured(unavailableBrowserReason),
            fallbackReason: measured.fallbackReason
        }),
        sizes: Object.freeze({
            packageBytes: parsed.metrics.packageByteLength,
            rawIntermediateBytes,
            payloadBytes,
            decodedBytes,
            compressedPayloadBytes: payloadBytes,
            compressionRatioDecodedToPayload: compressionRatio,
            packageOverheadBytes: parsed.metrics.packageByteLength - payloadBytes
        }),
        timingsMs: Object.freeze(timingsMs),
        memoryBytes: Object.freeze({
            ...memoryBytes,
            physicalProcessPeakCpu: notMeasured('The runtime exposes logical allocation accounting, not per-cycle browser process RSS.'),
            physicalGpuPeak: notMeasured('WebGL2 does not expose portable physical GPU allocation telemetry.')
        }),
        formatSurvey: createFormatSurveyReport(measured, samples, unavailableBrowserReason),
        validation: Object.freeze({
            successfulSamples: measured.samples.length,
            allCyclesActivatedAndDisposed: measured.samples.length === samples,
            packageCompatibilityReason: parsed.compatibility.reason
        })
    });
}

function createFormatSurveyReport(measured, samples, unavailableBrowserReason) {
    const measuredSurvey = measured.formatSurvey ?? null;
    const definitions = Object.freeze([
        Object.freeze({ id: 'rgba32f_le', bytesPerTexel: 16, byteLength: 16_384, semanticStatus: 'preserves_ai529_canonical_float32_values' }),
        Object.freeze({ id: 'rgba16f_le', bytesPerTexel: 8, byteLength: 8_192, semanticStatus: 'synthetic_upload_only_precision_not_approved' }),
        Object.freeze({ id: 'r8_unorm', bytesPerTexel: 1, byteLength: 1_024, semanticStatus: 'synthetic_upload_only_precision_not_approved' })
    ]);
    const uncompressed = {};
    for (const definition of definitions) {
        const measuredFormat = measuredSurvey?.formats?.[definition.id] ?? null;
        const unavailable = notMeasured(unavailableBrowserReason);
        uncompressed[definition.id] = Object.freeze({
            width: 32,
            height: 32,
            texelCount: 1024,
            bytesPerTexel: definition.bytesPerTexel,
            encodedBytes: definition.byteLength,
            compression: 'none',
            semanticStatus: definition.semanticStatus,
            sampleCount: measuredFormat ? measuredFormat.samples.length : 0,
            uploadMs: measuredFormat
                ? summarize(measuredFormat.samples.map((entry) => entry.uploadMs), 'ms')
                : unavailable,
            disposalMs: measuredFormat
                ? summarize(measuredFormat.samples.map((entry) => entry.disposalMs), 'ms')
                : unavailable,
            cycleMs: measuredFormat
                ? summarize(measuredFormat.samples.map((entry) => entry.cycleMs), 'ms')
                : unavailable
        });
    }
    const extensionNames = Object.freeze([
        'OES_texture_float_linear',
        'EXT_color_buffer_float',
        'WEBGL_compressed_texture_etc',
        'EXT_texture_compression_bptc',
        'WEBGL_compressed_texture_astc',
        'WEBGL_compressed_texture_s3tc'
    ]);
    const extensions = Object.fromEntries(extensionNames.map((id) => [
        id,
        measuredSurvey ? measuredSurvey.extensionAvailability[id] : notMeasured(unavailableBrowserReason)
    ]));
    const compressedReason = 'Not measured: AI530 has no deterministic compiler-signed semantic encoder for this format; precision promotion belongs to AI531/AI533.';
    const compressedDefinitions = Object.freeze([
        Object.freeze({ id: 'etc', extension: 'WEBGL_compressed_texture_etc' }),
        Object.freeze({ id: 'bptc', extension: 'EXT_texture_compression_bptc' }),
        Object.freeze({ id: 'astc', extension: 'WEBGL_compressed_texture_astc' }),
        Object.freeze({ id: 's3tc', extension: 'WEBGL_compressed_texture_s3tc' })
    ]);
    const compressedAlternatives = Object.fromEntries(compressedDefinitions.map((definition) => [
        definition.id,
        Object.freeze({
            extension: definition.extension,
            extensionAvailable: extensions[definition.extension],
            encodedBytes: notMeasured(compressedReason),
            uploadMs: notMeasured(compressedReason),
            disposalMs: notMeasured(compressedReason)
        })
    ]));
    return Object.freeze({
        conditions: Object.freeze({
            dimensions: '32x32',
            deterministicSyntheticPayload: true,
            sampleCount: measuredSurvey ? samples : 0,
            warmupSampleCountPerEncoding: measuredSurvey ? 1 : 0,
            synchronization: 'gl.finish_after_upload_and_disposal',
            statistic: 'mean_median_p90'
        }),
        extensions: Object.freeze(extensions),
        uncompressed: Object.freeze(uncompressed),
        compressedAlternatives: Object.freeze(compressedAlternatives),
        defaultDecision: Object.freeze({
            encoding: 'rgba32f_le',
            compression: 'none',
            status: 'correctness_default',
            rationale: 'RGBA32F with no compression preserves the AI529 canonical float32 values and requires no runtime transcode. Lower precision or compressed promotion requires semantic validation in AI531/AI533.'
        })
    });
}

function summarize(values, unit) {
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
        return notMeasured('No complete non-negative finite samples were available.');
    }
    const sorted = [...values].sort((left, right) => left - right);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    return Object.freeze({
        unit,
        mean: round(mean),
        median: round(percentile(sorted, 0.5)),
        p90: round(percentile(sorted, 0.9))
    });
}

function percentile(sorted, fraction) {
    if (sorted.length === 1) return sorted[0];
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function round(value) {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function notMeasured(reason) {
    return Object.freeze({ status: 'not_measured', reason });
}

async function readMatchingValidationReport(packagePath, parsed, packageByteLength) {
    const reportPath = path.join(path.dirname(packagePath), 'validation_report.json');
    try {
        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        if (report?.schema !== 'bus-sim-illumination-package-validation-report-v1'
            || report?.identity?.aggregateSha256 !== parsed.aggregateSha256
            || report?.sizes?.packageByteLength !== packageByteLength) return null;
        return report;
    } catch {
        return null;
    }
}

function matchingSize(report, key) {
    const value = report?.sizes?.[key];
    return Number.isSafeInteger(value) && value >= 0
        ? value
        : notMeasured('A matching package validation sidecar did not provide this source-size metric.');
}

function matchingRatio(report) {
    const value = report?.sizes?.compressionRatio;
    return Number.isFinite(value) && value > 0 ? round(value) : null;
}

function collectDeclaredCapabilities(parsed) {
    const capabilities = new Set();
    const selected = parsed.manifest.capabilityProfiles.find(
        (entry) => entry.id === parsed.manifest.selectedCapabilityProfileId
    );
    for (const id of selected?.requiredRuntimeCapabilities ?? []) capabilities.add(id);
    for (const chunk of parsed.chunkTable.chunks) {
        if (!parsed.compatibility.selectedChunkIds.includes(chunk.id)) continue;
        for (const id of chunk.requiredRuntimeCapabilities) capabilities.add(id);
    }
    return Object.freeze([...capabilities].sort());
}

function packageExpectations(parsed) {
    return Object.freeze({
        cityId: parsed.manifest.cityId,
        lightingProfileId: parsed.manifest.lightingProfileId,
        selectedCapabilityProfileId: parsed.manifest.selectedCapabilityProfileId,
        resolvedSourceSha256: parsed.manifest.source.resolvedSourceSha256
    });
}

async function startProfileServer(packagePath) {
    const packageBytes = await readFile(packagePath);
    const server = createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
            response.setHeader('Cache-Control', 'no-store');
            if (requestUrl.pathname === '/profile.html') {
                response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                response.end('<!doctype html><meta charset="utf-8"><title>AI 530 profile</title>');
                return;
            }
            if (requestUrl.pathname === '/package.ilpkg') {
                response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': packageBytes.byteLength });
                response.end(packageBytes);
                return;
            }
            const decoded = decodeURIComponent(requestUrl.pathname);
            const candidate = path.resolve(WORKSPACE_ROOT, '.' + decoded);
            if (!isWithinRoot(candidate, WORKSPACE_ROOT) || path.extname(candidate) !== '.js') {
                response.writeHead(404);
                response.end('not found');
                return;
            }
            const source = await readFile(candidate);
            response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': source.byteLength });
            response.end(source);
        } catch (error) {
            response.writeHead(error?.code === 'ENOENT' ? 404 : 500);
            response.end(errorMessage(error));
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Profile HTTP server did not bind to a TCP port.');
    return Object.freeze({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    });
}

function isWithinRoot(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function atomicWriteCanonicalJson(outputPath, value) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    try {
        await writeFile(temporaryPath, canonicalJsonStringify(value), { encoding: 'utf8', flag: 'wx' });
        await rename(temporaryPath, outputPath);
    } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        throw error;
    }
}

function portablePath(value) {
    const relative = path.relative(WORKSPACE_ROOT, value);
    return isWithinRoot(value, WORKSPACE_ROOT) ? relative.replaceAll(path.sep, '/') : value;
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
    try {
        process.exitCode = await main();
    } catch (error) {
        process.stderr.write(canonicalJsonStringify(Object.freeze({
            schema: 'bus-sim-illumination-package-runtime-profile-error-v1',
            error: errorMessage(error)
        })) + '\n');
        process.exitCode = 1;
    }
}
