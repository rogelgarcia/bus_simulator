// Captures deterministic native-resolution Grass Lab evidence and metadata.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
    evaluateGrassPerformanceMeasurement,
    GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
    GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS,
    GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
    GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
    GRASS_LAB_V2_REQUIRED_REGRESSIONS
} from '../../src/app/grass/GrassLabValidationContract.js';
import {
    GRASS_AUTO_LOD_DEFAULTS,
    GRASS_AUTO_LOD_FORCE
} from '../../src/app/grass/GrassAutoLodContract.js';
import { GRASS_MID_CLUSTER_DEFAULTS } from '../../src/graphics/engine3d/grass/GrassMidClusterConfig.js';
import {
    LOW_CUT_GRASS_ASSET_FAMILY,
    LOW_CUT_GRASS_ATLAS_ROLE,
    LOW_CUT_GRASS_MATERIAL_ID
} from '../../src/graphics/content3d/catalogs/LowCutGrassMaterialCatalog.js';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, '../..');
const DEFAULT_OUTPUT = 'tests/artifacts/screens/grass/ai358';
const DEFAULT_BOUNDARY_OUTPUT = 'tests/artifacts/screens/grass/ai359';
const DEFAULT_NEAR_OUTPUT = 'tests/artifacts/screens/grass/ai360';
const DEFAULT_LOD_OUTPUT = 'tests/artifacts/screens/grass/ai361';
const DEFAULT_VALIDATION_OUTPUT = 'tests/artifacts/screens/grass/ai362';
const AI362_BASELINE_MANIFEST = 'tests/artifacts/screens/grass/ai361/capture_manifest.json';
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const V2_ASSET_URL_PREFIX = '/assets/public/pbr/grass_low_cut_maintained_v2/';
const WIDTH = 3840;
const HEIGHT = 2160;
const MATERIAL_MATRIX = 'material';
const BOUNDARY_MATRIX = 'ai359-boundary';
const NEAR_MATRIX = 'ai360-near';
const LOD_MATRIX = 'ai361-lod';
const VALIDATION_MATRIX = 'ai362-validation';
const LOD_PERFORMANCE_DEFER_OWNER = 'AI537';
const AI362_PERFORMANCE_OWNERSHIP = 'deferred_to_ai537';
const PERFORMANCE_WARMUP_FRAMES = 120;
const PERFORMANCE_WARMUP_MS = 1000;
const PERFORMANCE_STABLE_UPLOAD_FRAMES = 30;
const PERFORMANCE_SAMPLE_FRAMES = 120;
const PERFORMANCE_MINIMUM_GPU_SAMPLES = 30;
const TURF_ROI = Object.freeze({ x: 0.2, y: 0.55, width: 0.6, height: 0.35 });
export const CARD_BAND_ROI = Object.freeze({ x: 0.05, y: 0.35, width: 0.9, height: 0.08 });
export const CARD_BAND_GATE_CONTRACT = Object.freeze({
    geometryToTextureRatio: 0.7,
    minimumLuminanceDelta: 0.06,
    smoothingRows: 3,
    maximumDarkenedFraction: 0.1
});
const NEUTRAL_PAIR_DEFINITIONS = Object.freeze([
    Object.freeze({ lighting: 'daylight', geometry: 'geometry_on_daylight', texture: 'texture_only_daylight' }),
    Object.freeze({ lighting: 'overcast', geometry: 'geometry_on_overcast', texture: 'texture_only_overcast' })
]);

function isHierarchyCaptureMatrix(matrix) {
    return matrix === LOD_MATRIX || matrix === VALIDATION_MATRIX;
}

export function parseArgs(argv) {
    const options = {
        phase: null,
        matrix: MATERIAL_MATRIX,
        output: DEFAULT_OUTPUT,
        baseUrl: process.env.GRASS_LAB_BASE_URL || DEFAULT_BASE_URL,
        v2AssetRoot: process.env.GRASS_LAB_V2_ASSET_ROOT || null,
        executablePath: process.env.E2E_BROWSER_EXECUTABLE || null,
        headed: false,
        overwrite: false,
        inspectBoundary: false,
        measurementsOnly: false,
        outputProvided: false,
        recipeIds: null,
        deferPerformanceTo: null
    };
    for (const arg of argv) {
        if (arg === '--headed') options.headed = true;
        else if (arg === '--overwrite') options.overwrite = true;
        else if (arg === '--inspect-boundary') options.inspectBoundary = true;
        else if (arg === '--measurements-only') options.measurementsOnly = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else if (arg.startsWith('--phase=')) options.phase = arg.slice('--phase='.length).trim();
        else if (arg.startsWith('--matrix=')) options.matrix = arg.slice('--matrix='.length).trim();
        else if (arg.startsWith('--output=')) {
            options.output = arg.slice('--output='.length).trim();
            options.outputProvided = true;
        }
        else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length).trim();
        else if (arg.startsWith('--v2-asset-root=')) options.v2AssetRoot = arg.slice('--v2-asset-root='.length).trim();
        else if (arg.startsWith('--browser-executable=')) options.executablePath = arg.slice('--browser-executable='.length).trim();
        else if (arg.startsWith('--defer-performance-to=')) {
            options.deferPerformanceTo = arg.slice('--defer-performance-to='.length).trim();
        }
        else if (arg.startsWith('--recipes=')) {
            options.recipeIds = arg.slice('--recipes='.length).split(',').map((value) => value.trim()).filter(Boolean);
        }
        else throw new Error(`[GrassLabCapture] Unknown argument: ${arg}`);
    }
    if (options.help) return options;
    if (options.inspectBoundary) options.matrix = BOUNDARY_MATRIX;
    if (!options.inspectBoundary && options.phase !== 'before' && options.phase !== 'after') {
        throw new Error('[GrassLabCapture] --phase=before or --phase=after is required.');
    }
    if (![MATERIAL_MATRIX, BOUNDARY_MATRIX, NEAR_MATRIX, LOD_MATRIX, VALIDATION_MATRIX].includes(options.matrix)) {
        throw new Error(`[GrassLabCapture] --matrix must be ${MATERIAL_MATRIX}, ${BOUNDARY_MATRIX}, ${NEAR_MATRIX}, ${LOD_MATRIX}, or ${VALIDATION_MATRIX}.`);
    }
    if (options.matrix === BOUNDARY_MATRIX && !options.outputProvided) options.output = DEFAULT_BOUNDARY_OUTPUT;
    if (options.matrix === NEAR_MATRIX && !options.outputProvided) options.output = DEFAULT_NEAR_OUTPUT;
    if (options.matrix === LOD_MATRIX && !options.outputProvided) options.output = DEFAULT_LOD_OUTPUT;
    if (options.matrix === VALIDATION_MATRIX && !options.outputProvided) options.output = DEFAULT_VALIDATION_OUTPUT;
    if (options.matrix === VALIDATION_MATRIX && options.phase !== 'after') {
        throw new Error('[GrassLabCapture] --matrix=ai362-validation requires --phase=after.');
    }
    if (options.measurementsOnly) {
        if (options.inspectBoundary) {
            throw new Error('[GrassLabCapture] --measurements-only cannot be combined with --inspect-boundary.');
        }
        if (options.matrix !== VALIDATION_MATRIX || options.phase !== 'after') {
            throw new Error('[GrassLabCapture] --measurements-only requires --matrix=ai362-validation --phase=after.');
        }
        if (options.recipeIds) {
            throw new Error('[GrassLabCapture] --measurements-only cannot be combined with --recipes.');
        }
        if (options.overwrite) {
            throw new Error('[GrassLabCapture] --measurements-only cannot be combined with --overwrite.');
        }
    }
    if (options.deferPerformanceTo !== null) {
        if (options.deferPerformanceTo !== LOD_PERFORMANCE_DEFER_OWNER) {
            throw new Error('[GrassLabCapture] --defer-performance-to must be exactly AI537.');
        }
        if (options.matrix !== LOD_MATRIX || options.phase !== 'after') {
            throw new Error('[GrassLabCapture] --defer-performance-to=AI537 is valid only for --matrix=ai361-lod --phase=after.');
        }
    }
    if (!options.output) throw new Error('[GrassLabCapture] --output must not be empty.');
    if (!options.baseUrl) throw new Error('[GrassLabCapture] --base-url must not be empty.');
    if (options.recipeIds && options.recipeIds.length === 0) throw new Error('[GrassLabCapture] --recipes must name at least one recipe.');
    return options;
}

function usage() {
    return [
        'Grass Lab native-4K evidence capture',
        '',
        'Usage:',
        '  node tools/grass_lab_capture/run.mjs --phase=before',
        '  node tools/grass_lab_capture/run.mjs --phase=after',
        '  node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai359-boundary',
        '  node tools/grass_lab_capture/run.mjs --phase=before --matrix=ai360-near',
        '  node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai360-near',
        '  node tools/grass_lab_capture/run.mjs --phase=before --matrix=ai361-lod',
        '  node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai361-lod',
        '  node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai362-validation',
        '  node tools/grass_lab_capture/run.mjs --phase=after --matrix=ai362-validation --measurements-only',
        '  node tools/grass_lab_capture/run.mjs --inspect-boundary',
        '',
        'Options:',
        `  --output=${DEFAULT_OUTPUT}`,
        `  --matrix=${MATERIAL_MATRIX}|${BOUNDARY_MATRIX}|${NEAR_MATRIX}|${LOD_MATRIX}|${VALIDATION_MATRIX}`,
        `  --base-url=${DEFAULT_BASE_URL}`,
        '  --v2-asset-root=<repository-relative staging directory>',
        '  --browser-executable=<path>',
        '  --recipes=<comma-separated recipe ids>',
        '  --measurements-only  Reverify all AI362 PNGs and refresh timing/gates without recapturing',
        '  --defer-performance-to=AI537  Defer only the AI361 AFTER timing verdict while retaining measured failure evidence',
        '  --headed',
        '  --inspect-boundary  Print the live V2 boundary snapshot/topology without writing captures',
        '  --overwrite'
    ].join('\n');
}

function resolveOutputRoot(relativePath) {
    const absolute = path.resolve(REPO_ROOT, relativePath);
    const relative = path.relative(REPO_ROOT, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('[GrassLabCapture] Output must be a repository-relative subdirectory.');
    }
    return absolute;
}

export function resolveV2AssetRoot(relativePath) {
    if (!relativePath) return null;
    const absolute = path.resolve(REPO_ROOT, relativePath);
    const relative = path.relative(REPO_ROOT, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('[GrassLabCapture] V2 asset override must be a repository-relative subdirectory.');
    }
    return absolute;
}

