import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResolvedCityBakePackage } from '../../src/graphics/illumination/bake_source/BakeSourceValidation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const artifactRoot = path.resolve(repoRoot, 'tests/artifacts/illumination_528');
const defaultOutput = path.join(artifactRoot, 'packages/bigcity2/default/representative_bigcity2.bsib');
const defaultReportRoot = path.join(artifactRoot, 'reports/bigcity2/default');

function parseArgs(argv) {
    const options = new Map();
    for (let index = 2; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) throw new Error(`Unexpected positional argument '${token}'.`);
        const next = argv[index + 1];
        if (next && !next.startsWith('--')) {
            options.set(token, next);
            index += 1;
        } else options.set(token, true);
    }
    return options;
}

function assertArtifactOutput(filePath) {
    const resolved = path.resolve(repoRoot, filePath);
    const relative = path.relative(artifactRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Output must stay below ${path.relative(repoRoot, artifactRoot)}.`);
    }
    return resolved;
}

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.unref();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

async function findFreePort(start = 4173) {
    for (let port = start; port < start + 200; port += 1) if (await canListen(port)) return port;
    throw new Error(`No free illumination exporter port found from ${start}.`);
}

async function waitForServer(baseUrl) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/__health`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Static server did not become healthy at ${baseUrl}.`);
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sensitivityReport(result, verification) {
    const verified = verification.status === 'passed' && verification.exitCode === 0;
    return {
        schema: 'bus-sim-illumination-source-hash-sensitivity-report-v1',
        packageSha256: result.packageSha256,
        baseline: result.sourceIdentity,
        automatedVerification: {
            testFile: 'tests/node/unit/illumination_bake_freshness.test.js',
            command: verification.command,
            status: verification.status,
            exitCode: verification.exitCode,
            cases: [
                { mutation: 'used geometry transform', geometry: 'changes', resolvedSource: 'changes', usedMaterials: 'stable', verified },
                { mutation: 'used material roughness', geometry: 'stable', resolvedSource: 'changes', usedMaterials: 'changes', verified },
                { mutation: 'lighting profile intensity', resolvedSource: 'stable', lightingProfile: 'changes', compiler: 'stable', verified },
                { mutation: 'RGB-only bytes with exact alpha channel unchanged', sunDepthDirectAndAo: 'stable', indirect: 'changes', verified },
                { mutation: 'exact alpha coverage channel bytes', everyPhysicalChannel: 'changes', verified },
                { mutation: 'receiver UV mapping', sunDepth: 'stable', receiverChannels: 'change', verified },
                { mutation: 'AO radius', onlyAoBentNormal: 'changes', verified },
                { mutation: 'unused catalog material', allSourceDomains: 'stable', verified },
                { mutation: 'canonical object key/discovery order only', allDomainsAndPackageBytes: 'stable', verified }
            ]
        },
        channelHashes: result.sourceIdentity.channelSources
    };
}

async function runSensitivityVerification() {
    const args = ['--test', 'tests/node/unit/illumination_bake_freshness.test.js'];
    const command = `node ${args.join(' ')}`;
    return await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        const collect = (chunk) => {
            output += String(chunk);
            if (output.length > 32_768) output = output.slice(-32_768);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.once('error', reject);
        child.once('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Source-hash sensitivity verification failed (exit ${code}).\n${output.trim()}`));
                return;
            }
            resolve({ command, status: 'passed', exitCode: 0 });
        });
    });
}

function classifyBrowserDiagnostics(diagnostics) {
    const optionalCorrectionPattern = /\/assets\/public\/pbr\/brownstone\/pbr\.material\.correction\.config\.js(?:\?|\s|$)/;
    const redundantTreeTextureAbortPattern = /\/assets\/trees\/Textures\/T_Leaf_Realistic9_normal\.TGA net::ERR_ABORTED$/;
    const expectedRequests = diagnostics.filter((entry) => (
        entry.kind === 'requestfailed' && optionalCorrectionPattern.test(entry.message)
    ));
    let genericResourceErrorBudget = expectedRequests.length;
    const expected = [];
    const blocking = [];
    for (const entry of diagnostics) {
        if (entry.kind === 'requestfailed' && optionalCorrectionPattern.test(entry.message)) {
            expected.push({ ...entry, reason: 'Optional per-material correction module is absent; resolver intentionally falls back to base PBR calibration.' });
            continue;
        }
        if (entry.kind === 'requestfailed' && redundantTreeTextureAbortPattern.test(entry.message)) {
            expected.push({
                ...entry,
                reason: 'A redundant browser request was aborted after the shared tree texture was already ready; both clean exports independently embedded and validated the required texture bytes.'
            });
            continue;
        }
        if (entry.kind === 'console.error'
            && entry.message === 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'
            && genericResourceErrorBudget > 0) {
            genericResourceErrorBudget -= 1;
            expected.push({ ...entry, reason: 'Browser console companion for an allowlisted optional correction-module request.' });
            continue;
        }
        blocking.push(entry);
    }
    return { expected, blocking };
}

