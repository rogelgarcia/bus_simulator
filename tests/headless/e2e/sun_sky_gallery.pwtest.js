// Verify saved-image selection, grid pagination and exact-exposure carousel comparisons.
import {test, expect} from '@playwright/test';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const directory = 'tools/bake_lighting/experiments/sun_sky_ratios';
async function fixture(page) {
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const data = {poses:['pose_02', 'pose_03'], tones:[{id:'aces', label:'ACESFilmic'}, {id:'agx', label:'AgX'}], variants:[], records:[], baselines:[], references:[]};
    for (const light of ['S01', 'S02', 'S04', 'S08', 'F04', 'U04']) data.variants.push({id:light, label:light, sunEnergy:7, environmentMultiplier:1, radianceScale:1});
    for (const pose of data.poses) for (const tone of data.tones) {
        data.baselines.push({pose, tone:tone.id, file:pixel + `#${pose}_${tone.id}_game`, exposure:1.02});
        for (const light of data.variants) for (const mode of ['matched', 'fixed']) for (const offset of mode === 'matched' ? [-.5, 0, .5] : [0]) {
            data.records.push({pose, tone:tone.id, light:light.id, mode, offset, exposureEV:offset - 1, file:pixel + `#${pose}_${tone.id}_${light.id}_${mode}_${offset}`});
        }
    }
    data.references.push({pose:'pose_03', kind:'reference', label:'Sunny blue sky target', file:pixel + '#target'});
    const html = (await readFile(directory + '/gallery.html', 'utf8')).replace('__DATA__', JSON.stringify(data)).replace('<link rel="stylesheet" href="gallery.css">', '').replace('<script src="gallery.js"></script>', '');
    await page.setContent(html);
    await page.addStyleTag({content:await readFile(directory + '/gallery.css', 'utf8')});
    await page.addScriptTag({content:await readFile(directory + '/gallery.js', 'utf8')});
}

test('Selection freezes exact image exposure across controls and poses', async ({page}) => {
    await fixture(page);
    await expect(page.locator('#compare-grid')).toBeDisabled();
    await page.locator('.tile:has(img[data-light="S02"][data-tone="aces"]) input').check();
    const original = await page.locator('.tile:has(img[data-light="S02"][data-tone="aces"]) img').getAttribute('src');
    await page.locator('#aces-ev').fill('0.5');
    await expect(page.locator('.tile:has(img[data-light="S02"][data-tone="aces"]) input')).not.toBeChecked();
    await expect(page.locator('#agx-value')).toHaveText('0.00 EV');
    await page.locator('.tile:has(img[data-light="S02"][data-tone="aces"]) input').check();
    await page.locator('#mode').selectOption('fixed');
    await page.locator('#pose').selectOption('pose_03');
    await page.locator('.tile:has(img[alt="Sunny blue sky target"]) input').check();
    await expect(page.locator('#selection-count')).toHaveText('3 selected');
    await page.locator('#compare-single').click();
    await expect(page.locator('#large')).toHaveAttribute('src', original);
    await expect(page.locator('#caption')).toContainText('adjustment 0.00 EV');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#caption')).toContainText('adjustment +0.50 EV');
    await page.locator('.thumbnail').last().click();
    await expect(page.locator('#caption')).toContainText('User supplied · uncalibrated');
    await page.locator('#configuration').selectOption('0');
    await expect(page.locator('#large')).toHaveAttribute('src', original);
    await page.locator('#viewer-select').click();
    await expect(page.locator('.thumbnail')).toHaveCount(2);
    await page.locator('#viewer-select').click();
    await page.locator('#viewer-select').click();
    await expect(page.locator('#lightbox')).not.toBeVisible();
    await expect(page.locator('#selection-count')).toHaveText('0 selected');
});

test('Grid shows four images, retains extra selections and supports two-up and keyboard browsing', async ({page}) => {
    await page.setViewportSize({width:1600, height:1000});
    await fixture(page);
    for (let i = 0; i < 6; i++) await page.locator('[data-select]').nth(i).check();
    await page.locator('#compare-grid').click();
    await expect(page.locator('.comparison-tile')).toHaveCount(4);
    const boxes = await page.locator('.comparison-tile').evaluateAll(nodes => nodes.map(node => {const {x,y,width,height} = node.getBoundingClientRect();return {x,y,width,height};}));
    expect(boxes[0].y).toBe(boxes[1].y);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
    await page.locator('#next').click();
    await expect(page.locator('.comparison-tile')).toHaveCount(2);
    await expect(page.locator('#caption')).toContainText('Images 5–6 of 6');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.comparison-tile')).toHaveCount(4);
    await page.locator('.comparison-tile button').nth(1).click();
    await expect(page.locator('#layout')).toHaveValue('single');
    await expect(page.locator('#caption')).toContainText('Game reference · AgX');
    await page.keyboard.press('Escape');
    await page.locator('#clear-selection').click();
    await expect(page.locator('[data-select]:checked')).toHaveCount(0);
    await page.locator('.tile img').first().click();
    await expect(page.locator('.thumbnail')).toHaveCount(14);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#caption')).toContainText('Game reference · AgX');
});

test('Real report shows the supplied target with S04 and native baseline', async ({page}) => {
    test.skip(!process.env.AI563_GALLERY, 'Set AI563_GALLERY to a generated index.html');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width:1920, height:1080});
    await page.goto(pathToFileURL(path.resolve(process.env.AI563_GALLERY)).href);
    await page.locator('#pose').selectOption('pose_03');
    await page.locator('.tile:has(img[alt="Sunny blue sky target"]) input').check();
    await page.locator('.tile:has(img[data-light="game"][data-tone="aces"]) input').check();
    for (const tone of ['aces', 'agx']) await page.locator(`.tile:has(img[data-light="S04"][data-tone="${tone}"]) input`).check();
    await page.locator('#compare-grid').click();
    await expect(page.locator('.comparison-tile')).toHaveCount(4);
    await page.locator('#comparison-grid img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const artifacts = path.resolve('tests/artifacts/screens/ai563_sun_sky_ratios/gallery_qa');
    await mkdir(artifacts, {recursive:true});
    await page.screenshot({path:path.join(artifacts, 'selected-grid.png')});
    await page.locator('#layout').selectOption('single');
    await page.locator('.thumbnail').nth(2).click();
    await page.locator('#large').evaluate(image => image.decode());
    await page.screenshot({path:path.join(artifacts, 'selected-carousel.png')});
    await page.setViewportSize({width:780, height:850});
    await page.screenshot({path:path.join(artifacts, 'narrow-carousel.png')});
    const stage = await page.locator('#comparison-stage').boundingBox();
    expect(stage.height).toBeGreaterThan(300);
    expect(await page.locator('#lightbox').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
});
