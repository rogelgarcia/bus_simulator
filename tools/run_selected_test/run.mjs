// tools/run_selected_test/run.mjs
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const SELECTED_TEST_PATH = path.resolve(repoRoot, 'tests/.selected_test');
const RUNNER_ARTIFACTS_DIR = path.resolve(repoRoot, 'tests/artifacts/run_selected_test');
const CORE_ARTIFACTS_DIR = path.resolve(RUNNER_ARTIFACTS_DIR, 'core');

function printUsage() {
    console.log(`runSelectedTest

Usage:
  node tools/run_selected_test/run.mjs
  node tools/run_selected_test/run.mjs --set <target>
  node tools/run_selected_test/run.mjs --print

Selection file:
  tests/.selected_test (gitignored)

Targets:
  smoke
  core
  node | node:unit | node:sim | assets
  tests/headless/e2e/<spec>.pwtest.js
  tests/headless/visual/specs/<spec>.pwtest.js
  tests/headless/perf/specs/<spec>.pwtest.js
`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const flags = new Set(args.filter((a) => a.startsWith('-')));

    if (flags.has('--help') || flags.has('-h')) return { mode: 'help' };
    if (flags.has('--print')) return { mode: 'print' };
    if (flags.has('--last')) return { mode: 'run' };

    const setIndex = args.indexOf('--set');
    if (setIndex !== -1) {
        const value = args[setIndex + 1];
        if (!value || value.startsWith('-')) return { mode: 'error', message: 'Missing value for --set <target>.' };
        return { mode: 'set', target: value };
    }

    if (args.length > 0) return { mode: 'error', message: `Unknown args: ${args.join(' ')}` };
    return { mode: 'run' };
}

function sanitizeSelectedLine(raw) {
    const line = String(raw ?? '').trim();
    if (!line) return null;
    if (line.startsWith('#')) return null;
    return line;
}

async function readSelectedTarget() {
    let text;
    try {
        text = await fs.readFile(SELECTED_TEST_PATH, 'utf-8');
    } catch {
        return null;
    }
    const lines = text.split(/\r?\n/g);
    for (const l of lines) {
        const s = sanitizeSelectedLine(l);
        if (s) return s;
    }
    return null;
}

async function writeSelectedTarget(target) {
    await fs.mkdir(path.dirname(SELECTED_TEST_PATH), { recursive: true });
    await fs.writeFile(SELECTED_TEST_PATH, `${target}\n`, 'utf-8');
}

function ensureSafeRelativeTestPath(input) {
    const raw = String(input ?? '').trim();
    if (!raw) throw new Error('Empty test target.');
    if (raw.includes('\0')) throw new Error('Invalid test target (NUL byte).');

    const normalized = raw.replaceAll('\\', '/');
    if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized)) {
        throw new Error(`Refusing absolute path target: ${raw}`);
    }

    const parts = normalized.split('/').filter(Boolean);
    if (parts.some((p) => p === '..')) throw new Error(`Refusing path traversal target: ${raw}`);
    if (!normalized.startsWith('tests/')) throw new Error(`Refusing non-tests target: ${raw}`);
    if (normalized.includes('*') || normalized.includes('?')) throw new Error(`Refusing glob target: ${raw}`);

    const abs = path.resolve(repoRoot, normalized);
    if (!abs.startsWith(path.resolve(repoRoot, 'tests') + path.sep)) {
        throw new Error(`Refusing target outside tests/: ${raw}`);
    }
    return { normalized, abs };
}

async function statIfExists(absPath) {
    try {
        return await fs.stat(absPath);
    } catch {
        return null;
    }
}

async function listTestFilesRecursive(rootDirAbs) {
    const results = [];
    const queue = [rootDirAbs];
    while (queue.length > 0) {
        const dir = queue.pop();
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                queue.push(p);
                continue;
            }
            if (!e.isFile()) continue;
            if (!p.endsWith('.test.js')) continue;
            results.push(p);
        }
    }
    results.sort();
    return results;
}

