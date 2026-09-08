// Uses a tiny authenticated field to test shader energy, directional coverage and cancellation.
import test, { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const config = await readFile('tools/baking/blender.local.json', 'utf8').then(JSON.parse).catch(() => ({}));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });

test('Bus appearance: gray rims retain diffuse color and black trim has a restrained specular response', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createBusMaterialVariant } = await import('/src/graphics/illumination/diffuse_probes/BusMaterialVariants.js');
        const rim = new THREE.MeshPhongMaterial({ color: 0x666666 }); rim.name = 'rimmetal';
        const trim = new THREE.MeshPhongMaterial({ color: 0 }); trim.name = 'glossy';
        const r = createBusMaterialVariant(rim, true), t = createBusMaterialVariant(trim, true);
        return { rimColor: r.color.equals(rim.color), metalness: r.metalness, roughness: r.roughness,
            trimBlack: t.color.getHex() === 0, specular: t.specularIntensity };
    });
    expect(result.rimColor).toBe(true); expect(result.metalness).toBeLessThan(.5);
    expect(result.roughness).toBeLessThan(.4); expect(result.trimBlack).toBe(true);
    expect(result.specular).toBeLessThan(.25);
});

test('AI550: diffuse replacement preserves direct sunlight, restores live fallback and cancels late loads', async ({ page }) => {
    const data = new Float32Array(8*70*4);
    for (let p = 0; p < 8; p++) for (let t = 0; t < 70; t++) {
        const i = (p*70+t)*4;
        data.set(t < 6 ? [.4,.4,.4,1] : [40,0,0,0], i);
    }
    const bytes = Buffer.from(data.buffer);
    const index = { schema: 'bus-sim-diffuse-probes-v1', representation: 'ambient-cube-irradiance-oct-depth-v1',
        regions: [{ origin: [-4,-4,-4], spacing: [8,8,8], size: [2,2,2], offset: 0 }], count: 8, width: 70,
        depthSize: 8, maxDistance: 40, bytes: bytes.length, sourceHash: 'a'.repeat(64),
        sha256: createHash('sha256').update(bytes).digest('hex'), sourceProfiles: [], cityId: 'fixture', url: 'fixture.f32' };
    await page.route('**/assets/baked_lighting/diffuse_probes/index.json', r => r.fulfill({ json: index }));
    await page.route('**/assets/baked_lighting/diffuse_probes/fixture.f32', r => r.fulfill({ body: bytes, contentType: 'application/octet-stream' }));
    await page.goto('/tests/headless/harness/index.html');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { BusDiffuseProbeRuntime } = await import('/src/graphics/illumination/diffuse_probes/BusDiffuseProbeRuntime.js');
        const { enhancedLightingKey } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverFreshness.js');
        const renderer = new THREE.WebGLRenderer(); renderer.setSize(64,64); renderer.toneMapping = THREE.NoToneMapping;
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50,1,.1,100); camera.position.z = 5;
        const hemi = new THREE.HemisphereLight(0xffffff,0xffffff,1);
        const sun = new THREE.DirectionalLight(0xffffff,2); sun.position.set(0,0,5); scene.add(hemi,sun);
        const original = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4,4), original); scene.add(mesh);
        const city = { cityId: 'fixture', hemi, sunRef: { direction: new THREE.Vector3(0,0,1), color: sun.color, intensity: 2 } };
        const engine = { renderer, scene, camera, context: { city }, lightingSettings: { ibl: { enabled: false } },
            getDynamicIlluminationObjects: () => [{ id: 'vehicle.fixture', root: mesh }] };
        const receivers = { city, settings: { indirect: false }, source: { hashes: { resolvedSource: 'a'.repeat(64) }, references: new Map() },
            validateLightingProfile() {}, makeWatch: () => () => true };
        receivers.key = enhancedLightingKey(engine, city);
        const runtime = new BusDiffuseProbeRuntime(engine, receivers);
        runtime.configure({ enabled: true, materials: true, probes: true }); await runtime.prepare();
        const target = new THREE.WebGLRenderTarget(64,64, { type: THREE.FloatType });
        const pixel = () => {
            renderer.setRenderTarget(target); renderer.render(scene,camera);
            const buffer = new Float32Array(4); renderer.readRenderTargetPixels(target,32,32,1,1,buffer); return buffer[0];
        };
        runtime.frameBegin(false); sun.intensity = 0; const ambient = pixel();
        runtime.frameBegin(true); const baked = pixel();
        sun.intensity = 2; const bakedSun = pixel();
        runtime.frameBegin(false); const ambientSun = pixel();
        runtime.frameBegin(true); mesh.position.x = 20; camera.position.x = 20; const outside = pixel();
        mesh.position.x = 0; camera.position.x = 0;
        runtime.texture.image.data.forEach((v,i,a) => { if (Math.floor(i/4)%70 >= 6 && i%4 === 0) a[i] = .01; });
        runtime.texture.needsUpdate = true; const blocked = pixel();
        runtime.suspend(); runtime.configure({ enabled: false, materials: true, probes: true });
        const restored = mesh.material === original;
        runtime.invalidate(); runtime.configure({ enabled: true, materials: true, probes: true });
        const pending = runtime.prepare().catch(() => null); runtime.suspend(); await pending; runtime.frameBegin(true);
        const lateActive = runtime.active;
        runtime.dispose(); target.dispose(); renderer.dispose(); mesh.geometry.dispose(); original.dispose();
        return { ambient,baked,bakedSun,ambientSun,outside,blocked,restored,lateActive };
    });
    expect(result.baked).toBeLessThan(result.ambient * .5);
    expect(Math.abs((result.bakedSun-result.baked) - (result.ambientSun-result.ambient))).toBeLessThan(.002);
    expect(Math.abs(result.outside-result.ambientSun)).toBeLessThan(.002);
    expect(Math.abs(result.blocked-result.ambientSun)).toBeLessThan(.002);
    expect(result.restored).toBe(true); expect(result.lateActive).toBe(false); expect(errors).toEqual([]);
});

