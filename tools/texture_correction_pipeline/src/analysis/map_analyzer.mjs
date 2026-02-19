// Deterministic map-level QA analysis using browser-side image decoding.
import path from 'node:path';

import { getMapExpectedColorSpace } from './reference_profiles.mjs';
import { readImageFileMeta } from './image_file_meta.mjs';
import { toPosixPath } from '../utils.mjs';

function toAbsoluteMapPath(repoRoot, relativePath) {
    return path.resolve(repoRoot, relativePath.split('/').join(path.sep));
}

function toMapUrl(baseUrl, relativePath) {
    const cleaned = String(relativePath ?? '').replace(/^\/+/, '');
    return `${String(baseUrl).replace(/\/+$/, '')}/${cleaned}`;
}

async function analyzeMapsInBrowser(page, mapUrls) {
    return page.evaluate(async (input) => {
        const mapUrls = input?.mapUrls && typeof input.mapUrls === 'object' ? input.mapUrls : {};

        function clamp(v, lo, hi, fallback = lo) {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            if (n < lo) return lo;
            if (n > hi) return hi;
            return n;
        }

        function finiteOr(v, fallback = 0) {
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
        }

        function round4(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.round(n * 10000) / 10000;
        }

        function srgbToLinear(v) {
            const c = clamp(v, 0, 1, 0);
            if (c <= 0.04045) return c / 12.92;
            return ((c + 0.055) / 1.055) ** 2.4;
        }

        function rgbToSat(r, g, b) {
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max <= 1e-9) return 0;
            return (max - min) / max;
        }

        function buildHistogram256() {
            const bins = new Uint32Array(256);
            return {
                bins,
                count: 0,
                add(value01) {
                    const v = clamp(value01, 0, 1, 0);
                    const idx = Math.max(0, Math.min(255, Math.round(v * 255)));
                    bins[idx] += 1;
                    this.count += 1;
                }
            };
        }

        function histogramPercentile(hist, pct) {
            if (!hist || !hist.count) return 0;
            const p = clamp(pct, 0, 100, 50);
            const target = (p / 100) * hist.count;
            let acc = 0;
            for (let i = 0; i < hist.bins.length; i++) {
                acc += hist.bins[i];
                if (acc >= target) return i / 255;
            }
            return 1;
        }

        function histogramMean(hist) {
            if (!hist || !hist.count) return 0;
            let sum = 0;
            for (let i = 0; i < hist.bins.length; i++) {
                sum += (i / 255) * hist.bins[i];
            }
            return sum / hist.count;
        }

        function calcScalarStatsFromValues(values) {
            const arr = Array.isArray(values) ? values : [];
            if (!arr.length) {
                return {
                    p10: 0, p50: 0, p90: 0, mean: 0, std: 0,
                    clippingLowPct: 0,
                    clippingHighPct: 0
                };
            }
            const hist = buildHistogram256();
            let sum = 0;
            let sq = 0;
            let clipLow = 0;
            let clipHigh = 0;
            for (const value of arr) {
                const v = clamp(value, 0, 1, 0);
                hist.add(v);
                sum += v;
                sq += v * v;
                if (v <= 0.02) clipLow += 1;
                if (v >= 0.98) clipHigh += 1;
            }
            const n = arr.length;
            const mean = sum / n;
            const variance = Math.max(0, (sq / n) - (mean * mean));
            return {
                p10: round4(histogramPercentile(hist, 10)),
                p50: round4(histogramPercentile(hist, 50)),
                p90: round4(histogramPercentile(hist, 90)),
                mean: round4(mean),
                std: round4(Math.sqrt(variance)),
                clippingLowPct: round4(clipLow / n),
                clippingHighPct: round4(clipHigh / n)
            };
        }

        function gradientAndLaplacianStats(values, width, height) {
            if (!(Array.isArray(values) && values.length === width * height && width >= 3 && height >= 3)) {
                return {
                    gradientEnergy: 0,
                    laplacianVariance: 0,
                    localContrast: 0
                };
            }
            let gradSum = 0;
            let lapSum = 0;
            let lapSq = 0;
            let localContrastSum = 0;
            let count = 0;
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    const center = values[idx];
                    const gx = values[idx + 1] - values[idx - 1];
                    const gy = values[idx + width] - values[idx - width];
                    const grad = Math.sqrt((gx * gx) + (gy * gy));
                    gradSum += grad;

                    const lap = (
                        values[idx - width]
                        + values[idx + width]
                        + values[idx - 1]
                        + values[idx + 1]
                        - (4 * center)
                    );
                    lapSum += lap;
                    lapSq += lap * lap;

                    const localMean = (
                        values[idx - width] + values[idx + width] + values[idx - 1] + values[idx + 1]
                    ) * 0.25;
                    localContrastSum += Math.abs(center - localMean);
                    count += 1;
                }
            }
            if (!count) {
                return {
                    gradientEnergy: 0,
                    laplacianVariance: 0,
                    localContrast: 0
                };
            }
            const lapMean = lapSum / count;
            const lapVar = Math.max(0, (lapSq / count) - (lapMean * lapMean));
            return {
                gradientEnergy: round4(gradSum / count),
                laplacianVariance: round4(lapVar),
                localContrast: round4(localContrastSum / count)
            };
        }

        function sampleCorrelation(a, b, step) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
            const stride = Math.max(1, Math.floor(step || 1));
            let count = 0;
            let sumA = 0;
            let sumB = 0;
            for (let i = 0; i < a.length; i += stride) {
                const av = finiteOr(a[i], 0);
                const bv = finiteOr(b[i], 0);
                sumA += av;
                sumB += bv;
                count += 1;
            }
            if (!count) return 0;
            const meanA = sumA / count;
            const meanB = sumB / count;
            let num = 0;
            let denA = 0;
            let denB = 0;
            for (let i = 0; i < a.length; i += stride) {
                const da = finiteOr(a[i], 0) - meanA;
                const db = finiteOr(b[i], 0) - meanB;
                num += da * db;
                denA += da * da;
                denB += db * db;
            }
            const den = Math.sqrt(denA * denB);
            if (den <= 1e-12) return 0;
            return num / den;
        }

        function periodicCorrelation(values, width, height) {
            if (!(Array.isArray(values) && values.length === width * height && width > 4 && height > 4)) return 0;
            const shiftsX = [Math.floor(width / 4), Math.floor(width / 2), Math.floor((width * 3) / 4)].filter((v) => v > 1 && v < width - 1);
            const shiftsY = [Math.floor(height / 4), Math.floor(height / 2), Math.floor((height * 3) / 4)].filter((v) => v > 1 && v < height - 1);
            let maxAbsCorr = 0;

            const calcForShift = (sx, sy) => {
                let sumA = 0;
                let sumB = 0;
                let count = 0;
                for (let y = 0; y < height - sy; y++) {
                    const rowA = y * width;
                    const rowB = (y + sy) * width;
                    for (let x = 0; x < width - sx; x++) {
                        const a = values[rowA + x];
                        const b = values[rowB + x + sx];
                        sumA += a;
                        sumB += b;
                        count += 1;
                    }
                }
                if (!count) return 0;
                const meanA = sumA / count;
                const meanB = sumB / count;
                let num = 0;
                let denA = 0;
                let denB = 0;
                for (let y = 0; y < height - sy; y++) {
                    const rowA = y * width;
                    const rowB = (y + sy) * width;
                    for (let x = 0; x < width - sx; x++) {
                        const da = values[rowA + x] - meanA;
                        const db = values[rowB + x + sx] - meanB;
                        num += da * db;
                        denA += da * da;
                        denB += db * db;
                    }
                }
                const den = Math.sqrt(denA * denB);
                if (den <= 1e-12) return 0;
                return num / den;
            };

            for (const sx of shiftsX) {
                const corr = calcForShift(sx, 0);
                maxAbsCorr = Math.max(maxAbsCorr, Math.abs(corr));
            }
            for (const sy of shiftsY) {
                const corr = calcForShift(0, sy);
                maxAbsCorr = Math.max(maxAbsCorr, Math.abs(corr));
            }
            for (const sx of shiftsX) {
                for (const sy of shiftsY) {
                    const corr = calcForShift(sx, sy);
                    maxAbsCorr = Math.max(maxAbsCorr, Math.abs(corr));
                }
            }
            return round4(maxAbsCorr);
        }

        async function loadImagePixels(url) {
            const safe = typeof url === 'string' && url ? url : null;
            if (!safe) return null;
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.decoding = 'sync';
                image.crossOrigin = 'anonymous';
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error(`failed:${safe}`));
                image.src = safe;
            });
            const width = Math.max(1, Math.floor(Number(img.naturalWidth || img.width) || 1));
            const height = Math.max(1, Math.floor(Number(img.naturalHeight || img.height) || 1));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error('canvas_context_unavailable');
            ctx.drawImage(img, 0, 0, width, height);
            const data = ctx.getImageData(0, 0, width, height).data;
            return { width, height, data };
        }

        function extractChannelValues(map, channel) {
            if (!map?.data) return [];
            const idx = channel === 'g' ? 1 : (channel === 'b' ? 2 : 0);
            const values = [];
            for (let i = 0; i < map.data.length; i += 4) values.push(map.data[i + idx] / 255);
            return values;
        }

        function albedoMetrics(baseMap) {
            if (!baseMap?.data) {
                return {
                    available: false
                };
            }
            const luminance = [];
            const saturation = [];
            const width = baseMap.width;
            const height = baseMap.height;
            for (let i = 0; i < baseMap.data.length; i += 4) {
                const r = baseMap.data[i] / 255;
                const g = baseMap.data[i + 1] / 255;
                const b = baseMap.data[i + 2] / 255;
                const rl = srgbToLinear(r);
                const gl = srgbToLinear(g);
                const bl = srgbToLinear(b);
                const y = (0.2126 * rl) + (0.7152 * gl) + (0.0722 * bl);
                luminance.push(y);
                saturation.push(rgbToSat(r, g, b));
            }
            const lumStats = calcScalarStatsFromValues(luminance);
            const satHist = buildHistogram256();
            for (const v of saturation) satHist.add(v);
            const detail = gradientAndLaplacianStats(luminance, width, height);
            return {
                available: true,
                luminanceP1: round4(histogramPercentile((() => {
                    const h = buildHistogram256();
                    for (const v of luminance) h.add(v);
                    return h;
                })(), 1)),
                luminanceP50: round4(lumStats.p50),
                luminanceP99: round4(histogramPercentile((() => {
                    const h = buildHistogram256();
                    for (const v of luminance) h.add(v);
                    return h;
                })(), 99)),
                luminanceMean: round4(lumStats.mean),
                saturationP1: round4(histogramPercentile(satHist, 1)),
                saturationP50: round4(histogramPercentile(satHist, 50)),
                saturationP99: round4(histogramPercentile(satHist, 99)),
                saturationMean: round4(histogramMean(satHist)),
                clippingBlackPct: round4(lumStats.clippingLowPct),
                clippingWhitePct: round4(lumStats.clippingHighPct),
                gradientEnergy: detail.gradientEnergy,
                laplacianVariance: detail.laplacianVariance,
                localContrast: detail.localContrast,
                _luminanceValues: luminance,
                _width: width,
                _height: height
            };
        }

        function roughnessMetrics(roughMap, ormMap) {
            let values = [];
            let source = null;
            let width = 0;
            let height = 0;
            if (roughMap?.data) {
                values = extractChannelValues(roughMap, 'r');
                source = 'roughness.r';
                width = roughMap.width;
                height = roughMap.height;
            } else if (ormMap?.data) {
                values = extractChannelValues(ormMap, 'g');
                source = 'orm.g';
                width = ormMap.width;
                height = ormMap.height;
            }
            if (!values.length) return { available: false };
            const stats = calcScalarStatsFromValues(values);
            const detail = gradientAndLaplacianStats(values, width, height);
            const rangeWidth = Math.max(0, stats.p90 - stats.p10);
            return {
                available: true,
                source,
                p10: round4(stats.p10),
                p50: round4(stats.p50),
                p90: round4(stats.p90),
                mean: round4(stats.mean),
                std: round4(stats.std),
                usableRangeWidth: round4(rangeWidth),
                nearConstant: rangeWidth < 0.08,
                clippingLowPct: round4(stats.clippingLowPct),
                clippingHighPct: round4(stats.clippingHighPct),
                gradientEnergy: detail.gradientEnergy,
                laplacianVariance: detail.laplacianVariance,
                localContrast: detail.localContrast,
                _values: values,
                _width: width,
                _height: height
            };
        }

        function normalMetrics(normalMap) {
            if (!normalMap?.data) return { available: false };
            const zValues = [];
            const xySlope = [];
            let lengthErrorSum = 0;
            let ySignSum = 0;
            let n = 0;
            for (let i = 0; i < normalMap.data.length; i += 4) {
                const nx = (normalMap.data[i] / 255) * 2 - 1;
                const ny = (normalMap.data[i + 1] / 255) * 2 - 1;
                const nz = (normalMap.data[i + 2] / 255) * 2 - 1;
                const len = Math.sqrt((nx * nx) + (ny * ny) + (nz * nz));
                lengthErrorSum += Math.abs(len - 1);
                zValues.push(clamp((nz + 1) * 0.5, 0, 1, 0));
                xySlope.push(Math.sqrt((nx * nx) + (ny * ny)));
                ySignSum += ny;
                n += 1;
            }
            const zStats = calcScalarStatsFromValues(zValues);
            const slopeStats = calcScalarStatsFromValues(xySlope);
            const orientation = (ySignSum / Math.max(1, n)) >= 0 ? 'gl_like_or_neutral' : 'dx_like_or_inverted';
            return {
                available: true,
                lengthErrorMean: round4(lengthErrorSum / Math.max(1, n)),
                zP10: round4(zStats.p10),
                zP50: round4(zStats.p50),
                zP90: round4(zStats.p90),
                slopeMean: round4(slopeStats.mean),
                slopeStd: round4(slopeStats.std),
                orientationHeuristic: orientation,
                _values: zValues,
                _width: normalMap.width,
                _height: normalMap.height
            };
        }

        function scalarMapStats(map, channel) {
            if (!map?.data) return { available: false };
            const values = extractChannelValues(map, channel);
            const stats = calcScalarStatsFromValues(values);
            const edge = gradientAndLaplacianStats(values, map.width, map.height);
            const binaryMass = round4(stats.clippingLowPct + stats.clippingHighPct);
            return {
                available: true,
                mean: round4(stats.mean),
                std: round4(stats.std),
                clippingLowPct: round4(stats.clippingLowPct),
                clippingHighPct: round4(stats.clippingHighPct),
                binaryMass,
                looksBinary: binaryMass >= 0.92,
                gradientEnergy: edge.gradientEnergy,
                laplacianVariance: edge.laplacianVariance,
                _values: values,
                _width: map.width,
                _height: map.height
            };
        }

        function imageInfo(map) {
            if (!map?.width || !map?.height) return null;
            const width = Math.max(1, map.width);
            const height = Math.max(1, map.height);
            return {
                width,
                height,
                aspect: round4(width / Math.max(1, height))
            };
        }

        const loadResult = {};
        for (const [key, url] of Object.entries(mapUrls)) {
            try {
                const map = await loadImagePixels(url);
                loadResult[key] = map;
            } catch {
                loadResult[key] = null;
            }
        }

        const albedo = albedoMetrics(loadResult.baseColor ?? null);
        const roughness = roughnessMetrics(loadResult.roughness ?? null, loadResult.orm ?? null);
        const normal = normalMetrics(loadResult.normal ?? null);
        const ao = scalarMapStats(loadResult.ao ?? loadResult.orm ?? null, loadResult.ao ? 'r' : 'r');
        const metalness = scalarMapStats(loadResult.metalness ?? loadResult.orm ?? null, loadResult.metalness ? 'r' : 'b');

        const baseValues = Array.isArray(albedo._luminanceValues) ? albedo._luminanceValues : [];
        const roughValues = Array.isArray(roughness._values) ? roughness._values : [];
        const normalValues = Array.isArray(normal._values) ? normal._values : [];
        const baseWidth = finiteOr(albedo._width, 0);
        const baseHeight = finiteOr(albedo._height, 0);
        const roughWidth = finiteOr(roughness._width, 0);
        const roughHeight = finiteOr(roughness._height, 0);

        const crossMap = {
            albedoNormalGradientCorrelation: round4(sampleCorrelation(baseValues, normalValues, 4)),
            albedoRoughnessGradientCorrelation: round4(sampleCorrelation(baseValues, roughValues, 4)),
            roughnessNormalGradientCorrelation: round4(sampleCorrelation(roughValues, normalValues, 4))
        };

        const tilingRisk = {
            baseColorPeakCorrelation: baseValues.length ? periodicCorrelation(baseValues, baseWidth, baseHeight) : 0,
            roughnessPeakCorrelation: roughValues.length ? periodicCorrelation(roughValues, roughWidth, roughHeight) : 0
        };

        const maps = {};
        for (const [key, map] of Object.entries(loadResult)) {
            maps[key] = {
                loaded: !!map,
                info: imageInfo(map)
            };
        }

        return {
            maps,
            albedo: {
                available: !!albedo.available,
                luminanceP1: round4(albedo.luminanceP1),
                luminanceP50: round4(albedo.luminanceP50),
                luminanceP99: round4(albedo.luminanceP99),
                luminanceMean: round4(albedo.luminanceMean),
                saturationP1: round4(albedo.saturationP1),
                saturationP50: round4(albedo.saturationP50),
                saturationP99: round4(albedo.saturationP99),
                saturationMean: round4(albedo.saturationMean),
                clippingBlackPct: round4(albedo.clippingBlackPct),
                clippingWhitePct: round4(albedo.clippingWhitePct),
                gradientEnergy: round4(albedo.gradientEnergy),
                laplacianVariance: round4(albedo.laplacianVariance),
                localContrast: round4(albedo.localContrast)
            },
            roughness: {
                available: !!roughness.available,
                source: roughness.source ?? null,
                p10: round4(roughness.p10),
                p50: round4(roughness.p50),
                p90: round4(roughness.p90),
                mean: round4(roughness.mean),
                std: round4(roughness.std),
                usableRangeWidth: round4(roughness.usableRangeWidth),
                nearConstant: !!roughness.nearConstant,
                clippingLowPct: round4(roughness.clippingLowPct),
                clippingHighPct: round4(roughness.clippingHighPct)
            },
            normal: {
                available: !!normal.available,
                lengthErrorMean: round4(normal.lengthErrorMean),
                zP10: round4(normal.zP10),
                zP50: round4(normal.zP50),
                zP90: round4(normal.zP90),
                slopeMean: round4(normal.slopeMean),
                slopeStd: round4(normal.slopeStd),
                orientationHeuristic: normal.orientationHeuristic ?? null
            },
            ao: {
                available: !!ao.available,
                mean: round4(ao.mean),
                std: round4(ao.std),
                clippingLowPct: round4(ao.clippingLowPct),
                clippingHighPct: round4(ao.clippingHighPct),
                binaryMass: round4(ao.binaryMass),
                looksBinary: !!ao.looksBinary
            },
            metalness: {
                available: !!metalness.available,
                mean: round4(metalness.mean),
                std: round4(metalness.std),
                clippingLowPct: round4(metalness.clippingLowPct),
                clippingHighPct: round4(metalness.clippingHighPct),
                binaryMass: round4(metalness.binaryMass),
                looksBinary: !!metalness.looksBinary
            },
            crossMap,
            tilingRisk
        };
    }, { mapUrls });
}