function spawnInherit(cmd, args, opts) {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
        child.on('exit', (code, signal) => resolve({ code, signal }));
        child.on('error', (err) => resolve({ code: 1, signal: null, err }));
    });
}

async function isPortFree(host, port) {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', (err) => {
            const code = err?.code ?? 'UNKNOWN';
            if (code === 'EPERM') {
                reject(new Error('Port binding is not permitted in this environment (EPERM). Headless/core tests require a local HTTP server.'));
                return;
            }
            resolve(false);
        });
        server.listen(port, host, () => {
            server.close(() => resolve(true));
        });
    });
}

async function findFreePort(host, startPort) {
    const start = Number(startPort) || 4173;
    for (let p = start; p < start + 50; p++) {
        if (await isPortFree(host, p)) return p;
    }
    throw new Error('Failed to find an available port for the static server.');
}

async function waitForHealth(host, port, timeoutMs) {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;

    while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
            const req = http.request(
                { method: 'GET', host, port, path: '/__health', timeout: 1_000 },
                (res) => {
                    res.resume();
                    resolve(res.statusCode === 200);
                }
            );
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.on('error', () => resolve(false));
            req.end();
        });

        if (ok) return;
        await new Promise((r) => setTimeout(r, 100));
    }

    const elapsedMs = Date.now() - startedAt;
    throw new Error(`Static server did not become healthy within ${elapsedMs}ms.`);
}

async function runNodeTestsForTarget(target) {
    const suiteMap = {
        'node': 'tests/node',
        'node:unit': 'tests/node/unit',
        'node:sim': 'tests/node/sim',
        'assets': 'tests/node/assets'
    };

    if (suiteMap[target]) {
        const dirAbs = path.resolve(repoRoot, suiteMap[target]);
        const files = await listTestFilesRecursive(dirAbs);
        if (files.length === 0) throw new Error(`[runSelectedTest] No *.test.js files found under ${suiteMap[target]}.`);
        console.log(`[runSelectedTest] Node: ${target} (${files.length} file(s))`);
        const { code, signal, err } = await spawnInherit('node', ['--test', ...files], { cwd: repoRoot });
        if (err) console.error('[runSelectedTest] Failed to spawn node:', err);
        return { code: code ?? 1, signal };
    }

    const { normalized, abs } = ensureSafeRelativeTestPath(target);
    const st = await statIfExists(abs);
    if (!st) throw new Error(`[runSelectedTest] Missing Node test target: ${normalized}`);

    if (st.isDirectory()) {
        if (!normalized.startsWith('tests/node/')) {
            throw new Error(`[runSelectedTest] Refusing directory target outside tests/node/: ${normalized}`);
        }
        const files = await listTestFilesRecursive(abs);
        if (files.length === 0) throw new Error(`[runSelectedTest] No *.test.js files found under ${normalized}`);
        console.log(`[runSelectedTest] Node: ${normalized} (${files.length} file(s))`);
        const { code, signal, err } = await spawnInherit('node', ['--test', ...files], { cwd: repoRoot });
        if (err) console.error('[runSelectedTest] Failed to spawn node:', err);
        return { code: code ?? 1, signal };
    }

    if (!st.isFile() || !normalized.endsWith('.test.js') || !normalized.startsWith('tests/node/')) {
        throw new Error(`[runSelectedTest] Refusing non-node-test target: ${normalized}`);
    }

    console.log(`[runSelectedTest] Node: ${normalized}`);
    const { code, signal, err } = await spawnInherit('node', ['--test', abs], { cwd: repoRoot });
    if (err) console.error('[runSelectedTest] Failed to spawn node:', err);
    return { code: code ?? 1, signal };
}

