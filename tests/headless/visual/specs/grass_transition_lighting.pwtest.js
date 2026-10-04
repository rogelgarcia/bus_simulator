// Render identical patches with each LOD; isolate leaves from litter before comparing light response.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lighting');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Game sun and material response agree across the transition bearings', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transition=0&revision=transition-lighting-audit#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    await expect(page.locator('#transition-panel-body')).toBeHidden();
    await expect(page.locator('#transition-panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Expand', exact: true }).press('Enter');
    await expect(page.locator('#transition-panel-body')).toBeVisible();
    const lighting = await page.evaluate(async () => {
        const s = window.__grassTransitionScene, THREE = await import('three');
        const { getResolvedLightingSettings } = await import('/src/graphics/lighting/LightingSettings.js');
        const { getResolvedAtmosphereSettings } = await import('/src/graphics/visuals/atmosphere/AtmosphereSettings.js');
        const { azimuthElevationDegToDir } = await import('/src/graphics/visuals/atmosphere/SunDirection.js');
        const expected = getResolvedLightingSettings(), sun = getResolvedAtmosphereSettings().sun;
        s.setAnimating(false); s.setHelpers(false); s.setPanelCollapsed(true);
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const materials = new Set(), canopy = new Set(), leaves = new Set();
        s.fields.group.traverse(mesh => { if (!mesh.isMesh) return;
            if (mesh.userData.grassCanopy) canopy.add(mesh.material);
            else if (mesh.material.userData.grassFieldDistance) leaves.add(mesh.material);
            materials.add(mesh.material);
        });
        const probe = { value: 0 };
        for (const material of materials) registerMaterialShaderHook(material, {
            id: 'grass.transition-lighting.audit', priority: 10000,
            variantKey: canopy.has(material) ? 'canopy' : leaves.has(material) ? 'leaf' : 'ground',
            uniforms: { transitionProbe: probe },
            apply: shader => {
                shader.fragmentShader = 'uniform float transitionProbe;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif (transitionProbe > 1.5) gl_FragColor = vec4(' + (canopy.has(material)||leaves.has(material) ? 'totalDiffuse' : 'vec3(0.0)') + ',1.0);\nelse if (transitionProbe > 0.5) gl_FragColor = vec4(vec3(' + (canopy.has(material) ? 'grassFloorLeafMask' : leaves.has(material) ? '1.0' : '0.0') + '),1.0);');
                if(canopy.has(material))shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
                    'if(transitionProbe>1.5){diffuseColor.rgb=max(diffuseColor.rgb-grassFloorSoilColor,vec3(0.0));grassFloorSoilColor=vec3(0.0);}\n#include <lights_physical_fragment>');
            }
        });
        window.__transitionLightAudit = { THREE, materials, canopy, leaves, probe,
            target: new THREE.WebGLRenderTarget(1600, 1000, { samples: 4, colorSpace: THREE.NoColorSpace }),
            leafTarget: new THREE.WebGLRenderTarget(1600, 1000, { samples: 4, type:THREE.HalfFloatType, colorSpace: THREE.NoColorSpace }) };
        return { actual: s.lighting.getSnapshot(), expected, direction: azimuthElevationDegToDir(sun.azimuthDeg, sun.elevationDeg).toArray() };
    });
    expect(lighting.actual.sunDirection).toEqual(lighting.direction);
    expect(lighting.actual.sunColorLinear).toEqual(lighting.expected.sunColorLinear);
    expect(lighting.actual.sunIntensity).toBe(lighting.expected.sunIntensity);
    expect(lighting.actual.hemisphereIntensity).toBe(lighting.expected.hemiIntensity);
    expect(lighting.actual.exposure).toBe(lighting.expected.exposure);
    expect(lighting.actual.environmentId).toBe(lighting.expected.ibl.iblId);
    await page.addStyleTag({ content: '#scene-performance { visibility:hidden; }' });
    const rows = [], candidates = ['old', 'updated'];
    for (const bearing of Array.from({length:32},(_,i)=>i*11.25)) for (const candidate of candidates) {
        for (const lod of [3, 4]) {
            const row = await page.evaluate(async ({ bearing, candidate, lod }) => {
                const s = window.__grassTransitionScene, a = window.__transitionLightAudit, { THREE } = a;
                const angle = bearing * Math.PI / 180, range = 18, center = new THREE.Vector3(-16.5, 0, -16.5);
                s.camera.position.set(center.x + range * Math.sin(angle), s.getSnapshot().cameraHeight, center.z + range * Math.cos(angle));
                s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
                s.camera.updateMatrixWorld(true);
                for (const material of [...a.leaves, ...a.canopy]) {
                    const u = material.userData.grassFieldDistance.value;
                    u.x = candidate === 'old' ? 8 : 5; u.y = candidate === 'old' ? 30 : 18;
                    u.z = .85;
                    if(a.leaves.has(material))u.w = .3;
                }
                for (const material of a.canopy) {
                    material.userData.grassFloorLeafColorScale.value.set(...(candidate==='old'?[1,1,1]:[1.04,1.03,1.02]));
                    const active = Object.hasOwn(material.defines, 'GRASS_TRANSITION_CANOPY_COVERAGE');
                    if (active === (candidate === 'updated')) continue;
                    if (candidate === 'updated') material.defines.GRASS_TRANSITION_CANOPY_COVERAGE = 1;
                    else delete material.defines.GRASS_TRANSITION_CANOPY_COVERAGE;
                    material.needsUpdate = true;
                }
                s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(lod), new Uint8Array(s.fields.cells.length));
                await s.renderer.compileAsync(s.scene, s.camera);
                for(let i=0;i<3;i++){s.lighting.render(0);await new Promise(requestAnimationFrame);}
                s.lighting.render(0);
                const gl = s.renderer.getContext(), color = new Uint8Array(1600 * 1000 * 4);
                gl.readPixels(0, 0, 1600, 1000, gl.RGBA, gl.UNSIGNED_BYTE, color);
                const old = { target: s.renderer.getRenderTarget(), tone: s.renderer.toneMapping };
                a.probe.value = 1; s.renderer.toneMapping = THREE.NoToneMapping; s.renderer.setRenderTarget(a.target);
                s.renderer.render(s.scene, s.camera); const mask = new Uint8Array(color.length);
                s.renderer.readRenderTargetPixels(a.target, 0, 0, 1600, 1000, mask);
                a.probe.value=2;s.renderer.setRenderTarget(a.leafTarget);s.renderer.render(s.scene,s.camera);
                const leafRadiance=new Uint16Array(color.length);s.renderer.readRenderTargetPixels(a.leafTarget,0,0,1600,1000,leafRadiance);
                a.probe.value = 0; s.renderer.toneMapping = old.tone; s.renderer.setRenderTarget(old.target);
                const sections = [];
                for (const distance of [14, 18, 24]) {
                    const patch = s.camera.position.clone().add(new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)).multiplyScalar(distance));
                    const ids = new Set();
                    for (let x = 0; x < 140; x++) for (let z = 0; z < 140; z++) {
                        const p = new THREE.Vector3(patch.x - 1.5 + 3*x/139, .08, patch.z - 1.5 + 3*z/139).project(s.camera);
                        const ix = Math.floor((p.x*.5+.5)*1600), iy = Math.floor((p.y*.5+.5)*1000);
                        if (p.z >= -1 && p.z <= 1 && ix > 0 && ix < 1599 && iy > 0 && iy < 999) ids.add(iy*1600+ix);
                    }
                    const rgb = [0,0,0], leaf = [0,0,0], ground = [0,0,0], leafLinear=[0,0,0]; let grassPixels=0, groundPixels=0, coverage=0, gradient=0;
                    const luma = i => .2126*color[i*4]+.7152*color[i*4+1]+.0722*color[i*4+2];
                    for (const i of ids) {
                        const m=mask[i*4]/255; coverage+=m;
                        gradient+=(Math.abs(luma(i)-luma(i+1))+Math.abs(luma(i)-luma(i+1600)))/2;
                        for(let k=0;k<3;k++)rgb[k]+=color[i*4+k];
                        for(let k=0;k<3;k++)leafLinear[k]+=THREE.DataUtils.fromHalfFloat(leafRadiance[i*4+k]);
                        if(m>.97){grassPixels++;for(let k=0;k<3;k++)leaf[k]+=color[i*4+k];}
                        if(m<.03){groundPixels++;for(let k=0;k<3;k++)ground[k]+=color[i*4+k];}
                    }
                    sections.push({distance,pixels:ids.size,rgb:rgb.map(n=>n/ids.size),leaf:leaf.map(n=>n/grassPixels),ground:ground.map(n=>n/groundPixels),leafLinear:leafLinear.map(n=>n/coverage),grassPixels,groundPixels,coverage:coverage/ids.size,gradient:gradient/ids.size});
                }
                s.lighting.render(0); return { bearing, candidate, lod, sections, glError: gl.getError() };
            }, { bearing, candidate, lod });
            rows.push(row);
            if ([45,135,225,315].includes(bearing)) await page.screenshot({ path: path.join(output,`${candidate}_${bearing}_lod${lod}.png`) });
        }
        if ([0,45,90,135,180,225,270,315].includes(bearing)) {
            await page.evaluate(async()=>{const s=window.__grassTransitionScene;s.updateSelection(true);
                await s.renderer.compileAsync(s.scene,s.camera);for(let i=0;i<3;i++){s.lighting.render(0);await new Promise(requestAnimationFrame);}});
            await page.screenshot({path:path.join(output,`${candidate}_${bearing}_transition.png`)});
        }
    }
    await writeFile(path.join(output, 'measurements.json'), JSON.stringify({ lighting, rows, errors }, null, 2));
    expect(errors).toEqual([]); expect(rows.every(row=>row.glError===0)).toBe(true);
    const pairs = candidate => rows.filter(row=>row.candidate===candidate&&row.lod===3).map(row=>[
        row.sections.find(s=>s.distance===18),rows.find(r=>r.candidate===candidate&&r.bearing===row.bearing&&r.lod===4).sections.find(s=>s.distance===18)]);
    const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
    const contrast = candidate => mean(pairs(candidate).map(([a,b])=>Math.abs(a.gradient-b.gradient)));
    expect(contrast('updated')).toBeLessThan(contrast('old')*.6);
    for(const [a,b] of pairs('updated')){
        expect(Math.abs(a.coverage-b.coverage)).toBeLessThan(.035);
        expect(Math.max(...a.rgb.map((v,i)=>Math.abs(v-b.rgb[i])))).toBeLessThan(5);
        expect(Math.max(...a.leafLinear.map((v,i)=>Math.abs(b.leafLinear[i]/v-1)))).toBeLessThan(.085);
    }
    const controls = await page.evaluate(()=>{
        const s=window.__grassTransitionScene; s.setDistanceScale(.5);
        const half=[...window.__transitionLightAudit.materials].filter(m=>m.userData.grassFieldDistance).map(m=>m.userData.grassFieldDistance.value.toArray().slice(0,2));
        s.setDistanceScale(1); return half;
    });
    expect(controls.length).toBeGreaterThan(0);for(const range of controls)expect(range).toEqual([2.5,9]);
});
