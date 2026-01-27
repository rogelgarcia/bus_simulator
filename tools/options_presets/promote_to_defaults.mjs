// tools/options_presets/promote_to_defaults.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseOptionsPresetJson } from '../../src/graphics/gui/options/OptionsPreset.js';

const ROOT = process.cwd();

function parseArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    const out = { input: null, write: false, only: null };
    for (const raw of args) {
        const v = String(raw ?? '');
        if (!v) continue;
        if (v === '--write' || v === '--apply') {
            out.write = true;
            continue;
        }
        if (v.startsWith('--only=')) {
            const list = v.slice('--only='.length);
            out.only = list.split(',').map((s) => s.trim()).filter(Boolean);
            continue;
        }
        if (v.startsWith('-')) continue;
        if (!out.input) out.input = v;
    }
    return out;
}

function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (Object.is(n, -0)) return '0';
    return String(n);
}

function formatBool(value) {
    return value ? 'true' : 'false';
}

function formatString(value) {
    const s = typeof value === 'string' ? value : '';
    return JSON.stringify(s);
}

function formatHexColor(value) {
    const n = Number(value);
    const v = Number.isFinite(n) ? (Number(n) >>> 0) & 0xffffff : 0;
    return `0x${v.toString(16).padStart(6, '0')}`;
}

function buildDefaultsBlock(constName, bodyLines) {
    const lines = [];
    lines.push(`export const ${constName} = Object.freeze({`);
    for (const line of bodyLines) lines.push(line);
    lines.push('});');
    return lines.join('\n');
}

function buildLightingDefaults(settings) {
    const s = settings ?? {};
    const ibl = s.ibl ?? {};
    return buildDefaultsBlock('LIGHTING_DEFAULTS', [
        `    exposure: ${formatNumber(s.exposure)},`,
        `    hemiIntensity: ${formatNumber(s.hemiIntensity)},`,
        `    sunIntensity: ${formatNumber(s.sunIntensity)},`,
        '    ibl: {',
        `        enabled: ${formatBool(ibl.enabled)},`,
        `        envMapIntensity: ${formatNumber(ibl.envMapIntensity)},`,
        `        setBackground: ${formatBool(ibl.setBackground)}`,
        '    }'
    ]);
}

function buildBloomDefaults(settings) {
    const s = settings ?? {};
    return buildDefaultsBlock('BLOOM_DEFAULTS', [
        `    enabled: ${formatBool(s.enabled)},`,
        `    strength: ${formatNumber(s.strength)},`,
        `    radius: ${formatNumber(s.radius)},`,
        `    threshold: ${formatNumber(s.threshold)}`
    ]);
}

function buildColorGradingDefaults(settings) {
    const s = settings ?? {};
    return buildDefaultsBlock('COLOR_GRADING_DEFAULTS', [
        `    preset: ${formatString(s.preset)},`,
        `    intensity: ${formatNumber(s.intensity)}`
    ]);
}

function buildSunFlareDefaults(settings) {
    const s = settings ?? {};
    const c = s.components ?? {};
    const lines = [];
    lines.push('    enabled: ' + formatBool(s.enabled) + ',');
    lines.push('    preset: ' + formatString(s.preset) + ',');
    lines.push('    strength: ' + formatNumber(s.strength) + ',');
    lines.push('    components: Object.freeze({');
    lines.push(`        core: ${formatBool(c.core)},`);
    lines.push(`        halo: ${formatBool(c.halo)},`);
    lines.push(`        starburst: ${formatBool(c.starburst)},`);
    lines.push(`        ghosting: ${formatBool(c.ghosting)}`);
    lines.push('    })');
    return buildDefaultsBlock('SUN_FLARE_DEFAULTS', lines);
}

function buildBuildingWindowVisualsDefaults(settings) {
    const s = settings ?? {};
    const reflective = s.reflective ?? {};
    const glass = reflective.glass ?? {};
    const lines = [];
    lines.push('    reflective: Object.freeze({');
    lines.push(`        enabled: ${formatBool(reflective.enabled)},`);
    lines.push('        glass: Object.freeze({');
    lines.push(`            colorHex: ${formatHexColor(glass.colorHex)},`);
    lines.push(`            metalness: ${formatNumber(glass.metalness)},`);
    lines.push(`            roughness: ${formatNumber(glass.roughness)},`);
    lines.push(`            transmission: ${formatNumber(glass.transmission)},`);
    lines.push(`            ior: ${formatNumber(glass.ior)},`);
    lines.push(`            envMapIntensity: ${formatNumber(glass.envMapIntensity)}`);
    lines.push('        })');
    lines.push('    })');
    return buildDefaultsBlock('BUILDING_WINDOW_VISUALS_DEFAULTS', lines);
}