async function installV2AssetOverride(page, relativePath) {
    const root = resolveV2AssetRoot(relativePath);
    if (!root) return null;
    await access(root);
    await page.route(`**${V2_ASSET_URL_PREFIX}**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const relative = decodeURIComponent(pathname.slice(V2_ASSET_URL_PREFIX.length));
        const filePath = path.resolve(root, relative);
        if (!relative || relative.includes('/') || relative.includes('\\') || path.dirname(filePath) !== root) {
            await route.abort('blockedbyclient');
            return;
        }
        if (relative === 'pbr.material.correction.config.js' && !(await pathExists(filePath))) {
            await route.continue();
            return;
        }
        const body = await readFile(filePath);
        const contentType = path.extname(filePath).toLowerCase() === '.json'
            ? 'application/json; charset=utf-8'
            : 'image/png';
        await route.fulfill({ status: 200, contentType, body });
    });
    return path.relative(REPO_ROOT, root).replaceAll('\\', '/');
}

function isOptionalCorrectionConfig(url) {
    try {
        return new URL(url).pathname.endsWith('/pbr.material.correction.config.js');
    } catch {
        return false;
    }
}

async function pathExists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function fetchHealth(baseUrl) {
    try {
        const response = await fetch(new URL('/__health', baseUrl), { signal: AbortSignal.timeout(1500) });
        return response.ok;
    } catch {
        return false;
    }
}

async function ensureStaticServer(baseUrl) {
    if (await fetchHealth(baseUrl)) return null;
    const url = new URL(baseUrl);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        throw new Error(`[GrassLabCapture] Base URL is unavailable: ${baseUrl}`);
    }
    const server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            HOST: url.hostname,
            PORT: url.port || '4173'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let serverError = '';
    server.stderr.on('data', (chunk) => {
        serverError += String(chunk);
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(`[GrassLabCapture] Static server exited early. ${serverError.trim()}`);
        }
        if (await fetchHealth(baseUrl)) return server;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    server.kill('SIGTERM');
    throw new Error(`[GrassLabCapture] Static server did not become ready. ${serverError.trim()}`);
}

export function buildCaptureRecipes() {
    return Object.freeze([
        Object.freeze({ id: 'material_daylight', role: 'material_fixture', quality: 'default', lighting: 'daylight', material: true, grazing: false }),
        Object.freeze({ id: 'material_overcast', role: 'material_fixture', quality: 'default', lighting: 'overcast', material: true, grazing: false }),
        Object.freeze({ id: 'material_golden', role: 'material_fixture', quality: 'default', lighting: 'golden', material: true, grazing: true }),
        Object.freeze({ id: 'material_night', role: 'material_fixture', quality: 'default', lighting: 'night', material: true, grazing: false }),
        Object.freeze({ id: 'close_geometry_daylight', role: 'geometry_on_close', quality: 'default', lighting: 'daylight', camera: 'height_030' }),
        Object.freeze({ id: 'geometry_on_daylight', role: 'geometry_on_neutral_pair', quality: 'default', lighting: 'daylight', camera: 'height_050' }),
        Object.freeze({ id: 'geometry_on_overcast', role: 'geometry_on_grazing', quality: 'default', lighting: 'overcast', camera: 'height_050' }),
        Object.freeze({ id: 'texture_only_daylight', role: 'texture_only', quality: 'low', lighting: 'daylight', camera: 'height_050' }),
        Object.freeze({ id: 'texture_only_overcast', role: 'texture_only_neutral_pair', quality: 'low', lighting: 'overcast', camera: 'height_050' }),
        Object.freeze({ id: 'near_handoff_golden', role: 'handoff', quality: 'default', lighting: 'golden', camera: 'near_handoff' }),
        Object.freeze({ id: 'far_texture_night', role: 'far', quality: 'default', lighting: 'night', camera: 'far_texture' })
    ]);
}

export function buildBoundaryCaptureRecipes() {
    const poses = [
        { id: 'straight_030', target: 'straight', heightMeters: 0.30 },
        { id: 'straight_050', target: 'straight', heightMeters: 0.50 },
        { id: 'straight_100', target: 'straight', heightMeters: 1.00 },
        { id: 'straight_zoom', target: 'straight', heightMeters: 0.40, distanceMeters: 1.25 },
        { id: 'curve', target: 'curve', heightMeters: 0.50 },
        { id: 'diagonal', target: 'diagonal', heightMeters: 0.50 },
        { id: 'inside_corner', target: 'inside_corner', heightMeters: 0.50 },
        { id: 'outside_corner', target: 'outside_corner', heightMeters: 0.50 },
        { id: 'tree_base', target: 'tree_base', heightMeters: 0.50 }
    ];
    const recipes = [];
    for (const pose of poses) {
        for (const evidenceMode of ['substrate_only', 'boundary_final']) {
            recipes.push(Object.freeze({
                id: `${evidenceMode}_${pose.id}`,
                pairId: pose.id,
                role: evidenceMode,
                quality: 'low',
                lighting: 'daylight',
                boundaryTarget: pose.target,
                heightMeters: pose.heightMeters,
                ...(pose.distanceMeters ? { distanceMeters: pose.distanceMeters } : {}),
                evidenceMode
            }));
        }
    }
    return Object.freeze(recipes);
}

export function buildNearCaptureRecipes() {
    const poses = [
        { id: 'height_030', camera: 'height_030' },
        { id: 'height_050', camera: 'height_050' },
        { id: 'height_100', camera: 'height_100' },
        { id: 'grazing', camera: 'near_grazing' },
        { id: 'forward', camera: 'near_forward' },
        { id: 'oblique', camera: 'near_oblique' },
        { id: 'top_down', camera: 'top_down' },
        { id: 'physical_cut_side_profile', boundaryTarget: 'straight', heightMeters: 0.30, distanceMeters: 1.25 },
        { id: 'bus_scale', camera: 'gameplay_bus' }
    ];
    const recipes = [];
    for (const pose of poses) {
        for (const nearEvidenceMode of ['texture_only', 'near_mesh']) {
            recipes.push(Object.freeze({
                ...pose,
                id: `${nearEvidenceMode}_${pose.id}`,
                pairId: pose.id,
                role: nearEvidenceMode,
                quality: 'default',
                lighting: 'daylight',
                nearEvidenceMode
            }));
        }
    }
    return Object.freeze(recipes);
}

function buildLodBaselineRecipes() {
    return [
        { id: 'close_billboard_handoff', role: 'handoff', handoffId: 'close_billboard', handoffOffsetMeters: 0, camera: 'height_050' },
        { id: 'billboard_middle_handoff', role: 'handoff', handoffId: 'billboard_middle', handoffOffsetMeters: 0, camera: 'near_handoff' },
        { id: 'middle_texture_handoff', role: 'handoff', handoffId: 'middle_texture', handoffOffsetMeters: 0, camera: 'cluster_handoff' },
        { id: 'tree_accent', role: 'tree', accentTarget: 'tree' },
        { id: 'far_turf', role: 'far', camera: 'far_texture' },
        { id: 'grazing', role: 'grazing', camera: 'near_grazing' },
        { id: 'top_down', role: 'top_down', camera: 'top_down' },
        { id: 'bus_scale', role: 'bus', camera: 'gameplay_bus' },
        { id: 'physical_cut', role: 'physical_cut', boundaryTarget: 'straight', heightMeters: 0.30, distanceMeters: 1.25 },
        { id: 'cutoff', role: 'cutoff', handoffId: 'middle_texture', handoffOffsetMeters: 0.5, camera: 'cluster_handoff' },
        { id: 'flyover_0000', role: 'motion_transition', camera: 'near_handoff', motionPath: 'flyover', motionElapsedMs: 0, motionProgress: 0, motionCheckpoint: 'start' },
        { id: 'flyover_2250', role: 'motion_transition', camera: 'near_handoff', motionPath: 'flyover', motionElapsedMs: 2250, motionProgress: 0.25, motionCheckpoint: 'quarter' },
        { id: 'flyover_4500', role: 'motion_transition', camera: 'near_handoff', motionPath: 'flyover', motionElapsedMs: 4500, motionProgress: 0.5, motionCheckpoint: 'middle' },
        { id: 'flyover_6750', role: 'motion_transition', camera: 'near_handoff', motionPath: 'flyover', motionElapsedMs: 6750, motionProgress: 0.75, motionCheckpoint: 'three_quarters' },
        { id: 'flyover_8900', role: 'motion_transition', camera: 'near_handoff', motionPath: 'flyover', motionElapsedMs: 8900, motionProgress: 0.988889, motionCheckpoint: 'end' }
    ];
}

function inverseSmoothstep01(value) {
    const target = Math.max(0, Math.min(1, Number(value) || 0));
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 32; iteration += 1) {
        const middle = (low + high) * 0.5;
        const sample = middle * middle * (3 - 2 * middle);
        if (sample < target) low = middle;
        else high = middle;
    }
    return Math.round((low + high) * 500000) / 1000000;
}

function motionProgressForDistance(route, distanceMeters) {
    const forwardProgress = inverseSmoothstep01((Number(distanceMeters) - 2) / 28);
    return route === 'reverse'
        ? Math.round((1 - forwardProgress) * 1000000) / 1000000
        : forwardProgress;
}

function buildLodApprovalRecipes() {
    const handoffs = [
        { id: 'close_billboard', distanceMeters: 3, camera: 'height_050' },
        { id: 'billboard_middle', distanceMeters: 8, camera: 'near_handoff' },
        { id: 'middle_texture', distanceMeters: 25, camera: 'cluster_handoff' }
    ];
    const recipes = [];
    for (const handoff of handoffs) {
        for (const mode of ['auto', 'texture_only']) {
            recipes.push({
                id: `handoff_pair_${handoff.id}_${mode}`,
                pairId: `handoff_${handoff.id}`,
                evidenceGroup: 'handoff_pair',
                role: 'handoff_pair',
                hierarchyEvidenceMode: mode,
                handoffId: handoff.id,
                handoffOffsetMeters: 0,
                camera: handoff.camera
            });
        }
    }
    recipes.push(
        { id: 'tree_accent', evidenceGroup: 'special_still', role: 'tree', hierarchyEvidenceMode: 'auto', accentTarget: 'tree' },
        { id: 'far_turf', evidenceGroup: 'special_still', role: 'far', hierarchyEvidenceMode: 'auto', camera: 'far_texture' },
        { id: 'grazing', evidenceGroup: 'special_still', role: 'grazing', hierarchyEvidenceMode: 'auto', camera: 'near_grazing' },
        { id: 'top_down', evidenceGroup: 'special_still', role: 'top_down', hierarchyEvidenceMode: 'auto', camera: 'top_down' },
        { id: 'bus_scale', evidenceGroup: 'special_still', role: 'bus', hierarchyEvidenceMode: 'auto', camera: 'gameplay_bus' },
        {
            id: 'physical_cut',
            evidenceGroup: 'special_still',
            role: 'physical_cut',
            hierarchyEvidenceMode: 'auto',
            boundaryTarget: 'straight',
            heightMeters: 0.30,
            distanceMeters: 1.25
        },
        {
            id: 'cutoff',
            evidenceGroup: 'special_still',
            role: 'cutoff',
            hierarchyEvidenceMode: 'auto',
            handoffId: 'middle_texture',
            handoffOffsetMeters: 0.5,
            camera: 'cluster_handoff'
        }
    );
    const lightRoles = [
        { id: 'texture', hierarchyEvidenceMode: 'texture_only', camera: 'far_texture' },
        {
            id: 'close',
            hierarchyEvidenceMode: 'close',
            handoffId: 'close_billboard',
            handoffOffsetMeters: -1,
            camera: 'height_050'
        },
        {
            id: 'billboard',
            hierarchyEvidenceMode: 'billboard',
            handoffId: 'billboard_middle',
            handoffOffsetMeters: -1,
            camera: 'near_handoff'
        },
        {
            id: 'middle',
            hierarchyEvidenceMode: 'middle',
            handoffId: 'middle_texture',
            handoffOffsetMeters: -1,
            camera: 'cluster_handoff'
        },
        { id: 'accent', hierarchyEvidenceMode: 'accent', accentTarget: 'tree' }
    ];
    for (const lighting of ['daylight', 'overcast', 'golden', 'night']) {
        for (const lightRole of lightRoles) {
            recipes.push({
                ...lightRole,
                id: `light_${lighting}_${lightRole.id}`,
                evidenceGroup: 'four_light_matrix',
                lightRole: lightRole.id,
                role: 'lighting_matrix',
                lighting
            });
        }
    }
    const checkpoints = [
        { id: 'pre', offsetMeters: -1 },
        { id: 'center', offsetMeters: 0 },
        { id: 'post', offsetMeters: 1 }
    ];
    for (const route of ['forward', 'reverse']) {
        for (const handoff of handoffs) {
            for (const checkpoint of checkpoints) {
                const progress = motionProgressForDistance(
                    route,
                    handoff.distanceMeters + checkpoint.offsetMeters
                );
                recipes.push({
                    id: `${route}_${handoff.id}_${checkpoint.id}`,
                    evidenceGroup: 'handoff_motion',
                    role: 'motion_transition',
                    hierarchyEvidenceMode: 'auto',
                    handoffId: handoff.id,
                    handoffOffsetMeters: checkpoint.offsetMeters,
                    camera: handoff.camera,
                    motionPath: route,
                    motionElapsedMs: Math.round(progress * 9000),
                    motionProgress: progress,
                    motionCheckpoint: checkpoint.id
                });
            }
        }
    }
    for (const checkpoint of [
        { id: 'start', progress: 0 },
        { id: 'middle', progress: 0.5 },
        { id: 'end', progress: 1 }
    ]) {
        recipes.push({
            id: `strafe_${checkpoint.id}`,
            evidenceGroup: 'strafe_motion',
            role: 'motion_transition',
            hierarchyEvidenceMode: 'auto',
            camera: 'near_handoff',
            motionPath: 'strafe',
            motionElapsedMs: Math.round(checkpoint.progress * 6000),
            motionProgress: checkpoint.progress,
            motionCheckpoint: checkpoint.id
        });
    }
    for (const [index, progress] of [0, 0.2, 0.4, 0.6, 0.8, 1].entries()) {
        recipes.push({
            id: `flyover_${String(Math.round(progress * 9000)).padStart(4, '0')}`,
            evidenceGroup: 'flyover_motion',
            role: 'motion_transition',
            hierarchyEvidenceMode: 'auto',
            camera: 'near_handoff',
            motionPath: 'flyover',
            motionElapsedMs: Math.round(progress * 9000),
            motionProgress: progress,
            motionCheckpoint: ['start', 'one_fifth', 'two_fifths', 'three_fifths', 'four_fifths', 'end'][index]
        });
    }
    return recipes;
}

export function buildLodCaptureRecipes(phase = 'after') {
    const recipes = phase === 'before' ? buildLodBaselineRecipes() : buildLodApprovalRecipes();
    return Object.freeze(recipes.map((recipe) => Object.freeze({
        matrix: LOD_MATRIX,
        quality: 'default',
        lighting: 'daylight',
        ...recipe
    })));
}

function ai362EvidenceIdsForRecipe(recipe) {
    const ids = new Set(['complete_state_metadata']);
    if (recipe.captureVariant === 'clean') ids.add('clean_ui_free_visuals');
    if (recipe.captureVariant === 'diagnostic_overlay') ids.add('diagnostic_overlay_frames');
    if (recipe.baselineRecipeId) ids.add('matched_before_after_pairs');
    if (recipe.validationRole === 'general_view' && recipe.accentTarget === 'tree') ids.add('tree_base');
    if (recipe.validationRole === 'boundary_view') {
        const boundaryEvidenceId = {
            straight: 'straight_sidewalk',
            curve: 'curved_sidewalk',
            diagonal: 'diagonal_cut',
            inside_corner: 'inside_corner',
            outside_corner: 'outside_corner',
            irregular: 'irregular_cut',
            low_side: 'low_side_profile',
            substrate: 'exposed_substrate',
            tree_substrate: 'tree_substrate'
        }[recipe.boundaryView];
        if (boundaryEvidenceId) ids.add(boundaryEvidenceId);
    }
    if (recipe.fallbackMode === 'low_quality') ids.add('texture_only_fallback');
    if (recipe.fallbackMode === 'geometry_disabled') ids.add('geometry_disabled_fallback');
    if (recipe.validationRole === 'lighting_critical') {
        const role = recipe.lightingCriticalRole === 'edge' ? 'boundary' : recipe.lightingCriticalRole;
        ids.add(`${recipe.lighting}_${role}`);
    }
    if (recipe.stationaryHandoff) ids.add('stationary_all_handoffs');
    if (recipe.motionPath) ids.add(`${recipe.motionPath}_all_handoffs`);
    return [...ids].sort();
}

export function buildAi362ValidationRecipes() {
    const staticDefinitions = [
        ...[
            ['030', 0.30],
            ['050', 0.50],
            ['100', 1.00],
            ['150', 1.50],
            ['200', 2.00],
            ['300', 3.00],
            ['500', 5.00]
        ].map(([id, heightInspectionMeters]) => ({
            id: `height_${id}`,
            validationRole: 'height_inspection',
            camera: `height_${id}`,
            heightInspectionMeters
        })),
        ...[
            ['grazing', 'near_grazing', 'grazing'],
            ['forward', 'near_forward', null],
            ['oblique', 'near_oblique', null],
            ['top_down', 'top_down', 'top_down'],
            ['bus', 'gameplay_bus', 'bus_scale'],
            ['far', 'far_texture', 'far_turf']
        ].map(([id, camera, baselineRecipeId]) => ({
            id: `view_${id}`,
            validationRole: 'general_view',
            camera,
            baselineRecipeId
        })),
        {
            id: 'view_tree',
            validationRole: 'general_view',
            accentTarget: 'tree',
            baselineRecipeId: 'tree_accent'
        },
        ...[
            { id: 'straight', boundaryTarget: 'straight', heightMeters: 0.50 },
            { id: 'curve', boundaryTarget: 'curve', heightMeters: 0.50 },
            { id: 'diagonal', boundaryTarget: 'diagonal', heightMeters: 0.50 },
            { id: 'inside_corner', boundaryTarget: 'inside_corner', heightMeters: 0.50 },
            { id: 'outside_corner', boundaryTarget: 'outside_corner', heightMeters: 0.50 },
            { id: 'irregular', boundaryTarget: 'diagonal', heightMeters: 0.50 },
            {
                id: 'low_side',
                boundaryTarget: 'straight',
                heightMeters: 0.30,
                distanceMeters: 1.25,
                baselineRecipeId: 'physical_cut'
            },
            {
                id: 'substrate',
                boundaryTarget: 'straight',
                heightMeters: 0.50,
                distanceMeters: 1.25,
                evidenceMode: 'substrate_only'
            },
            {
                id: 'tree_substrate',
                boundaryTarget: 'tree_base',
                heightMeters: 0.50
            }
        ].map((definition) => ({
            ...definition,
            id: `boundary_${definition.id}`,
            validationRole: 'boundary_view',
            boundaryView: definition.id
        })),
        ...['daylight', 'overcast', 'golden', 'night'].flatMap((lighting) => ([
            {
                id: `lighting_${lighting}_material`,
                validationRole: 'lighting_critical',
                lightingCriticalRole: 'material',
                camera: 'height_050',
                lighting
            },
            {
                id: `lighting_${lighting}_edge`,
                validationRole: 'lighting_critical',
                lightingCriticalRole: 'edge',
                boundaryTarget: 'straight',
                heightMeters: 0.30,
                distanceMeters: 1.25,
                lighting
            },
            {
                id: `lighting_${lighting}_handoff`,
                validationRole: 'lighting_critical',
                lightingCriticalRole: 'handoff',
                handoffId: 'billboard_middle',
                handoffOffsetMeters: 0,
                camera: 'near_handoff',
                lighting
            }
        ])),
        {
            id: 'fallback_low',
            validationRole: 'fallback',
            fallbackMode: 'low_quality',
            quality: 'low',
            camera: 'height_150'
        },
        {
            id: 'fallback_geometry_disabled',
            validationRole: 'fallback',
            fallbackMode: 'geometry_disabled',
            hierarchyEvidenceMode: 'texture_only',
            camera: 'height_150'
        },
        ...[
            ['close_billboard', 'height_050'],
            ['billboard_middle', 'near_handoff'],
            ['middle_texture', 'cluster_handoff']
        ].map(([handoffId, camera]) => ({
            id: `stationary_${handoffId}`,
            validationRole: 'handoff_stationary',
            handoffId,
            handoffOffsetMeters: 0,
            camera,
            stationaryHandoff: true,
            baselineRecipeId: `handoff_pair_${handoffId}_auto`
        }))
    ];
    const staticRecipes = staticDefinitions.flatMap((definition) => {
        const pairId = `ai362_${definition.id}`;
        const baselineRecipeId = definition.baselineRecipeId ?? null;
        return [
            {
                ...definition,
                id: `clean_${definition.id}`,
                baselineRecipeId,
                pairId,
                evidenceGroup: 'ai362_static_pair',
                role: definition.validationRole,
                captureVariant: 'clean',
                diagnosticOverlay: false
            },
            {
                ...definition,
                id: `diagnostic_${definition.id}`,
                baselineRecipeId: null,
                pairId,
                evidenceGroup: 'ai362_static_pair',
                role: definition.validationRole,
                captureVariant: 'diagnostic_overlay',
                diagnosticOverlay: true
            }
        ];
    });
    const stationaryRepeatRecipes = staticDefinitions
        .filter((definition) => definition.stationaryHandoff === true)
        .map((definition) => ({
            ...definition,
            id: `repeat_${definition.id}`,
            baselineRecipeId: null,
            pairId: null,
            evidenceGroup: 'ai362_deterministic_repeat',
            role: definition.validationRole,
            captureVariant: 'clean_repeat',
            diagnosticOverlay: false,
            repeatOfRecipeId: `clean_${definition.id}`
        }));
    const motionRecipes = buildLodApprovalRecipes()
        .filter((recipe) => recipe.motionPath)
        .map((recipe) => ({
            ...recipe,
            id: `motion_${recipe.id}`,
            baselineRecipeId: recipe.id,
            evidenceGroup: 'ai362_handoff_motion',
            validationRole: 'handoff_motion',
            captureVariant: 'clean',
            diagnosticOverlay: false
        }));
    const repeatedMotionIds = new Set([
        'motion_forward_billboard_middle_center',
        'motion_reverse_billboard_middle_center',
        'motion_strafe_middle',
        'motion_flyover_3600'
    ]);
    const motionRepeatRecipes = motionRecipes
        .filter((recipe) => repeatedMotionIds.has(recipe.id))
        .map((recipe) => ({
            ...recipe,
            id: `repeat_${recipe.id}`,
            baselineRecipeId: null,
            evidenceGroup: 'ai362_deterministic_repeat',
            captureVariant: 'clean_repeat',
            repeatOfRecipeId: recipe.id
        }));
    return Object.freeze([
        ...staticRecipes,
        ...stationaryRepeatRecipes,
        ...motionRecipes,
        ...motionRepeatRecipes
    ].map((recipe) => Object.freeze({
        matrix: VALIDATION_MATRIX,
        quality: 'default',
        lighting: 'daylight',
        hierarchyEvidenceMode: 'auto',
        ...recipe,
        evidenceIds: ai362EvidenceIdsForRecipe(recipe),
        approvalDiagnosticSource: recipe.id === 'diagnostic_height_150'
    })));
}

export function evaluateLodHandoffAppearancePairs(captures, pngByRecipe) {
    const expected = buildLodCaptureRecipes('after')
        .filter((recipe) => recipe.evidenceGroup === 'handoff_pair');
    const pairIds = [...new Set(expected.map((recipe) => recipe.pairId))];
    const entries = Array.isArray(captures) ? captures : [];
    const pairs = pairIds.map((pairId) => {
        const pairRecipes = expected.filter((recipe) => recipe.pairId === pairId);
        const autoRecipe = pairRecipes.find((recipe) => recipe.hierarchyEvidenceMode === 'auto');
        const textureRecipe = pairRecipes.find((recipe) => recipe.hierarchyEvidenceMode === 'texture_only');
        const auto = entries.find((entry) => entry?.recipeId === autoRecipe?.id) ?? null;
        const texture = entries.find((entry) => entry?.recipeId === textureRecipe?.id) ?? null;
        const autoPng = captureBuffer(pngByRecipe, autoRecipe?.id);
        const texturePng = captureBuffer(pngByRecipe, textureRecipe?.id);
        const cameraMatch = !!auto && !!texture && captureCameraSignature(auto) === captureCameraSignature(texture);
        const lightingMatch = !!auto && !!texture && auto.lightingPreset === texture.lightingPreset;
        const exposureMatch = !!auto && !!texture && Number(auto.exposure) === Number(texture.exposure);
        let measurement = null;
        if (Buffer.isBuffer(autoPng) && Buffer.isBuffer(texturePng)) {
            measurement = measureCardBandPair(autoPng, texturePng);
        }
        return {
            pairId,
            autoRecipeId: autoRecipe?.id ?? null,
            textureRecipeId: textureRecipe?.id ?? null,
            cameraMatch,
            lightingMatch,
            exposureMatch,
            measurement,
            pass: cameraMatch && lightingMatch && exposureMatch && measurement?.pass === true
        };
    });
    return {
        gateId: 'grass-lod-handoff-appearance-v1',
        maximumAllowedDarkenedFraction: CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction,
        pairs,
        pass: pairs.length === 3 && pairs.every((pair) => pair.pass)
    };
}

export function evaluateLodPerformanceCostGate(costSamples, phase, matrix = LOD_MATRIX) {
    const requiredSampleIds = [
        'quality_low',
        'quality_default',
        'quality_high',
        'default_worst_view',
        'default_transition_overlap'
    ];
    const matrixEntries = (Array.isArray(costSamples) ? costSamples : [])
        .filter((entry) => entry?.matrix === matrix && entry?.phase === phase);
    const entries = matrixEntries.filter((entry) => requiredSampleIds.includes(entry?.sampleId));
    const checks = requiredSampleIds.map((sampleId) => {
        const matches = entries.filter((entry) => entry?.sampleId === sampleId);
        const entry = matches.length === 1 ? matches[0] : null;
        const gpuTimingSupported = entry?.performanceGate?.gpuTimingSupported;
        const gpuUnavailableReasonRecorded = gpuTimingSupported === false
            && entry?.performanceGate?.checks?.gpuUnavailableReason === true;
        return {
            sampleId,
            captureCount: matches.length,
            statistic: entry?.statistic ?? null,
            resolution: entry?.resolution ?? null,
            cpuMeanMs: entry?.grassCpuMs ?? null,
            gpuMeanMs: entry?.wholeFrameGpuMs ?? null,
            gpuTimingSupported: gpuTimingSupported ?? null,
            gpuUnavailableReasonRecorded,
            performanceMeasured: Number.isFinite(entry?.grassCpuMs)
                && (Number.isFinite(entry?.wholeFrameGpuMs) || gpuUnavailableReasonRecorded),
            performancePass: entry?.performanceGate?.pass === true,
            structuralPass: entry?.budget?.structuralPass === true,
            accentCostRecorded: Number.isFinite(entry?.accentTriangles)
                && Number.isFinite(entry?.accentLogicalDrawCalls),
            combinedBudgetPass: entry?.budget?.pass === true,
            pass: matches.length === 1
                && entry?.statistic === 'arithmetic_mean'
                && (matrix !== VALIDATION_MATRIX || entry?.resolution === '1920x1080')
                && Number.isFinite(entry?.grassCpuMs)
                && (Number.isFinite(entry?.wholeFrameGpuMs) || gpuUnavailableReasonRecorded)
                && (gpuTimingSupported === true || (matrix === VALIDATION_MATRIX && gpuUnavailableReasonRecorded))
                && entry?.performanceGate?.pass === true
                && entry?.budget?.structuralPass === true
                && (matrix !== VALIDATION_MATRIX || (
                    Number.isFinite(entry?.accentTriangles)
                    && Number.isFinite(entry?.accentLogicalDrawCalls)
                ))
        };
    });
    const unexpectedSampleIds = matrixEntries
        .filter((entry) => entry?.resolution === '1920x1080' && !requiredSampleIds.includes(entry?.sampleId))
        .map((entry) => entry?.sampleId ?? null);
    const evidenceComplete = entries.length === requiredSampleIds.length
        && unexpectedSampleIds.length === 0
        && checks.every((check) => (
            check.captureCount === 1
            && check.statistic === 'arithmetic_mean'
            && (matrix !== VALIDATION_MATRIX || check.resolution === '1920x1080')
            && check.performanceMeasured
            && (check.gpuTimingSupported === true || (matrix === VALIDATION_MATRIX && check.gpuUnavailableReasonRecorded))
            && (matrix !== VALIDATION_MATRIX || check.accentCostRecorded)
        ));
    const structuralPass = evidenceComplete && checks.every((check) => check.structuralPass);
    const performancePass = evidenceComplete && checks.every((check) => check.performancePass);
    return {
        gateId: 'grass-lod-performance-cost-v1',
        phase,
        matrix,
        requiredResolution: '1920x1080',
        unexpectedSampleIds,
        requiredSampleIds,
        checks,
        evidenceComplete,
        structuralPass,
        performancePass,
        pass: evidenceComplete && structuralPass && performancePass
    };
}

export function evaluateLodCaptureSet(captures, phase, appearanceGate = null, performanceGate = null, options = null) {
    const deferredOwner = String(options?.deferPerformanceTo ?? '').trim();
    const performanceDeferred = phase === 'after' && deferredOwner === LOD_PERFORMANCE_DEFER_OWNER;
    const performanceOwnership = phase === 'after'
        ? (performanceDeferred
            ? { status: 'deferred', owner: LOD_PERFORMANCE_DEFER_OWNER }
            : { status: 'required', owner: 'AI361' })
        : { status: 'not_applicable', owner: null };
    const performanceRequired = phase === 'after' && !performanceDeferred;
    const expectedRecipes = buildLodCaptureRecipes(phase);
    const expectedIds = expectedRecipes.map((recipe) => recipe.id);
    const expectedById = new Map(expectedRecipes.map((recipe) => [recipe.id, recipe]));
    const entries = Array.isArray(captures) ? captures : [];
    const counts = new Map();
    for (const entry of entries) counts.set(entry?.recipeId, (counts.get(entry?.recipeId) ?? 0) + 1);
    const missingRecipeIds = expectedIds.filter((id) => counts.get(id) !== 1);
    const unexpectedRecipeIds = [...counts.keys()].filter((id) => !expectedIds.includes(id));
    const checks = entries.map((entry) => {
        const cost = entry?.cost ?? {};
        const expected = expectedById.get(entry?.recipeId) ?? null;
        const geometryBeyondCutoff = cost.geometryBeyondCutoff;
        const isMotion = !!entry?.motionPath;
        return {
            recipeId: entry?.recipeId ?? null,
            matrixMatches: entry?.matrix === LOD_MATRIX,
            phaseMatches: entry?.phase === phase,
            native4kPng: entry?.png?.width === WIDTH && entry?.png?.height === HEIGHT,
            materialV2: entry?.materialVersion === 'v2',
            cameraRecorded: !!entry?.camera?.position && !!entry?.camera?.target,
            qualityMatches: !!expected && entry?.qualityPreset === expected.quality,
            lightingMatches: !!expected && entry?.lightingPreset === expected.lighting,
            recipeMetadataMatches: !!expected && (
                phase !== 'after'
                || (
                    (entry?.pairId ?? null) === (expected.pairId ?? null)
                    && (entry?.hierarchyEvidenceMode ?? null) === (expected.hierarchyEvidenceMode ?? null)
                    && (entry?.handoffId ?? null) === (expected.handoffId ?? null)
                    && (entry?.handoffOffsetMeters ?? null) === (expected.handoffOffsetMeters ?? null)
                    && (entry?.motionPath ?? null) === (expected.motionPath ?? null)
                    && (entry?.motionElapsedMs ?? null) === (expected.motionElapsedMs ?? null)
                    && (entry?.motionProgress ?? null) === (expected.motionProgress ?? null)
                )
            ),
            contentHashRecorded: phase !== 'after' || /^[a-f0-9]{64}$/.test(String(entry?.contentSha256 ?? '')),
            combinedTriangleBudget: Number(cost.combinedVisibleGrassTriangles) <= 200000,
            grassDrawBudget: Number(cost.grassLogicalDrawCalls) <= 12,
            boundaryDrawBudget: Number(cost.coverageLogicalDrawCalls) <= 2,
            combinedDrawBudget: Number(
                cost.combinedVisibleGrassLogicalDrawCalls
                ?? (Number(cost.grassLogicalDrawCalls) + Number(cost.coverageLogicalDrawCalls))
            ) <= 12,
            cutoffClean: Number.isFinite(geometryBeyondCutoff)
                && geometryBeyondCutoff === 0,
            motionMetadata: !isMotion || (
                ['forward', 'reverse', 'strafe', 'flyover'].includes(entry.motionPath)
                && Number.isFinite(Number(entry.motionElapsedMs))
                && Number.isFinite(Number(entry.motionProgress))
                && !!entry.motionCheckpoint
            ),
            deterministicAfterMotion: phase !== 'after' || !isMotion || entry.motionDeterministicSeek === true,
            hysteresisReset: phase !== 'after' || entry?.lodHysteresisReset === true
        };
    });
    const expectedMotionRecipes = expectedRecipes.filter((recipe) => recipe.motionPath);
    const motionEntries = entries.filter((entry) => entry?.motionPath);
    const expectedMotionCount = expectedMotionRecipes.length;
    const expectedMotionPathCounts = Object.fromEntries(
        [...new Set(expectedMotionRecipes.map((recipe) => recipe.motionPath))]
            .map((motionPath) => [
                motionPath,
                expectedMotionRecipes.filter((recipe) => recipe.motionPath === motionPath).length
            ])
    );
    const motionPathChecks = Object.entries(expectedMotionPathCounts).map(([motionPath, expectedCount]) => {
        const hashes = motionEntries
            .filter((entry) => entry.motionPath === motionPath && entry.contentSha256)
            .map((entry) => entry.contentSha256);
        return {
            motionPath,
            expectedCount,
            captureCount: motionEntries.filter((entry) => entry.motionPath === motionPath).length,
            hashCount: hashes.length,
            uniqueHashCount: new Set(hashes).size,
            pass: phase !== 'after'
                || (hashes.length === expectedCount && new Set(hashes).size === expectedCount)
        };
    });
    const uniqueMotionFrames = phase === 'after'
        ? motionEntries.length === expectedMotionCount && motionPathChecks.every((check) => check.pass)
        : true;
    const handoffPairIds = [...new Set(expectedRecipes
        .filter((recipe) => recipe.evidenceGroup === 'handoff_pair')
        .map((recipe) => recipe.pairId))];
    const handoffPairChecks = handoffPairIds.map((pairId) => {
        const expectedPair = expectedRecipes.filter((recipe) => recipe.pairId === pairId);
        const pair = expectedPair
            .map((recipe) => entries.find((entry) => entry?.recipeId === recipe.id) ?? null);
        const [auto, texture] = pair;
        const cameraMatch = !!auto && !!texture && captureCameraSignature(auto) === captureCameraSignature(texture);
        const lightingMatch = !!auto && !!texture && auto.lightingPreset === texture.lightingPreset;
        const exposureMatch = !!auto && !!texture && Number(auto.exposure) === Number(texture.exposure);
        return {
            pairId,
            cameraMatch,
            lightingMatch,
            exposureMatch,
            pass: cameraMatch && lightingMatch && exposureMatch
        };
    });
    const handoffPairsAligned = phase !== 'after' || handoffPairChecks.every((check) => check.pass);
    const handoffAppearancePass = phase !== 'after' || appearanceGate?.pass === true;
    const performanceCostPass = phase !== 'after' || performanceGate?.pass === true;
    const performanceEvidenceComplete = phase !== 'after' || performanceGate?.evidenceComplete === true;
    const performanceStructuralPass = phase !== 'after' || performanceGate?.structuralPass === true;
    const visualFunctionalPass = entries.length === expectedRecipes.length
        && missingRecipeIds.length === 0
        && unexpectedRecipeIds.length === 0
        && checks.every((entry) => Object.entries(entry).every(([key, value]) => key === 'recipeId' || value === true))
        && uniqueMotionFrames
        && handoffPairsAligned
        && handoffAppearancePass
        && performanceEvidenceComplete
        && performanceStructuralPass;
    const pass = visualFunctionalPass && (!performanceRequired || performanceCostPass);
    return {
        gateId: 'grass-lod-hierarchy-capture-v2',
        matrixScope: phase === 'before' ? 'representative_frozen_baseline' : 'complete_ai361_approval',
        requiredResolution: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        requiredMaterialVersion: 'v2',
        requiredStaticCaptures: expectedRecipes.length - expectedMotionCount,
        requiredMotionCaptures: expectedMotionCount,
        expectedRecipeIds: expectedIds,
        captureCount: entries.length,
        staticCaptureCount: entries.filter((entry) => !entry?.motionPath).length,
        motionCaptureCount: entries.filter((entry) => entry?.motionPath).length,
        missingRecipeIds,
        unexpectedRecipeIds,
        uniqueMotionFrames,
        motionPathChecks,
        handoffPairChecks,
        handoffPairsAligned,
        handoffAppearancePass,
        performanceCostPass,
        performanceRequired,
        performanceEvidenceComplete,
        performanceStructuralPass,
        performanceOwnership,
        visualFunctionalPass,
        appearanceGate,
        performanceGate,
        checks,
        pass
    };
}

function isFiniteVector3(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function hasNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export function hasCompleteAi362Native4kTimingEvidence(performanceGate) {
    const checks = performanceGate?.checks ?? {};
    return typeof performanceGate?.gpuTimingSupported === 'boolean'
        && checks.measurementComplete === true
        && checks.warmupFrames === true
        && checks.warmupDuration === true
        && checks.warmupStability === true
        && checks.cpuSampleCount === true
        && checks.frameSampleCount === true
        && checks.gpuSupportDocumented === true
        && checks.stationaryUploads === true
        && (performanceGate?.gpuTimingSupported === true
            ? checks.gpuSampleCount === true
                && checks.gpuSequenceIntegrity === true
                && checks.gpuTimerActive === true
                && checks.gpuDisjointFree === true
            : checks.gpuUnavailableReason === true);
}

export function evaluateAi362ValidationSet(captures, performanceGate = null, options = null) {
    const expectedRecipes = buildAi362ValidationRecipes();
    const expectedIds = expectedRecipes.map((recipe) => recipe.id);
    const expectedById = new Map(expectedRecipes.map((recipe) => [recipe.id, recipe]));
    const entries = Array.isArray(captures) ? captures : [];
    const counts = new Map();
    for (const entry of entries) counts.set(entry?.recipeId, (counts.get(entry?.recipeId) ?? 0) + 1);
    const missingRecipeIds = expectedIds.filter((id) => counts.get(id) !== 1);
    const unexpectedRecipeIds = [...counts.keys()].filter((id) => !expectedIds.includes(id));
    const checks = entries.map((entry) => {
        const expected = expectedById.get(entry?.recipeId) ?? null;
        const coverage = entry?.coverageDiagnostics ?? {};
        const near = entry?.nearDiagnostics ?? {};
        const field = entry?.hierarchyDiagnostics ?? {};
        const accent = entry?.accentDiagnostics ?? {};
        const lod = entry?.lodDiagnostics ?? {};
        const cost = entry?.cost ?? {};
        const material = entry?.materialDiagnostics ?? {};
        const boundarySignature = coverage.boundarySignature;
        const isMotion = !!expected?.motionPath;
        const expectedHeight = Number(expected?.heightInspectionMeters ?? expected?.heightMeters);
        const lowQualityFieldInapplicable = entry?.fallbackMode === 'low_quality'
            && entry?.qualityPreset === 'low'
            && field.enabled === false
            && [
                field.instances,
                field.triangles,
                field.drawCalls,
                field.billboard?.instances,
                field.billboard?.triangles,
                field.billboard?.drawCalls,
                field.middle?.instances,
                field.middle?.triangles,
                field.middle?.drawCalls
            ].every((value) => Number.isFinite(value) && value === 0);
        return {
            recipeId: entry?.recipeId ?? null,
            matrixMatches: entry?.matrix === VALIDATION_MATRIX,
            phaseMatches: entry?.phase === 'after',
            recipeMetadataMatches: !!expected
                && (entry?.captureVariant ?? null) === (expected.captureVariant ?? null)
                && JSON.stringify(entry?.evidenceIds ?? []) === JSON.stringify(expected.evidenceIds ?? [])
                && (entry?.approvalDiagnosticSource ?? false) === (expected.approvalDiagnosticSource === true)
                && (entry?.diagnosticOverlay ?? false) === (expected.diagnosticOverlay === true)
                && (entry?.validationRole ?? null) === (expected.validationRole ?? null)
                && (entry?.baselineRecipeId ?? null) === (expected.baselineRecipeId ?? null)
                && (entry?.repeatOfRecipeId ?? null) === (expected.repeatOfRecipeId ?? null)
                && (entry?.stationaryHandoff ?? false) === (expected.stationaryHandoff === true)
                && (entry?.lightingPreset ?? null) === (expected.lighting ?? null)
                && (entry?.qualityPreset ?? null) === (expected.quality ?? null)
                && (entry?.evidenceMode ?? null) === (expected.evidenceMode ?? null)
                && (entry?.boundaryView ?? null) === (expected.boundaryView ?? null)
                && (entry?.boundaryTarget ?? null) === (expected.boundaryTarget ?? null)
                && (entry?.lightingCriticalRole ?? null) === (expected.lightingCriticalRole ?? null)
                && (entry?.fallbackMode ?? null) === (expected.fallbackMode ?? null)
                && (entry?.hierarchyEvidenceMode ?? null) === (expected.hierarchyEvidenceMode ?? null)
                && (entry?.handoffId ?? null) === (expected.handoffId ?? null)
                && (entry?.motionPath ?? null) === (expected.motionPath ?? null)
                && (entry?.motionProgress ?? null) === (expected.motionProgress ?? null),
            native4kPng: entry?.png?.width === WIDTH
                && entry?.png?.height === HEIGHT
                && entry?.png?.format === 'png'
                && entry?.png?.lossless === true
                && entry?.canvas?.drawingBufferWidth === WIDTH
                && entry?.canvas?.drawingBufferHeight === HEIGHT
                && entry?.canvas?.rendererPixelRatio === 1,
            snapshotContractExact: entry?.snapshotContractVersion === 10,
            uiModeExact: expected?.diagnosticOverlay === true
                ? entry?.uiFree === false
                : entry?.uiFree === true,
            contentHashRecorded: /^[a-f0-9]{64}$/.test(String(entry?.contentSha256 ?? '')),
            cameraRecorded: isFiniteVector3(entry?.camera?.position)
                && isFiniteVector3(entry?.camera?.target)
                && Number.isFinite(entry?.camera?.heightMeters),
            requestedHeightMatches: !Number.isFinite(expectedHeight)
                || Math.abs(Number(entry?.camera?.heightMeters) - expectedHeight) <= 1e-6,
            presentationMetadataRecorded: hasNonEmptyString(entry?.lightingPreset)
                && Number.isFinite(entry?.exposure)
                && hasNonEmptyString(entry?.qualityPreset)
                && hasNonEmptyString(entry?.activeLodTier),
            materialMetadataExact: entry?.materialVersion === 'v2'
                && hasNonEmptyString(material.midCompiledShaderSignature)
                && hasNonEmptyString(material.midMaterialId)
                && hasNonEmptyString(material.accentMaterialId)
                && material.midEmissiveIntensity === 0
                && material.accentEmissiveIntensity === 0,
            exactCoverageMetadata: hasNonEmptyString(boundarySignature)
                && boundarySignature === near.boundarySignature
                && boundarySignature === accent.boundarySignature
                && hasNonEmptyString(near.placementSignature)
                && hasNonEmptyString(accent.placementSignature)
                && (lowQualityFieldInapplicable || (
                    boundarySignature === field.boundarySignature
                    && hasNonEmptyString(field.placementSignature)
                )),
            nearCoverageComplete: Number.isFinite(near.candidateBins)
                && Number.isFinite(near.eligibleBins)
                && near.eligibleBins === near.representedBins
                && near.unrepresentedEligibleBins === 0
                && near.exactPostcheckFailures === 0
                && near.ineligibleRoots === 0
                && Number.isFinite(near.instanceCount),
            fieldCoverageComplete: Number.isFinite(field.candidateUnits)
                && Number.isFinite(field.eligibleUnits)
                && field.eligibleUnits === field.representedUnits
                && field.unrepresentedEligibleUnits === 0
                && field.exactPostcheckFailures === 0
                && field.exactEnvelopeFailures === 0
                && Number.isFinite(field.overlapUnits)
                && Number.isFinite(field.instances),
            accentCoverageComplete: Number.isFinite(accent.candidateRoots)
                && Number.isFinite(accent.eligibleRoots)
                && accent.eligibleRoots === accent.representedRoots
                && accent.unrepresentedEligibleRoots === 0
                && accent.exactPostcheckFailures === 0
                && accent.exactEnvelopeFailures === 0
                && accent.substrateOwnership === 'coverage_tree_hole'
                && accent.wornPatches === 0
                && accent.wornTriangles === 0
                && accent.wornDrawCalls === 0
                && accent.wornMaterialPaths === 0,
            exactExclusionsClean: coverage.hardExclusionIntrusions === 0
                && coverage.grassOnsetIntrusions === 0,
            cutoffClean: lod.geometryBeyondCutoff === 0
                && field.geometryBeyondCutoff === 0
                && field.cutoffRejectedUnits === 0
                && accent.geometryBeyondCutoff === 0
                && cost.geometryBeyondCutoff === 0,
            structuralBudgetsPass: Number.isFinite(cost.combinedVisibleGrassTriangles)
                && cost.combinedVisibleGrassTriangles <= 200000
                && Number.isFinite(cost.combinedVisibleGrassLogicalDrawCalls)
                && cost.combinedVisibleGrassLogicalDrawCalls <= 12
                && Number.isFinite(cost.coverageLogicalDrawCalls)
                && cost.coverageLogicalDrawCalls <= 2
                && Number.isFinite(cost.totalRendererDrawCalls)
                && cost.trianglesByTier && typeof cost.trianglesByTier === 'object',
            activeLodMetadata: lod.version === 2
                && hasNonEmptyString(lod.activeTier)
                && lod.weights && typeof lod.weights === 'object'
                && Number.isFinite(lod.transitionProgress),
            diagnosticOverlayApplied: expected?.diagnosticOverlay === true
                ? entry?.diagnosticOverlayAttached === true
                : entry?.diagnosticOverlayAttached === false,
            motionMetadata: !isMotion || (
                ['forward', 'reverse', 'strafe', 'flyover'].includes(entry?.motionPath)
                && Number.isFinite(entry?.motionElapsedMs)
                && Number.isFinite(entry?.motionProgress)
                && hasNonEmptyString(entry?.motionCheckpoint)
                && entry?.motionDeterministicSeek === true
                && entry?.lodHysteresisReset === true
            ),
            stationaryEvidence: expected?.stationaryHandoff !== true || (
                entry?.stationaryHandoff === true
                && entry?.lodHysteresisReset === true
                && Number(near.lastBufferUpdates) === 0
                && Number(field.lastBufferUpdates) === 0
                && Number(accent.lastBufferUpdates) === 0
            )
        };
    });
    const staticPairIds = [...new Set(expectedRecipes
        .filter((recipe) => recipe.evidenceGroup === 'ai362_static_pair')
        .map((recipe) => recipe.pairId))];
    const staticPairChecks = staticPairIds.map((pairId) => {
        const clean = entries.find((entry) => entry?.pairId === pairId && entry?.captureVariant === 'clean') ?? null;
        const diagnostic = entries.find((entry) => entry?.pairId === pairId && entry?.captureVariant === 'diagnostic_overlay') ?? null;
        const cameraMatch = !!clean && !!diagnostic
            && captureCameraSignature(clean) === captureCameraSignature(diagnostic);
        const stateMatch = !!clean && !!diagnostic
            && clean.lightingPreset === diagnostic.lightingPreset
            && clean.qualityPreset === diagnostic.qualityPreset
            && Number(clean.exposure) === Number(diagnostic.exposure);
        const distinctImages = !!clean?.contentSha256
            && !!diagnostic?.contentSha256
            && clean.contentSha256 !== diagnostic.contentSha256;
        return {
            pairId,
            cameraMatch,
            stateMatch,
            distinctImages,
            pass: cameraMatch && stateMatch && distinctImages
        };
    });
    const repeatRecipes = expectedRecipes.filter((recipe) => recipe.repeatOfRecipeId);
    const deterministicRepeatChecks = repeatRecipes.map((recipe) => {
        const source = entries.find((entry) => entry?.recipeId === recipe.repeatOfRecipeId) ?? null;
        const repeat = entries.find((entry) => entry?.recipeId === recipe.id) ?? null;
        const cameraMatch = !!source && !!repeat
            && captureCameraSignature(source) === captureCameraSignature(repeat);
        const stateMatch = !!source && !!repeat
            && source.lightingPreset === repeat.lightingPreset
            && source.qualityPreset === repeat.qualityPreset
            && Number(source.exposure) === Number(repeat.exposure)
            && source.hierarchyEvidenceMode === repeat.hierarchyEvidenceMode
            && source.handoffId === repeat.handoffId
            && source.motionPath === repeat.motionPath
            && source.motionProgress === repeat.motionProgress;
        const exactPixelMatch = !!source?.contentSha256
            && !!repeat?.contentSha256
            && source.contentSha256 === repeat.contentSha256;
        return {
            recipeId: recipe.id,
            sourceRecipeId: recipe.repeatOfRecipeId,
            cameraMatch,
            stateMatch,
            exactPixelMatch,
            pass: cameraMatch && stateMatch && exactPixelMatch
        };
    });
    const deterministicRepeatsPass = deterministicRepeatChecks.length === repeatRecipes.length
        && deterministicRepeatChecks.length > 0
        && deterministicRepeatChecks.every((entry) => entry.pass);
    const motionEntries = entries.filter((entry) => entry?.motionPath);
    const expectedMotionEntries = expectedRecipes.filter((recipe) => recipe.motionPath);
    const primaryMotionEntries = motionEntries.filter((entry) => !entry?.repeatOfRecipeId);
    const expectedPrimaryMotionEntries = expectedMotionEntries.filter((recipe) => !recipe.repeatOfRecipeId);
    const motionPathChecks = ['forward', 'reverse', 'strafe', 'flyover'].map((motionPath) => {
        const expectedCount = expectedPrimaryMotionEntries.filter((entry) => entry.motionPath === motionPath).length;
        const expectedRepeatCount = expectedMotionEntries.filter((entry) => (
            entry.motionPath === motionPath && entry.repeatOfRecipeId
        )).length;
        const pathEntries = motionEntries.filter((entry) => entry.motionPath === motionPath);
        const primaryPathEntries = pathEntries.filter((entry) => !entry.repeatOfRecipeId);
        const repeatPathEntries = pathEntries.filter((entry) => entry.repeatOfRecipeId);
        return {
            motionPath,
            expectedCount,
            expectedRepeatCount,
            captureCount: primaryPathEntries.length,
            repeatCaptureCount: repeatPathEntries.length,
            uniqueHashCount: new Set(primaryPathEntries.map((entry) => entry.contentSha256)).size,
            pass: primaryPathEntries.length === expectedCount
                && repeatPathEntries.length === expectedRepeatCount
                && new Set(primaryPathEntries.map((entry) => entry.contentSha256)).size === expectedCount
        };
    });
    const uniqueDeterministicMotion = motionEntries.length === expectedMotionEntries.length
        && primaryMotionEntries.length === expectedPrimaryMotionEntries.length
        && motionPathChecks.every((check) => check.pass)
        && deterministicRepeatsPass;
    const baselineReference = options?.baselineReference ?? null;
    const baselinePairRecipes = expectedRecipes.filter((recipe) => recipe.baselineRecipeId);
    const baselinePairChecks = baselinePairRecipes.map((recipe) => {
        const current = entries.find((entry) => entry?.recipeId === recipe.id) ?? null;
        const baseline = baselineReference?.checks?.find((entry) => entry?.recipeId === recipe.baselineRecipeId) ?? null;
        const cameraMatch = !!current && !!baseline
            && captureCameraSignature(current) === captureCameraSignature({ camera: baseline.camera });
        const stateMatch = !!current && !!baseline
            && current.lightingPreset === baseline.lightingPreset
            && current.qualityPreset === baseline.qualityPreset
            && Number(current.exposure) === Number(baseline.exposure);
        return {
            recipeId: recipe.id,
            baselineRecipeId: recipe.baselineRecipeId,
            baselineFile: baseline?.file ?? null,
            baselineContentSha256: baseline?.contentSha256 ?? null,
            baselineFileVerified: baseline?.fileVerified === true,
            cameraMatch,
            stateMatch,
            pass: baseline?.pass === true && cameraMatch && stateMatch
        };
    });
    const baselineReferencePass = baselineReference?.pass === true
        && baselinePairChecks.length === baselinePairRecipes.length
        && baselinePairChecks.length > 0
        && baselinePairChecks.every((entry) => entry.pass);
    const stationaryHandoffChecks = ['close_billboard', 'billboard_middle', 'middle_texture'].map((handoffId) => {
        const handoffEntries = entries.filter((entry) => entry?.stationaryHandoff === true && entry?.handoffId === handoffId);
        const requiredVariants = ['clean', 'diagnostic_overlay', 'clean_repeat'];
        return {
            handoffId,
            requiredVariants,
            captureCount: handoffEntries.length,
            variants: handoffEntries.map((entry) => entry.captureVariant).sort(),
            zeroUploads: handoffEntries.length === requiredVariants.length
                && handoffEntries.every((entry) => (
                    Number(entry?.nearDiagnostics?.lastBufferUpdates) === 0
                    && Number(entry?.hierarchyDiagnostics?.lastBufferUpdates) === 0
                    && Number(entry?.accentDiagnostics?.lastBufferUpdates) === 0
                )),
            pass: handoffEntries.length === requiredVariants.length
                && requiredVariants.every((variant) => handoffEntries.some((entry) => entry.captureVariant === variant))
                && handoffEntries.every((entry) => entry.lodHysteresisReset === true)
                && handoffEntries.every((entry) => (
                    Number(entry?.nearDiagnostics?.lastBufferUpdates) === 0
                    && Number(entry?.hierarchyDiagnostics?.lastBufferUpdates) === 0
                    && Number(entry?.accentDiagnostics?.lastBufferUpdates) === 0
                ))
        };
    });
    const performanceOwnership = String(options?.performanceOwnership ?? '');
    const performanceOwnershipPass = performanceOwnership === AI362_PERFORMANCE_OWNERSHIP;
    const performanceEvidenceComplete = performanceGate?.evidenceComplete === true
        && Array.isArray(performanceGate?.checks)
        && performanceGate.checks.length === 5;
    const recordedPerformanceRows = Array.isArray(performanceGate?.checks)
        ? performanceGate.checks.filter((check) => check.captureCount === 1).length
        : 0;
    const performanceStructuralPass = performanceGate?.structuralPass === true;
    const performanceCostPass = performanceGate?.pass === true;
    const performanceVerdictRecorded = performanceEvidenceComplete
        && typeof performanceGate?.performancePass === 'boolean'
        && typeof performanceGate?.pass === 'boolean';
    const performanceStillFailing = performanceEvidenceComplete
        && performanceStructuralPass
        && performanceGate?.performancePass === false
        && performanceCostPass === false;
    const native4kTiming = options?.native4kTiming ?? null;
    const native4kTimingRecorded = native4kTiming?.recorded === true
        && native4kTiming?.matrix === VALIDATION_MATRIX
        && native4kTiming?.phase === 'after'
        && native4kTiming?.resolution === `${WIDTH}x${HEIGHT}`
        && native4kTiming?.statistic === 'arithmetic_mean'
        && native4kTiming?.informationalOnly === true
        && hasCompleteAi362Native4kTimingEvidence(native4kTiming?.performanceGate);
    const regressionGate = options?.regressionGate ?? null;
    const regressionGatePass = regressionGate?.pass === true;
    const approvalDiagnosticSources = entries.filter((entry) => entry?.approvalDiagnosticSource === true);
    const visualFunctionalPass = entries.length === expectedRecipes.length
        && missingRecipeIds.length === 0
        && unexpectedRecipeIds.length === 0
        && checks.every((entry) => Object.entries(entry).every(([key, value]) => key === 'recipeId' || value === true))
        && staticPairChecks.every((check) => check.pass)
        && uniqueDeterministicMotion
        && deterministicRepeatsPass
        && stationaryHandoffChecks.every((entry) => entry.pass)
        && baselineReferencePass
        && native4kTimingRecorded
        && regressionGatePass
        && approvalDiagnosticSources.length === 1
        && approvalDiagnosticSources[0]?.approvalDiagnosticsEnriched === true;
    const pass = visualFunctionalPass
        && performanceOwnershipPass
        && performanceEvidenceComplete
        && performanceStructuralPass
        && performanceVerdictRecorded;
    const reviewCoverage = {
        cameraIds: visualFunctionalPass ? [...GRASS_LAB_V2_REQUIRED_CAMERA_IDS] : [],
        lightingIds: visualFunctionalPass ? [...GRASS_LAB_V2_REQUIRED_LIGHTING_IDS] : [],
        motionPathIds: visualFunctionalPass ? [...GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS] : [],
        evidenceIds: visualFunctionalPass ? [...GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS] : [],
        missingCameraIds: visualFunctionalPass ? [] : [...GRASS_LAB_V2_REQUIRED_CAMERA_IDS],
        missingLightingIds: visualFunctionalPass ? [] : [...GRASS_LAB_V2_REQUIRED_LIGHTING_IDS],
        missingMotionPathIds: visualFunctionalPass ? [] : [...GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS],
        missingEvidenceIds: visualFunctionalPass ? [] : [...GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS]
    };
    return {
        gateId: 'grass-ai362-validation-v1',
        matrixScope: 'complete_ai362_visual_functional_validation',
        requiredResolution: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        requiredMaterialVersion: 'v2',
        requiredStaticCaptures: expectedRecipes.length - expectedMotionEntries.length,
        requiredMotionCaptures: expectedMotionEntries.length,
        requiredDiagnosticOverlays: staticPairIds.length,
        requiredBaselinePairs: baselinePairRecipes.length,
        requiredDeterministicRepeats: repeatRecipes.length,
        requiredApprovalDiagnosticSources: 1,
        expectedRecipeIds: expectedIds,
        captureCount: entries.length,
        staticCaptureCount: entries.length - motionEntries.length,
        motionCaptureCount: motionEntries.length,
        missingRecipeIds,
        unexpectedRecipeIds,
        staticPairChecks,
        baselineReference,
        baselineReferencePass,
        baselinePairChecks,
        stationaryHandoffChecks,
        deterministicRepeatChecks,
        deterministicRepeatsPass,
        approvalDiagnosticSourceRecipeId: approvalDiagnosticSources[0]?.recipeId ?? null,
        approvalDiagnosticSourceCount: approvalDiagnosticSources.length,
        approvalDiagnosticsEnriched: approvalDiagnosticSources[0]?.approvalDiagnosticsEnriched === true,
        motionPathChecks,
        uniqueDeterministicMotion,
        reviewCoverage,
        performanceOwnership,
        performanceOwnershipPass,
        performanceRequired: !performanceOwnershipPass,
        requiredPerformanceRows: 5,
        recordedPerformanceRows,
        performanceEvidenceComplete,
        performanceStructuralPass,
        performanceCostPass,
        performanceVerdictRecorded,
        performanceStillFailing,
        native4kTiming,
        native4kTimingRecorded,
        regressionGate,
        regressionGatePass,
        visualFunctionalPass,
        performanceGate,
        checks,
        pass
    };
}

export function evaluateAi362RegressionGate(captures, options = null) {
    const entries = Array.isArray(captures) ? captures : [];
    const baselineReference = options?.baselineReference ?? null;
    const recipes = buildAi362ValidationRecipes();
    const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const entriesFor = (predicate) => entries.filter((entry) => predicate(recipeById.get(entry?.recipeId), entry));
    const evidenceIds = (source) => source.map((entry) => entry.recipeId).filter(Boolean).sort();
    const allEntries = entriesFor((recipe) => !!recipe);
    const cleanEntries = entriesFor((recipe) => recipe?.captureVariant === 'clean');
    const boundaryEntries = entriesFor((recipe) => recipe?.validationRole === 'boundary_view');
    const motionEntries = entriesFor((recipe) => !!recipe?.motionPath && !recipe?.repeatOfRecipeId);
    const repeatEntries = entriesFor((recipe) => !!recipe?.repeatOfRecipeId);
    const fallbackEntries = entriesFor((recipe) => recipe?.validationRole === 'fallback');
    const approvalDiagnosticSources = allEntries.filter((entry) => entry?.approvalDiagnosticSource === true);
    const approvalDiagnosticSourceExact = approvalDiagnosticSources.length === 1
        && approvalDiagnosticSources[0]?.approvalDiagnosticsEnriched === true;
    const approvalDiagnosticSource = approvalDiagnosticSourceExact
        ? approvalDiagnosticSources[0]
        : null;
    const materialExact = allEntries.length === recipes.length && allEntries.every((entry) => (
        entry?.materialVersion === 'v2'
        && hasNonEmptyString(entry?.materialDiagnostics?.midCompiledShaderSignature)
        && hasNonEmptyString(entry?.materialDiagnostics?.midMaterialId)
        && hasNonEmptyString(entry?.materialDiagnostics?.accentMaterialId)
        && Number(entry?.materialDiagnostics?.midEmissiveIntensity) === 0
        && Number(entry?.materialDiagnostics?.accentEmissiveIntensity) === 0
    ));
    const nearCoverageComplete = allEntries.length === recipes.length && allEntries.every((entry) => (
        Number(entry?.nearDiagnostics?.eligibleBins) === Number(entry?.nearDiagnostics?.representedBins)
        && Number(entry?.nearDiagnostics?.unrepresentedEligibleBins) === 0
        && Number(entry?.nearDiagnostics?.exactPostcheckFailures) === 0
    ));
    const fieldCoverageComplete = allEntries.length === recipes.length && allEntries.every((entry) => (
        Number(entry?.hierarchyDiagnostics?.eligibleUnits) === Number(entry?.hierarchyDiagnostics?.representedUnits)
        && Number(entry?.hierarchyDiagnostics?.unrepresentedEligibleUnits) === 0
        && Number(entry?.hierarchyDiagnostics?.exactPostcheckFailures) === 0
        && Number(entry?.hierarchyDiagnostics?.exactEnvelopeFailures) === 0
    ));
    const exactExclusions = allEntries.length === recipes.length && allEntries.every((entry) => (
        Number(entry?.coverageDiagnostics?.hardExclusionIntrusions) === 0
        && Number(entry?.coverageDiagnostics?.grassOnsetIntrusions) === 0
        && Number(entry?.coverageDiagnostics?.ineligibleCutEdgeRoots) === 0
    ));
    const envelopeClean = allEntries.length === recipes.length && allEntries.every((entry) => (
        Number(entry?.hierarchyDiagnostics?.exactEnvelopeFailures) === 0
        && Number(entry?.accentDiagnostics?.exactEnvelopeFailures) === 0
    ));
    const noWornCost = allEntries.length === recipes.length && allEntries.every((entry) => (
        Number(entry?.accentDiagnostics?.wornPatches) === 0
        && Number(entry?.accentDiagnostics?.wornTriangles) === 0
        && Number(entry?.accentDiagnostics?.wornDrawCalls) === 0
        && Number(entry?.accentDiagnostics?.wornMaterialPaths) === 0
    ));
    const boundaryDimensions = boundaryEntries.length > 0 && boundaryEntries.every((entry) => (
        Number(entry?.coverageDiagnostics?.antialiasWidthMeters) <= 0.015
        && Number(entry?.coverageDiagnostics?.structuralBaseHeightMeters) >= 0.025
        && Number(entry?.coverageDiagnostics?.structuralBaseHeightMeters) <= 0.030
        && Number(entry?.coverageDiagnostics?.visibleBladeTipMinMeters) === 0.040
        && Number(entry?.coverageDiagnostics?.visibleBladeTipMaxMeters) === 0.075
    ));
    const approvalBoundarySignature = approvalDiagnosticSource?.coverageDiagnostics?.boundarySignature;
    const approvalSourceLoopIdentity = approvalDiagnosticSource?.coverageDiagnostics?.sourceLoopIdentity;
    const signedDistanceExact = approvalDiagnosticSourceExact
        && hasNonEmptyString(approvalBoundarySignature)
        && approvalDiagnosticSource?.coverageDiagnostics?.signedDistanceOrientation === 'positive_grass_negative_exclusion'
        && Number(approvalDiagnosticSource?.coverageDiagnostics?.occupiedSamples) > 0
        && Number(approvalDiagnosticSource?.coverageDiagnostics?.excludedSamples) > 0
        && Number(approvalDiagnosticSource?.coverageDiagnostics?.rootEligibleSamples) > 0
        && boundaryEntries.length > 0
        && boundaryEntries.every((entry) => (
            entry?.coverageDiagnostics?.boundarySignature === approvalBoundarySignature
            && Number(entry?.coverageDiagnostics?.occupiedSamples) > 0
            && Number(entry?.coverageDiagnostics?.excludedSamples) > 0
            && Number(entry?.coverageDiagnostics?.rootEligibleSamples) > 0
        ));
    const sourceIdentityExact = approvalDiagnosticSourceExact
        && hasNonEmptyString(approvalBoundarySignature)
        && hasNonEmptyString(approvalSourceLoopIdentity)
        && approvalDiagnosticSource?.coverageDiagnostics?.roadEngineSourceLoopIdentity
            === approvalSourceLoopIdentity
        && approvalDiagnosticSource?.coverageDiagnostics?.boundarySignatureStable === true
        && boundaryEntries.length > 0
        && boundaryEntries.every((entry) => (
            hasNonEmptyString(entry?.coverageDiagnostics?.sourceLoopIdentity)
            && entry?.coverageDiagnostics?.sourceLoopIdentity === approvalSourceLoopIdentity
            && entry?.coverageDiagnostics?.boundarySignature === approvalBoundarySignature
        ));
    const handoffDiagnosticsExact = approvalDiagnosticSourceExact && (() => {
        const handoffs = approvalDiagnosticSource?.hierarchyDiagnostics?.handoffs;
        if (!Array.isArray(handoffs)) return false;
        return ['near_to_billboard', 'billboard_to_middle', 'middle_to_texture'].every((id) => {
            const matches = handoffs.filter((handoff) => handoff?.id === id);
            return matches.length === 1
                && matches[0].sharedSamples === true
                && matches[0].complementary === true
                && Number(matches[0].unrepresentedEligibleUnits) === 0
                && Number(matches[0].bothHiddenUnits) === 0
                && Number(matches[0].nonAdjacentOverlapUnits) === 0
                && hasNonEmptyString(matches[0].evidenceRecipeId)
                && allEntries.some((entry) => entry?.recipeId === matches[0].evidenceRecipeId);
        });
    })();
    const stationaryExact = entriesFor((recipe) => recipe?.stationaryHandoff === true).every((entry) => (
        Number(entry?.nearDiagnostics?.lastBufferUpdates) === 0
        && Number(entry?.hierarchyDiagnostics?.lastBufferUpdates) === 0
        && Number(entry?.accentDiagnostics?.lastBufferUpdates) === 0
    ));
    const repeatChecks = repeatEntries.map((repeat) => {
        const source = entries.find((entry) => entry?.recipeId === repeat.repeatOfRecipeId) ?? null;
        return {
            sourceRecipeId: repeat.repeatOfRecipeId,
            repeatRecipeId: repeat.recipeId,
            exactPixelMatch: !!source?.contentSha256 && source.contentSha256 === repeat.contentSha256,
            cameraMatch: !!source && captureCameraSignature(source) === captureCameraSignature(repeat)
        };
    });
    const deterministicRepeats = repeatChecks.length > 0
        && repeatChecks.every((check) => check.exactPixelMatch && check.cameraMatch);
    const baselineComparisons = recipes.filter((recipe) => recipe.baselineRecipeId).map((recipe) => {
        const current = entries.find((entry) => entry?.recipeId === recipe.id) ?? null;
        const baseline = baselineReference?.checks?.find((entry) => entry?.recipeId === recipe.baselineRecipeId) ?? null;
        const currentMean = Number(current?.frameMetrics?.meanLuminance);
        const baselineMean = Number(baseline?.frameMetrics?.meanLuminance);
        const currentBright = Number(current?.frameMetrics?.brightPixelFraction);
        const baselineBright = Number(baseline?.frameMetrics?.brightPixelFraction);
        const luminanceRatio = baselineMean > 0 ? currentMean / baselineMean : null;
        const brightPixelDelta = Number.isFinite(currentBright) && Number.isFinite(baselineBright)
            ? currentBright - baselineBright
            : null;
        return {
            recipeId: recipe.id,
            baselineRecipeId: recipe.baselineRecipeId,
            luminanceRatio,
            brightPixelDelta,
            pass: baseline?.pass === true
                && Number.isFinite(luminanceRatio)
                && luminanceRatio >= 0.9
                && luminanceRatio <= 1.1
                && Number.isFinite(brightPixelDelta)
                && brightPixelDelta <= 0.001
        };
    });
    const baselinePixelsStable = baselineReference?.pass === true
        && baselineComparisons.length > 0
        && baselineComparisons.every((entry) => entry.pass);
    const motionPathComplete = (motionPath, expectedMinimum) => (
        motionEntries.filter((entry) => entry.motionPath === motionPath).length >= expectedMinimum
        && motionEntries.filter((entry) => entry.motionPath === motionPath).every((entry) => (
            entry.motionDeterministicSeek === true
            && entry.lodHysteresisReset === true
            && Number(entry?.lodDiagnostics?.geometryBeyondCutoff) === 0
        ))
    );
    const sharedFacts = {
        exactCaptureSet: allEntries.length === recipes.length,
        approvalDiagnosticSourceExact,
        materialExact,
        nearCoverageComplete,
        fieldCoverageComplete,
        exactExclusions,
        envelopeClean,
        noWornCost,
        boundaryDimensions,
        signedDistanceExact,
        sourceIdentityExact,
        handoffDiagnosticsExact,
        stationaryExact,
        deterministicRepeats,
        baselinePixelsStable
    };
    const specs = {
        isolated_bright_points: { pass: baselinePixelsStable, evidence: baselineComparisons.map((entry) => entry.recipeId), measurements: baselineComparisons },
        tier_color_luminance_continuity: { pass: baselinePixelsStable && materialExact, evidence: baselineComparisons.map((entry) => entry.recipeId), measurements: baselineComparisons },
        zero_coverage_mip_stability: { pass: materialExact && nearCoverageComplete && fieldCoverageComplete, evidence: evidenceIds(cleanEntries) },
        complete_near_coverage_bins: { pass: nearCoverageComplete, evidence: evidenceIds(allEntries) },
        complete_field_coverage_units: { pass: fieldCoverageComplete, evidence: evidenceIds(allEntries) },
        sidewalk_root_exclusion: { pass: exactExclusions, evidence: evidenceIds(boundaryEntries) },
        boundary_conformance: { pass: exactExclusions && boundaryDimensions, evidence: evidenceIds(boundaryEntries) },
        card_envelope_conformance: { pass: envelopeClean, evidence: evidenceIds(allEntries) },
        no_square_substrate_fades: { pass: baselinePixelsStable && exactExclusions, evidence: evidenceIds(boundaryEntries) },
        no_worn_discs: { pass: noWornCost, evidence: evidenceIds(entriesFor((recipe) => recipe?.accentTarget === 'tree')) },
        antialias_width: { pass: boundaryDimensions, evidence: evidenceIds(boundaryEntries) },
        height_distribution: { pass: boundaryDimensions, evidence: evidenceIds(entriesFor((recipe) => recipe?.validationRole === 'height_inspection')) },
        both_hidden_handoff_gaps: { pass: handoffDiagnosticsExact, evidence: evidenceIds(motionEntries) },
        nonadjacent_tier_overlap: { pass: handoffDiagnosticsExact, evidence: evidenceIds(motionEntries) },
        deterministic_reload: { pass: deterministicRepeats, evidence: evidenceIds(repeatEntries), measurements: repeatChecks },
        temporal_flicker: { pass: deterministicRepeats && handoffDiagnosticsExact, evidence: evidenceIds(repeatEntries), measurements: repeatChecks },
        alpha_disappearance: { pass: fieldCoverageComplete && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries) },
        handoff_popping: { pass: deterministicRepeats && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries) },
        material_cohesion: { pass: materialExact && baselinePixelsStable, evidence: evidenceIds(cleanEntries), measurements: baselineComparisons },
        physical_boundary_readability: { pass: boundaryDimensions && exactExclusions, evidence: evidenceIds(boundaryEntries) },
        signed_distance_orientation: { pass: signedDistanceExact, evidence: evidenceIds(boundaryEntries) },
        source_loop_identity: { pass: sourceIdentityExact, evidence: evidenceIds(boundaryEntries) },
        low_quality_texture_fallback: { pass: fallbackEntries.some((entry) => entry.fallbackMode === 'low_quality'), evidence: evidenceIds(fallbackEntries) },
        geometry_disabled_fallback: { pass: fallbackEntries.some((entry) => entry.fallbackMode === 'geometry_disabled'), evidence: evidenceIds(fallbackEntries) },
        stationary_stability: { pass: stationaryExact && deterministicRepeats, evidence: evidenceIds(entriesFor((recipe) => recipe?.stationaryHandoff === true)), measurements: repeatChecks },
        forward_handoff_continuity: { pass: motionPathComplete('forward', 9) && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries.filter((entry) => entry.motionPath === 'forward')) },
        reverse_handoff_continuity: { pass: motionPathComplete('reverse', 9) && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries.filter((entry) => entry.motionPath === 'reverse')) },
        strafe_handoff_continuity: { pass: motionPathComplete('strafe', 3) && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries.filter((entry) => entry.motionPath === 'strafe')) },
        flyover_handoff_continuity: { pass: motionPathComplete('flyover', 6) && handoffDiagnosticsExact, evidence: evidenceIds(motionEntries.filter((entry) => entry.motionPath === 'flyover')) }
    };
    const results = GRASS_LAB_V2_REQUIRED_REGRESSIONS.map((id) => {
        const spec = specs[id] ?? { pass: false, evidence: [] };
        const regressionSpecificPass = spec.pass === true;
        return {
            id,
            pass: sharedFacts.exactCaptureSet && regressionSpecificPass,
            evidenceRecipeIds: [...new Set(spec.evidence ?? [])].sort(),
            checks: { ...sharedFacts, regressionSpecificPass },
            ...(spec.measurements ? { measurements: spec.measurements } : {})
        };
    });
    return {
        gateId: 'grass-ai362-regressions-v1',
        requiredRegressionIds: [...GRASS_LAB_V2_REQUIRED_REGRESSIONS],
        results,
        missingRegressionIds: results.filter((entry) => !entry.pass).map((entry) => entry.id),
        pass: results.length === GRASS_LAB_V2_REQUIRED_REGRESSIONS.length
            && results.every((entry) => entry.pass)
    };
}

function buildApprovalAtlasMaterial(stats, diagnostics, atlasRole) {
    const atlas = LOW_CUT_GRASS_ASSET_FAMILY.atlases[atlasRole];
    const expectedAtlasMaps = Object.values(atlas.channels);
    const resolvedMaterialId = String(stats?.resolvedMaterialId ?? diagnostics?.[`${atlasRole === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER ? 'mid' : 'accent'}MaterialId`] ?? '');
    const compiledAlphaLayout = String(diagnostics?.midCompiledAlphaLayout ?? atlas.alphaLayout.policy);
    const compiledNormalPolicy = String(diagnostics?.midCompiledNormalPolicy ?? atlas.lighting.normalPolicy);
    const calibrated = resolvedMaterialId === LOW_CUT_GRASS_MATERIAL_ID
        && (atlasRole !== LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER || (
            compiledAlphaLayout === atlas.alphaLayout.policy
            && compiledNormalPolicy === atlas.lighting.normalPolicy
        ));
    const validTierRecord = (tier, cardsPerUnit) => (
        tier && typeof tier === 'object'
        && Number.isInteger(tier.instances)
        && tier.instances > 0
        && Number.isInteger(tier.triangles)
        && tier.triangles > 0
        && Number.isInteger(tier.drawCalls)
        && tier.drawCalls > 0
        && Number(tier.cardsPerUnit) === cardsPerUnit
    );
    const sharedByBillboardAndMiddle = atlasRole === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
        && Number(stats?.materialPaths) === 1
        && stats?.atlasRole === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
        && Array.isArray(stats?.atlasMaps)
        && stats.atlasMaps.length === expectedAtlasMaps.length
        && expectedAtlasMaps.every((map) => stats.atlasMaps.includes(map))
        && validTierRecord(stats?.billboard, 1)
        && validTierRecord(stats?.middle, 2);
    return {
        atlasRole,
        resolvedMaterialId,
        materialPaths: Number(stats?.materialPaths) || atlas.materialPaths,
        ...(atlasRole === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
            ? { sharedByBillboardAndMiddle }
            : {}),
        alphaCutoff: Number(stats?.alphaCutoff) || atlas.alphaCutoff,
        alphaToCoverage: stats?.alphaToCoverage === true,
        transparent: stats?.transparent === true,
        depthWrite: stats?.depthWrite !== false && stats?.transparent !== true,
        alphaLayoutPolicy: atlas.alphaLayout.policy,
        alphaLayoutChannel: atlas.alphaLayout.channel,
        normalPolicy: atlas.lighting.normalPolicy,
        worldUpBlend: atlas.lighting.worldUpBlend,
        emissiveIntensity: Number(
            atlasRole === LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
                ? diagnostics?.midEmissiveIntensity
                : diagnostics?.accentEmissiveIntensity
        ) || 0,
        globalLoaderCalibrated: calibrated,
        atlasMaps: expectedAtlasMaps
    };
}

export function enrichAi362ApprovalDiagnosticSource(captures) {
    const entries = Array.isArray(captures) ? captures : [];
    const source = entries.find((entry) => entry?.approvalDiagnosticSource === true) ?? null;
    if (!source) return { sourceRecipeId: null, enriched: false };
    const transitionDefinitions = [
        ['near_to_billboard', 'close_billboard'],
        ['billboard_to_middle', 'billboard_middle'],
        ['middle_to_texture', 'middle_texture']
    ];
    const transitionCaptureFor = (state, handoffId) => {
        const isValidTransition = (entry) => (
            entry?.lodDiagnostics?.transitionState === state
            && Number(entry?.lodDiagnostics?.transitionProgress) > 0
            && Number(entry?.lodDiagnostics?.transitionProgress) < 1
        );
        return entries.find((entry) => (
            entry?.motionPath
            && !entry?.repeatOfRecipeId
            && entry?.handoffId === handoffId
            && entry?.motionCheckpoint === 'center'
            && isValidTransition(entry)
        )) ?? entries.find((entry) => (
            entry?.stationaryHandoff === true
            && entry?.handoffId === handoffId
            && isValidTransition(entry)
        )) ?? entries.find(isValidTransition) ?? null;
    };
    const transitionCaptures = new Map(transitionDefinitions.map(([state, handoffId]) => (
        [state, transitionCaptureFor(state, handoffId)]
    )));
    const transitionSamples = transitionDefinitions.map(([state]) => {
        const capture = transitionCaptures.get(state) ?? null;
        return {
            state,
            progress: Number(capture?.lodDiagnostics?.transitionProgress),
            weights: { ...(capture?.lodDiagnostics?.weights ?? {}) },
            evidenceRecipeId: capture?.recipeId ?? null
        };
    });
    const handoffs = transitionDefinitions.map(([id]) => {
        const capture = transitionCaptures.get(id) ?? null;
        const field = capture?.hierarchyDiagnostics ?? {};
        const weights = capture?.lodDiagnostics?.weights ?? {};
        const nonAdjacentOverlapUnits = id === 'near_to_billboard'
            ? (Number(weights.middle) > 0 || Number(weights.texture) > 0 ? Number(field.representedUnits) || 0 : 0)
            : (id === 'billboard_to_middle'
                ? (Number(weights.near) > 0 || Number(weights.texture) > 0 ? Number(field.representedUnits) || 0 : 0)
                : (Number(weights.near) > 0 || Number(weights.billboard) > 0 ? Number(field.representedUnits) || 0 : 0));
        return {
            id,
            sharedSamples: hasNonEmptyString(field.boundarySignature)
                && hasNonEmptyString(field.placementSignature),
            complementary: Number(field.unrepresentedEligibleUnits) === 0,
            outgoingUnits: Number(field.representedUnits) || 0,
            incomingUnits: Number(field.representedUnits) || 0,
            transitionUnits: Number(field.eligibleUnits) || 0,
            overlapUnits: Number(field.overlapUnits) || 0,
            unrepresentedEligibleUnits: Number(field.unrepresentedEligibleUnits) || 0,
            bothHiddenUnits: Number(field.unrepresentedEligibleUnits) || 0,
            nonAdjacentOverlapUnits,
            evidenceRecipeId: capture?.recipeId ?? null
        };
    });
    const fieldMaterial = buildApprovalAtlasMaterial(
        source.hierarchyDiagnostics,
        source.materialDiagnostics,
        LOW_CUT_GRASS_ATLAS_ROLE.MID_CLUSTER
    );
    const accentMaterial = buildApprovalAtlasMaterial(
        source.accentDiagnostics,
        source.materialDiagnostics,
        LOW_CUT_GRASS_ATLAS_ROLE.ACCENT_CLUMP
    );
    const forceValues = [
        GRASS_AUTO_LOD_FORCE.AUTO,
        GRASS_AUTO_LOD_FORCE.NEAR,
        GRASS_AUTO_LOD_FORCE.BILLBOARD,
        GRASS_AUTO_LOD_FORCE.MIDDLE,
        GRASS_AUTO_LOD_FORCE.TEXTURE
    ];
    source.lodDiagnostics = {
        ...(source.lodDiagnostics ?? {}),
        forceValues,
        transitionWidthMeters: GRASS_AUTO_LOD_DEFAULTS.transitionWidthMeters,
        hysteresisMeters: GRASS_AUTO_LOD_DEFAULTS.hysteresisMeters,
        angle: { ...GRASS_AUTO_LOD_DEFAULTS.angle },
        transitionSamples
    };
    source.hierarchyDiagnostics = {
        ...(source.hierarchyDiagnostics ?? {}),
        ownershipCellSizeMeters: GRASS_MID_CLUSTER_DEFAULTS.unitSizeMeters,
        sharedWorldAlignedLayout: source.hierarchyDiagnostics?.version === 2
            && source.hierarchyDiagnostics?.coverageMode != null,
        complementarySamples: handoffs.every((handoff) => handoff.sharedSamples && handoff.complementary),
        handoffs,
        material: fieldMaterial
    };
    source.accentDiagnostics = {
        ...(source.accentDiagnostics ?? {}),
        weightPolicy: '1_minus_texture_weight',
        material: accentMaterial
    };
    const boundarySignatures = new Set(entries
        .map((entry) => entry?.coverageDiagnostics?.boundarySignature)
        .filter(Boolean));
    const coverage = source.coverageDiagnostics ?? {};
    source.coverageDiagnostics = {
        ...coverage,
        roadEngineSourceLoopIdentity: coverage.roadEngineSourceLoopIdentity
            ?? coverage.sourceLoopIdentity
            ?? null,
        boundarySignatureStable: coverage.boundarySignatureStable === true
            || (boundarySignatures.size === 1 && hasNonEmptyString(coverage.boundarySignature)),
        signedDistanceOrientation: coverage.signedDistanceOrientation
            ?? (Number(coverage.occupiedSamples) > 0
                && Number(coverage.excludedSamples) > 0
                && Number(coverage.rootEligibleSamples) > 0
                ? 'positive_grass_negative_exclusion'
                : null)
    };
    source.approvalDiagnosticsEnriched = true;
    return {
        sourceRecipeId: source.recipeId,
        enriched: true,
        transitionSampleCount: transitionSamples.length,
        handoffCount: handoffs.length
    };
}

export function evaluateNearRepresentationSnapshot(snapshot, expectedMode) {
    const grass = snapshot?.grass ?? {};
    const near = grass.nearCarpet ?? {};
    const evidence = snapshot?.nearEvidence ?? {};
    const coverage = snapshot?.coverage ?? {};
    const textureOnly = expectedMode === 'texture_only';
    const combinedVisibleGrassTriangles = Number(grass.triangles ?? 0) + Number(coverage.triangles ?? 0);
    const checks = {
        modeMatches: evidence.mode === expectedMode,
        coverageRetained: Number(coverage.logicalDrawCalls ?? coverage.drawCalls) > 0,
        fieldTrianglesMatch: textureOnly ? Number(grass.triangles) === 0 : Number(near.triangles) > 0,
        fieldDrawsMatch: textureOnly ? Number(grass.logicalDrawCalls) === 0 : Number(near.drawCalls) > 0,
        nearOnly: textureOnly || (
            Number(grass.trianglesByTier?.mid) === 0
            && Number(grass.trianglesByTier?.accent) === 0
        ),
        oneMaterialPath: textureOnly || Number(near.materialPaths) === 1,
        opaque: textureOnly || near.transparent === false,
        depthWriting: textureOnly || near.depthWrite === true,
        shadowFree: textureOnly || near.castShadow === false,
        frustumCulled: textureOnly || near.frustumCulled === true,
        exactPolygonCoverage: textureOnly || (
            String(near.coverageMode ?? '').startsWith('exact_polygon')
            && String(near.boundarySignature ?? '').startsWith('grass-coverage-v2-')
        ),
        completeEligibleBins: textureOnly || Number(near.unrepresentedEligibleBins) === 0,
        exactPostcheckClean: textureOnly || (
            Number(near.exactPostcheckFailures) === 0
            && Number(near.ineligibleRoots) === 0
            && Number(near.sidewalkIntrusions ?? near.sidewalkRootIntrusions ?? 0) === 0
            && Number(near.treeIntrusions ?? near.treeRootIntrusions ?? 0) === 0
        ),
        stationaryUploadsZero: textureOnly
            || near.stationaryUploadsZero === true
            || Number(near.stationaryBufferUpdates) === 0,
        opaqueCoverageCap: coverage.opaqueCap === true
            && coverage.transparentSurface === false
            && coverage.alphaTestedSurface !== true,
        combinedTriangleBudget: combinedVisibleGrassTriangles <= 200000
    };
    return {
        expectedMode,
        combinedVisibleGrassTriangles,
        unrepresentedEligibleBins: Number(near.unrepresentedEligibleBins ?? 0),
        checks,
        pass: Object.values(checks).every(Boolean)
    };
}

export function evaluateNearPairs(captures) {
    const expectedPairIds = buildNearCaptureRecipes()
        .filter((recipe) => recipe.nearEvidenceMode === 'texture_only')
        .map((recipe) => recipe.pairId);
    const source = Array.isArray(captures) ? captures : [];
    const pairs = expectedPairIds.map((pairId) => {
        const texture = source.find((entry) => entry?.pairId === pairId && entry?.nearEvidenceMode === 'texture_only') ?? null;
        const mesh = source.find((entry) => entry?.pairId === pairId && entry?.nearEvidenceMode === 'near_mesh') ?? null;
        const cameraMatch = !!texture && !!mesh && captureCameraSignature(texture) === captureCameraSignature(mesh);
        const lightingMatch = texture?.lightingPreset === 'daylight' && mesh?.lightingPreset === 'daylight';
        const exposureMatch = Number(texture?.exposure) === Number(mesh?.exposure);
        const qualityMatch = texture?.qualityPreset === 'default' && mesh?.qualityPreset === 'default';
        const dimensionsMatch = texture?.png?.width === WIDTH && texture?.png?.height === HEIGHT
            && mesh?.png?.width === WIDTH && mesh?.png?.height === HEIGHT;
        const textureLuminance = Number(texture?.frameMetrics?.medianLuminance);
        const meshLuminance = Number(mesh?.frameMetrics?.medianLuminance);
        const luminanceRatio = textureLuminance > 0 ? meshLuminance / textureLuminance : null;
        const luminanceMatch = Number.isFinite(luminanceRatio) && luminanceRatio >= 0.9 && luminanceRatio <= 1.1;
        const representationPass = texture?.representationApproval?.pass === true && mesh?.representationApproval?.pass === true;
        const clipValues = [
            mesh?.nearDiagnostics?.boundaryRoots,
            mesh?.nearDiagnostics?.clippedRoots,
            mesh?.nearDiagnostics?.sidewalkRejectedRoots
        ];
        const hasClipDiagnostics = clipValues.every((value) => Number.isFinite(Number(value)));
        const clippingEvidence = pairId !== 'physical_cut_side_profile'
            || !hasClipDiagnostics
            || clipValues.every((value) => Number(value) > 0);
        const textureCombinedTriangles = Number(
            texture?.cost?.combinedVisibleGrassTriangles
            ?? texture?.representationApproval?.combinedVisibleGrassTriangles
        );
        const meshCombinedTriangles = Number(
            mesh?.cost?.combinedVisibleGrassTriangles
            ?? mesh?.representationApproval?.combinedVisibleGrassTriangles
        );
        const combinedBudgetMatch = textureCombinedTriangles <= 200000
            && meshCombinedTriangles <= 200000;
        return {
            pairId,
            cameraMatch,
            lightingMatch,
            exposureMatch,
            qualityMatch,
            dimensionsMatch,
            luminanceRatio,
            luminanceMatch,
            representationPass,
            clippingEvidence,
            combinedBudgetMatch,
            pass: cameraMatch
                && lightingMatch
                && exposureMatch
                && qualityMatch
                && dimensionsMatch
                && luminanceMatch
                && representationPass
                && clippingEvidence
                && combinedBudgetMatch
        };
    });
    return { expectedPairIds, pairs, pass: pairs.every((pair) => pair.pass) };
}

function paethPredictor(left, up, upperLeft) {
    const prediction = left + up - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const diagonalDistance = Math.abs(prediction - upperLeft);
    if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
    return upDistance <= diagonalDistance ? up : upperLeft;
}

function decodePngPixels(buffer) {
    const dimensions = readPngDimensions(buffer);
    const bitDepth = buffer[24];
    const colorType = buffer[25];
    const interlace = buffer[28];
    if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
        throw new Error(`[GrassLabCapture] Unsupported PNG layout: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
    }
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const idatChunks = [];
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buffer.length) throw new Error('[GrassLabCapture] Truncated PNG chunk.');
        if (type === 'IDAT') idatChunks.push(buffer.subarray(dataStart, dataEnd));
        offset = dataEnd + 4;
        if (type === 'IEND') break;
    }
    if (!idatChunks.length) throw new Error('[GrassLabCapture] PNG has no IDAT data.');
    const encoded = inflateSync(Buffer.concat(idatChunks));
    const stride = dimensions.width * bytesPerPixel;
    const expectedBytes = (stride + 1) * dimensions.height;
    if (encoded.length !== expectedBytes) throw new Error('[GrassLabCapture] PNG scanline size is invalid.');
    const pixels = Buffer.allocUnsafe(stride * dimensions.height);
    let sourceOffset = 0;
    for (let y = 0; y < dimensions.height; y += 1) {
        const filter = encoded[sourceOffset];
        sourceOffset += 1;
        const rowOffset = y * stride;
        for (let x = 0; x < stride; x += 1) {
            const raw = encoded[sourceOffset + x];
            const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
            const up = y > 0 ? pixels[rowOffset + x - stride] : 0;
            const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset + x - stride - bytesPerPixel] : 0;
            let value = raw;
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += Math.floor((left + up) / 2);
            else if (filter === 4) value += paethPredictor(left, up, upperLeft);
            else if (filter !== 0) throw new Error(`[GrassLabCapture] Unsupported PNG filter: ${filter}.`);
            pixels[rowOffset + x] = value & 0xff;
        }
        sourceOffset += stride;
    }
    return { ...dimensions, bytesPerPixel, pixels };
}

