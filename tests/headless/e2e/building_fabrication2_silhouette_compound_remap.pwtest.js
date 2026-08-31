// AI 537: compound balcony-continuity remaps expose one target choice per affected physical face.
import test, { expect } from '@playwright/test';

test('BF2 silhouette popup authors independent targets for a two-face balcony continuity remap', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ResizeObserver loop limit exceeded')) {
            errors.push(message.text());
        }
    });

    await page.goto('/index.html?screen=building_fabrication2&ibl=0&bloom=0&coreTests=0');
    await page.waitForSelector('#building-fab2-hud');
    await page.evaluate(() => {
        const popup = window.__busSim?.sm?.current?.view?._silhouettePopup;
        if (!popup) throw new Error('BF2 silhouette popup is unavailable.');
        const documentValue = {
            version: 1,
            mode: 'detached',
            loop: [
                { x: -5, z: 3, cornerId: 'corner_1', runId: 'E', runForward: true },
                { x: 5, z: 3, cornerId: 'corner_2', runId: 'F', runForward: false },
                { x: 5, z: -3, cornerId: 'corner_3', runId: 'C', runForward: true },
                { x: -5, z: -3, cornerId: 'corner_4', runId: 'D', runForward: true }
            ]
        };
        popup.open({
            layerId: 'floor_1',
            layerLabel: 'Floor 1',
            sourceMode: 'detached',
            initialDocument: documentValue,
            resolvedDocument: documentValue
        });
        popup.setExternalState({
            remapReport: {
                retainedRunIds: ['C', 'D'],
                addedRunIds: ['E', 'F'],
                removedRunIds: ['A', 'B'],
                orientationChangedRunIds: [],
                beforeRunForwardById: { A: true, B: true, C: true, D: true },
                afterRunForwardById: { E: true, F: false, C: true, D: true },
                targets: [
                    {
                        targetId: 'balcony_continuity:floor_1:corner_wrap',
                        kind: 'balcony_continuity_link',
                        runIds: ['A', 'B'],
                        missingRunIds: ['A', 'B'],
                        incompatibleRunIds: [],
                        status: 'needs_decision',
                        message: 'Runs A and B no longer exist.',
                        candidateRunIds: ['C', 'D', 'E', 'F'],
                        target: {
                            kind: 'balcony_continuity_link',
                            targetId: 'balcony_continuity:floor_1:corner_wrap',
                            faceIds: ['A', 'B']
                        }
                    }
                ]
            }
        });
    });

    const remapRow = page.locator(
        '.building-fab2-silhouette-remap-row[data-remap-id="balcony_continuity:floor_1:corner_wrap"]'
    );
    await expect(remapRow).toBeVisible();
    await remapRow.locator('[data-role="silhouette:remap-action"]').selectOption('remap');

    const targets = remapRow.locator('[data-role="silhouette:remap-run"]');
    await expect(targets).toHaveCount(2);
    await expect(remapRow.getByText('New face for A', { exact: true })).toBeVisible();
    await expect(remapRow.getByText('New face for B', { exact: true })).toBeVisible();
    await remapRow.locator('[data-role="silhouette:remap-run"][data-source-run-id="A"]').selectOption('E');
    await remapRow.locator('[data-role="silhouette:remap-run"][data-source-run-id="B"]').selectOption('F');

    const state = await page.evaluate(() => {
        const popup = window.__busSim.sm.current.view._silhouettePopup;
        const decisions = popup._decisionsByTarget();
        const resolution = popup._resolveRemapDecisions();
        return { decisions, resolution };
    });
    expect(state.decisions).toEqual({
        'balcony_continuity:floor_1:corner_wrap': {
            action: 'remap',
            runIdsBySource: { A: 'E', B: 'F' }
        }
    });
    expect(state.resolution.valid).toBe(true);
    expect(state.resolution.resolved[0].orientationMappings).toEqual([
        {
            sourceRunId: 'A',
            targetRunId: 'E',
            affected: true,
            sourceRunForward: true,
            targetRunForward: true,
            reverseLocalU: false
        },
        {
            sourceRunId: 'B',
            targetRunId: 'F',
            affected: true,
            sourceRunForward: true,
            targetRunForward: false,
            reverseLocalU: true
        }
    ]);
    expect(errors).toEqual([]);

    await page.evaluate(() => window.__busSim.sm.current.view._silhouettePopup.cancel());
});
