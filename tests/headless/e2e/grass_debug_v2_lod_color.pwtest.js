// Check interpolated body color across LOD changes and capture matched study/field views.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod2_color/after');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('LOD2 preserves the body green when its color gradient has only two rows', async ({ page }) => {
    await mkdir(output, { recursive: true });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod2-color-1');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const s = window.__plantCardsStudy, THREE = await import('three');
        const interpolate = (g, u, height) => {
            const {uv, color} = g.attributes, v = .18 + .82 * height;
            for (let f = 0; f < g.index.count; f += 3) {
                const [a,b,c] = [0,1,2].map(k => g.index.getX(f+k));
                const ax=uv.getX(a), ay=uv.getY(a), bx=uv.getX(b), by=uv.getY(b), cx=uv.getX(c), cy=uv.getY(c);
                const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
                if (Math.abs(det)<1e-10) continue;
                const wa=((by-cy)*(u-cx)+(cx-bx)*(v-cy))/det, wb=((cy-ay)*(u-cx)+(ax-cx)*(v-cy))/det, wc=1-wa-wb;
                if (Math.min(wa,wb,wc)<-1e-6) continue;
                return [0,1,2].map(k => color.array[a*3+k]*wa+color.array[b*3+k]*wb+color.array[c*3+k]*wc);
            }
            throw new Error('UV sample outside the blade');
        };
        const a=s.shootLods.LOD1.leaves[0].geometry, b=s.shootLods.LOD2.leaves[0].geometry, rows=[];
        for (const u of [.15,.35,.65,.85]) for(let h=.1;h<=.85001;h+=.05) {
            const high=interpolate(a,u,h), low=interpolate(b,u,h);
            rows.push({u,height:h,high,low,redGreenError:low[0]/low[1]/(high[0]/high[1])-1});
        }
        return { rows, averageRedGreenError: rows.reduce((sum,r)=>sum+r.redGreenError,0)/rows.length,
            average: ['high','low'].map(key => [0,1,2].map(k=>rows.reduce((sum,r)=>sum+r[key][k],0)/rows.length)),
            triangles: b.index.count/3 };
    });
    for (const lod of ['LOD1','LOD2']) {
        await page.getByRole('button',{name:lod,exact:true}).click();
        await page.evaluate(() => {
            const s=window.__plantCardsStudy; s.setWireframe(false);
            s.controls.target.set(0,.024,0);s.camera.position.set(.014,.03,.09);s.controls.update();s.lighting.render(0);
        });
        await page.screenshot({path:path.join(output,'leaf_'+lod+'.png')});
    }
    await writeFile(path.join(output,'body_color.json'),JSON.stringify(result,null,2));
    expect(result.triangles).toBe(2);
    expect(Math.abs(result.averageRedGreenError)).toBeLessThan(.025);
});

test('Capture matched lit and shaded fields for LOD1 and LOD2',async({page})=>{
    await mkdir(output,{recursive:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/debug_tools/grass_litter_scene.html?litter=alpha&revision=lod2-color-1#06_closeup');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    for(const view of [0,2,5,7])for(const lod of ['LOD1','LOD2']){
        const result=await page.evaluate(async({view,lod})=>{
            const s=window.__grassLitterScene;s.setView(view);s.setLod(lod);
            for(let i=0;i<3;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
            return s.getSnapshot();
        },{view,lod});
        expect(result.lods.LOD2.triangles).toBe(192000);
        await page.screenshot({path:path.join(output,'field_'+view+'_'+lod+'.png')});
    }
    expect(errors).toEqual([]);
});