function resolveNormalizedRoi(width, height, roi) {
    const source = roi && typeof roi === 'object' ? roi : {};
    const x = Number(source.x);
    const y = Number(source.y);
    const roiWidth = Number(source.width);
    const roiHeight = Number(source.height);
    if (![x, y, roiWidth, roiHeight].every(Number.isFinite)
        || x < 0 || y < 0 || roiWidth <= 0 || roiHeight <= 0 || x >= 1 || y >= 1) {
        throw new Error(`[GrassLabCapture] Invalid normalized ROI: ${JSON.stringify(roi)}`);
    }
    const sourceX = Math.max(0, Math.round(width * x));
    const sourceY = Math.max(0, Math.round(height * y));
    const sourceWidth = Math.max(1, Math.min(width - sourceX, Math.round(width * roiWidth)));
    const sourceHeight = Math.max(1, Math.min(height - sourceY, Math.round(height * roiHeight)));
    return { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight };
}

function pixelLuminance(decoded, x, y) {
    const index = (y * decoded.width + x) * decoded.bytesPerPixel;
    return (
        0.2126 * decoded.pixels[index]
        + 0.7152 * decoded.pixels[index + 1]
        + 0.0722 * decoded.pixels[index + 2]
    ) / 255;
}

export function measurePngFrame(buffer, roi = TURF_ROI) {
    const decoded = decodePngPixels(buffer);
    const source = resolveNormalizedRoi(decoded.width, decoded.height, roi);
    const sourceX = source.x;
    const sourceY = source.y;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const histogram = new Uint32Array(256);
    let luminanceSum = 0;
    let saturationSum = 0;
    let brightPixels = 0;
    for (let y = sourceY; y < sourceY + sourceHeight; y += 1) {
        for (let x = sourceX; x < sourceX + sourceWidth; x += 1) {
            const index = (y * decoded.width + x) * decoded.bytesPerPixel;
            const red = decoded.pixels[index] / 255;
            const green = decoded.pixels[index + 1] / 255;
            const blue = decoded.pixels[index + 2] / 255;
            const maximum = Math.max(red, green, blue);
            const minimum = Math.min(red, green, blue);
            const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
            histogram[Math.max(0, Math.min(255, Math.round(luminance * 255)))] += 1;
            luminanceSum += luminance;
            saturationSum += maximum > 0 ? (maximum - minimum) / maximum : 0;
            if (luminance >= 0.9) brightPixels += 1;
        }
    }
    const pixelCount = sourceWidth * sourceHeight;
    const midpoint = Math.ceil(pixelCount * 0.5);
    let cumulative = 0;
    let medianBin = 0;
    for (let index = 0; index < histogram.length; index += 1) {
        cumulative += histogram[index];
        if (cumulative >= midpoint) {
            medianBin = index;
            break;
        }
    }
    const round = (value) => Math.round(value * 100000) / 100000;
    return {
        roiNormalized: { ...roi },
        roiSourcePixels: { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight },
        sampleWidth: sourceWidth,
        sampleHeight: sourceHeight,
        meanLuminance: round(luminanceSum / pixelCount),
        medianLuminance: round(medianBin / 255),
        meanSaturation: round(saturationSum / pixelCount),
        brightPixelFraction: round(brightPixels / pixelCount)
    };
}

