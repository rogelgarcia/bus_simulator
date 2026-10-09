// Verifies flight geometry, bus-camera cruise and look-back, timing collection and interruption recovery.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Grass Debug benchmark follows the route and reports a compact result', async ({ page }) => {
    test.setTimeout(210_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const artifacts = 'tests/artifacts/screens/grass_debug_v2/flight_smoothing/rendered';
    await mkdir(artifacts, { recursive: true });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassFlightView = view;\nlet copyFeedbackTimer;') });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const routeChecks = await page.evaluate(() => {
        const view = window.__grassFlightView, runner = view.benchmark, route = runner.route;
        const total = route.getLength(), lengths = route.getCurveLengths();
        const busFraction = lengths[0] / total;
        const cruise = Array.from({ length: 11 }, (_, i) => route.getPoint((lengths[0] + (lengths[1] - lengths[0]) * i / 10) / total).toArray());
        const grass = Array.from({ length: 11 }, (_, i) => route.getPoint((lengths[2] + (lengths[3] - lengths[2]) * i / 10) / total).toArray());
        return { ...runner.getRouteSnapshot(), cruise, grass, busPosition: view.busPose.position.toArray(),
            busDirection: view.busPose.target.clone().sub(view.busPose.position).normalize().toArray(),
            cruiseStartMs: runner.flightTiming.timeAtDistance(lengths[0] / total),
            cruiseEndMs: runner.flightTiming.timeAtDistance(lengths[1] / total),
            busTangentDot: route.getTangent(busFraction - 1e-5).dot(route.getTangent(busFraction + 1e-5)),
            minY: Math.min(...Array.from({ length: 1001 }, (_, i) => route.getPoint(i / 1000).y)) };
    });
    expect(routeChecks.waypoints[0]).toEqual([19, 22, -22]);
    expect(routeChecks.waypoints[1]).toEqual(routeChecks.busPosition);
    expect(routeChecks.waypoints.at(-1)).toEqual([14.39, 8.247, 48.256]);
    expect(routeChecks.clearanceZ - routeChecks.busFrontZ).toBeCloseTo(10, 6);
    expect(routeChecks.busTangentDot).toBeGreaterThan(0.99999);
    routeChecks.cruise.forEach(point => {
        expect(point[0]).toBeCloseTo(routeChecks.busPosition[0], 6);
        expect(point[1]).toBeCloseTo(routeChecks.busPosition[1], 6);
    });
    routeChecks.grass.forEach(point => {
        expect(point[0]).toBeCloseTo(routeChecks.waypoints[3][0], 5);
        expect(point[1]).toBeCloseTo(1.258, 5);
    });
    expect(routeChecks.grass.at(-1)[2]).toBeCloseTo(108, 5);
    expect(routeChecks.minY).toBeGreaterThan(1.25);
    expect(routeChecks.lookBackEndMs - routeChecks.lookBackStartMs).toBe(4000);
    const poses = [['arrival', routeChecks.cruiseStartMs / 2], ['cruise', (routeChecks.cruiseStartMs + routeChecks.cruiseEndMs) / 2],
        ['grass', routeChecks.lookBackStartMs - 4000], ...[0, 1, 2, 3, 4].map(second => [`look-left-${second}s`, routeChecks.lookBackStartMs + second * 1000]), ['wide', routeChecks.flightMs]];
    for (const [name, time] of poses) {
        await page.evaluate(time => {
            const view = window.__grassFlightView, runner = view.benchmark;
            const position = runner.route.getPoint(runner.flightTiming.distanceAtTime(time));
            const rotation = view.camera.quaternion.clone(); runner.flightOrientation.sample(time, position, rotation);
            const direction = view.camera.position.clone().set(0, 0, -1).applyQuaternion(rotation);
            view.controls.setLookAt({ position, target: position.clone().add(direction) });
            view.grass.update(position, performance.now(), true);
        }, time);
        const frame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
        await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 3, frame);
        await page.screenshot({ path: `${artifacts}/${name}.png` });
    }
    const run = page.getByRole('button', { name: 'Run', exact: true });
    await page.getByRole('button', { name: 'Overview', exact: false }).click();
    const overview = await page.evaluate(() => window.__grassDebugV2.getSnapshot().camera);
    await page.getByRole('button', { name: 'Bus camera' }).click();
    await run.click();
    const initialCamera = await page.evaluate(() => window.__grassDebugV2.getSnapshot().camera);
    expect(initialCamera.position).toEqual(overview.position);
    initialCamera.direction.forEach((value, axis) => expect(value).toBeCloseTo(overview.direction[axis], 4));
    await page.screenshot({ path: `${artifacts}/overview-start.png` });
    await expect(page.getByRole('button', { name: 'Bus camera' })).toBeDisabled();
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().benchmark.phase === 'running');
    await page.keyboard.press('2');
    await page.keyboard.down('w');
    const alignment = await page.evaluate(async () => {
        const snapshots = [];
        return new Promise(resolve => {
            const sample = () => {
                const snapshot = window.__grassDebugV2.getSnapshot();
                if (!['running', 'holding'].includes(snapshot.benchmark.phase)) return resolve(snapshots);
                const runner = window.__grassFlightView.benchmark;
                const t = runner.flightTiming.distanceAtTime(snapshot.benchmark.elapsedMs);
                const position = runner.route.getPoint(t);
                const busDirection = runner.busPose.target.clone().sub(runner.busPose.position).normalize();
                const busLook = runner.flightOrientation.busTarget.clone().sub(position).normalize();
                const dot = direction => direction.toArray().reduce((sum, v, i) => sum + v * snapshot.camera.direction[i], 0);
                snapshots.push({ elapsedMs: snapshot.benchmark.elapsedMs, progress: snapshot.benchmark.progress,
                    error: Math.hypot(...snapshot.camera.position.map((v, i) => v - position.toArray()[i])),
                    busCruiseDot: dot(busDirection), busLookDot: dot(busLook) });
                setTimeout(sample, 300);
            };
            sample();
        });
    });
    await page.keyboard.up('w');
    expect(alignment.length).toBeGreaterThan(50);
    expect(Math.max(...alignment.map(sample => sample.error))).toBeLessThan(0.001);
    const cruiseSamples = alignment.filter(s => s.elapsedMs >= routeChecks.cruiseStartMs && s.elapsedMs <= routeChecks.cruiseEndMs);
    const lookBackSamples = alignment.filter(s => s.elapsedMs >= routeChecks.lookBackEndMs);
    expect(cruiseSamples.length).toBeGreaterThan(2);
    expect(lookBackSamples.length).toBeGreaterThan(3);
    expect(Math.min(...cruiseSamples.map(s => s.busCruiseDot))).toBeGreaterThan(.99999);
    expect(Math.min(...lookBackSamples.map(s => s.busLookDot))).toBeGreaterThan(.99999);
    await expect.poll(() => page.evaluate(() => window.__grassDebugV2.getSnapshot().benchmark.phase)).toBe('complete');
    const snapshot = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    const result = snapshot.benchmark.result;
    snapshot.camera.position.forEach((value, axis) => expect(value).toBeCloseTo(routeChecks.waypoints.at(-1)[axis], 4));
    expect(result.durationMs).toBeGreaterThanOrEqual(routeChecks.flightMs + 1000);
    expect(result.durationMs).toBeLessThan(routeChecks.flightMs + 2000);
    expect(result.holdMs).toBeGreaterThanOrEqual(1000);
    expect(result.frame.count).toBe(result.renderedFrames - 1);
    expect(result.cpu.count).toBe(result.renderedFrames);
    expect(result.frame.averageMs).toBeGreaterThan(0);
    expect(result.frame.p99Ms).toBeGreaterThan(0);
    if (snapshot.gpu.active) {
        expect(result.gpu.count).toBeGreaterThan(result.renderedFrames * 0.95);
        expect(result.gpu.averageMs).toBeGreaterThan(0);
    }
    const results = page.locator('#benchmark-results output');
    const outcome = results.first();
    await expect(results).toHaveCount(1);
    await expect(outcome).toHaveText(/^AUTO · (?:GPU|Frame) [\d.]+ avg · [\d.]+ p99 ms$/);
    await expect(outcome).toHaveAttribute('title', /Frame interval \(includes VSync\)/);
    expect(await outcome.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Bus camera' })).toBeEnabled();
    await page.getByRole('button', { name: 'LOD3', exact: true }).click();
    const firstText = await outcome.textContent();
    await run.click();
    await expect(outcome).toHaveText(firstText);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().benchmark.results.length === 2, null, { timeout: 90_000 });
    await expect(results).toHaveCount(2);
    await expect(outcome).toHaveText(firstText);
    await expect(results.last()).toHaveText(/^LOD3 · (?:GPU|Frame) [\d.]+ avg · [\d.]+ p99 ms$/);
    await page.screenshot({ path: `${artifacts}/complete.png` });
    await writeFile(`${artifacts}/result.json`, JSON.stringify({ result, alignment, routeChecks }, null, 2));
    await run.click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#benchmark-status')).toHaveText('Cancelled · Window lost focus');
    await expect(results).toHaveCount(2);
    await expect(outcome).toHaveText(firstText);
    await page.getByRole('button', { name: 'Bus camera' }).click();
    await page.keyboard.down('e');
    await expect.poll(() => page.evaluate(() => window.__grassDebugV2.getSnapshot().camera.position[1])).toBeGreaterThan(7);
    await page.keyboard.up('e');
    expect(errors).toEqual([]);
});
