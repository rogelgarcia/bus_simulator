// Captures deterministic native-resolution Grass Lab evidence and metadata.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, '../..');
const DEFAULT_OUTPUT = 'screens/grass_ai358';
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const V2_ASSET_URL_PREFIX = '/assets/public/pbr/grass_low_cut_maintained_v2/';
const WIDTH = 3840;
const HEIGHT = 2160;
const TURF_ROI = Object.freeze({ x: 0.2, y: 0.55, width: 0.6, height: 0.35 });
export const CARD_BAND_ROI = Object.freeze({ x: 0.05, y: 0.35, width: 0.9, height: 0.08 });
export const CARD_BAND_GATE_CONTRACT = Object.freeze({
    geometryToTextureRatio: 0.7,
    minimumLuminanceDelta: 0.06,
    smoothingRows: 3,
    maximumDarkenedFraction: 0.1
});
const NEUTRAL_PAIR_DEFINITIONS = Object.freeze([
    Object.freeze({ lighting: 'daylight', geometry: 'geometry_on_daylight', texture: 'texture_only_daylight' }),
    Object.freeze({ lighting: 'overcast', geometry: 'geometry_on_overcast', texture: 'texture_only_overcast' })
]);

function parseArgs(argv) {
    const options = {
        phase: null,
        output: DEFAULT_OUTPUT,
        baseUrl: process.env.GRASS_LAB_BASE_URL || DEFAULT_BASE_URL,
        v2AssetRoot: process.env.GRASS_LAB_V2_ASSET_ROOT || null,
        executablePath: process.env.E2E_BROWSER_EXECUTABLE || null,
        headed: false,
        overwrite: false
    };
    for (const arg of argv) {
        if (arg === '--headed') options.headed = true;
        else if (arg === '--overwrite') options.overwrite = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--phase=')) options.phase = arg.slice('--phase='.length).trim();
        else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length).trim();
        else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length).trim();
        else if (arg.startsWith('--v2-asset-root=')) options.v2AssetRoot = arg.slice('--v2-asset-root='.length).trim();
        else if (arg.startsWith('--browser-executable=')) options.executablePath = arg.slice('--browser-executable='.length).trim();
        else throw new Error(`[GrassLabCapture] Unknown argument: ${arg}`);
    }
    if (options.help) return options;
    if (options.phase !== 'before' && options.phase !== 'after') {
        throw new Error('[GrassLabCapture] --phase=before or --phase=after is required.');
    }
    if (!options.output) throw new Error('[GrassLabCapture] --output must not be empty.');
    if (!options.baseUrl) throw new Error('[GrassLabCapture] --base-url must not be empty.');
    return options;
}

function usage() {
    return [
        'Grass Lab native-4K evidence capture',
        '',
        'Usage:',
        '  node tools/grass_lab_capture/run.mjs --phase=before',
        '  node tools/grass_lab_capture/run.mjs --phase=after',
        '',
        'Options:',
        `  --output=${DEFAULT_OUTPUT}`,
        `  --base-url=${DEFAULT_BASE_URL}`,
        '  --v2-asset-root=<repository-relative staging directory>',
        '  --browser-executable=<path>',
        '  --headed',
        '  --overwrite'
    ].join('\n');
}

function resolveOutputRoot(relativePath) {
    const absolute = path.resolve(REPO_ROOT, relativePath);
    const relative = path.relative(REPO_ROOT, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('[GrassLabCapture] Output must be a repository-relative subdirectory.');
    }
    return absolute;
}

export function resolveV2AssetRoot(relativePath) {
    if (!relativePath) return null;
    const absolute = path.resolve(REPO_ROOT, relativePath);
    const relative = path.relative(REPO_ROOT, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('[GrassLabCapture] V2 asset override must be a repository-relative subdirectory.');
    }
    return absolute;
}