export function measureCardBandPair(geometryBuffer, textureBuffer, roi = CARD_BAND_ROI) {
    const geometry = decodePngPixels(geometryBuffer);
    const texture = decodePngPixels(textureBuffer);
    if (geometry.width !== texture.width || geometry.height !== texture.height) {
        throw new Error(
            `[GrassLabCapture] Card-band pair dimensions differ: geometry=${geometry.width}x${geometry.height}, `
            + `texture=${texture.width}x${texture.height}.`
        );
    }
    const source = resolveNormalizedRoi(geometry.width, geometry.height, roi);
    if (source.height < CARD_BAND_GATE_CONTRACT.smoothingRows) {
        throw new Error(
            `[GrassLabCapture] Card-band ROI must contain at least ${CARD_BAND_GATE_CONTRACT.smoothingRows} pixel rows.`
        );
    }
    const rowDarkenedFractions = [];
    let darkenedPixelCount = 0;
    for (let y = source.y; y < source.y + source.height; y += 1) {
        let rowDarkenedPixels = 0;
        for (let x = source.x; x < source.x + source.width; x += 1) {
            const geometryLuminance = pixelLuminance(geometry, x, y);
            const textureLuminance = pixelLuminance(texture, x, y);
            if (geometryLuminance < CARD_BAND_GATE_CONTRACT.geometryToTextureRatio * textureLuminance
                && textureLuminance - geometryLuminance > CARD_BAND_GATE_CONTRACT.minimumLuminanceDelta) {
                rowDarkenedPixels += 1;
            }
        }
        darkenedPixelCount += rowDarkenedPixels;
        rowDarkenedFractions.push(rowDarkenedPixels / source.width);
    }
    const smoothingRows = CARD_BAND_GATE_CONTRACT.smoothingRows;
    let rollingSum = rowDarkenedFractions.slice(0, smoothingRows).reduce((sum, value) => sum + value, 0);
    let maximumSmoothedFraction = rollingSum / smoothingRows;
    let maximumWindowIndex = 0;
    for (let index = smoothingRows; index < rowDarkenedFractions.length; index += 1) {
        rollingSum += rowDarkenedFractions[index] - rowDarkenedFractions[index - smoothingRows];
        const smoothed = rollingSum / smoothingRows;
        if (smoothed > maximumSmoothedFraction) {
            maximumSmoothedFraction = smoothed;
            maximumWindowIndex = index - smoothingRows + 1;
        }
    }
    const round = (value) => Math.round(value * 100000) / 100000;
    const smoothedMaximumDarkenedFraction = round(maximumSmoothedFraction);
    return {
        roiNormalized: { ...roi },
        roiSourcePixels: { ...source },
        imageDimensions: { width: geometry.width, height: geometry.height },
        criterion: {
            geometryToTextureRatioExclusiveMax: CARD_BAND_GATE_CONTRACT.geometryToTextureRatio,
            textureMinusGeometryExclusiveMin: CARD_BAND_GATE_CONTRACT.minimumLuminanceDelta
        },
        smoothingRows,
        darkenedPixelFraction: round(darkenedPixelCount / (source.width * source.height)),
        maximumRawRowDarkenedFraction: round(Math.max(...rowDarkenedFractions)),
        maximumSmoothedRowDarkenedFraction: smoothedMaximumDarkenedFraction,
        maximumWindowSourceRows: {
            start: source.y + maximumWindowIndex,
            endInclusive: source.y + maximumWindowIndex + smoothingRows - 1
        },
        maximumAllowedDarkenedFraction: CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction,
        pass: maximumSmoothedFraction <= CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction + 1e-12
    };
}

