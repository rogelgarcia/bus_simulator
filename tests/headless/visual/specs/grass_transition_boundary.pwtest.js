// Compare the geometric join between live grass and the baked canopy without changing shaders.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/boundary');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Canopy boundary geometry stays continuous from multiple bus bearings', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true }); const errors = [], rows = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transition=0&revision=boundary-audit#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setSettings({ movementThreshold: .25, intervalMs: 100 }); s.setAnimating(false); s.setHelpers(false); s.setPanelCollapsed(true); });
    await page.addStyleTag({ content: '#scene-performance { visibility:hidden; }' });
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
        await page.evaluate(async bearing => {
            const s = window.__grassTransitionScene, THREE = await import('three'), angle = bearing * Math.PI / 180;
            s.camera.position.set(-16.5 + 18 * Math.sin(angle), s.getSnapshot().cameraHeight, -16.5 + 18 * Math.cos(angle));
            s.camera.quaternion.setFromEuler(new THREE.Euler(-s.getSnapshot().cameraPitch * Math.PI / 180, angle, 0, 'YXZ'));
            s.camera.updateMatrixWorld(true); s.updateSelection(true);
        }, bearing);
        for (const candidate of ['old', 'updated']) {
            const row = await page.evaluate(async candidate => {
                const s = window.__grassTransitionScene;
                s.fields.setEdgeStrips(candidate === 'updated');
                await s.renderer.compileAsync(s.scene, s.camera);
                const before = s.fields.getSnapshot();
                for (let i = 0; i < 3; i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                const cells = s.fields.cells, size = before.fieldSize, byPosition = new Map(cells.map(c => [c.centerX + ':' + c.centerZ, c.id]));
                const edges = new Map(), matrix = s.camera.matrix.clone();
                const smooth = (range, distance) => { const t = Math.max(0, Math.min(1, distance / range)); return t*t*(3-2*t); };
                s.fields.group.traverse(mesh => {
                    if (!mesh.isInstancedMesh || !mesh.visible || !mesh.userData.grassCanopy) return;
                    const p = mesh.geometry.attributes.position, open = mesh.geometry.attributes.grassTransitionOpenEdges;
                    const uniforms = s.renderer.properties.get(mesh.material).uniforms;
                    for (let i = 0; i < mesh.count; i++) {
                        mesh.getMatrixAt(i, matrix); const cx = matrix.elements[12], cz = matrix.elements[14], sides = [[], [], [], []];
                        for (let v = 0; v < p.count; v++) {
                            const x = p.getX(v), z = p.getZ(v); let y = p.getY(v);
                            if (open) {
                                const b = uniforms.grassTransitionFieldBounds.value, shape = uniforms.grassTransitionCanopyShape.value;
                                const inset = Math.min(cx+x-b.x, cz+z-b.y, b.z-cx-x, b.w-cz-z);
                                const local = [x+.5,.5-x,z+.5,.5-z].map((d,k) => open.array[i*4+k] ? d : 1);
                                y = Math.min(shape.x*smooth(shape.y,inset), .005+(shape.x-.005)*smooth(shape.y,Math.min(...local)));
                            }
                            if (Math.abs(x+.5)<1e-6) sides[0].push([z,y]); if (Math.abs(x-.5)<1e-6) sides[1].push([z,y]);
                            if (Math.abs(z+.5)<1e-6) sides[2].push([x,y]); if (Math.abs(z-.5)<1e-6) sides[3].push([x,y]);
                        }
                        sides.forEach(side => side.sort((a,b)=>a[0]-b[0])); edges.set(byPosition.get(cx+':'+cz), sides);
                    }
                });
                const height = (edge,t) => {
                    for(let i=1;i<edge.length;i++)if(t<=edge[i][0]+1e-6){const [x,a]=edge[i-1],[z,b]=edge[i];return a+(b-a)*(t-x)/(z-x);}
                    throw Error('Incomplete canopy edge');
                };
                let maximumGap=0, crackedEdges=0, sharedEdges=0;
                for(const [id,sides] of edges)for(const [neighbor,side,other] of [[cells[id].x<size-1?id+1:-1,1,0],[cells[id].z<size-1?id+size:-1,3,2]]){
                    if(!edges.has(neighbor))continue; sharedEdges++;
                    const a=sides[side],b=edges.get(neighbor)[other],samples=[...a,...b].map(p=>p[0]);
                    const gap=Math.max(...samples.map(t=>Math.abs(height(a,t)-height(b,t))));
                    maximumGap=Math.max(maximumGap,gap);if(gap>1e-5)crackedEdges++;
                }
                const after=s.fields.getSnapshot();
                return {fields:after,render:{...s.renderer.info.render},glError:s.renderer.getContext().getError(),sharedEdges,crackedEdges,maximumGap,
                    steadyUploads:after.instanceUploads-before.instanceUploads};
            }, candidate);
            rows.push({ bearing, candidate, ...row });
            await page.screenshot({ path: path.join(output, candidate + '_' + bearing + '.png') });
        }
    }
    const motion = await page.evaluate(async () => {
        const s = window.__grassTransitionScene; s.setPose('border');
        const start = s.getSnapshot(), position = s.camera.position.clone(); let clock = performance.now();
        for (let i = 0; i < 120; i++) {
            await new Promise(requestAnimationFrame); clock = Math.max(clock + 1000 / 60, performance.now());
            s.camera.position.set(position.x + .04 * (i + 1), position.y, position.z - .03 * (i + 1)); s.step(1 / 60, clock);
        }
        const end = s.getSnapshot();
        return { frames: 120, scans: end.selection.scans - start.selection.scans,
            selectionCpuMs: end.selection.totalCpuMs - start.selection.totalCpuMs,
            batchCpuMs: end.fields.totalApplyMilliseconds - start.fields.totalApplyMilliseconds,
            shadowGenerations: end.shadows.generations - start.shadows.generations, glError: end.glError };
    });
    await writeFile(path.join(output, 'measurements.json'), JSON.stringify({ rows, motion, errors }, null, 2));
    expect(errors).toEqual([]); expect(rows.every(row => row.glError === 0 && row.steadyUploads === 0)).toBe(true);
    expect(rows.filter(r=>r.candidate==='old').every(r=>r.crackedEdges>0)).toBe(true);
    for(const row of rows.filter(r=>r.candidate==='updated')){expect(row.crackedEdges).toBe(0);expect(row.maximumGap).toBeLessThan(1e-5);}
    expect(motion.scans).toBeLessThan(25); expect(motion.scans).toBeGreaterThan(0);
    expect(motion.shadowGenerations).toBe(0); expect(motion.glError).toBe(0);
});