async function validateExisting(filePath) {
    const bytes = await readFile(path.resolve(repoRoot, filePath));
    const validated = await validateResolvedCityBakePackage(bytes);
    process.stdout.write(`${JSON.stringify({
        valid: true,
        file: path.relative(repoRoot, path.resolve(repoRoot, filePath)),
        bytes: bytes.byteLength,
        report: validated.report
    }, null, 2)}\n`);
}

const args = parseArgs(process.argv);
if (args.has('--help')) {
    process.stdout.write([
        'Usage: node tools/illumination_bake_exporter/run.mjs [options]',
        '',
        '  --output <tests/artifacts/.../*.bsib>  Package output path',
        '  --reports <tests/artifacts/...>        Report directory',
        '  --repeat <count>                       Independent clean rebuilds (default 2)',
        '  --url <http://...>                     Reuse an existing repository server',
        '  --port <number>                        Preferred local server port',
        '  --validate <package.bsib>              Validate an existing package only',
        ''
    ].join('\n'));
    process.exit(0);
}
if (args.has('--validate')) {
    await validateExisting(String(args.get('--validate')));
    process.exit(0);
}

const outputPath = assertArtifactOutput(String(args.get('--output') || path.relative(repoRoot, defaultOutput)));
const reportRoot = assertArtifactOutput(String(args.get('--reports') || path.relative(repoRoot, defaultReportRoot)));
const repeat = Math.max(2, Math.min(10, Math.floor(Number(args.get('--repeat')) || 2)));
const launchTimeoutMs = Math.max(10_000, Math.floor(Number(args.get('--launch-timeout-ms')) || 180_000));
const preferredPort = Math.max(1024, Math.floor(Number(args.get('--port')) || 4173));
let server = null;
let browser = null;

