// Deterministic quality, review, budget, and approval contract for the offline Grass Lab.
// @ts-check

export const GRASS_LAB_VALIDATION_CONTRACT_VERSION = 2;

const freezeDeep = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
};

const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const average = (values) => {
    const numbers = values
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => Number(value))
        .filter(Number.isFinite);
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

const maximum = (values) => {
    const numbers = values
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => Number(value))
        .filter(Number.isFinite);
    return numbers.length ? Math.max(...numbers) : null;
};

const round = (value, digits = 3) => {
    if (!Number.isFinite(Number(value))) return null;
    const scale = 10 ** digits;
    return Math.round(Number(value) * scale) / scale;
};

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteValue = (value) => value !== null
    && value !== undefined
    && value !== ''
    && Number.isFinite(Number(value));

const equalsNumber = (value, expected, epsilon = 1e-9) => (
    isFiniteValue(value) && Math.abs(Number(value) - expected) <= epsilon
);

const inNumberRange = (value, min, max) => (
    isFiniteValue(value) && Number(value) >= min && Number(value) <= max
);

const nonNegativeInteger = (value) => Number.isInteger(Number(value)) && Number(value) >= 0;

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const stringSet = (values) => new Set(
    (values instanceof Set ? [...values] : (Array.isArray(values) ? values : [])).map(String)
);

const missingIds = (requiredIds, reviewedIds) => {
    const reviewed = stringSet(reviewedIds);
    return requiredIds.filter((id) => !reviewed.has(id));
};

const hasExactStringSet = (values, expectedValues) => {
    const actual = stringSet(values);
    const expected = stringSet(expectedValues);
    return actual.size === expected.size && [...expected].every((value) => actual.has(value));
};

const hasExactKeys = (value, expectedKeys) => (
    isRecord(value) && hasExactStringSet(Object.keys(value), expectedKeys)
);

const isWeightVector = (value) => {
    const keys = ['near', 'billboard', 'middle', 'texture'];
    if (!hasExactKeys(value, keys)) return false;
    const weights = keys.map((key) => Number(value[key]));
    return weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1)
        && Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) <= 1e-6;
};

const cloneJson = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));

export const GRASS_LAB_QUALITY_PRESETS = freezeDeep({
    low: {
        id: 'low',
        label: 'Low · texture + boundary',
        nearRadiusMeters: 3,
        billboardRadiusMeters: 8,
        middleRadiusMeters: 25,
        clusterRadiusMeters: 25,
        farCutoffMeters: 25,
        densityMultiplier: 0.55,
        nearBladesPerSquareMeter: 24,
        billboardCardsPerUnit: 0,
        middleCardsPerUnit: 0,
        clusterCardsPerPatch: 0,
        localizedAccents: false,
        clustersPerTree: 0,
        nearGeometry: false,
        billboardGeometry: false,
        middleGeometry: false,
        clusterGeometry: false,
        description: 'Maintains the hard raised coverage surface and sidewalk cuts while falling back to texture.'
    },
    default: {
        id: 'default',
        label: 'Default · approved target',
        nearRadiusMeters: 3,
        billboardRadiusMeters: 8,
        middleRadiusMeters: 25,
        clusterRadiusMeters: 25,
        farCutoffMeters: 25,
        densityMultiplier: 1,
        nearBladesPerSquareMeter: 64,
        billboardCardsPerUnit: 1,
        middleCardsPerUnit: 2,
        clusterCardsPerPatch: 2,
        localizedAccents: true,
        clustersPerTree: 4,
        nearGeometry: true,
        billboardGeometry: true,
        middleGeometry: true,
        clusterGeometry: true,
        description: 'Automatic close carpet, dense billboard coverage, cohesive middle patches, localized accents, then texture-only turf.'
    },
    high: {
        id: 'high',
        label: 'High · review / stress',
        nearRadiusMeters: 4.5,
        billboardRadiusMeters: 12,
        middleRadiusMeters: 36,
        clusterRadiusMeters: 36,
        farCutoffMeters: 36,
        densityMultiplier: 1.25,
        nearBladesPerSquareMeter: 64,
        billboardCardsPerUnit: 1,
        middleCardsPerUnit: 2,
        clusterCardsPerPatch: 2,
        localizedAccents: true,
        clustersPerTree: 6,
        nearGeometry: true,
        billboardGeometry: true,
        middleGeometry: true,
        clusterGeometry: true,
        description: 'Expanded ranges and density for quality review and structural stress measurements.'
    }
});

export const GRASS_LAB_CAMERA_PRESETS = freezeDeep([
    { id: 'height_030', label: '0.30 m close-up', heightMeters: 0.3, distanceMeters: 2.2, lateralMeters: 0.35, targetHeightMeters: 0.04, pose: 'grazing', fixture: 'grazing' },
    { id: 'height_050', label: '0.50 m inspection', heightMeters: 0.5, distanceMeters: 3.4, lateralMeters: -0.3, targetHeightMeters: 0.04, pose: 'grazing', fixture: 'grazing' },
    { id: 'height_100', label: '1.00 m inspection', heightMeters: 1, distanceMeters: 5.2, lateralMeters: 0.8, targetHeightMeters: 0.04, pose: 'medium', fixture: 'grazing' },
    { id: 'near_grazing', label: 'Near carpet grazing profile', heightMeters: 0.18, distanceMeters: 2.8, lateralMeters: -1.2, targetHeightMeters: 0.04, pose: 'grazing_side', fixture: 'grazing' },
    { id: 'near_forward', label: 'Near carpet forward profile', heightMeters: 0.62, distanceMeters: 4.2, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'forward', fixture: 'grazing' },
    { id: 'near_oblique', label: 'Near carpet oblique profile', heightMeters: 0.72, distanceMeters: 3.6, lateralMeters: 2.8, targetHeightMeters: 0.04, pose: 'oblique', fixture: 'grazing' },
    { id: 'height_150', label: '1.50 m inspection', heightMeters: 1.5, distanceMeters: 7.5, lateralMeters: -0.6, targetHeightMeters: 0.05, pose: 'medium', fixture: 'grazing' },
    { id: 'height_200', label: '2.00 m inspection', heightMeters: 2, distanceMeters: 9, lateralMeters: 1.2, targetHeightMeters: 0.06, pose: 'medium', fixture: 'grazing' },
    { id: 'height_300', label: '3.00 m inspection', heightMeters: 3, distanceMeters: 13, lateralMeters: -1.2, targetHeightMeters: 0.08, pose: 'medium', fixture: 'grazing' },
    { id: 'height_500', label: '5.00 m inspection', heightMeters: 5, distanceMeters: 20, lateralMeters: 2, targetHeightMeters: 0.1, pose: 'far', fixture: 'grazing' },
    { id: 'gameplay_bus', label: 'Gameplay bus camera', heightMeters: 4.5, distanceMeters: 12, lateralMeters: 0, targetHeightMeters: 1.6, pose: 'gameplay', fixture: 'bus' },
    { id: 'close_billboard_handoff', label: 'Close → billboard handoff', heightMeters: 0.58, distanceMeters: 3, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'grazing' },
    { id: 'billboard_middle_handoff', label: 'Billboard → middle handoff', heightMeters: 0.85, distanceMeters: 8, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'grazing' },
    { id: 'middle_texture_handoff', label: 'Middle → texture handoff', heightMeters: 1.2, distanceMeters: 25, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'cutoff' },
    { id: 'near_handoff', label: 'Billboard → middle compatibility view', heightMeters: 0.85, distanceMeters: 8, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'grazing' },
    { id: 'cluster_handoff', label: 'Middle → texture compatibility view', heightMeters: 1.2, distanceMeters: 25, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'cutoff' },
    { id: 'top_down', label: 'Top-down review', heightMeters: 18, distanceMeters: 0.7, lateralMeters: 0.4, targetHeightMeters: 0.04, pose: 'top_down', fixture: 'topDown' },
    { id: 'far_texture', label: 'Far texture-only review', heightMeters: 3.2, distanceMeters: 46, lateralMeters: -2, targetHeightMeters: 0.08, pose: 'far', fixture: 'cutoff' }
]);

