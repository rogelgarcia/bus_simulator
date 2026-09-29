// Validate view-dependent visibility rather than trying to tint an overhead photograph.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
for (const { id, views, resolution } of [{ id: 'rings4k', views: 1, resolution: 1024 }])
test('Directional canopy ' + views + ' views at ' + resolution + ' preserves shading and blends continuously', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/single_view_canopy', id);
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async ({ id, views }) => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison;
        const item = c.configurations[id], d = item.directional, topBake = item.bake;
        s.setMode('refined'); s.setSquareBounds(false);
        const tile = c.tiles.find(mesh => mesh.name === 'GrassV2Floor-' + id);
        const coverage = bake => {
            const pixels = bake.readPixels('normal');
            let total = 0;
            for (let i = 3; i < pixels.length; i += 4) total += pixels[i] / 255;
            return total / (pixels.length / 4);
        };
        const seams = d.bakes.map(bake => {
            const size = bake.getSnapshot().resolution;
            return ['albedo', 'normal', 'roughness', 'visibility'].map(channel => {
                const data = bake.readPixels(channel);
                let edge = 0, interior = 0;
                for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) {
                    edge += Math.abs(data[(i * size) * 4 + c] - data[(i * size + size - 1) * 4 + c]);
                    edge += Math.abs(data[i * 4 + c] - data[((size - 1) * size + i) * 4 + c]);
                    for (const k of [size / 4, size / 2, size * 3 / 4]) {
                        interior += Math.abs(data[(i * size + k) * 4 + c] - data[(i * size + k - 1) * 4 + c]);
                        interior += Math.abs(data[(k * size + i) * 4 + c] - data[((k - 1) * size + i) * 4 + c]);
                    }
                }
                return { channel, edge: edge / (size * 6), interior: interior / (size * 18) };
            });
        });
        const shadowStats = d.bakes.map(bake => {
            const data = bake.readPixels('visibility');
            let lit = 0, shadowed = 0;
            for (let i = 0; i < data.length; i += 4) { if (data[i] > 200) lit++; if (data[i] < 50) shadowed++; }
            return { lit, shadowed };
        });
        const poses = [], sunAzimuth = d.getSnapshot().sunAzimuthDegrees;
        const channels = [['albedo', 'Albedo'], ['normal', 'Normal'], ['roughness', 'Roughness'], ['visibility', 'Visibility']];
        const previousAfterRender = tile.onAfterRender, gl = s.renderer.getContext();
        const gpuPrograms = [];
        let gpuBindings = null, gpuWeights = null, gpuProgramId = null;
        tile.onAfterRender = function (...args) {
            previousAfterRender.apply(this, args);
            if (args[4] !== d.material) return;
            const program = gl.getParameter(gl.CURRENT_PROGRAM), activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
            const indices = d.getSnapshot().state.indices;
            gpuWeights = Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'grassViewWeights')));
            if (!gpuPrograms.includes(program)) gpuPrograms.push(program);
            gpuProgramId = gpuPrograms.indexOf(program);
            gpuBindings = [];
            try {
                for (const [slot, index] of [['A', indices[0]], ['B', indices[1]]]) {
                    for (const [channel, name] of channels) {
                        const uniform = 'grassView' + name + slot, location = gl.getUniformLocation(program, uniform);
                        const unit = location ? gl.getUniform(program, location) : null;
                        const expected = s.renderer.properties.get(d.bakes[index].textures[channel]).__webglTexture;
                        if (unit !== null) gl.activeTexture(gl.TEXTURE0 + unit);
                        gpuBindings.push({ uniform, index, unit, allocated: !!expected,
                            matches: unit !== null && gl.getParameter(gl.TEXTURE_BINDING_2D) === expected });
                    }
                }
            } finally { gl.activeTexture(activeTexture); }
        };
        const headings = [0, 359.99, 0.01].map(azimuth => ({ azimuth, label: 'world-' + azimuth }));
        for (let capture = 0; capture < (views === 1 ? 8 : views); capture++) {
            for (const [label, offset] of [['before', -0.001], ['exact', 0], ['after', 0.001], ['midpoint', 180 / (views === 1 ? 8 : views)]]) {
                headings.push({ azimuth: (sunAzimuth + capture * (360 / (views === 1 ? 8 : views)) + offset + 360) % 360, label: capture + '-' + label });
            }
        }
        try {
            for (const elevation of [30, 57.5, 85]) for (const heading of headings) {
                const { azimuth, label } = heading;
                const pitch = THREE.MathUtils.degToRad(elevation), angle = THREE.MathUtils.degToRad(azimuth);
                s.controls.target.copy(tile.position);
                s.camera.position.copy(tile.position).add(new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch)).multiplyScalar(10));
                gpuBindings = null; gpuWeights = null; gpuProgramId = null;
                s.controls.update(); s.lighting.render(0);
                const properties = s.renderer.properties.get(d.material), uniforms = properties.uniforms;
                const bindings = Object.fromEntries(['A', 'B'].map(suffix => [suffix,
                    Object.fromEntries(channels.map(([channel, name]) => [channel,
                        d.bakes.findIndex(bake => bake.textures[channel] === uniforms['grassView' + name + suffix].value)]))]));
                poses.push({ elevation, azimuth, label, state: d.getSnapshot().state, bindings, gpuBindings, gpuWeights, gpuProgramId, materialVersion: d.material.version,
                    boundWeights: uniforms.grassViewWeights.value.toArray(), programId: properties.currentProgram.id,
                    topMapUnchanged: uniforms.map.value === topBake.textures.albedo,
                    samplerCount: Object.keys(uniforms).filter(key => /^grassView(Albedo|Normal|Roughness|Visibility)[AB]$/.test(key)).length });
            }
        } finally { tile.onAfterRender = previousAfterRender; }
        return { snapshot: d.getSnapshot(), topCoverage: coverage(topBake), coverages: d.bakes.map(coverage), shadowStats, seams, poses,
            details: c.getPatchDetails(id), maxTextures: s.renderer.capabilities.maxTextures };
    }, { id, views });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect(errors).toEqual([]);
    expect(result.snapshot.viewCount).toBe(views);
    expect(result.snapshot.topResolution).toBe(resolution);
    expect(result.details.captures).toEqual({ obliqueViews: views, obliqueResolution: resolution, topResolution: resolution });
    expect(result.snapshot.totalViewCount).toBe(views + 1);
    expect(result.snapshot.captures).toHaveLength(views);
    const sunDirection = result.snapshot.shadowDirection;
    const sunAzimuth = (Math.atan2(sunDirection[0], sunDirection[2]) * 180 / Math.PI + 360) % 360;
    expect(result.snapshot.sunAzimuthDegrees).toBeCloseTo(sunAzimuth, 8);
    expect(result.details.triangles).toBe(26);
    for (const [i, capture] of result.snapshot.captures.entries()) {
        expect(capture.azimuthDegrees).toBeCloseTo((sunAzimuth + i * (360 / views)) % 360, 8); expect(capture.elevationDegrees).toBe(30);
        expect(capture.resolution).toBe(resolution);
        expect(capture.sourceView).toBe('oblique'); expect(capture.shadowsBaked).toBe(true);
        expect(result.shadowStats[i].lit).toBeGreaterThan(1000); expect(result.shadowStats[i].shadowed).toBeGreaterThan(1000);
        expect(capture.planeHeight).toBeCloseTo(result.snapshot.planeHeight, 9);
        expect(capture.periodic.paddingMeters).toBeGreaterThan(0.15);
        expect(result.coverages[i]).toBeGreaterThan(result.topCoverage + 0.12);
        expect(result.coverages[i]).toBeGreaterThan(0.85);
        for (const seam of result.seams[i]) expect(seam.edge, i + ': ' + seam.channel + ' seam').toBeLessThan(seam.interior * 1.5 + 0.5);
    }
    const captureWeights = state => {
        const weights = Array(views).fill(0);
        weights[state.indices[0]] += state.weights[1];
        weights[state.indices[1]] += state.weights[2];
        return weights;
    };
    const circularDistance = (left, right) => Math.abs(((left - right + 540) % 360) - 180);
    expect(result.poses).toHaveLength(3 * (3 + 4 * (views === 1 ? 8 : views)));
    for (const pose of result.poses) {
        const { weights, indices } = pose.state;
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        expect(pose.state.elevationDegrees).toBeCloseTo(pose.elevation, 6);
        expect(circularDistance(pose.state.azimuthDegrees, pose.azimuth)).toBeLessThan(0.00001);
        expect(weights[0]).toBeCloseTo(pose.elevation === 30 ? 0 : pose.elevation === 85 ? 1 : 0.5, 6);
        expect(indices).toHaveLength(2);
        expect(indices[0]).toBeGreaterThanOrEqual(0); expect(indices[0]).toBeLessThan(views);
        expect(indices[1]).toBe((indices[0] + 1) % views);
        const actual = captureWeights(pose.state);
        for (let capture = 0; capture < views; capture++) {
            const angularWeight = views === 1 ? 1 : Math.max(0, 1 - circularDistance(pose.azimuth, sunAzimuth + capture * (360 / views)) / (360 / views));
            expect(actual[capture], pose.label + ': capture ' + capture).toBeCloseTo((1 - weights[0]) * angularWeight, 7);
        }
        if (views > 1 && pose.label.endsWith('-midpoint')) {
            expect(weights[1]).toBeCloseTo((1 - weights[0]) / 2, 8);
            expect(weights[2]).toBeCloseTo((1 - weights[0]) / 2, 8);
        }
        for (const [slot, index] of [['A', indices[0]], ['B', indices[1]]])
            for (const [channel, boundIndex] of Object.entries(pose.bindings[slot]))
                expect(boundIndex, pose.label + ': ' + channel + slot).toBe(index);
        expect(pose.gpuBindings).toHaveLength(8);
        for (const binding of pose.gpuBindings) {
            expect(binding.allocated, pose.label + ': ' + binding.uniform + ' texture allocated').toBe(true);
            expect(binding.unit, pose.label + ': ' + binding.uniform + ' unit').not.toBeNull();
            expect(binding.matches, pose.label + ': ' + binding.uniform + ' actual GPU binding').toBe(true);
        }
        expect(pose.boundWeights).toEqual(weights);
        expect(pose.gpuWeights).toHaveLength(3);
        pose.gpuWeights.forEach((value, index) => expect(value).toBeCloseTo(weights[index], 6));
        expect(pose.topMapUnchanged).toBe(true);
        expect(pose.samplerCount).toBe(8);
    }
    expect(new Set(result.poses.map(pose => pose.programId)).size).toBe(1);
    expect(new Set(result.poses.map(pose => pose.gpuProgramId)).size).toBe(1);
    expect(new Set(result.poses.map(pose => pose.materialVersion)).size).toBe(1);
    for (const elevation of [30, 57.5, 85]) {
        const at = label => captureWeights(result.poses.find(pose => pose.elevation === elevation && pose.label === label).state);
        const before = at('world-359.99'), after = at('world-0.01');
        before.forEach((value, index) => expect(Math.abs(value - after[index])).toBeLessThan(0.002));
        for (let boundary = 0; boundary < (views === 1 ? 8 : views); boundary++) {
            const lower = at(boundary + '-before'), upper = at(boundary + '-after');
            lower.forEach((value, index) => expect(Math.abs(value - upper[index]), 'boundary ' + boundary).toBeLessThan(0.0002));
        }
    }
    await page.addStyleTag({ content: '.plant-study-panel, .grass-comparison-label, .grass-patch-distance { display:none!important; }' });
    for (const [name, pose] of [['front', 'three_quarter'], ['rear', 'ten_meters_rear'], ['top', 'elevated']]) {
        await page.evaluate(pose => {
            const s = window.__plantCardsStudy; s.setPose(pose);
            s.camera.position.sub(s.controls.target).normalize().multiplyScalar(10).add(s.controls.target);
            s.controls.update(); s.lighting.render(0);
        }, pose);
        await page.screenshot({ path: path.join(folder, name + '-10m.png') });
    }
    for (const elevation of [30, 85]) for (const id of ['source', 'rings4k']) {
        await page.evaluate(async ({ elevation, id }) => {
            const THREE = await import('three'), s = window.__plantCardsStudy;
            const field = s.comparison.getSnapshot().fields.find(field => field.id === id);
            const angle = Math.PI / 4, pitch = THREE.MathUtils.degToRad(elevation);
            s.controls.target.set(field.x, s.comparison.ringPatch.baseHeight, field.z);
            s.camera.up.set(0, 1, 0);
            s.camera.position.copy(s.controls.target).add(new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch)).multiplyScalar(2));
            s.controls.update(); s.lighting.render(0);
        }, { elevation, id });
        await page.screenshot({ path: path.join(folder, id + '-' + elevation + 'deg.png') });
    }
    expect(errors).toEqual([]);
});