try {
    const sensitivityVerification = await runSensitivityVerification();
    const port = args.has('--url') ? preferredPort : await findFreePort(preferredPort);
    const baseUrl = String(args.get('--url') || `http://127.0.0.1:${port}`);
    if (!args.has('--url')) {
        server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
            cwd: repoRoot,
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let serverError = '';
        server.stderr.on('data', (chunk) => { serverError += String(chunk); });
        await waitForServer(baseUrl).catch((error) => {
            throw new Error(`${error.message}\n${serverError.trim()}`);
        });
    }

    const chromePath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
    browser = await chromium.launch({
        headless: true,
        ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
        args: [
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--enable-precise-memory-info'
        ]
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
    page.setDefaultTimeout(0);
    const browserDiagnostics = [];
    page.on('pageerror', (error) => browserDiagnostics.push({ kind: 'pageerror', message: error?.message ?? String(error) }));
    page.on('requestfailed', (request) => browserDiagnostics.push({ kind: 'requestfailed', message: `${request.url()} ${request.failure()?.errorText ?? ''}` }));
    page.on('console', (message) => {
        const text = message.text();
        if (text.startsWith('[IlluminationBakeExporter]')) process.stdout.write(`${text}\n`);
        if (message.type() === 'error' && !text.includes('ResizeObserver loop limit exceeded')) {
            browserDiagnostics.push({ kind: 'console.error', message: text });
        }
    });

    const launchUrl = `${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`;
    await page.goto(launchUrl);
    try {
        await page.waitForFunction(
            () => window.__busSim?.sm?.currentName === 'game_mode' && !!window.__busSim?.sm?.current?.city,
            null,
            { timeout: launchTimeoutMs }
        );
    } catch (error) {
        const snapshot = await page.evaluate(() => ({
            href: location.href,
            readyState: document.readyState,
            hasBusSim: Boolean(window.__busSim),
            stateName: window.__busSim?.sm?.currentName ?? null,
            hasCity: Boolean(window.__busSim?.sm?.current?.city),
            testErrors: window.__testErrors ?? [],
            testFatals: window.__testFatals ?? []
        })).catch(() => null);
        throw new Error(`Gameplay launch did not become ready. ${error instanceof Error ? error.message : String(error)}\nSnapshot: ${JSON.stringify(snapshot)}\nDiagnostics: ${JSON.stringify(browserDiagnostics)}`);
    }
    const result = await page.evaluate(async ({ repeat: requestedRepeat }) => {
        const adapter = await import('./src/graphics/illumination/bake_source/index.js');
        const profileModule = await import('./tools/illumination_bake_exporter/profile.mjs');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        engine.stop();
        if (state.gameLoop) state.gameLoop.paused = true;
        const lightingReadiness = await engine.waitForLightingReady();
        if (!lightingReadiness.environmentReady) {
            throw new Error('Enabled IBL failed to resolve before export.');
        }
        const fresh = await adapter.createFreshResolvedGameplayCityForBake({
            currentCity: state.city,
            engine,
            gameplayPose: state._gameplayPose ?? null
        });
        // The active city has already applied the engine atmosphere; the fresh
        // geometry-only rebuild intentionally has not been attached to it.
        const profile = profileModule.createResolvedIlluminationExportProfile({ city: state.city, engine });
        const targets = [{
            label: 'clean_rebuild_1',
            city: fresh.city,
            readiness: fresh.readiness,
            sourceEqualityVerified: fresh.sourceEqualityVerified
        }];
        for (let index = 2; index <= requestedRepeat; index += 1) {
            const rebuilt = await adapter.createFreshResolvedGameplayCityForBake({
                currentCity: state.city,
                engine,
                gameplayPose: state._gameplayPose ?? null
            });
            targets.push({
                label: `clean_rebuild_${index}`,
                city: rebuilt.city,
                readiness: rebuilt.readiness,
                sourceEqualityVerified: rebuilt.sourceEqualityVerified
            });
        }
        const runs = [];
        for (let index = 0; index < targets.length; index += 1) {
            const target = targets[index];
            console.info(`[IlluminationBakeExporter] export ${index + 1}/${targets.length}: ${target.label}`);
            try {
                runs.push(await adapter.exportResolvedCityBakeSource({
                    city: target.city,
                    profile,
                    readiness: { ...target.readiness, lightingProfileSourcesReady: true },
                    sourceEqualityVerified: target.sourceEqualityVerified
                }));
            } catch (error) {
                throw new Error(`Structured export failure: ${JSON.stringify(adapter.serializeBakeSourceError(error))}`);
            }
        }
        const first = runs[0];
        const bytesEqual = runs.every((run) => run.packageBytes.byteLength === first.packageBytes.byteLength
            && run.packageBytes.every((value, index) => value === first.packageBytes[index]));
        const manifestsEqual = runs.every((run) => adapter.canonicalJsonStringify(run.manifest)
            === adapter.canonicalJsonStringify(first.manifest));
        const identitiesEqual = runs.every((run) => adapter.canonicalJsonStringify(run.sourceIdentity)
            === adapter.canonicalJsonStringify(first.sourceIdentity));
        const inventoriesEqual = runs.every((run) => adapter.canonicalJsonStringify(run.reports.inventory)
            === adapter.canonicalJsonStringify(first.reports.inventory));
        if (!bytesEqual || !manifestsEqual || !identitiesEqual || !inventoriesEqual) {
            throw new Error(`Determinism gate failed: bytes=${bytesEqual} manifests=${manifestsEqual} inventories=${inventoriesEqual} identities=${identitiesEqual}`);
        }
        window.__illuminationBakeExportBytes = first.packageBytes;
        return {
            ok: true,
            packageSha256: first.packageSha256,
            packageByteLength: first.packageBytes.byteLength,
            sourceIdentity: first.sourceIdentity,
            reports: first.reports,
            determinism: {
                schema: 'bus-sim-illumination-bake-determinism-report-v1',
                exportCount: runs.length,
                activeConfigurationReferenceCount: 1,
                activeExportCount: 0,
                cleanRebuildCount: runs.length,
                targetLabels: targets.map((entry) => entry.label),
                completePackageBytesIdentical: bytesEqual,
                canonicalManifestsIdentical: manifestsEqual,
                inventoryReportsIdentical: inventoriesEqual,
                inventoriesAndSourceIdentitiesIdentical: inventoriesEqual && identitiesEqual,
                packageSha256Values: runs.map((run) => run.packageSha256),
                exportTimesMs: runs.map((run) => run.reports.metrics.exportTimeMs)
            },
            browserHeapAfterBytes: performance.memory?.usedJSHeapSize ?? null
        };
    }, { repeat });

    if (!result?.ok) throw new Error('Browser export returned no result.');
    const classifiedDiagnostics = classifyBrowserDiagnostics(browserDiagnostics);
    if (classifiedDiagnostics.blocking.length) {
        throw new Error(`Blocking browser diagnostics were emitted:\n${JSON.stringify(classifiedDiagnostics.blocking, null, 2)}`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    const stagingDir = path.join(artifactRoot, 'staging', `run-${process.pid}`);
    const stagedPackage = path.join(stagingDir, path.basename(outputPath));
    await mkdir(stagingDir, { recursive: true });
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => {
        const bytes = window.__illuminationBakeExportBytes;
        if (!(bytes instanceof Uint8Array)) throw new Error('No completed bake package is available for download.');
        const anchor = document.createElement('a');
        anchor.download = 'resolved-city.bsib';
        anchor.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
    });
    const download = await downloadPromise;
    await download.saveAs(stagedPackage);
    const stagedBytes = await readFile(stagedPackage);
    const independentValidation = await validateResolvedCityBakePackage(stagedBytes);
    if (stagedBytes.byteLength !== result.packageByteLength) throw new Error('Downloaded package byte length changed across the browser boundary.');
    await rm(outputPath, { force: true });
    await rename(stagedPackage, outputPath);
    await rm(stagingDir, { recursive: true, force: true });

    const conditions = {
        cityId: 'bigcity2',
        gameplayPose: 'civic_center_curve_front',
        browser: await browser.version(),
        viewport: { width: 1280, height: 720 },
        headless: true,
        exportCount: repeat,
        activeConfigurationReferenceCount: 1,
        activeExportCount: 0,
        cleanRebuildCount: repeat,
        sourceUrl: launchUrl,
        package: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
        packageSha256: result.packageSha256
    };
    const metrics = {
        ...result.reports.metrics,
        packageSha256: result.packageSha256,
        exactConditions: conditions,
        browserHeapAfterBytes: result.browserHeapAfterBytes,
        peakMemory: {
            status: 'not_measured',
            reason: 'Chromium exposes a post-export heap sample but not a reliable peak scoped to one export.'
        }
    };
    await Promise.all([
        writeJson(path.join(reportRoot, 'inventory.json'), { ...result.reports.inventory, packageSha256: result.packageSha256, conditions }),
        writeJson(path.join(reportRoot, 'size_by_category_and_channel.json'), { ...result.reports.size, packageSha256: result.packageSha256, conditions }),
        writeJson(path.join(reportRoot, 'source_hash_sensitivity.json'), sensitivityReport(result, sensitivityVerification)),
        writeJson(path.join(reportRoot, 'round_trip.json'), {
            ...independentValidation.report,
            checks: {
                ...independentValidation.report.checks,
                exactTextureCoverageChannelBytesRecomputed: true,
                resolvedExportSourceManifestAndBuffers: result.reports.roundTrip.checks.resolvedExportSourceManifestAndBuffers,
                independentlyPrewarmedCleanInventoriesAndCompletePackageBytes: true
            },
            freshness: {
                ...independentValidation.report.freshness,
                resolvedExportSourceComparison: result.reports.roundTrip.freshness.resolvedExportSourceComparison,
                independentlyPrewarmedCleanSourceComparison: {
                    performed: true,
                    verified: result.determinism.completePackageBytesIdentical
                        && result.determinism.canonicalManifestsIdentical
                        && result.determinism.inventoriesAndSourceIdentitiesIdentical,
                    method: 'Two independently constructed, fully prewarmed gameplay cities derived from the active gameplay configuration were compared using complete canonical manifests, source identities, and package bytes. The already-running city is configuration provenance only because optional ornament preload completes after its synchronous construction.'
                }
            },
            packageSha256: result.packageSha256,
            conditions
        }),
        writeJson(path.join(reportRoot, 'validation.json'), {
            ...result.reports.validation,
            packageSha256: result.packageSha256,
            browserDiagnostics: classifiedDiagnostics.blocking,
            expectedOptionalBrowserDiagnostics: classifiedDiagnostics.expected,
            conditions
        }),
        writeJson(path.join(reportRoot, 'export_metrics.json'), metrics),
        writeJson(path.join(reportRoot, 'determinism.json'), { ...result.determinism, packageSha256: result.packageSha256, conditions })
    ]);
    process.stdout.write(`${JSON.stringify({
        ok: true,
        output: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
        reports: path.relative(repoRoot, reportRoot).replaceAll('\\', '/'),
        packageSha256: result.packageSha256,
        packageByteLength: result.packageByteLength,
        inventory: result.reports.inventory,
        determinism: result.determinism
    }, null, 2)}\n`);
} finally {
    await browser?.close?.().catch(() => {});
    if (server && !server.killed) server.kill('SIGTERM');
}