async function installV2AssetOverride(page, relativePath) {
    const root = resolveV2AssetRoot(relativePath);
    if (!root) return null;
    await access(root);
    await page.route(`**${V2_ASSET_URL_PREFIX}**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const relative = decodeURIComponent(pathname.slice(V2_ASSET_URL_PREFIX.length));
        const filePath = path.resolve(root, relative);
        if (!relative || relative.includes('/') || relative.includes('\\') || path.dirname(filePath) !== root) {
            await route.abort('blockedbyclient');
            return;
        }
        if (relative === 'pbr.material.correction.config.js' && !(await pathExists(filePath))) {
            await route.continue();
            return;
        }
        const body = await readFile(filePath);
        const contentType = path.extname(filePath).toLowerCase() === '.json'
            ? 'application/json; charset=utf-8'
            : 'image/png';
        await route.fulfill({ status: 200, contentType, body });
    });
    return path.relative(REPO_ROOT, root).replaceAll('\\', '/');
}

function isOptionalCorrectionConfig(url) {
    try {
        return new URL(url).pathname.endsWith('/pbr.material.correction.config.js');
    } catch {
        return false;
    }
}

async function pathExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function fetchHealth(baseUrl) {
    try {
        const response = await fetch(new URL('/__health', baseUrl), { signal: AbortSignal.timeout(1500) });
        return response.ok;
    } catch {
        return false;
    }
}

async function ensureStaticServer(baseUrl) {
    if (await fetchHealth(baseUrl)) return null;
    const url = new URL(baseUrl);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        throw new Error(`[GrassLabCapture] Base URL is unavailable: ${baseUrl}`);
    }
    const server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            HOST: url.hostname,
            PORT: url.port || '4173'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let serverError = '';
    server.stderr.on('data', (chunk) => {
        serverError += String(chunk);
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(`[GrassLabCapture] Static server exited early. ${serverError.trim()}`);
        }
        if (await fetchHealth(baseUrl)) return server;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    server.kill('SIGTERM');
    throw new Error(`[GrassLabCapture] Static server did not become ready. ${serverError.trim()}`);
}

export function buildCaptureRecipes() {
    return Object.freeze([
        Object.freeze({ id: 'material_daylight', role: 'material_fixture', quality: 'default', lighting: 'daylight', material: true, grazing: false }),
        Object.freeze({ id: 'material_overcast', role: 'material_fixture', quality: 'default', lighting: 'overcast', material: true, grazing: false }),
        Object.freeze({ id: 'material_golden', role: 'material_fixture', quality: 'default', lighting: 'golden', material: true, grazing: true }),
        Object.freeze({ id: 'material_night', role: 'material_fixture', quality: 'default', lighting: 'night', material: true, grazing: false }),
        Object.freeze({ id: 'close_geometry_daylight', role: 'geometry_on_close', quality: 'default', lighting: 'daylight', camera: 'height_030' }),
        Object.freeze({ id: 'geometry_on_daylight', role: 'geometry_on_neutral_pair', quality: 'default', lighting: 'daylight', camera: 'height_050' }),
        Object.freeze({ id: 'geometry_on_overcast', role: 'geometry_on_grazing', quality: 'default', lighting: 'overcast', camera: 'height_050' }),
        Object.freeze({ id: 'texture_only_daylight', role: 'texture_only', quality: 'low', lighting: 'daylight', camera: 'height_050' }),
        Object.freeze({ id: 'texture_only_overcast', role: 'texture_only_neutral_pair', quality: 'low', lighting: 'overcast', camera: 'height_050' }),
        Object.freeze({ id: 'near_handoff_golden', role: 'handoff', quality: 'default', lighting: 'golden', camera: 'near_handoff' }),
        Object.freeze({ id: 'far_texture_night', role: 'far', quality: 'default', lighting: 'night', camera: 'far_texture' })
    ]);
}

function paethPredictor(left, up, upperLeft) {
    const prediction = left + up - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const diagonalDistance = Math.abs(prediction - upperLeft);
    if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
    return upDistance <= diagonalDistance ? up : upperLeft;
}

function decodePngPixels(buffer) {
    const dimensions = readPngDimensions(buffer);
    const bitDepth = buffer[24];
    const colorType = buffer[25];
    const interlace = buffer[28];
    if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
        throw new Error(`[GrassLabCapture] Unsupported PNG layout: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
    }
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const idatChunks = [];
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buffer.length) throw new Error('[GrassLabCapture] Truncated PNG chunk.');
        if (type === 'IDAT') idatChunks.push(buffer.subarray(dataStart, dataEnd));
        offset = dataEnd + 4;
        if (type === 'IEND') break;
    }
    if (!idatChunks.length) throw new Error('[GrassLabCapture] PNG has no IDAT data.');
    const encoded = inflateSync(Buffer.concat(idatChunks));
    const stride = dimensions.width * bytesPerPixel;
    const expectedBytes = (stride + 1) * dimensions.height;
    if (encoded.length !== expectedBytes) throw new Error('[GrassLabCapture] PNG scanline size is invalid.');
    const pixels = Buffer.allocUnsafe(stride * dimensions.height);
    let sourceOffset = 0;
    for (let y = 0; y < dimensions.height; y += 1) {
        const filter = encoded[sourceOffset];
        sourceOffset += 1;
        const rowOffset = y * stride;
        for (let x = 0; x < stride; x += 1) {
            const raw = encoded[sourceOffset + x];
            const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
            const up = y > 0 ? pixels[rowOffset + x - stride] : 0;
            const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset + x - stride - bytesPerPixel] : 0;
            let value = raw;
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += Math.floor((left + up) / 2);
            else if (filter === 4) value += paethPredictor(left, up, upperLeft);
            else if (filter !== 0) throw new Error(`[GrassLabCapture] Unsupported PNG filter: ${filter}.`);
            pixels[rowOffset + x] = value & 0xff;
        }
        sourceOffset += stride;
    }
    return { ...dimensions, bytesPerPixel, pixels };
}

