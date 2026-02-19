// Deterministic reference profiles for map/render QA scoring by preset + class.
import { CORRECTION_PRESET_BASELINE } from '../constants.mjs';

const DEFAULT_REFERENCE = Object.freeze({
    avgLab: Object.freeze([56.0, 2.0, 8.0]),
    meanLuminance: 0.34,
    rmsContrast: 0.19,
    localContrast: 0.085,
    gradientEnergy: 0.042,
    laplacianVariance: 0.022,
    targetSaturation: 0.34,
    tolerances: Object.freeze({
        deltaE2000: 8.0,
        luminance: 0.13,
        rmsContrast: 0.11,
        localContrast: 0.065,
        gradientEnergy: 0.035,
        laplacianVariance: 0.03,
        clipping: 0.03
    })
});

const CLASS_REFERENCE_ACES = Object.freeze({
    asphalt: Object.freeze({
        avgLab: Object.freeze([42.0, 0.0, 2.0]),
        meanLuminance: 0.19,
        rmsContrast: 0.16,
        localContrast: 0.07,
        gradientEnergy: 0.034,
        laplacianVariance: 0.016,
        targetSaturation: 0.14
    }),
    brick: Object.freeze({
        avgLab: Object.freeze([52.0, 14.0, 16.0]),
        meanLuminance: 0.3,
        rmsContrast: 0.2,
        localContrast: 0.09,
        gradientEnergy: 0.048,
        laplacianVariance: 0.025,
        targetSaturation: 0.38
    }),
    concrete: Object.freeze({
        avgLab: Object.freeze([57.0, 0.0, 3.0]),
        meanLuminance: 0.33,
        rmsContrast: 0.18,
        localContrast: 0.08,
        gradientEnergy: 0.04,
        laplacianVariance: 0.021,
        targetSaturation: 0.2
    }),
    grass: Object.freeze({
        avgLab: Object.freeze([58.0, -15.0, 24.0]),
        meanLuminance: 0.36,
        rmsContrast: 0.21,
        localContrast: 0.1,
        gradientEnergy: 0.052,
        laplacianVariance: 0.026,
        targetSaturation: 0.45
    }),
    ground: Object.freeze({
        avgLab: Object.freeze([49.0, -3.0, 15.0]),
        meanLuminance: 0.28,
        rmsContrast: 0.2,
        localContrast: 0.09,
        gradientEnergy: 0.047,
        laplacianVariance: 0.024,
        targetSaturation: 0.33
    }),
    metal: Object.freeze({
        avgLab: Object.freeze([55.0, 1.0, 6.0]),
        meanLuminance: 0.34,
        rmsContrast: 0.17,
        localContrast: 0.08,
        gradientEnergy: 0.039,
        laplacianVariance: 0.02,
        targetSaturation: 0.18
    }),
    pavers: Object.freeze({
        avgLab: Object.freeze([53.0, 6.0, 10.0]),
        meanLuminance: 0.31,
        rmsContrast: 0.19,
        localContrast: 0.085,
        gradientEnergy: 0.043,
        laplacianVariance: 0.023,
        targetSaturation: 0.3
    }),
    plaster_stucco: Object.freeze({
        avgLab: Object.freeze([65.0, 1.0, 8.0]),
        meanLuminance: 0.42,
        rmsContrast: 0.15,
        localContrast: 0.07,
        gradientEnergy: 0.031,
        laplacianVariance: 0.017,
        targetSaturation: 0.22
    }),
    roof_tiles: Object.freeze({
        avgLab: Object.freeze([51.0, 10.0, 18.0]),
        meanLuminance: 0.3,
        rmsContrast: 0.2,
        localContrast: 0.09,
        gradientEnergy: 0.046,
        laplacianVariance: 0.024,
        targetSaturation: 0.36
    }),
    stone: Object.freeze({
        avgLab: Object.freeze([50.0, 2.0, 10.0]),
        meanLuminance: 0.29,
        rmsContrast: 0.21,
        localContrast: 0.095,
        gradientEnergy: 0.051,
        laplacianVariance: 0.028,
        targetSaturation: 0.28
    })
});

const REFERENCE_BY_PRESET = Object.freeze({
    [CORRECTION_PRESET_BASELINE]: CLASS_REFERENCE_ACES
});

function mergeReference(base, override) {
    return Object.freeze({
        ...base,
        ...(override ?? {}),
        tolerances: Object.freeze({
            ...(base.tolerances ?? {}),
            ...((override?.tolerances && typeof override.tolerances === 'object') ? override.tolerances : {})
        })
    });
}

export function getMaterialReferenceProfile({ presetId, classId }) {
    const presetKey = typeof presetId === 'string' && presetId.trim() ? presetId.trim() : CORRECTION_PRESET_BASELINE;
    const classKey = typeof classId === 'string' ? classId.trim() : '';
    const classTable = REFERENCE_BY_PRESET[presetKey] ?? REFERENCE_BY_PRESET[CORRECTION_PRESET_BASELINE] ?? {};
    const specific = classTable[classKey] ?? null;
    return mergeReference(DEFAULT_REFERENCE, specific);
}

export function getMapExpectedColorSpace(mapKey) {
    const key = typeof mapKey === 'string' ? mapKey.trim() : '';
    if (key === 'baseColor') return 'srgb';
    return 'linear';
}

