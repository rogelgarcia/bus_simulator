// Deterministic quality, review, budget, and approval contract for the offline Grass Lab.
// @ts-check

export const GRASS_LAB_VALIDATION_CONTRACT_VERSION = 1;

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

export const GRASS_LAB_QUALITY_PRESETS = freezeDeep({
    low: {
        id: 'low',
        label: 'Low · texture + boundary',
        nearRadiusMeters: 6,
        clusterRadiusMeters: 20,
        farCutoffMeters: 20,
        densityMultiplier: 0.55,
        nearBladesPerSquareMeter: 24,
        clusterCardsPerPatch: 1,
        localizedAccents: false,
        clustersPerTree: 0,
        nearGeometry: false,
        clusterGeometry: false,
        description: 'Maintains the hard raised coverage surface and sidewalk cuts while falling back to texture.'
    },
    default: {
        id: 'default',
        label: 'Default · approved target',
        nearRadiusMeters: 9,
        clusterRadiusMeters: 30,
        farCutoffMeters: 30,
        densityMultiplier: 1,
        nearBladesPerSquareMeter: 64,
        clusterCardsPerPatch: 2,
        localizedAccents: true,
        clustersPerTree: 4,
        nearGeometry: true,
        clusterGeometry: true,
        description: 'Automatic near carpet, single-atlas clusters, localized accents, then the maintained texture surface.'
    },
    high: {
        id: 'high',
        label: 'High · review / stress',
        nearRadiusMeters: 12,
        clusterRadiusMeters: 42,
        farCutoffMeters: 42,
        densityMultiplier: 1.25,
        nearBladesPerSquareMeter: 64,
        clusterCardsPerPatch: 2,
        localizedAccents: true,
        clustersPerTree: 6,
        nearGeometry: true,
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
    { id: 'near_handoff', label: 'Near → cluster handoff', heightMeters: 0.85, distanceMeters: 9, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'grazing' },
    { id: 'cluster_handoff', label: 'Cluster → texture handoff', heightMeters: 1.2, distanceMeters: 30, lateralMeters: 0, targetHeightMeters: 0.04, pose: 'handoff', fixture: 'cutoff' },
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
    flyover: { id: 'flyover', label: 'Near → cluster → texture flyover', durationMs: 9000, moving: true }
});

export const GRASS_LAB_DEFAULT_BUDGET = freezeDeep({
    resolution: '1920×1080',
    averageGpuMs: 1.5,
    averageCpuMs: 0.6,
    typicalDrawCallsMin: 4,
    typicalDrawCallsMax: 6,
    hardDrawCalls: 12,
    typicalTriangles: 200000,
    geometryBeyondCutoff: 0
});

export const GRASS_LAB_REQUIRED_REGRESSIONS = freezeDeep([
    'near_carpet_readability',
    'physical_height',
    'hard_substrate_boundary',
    'straight_sidewalk_cut',
    'corner_sidewalk_cut',
    'tree_accents',
    'top_down_behavior',
    'grazing_behavior',
    'transition_continuity',
    'deterministic_reload',
    'camera_motion_stability'
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
        clusterEndMeters: preset.clusterRadiusMeters
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
        enabled: preset.clusterGeometry,
        clusterCardsPerPatch: preset.clusterCardsPerPatch,
        region: { ...(next.lod2?.region ?? {}), innerMeters: preset.nearRadiusMeters, outerMeters: preset.clusterRadiusMeters },
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
        wornEnabled: true,
        clustersPerTree: preset.clustersPerTree
    };
    return next;
}

export function evaluateGrassLabBudget(samples, budget = GRASS_LAB_DEFAULT_BUDGET) {
    const list = (Array.isArray(samples) ? samples : [samples]).filter((sample) => sample && typeof sample === 'object');
    const cpuValues = list.map((sample) => sample?.grass?.updateCpuMs);
    const gpuValues = list.map((sample) => sample?.frame?.gpuMs);
    const drawValues = list.map((sample) => sample?.grass?.logicalDrawCalls);
    const triangleValues = list.map((sample) => sample?.grass?.triangles);
    const cutoffValues = list.map((sample) => sample?.lod?.geometryBeyondCutoff);
    const averageCpuMs = average(cpuValues);
    const averageGpuMs = average(gpuValues);
    const averageDrawCalls = average(drawValues);
    const maximumDrawCalls = maximum(drawValues);
    const averageTriangles = average(triangleValues);
    const maximumTriangles = maximum(triangleValues);
    const maximumGeometryBeyondCutoff = maximum(cutoffValues) ?? 0;
    const checks = {
        cpu: averageCpuMs !== null && averageCpuMs <= budget.averageCpuMs,
        gpu: averageGpuMs === null ? null : averageGpuMs <= budget.averageGpuMs,
        typicalDraws: averageDrawCalls !== null && averageDrawCalls <= budget.typicalDrawCallsMax,
        hardDrawCeiling: maximumDrawCalls !== null && maximumDrawCalls <= budget.hardDrawCalls,
        triangles: maximumTriangles !== null && maximumTriangles <= budget.typicalTriangles,
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
            maximumGeometryBeyondCutoff: round(maximumGeometryBeyondCutoff, 0)
        },
        checks,
        gpuTimingSupported: averageGpuMs !== null,
        structuralPass: checks.typicalDraws && checks.hardDrawCeiling && checks.triangles && checks.cutoff,
        timingPass: checks.cpu && checks.gpu !== false,
        pass: checks.cpu && checks.gpu !== false && checks.typicalDraws && checks.hardDrawCeiling && checks.triangles && checks.cutoff
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