export const GRASS_LAB_REQUIRED_CAMERA_IDS = freezeDeep([
    'height_050',
    'height_100',
    'height_150',
    'height_200',
    'height_300',
    'height_500',
    'gameplay_bus',
    'close_billboard_handoff',
    'billboard_middle_handoff',
    'middle_texture_handoff',
    'near_handoff',
    'cluster_handoff',
    'top_down',
    'far_texture'
]);

export const GRASS_LAB_LIGHTING_PRESETS = freezeDeep({
    daylight: {
        id: 'daylight', label: 'Daylight', sunIntensity: 1.05, sunColor: 0xffffff,
        sunPosition: { x: 110, y: 160, z: 90 }, hemiIntensity: 0.45,
        skyColor: 0xffffff, groundColor: 0x182016, exposure: 1
    },
    overcast: {
        id: 'overcast', label: 'Overcast', sunIntensity: 0.2, sunColor: 0xdce8f0,
        sunPosition: { x: 50, y: 180, z: 80 }, hemiIntensity: 0.72,
        skyColor: 0xd9e5ec, groundColor: 0x263128, exposure: 0.98
    },
    golden: {
        id: 'golden', label: 'Golden hour', sunIntensity: 2.1, sunColor: 0xffbd7a,
        sunPosition: { x: 110, y: 18, z: 42 }, hemiIntensity: 0.5,
        skyColor: 0xffdfbd, groundColor: 0x2b241e, exposure: 1.02
    },
    night: {
        id: 'night', label: 'Night / street-lit proxy', sunIntensity: 0.08, sunColor: 0x8aa7ff,
        sunPosition: { x: -70, y: 85, z: 45 }, hemiIntensity: 0.16,
        skyColor: 0x40507d, groundColor: 0x080d12, exposure: 0.78
    }
});

export const GRASS_LAB_MOTION_PATHS = freezeDeep({
    stationary: { id: 'stationary', label: 'Stationary stability', durationMs: 4000, moving: false },
    forward: { id: 'forward', label: 'Forward through all handoffs', durationMs: 9000, moving: true },
    reverse: { id: 'reverse', label: 'Reverse through all handoffs', durationMs: 9000, moving: true },
    strafe: { id: 'strafe', label: 'Sideways across ownership cells', durationMs: 6000, moving: true },
    flyover: { id: 'flyover', label: 'Close → billboard → middle → texture flyover', durationMs: 9000, moving: true }
});

export const GRASS_LAB_DEFAULT_BUDGET = freezeDeep({
    resolution: '1920×1080',
    averageGpuMs: 1.5,
    averageCpuMs: 0.6,
    minimumCpuSamples: 120,
    minimumGpuSamples: 30,
    minimumFrameSamples: 120,
    minimumWarmupFrames: 120,
    minimumWarmupMs: 1000,
    minimumStableUploadFrames: 30,
    typicalDrawCallsMin: 4,
    typicalDrawCallsMax: 6,
    hardDrawCalls: 12,
    typicalTriangles: 50000,
    combinedVisibleGrassTriangles: 200000,
    geometryBeyondCutoff: 0
});

export function summarizeGrassTimingSamples(values) {
    const samples = (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b);
    if (!samples.length) {
        return {
            meanMs: null,
            medianMs: null,
            p95Ms: null,
            maxMs: null,
            sampleCount: 0
        };
    }
    const middle = Math.floor(samples.length / 2);
    const median = samples.length % 2 === 0
        ? (samples[middle - 1] + samples[middle]) / 2
        : samples[middle];
    const p95 = samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)];
    return {
        meanMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length, 6),
        medianMs: round(median, 6),
        p95Ms: round(p95, 6),
        maxMs: round(samples[samples.length - 1], 6),
        sampleCount: samples.length
    };
}

