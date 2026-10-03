// Visual color review accompanies the material-mask regression, without averaging grass with ground.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_color_match',process.env.GRASS_CANOPY_CAPTURE||'final-visual');
test.use({viewport:{width:1600,height:1200},deviceScaleFactor:1,video:'off',trace:'off',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--force-color-profile=srgb']}});
test('LOD4 color review preserves height and raised corners',async({page})=>{
    test.setTimeout(180000);await mkdir(output,{recursive:true});const errors=[],captures=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-multiview-1&lod=LOD4#03_rear');
    await page.waitForFunction(()=>!!window.__grassLitterReadiness);await page.evaluate(()=>window.__grassLitterReadiness);
    const poses = [
        {id:'front-low',azimuth:45,elevation:15,distance:70},
        {id:'rear-low',azimuth:225,elevation:15,distance:70},
        {id:'side-low',azimuth:135,elevation:15,distance:70},
        {id:'rear-overview',azimuth:225,elevation:30,distance:70},
        {id:'front-high',azimuth:45,elevation:55,distance:70},
        {id:'diagonal-high',azimuth:292.5,elevation:70,distance:70},
        {id:'rear-distant',azimuth:225,elevation:30,distance:110},
        {id:'rear-close',azimuth:225,elevation:30,distance:35}
    ];
    for(const pose of poses){
        for(const lod of ['LOD2','LOD4','LOD2+4']){
            const snapshot=await page.evaluate(({lod,pose})=>{
                const s=window.__grassLitterScene;s.setFieldCount(9);s.setMode('all');s.setView(2);s.setLod(lod);
                const az=pose.azimuth*Math.PI/180,el=pose.elevation*Math.PI/180;
                s.camera.position.set(Math.sin(az)*Math.cos(el)*pose.distance,Math.sin(el)*pose.distance,Math.cos(az)*Math.cos(el)*pose.distance);
                s.camera.up.set(0,1,0);s.camera.lookAt(0,.1,0);s.camera.fov=45;
                s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld();s.lighting.render(0);return s.getSnapshot();
            },{lod,pose});
            const filename=pose.id+'_'+lod+'.png';await page.screenshot({path:path.join(output,filename)});
            captures.push({pose,lod,filename,snapshot});
        }
    }
    const geometry=await page.evaluate(()=>{
        const s=window.__grassLitterScene,g=s.canopy.group.children[0].geometry,p=g.attributes.position,idx=g.index;
        let flat=0;for(let i=0;i<idx.count;i+=3)if([0,1,2].every(k=>Math.abs(p.getY(idx.getX(i+k)))<1e-7))flat++;
        return {flat,triangles:idx.count/3,definition:s.canopy.getSnapshot().definition};
    });
    expect(errors).toEqual([]);expect(geometry.flat).toBe(0);
    expect(geometry.definition.height).toBe(.10);expect(geometry.definition.ramp).toBe(.05);
    await writeFile(path.join(output,'validation.json'),JSON.stringify({captures,geometry,errors},null,2));
});