function resolveNormalizedRoi(width, height, roi) {
    const source = roi && typeof roi === 'object' ? roi : {};
    const x = Number(source.x);
    const y = Number(source.y);
    const roiWidth = Number(source.width);
    const roiHeight = Number(source.height);
    if (![x, y, roiWidth, roiHeight].every(Number.isFinite)
        || x < 0 || y < 0 || roiWidth <= 0 || roiHeight <= 0 || x >= 1 || y >= 1) {
        throw new Error(`[GrassLabCapture] Invalid normalized ROI: ${JSON.stringify(roi)}`);
    }
    const sourceX = Math.max(0, Math.round(width * x));
    const sourceY = Math.max(0, Math.round(height * y));
    const sourceWidth = Math.max(1, Math.min(width - sourceX, Math.round(width * roiWidth)));
    const sourceHeight = Math.max(1, Math.min(height - sourceY, Math.round(height * roiHeight)));
    return { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight };
}

function pixelLuminance(decoded, x, y) {
    const index = (y * decoded.width + x) * decoded.bytesPerPixel;
    return (
        0.2126 * decoded.pixels[index]
        + 0.7152 * decoded.pixels[index + 1]
        + 0.0722 * decoded.pixels[index + 2]
    ) / 255;
}

export function measurePngFrame(buffer, roi = TURF_ROI) {
    const decoded = decodePngPixels(buffer);
    const source = resolveNormalizedRoi(decoded.width, decoded.height, roi);
    const sourceX = source.x;
    const sourceY = source.y;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const histogram = new Uint32Array(256);
    let luminanceSum = 0;
    let saturationSum = 0;
    let brightPixels = 0;
    for (let y = sourceY; y < sourceY + sourceHeight; y += 1) {
        for (let x = sourceX; x < sourceX + sourceWidth; x += 1) {
            const index = (y * decoded.width + x) * decoded.bytesPerPixel;
            const red = decoded.pixels[index] / 255;
            const green = decoded.pixels[index + 1] / 255;
            const blue = decoded.pixels[index + 2] / 255;
            const maximum = Math.max(red, green, blue);
            const minimum = Math.min(red, green, blue);
            const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
            histogram[Math.max(0, Math.min(255, Math.round(luminance * 255)))] += 1;
            luminanceSum += luminance;
            saturationSum += maximum > 0 ? (maximum - minimum) / maximum : 0;
            if (luminance >= 0.9) brightPixels += 1;
        }
    }
    const pixelCount = sourceWidth * sourceHeight;
    const midpoint = Math.ceil(pixelCount * 0.5);
    let cumulative = 0;
    let medianBin = 0;
    for (let index = 0; index < histogram.length; index += 1) {
        cumulative += histogram[index];
        if (cumulative >= midpoint) {
            medianBin = index;
            break;
        }
    }
    const round = (value) => Math.round(value * 100000) / 100000;
    return {
        roiNormalized: { ...roi },
        roiSourcePixels: { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight },
        sampleWidth: sourceWidth,
        sampleHeight: sourceHeight,
        meanLuminance: round(luminanceSum / pixelCount),
        medianLuminance: round(medianBin / 255),
        meanSaturation: round(saturationSum / pixelCount),
        brightPixelFraction: round(brightPixels / pixelCount)
    };
}