export function evaluateGrassPerformanceMeasurement(measurement, budget = GRASS_LAB_DEFAULT_BUDGET) {
    const source = measurement && typeof measurement === 'object' ? measurement : {};
    const cpu = summarizeGrassTimingSamples(source?.cpu?.samplesMs);
    const frame = summarizeGrassTimingSamples(source?.frame?.samplesMs);
    const gpuSamples = Array.isArray(source?.gpu?.samples)
        ? source.gpu.samples.map((sample) => sample?.ms)
        : source?.gpu?.samplesMs;
    const gpu = summarizeGrassTimingSamples(gpuSamples);
    const uploadValues = (Array.isArray(source?.bufferUpdates?.samples) ? source.bufferUpdates.samples : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0);
    const gpuSupported = source?.gpu?.supported === true;
    const gpuSupportDocumented = typeof source?.gpu?.supported === 'boolean'
        && typeof source?.gpu?.backend === 'string'
        && source.gpu.backend.length > 0;
    const gpuSequences = (Array.isArray(source?.gpu?.samples) ? source.gpu.samples : [])
        .map((sample) => Number(sample?.sequence));
    const gpuSequenceIntegrity = !gpuSupported || (
        gpuSequences.length === gpu.sampleCount
        && gpuSequences.every((sequence) => Number.isInteger(sequence) && sequence > 0)
        && new Set(gpuSequences).size === gpuSequences.length
    );
    const checks = {
        measurementComplete: source?.status === 'complete',
        warmupFrames: Number(source?.warmup?.frames) >= budget.minimumWarmupFrames,
        warmupDuration: Number(source?.warmup?.durationMs) >= budget.minimumWarmupMs,
        warmupStability: Number(source?.warmup?.stableZeroUploadFrames) >= budget.minimumStableUploadFrames,
        cpuSampleCount: cpu.sampleCount >= budget.minimumCpuSamples,
        frameSampleCount: frame.sampleCount >= budget.minimumFrameSamples,
        cpuMean: cpu.meanMs !== null && cpu.meanMs <= budget.averageCpuMs,
        gpuSupportDocumented,
        gpuSampleCount: gpuSupported ? gpu.sampleCount >= budget.minimumGpuSamples : null,
        gpuSequenceIntegrity: gpuSupported ? gpuSequenceIntegrity : null,
        gpuTimerActive: gpuSupported ? source?.gpu?.active === true : null,
        gpuDisjointFree: gpuSupported ? Number(source?.gpu?.disjointCount) === 0 : null,
        gpuMean: gpuSupported ? gpu.meanMs !== null && gpu.meanMs <= budget.averageGpuMs : null,
        gpuUnavailableReason: gpuSupported ? null : String(source?.gpu?.notMeasuredReason ?? '').length > 0,
        hardwareAdapter: source?.graphics?.hardwareAccelerated === true,
        stationaryUploads: uploadValues.length >= budget.minimumFrameSamples
            && uploadValues.every((value) => value === 0)
    };
    const gpuPass = gpuSupported
        ? checks.gpuSampleCount
            && checks.gpuSequenceIntegrity
            && checks.gpuTimerActive
            && checks.gpuDisjointFree
            && checks.gpuMean
        : checks.gpuUnavailableReason;
    const pass = checks.measurementComplete
        && checks.warmupFrames
        && checks.warmupDuration
        && checks.warmupStability
        && checks.cpuSampleCount
        && checks.frameSampleCount
        && checks.cpuMean
        && checks.gpuSupportDocumented
        && checks.hardwareAdapter
        && checks.stationaryUploads
        && gpuPass;
    return {
        schema: 'grass-lab-performance-gate-v1',
        statistic: 'arithmetic_mean',
        budget: {
            averageCpuMs: budget.averageCpuMs,
            averageGpuMs: budget.averageGpuMs,
            minimumCpuSamples: budget.minimumCpuSamples,
            minimumGpuSamples: budget.minimumGpuSamples,
            minimumFrameSamples: budget.minimumFrameSamples,
            minimumWarmupFrames: budget.minimumWarmupFrames,
            minimumWarmupMs: budget.minimumWarmupMs,
            minimumStableUploadFrames: budget.minimumStableUploadFrames
        },
        measurements: {
            cpu,
            gpu,
            frame: {
                ...frame,
                fpsFromMeanFrameMs: frame.meanMs > 0 ? round(1000 / frame.meanMs, 3) : null
            },
            maximumStationaryBufferUpdates: uploadValues.length ? Math.max(...uploadValues) : null
        },
        gpuTimingSupported: gpuSupported,
        checks,
        pass
    };
}

export const GRASS_LAB_REQUIRED_REGRESSIONS = freezeDeep([
    'near_carpet_readability',
    'physical_height',
    'hard_substrate_boundary',
    'straight_sidewalk_cut',
    'corner_sidewalk_cut',
    'tree_accents',
    'top_down_behavior',
    'grazing_behavior',
    'forward_handoff_continuity',
    'reverse_handoff_continuity',
    'strafe_handoff_continuity',
    'flyover_handoff_continuity',
    'transition_continuity',
    'deterministic_reload',
    'camera_motion_stability'
]);

export const GRASS_LAB_V2_APPROVAL_SCOPE = 'visual_functional_motion_determinism';

export const GRASS_LAB_V2_PERFORMANCE_OWNERSHIP = freezeDeep({
    status: 'deferred_to_ai537',
    ownerPrompt: 'AI537'
});

export const GRASS_LAB_V2_REQUIRED_CAMERA_IDS = freezeDeep([
    'height_030',
    'height_050',
    'height_100',
    'height_150',
    'height_200',
    'height_300',
    'height_500',
    'near_grazing',
    'near_forward',
    'near_oblique',
    'gameplay_bus',
    'close_billboard_handoff',
    'billboard_middle_handoff',
    'middle_texture_handoff',
    'top_down',
    'far_texture'
]);

export const GRASS_LAB_V2_REQUIRED_LIGHTING_IDS = freezeDeep([
    'daylight',
    'overcast',
    'golden',
    'night'
]);

export const GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS = freezeDeep([
    'stationary',
    'forward',
    'reverse',
    'strafe',
    'flyover'
]);

export const GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS = freezeDeep([
    'clean_ui_free_visuals',
    'diagnostic_overlay_frames',
    'matched_before_after_pairs',
    'complete_state_metadata',
    'straight_sidewalk',
    'curved_sidewalk',
    'diagonal_cut',
    'inside_corner',
    'outside_corner',
    'irregular_cut',
    'low_side_profile',
    'exposed_substrate',
    'tree_base',
    'tree_substrate',
    'texture_only_fallback',
    'geometry_disabled_fallback',
    'daylight_material',
    'daylight_boundary',
    'daylight_handoff',
    'overcast_material',
    'overcast_boundary',
    'overcast_handoff',
    'golden_material',
    'golden_boundary',
    'golden_handoff',
    'night_material',
    'night_boundary',
    'night_handoff',
    'stationary_all_handoffs',
    'forward_all_handoffs',
    'reverse_all_handoffs',
    'strafe_all_handoffs',
    'flyover_all_handoffs'
]);

