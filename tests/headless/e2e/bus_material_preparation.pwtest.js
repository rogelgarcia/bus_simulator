// Guards bus preparation against uncancellable polling and unnecessary shader submissions.
import test, { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const config = await readFile('tools/baking/blender.local.json','utf8').then(JSON.parse).catch(()=>({}));
test.use({launchOptions:{executablePath:config.browserExecutable},video:'off',trace:'off'});

test('Bus preparation cancels an unfinished compiler and skips unchanged meshes', async ({page}) => {
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {BusDiffuseProbeRuntime}=await import('/src/graphics/illumination/diffuse_probes/BusDiffuseProbeRuntime.js');
        const scene=new THREE.Scene(), root=new THREE.Group();scene.add(root);
        for(const name of ['glass','paint','glossy','tire']) {
            const material=new THREE.MeshPhongMaterial();material.name=name;
            root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
        }
        const submissions=[];let polls=0;
        const program={isReady(){polls++;return false;}}, properties={get:()=>({currentProgram:program,programs:new Map([['fixture',program]])})};
        const renderer={properties,extensions:{has:()=>true},getContext:()=>({isContextLost:()=>false}),
            compile(scene){const materials=new Set();scene.traverse(o=>{if(o.isMesh){submissions.push(o.material.name);materials.add(o.material);}});return materials;},
            compileAsync(scene){this.compile(scene);return new Promise(()=>{});}};
        const engine={scene,renderer,camera:new THREE.PerspectiveCamera(),getDynamicIlluminationObjects:()=>[{id:'vehicle.fixture',root}]};
        const bus=new BusDiffuseProbeRuntime(engine,{});
        const candidate=bus.variants.stage({enabled:false,glassReflections:true});
        const candidateNames=candidate.scene.children.filter(o=>o.isMesh).map(o=>o.material.name);
        const pending=bus.stage({enabled:false,glassReflections:true},false,{stageBusMaterials:c=>({commit:c.commit,dispose(){}})})
            .then(()=> 'resolved',e=>e.name);
        await new Promise(resolve=>setTimeout(resolve,80));bus.cancelStaging();
        const outcome=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still-pending'),100))]);
        const pollsAtCancel=polls;await new Promise(resolve=>setTimeout(resolve,40));bus.dispose();
        return {candidateNames,outcome,pollsAfterCancel:polls-pollsAtCancel,submissions};
    });
    expect(result.outcome).toBe('AbortError');
    expect(result.candidateNames).toEqual(['glass']);
    expect(result.pollsAfterCancel).toBe(0);
    expect(result.submissions).toEqual(['glass']);
});

test('Bus preparation yields between objects and terminates on timeout or context loss', async ({page}) => {
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {prepareBusMaterials}=await import('/src/graphics/illumination/diffuse_probes/BusMaterialPreparation.js');
        const {BusMaterialVariants}=await import('/src/graphics/illumination/diffuse_probes/BusMaterialVariants.js');
        const world=new THREE.Scene(), candidate=new THREE.Scene(), camera=new THREE.PerspectiveCamera();
        for(let i=0;i<3;i++)candidate.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhongMaterial()));
        let tick=0,ready=true,lost=false;const ticks=[],program={isReady:()=>ready};
        const timer=setInterval(()=>tick++,1);
        const renderer={getContext:()=>({isContextLost:()=>lost}),
            properties:{get:()=>({programs:new Map([['fixture',program]])})},
            compile(object){ticks.push(tick);return new Set([object.material]);}};
        await prepareBusMaterials(renderer,candidate,camera,world,{signal:new AbortController().signal});
        const successfulTicks=ticks.slice();ready=false;
        const timeout=await prepareBusMaterials(renderer,candidate,camera,world,{signal:new AbortController().signal,timeoutMs:90})
            .then(()=>null,e=>e.message);
        ready=true;lost=true;const count=ticks.length;
        const context=await prepareBusMaterials(renderer,candidate,camera,world,{signal:new AbortController().signal})
            .then(()=>null,e=>e.message);
        clearInterval(timer);
        const material=new THREE.MeshStandardMaterial();material.name='paint';
        const root=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(mesh);world.add(root);
        let cityScans=0;
        const variants=new BusMaterialVariants({scene:world,getDynamicIlluminationObjects:()=>[{id:'vehicle.fixture',root}],resyncIBL(){cityScans++;}});
        variants.configure({enabled:true,materials:true,probes:false});
        const before=mesh.material;
        const probeCandidate=variants.stage({enabled:true,materials:true,probes:true});
        const isolatedProbe=probeCandidate.assignments.get(mesh)!==before && mesh.material===before;
        variants.dispose();
        return {successfulTicks,timeout,context,submittedAfterLoss:ticks.length-count,cityScans,isolatedProbe};
    });
    expect(result.successfulTicks.length).toBe(3);
    expect(result.successfulTicks.every((n,i,a)=>i===0||n>a[i-1])).toBe(true);
    expect(result.timeout).toBe('bus_material_preparation_timeout');
    expect(result.context).toBe('bus_material_context_lost');expect(result.submittedAfterLoss).toBe(0);
    expect(result.cityScans).toBe(0);expect(result.isolatedProbe).toBe(true);
});