export function measureCardBandPair(geometryBuffer, textureBuffer, roi = CARD_BAND_ROI) {
    const geometry = decodePngPixels(geometryBuffer);
    const texture = decodePngPixels(textureBuffer);
    if (geometry.width !== texture.width || geometry.height !== texture.height) {
        throw new Error(
            `[GrassLabCapture] Card-band pair dimensions differ: geometry=${geometry.width}x${geometry.height}, `
            + `texture=${texture.width}x${texture.height}.`
        );
    }
    const source = resolveNormalizedRoi(geometry.width, geometry.height, roi);
    if (source.height < CARD_BAND_GATE_CONTRACT.smoothingRows) {
        throw new Error(
            `[GrassLabCapture] Card-band ROI must contain at least ${CARD_BAND_GATE_CONTRACT.smoothingRows} pixel rows.`
        );
    }
    const rowDarkenedFractions = [];
    let darkenedPixelCount = 0;
    for (let y = source.y; y < source.y + source.height; y += 1) {
        let rowDarkenedPixels = 0;
        for (let x = source.x; x < source.x + source.width; x += 1) {
            const geometryLuminance = pixelLuminance(geometry, x, y);
            const textureLuminance = pixelLuminance(texture, x, y);
            if (geometryLuminance < CARD_BAND_GATE_CONTRACT.geometryToTextureRatio * textureLuminance
                && textureLuminance - geometryLuminance > CARD_BAND_GATE_CONTRACT.minimumLuminanceDelta) {
                rowDarkenedPixels += 1;
            }
        }
        darkenedPixelCount += rowDarkenedPixels;
        rowDarkenedFractions.push(rowDarkenedPixels / source.width);
    }
    const smoothingRows = CARD_BAND_GATE_CONTRACT.smoothingRows;
    let rollingSum = rowDarkenedFractions.slice(0, smoothingRows).reduce((sum, value) => sum + value, 0);
    let maximumSmoothedFraction = rollingSum / smoothingRows;
    let maximumWindowIndex = 0;
    for (let index = smoothingRows; index < rowDarkenedFractions.length; index += 1) {
        rollingSum += rowDarkenedFractions[index] - rowDarkenedFractions[index - smoothingRows];
        const smoothed = rollingSum / smoothingRows;
        if (smoothed > maximumSmoothedFraction) {
            maximumSmoothedFraction = smoothed;
            maximumWindowIndex = index - smoothingRows + 1;
        }
    }
    const round = (value) => Math.round(value * 100000) / 100000;
    const smoothedMaximumDarkenedFraction = round(maximumSmoothedFraction);
    return {
        roiNormalized: { ...roi },
        roiSourcePixels: { ...source },
        imageDimensions: { width: geometry.width, height: geometry.height },
        criterion: {
            geometryToTextureRatioExclusiveMax: CARD_BAND_GATE_CONTRACT.geometryToTextureRatio,
            textureMinusGeometryExclusiveMin: CARD_BAND_GATE_CONTRACT.minimumLuminanceDelta
        },
        smoothingRows,
        darkenedPixelFraction: round(darkenedPixelCount / (source.width * source.height)),
        maximumRawRowDarkenedFraction: round(Math.max(...rowDarkenedFractions)),
        maximumSmoothedRowDarkenedFraction: smoothedMaximumDarkenedFraction,
        maximumWindowSourceRows: {
            start: source.y + maximumWindowIndex,
            endInclusive: source.y + maximumWindowIndex + smoothingRows - 1
        },
        maximumAllowedDarkenedFraction: CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction,
        pass: maximumSmoothedFraction <= CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction + 1e-12
    };
}