export const GRASS_LAB_V2_REQUIRED_REGRESSIONS = freezeDeep([
    'isolated_bright_points',
    'tier_color_luminance_continuity',
    'zero_coverage_mip_stability',
    'complete_near_coverage_bins',
    'complete_field_coverage_units',
    'sidewalk_root_exclusion',
    'boundary_conformance',
    'card_envelope_conformance',
    'no_square_substrate_fades',
    'no_worn_discs',
    'antialias_width',
    'height_distribution',
    'both_hidden_handoff_gaps',
    'nonadjacent_tier_overlap',
    'deterministic_reload',
    'temporal_flicker',
    'alpha_disappearance',
    'handoff_popping',
    'material_cohesion',
    'physical_boundary_readability',
    'signed_distance_orientation',
    'source_loop_identity',
    'low_quality_texture_fallback',
    'geometry_disabled_fallback',
    'stationary_stability',
    'forward_handoff_continuity',
    'reverse_handoff_continuity',
    'strafe_handoff_continuity',
    'flyover_handoff_continuity'
]);

export const GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS = freezeDeep([
    'quality_low',
    'quality_default',
    'quality_high',
    'default_worst_view',
    'default_transition_overlap'
]);

export function createGrassLabValidationState() {
    return {
        contractVersion: GRASS_LAB_VALIDATION_CONTRACT_VERSION,
        qualityPreset: 'default',
        cameraPreset: 'height_150',
        lightingPreset: 'daylight',
        motionPath: 'stationary',
        reviewedCameraIds: [],
        reviewedLightingIds: [],
        reviewedMotionPathIds: [],
        approvalStatus: 'pending'
    };
}

export function getGrassLabQualityPreset(id) {
    return GRASS_LAB_QUALITY_PRESETS[String(id)] ?? GRASS_LAB_QUALITY_PRESETS.default;
}

export function getGrassLabCameraPreset(id) {
    return GRASS_LAB_CAMERA_PRESETS.find((preset) => preset.id === String(id)) ?? GRASS_LAB_CAMERA_PRESETS[3];
}

export function getGrassLabLightingPreset(id) {
    return GRASS_LAB_LIGHTING_PRESETS[String(id)] ?? GRASS_LAB_LIGHTING_PRESETS.daylight;
}

export function applyGrassLabQualityPreset(state, presetId) {
    const source = state && typeof state === 'object' ? state : {};
    const next = JSON.parse(JSON.stringify(source));
    const preset = getGrassLabQualityPreset(presetId);
    next.validation = { ...createGrassLabValidationState(), ...(next.validation ?? {}), qualityPreset: preset.id };
    next.autoLod = {
        ...(next.autoLod ?? {}),
        force: 'auto',
        nearEndMeters: preset.nearRadiusMeters,
        billboardEndMeters: preset.billboardRadiusMeters,
        middleEndMeters: preset.middleRadiusMeters,
        clusterEndMeters: preset.middleRadiusMeters
    };
    next.coverage = {
        ...(next.coverage ?? {}),
        enabled: true,
        showSurface: true,
        showLip: true,
        densityMultiplier: preset.densityMultiplier
    };
    next.lod1 = {
        ...(next.lod1 ?? {}),
        enabled: preset.nearGeometry,
        carpetMode: preset.nearGeometry ? 'auto' : 'disabled',
        carpetRadiusMeters: preset.nearRadiusMeters,
        carpetBladesPerSquareMeter: preset.nearBladesPerSquareMeter,
        region: { ...(next.lod1?.region ?? {}), innerMeters: 0, outerMeters: preset.nearRadiusMeters },
        debug: { ...(next.lod1?.debug ?? {}), drawBounds: false }
    };
    next.lod2 = {
        ...(next.lod2 ?? {}),
        enabled: preset.billboardGeometry || preset.middleGeometry,
        billboardEnabled: preset.billboardGeometry,
        middleEnabled: preset.middleGeometry,
        billboardCardsPerUnit: preset.billboardCardsPerUnit,
        middleCardsPerUnit: preset.middleCardsPerUnit,
        clusterCardsPerPatch: preset.clusterCardsPerPatch,
        region: { ...(next.lod2?.region ?? {}), innerMeters: preset.nearRadiusMeters, outerMeters: preset.middleRadiusMeters },
        debug: { ...(next.lod2?.debug ?? {}), drawBounds: false }
    };
    next.lod3 = {
        ...(next.lod3 ?? {}),
        enabled: true,
        region: { ...(next.lod3?.region ?? {}), innerMeters: preset.farCutoffMeters, outerMeters: preset.farCutoffMeters }
    };
    next.lod4 = {
        ...(next.lod4 ?? {}),
        enabled: true,
        region: { ...(next.lod4?.region ?? {}), innerMeters: preset.farCutoffMeters, outerMeters: preset.farCutoffMeters }
    };
    next.accents = {
        ...(next.accents ?? {}),
        enabled: preset.localizedAccents,
        wornEnabled: false,
        clustersPerTree: preset.clustersPerTree
    };
    return next;
}

export function evaluateGrassLabBudget(samples, budget = GRASS_LAB_DEFAULT_BUDGET) {
    const list = (Array.isArray(samples) ? samples : [samples]).filter((sample) => sample && typeof sample === 'object');
    const cpuValues = list.map((sample) => sample?.grass?.updateCpuMs);
    const gpuValues = list.map((sample) => sample?.frame?.gpuMs);
    const drawValues = list.map((sample) => finite(
        sample?.grass?.combinedVisibleGrassLogicalDrawCalls,
        finite(sample?.grass?.logicalDrawCalls, 0)
            + finite(sample?.coverage?.logicalDrawCalls ?? sample?.coverage?.drawCalls, 0)
    ));
    const triangleValues = list.map((sample) => sample?.grass?.triangles);
    const combinedTriangleValues = list.map((sample) => (
        finite(sample?.grass?.triangles, 0) + finite(sample?.coverage?.triangles, 0)
    ));
    const cutoffValues = list.map((sample) => sample?.lod?.geometryBeyondCutoff);
    const averageCpuMs = average(cpuValues);
    const averageGpuMs = average(gpuValues);
    const averageDrawCalls = average(drawValues);
    const maximumDrawCalls = maximum(drawValues);
    const averageTriangles = average(triangleValues);
    const maximumTriangles = maximum(triangleValues);
    const maximumCombinedTriangles = maximum(combinedTriangleValues);
    const combinedTriangleCeiling = finite(
        budget?.combinedVisibleGrassTriangles,
        GRASS_LAB_DEFAULT_BUDGET.combinedVisibleGrassTriangles
    );
    const maximumGeometryBeyondCutoff = maximum(cutoffValues) ?? 0;
    const checks = {
        cpu: averageCpuMs !== null && averageCpuMs <= budget.averageCpuMs,
        gpu: averageGpuMs === null ? null : averageGpuMs <= budget.averageGpuMs,
        typicalDraws: averageDrawCalls !== null && averageDrawCalls <= budget.typicalDrawCallsMax,
        hardDrawCeiling: maximumDrawCalls !== null && maximumDrawCalls <= budget.hardDrawCalls,
        triangles: maximumTriangles !== null && maximumTriangles <= budget.typicalTriangles,
        combinedTriangles: maximumCombinedTriangles !== null
            && maximumCombinedTriangles <= combinedTriangleCeiling,
        cutoff: maximumGeometryBeyondCutoff <= budget.geometryBeyondCutoff
    };
    return {
        sampleCount: list.length,
        budget: { ...budget },
        measurements: {
            averageCpuMs: round(averageCpuMs),
            averageGpuMs: round(averageGpuMs),
            averageDrawCalls: round(averageDrawCalls, 2),
            maximumDrawCalls: round(maximumDrawCalls, 0),
            averageTriangles: round(averageTriangles, 0),
            maximumTriangles: round(maximumTriangles, 0),
            maximumCombinedVisibleGrassTriangles: round(maximumCombinedTriangles, 0),
            maximumGeometryBeyondCutoff: round(maximumGeometryBeyondCutoff, 0)
        },
        checks,
        gpuTimingSupported: averageGpuMs !== null,
        structuralPass: checks.typicalDraws && checks.hardDrawCeiling && checks.triangles && checks.combinedTriangles && checks.cutoff,
        timingPass: checks.cpu && checks.gpu !== false,
        pass: checks.cpu && checks.gpu !== false && checks.typicalDraws && checks.hardDrawCeiling
            && checks.triangles && checks.combinedTriangles && checks.cutoff
    };
}