test('AI550: local variants preserve shared originals, lamp controllers and late-loaded geometry', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { BusMaterialVariants } = await import('/src/graphics/illumination/diffuse_probes/BusMaterialVariants.js');
        const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
        const paint = new THREE.MeshPhongMaterial({color:0x217bdb,emissive:0x010101});paint.name='paint';
        const lamp = new THREE.MeshPhongMaterial({emissive:0xffffff});lamp.name='frontlights';lamp.userData.noTune=true;
        const unnamedLamp = new THREE.MeshStandardMaterial({emissive:0xffffff,emissiveIntensity:0});
        const geometry = new THREE.BoxGeometry(1,1,1), body = new THREE.Mesh(geometry,paint), light = new THREE.Mesh(geometry,lamp);
        const rigLight = new THREE.Mesh(geometry,unnamedLamp);
        const outside = new THREE.Mesh(geometry,paint); scene.add(outside); root.add(body,light,rigLight);
        let registered=[{id:'vehicle.fixture',root}];
        const engine = {scene,lightingSettings:{ibl:{enabled:false}},context:{},getDynamicIlluminationObjects:()=>registered};
        const variants = new BusMaterialVariants(engine), settings={enabled:true,materials:true,probes:true};
        variants.configure(settings); const isolated=body.material!==paint&&outside.material===paint;
        const paintPreserved=body.material.color.equals(paint.color)&&body.material.metalness===0;
        lamp.emissiveIntensity=2;unnamedLamp.emissiveIntensity=3;
        const lampPreserved=light.material===lamp&&light.material.emissiveIntensity===2
            &&rigLight.material===unnamedLamp&&rigLight.material.emissiveIntensity===3;
        const added=new THREE.Mesh(geometry,paint);root.add(added);variants.configure(settings);
        const late=added.material.isMeshPhysicalMaterial&&added.material!==paint;
        const count=variants.getDiagnostics().cachedVariants;
        variants.configure({...settings,enabled:false});const off=body.material===paint&&added.material===paint&&light.material===lamp;
        variants.configure(settings);const bounded=variants.getDiagnostics().cachedVariants===count;
        registered=[];variants.configure(settings);
        const removed=variants.getDiagnostics().cachedVariants===0&&body.material===paint;
        variants.dispose();const disposed=body.material===paint&&added.material===paint;
        paint.dispose();lamp.dispose();unnamedLamp.dispose();geometry.dispose();
        return {isolated,paintPreserved,lampPreserved,late,off,bounded,removed,disposed};
    });
    expect(Object.values(result).every(Boolean)).toBe(true);
});