function captureCameraSignature(capture) {
    const camera = capture?.camera ?? null;
    return JSON.stringify(camera ? {
        position: camera.position ?? null,
        target: camera.target ?? null,
        fovDegrees: camera.fovDegrees ?? null,
        aspect: camera.aspect ?? null,
        nearMeters: camera.nearMeters ?? null,
        farMeters: camera.farMeters ?? null
    } : null);
}

export function evaluateBoundaryRepresentationSnapshot(snapshot, expectedMode) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const boundary = source.boundaryEvidence && typeof source.boundaryEvidence === 'object'
        ? source.boundaryEvidence
        : {};
    const coverage = source.coverage && typeof source.coverage === 'object' ? source.coverage : {};
    const final = expectedMode === 'boundary_final';
    const substrateOnly = expectedMode === 'substrate_only';
    const coverageDrawCalls = Number(coverage.logicalDrawCalls ?? coverage.drawCalls);
    const coverageTriangles = Number(coverage.triangles);
    const sourceLoopIdentity = String(coverage.sourceLoopIdentity ?? source?.fixtures?.sourceLoopIdentity ?? '');
    const grassOnsetWidthMeters = Number(coverage.grassOnsetWidthMeters);
    const checks = {
        supportedMode: final || substrateOnly,
        modeMatch: boundary.mode === expectedMode,
        legacyGeometryHidden: boundary.legacyGeometryHidden === true,
        grassEngineHidden: boundary.grassEngineVisible === false,
        coverageVisibilityMatch: boundary.coverageVisible === final,
        substrateHasNoGrassGeometry: !substrateOnly || (coverageDrawCalls === 0 && coverageTriangles === 0),
        finalHasCoverageGeometry: !final || (
            coverageDrawCalls > 0
            && coverageTriangles > 0
            && Number(coverage.capTriangles) > 0
            && Number(coverage.edgeTriangles) > 0
        ),
        finalUsesAtMostTwoCoverageDraws: !final || (
            coverageDrawCalls <= 2
            && Number(coverage.physicalEdgeLogicalDraws) <= 1
        ),
        finalUsesOpaqueCap: !final || (
            coverage.opaqueCap === true
            && coverage.transparentSurface === false
            && coverage.alphaTestedSurface === false
        ),
        finalUsesExactSourceIdentity: !final || sourceLoopIdentity.length > 0,
        finalUsesApprovedSidewalkReveal: !final || (
            grassOnsetWidthMeters >= 0.06
            && grassOnsetWidthMeters <= 0.10
            && Number(coverage.sidewalkOnsetDistanceMinMeters) >= 0.06 - 1e-6
            && Number(coverage.sidewalkOnsetDistanceMaxMeters) <= 0.10 + 1e-6
        ),
        finalUsesApprovedStructuralBase: !final || (
            Number(coverage.structuralBaseHeightMeters) >= 0.025
            && Number(coverage.structuralBaseHeightMeters) <= 0.030
        ),
        finalKeepsVisibleTipsSeparate: !final || (
            Number(coverage.visibleBladeTipMinMeters) >= 0.040
            && Number(coverage.visibleBladeTipMaxMeters) <= 0.075
            && Number(coverage.visibleBladeTipMaxMeters) > Number(coverage.structuralBaseHeightMeters)
        ),
        finalCapsAntialiasWidth: !final || Number(coverage.antialiasWidthMeters) <= 0.015,
        finalIncludesApprovalShapes: !final || (
            Number(coverage.diagonalSegments) > 0
            && Number(coverage.curvedSegments) > 0
            && Number(coverage.insideCorners) > 0
            && Number(coverage.outsideCorners) > 0
            && Number(coverage.treeBaseSegments) > 0
        ),
        finalStaysWithinBoundaryTolerance: !final || Number(coverage.maxBoundaryDeviationMeters) <= 0.020 + 1e-6,
        finalHasNoHardExclusionIntrusions: !final || Number(coverage.hardExclusionIntrusions) === 0,
        finalHasNoGrassOnsetIntrusions: !final || Number(coverage.grassOnsetIntrusions) === 0,
        finalHasNoIneligibleRoots: !final || Number(coverage.ineligibleCutEdgeRoots) === 0
    };
    return {
        expectedMode,
        noNearMidAccentRepresentation: checks.legacyGeometryHidden && checks.grassEngineHidden,
        coverageDrawCalls: Number.isFinite(coverageDrawCalls) ? coverageDrawCalls : null,
        coverageTriangles: Number.isFinite(coverageTriangles) ? coverageTriangles : null,
        sourceLoopIdentity,
        grassOnsetWidthMeters: Number.isFinite(grassOnsetWidthMeters) ? grassOnsetWidthMeters : null,
        checks,
        pass: Object.values(checks).every(Boolean)
    };
}

