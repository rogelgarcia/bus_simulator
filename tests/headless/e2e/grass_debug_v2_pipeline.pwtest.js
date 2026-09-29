// Verify a changed source leaf regenerates every configured grass asset and releases only its own outputs.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass pipeline regenerates all configurations, captures and field geometry from the source leaf', async ({ page }) => {
    test.setTimeout(300000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/asset_pipeline');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        const original = {
            plant: study.pipeline.get('leaf/source'), cards: study.pipeline.get('leaf/lods'),
            patch: study.pipeline.get('patch/reference'), comparison: study.pipeline.get('view/comparison'),
            largeField: study.pipeline.get('field/30x20'), pipeline: study.pipeline
        };
        const initialGraph = original.pipeline.getSnapshot(), leaf = original.plant.getSnapshot();
        const originalSnapshot = JSON.stringify(leaf);
        const hash = array => {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            let value = 2166136261;
            for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
            return value.toString(16).padStart(8, '0');
        };
        const captures = bundle => {
            const result = new Map(), comparison = bundle.comparison;
            const maps = (prefix, textures, read = channel => textures[channel].image.data) => {
                for (const [channel, texture] of Object.entries(textures)) {
                    if (texture?.isTexture) result.set(prefix + '/' + channel, { texture, read: () => read(channel) });
                }
            };
            const views = (prefix, bake) => bake.views.forEach(view => maps(prefix + '/' + view.id, view.textures));
            maps('leaf-atlas', bundle.cards.atlas);
            bundle.patch.representations.refined.group.children.filter(mesh => mesh.isInstancedMesh).forEach((mesh, index) =>
                maps('profile-' + index, { albedo: mesh.material.map, normal: mesh.material.normalMap, roughness: mesh.material.roughnessMap }));
            for (const item of bundle.pipeline.getSnapshot().items.filter(item => item.id.startsWith('texture/'))) {
                const bake = bundle.pipeline.get(item.id);
                maps(item.id, bake.textures, bake.readPixels);
            }
            for (const [id, item] of Object.entries(comparison.configurations)) if (item.directional) {
                item.directional.bakes.forEach((bake, index) => maps(id + '/oblique-' + index, bake.textures, bake.readPixels));
                views(id + '/ring-wall', item.ring.wallBake);
                item.ring.bakes.forEach((bake, index) => views(id + '/ring-' + index, bake));
            }
            views('volume-side', comparison.volume.bake);
            views('volume-silhouette', comparison.volume.silhouetteBake);
            comparison.volume.joins.forEach((join, index) => views('volume-join-' + index, join));
            return result;
        };
        const previousCaptures = captures(original);
        const previousHashes = new Map([...previousCaptures].map(([key, entry]) => [key, hash(entry.read())]));
        const geometryRecords = bundle => {
            const result = new Map();
            bundle.plant.bakeMeshes.forEach((mesh, index) => result.set('source/' + index, mesh.geometry));
            for (const mode of ['refined', 'detailed', 'curved', 'split']) {
                result.set('cards/' + mode, bundle.cards[mode].mesh.geometry);
                bundle.patch.representations[mode].group.children.filter(mesh => mesh.isInstancedMesh).forEach((mesh, index) =>
                    result.set('patch/' + mode + '/' + index, mesh.geometry));
            }
            bundle.patch.lod0.children.filter(mesh => mesh.isInstancedMesh).forEach((mesh, index) => result.set('patch/LOD0/' + index, mesh.geometry));
            return result;
        };
        const previousGeometry = geometryRecords(original);
        const baseline = {
            graph: initialGraph, leaf, patch: { bounds: original.patch.getSnapshot().bounds, leaves: original.patch.getSnapshot().leaves },
            volume: original.comparison.volume.getSnapshot(), ring: original.comparison.ringPatch.getSnapshot(),
            field: original.largeField.getSnapshot(), details: original.comparison.getPatchDetails('rings4k')
        };
        const generated = await study.generateAssets({
            leaf: {
                definition: { curve: leaf.definition.curve.map(([x, y, z]) => [x, y * 1.25, z]) },
                shape: { widthMeters: leaf.shape.widthMeters * 1.25 }
            }
        });
        let borrowedDisposals = 0;
        const borrowedMaterial = original.plant.leaves[0].material;
        const borrowedListener = () => borrowedDisposals++;
        borrowedMaterial.addEventListener('dispose', borrowedListener);
        try {
            const nextCaptures = captures(generated), nextGeometry = geometryRecords(generated);
            const textureChecks = [...previousCaptures].map(([id, entry]) => {
                const next = nextCaptures.get(id), pixels = entry.read(), nextPixels = next.read();
                return { id, regenerated: next.texture !== entry.texture, before: previousHashes.get(id), after: hash(nextPixels),
                    bytes: pixels.byteLength, nextBytes: nextPixels.byteLength };
            });
            const geometryChecks = [...previousGeometry].map(([id, geometry]) => {
                const next = nextGeometry.get(id);
                return { id, regenerated: next !== geometry, before: hash(geometry.attributes.position.array), after: hash(next.attributes.position.array) };
            });
            const configurationSharing = Object.entries(generated.comparison.configurations).map(([id, configuration]) => ({
                id,
                graphIdentity: configuration === generated.pipeline.get('configuration/' + id),
                sharedTexture: !configuration.field.texture || configuration.bake === generated.pipeline.get('texture/' + configuration.field.texture)
            }));
            const sourceBounds = new THREE.Box3().setFromObject(generated.patch.representations.refined.group);
            const hybrid = generated.comparison.configurations.hybrid1k;
            const hybridGeometry = new Set(hybrid.representations.refined.children.filter(mesh => mesh.isInstancedMesh).map(mesh => mesh.geometry));
            const hybridMaterial = new Set(hybrid.representations.refined.children.filter(mesh => mesh.isInstancedMesh).map(mesh => mesh.material));
            const fieldLeaves = [];
            generated.largeField.group.traverse(mesh => { if (mesh.isInstancedMesh) fieldLeaves.push(mesh); });
            const geometrySet = new Set(), dataTextures = new Set();
            for (const group of [generated.plant.group, ...['refined', 'detailed', 'curved', 'split'].map(mode => generated.cards[mode].group),
                generated.patch.lod0, ...Object.values(generated.patch.representations).map(value => value.group),
                generated.comparison.group, generated.largeField.group]) {
                group.traverse(object => { if (object.geometry) geometrySet.add(object.geometry); });
            }
            nextCaptures.forEach(entry => { if (entry.texture.isDataTexture) dataTextures.add(entry.texture); });
            const disposalRecords = [...geometrySet, ...dataTextures].map(resource => {
                const record = { type: resource.isBufferGeometry ? 'geometry' : 'texture', count: 0 };
                resource.addEventListener('dispose', () => record.count++);
                return record;
            });
            const originalLeafGeometry = original.plant.leaves[0].geometry;
            let originalGeometryDisposals = 0;
            const originalGeometryListener = () => originalGeometryDisposals++;
            originalLeafGeometry.addEventListener('dispose', originalGeometryListener);
            const next = {
                graph: generated.pipeline.getSnapshot(), leaf: generated.plant.getSnapshot(),
                patch: { leaves: generated.patch.getSnapshot().leaves, bounds: generated.patch.getSnapshot().bounds },
                volume: generated.comparison.volume.getSnapshot(), ring: generated.comparison.ringPatch.getSnapshot(),
                directional: generated.comparison.directionalFloor.getSnapshot(), field: generated.largeField.getSnapshot(),
                sourceBounds: { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() },
                details: generated.comparison.getPatchDetails('rings4k'),
                fieldMeshes: fieldLeaves.length,
                fieldSharesNewGeometry: fieldLeaves.every(mesh => hybridGeometry.has(mesh.geometry) && hybridMaterial.has(mesh.material)),
                placementsUnchanged: JSON.stringify(generated.patch.getSnapshot().placements) === JSON.stringify(original.patch.getSnapshot().placements),
                resourcesRegenerated: initialGraph.items.every(item => original.pipeline.get(item.id) !== generated.pipeline.get(item.id)),
                configurationSharing, textureChecks, geometryChecks
            };
            generated.dispose();
            generated.dispose();
            next.disposal = {
                records: disposalRecords,
                graph: generated.pipeline.getSnapshot(),
                borrowedDisposals,
                originalGeometryDisposals,
                originalLeafUnchanged: JSON.stringify(original.plant.getSnapshot()) === originalSnapshot,
                originalGraphUnchanged: JSON.stringify(original.pipeline.getSnapshot()) === JSON.stringify(initialGraph),
                originalCapturesUnchanged: [...previousCaptures].every(([key, entry]) => hash(entry.read()) === previousHashes.get(key))
            };
            originalLeafGeometry.removeEventListener('dispose', originalGeometryListener);
            study.lighting.render(0);
            return { baseline, next };
        } finally {
            generated.dispose();
            borrowedMaterial.removeEventListener('dispose', borrowedListener);
        }
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect(errors).toEqual([]);
    const { baseline, next } = result;
    const configurationIds = ['source', 'texture4k', 'hybrid1k', 'reference', 'texture2k', 'hybrid2k', 'rings4k'];
    expect(baseline.graph.items.filter(item => item.id.startsWith('configuration/')).map(item => item.id)).toEqual(
        configurationIds.map(id => 'configuration/' + id));
    for (const graph of [baseline.graph, next.graph]) {
        expect(graph.items.every(item => item.status === 'ready')).toBe(true);
        const byId = Object.fromEntries(graph.items.map(item => [item.id, item]));
        expect(byId['leaf/lods'].dependencies).toEqual(['leaf/source']);
        expect(byId['patch/reference'].dependencies).toEqual(['leaf/source', 'leaf/lods']);
        for (const id of ['texture4k', 'hybrid1k'])
            expect(byId['configuration/' + id].dependencies).toContain('texture/4k');
        expect(byId['directional/rings4k'].dependencies).toEqual(['capture-source/4k-single', 'texture/4k-single', 'ring/rings4k']);
        expect(byId).not.toHaveProperty('directional/rings32');
        expect(byId).not.toHaveProperty('texture/4k-multi32');
        expect(byId['field/30x20'].dependencies).toContain('configuration/hybrid1k');
    }
    expect(next.graph.sourceKey).not.toBe(baseline.graph.sourceKey);
    expect(next.leaf.shape.widthMeters).toBeCloseTo(baseline.leaf.shape.widthMeters * 1.25, 10);
    const height = leaf => leaf.bounds.max[1] - leaf.bounds.min[1];
    const width = leaf => leaf.bounds.max[0] - leaf.bounds.min[0];
    expect(height(next.leaf)).toBeGreaterThan(height(baseline.leaf) * 1.2);
    expect(width(next.leaf)).toBeGreaterThan(width(baseline.leaf) * 1.2);
    expect(next.patch.bounds.max[1]).toBeGreaterThan(baseline.patch.bounds.max[1] * 1.15);
    expect(next.resourcesRegenerated).toBe(true);
    expect(next.configurationSharing.every(item => item.graphIdentity && item.sharedTexture)).toBe(true);
    expect(next.placementsUnchanged).toBe(true);
    expect(next.fieldSharesNewGeometry).toBe(true);
    expect(next.fieldMeshes).toBeGreaterThan(0);
    for (const geometry of next.geometryChecks) {
        expect(geometry.regenerated, geometry.id).toBe(true);
        expect(geometry.after, geometry.id).not.toBe(geometry.before);
    }
    expect(next.textureChecks.length).toBeGreaterThan(70);
    for (const texture of next.textureChecks) {
        expect(texture.regenerated, texture.id).toBe(true);
        expect(texture.bytes, texture.id).toBeGreaterThan(0);
        expect(texture.nextBytes, texture.id).toBe(texture.bytes);
        if (texture.id.endsWith('/albedo')) expect(texture.after, texture.id).not.toBe(texture.before);
    }
    for (const state of [baseline, next]) {
        expect(state.patch.leaves).toBe(4000);
        expect(state.details.triangles).toBe(26);
        expect(state.details.textureLeaves).toBe(4000);
        expect(state.field).toMatchObject({ widthMeters: 20, depthMeters: 30, tiles: 600, leavesPerSquare: 1000, leaves: 600000, visible: false });
        expect(state.volume.surfaceHeight).toBeCloseTo(state.volume.sourceHeight * 0.8, 8);
        expect(state.ring.baseHeight).toBeCloseTo(state.ring.sourceHeight * 0.7, 8);
    }
    expect(next.volume.sourceHeight).toBeCloseTo(next.sourceBounds.max[1], 7);
    expect(next.ring.sourceHeight).toBeCloseTo(next.volume.sourceHeight, 7);
    expect(next.directional.planeHeight).toBeCloseTo(next.ring.baseHeight, 9);
    expect(next.directional.totalViewCount).toBe(2);
    for (const capture of next.directional.captures) {
        expect(capture.planeHeight).toBeCloseTo(next.ring.baseHeight, 9);
        expect(capture.sourceHeight).toBeCloseTo(next.sourceBounds.max[1], 7);
    }
    expect(next.ring.bakes[0].views).toEqual(baseline.ring.bakes[0].views);
    expect(next.disposal.graph.items.every(item => item.status === 'disposed')).toBe(true);
    expect(next.disposal.records.length).toBeGreaterThan(100);
    for (const record of next.disposal.records) expect(record.count, record.type + ' disposal count').toBe(1);
    expect(next.disposal.borrowedDisposals).toBe(0);
    expect(next.disposal.originalGeometryDisposals).toBe(0);
    expect(next.disposal.originalLeafUnchanged).toBe(true);
    expect(next.disposal.originalGraphUnchanged).toBe(true);
    expect(next.disposal.originalCapturesUnchanged).toBe(true);
    await page.screenshot({ path: path.join(folder, 'original-after-regeneration.png') });
    expect(errors).toEqual([]);
});

