// Compare transition strategies at the same bus pose, lighting and coverage.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { measureGrassCardCoverage } from '../grass_view_cards_metrics.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/fade_styles');
test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Compare card coverage, ordinary alpha and staggered fades', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true }); const errors = [], rows = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=fade-styles&lod3=cards#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    for (const pose of ['front', 'rear', 'border']) {
        await page.evaluate(pose => window.__grassTransitionScene.setPose(pose), pose);
        for (const style of ['coverage', 'alpha', 'staggered', 'dissolve', 'lod3', 'lod4']) {
            const state = await page.evaluate(async style => {
                const s = window.__grassTransitionScene;
                s.updateSelection(true);
                if (style.startsWith('lod')) s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(Number(style.slice(-1))));
                else s.setFadeStyle(style);
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i=0;i<3;i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                const autoReset = s.renderer.info.autoReset;
                s.renderer.info.autoReset = false; s.renderer.info.reset(); s.lighting.render(0);
                const draw = {...s.renderer.info.render}; s.renderer.info.autoReset = autoReset;
                return {glError:s.getSnapshot().glError, draw, textureBytes:s.getSnapshot().fields.extraTextureBytes};
            }, style);
            const png = await page.screenshot({path:path.join(output, `${pose}_${style}.png`)});
            const coverage = await page.evaluate(measureGrassCardCoverage, {png:png.toString('base64'),ranges:[[4,8],[8,10],[10,12],[12,14],[14,16],[16,20],[24,28]]});
            rows.push({pose,style,state,coverage}); expect(state.glError).toBe(0);
        }
    }
    const order = [];
    for (const style of ['alpha','dissolve']) {
        await page.evaluate(async style => {
            const s=window.__grassTransitionScene; s.setPose('front'); s.setFadeStyle(style); s.updateSelection(true);
            await s.renderer.compileAsync(s.scene,s.camera); s.lighting.render(0);
        },style);
        const original = await page.screenshot();
        await page.evaluate(() => {
            const s=window.__grassTransitionScene; let rank=1000;
            s.fields.group.traverse(mesh=>{if(mesh.isInstancedMesh) mesh.renderOrder=rank--;}); s.lighting.render(0);
        });
        const reversed=await page.screenshot({path:path.join(output, `front_${style}_reversed.png`)});
        const difference=await page.evaluate(async ({a,b})=>{
            const images=await Promise.all([a,b].map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;}));
            const canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height;
            const context=canvas.getContext('2d',{willReadFrequently:true});
            const pixels=images.map(image=>{context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;});
            let changed=0,sum=0;
            for(let i=0;i<pixels[0].length;i+=4){const diff=Math.max(...[0,1,2].map(c=>Math.abs(pixels[0][i+c]-pixels[1][i+c])));changed+=Number(diff>3);sum+=diff;}
            return {changed,mean:sum/(canvas.width*canvas.height)};
        },{a:original.toString('base64'),b:reversed.toString('base64')});
        order.push({style,...difference});
        await page.evaluate(()=>{window.__grassTransitionScene.fields.group.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.renderOrder=0;});});
    }
    await writeFile(path.join(output, 'comparison.json'), JSON.stringify({rows,order,errors},null,2));
    expect(order.find(r=>r.style==='dissolve').changed).toBeLessThan(order.find(r=>r.style==='alpha').changed*.05);
    for (const pose of ['front','rear','border']) {
        const current=rows.find(r=>r.pose===pose&&r.style==='dissolve');
        expect(current.state.draw.calls).toBe(rows.find(r=>r.pose===pose&&r.style==='coverage').state.draw.calls);
        for (const band of current.coverage.filter(b=>b.near>=10&&b.far<=14)) {
            const endpoints=['lod3','lod4'].map(style=>rows.find(r=>r.pose===pose&&r.style===style).coverage.find(b=>b.near===band.near).leafRgb[1]);
            expect(band.leafRgb[1]).toBeGreaterThan(Math.min(...endpoints)-2);
            expect(band.leafRgb[1]).toBeLessThan(Math.max(...endpoints)+2);
        }
    }
    await page.evaluate(()=>window.__grassTransitionScene.setFadeStyle('dissolve'));
    await page.reload(); await page.waitForFunction(()=>!!window.__grassTransitionReadiness); await page.evaluate(()=>window.__grassTransitionReadiness);
    expect(await page.evaluate(()=>window.__grassTransitionScene.getSnapshot().fields.fadeStyle)).toBe('dissolve');
    expect(errors).toEqual([]);
});
