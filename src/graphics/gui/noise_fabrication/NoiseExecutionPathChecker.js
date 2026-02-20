// src/graphics/gui/noise_fabrication/NoiseExecutionPathChecker.js
// Heuristic execution-path checker for layered noise fabrication.
// @ts-check

export const NOISE_EXECUTION_PATHS = Object.freeze([
    Object.freeze({ id: 'shader', label: 'Shader' }),
    Object.freeze({ id: 'texture_baked', label: 'Texture (Baked)' }),
    Object.freeze({ id: 'hybrid', label: 'Hybrid' })
]);

export const NOISE_EXECUTION_MODES = Object.freeze([
    Object.freeze({ id: 'auto', label: 'Auto (Checker)' }),
    Object.freeze({ id: 'manual', label: 'Manual Override' })
]);

const EXECUTION_PATH_SET = new Set(NOISE_EXECUTION_PATHS.map((entry) => entry.id));
const EXECUTION_MODE_SET = new Set(NOISE_EXECUTION_MODES.map((entry) => entry.id));

const COST_BY_GENERATOR = Object.freeze({
    value_fbm: 0.36,
    ridged_fbm: 0.45,
    directional_fbm: 0.48,
    line_bands: 0.16,
    tile_grid_subdivision: 0.22,
    cellular_worley: 0.74,
    edge_wear_mask: 0.4,
    micro_grain: 0.58,
    directional_streak_flow: 0.56,
    crackle_fracture: 0.82,
    low_frequency_blotch: 0.34
});

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function normalizeId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getNumber(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n;
}

function getParamNumber(params, id, fallback = 0) {
    const src = params && typeof params === 'object' ? params : null;
    if (!src) return fallback;
    return getNumber(src[id], fallback);
}

export function sanitizeNoiseExecutionPath(value, fallback = 'hybrid') {
    const id = normalizeId(value);
    if (EXECUTION_PATH_SET.has(id)) return id;
    return EXECUTION_PATH_SET.has(fallback) ? fallback : 'hybrid';
}

export function sanitizeNoiseExecutionMode(value, fallback = 'auto') {
    const id = normalizeId(value);
    if (EXECUTION_MODE_SET.has(id)) return id;
    return EXECUTION_MODE_SET.has(fallback) ? fallback : 'auto';
}

export function sanitizeNoiseExecutionConfig(input) {
    const src = input && typeof input === 'object' ? input : {};
    const mode = sanitizeNoiseExecutionMode(src.mode, 'auto');
    const manualPath = sanitizeNoiseExecutionPath(src.manualPath, 'hybrid');
    return {
        mode,
        manualPath,
        dynamicRuntime: src.dynamicRuntime === true,
        largeScaleWorld: src.largeScaleWorld === true
    };
}

export function getNoiseExecutionAssistantDefaultQuestions() {
    return {
        dynamicSceneContext: false,
        largeWorldContext: false,
        preferBakedPerformance: false
    };
}

export function sanitizeNoiseExecutionAssistantQuestions(input) {
    const defaults = getNoiseExecutionAssistantDefaultQuestions();
    const src = input && typeof input === 'object' ? input : defaults;
    return {
        dynamicSceneContext: src.dynamicSceneContext === true,
        largeWorldContext: src.largeWorldContext === true,
        preferBakedPerformance: src.preferBakedPerformance === true
    };
}

function estimateFrequencyRaw(layer) {
    const generatorId = normalizeId(layer?.generatorId);
    const params = layer?.params;
    const transformScale = Math.max(0.05, getNumber(layer?.transform?.scale, 1));

    let base = 1.0;
    switch (generatorId) {
    case 'line_bands': {
        const count = Math.max(1, getParamNumber(params, 'lineCount', 1));
        const width = Math.max(0.01, getParamNumber(params, 'lineWidth', 0.1));
        base = count * (1.0 / width) * 0.05;
        break;
    }
    case 'tile_grid_subdivision': {
        const v = Math.max(0, getParamNumber(params, 'verticalLines', 0));
        const h = Math.max(0, getParamNumber(params, 'horizontalLines', 0));
        const width = Math.max(0.01, getParamNumber(params, 'jointWidth', 0.08));
        base = Math.max(v, h, 1) * (1.0 / width) * 0.035;
        break;
    }
    case 'micro_grain':
        base = Math.max(1, getParamNumber(params, 'scale', 96)) * 1.35;
        break;
    case 'directional_streak_flow':
        base = Math.max(1, getParamNumber(params, 'scale', 14)) * Math.max(0.2, getParamNumber(params, 'stretch', 1.0));
        break;
    case 'low_frequency_blotch':
        base = Math.max(0.1, getParamNumber(params, 'scale', 1.8)) * 0.3;
        break;
    case 'edge_wear_mask':
        base = Math.max(0.5, getParamNumber(params, 'breakupScale', 12)) * 0.55;
        break;
    default:
        base = Math.max(0.5, getParamNumber(params, 'scale', 12));
        break;
    }

    return Math.max(0.001, base * transformScale);
}

function estimateHighFrequencyScore(layer, questions) {
    const raw = estimateFrequencyRaw(layer);
    const normalized = clamp01((Math.log2(raw + 1) - 2.5) / 3.4);
    const qBoost = questions.dynamicSceneContext ? 0.06 : 0;
    return clamp01(normalized + qBoost);
}