test('Grass pipeline custom recipes keep equal-count captures distinct and honor configuration IDs', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/asset_pipeline');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const study = window.__plantCardsStudy;
        const { createGrassDebugV2WallJoin } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2WallJoin.js');
        const generated = await study.generateAssets({
            config: {
                reference: { count: 400, seed: 42 },
                captures: { resolution: 256 },
                directional: { resolution: 256, azimuthOffsetsDegrees: [0, 180] },
                textures: [
                    { id: 'even', stride: 2, offset: 0, canopyContrast: 1 },
                    { id: 'odd', stride: 2, offset: 1, canopyContrast: 1 }
                ],
                configurations: [
                    { id: 'source', kind: 'reference', x: 0, z: 0, stride: 1, offset: 0 },
                    { id: 'test', kind: 'volume', x: 0, z: -1.3, texture: 'even' },
                    { id: 'test-more', kind: 'volume', x: 1.3, z: -1.3, texture: 'odd' },
                    { id: 'mixed', kind: 'hybrid', x: 0, z: -2.6, texture: 'odd', stride: 4, offset: 0 },
                    { id: 'custom-ring', kind: 'experiment', x: 1.3, z: -2.6, texture: 'odd' }
                ],
                field: { sourceConfigurationId: 'mixed', width: 5, depth: 5, chunkSize: 5 }
            }
        });
        try {
            generated.comparison.setMode('refined');
            const c = generated.comparison, pipeline = generated.pipeline;
            const hash = bytes => {
                let value = 2166136261;
                for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
                return value.toString(16).padStart(8, '0');
            };
            const even = pipeline.get('texture/even'), odd = pipeline.get('texture/odd');
            const topHashes = { even: hash(even.readPixels('albedo')), odd: hash(odd.readPixels('albedo')) };
            const joins = [];
            for (const [index, fieldId, textureId] of [[0, 'test', 'even'], [1, 'test-more', 'odd']]) {
                const expected = createGrassDebugV2WallJoin({
                    sideBake: c.volume.bake, topBake: pipeline.get('texture/' + textureId), wallHeight: c.volume.wallHeight
                });
                try {
                    const actual = c.volume.joins[index];
                    joins.push({
                        fieldId, textureId,
                        channels: expected.views.flatMap((view, viewIndex) => Object.keys(view.textures).map(channel => ({
                            view: view.id, channel,
                            expected: hash(view.textures[channel].image.data),
                            actual: hash(actual.views[viewIndex].textures[channel].image.data)
                        }))),
                        wallMapsMatch: actual.views.every(view =>
                            c.volume.walls.find(wall => wall.name === 'GrassV2Volume-' + fieldId + '-' + view.id).material.map === view.textures.albedo),
                        hashes: actual.views.map(view => hash(view.textures.albedo.image.data))
                    });
                } finally { expected.dispose(); }
            }
            const oddSource = pipeline.get('capture-source/odd');
            const expectedRingCounts = ['front', 'right', 'back', 'left'].map(side => {
                const view = c.ringPatch.bakes[0].views.find(item => item.id === side);
                return { id: side, eligibleLeaves: view.eligibleLeaves, sourceLeaves: view.sourceLeaves };
            });
            const output = {
                graph: pipeline.getSnapshot(), comparison: c.getSnapshot(), field: generated.largeField.getSnapshot(),
                patchLeaves: generated.patch.getSnapshot().leaves,
                sourceCounts: {
                    even: pipeline.get('capture-source/even').children.reduce((sum, mesh) => sum + mesh.count, 0),
                    odd: oddSource.children.reduce((sum, mesh) => sum + mesh.count, 0)
                },
                topHashes, joins,
                topMaps: c.tiles.map(tile => ({
                    id: tile.name.substring('GrassV2Floor-'.length),
                    even: tile.material.map === even.textures.albedo, odd: tile.material.map === odd.textures.albedo
                })),
                details: Object.fromEntries(['source', 'test', 'test-more', 'mixed', 'custom-ring'].map(id => [id, c.getPatchDetails(id)])),
                ring: c.ringPatch.getSnapshot(), ringCounts: expectedRingCounts,
                directional: c.directionalFloor.getSnapshot(),
                directionalTopIsOdd: c.directionalFloor.material.map === odd.textures.albedo,
                defaultPipelineIntact: study.pipeline.getSnapshot().items.every(item => item.status === 'ready')
            };
            generated.dispose();
            output.disposed = pipeline.getSnapshot().items.every(item => item.status === 'disposed');
            return output;
        } finally { generated.dispose(); }
    });
    await writeFile(path.join(folder, 'custom-recipes.json'), JSON.stringify({ result, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(result.graph.items.every(item => item.status === 'ready')).toBe(true);
    expect(result.graph.items.filter(item => item.id.startsWith('configuration/')).map(item => item.id)).toEqual([
        'configuration/source', 'configuration/test', 'configuration/test-more', 'configuration/mixed', 'configuration/custom-ring'
    ]);
    const byId = Object.fromEntries(result.graph.items.map(item => [item.id, item]));
    expect(byId['ring/custom-ring'].dependencies).toContain('capture-source/odd');
    expect(byId['directional/custom-ring'].dependencies).toContain('capture-source/odd');
    expect(byId['directional/custom-ring'].dependencies).toContain('texture/odd');
    expect(byId['field/30x20'].dependencies).toContain('configuration/mixed');
    expect(result.patchLeaves).toBe(400);
    expect(result.sourceCounts).toEqual({ even: 200, odd: 200 });
    expect(Object.keys(result.comparison.textures)).toEqual(['even', 'odd']);
    expect(result.comparison.bake).toBeNull();
    expect(result.comparison.sparseBake).toBeNull();
    for (const [id, metadata] of Object.entries(result.comparison.textures)) {
        expect(metadata).toMatchObject({
            resolution: 256, sourceLeaves: 200, sourceStride: 2, sourceOffset: id === 'even' ? 0 : 1, sourceLod: 'LOD3 · 10'
        });
    }
    expect(result.topHashes.even).not.toBe(result.topHashes.odd);
    for (const join of result.joins) {
        expect(join.wallMapsMatch).toBe(true);
        for (const channel of join.channels) expect(channel.actual, join.fieldId + '/' + channel.view + '/' + channel.channel).toBe(channel.expected);
    }
    expect(result.joins[0].hashes).not.toEqual(result.joins[1].hashes);
    expect(result.topMaps.find(tile => tile.id === 'test')).toMatchObject({ even: true, odd: false });
    for (const id of ['test-more', 'mixed', 'custom-ring'])
        expect(result.topMaps.find(tile => tile.id === id)).toMatchObject({ even: false, odd: true });
    expect(result.details.source).toMatchObject({ leafTriangles: 8000, floorTriangles: 0, triangles: 8000 });
    for (const id of ['test', 'test-more']) {
        expect(result.details[id]).toMatchObject({ textureLeaves: 200, leafTriangles: 0, floorTriangles: 2, wallTriangles: 8, silhouetteTriangles: 8, triangles: 18 });
    }
    expect(result.details.mixed).toMatchObject({ textureLeaves: 200, leavesByLod: { 'LOD3 · 10': 100 }, triangles: 2002 });
    expect(result.details['custom-ring']).toMatchObject({ textureLeaves: 200, triangles: 26 });
    expect(result.comparison.totalTriangles).toBe(10064);
    expect(result.field).toMatchObject({
        sourceConfigurationId: 'mixed', widthMeters: 5, depthMeters: 5, tiles: 25,
        textureLeavesPerSquare: 200, leavesPerSquare: 100, leaves: 2500, leafTriangles: 50000, floorTriangles: 50
    });
    expect(result.ring.wallBake.sourceLeaves).toBe(200);
    expect(result.ring.bakes[0].sourceLeaves).toBe(200);
    expect(result.directional.sourceLeaves).toBe(200);
    expect(result.directionalTopIsOdd).toBe(true);
    expect(result.directional.totalViewCount).toBe(3);
    expect(result.directional.captures.every(capture => capture.resolution === 256)).toBe(true);
    for (const side of result.ringCounts) {
        expect(side.eligibleLeaves).toBeGreaterThan(0);
        expect(side.sourceLeaves).toBe(Math.round(side.eligibleLeaves * 0.4));
    }
    expect(result.disposed).toBe(true);
    expect(result.defaultPipelineIntact).toBe(true);
});