export function evaluateBoundaryPairs(captures) {
    const expectedPairIds = buildBoundaryCaptureRecipes()
        .filter((recipe) => recipe.evidenceMode === 'substrate_only')
        .map((recipe) => recipe.pairId);
    const source = Array.isArray(captures) ? captures : [];
    const pairs = expectedPairIds.map((pairId) => {
        const substrate = source.find((entry) => entry?.pairId === pairId && entry?.evidenceMode === 'substrate_only') ?? null;
        const final = source.find((entry) => entry?.pairId === pairId && entry?.evidenceMode === 'boundary_final') ?? null;
        const cameraMatch = !!substrate && !!final && captureCameraSignature(substrate) === captureCameraSignature(final);
        const lightingMatch = substrate?.lightingPreset === final?.lightingPreset && substrate?.lightingPreset === 'daylight';
        const exposureMatch = Number.isFinite(Number(substrate?.exposure))
            && Number(substrate?.exposure) === Number(final?.exposure);
        const qualityMatch = substrate?.qualityPreset === 'low' && final?.qualityPreset === 'low';
        const dimensionsMatch = substrate?.png?.width === WIDTH
            && substrate?.png?.height === HEIGHT
            && final?.png?.width === WIDTH
            && final?.png?.height === HEIGHT;
        const substrateApproval = substrate?.representationApproval ?? null;
        const finalApproval = final?.representationApproval ?? null;
        const alignment = {
            cameraMatch,
            lightingMatch,
            exposureMatch,
            qualityMatch,
            dimensionsMatch,
            pass: cameraMatch && lightingMatch && exposureMatch && qualityMatch && dimensionsMatch
        };
        return {
            pairId,
            substrateRecipeId: substrate?.recipeId ?? null,
            finalRecipeId: final?.recipeId ?? null,
            alignment,
            substrateApproval,
            finalApproval,
            boundaryCost: final ? {
                capTriangles: final.cost?.coverageCapTriangles ?? null,
                edgeTriangles: final.cost?.coverageEdgeTriangles ?? null,
                totalTriangles: final.cost?.coverageTriangles ?? null,
                logicalDrawCalls: final.cost?.coverageLogicalDrawCalls ?? null
            } : null,
            pass: !!substrate && !!final && alignment.pass
                && substrateApproval?.pass === true
                && finalApproval?.pass === true
        };
    });
    const recipeIds = source.map((entry) => entry?.recipeId).filter(Boolean);
    const exactCaptureSet = source.length === expectedPairIds.length * 2
        && new Set(recipeIds).size === expectedPairIds.length * 2;
    const sourceLoopIdentities = [...new Set(source
        .map((entry) => entry?.representationApproval?.sourceLoopIdentity)
        .filter(Boolean))];
    return {
        gateId: 'grass-boundary-paired-approval-v1',
        requiredResolution: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        requiredQualityPreset: 'low',
        requiredPairCount: expectedPairIds.length,
        captureCount: source.length,
        exactCaptureSet,
        sourceLoopIdentities,
        stableSourceLoopIdentity: sourceLoopIdentities.length === 1,
        pairs,
        pass: exactCaptureSet && sourceLoopIdentities.length === 1 && pairs.every((pair) => pair.pass)
    };
}

function captureBuffer(pngByRecipe, recipeId) {
    if (pngByRecipe instanceof Map) return pngByRecipe.get(recipeId) ?? null;
    if (pngByRecipe && typeof pngByRecipe === 'object') return pngByRecipe[recipeId] ?? null;
    return null;
}

export function evaluateCardBandPairs(captures, pngByRecipe) {
    const byId = new Map((Array.isArray(captures) ? captures : []).map((entry) => [entry?.recipeId, entry]));
    const pairs = NEUTRAL_PAIR_DEFINITIONS.map((definition) => {
        const geometry = byId.get(definition.geometry) ?? null;
        const texture = byId.get(definition.texture) ?? null;
        const geometryPng = captureBuffer(pngByRecipe, definition.geometry);
        const texturePng = captureBuffer(pngByRecipe, definition.texture);
        if (!geometry || !texture || !Buffer.isBuffer(geometryPng) || !Buffer.isBuffer(texturePng)) {
            throw new Error(`[GrassLabCapture] Missing card-band evidence pair for ${definition.lighting}.`);
        }
        const cameraMatch = !!geometry.camera
            && !!texture.camera
            && captureCameraSignature(geometry) === captureCameraSignature(texture);
        const lightingMatch = geometry.lightingPreset === definition.lighting
            && texture.lightingPreset === definition.lighting;
        const geometryExposure = Number(geometry.exposure);
        const textureExposure = Number(texture.exposure);
        const exposureMatch = Number.isFinite(geometryExposure)
            && Number.isFinite(textureExposure)
            && geometryExposure === textureExposure;
        const measurement = measureCardBandPair(geometryPng, texturePng);
        const alignment = {
            cameraMatch,
            lightingMatch,
            exposureMatch,
            pixelDimensionsMatch: true,
            pass: cameraMatch && lightingMatch && exposureMatch
        };
        return {
            lighting: definition.lighting,
            geometryRecipeId: definition.geometry,
            textureRecipeId: definition.texture,
            alignment,
            ...measurement,
            pass: alignment.pass && measurement.pass
        };
    });
    return {
        gateId: 'live-field-card-band-v1',
        sampleScope: 'height_050_live_field_cards',
        materialFixtureAutomation: 'human-evidence-only',
        roiNormalized: { ...CARD_BAND_ROI },
        maximumAllowedDarkenedFraction: CARD_BAND_GATE_CONTRACT.maximumDarkenedFraction,
        pairs,
        pass: pairs.every((pair) => pair.pass)
    };
}

export function evaluateLuminancePairs(captures) {
    const byId = new Map((Array.isArray(captures) ? captures : []).map((entry) => [entry?.recipeId, entry]));
    const pairs = NEUTRAL_PAIR_DEFINITIONS.map((definition) => {
        const geometry = byId.get(definition.geometry) ?? null;
        const texture = byId.get(definition.texture) ?? null;
        const geometryMedian = Number(geometry?.frameMetrics?.medianLuminance);
        const textureMedian = Number(texture?.frameMetrics?.medianLuminance);
        const ratio = Number.isFinite(geometryMedian) && Number.isFinite(textureMedian) && textureMedian > 0
            ? geometryMedian / textureMedian
            : null;
        return {
            lighting: definition.lighting,
            geometryRecipeId: definition.geometry,
            textureRecipeId: definition.texture,
            geometryMedianLuminance: Number.isFinite(geometryMedian) ? geometryMedian : null,
            textureMedianLuminance: Number.isFinite(textureMedian) ? textureMedian : null,
            ratio: ratio === null ? null : Math.round(ratio * 100000) / 100000,
            pass: ratio !== null && ratio >= 0.9 && ratio <= 1.1
        };
    });
    return {
        roiNormalized: { ...TURF_ROI },
        requiredRatio: { min: 0.9, max: 1.1 },
        pairs,
        pass: pairs.every((pair) => pair.pass)
    };
}

export function readPngDimensions(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24) throw new Error('[GrassLabCapture] PNG is too small.');
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.subarray(0, 8).equals(signature)) throw new Error('[GrassLabCapture] File is not a lossless PNG.');
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('[GrassLabCapture] PNG is missing IHDR.');
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

export function mergeCaptureManifest(existing, phase, captures, diagnostics = null, options = null) {
    const previous = existing && typeof existing === 'object' ? existing : {};
    const replaceRecipeIds = Array.isArray(options?.replaceRecipeIds)
        ? new Set(options.replaceRecipeIds)
        : null;
    const retained = Array.isArray(previous.captures)
        ? previous.captures.filter((entry) => (
            entry?.phase !== phase
            || (replaceRecipeIds && !replaceRecipeIds.has(entry?.recipeId))
        ))
        : [];
    return {
        schema: 'grass-lab-capture-manifest-v2',
        generatedAt: new Date().toISOString(),
        requiredDrawingBuffer: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        captures: [...retained, ...captures],
        diagnosticsByPhase: {
            ...(previous.diagnosticsByPhase && typeof previous.diagnosticsByPhase === 'object' ? previous.diagnosticsByPhase : {}),
            [phase]: diagnostics
        },
        luminanceGateByPhase: {
            ...(previous.luminanceGateByPhase && typeof previous.luminanceGateByPhase === 'object' ? previous.luminanceGateByPhase : {}),
            [phase]: diagnostics?.luminanceGate ?? null
        },
        cardBandGateByPhase: {
            ...(previous.cardBandGateByPhase && typeof previous.cardBandGateByPhase === 'object' ? previous.cardBandGateByPhase : {}),
            [phase]: diagnostics?.cardBandGate ?? null
        },
        boundaryGateByPhase: {
            ...(previous.boundaryGateByPhase && typeof previous.boundaryGateByPhase === 'object' ? previous.boundaryGateByPhase : {}),
            [phase]: diagnostics?.boundaryGate ?? null
        },
        nearGateByPhase: {
            ...(previous.nearGateByPhase && typeof previous.nearGateByPhase === 'object' ? previous.nearGateByPhase : {}),
            [phase]: diagnostics?.nearGate ?? null
        },
        lodAppearanceGateByPhase: {
            ...(previous.lodAppearanceGateByPhase && typeof previous.lodAppearanceGateByPhase === 'object'
                ? previous.lodAppearanceGateByPhase
                : {}),
            [phase]: diagnostics?.lodAppearanceGate ?? null
        },
        lodPerformanceGateByPhase: {
            ...(previous.lodPerformanceGateByPhase && typeof previous.lodPerformanceGateByPhase === 'object'
                ? previous.lodPerformanceGateByPhase
                : {}),
            [phase]: diagnostics?.lodPerformanceGate ?? null
        },
        lodGateByPhase: {
            ...(previous.lodGateByPhase && typeof previous.lodGateByPhase === 'object' ? previous.lodGateByPhase : {}),
            [phase]: diagnostics?.lodGate ?? null
        },
        ai362PerformanceGateByPhase: {
            ...(previous.ai362PerformanceGateByPhase && typeof previous.ai362PerformanceGateByPhase === 'object'
                ? previous.ai362PerformanceGateByPhase
                : {}),
            [phase]: diagnostics?.ai362PerformanceGate ?? null
        },
        ai362BaselineReferenceByPhase: {
            ...(previous.ai362BaselineReferenceByPhase && typeof previous.ai362BaselineReferenceByPhase === 'object'
                ? previous.ai362BaselineReferenceByPhase
                : {}),
            [phase]: diagnostics?.ai362BaselineReference ?? null
        },
        ai362Native4kTimingByPhase: {
            ...(previous.ai362Native4kTimingByPhase && typeof previous.ai362Native4kTimingByPhase === 'object'
                ? previous.ai362Native4kTimingByPhase
                : {}),
            [phase]: diagnostics?.ai362Native4kTiming ?? null
        },
        ai362RegressionGateByPhase: {
            ...(previous.ai362RegressionGateByPhase && typeof previous.ai362RegressionGateByPhase === 'object'
                ? previous.ai362RegressionGateByPhase
                : {}),
            [phase]: diagnostics?.ai362RegressionGate ?? null
        },
        ai362GateByPhase: {
            ...(previous.ai362GateByPhase && typeof previous.ai362GateByPhase === 'object'
                ? previous.ai362GateByPhase
                : {}),
            [phase]: diagnostics?.ai362Gate ?? null
        }
    };
}

export function summarizeSettledMaterialVersion(switchResult, captures) {
    const source = switchResult && typeof switchResult === 'object' ? switchResult : {};
    const settled = Array.isArray(captures)
        ? captures.find((entry) => entry?.materialDiagnostics && typeof entry.materialDiagnostics === 'object')
        : null;
    return {
        ...source,
        materialVersion: settled?.materialVersion ?? source.materialVersion ?? null,
        result: settled?.materialDiagnostics ?? source.result ?? null
    };
}

async function readExistingManifest(manifestPath) {
    if (!(await pathExists(manifestPath))) return null;
    return JSON.parse(await readFile(manifestPath, 'utf8'));
}

export async function verifyAi362MeasurementsOnlyManifest(manifest, outputRoot, options = null) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('[GrassLabCapture] AI362 measurements-only requires an existing capture manifest.');
    }
    if (manifest.schema !== 'grass-lab-capture-manifest-v2') {
        throw new Error('[GrassLabCapture] AI362 measurements-only requires capture manifest schema V2.');
    }
    if (
        manifest.requiredDrawingBuffer?.width !== WIDTH
        || manifest.requiredDrawingBuffer?.height !== HEIGHT
        || manifest.requiredDrawingBuffer?.pixelRatio !== 1
    ) {
        throw new Error(`[GrassLabCapture] AI362 measurements-only requires ${WIDTH}x${HEIGHT}@1 manifest metadata.`);
    }
    const absoluteOutputRoot = path.resolve(String(outputRoot ?? ''));
    const outputRelativeNative = path.relative(REPO_ROOT, absoluteOutputRoot);
    if (!outputRoot || !outputRelativeNative || outputRelativeNative.startsWith('..') || path.isAbsolute(outputRelativeNative)) {
        throw new Error('[GrassLabCapture] AI362 measurements-only output must be a repository-local subdirectory.');
    }
    const outputRelative = outputRelativeNative.replaceAll('\\', '/');
    const recipes = buildAi362ValidationRecipes();
    const entries = Array.isArray(manifest.captures) ? manifest.captures : [];
    if (entries.length !== recipes.length) {
        throw new Error(`[GrassLabCapture] AI362 measurements-only requires exactly ${recipes.length} manifest captures; found ${entries.length}.`);
    }
    const expectedRecipeIds = new Set(recipes.map((recipe) => recipe.id));
    const entriesByRecipeId = new Map();
    for (const entry of entries) {
        if (entry?.phase !== 'after' || entry?.matrix !== VALIDATION_MATRIX) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only found an unexpected phase/matrix entry: ${entry?.recipeId ?? 'unknown'}.`);
        }
        if (!expectedRecipeIds.has(entry?.recipeId)) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only found unexpected recipe: ${entry?.recipeId ?? 'unknown'}.`);
        }
        if (entriesByRecipeId.has(entry.recipeId)) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only found duplicate recipe: ${entry.recipeId}.`);
        }
        entriesByRecipeId.set(entry.recipeId, entry);
    }
    const missingRecipeIds = recipes
        .map((recipe) => recipe.id)
        .filter((recipeId) => !entriesByRecipeId.has(recipeId));
    if (missingRecipeIds.length > 0) {
        throw new Error(`[GrassLabCapture] AI362 measurements-only is missing recipes: ${missingRecipeIds.join(', ')}.`);
    }
    const readPng = typeof options?.readFile === 'function' ? options.readFile : readFile;
    const verifiedCaptures = [];
    for (const recipe of recipes) {
        const entry = entriesByRecipeId.get(recipe.id);
        const expectedFile = path.posix.join(outputRelative, `after_${recipe.id}.png`);
        if (entry.file !== expectedFile) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only recipe ${recipe.id} must use output-local file ${expectedFile}.`);
        }
        const filePath = path.resolve(REPO_ROOT, entry.file);
        const relativeToOutput = path.relative(absoluteOutputRoot, filePath);
        if (!relativeToOutput || relativeToOutput.startsWith('..') || path.isAbsolute(relativeToOutput)) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only recipe ${recipe.id} resolves outside its output directory.`);
        }
        if (
            entry.png?.width !== WIDTH
            || entry.png?.height !== HEIGHT
            || entry.png?.format !== 'png'
            || entry.png?.lossless !== true
            || entry.canvas?.drawingBufferWidth !== WIDTH
            || entry.canvas?.drawingBufferHeight !== HEIGHT
            || entry.canvas?.rendererPixelRatio !== 1
        ) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only recipe ${recipe.id} lacks exact native lossless PNG/canvas metadata.`);
        }
        if (!/^[a-f0-9]{64}$/.test(String(entry.contentSha256 ?? ''))) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only recipe ${recipe.id} lacks a valid SHA-256.`);
        }
        let png;
        try {
            png = await readPng(filePath);
        } catch (error) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only PNG is missing for recipe ${recipe.id}: ${entry.file}.`, { cause: error });
        }
        let dimensions;
        try {
            dimensions = readPngDimensions(png);
        } catch (error) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only file is not a lossless PNG for recipe ${recipe.id}: ${entry.file}.`, { cause: error });
        }
        if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only PNG for recipe ${recipe.id} is ${dimensions.width}x${dimensions.height}, expected ${WIDTH}x${HEIGHT}.`);
        }
        const actualSha256 = createHash('sha256').update(png).digest('hex');
        if (actualSha256 !== entry.contentSha256) {
            throw new Error(`[GrassLabCapture] AI362 measurements-only SHA-256 mismatch for recipe ${recipe.id}.`);
        }
        verifiedCaptures.push(entry);
    }
    return verifiedCaptures;
}

export function evaluateAi362BaselineReference(manifest, options = null) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    const requiredRecipeIds = [...new Set(buildAi362ValidationRecipes()
        .map((recipe) => recipe.baselineRecipeId)
        .filter(Boolean))].sort();
    const captures = Array.isArray(source.captures) ? source.captures : [];
    const fileVerifications = new Map((Array.isArray(options?.fileVerifications)
        ? options.fileVerifications
        : []).map((entry) => [entry?.recipeId, entry]));
    const checks = requiredRecipeIds.map((recipeId) => {
        const matches = captures.filter((entry) => (
            entry?.phase === 'after'
            && entry?.matrix === LOD_MATRIX
            && entry?.recipeId === recipeId
        ));
        const entry = matches.length === 1 ? matches[0] : null;
        const file = fileVerifications.get(recipeId) ?? null;
        const stateMetadataComplete = !!entry
            && isFiniteVector3(entry.camera?.position)
            && isFiniteVector3(entry.camera?.target)
            && Number.isFinite(entry.camera?.heightMeters)
            && hasNonEmptyString(entry.lightingPreset)
            && Number.isFinite(entry.exposure)
            && hasNonEmptyString(entry.qualityPreset);
        const native4kMetadata = entry?.png?.width === WIDTH
            && entry?.png?.height === HEIGHT
            && entry?.canvas?.drawingBufferWidth === WIDTH
            && entry?.canvas?.drawingBufferHeight === HEIGHT
            && entry?.canvas?.rendererPixelRatio === 1;
        const manifestHashRecorded = /^[a-f0-9]{64}$/.test(String(entry?.contentSha256 ?? ''));
        const fileVerified = file?.exists === true
            && file?.losslessPng === true
            && file?.width === WIDTH
            && file?.height === HEIGHT
            && file?.contentSha256 === entry?.contentSha256;
        return {
            recipeId,
            captureCount: matches.length,
            file: entry?.file ?? null,
            contentSha256: entry?.contentSha256 ?? null,
            camera: entry?.camera ?? null,
            lightingPreset: entry?.lightingPreset ?? null,
            exposure: entry?.exposure ?? null,
            qualityPreset: entry?.qualityPreset ?? null,
            frameMetrics: entry?.frameMetrics ?? null,
            stateMetadataComplete,
            native4kMetadata,
            manifestHashRecorded,
            fileVerified,
            pass: matches.length === 1
                && stateMetadataComplete
                && native4kMetadata
                && manifestHashRecorded
                && fileVerified
        };
    });
    const sourceManifestSha256 = String(options?.sourceManifestSha256 ?? '');
    const sourceGate = source?.lodGateByPhase?.after ?? null;
    const sourceGatePass = sourceGate?.pass === true && sourceGate?.visualFunctionalPass === true;
    const pass = source.schema === 'grass-lab-capture-manifest-v2'
        && /^[a-f0-9]{64}$/.test(sourceManifestSha256)
        && sourceGatePass
        && checks.length > 0
        && checks.every((entry) => entry.pass);
    return {
        mode: 'completed_ai361_final_manifest',
        sourceManifest: AI362_BASELINE_MANIFEST,
        sourcePhase: 'after',
        schema: source.schema ?? null,
        sourceManifestSha256,
        requiredRecipeIds,
        requiredRecipeCount: requiredRecipeIds.length,
        sourceGatePass,
        checks,
        pass
    };
}

async function loadAi362BaselineReference() {
    const manifestPath = path.resolve(REPO_ROOT, AI362_BASELINE_MANIFEST);
    const raw = await readFile(manifestPath);
    const manifest = JSON.parse(raw.toString('utf8'));
    const requiredRecipeIds = new Set(buildAi362ValidationRecipes()
        .map((recipe) => recipe.baselineRecipeId)
        .filter(Boolean));
    const fileVerifications = [];
    for (const entry of Array.isArray(manifest.captures) ? manifest.captures : []) {
        if (entry?.phase !== 'after' || entry?.matrix !== LOD_MATRIX || !requiredRecipeIds.has(entry?.recipeId)) continue;
        const filePath = path.resolve(REPO_ROOT, String(entry.file ?? ''));
        const relative = path.relative(REPO_ROOT, filePath);
        if (!entry.file || relative.startsWith('..') || path.isAbsolute(relative)) {
            fileVerifications.push({ recipeId: entry?.recipeId, exists: false });
            continue;
        }
        try {
            const png = await readFile(filePath);
            const dimensions = readPngDimensions(png);
            fileVerifications.push({
                recipeId: entry.recipeId,
                exists: true,
                losslessPng: true,
                width: dimensions.width,
                height: dimensions.height,
                contentSha256: createHash('sha256').update(png).digest('hex')
            });
        } catch {
            fileVerifications.push({ recipeId: entry?.recipeId, exists: false });
        }
    }
    return evaluateAi362BaselineReference(manifest, {
        sourceManifestSha256: createHash('sha256').update(raw).digest('hex'),
        fileVerifications
    });
}

