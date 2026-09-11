// Validate image provenance layout and in-page comparison navigation on a generated report.
import {test, expect} from '@playwright/test';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';

test('AI562 compares three final 55-degree versions without archived carousel slides', async ({page}) => {
    test.skip(!process.env.AI562_REPORT_URL, 'Set AI562_REPORT_URL to the generated local report');
    await page.setViewportSize({width:1920,height:1080});
    await page.goto(process.env.AI562_REPORT_URL);
    await expect(page.locator('main section')).toHaveCount(5);
    const data=await page.evaluate(()=>fetch('data.json').then(r=>r.json()));
    expect(data.poses.find(p=>p.id==='pose_02').cards[0].name).toContain('Historical selected target');
    expect(data.poses.find(p=>p.id==='pose_03').cards[0].name).toContain('Historical selected target');
    const count=data.poses.reduce((n,p)=>n+p.cards.length,0);
    await expect(page.locator('main section > .history > .cards > figure')).toHaveCount(count);
    await expect(page.locator('main section > .history[open]')).toHaveCount(0);
    await expect(page.locator('main section > .history button')).toHaveCount(0);
    await expect(page.locator('main section > .comparison > figure')).toHaveCount(15);
    for(const pose of data.poses) {
        const control=pose.cards.find(c=>c.metadata.comparisonRole==='uncalibrated_game_55');
        expect(control.metadata.sunDegrees).toBe(55);
        expect(control.metadata.mode).toBe('current');
        expect(control.metadata.viewport).toMatchObject({width:3840,height:2160});
    }
    const decoded=await page.locator('main section > .comparison img').evaluateAll(async images=>{
        for(const im of images){im.loading='eager';await im.decode();}
        return images.every(im=>im.naturalWidth===640&&im.naturalHeight>300);
    });
    expect(decoded).toBe(true);
    await page.locator('main section').nth(2).locator(':scope > .comparison figure button').first().click();
    await expect(page.locator('#viewer')).toBeVisible();
    expect(await page.locator('#large').evaluate(async image=>{await image.decode();return image.naturalWidth;})).toBe(3840);
    await expect(page.locator('#thumbs button')).toHaveCount(3);
    expect(await page.locator('#thumbs button').evaluateAll(nodes=>nodes.map(n=>n.title))).toEqual([
        'Uncalibrated game · 55°','Calibrated game · 55°','Calibrated Cycles · 55°']);
    await expect(page.locator('#caption')).toContainText('Uncalibrated game · 55°');
    const original=await page.locator('#large').getAttribute('src');
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#large').getAttribute('src')).not.toBe(original);
    await expect(page.locator('#caption')).toContainText('Calibrated game · 55°');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#caption')).toContainText('Calibrated Cycles · 55°');
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#large').getAttribute('src')).toBe(original);
    await page.locator('#previous').click();
    await expect(page.locator('#caption')).toContainText('Calibrated Cycles · 55°');
    await page.locator('#thumbs button[title="Calibrated game · 55°"]').click();
    await expect(page.locator('#caption')).toContainText('Calibrated game · 55°');
    const output=path.resolve('tests/artifacts/screens/ai562_acesfilmic_reference_matching/report_qa',String(Date.now()));
    await mkdir(output,{recursive:true});
    for (const poseIndex of [1,2]) {
        const comparison=page.locator('main section').nth(poseIndex).locator(':scope > .comparison');
        await expect(comparison.locator('figure')).toHaveCount(3);
    }
    await page.screenshot({path:path.join(output,'carousel.png')});
    await page.keyboard.press('Escape');
    await expect(page.locator('#viewer')).not.toBeVisible();
    for (const poseIndex of [1,2]) {
        const comparison=page.locator('main section').nth(poseIndex).locator(':scope > .comparison');
        await comparison.locator('img').evaluateAll(async images=>{for(const image of images)await image.decode();});
        await comparison.screenshot({path:path.join(output,`pose_0${poseIndex+1}_comparison.png`)});
    }
    const regions=page.locator('main section').nth(2).locator('.region-comparison');
    await regions.locator('summary').click();
    await regions.locator('select').selectOption('canopy_and_interiors');
    await expect(regions.locator('figure')).toHaveCount(3);
    expect(await regions.locator('img').evaluateAll(async images=>{for(const image of images)await image.decode();return images.every(image=>image.naturalWidth>0);})).toBe(true);
    await regions.screenshot({path:path.join(output,'canopy_comparison.png')});
    await page.locator('main section').nth(2).screenshot({path:path.join(output,'pose_03_history.png')});
});