export function createGrassLabApprovalRecord({
    generatedAt = new Date().toISOString(),
    environment = {},
    qualityPreset = 'default',
    budgetResult,
    reviewedCameraIds = [],
    reviewedLightingIds = [],
    reviewedMotionPathIds = [],
    regressions = {},
    stress = null,
    gameplayTouched = false,
    approvedBy = 'AI 357 offline validation'
} = {}) {
    const cameras = new Set(reviewedCameraIds.map(String));
    const lights = new Set(reviewedLightingIds.map(String));
    const paths = new Set(reviewedMotionPathIds.map(String));
    const missingCameras = GRASS_LAB_REQUIRED_CAMERA_IDS.filter((id) => !cameras.has(id));
    const missingLighting = Object.keys(GRASS_LAB_LIGHTING_PRESETS).filter((id) => !lights.has(id));
    const missingPaths = Object.keys(GRASS_LAB_MOTION_PATHS).filter((id) => !paths.has(id));
    const missingRegressions = GRASS_LAB_REQUIRED_REGRESSIONS.filter((id) => regressions?.[id] !== true);
    const approved = qualityPreset === 'default'
        && budgetResult?.pass === true
        && !missingCameras.length
        && !missingLighting.length
        && !missingPaths.length
        && !missingRegressions.length
        && stress?.completed === true
        && gameplayTouched === false;
    return {
        schema: 'grass-lab-approval-v1',
        validationContractVersion: GRASS_LAB_VALIDATION_CONTRACT_VERSION,
        generatedAt: String(generatedAt),
        approvedBy: String(approvedBy),
        status: approved ? 'approved' : 'pending',
        qualityPreset: String(qualityPreset),
        environment: { ...environment },
        budgetResult: budgetResult ? JSON.parse(JSON.stringify(budgetResult)) : null,
        reviewCoverage: {
            cameraIds: [...cameras].sort(),
            lightingIds: [...lights].sort(),
            motionPathIds: [...paths].sort(),
            missingCameras,
            missingLighting,
            missingPaths
        },
        regressions: { ...regressions },
        missingRegressions,
        stress: stress ? { ...stress } : null,
        gameplayTouched: !!gameplayTouched,
        approved
    };
}

