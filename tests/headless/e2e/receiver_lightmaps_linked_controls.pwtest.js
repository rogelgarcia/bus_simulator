// Exercises linked illumination controls without loading a city or baking maps.
import test, { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });

test('Receiver illumination: linked switches update once, unlink independently, and preserve saved preferences', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/tests/headless/harness/index.html');
    await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' });
    await page.addStyleTag({ url: '/src/graphics/gui/shared/styles.css' });
    await page.addStyleTag({ url: '/src/graphics/gui/options/styles.css' });
    await page.evaluate(async () => {
        const { OptionsUI } = await import('/src/graphics/gui/options/OptionsUI.js');
        const { getResolvedBakedLightingSettings, saveBakedLightingSettings } = await import('/src/app/illumination/runtime/index.js');
        window.__linkedChanges = [];
        window.__mountLinkedOptions = () => {
            const ui = new OptionsUI({ initialTab: 'baked_lighting', initialBakedLighting: getResolvedBakedLightingSettings(),
                onLiveChange: (draft) => window.__linkedChanges.push(structuredClone(draft.bakedLighting.receivers)),
                onSave: (draft) => { saveBakedLightingSettings(draft.bakedLighting); ui.unmount(); },
                onCancel: () => ui.unmount() });
            ui.mount();
        };
        window.__mountLinkedOptions();
    });
    const link = page.getByRole('button', { name: 'Link direct and indirect illumination', exact: true });
    const indirect = page.getByRole('checkbox', { name: 'Enable baked indirect illumination', exact: true });
    const direct = page.getByRole('checkbox', { name: 'Enable baked direct illumination', exact: true });
    const clickSwitch = (name) => page.locator('.options-row', { hasText: `Enable baked ${name} illumination` }).locator('.options-toggle-switch').click();
    await expect(link).toHaveAttribute('aria-pressed', 'true');
    await clickSwitch('indirect');
    await expect(direct).toBeChecked();
    await expect(indirect).toBeChecked();
    expect(await page.evaluate(() => window.__linkedChanges)).toEqual([
        { direct: true, indirect: true, linked: true, enhanced: false, debug: 'final' }
    ]);
    await clickSwitch('direct');
    await expect(indirect).not.toBeChecked();
    await expect(direct).not.toBeChecked();
    await link.focus();
    await page.keyboard.press('Space');
    await expect(link).toHaveAttribute('aria-pressed', 'false');
    await clickSwitch('direct');
    await expect(direct).toBeChecked();
    await expect(indirect).not.toBeChecked();
    await link.click();
    await expect(direct).not.toBeChecked();
    await expect(link).toHaveAttribute('aria-pressed', 'true');
    await indirect.focus();
    await page.keyboard.press('Space');
    await expect(direct).toBeChecked();
    await link.click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.evaluate(() => window.__mountLinkedOptions());
    await expect(link).toHaveAttribute('aria-pressed', 'false');
    await link.click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => window.__mountLinkedOptions());
    await expect(link).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(link).toHaveAttribute('aria-pressed', 'true');
    await expect(direct).not.toBeChecked();
    await expect(indirect).not.toBeChecked();
    await clickSwitch('indirect');
    const section = page.locator('.options-section', { hasText: 'Blender illumination (preview)' });
    await section.scrollIntoViewIfNeeded();
    expect(await page.evaluate(async () => (await document.fonts.load('20px "Material Symbols Outlined"', 'link')).length)).toBeGreaterThan(0);
    const boxes = await Promise.all([link.boundingBox(), indirect.locator('..').boundingBox(), direct.locator('..').boundingBox()]);
    expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
    expect(boxes[0].y + boxes[0].height / 2).toBeGreaterThan(boxes[1].y);
    expect(boxes[0].y + boxes[0].height / 2).toBeLessThan(boxes[2].y + boxes[2].height);
    const artifacts = path.resolve('tests/artifacts/screens/illumination_533/linked-controls');
    await mkdir(artifacts, { recursive: true });
    await section.screenshot({ path: path.join(artifacts, 'linked.png') });
    const enhanced = page.getByRole('checkbox', { name: 'Enhanced baked illumination (AI 548)', exact: true });
    await expect(enhanced).not.toBeChecked();
    await enhanced.focus(); await page.keyboard.press('Space');
    await expect(enhanced).toBeChecked();
    await expect(direct).toBeChecked(); await expect(indirect).toBeChecked();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.evaluate(() => window.__mountLinkedOptions());
    await expect(enhanced).toBeChecked();
    await enhanced.focus(); await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => window.__mountLinkedOptions());
    await expect(enhanced).toBeChecked();
    const enhancedArtifacts = path.resolve('tests/artifacts/screens/illumination_548');
    await mkdir(enhancedArtifacts, { recursive: true });
    await section.screenshot({ path: path.join(enhancedArtifacts, 'options-enhanced.png') });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(enhanced).not.toBeChecked();
    expect(errors).toEqual([]);
});
