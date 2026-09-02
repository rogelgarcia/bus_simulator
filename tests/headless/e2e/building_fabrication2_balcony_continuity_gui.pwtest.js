// Headless browser test: BF2 explicit balcony endpoint continuity controls.
import test, { expect } from '@playwright/test';

test.setTimeout(360_000);

async function enableSelectedBayBalcony(floorLayer) {
    const editor = floorLayer.locator('.building-fab2-bay-editor');
    const label = editor.locator('.building-fab-row-label').filter({ hasText: /^Balcony$/ });
    await label.locator('..').getByRole('button', { name: 'On', exact: true }).click();
    await expect(editor.locator('[data-role="balcony-continuity:endpoint"]')).toHaveCount(2);
}
async function clickLiveElement(page, selector, index = 0) {
    await page.waitForFunction(({ selector: liveSelector, index: liveIndex }) => {
        const element = document.querySelectorAll(liveSelector)[liveIndex] ?? null;
        if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
        element.click();
        return true;
    }, { selector, index });
}

const LIVE_CONTINUITY_OPEN = '[data-role="balcony-continuity:endpoint"][data-edge="end"] button[data-action="balcony-continuity:open"]';
const LIVE_CONTINUITY_CREATE = '.building-fab2-link-overlay:not(.hidden) button[data-action="balcony-continuity:create"]';
const LIVE_CONTINUITY_REMOVE = '.building-fab2-link-overlay:not(.hidden) button[data-action="balcony-continuity:remove"]';
const LIVE_OVERLAY_CLOSE = '.building-fab2-link-overlay:not(.hidden) .building-fab2-link-header > button';


