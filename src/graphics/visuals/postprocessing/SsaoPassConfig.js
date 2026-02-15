// src/graphics/visuals/postprocessing/SsaoPassConfig.js
// Pure SSAO runtime parameter resolver for three post-processing tuning.
// @ts-check

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

const SSAO_QUALITY_PRESETS = Object.freeze({
    low: Object.freeze({
        // Radius slider units are broad for gameplay; map into a local AO radius range.
        kernelScaleRange: { min: 0.08, max: 0.18 },
        // Distances are in world meters and normalized by camera depth range at runtime.
        minDistanceMetersRange: { min: 0.020, max: 0.010 },
        maxDistanceMetersRange: { min: 0.50, max: 0.90 }
    }),
    medium: Object.freeze({
        kernelScaleRange: { min: 0.10, max: 0.24 },
        minDistanceMetersRange: { min: 0.018, max: 0.008 },
        maxDistanceMetersRange: { min: 0.65, max: 1.20 }
    }),
    high: Object.freeze({
        kernelScaleRange: { min: 0.12, max: 0.30 },
        minDistanceMetersRange: { min: 0.015, max: 0.006 },
        maxDistanceMetersRange: { min: 0.80, max: 1.60 }
    })
});

function resolveSsaoPreset(quality) {
    const q = typeof quality === 'string' ? quality.toLowerCase() : 'medium';
    return SSAO_QUALITY_PRESETS[q] ?? SSAO_QUALITY_PRESETS.medium;
}

function resolveIntensityCurve(intensity, dynamicScale) {
    const requested = clamp(intensity, 0, 2, 0.35);
    const scale = clamp(dynamicScale, 0.25, 1, 1);
    const effective = clamp(requested * scale, 0, 2, 0.35);
    const normalized = clamp(effective / 2, 0, 1, 0.0);
    const enabled = effective > 0;
    // Emphasize low-to-mid control travel so intensity changes are visible at runtime.
    const ramp = clamp(Math.pow(normalized, 0.65), 0, 1, 0);

    return {
        requested,
        effective,
        normalized,
        enabled,
        ramp
    };
}

function resolveScaledValue(range, ramp) {
    return range.min + (range.max - range.min) * ramp;
}

function resolveDepthNormalization(cameraNear, cameraFar) {
    const near = clamp(cameraNear, 0.0001, 1000, 0.1);
    const far = clamp(cameraFar, near + 0.0001, 100000, 500);
    const depthSpan = Math.max(0.0001, far - near);
    return {
        near,
        far,
        depthSpan,
        unitPerMeter: 1 / depthSpan
    };
}

export function resolveSsaoPassParams({
    quality = 'medium',
    radius = 8,
    intensity = 0.35,
    dynamicScale = 1,
    cameraNear = 0.1,
    cameraFar = 500
} = {}) {
    const q = typeof quality === 'string' ? quality.toLowerCase() : 'medium';
    const preset = resolveSsaoPreset(q);
    const intensityState = resolveIntensityCurve(intensity, dynamicScale);
    const radiusInput = clamp(radius, 0.1, 64, 8);
    const depth = resolveDepthNormalization(cameraNear, cameraFar);

    if (!intensityState.enabled) {
        return {
            quality: q,
            enabled: false,
            requestedIntensity: intensityState.requested,
            effectiveIntensity: intensityState.effective,
            intensityScale: 0,
            kernelRadius: 0,
            minDistance: resolveScaledValue(preset.minDistanceMetersRange, 0) * depth.unitPerMeter,
            maxDistance: 0,
            depthSpan: depth.depthSpan
        };
    }

    const kernelScale = resolveScaledValue(preset.kernelScaleRange, intensityState.ramp);
    const minDistanceMeters = resolveScaledValue(preset.minDistanceMetersRange, intensityState.ramp);
    const maxDistanceMeters = resolveScaledValue(preset.maxDistanceMetersRange, intensityState.ramp);
    const minDistance = minDistanceMeters * depth.unitPerMeter;
    const maxDistance = maxDistanceMeters * depth.unitPerMeter;
    const safeMax = Math.max(minDistance * 1.25, maxDistance);

    return {
        quality: q,
        enabled: true,
        requestedIntensity: intensityState.requested,
        effectiveIntensity: intensityState.effective,
        intensityScale: intensityState.ramp,
        kernelRadius: radiusInput * kernelScale,
        minDistance,
        maxDistance: safeMax,
        depthSpan: depth.depthSpan
    };
}
