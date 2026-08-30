import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) continue;
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
        args.set(token, next);
        index += 1;
    } else {
        args.set(token, true);
    }
}

const requestedPort = Math.max(1024, Number(args.get('--port')) || 4173);
const profileMode = args.has('--on-only') ? 'on_only' : 'comparison';
const defaultArtifactDirectory = profileMode === 'on_only'
    ? 'tests/artifacts/visibility_on_regions'
    : 'tests/artifacts/static_visibility_regions';
const outputPath = path.resolve(repoRoot, String(args.get('--report') || `${defaultArtifactDirectory}/report.json`));
const markdownPath = path.resolve(repoRoot, String(args.get('--markdown') || `${defaultArtifactDirectory}/REPORT.md`));
const extraQuery = String(args.get('--query') || '').replace(/^\?/, '').trim();
let server = null;
let browser = null;

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

async function findFreePort(startPort) {
    for (let port = startPort; port < startPort + 200; port += 1) if (await canListen(port)) return port;
    throw new Error(`No free region-profiler port found from ${startPort}`);
}

async function waitForServer(url) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        try {
            const response = await fetch(`${url}/__health`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Region profiler could not reach ${url}`);
}

const METRICS = ['calls', 'triangles', 'lines', 'points'];

function emptyMetrics() {
    return { calls: 0, triangles: 0, lines: 0, points: 0 };
}

function addMetrics(target, source, scale = 1) {
    for (const metric of METRICS) target[metric] += Number(source?.[metric] || 0) * scale;
    return target;
}

function scaledMetrics(source, scale) {
    return addMetrics(emptyMetrics(), source, scale);
}

function rowMap(rows) {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.id, row]));
}

function combineRows(sources, field) {
    const combined = new Map();
    for (const source of sources) {
        for (const row of (source?.[field] ?? [])) {
            const target = combined.get(row.id) ?? { id: row.id, ...emptyMetrics() };
            addMetrics(target, row);
            combined.set(row.id, target);
        }
    }
    const divisor = Math.max(1, sources.length);
    return [...combined.values()].map((row) => ({ id: row.id, ...scaledMetrics(row, 1 / divisor) }));
}

function averageState(samples, state) {
    return {
        totals: scaledMetrics(samples.reduce((sum, sample) => addMetrics(sum, sample[state].totals), emptyMetrics()), 1 / Math.max(1, samples.length)),
        frameMs: samples.reduce((sum, sample) => sum + Number(sample[state]?.frameMs || 0), 0) / Math.max(1, samples.length),
        byCategory: combineRows(samples.map((sample) => sample[state]), 'byCategory'),
        byPass: combineRows(samples.map((sample) => sample[state]), 'byPass')
    };
}

function savings(off, on) {
    const saved = emptyMetrics();
    const percent = emptyMetrics();
    for (const metric of METRICS) {
        saved[metric] = off[metric] - on[metric];
        percent[metric] = off[metric] > 0 ? saved[metric] / off[metric] * 100 : 0;
    }
    return { saved, percent };
}

function makeComparison(off, on) {
    return { off, on, ...savings(off.totals, on.totals) };
}

function summarize(report) {
    const regions = [];
    for (let regionRow = 0; regionRow < 5; regionRow += 1) {
        for (let regionColumn = 0; regionColumn < 5; regionColumn += 1) {
            const id = `R${regionRow + 1}C${regionColumn + 1}`;
            const samples = report.samples.filter((sample) => sample.region.id === id);
            regions.push({
                id,
                row: regionRow + 1,
                column: regionColumn + 1,
                cameraCell: samples[0]?.region.cameraCell ?? null,
                ...makeComparison(averageState(samples, 'off'), averageState(samples, 'on'))
            });
        }
    }

    const directions = ['N', 'E', 'S', 'W'].map((id) => {
        const samples = report.samples.filter((sample) => sample.direction.id === id);
        return { id, ...makeComparison(averageState(samples, 'off'), averageState(samples, 'on')) };
    });

    const off = report.global.off;
    const on = report.global.on;
    const offCategories = rowMap(off.byCategory);
    const onCategories = rowMap(on.byCategory);
    const categories = [...new Set([...offCategories.keys(), ...onCategories.keys()])].map((id) => {
        const offRow = offCategories.get(id) ?? { id, ...emptyMetrics() };
        const onRow = onCategories.get(id) ?? { id, ...emptyMetrics() };
        return { id, off: offRow, on: onRow, ...savings(offRow, onRow) };
    }).sort((a, b) => b.off.calls - a.off.calls);
    const offPasses = rowMap(off.byPass);
    const onPasses = rowMap(on.byPass);
    const passes = [...new Set([...offPasses.keys(), ...onPasses.keys()])].map((id) => {
        const offRow = offPasses.get(id) ?? { id, ...emptyMetrics() };
        const onRow = onPasses.get(id) ?? { id, ...emptyMetrics() };
        return { id, off: offRow, on: onRow, ...savings(offRow, onRow) };
    }).sort((a, b) => b.off.calls - a.off.calls);
    return {
        global: makeComparison(off, on),
        categories,
        passes,
        directions,
        regions,
        reconciliation: report.reconciliation
    };
}

function summarizeCurrent(report) {
    const regions = [];
    for (let regionRow = 0; regionRow < 5; regionRow += 1) {
        for (let regionColumn = 0; regionColumn < 5; regionColumn += 1) {
            const id = `R${regionRow + 1}C${regionColumn + 1}`;
            const samples = report.samples.filter((sample) => sample.region.id === id);
            regions.push({
                id,
                row: regionRow + 1,
                column: regionColumn + 1,
                cameraCell: samples[0]?.region.cameraCell ?? null,
                current: averageState(samples, 'current')
            });
        }
    }
    const directions = ['N', 'E', 'S', 'W'].map((id) => {
        const samples = report.samples.filter((sample) => sample.direction.id === id);
        return { id, current: averageState(samples, 'current') };
    });
    const current = report.global.current;
    const totals = current.totals;
    const addShares = (row) => ({
        ...row,
        callShare: totals.calls > 0 ? row.calls / totals.calls * 100 : 0,
        triangleShare: totals.triangles > 0 ? row.triangles / totals.triangles * 100 : 0
    });
    return {
        global: current,
        categories: current.byCategory.map(addShares),
        passes: current.byPass.map(addShares),
        directions,
        regions,
        reconciliation: report.reconciliation
    };
}

function number(value, digits = 0) {
    return Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function percent(value) {
    return `${number(value, 1)}%`;
}

function comparisonRow(label, item) {
    const off = item.off.totals ?? item.off;
    const on = item.on.totals ?? item.on;
    return `| ${label} | ${number(off.calls, 1)} | ${number(on.calls, 1)} | ${number(item.saved.calls, 1)} | ${percent(item.percent.calls)} | ${number(off.triangles, 0)} | ${number(on.triangles, 0)} | ${number(item.saved.triangles, 0)} | ${percent(item.percent.triangles)} |`;
}

function regionDiagram(regions) {
    const rows = [];
    rows.push('                         WEST  →  EAST');
    rows.push('              C1          C2          C3          C4          C5');
    rows.push('         +-----------+-----------+-----------+-----------+-----------+');
    for (let row = 1; row <= 5; row += 1) {
        const cells = regions.filter((region) => region.row === row);
        rows.push(`NORTH ${row === 3 ? '→' : ' '} | ${cells.map((region) => `${region.id} @${String(region.cameraCell.x).padStart(2, '0')},${String(region.cameraCell.y).padStart(2, '0')}`).join(' | ')} |`);
        rows.push('         +-----------+-----------+-----------+-----------+-----------+');
    }
    rows.push('                               ↓ SOUTH');
    return rows.join('\n');
}

function heatmap(regions, metric) {
    const rows = [];
    for (let row = 1; row <= 5; row += 1) {
        rows.push(regions
            .filter((region) => region.row === row)
            .map((region) => String(Math.round(region.percent[metric])).padStart(4, ' '))
            .join(' '));
    }
    return rows.join('\n');
}

function buildMarkdown(report) {
    const summary = report.summary;
    const lines = [
        '# Static visibility 5×5 regional renderer profile',
        '',
        `Generated: ${report.generatedAt}`,
        '',
        '## Method',
        '',
        `- Production gameplay renderer at ${report.rendererSize[0]}×${report.rendererSize[1]}, pixel ratio ${report.rendererPixelRatio}.`,
        '- The 25×25 city is divided into 25 regions, each covering 5×5 map cells.',
        '- The camera uses the road cell nearest each region center, at 3.683 m with a -9.673° pitch and 55° FOV.',
        '- Each point is measured facing north, east, south, and west: 100 poses total.',
        '- Each visibility state is warmed, then averaged across two complete frames so half-rate GTAO phases are balanced.',
        '- Calls and primitives are attributed from exact renderer counter deltas around every submitted draw.',
        '- Static visibility affects the color pass only; hidden objects are deliberately restored for shadow rendering.',
        '',
        '## Region layout and sampled road cells',
        '',
        '```text',
        regionDiagram(summary.regions),
        '```',
        '',
        'Coordinates after `@` are map cell `x,y`. Row 1 is the north/low-Z side of the map; column 1 is the west/low-X side.',
        '',
        '## Global result (average frame across all 100 poses)',
        '',
        '| Scope | Calls off | Calls on | Calls saved | Calls saved % | Triangles off | Triangles on | Triangles saved | Triangles saved % |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        comparisonRow('All rendering', summary.global),
        '',
        '## By render pass',
        '',
        '| Pass | Calls off | Calls on | Calls saved | Calls saved % | Triangles off | Triangles on | Triangles saved | Triangles saved % |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.passes.map((row) => comparisonRow(row.id, row)),
        '',
        '## By scene category',
        '',
        '| Category | Calls off | Calls on | Calls saved | Calls saved % | Triangles off | Triangles on | Triangles saved | Triangles saved % |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.categories.map((row) => comparisonRow(row.id, row)),
        '',
        '## By camera direction',
        '',
        '| Direction | Calls off | Calls on | Calls saved | Calls saved % | Triangles off | Triangles on | Triangles saved | Triangles saved % |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.directions.map((row) => comparisonRow(row.id, row)),
        '',
        '## Per region (average of N/E/S/W)',
        '',
        '| Region | Camera cell | Calls off | Calls on | Calls saved | Calls saved % | Triangles off | Triangles on | Triangles saved | Triangles saved % |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.regions.map((row) => `| ${row.id} | ${row.cameraCell.x},${row.cameraCell.y} | ${number(row.off.totals.calls, 1)} | ${number(row.on.totals.calls, 1)} | ${number(row.saved.calls, 1)} | ${percent(row.percent.calls)} | ${number(row.off.totals.triangles, 0)} | ${number(row.on.totals.triangles, 0)} | ${number(row.saved.triangles, 0)} | ${percent(row.percent.triangles)} |`),
        '',
        '## Regional savings heatmaps',
        '',
        'Call reduction percent (north at top, west at left):',
        '',
        '```text',
        heatmap(summary.regions, 'calls'),
        '```',
        '',
        'Triangle reduction percent (north at top, west at left):',
        '',
        '```text',
        heatmap(summary.regions, 'triangles'),
        '```',
        '',
        '## Highest-cost submitted objects/passes by draw calls',
        '',
        '| Visibility | Pass | Category | Object | Calls/frame | Triangles/frame |',
        '|---|---|---|---|---:|---:|',
        ...['off', 'on'].flatMap((state) => report.global[state].byObject.slice(0, 20).map((row) => `| ${state} | ${row.pass} | ${row.category} | ${String(row.object).replaceAll('|', '\\|')} | ${number(row.calls, 2)} | ${number(row.triangles, 0)} |`)),
        '',
        '## Highest-cost submitted objects/passes by triangles',
        '',
        '| Visibility | Pass | Category | Object | Calls/frame | Triangles/frame |',
        '|---|---|---|---|---:|---:|',
        ...['off', 'on'].flatMap((state) => [...report.global[state].byObject]
            .sort((a, b) => b.triangles - a.triangles)
            .slice(0, 20)
            .map((row) => `| ${state} | ${row.pass} | ${row.category} | ${String(row.object).replaceAll('|', '\\|')} | ${number(row.calls, 2)} | ${number(row.triangles, 0)} |`)),
        '',
        '## Counter reconciliation',
        '',
        `All ${report.reconciliation.frames} captured frames reconciled renderer totals to attributed totals: **${report.reconciliation.mismatches.length === 0 ? 'yes' : 'no'}**.`,
        ''
    ];
    return `${lines.join('\n')}\n`;
}

