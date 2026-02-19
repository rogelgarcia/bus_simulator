// Shared constants for the texture correction pipeline tool.
export const TOOL_ID = 'texture_correction_pipeline';
export const TOOL_ENTRY = 'tools/texture_correction_pipeline/run.mjs';
export const CORRECTION_CONFIG_FILE = 'pbr.material.correction.config.js';

export const CORRECTION_CONFIG_SCHEMA = 'bus_sim.pbr_material_correction';
export const CORRECTION_CONFIG_VERSION = 1;
export const CORRECTION_PRESET_BASELINE = 'aces';

export const RUN_REPORT_SCHEMA = 'bus_sim.texture_correction_pipeline_report';
export const RUN_REPORT_VERSION = 1;

export const KNOWN_MAP_KEYS = Object.freeze([
    'baseColor',
    'normal',
    'orm',
    'ao',
    'roughness',
    'metalness',
    'displacement'
]);