async function runPlaywrightTarget(target) {
    const { normalized, abs } = ensureSafeRelativeTestPath(target);
    const st = await statIfExists(abs);
    if (!st) throw new Error(`[runSelectedTest] Missing Playwright target: ${normalized}`);

    let configPath;
    if (normalized.startsWith('tests/headless/e2e/')) {
        configPath = 'tests/headless/e2e/playwright.config.mjs';
    } else if (normalized.startsWith('tests/headless/visual/specs/')) {
        configPath = 'tests/headless/visual/visual.config.mjs';
    } else if (normalized.startsWith('tests/headless/perf/specs/')) {
        configPath = 'tests/headless/perf/perf.config.mjs';
    } else {
        throw new Error(`[runSelectedTest] Unknown Playwright test type for: ${normalized}`);
    }

    console.log(`[runSelectedTest] Playwright: ${normalized}`);
    const { code, signal, err } = await spawnInherit(
        'npx',
        ['--no-install', 'playwright', 'test', '-c', configPath, normalized],
        { cwd: repoRoot }
    );
    if (err) console.error('[runSelectedTest] Failed to spawn playwright:', err);
    return { code: code ?? 1, signal };
}

async function runHeadlessSuite(suite) {
    const suiteMap = {
        'headless': 'tests/headless/e2e/playwright.config.mjs',
        'visual': 'tests/headless/visual/visual.config.mjs',
        'perf': 'tests/headless/perf/perf.config.mjs'
    };

    const configPath = suiteMap[suite];
    if (!configPath) throw new Error(`[runSelectedTest] Unknown headless suite: ${suite}`);

    console.log(`[runSelectedTest] Playwright suite: ${suite}`);
    const { code, signal, err } = await spawnInherit(
        'npx',
        ['--no-install', 'playwright', 'test', '-c', configPath],
        { cwd: repoRoot }
    );
    if (err) console.error('[runSelectedTest] Failed to spawn playwright:', err);
    return { code: code ?? 1, signal };
}

async function ensureDir(dirAbs) {
    await fs.mkdir(dirAbs, { recursive: true });
}

async function writeTextArtifact(name, text) {
    await ensureDir(CORE_ARTIFACTS_DIR);
    const out = path.resolve(CORE_ARTIFACTS_DIR, name);
    await fs.writeFile(out, text, 'utf-8');
    return out;
}

async function runCoreBrowserConsoleTests() {
    let chromium;
    try {
        ({ chromium } = await import('@playwright/test'));
    } catch (err) {
        throw new Error(
            '[runSelectedTest] Core tests require Playwright. Install deps with `npm i` and browsers with `npx playwright install --with-deps chromium`.'
        );
    }

    const host = '127.0.0.1';
    const port = await findFreePort(host, 4173);
    const baseURL = `http://${host}:${port}`;

    console.log(`[runSelectedTest] Core: starting static server (${baseURL})`);
    const server = spawn('node', ['tests/headless/e2e/static_server.mjs'], {
        cwd: repoRoot,
        env: { ...process.env, HOST: host, PORT: String(port) },
        stdio: 'inherit'
    });

    try {
        await waitForHealth(host, port, 10_000);
    } catch (err) {
        server.kill();
        throw err;
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const consoleLines = [];
    page.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();
        consoleLines.push(`[${type}] ${text}`);
    });
    page.on('pageerror', (err) => {
        consoleLines.push(`[pageerror] ${err?.message ?? String(err)}`);
    });

    let status;
    try {
        await page.goto(`${baseURL}/index.html?coreTests=1`, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForFunction(() => window.__coreTestsDone === true, null, { timeout: 180_000 });
        status = await page.evaluate(() => {
            const errors = Array.isArray(window.__testErrors) ? window.__testErrors : [];
            const fatals = Array.isArray(window.__testFatals) ? window.__testFatals : [];
            return { failed: errors.length, errors, fatals };
        });
    } catch (err) {
        await ensureDir(CORE_ARTIFACTS_DIR);
        await page.screenshot({ path: path.resolve(CORE_ARTIFACTS_DIR, 'core_tests_timeout.png'), fullPage: true });
        await writeTextArtifact('core_tests_console.log', consoleLines.join('\n') + '\n');
        throw err;
    } finally {
        await page.close();
        await browser.close();
        server.kill();
    }

    await writeTextArtifact('core_tests_console.log', consoleLines.join('\n') + '\n');

    if (status.fatals.length > 0) {
        console.error(`[runSelectedTest] Core: FAIL (${status.fatals.length} fatal(s))`);
        for (const f of status.fatals.slice(0, 20)) {
            const name = f?.name ?? 'CoreTests';
            const message = f?.message ?? String(f);
            console.error(`  - ${name}: ${message}`);
        }
        return { code: 1, signal: null };
    }

    if (status.failed > 0) {
        console.error(`[runSelectedTest] Core: FAIL (${status.failed} failing test(s))`);
        for (const e of status.errors.slice(0, 20)) {
            const name = e?.name ?? 'unknown';
            const error = e?.error ?? 'unknown error';
            console.error(`  - ${name}: ${error}`);
        }
        return { code: 1, signal: null };
    }

    console.log('[runSelectedTest] Core: PASS');
    return { code: 0, signal: null };
}

