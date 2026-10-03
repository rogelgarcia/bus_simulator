// Verify one ground layer, preserved relief/UVs and reversible litter comparison.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/litter_merged');
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });
test('Merged litter preserves relief and replaces all hidden soil', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=litter-merged-1&lod=LOD2#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const geometry = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        const soil = s.scene.getObjectByName('Brown_earth') ?? s.scene.getObjectByName('Brown earth');
        if (!soil) throw Error('Soil mesh not found.');
        const ray = new THREE.Raycaster(), results = [], up = new THREE.Vector3(0, -1, 0);
        const area = mesh => {
            const p = mesh.geometry.attributes.position, ids = mesh.geometry.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
            let total = 0;
            for (let i = 0; i < ids.count; i += 3) {
                a.fromBufferAttribute(p, ids.getX(i)).applyMatrix4(mesh.matrixWorld);
                b.fromBufferAttribute(p, ids.getX(i+1)).applyMatrix4(mesh.matrixWorld);
                c.fromBufferAttribute(p, ids.getX(i+2)).applyMatrix4(mesh.matrixWorld);
                total += Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)) / 2;
            }
            return total;
        };
        for (let count = 1; count <= 9; count++) {
            s.setFieldCount(count); s.setMode('all'); s.setLitterTreatment('merged'); s.scene.updateMatrixWorld(true);
            const surfaces = [soil], patches = [], snapshot = s.getSnapshot();
            for (const tile of snapshot.fields.tiles.filter(t => t.active)) {
                const root = s.scene.getObjectByName('GrassFieldTile_' + (tile.index+1));
                patches.push(...root.children[1].children);
            }
            surfaces.push(...patches);
            let maxIntersections = 0, minIntersections = Infinity, minY = Infinity, maxY = -Infinity;
            for (const tile of snapshot.fields.tiles.filter(t => t.active)) {
                for (const [dx, dz] of [[0.123,0.321],[-6.1,0.321],[5.915,0.321],[6.199,0.123],[6.201,0.123],[-5.915,0.123],[0.123,5.915],[0.123,-5.915]]) {
                    ray.set(new THREE.Vector3(tile.x+dx,1,tile.z+dz),up);
                    const hits=ray.intersectObjects(surfaces,false);
                    maxIntersections=Math.max(maxIntersections,hits.length); minIntersections=Math.min(minIntersections,hits.length);
                }
            }
            for(const mesh of patches) {
                const p=mesh.geometry.attributes.position, v=new THREE.Vector3();
                for(let i=0;i<p.count;i++) {v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
            }
            results.push({ count, maxIntersections, minIntersections, minY, maxY,
                area:surfaces.reduce((sum,m)=>sum+area(m),0), surface:snapshot.litterSurface,
                opaque:patches.every(m=>m.material.alphaTest===0 && !m.material.alphaToCoverage && !m.material.transparent && !m.material.polygonOffset),
                tableVisible: s.scene.getObjectByName('Perforated_shade_screen')?.visible ?? s.scene.getObjectByName('Perforated shade screen')?.visible });
        }
        const layers=[];
        for(const mode of ['grass','soil','all']) {s.setMode(mode);layers.push({mode,...s.getSnapshot().litterSurface});}
        s.setFieldCount(1);s.setMode('all');s.setLitterTreatment('alpha');s.scene.updateMatrixWorld(true);
        const patches=s.scene.getObjectByName('GrassFieldTile_1').children[1].children;
        ray.set(new THREE.Vector3(.123,1,.321),up);
        const alphaHits=ray.intersectObjects([soil,...patches],false).length;
        return {results,layers,alphaHits};
    });
    for (const r of geometry.results) {
        expect(r.maxIntersections).toBe(1); expect(r.minIntersections).toBe(1);
        expect(r.area).toBeCloseTo(40000, 3);
        expect(r.minY).toBeCloseTo(0, 7); expect(r.maxY).toBeCloseTo(.005, 7);
        expect(r.opaque).toBe(true); expect(r.surface.soilCutouts).toBe(r.count);
        expect(r.tableVisible).toBe(true);
    }
    expect(geometry.layers.map(r=>r.soilCutouts)).toEqual([0,0,9]); expect(geometry.alphaHits).toBe(2);
    const comparisons = [];
    for (const [view, name] of [[0,'overview'],[2,'rear'],[5,'closeup'],[3,'low_edge']]) {
        await page.evaluate(view => { const s=window.__grassLitterScene;s.setView(view);s.setLitterTreatment('alpha'); },view);
        await page.evaluate(async()=>{for(let i=0;i<30;i++) await new Promise(requestAnimationFrame);});
        const baseline = await page.evaluate(()=>{
            const s=window.__grassLitterScene, c=document.createElement('canvas'); c.width=1920;c.height=1080;
            const ctx=c.getContext('2d',{willReadFrequently:true});s.lighting.render(0);ctx.drawImage(s.renderer.domElement,0,0);
            window.__litterBaseline=ctx.getImageData(0,0,1920,1080).data;
            return s.getSnapshot();
        });
        await page.screenshot({path:path.join(output,name+'_alpha.png')});
        await page.locator('#scene-litter').selectOption('merged');
        await page.evaluate(async()=>{for(let i=0;i<30;i++) await new Promise(requestAnimationFrame);});
        const comparison=await page.evaluate(()=>{
            const s=window.__grassLitterScene,c=document.createElement('canvas');c.width=1920;c.height=1080;
            const ctx=c.getContext('2d',{willReadFrequently:true});s.lighting.render(0);ctx.drawImage(s.renderer.domElement,0,0);
            const current=ctx.getImageData(0,0,1920,1080).data,before=window.__litterBaseline;
            let error=0,changed=0,meanBefore=0,meanAfter=0;
            for(let i=0;i<current.length;i+=4){let d=0;for(let k=0;k<3;k++){d+=Math.abs(current[i+k]-before[i+k]);meanBefore+=before[i+k];meanAfter+=current[i+k];}error+=d;if(d>12)changed++;}
            return {snapshot:s.getSnapshot(),meanAbsoluteError:error/(1920*1080*3),changedFraction:changed/(1920*1080),meanBefore:meanBefore/(1920*1080*3),meanAfter:meanAfter/(1920*1080*3)};
        });
        expect(comparison.snapshot.position).toEqual(baseline.position);
        expect(comparison.snapshot.quaternion).toEqual(baseline.quaternion);
        expect(comparison.meanAbsoluteError).toBeLessThan(6);
        comparisons.push({view,name,...comparison});
        await page.screenshot({path:path.join(output,name+'_merged.png')});
    }
    await writeFile(path.join(output,'validation.json'),JSON.stringify({geometry,comparisons,errors},null,2));
    expect(errors).toEqual([]);
});