export function evaluateGrassLabV2VisualFunctionalApproval({
    qualityPreset = 'default',
    snapshotContractVersion = 0,
    reviewedCameraIds = [],
    reviewedLightingIds = [],
    reviewedMotionPathIds = [],
    reviewedEvidenceIds = [],
    regressions = {},
    diagnostics = {},
    captureEvidence = {},
    performanceMeasurements = [],
    gameplayTouched = false
} = {}) {
    const cameras = stringSet(reviewedCameraIds);
    const lights = stringSet(reviewedLightingIds);
    const paths = stringSet(reviewedMotionPathIds);
    const evidence = stringSet(reviewedEvidenceIds);
    const missingCameras = missingIds(GRASS_LAB_V2_REQUIRED_CAMERA_IDS, cameras);
    const missingLighting = missingIds(GRASS_LAB_V2_REQUIRED_LIGHTING_IDS, lights);
    const missingPaths = missingIds(GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS, paths);
    const missingEvidence = missingIds(GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS, evidence);
    const missingRegressions = GRASS_LAB_V2_REQUIRED_REGRESSIONS
        .filter((id) => regressions?.[id] !== true);

    const autoLod = isRecord(diagnostics?.autoLod) ? diagnostics.autoLod : {};
    const near = isRecord(diagnostics?.nearCarpet) ? diagnostics.nearCarpet : {};
    const field = isRecord(diagnostics?.field) ? diagnostics.field : {};
    const accent = isRecord(diagnostics?.accent) ? diagnostics.accent : {};
    const coverage = isRecord(diagnostics?.coverage) ? diagnostics.coverage : {};
    const structural = isRecord(diagnostics?.structural) ? diagnostics.structural : {};
    const fieldMaterial = isRecord(field?.material) ? field.material : field;
    const accentMaterial = isRecord(accent?.material) ? accent.material : accent;
    const transitionStates = ['near_to_billboard', 'billboard_to_middle', 'middle_to_texture'];
    const transitions = Array.isArray(autoLod?.transitionSamples) ? autoLod.transitionSamples : [];
    const transitionEvidenceComplete = transitionStates.every((state) => {
        const matches = transitions.filter((entry) => entry?.state === state);
        return matches.length === 1
            && inNumberRange(matches[0]?.progress, Number.EPSILON, 1 - Number.EPSILON)
            && isWeightVector(matches[0]?.weights);
    });
    const handoffs = Array.isArray(field?.handoffs) ? field.handoffs : [];
    const handoffEvidenceComplete = transitionStates.every((id) => {
        const matches = handoffs.filter((entry) => entry?.id === id);
        if (matches.length !== 1) return false;
        const handoff = matches[0];
        return handoff?.sharedSamples === true
            && handoff?.complementary === true
            && nonNegativeInteger(handoff?.outgoingUnits)
            && nonNegativeInteger(handoff?.incomingUnits)
            && nonNegativeInteger(handoff?.transitionUnits)
            && nonNegativeInteger(handoff?.overlapUnits)
            && equalsNumber(handoff?.unrepresentedEligibleUnits, 0)
            && equalsNumber(handoff?.bothHiddenUnits, 0)
            && equalsNumber(handoff?.nonAdjacentOverlapUnits, 0);
    });

    const exactCountCoverage = (value, candidateKey, eligibleKey, representedKey, missingKey) => (
        nonNegativeInteger(value?.[candidateKey])
        && nonNegativeInteger(value?.[eligibleKey])
        && Number(value?.[eligibleKey]) > 0
        && equalsNumber(value?.[representedKey], Number(value?.[eligibleKey]))
        && equalsNumber(value?.[missingKey], 0)
    );
    const exactAreaCoverage = (value) => (
        isFiniteValue(value?.eligibleAreaSquareMeters)
        && Number(value.eligibleAreaSquareMeters) > 0
        && equalsNumber(
            value?.representedAreaSquareMeters,
            Number(value.eligibleAreaSquareMeters),
            1e-6
        )
    );
    const fieldTierCoverage = ['billboard', 'middle'].every((tier) => (
        exactCountCoverage(
            field?.[tier],
            'candidateUnits',
            'eligibleUnits',
            'representedUnits',
            'unrepresentedEligibleUnits'
        )
        && exactAreaCoverage(field?.[tier])
        && equalsNumber(field?.[tier]?.exactEnvelopeFailures, 0)
    ));

    const requiredTierKeys = ['boundary', 'near', 'billboard', 'middle', 'accent'];
    const trianglesByTier = structural?.trianglesByTier;
    const drawCallsByTier = structural?.drawCallsByTier;
    const tierTrianglesRecorded = hasExactKeys(trianglesByTier, requiredTierKeys)
        && requiredTierKeys.every((key) => nonNegativeInteger(trianglesByTier[key]));
    const tierDrawsRecorded = hasExactKeys(drawCallsByTier, requiredTierKeys)
        && requiredTierKeys.every((key) => nonNegativeInteger(drawCallsByTier[key]));
    const triangleSum = tierTrianglesRecorded
        ? requiredTierKeys.reduce((sum, key) => sum + Number(trianglesByTier[key]), 0)
        : null;
    const drawSum = tierDrawsRecorded
        ? requiredTierKeys.reduce((sum, key) => sum + Number(drawCallsByTier[key]), 0)
        : null;

    const performanceRows = Array.isArray(performanceMeasurements) ? performanceMeasurements : [];
    const performanceCounts = new Map();
    for (const row of performanceRows) {
        const id = String(row?.sampleId ?? '');
        performanceCounts.set(id, (performanceCounts.get(id) ?? 0) + 1);
    }
    const missingPerformanceSamples = GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS
        .filter((id) => performanceCounts.get(id) !== 1);
    const performanceMeasurementsRecorded = !missingPerformanceSamples.length
        && GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS.every((id) => {
            const row = performanceRows.find((entry) => entry?.sampleId === id);
            return row?.performanceGate?.schema === 'grass-lab-performance-gate-v1'
                && row.performanceGate.statistic === 'arithmetic_mean'
                && isRecord(row.performanceGate.measurements)
                && typeof row.performanceGate.pass === 'boolean';
        });

    const boundarySignature = String(coverage?.boundarySignature ?? '');
    const checks = {
        defaultQualityPrimary: qualityPreset === 'default',
        snapshotContractV10: Number(snapshotContractVersion) === 10,
        automaticLodPrimary: autoLod?.force === 'auto',
        autoLodIdentity: autoLod?.schema === 'bus-simulator.grass-auto-lod'
            && Number(autoLod?.version) === 2,
        autoLodForceValues: hasExactStringSet(
            autoLod?.forceValues,
            ['auto', 'near', 'billboard', 'middle', 'texture']
        ),
        autoLodWeights: isWeightVector(autoLod?.weights),
        autoLodThresholds: equalsNumber(autoLod?.nearEndMeters, 3)
            && equalsNumber(autoLod?.billboardEndMeters, 8)
            && equalsNumber(autoLod?.middleEndMeters, 25),
        autoLodTransitions: equalsNumber(autoLod?.transitionWidthMeters, 2)
            && equalsNumber(autoLod?.hysteresisMeters, 0.75)
            && transitionEvidenceComplete,
        autoLodAngles: equalsNumber(autoLod?.angle?.grazingDeg, 12)
            && equalsNumber(autoLod?.angle?.topDownDeg, 70)
            && equalsNumber(autoLod?.angle?.grazingDistanceScale, 0.8)
            && equalsNumber(autoLod?.angle?.topDownDistanceScale, 1.2),
        nearIdentity: near?.schema === 'near-grass-carpet-v2',
        nearExactCoverage: ['exact_polygon', 'exact_polygon_v2'].includes(near?.coverageMode),
        nearCanonicalDensity: equalsNumber(near?.ownershipCellSizeMeters, 1)
            && equalsNumber(near?.rootBinsPerSquareMeter, 64)
            && equalsNumber(near?.fibersPerRoot, 3),
        nearSignatures: nonEmptyString(near?.boundarySignature)
            && nonEmptyString(near?.placementSignature),
        nearCompleteBins: exactCountCoverage(
            near,
            'candidateBins',
            'eligibleBins',
            'representedBins',
            'unrepresentedEligibleBins'
        ),
        nearCompleteArea: exactAreaCoverage(near),
        nearExactDiagnostics: isRecord(near?.rejectedByKind)
            && equalsNumber(near?.exactPostcheckFailures, 0),
        nearMaterial: near?.materialId === 'pbr.grass_low_cut_maintained_v2'
            && near?.appearanceSource === 'ai358_shared_catalog'
            && equalsNumber(near?.materialPaths, 1)
            && near?.transparent === false
            && near?.depthWrite === true
            && near?.emissive === false,
        fieldIdentity: field?.schema === 'bus-simulator.grass-cohesive-field-renderer'
            && Number(field?.version) === 2,
        fieldExactCoverage: field?.coverageMode === 'exact_polygon'
            && equalsNumber(field?.ownershipCellSizeMeters, 1)
            && field?.sharedWorldAlignedLayout === true
            && field?.complementarySamples === true,
        fieldSignatures: nonEmptyString(field?.boundarySignature)
            && nonEmptyString(field?.placementSignature),
        fieldCompleteUnits: exactCountCoverage(
            field,
            'candidateUnits',
            'eligibleUnits',
            'representedUnits',
            'unrepresentedEligibleUnits'
        ),
        fieldCompleteArea: exactAreaCoverage(field),
        fieldExactDiagnostics: isRecord(field?.rejectedByKind)
            && equalsNumber(field?.exactPostcheckFailures, 0)
            && equalsNumber(field?.exactEnvelopeFailures, 0),
        fieldTierCoverage,
        fieldHandoffs: handoffEvidenceComplete
            && nonNegativeInteger(field?.transitionUnits)
            && nonNegativeInteger(field?.overlapUnits),
        fieldCards: equalsNumber(field?.billboard?.cardsPerUnit, 1)
            && equalsNumber(field?.middle?.cardsPerUnit, 2),
        fieldMaterial: fieldMaterial?.atlasRole === 'midCluster'
            && fieldMaterial?.resolvedMaterialId === 'pbr.grass_low_cut_maintained_v2'
            && equalsNumber(fieldMaterial?.materialPaths, 1)
            && equalsNumber(fieldMaterial?.alphaCutoff, 0.35)
            && fieldMaterial?.alphaToCoverage === true
            && fieldMaterial?.transparent === false
            && fieldMaterial?.alphaLayoutPolicy === 'separate_alpha_map'
            && fieldMaterial?.alphaLayoutChannel === 'green'
            && fieldMaterial?.normalPolicy === 'world_up_blend'
            && equalsNumber(fieldMaterial?.worldUpBlend, 1)
            && equalsNumber(fieldMaterial?.emissiveIntensity, 0)
            && fieldMaterial?.globalLoaderCalibrated === true
            && fieldMaterial?.sharedByBillboardAndMiddle === true
            && hasExactStringSet(
                fieldMaterial?.atlasMaps,
                ['midClusterColor', 'midClusterCoverage', 'midClusterNormal', 'midClusterRoughness', 'midClusterAo']
            ),
        accentIdentity: accent?.schema === 'bus-simulator.grass-localized-accents'
            && Number(accent?.version) === 2,
        accentExactCoverage: accent?.coverageMode === 'exact_polygon'
            && accent?.substrateOwnership === 'coverage_tree_hole'
            && accent?.weightPolicy === '1_minus_texture_weight',
        accentSignatures: nonEmptyString(accent?.boundarySignature)
            && nonEmptyString(accent?.placementSignature),
        accentCompleteRoots: exactCountCoverage(
            accent,
            'candidateRoots',
            'eligibleRoots',
            'representedRoots',
            'unrepresentedEligibleRoots'
        ),
        accentExactDiagnostics: isRecord(accent?.rejectedByKind)
            && equalsNumber(accent?.exactPostcheckFailures, 0)
            && equalsNumber(accent?.exactEnvelopeFailures, 0),
        accentCards: equalsNumber(accent?.cardsPerCluster, 2)
            && equalsNumber(accent?.clustersPerTree, 4),
        accentNoWornCost: equalsNumber(accent?.wornPatches, 0)
            && equalsNumber(accent?.wornTriangles, 0)
            && equalsNumber(accent?.wornDrawCalls, 0)
            && equalsNumber(accent?.wornMaterialPaths, 0),
        accentMaterial: accentMaterial?.atlasRole === 'accentClump'
            && accentMaterial?.resolvedMaterialId === 'pbr.grass_low_cut_maintained_v2'
            && equalsNumber(accentMaterial?.materialPaths, 1)
            && equalsNumber(accentMaterial?.alphaCutoff, 0.35)
            && accentMaterial?.alphaToCoverage === true
            && accentMaterial?.transparent === false
            && accentMaterial?.depthWrite === true
            && accentMaterial?.alphaLayoutPolicy === 'separate_alpha_map'
            && accentMaterial?.alphaLayoutChannel === 'green'
            && accentMaterial?.normalPolicy === 'world_up_blend'
            && equalsNumber(accentMaterial?.worldUpBlend, 1)
            && equalsNumber(accentMaterial?.emissiveIntensity, 0)
            && accentMaterial?.globalLoaderCalibrated === true
            && hasExactStringSet(
                accentMaterial?.atlasMaps,
                ['accentClumpColor', 'accentClumpCoverage', 'accentClumpNormal', 'accentClumpRoughness', 'accentClumpAo']
            ),
        boundarySourceIdentity: nonEmptyString(coverage?.sourceLoopIdentity)
            && coverage?.roadEngineSourceLoopIdentity === coverage?.sourceLoopIdentity,
        boundarySignatureStable: nonEmptyString(boundarySignature)
            && coverage?.boundarySignatureStable === true,
        boundarySignatureShared: boundarySignature === near?.boundarySignature
            && boundarySignature === field?.boundarySignature
            && boundarySignature === accent?.boundarySignature,
        boundarySignedDistance: coverage?.signedDistanceOrientation === 'positive_grass_negative_exclusion'
            && Number(coverage?.occupiedSamples) > 0
            && Number(coverage?.excludedSamples) > 0
            && Number(coverage?.rootEligibleSamples) > 0,
        boundaryReveal: inNumberRange(coverage?.grassOnsetWidthMeters, 0.06, 0.1)
            && inNumberRange(coverage?.grassOnsetWidthMaxMeters, 0.06, 0.1)
            && inNumberRange(coverage?.sidewalkOnsetDistanceMinMeters, 0.06, 0.1)
            && inNumberRange(coverage?.sidewalkOnsetDistanceMaxMeters, 0.06, 0.1)
            && Number(coverage?.treeSubstrateRevealMinMeters) > 0
            && Number(coverage?.treeSubstrateRevealMaxMeters) >= Number(coverage?.treeSubstrateRevealMinMeters),
        boundaryDimensions: inNumberRange(coverage?.structuralBaseHeightMeters, 0.025, 0.03)
            && equalsNumber(coverage?.visibleBladeTipMinMeters, 0.04)
            && equalsNumber(coverage?.visibleBladeTipMaxMeters, 0.075)
            && inNumberRange(coverage?.antialiasWidthMeters, 0, 0.015)
            && equalsNumber(coverage?.rootClearanceMeters, 0.003),
        boundaryTopology: Number(coverage?.diagonalSegments) > 0
            && Number(coverage?.curvedSegments) > 0
            && Number(coverage?.insideCorners) > 0
            && Number(coverage?.outsideCorners) > 0
            && Number(coverage?.treeBaseSegments) > 0,
        boundaryHardExclusions: equalsNumber(coverage?.hardExclusionIntrusions, 0)
            && equalsNumber(coverage?.grassOnsetIntrusions, 0)
            && equalsNumber(coverage?.ineligibleCutEdgeRoots, 0),
        boundaryOpaqueBatch: coverage?.opaqueCap === true
            && coverage?.transparentSurface === false
            && coverage?.alphaTestedSurface === false
            && Number(coverage?.logicalDrawCalls) > 0
            && Number(coverage?.logicalDrawCalls) <= 2,
        structuralTierAccounting: tierTrianglesRecorded
            && tierDrawsRecorded
            && equalsNumber(triangleSum, Number(structural?.combinedVisibleGrassTriangles))
            && equalsNumber(drawSum, Number(structural?.combinedVisibleGrassLogicalDrawCalls)),
        structuralBoundaryReference: tierTrianglesRecorded
            && Number(trianglesByTier.boundary) === 95_219,
        structuralTriangleCeiling: nonNegativeInteger(structural?.combinedVisibleGrassTriangles)
            && Number(structural?.combinedVisibleGrassTriangles) <= 200_000,
        structuralDrawCeiling: nonNegativeInteger(structural?.combinedVisibleGrassLogicalDrawCalls)
            && Number(structural?.combinedVisibleGrassLogicalDrawCalls) <= 12
            && tierDrawsRecorded
            && Number(drawCallsByTier.boundary) <= 2,
        geometryCutoff: equalsNumber(autoLod?.geometryBeyondCutoff, 0)
            && equalsNumber(field?.geometryBeyondCutoff, 0)
            && equalsNumber(structural?.geometryBeyondCutoff, 0),
        stationaryUploads: equalsNumber(structural?.stationaryBufferUpdates, 0)
            && near?.stationaryUploadsZero === true
            && equalsNumber(field?.lastBufferUpdates, 0)
            && accent?.stationaryUploadsZero === true,
        native4kCapture: Number(captureEvidence?.drawingBuffer?.width) === 3840
            && Number(captureEvidence?.drawingBuffer?.height) === 2160
            && equalsNumber(captureEvidence?.pixelRatio, 1)
            && captureEvidence?.actualDrawingBuffer === true,
        losslessPngCapture: captureEvidence?.format === 'png'
            && captureEvidence?.lossless === true
            && captureEvidence?.imageDimensionsVerified === true,
        captureTraceability: Number(captureEvidence?.imageCount) > 0
            && captureEvidence?.stateMetadataComplete === true
            && captureEvidence?.uiFreeVisuals === true
            && captureEvidence?.separateDiagnosticOverlays === true
            && captureEvidence?.matchedBeforeAfter === true,
        cameraEvidence: missingCameras.length === 0,
        lightingEvidence: missingLighting.length === 0,
        motionEvidence: missingPaths.length === 0,
        requiredEvidence: missingEvidence.length === 0,
        regressions: missingRegressions.length === 0,
        performanceMeasurementsRecorded,
        noGameplayChanges: gameplayTouched === false
    };
    const failedChecks = Object.entries(checks)
        .filter(([, passed]) => passed !== true)
        .map(([id]) => id);
    return {
        approvalScope: GRASS_LAB_V2_APPROVAL_SCOPE,
        performanceOwnership: { ...GRASS_LAB_V2_PERFORMANCE_OWNERSHIP },
        performancePassRequired: false,
        performanceMeasurementsRecorded,
        performanceResults: performanceRows.map((row) => ({
            sampleId: String(row?.sampleId ?? ''),
            measuredPass: row?.performanceGate?.pass === true
        })),
        reviewCoverage: {
            cameraIds: [...cameras].sort(),
            lightingIds: [...lights].sort(),
            motionPathIds: [...paths].sort(),
            evidenceIds: [...evidence].sort(),
            missingCameras,
            missingLighting,
            missingPaths,
            missingEvidence
        },
        missingRegressions,
        missingPerformanceSamples,
        checks,
        failedChecks,
        pass: failedChecks.length === 0
    };
}