function buildAsphaltNoiseDefaults(settings) {
    const s = settings ?? {};
    const coarse = s.coarse ?? {};
    const fine = s.fine ?? {};
    const markings = s.markings ?? {};
    const color = s.color ?? {};
    const livedIn = s.livedIn ?? {};
    const edgeDirt = livedIn.edgeDirt ?? {};
    const cracks = livedIn.cracks ?? {};
    const patches = livedIn.patches ?? {};
    const tireWear = livedIn.tireWear ?? {};

    const lines = [];
    lines.push('    coarse: Object.freeze({');
    lines.push(`        albedo: ${formatBool(coarse.albedo)},`);
    lines.push(`        roughness: ${formatBool(coarse.roughness)},`);
    lines.push(`        scale: ${formatNumber(coarse.scale)},`);
    lines.push(`        colorStrength: ${formatNumber(coarse.colorStrength)},`);
    lines.push(`        dirtyStrength: ${formatNumber(coarse.dirtyStrength)},`);
    lines.push(`        roughnessStrength: ${formatNumber(coarse.roughnessStrength)}`);
    lines.push('    }),');
    lines.push('    fine: Object.freeze({');
    lines.push(`        albedo: ${formatBool(fine.albedo)},`);
    lines.push(`        roughness: ${formatBool(fine.roughness)},`);
    lines.push(`        normal: ${formatBool(fine.normal)},`);
    lines.push(`        scale: ${formatNumber(fine.scale)},`);
    lines.push(`        colorStrength: ${formatNumber(fine.colorStrength)},`);
    lines.push(`        dirtyStrength: ${formatNumber(fine.dirtyStrength)},`);
    lines.push(`        roughnessStrength: ${formatNumber(fine.roughnessStrength)},`);
    lines.push(`        normalStrength: ${formatNumber(fine.normalStrength)}`);
    lines.push('    }),');
    lines.push('    markings: Object.freeze({');
    lines.push(`        enabled: ${formatBool(markings.enabled)},`);
    lines.push(`        colorStrength: ${formatNumber(markings.colorStrength)},`);
    lines.push(`        roughnessStrength: ${formatNumber(markings.roughnessStrength)},`);
    lines.push(`        debug: ${formatBool(markings.debug)}`);
    lines.push('    }),');
    lines.push('    color: Object.freeze({');
    lines.push(`        value: ${formatNumber(color.value)},`);
    lines.push(`        warmCool: ${formatNumber(color.warmCool)},`);
    lines.push(`        saturation: ${formatNumber(color.saturation)}`);
    lines.push('    }),');
    lines.push('    livedIn: Object.freeze({');
    lines.push('        edgeDirt: Object.freeze({');
    lines.push(`            enabled: ${formatBool(edgeDirt.enabled)},`);
    lines.push(`            strength: ${formatNumber(edgeDirt.strength)},`);
    lines.push(`            width: ${formatNumber(edgeDirt.width)},`);
    lines.push(`            scale: ${formatNumber(edgeDirt.scale)}`);
    lines.push('        }),');
    lines.push('        cracks: Object.freeze({');
    lines.push(`            enabled: ${formatBool(cracks.enabled)},`);
    lines.push(`            strength: ${formatNumber(cracks.strength)},`);
    lines.push(`            scale: ${formatNumber(cracks.scale)}`);
    lines.push('        }),');
    lines.push('        patches: Object.freeze({');
    lines.push(`            enabled: ${formatBool(patches.enabled)},`);
    lines.push(`            strength: ${formatNumber(patches.strength)},`);
    lines.push(`            scale: ${formatNumber(patches.scale)},`);
    lines.push(`            coverage: ${formatNumber(patches.coverage)}`);
    lines.push('        }),');
    lines.push('        tireWear: Object.freeze({');
    lines.push(`            enabled: ${formatBool(tireWear.enabled)},`);
    lines.push(`            strength: ${formatNumber(tireWear.strength)},`);
    lines.push(`            scale: ${formatNumber(tireWear.scale)}`);
    lines.push('        })');
    lines.push('    })');

    return buildDefaultsBlock('ASPHALT_NOISE_DEFAULTS', lines);
}

