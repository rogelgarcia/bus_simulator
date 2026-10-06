// Reproduce foreground holes, repeated wide-card rows, and the actual card blend path.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { measureGrassCardCoverage } from '../grass_view_cards_metrics.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/card_continuity');
const revision = process.env.GRASS_CARD_TRIAL || 'final';
test.use({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('Cards retain near coverage and stable blends from the bus and steep views', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true }); const errors = [], rows = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?revision=card-continuity&lod3=cards#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    await page.evaluate(() => { const s = window.__grassTransitionScene; s.setAnimating(false); s.setHelpers(false); });
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility:hidden !important; }' });
    for (const pose of ['front', 'rear', 'close', 'down', 'low']) {
        await page.evaluate(async pose => {
            const s = window.__grassTransitionScene, THREE = await import('three');
            if (pose === 'front' || pose === 'rear') s.setPose(pose);
            else {
                s.camera.position.set(-16.3, pose === 'low' ? .65 : s.getSnapshot().cameraHeight, 20.4);
                s.camera.quaternion.setFromEuler(new THREE.Euler(-(pose === 'down' ? 85 : 40) * Math.PI / 180, 0, 0, 'YXZ'));
                s.camera.updateMatrixWorld(true);
            }
        }, pose);
        for (const mode of ['blend', ...(pose === 'low' || pose === 'down' ? ['lod0', 'lod1'] : []), 'lod2', 'lod3', 'lod4']) {
            const state = await page.evaluate(async mode => {
                const s = window.__grassTransitionScene;
                if (mode === 'blend') s.updateSelection(true);
                else s.fields.applyLevels(new Uint8Array(s.fields.cells.length).fill(Number(mode.slice(-1))));
                await s.renderer.compileAsync(s.scene, s.camera);
                for (let i=0;i<3;i++) { s.lighting.render(0); await new Promise(requestAnimationFrame); }
                const q=s.getSnapshot(); return {position:q.position, cameraHeight:q.cameraHeight, glError:q.glError, fields:q.fields, selection:q.selection};
            }, mode);
            const png = await page.screenshot({ path: path.join(output, `${revision}_${pose}_${mode}.png`) });
            const coverage = await page.evaluate(measureGrassCardCoverage, {png:png.toString('base64'),
                ranges:[[0,.3],[.3,.6],[.6,.8],[.8,1],[1,2],[2,4],[4,8],[8,12],[12,16],[16,24],[24,32]]});
            rows.push({pose,mode,state,coverage}); expect(state.glError).toBe(0);
        }
    }
    await writeFile(path.join(output, `${revision}.json`), JSON.stringify({rows,errors},null,2));
    expect(errors).toEqual([]);
    // Sub-metre bands must not reveal a bare camera-centred hole, even when seen from above.
    for (const pose of ['low','down']) {
        const reference = rows.find(r=>r.pose===pose&&r.mode==='lod2').coverage;
        for (const band of rows.find(r=>r.pose===pose&&r.mode==='blend').coverage.filter(b=>b.far<=2)) {
            const other=reference.find(b=>b.near===band.near);
            expect(band.coverage, pose+' '+band.near+' m foreground coverage').toBeGreaterThan(other.coverage*.65);
        }
    }
});
