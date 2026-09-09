// Runtime invariants and bounded GPU timings, independent of the Cycles bake runner.
import * as THREE from 'three';
import {FiniteSunShadow} from '../../../../src/graphics/lighting/FiniteSunShadow.js';
import {registerMaterialShaderHook, getMaterialShaderHookRegistrySnapshot} from '../../../../src/graphics/shaders/core/MaterialShaderHookRegistry.js';

export async function runFiniteSunShadowFixture(engine) {
    const renderer = engine.renderer;
    engine.clearScene();
    const scene = engine.scene;
    scene.environment = null;
    scene.background = new THREE.Color(0, 0, 0);
    const light = new THREE.DirectionalLight(0xffffff, Math.PI);
    light.position.set(-2.5, 0, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {left:-3, right:3, top:3, bottom:-3, near:0.1, far:12});
    light.shadow.bias = -0.00001;
    scene.add(light, light.target);
    const material = new THREE.MeshLambertMaterial({color:new THREE.Color().setRGB(0.5, 0.5, 0.5)});
    const otherHook = registerMaterialShaderHook(material, {id:'fixture-companion', priority:10, variantKey:'v1', apply:()=>{}});
    const originalKey = material.customProgramCacheKey();
    const receiver = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material);
    receiver.receiveShadow = true;
    const blocker = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), new THREE.MeshLambertMaterial({color:0, side:THREE.DoubleSide}));
    blocker.position.set(-1.5, 0, 1);
    blocker.castShadow = true;
    scene.add(receiver, blocker);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    const target = new THREE.WebGLRenderTarget(384, 384, {type:THREE.FloatType});
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    const filter = new FiniteSunShadow({renderer, scene, light, angularDiameter:0.12});
    filter.attach(material);
    const render = () => {filter.update(); renderer.setRenderTarget(target); renderer.render(scene, camera);};
    const capture = () => {
        render();
        const pixels = new Float32Array(384 * 384 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 384, 384, pixels);
        return Array.from({length:384}, (_, i) => pixels[(192 * 384 + i) * 4]);
    };
    const width = profile => {
        const lit = 0.5 / Math.sqrt(1.25);
        return profile.filter((value, i) => i >= 192 && value > 0.1 * lit && value < 0.9 * lit).length * 2 / 384;
    };
    const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    const initial = capture();
    const map = light.shadow.map, depth = map.depthTexture;
    const programs = renderer.info.programs.length;
    const profiles = {far:initial};
    blocker.position.z = 0.3;
    profiles.near = capture();
    blocker.position.z = 1;
    filter.setAngularDiameter(0.06);
    profiles.halfAngle = capture();
    filter.setAngularDiameter(0);
    profiles.hard = capture();
    filter.setAngularDiameter(0.12);
    const anglePrograms = renderer.info.programs.length;
    Object.assign(light.shadow.camera, {left:-4.5, right:4.5, top:4.5, bottom:-4.5});
    light.shadow.camera.updateProjectionMatrix();
    profiles.largerFrustum = capture();
    light.shadow.camera.zoom = 1.5;
    light.shadow.camera.updateProjectionMatrix();
    profiles.zoom = capture();
    light.shadow.mapSize.set(1024, 1024);
    profiles.smallerMap = capture();
    light.shadow.mapSize.set(2048, 2048);
    profiles.restored = capture();

    const identity = {mapUnchanged:light.shadow.map === map, depthUnchanged:light.shadow.map.depthTexture === depth};
    let restoredKey = true, companionPreserved = true;
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
        filter.detach(material);
        render();
        restoredKey &&= material.customProgramCacheKey() === originalKey;
        companionPreserved &&= getMaterialShaderHookRegistrySnapshot(material).hooks.some(hook => hook.id === 'fixture-companion');
        filter.attach(material);
        filter.attach(material);
        render();
    }
    const toggle = {cycles:20, cpuSubmissionMs:performance.now() - started, restoredKey, companionPreserved,
        profileDifference:difference(initial, capture()), programGrowth:renderer.info.programs.length - anglePrograms,
        hookCount:getMaterialShaderHookRegistrySnapshot(material).hooks.length};
    const reject = action => {try {action(); return false;} catch {return true;}};
    const invalidAngle = reject(() => filter.setAngularDiameter(-1));
    const extra = light.clone();
    scene.add(extra);
    const extraLightRejected = reject(() => filter.update());
    scene.remove(extra);
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const comparisonSamplerRejected = reject(() => filter.update());
    renderer.shadowMap.type = THREE.BasicShadowMap;
    const duplicate = new FiniteSunShadow({renderer, scene, light});
    const duplicateOwnerRejected = reject(() => duplicate.attach(material));
    duplicate.dispose();
    const materialVariants = [];
    for (const kind of [THREE.MeshPhongMaterial, THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial]) {
        const variant = new kind();
        receiver.material = variant;
        filter.attach(variant);
        render();
        renderer.shadowMap.enabled = false;
        render();
        renderer.shadowMap.enabled = true;
        filter.detach(variant);
        variant.dispose();
        materialVariants.push(variant.type);
    }
    receiver.material = material;

    // Timestamp queries measure GPU work; polling yields to the browser instead
    // of busy-waiting or forcing synchronous pixel/depth readbacks in the loop.
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const benchmark = async mode => {
        if (!ext) return {status:'unavailable', reason:'GPU timer queries unavailable'};
        if (mode === 'pcf') {
            filter.detach(material);
            renderer.shadowMap.type = THREE.PCFShadowMap;
        } else {
            renderer.shadowMap.type = THREE.BasicShadowMap;
            filter.attach(material);
            filter.update();
        }
        const draw = () => {renderer.setRenderTarget(target); renderer.render(scene, camera);};
        for (let i = 0; i < 5; i++) draw();
        const times = [], submitTimes = [];
        for (let i = 0; i < 24; i++) {
            const query = gl.createQuery(), start = performance.now();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
            draw();
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            submitTimes.push(performance.now() - start);
            while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
                if (performance.now() - start > 3000) {gl.deleteQuery(query); throw new Error('GPU query did not finish');}
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(query);
        }
        times.sort((a,b) => a-b);
        submitTimes.sort((a,b) => a-b);
        return {status:times.length ? 'measured' : 'disjoint', frames:times.length,
            gpuMedianMs:times[Math.floor(times.length/2)], gpuP95Ms:times[Math.floor(times.length*0.95)],
            cpuSubmissionMedianMs:submitTimes[12], calls:renderer.info.render.calls, triangles:renderer.info.render.triangles};
    };
    target.setSize(1280, 720);
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const performanceResults = {width:1280, height:720, shadowMapSize:2048, shadowUpdates:'every frame',
        threeRevision:THREE.REVISION, gpu:rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        scope:'Isolated full-screen Lambertian plane and one blocker, including native shadow pass; not a city frame-time estimate',
        pcf:await benchmark('pcf'), finiteSun:await benchmark('finiteSun')};
    filter.dispose();
    const finalHooks = getMaterialShaderHookRegistrySnapshot(material).hooks.map(hook => hook.id);
    otherHook.remove();
    const result = {widths:Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, width(profile)])),
        frustumDifference:difference(initial, profiles.largerFrustum), zoomDifference:difference(initial, profiles.zoom),
        mapDifference:difference(initial, profiles.smallerMap), angleProgramGrowth:anglePrograms - programs, identity, toggle,
        invalidAngle, extraLightRejected, comparisonSamplerRejected, duplicateOwnerRejected, finalHooks, materialVariants,
        performance:performanceResults, profiles};
    renderer.setRenderTarget(null);
    target.dispose();
    light.shadow.dispose();
    receiver.geometry.dispose(); material.dispose();
    blocker.geometry.dispose(); blocker.material.dispose();
    scene.clear();
    return result;
}