export async function analyzeMaterialMaps({
    repoRoot,
    baseUrl,
    probePage,
    material
}) {
    const mapUrls = {};
    const fileSanity = {};

    const resolvedMapFiles = material?.resolvedMapFiles && typeof material.resolvedMapFiles === 'object'
        ? material.resolvedMapFiles
        : {};

    const entries = Object.entries(resolvedMapFiles).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, relPath] of entries) {
        const rel = toPosixPath(String(relPath ?? '').trim());
        if (!rel) continue;
        const abs = toAbsoluteMapPath(repoRoot, rel);
        const meta = await readImageFileMeta(abs);
        const expectedColorSpace = getMapExpectedColorSpace(key);
        const aspect = (Number.isFinite(meta.width) && Number.isFinite(meta.height) && meta.height > 0)
            ? Number(meta.width / meta.height)
            : null;
        fileSanity[key] = Object.freeze({
            path: rel,
            exists: !!meta.exists,
            format: meta.format,
            width: meta.width,
            height: meta.height,
            aspect: Number.isFinite(aspect) ? Number(aspect.toFixed(4)) : null,
            bitDepth: meta.bitDepth,
            fileSize: meta.fileSize,
            expectedColorSpace
        });
        if (meta.exists) mapUrls[key] = toMapUrl(baseUrl, rel);
    }

    const browserMetrics = await analyzeMapsInBrowser(probePage, mapUrls);

    return Object.freeze({
        fileSanity,
        metrics: browserMetrics
    });
}

