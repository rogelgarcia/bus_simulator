// Declares fail-closed static-sun package and atomic replacement memory limits.
// @ts-check

import { ILLUMINATION_MAX_PACKAGE_BYTES } from '../../../app/illumination/package/IlluminationPackageConstants.js';

const MIB = 1024 * 1024;

export const STATIC_SUN_DEPTH_RUNTIME_DEFAULTS = Object.freeze({
    maximumPackageBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
    memoryLimits: Object.freeze({
        cpuBytes: 512 * MIB,
        gpuBytes: 512 * MIB,
        peakCpuBytes: 1536 * MIB,
        peakGpuBytes: 1024 * MIB
    })
});