test('AI550: unsupported legacy probe-only mode reports its reason without downloading a field', async ({ page }) => {
    const requests=[];page.on('request',request=>{if(request.url().includes('/assets/baked_lighting/diffuse_probes/'))requests.push(request.url());});
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const THREE=await import('three');
        const {BusDiffuseProbeRuntime}=await import('/src/graphics/illumination/diffuse_probes/BusDiffuseProbeRuntime.js');
        const material=new THREE.MeshPhongMaterial();material.name='paint';
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material),scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);root.add(mesh);
        const debugMaterial=new THREE.MeshStandardMaterial(),debugSphere=new THREE.Mesh(mesh.geometry,debugMaterial);
        debugSphere.name='ibl_probe_sphere';debugSphere.visible=false;root.add(debugSphere);
        const engine={scene,context:{city:{}},lightingSettings:{ibl:{enabled:false}},getDynamicIlluminationObjects:()=>[{id:'vehicle.legacy',root}]};
        const runtime=new BusDiffuseProbeRuntime(engine,{});
        runtime.configure({enabled:true,materials:false,probes:true});
        let reason;try{await runtime.prepare();}catch(error){reason=error.message;}
        runtime.frameBegin(true);const info=runtime.getDiagnostics();runtime.dispose();mesh.geometry.dispose();material.dispose();debugMaterial.dispose();
        return{reason,info,original:mesh.material===material};
    });
    expect(result.reason).toBe('bus_probes_unsupported_materials_enable_enhanced_materials');
    expect(result.info.state).toBe('disabled');expect(result.info.active).toBe(false);
    expect(result.info.residentGpuBytes).toBe(0);expect(result.original).toBe(true);expect(requests).toEqual([]);
});

test('AI550: player and developer controls save independent intent and Reset restores opt-in defaults', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async()=>{
        const {OptionsUI}=await import('/src/graphics/gui/options/OptionsUI.js');
        const settings=await import('/src/app/illumination/runtime/index.js');
        const changes=[];let saved;
        const ui=new OptionsUI({initialTab:'baked_lighting',onLiveChange:value=>changes.push(value),onSave:draft=>{
            settings.saveBakedLightingSettings(draft.bakedLighting);saved=settings.getResolvedBakedLightingSettings();
        }});ui.mount();
        const original=ui.getDraft().bakedLighting.bus;
        const click=label=>ui.root.querySelector(`[aria-label="${label}"]`).click();
        click('Enhanced bus lighting');click('Baked bus diffuse probes');ui.saveBtn.click();
        const draft=ui.getDraft().bakedLighting.bus;
        ui.resetBtn.click();const reset=ui.getDraft().bakedLighting.bus;
        ui.unmount();return{original,draft,saved:saved.bus,reset,changes:changes.length};
    });
    expect(result.original).toEqual({enabled:false,materials:true,probes:true,glassReflections:false,bodyReflections:false,rimShine:false});
    expect(result.draft).toEqual({enabled:true,materials:true,probes:false,glassReflections:false,bodyReflections:false,rimShine:false});
    expect(result.saved).toEqual(result.draft);expect(result.reset).toEqual(result.original);
    expect(result.changes).toBeGreaterThan(0);
});
