// Coordinates map analysis, capture harness analysis, QA scoring, and correction recommendations.
import { analyzeMaterialMaps } from './map_analyzer.mjs';
import { runMaterialCaptureHarness } from './capture_harness.mjs';
import {
    computeOverallQaSummary,
    computeRenderAnomalySummary,
    deriveRecommendedPluginOptions
} from './qa_scoring.mjs';
import { clamp, deepMerge, isPlainObject, sortObjectKeysDeep } from '../utils.mjs';

function createEmptyRenderSummary() {
    return Object.freeze({
        captureCount: 0,
        outlierCaptureCount: 0,
        anomalyScore: 0,
        qaScore: 100,
        requiresReview: false,
        heuristicWarning: false,
        meanMetrics: Object.freeze({}),
        captures: []
    });
}

function buildDiscrepancyFlags({ mapMetrics, renderSummary, qaSummary }) {
    const flags = [];
    const map = mapMetrics && typeof mapMetrics === 'object' ? mapMetrics : {};
    const albedo = map.albedo ?? {};
    const roughness = map.roughness ?? {};
    const normal = map.normal ?? {};
    const tiling = map.tilingRisk ?? {};
    const render = renderSummary && typeof renderSummary === 'object' ? renderSummary : {};
    const overall = qaSummary && typeof qaSummary === 'object' ? qaSummary : {};

    if (Number(albedo.clippingWhitePct) > 0.02) flags.push('albedo_white_clipping');
    if (Number(albedo.clippingBlackPct) > 0.02) flags.push('albedo_black_clipping');
    if (roughness.nearConstant === true) flags.push('roughness_near_constant');
    if (Number(normal.lengthErrorMean) > 0.14) flags.push('normal_length_error_high');
    if (Number(tiling.baseColorPeakCorrelation) > 0.55) flags.push('tiling_risk_basecolor_high');
    if (Number(tiling.roughnessPeakCorrelation) > 0.55) flags.push('tiling_risk_roughness_high');
    if (render.requiresReview) flags.push('multi_condition_render_outlier');
    else if (render.heuristicWarning) flags.push('single_condition_render_warning');
    if (overall.requiresReview) flags.push('overall_material_review_recommended');
    return flags;
}

function adjustmentsToSceneOverrides(adjustments, mapMetrics) {
    const src = isPlainObject(adjustments) ? adjustments : {};
    const roughnessAdjust = isPlainObject(src.roughness) ? src.roughness : {};
    const albedoAdjust = isPlainObject(src.albedo) ? src.albedo : {};
    const normalAdjust = isPlainObject(src.normal) ? src.normal : {};
    const mapRoughnessP50 = Number(mapMetrics?.roughness?.p50);

    let mappedRoughness = 1.0;
    if (Number.isFinite(roughnessAdjust.min) && Number.isFinite(roughnessAdjust.max)) {
        const invertInput = roughnessAdjust.invertInput === true;
        const input = invertInput
            ? (1 - clamp(mapRoughnessP50, 0, 1, 0.5))
            : clamp(mapRoughnessP50, 0, 1, 0.5);
        const gamma = clamp(roughnessAdjust.gamma, 0.1, 4.0, 1.0);
        const shaped = Math.pow(input, gamma);
        mappedRoughness = roughnessAdjust.min + (shaped * (roughnessAdjust.max - roughnessAdjust.min));
    }

    return Object.freeze({
        roughness: clamp(mappedRoughness, 0, 1, 1.0),
        normalStrength: clamp(normalAdjust.strength, 0, 8, 1.0),
        albedoBrightness: clamp(albedoAdjust.brightness, 0, 4, 1.0),
        albedoSaturation: clamp((Number(albedoAdjust.saturation) || 1) - 1, -1, 1, 0),
        albedoHueDegrees: clamp(albedoAdjust.hueDegrees, -180, 180, 0),
        albedoTintStrength: clamp(albedoAdjust.tintStrength, 0, 1, 0),
        aoIntensity: 1.0,
        metalness: 0.0
    });
}