async function captureRecipe(page, outputRoot, outputRelative, phase, recipe, overwrite) {
    const filename = `${phase}_${recipe.id}.png`;
    const outputPath = path.join(outputRoot, filename);
    if (!overwrite && await pathExists(outputPath)) {
        throw new Error(`[GrassLabCapture] Refusing to overwrite ${path.relative(REPO_ROOT, outputPath)}; pass --overwrite.`);
    }
    const motionSetup = await page.evaluate(async (next) => {
        const lab = window.__grassLab;
        let lodHysteresisReset = false;
        lab.setQualityPreset(next.quality);
        if (next.nearEvidenceMode) {
            lab.setBoundaryEvidenceMode(null);
            lab.setNearEvidenceMode(next.nearEvidenceMode);
            lab.setLighting(next.lighting);
            if (next.boundaryTarget) lab.focusBoundaryCamera(next.boundaryTarget, next.heightMeters, next.distanceMeters);
            else lab.focusCamera(next.camera);
        } else if (next.evidenceMode) {
            lab.setNearEvidenceMode(null);
            lab.setLighting(next.lighting);
            lab.setBoundaryEvidenceMode(next.evidenceMode);
            lab.focusBoundaryCamera(next.boundaryTarget, next.heightMeters, next.distanceMeters);
        } else if (next.material) {
            lab.setNearEvidenceMode(null);
            lab.setMaterialLighting(next.lighting);
            lab.focusMaterialFixture({ grazing: next.grazing });
        } else {
            lab.setBoundaryEvidenceMode(null);
            lab.setNearEvidenceMode(null);
            lab.setLighting(next.lighting);
            if (next.hierarchyEvidenceMode) {
                if (typeof lab.setHierarchyEvidenceMode !== 'function') {
                    throw new Error('[GrassLabCapture] Hierarchy evidence isolation is unavailable.');
                }
                lab.setHierarchyEvidenceMode(next.hierarchyEvidenceMode);
            } else if (typeof lab.setHierarchyEvidenceMode === 'function') {
                lab.setHierarchyEvidenceMode(null);
            }
            if (next.handoffId && typeof lab.focusHandoff === 'function') {
                lab.focusHandoff(next.handoffId, Number(next.handoffOffsetMeters) || 0);
            } else if (next.accentTarget) lab.focusAccent(next.accentTarget);
            else if (next.boundaryTarget) lab.focusBoundaryCamera(next.boundaryTarget, next.heightMeters, next.distanceMeters);
            else lab.focusCamera(next.camera);
        }
        if (['ai361-lod', 'ai362-validation'].includes(next.matrix) && typeof lab.resetLodHysteresis === 'function') {
            lab.resetLodHysteresis();
            lodHysteresisReset = true;
        }
        lab.resetValidationSamples();
        if (!next.motionPath) return { deterministicSeek: false, lodHysteresisReset };
        if (Number.isFinite(next.motionProgress) && typeof lab.seekMotionPath === 'function') {
            await lab.seekMotionPath(next.motionPath, next.motionProgress);
            return { deterministicSeek: true, lodHysteresisReset };
        }
        lab.startMotionPath(next.motionPath);
        return { deterministicSeek: false, lodHysteresisReset };
    }, recipe);
    if (recipe.motionPath && !motionSetup.deterministicSeek && recipe.motionElapsedMs > 0) {
        await page.waitForTimeout(recipe.motionElapsedMs);
    }
    const settleFrames = recipe.matrix === VALIDATION_MATRIX
        ? 1
        : (recipe.motionPath ? 2 : 30);
    await page.evaluate((frames) => window.__grassLab.settleCaptureFrames(frames), settleFrames);
    const metadata = await page.evaluate((context) => window.__grassLab.getCaptureMetadata(context), {
        phase,
        role: recipe.role,
        recipeId: recipe.id
    });
    const diagnosticOverlayAttached = await page.evaluate((context) => {
        const overlayId = 'grass-ai362-diagnostic-overlay';
        document.getElementById(overlayId)?.remove();
        if (!context.enabled) return false;
        const snapshot = window.__grassLab.getSnapshot();
        const coverage = snapshot?.coverage ?? {};
        const near = snapshot?.grass?.nearCarpet ?? {};
        const field = snapshot?.grass?.midCluster ?? {};
        const accent = snapshot?.grass?.localizedAccents ?? {};
        const lod = snapshot?.lod ?? {};
        const weights = lod.weights ?? {};
        const formatNumber = (value, digits = 3) => Number.isFinite(Number(value))
            ? Number(value).toFixed(digits)
            : 'n/a';
        const overlay = document.createElement('pre');
        overlay.id = overlayId;
        overlay.dataset.captureDiagnosticOverlay = 'ai362';
        overlay.textContent = [
            `AI362 DIAGNOSTIC · ${context.recipeId}`,
            `tier ${lod.activeTier ?? 'n/a'} · transition ${lod.transitionState ?? 'n/a'} ${formatNumber(lod.transitionProgress)}`,
            `weights n ${formatNumber(weights.near)} · b ${formatNumber(weights.billboard)} · m ${formatNumber(weights.middle)} · t ${formatNumber(weights.texture)}`,
            `boundary ${coverage.boundarySignature ?? 'n/a'} · triangles ${coverage.triangles ?? 'n/a'} · draws ${coverage.logicalDrawCalls ?? 'n/a'}`,
            `near ${near.representedBins ?? 'n/a'}/${near.eligibleBins ?? 'n/a'} · missing ${near.unrepresentedEligibleBins ?? 'n/a'} · exact ${near.exactPostcheckFailures ?? 'n/a'}`,
            `field ${field.representedUnits ?? 'n/a'}/${field.eligibleUnits ?? 'n/a'} · missing ${field.unrepresentedEligibleUnits ?? 'n/a'} · overlap ${field.overlapUnits ?? 'n/a'}`,
            `field exact ${field.exactPostcheckFailures ?? 'n/a'}/${field.exactEnvelopeFailures ?? 'n/a'} · cutoff ${field.geometryBeyondCutoff ?? 'n/a'}`,
            `accent ${accent.representedRoots ?? 'n/a'}/${accent.eligibleRoots ?? 'n/a'} · worn ${accent.wornTriangles ?? 'n/a'}t/${accent.wornDrawCalls ?? 'n/a'}d`
        ].join('\n');
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '32px',
            left: '32px',
            zIndex: '2147483647',
            margin: '0',
            padding: '18px 22px',
            maxWidth: '1120px',
            color: '#f2f7ef',
            background: 'rgba(8, 12, 9, 0.88)',
            border: '2px solid rgba(178, 214, 174, 0.92)',
            borderRadius: '8px',
            font: '600 22px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace',
            letterSpacing: '0.01em',
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none'
        });
        document.body.appendChild(overlay);
        return true;
    }, { enabled: recipe.diagnosticOverlay === true, recipeId: recipe.id });
    const element = page.locator('#game-canvas');
    const bounds = await element.boundingBox();
    if (!bounds || Math.round(bounds.width) !== WIDTH || Math.round(bounds.height) !== HEIGHT) {
        throw new Error(`[GrassLabCapture] Canvas bounds are not ${WIDTH}x${HEIGHT}: ${JSON.stringify(bounds)}`);
    }
    try {
        const useFrozenPageClip = recipe.matrix === VALIDATION_MATRIX
            || (recipe.motionPath && !motionSetup.deterministicSeek);
        if (useFrozenPageClip) {
            const session = await page.context().newCDPSession(page);
            await session.send('Page.setWebLifecycleState', { state: 'frozen' });
            try {
                const screenshot = await session.send('Page.captureScreenshot', {
                    format: 'png',
                    fromSurface: true,
                    captureBeyondViewport: false,
                    optimizeForSpeed: true,
                    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 }
                });
                if (typeof screenshot?.data !== 'string' || screenshot.data.length === 0) {
                    throw new Error('[GrassLabCapture] Chrome returned an empty PNG payload.');
                }
                await writeFile(outputPath, Buffer.from(screenshot.data, 'base64'));
            } finally {
                await session.send('Page.setWebLifecycleState', { state: 'active' });
                await session.detach();
            }
        } else {
            await element.screenshot({ path: outputPath, type: 'png', animations: 'disabled' });
        }
    } finally {
        if (diagnosticOverlayAttached) {
            await page.evaluate(() => document.getElementById('grass-ai362-diagnostic-overlay')?.remove());
        }
    }
    const png = await readFile(outputPath);
    const dimensions = readPngDimensions(png);
    if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
        throw new Error(`[GrassLabCapture] Screenshot is ${dimensions.width}x${dimensions.height}, expected ${WIDTH}x${HEIGHT}.`);
    }
    const frameMetrics = measurePngFrame(png);
    const snapshot = metadata.snapshot ?? {};
    const hierarchyMatrix = recipe.matrix === LOD_MATRIX || recipe.matrix === VALIDATION_MATRIX;
    const representationApproval = recipe.nearEvidenceMode
        ? evaluateNearRepresentationSnapshot(snapshot, recipe.nearEvidenceMode)
        : (recipe.evidenceMode ? evaluateBoundaryRepresentationSnapshot(snapshot, recipe.evidenceMode) : null);
    return {
        png,
        entry: {
            phase,
            matrix: recipe.matrix ?? (recipe.nearEvidenceMode ? NEAR_MATRIX : (recipe.evidenceMode ? BOUNDARY_MATRIX : MATERIAL_MATRIX)),
            role: recipe.role,
            recipeId: recipe.id,
            pairId: recipe.pairId ?? null,
            evidenceGroup: recipe.evidenceGroup ?? null,
            validationRole: recipe.validationRole ?? null,
            captureVariant: recipe.captureVariant ?? null,
            evidenceIds: [...(recipe.evidenceIds ?? [])],
            approvalDiagnosticSource: recipe.approvalDiagnosticSource === true,
            baselineRecipeId: recipe.baselineRecipeId ?? null,
            repeatOfRecipeId: recipe.repeatOfRecipeId ?? null,
            stationaryHandoff: recipe.stationaryHandoff === true,
            diagnosticOverlay: recipe.diagnosticOverlay === true,
            diagnosticOverlayAttached,
            uiFree: recipe.diagnosticOverlay !== true,
            boundaryView: recipe.boundaryView ?? null,
            boundaryTarget: recipe.boundaryTarget ?? null,
            heightInspectionMeters: recipe.heightInspectionMeters ?? null,
            lightingCriticalRole: recipe.lightingCriticalRole ?? null,
            fallbackMode: recipe.fallbackMode ?? null,
            lightRole: recipe.lightRole ?? null,
            evidenceMode: recipe.evidenceMode ?? null,
            nearEvidenceMode: recipe.nearEvidenceMode ?? null,
            hierarchyEvidenceMode: recipe.hierarchyEvidenceMode ?? null,
            handoffId: recipe.handoffId ?? null,
            handoffOffsetMeters: recipe.handoffOffsetMeters ?? null,
            motionPath: recipe.motionPath ?? null,
            motionElapsedMs: recipe.motionElapsedMs ?? null,
            motionProgress: recipe.motionProgress ?? null,
            motionCheckpoint: recipe.motionCheckpoint ?? null,
            motionDeterministicSeek: motionSetup.deterministicSeek,
            lodHysteresisReset: motionSetup.lodHysteresisReset,
            file: path.posix.join(outputRelative.replaceAll('\\', '/'), filename),
            contentSha256: createHash('sha256').update(png).digest('hex'),
            lightingPreset: recipe.lighting,
            qualityPreset: recipe.quality,
            activeRepresentation: recipe.role,
            activeLodTier: snapshot?.lod?.activeTier ?? null,
            snapshotContractVersion: Number(snapshot?.contractVersion ?? snapshot?.snapshotContractVersion) || null,
            materialVersion: metadata.materialVersion ?? null,
            materialDiagnostics: metadata.materialDiagnostics ?? null,
            camera: metadata.camera,
            focus: metadata.focus,
            exposure: metadata.exposure,
            viewport: metadata.viewport,
            canvas: metadata.canvas,
            png: { ...dimensions, format: 'png', lossless: true },
            frameMetrics,
            boundaryEvidence: recipe.evidenceMode ? (snapshot.boundaryEvidence ?? null) : null,
            nearEvidence: recipe.nearEvidenceMode ? (snapshot.nearEvidence ?? null) : null,
            representationApproval,
            coverageDiagnostics: (recipe.evidenceMode || recipe.nearEvidenceMode || hierarchyMatrix) ? (snapshot.coverage ?? null) : null,
            nearDiagnostics: (recipe.nearEvidenceMode || hierarchyMatrix)
                ? (snapshot.grass?.nearCarpet ?? null)
                : null,
            hierarchyDiagnostics: hierarchyMatrix ? (snapshot.grass?.midCluster ?? null) : null,
            accentDiagnostics: hierarchyMatrix ? (snapshot.grass?.localizedAccents ?? null) : null,
            lodDiagnostics: hierarchyMatrix ? (snapshot.lod ?? null) : null,
            cost: {
                visibleGrassTriangles: snapshot?.grass?.triangles ?? null,
                combinedVisibleGrassTriangles: Number(snapshot?.grass?.triangles ?? 0) + Number(snapshot?.coverage?.triangles ?? 0),
                grassLogicalDrawCalls: snapshot?.grass?.logicalDrawCalls ?? null,
                combinedVisibleGrassLogicalDrawCalls: snapshot?.grass?.combinedVisibleGrassLogicalDrawCalls
                    ?? (Number(snapshot?.grass?.logicalDrawCalls ?? 0) + Number(snapshot?.coverage?.logicalDrawCalls ?? 0)),
                boundaryTriangles: snapshot?.coverage?.triangles ?? null,
                nearTriangles: snapshot?.grass?.nearCarpet?.triangles ?? null,
                nearLogicalDrawCalls: snapshot?.grass?.nearCarpet?.drawCalls ?? null,
                billboardTriangles: snapshot?.grass?.midCluster?.billboard?.triangles
                    ?? snapshot?.grass?.trianglesByTier?.billboard
                    ?? null,
                billboardLogicalDrawCalls: snapshot?.grass?.midCluster?.billboard?.drawCalls ?? null,
                middleTriangles: snapshot?.grass?.midCluster?.middle?.triangles
                    ?? snapshot?.grass?.trianglesByTier?.middle
                    ?? null,
                middleLogicalDrawCalls: snapshot?.grass?.midCluster?.middle?.drawCalls ?? null,
                accentTriangles: snapshot?.grass?.localizedAccents?.triangles
                    ?? snapshot?.grass?.trianglesByTier?.accent
                    ?? null,
                accentLogicalDrawCalls: snapshot?.grass?.localizedAccents?.drawCalls ?? null,
                trianglesByTier: snapshot?.grass?.trianglesByTier ?? null,
                geometryBeyondCutoff: snapshot?.lod?.geometryBeyondCutoff ?? null,
                transitionState: snapshot?.lod?.transitionState ?? null,
                transitionProgress: snapshot?.lod?.transitionProgress ?? null,
                unrepresentedEligibleBins: snapshot?.grass?.nearCarpet?.unrepresentedEligibleBins ?? null,
                exactPostcheckFailures: snapshot?.grass?.nearCarpet?.exactPostcheckFailures ?? null,
                ineligibleRoots: snapshot?.grass?.nearCarpet?.ineligibleRoots ?? null,
                boundarySignature: snapshot?.grass?.nearCarpet?.boundarySignature ?? null,
                coverageCapTriangles: snapshot?.coverage?.capTriangles ?? null,
                coverageEdgeTriangles: snapshot?.coverage?.edgeTriangles ?? null,
                coverageTriangles: snapshot?.coverage?.triangles ?? null,
                coverageLogicalDrawCalls: snapshot?.coverage?.logicalDrawCalls ?? null,
                totalRendererDrawCalls: snapshot?.frame?.rendererDrawCalls ?? null,
                rendererTriangles: snapshot?.frame?.rendererTriangles ?? null,
                grassCpuMs: snapshot?.grass?.updateCpuMs ?? null,
                wholeFrameGpuMs: snapshot?.frame?.gpuMs ?? null
            }
        }
    };
}

function getHostHardwareMetadata() {
    const cpus = os.cpus();
    return {
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
        cpuModel: cpus[0]?.model ?? 'not measured',
        logicalCpuCount: cpus.length,
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytesAtCapture: os.freemem()
    };
}

async function runPerformanceWarmup(page) {
    return page.evaluate(async (requirements) => {
        const lab = window.__grassLab;
        const startMs = performance.now();
        let frames = 0;
        let stableZeroUploadFrames = 0;
        let previousStateKey = null;
        while (true) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            frames += 1;
            const snapshot = lab.getSnapshot();
            const grass = snapshot?.grass ?? {};
            const lastBufferUpdates = Math.max(0, Number(grass.nearCarpet?.lastBufferUpdates) || 0)
                + Math.max(0, Number(grass.midCluster?.lastBufferUpdates) || 0)
                + Math.max(0, Number(grass.localizedAccents?.lastBufferUpdates) || 0);
            const stateKey = JSON.stringify({
                placementSignature: grass.midCluster?.placementSignature ?? grass.nearCarpet?.placementSignature ?? null,
                trianglesByTier: grass.trianglesByTier ?? null,
                logicalDrawCalls: grass.logicalDrawCalls ?? null,
                activeTier: snapshot?.lod?.activeTier ?? null,
                transitionState: snapshot?.lod?.transitionState ?? null
            });
            stableZeroUploadFrames = lastBufferUpdates === 0 && stateKey === previousStateKey
                ? stableZeroUploadFrames + 1
                : 0;
            previousStateKey = stateKey;
            const durationMs = performance.now() - startMs;
            if (
                frames >= requirements.minimumFrames
                && durationMs >= requirements.minimumDurationMs
                && stableZeroUploadFrames >= requirements.minimumStableZeroUploadFrames
            ) {
                return {
                    frames,
                    durationMs,
                    stableZeroUploadFrames,
                    requirement: { ...requirements },
                    complete: true
                };
            }
            if (frames >= requirements.maximumFrames || durationMs >= requirements.maximumDurationMs) {
                return {
                    frames,
                    durationMs,
                    stableZeroUploadFrames,
                    requirement: { ...requirements },
                    complete: false
                };
            }
        }
    }, {
        minimumFrames: PERFORMANCE_WARMUP_FRAMES,
        minimumDurationMs: PERFORMANCE_WARMUP_MS,
        minimumStableZeroUploadFrames: PERFORMANCE_STABLE_UPLOAD_FRAMES,
        maximumFrames: 480,
        maximumDurationMs: 600000
    });
}

async function collectPerformanceMeasurement(page) {
    const warmup = await runPerformanceWarmup(page);
    await page.evaluate(({ warmupResult, targetFrameSamples, minimumGpuSamples }) => {
        window.__grassLab.beginPerformanceMeasurement({
            warmupFrames: warmupResult.frames,
            warmupDurationMs: warmupResult.durationMs,
            stableZeroUploadFrames: warmupResult.stableZeroUploadFrames,
            targetFrameSamples,
            minimumGpuSamples,
            maximumGpuFlushFrames: 30
        });
    }, {
        warmupResult: warmup,
        targetFrameSamples: PERFORMANCE_SAMPLE_FRAMES,
        minimumGpuSamples: PERFORMANCE_MINIMUM_GPU_SAMPLES
    });
    await page.evaluate(
        (frames) => window.__grassLab.settleCaptureFrames(frames),
        PERFORMANCE_SAMPLE_FRAMES + 30
    );
    const metadata = await page.evaluate(() => (
        window.__grassLab.getCaptureMetadata({ action: 'performance-measurement' })
    ));
    return {
        measurement: {
            ...(metadata.performanceMeasurement ?? {}),
            graphics: metadata.environment?.graphics ?? null
        },
        metadata
    };
}

async function collectAi362Native4kTiming(page, phase) {
    await page.evaluate(() => {
        const lab = window.__grassLab;
        lab.setQualityPreset('default');
        lab.setLighting('daylight');
        lab.setBoundaryEvidenceMode(null);
        lab.setNearEvidenceMode(null);
        if (typeof lab.setHierarchyEvidenceMode === 'function') lab.setHierarchyEvidenceMode(null);
        if (typeof lab.focusHandoff === 'function') lab.focusHandoff('billboard_middle', 0);
        if (typeof lab.resetLodHysteresis === 'function') lab.resetLodHysteresis();
        lab.resetValidationSamples();
    });
    const { measurement, metadata } = await collectPerformanceMeasurement(page);
    const performanceGate = evaluateGrassPerformanceMeasurement(measurement);
    const recorded = hasCompleteAi362Native4kTimingEvidence(performanceGate);
    return {
        phase,
        matrix: VALIDATION_MATRIX,
        sampleId: 'native4k_default_billboard_middle',
        resolution: `${WIDTH}x${HEIGHT}`,
        qualityPreset: 'default',
        lightingPreset: 'daylight',
        cameraPreset: 'billboard_middle_handoff',
        statistic: 'arithmetic_mean',
        informationalOnly: true,
        recorded,
        hardware: {
            host: getHostHardwareMetadata(),
            browser: metadata.environment ?? null
        },
        performanceMeasurement: measurement,
        performanceGate,
        camera: metadata.camera ?? null,
        materialVersion: metadata.materialVersion ?? null,
        grassCpuMs: performanceGate.measurements.cpu.meanMs,
        wholeFrameGpuMs: performanceGate.measurements.gpu.meanMs,
        frameTimeMs: performanceGate.measurements.frame.meanMs,
        fpsFromMeanFrameMs: performanceGate.measurements.frame.fpsFromMeanFrameMs,
        sampleCount: {
            cpu: performanceGate.measurements.cpu.sampleCount,
            gpu: performanceGate.measurements.gpu.sampleCount,
            frame: performanceGate.measurements.frame.sampleCount
        }
    };
}