export function createGrassLabV2ApprovalRecord(options = {}) {
    const source = isRecord(options) ? options : {};
    const evaluation = evaluateGrassLabV2VisualFunctionalApproval(source);
    const approved = evaluation.pass === true;
    return {
        schema: 'grass-lab-approval-v2',
        validationContractVersion: GRASS_LAB_VALIDATION_CONTRACT_VERSION,
        grassLabContractVersion: Number(source.snapshotContractVersion) || 0,
        generatedAt: String(source.generatedAt ?? new Date().toISOString()),
        approvedBy: String(source.approvedBy ?? 'AI 362 scoped visual-functional validation'),
        approvalScope: GRASS_LAB_V2_APPROVAL_SCOPE,
        status: approved ? 'approved' : 'pending',
        approved,
        qualityPreset: String(source.qualityPreset ?? 'default'),
        environment: isRecord(source.environment) ? { ...source.environment } : {},
        performanceStatus: GRASS_LAB_V2_PERFORMANCE_OWNERSHIP.status,
        performanceOwnership: { ...GRASS_LAB_V2_PERFORMANCE_OWNERSHIP },
        performancePassRequired: false,
        performanceMeasurements: cloneJson(source.performanceMeasurements ?? []),
        performance: {
            status: GRASS_LAB_V2_PERFORMANCE_OWNERSHIP.status,
            ownership: { ...GRASS_LAB_V2_PERFORMANCE_OWNERSHIP },
            passRequired: false,
            measurements: cloneJson(source.performanceMeasurements ?? [])
        },
        diagnostics: cloneJson(source.diagnostics ?? {}),
        captureEvidence: cloneJson(source.captureEvidence ?? {}),
        reviewCoverage: cloneJson(evaluation.reviewCoverage),
        regressions: isRecord(source.regressions) ? { ...source.regressions } : {},
        missingRegressions: [...evaluation.missingRegressions],
        missingPerformanceSamples: [...evaluation.missingPerformanceSamples],
        visualFunctionalEvaluation: cloneJson(evaluation),
        gameplayTouched: source.gameplayTouched === true,
        authorization: {
            status: 'blocked_pending_ai537',
            gameplayAuthorized: false,
            requiredPerformancePrompt: 'AI537',
            requiredPerformanceRecord: 'specs/grass/GRASS_LAB_PERFORMANCE_APPROVAL_AI537.json'
        }
    };
}
