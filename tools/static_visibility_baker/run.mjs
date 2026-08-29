import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
    const token = process.argv[index];
    if (!token.startsWith('--')) continue;
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
        args.set(token, next);
        index += 1;
    } else {
        args.set(token, true);
    }
}

const requestedPort = Math.max(1024, Number(args.get('--port')) || 4173);
const validationViews = Math.max(1, Number(args.get('--validation-views')) || 750);
const outputPath = path.resolve(repoRoot, String(args.get('--output') || 'src/app/city/visibility/bakes/bigcity2.v1.json'));
const reportPath = path.resolve(repoRoot, String(args.get('--report') || 'tests/artifacts/static_visibility_bake/report.json'));
let server = null;
let browser = null;

function canListen(port) {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

async function findFreePort(startPort) {
    for (let port = startPort; port < startPort + 200; port += 1) {
        if (await canListen(port)) return port;
    }
    throw new Error(`No free static visibility baker port found from ${startPort}`);
}

async function waitForServer(url) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        try {
            const response = await fetch(`${url}/__health`);
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Static visibility baker could not reach ${url}`);
}

try {
    const port = args.has('--url') ? requestedPort : await findFreePort(requestedPort);
    const baseUrl = String(args.get('--url') || `http://127.0.0.1:${port}`);
    if (!args.has('--url')) {
        server = spawn(process.execPath, ['tests/headless/e2e/static_server.mjs'], {
            cwd: repoRoot,
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'ignore', 'inherit']
        });
        await waitForServer(baseUrl);
    }

    const chromePath = String(process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
    browser = await chromium.launch({
        headless: true,
        ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(0);
    page.on('console', (message) => {
        const value = message.text();
        if (value.startsWith('[StaticVisibilityBake]')) process.stdout.write(`${value}\n`);
        else if ((message.type() === 'error' || message.type() === 'warning')
            && !value.includes('Texture marked for update but no image data found')) {
            process.stderr.write(`[StaticVisibilityBake] browser ${message.type()}: ${value}\n`);
        }
    });
    page.on('requestfailed', (request) => process.stderr.write(`[StaticVisibilityBake] request failed: ${request.url()} ${request.failure()?.errorText ?? ''}\n`));
    page.on('pageerror', (error) => process.stderr.write(`[StaticVisibilityBake] page error: ${error?.message ?? error}\n`));

    await page.goto(`${baseUrl}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`);
    await page.waitForFunction(
        () => window.__busSim?.sm?.currentName === 'game_mode' && !!window.__busSim?.sm?.current?.city,
        null,
        { timeout: 180_000 }
    );
    await page.waitForFunction(
        () => {
            const trees = window.__busSim?.sm?.current?.city?.world?.trees;
            const expected = trees?.placements?.length ?? 0;
            return expected === (trees?.group?.children?.length ?? 0);
        },
        null,
        { timeout: 180_000 }
    );

    const result = await page.evaluate(async ({ validationViews: requestedValidationViews }) => {
        const THREE = await import('three');
        const visibility = await import('./src/app/city/visibility/index.js');
        const cityAdapter = await import('./src/graphics/visuals/city/CityStaticVisibility.js');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const city = state.city;
        const renderer = engine.renderer;
        const profile = visibility.STATIC_VISIBILITY_PROFILE;
        engine.stop();
        state._updateChaseCamera = () => {};
        city.updateStaticVisibility = () => false;

        const started = performance.now();
        const mapWidth = city.map.width;
        const mapHeight = city.map.height;
        const cellCount = mapWidth * mapHeight;
        const directionCount = profile.directionCount;
        const unitRoots = cityAdapter.collectStaticVisibilityCityUnits(city);
        const unitCount = unitRoots.length;
        const wordsPerMask = Math.ceil(unitCount / 32);
        const inventory = [];
        const units = [];
        const instanceMatrix = new THREE.Matrix4();
        const worldInstanceMatrix = new THREE.Matrix4();

        function isRenderableMesh(object) {
            if (!object?.isMesh || object.visible === false || object.userData?.isShadowCasterMerge === true) return false;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            return materials.some((material) => material && material.visible !== false && material.userData?.isShadowCasterMerge !== true);
        }

        function collectSources(root) {
            const sources = [];
            root.updateWorldMatrix(true, true);
            root.traverse((object) => {
                if (isRenderableMesh(object)) sources.push(object);
            });
            return sources;
        }

        function sourceDrawCalls(source) {
            const materials = Array.isArray(source.material) ? source.material : [source.material];
            const groups = source.geometry?.groups ?? [];
            if (!groups.length) return materials.some((material) => material?.visible !== false) ? 1 : 0;
            return groups.filter((group) => materials[group.materialIndex]?.visible !== false).length;
        }

        function transformPoint(position, vertexIndex, matrixElements, output, offset) {
            const x = position.getX(vertexIndex);
            const y = position.getY(vertexIndex);
            const z = position.getZ(vertexIndex);
            output[offset] = matrixElements[0] * x + matrixElements[4] * y + matrixElements[8] * z + matrixElements[12];
            output[offset + 1] = matrixElements[1] * x + matrixElements[5] * y + matrixElements[9] * z + matrixElements[13];
            output[offset + 2] = matrixElements[2] * x + matrixElements[6] * y + matrixElements[10] * z + matrixElements[14];
        }

        function transformedPositions(sources) {
            let referenceCount = 0;
            for (const source of sources) {
                const references = source.geometry?.index?.count ?? source.geometry?.attributes?.position?.count ?? 0;
                referenceCount += references * (source.isInstancedMesh ? source.count : 1);
            }
            const output = new Float32Array(referenceCount * 3);
            let offset = 0;
            for (const source of sources) {
                const position = source.geometry?.attributes?.position;
                const index = source.geometry?.index ?? null;
                if (!position) continue;
                const copies = source.isInstancedMesh ? source.count : 1;
                for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
                    let matrix = source.matrixWorld;
                    if (source.isInstancedMesh) {
                        source.getMatrixAt(copyIndex, instanceMatrix);
                        worldInstanceMatrix.multiplyMatrices(source.matrixWorld, instanceMatrix);
                        matrix = worldInstanceMatrix;
                    }
                    const references = index?.count ?? position.count;
                    for (let referenceIndex = 0; referenceIndex < references; referenceIndex += 1) {
                        transformPoint(position, index ? index.getX(referenceIndex) : referenceIndex, matrix.elements, output, offset);
                        offset += 3;
                    }
                }
            }
            return output;
        }

        for (let index = 0; index < unitRoots.length; index += 1) {
            const unitRoot = unitRoots[index];
            const sources = collectSources(unitRoot.root);
            const drawCalls = sources.reduce((sum, source) => sum + sourceDrawCalls(source), 0);
            const triangles = sources.reduce((sum, source) => {
                const references = source.geometry?.index?.count ?? source.geometry?.attributes?.position?.count ?? 0;
                return sum + references / 3 * (source.isInstancedMesh ? source.count : 1);
            }, 0);
            const isTree = unitRoot.category === visibility.STATIC_VISIBILITY_CATEGORY.TREES;
            const positions = isTree ? null : transformedPositions(sources);
            const box = new THREE.Box3().setFromObject(unitRoot.root);
            units.push({
                index,
                id: unitRoot.id,
                category: unitRoot.category,
                box,
                positions,
                alphaSources: isTree ? sources : null,
                drawCalls,
                triangles
            });
            inventory.push({ id: unitRoot.id, category: unitRoot.category, drawCalls, triangles });
        }

        const proxyScene = new THREE.Scene();
        const proxyMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: true,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: true,
            toneMapped: false,
            fog: false
        });
        const regionLists = Array.from({ length: 25 }, () => []);
        for (const unit of units) {
            const center = unit.box.getCenter(new THREE.Vector3());
            const cellX = Math.max(0, Math.min(mapWidth - 1, Math.round((center.x - city.map.origin.x) / city.map.tileSize)));
            const cellY = Math.max(0, Math.min(mapHeight - 1, Math.round((center.z - city.map.origin.z) / city.map.tileSize)));
            regionLists[Math.floor(cellY / 5) * 5 + Math.floor(cellX / 5)].push(unit);
        }

        for (let regionIndex = 0; regionIndex < regionLists.length; regionIndex += 1) {
            const opaque = regionLists[regionIndex].filter((unit) => unit.positions);
            const valueCount = opaque.reduce((sum, unit) => sum + unit.positions.length, 0);
            if (!valueCount) continue;
            const positions = new Float32Array(valueCount);
            const colors = new Float32Array(valueCount);
            let offset = 0;
            for (const unit of opaque) {
                positions.set(unit.positions, offset);
                const encoded = unit.index + 1;
                const r = (encoded & 255) / 255;
                const g = ((encoded >>> 8) & 255) / 255;
                const b = ((encoded >>> 16) & 255) / 255;
                for (let valueIndex = 0; valueIndex < unit.positions.length; valueIndex += 3) {
                    colors[offset + valueIndex] = r;
                    colors[offset + valueIndex + 1] = g;
                    colors[offset + valueIndex + 2] = b;
                }
                offset += unit.positions.length;
                unit.positions = null;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, proxyMaterial);
            mesh.name = `StaticVisibilityProxyRegion_${regionIndex}`;
            proxyScene.add(mesh);
        }

        for (const unit of units) {
            if (!unit.alphaSources) continue;
            const encoded = unit.index + 1;
            const idColor = new THREE.Color().setRGB(
                (encoded & 255) / 255,
                ((encoded >>> 8) & 255) / 255,
                ((encoded >>> 16) & 255) / 255,
                THREE.LinearSRGBColorSpace
            );
            for (const source of unit.alphaSources) {
                const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material];
                const materials = sourceMaterials.map((sourceMaterial) => {
                    const cutout = (Number(sourceMaterial?.alphaTest) || 0) > 0 || sourceMaterial?.userData?.isFoliage === true;
                    return new THREE.MeshBasicMaterial({
                        color: idColor,
                        side: sourceMaterial?.side ?? THREE.FrontSide,
                        depthTest: true,
                        depthWrite: true,
                        alphaTest: cutout ? Math.max(0.01, Number(sourceMaterial?.alphaTest) || 0.5) : 0,
                        alphaMap: cutout ? (sourceMaterial?.userData?.aoAlphaMap ?? sourceMaterial?.alphaMap ?? null) : null,
                        toneMapped: false,
                        fog: false
                    });
                });
                const mesh = new THREE.Mesh(source.geometry, Array.isArray(source.material) ? materials : materials[0]);
                mesh.matrixAutoUpdate = false;
                mesh.matrix.copy(source.matrixWorld);
                mesh.matrixWorld.copy(source.matrixWorld);
                proxyScene.add(mesh);
            }
            unit.alphaSources = null;
        }

        const camera = new THREE.PerspectiveCamera(profile.camera.fovDeg, profile.camera.maxAspect, profile.camera.near, profile.camera.far);
        const projectionView = new THREE.Matrix4();
        const frustum = new THREE.Frustum();
        const target = new THREE.Vector3();
        const lookDistance = Number(state._chase?.distance ?? 15);

        function makeTarget(width, height) {
            const renderTarget = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: false,
                generateMipmaps: false
            });
            renderTarget.texture.colorSpace = THREE.NoColorSpace;
            return { renderTarget, width, height, pixels: new Uint8Array(width * height * 4) };
        }

        const bakeTarget = makeTarget(...profile.bakeResolution);
        const validationTarget = makeTarget(...profile.validationResolution);
        const scratch = new Uint32Array(wordsPerMask);
        const candidate = new Uint32Array(wordsPerMask);
        const rawTable = new Uint32Array(cellCount * directionCount * wordsPerMask);
        let unknownPixels = 0;
        const originalShadowEnabled = renderer.shadowMap.enabled;
        const originalRenderTarget = renderer.getRenderTarget();
        const originalToneMapping = renderer.toneMapping;
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setClearColor(0x000000, 1);

        function configureCamera(x, y, z, yaw, pitchDeg) {
            const pitch = THREE.MathUtils.degToRad(pitchDeg);
            const horizontal = Math.cos(pitch) * lookDistance;
            camera.position.set(x, y, z);
            target.set(x + Math.sin(yaw) * horizontal, y + Math.sin(pitch) * lookDistance, z + Math.cos(yaw) * horizontal);
            camera.lookAt(target);
            camera.updateMatrixWorld(true);
            camera.updateProjectionMatrix();
            projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projectionView);
        }

        function setBit(mask, index) {
            mask[index >>> 5] |= (1 << (index & 31)) >>> 0;
        }

        function hasBit(mask, index) {
            return (mask[index >>> 5] & ((1 << (index & 31)) >>> 0)) !== 0;
        }

        function renderMask(targetInfo, output, includeEdgeGuard = false) {
            output.fill(0);
            renderer.setRenderTarget(targetInfo.renderTarget);
            renderer.clear(true, true, true);
            renderer.render(proxyScene, camera);
            renderer.readRenderTargetPixels(targetInfo.renderTarget, 0, 0, targetInfo.width, targetInfo.height, targetInfo.pixels);
            for (let pixelIndex = 0; pixelIndex < targetInfo.pixels.length; pixelIndex += 4) {
                const encoded = targetInfo.pixels[pixelIndex]
                    | (targetInfo.pixels[pixelIndex + 1] << 8)
                    | (targetInfo.pixels[pixelIndex + 2] << 16);
                if (!encoded) continue;
                const unitIndex = encoded - 1;
                if (unitIndex < 0 || unitIndex >= unitCount) {
                    unknownPixels += 1;
                    continue;
                }
                setBit(output, unitIndex);
            }
            if (!includeEdgeGuard) return;
            const corner = new THREE.Vector3();
            for (const unit of units) {
                if (hasBit(output, unit.index) || !frustum.intersectsBox(unit.box)) continue;
                let minX = Infinity;
                let maxX = -Infinity;
                let minY = Infinity;
                let maxY = -Infinity;
                for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
                    corner.set(
                        (cornerIndex & 1) ? unit.box.max.x : unit.box.min.x,
                        (cornerIndex & 2) ? unit.box.max.y : unit.box.min.y,
                        (cornerIndex & 4) ? unit.box.max.z : unit.box.min.z
                    ).project(camera);
                    minX = Math.min(minX, corner.x);
                    maxX = Math.max(maxX, corner.x);
                    minY = Math.min(minY, corner.y);
                    maxY = Math.max(maxY, corner.y);
                }
                const projectedWidth = Math.max(0, maxX - minX) * targetInfo.width * 0.5;
                const projectedHeight = Math.max(0, maxY - minY) * targetInfo.height * 0.5;
                if (Math.min(projectedWidth, projectedHeight) <= profile.edgeGuardPixels * 2) setBit(output, unit.index);
            }
        }

        function fillCandidate(output) {
            output.fill(0);
            for (const unit of units) if (frustum.intersectsBox(unit.box)) setBit(output, unit.index);
        }

        function tableOffset(cellIndex, directionIndex) {
            return (cellIndex * directionCount + directionIndex) * wordsPerMask;
        }

        function orAt(table, offset, mask) {
            for (let word = 0; word < wordsPerMask; word += 1) table[offset + word] |= mask[word];
        }

        const profiles = [
            ...profile.heights.map((height, heightIndex) => ({
                id: `baseline_${heightIndex}`,
                height,
                pitchDeg: profile.baselinePitchDeg[heightIndex]
            })),
            ...profile.pitchProfiles.map((entry) => ({ ...entry, height: profile.heights[entry.heightIndex] }))
        ];
        const viewsTotal = cellCount * profiles.length * profile.horizontalOffsets.length ** 2 * directionCount;
        let completed = 0;
        console.log(`[StaticVisibilityBake] ${unitCount} roots, ${viewsTotal} bake views at ${profile.bakeResolution.join('x')}`);
        for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
            const cellX = cellIndex % mapWidth;
            const cellY = Math.floor(cellIndex / mapWidth);
            const center = city.map.tileToWorldCenter(cellX, cellY);
            for (const poseProfile of profiles) {
                for (const offsetZ of profile.horizontalOffsets) {
                    for (const offsetX of profile.horizontalOffsets) {
                        for (let directionIndex = 0; directionIndex < directionCount; directionIndex += 1) {
                            const yaw = directionIndex / directionCount * Math.PI * 2;
                            configureCamera(center.x + offsetX, poseProfile.height, center.z + offsetZ, yaw, poseProfile.pitchDeg);
                            renderMask(bakeTarget, scratch, true);
                            orAt(rawTable, tableOffset(cellIndex, directionIndex), scratch);
                            completed += 1;
                            if (completed % 15000 === 0) {
                                console.log(`[StaticVisibilityBake] ${completed}/${viewsTotal} (${((performance.now() - started) / 1000).toFixed(1)}s)`);
                                await new Promise((resolve) => requestAnimationFrame(resolve));
                            }
                        }
                    }
                }
            }
        }

        const table = visibility.expandStaticVisibilityNeighborMasks({
            source: rawTable,
            width: mapWidth,
            height: mapHeight,
            directionCount,
            wordsPerMask,
            radius: profile.neighborRadius
        });
        const roadCells = [];
        for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) if (city.map.kind[cellIndex] === 1) roadCells.push(cellIndex);
        let rng = 0x520c17a5;
        function random() {
            rng ^= rng << 13;
            rng ^= rng >>> 17;
            rng ^= rng << 5;
            return (rng >>> 0) / 4294967296;
        }

        function lookup(cellIndex, yaw) {
            const normalized = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const lower = Math.floor(normalized / (Math.PI * 2 / directionCount)) % directionCount;
            const upper = (lower + 1) % directionCount;
            const output = new Uint32Array(wordsPerMask);
            const a = tableOffset(cellIndex, lower);
            const b = tableOffset(cellIndex, upper);
            for (let word = 0; word < wordsPerMask; word += 1) output[word] = table[a + word] | table[b + word];
            return { output, lower, upper };
        }

        const validationSamples = [];
        const validationByCategory = Object.fromEntries(profile.categories.map((category) => [category, {
            visibleObservations: 0,
            candidateObservations: 0,
            keptCandidateObservations: 0,
            missesBeforeRepair: 0,
            missesAfterRepair: 0
        }]));
        console.log(`[StaticVisibilityBake] ${requestedValidationViews} native validation views at ${profile.validationResolution.join('x')}`);
        for (let viewIndex = 0; viewIndex < requestedValidationViews; viewIndex += 1) {
            const cellIndex = roadCells[Math.floor(random() * roadCells.length)];
            const cellX = cellIndex % mapWidth;
            const cellY = Math.floor(cellIndex / mapWidth);
            const center = city.map.tileToWorldCenter(cellX, cellY);
            const pose = {
                cellIndex,
                cellX,
                cellY,
                x: center.x + (random() * 2 - 1) * city.map.tileSize * 0.49,
                z: center.z + (random() * 2 - 1) * city.map.tileSize * 0.49,
                y: profile.heights[0] + random() * (profile.heights[2] - profile.heights[0]),
                yaw: random() * Math.PI * 2,
                pitchDeg: profile.camera.minPitchDeg + random() * (profile.camera.maxPitchDeg - profile.camera.minPitchDeg)
            };
            configureCamera(pose.x, pose.y, pose.z, pose.yaw, pose.pitchDeg);
            const actual = new Uint32Array(wordsPerMask);
            const candidates = new Uint32Array(wordsPerMask);
            renderMask(validationTarget, actual, false);
            fillCandidate(candidates);
            validationSamples.push({ pose, actual, candidates });
            if ((viewIndex + 1) % 100 === 0) console.log(`[StaticVisibilityBake] validation ${viewIndex + 1}/${requestedValidationViews}`);
        }

        let missesBeforeRepair = 0;
        let viewsWithMissBeforeRepair = 0;
        for (const sample of validationSamples) {
            const kept = lookup(sample.pose.cellIndex, sample.pose.yaw);
            let viewMiss = false;
            for (const unit of units) {
                const row = validationByCategory[unit.category];
                if (hasBit(sample.candidates, unit.index)) {
                    row.candidateObservations += 1;
                    if (hasBit(kept.output, unit.index)) row.keptCandidateObservations += 1;
                }
                if (!hasBit(sample.actual, unit.index)) continue;
                row.visibleObservations += 1;
                if (hasBit(kept.output, unit.index)) continue;
                row.missesBeforeRepair += 1;
                missesBeforeRepair += 1;
                viewMiss = true;
                for (let dy = -profile.neighborRadius; dy <= profile.neighborRadius; dy += 1) {
                    for (let dx = -profile.neighborRadius; dx <= profile.neighborRadius; dx += 1) {
                        const repairX = sample.pose.cellX + dx;
                        const repairY = sample.pose.cellY + dy;
                        if (repairX < 0 || repairY < 0 || repairX >= mapWidth || repairY >= mapHeight) continue;
                        const repairCell = repairX + repairY * mapWidth;
                        for (let directionIndex = 0; directionIndex < directionCount; directionIndex += 1) {
                            table[tableOffset(repairCell, directionIndex) + (unit.index >>> 5)] |= (1 << (unit.index & 31)) >>> 0;
                        }
                    }
                }
            }
            if (viewMiss) viewsWithMissBeforeRepair += 1;
        }

        let missesAfterRepair = 0;
        let viewsWithMissAfterRepair = 0;
        for (const sample of validationSamples) {
            const kept = lookup(sample.pose.cellIndex, sample.pose.yaw).output;
            let viewMiss = false;
            for (const unit of units) {
                if (!hasBit(sample.actual, unit.index) || hasBit(kept, unit.index)) continue;
                validationByCategory[unit.category].missesAfterRepair += 1;
                missesAfterRepair += 1;
                viewMiss = true;
            }
            if (viewMiss) viewsWithMissAfterRepair += 1;
        }

        function countBits(value) {
            value -= (value >>> 1) & 0x55555555;
            value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
            return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
        }
        let tableBits = 0;
        for (const word of table) tableBits += countBits(word);

        renderer.setRenderTarget(originalRenderTarget);
        renderer.shadowMap.enabled = originalShadowEnabled;
        renderer.toneMapping = originalToneMapping;

        const bytes = new Uint8Array(table.length * 4);
        const dataView = new DataView(bytes.buffer);
        for (let index = 0; index < table.length; index += 1) dataView.setUint32(index * 4, table[index], true);
        let binary = '';
        const chunkSize = 0x8000;
        for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
        }
        const maskData = btoa(binary);
        const cityConfigHash = cityAdapter.createStaticVisibilityCityHash(city);
        const gl = renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const payload = {
            schema: visibility.STATIC_VISIBILITY_SCHEMA,
            version: visibility.STATIC_VISIBILITY_VERSION,
            hashSchema: visibility.STATIC_VISIBILITY_HASH_SCHEMA,
            cityId: city.cityId,
            cityConfigHash,
            geometryRevision: profile.geometryRevision,
            profileId: profile.id,
            map: {
                width: mapWidth,
                height: mapHeight,
                tileSize: city.map.tileSize,
                origin: { x: city.map.origin.x, z: city.map.origin.z }
            },
            directionCount,
            units: unitRoots.map((unit) => ({ id: unit.id, category: unit.category })),
            mask: {
                encoding: 'base64-u32-le',
                wordsPerMask,
                entryCount: cellCount * directionCount,
                data: maskData
            },
            bake: {
                profile,
                views: viewsTotal,
                nativeValidationViews: requestedValidationViews,
                missesBeforeRepair,
                missesAfterRepair,
                tableBits
            }
        };
        const categoryInventory = {};
        for (const row of inventory) {
            const category = categoryInventory[row.category] ?? (categoryInventory[row.category] = { roots: 0, drawCalls: 0, triangles: 0 });
            category.roots += 1;
            category.drawCalls += row.drawCalls;
            category.triangles += row.triangles;
        }
        const report = {
            generatedAt: new Date().toISOString(),
            elapsedMs: performance.now() - started,
            gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            profile,
            cityConfigHash,
            unitCount,
            wordsPerMask,
            binaryBytes: bytes.byteLength,
            jsonBase64Bytes: maskData.length,
            bakeViews: viewsTotal,
            unknownPixels,
            tableBits,
            averageRootsPerMask: tableBits / (cellCount * directionCount),
            averageCulledRootsPerMask: unitCount - tableBits / (cellCount * directionCount),
            inventory: categoryInventory,
            validation: {
                resolution: profile.validationResolution,
                views: requestedValidationViews,
                missesBeforeRepair,
                viewsWithMissBeforeRepair,
                missesAfterRepair,
                viewsWithMissAfterRepair,
                categories: validationByCategory
            }
        };
        console.log(`[StaticVisibilityBake] complete in ${(report.elapsedMs / 1000).toFixed(1)}s; native misses ${missesAfterRepair}`);
        return { payload, report };
    }, { validationViews });

    if (result.report.validation.missesAfterRepair !== 0) {
        throw new Error(`Native-resolution validation failed with ${result.report.validation.missesAfterRepair} missed observations`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result.payload, null, 2)}\n`, 'utf8');
    await writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');
    process.stdout.write(`[StaticVisibilityBake] wrote ${path.relative(repoRoot, outputPath)}\n`);
    process.stdout.write(`[StaticVisibilityBake] report ${path.relative(repoRoot, reportPath)}\n`);
} finally {
    await browser?.close?.();
    if (server && !server.killed) server.kill('SIGTERM');
}
