// Render a separate deterministic paired-leaf scene without changing the authoring page.
import test, { expect } from '@playwright/test';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const leafCount = Number(process.env.GRASS_CAPTURE_LEAVES ?? 1000);
const recipes = {
    1000: { widthMeters: 1, depthMeters: 0.8, columns: 25, folder: 'thousand_leaves' },
    10000: { widthMeters: 1, depthMeters: 0.8, columns: 100, folder: 'ten_thousand_leaves' },
    20000: { widthMeters: 6, depthMeters: 6, columns: 100, folder: 'twenty_thousand_leaves_6m' },
    96000: { widthMeters: 12, depthMeters: 12, columns: 240, folder: 'ninety_six_thousand_leaves_12m' }
};
const recipe = recipes[leafCount];
if (!recipe) throw new Error('GRASS_CAPTURE_LEAVES must be 1000, 10000, 20000 or 96000.');
const shootCount = leafCount / 2;
const label = leafCount.toLocaleString('en-US');

test.use({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1, video: 'off' });
test('Offline scene contains ' + label + ' leaves, 8–14 cm tall, with varied inclination and measured camera distances', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2', recipe.folder);
    await mkdir(folder, { recursive: true });
    const sourceFiles = ['debug_tools/grass_plant_study.html',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2PlantStudy.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2ShootAppearance.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2LitterSubstrate.js',
        'assets/public/pbr/dry_litter/pbr.material.config.js',
        ...['basecolor.png', 'normal_gl.png', 'arm.png', 'alpha.png', 'height.png'].map(name => 'assets/public/pbr/dry_litter/' + name),
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2DetailedBladeSurface.js',
        'src/graphics/shaders/materials/grass/grass_blade_lighting.frag.glsl'];
    const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
        [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
    const before = await hashes(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.addStyleTag({ content: '.plant-study-panel, #plant-loading { display: none !important; }' });
    const manifest = await page.evaluate(async ({ leafCount, shootCount, widthMeters, depthMeters, columns }) => {
        const THREE = await import('three');
        const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
        const { clipGrassDebugV2MeshAtSoil } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SoilClip.js');
        const { createGrassDebugV2RibbonShoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js');
        const { sampleGrassDebugV2ShootColor, GRASS_V2_SHOOT_APPEARANCE } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2ShootAppearance.js');
        const study = window.__plantCardsStudy;
        const source = createGrassDebugV2RibbonShoot({ material: study.plant.leaves[0].material });
        source.trimAtSoil(() => 0);
        source.group.updateMatrixWorld(true);
        const inclinationAngles = Array.from({ length: 25 }, (_, i) => 45 * i / 24);
        const origin = new THREE.Matrix4().makeTranslation(-0.035, 0, 0);
        const variants = inclinationAngles.map(degrees => {
            const pitch = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degrees)).multiply(origin);
            const parts = source.leaves.slice(1).map(original => {
                const transform = new THREE.Matrix4().multiplyMatrices(pitch, original.matrixWorld);
                const geometry = original.geometry.clone().applyMatrix4(transform);
                if (transform.determinant() < 0) {
                    const index = geometry.index.array;
                    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
                }
                geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
                const mesh = new THREE.Mesh(geometry, original.material);
                clipGrassDebugV2MeshAtSoil(mesh, () => 0);
                let height = -Infinity;
                const p = mesh.geometry.attributes.position;
                for (let i = 0; i < p.count; i++) height = Math.max(height, p.getY(i));
                mesh.geometry.computeBoundingBox();
                return { geometry: mesh.geometry, height };
            });
            const bounds = new THREE.Box3();
            parts.forEach(part => bounds.union(part.geometry.boundingBox));
            return { degrees, parts, bounds };
        });
        let state = 9272026;
        const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
        const leafParts = [], geometryChunks = [], placements = [], leafHeights = [], usedInclinations = [], leafTriangleCounts = [];
        const flushLeafParts = () => {
            if (!leafParts.length) return;
            geometryChunks.push(mergeGeometries(leafParts));
            leafParts.forEach(part => part.dispose());
            leafParts.length = 0;
        };
        const range = values => {
            let min = Infinity, max = -Infinity;
            for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
            return [min, max];
        };
        const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
        const yAxis = new THREE.Vector3(0, 1, 0), bladeColor = new THREE.Color();
        const rows = shootCount / columns;
        for (let i = 0; i < shootCount; i++) {
            const column = i % columns, row = Math.floor(i / columns);
            let x = (column - (columns - 1) / 2 + (random() - 0.5) * 0.72) * widthMeters / columns;
            let z = (row - (rows - 1) / 2 + (random() - 0.5) * 0.72) * depthMeters / rows;
            const azimuth = random() * Math.PI * 2;
            const variant = variants[i === 0 ? 0 : i === shootCount - 1 ? 24 : Math.floor(random() * 25)];
            const heights = variant.parts.slice(0, 2).map(part => part.height);
            const lowScale = 0.08 / Math.min(...heights), highScale = 0.14 / Math.max(...heights);
            const size = THREE.MathUtils.lerp(lowScale, highScale, i === 0 ? 0 : i === shootCount - 1 ? 1 : random());
            matrix.compose(new THREE.Vector3(), turn.setFromAxisAngle(yAxis, azimuth), scale.setScalar(size));
            if (leafCount >= 20000) {
                const bounds = variant.bounds.clone().applyMatrix4(matrix);
                x = THREE.MathUtils.clamp(x, -widthMeters / 2 - bounds.min.x, widthMeters / 2 - bounds.max.x);
                z = THREE.MathUtils.clamp(z, -depthMeters / 2 - bounds.min.z, depthMeters / 2 - bounds.max.z);
            }
            matrix.setPosition(x, 0, z);
            const brightness = 0.94 + random() * 0.12;
            for (let blade = 0; blade < 2; blade++) {
                const geometry = variant.parts[blade].geometry.clone().applyMatrix4(matrix);
                geometry.deleteAttribute('grassFacingNormal');
                geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
                const c = geometry.attributes.color, uv = geometry.attributes.uv;
                const variation = ((Math.imul(i * 2 + blade + 1, 1597334677) ^ 9272026) >>> 0) / 4294967296;
                const dryness = variation < 0.12 ? 0.65 + variation / 0.12 * 0.35 : (variation - 0.12) * 0.22;
                for (let j = 0; j < c.count; j++) {
                    sampleGrassDebugV2ShootColor(THREE.MathUtils.clamp((uv.getY(j) - 0.18) / 0.82, 0, 1), bladeColor, dryness);
                    c.setXYZ(j, bladeColor.r * brightness, bladeColor.g * brightness, bladeColor.b * brightness);
                }
                leafParts.push(geometry);
                if (leafParts.length === 2000) flushLeafParts();
                leafTriangleCounts.push(geometry.index.count / 3);
                leafHeights.push(heights[blade] * size);
                usedInclinations.push(variant.degrees);
            }
            placements.push({ id: i, x, z, azimuthDegrees: THREE.MathUtils.radToDeg(azimuth), scale: size,
                heightsMeters: heights.map(height => height * size), backwardInclinationDegrees: variant.degrees });
        }
        flushLeafParts();
        const field = new THREE.Group(); field.name = 'Offline_' + leafCount + '_Leaves';
        for (const [name, parts] of [[leafCount + '_Leaf_Blades', geometryChunks]]) {
            const geometry = mergeGeometries(parts);
            geometry.computeBoundingBox(); geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, study.plant.leaves[0].material);
            mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; field.add(mesh);
            parts.forEach(part => part.dispose());
        }
        variants.forEach(variant => variant.parts.forEach(part => part.geometry.dispose()));
        source.dispose();
        study.plant.group.visible = false; study.soil.group.visible = false; study.squareBounds.visible = false;
        const ground = study.scene.getObjectByName('GrassV2DirtTerrain');
        ground.visible = true;
        if (leafCount >= 10000) {
            ground.scale.setScalar(10);
            ground.material = ground.material.clone();
            for (const name of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (ground.material[name]) {
                ground.material[name] = ground.material[name].clone();
                ground.material[name].repeat.multiplyScalar(10);
            }
        }
        const { createGrassDebugV2LitterSubstrate } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2LitterSubstrate.js');
        const litter = leafCount === 96000 ? await createGrassDebugV2LitterSubstrate({ renderer: study.renderer, widthMeters, depthMeters }) : null;
        if (litter) { study.scene.add(litter.group); study.lighting.applyEnvironment(); }
        const shadeScreen = new THREE.Group(); shadeScreen.name = 'Perforated shade screen';
        if (leafCount === 96000) {
            study.lighting.hemi.intensity = 12;
            const screenMaterial = new THREE.MeshStandardMaterial({ color: '#74796b', roughness: 1 });
            const panelGeometry = new THREE.BoxGeometry(0.65, 0.04, 0.65);
            for (let row = 0; row < 8; row++) for (let column = 0; column < 6; column++) {
                if ((column === 2 && row === 2) || (column === 4 && row === 5) || (column === 1 && row === 6)) continue;
                const panel = new THREE.Mesh(panelGeometry, screenMaterial);
                panel.position.set(0.6 + (column - 2.5) * 0.65, 2.6, 1 + (row - 3.5) * 0.65);
                panel.castShadow = panel.receiveShadow = true;
                shadeScreen.add(panel);
            }
            const postGeometry = new THREE.BoxGeometry(0.06, 2.6, 0.06);
            for (const x of [-1.32, 2.52]) for (const z of [-1.57, 3.57]) {
                const post = new THREE.Mesh(postGeometry, screenMaterial);
                post.position.set(x, 1.3, z); post.castShadow = post.receiveShadow = true;
                shadeScreen.add(post);
            }
            study.scene.add(shadeScreen);
        }
        study.scene.add(field);
        const sun = study.lighting.sun;
        const widePatch = leafCount >= 20000;
        const patchScale = widePatch ? Math.max(widthMeters, depthMeters) / 6 : 1;
        sun.position.copy(study.lighting.sunRef.direction).multiplyScalar(widePatch ? 10 * patchScale : 3);
        sun.target.position.set(0, 0, 0);
        sun.shadow.mapSize.set(8192, 8192);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
        const shadowHalfExtent = widePatch ? 4.6 * patchScale : 1.15, shadowFar = widePatch ? 20 * patchScale : 6;
        Object.assign(sun.shadow.camera, { left: -shadowHalfExtent, right: shadowHalfExtent, bottom: -shadowHalfExtent, top: shadowHalfExtent, near: 0.05, far: shadowFar });
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.bias = leafCount === 96000 || leafCount === 10000 ? -0.0002 : -0.00008; sun.shadow.normalBias = 0;
        study.renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
        study.camera.fov = 35; study.camera.near = 0.002; study.camera.far = 100; study.camera.updateProjectionMatrix();
        study.controls.maxDistance = 30;
        const views = [
            { id: '01_overview', label: 'Three-quarter overview', azimuth: 35, elevation: 32, distance: 1.8, target: [0, 0.055, 0] },
            { id: '02_overhead', label: 'Overhead', azimuth: 0, elevation: 90, distance: 2.15, target: [0, 0.04, 0] },
            { id: '03_rear', label: 'Opposite three-quarter view', azimuth: 215, elevation: 24, distance: 1.65, target: [0, 0.06, 0] },
            { id: '04_low_front', label: 'Low front view', azimuth: 0, elevation: 7, distance: 0.85, target: [0, 0.065, 0.20] },
            { id: '05_side', label: 'Low side view', azimuth: 90, elevation: 12, distance: 1.0, target: [0.12, 0.06, 0] },
            { id: '06_closeup', label: 'Close-up at the patch edge', azimuth: 135, elevation: 25, distance: 0.30, target: [0.40, 0.065, -0.30] }
        ];
        if (widePatch) {
            Object.assign(views[0], { distance: 12 * patchScale });
            Object.assign(views[1], { distance: 12 * patchScale });
            Object.assign(views[2], { distance: 11 * patchScale });
            Object.assign(views[3], { distance: 1.1, target: [0, 0.065, depthMeters / 2 - 0.15] });
            Object.assign(views[4], { distance: 1.2, target: [widthMeters / 2 - 0.15, 0.06, 0] });
            Object.assign(views[5], { distance: 0.35, target: [widthMeters / 2 - 0.28, 0.065, -depthMeters / 2 + 0.28] });
        }
        if (leafCount >= 10000) views.push({ id: '07_six_metres', label: 'View from 6 metres',
            azimuth: widePatch ? 0 : 35, elevation: widePatch ? 40 : 20, distance: 6, target: [0, 0.055, 0],
            fieldOfViewDegrees: widePatch ? 65 : 35 });
        if (leafCount === 96000) {
            Object.assign(views[6], { label: 'Sun and shade from 6 metres', elevation: 16, fieldOfViewDegrees: 45, target: [-0.4, 0.055, -0.4] });
            views.push({ id: '08_sun_and_shade', label: 'Shade boundary and sunlit gaps', azimuth: 0, elevation: 18,
                distance: 3.2, fieldOfViewDegrees: 45, target: [-0.7, 0.06, 1.8] });
        }
        const renderView = index => {
            const view = views[index], az = THREE.MathUtils.degToRad(view.azimuth), el = THREE.MathUtils.degToRad(view.elevation);
            study.camera.fov = view.fieldOfViewDegrees ?? 35;
            study.camera.near = Math.max(0.002, Math.min(0.1, view.distance * 0.01));
            study.camera.updateProjectionMatrix();
            study.controls.target.fromArray(view.target);
            study.camera.position.copy(study.controls.target).add(new THREE.Vector3(
                Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(view.distance));
            study.camera.up.set(0, view.elevation === 90 ? 0 : 1, view.elevation === 90 ? -1 : 0);
            study.camera.lookAt(study.controls.target); study.controls.update(); study.lighting.render(0);
            return study.camera.position.distanceTo(study.controls.target);
        };
        window.__offlineLeafScene = { field, ground, litter, shadeScreen, views, renderView };
        renderView(0);
        const box = new THREE.Box3().setFromObject(field);
        return { leaves: leafHeights.length, shoots: shootCount, seed: 9272026, widthMeters, depthMeters, densityLeavesPerSquareMeter: leafCount / (widthMeters * depthMeters),
            heightRangeMeters: range(leafHeights),
            trianglesPerLeaf: { min: range(leafTriangleCounts)[0], max: range(leafTriangleCounts)[1] },
            appearance: { ...GRASS_V2_SHOOT_APPEARANCE, dryBladeFraction: 0.12 },
            substrate: litter?.getSnapshot() ?? null,
            inclinationRangeDegrees: range(usedInclinations),
            triangles: field.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
            bounds: { min: box.min.toArray(), max: box.max.toArray() },
            resolution: [3840, 2160], views, placements, lighting: { ...study.lighting.getSnapshot(), hemisphereIntensity: study.lighting.hemi.intensity },
            shadeScreen: leafCount === 96000 ? { widthMeters: 3.9, depthMeters: 5.2, heightMeters: 2.6, openings: 3, parts: shadeScreen.children.length } : null,
            shadow: { mapSize: 8192, halfExtent: shadowHalfExtent, far: shadowFar, bias: sun.shadow.bias, normalBias: 0 } };
    }, { leafCount, shootCount, ...recipe });
    expect(manifest.leaves).toBe(leafCount);
    expect(manifest.shoots).toBe(shootCount);
    expect(manifest.views).toHaveLength(leafCount === 96000 ? 8 : leafCount >= 10000 ? 7 : 6);
    expect([manifest.widthMeters, manifest.depthMeters]).toEqual([recipe.widthMeters, recipe.depthMeters]);
    if (leafCount >= 20000) {
        for (const axis of [0, 2]) {
            const extent = axis === 0 ? recipe.widthMeters : recipe.depthMeters;
            expect(manifest.bounds.min[axis]).toBeGreaterThanOrEqual(-extent / 2 - 1e-6);
            expect(manifest.bounds.max[axis]).toBeLessThanOrEqual(extent / 2 + 1e-6);
            expect(manifest.bounds.max[axis] - manifest.bounds.min[axis]).toBeGreaterThan(extent - 0.05);
        }
    }
    if (leafCount === 96000) {
        expect(manifest.densityLeavesPerSquareMeter).toBeCloseTo((20000 / 36) * 1.2, 8);
        expect(manifest.placements).toHaveLength(48000);
        expect(manifest.shadeScreen).toMatchObject({ openings: 3, parts: 49 });
        expect(manifest.substrate).toMatchObject({ elevationMeters: 0.005, rampWidthMeters: 0.02, tileMeters: 0.4, edgeInsetMeters: 0.05, albedoMultiplier: 0.3, perimeterMasks: 8, triangles: 98 });
    }
    expect(manifest.heightRangeMeters[0]).toBeCloseTo(0.08, 8);
    expect(manifest.heightRangeMeters[1]).toBeCloseTo(0.14, 8);
    expect(manifest.inclinationRangeDegrees).toEqual([0, 45]);
    expect(manifest.trianglesPerLeaf.max).toBeLessThanOrEqual(50);
    expect(manifest.bounds.min[1]).toBeGreaterThanOrEqual(-1e-8);
    for (let i = 0; i < manifest.views.length; i++) {
        const actualDistance = await page.evaluate(index => window.__offlineLeafScene.renderView(index), i);
        expect(actualDistance).toBeCloseTo(manifest.views[i].distance, 8);
        manifest.views[i].actualDistanceMeters = actualDistance;
        await page.screenshot({ path: path.join(folder, manifest.views[i].id + '.png') });
        console.log('[offlineLeaves] Captured ' + manifest.views[i].id);
    }
    const glbName = leafCount + '_leaves.glb', glbPath = path.join(folder, glbName);
    await writeFile(glbPath, Buffer.alloc(0));
    await page.exposeFunction('saveOfflineSceneChunk', chunk => appendFile(glbPath, Buffer.from(chunk, 'base64')));
    const exportBytes = await page.evaluate(async leafCount => {
        const THREE = await import('three');
        const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
        const offline = window.__offlineLeafScene, scene = new THREE.Scene();
        scene.name = leafCount + ' leaves — 8–14 cm — 0–45 degree backward inclinations';
        const foliage = offline.field.clone(true);
        const original = foliage.children[0].material;
        const exportMap = texture => {
            if (!texture.isDataTexture) return texture;
            const { data, width, height } = texture.image, canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
            const map = new THREE.CanvasTexture(canvas);
            map.colorSpace = texture.colorSpace; map.flipY = texture.flipY;
            map.wrapS = texture.wrapS; map.wrapT = texture.wrapT;
            return map;
        };
        const standard = new THREE.MeshStandardMaterial({
            vertexColors: true, side: THREE.DoubleSide, roughness: original.roughness,
            normalMap: exportMap(original.normalMap), normalScale: original.normalScale, roughnessMap: exportMap(original.roughnessMap)
        });
        standard.name = 'Grass — standard PBR export';
        for (const mesh of foliage.children) {
            mesh.material = standard; mesh.geometry = mesh.geometry.clone(); mesh.geometry.deleteAttribute('grassFacingNormal');
        }
        scene.add(foliage);
        if (offline.shadeScreen.children.length) scene.add(offline.shadeScreen.clone(true));
        if (offline.litter) {
            const litter = offline.litter.group.clone(true);
            for (const mesh of litter.children) {
                const source = mesh.material;
                if (!source.alphaMap) continue;
                // glTF has no separate alpha map: preserve perimeter cutouts in base-color alpha.
                const canvas = document.createElement('canvas');
                canvas.width = source.map.image.width; canvas.height = source.map.image.height;
                const context = canvas.getContext('2d');
                context.drawImage(source.map.image, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                const mask = source.alphaMap.image.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] *= mask[i - 2] / 255;
                context.putImageData(pixels, 0, 0);
                const map = new THREE.CanvasTexture(canvas);
                map.colorSpace = source.map.colorSpace; map.flipY = source.map.flipY;
                map.wrapS = source.map.wrapS; map.wrapT = source.map.wrapT;
                map.repeat.copy(source.map.repeat); map.offset.copy(source.map.offset);
                map.center.copy(source.map.center); map.rotation = source.map.rotation;
                mesh.material = source.clone(); mesh.material.map = map; mesh.material.alphaMap = null;
            }
            scene.add(litter);
        }
        const groundMaterial = offline.ground.material.clone();
        for (const name of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (groundMaterial[name]) {
            groundMaterial[name] = groundMaterial[name].clone();
            groundMaterial[name].repeat.multiplyScalar(leafCount >= 10000 ? 1 : 0.2);
        }
        const groundSize = leafCount >= 10000 ? 200 : 4;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize); groundGeometry.rotateX(-Math.PI / 2);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.name = 'Brown earth'; scene.add(ground);
        const bytes = new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 }));
        for (let start = 0; start < bytes.length; start += 1048576) {
            const end = Math.min(bytes.length, start + 1048576);
            let binary = '';
            for (let i = start; i < end; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 32768)));
            await window.saveOfflineSceneChunk(btoa(binary));
        }
        return bytes.length;
    }, leafCount);
    const buffer = await readFile(glbPath);
    expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
    expect(buffer.length).toBe(exportBytes);
    if (leafCount === 96000) {
        const jsonLength = buffer.readUInt32LE(12);
        const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
        expect(gltf.nodes.some(node => node.name === 'GrassV2DryLitterSubstrate')).toBe(true);
        expect(gltf.images.every(image => image.bufferView !== undefined && !image.uri)).toBe(true);
        const materials = gltf.materials.filter(material => material.name?.startsWith('DryLitter'));
        expect(materials).toHaveLength(9);
        expect(materials.every(material => material.alphaMode === 'MASK' && material.alphaCutoff === 0.5)).toBe(true);
        const east = materials.find(material => material.name === 'DryLitterContour_1_0');
        const imageIndex = gltf.textures[east.pbrMetallicRoughness.baseColorTexture.index].source;
        const imageView = gltf.bufferViews[gltf.images[imageIndex].bufferView];
        const start = 28 + jsonLength + (imageView.byteOffset ?? 0);
        const imageBytes = buffer.subarray(start, start + imageView.byteLength);
        const edgeAlpha = await page.evaluate(async base64 => {
            const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let innerMax = 0, outerMax = 0;
            for (let y = 0; y < canvas.height; y++) {
                innerMax = Math.max(innerMax, pixels[(y * canvas.width) * 4 + 3]);
                outerMax = Math.max(outerMax, pixels[((y + 1) * canvas.width - 1) * 4 + 3]);
            }
            return { innerMax, outerMax };
        }, imageBytes.toString('base64'));
        expect(edgeAlpha).toEqual({ innerMax: 255, outerMax: 0 });
        manifest.substrate.exportedEdgeAlpha = edgeAlpha;
    }
    manifest.sourceHashes = before;
    manifest.exportBytes = exportBytes;
    await writeFile(path.join(folder, 'scene.json'), JSON.stringify(manifest, null, 2));
    const figures = manifest.views.map(view => '<figure id="' + view.id + '"><img src="' + view.id + '.png" alt="' + view.label + '"><figcaption>'
        + view.label + ' · ' + view.distance.toFixed(2) + ' m · azimuth ' + view.azimuth + '° · elevation ' + view.elevation + '° · FOV ' + (view.fieldOfViewDegrees ?? 35) + '°</figcaption></figure>').join('\n');
    await writeFile(path.join(folder, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>' + label + ' leaves · offline renders</title><style>body{margin:32px;background:#14201b;color:#e6ede7;font:16px system-ui}main{max-width:1500px;margin:auto}h1{font-weight:500}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:24px}figure{margin:0}img{width:100%;display:block}figcaption{padding:12px 0;color:#b9cbbb}a{color:#b8dd91}</style>'
        + '<main><h1>' + label + ' leaves</h1><p>' + shootCount.toLocaleString('en-US') + ' paired shoots · ' + recipe.widthMeters + ' × ' + recipe.depthMeters + ' m · actual heights 8–14 cm · backward inclinations 0–45° · ' + manifest.views.length + ' 4K renders · ' + manifest.densityLeavesPerSquareMeter.toFixed(2) + ' leaves/m².</p>'
        + '<p>Greener matte blades matched to the lawn crop, with restrained fine relief, soft backlighting and 12% straw-colored variation. Directly lit blades retain more green, with a smaller difference between viewing directions. Leaves retain the 50-triangle budget.</p>'
        + (manifest.shadeScreen ? '<p>A raised shade screen casts a broad shadow with three sunlit openings. The six-metre and shade-boundary views look beneath the screen. Diffuse ambient fill keeps shaded blades green.</p>' : '')
        + (manifest.substrate ? '<p>Darker dry litter has a 5 mm raised interior and a 2 cm ramp down to its grounded strand outline, inset inside the grass edge.</p>' : '')
        + (leafCount === 96000 ? '<p><a href="/debug_tools/grass_litter_scene.html#06_closeup">Explore this scene · mouse and WASDQE</a></p>' : '')
        + '<p><a href="' + glbName + '">Portable 3D scene</a> · <a href="scene.json">Placement and camera data</a></p><section>' + figures + '</section>'
        + (manifest.substrate ? '<p><a href="../litter_substrate/index.html">Litter edge and contour masks</a></p>' : '')
        + (leafCount === 96000 ? '<h2>Reference photos</h2><p><a href="references/sunlit_green_target.png">Sunlit green target</a> · <a href="references/20260927_152233.jpg">Shade reference — fuller grass farther back</a> · <a href="../direct_light_balance/index.html">Before/after lighting comparison</a></p>' : '')
        + '</main></html>');
    await writeFile(path.join(folder, 'README.md'), '# Offline ' + label + '-leaf scene\n\n'
        + 'Open index.html to view all ' + manifest.views.length + ' UHD renders. The GLB embeds meshes and standard PBR textures. '
        + 'The PNG renders use the current study daylight and custom leaf-lighting shader; custom shader code is not embedded in GLB.\n\n'
        + 'Greener matte blades matched to the lawn crop, with restrained fine relief, soft backlighting and 12% straw-colored variation. Directly lit blades retain more green, with a smaller difference between viewing directions. Leaves retain the 50-triangle budget.\n\n'
        + 'The planted area is ' + recipe.widthMeters + ' × ' + recipe.depthMeters + ' metres. Every leaf is 8–14 cm tall above the flat soil. Shoots share a uniform scale to preserve blade proportions; each entire double-leaf shoot uses one of 25 rigid backward inclinations from 0° to 45°. The original 11° spine bend is preserved without additional deformation. '
        + 'Density is ' + manifest.densityLeavesPerSquareMeter.toFixed(2) + ' leaves per square metre. Yaw, root placement and scale use seed 9272026. Camera distances in scene.json are measured from camera to target.\n\n'
        + (manifest.shadeScreen ? 'A 3.9 × 5.2 m shade screen stands 2.6 m above the grass, with three 0.65 m openings for sunlit spots. The same leaf material is used in sun and shade, with hemisphere fill intensity 12 in this scene; the screen is also included in the GLB.\n\n' : '')
        + (manifest.substrate ? 'Dry litter substrate: authored 1K PBR maps, 0.4 m repeats, 0.3 linear albedo multiplier, a 5 mm raised interior and a 2 cm ramp to soil contact. Eight perimeter masks derive from the supplied strand alpha and height, inset 5 cm with 2.5 cm contour variation; the interior tiles normally. The substrate is embedded in the GLB.\n\n' : '')
        + 'Reproduce with GRASS_CAPTURE_LEAVES=' + leafCount + ' and tests/headless/e2e/grass_debug_v2_thousand_leaves.pwtest.js. This runs in a separate headless browser; the authoring page and geometry source are unchanged.\n');
    expect(await hashes()).toEqual(before);
    expect(errors).toEqual([]);
    console.log('[offlineLeaves] Complete: ' + manifest.triangles + ' triangles; GLB ' + buffer.length + ' bytes');
});
