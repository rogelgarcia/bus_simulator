// The single-leaf atlas must preserve its source orientation and front/back lighting.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/single_leaf_facing', process.env.GRASS_FACING_CAPTURE ?? 'after');
test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('Single-leaf cards retain the source bright and dark sides', async ({ page }) => {
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=leaf');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    for (const pose of ['front', 'back']) for (const mode of ['LOD0', 'refined', 'split']) {
        await page.evaluate(({ pose, mode }) => {
            const study = window.__plantCardsStudy;
            study.camera.position.set(0.12, pose === 'front' ? 0.23 : 0.04, pose === 'front' ? 0.35 : -0.4);
            study.controls.target.set(0, 0.095, -0.045); study.controls.update();
            study.setMode(mode);
        }, { pose, mode });
        await page.screenshot({ path: path.join(folder, pose + '-' + mode + '.png') });
    }
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const { updateMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const study = window.__plantCardsStudy, { renderer, plant, cards } = study;
        const missingAttributes = plant.bakeMeshes.filter(mesh => !mesh.geometry.attributes.grassFacingNormal).map(mesh => mesh.name);
        const geometry = plant.leaves[0].geometry, { position, normal, uv, grassFacingNormal } = geometry.attributes;
        const source = plant.getSnapshot(), stride = source.definition.acrossSegments + 1;
        let maximumNormalLengthError = 0, minimumCenterAlignment = 1, maximumWidthNormalDifference = 0;
        if (grassFacingNormal) for (let row = 0; row * stride < position.count; row++) {
            const start = row * stride, count = Math.min(stride, position.count - start), center = start + Math.floor(count / 2);
            const reference = new THREE.Vector3().fromBufferAttribute(grassFacingNormal, center);
            minimumCenterAlignment = Math.min(minimumCenterAlignment, reference.dot(new THREE.Vector3().fromBufferAttribute(normal, center)));
            for (let i = start; i < start + count; i++) {
                const n = new THREE.Vector3().fromBufferAttribute(grassFacingNormal, i);
                maximumNormalLengthError = Math.max(maximumNormalLengthError, Math.abs(n.length() - 1));
                maximumWidthNormalDifference = Math.max(maximumWidthNormalDifference, n.distanceTo(reference));
            }
        }
        const image = cards.atlas.roughness.image, frame = cards.layout.frame;
        let minimumBakedAlignment = 1, sampledRows = 0;
        for (let start = 0; start < position.count; start += stride) {
            const center = start + Math.floor(Math.min(stride, position.count - start) / 2), t = uv.getY(center);
            if (t < 0.35 || t > 0.95) continue;
            const x = Math.floor((position.getX(center) - frame.minX) / (frame.maxX - frame.minX) * image.width / 2);
            const y = Math.floor((frame.maxZ - position.getZ(center)) / (frame.maxZ - frame.minZ) * image.height);
            const i = (y * image.width + x) * 4, a = image.data[i] / 255 * 2 - 1, b = image.data[i + 2] / 255 * 2 - 1;
            const decoded = new THREE.Vector3(a, b, 1 - Math.abs(a) - Math.abs(b));
            const fold = Math.max(-decoded.z, 0);
            decoded.x += decoded.x >= 0 ? -fold : fold; decoded.y += decoded.y >= 0 ? -fold : fold;
            decoded.normalize();
            minimumBakedAlignment = Math.min(minimumBakedAlignment, decoded.dot(new THREE.Vector3().fromBufferAttribute(normal, center)));
            sampledRows++;
        }
        const leafMaterial = plant.leaves[0].material;
        const sourceMaterial = createGrassDebugV2Material({ vertexColors: true, normalMap: leafMaterial.normalMap,
            normalScale: leafMaterial.normalScale.clone(), roughnessMap: leafMaterial.roughnessMap, roughness: 1 });
        updateMaterialShaderHook(cards.material, 'lighting.calibrated_diffuse_ibl', { enabled: false });
        cards.material.envMap = null; cards.material.envMapIntensity = 0; cards.material.needsUpdate = true;
        cards.setAlphaCoverage(false); cards.setNormalFacing(true);
        const scene = new THREE.Scene(), mesh = new THREE.Mesh(geometry, sourceMaterial);
        const light = new THREE.DirectionalLight(0xffffff, Math.PI);
        const center = new THREE.Vector3(0, 0.117, -0.051);
        const front = new THREE.Vector3(0, 0.5, 0.8660254), tangent = new THREE.Vector3(0, front.z, -front.y);
        light.position.copy(center).add(front); light.target.position.copy(center); scene.add(light, light.target, mesh);
        const camera = new THREE.OrthographicCamera(-0.017, 0.017, 0.009, -0.009, 0.01, 2);
        const target = new THREE.WebGLRenderTarget(384, 256, { samples: 4 });
        const pixels = new Uint8Array(384 * 256 * 4);
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0); renderer.shadowMap.enabled = false;
        const render = () => {
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
            renderer.readRenderTargetPixels(target, 0, 0, 384, 256, pixels);
            let count = 0, green = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 255) { green += pixels[i + 1]; count++; }
            return { green: green / count, count };
        };
        const lighting = [];
        for (const degrees of [0, 180, 70, 110]) {
            const angle = THREE.MathUtils.degToRad(degrees);
            camera.position.copy(center).addScaledVector(front, Math.cos(angle) * 0.4).addScaledVector(tangent, Math.sin(angle) * 0.4);
            camera.lookAt(center);
            mesh.geometry = geometry; mesh.material = sourceMaterial;
            const source = render(), variants = {};
            mesh.material = cards.material;
            for (const mode of ['refined', 'detailed', 'curved', 'split']) {
                mesh.geometry = cards[mode].mesh.geometry;
                const samples = [];
                for (const enabled of [true, false, true]) { cards.setNormalFacing(enabled); samples.push(render()); }
                variants[mode] = samples;
            }
            lighting.push({ degrees, source, variants });
        }
        sourceMaterial.dispose(); target.dispose();
        return { missingAttributes, maximumNormalLengthError, minimumCenterAlignment, maximumWidthNormalDifference,
            minimumBakedAlignment, sampledRows, lighting };
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ ...result, errors }, null, 2));
    expect(result.missingAttributes).toEqual([]);
    expect(result.sampledRows).toBeGreaterThan(20);
    expect(result.maximumNormalLengthError).toBeLessThan(1e-6);
    expect(result.minimumCenterAlignment).toBeGreaterThan(0.999);
    expect(result.maximumWidthNormalDifference).toBeLessThan(1e-6);
    expect(result.minimumBakedAlignment).toBeGreaterThan(0.99);
    for (const pose of result.lighting) for (const samples of Object.values(pose.variants)) {
        expect(pose.source.count).toBeGreaterThan(1000);
        expect(samples[0].count).toBeGreaterThan(1000);
        expect(Math.abs(samples[0].green / pose.source.green - 1)).toBeLessThan(0.15);
        expect(samples[2].green).toBeCloseTo(samples[0].green, 4);
    }
    for (const mode of ['refined', 'detailed', 'curved', 'split']) {
        expect(result.lighting[1].variants[mode][0].green).toBeLessThan(result.lighting[0].variants[mode][0].green * 0.6);
    }
    expect(errors).toEqual([]);
});