test('BF2: balcony endpoints create/remove same-run and reversed cross-run links', async ({ page }) => {
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (text.includes('ResizeObserver loop limit exceeded')) return;
        browserErrors.push(text);
    });

    await page.goto('/index.html?screen=building_fabrication2&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#building-fab2-hud');
    await page.waitForFunction(() => !!window.__busSim?.sm?.current, null, { timeout: 60_000 });

    // This spec verifies editor/config behavior. Count preview requests while
    // leaving mesh generation to the generator and visual suites.
    await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view;
        const ui = view?.ui;
        window.__balconyContinuityRebuildRequests = 0;
        view._requestRebuild = () => {
            window.__balconyContinuityRebuildRequests += 1;
        };
        // A populated cache also keeps the independent thumbnail job idle.
        ui?._balconyPresetThumbById?.set?.('test-placeholder', 'ready');
    });
    const rebuildRequestCount = () => page.evaluate(() => window.__balconyContinuityRebuildRequests ?? 0);
    await page.locator('.building-fab2-create-btn').click();
    const floorLayer = page.locator('.building-fab2-layer-group.is-floor').first();
    await expect(floorLayer).toBeVisible();
    await floorLayer.locator('.building-fab2-face-btn').filter({ hasText: /^A$/ }).click();
    await expect(floorLayer.locator('.building-fab2-layer-dynamic-content')).toBeVisible();

    const addBay = floorLayer.locator('.building-fab2-bay-btn.is-add');
    await addBay.click();
    await addBay.click();

    const authoredBays = floorLayer.locator('.building-fab2-bay-btn:not(.is-add):not(.is-grouping)');
    await expect(authoredBays).toHaveCount(2);
    await authoredBays.nth(0).click();
    await enableSelectedBayBalcony(floorLayer);
    await authoredBays.nth(1).click();
    await enableSelectedBayBalcony(floorLayer);

    const setFaceABalconySideMargins = async (sideMarginMeters) => page.evaluate((margin) => {
        const view = window.__busSim?.sm?.current?.view;
        const layer = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        const bays = view?._currentConfig?.facades?.[layer?.id]?.A?.layout?.bays?.items ?? [];
        for (const bay of bays) {
            const balcony = bay?.balcony && typeof bay.balcony === 'object' ? bay.balcony : {};
            bay.balcony = {
                ...balcony,
                enabled: true,
                platform: {
                    ...(balcony.platform && typeof balcony.platform === 'object' ? balcony.platform : {}),
                    sideMarginMeters: margin
                }
            };
        }
    }, sideMarginMeters);

    const setFaceABayDepth = async (bayIndex, depthMeters) => page.evaluate(({ index, depth }) => {
        const view = window.__busSim?.sm?.current?.view;
        const layer = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        const bay = view?._currentConfig?.facades?.[layer?.id]?.A?.layout?.bays?.items?.[index] ?? null;
        if (!bay) return;
        if (Math.abs(depth) < 1e-6) delete bay.depth;
        else bay.depth = { left: depth, right: depth };
    }, { index: bayIndex, depth: depthMeters });

    // The same controls also author continuity between neighboring bays on one run.
    await authoredBays.nth(0).click();
    const sameRunEnd = floorLayer.locator('[data-role="balcony-continuity:endpoint"][data-edge="end"]');
    await expect(sameRunEnd).toContainText('Same run');

    // Same-run slabs must reach their shared endpoint just like corner-linked slabs.
    await setFaceABalconySideMargins(0.1);
    await clickLiveElement(page, LIVE_CONTINUITY_OPEN);
    const sameRunPopup = page.locator('[data-role="balcony-continuity:popup"]');
    const sameRunTarget = sameRunPopup.locator('[data-role="balcony-continuity:target"]');
    await expect(sameRunTarget).toBeDisabled();
    await expect(sameRunPopup.locator('[data-role="balcony-continuity:diagnostics"]')).toContainText(
        'Linked balcony side margins must be 0.04 m or less so both slabs reach their shared endpoint.'
    );
    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);

    await setFaceABalconySideMargins(0);
    await setFaceABayDepth(0, 0.25);
    await clickLiveElement(page, LIVE_CONTINUITY_OPEN);
    await expect(sameRunTarget).toBeDisabled();
    await expect(sameRunPopup.locator('[data-role="balcony-continuity:diagnostics"]')).toContainText(
        'Same-run balcony bays resolve to different facade depths; align their bay Depth settings before linking.'
    );
    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);

    await setFaceABayDepth(0, 0);
    const recessedValidation = await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view;
        const ui = view?.ui;
        const layer = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        const bays = view?._currentConfig?.facades?.[layer?.id]?.A?.layout?.bays?.items ?? [];
        const originals = bays.map((bay) => ({ depth: structuredClone(bay.depth), balcony: structuredClone(bay.balcony) }));
        for (const bay of bays) {
            bay.depth = { left: -1.4, right: -1.4, linked: true };
            bay.balcony = { enabled: true, presetId: 'balcony.modern_recessed' };
        }
        const source = { faceId: 'A', bayId: bays[0].id, edge: 'end' };
        const target = { faceId: 'A', bayId: bays[1].id, edge: 'start' };
        const result = ui._validateBalconyContinuityCandidate(layer.id, source, target);
        for (let index = 0; index < bays.length; index += 1) {
            if (originals[index].depth === undefined) delete bays[index].depth;
            else bays[index].depth = originals[index].depth;
            bays[index].balcony = originals[index].balcony;
        }
        return result;
    });
    expect(recessedValidation.valid).toBe(true);
    expect(recessedValidation.errors).not.toContain(
        'Recessed balcony continuity is not supported yet; both balconies must be Projecting.'
    );

    await clickLiveElement(page, LIVE_CONTINUITY_OPEN);
    await expect(sameRunTarget).toHaveAttribute('data-relationship', 'same-run');
    await expect(sameRunTarget).toBeEnabled();
    const beforeSameRunCreate = await rebuildRequestCount();
    await clickLiveElement(page, LIVE_CONTINUITY_CREATE);
    expect(await rebuildRequestCount()).toBeGreaterThan(beforeSameRunCreate);
    const sameRunLinked = sameRunPopup.locator('[data-role="balcony-continuity:linked"]');
    await expect(sameRunLinked).toContainText('Same run');
    const beforeSameRunRemove = await rebuildRequestCount();
    await clickLiveElement(page, LIVE_CONTINUITY_REMOVE);
    expect(await rebuildRequestCount()).toBeGreaterThan(beforeSameRunRemove);
    await expect(sameRunTarget).toBeEnabled();
    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);
    await clickLiveElement(page, '.building-fab2-layer-group.is-floor .building-fab2-bay-btn:not(.is-add):not(.is-grouping)', 1);

    // The default rectangular authoring loop is A -> D -> C -> B. Reuse
    // Face A on its adjacent physical Face D, with bay order reversed.
    // The live inspector can replace this header button while updating its
    // config signature. Dispatching through the current DOM node avoids a
    // Playwright stability wait against a node that is intentionally replaced.
    await floorLayer.locator('.building-fab2-layer-faces-header')
        .getByRole('button', { name: 'Link', exact: true })
        .evaluate((button) => button.click());
    const linkOverlay = page.locator('.building-fab2-link-overlay:not(.hidden)');
    await expect(linkOverlay).toBeVisible();
    await clickLiveElement(page, '.building-fab2-link-overlay:not(.hidden) .building-fab2-lock-btn[data-face-id="D"]');
    const reverseD = linkOverlay.locator('input[data-action="face-link:reverse"][data-face-id="D"]');
    await expect(reverseD).toBeEnabled();
    await clickLiveElement(page, '.building-fab2-link-overlay:not(.hidden) input[data-action="face-link:reverse"][data-face-id="D"]');
    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);
    await expect(linkOverlay).toBeHidden();

    // Winding-aware topology rejects a concave A→B turn even though the faces
    // are immediate neighbors. The popup consumes this same validation result.
    const concaveValidation = await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view;
        const ui = view?.ui;
        const layer = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        const originalPlan = ui?._facadeFacePlansByLayerId?.[layer?.id] ?? null;
        const points = [
            { x: 0, z: 0 },
            { x: 2, z: 1 },
            { x: 4, z: 0 },
            { x: 2, z: 4 }
        ];
        ui._facadeFacePlansByLayerId[layer.id] = {
            faceIds: ['A', 'D', 'C', 'B'],
            segments: ['A', 'D', 'C', 'B'].map((faceId, index) => ({
                faceId,
                a: points[index],
                b: points[(index + 1) % points.length],
                arc: null
            }))
        };
        const sourceFace = ui._resolveBalconyContinuityFace(layer.id, 'A');
        const source = {
            faceId: 'A',
            bayId: sourceFace.bays[sourceFace.bays.length - 1].bayId,
            edge: 'end'
        };
        const target = ui._getAdjacentBalconyEndpoint(layer.id, source).target;
        const result = ui._validateBalconyContinuityCandidate(layer.id, source, target);
        ui._facadeFacePlansByLayerId[layer.id] = originalPlan;
        return result;
    });
    expect(concaveValidation.relationship).toBe('cross-run');
    expect(concaveValidation.valid).toBe(false);
    expect(concaveValidation.errors).toContain(
        'Cross-run balcony continuity cannot cross this concave or re-entrant corner; choose a convex or straight adjacent corner.'
    );

    const endRow = floorLayer.locator('[data-role="balcony-continuity:endpoint"][data-edge="end"]');
    await expect(endRow).toHaveAttribute('data-linked', 'false');
    await expect(endRow).toContainText('Cross-run');
    await clickLiveElement(page, LIVE_CONTINUITY_OPEN);

    const continuityPopup = page.locator('[data-role="balcony-continuity:popup"]');
    await expect(continuityPopup).toBeVisible();
    const target = continuityPopup.locator('[data-role="balcony-continuity:target"]');
    await expect(target).toBeEnabled();
    await expect(target).toHaveAttribute('data-relationship', 'cross-run');
    await expect(target).toContainText('Face D');
    await expect(target).toContainText('authored on Face A');
    await expect(target).toContainText('reversed order');
    await clickLiveElement(page, LIVE_CONTINUITY_CREATE);

    const linkedCard = page.locator('[data-role="balcony-continuity:linked"]');
    await expect(linkedCard).toBeVisible();
    await expect(linkedCard).toContainText('Cross-run');
    await expect(endRow).toHaveAttribute('data-linked', 'true');

    const authoredLink = await page.evaluate(() => {
        const layers = window.__busSim?.sm?.current?.view?._currentConfig?.layers ?? [];
        const floor = layers.find((entry) => entry?.type === 'floor') ?? null;
        return floor?.balconyContinuity ?? null;
    });
    expect(authoredLink?.links).toHaveLength(1);
    expect(authoredLink.links[0].endpoints.map((entry) => [entry.faceId, entry.edge])).toEqual([
        ['A', 'end'],
        ['D', 'start']
    ]);

    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);
    await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view;
        const floor = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        view?._setSelectedFace?.(floor?.id, 'D');
    });

    const slavePanel = floorLayer.locator(
        '[data-role="balcony-continuity:physical-slave"][data-face-id="D"]'
    );
    await expect(slavePanel).toBeVisible();
    await expect(slavePanel).toContainText('Face D inherits facade bays from Face A');
    await expect(slavePanel).toContainText('authored on Face A');
    await expect(slavePanel).toContainText('reversed order');
    await expect(slavePanel.locator('[data-role="bay-boundary-editor"][data-face-id="D"]').first()).toBeVisible();
    await expect(floorLayer.locator('.building-fab2-layer-dynamic-content')).toHaveClass(/is-slave-collapsed/);

    const initiallyLinkedSlaveEndpoint = slavePanel.locator(
        '[data-role="balcony-continuity:endpoint"][data-face-id="D"][data-edge="start"][data-linked="true"]'
    );
    await expect(initiallyLinkedSlaveEndpoint).toHaveCount(1);
    const slaveBayId = await initiallyLinkedSlaveEndpoint.getAttribute('data-bay-id');
    expect(slaveBayId).toBeTruthy();
    const slaveEndpoint = slavePanel.locator(
        `[data-role="balcony-continuity:endpoint"][data-face-id="D"][data-bay-id="${slaveBayId}"][data-edge="start"]`
    );
    await expect(slaveEndpoint).toHaveCount(1);
    await expect(slaveEndpoint).toHaveAttribute('data-linked', 'true');
    await expect(slaveEndpoint).toContainText('Linked to Face A');
    await expect(slaveEndpoint.locator('[data-relationship="cross-run"]')).toBeVisible();
    const slaveManage = slaveEndpoint.getByRole('button', { name: 'Balcony Start continuity' });
    await expect(slaveManage).toBeEnabled();
    await clickLiveElement(page, '[data-role="balcony-continuity:physical-slave"][data-face-id="D"] [data-role="balcony-continuity:endpoint"][data-edge="start"][data-linked="true"] button[data-action="balcony-continuity:open"]');

    const slavePopup = page.locator('[data-role="balcony-continuity:popup"]');
    await expect(slavePopup).toBeVisible();
    await expect(slavePopup.locator('.building-fab2-balcony-continuity-source')).toContainText('Face D');
    await expect(slavePopup.locator('.building-fab2-balcony-continuity-source')).toContainText('authored on Face A');
    await expect(slavePopup.locator('.building-fab2-balcony-continuity-source')).toContainText('reversed order');
    const slaveLinkedCard = slavePopup.locator('[data-role="balcony-continuity:linked"]');
    await expect(slaveLinkedCard).toContainText('Face A');
    await clickLiveElement(page, LIVE_CONTINUITY_REMOVE);
    await expect(slavePopup.locator('[data-role="balcony-continuity:target"]')).toBeEnabled();
    await expect(slaveEndpoint).toHaveAttribute('data-linked', 'false');
    const clearedContinuity = await page.evaluate(() => {
        const layers = window.__busSim?.sm?.current?.view?._currentConfig?.layers ?? [];
        const floor = layers.find((entry) => entry?.type === 'floor') ?? null;
        return floor?.balconyContinuity ?? null;
    });
    expect(clearedContinuity).toBeNull();

    await clickLiveElement(page, LIVE_OVERLAY_CLOSE);
    await page.evaluate(() => {
        const view = window.__busSim?.sm?.current?.view;
        const floor = view?._currentConfig?.layers?.find((entry) => entry?.type === 'floor') ?? null;
        view?._setSelectedFace?.(floor?.id, 'A');
    });
    const masterDynamicContent = floorLayer.locator('.building-fab2-layer-dynamic-content');
    await expect(masterDynamicContent).toBeVisible();
    await expect(masterDynamicContent).not.toHaveClass(/is-slave-collapsed/);
    await expect(masterDynamicContent.locator('.building-fab2-bay-editor')).toBeVisible();
    await expect(masterDynamicContent.locator('[data-role="balcony-continuity:endpoint"]')).toHaveCount(2);
    expect(browserErrors).toEqual([]);
});
