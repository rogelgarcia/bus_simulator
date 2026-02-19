// CLI argument parser for the texture correction pipeline tool.
import { CORRECTION_PRESET_BASELINE } from './constants.mjs';
import { parseCsvList } from './utils.mjs';

export function createUsageText() {
    return [
        'Usage:',
        '  node tools/texture_correction_pipeline/run.mjs [options]',
        '',
        'Options:',
        `  --preset=<id>                Calibration preset id (default: ${CORRECTION_PRESET_BASELINE})`,
        '  --profile=<path>             Optional custom profile module path',
        '  --class=<id,id,...>          Filter by classId list',
        '  --material=<id,id,...>       Filter by materialId list',
        '  --plugins=<id,id,...>        Only run these plugins (global allow list)',
        '  --skip-plugins=<id,id,...>   Disable these plugins for this run',
        '  --analysis=<mode>            Analysis mode: none | map | full (default: none)',
        '  --capture-output=<path>      Capture artifact root (default under tools/.../artifacts/captures)',
        '  --dry-run                    Do not write correction configs',
        '  --write                      Force write correction configs',
        '  --report=<path>              Output JSON artifact path',
        '  --fail-on-error              Exit with code 1 if any error occurs',
        '  --help                       Show this message'
    ].join('\n');
}

export function parseCliArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    const out = {
        presetId: CORRECTION_PRESET_BASELINE,
        profilePath: null,
        includeClassIds: [],
        includeMaterialIds: [],
        runEnabledPlugins: [],
        runSkippedPlugins: [],
        analysisMode: 'none',
        captureOutputRoot: 'tools/texture_correction_pipeline/artifacts/captures',
        write: true,
        reportPath: null,
        failOnError: false,
        help: false
    };

    for (const rawArg of args) {
        const arg = String(rawArg ?? '').trim();
        if (!arg) continue;
        if (arg === '--help' || arg === '-h') {
            out.help = true;
            continue;
        }
        if (arg === '--dry-run') {
            out.write = false;
            continue;
        }
        if (arg === '--write') {
            out.write = true;
            continue;
        }
        if (arg === '--fail-on-error') {
            out.failOnError = true;
            continue;
        }
        if (arg.startsWith('--preset=')) {
            const presetId = arg.slice('--preset='.length).trim();
            if (presetId) out.presetId = presetId;
            continue;
        }
        if (arg.startsWith('--profile=')) {
            const profilePath = arg.slice('--profile='.length).trim();
            out.profilePath = profilePath || null;
            continue;
        }
        if (arg.startsWith('--class=')) {
            out.includeClassIds = parseCsvList(arg.slice('--class='.length));
            continue;
        }
        if (arg.startsWith('--material=')) {
            out.includeMaterialIds = parseCsvList(arg.slice('--material='.length));
            continue;
        }
        if (arg.startsWith('--plugins=')) {
            out.runEnabledPlugins = parseCsvList(arg.slice('--plugins='.length));
            continue;
        }
        if (arg.startsWith('--skip-plugins=')) {
            out.runSkippedPlugins = parseCsvList(arg.slice('--skip-plugins='.length));
            continue;
        }
        if (arg.startsWith('--analysis=')) {
            const rawMode = arg.slice('--analysis='.length).trim().toLowerCase();
            if (rawMode === 'map' || rawMode === 'full' || rawMode === 'none') out.analysisMode = rawMode;
            continue;
        }
        if (arg.startsWith('--capture-output=')) {
            const raw = arg.slice('--capture-output='.length).trim();
            out.captureOutputRoot = raw || out.captureOutputRoot;
            continue;
        }
        if (arg.startsWith('--report=')) {
            const reportPath = arg.slice('--report='.length).trim();
            out.reportPath = reportPath || null;
            continue;
        }
    }

    return out;
}