function currentGrid(regions, formatter) {
    const rows = [];
    for (let row = 1; row <= 5; row += 1) {
        rows.push(regions
            .filter((region) => region.row === row)
            .map((region) => formatter(region.current.totals).padStart(9, ' '))
            .join(' '));
    }
    return rows.join('\n');
}

function buildCurrentMarkdown(report) {
    const summary = report.summary;
    const lines = [
        '# Visibility-on 5×5 regional renderer profile',
        '',
        `Generated: ${report.generatedAt}`,
        '',
        '## Method',
        '',
        `- Production gameplay renderer at ${report.rendererSize[0]}×${report.rendererSize[1]}, pixel ratio ${report.rendererPixelRatio}.`,
        '- Static visibility remained enabled for the complete run; there is no disabled comparison state.',
        '- The 25×25 city is divided into 25 regions, each covering 5×5 map cells.',
        '- The camera uses the road cell nearest each region center, at 3.683 m with a -9.673° pitch and 55° FOV.',
        '- Each point is measured facing north, east, south, and west: 100 poses total.',
        '- Each pose is warmed, then averaged across two complete frames so half-rate GTAO phases are balanced.',
        '- Calls and primitives are attributed from exact renderer counter deltas around every submitted draw.',
        '',
        '## Region layout and sampled road cells',
        '',
        '```text',
        regionDiagram(summary.regions),
        '```',
        '',
        'Coordinates after `@` are map cell `x,y`. Row 1 is the north/low-Z side of the map; column 1 is the west/low-X side.',
        '',
        '## Global visibility-on workload',
        '',
        '| Draw calls/frame | Triangles/frame | Lines/frame | CPU + GPU frame time |',
        '|---:|---:|---:|---:|',
        `| ${number(summary.global.totals.calls, 1)} | ${number(summary.global.totals.triangles, 0)} | ${number(summary.global.totals.lines, 1)} | ${number(summary.global.frameMs, 2)} ms |`,
        '',
        ...(report.trafficControlMaterialGroupMerge ? [
            '## Generic material-group consolidation',
            '',
            `- Compatible traffic-control meshes consolidated: ${number(report.trafficControlMaterialGroupMerge.merged)} / ${number(report.trafficControlMaterialGroupMerge.candidates)}.`,
            `- Color-pass material slots: ${number(report.trafficControlMaterialGroupMerge.sourceMaterials)} → ${number(report.trafficControlMaterialGroupMerge.outputMaterials)}.`,
            `- Static geometry-buffer delta: ${number(report.trafficControlMaterialGroupMerge.geometryByteDelta / 1024, 1)} KiB.`,
            `- Meshes requiring non-indexed expansion: ${number(report.trafficControlMaterialGroupMerge.expandedToNonIndexed)}.`,
            ''
        ] : []),
        '## Workload by render pass',
        '',
        '| Pass | Calls/frame | Call share | Triangles/frame | Triangle share |',
        '|---|---:|---:|---:|---:|',
        ...summary.passes.map((row) => `| ${row.id} | ${number(row.calls, 1)} | ${percent(row.callShare)} | ${number(row.triangles, 0)} | ${percent(row.triangleShare)} |`),
        '',
        '## Workload by scene category',
        '',
        '| Category | Calls/frame | Call share | Triangles/frame | Triangle share |',
        '|---|---:|---:|---:|---:|',
        ...summary.categories.map((row) => `| ${row.id} | ${number(row.calls, 1)} | ${percent(row.callShare)} | ${number(row.triangles, 0)} | ${percent(row.triangleShare)} |`),
        '',
        '## Workload by camera direction',
        '',
        '| Direction | Calls/frame | Triangles/frame |',
        '|---|---:|---:|',
        ...summary.directions.map((row) => `| ${row.id} | ${number(row.current.totals.calls, 1)} | ${number(row.current.totals.triangles, 0)} |`),
        '',
        '## Per region (average of N/E/S/W)',
        '',
        '| Region | Camera cell | Calls/frame | Triangles/frame |',
        '|---|---:|---:|---:|',
        ...summary.regions.map((row) => `| ${row.id} | ${row.cameraCell.x},${row.cameraCell.y} | ${number(row.current.totals.calls, 1)} | ${number(row.current.totals.triangles, 0)} |`),
        '',
        '## Absolute regional heatmaps',
        '',
        'Draw calls/frame (north at top, west at left):',
        '',
        '```text',
        currentGrid(summary.regions, (totals) => number(totals.calls, 0)),
        '```',
        '',
        'Millions of triangles/frame (north at top, west at left):',
        '',
        '```text',
        currentGrid(summary.regions, (totals) => `${(totals.triangles / 1_000_000).toFixed(2)} M`),
        '```',
        '',
        '## Highest-cost submitted objects/passes by draw calls',
        '',
        '| Pass | Category | Object | Calls/frame | Triangles/frame |',
        '|---|---|---|---:|---:|',
        ...summary.global.byObject.slice(0, 25).map((row) => `| ${row.pass} | ${row.category} | ${String(row.object).replaceAll('|', '\\|')} | ${number(row.calls, 2)} | ${number(row.triangles, 0)} |`),
        '',
        '## Highest-cost submitted objects/passes by triangles',
        '',
        '| Pass | Category | Object | Calls/frame | Triangles/frame |',
        '|---|---|---|---:|---:|',
        ...[...summary.global.byObject]
            .sort((a, b) => b.triangles - a.triangles)
            .slice(0, 25)
            .map((row) => `| ${row.pass} | ${row.category} | ${String(row.object).replaceAll('|', '\\|')} | ${number(row.calls, 2)} | ${number(row.triangles, 0)} |`),
        '',
        '## Counter reconciliation',
        '',
        `All ${report.reconciliation.frames} captured frames reconciled renderer totals to attributed totals: **${report.reconciliation.mismatches.length === 0 ? 'yes' : 'no'}**.`,
        ''
    ];
    return `${lines.join('\n')}\n`;
}