test('Bus preparation selects changed material slots and registers scene shadows before compilation', async ({page}) => {
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {BusMaterialVariants}=await import('/src/graphics/illumination/diffuse_probes/BusMaterialVariants.js');
        const {getActiveSceneShadowSystem,setActiveSceneShadowSystem}=await import('/src/graphics/lighting/SceneShadowMaterials.js');
        const world=new THREE.Scene(),root=new THREE.Group();world.add(root);
        const materials=['glass','paint','glossy'].map(name=>{const m=new THREE.MeshPhongMaterial();m.name=name;return m;});
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(),materials);root.add(mesh);
        const previous=getActiveSceneShadowSystem(),registered=[];
        setActiveSceneShadowSystem({registerMaterial:m=>registered.push(m.name)});
        const variants=new BusMaterialVariants({scene:world,getDynamicIlluminationObjects:()=>[{id:'vehicle.fixture',root}]});
        try {
            const staged=variants.stage({enabled:false,glassReflections:true});
            return {changed:staged.scene.children.flatMap(o=>Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name),
                registered,unchangedLive:mesh.material===materials};
        } finally {variants.dispose();setActiveSceneShadowSystem(previous);}
    });
    expect(result).toEqual({changed:['glass'],registered:['glass'],unchangedLive:true});
});

test('Bus preparation warms the AO and HDR target variant before its first visible draw', async ({page}) => {
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {prepareBusMaterials}=await import('/src/graphics/illumination/diffuse_probes/BusMaterialPreparation.js');
        const {DynamicAoRuntime}=await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const renderer=new THREE.WebGLRenderer();renderer.setSize(32,32);renderer.toneMapping=THREE.ACESFilmicToneMapping;
        const scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(55,1,.1,100);
        camera.position.z=5;scene.add(root,new THREE.HemisphereLight());
        const original=new THREE.MeshPhongMaterial(),next=original.clone();
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(),original);root.add(mesh);
        const ao=new DynamicAoRuntime(),settings={alpha:{handling:'exclude'}};
        const participants=[{root,receive:true,cast:true}];
        ao.prepareMaterials(new Map([[mesh,next]]),participants,settings);
        const transparent=original.clone();transparent.transparent=true;
        ao.prepareMaterials(new Map([[mesh,transparent]]),participants,settings);
        const excluded=original.clone();root.userData.excludeFromAmbientOcclusion=true;
        ao.prepareMaterials(new Map([[mesh,excluded]]),participants,settings);delete root.userData.excludeFromAmbientOcclusion;
        const candidate=new THREE.Scene(),copy=mesh.clone(false);copy.material=next;candidate.add(copy);
        const target=new THREE.WebGLRenderTarget(32,32,{type:THREE.HalfFloatType});target.texture.colorSpace=THREE.LinearSRGBColorSpace;
        await prepareBusMaterials(renderer,candidate,camera,scene,{signal:new AbortController().signal,renderTarget:target});
        const restored=renderer.getRenderTarget()===null,liveOriginal=mesh.material===original;
        const preparedPrograms=renderer.info.programs.length;
        mesh.material=next;renderer.setRenderTarget(target);renderer.render(scene,camera);
        const extraDrawPrograms=renderer.info.programs.length-preparedPrograms;
        const exclusionsHonored=!ao.materials.has(transparent)&&!ao.materials.has(excluded);
        target.dispose();ao.dispose();renderer.dispose();
        return {restored,liveOriginal,extraDrawPrograms,exclusionsHonored};
    });
    expect(result).toEqual({restored:true,liveOriginal:true,extraDrawPrograms:0,exclusionsHonored:true});
});
