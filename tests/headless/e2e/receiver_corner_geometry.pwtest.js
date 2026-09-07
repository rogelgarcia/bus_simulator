// Checks the starting-block slab junction independently of lightmap availability.
import test,{expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {captureReceiverCorner} from '../../shared/receiverCornerCapture.js';

test.use({launchOptions:{
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),
    args:process.platform==='win32'?['--use-angle=d3d11']:[]
}});
test('Starting-block sidewalk corner has continuous walking geometry',async({page})=>{
    test.setTimeout(300000);
    const root=path.resolve(process.env.RECEIVER_CORNER_OUTPUT??'tests/artifacts/screens/illumination_refinement/corner-geometry-continuous');await mkdir(root,{recursive:true});
    await page.setViewportSize({width:1600,height:900});
    await page.addInitScript(()=>localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({shadows:{enabled:false},receivers:{enhanced:true,direct:false,indirect:false}})));
    await page.goto('/?coreTests=0');
    await page.waitForFunction(()=>window.__busSim?.sm?.currentName==='welcome',null,{timeout:120000});
    await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__busSim.sm.currentName==='bus_select',null,{timeout:120000});
    await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__busSim.sm.currentName==='game_mode',null,{timeout:120000});
    const samples=await page.evaluate(async()=>{
        const T=await import('three'),{engine:e,sm}=window.__busSim;
        await e.waitForLightingReady();e.stop();sm.current.gameLoop.paused=true;
        sm.current.update=()=>{e.context.city.update(e);e.context.city.updateStaticVisibility(e.camera);};
        for(const id of ['hud-game','ui-perf-bar'])document.getElementById(id).style.visibility='hidden';
        e.camera.position.set(65,14,40);e.camera.lookAt(55,.2,31);e.camera.updateMatrixWorld(true);e.updateFrame(0);
        const surfaces=[];e.scene.traverse(o=>{if(o.isMesh&&['BuildingSlab','Sidewalk'].includes(o.name))surfaces.push(o);});
        for(const mesh of surfaces.filter(o=>o.name==='Sidewalk')) {
            const p=mesh.geometry.attributes.position;
            for(let i=0;i<p.count;i+=3) {
                const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j));
                const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a));
                if(Math.abs(a.y-b.y)<1e-7&&Math.abs(a.y-c.y)<1e-7&&normal.y<=1e-10)throw new Error('Folded sidewalk top: '+JSON.stringify([a,b,c]));
            }
        }
        for (const mesh of surfaces.filter(o=>o.name==='BuildingSlab')) {
            const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
            for(let i=0;i<index.count;i+=3){
                const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index.getX(i+j)));
                const area=new T.Vector3().subVectors(vertices[1],vertices[0]).cross(new T.Vector3().subVectors(vertices[2],vertices[0])).length();
                if(area<1e-12)throw new Error('Degenerate slab triangle: '+JSON.stringify(vertices));
            }
        }
        return [[54.70,30.70],[54.69,30.65],[54.72,30.72],[54.74,30.74]].map(([x,z])=>{
            const hits=new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0)).intersectObjects(surfaces);
            return {x,z,hits:hits.map(h=>({name:h.object.name,y:h.point.y}))};
        });
    });
    await writeFile(path.join(root,'corner-coverage.json'),JSON.stringify(samples,null,2));
    for(const p of samples)expect(p.hits.some(h=>Math.abs(h.y-.191)<.002)).toBe(true);
    await page.screenshot({path:path.join(root,'corner-render.png')});
    await captureReceiverCorner(page,root,'fixed');
    if(process.env.RECEIVER_LOCATE_BUILDING){
        const views=await page.evaluate(async()=>{
            const T=await import('three'),{BIG_CITY_2_SPEC:spec}=await import('/src/app/city/specs/BigCity2Spec.js'),e=window.__busSim.engine;
            return spec.buildings.filter(b=>b.configId==='stone_lowrise_2').flatMap(b=>{
                const o=e.scene.getObjectByName(b.id);if(!o)return[];const box=new T.Box3().setFromObject(o);
                return ['north','west','east'].map(face=>({id:b.id,face,min:box.min.toArray(),max:box.max.toArray()}));
            });
        });
        await writeFile(path.join(root,'building-locations.json'),JSON.stringify(views,null,2));
        for(const view of views){
            if(process.env.RECEIVER_BUILDING_IDS&&!process.env.RECEIVER_BUILDING_IDS.split(',').includes(view.id))continue;
            if(process.env.RECEIVER_BUILDING_FACE&&process.env.RECEIVER_BUILDING_FACE!==view.face)continue;
            await page.evaluate(({face,min,max,close})=>{
                const e=window.__busSim.engine,x=(min[0]+max[0])/2,z=(min[2]+max[2])/2;
                e.camera.position.set(face==='west'?min[0]-22:face==='east'?max[0]+22:x,12,face==='north'?min[2]-22:z);
                e.camera.lookAt(x,8,z);e.camera.updateMatrixWorld(true);for(let i=0;i<4;i++)e.updateFrame(0);
                if(close){
                    if(face==='north'){e.camera.position.set(x+9,10,min[2]-8);e.camera.lookAt(x,9,min[2]);e.camera.fov=40;e.camera.updateProjectionMatrix();}
                    else {e.camera.position.set(max[0]+8,10,max[2]+2);e.camera.lookAt(max[0],9,z);}
                    e.camera.updateMatrixWorld(true);for(let i=0;i<4;i++)e.updateFrame(0);
                }
            },{...view,close:!!process.env.RECEIVER_BUILDING_CLOSE});
            await page.screenshot({path:path.join(root,view.id+'-'+view.face+(process.env.RECEIVER_BUILDING_CLOSE?'-close':'')+'.png')});
        }
    }
});
