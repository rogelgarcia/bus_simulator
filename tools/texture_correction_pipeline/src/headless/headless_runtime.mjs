// Shared headless runtime (static server + Playwright browser pages) for map/capture analysis.
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { chromium } from '@playwright/test';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_START_PORT = 4173;

function onceEvent(emitter, eventName) {
    return new Promise((resolve) => {
        emitter.once(eventName, resolve);
    });
}

async function isPortFree(host, port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(port, host, () => {
            server.close(() => resolve(true));
        });
    });
}

async function findFreePort(host, startPort) {
    const start = Number(startPort) || DEFAULT_START_PORT;
    for (let port = start; port < start + 80; port++) {
        if (await isPortFree(host, port)) return port;
    }
    throw new Error('Unable to find a free local port for the static server.');
}

async function waitForHealth({ host, port, timeoutMs = 8000 }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
            const req = http.request(
                { method: 'GET', host, port, path: '/__health', timeout: 1000 },
                (res) => {
                    res.resume();
                    resolve(res.statusCode === 200);
                }
            );
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
        if (ok) return true;
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return false;
}

async function startStaticServer({ repoRoot, host, port }) {
    const staticServerScript = path.resolve(repoRoot, 'tests/headless/e2e/static_server.mjs');
    const child = spawn('node', [staticServerScript], {
        cwd: repoRoot,
        env: {
            ...process.env,
            HOST: host,
            PORT: String(port)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverLog = '';
    child.stdout.on('data', (chunk) => {
        serverLog += String(chunk ?? '');
    });
    child.stderr.on('data', (chunk) => {
        serverLog += String(chunk ?? '');
    });

    const exited = onceEvent(child, 'exit');
    const healthy = await waitForHealth({ host, port, timeoutMs: 12000 });
    if (healthy) return { child, serverLog };

    try { child.kill('SIGTERM'); } catch {}
    await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 1200))
    ]);
    throw new Error(`Static server failed to boot on ${host}:${port}. Log:\n${serverLog}`);
}

export class HeadlessRuntime {
    constructor({
        repoRoot,
        host,
        port,
        baseUrl,
        serverProcess,
        browser,
        context,
        probePage,
        harnessPage
    }) {
        this.repoRoot = repoRoot;
        this.host = host;
        this.port = port;
        this.baseUrl = baseUrl;
        this.serverProcess = serverProcess;
        this.browser = browser;
        this.context = context;
        this.probePage = probePage;
        this.harnessPage = harnessPage;
    }

    async close() {
        try { await this.probePage?.close?.(); } catch {}
        try { await this.harnessPage?.close?.(); } catch {}
        try { await this.context?.close?.(); } catch {}
        try { await this.browser?.close?.(); } catch {}
        if (this.serverProcess) {
            try {
                this.serverProcess.kill('SIGTERM');
            } catch {}
            await Promise.race([
                onceEvent(this.serverProcess, 'exit'),
                new Promise((resolve) => setTimeout(resolve, 1200))
            ]);
        }
    }
}

export async function createHeadlessRuntime({
    repoRoot,
    needHarness = true,
    viewport = { width: 1280, height: 720 },
    host = DEFAULT_HOST,
    port = null
}) {
    const parsedPort = Number(port);
    const resolvedPort = Number.isFinite(parsedPort) && parsedPort > 0
        ? Math.floor(parsedPort)
        : await findFreePort(host, DEFAULT_START_PORT);
    const server = await startStaticServer({
        repoRoot,
        host,
        port: resolvedPort
    });
    const baseUrl = `http://${host}:${resolvedPort}`;

    let browser = null;
    let context = null;
    let probePage = null;
    let harnessPage = null;

    try {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
            viewport: {
                width: Math.max(1, Math.floor(Number(viewport?.width) || 1280)),
                height: Math.max(1, Math.floor(Number(viewport?.height) || 720))
            },
            deviceScaleFactor: 1
        });
        probePage = await context.newPage();
        await probePage.goto(`${baseUrl}/tools/texture_correction_pipeline/image_probe.html`, { waitUntil: 'domcontentloaded' });

        if (needHarness) {
            harnessPage = await context.newPage();
            await harnessPage.goto(`${baseUrl}/tests/headless/harness/index.html?ibl=0&bloom=0`, { waitUntil: 'domcontentloaded' });
            await harnessPage.waitForFunction(() => !!window.__testHooks && window.__testHooks.version === 1, null, { timeout: 15000 });
        }
    } catch (err) {
        try { await probePage?.close?.(); } catch {}
        try { await harnessPage?.close?.(); } catch {}
        try { await context?.close?.(); } catch {}
        try { await browser?.close?.(); } catch {}
        try { server.child.kill('SIGTERM'); } catch {}
        throw err;
    }

    return new HeadlessRuntime({
        repoRoot,
        host,
        port: resolvedPort,
        baseUrl,
        serverProcess: server.child,
        browser,
        context,
        probePage,
        harnessPage
    });
}
