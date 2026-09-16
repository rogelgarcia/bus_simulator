// Shader readiness must preserve renderer state, cancellation and the last visible frame.
import {test,expect} from '@playwright/test';

test('City shader submission restores the target before yielding and stops on cancellation',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {prepareLightingView}=await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        const THREE=await import('three');
        const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
        mesh.position.x=100000;scene.add(mesh);
        let target='previous',ready=false,polls=0;
        const program={isReady(){polls++;return ready;},getUniforms(){},getAttributes(){}};
        const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,
            compile(){if(target!=='scene-color')throw new Error('Wrong target');return new Set(['material']);},
            properties:{get:()=>({currentProgram:program,programs:new Map([['program',program],['retired',{isReady(){throw new Error('Polled retired shader variant');}}]])})},getContext:()=>({isContextLost:()=>false})};
        const controller=new AbortController();
        const task=prepareLightingView(renderer,scene,camera,'scene-color',controller.signal).then(()=>null,e=>e.name);
        const restored=target==='previous';
        await new Promise(resolve=>setTimeout(resolve,35));controller.abort();
        const cancelled=await task,stopped=polls;
        await new Promise(resolve=>setTimeout(resolve,35));
        const stoppedPolling=polls===stopped;ready=true;scene.remove(mesh);
        await prepareLightingView(renderer,scene,camera,'scene-color',new AbortController().signal);
        mesh.geometry.dispose();mesh.material.dispose();
        return {restored,cancelled,stoppedPolling,target};
    });
    expect(result).toEqual({restored:true,cancelled:'AbortError',stoppedPolling:true,target:'previous'});
});

test('Raster preparation preserves the displayed target and cleans up an aborted GPU fence',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const {prepareLightingViewRaster}=await import('/src/graphics/illumination/baked_lighting/LightingViewRasterPreparation.js');
        const renderer=new T.WebGLRenderer(),gl=renderer.getContext(),scene=new T.Scene(),camera=new T.Camera();
        const displayed=new T.WebGLRenderTarget(4,4);renderer.setRenderTarget(displayed);renderer.setClearColor(0x235678);renderer.clear();
        const before=new Uint8Array(64);renderer.readRenderTargetPixels(displayed,0,0,4,4,before);
        const original=new T.MeshBasicMaterial({color:0xff0000}),variant=new T.MeshBasicMaterial({color:0x00ff00});
        const mesh=new T.Mesh(new T.PlaneGeometry(2,2),original);scene.add(mesh);
        const staging=new T.WebGLRenderTarget(4,4);
        const readied=await prepareLightingViewRaster(renderer,scene,camera,staging,[{object:mesh,material:variant}],new AbortController().signal);
        const after=new Uint8Array(64);renderer.readRenderTargetPixels(displayed,0,0,4,4,after);
        const wait=gl.clientWaitSync.bind(gl),remove=gl.deleteSync.bind(gl);let deleted=0;
        gl.clientWaitSync=()=>gl.TIMEOUT_EXPIRED;gl.deleteSync=f=>{deleted++;remove(f);};
        const controller=new AbortController(),pending=prepareLightingViewRaster(renderer,scene,camera,staging,[{object:mesh,material:variant}],controller.signal);
        controller.abort();const cancelled=await pending.then(()=>null,e=>e.name);gl.clientWaitSync=wait;
        const result={untouched:before.every((v,i)=>v===after[i]),restored:renderer.getRenderTarget()===displayed&&mesh.material===original&&mesh.parent===scene,
            readied:readied.elapsedMs>=readied.cpuMs,cancelled,deleted,textures:renderer.info.memory.textures};
        displayed.dispose();staging.dispose();mesh.geometry.dispose();original.dispose();variant.dispose();renderer.dispose();return result;
    });
    expect(result).toEqual({untouched:true,restored:true,readied:true,cancelled:'AbortError',deleted:1,textures:2});
});