async function collectCostSamples(page, phase, matrix = MATERIAL_MATRIX) {
    const width = 1920;
    const height = 1080;
    await page.setViewportSize({ width, height });
    await page.evaluate(({ width: nextWidth, height: nextHeight }) => (
        window.__grassLab.enterCaptureMode({ width: nextWidth, height: nextHeight })
    ), { width, height });
    const hostHardware = getHostHardwareMetadata();
    const qualityPlans = ['low', 'default', 'high'].map((qualityPreset) => ({
        sampleId: `quality_${qualityPreset}`,
        qualityPreset,
        cameraPreset: matrix === BOUNDARY_MATRIX
            ? 'boundary_straight_100'
            : (matrix === NEAR_MATRIX
                ? 'height_050'
                : (isHierarchyCaptureMatrix(matrix) ? 'billboard_middle_handoff' : 'height_150')),
        handoffId: isHierarchyCaptureMatrix(matrix) ? 'billboard_middle' : null,
        workload: 'stationary_quality_preset'
    }));
    const plans = isHierarchyCaptureMatrix(matrix)
        ? [
            ...qualityPlans,
            {
                sampleId: 'default_worst_view',
                qualityPreset: 'default',
                cameraPreset: 'top_down',
                handoffId: null,
                workload: 'stationary_worst_view'
            },
            {
                sampleId: 'default_transition_overlap',
                qualityPreset: 'default',
                cameraPreset: 'close_billboard_handoff',
                handoffId: 'close_billboard',
                workload: 'stationary_transition_overlap'
            }
        ]
        : qualityPlans;
    const samples = [];
    for (const plan of plans) {
        await page.evaluate(({ measurementPlan, boundaryMatrix, nearMatrix, lodMatrix }) => {
            const lab = window.__grassLab;
            lab.setQualityPreset(measurementPlan.qualityPreset);
            lab.setLighting('daylight');
            if (boundaryMatrix) {
                lab.setBoundaryEvidenceMode('boundary_final');
                lab.focusBoundaryCamera('straight', 1.0);
            } else if (nearMatrix) {
                lab.setBoundaryEvidenceMode(null);
                lab.setNearEvidenceMode('near_mesh');
                lab.focusCamera('height_050');
            } else if (lodMatrix) {
                lab.setBoundaryEvidenceMode(null);
                lab.setNearEvidenceMode(null);
                if (typeof lab.setHierarchyEvidenceMode === 'function') lab.setHierarchyEvidenceMode(null);
                if (measurementPlan.handoffId && typeof lab.focusHandoff === 'function') {
                    lab.focusHandoff(measurementPlan.handoffId, 0);
                } else {
                    lab.focusCamera(measurementPlan.cameraPreset);
                }
                lab.resetLodHysteresis();
            } else {
                lab.focusCamera('height_150');
            }
            lab.resetValidationSamples();
        }, {
            measurementPlan: plan,
            boundaryMatrix: matrix === BOUNDARY_MATRIX,
            nearMatrix: matrix === NEAR_MATRIX,
            lodMatrix: isHierarchyCaptureMatrix(matrix)
        });
        const performanceResult = await collectPerformanceMeasurement(page);
        const metadata = performanceResult.metadata;
        const measurement = performanceResult.measurement;
        const performanceGate = evaluateGrassPerformanceMeasurement(measurement);
        const snapshot = metadata.snapshot ?? {};
        const visibleGrassTriangles = snapshot?.grass?.triangles ?? null;
        const grassLogicalDrawCalls = snapshot?.grass?.logicalDrawCalls ?? null;
        const coverageTriangles = snapshot?.coverage?.triangles ?? null;
        const combinedVisibleGrassTriangles = Number(visibleGrassTriangles ?? 0) + Number(coverageTriangles ?? 0);
        const coverageLogicalDrawCalls = snapshot?.coverage?.logicalDrawCalls ?? null;
        const combinedVisibleGrassLogicalDrawCalls = Number(grassLogicalDrawCalls ?? 0)
            + Number(coverageLogicalDrawCalls ?? 0);
        const boundaryApproval = matrix === BOUNDARY_MATRIX
            ? evaluateBoundaryRepresentationSnapshot(snapshot, 'boundary_final')
            : null;
        const cutoffClean = Number.isFinite(snapshot?.lod?.geometryBeyondCutoff)
            && snapshot.lod.geometryBeyondCutoff === 0;
        const structuralPass = combinedVisibleGrassTriangles <= 200000
            && combinedVisibleGrassLogicalDrawCalls <= 12
            && (matrix !== BOUNDARY_MATRIX || (
                Number(coverageLogicalDrawCalls) <= 2
                && boundaryApproval?.pass === true
            ))
            && (!isHierarchyCaptureMatrix(matrix) || (
                Number(coverageLogicalDrawCalls) <= 2
                && cutoffClean
            ));
        samples.push({
            phase,
            matrix,
            sampleId: plan.sampleId,
            workload: plan.workload,
            qualityPreset: plan.qualityPreset,
            resolution: `${width}x${height}`,
            cameraPreset: plan.cameraPreset,
            camera: metadata.camera ?? null,
            lightingPreset: 'daylight',
            materialVersion: metadata.materialVersion ?? null,
            hardware: {
                host: hostHardware,
                browser: metadata.environment ?? null
            },
            warmup: measurement.warmup ?? null,
            statistic: 'arithmetic_mean',
            performanceMeasurement: measurement,
            performanceGate,
            visibleGrassTriangles,
            combinedVisibleGrassTriangles,
            grassLogicalDrawCalls,
            combinedVisibleGrassLogicalDrawCalls,
            boundaryTriangles: snapshot?.coverage?.triangles ?? null,
            nearTriangles: snapshot?.grass?.nearCarpet?.triangles ?? null,
            nearLogicalDrawCalls: snapshot?.grass?.nearCarpet?.drawCalls ?? null,
            billboardTriangles: snapshot?.grass?.midCluster?.billboard?.triangles
                ?? snapshot?.grass?.trianglesByTier?.billboard
                ?? null,
            billboardLogicalDrawCalls: snapshot?.grass?.midCluster?.billboard?.drawCalls ?? null,
            middleTriangles: snapshot?.grass?.midCluster?.middle?.triangles
                ?? snapshot?.grass?.trianglesByTier?.middle
                ?? null,
            middleLogicalDrawCalls: snapshot?.grass?.midCluster?.middle?.drawCalls ?? null,
            accentTriangles: snapshot?.grass?.localizedAccents?.triangles
                ?? snapshot?.grass?.trianglesByTier?.accent
                ?? null,
            accentLogicalDrawCalls: snapshot?.grass?.localizedAccents?.drawCalls ?? null,
            trianglesByTier: snapshot?.grass?.trianglesByTier ?? null,
            geometryBeyondCutoff: snapshot?.lod?.geometryBeyondCutoff ?? null,
            unrepresentedEligibleBins: snapshot?.grass?.nearCarpet?.unrepresentedEligibleBins ?? null,
            exactPostcheckFailures: snapshot?.grass?.nearCarpet?.exactPostcheckFailures ?? null,
            boundarySignature: snapshot?.grass?.nearCarpet?.boundarySignature ?? null,
            coverageCapTriangles: snapshot?.coverage?.capTriangles ?? null,
            coverageRootThatchTriangles: snapshot?.coverage?.rootThatchTriangles ?? null,
            coverageCutEdgeTriangles: snapshot?.coverage?.cutEdgeTriangles ?? null,
            coverageTriangles,
            coverageLogicalDrawCalls,
            boundaryApproval,
            totalRendererDrawCalls: snapshot?.frame?.rendererDrawCalls ?? null,
            rendererTriangles: snapshot?.frame?.rendererTriangles ?? null,
            grassCpuMs: performanceGate.measurements.cpu.meanMs,
            grassCpuMedianMs: performanceGate.measurements.cpu.medianMs,
            grassCpuP95Ms: performanceGate.measurements.cpu.p95Ms,
            wholeFrameGpuMs: performanceGate.measurements.gpu.meanMs,
            wholeFrameGpuMedianMs: performanceGate.measurements.gpu.medianMs,
            wholeFrameGpuP95Ms: performanceGate.measurements.gpu.p95Ms,
            frameTimeMs: performanceGate.measurements.frame.meanMs,
            frameTimeMedianMs: performanceGate.measurements.frame.medianMs,
            frameTimeP95Ms: performanceGate.measurements.frame.p95Ms,
            fpsFromMeanFrameMs: performanceGate.measurements.frame.fpsFromMeanFrameMs,
            sampleCount: {
                cpu: performanceGate.measurements.cpu.sampleCount,
                gpu: performanceGate.measurements.gpu.sampleCount,
                frame: performanceGate.measurements.frame.sampleCount
            },
            stationaryBufferUpdates: {
                maximum: performanceGate.measurements.maximumStationaryBufferUpdates,
                pass: performanceGate.checks.stationaryUploads
            },
            budget: {
                visibleGrassTriangleCeiling: 200000,
                grassLogicalDrawCallCeiling: 12,
                coverageLogicalDrawCallCeiling: matrix === BOUNDARY_MATRIX || isHierarchyCaptureMatrix(matrix) ? 2 : null,
                averageGrassCpuMsCeiling: 0.6,
                wholeFrameGpuMsCeilingWhenSupported: 1.5,
                structuralPass,
                performancePass: performanceGate.pass,
                pass: structuralPass && performanceGate.pass
            }
        });
    }
    await page.evaluate(() => window.__grassLab.exitCaptureMode());
    return samples;
}

async function run(options) {
    const outputRoot = resolveOutputRoot(options.output);
    const outputRelative = path.relative(REPO_ROOT, outputRoot);
    if (!options.inspectBoundary) await mkdir(outputRoot, { recursive: true });
    const manifestPath = path.join(outputRoot, 'capture_manifest.json');
    const existing = await readExistingManifest(manifestPath);
    const measurementsOnlyCaptures = options.measurementsOnly
        ? await verifyAi362MeasurementsOnlyManifest(existing, outputRoot)
        : null;
    const server = await ensureStaticServer(options.baseUrl);
    const runtimeErrors = [];
    const runtimeWarnings = [];
    const startupDiagnostics = [];
    let browser = null;
    try {
        browser = await chromium.launch({
            headless: !options.headed,
            ...(options.executablePath ? { executablePath: options.executablePath } : {}),
            args: [
                '--disable-dev-shm-usage',
                '--hide-scrollbars',
                '--force-color-profile=srgb',
                '--force-device-scale-factor=1',
                '--force-high-performance-gpu'
            ]
        });
        const context = await browser.newContext({
            viewport: { width: WIDTH, height: HEIGHT },
            deviceScaleFactor: 1,
            colorScheme: 'dark'
        });
        const page = await context.newPage();
        const v2AssetOverride = await installV2AssetOverride(page, options.v2AssetRoot);
        page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error?.message ?? error}`));
        page.on('console', (message) => {
            if (message.type() === 'error') startupDiagnostics.push(`console: ${message.text()}`);
            if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(`console: ${message.text()}`);
            else if (message.type() === 'warning') runtimeWarnings.push(`console: ${message.text()}`);
        });
        page.on('response', (response) => {
            if (response.status() >= 400) startupDiagnostics.push(`http ${response.status()}: ${response.url()}`);
            if (response.status() >= 400 && response.url().startsWith(options.baseUrl) && !isOptionalCorrectionConfig(response.url())) {
                runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
            }
        });
        page.on('requestfailed', (request) => {
            startupDiagnostics.push(`request failed: ${request.url()} · ${request.failure()?.errorText ?? '?'}`);
            if (request.url().startsWith(options.baseUrl) && !isOptionalCorrectionConfig(request.url())) {
                runtimeErrors.push(`request failed: ${request.url()} · ${request.failure()?.errorText ?? '?'}`);
            }
        });
        await page.goto(new URL('/debug_tools/grass_debug.html', options.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        try {
            await page.waitForFunction(() => document.body.dataset.grassLabReady === 'true' && !!window.__grassLab, null, { timeout: 60_000 });
        } catch (error) {
            const startup = await page.evaluate(() => ({
                ready: document.body.dataset.grassLabReady ?? null,
                hasApi: !!window.__grassLab,
                title: document.title
            })).catch(() => null);
            throw new Error(`[GrassLabCapture] Lab did not become ready. Startup: ${JSON.stringify(startup)}\n${runtimeErrors.join('\n')}\n${runtimeWarnings.join('\n')}\n${startupDiagnostics.slice(-20).join('\n')}`, { cause: error });
        }
        await page.evaluate(() => window.__grassLab.enterCaptureMode({ width: 3840, height: 2160 }));
        const requestedMaterialVersion = options.matrix === BOUNDARY_MATRIX || options.matrix === NEAR_MATRIX || isHierarchyCaptureMatrix(options.matrix)
            ? 'v2'
            : (options.phase === 'before' ? 'v1' : 'v2');
        const materialVersionSwitch = await page.evaluate(
            async (version) => window.__grassLab.setMaterialVersion(version),
            requestedMaterialVersion
        );
        await page.evaluate(() => window.__grassLab.settleCaptureFrames(60));
        if (options.inspectBoundary) {
            const inspection = await page.evaluate(() => {
                const lab = window.__grassLab;
                lab.setQualityPreset('low');
                lab.setBoundaryEvidenceMode('boundary_final');
                lab.focusBoundaryCamera('straight', 0.5);
                const snapshot = lab.getSnapshot();
                return {
                    snapshot: {
                        fixtures: snapshot.fixtures,
                        coverage: snapshot.coverage,
                        frame: snapshot.frame,
                        boundaryEvidence: snapshot.boundaryEvidence
                    },
                    topologyWindows: [
                        lab.getBoundaryTopologyDiagnostics({ startIndex: 112, endIndex: 140 }),
                        lab.getBoundaryTopologyDiagnostics({ startIndex: 244, endIndex: 269 })
                    ]
                };
            });
            await page.evaluate(() => window.__grassLab.settleCaptureFrames(5));
            process.stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
            return;
        }
        const captures = [];
        const pngByRecipe = new Map();
        const matrixRecipes = options.matrix === BOUNDARY_MATRIX
            ? buildBoundaryCaptureRecipes()
            : (options.matrix === NEAR_MATRIX
                ? buildNearCaptureRecipes()
                : (options.matrix === LOD_MATRIX
                    ? buildLodCaptureRecipes(options.phase)
                    : (options.matrix === VALIDATION_MATRIX ? buildAi362ValidationRecipes() : buildCaptureRecipes())));
        const requestedRecipeIds = options.recipeIds ? new Set(options.recipeIds) : null;
        const recipes = options.measurementsOnly
            ? []
            : (requestedRecipeIds
                ? matrixRecipes.filter((recipe) => requestedRecipeIds.has(recipe.id))
                : matrixRecipes);
        if (requestedRecipeIds && recipes.length !== requestedRecipeIds.size) {
            const knownIds = new Set(matrixRecipes.map((recipe) => recipe.id));
            const unknownIds = [...requestedRecipeIds].filter((id) => !knownIds.has(id));
            throw new Error('[GrassLabCapture] Unknown recipe id(s): ' + unknownIds.join(', '));
        }
        for (const recipe of recipes) {
            const result = await captureRecipe(page, outputRoot, outputRelative, options.phase, recipe, options.overwrite);
            captures.push(result.entry);
            if (options.matrix === MATERIAL_MATRIX && NEUTRAL_PAIR_DEFINITIONS.some((definition) => (
                definition.geometry === recipe.id || definition.texture === recipe.id
            ))) pngByRecipe.set(recipe.id, result.png);
        }
        const materialVersion = summarizeSettledMaterialVersion(
            materialVersionSwitch,
            options.measurementsOnly ? measurementsOnlyCaptures : captures
        );
        const luminanceGate = options.matrix === MATERIAL_MATRIX ? evaluateLuminancePairs(captures) : null;
        const cardBandGate = options.matrix === MATERIAL_MATRIX ? evaluateCardBandPairs(captures, pngByRecipe) : null;
        const boundaryGate = options.matrix === BOUNDARY_MATRIX ? evaluateBoundaryPairs(captures) : null;
        const nearGate = options.matrix === NEAR_MATRIX ? evaluateNearPairs(captures) : null;
        const ai362Native4kTiming = options.matrix === VALIDATION_MATRIX
            ? await collectAi362Native4kTiming(page, options.phase)
            : null;
        await page.evaluate(() => window.__grassLab.exitCaptureMode());
        const costSamples = await collectCostSamples(page, options.phase, options.matrix);
        if (runtimeErrors.length) {
            throw new Error(`Grass Lab emitted runtime errors:\n${runtimeErrors.join('\n')}`);
        }
        const replacingRecipeIds = new Set(options.recipeIds ?? []);
        const retainedPhaseCaptures = !options.measurementsOnly && options.recipeIds && Array.isArray(existing?.captures)
            ? existing.captures.filter((entry) => (
                entry?.phase === options.phase
                && !replacingRecipeIds.has(entry?.recipeId)
            ))
            : [];
        const completePhaseCaptures = options.measurementsOnly
            ? [...measurementsOnlyCaptures]
            : [...retainedPhaseCaptures, ...captures];
        const ai362ApprovalDiagnostics = options.matrix === VALIDATION_MATRIX
            ? enrichAi362ApprovalDiagnosticSource(completePhaseCaptures)
            : null;
        const lodPngByRecipe = new Map();
        if (options.matrix === LOD_MATRIX && options.phase === 'after') {
            for (const recipe of buildLodCaptureRecipes('after')) {
                if (recipe.evidenceGroup !== 'handoff_pair') continue;
                const filePath = path.join(outputRoot, `${options.phase}_${recipe.id}.png`);
                if (await pathExists(filePath)) lodPngByRecipe.set(recipe.id, await readFile(filePath));
            }
        }
        const lodAppearanceGate = options.matrix === LOD_MATRIX && options.phase === 'after'
            ? evaluateLodHandoffAppearancePairs(completePhaseCaptures, lodPngByRecipe)
            : null;
        const lodPerformanceGate = options.matrix === LOD_MATRIX
            ? evaluateLodPerformanceCostGate(costSamples, options.phase)
            : null;
        const lodGate = options.matrix === LOD_MATRIX
            ? evaluateLodCaptureSet(
                completePhaseCaptures,
                options.phase,
                lodAppearanceGate,
                lodPerformanceGate,
                { deferPerformanceTo: options.deferPerformanceTo }
            )
            : null;
        const ai362PerformanceGate = options.matrix === VALIDATION_MATRIX
            ? evaluateLodPerformanceCostGate(costSamples, options.phase, VALIDATION_MATRIX)
            : null;
        const ai362BaselineReference = options.matrix === VALIDATION_MATRIX
            ? await loadAi362BaselineReference()
            : null;
        const ai362RegressionGate = options.matrix === VALIDATION_MATRIX
            ? evaluateAi362RegressionGate(completePhaseCaptures, { baselineReference: ai362BaselineReference })
            : null;
        const ai362Gate = options.matrix === VALIDATION_MATRIX
            ? evaluateAi362ValidationSet(
                completePhaseCaptures,
                ai362PerformanceGate,
                {
                    performanceOwnership: AI362_PERFORMANCE_OWNERSHIP,
                    baselineReference: ai362BaselineReference,
                    native4kTiming: ai362Native4kTiming,
                    regressionGate: ai362RegressionGate
                }
            )
            : null;
        const manifestCaptures = options.measurementsOnly ? completePhaseCaptures : captures;
        const manifestReplaceRecipeIds = options.measurementsOnly
            ? matrixRecipes.map((recipe) => recipe.id)
            : options.recipeIds;
        const manifest = mergeCaptureManifest(existing, options.phase, manifestCaptures, {
            matrix: options.matrix,
            baseUrl: options.baseUrl,
            measurementsOnly: options.measurementsOnly,
            v2AssetSource: v2AssetOverride
                ? { mode: 'lab_staging_override', root: v2AssetOverride }
                : { mode: 'server_assets', root: null },
            materialVersion,
            luminanceGate,
            cardBandGate,
            boundaryGate,
            nearGate,
            lodAppearanceGate,
            lodPerformanceGate,
            lodGate,
            ai362PerformanceGate,
            ai362BaselineReference,
            ai362Native4kTiming,
            ai362RegressionGate,
            ai362ApprovalDiagnostics,
            ai362Gate,
            costSamples: ai362Native4kTiming ? [...costSamples, ai362Native4kTiming] : costSamples,
            gameplayTouched: false,
            runtimeErrors,
            runtimeWarnings
        }, {
            replaceRecipeIds: manifestReplaceRecipeIds
        });
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        process.stdout.write(`${JSON.stringify({
            phase: options.phase,
            matrix: options.matrix,
            measurementsOnly: options.measurementsOnly,
            capturedThisRun: captures.length,
            totalCaptures: completePhaseCaptures.length,
            gates: options.matrix === BOUNDARY_MATRIX
                ? { boundary: boundaryGate.pass }
                : (options.matrix === NEAR_MATRIX
                    ? { near: nearGate.pass }
                    : (options.matrix === LOD_MATRIX
                        ? {
                            lod: lodGate.pass,
                            performanceCostPass: lodGate.performanceCostPass,
                            performanceRequired: lodGate.performanceRequired,
                            performanceOwnership: lodGate.performanceOwnership
                        }
                        : (options.matrix === VALIDATION_MATRIX
                            ? {
                                validation: ai362Gate.pass,
                                visualFunctionalPass: ai362Gate.visualFunctionalPass,
                                performanceCostPass: ai362Gate.performanceCostPass,
                                performanceRequired: ai362Gate.performanceRequired,
                                performanceOwnership: ai362Gate.performanceOwnership
                            }
                            : { luminance: luminanceGate.pass, cardBand: cardBandGate.pass }))),
            manifest: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/')
        }, null, 2)}\n`);
        if (options.phase === 'after' && options.matrix === MATERIAL_MATRIX && (!luminanceGate.pass || !cardBandGate.pass)) {
            const failures = [];
            if (!luminanceGate.pass) failures.push('geometry/texture median-luminance ratio is outside 0.90-1.10');
            if (!cardBandGate.pass) failures.push('live field card-band darkening exceeds 0.10');
            throw new Error(`[GrassLabCapture] Corrected evidence failed: ${failures.join('; ')}. Evidence was saved with failing verdicts.`);
        }
        if (options.matrix === BOUNDARY_MATRIX && !boundaryGate.pass) {
            throw new Error('[GrassLabCapture] Boundary evidence failed paired camera/representation/geometry approval. Evidence was saved with failing verdicts.');
        }
        if (options.phase === 'after' && options.matrix === NEAR_MATRIX && !nearGate.pass) {
            throw new Error('[GrassLabCapture] Near-carpet evidence failed paired camera/representation approval. Evidence was saved with failing verdicts.');
        }
        if (options.matrix === LOD_MATRIX && !lodGate.pass) {
            throw new Error('[GrassLabCapture] LOD hierarchy evidence failed the native-4K matrix, V2, cost, or deterministic-motion gate. Evidence was saved with failing verdicts.');
        }
        if (options.matrix === VALIDATION_MATRIX && !ai362Gate.pass) {
            throw new Error('[GrassLabCapture] AI362 validation evidence failed its native-4K metadata, exact-coverage, motion, structural, or deferred-performance-ownership gate. Evidence was saved with failing verdicts.');
        }
    } finally {
        await browser?.close?.();
        server?.kill?.('SIGTERM');
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
    Promise.resolve()
        .then(() => parseArgs(process.argv.slice(2)))
        .then((options) => {
            if (options.help) process.stdout.write(`${usage()}\n`);
            else return run(options);
        })
        .catch((error) => {
            process.stderr.write(`${error?.stack ?? error}\n`);
            process.exitCode = 1;
        });
}