function findFrozenConstRange(source, constName) {
    const marker = `export const ${constName} = Object.freeze(`;
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const open = source.indexOf('(', start + marker.length - 1);
    if (open < 0) return null;

    let depth = 0;
    let i = open;
    let quote = null;
    let escaped = false;

    for (; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\\\') {
                escaped = true;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }

        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            continue;
        }

        if (ch === '(') depth++;
        if (ch === ')') {
            depth--;
            if (depth === 0) {
                i++;
                break;
            }
        }
    }

    if (depth !== 0) return null;

    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] === ';') i++;

    return { start, end: i };
}

async function updateFileConst({ filePath, constName, replacement, write }) {
    const abs = path.resolve(ROOT, filePath);
    const src = await fs.readFile(abs, 'utf8');
    const range = findFrozenConstRange(src, constName);
    if (!range) throw new Error(`Failed to find ${constName} in ${filePath}`);
    const next = src.slice(0, range.start) + replacement + src.slice(range.end);
    const changed = next !== src;
    if (write && changed) await fs.writeFile(abs, next, 'utf8');
    return { changed };
}

function normalizeGroupList(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const normalized = list.map((s) => String(s ?? '').trim()).filter(Boolean);
    return normalized.length ? normalized : null;
}

function selectGroups(only) {
    const allow = normalizeGroupList(only);
    if (!allow) return new Set(['lighting', 'bloom', 'colorGrading', 'sunFlare', 'buildingWindowVisuals', 'asphaltNoise']);
    return new Set(allow);
}

async function main() {
    const { input, write, only } = parseArgs(process.argv.slice(2));
    if (!input) {
        console.error('Usage: node tools/options_presets/promote_to_defaults.mjs <preset.json> [--write] [--only=lighting,bloom,...]');
        process.exitCode = 2;
        return;
    }

    const raw = await fs.readFile(path.resolve(ROOT, input), 'utf8');
    const preset = parseOptionsPresetJson(raw);
    const groups = selectGroups(only);
    const settings = preset.settings ?? {};

    const steps = [
        groups.has('lighting') && {
            filePath: 'src/graphics/lighting/LightingSettings.js',
            constName: 'LIGHTING_DEFAULTS',
            replacement: buildLightingDefaults(settings.lighting)
        },
        groups.has('bloom') && {
            filePath: 'src/graphics/visuals/postprocessing/BloomSettings.js',
            constName: 'BLOOM_DEFAULTS',
            replacement: buildBloomDefaults(settings.bloom)
        },
        groups.has('colorGrading') && {
            filePath: 'src/graphics/visuals/postprocessing/ColorGradingSettings.js',
            constName: 'COLOR_GRADING_DEFAULTS',
            replacement: buildColorGradingDefaults(settings.colorGrading)
        },
        groups.has('sunFlare') && {
            filePath: 'src/graphics/visuals/sun/SunFlareSettings.js',
            constName: 'SUN_FLARE_DEFAULTS',
            replacement: buildSunFlareDefaults(settings.sunFlare)
        },
        groups.has('buildingWindowVisuals') && {
            filePath: 'src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js',
            constName: 'BUILDING_WINDOW_VISUALS_DEFAULTS',
            replacement: buildBuildingWindowVisualsDefaults(settings.buildingWindowVisuals)
        },
        groups.has('asphaltNoise') && {
            filePath: 'src/graphics/visuals/city/AsphaltNoiseSettings.js',
            constName: 'ASPHALT_NOISE_DEFAULTS',
            replacement: buildAsphaltNoiseDefaults(settings.asphaltNoise)
        }
    ].filter(Boolean);

    if (!write) {
        for (const step of steps) {
            process.stdout.write(`\n--- ${step.filePath} (${step.constName}) ---\n`);
            process.stdout.write(step.replacement + '\n');
        }
        process.stdout.write('\n(dry-run) Add --write to apply changes.\n');
        return;
    }

    let changedCount = 0;
    for (const step of steps) {
        const res = await updateFileConst({ ...step, write: true });
        if (res.changed) changedCount++;
    }

    process.stdout.write(`Updated ${changedCount}/${steps.length} defaults blocks.\n`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});