test('All object variants remain in readiness even when they share a material',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const {prepareLightingView}=await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        const scene=new T.Scene(),camera=new T.Camera(),material=new T.MeshBasicMaterial(),geometry=new T.BoxGeometry();
        scene.add(new T.Mesh(geometry,material),new T.InstancedMesh(geometry,material,1));
        const polls=[0,0],programs=polls.map((_,i)=>({isReady(){polls[i]++;return false;}}));
        let current,target=null;
        const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,getContext:()=>({isContextLost:()=>false}),
            compile(view){view.traverse(object=>{current=programs[object.isInstancedMesh?1:0];});return new Set([material]);},
            properties:{get:()=>({currentProgram:current})}};
        const controller=new AbortController(),pending=prepareLightingView(renderer,scene,camera,null,controller.signal);
        await new Promise(resolve=>setTimeout(resolve,30));controller.abort();await pending.catch(()=>{});
        geometry.dispose();material.dispose();return polls.map(v=>v>0);
    });
    expect(result).toEqual([true,true]);
});

test('Other scene texture formats retain normal initialization during view preparation',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const T=await import('three');
        const {prepareLightingView}=await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        const renderer=new T.WebGLRenderer(),scene=new T.Scene(),camera=new T.PerspectiveCamera(55,1,.1,10);camera.position.z=3;
        const texture=new T.DataTexture(new Float32Array(16).fill(.5),4,4,T.RedFormat,T.FloatType);texture.needsUpdate=true;
        const material=new T.MeshBasicMaterial({map:texture}),geometry=new T.PlaneGeometry(2,2),mesh=new T.Mesh(geometry,material);scene.add(mesh);
        const target=new T.WebGLRenderTarget(8,8),phases=[];
        await prepareLightingView(renderer,scene,camera,target,new AbortController().signal,p=>phases.push(p.phase));
        const result={ready:phases.at(-1)==='ready',cached:renderer.properties.get(texture).__version===texture.version,
            restored:renderer.getRenderTarget()===null&&mesh.material===material,error:renderer.getContext().getError()};
        target.dispose();texture.dispose();material.dispose();geometry.dispose();renderer.dispose();return result;
    });
    expect(result).toEqual({ready:true,cached:true,restored:true,error:0});
});

test('A superseded city compiler cannot release a newer view and equal baked modes do not rebuild',async({page})=>{
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {BakedLightingRuntime}=await import('/src/graphics/illumination/baked_lighting/BakedLightingRuntime.js');
        const {sanitizeBakedLightingSettings}=await import('/src/app/illumination/runtime/index.js');
        const tasks=[];
        const engine={prepareLightingView:signal=>new Promise((resolve,reject)=>{
            tasks.push(resolve);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})};
        const r=new BakedLightingRuntime(engine,{bus:{cancelStaging(){},getDiagnostics:()=>({})},shadows:{getDiagnostics:()=>({status:{}})},
            receivers:{settings:{},getDiagnostics:()=>({})}});
        r.settings=sanitizeBakedLightingSettings({mode:'auto',receivers:{indirect:true}});r.started=true;r.ready=true;r.effectiveMode='baked';
        engine.context={city:{}};r.receivers.status={};r.shadows.getSnapshot=()=>({effectiveMode:'baked'});
        r.requestViewPreparation();r.prepareView();r.requestViewPreparation();
        const preparingStatus=r.getStatus().indirect;
        tasks[0]();await new Promise(resolve=>setTimeout(resolve,0));
        const staleHeld=r.shouldHoldView();r.prepareView();tasks[1]();await new Promise(resolve=>setTimeout(resolve,0));
        const ready=!r.shouldHoldView();let rebuilds=0;r.refresh=()=>rebuilds++;
        await r.setSettings({...r.settings,mode:'baked'});
        window.removeEventListener('pagehide',r.onPageHide);
        return {staleHeld,ready,rebuilds,preparingStatus:preparingStatus.state,phase:preparingStatus.phase,finalStatus:r.getStatus().indirect.state};
    });
    expect(result).toEqual({staleHeld:true,ready:true,rebuilds:0,preparingStatus:'loading',phase:'preparing_shaders',finalStatus:'active'});
});
