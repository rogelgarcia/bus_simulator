// Compare the analytic GPU integral with independent cosine-weighted ray visibility.
import test, { expect } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });

test('Bus volume contact agrees with hemisphere rays on ground, walls and tilted receivers', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { DynamicAoRuntime } = await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const { sanitizeAmbientOcclusionSettings } = await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const renderer = new T.WebGLRenderer(); renderer.setSize(128,128);
        const target = new T.WebGLRenderTarget(128,128,{ type:T.FloatType }); renderer.setRenderTarget(target);
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(35,1,.01,100);
        scene.add(new T.HemisphereLight(0xffffff,0xffffff,1));
        const bus = new T.Mesh(new T.BoxGeometry(2,2,8),new T.MeshStandardMaterial()); bus.position.y=1.3; scene.add(bus);
        const receiver = new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshStandardMaterial({roughness:1})); scene.add(receiver);
        const runtime = new DynamicAoRuntime(), settings = sanitizeAmbientOcclusionSettings({scope:'dynamic',dynamic:{radius:1.5}});
        const participants = [{root:bus,cast:true,receive:true,aoUnderbody:{min:[-1,-1,-4],max:[1,-1,4]}}];
        const solid = new T.Box3(new T.Vector3(-1,.3,-4),new T.Vector3(1,2.3,4));
        const ray = new T.Ray(), hit = new T.Vector3(), pixel = new Float32Array(4), cases=[];
        for (const [name,position,normal] of [
            ['floor center',[0,0,0],[0,1,0]], ['floor edge',[1.2,0,3.9],[0,1,0]],
            ['wall near',[1.2,1,0],[-1,0,0]], ['wall far',[2,1,0],[-1,0,0]],
            ['wall above roof',[1.2,2.5,0],[-1,0,0]], ['back-facing wall',[1.2,1,0],[1,0,0]],
            ['tilted corner',[1.2,.1,4.2],[-1,1,-1]], ['outside reach',[4,0,0],[0,1,0]]
        ]) {
            const p=new T.Vector3(...position), n=new T.Vector3(...normal).normalize();
            receiver.position.copy(p);receiver.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);
            camera.position.copy(p).addScaledVector(n,6);camera.lookAt(p);camera.updateMatrixWorld(true);
            const sample = (enabled) => {
                bus.visible=true;runtime.update({renderer,scene,camera,participants,settings,enabled});
                bus.visible=false;renderer.render(scene,camera);
                renderer.readRenderTargetPixels(target,64,64,1,1,pixel);runtime.restoreBindings();return pixel[0];
            };
            const baseline=sample(false), measured=sample(true)/baseline;
            // Match the pixel center on the plane, not its nominal center.
            const near=new T.Vector3(1/128,1/128,.5).unproject(camera);
            ray.set(camera.position,near.sub(camera.position).normalize());
            const surface=ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(n,p),new T.Vector3());
            const origin=surface.addScaledVector(n,.001);
            const tangent=new T.Vector3(Math.abs(n.y)<.9?0:1,Math.abs(n.y)<.9?1:0,0).cross(n).normalize();
            const bitangent=new T.Vector3().crossVectors(n,tangent), direction=new T.Vector3();
            let blocked=0;const samples=32768;
            for(let i=0;i<samples;i++) {
                const r=Math.sqrt((i+.5)/samples), angle=i*2.399963229728653;
                direction.copy(n).multiplyScalar(Math.sqrt(1-r*r)).addScaledVector(tangent,r*Math.cos(angle)).addScaledVector(bitangent,r*Math.sin(angle));
                ray.set(origin,direction);if(ray.intersectBox(solid,hit))blocked++;
            }
            const d=Math.min(1,solid.distanceToPoint(origin)/settings.dynamic.radius), fade=1-d*d*(3-2*d);
            const expected=1-Math.min(.9,blocked/samples*fade);
            cases.push({name,measured,expected});
        }
        const error=renderer.getContext().getError();runtime.dispose();target.dispose();renderer.dispose();return {cases,error};
    });
    expect(result.error).toBe(0);
    for(const probe of result.cases) expect(Math.abs(probe.measured-probe.expected),JSON.stringify(probe)).toBeLessThan(.012);
});