function estimateLargeScaleScore(layer, questions, highFrequencyScore) {
    const execution = sanitizeNoiseExecutionConfig(layer?.execution);
    const raw = estimateFrequencyRaw(layer);
    const transformScale = Math.max(0.05, getNumber(layer?.transform?.scale, 1));

    let score = clamp01((2.0 - Math.log2(raw + 1)) / 2.4);
    if (transformScale < 0.75) score += 0.15;
    if (execution.largeScaleWorld) score += 0.58;
    if (questions.largeWorldContext) score += 0.18;
    score -= highFrequencyScore * 0.22;
    return clamp01(score);
}

function estimateStaticCostScore(layer, questions) {
    const execution = sanitizeNoiseExecutionConfig(layer?.execution);
    if (execution.dynamicRuntime) return 0;

    const generatorId = normalizeId(layer?.generatorId);
    const params = layer?.params;
    const octaves = Math.max(1, getParamNumber(params, 'octaves', 1));
    const baseCost = COST_BY_GENERATOR[generatorId] ?? 0.42;
    const octaveCost = clamp01((octaves - 1) / 7) * 0.34;
    const transformComplexity = Math.max(0, Math.abs(getNumber(layer?.transform?.rotationDeg, 0)) / 180) * 0.08;
    const qBias = questions.preferBakedPerformance ? 0.12 : 0;

    return clamp01(baseCost + octaveCost + transformComplexity + qBias);
}

function classifyExecutionPath({ dynamicRuntime, highFrequency, largeScaleWorld, staticExpensive }) {
    if (dynamicRuntime) return 'shader';
    if (staticExpensive && !highFrequency) return 'texture_baked';
    if (staticExpensive && largeScaleWorld) return 'texture_baked';
    if (highFrequency && largeScaleWorld) return 'hybrid';
    if (highFrequency) return 'shader';
    if (largeScaleWorld) return 'texture_baked';
    return 'hybrid';
}

export function analyzeNoiseLayerExecution(layer, {
    propagatedDynamic = false,
    questions = null,
    manualPathOverride = null
} = {}) {
    const execution = sanitizeNoiseExecutionConfig(layer?.execution);
    const q = sanitizeNoiseExecutionAssistantQuestions(questions);
    const highFrequencyScore = estimateHighFrequencyScore(layer, q);
    const largeScaleScore = estimateLargeScaleScore(layer, q, highFrequencyScore);
    const staticCostScore = estimateStaticCostScore(layer, q);

    const flags = {
        dynamicRuntime: execution.dynamicRuntime,
        highFrequency: highFrequencyScore >= 0.62,
        largeScaleWorld: largeScaleScore >= 0.6,
        staticExpensive: staticCostScore >= 0.7,
        propagatedDynamic: propagatedDynamic === true
    };

    const reasons = [];
    let recommendedPath;
    if (flags.dynamicRuntime) {
        recommendedPath = 'shader';
        reasons.push('Layer is marked dynamic at runtime.');
    } else if (flags.propagatedDynamic) {
        recommendedPath = 'shader';
        reasons.push('Dynamic propagation applies from an earlier dynamic layer.');
    } else {
        recommendedPath = classifyExecutionPath(flags);
        if (flags.staticExpensive) reasons.push('Static cost is high for this layer.');
        if (flags.highFrequency) reasons.push('High-frequency detail detected.');
        if (flags.largeScaleWorld) reasons.push('Large-scale/world usage detected.');
    }

    const overridePath = manualPathOverride ? sanitizeNoiseExecutionPath(manualPathOverride, recommendedPath) : null;
    let finalPath = recommendedPath;
    if (execution.mode === 'manual') {
        finalPath = execution.manualPath;
        reasons.push('Manual per-layer override is active.');
    }
    if (overridePath) {
        finalPath = overridePath;
        reasons.push('Decision-assistant layer override applied.');
    }

    return {
        layerId: String(layer?.id ?? ''),
        layerName: String(layer?.name ?? ''),
        execution,
        scores: {
            highFrequency: highFrequencyScore,
            largeScaleWorld: largeScaleScore,
            staticCost: staticCostScore
        },
        flags,
        recommendedPath,
        finalPath,
        reasons
    };
}

export function buildNoiseExecutionPlan(layers, {
    questions = null,
    manualOverridesByLayerId = null
} = {}) {
    const q = sanitizeNoiseExecutionAssistantQuestions(questions);
    const list = Array.isArray(layers) ? layers : [];
    const overrides = manualOverridesByLayerId && typeof manualOverridesByLayerId === 'object' ? manualOverridesByLayerId : null;

    const analyzedLayers = [];
    let propagatedDynamic = false;

    for (const layer of list) {
        const manualOverride = overrides ? overrides[layer.id] : null;
        const analysis = analyzeNoiseLayerExecution(layer, {
            propagatedDynamic,
            questions: q,
            manualPathOverride: manualOverride
        });
        analyzedLayers.push(analysis);

        if (analysis.flags.dynamicRuntime) {
            propagatedDynamic = true;
        }
    }

    const summary = {
        shader: analyzedLayers.filter((entry) => entry.finalPath === 'shader').length,
        textureBaked: analyzedLayers.filter((entry) => entry.finalPath === 'texture_baked').length,
        hybrid: analyzedLayers.filter((entry) => entry.finalPath === 'hybrid').length
    };

    return {
        questions: q,
        layers: analyzedLayers,
        summary
    };
}
