// Compare independently filtered canopy maps while retaining all debug resources.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_map_resolutions');
const profiles = [
    { id: 'a4-n4-r4', albedo: 4096, normal: 4096, roughness: 4096 },
    { id: 'a4-n2-r4', albedo: 4096, normal: 2048, roughness: 4096 },
    { id: 'a4-n4-r2', albedo: 4096, normal: 4096, roughness: 2048 },
    { id: 'a4-n2-r2', albedo: 4096, normal: 2048, roughness: 2048 },
    { id: 'a4-n1-r1', albedo: 4096, normal: 1024, roughness: 1024 },
    { id: 'a2-n2-r2', albedo: 2048, normal: 2048, roughness: 2048 },
    { id: 'a2-n1-r1', albedo: 2048, normal: 1024, roughness: 1024 },
    { id: 'a1-n1-r1', albedo: 1024, normal: 1024, roughness: 1024 }
];
const poses = [
    { id: 'near-front', azimuth: 45, elevation: 35, distance: 2, fields: 1, target: [0, .1, 4] },
    { id: 'rear-oblique', azimuth: 225, elevation: 18, distance: 48, fields: 9 },
    { id: 'far-side', azimuth: 135, elevation: 30, distance: 95, fields: 9 }
];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 map resolution matrix preserves packed data and reports All-only allocations', async ({ browser }) => {
    test.skip(process.env.GRASS_LOD4_RESOLUTIONS !== '1', 'Opt in with GRASS_LOD4_RESOLUTIONS=1.');
    test.setTimeout(600000); await mkdir(output, { recursive: true });
    const selected = process.env.GRASS_LOD4_RESOLUTION_PROFILES?.split(',');
    for (const profile of profiles.filter(profile => !selected || selected.includes(profile.id))) {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        try {
            const query = new URLSearchParams({ lod: 'LOD4', canopyBorder: 'leaves', canopyalbedo: String(profile.albedo),
                canopynormal: String(profile.normal), canopyroughness: String(profile.roughness) });
            console.log('[CanopyResolutions] Loading ' + profile.id);
            await page.goto('/debug_tools/grass_litter_scene.html?' + query + '#03_rear', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.bringToFront();
            await page.waitForFunction(() => !!window.__grassLitterReadiness, null, { timeout: 30000 });
            await page.evaluate(() => Promise.race([window.__grassLitterReadiness, new Promise((_, reject) =>
                setTimeout(() => reject(Error('Canopy startup timeout: ' + document.querySelector('#scene-loading').textContent)), 60000))]));
            console.log('[CanopyResolutions] Ready ' + profile.id);
            await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility: hidden !important; }' });
            await page.mouse.move(0, 0);
            const metadata = await page.evaluate(async () => {
                const THREE = await import('three'), s = window.__grassLitterScene;
                const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
                const textures = new Map();
                function collect(texture) {
                    if (!texture?.isTexture || !/^(GrassFieldCanopy|GrassCanopyBorder)/.test(texture.name)) return;
                    const image = texture.image, channels = texture.format === THREE.RedFormat ? 1 : 4;
                    let width = image.width, height = image.height, texels = 0;
                    do {
                        texels += width * height;
                        if (!texture.generateMipmaps || width === 1 && height === 1) break;
                        width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
                    } while (true);
                    if (texture.type !== THREE.UnsignedByteType) throw Error('Unexpected texture component size.');
                    const production = /^GrassFieldCanopy-(all-|ShadowVisibility$)/.test(texture.name);
                    textures.set(texture.uuid, { name: texture.name, width: image.width, height: image.height,
                        channels, mipmaps: texture.generateMipmaps, bytes: texels * channels, production,
                        uploaded: !!s.renderer.properties.get(texture).__webglTexture });
                }
                for (const mode of ['all', 'grass']) {
                    s.setMode(mode); s.setCanopyBorder('cards'); s.lighting.render(0);
                    const materials = new Set(Object.values(s.canopy.materials));
                    s.canopy.group.traverse(mesh => { if (mesh.isMesh) materials.add(mesh.material); });
                    for (const material of materials) {
                        Object.values(material).forEach(collect);
                        Object.values(s.renderer.properties.get(material).uniforms || {}).forEach(uniform => collect(uniform?.value));
                    }
                }
                s.setMode('all'); s.setCanopyBorder('leaves'); s.setLitterTreatment('merged');
                const inventory = [...textures.values()], gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
                const uniform = { value: 0 };
                registerMaterialShaderHook(s.canopy.materials.all, { id: 'grass.resolution-probe', priority: 100,
                    uniforms: { grassResolutionProbe: uniform }, apply: shader => {
                        shader.uniforms.grassResolutionProbe = uniform;
                        shader.fragmentShader = 'uniform float grassResolutionProbe;\n' + shader.fragmentShader;
                        const anchor = 'diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor';
                        if (!shader.fragmentShader.includes(anchor)) throw Error('Missing canopy color probe anchor.');
                        shader.fragmentShader = shader.fragmentShader.replace(anchor,
                            'if(grassResolutionProbe==1.0){diffuseColor.rgb=max(diffuseColor.rgb-grassFloorSoilColor,vec3(0.0))/max(grassFloorLeafMask,0.001);grassFloorSoilColor=vec3(0.0);}' +
                            'if(grassResolutionProbe==2.0){diffuseColor.rgb=grassFloorSoilColor/max(1.0-grassFloorLeafMask,0.001);grassFloorSoilColor=diffuseColor.rgb;}\n' + anchor)
                            .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif(grassResolutionProbe==3.0)gl_FragColor=vec4(grassFloorLeafMask,1.0-grassFloorLeafMask,1.0,1.0);');
                    } });
                const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
                window.__resolutionCapture = {
                    async pose(pose) {
                        uniform.value = 0; s.setFieldCount(pose.fields); s.setLod('LOD4'); s.setView(2);
                        const az = pose.azimuth * Math.PI / 180, el = pose.elevation * Math.PI / 180;
                        const target = new THREE.Vector3().fromArray(pose.target || [0, .1, 0]);
                        s.camera.position.copy(target).add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(pose.distance));
                        s.camera.up.set(0, 1, 0); s.camera.lookAt(target); s.camera.fov = 45;
                        s.camera.updateProjectionMatrix(); s.camera.updateMatrixWorld();
                        for (let i = 0; i < 12; i++) await frame();
                        return s.getSnapshot();
                    },
                    probe() {
                        const width = s.renderer.domElement.width, height = s.renderer.domElement.height;
                        const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace });
                        const pixels = new Uint16Array(width * height * 4), masks = new Float32Array(width * height * 2), valid = new Uint8Array(width * height);
                        const black = new THREE.MeshBasicMaterial({ color: 0, toneMapped: false, side: THREE.DoubleSide }), originals = new Map();
                        s.scene.traverse(mesh => { if (mesh.isMesh && !mesh.userData.grassCanopy) { originals.set(mesh, mesh.material); mesh.material = black; } });
                        const previous = { target: s.renderer.getRenderTarget(), tone: s.renderer.toneMapping, auto: s.renderer.shadowMap.autoUpdate,
                            needsUpdate: s.renderer.shadowMap.needsUpdate, background: s.scene.background };
                        const result = {}, diagnostic = { maxBlue: 0, sumBlue: 0, nonzero: 0, uniform: null, glError: null };
                        try {
                            s.scene.background = new THREE.Color(0); s.renderer.toneMapping = THREE.NoToneMapping;
                            s.renderer.shadowMap.autoUpdate = false; s.renderer.shadowMap.needsUpdate = false;
                            for (const [part, value] of [['mask', 3], ['grass', 1], ['background', 2]]) {
                                uniform.value = value; s.renderer.setRenderTarget(target); s.renderer.clear(); s.renderer.render(s.scene, s.camera);
                                s.renderer.setRenderTarget(previous.target);
                                s.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                                const sections = new Map();
                                for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
                                    const p = y * width + x, i = p * 4;
                                    if (part === 'mask') {
                                        const blue = THREE.DataUtils.fromHalfFloat(pixels[i + 2]);
                                        diagnostic.maxBlue = Math.max(diagnostic.maxBlue, blue); diagnostic.sumBlue += blue;
                                        if (blue > 0) diagnostic.nonzero++;
                                        valid[p] = THREE.DataUtils.fromHalfFloat(pixels[i + 2]) > .99 ? 1 : 0;
                                        masks[p * 2] = THREE.DataUtils.fromHalfFloat(pixels[i]);
                                        masks[p * 2 + 1] = THREE.DataUtils.fromHalfFloat(pixels[i + 1]); continue;
                                    }
                                    if (!valid[p]) continue;
                                    const weight = masks[p * 2 + (part === 'grass' ? 0 : 1)];
                                    const key = Math.floor(y / 64) * Math.ceil(width / 64) + Math.floor(x / 64);
                                    if (!sections.has(key)) sections.set(key, { key, pixels: 0, weight: 0, rgb: [0, 0, 0], channelsAbove8: 0 });
                                    const section = sections.get(key); section.pixels++; section.weight += weight;
                                    for (let c = 0; c < 3; c++) {
                                        const color = THREE.DataUtils.fromHalfFloat(pixels[i + c]);
                                        if (!Number.isFinite(color)) throw Error('Nonfinite canopy lighting.');
                                        section.rgb[c] += color * weight; if (color > 8) section.channelsAbove8++;
                                    }
                                }
                                if (part === 'mask') { diagnostic.uniform = s.renderer.properties.get(s.canopy.materials.all).uniforms.grassResolutionProbe.value;
                                    diagnostic.glError = s.renderer.getContext().getError(); }
                                if (part !== 'mask') result[part] = [...sections.values()].filter(section => section.pixels >= 32 && section.weight >= 2)
                                    .map(section => ({ ...section, rgb: section.rgb.map(v => v / section.weight), coverage: section.weight / section.pixels }));
                            }
                        } finally {
                            uniform.value = 0; for (const [mesh, material] of originals) mesh.material = material;
                            s.scene.background = previous.background; s.renderer.setRenderTarget(previous.target); s.renderer.toneMapping = previous.tone;
                            s.renderer.shadowMap.autoUpdate = previous.auto; s.renderer.shadowMap.needsUpdate = previous.needsUpdate;
                            target.dispose(); black.dispose();
                        }
                        return { ...result, diagnostic };
                    }
                };
                const canopy = s.canopy.getSnapshot(), inactiveProfileBytes = canopy.bake.residentTextureBytes - canopy.bake.estimatedTextureBytes;
                return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), inventory, inactiveProfileBytes,
                    productionBytes: inventory.filter(t => t.production).reduce((sum, t) => sum + t.bytes, 0),
                    debugTotalBytes: inventory.reduce((sum, t) => sum + t.bytes, 0) + inactiveProfileBytes, canopy,
                    scope: 'All layer, both spatial variants, live LOD2 border, external visibility. Includes mipmaps; excludes common scene assets and driver overhead. Debug data retained and reported separately.' };
            });
            expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
            expect(metadata.inventory.filter(t => t.production)).toHaveLength(9);
            expect(metadata.inventory.every(t => t.uploaded)).toBe(true);
            for (const variant of metadata.canopy.bake.variants) {
                expect(variant.mapResolutions).toEqual({ albedo: profile.albedo, normal: profile.normal, roughness: profile.roughness, visibility: 4096 });
                expect(variant.shadowResolution).toBe(8192); expect(variant.shadowTargetReleased).toBe(true);
            }
            const captures = [];
            for (const pose of poses) {
                const snapshot = await page.evaluate(pose => window.__resolutionCapture.pose(pose), pose);
                const filename = profile.id + '_' + pose.id + '.png';
                await page.screenshot({ path: path.join(output, filename) });
                const probes = await page.evaluate(() => window.__resolutionCapture.probe());
                expect(probes.grass.length, JSON.stringify({ pose, diagnostic: probes.diagnostic })).toBeGreaterThan(20);
                expect(probes.background.length).toBeGreaterThan(20);
                captures.push({ pose, snapshot, filename, probes });
            }
            await writeFile(path.join(output, profile.id + '.json'), JSON.stringify({ profile, metadata, captures, errors }, null, 2));
            expect(errors).toEqual([]);
            console.log('[CanopyResolutions] ' + profile.id + ' All=' + (metadata.productionBytes / 1e6).toFixed(2) + ' MB, debug total=' + (metadata.debugTotalBytes / 1e6).toFixed(2) + ' MB; three poses.');
        } finally {
            await page.evaluate(() => {
                const scene = window.__grassLitterScene;
                if (scene) { scene.dispose(); scene.renderer.forceContextLoss(); }
            }).catch(() => {});
            await page.close();
        }
    }
});