try {
    const port = args.has('--url') ? requestedPort : await findFreePort(requestedPort);
    const baseUrl = String(args.get('--url') || `http://127.0.0.1:${port}`);
    if (!args.has('--url')) {
        server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
            cwd: repoRoot,
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'ignore', 'inherit']
        });
        await waitForServer(baseUrl);
    }

    const chromePath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
    browser = await chromium.launch({
        headless: true,
        ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(0);
    page.on('console', (message) => {
        const value = message.text();
        if (value.startsWith('[StaticVisibilityRuntime]') || message.type() === 'error') process.stdout.write(`[Browser:${message.type()}] ${value}\n`);
    });
    page.on('pageerror', (error) => process.stdout.write(`[Browser:pageerror] ${error.stack || error.message}\n`));
    page.on('response', (response) => {
        if (response.status() >= 400) process.stdout.write(`[Browser:response] ${response.status()} ${response.url()}\n`);
    });
    await page.exposeFunction('__regionProfileProgress', (message) => process.stdout.write(`[RegionProfile] ${message}\n`));
    await page.addInitScript(() => localStorage.removeItem('bus_sim.staticVisibility.v1'));
    const launchQuery = new URLSearchParams('pose=civic_center_curve_front&coreTests=0');
    for (const [key, value] of new URLSearchParams(extraQuery)) launchQuery.set(key, value);
    await page.goto(`${baseUrl}/?${launchQuery.toString()}`);
    let ready = false;
    let lastStartup = null;
    for (let second = 0; second < 300; second += 1) {
        lastStartup = await page.evaluate(() => {
            const sim = window.__busSim ?? null;
            const city = sim?.sm?.current?.city ?? null;
            return {
                state: sim?.sm?.currentName ?? null,
                visibility: city?.getStaticVisibilityStatus?.() ?? null
            };
        });
        ready = lastStartup.state === 'game_mode' && lastStartup.visibility?.state === 'active';
        if (ready) break;
        if (second % 10 === 0) process.stdout.write(`[RegionProfile] startup ${second}s ${JSON.stringify(lastStartup)}\n`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error(`Production city did not become visibility-active: ${JSON.stringify(lastStartup)}`);

    const report = await page.evaluate(async ({ profileMode, extraQuery }) => {
        const THREE = await import('three');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const city = state.city;
        const renderer = engine.renderer;
        const gl = renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const directions = [
            { id: 'N', x: 0, z: -1 },
            { id: 'E', x: 1, z: 0 },
            { id: 'S', x: 0, z: 1 },
            { id: 'W', x: -1, z: 0 }
        ];
        const cameraHeight = 3.6831812721965655;
        const pitchDeg = -9.67328903369499;
        const framesPerState = 2;
        let logicalNow = performance.now();
        engine.stop();
        state._updateChaseCamera = () => {};

        const objectCategories = new Map();
        function tag(root, category) {
            root?.traverse?.((object) => objectCategories.set(object, category));
        }
        tag(engine.scene, 'scene_other');
        tag(city.group, 'city_environment');
        tag(city.world?.group, 'terrain_other');
        tag(city.world?.floor, 'terrain_floor');
        tag(city.world?.groundTiles, 'terrain_tiles');
        tag(city.world?.gridLines, 'map_grid');
        tag(city.world?.trees?.group, 'trees');
        tag(city.roads?.group, 'road_other');
        tag(city.roads?.asphalt, 'road_asphalt');
        tag(city.roads?.asphaltEdgeWear, 'road_asphalt_edge_wear');
        tag(city.roads?.curbBlocks, 'road_curbs');
        tag(city.roads?.sidewalk, 'road_sidewalks');
        tag(city.roads?.sidewalkEdgeDirt, 'road_sidewalk_edge_dirt');
        tag(city.roads?.group?.getObjectByName?.('Markings'), 'road_markings');
        tag(city.buildings?.group, 'buildings');
        tag(city.buildings?.group?.getObjectByName?.('BuildingSlabs'), 'building_slabs');
        tag(city.trafficControls?.group, 'traffic_controls');
        for (const root of (city.trafficControls?.group?.children ?? [])) {
            const category = String(root?.userData?.staticVisibility?.category ?? 'traffic_controls');
            tag(root, category);
        }
        tag(state.busAnchor, 'bus');

        function emptyMetrics() {
            return { calls: 0, triangles: 0, lines: 0, points: 0 };
        }
        function createCapture() {
            return {
                totals: emptyMetrics(),
                frameMs: [],
                sunBloomFrames: [],
                byCategory: new Map(),
                byPass: new Map(),
                byCategoryPass: new Map(),
                byObject: new Map()
            };
        }
        function add(target, source) {
            for (const metric of ['calls', 'triangles', 'lines', 'points']) target[metric] += Number(source?.[metric] || 0);
        }
        function addMap(map, id, delta, extra = null) {
            const target = map.get(id) ?? { id, ...emptyMetrics(), ...(extra ?? {}) };
            add(target, delta);
            map.set(id, target);
        }
        function mergeCapture(target, source) {
            add(target.totals, source.totals);
            target.frameMs.push(...source.frameMs);
            target.sunBloomFrames.push(...source.sunBloomFrames);
            for (const [id, row] of source.byCategory) addMap(target.byCategory, id, row);
            for (const [id, row] of source.byPass) addMap(target.byPass, id, row);
            for (const [id, row] of source.byCategoryPass) addMap(target.byCategoryPass, id, row, { category: row.category, pass: row.pass });
            for (const [id, row] of source.byObject) addMap(target.byObject, id, row, { category: row.category, pass: row.pass, object: row.object });
        }
        function rows(map, divisor, sortMetric = 'calls') {
            return [...map.values()]
                .map((row) => {
                    const out = { ...row };
                    for (const metric of ['calls', 'triangles', 'lines', 'points']) out[metric] /= divisor;
                    return out;
                })
                .sort((a, b) => b[sortMetric] - a[sortMetric]);
        }
        function finishCapture(capture, divisor) {
            const totals = { ...capture.totals };
            for (const metric of ['calls', 'triangles', 'lines', 'points']) totals[metric] /= divisor;
            const sunBloomFrames = capture.sunBloomFrames;
            const outcomes = {};
            for (const frame of sunBloomFrames) outcomes[frame.outcome] = (outcomes[frame.outcome] || 0) + 1;
            const averageSunBloom = (field) => sunBloomFrames.length
                ? sunBloomFrames.reduce((sum, frame) => sum + Number(frame[field] || 0), 0) / sunBloomFrames.length
                : 0;
            return {
                totals,
                frameMs: capture.frameMs.length
                    ? capture.frameMs.reduce((sum, value) => sum + value, 0) / capture.frameMs.length
                    : 0,
                sunBloomFiltering: {
                    frames: sunBloomFrames.length,
                    outcomes,
                    filteringEnabled: sunBloomFrames.length ? sunBloomFrames.every((frame) => frame.filteringEnabled !== false) : null,
                    renderedFrames: sunBloomFrames.filter((frame) => frame.rendered === true).length,
                    averageCandidateTestMs: averageSunBloom('candidateTestMs'),
                    averageEmitterCount: averageSunBloom('emitterCount'),
                    averageRelevantEmitterCount: averageSunBloom('relevantEmitterCount'),
                    averageScannedOccluderCount: averageSunBloom('scannedOccluderCount'),
                    averageRetainedOccluderCount: averageSunBloom('retainedOccluderCount'),
                    averageConservativeInclusionCount: averageSunBloom('conservativeInclusionCount'),
                    averageReferenceBytes: averageSunBloom('approximateReferenceBytes'),
                    averagePassCalls: averageSunBloom('passCalls'),
                    averagePassTriangles: averageSunBloom('passTriangles')
                },
                byCategory: rows(capture.byCategory, divisor),
                byPass: rows(capture.byPass, divisor),
                byCategoryPass: rows(capture.byCategoryPass, divisor),
                byObject: rows(capture.byObject, divisor, 'calls')
            };
        }

        let activeCapture = null;
        const passStack = [];
        const globalRaw = { off: createCapture(), on: createCapture(), current: createCapture() };
        const reconciliation = { frames: 0, mismatches: [] };
        const originalRenderBufferDirect = renderer.renderBufferDirect;
        const originalRender = renderer.render;
        const originalShadowRender = renderer.shadowMap.render;
        const pipeline = engine._post?.pipeline ?? null;
        const helperRestores = [];

        function currentPass() {
            return passStack[passStack.length - 1] ?? 'unknown';
        }
        function rendererMetrics() {
            const value = renderer.info.render;
            return {
                calls: Number(value.calls || 0),
                triangles: Number(value.triangles || 0),
                lines: Number(value.lines || 0),
                points: Number(value.points || 0)
            };
        }

        renderer.renderBufferDirect = function profiledRenderBufferDirect(camera, scene, geometry, material, object, group) {
            const before = rendererMetrics();
            const result = originalRenderBufferDirect.call(this, camera, scene, geometry, material, object, group);
            if (!activeCapture) return result;
            const after = rendererMetrics();
            const delta = {
                calls: after.calls - before.calls,
                triangles: after.triangles - before.triangles,
                lines: after.lines - before.lines,
                points: after.points - before.points
            };
            if (!(delta.calls || delta.triangles || delta.lines || delta.points)) return result;
            const pass = currentPass();
            const category = objectCategories.get(object) ?? (pass === 'post_processing' ? 'post_processing' : 'pipeline_or_unknown');
            const objectName = object?.name || object?.parent?.name || object?.type || 'unnamed';
            const objectKey = `${pass}|${category}|${object?.uuid ?? objectName}`;
            add(activeCapture.totals, delta);
            addMap(activeCapture.byCategory, category, delta);
            addMap(activeCapture.byPass, pass, delta);
            addMap(activeCapture.byCategoryPass, `${category}|${pass}`, delta, { category, pass });
            addMap(activeCapture.byObject, objectKey, delta, { category, pass, object: objectName });
            return result;
        };

        renderer.render = function profiledRender(scene, camera, ...rest) {
            const parent = currentPass();
            const helperPass = parent === 'global_bloom' || parent === 'sun_bloom' || parent === 'ao_exclusion';
            const pass = helperPass
                ? parent
                : (scene === engine.scene
                    ? (camera === engine.camera ? 'visible_scene' : 'auxiliary_scene')
                    : 'post_processing');
            passStack.push(pass);
            try {
                return originalRender.call(this, scene, camera, ...rest);
            } finally {
                passStack.pop();
            }
        };

        renderer.shadowMap.render = function profiledShadowRender(...renderArgs) {
            passStack.push('shadow_maps');
            try {
                return originalShadowRender.apply(this, renderArgs);
            } finally {
                passStack.pop();
            }
        };

        for (const [method, pass] of [
            ['_renderGlobalBloom', 'global_bloom'],
            ['_renderSunBloom', 'sun_bloom'],
            ['_renderAoReceiverExclusionMask', 'ao_exclusion']
        ]) {
            if (typeof pipeline?.[method] !== 'function') continue;
            const original = pipeline[method];
            pipeline[method] = function profiledPipelineHelper(...methodArgs) {
                passStack.push(pass);
                try {
                    return original.apply(this, methodArgs);
                } finally {
                    passStack.pop();
                }
            };
            helperRestores.push(() => { pipeline[method] = original; });
        }

        const regions = [];
        const regionWidth = city.map.width / 5;
        const regionHeight = city.map.height / 5;
        if (!Number.isInteger(regionWidth) || !Number.isInteger(regionHeight)) {
            throw new Error(`Expected map dimensions divisible by five, got ${city.map.width}×${city.map.height}`);
        }
        for (let regionRow = 0; regionRow < 5; regionRow += 1) {
            for (let regionColumn = 0; regionColumn < 5; regionColumn += 1) {
                const minX = regionColumn * regionWidth;
                const maxX = minX + regionWidth - 1;
                const minY = regionRow * regionHeight;
                const maxY = minY + regionHeight - 1;
                const centerX = (minX + maxX) * 0.5;
                const centerY = (minY + maxY) * 0.5;
                const candidates = [];
                for (let y = minY; y <= maxY; y += 1) {
                    for (let x = minX; x <= maxX; x += 1) {
                        if (city.map.kind[city.map.index(x, y)] !== 1) continue;
                        candidates.push({ x, y, distance: Math.hypot(x - centerX, y - centerY) });
                    }
                }
                candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
                if (!candidates.length) throw new Error(`Region R${regionRow + 1}C${regionColumn + 1} has no road camera cell`);
                const cameraCell = candidates[0];
                regions.push({
                    id: `R${regionRow + 1}C${regionColumn + 1}`,
                    row: regionRow + 1,
                    column: regionColumn + 1,
                    bounds: { minX, maxX, minY, maxY },
                    cameraCell: { x: cameraCell.x, y: cameraCell.y }
                });
            }
        }

        function applyPose(region, direction) {
            const center = city.map.tileToWorldCenter(region.cameraCell.x, region.cameraCell.y);
            const pitch = THREE.MathUtils.degToRad(pitchDeg);
            const horizontal = Math.cos(pitch) * 20;
            engine.camera.position.set(center.x, cameraHeight, center.z);
            engine.camera.lookAt(
                center.x + direction.x * horizontal,
                cameraHeight + Math.sin(pitch) * 20,
                center.z + direction.z * horizontal
            );
            engine.camera.fov = 55;
            engine.camera.updateProjectionMatrix();
            engine.camera.updateMatrixWorld(true);
        }

        function setVisibility(enabled) {
            city.setStaticVisibilitySettings({
                enabled,
                categories: { buildings: true, traffic_lights: true, traffic_signs: true, trees: true },
                diagnostics: true
            });
            logicalNow += 1000;
            city.updateStaticVisibility(engine.camera, logicalNow);
            logicalNow += 1000;
            city.updateStaticVisibility(engine.camera, logicalNow);
        }

        function renderOneFrame(capture = null) {
            const start = performance.now();
            city.update(engine);
            logicalNow += 16.6667;
            city.updateStaticVisibility(engine.camera, logicalNow);
            activeCapture = capture;
            try {
                engine.renderFrame();
                gl.finish();
            } finally {
                activeCapture = null;
            }
            return performance.now() - start;
        }

        function captureState(stateId) {
            const capture = createCapture();
            renderOneFrame(null);
            for (let frame = 0; frame < framesPerState; frame += 1) {
                const frameCapture = createCapture();
                frameCapture.frameMs.push(renderOneFrame(frameCapture));
                const sunBloomFrame = engine.getSunBloomDebugInfo?.()?.occlusionFiltering ?? null;
                if (sunBloomFrame) frameCapture.sunBloomFrames.push({ ...sunBloomFrame });
                reconciliation.frames += 1;
                const actual = rendererMetrics();
                const expected = frameCapture.totals;
                const mismatch = ['calls', 'triangles', 'lines', 'points'].some((metric) => actual[metric] !== expected[metric]);
                if (mismatch) reconciliation.mismatches.push({ stateId, actual, expected: { ...expected } });
                mergeCapture(capture, frameCapture);
                mergeCapture(globalRaw[stateId], frameCapture);
            }
            return finishCapture(capture, framesPerState);
        }

        const samples = [];
        try {
            for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
                const region = regions[regionIndex];
                for (const direction of directions) {
                    applyPose(region, direction);
                    if (profileMode === 'on_only') {
                        setVisibility(true);
                        const current = captureState('current');
                        samples.push({ region, direction, current });
                    } else {
                        setVisibility(false);
                        const off = captureState('off');
                        setVisibility(true);
                        const on = captureState('on');
                        samples.push({ region, direction, off, on });
                    }
                }
                await window.__regionProfileProgress(`${regionIndex + 1}/25 ${region.id}`);
            }
        } finally {
            setVisibility(true);
            renderer.renderBufferDirect = originalRenderBufferDirect;
            renderer.render = originalRender;
            renderer.shadowMap.render = originalShadowRender;
            for (const restore of helperRestores.reverse()) restore();
        }

        const globalDivisor = regions.length * directions.length * framesPerState;
        return {
            generatedAt: new Date().toISOString(),
            cityId: city.cityId,
            citySize: { width: city.map.width, height: city.map.height, tileSize: city.map.tileSize },
            gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            rendererSize: renderer.getSize(new THREE.Vector2()).toArray(),
            rendererPixelRatio: renderer.getPixelRatio(),
            camera: { height: cameraHeight, pitchDeg, fovDeg: 55 },
            framesPerState,
            poses: regions.length * directions.length,
            profileMode,
            extraQuery,
            shadowSettings: engine.shadowSettings,
            postProcessing: pipeline?.getResolvedSettings?.() ?? null,
            staticVisibilityStatus: city.getStaticVisibilityStatus(),
            trafficControlMaterialGroupMerge: city.trafficControls?.materialGroupMerge ?? null,
            global: profileMode === 'on_only'
                ? { current: finishCapture(globalRaw.current, globalDivisor) }
                : {
                    off: finishCapture(globalRaw.off, globalDivisor),
                    on: finishCapture(globalRaw.on, globalDivisor)
                },
            reconciliation,
            samples
        };
    }, { profileMode, extraQuery });

    report.summary = profileMode === 'on_only' ? summarizeCurrent(report) : summarize(report);
    if (report.reconciliation.mismatches.length) {
        throw new Error(`Renderer attribution failed to reconcile on ${report.reconciliation.mismatches.length}/${report.reconciliation.frames} frames`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, profileMode === 'on_only' ? buildCurrentMarkdown(report) : buildMarkdown(report), 'utf8');
    process.stdout.write(`[RegionProfile] wrote ${path.relative(repoRoot, outputPath)}\n`);
    process.stdout.write(`[RegionProfile] wrote ${path.relative(repoRoot, markdownPath)}\n`);
} finally {
    await browser?.close?.();
    if (server && !server.killed) server.kill('SIGTERM');
}
