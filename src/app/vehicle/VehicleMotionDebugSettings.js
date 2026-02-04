// src/app/vehicle/VehicleMotionDebugSettings.js
// Persisted vehicle motion debug settings (overlay/logging + synthetic dt forcing).
// @ts-check

const STORAGE_KEY = 'bus_sim.vehicleMotionDebug.v1';

export const VEHICLE_MOTION_DEBUG_DEFAULTS = Object.freeze({
    enabled: false,
    overlay: true,
    logSpikes: false,
    logCameraCatchup: false,
    logCameraLag: false,
    logCameraEvents: false,
    logCameraTargetMismatch: false,
    logGate: {
        minScreenPx: 3
    },
    camera: {
        freeze: false
    },
    backStep: {
        minProjMeters: 0.05
    },
    cameraCatchup: {
        minDfwdMeters: 0.05,
        minCameraMoveMeters: 0.01,
        minCamBusDistDropMeters: 0.05
    },
    cameraLag: {
        minBusStepMeters: 0.2,
        maxCamStepRatio: 0.55
    },
    cameraTargetMismatch: {
        minAnchorMatrixErrMeters: 0.02
    },
    spike: {
        maxDistMeters: 0.9,
        maxYawDeg: 25,
        maxScreenPx: 18
    },
    syntheticDt: {
        enabled: false,
        pattern: 'off',
        mode: 'stall',
        stallMs: 34
    }
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizePattern(pattern) {
    const raw = typeof pattern === 'string' ? pattern.trim().toLowerCase() : '';
    if (!raw || raw === 'off' || raw === 'none') return 'off';
    if (raw === 'steady20' || raw === 'steady_20' || raw === '20') return 'steady20';
    if (raw === 'steady30' || raw === 'steady_30' || raw === '30') return 'steady30';
    if (raw === 'alt60_20' || raw === 'alt60-20' || raw === 'alt_60_20') return 'alt60_20';
    if (raw === 'alt60_30' || raw === 'alt60-30' || raw === 'alt_60_30') return 'alt60_30';
    if (raw === 'alt60_40' || raw === 'alt60-40' || raw === 'alt_60_40') return 'alt60_40';
    if (raw === 'spike20' || raw === 'spike_20') return 'spike20';
    return VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.pattern;
}

function sanitizeSyntheticMode(mode) {
    const raw = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    if (raw === 'stall' || raw === 'busywait' || raw === 'busy_wait') return 'stall';
    if (raw === 'dt' || raw === 'force_dt' || raw === 'forcedt') return 'dt';
    return VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.mode;
}

export function sanitizeVehicleMotionDebugSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const logGate = src.logGate && typeof src.logGate === 'object' ? src.logGate : {};
    const camera = src.camera && typeof src.camera === 'object' ? src.camera : {};
    const backStep = src.backStep && typeof src.backStep === 'object' ? src.backStep : {};
    const cameraCatchup = src.cameraCatchup && typeof src.cameraCatchup === 'object' ? src.cameraCatchup : {};
    const cameraLag = src.cameraLag && typeof src.cameraLag === 'object' ? src.cameraLag : {};
    const cameraTargetMismatch = src.cameraTargetMismatch && typeof src.cameraTargetMismatch === 'object' ? src.cameraTargetMismatch : {};
    const spike = src.spike && typeof src.spike === 'object' ? src.spike : {};
    const syntheticDt = src.syntheticDt && typeof src.syntheticDt === 'object' ? src.syntheticDt : {};

    return {
        enabled: src.enabled === true,
        overlay: src.overlay !== false,
        logSpikes: src.logSpikes === true,
        logCameraCatchup: src.logCameraCatchup === true,
        logCameraLag: src.logCameraLag === true,
        logCameraEvents: src.logCameraEvents === true,
        logCameraTargetMismatch: src.logCameraTargetMismatch === true,
        logGate: {
            minScreenPx: clamp(
                logGate.minScreenPx ?? VEHICLE_MOTION_DEBUG_DEFAULTS.logGate.minScreenPx,
                0,
                1000,
                VEHICLE_MOTION_DEBUG_DEFAULTS.logGate.minScreenPx
            )
        },
        camera: {
            freeze: camera.freeze === true
        },
        backStep: {
            minProjMeters: clamp(
                backStep.minProjMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.backStep.minProjMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.backStep.minProjMeters
            )
        },
        cameraCatchup: {
            minDfwdMeters: clamp(
                cameraCatchup.minDfwdMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minDfwdMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minDfwdMeters
            ),
            minCameraMoveMeters: clamp(
                cameraCatchup.minCameraMoveMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minCameraMoveMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minCameraMoveMeters
            ),
            minCamBusDistDropMeters: clamp(
                cameraCatchup.minCamBusDistDropMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minCamBusDistDropMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraCatchup.minCamBusDistDropMeters
            )
        },
        cameraLag: {
            minBusStepMeters: clamp(
                cameraLag.minBusStepMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraLag.minBusStepMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraLag.minBusStepMeters
            ),
            maxCamStepRatio: clamp(
                cameraLag.maxCamStepRatio ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraLag.maxCamStepRatio,
                0.0,
                1.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraLag.maxCamStepRatio
            )
        },
        cameraTargetMismatch: {
            minAnchorMatrixErrMeters: clamp(
                cameraTargetMismatch.minAnchorMatrixErrMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.cameraTargetMismatch.minAnchorMatrixErrMeters,
                0.0,
                5.0,
                VEHICLE_MOTION_DEBUG_DEFAULTS.cameraTargetMismatch.minAnchorMatrixErrMeters
            )
        },
        spike: {
            maxDistMeters: clamp(
                spike.maxDistMeters ?? VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxDistMeters,
                0.05,
                10,
                VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxDistMeters
            ),
            maxYawDeg: clamp(
                spike.maxYawDeg ?? VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxYawDeg,
                1,
                180,
                VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxYawDeg
            ),
            maxScreenPx: clamp(
                spike.maxScreenPx ?? VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxScreenPx,
                1,
                500,
                VEHICLE_MOTION_DEBUG_DEFAULTS.spike.maxScreenPx
            )
        },
        syntheticDt: {
            enabled: syntheticDt.enabled === true,
            pattern: sanitizePattern(syntheticDt.pattern ?? VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.pattern),
            mode: sanitizeSyntheticMode(syntheticDt.mode ?? VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.mode),
            stallMs: Math.round(clamp(
                syntheticDt.stallMs ?? VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.stallMs,
                0,
                200,
                VEHICLE_MOTION_DEBUG_DEFAULTS.syntheticDt.stallMs
            ))
        }
    };
}

export function loadSavedVehicleMotionDebugSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeVehicleMotionDebugSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveVehicleMotionDebugSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeVehicleMotionDebugSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedVehicleMotionDebugSettings() {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function getResolvedVehicleMotionDebugSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedVehicleMotionDebugSettings();
    const merged = sanitizeVehicleMotionDebugSettings({ ...VEHICLE_MOTION_DEBUG_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('vehicleDebug')) {
            const raw = String(params.get('vehicleDebug') ?? '').trim().toLowerCase();
            merged.enabled = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugOverlay')) {
            const raw = String(params.get('vehicleDebugOverlay') ?? '').trim().toLowerCase();
            merged.overlay = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLog')) {
            const raw = String(params.get('vehicleDebugLog') ?? '').trim().toLowerCase();
            merged.logSpikes = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLogCatchup')) {
            const raw = String(params.get('vehicleDebugLogCatchup') ?? '').trim().toLowerCase();
            merged.logCameraCatchup = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLogLag')) {
            const raw = String(params.get('vehicleDebugLogLag') ?? '').trim().toLowerCase();
            merged.logCameraLag = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLogCameraEvents')) {
            const raw = String(params.get('vehicleDebugLogCameraEvents') ?? '').trim().toLowerCase();
            merged.logCameraEvents = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLogTargetMismatch')) {
            const raw = String(params.get('vehicleDebugLogTargetMismatch') ?? '').trim().toLowerCase();
            merged.logCameraTargetMismatch = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugLogMinScreenPx')) {
            merged.logGate.minScreenPx = clamp(params.get('vehicleDebugLogMinScreenPx'), 0, 1000, merged.logGate.minScreenPx);
        }
        if (params.has('freezeCamera')) {
            const raw = String(params.get('freezeCamera') ?? '').trim().toLowerCase();
            merged.camera.freeze = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleDebugBackstep')) {
            merged.backStep.minProjMeters = clamp(params.get('vehicleDebugBackstep'), 0.0, 5.0, merged.backStep.minProjMeters);
        }
        if (params.has('vehicleDebugCatchupDfwd')) {
            merged.cameraCatchup.minDfwdMeters = clamp(params.get('vehicleDebugCatchupDfwd'), 0.0, 5.0, merged.cameraCatchup.minDfwdMeters);
        }
        if (params.has('vehicleDebugCatchupCamMove')) {
            merged.cameraCatchup.minCameraMoveMeters = clamp(params.get('vehicleDebugCatchupCamMove'), 0.0, 5.0, merged.cameraCatchup.minCameraMoveMeters);
        }
        if (params.has('vehicleDebugCatchupDistDrop')) {
            merged.cameraCatchup.minCamBusDistDropMeters = clamp(params.get('vehicleDebugCatchupDistDrop'), 0.0, 5.0, merged.cameraCatchup.minCamBusDistDropMeters);
        }
        if (params.has('vehicleDebugLagBusStep')) {
            merged.cameraLag.minBusStepMeters = clamp(params.get('vehicleDebugLagBusStep'), 0.0, 5.0, merged.cameraLag.minBusStepMeters);
        }
        if (params.has('vehicleDebugLagRatio')) {
            merged.cameraLag.maxCamStepRatio = clamp(params.get('vehicleDebugLagRatio'), 0.0, 1.0, merged.cameraLag.maxCamStepRatio);
        }
        if (params.has('vehicleDebugTargetMatrixErr')) {
            merged.cameraTargetMismatch.minAnchorMatrixErrMeters = clamp(
                params.get('vehicleDebugTargetMatrixErr'),
                0.0,
                5.0,
                merged.cameraTargetMismatch.minAnchorMatrixErrMeters
            );
        }
        if (params.has('vehicleDebugMaxDist')) {
            merged.spike.maxDistMeters = clamp(params.get('vehicleDebugMaxDist'), 0.05, 10, merged.spike.maxDistMeters);
        }
        if (params.has('vehicleDebugMaxYaw')) {
            merged.spike.maxYawDeg = clamp(params.get('vehicleDebugMaxYaw'), 1, 180, merged.spike.maxYawDeg);
        }
        if (params.has('syntheticDt')) {
            merged.syntheticDt.pattern = sanitizePattern(params.get('syntheticDt'));
            merged.syntheticDt.enabled = merged.syntheticDt.pattern !== 'off';
        }
        if (params.has('syntheticDtMode')) {
            merged.syntheticDt.mode = sanitizeSyntheticMode(params.get('syntheticDtMode'));
        }
        if (params.has('syntheticDtStallMs')) {
            merged.syntheticDt.stallMs = Math.round(clamp(params.get('syntheticDtStallMs'), 0, 200, merged.syntheticDt.stallMs));
        }
    }

    return merged;
}

export function getDefaultResolvedVehicleMotionDebugSettings() {
    return sanitizeVehicleMotionDebugSettings(VEHICLE_MOTION_DEBUG_DEFAULTS);
}
