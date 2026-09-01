// Headless browser regression: desktop Lab trees load in bounded deterministic batches.
import test, { expect } from '@playwright/test';

test('Lab Scene: desktop tree transport stays within four in-flight FBX requests', async ({ page, baseURL }) => {
    test.setTimeout(180_000);

    const appOrigin = new URL(baseURL).origin;
    const transfers = new Map();
    const requestFailures = [];
    const pageErrors = [];
    const consoleErrors = [];
    let inFlight = 0;
    let peakInFlight = 0;

    const isDesktopTreeFbx = (rawUrl) => {
        const url = new URL(rawUrl);
        return url.origin === appOrigin
            && /^\/assets\/trees\/Models\/Desktop\/SM_H_Tree_(?:[1-9]|1[0-5])\.FBX$/.test(decodeURIComponent(url.pathname));
    };
    const getTransfer = (url) => {
        let transfer = transfers.get(url);
        if (!transfer) {
            transfer = { requestCount: 0, responseStatuses: [], contentLengths: [], finishedCount: 0, failedCount: 0 };
            transfers.set(url, transfer);
        }
        return transfer;
    };

    page.on('request', (request) => {
        if (!isDesktopTreeFbx(request.url())) return;
        getTransfer(request.url()).requestCount += 1;
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
    });
    page.on('response', (response) => {
        if (!isDesktopTreeFbx(response.url())) return;
        const transfer = getTransfer(response.url());
        transfer.responseStatuses.push(response.status());
        transfer.contentLengths.push(Number(response.headers()['content-length']));
    });
    page.on('requestfinished', (request) => {
        if (!isDesktopTreeFbx(request.url())) return;
        getTransfer(request.url()).finishedCount += 1;
        inFlight -= 1;
    });
    page.on('requestfailed', (request) => {
        if (!isDesktopTreeFbx(request.url())) return;
        getTransfer(request.url()).failedCount += 1;
        requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`);
        inFlight -= 1;
    });
    page.on('pageerror', (error) => {
        pageErrors.push(error?.message ?? String(error));
    });
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/debug_tools/lab_scene.html?treeQuality=desktop&coreTests=0');
    await page.waitForFunction(() => !!window.__labSceneValidation?.readiness);
    const readiness = await page.evaluate(() => window.__labSceneValidation.readiness);
    const successfulUrls = [...transfers.entries()]
        .filter(([, transfer]) => transfer.requestCount === 1
            && transfer.responseStatuses.length === 1
            && transfer.responseStatuses[0] === 200
            && transfer.contentLengths.length === 1
            && transfer.contentLengths[0] > 0
            && transfer.finishedCount === 1
            && transfer.failedCount === 0)
        .map(([url]) => url);
    const requestOrder = [...transfers.keys()]
        .map((url) => decodeURIComponent(new URL(url).pathname).split('/').at(-1));

    expect([...transfers.keys()]).toHaveLength(15);
    expect(new Set(successfulUrls).size).toBe(15);
    expect(requestOrder).toEqual(Array.from({ length: 15 }, (_, index) => `SM_H_Tree_${index + 1}.FBX`));
    expect(requestFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(inFlight).toBe(0);
    expect(peakInFlight).toBeLessThanOrEqual(4);
    expect(readiness).toMatchObject({
        ready: true,
        treesReady: true,
        treePlacementCount: 73,
        treeChildCount: 73
    });
});