async function runSelectedTarget(rawTarget) {
    const target = String(rawTarget ?? '').trim();
    if (!target) throw new Error('[runSelectedTest] No selected target.');

    if (target === 'smoke') return await runNodeTestsForTarget('node:unit');
    if (target === 'core' || target === 'tests/core.test.js') return await runCoreBrowserConsoleTests();
    if (target === 'node' || target === 'node:unit' || target === 'node:sim' || target === 'assets') {
        return await runNodeTestsForTarget(target);
    }
    if (target === 'headless' || target === 'visual' || target === 'perf') {
        return await runHeadlessSuite(target);
    }

    const normalized = target.replaceAll('\\', '/');
    if (normalized.startsWith('tests/headless/')) return await runPlaywrightTarget(normalized);
    if (normalized.startsWith('tests/node/')) return await runNodeTestsForTarget(normalized);

    throw new Error(`[runSelectedTest] Unknown target: ${target}`);
}

async function run() {
    const parsed = parseArgs(process.argv);
    if (parsed.mode === 'help') {
        printUsage();
        return;
    }
    if (parsed.mode === 'error') {
        console.error(`[runSelectedTest] ${parsed.message}`);
        printUsage();
        process.exitCode = 2;
        return;
    }
    if (parsed.mode === 'print') {
        const current = await readSelectedTarget();
        console.log(current ?? '(none)');
        process.exitCode = current ? 0 : 1;
        return;
    }
    if (parsed.mode === 'set') {
        await writeSelectedTarget(parsed.target);
        console.log(`[runSelectedTest] Selected: ${parsed.target}`);
        return;
    }

    const selected = await readSelectedTarget();
    if (!selected) {
        console.error(`[runSelectedTest] Missing selection file or empty selection: ${path.relative(repoRoot, SELECTED_TEST_PATH)}`);
        console.error('  Set it with: node tools/run_selected_test/run.mjs --set smoke');
        process.exitCode = 2;
        return;
    }

    console.log(`[runSelectedTest] Selected target: ${selected}`);
    const { code, signal } = await runSelectedTarget(selected);

    if (signal) {
        console.error(`[runSelectedTest] Failed with signal: ${signal}`);
        process.exitCode = 1;
        return;
    }

    if (Number(code) !== 0) {
        console.error(`[runSelectedTest] FAIL (exit code ${code})`);
        process.exitCode = Number(code) || 1;
        return;
    }

    console.log('[runSelectedTest] PASS');
}

run().catch((err) => {
    console.error('[runSelectedTest] Failed:', err?.message ?? err);
    process.exitCode = 1;
});