function captureCameraSignature(capture) {
    const camera = capture?.camera ?? null;
    return JSON.stringify(camera ? {
        position: camera.position ?? null,
        target: camera.target ?? null,
        fovDegrees: camera.fovDegrees ?? null,
        aspect: camera.aspect ?? null,
        nearMeters: camera.nearMeters ?? null,
        farMeters: camera.farMeters ?? null
    } : null);
}

function captureBuffer(pngByRecipe, recipeId) {
    if (pngByRecipe instanceof Map) return pngByRecipe.get(recipeId) ?? null;
    if (pngByRecipe && typeof pngByRecipe === 'object') return pngByRecipe[recipeId] ?? null;
    return null;
}

export function evaluateCardBandPairs(captures, pngByRecipe) {
    const byId = new Map((Array.isArray(captures) ? captures : []).map((entry) => [entry?.recipeId, entry]));
    const pairs = NEUTRAL_PAIR_DEFINITIONS.map((definition) => {
        const geometry = byId.get(definition.geometry) ?? null;
        const texture = byId.get(definition.texture) ?? null;
        const geometryPng = captureBuffer(pngByRecipe, definition.geometry);
        const texturePng = captureBuffer(pngByRecipe, definition.texture);
        if (!geometry || !texture || !Buffer.isBuffer(geometryPng) || !Buffer.isBuffer(texturePng)) {
            throw new Error(`[GrassLabCapture] Missing card-band evidence pair for ${definition.lighting}.`);
        }
        const cameraMatch = !!geometry.camera
            && !!texture.camera
            && captureCameraSignature(geometry) === captureCameraSignature(texture);
        const lightingMatch = geometry.lightingPreset === definition.lighting
            && texture.lightingPreset === definition.lighting;
        const geometryExposure = Number(geometry.exposure);
        const textureExposure = Number(texture.exposure);
        const exposureMatch = Number.isFinite(geometryExposure)
            && Number.isFinite(textureExposure)
            && geometryExposure === textureExposure;
        const measurement = measureCardBandPair(geometryPng, texturePng);
        const alignment = {
            cameraMatch,
            lightingMatch,
            exposureMatch,
            pixelDimensionsMatch: true,
            pass: cameraMatch && lightingMatch && exposureMatch
        };
        return {
            lighting: definition.lighting,
            geometryRecipeId: definition.geometry,
            textureRecipeId: definition.texture,
            alignment,
            ...measurement,
            pass: alignment.pass && measurement.pass
        };
    });
    return {
        gateId: 'live-field-card-band-v1',
        sampleScope: 'height_050_live_field_cards',
        materialFixtureAutomation: 'human-evidence-only',
        roiNormalized: { ...CARD_BAND_ROI },
        maximumAllowedDarkenedFraction: CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction,
        pairs,
        pass: pairs.every((pair) => pair.pass)
    };
}

export function evaluateLuminancePairs(captures) {
    const byId = new Map((Array.isArray(captures) ? captures : []).map((entry) => [entry?.recipeId, entry]));
    const pairs = NEUTRAL_PAIR_DEFINITIONS.map((definition) => {
        const geometry = byId.get(definition.geometry) ?? null;
        const texture = byId.get(definition.texture) ?? null;
        const geometryMedian = Number(geometry?.frameMetrics?.medianLuminance);
        const textureMedian = Number(texture?.frameMetrics?.medianLuminance);
        const ratio = Number.isFinite(geometryMedian) && Number.isFinite(textureMedian) && textureMedian > 0
            ? geometryMedian / textureMedian
            : null;
        return {
            lighting: definition.lighting,
            geometryRecipeId: definition.geometry,
            textureRecipeId: definition.texture,
            geometryMedianLuminance: Number.isFinite(geometryMedian) ? geometryMedian : null,
            textureMedianLuminance: Number.isFinite(textureMedian) ? textureMedian : null,
            ratio: ratio === null ? null : Math.round(ratio * 100000) / 100000,
            pass: ratio !== null && ratio >= 0.9 && ratio <= 1.1
        };
    });
    return {
        roiNormalized: { ...TURF_ROI },
        requiredRatio: { min: 0.9, max: 1.1 },
        pairs,
        pass: pairs.every((pair) => pair.pass)
    };
}

export function readPngDimensions(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24) throw new Error('[GrassLabCapture] PNG is too small.');
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.subarray(0, 8).equals(signature)) throw new Error('[GrassLabCapture] File is not a lossless PNG.');
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('[GrassLabCapture] PNG is missing IHDR.');
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

