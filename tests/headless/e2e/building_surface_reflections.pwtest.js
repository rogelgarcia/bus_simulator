// Actual Options toggle, persistence, cancellation and bake continuity.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolvePoses } from '../../../tools/bake_lighting/experiments/lighting_configurations/Inputs.mjs';

test('Opaque building reflection toggle preserves baked illumination and authored materials', async ({ page }) => {
    test.setTimeout(300000);
    const input=JSON.parse(await readFile('tools/bake_lighting/experiments/lighting_configurations/config/poses.json','utf8'));
    const pose=resolvePoses(input)[0].pose,errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/?coreTests=0&gameplayPose='+encodeURIComponent(JSON.stringify(pose)));
    await page.waitForFunction(()=>{const d=window.__busSim?.engine?.getBakedLightingDebugInfo();return d?.status.effectiveMode==='baked'&&d.receiverLightmaps.activationBlend===1&&d.view?.ready!==false;},null,{timeout:240000});
    await page.evaluate(()=>{
        const {engine:e,sm}=window.__busSim,materials=new Set();
        sm.current.city.buildings.group.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
        window.__buildingMaterialSnapshot=()=>JSON.stringify([...materials].map(m=>[m.uuid,m.version,m.color?.toArray(),m.roughness,m.metalness,m.aoMapIntensity,m.normalScale?.toArray(),m.map?.uuid]));
        window.__buildingBefore=window.__buildingMaterialSnapshot();
        sm.pushOverlay('options');
    });
    await page.getByRole('button',{name:'Buildings',exact:true}).click();
    const toggle=page.locator('.options-row').filter({hasText:'Opaque building reflections'}).locator('input');
    await expect(toggle).toBeChecked();
    for(let i=0;i<8;i++){
        await toggle.evaluate((el,value)=>{el.checked=value;el.dispatchEvent(new Event('change',{bubbles:true}));},i%2!==0);
        const states=await page.evaluate(()=>new Promise(resolve=>{const states=[];let remaining=12;function frame(){const d=window.__busSim.engine.getBakedLightingDebugInfo();states.push([d.status.effectiveMode,d.receiverLightmaps.activationBlend]);if(--remaining)requestAnimationFrame(frame);else resolve(states);}requestAnimationFrame(frame);}));
        expect(states.every(s=>s[0]==='baked'&&s[1]===1)).toBe(true);
    }
    expect(await page.evaluate(()=>window.__buildingMaterialSnapshot()===window.__buildingBefore)).toBe(true);
    await toggle.evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.getByRole('button',{name:'Save',exact:true}).click();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bus_sim.buildingWindowVisuals.v1')).surfaces.reflections)).toBe(false);
    await page.evaluate(()=>window.__busSim.sm.pushOverlay('options'));
    await page.getByRole('button',{name:'Buildings',exact:true}).click();await expect(toggle).not.toBeChecked();
    await toggle.evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    const reflected=await page.evaluate(()=>{const m=[];window.__busSim.sm.current.city.buildings.group.traverse(o=>{for(const v of Array.isArray(o.material)?o.material:[o.material])if(v?.userData?.iblNoAutoEnvMapIntensity&&v.isMeshStandardMaterial&&!v.transparent)m.push(v.envMapIntensity);});return m.some(v=>v>0);});
    expect(reflected).toBe(false);
    await page.evaluate(()=>window.__busSim.sm.pushOverlay('options'));
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Use defaults',exact:true}).click();
    expect(await page.evaluate(()=>localStorage.getItem('bus_sim.buildingWindowVisuals.v1'))).toBe(null);
    await page.evaluate(()=>window.__busSim.sm.pushOverlay('options'));
    await page.getByRole('button',{name:'Buildings',exact:true}).click();await expect(toggle).toBeChecked();
    expect(errors).toEqual([]);
});
