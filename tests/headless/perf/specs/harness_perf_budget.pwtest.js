// Headless perf budgets: measure deterministic harness scenarios.
import test, { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

function pctLimit(value, pct) {
    if (!Number.isFinite(value)) return null;
    const p = Number(pct);
    if (!Number.isFinite(p) || p < 0) return value;
    return value * (1 + p);
}

function clampNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function getProfile() {
    const raw = String(process.env.PERF_PROFILE ?? '').trim().toLowerCase();
    return raw === 'nightly' ? 'nightly' : 'quick';
}

function getScenarioList() {
    return [
        { scenarioId: 'city_crossing', seed: 'perf-city-crossing' },
        { scenarioId: 'city_straight_road', seed: 'perf-straight-road' }
    ];
}

async function readBudgets() {
    const budgetPath = new URL('../budgets/default.json', import.meta.url);
    const raw = await fs.readFile(budgetPath, 'utf-8');
    return JSON.parse(raw);
}

async function writeBudgets(next) {
    const budgetPath = new URL('../budgets/default.json', import.meta.url);
    await fs.writeFile(budgetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
}

function enforceNumberBudget({ label, value, max }) {
    if (!Number.isFinite(max)) return;
    if (!Number.isFinite(value)) throw new Error(`${label}: expected finite value, got ${value}`);
    expect(value).toBeLessThanOrEqual(max);
}

test('Perf: harness scenarios stay within budgets', async ({ page }) => {
    const budgets = await readBudgets();
    const tolerance = budgets?.tolerance ?? {};
    const caps = budgets?.caps ?? {};
    const baselines = budgets?.baselines ?? {};

    const profile = getProfile();
    const viewport = { width: 960, height: 540 };
    const dt = 1 / 60;
    const warmupTicks = profile === 'nightly' ? 90 : 60;
    const measureTicks = profile === 'nightly' ? 240 : 120;

    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.measurePerformance);

    const results = [];
    for (const entry of getScenarioList()) {
        const res = await page.evaluate(async (args) => {
            return window.__testHooks.measurePerformance(args);
        }, { ...entry, viewport, warmupTicks, measureTicks, dt });
        results.push(res);
    }

    const artifactDir = path.resolve(process.cwd(), 'tests/artifacts/headless/perf');
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(path.join(artifactDir, 'report.json'), `${JSON.stringify({ profile, results }, null, 2)}\n`, 'utf-8');

    const update = String(process.env.UPDATE_PERF_BASELINES ?? '') === '1';
    if (update) {
        const next = { ...budgets, baselines: { ...(budgets.baselines ?? {}) } };
        for (const res of results) {
            if (!res?.scenarioId) continue;
            next.baselines[res.scenarioId] = {
                timing: {
                    avgFrameMs: clampNumber(res?.timing?.frameMs?.avg),
                    p95FrameMs: clampNumber(res?.timing?.frameMs?.p95)
                },
                renderer: {
                    callsMax: clampNumber(res?.renderer?.calls?.max),
                    trianglesMax: clampNumber(res?.renderer?.triangles?.max)
                }
            };
        }
        await writeBudgets(next);
        return;
    }

    for (const res of results) {
        const id = String(res?.scenarioId ?? '');
        expect(id).not.toBe('');

        const baseline = baselines?.[id] ?? null;
        const baseAvg = clampNumber(baseline?.timing?.avgFrameMs);
        const baseP95 = clampNumber(baseline?.timing?.p95FrameMs);
        const baseCalls = clampNumber(baseline?.renderer?.callsMax);
        const baseTriangles = clampNumber(baseline?.renderer?.trianglesMax);

        const avgMs = clampNumber(res?.timing?.frameMs?.avg);
        const p95Ms = clampNumber(res?.timing?.frameMs?.p95);
        const callsMax = clampNumber(res?.renderer?.calls?.max);
        const trianglesMax = clampNumber(res?.renderer?.triangles?.max);
        const memGeos = clampNumber(res?.renderer?.memory?.geometries);
        const memTex = clampNumber(res?.renderer?.memory?.textures);

        const capAvg = clampNumber(caps?.timing?.avgFrameMsMax);
        const capP95 = clampNumber(caps?.timing?.p95FrameMsMax);
        const capCalls = clampNumber(caps?.renderer?.callsMax);
        const capTris = clampNumber(caps?.renderer?.trianglesMax);
        const capGeos = clampNumber(caps?.renderer?.memoryGeometriesMax);
        const capTex = clampNumber(caps?.renderer?.memoryTexturesMax);

        const maxAvg = baseAvg !== null ? pctLimit(baseAvg, tolerance?.timingPct) : capAvg;
        const maxP95 = baseP95 !== null ? pctLimit(baseP95, tolerance?.timingPct) : capP95;
        const maxCalls = baseCalls !== null ? pctLimit(baseCalls, tolerance?.callsPct) : capCalls;
        const maxTris = baseTriangles !== null ? pctLimit(baseTriangles, tolerance?.trianglesPct) : capTris;

        enforceNumberBudget({ label: `${id}: avgFrameMs`, value: avgMs, max: maxAvg });
        enforceNumberBudget({ label: `${id}: p95FrameMs`, value: p95Ms, max: maxP95 });
        enforceNumberBudget({ label: `${id}: callsMax`, value: callsMax, max: maxCalls });
        enforceNumberBudget({ label: `${id}: trianglesMax`, value: trianglesMax, max: maxTris });
        enforceNumberBudget({ label: `${id}: memory.geometries`, value: memGeos, max: capGeos });
        enforceNumberBudget({ label: `${id}: memory.textures`, value: memTex, max: capTex });
    }
});