export function mergeCaptureManifest(existing, phase, captures, diagnostics = null) {
    const previous = existing && typeof existing === 'object' ? existing : {};
    const retained = Array.isArray(previous.captures)
        ? previous.captures.filter((entry) => entry?.phase !== phase)
        : [];
    return {
        schema: 'grass-lab-capture-manifest-v2',
        generatedAt: new Date().toISOString(),
        requiredDrawingBuffer: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        captures: [...retained, ...captures],
        diagnosticsByPhase: {
            ...(previous.diagnosticsByPhase && typeof previous.diagnosticsByPhase === 'object' ? previous.diagnosticsByPhase : {}),
            [phase]: diagnostics
        },
        luminanceGateByPhase: {
            ...(previous.luminanceGateByPhase && typeof previous.luminanceGateByPhase === 'object' ? previous.luminanceGateByPhase : {}),
            [phase]: diagnostics?.luminanceGate ?? null
        },
        cardBandGateByPhase: {
            ...(previous.cardBandGateByPhase && typeof previous.cardBandGateByPhase === 'object' ? previous.cardBandGateByPhase : {}),
            [phase]: diagnostics?.cardBandGate ?? null
        }
    };
}

export function summarizeSettledMaterialVersion(switchResult, captures) {
    const source = switchResult && typeof switchResult === 'object' ? switchResult : {};
    const settled = Array.isArray(captures)
        ? captures.find((entry) => entry?.materialDiagnostics && typeof entry.materialDiagnostics === 'object')
        : null;
    return {
        ...source,
        materialVersion: settled?.materialVersion ?? source.materialVersion ?? null,
        result: settled?.materialDiagnostics ?? source.result ?? null
    };
}

async function readExistingManifest(manifestPath) {
    if (!(await pathExists(manifestPath))) return null;
    return JSON.parse(await readFile(manifestPath, 'utf8'));
}

async function captureRecipe(page, outputRoot, outputRelative, phase, recipe, overwrite) {
    const filename = `${phase}_${recipe.id}.png`;
    const outputPath = path.join(outputRoot, filename);
    if (!overwrite && await pathExists(outputPath)) {
        throw new Error(`[GrassLabCapture] Refusing to overwrite ${path.relative(REPO_ROOT, outputPath)}; pass --overwrite.`);
    }
    await page.evaluate((next) => {
        const lab = window.__grassLab;
        lab.setQualityPreset(next.quality);
        if (next.material) {
            lab.setMaterialLighting(next.lighting);
            lab.focusMaterialFixture({ grazing: next.grazing });
        } else {
            lab.setLighting(next.lighting);
            lab.focusCamera(next.camera);
        }
        lab.resetValidationSamples();
    }, recipe);
    await page.evaluate(() => window.__grassLab.settleCaptureFrames(30));
    const metadata = await page.evaluate((context) => window.__grassLab.getCaptureMetadata(context), {
        phase,
        role: recipe.role,
        recipeId: recipe.id
    });
    const element = page.locator('#game-canvas');
    const bounds = await element.boundingBox();
    if (!bounds || Math.round(bounds.width) !== WIDTH || Math.round(bounds.height) !== HEIGHT) {
        throw new Error(`[GrassLabCapture] Canvas bounds are not ${WIDTH}x${HEIGHT}: ${JSON.stringify(bounds)}`);
    }
    await element.screenshot({ path: outputPath, type: 'png', animations: 'disabled' });
    const png = await readFile(outputPath);
    const dimensions = readPngDimensions(png);
    if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
        throw new Error(`[GrassLabCapture] Screenshot is ${dimensions.width}x${dimensions.height}, expected ${WIDTH}x${HEIGHT}.`);
    }
    const frameMetrics = measurePngFrame(png);
    const snapshot = metadata.snapshot ?? {};
    return {
        png,
        entry: {
            phase,
            role: recipe.role,
            recipeId: recipe.id,
            file: path.posix.join(outputRelative.replaceAll('\\', '/'), filename),
            lightingPreset: recipe.lighting,
            qualityPreset: recipe.quality,
            activeRepresentation: recipe.role,
            activeLodTier: snapshot?.lod?.activeTier ?? null,
            materialVersion: metadata.materialVersion ?? null,
            materialDiagnostics: metadata.materialDiagnostics ?? null,
            camera: metadata.camera,
            focus: metadata.focus,
            exposure: metadata.exposure,
            viewport: metadata.viewport,
            canvas: metadata.canvas,
            png: dimensions,
            frameMetrics,
            cost: {
                visibleGrassTriangles: snapshot?.grass?.triangles ?? null,
                grassLogicalDrawCalls: snapshot?.grass?.logicalDrawCalls ?? null,
                totalRendererDrawCalls: snapshot?.frame?.rendererDrawCalls ?? null,
                rendererTriangles: snapshot?.frame?.rendererTriangles ?? null,
                grassCpuMs: snapshot?.grass?.updateCpuMs ?? null,
                wholeFrameGpuMs: snapshot?.frame?.gpuMs ?? null
            }
        }
    };
}

