// Checks delayed GPU attribution, invalid timers and partial coverage without rendering a scene.
import test, { expect } from '@playwright/test';

test('benchmark timing excludes surrounding frames and drains late GPU results', async ({ page }) => {
    await page.route('**/debug_tools/grass_debug_v2.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js"}}</script>'
    }));
    await page.goto('/debug_tools/grass_debug_v2.html');
    const cases = await page.evaluate(async () => {
        const THREE = await import('three');
        const { GrassDebugV2Benchmark } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Benchmark.js');
        const simulate = kind => {
            const camera = new THREE.PerspectiveCamera();
            const busPose = { position: new THREE.Vector3(-2.4, 6.883, -18.63), target: new THREE.Vector3(-2.4, 0.393, 0) };
            const diagnostics = { active: kind !== 'unsupported', disabledReason: kind === 'unsupported' ? 'unsupported' : null, submissionSequence: 5, sampleSequence: 10, disjointCount: 0 };
            let samples = [];
            const controls = {
                enabled: true,
                setLookAt({ position, target }) { camera.position.copy(position); camera.lookAt(target); }
            };
            const runner = new GrassDebugV2Benchmark({
                camera, controls, busPose, keyboard: { clear() {} },
                getViewport: () => ({ width: 800, height: 600, pixelRatio: 1 }), onChange() {},
                gpuTimer: { getDiagnostics: () => diagnostics, getSamplesSince: cursor => samples.filter(sample => sample.sequence > cursor) }
            });
            let previousFrameTime = 2000;
            const frame = (time, submissionSequence, cpuMs) => {
                runner.beforeFrame(time);
                diagnostics.submissionSequence = submissionSequence;
                runner.afterFrame({ nowMs: time, frameMs: time - previousFrameTime, cpuMs });
                previousFrameTime = time;
            };
            runner.start(0);
            const initialPosition = camera.position.toArray();
            frame(2000, 6, 2);
            samples = [{ sequence: 11, submissionSequence: 5, ms: 999 }, { sequence: 12, submissionSequence: 6, ms: 4 }];
            diagnostics.sampleSequence = 12;
            frame(2016, 7, 3);
            const arrival = 2000 + runner.flightTiming.durationMs;
            frame(arrival, 8, 4);
            const holdPositions = [camera.position.toArray()];
            const holdPhase = runner.phase;
            frame(arrival + 500, 9, 5);
            holdPositions.push(camera.position.toArray());
            frame(arrival + 1000, 10, 6);
            holdPositions.push(camera.position.toArray());
            const pending = runner.phase;
            if (kind !== 'partial') {
                samples.push({ sequence: 13, submissionSequence: 7, ms: 6 }, { sequence: 14, submissionSequence: 8, ms: 8 }, { sequence: 15, submissionSequence: 9, ms: 10 }, { sequence: 16, submissionSequence: 10, ms: 12 }, { sequence: 17, submissionSequence: 11, ms: 999 });
                diagnostics.sampleSequence = 17;
            }
            if (kind === 'disjoint') diagnostics.disjointCount++;
            runner.beforeFrame(arrival + (kind === 'partial' ? 3001 : 1016));
            const result = runner.result;
            const controlsEnabled = controls.enabled;
            runner.start(arrival + 4000);
            const resetResult = runner.result;
            runner.cancel();
            const history = runner.getSnapshot().results;
            runner.dispose();
            return { result, initialPosition, pending, holdPhase, holdPositions, controlsEnabled, resetResult, history };
        };
        return Object.fromEntries(['normal', 'unsupported', 'disjoint', 'partial'].map(kind => [kind, simulate(kind)]));
    });
    expect(cases.normal.pending).toBe('settling');
    expect(cases.normal.result.gpu).toEqual({ count: 5, averageMs: 8, p99Ms: 12 });
    expect(cases.normal.result.cpu).toEqual({ count: 5, averageMs: 4, p99Ms: 6 });
    expect(cases.normal.result.frame.count).toBe(4);
    expect(cases.normal.result.frame.averageMs).toBeCloseTo(cases.normal.result.durationMs / 4, 6);
    expect(cases.normal.result.frame.p99Ms).toBeCloseTo(cases.normal.result.flightMs - 16, 6);
    expect(cases.normal.result.gpuNote).toBe('');
    expect(cases.unsupported.result.gpu).toBeNull();
    expect(cases.unsupported.result.gpuNote).toBe('unsupported');
    expect(cases.disjoint.result.gpu).toBeNull();
    expect(cases.disjoint.result.gpuNote).toContain('disjoint');
    expect(cases.partial.result.gpu).toEqual({ count: 1, averageMs: 4, p99Ms: 4 });
    expect(cases.partial.result.gpuNote).toBe('Partial GPU coverage');
    for (const entry of Object.values(cases)) {
        expect(entry.controlsEnabled).toBe(true);
        expect(entry.resetResult).toBeNull();
        expect(entry.initialPosition).toEqual([19, 22, -22]);
        expect(entry.holdPhase).toBe('holding');
        expect(entry.result.holdMs).toBeCloseTo(1000, 6);
        expect(entry.holdPositions[1]).toEqual(entry.holdPositions[0]);
        expect(entry.holdPositions[2]).toEqual(entry.holdPositions[0]);
        expect(entry.history).toEqual([entry.result]);
    }
});

test('sidewalk flight halves the original speed and accelerates smoothly on exit', async ({ page }) => {
    await page.route('**/grass-flight-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js"}}</script>' }));
    await page.goto('/grass-flight-check');
    const motion = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createBenchmarkRoute, createBenchmarkFlightTiming, easeBenchmarkProgress } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkRoute.js');
        const route = createBenchmarkRoute(new THREE.Vector3(-2.4, 6.883, -18.63));
        const timing = createBenchmarkFlightTiming(route);
        const length = route.getLength();
        const start = route.getCurveLengths().at(-3), end = route.getCurveLengths().at(-2);
        const timeAtDistance = (sample, duration, distance) => {
            let low = 0, high = duration;
            for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2;
                if (sample(mid) * length < distance) low = mid;
                else high = mid;
            }
            return (low + high) / 2;
        };
        const speed = (sample, time) => (sample(time + 1) - sample(time - 1)) * length * 500;
        const baseline = time => easeBenchmarkProgress(time / timing.baseDurationMs);
        const velocity = distance => speed(timing.distanceAtTime, timeAtDistance(timing.distanceAtTime, timing.durationMs, distance));
        const ratios = [start - 8, start + 1, start + 5, end - 1, end + 8].map(distance => velocity(distance) / speed(baseline, timeAtDistance(baseline, timing.baseDurationMs, distance)));
        return { ratios, entry: [velocity(start - 0.01), velocity(start + 0.01)], exit: [velocity(end - 0.01), velocity(end + 0.01)], slow: velocity(end), accelerated: velocity(end + 5), durationMs: timing.durationMs, endpoints: [timing.distanceAtTime(0), timing.distanceAtTime(timing.durationMs), timing.distanceAtTime(timing.durationMs + 1000)] };
    });
    motion.ratios.forEach((ratio, i) => expect(ratio).toBeCloseTo([1, 0.5, 0.5, 0.5, 1][i], 3));
    expect(Math.abs(motion.entry[0] - motion.entry[1])).toBeLessThan(0.01);
    expect(Math.abs(motion.exit[0] - motion.exit[1])).toBeLessThan(0.01);
    expect(motion.accelerated).toBeGreaterThan(motion.slow * 1.8);
    expect(motion.durationMs).toBeGreaterThan(24_000);
    expect(motion.endpoints).toEqual([0, 1, 1]);
});
