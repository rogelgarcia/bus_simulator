// Isolate distant canopy dark spots with identical cameras and controlled lighting probes.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_flicker', process.env.GRASS_FLICKER_PHASE || 'before');
test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 dark-spot isolation', async ({ page }) => {
    test.setTimeout(180000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?lod=LOD4&fields=9#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.addStyleTag({ content: '#hud, .hud, header, aside { visibility:hidden }' });
    const setup = await page.evaluate(async () => {
        const s = window.__grassLitterScene, THREE = await import('three');
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        s.setFieldCount(9); s.setLod('LOD4'); s.setMode('all'); s.setView(2);
        const probe = { value: 0 };
        window.__flickerProbe = probe;
        for (const material of Object.values(s.canopy.materials)) {
            registerMaterialShaderHook(material, { id: 'test.canopy.flicker', priority: 100, uniforms: { canopyProbe: probe }, apply: shader => {
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform int canopyProbe;')
                    .replace('void main() {', 'void main() {\nfloat canopyTestShadow = 1.0;')
                    .replace(/directLight.color \*= ([^\n]*(?:getShadow|grassCanopyShadow)\( directionalShadowMap[^\n]*);/, (_, expression) =>
                        'canopyTestShadow = canopyProbe >= 7 ? (' + expression.replace('grassCanopyShadow(', 'getShadow(') + ') : (' + expression + '); directLight.color *= canopyTestShadow;')
                    .replace('#include <lights_physical_fragment>', `
                        if (canopyProbe == 2) { normal = viewMatrix[1].xyz; grassFacingSourceNormal = normal; }
                        #include <lights_physical_fragment>`)
                    .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', `
                        if (canopyProbe == 3) totalSpecular = vec3(0.0);
                        vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
                        if (canopyProbe == 4) outgoingLight = diffuseColor.rgb;
                        if (canopyProbe == 5) outgoingLight = vec3(grassFloorLeafMask);`)
                    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif (canopyProbe == 6 || canopyProbe == 7) gl_FragColor = vec4(vec3(canopyTestShadow), 1.0);');
            } });
        }
        const az = 225*Math.PI/180, el = 12*Math.PI/180, distance = 40;
        s.camera.position.set(Math.sin(az)*Math.cos(el)*distance, Math.sin(el)*distance, Math.cos(az)*Math.cos(el)*distance);
        s.camera.lookAt(0, .1, 0); s.camera.fov = 45;
        s.camera.updateProjectionMatrix(); s.camera.updateMatrixWorld(); s.lighting.render(0);
        window.__shadowTypes = { active: s.renderer.shadowMap.type, pcf: THREE.PCFShadowMap, soft: THREE.PCFSoftShadowMap };
        return s.getSnapshot();
    });
    for (const [name, probe, shadows, lod] of [
        ['baseline', 0, true, 'LOD4'], ['no-shadow', 0, false, 'LOD4'], ['flat-normal', 2, true, 'LOD4'],
        ['no-specular', 3, true, 'LOD4'], ['albedo', 4, true, 'LOD4'], ['mask', 5, true, 'LOD4'],
        ['legacy', 8, true, 'LOD4'], ['lod2', 0, true, 'LOD2'], ['mixed', 0, true, 'LOD2+4']
    ]) {
        await page.evaluate(({ probe, shadows, lod }) => {
            const s = window.__grassLitterScene; s.setLod(lod); window.__flickerProbe.value = probe;
            s.scene.traverse(mesh => { if (mesh.userData.grassCanopy) mesh.receiveShadow = shadows; });
            s.lighting.render(0);
        }, { probe, shadows, lod });
        await page.screenshot({ path: path.join(output, name + '.png') });
    }
    const motion = await page.evaluate(async () => {
        const s=window.__grassLitterScene, T=await import('three'), width=1600,height=1200;
        const target=new T.WebGLRenderTarget(width,height,{samples:4,colorSpace:T.NoColorSpace});
        const pixels=new Uint8Array(width*height*4),point=new T.Vector3(),results=[];
        s.setLod('LOD4'); window.__flickerProbe.value=6;
        s.scene.traverse(mesh=>{if(mesh.userData.grassCanopy)mesh.receiveShadow=true;});
        const tile=s.getSnapshot().fields.tiles.find(t=>t.x===0&&t.z<0);
        const before=s.getSnapshot().shadows;
        for(const pose of [{azimuth:225,elevation:12,distance:40},{azimuth:45,elevation:20,distance:70},{azimuth:135,elevation:40,distance:110}])
        for(const treatment of ['legacy','cached']){
        const frames=[],elevation=pose.elevation*Math.PI/180,distance=pose.distance;
        window.__flickerProbe.value=treatment==='legacy'?7:6;
        for(let frame=0;frame<24;frame++){
            const az=(pose.azimuth+frame*.04)*Math.PI/180;
            s.camera.position.set(Math.sin(az)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,Math.cos(az)*Math.cos(elevation)*distance);
            s.camera.lookAt(0,.1,0);s.camera.updateMatrixWorld();
            s.renderer.setRenderTarget(target);s.renderer.render(s.scene,s.camera);s.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);s.renderer.setRenderTarget(null);
            const values=[];
            for(let z=-4;z<=4;z+=.125)for(let x=-4;x<=4;x+=.125){
                const y=.1+.005*Math.sin(x*1.7)*Math.sin(z*1.3);
                point.set(tile.x+x,y,tile.z+z).project(s.camera);
                const px=(point.x*.5+.5)*width-.5,py=(point.y*.5+.5)*height-.5;
                const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
                const at=(a,b)=>pixels[(b*width+a)*4]/255;
                values.push((1-fy)*((1-fx)*at(ix,iy)+fx*at(ix+1,iy))+fy*((1-fx)*at(ix,iy+1)+fx*at(ix+1,iy+1)));
            }
            frames.push(values);
        }
        const variability=frames[0].map((_,i)=>{
            const mean=frames.reduce((sum,f)=>sum+f[i],0)/frames.length;
            return Math.sqrt(frames.reduce((sum,f)=>sum+(f[i]-mean)**2,0)/frames.length);
        }).sort((a,b)=>a-b);
        results.push({pose,treatment,mean:frames.flat().reduce((a,b)=>a+b,0)/frames.flat().length,rms:variability.reduce((a,b)=>a+b,0)/variability.length,
            p95:variability[Math.floor(variability.length*.95)]});
        }
        target.dispose();
        const baked=s.canopy.readPixels('all','visibility');let bakedTotal=0;
        for(const value of baked)bakedTotal+=value;
        return {results,bakedMean:bakedTotal/baked.length/255,shadowGenerations:[before,s.getSnapshot().shadows]};
    });
    await writeFile(path.join(output, 'validation.json'), JSON.stringify({ setup, motion, types: await page.evaluate(() => window.__shadowTypes), errors }, null, 2));
    if (process.env.GRASS_FLICKER_VIDEO === '1') {
        for (const treatment of ['legacy', 'cached']) {
            await mkdir(path.join(output, treatment), { recursive: true });
            for (let frame = 0; frame < 60; frame++) {
                await page.evaluate(({ treatment, frame }) => {
                    const s = window.__grassLitterScene, az = (224 + frame / 30) * Math.PI / 180, elevation = 12 * Math.PI / 180;
                    s.setLod('LOD2+4'); window.__flickerProbe.value = treatment === 'legacy' ? 8 : 0;
                    s.camera.position.set(Math.sin(az) * Math.cos(elevation) * 40, Math.sin(elevation) * 40, Math.cos(az) * Math.cos(elevation) * 40);
                    s.camera.lookAt(0, .1, 0); s.camera.updateMatrixWorld(); s.lighting.render(0);
                }, { treatment, frame });
                await page.screenshot({ path: path.join(output, treatment, String(frame).padStart(3, '0') + '.png') });
            }
        }
    }
    expect(errors).toEqual([]);
    expect(motion.shadowGenerations[1]).toEqual(motion.shadowGenerations[0]);
    for(const row of motion.results.filter(row=>row.treatment==='cached')){
        const legacy=motion.results.find(candidate=>candidate.treatment==='legacy'&&candidate.pose.azimuth===row.pose.azimuth);
        expect(row.mean).toBeGreaterThan(.3);
        expect(row.mean, 'Stability must not come from removing the leaf shadows').toBeLessThan(.9);
        // The periodic tile has different leaf placements from the old full-field
        // height approximation. Preserve its measured shadow energy at distance.
        expect(Math.abs(row.mean-motion.bakedMean)).toBeLessThan(.06);
        expect(row.p95, JSON.stringify(row)).toBeLessThan(.04);
        expect(row.rms, JSON.stringify(row)).toBeLessThan(legacy.rms*.25);
    }
});