async function collectCostSamples(page, phase) {
    const width = 1920;
    const height = 1080;
    await page.setViewportSize({ width, height });
    await page.evaluate(({ width: nextWidth, height: nextHeight }) => (
        window.__grassLab.enterCaptureMode({ width: nextWidth, height: nextHeight })
    ), { width, height });
    const samples = [];
    for (const qualityPreset of ['low', 'default', 'high']) {
        await page.evaluate((quality) => {
            const lab = window.__grassLab;
            lab.setQualityPreset(quality);
            lab.setLighting('daylight');
            lab.focusCamera('height_150');
            lab.resetValidationSamples();
        }, qualityPreset);
        await page.evaluate(() => window.__grassLab.settleCaptureFrames(60));
        const metadata = await page.evaluate((context) => window.__grassLab.getCaptureMetadata(context), {
            phase,
            role: 'cost_sample',
            qualityPreset
        });
        const snapshot = metadata.snapshot ?? {};
        const visibleGrassTriangles = snapshot?.grass?.triangles ?? null;
        const grassLogicalDrawCalls = snapshot?.grass?.logicalDrawCalls ?? null;
        samples.push({
            phase,
            qualityPreset,
            resolution: `${width}x${height}`,
            cameraPreset: 'height_150',
            lightingPreset: 'daylight',
            materialVersion: metadata.materialVersion ?? null,
            visibleGrassTriangles,
            grassLogicalDrawCalls,
            totalRendererDrawCalls: snapshot?.frame?.rendererDrawCalls ?? null,
            rendererTriangles: snapshot?.frame?.rendererTriangles ?? null,
            grassCpuMs: snapshot?.grass?.updateCpuMs ?? null,
            wholeFrameGpuMs: snapshot?.frame?.gpuMs ?? null,
            budget: {
                visibleGrassTriangleCeiling: 200000,
                grassLogicalDrawCallCeiling: 12,
                pass: Number(visibleGrassTriangles) <= 200000 && Number(grassLogicalDrawCalls) <= 12
            }
        });
    }
    await page.evaluate(() => window.__grassLab.exitCaptureMode());
    return samples;
}

