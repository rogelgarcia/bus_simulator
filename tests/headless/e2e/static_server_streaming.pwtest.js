import {expect, test} from '@playwright/test';

const ASSETS = Object.freeze([
    '/assets/public/pbr/_manifest.json',
    '/assets/trees/Textures/T_Leaf_Realistic9.TGA',
    '/assets/trees/Textures/T_Leaf_Realistic9_normal.TGA',
    '/assets/trees/Textures/T_Trunk_Realistic9.TGA',
    '/assets/trees/Textures/T_Trunk_Realistic9_normal.TGA',
    ...Array.from(
        {length: 15},
        (_, index) => `/assets/trees/Models/Desktop/SM_H_Tree_${index + 1}.FBX`
    )
]);

test('static server completes a production tree burst without aborting keep-alive requests', async ({page}) => {
    const failures = [];
    page.on('requestfailed', (request) => failures.push({
        error: request.failure()?.errorText ?? 'unknown',
        method: request.method(),
        url: request.url()
    }));

    await page.goto('/__health');
    const transfers = await page.evaluate(async (urls) => {
        const completeBufferFetch = async (url) => {
            const response = await fetch(url, {cache: 'no-store'});
            const bytes = await response.arrayBuffer();
            return {byteLength: bytes.byteLength, status: response.status, url};
        };
        return Promise.all(urls.map(completeBufferFetch));
    }, ASSETS);

    expect(failures).toEqual([]);
    expect(transfers).toHaveLength(ASSETS.length);
    for (const transfer of transfers) {
        expect(transfer.status, transfer.url).toBe(200);
        expect(transfer.byteLength, transfer.url).toBeGreaterThan(0);
    }
});
