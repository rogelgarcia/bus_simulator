// Matched installed-city captures and method round trips for physical bus contact.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });
const phase = process.env.AO_CAPTURE_PHASE === 'before' ? 'before' : 'after';
const output = `tests/artifacts/screens/illumination_534/physical_city/${phase}`;

test('Physical contact city: asphalt and building matched views retain GI and restore methods', async ({ page }) => {
    test.setTimeout(600000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /shader|GL_INVALID|WebGLProgram/i.test(m.text())) errors.push(m.text()); });
    await page.setViewportSize({ width: 1600, height: 924 });
    await page.addInitScript(() => {
        localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({ shadows: { enabled: false }, receivers: { direct: false, indirect: false, enhanced: false } }));
        localStorage.setItem('bus_sim.ambientOcclusion.v1', JSON.stringify({ mode: 'off' }));
    });
    await page.goto('/?coreTests=0&visibilityMap=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'welcome', null, { timeout: 120000 });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'bus_select', null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__busSim.sm.currentName === 'game_mode', null, { timeout: 120000 });
    const baselinePath = 'tests/artifacts/screens/illumination_534/physical_city/before/context.json';
    const baseline = phase === 'after' && existsSync(baselinePath) ? JSON.parse(await readFile(baselinePath,'utf8')) : null;
    const context = await page.evaluate(async (baseline) => {
        const T = await import('three');
        const { engine: e, sm } = window.__busSim;
        await Promise.all([e.waitForLightingReady(), sm.current.busModel?.userData?.readyPromise, sm.current.city?.world?.trees?.readyPromise].filter(Boolean));
        e.stop(); sm.current.gameLoop.paused = true;
        const city = sm.current.city, bus = sm.current.busAnchor;
        sm.current.update = () => { city.update(e); city.updateStaticVisibility(e.camera); };
        e.setViewportSize(1600, 900); e.renderer.setPixelRatio(1); e.renderer.setSize(1600, 900, false);
        e.camera.aspect = 1600/900; e.camera.updateProjectionMatrix();
        for (const id of ['hud-game', 'ui-perf-bar']) document.getElementById(id).style.visibility = 'hidden';
        e.scene.updateMatrixWorld(true);
        const spawn = bus.position.clone(), oldRotation = bus.rotation.clone();
        bus.rotation.set(0,0,0); bus.updateMatrixWorld(true);
        const localBounds = new T.Box3().setFromObject(bus).translate(bus.position.clone().negate());
        const ray = new T.Raycaster();
        const buildings = city.buildings.group.children.filter(r => r.name !== 'BuildingSlabs').map(root => ({ root, box: new T.Box3().setFromObject(root) }));
        buildings.sort((a,b) => a.box.distanceToPoint(spawn)-b.box.distanceToPoint(spawn) || a.root.name.localeCompare(b.root.name));
        const building = buildings.find(b => b.box.max.z-b.box.min.z>16);
        if (!building) throw new Error('No long building facade found for contact capture');
        const bz=(building.box.min.z+building.box.max.z)/2;
        ray.set(new T.Vector3(building.box.min.x-5,2,bz),new T.Vector3(1,0,0));
        const hit=ray.intersectObject(building.root,true).find(h=>h.object.isMesh);
        if(!hit)throw new Error('Selected building has no facade at contact height');
        const bx=hit.point.x-localBounds.max.x-.2;
        const candidates=[];
        for(let dx=-32;dx<=32;dx+=4)for(let dz=-32;dz<=32;dz+=4){
            const x=spawn.x+dx,z=spawn.z+dz;
            ray.set(new T.Vector3(x,2,z),new T.Vector3(0,-1,0));
            const road=ray.intersectObject(city.roads.group,true).find(h=>h.object.name==='Asphalt');
            if(!road)continue;
            candidates.push({x,z,y:road.point.y,distance:dx*dx+dz*dz});
        }
        candidates.sort((a,b)=>a.distance-b.distance);
        const road=candidates[0];if(!road)throw new Error('No asphalt receiver found near spawn');
        const poses=baseline?.poses??{asphalt:{position:[road.x,road.y-localBounds.min.y,road.z],gap:null},building:{position:[bx,.17-localBounds.min.y,bz],gap:.2}};
        bus.rotation.copy(oldRotation);
        window.physicalCity={e,city,bus,poses,async renderPose(name,method='analytic'){
            const p=poses[name].position;bus.position.fromArray(p);bus.rotation.set(0,0,0);
            e.camera.position.set(p[0]-9,p[1]+5,p[2]+12);e.camera.lookAt(p[0]+.7,p[1]+.6,p[2]);e.camera.updateMatrixWorld(true);
            e.setAmbientOcclusionSettings({...e.ambientOcclusionSettings,mode:method==='off'?'off':'gtao',scope:'dynamic',indirectScope:'dynamic',dynamic:{...e.ambientOcclusionSettings.dynamic,busMethod:method,quality:'medium',radius:1.5,intensity:1}});
            for(let i=0;i<12;i++){e.updateFrame(0);await new Promise(requestAnimationFrame);}
            return {pose:p,camera:e.camera.position.toArray(),ao:e.getAmbientOcclusionDebugInfo(),baked:e.getBakedLightingDebugInfo().receiverLightmaps.effective};
        }};
        let done=false;
        const work=e.setBakedLightingSettings({shadows:{enabled:true,dynamicResolution:'high'},receivers:{enhanced:true,indirect:true,direct:true,linked:false}}).finally(()=>done=true);
        const start=performance.now();
        while(true){e.updateFrame(0);await new Promise(requestAnimationFrame);const d=e.getBakedLightingDebugInfo().receiverLightmaps;
            if(done&&d.state==='fallback')throw new Error(d.reason);
            if(done&&d.state==='active'&&d.activationBlend===1)break;
            if(performance.now()-start>300000)throw new Error('Bake activation timeout');
        }await work;
        return {poses,building:building.root.name,facade:hit.point.toArray(),spawn:spawn.toArray(),busBounds:{min:localBounds.min.toArray(),max:localBounds.max.toArray()}};
    },baseline);
    await writeFile(`${output}/context.json`,JSON.stringify(context,null,2));
    const records=[];
    for(const pose of ['asphalt','building'])for(const [step,method] of ['analytic','gtao','analytic','off','analytic'].entries()){
        records.push({pose,method,step,...await page.evaluate(({pose,method})=>window.physicalCity.renderPose(pose,method),{pose,method})});
        await page.locator('canvas').first().screenshot({path:`${output}/${pose}-${method}.png`});
    }
    await writeFile(`${output}/result.json`,JSON.stringify({context,records,errors},null,2));
    expect(errors).toEqual([]);
    expect(records.every(r=>r.baked.direct&&r.baked.indirect)).toBe(true);
});