async function run(options) {
    const outputRoot = resolveOutputRoot(options.output);
    const outputRelative = path.relative(REPO_ROOT, outputRoot);
    await mkdir(outputRoot, { recursive: true });
    const server = await ensureStaticServer(options.baseUrl);
    const runtimeErrors = [];
    const runtimeWarnings = [];
    let browser = null;
    try {
        browser = await chromium.launch({
            headless: !options.headed,
            ...(options.executablePath ? { executablePath: options.executablePath } : {}),
            args: [
                '--disable-dev-shm-usage',
                '--hide-scrollbars',
                '--force-color-profile=srgb',
                '--force-device-scale-factor=1'
            ]
        });
        const context = await browser.newContext({
            viewport: { width: WIDTH, height: HEIGHT },
            deviceScaleFactor: 1,
            colorScheme: 'dark'
        });
        const page = await context.newPage();
        const v2AssetOverride = await installV2AssetOverride(page, options.v2AssetRoot);
        page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error?.message ?? error}`));
        page.on('console', (message) => {
            if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(`console: ${message.text()}`);
            else if (message.type() === 'warning') runtimeWarnings.push(`console: ${message.text()}`);
        });
        page.on('response', (response) => {
            if (response.status() >= 400 && response.url().startsWith(options.baseUrl) && !isOptionalCorrectionConfig(response.url())) {
                runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
            }
        });
        page.on('requestfailed', (request) => {
            if (request.url().startsWith(options.baseUrl) && !isOptionalCorrectionConfig(request.url())) {
                runtimeErrors.push(`request failed: ${request.url()} · ${request.failure()?.errorText ?? '?'}`);
            }
        });
        await page.goto(new URL('/debug_tools/grass_debug.html', options.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        try {
            await page.waitForFunction(() => document.body.dataset.grassLabReady === 'true' && !!window.__grassLab, null, { timeout: 60_000 });
        } catch (error) {
            const startup = await page.evaluate(() => ({
                ready: document.body.dataset.grassLabReady ?? null,
                hasApi: !!window.__grassLab,
                title: document.title
            })).catch(() => null);
            throw new Error(`[GrassLabCapture] Lab did not become ready. Startup: ${JSON.stringify(startup)}\n${runtimeErrors.join('\n')}\n${runtimeWarnings.join('\n')}`, { cause: error });
        }
        await page.evaluate(() => window.__grassLab.enterCaptureMode({ width: 3840, height: 2160 }));
        const materialVersionSwitch = await page.evaluate(async (version) => window.__grassLab.setMaterialVersion(version), options.phase === 'before' ? 'v1' : 'v2');
        await page.evaluate(() => window.__grassLab.settleCaptureFrames(60));
        const captures = [];
        const pngByRecipe = new Map();
        for (const recipe of buildCaptureRecipes()) {
            const result = await captureRecipe(page, outputRoot, outputRelative, options.phase, recipe, options.overwrite);
            captures.push(result.entry);
            if (NEUTRAL_PAIR_DEFINITIONS.some((definition) => (
                definition.geometry === recipe.id || definition.texture === recipe.id
            ))) pngByRecipe.set(recipe.id, result.png);
        }
        const materialVersion = summarizeSettledMaterialVersion(materialVersionSwitch, captures);
        const luminanceGate = evaluateLuminancePairs(captures);
        const cardBandGate = evaluateCardBandPairs(captures, pngByRecipe);
        await page.evaluate(() => window.__grassLab.exitCaptureMode());
        const costSamples = await collectCostSamples(page, options.phase);
        if (runtimeErrors.length) {
            throw new Error(`Grass Lab emitted runtime errors:\n${runtimeErrors.join('\n')}`);
        }
        const manifestPath = path.join(outputRoot, 'capture_manifest.json');
        const existing = await readExistingManifest(manifestPath);
        const manifest = mergeCaptureManifest(existing, options.phase, captures, {
            baseUrl: options.baseUrl,
            v2AssetSource: v2AssetOverride
                ? { mode: 'lab_staging_override', root: v2AssetOverride }
                : { mode: 'server_assets', root: null },
            materialVersion,
            luminanceGate,
            cardBandGate,
            costSamples,
            runtimeErrors,
            runtimeWarnings
        });
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        process.stdout.write(`${JSON.stringify({
            phase: options.phase,
            captures: captures.length,
            gates: {
                luminance: luminanceGate.pass,
                cardBand: cardBandGate.pass
            },
            manifest: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/')
        }, null, 2)}\n`);
        if (options.phase === 'after' && (!luminanceGate.pass || !cardBandGate.pass)) {
            const failures = [];
            if (!luminanceGate.pass) failures.push('geometry/texture median-luminance ratio is outside 0.90-1.10');
            if (!cardBandGate.pass) failures.push('live field card-band darkening exceeds 0.10');
            throw new Error(`[GrassLabCapture] Corrected evidence failed: ${failures.join('; ')}. Evidence was saved with failing verdicts.`);
        }
    } finally {
        await browser?.close?.();
        server?.kill?.('SIGTERM');
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
    Promise.resolve()
        .then(() => parseArgs(process.argv.slice(2)))
        .then((options) => {
            if (options.help) process.stdout.write(`${usage()}\n`);
            else return run(options);
        })
        .catch((error) => {
            process.stderr.write(`${error?.stack ?? error}\n`);
            process.exitCode = 1;
        });
}