function buildRecommendedFromMapOnly({ classId, presetId, mapMetrics, basePluginOptions }) {
    return deriveRecommendedPluginOptions({
        classId,
        presetId,
        mapMetrics,
        renderSummary: createEmptyRenderSummary(),
        basePluginOptions
    });
}

function mergeRecommendedOptions(basePluginOptions, recommendedPluginOptions) {
    const base = isPlainObject(basePluginOptions) ? basePluginOptions : {};
    const rec = isPlainObject(recommendedPluginOptions) ? recommendedPluginOptions : {};
    return deepMerge(base, rec);
}

function stringified(value) {
    return JSON.stringify(sortObjectKeysDeep(value ?? {}));
}

export async function runMaterialAnalysis({
    repoRoot,
    runtime,
    material,
    presetId,
    analysisMode,
    basePluginOptions,
    initialAdjustments,
    captureOutputRoot
}) {
    const mode = String(analysisMode ?? 'none').trim() || 'none';
    if (mode === 'none' || !runtime?.probePage) {
        return Object.freeze({
            mode: 'none',
            fileSanity: {},
            mapMetrics: {},
            renderSummary: createEmptyRenderSummary(),
            qaSummary: computeOverallQaSummary({
                classId: material.classId,
                presetId,
                mapMetrics: {},
                renderSummary: createEmptyRenderSummary()
            }),
            recommendedPluginOptions: {},
            recommendationNotes: [],
            discrepancyFlags: [],
            captures: []
        });
    }

    const mapResult = await analyzeMaterialMaps({
        repoRoot,
        baseUrl: runtime.baseUrl,
        probePage: runtime.probePage,
        material
    });
    const mapMetrics = mapResult.metrics ?? {};

    const preliminary = buildRecommendedFromMapOnly({
        classId: material.classId,
        presetId,
        mapMetrics,
        basePluginOptions
    });

    let renderSummary = createEmptyRenderSummary();
    let captureEntries = [];
    if (mode === 'full' && runtime?.harnessPage) {
        const sceneOverrides = adjustmentsToSceneOverrides(initialAdjustments, mapMetrics);
        const capture = await runMaterialCaptureHarness({
            repoRoot,
            harnessPage: runtime.harnessPage,
            materialId: material.materialId,
            correctedOverrides: sceneOverrides,
            outputRootRel: captureOutputRoot
        });
        captureEntries = Array.isArray(capture.captures) ? capture.captures : [];
        const correctedCaptures = captureEntries.filter((entry) => entry.mode === 'corrected');
        renderSummary = computeRenderAnomalySummary({
            captures: correctedCaptures,
            presetId,
            classId: material.classId
        });
    }

    const finalRecommendation = deriveRecommendedPluginOptions({
        classId: material.classId,
        presetId,
        mapMetrics,
        renderSummary,
        basePluginOptions
    });

    const preliminaryMerged = mergeRecommendedOptions(basePluginOptions, preliminary.recommendedPluginOptions);
    const finalMerged = mergeRecommendedOptions(basePluginOptions, finalRecommendation.recommendedPluginOptions);
    const recommendationChangedByRender = stringified(preliminaryMerged) !== stringified(finalMerged);

    const qaSummary = computeOverallQaSummary({
        classId: material.classId,
        presetId,
        mapMetrics,
        renderSummary
    });

    const discrepancyFlags = buildDiscrepancyFlags({
        mapMetrics,
        renderSummary,
        qaSummary
    });

    return Object.freeze({
        mode,
        fileSanity: mapResult.fileSanity ?? {},
        mapMetrics,
        renderSummary,
        qaSummary,
        recommendedPluginOptions: finalRecommendation.recommendedPluginOptions ?? {},
        recommendationNotes: [
            ...(preliminary.notes ?? []),
            ...(finalRecommendation.notes ?? []),
            ...(recommendationChangedByRender ? ['render captures adjusted final recommendation.'] : [])
        ],
        discrepancyFlags,
        captures: captureEntries
    });
}
