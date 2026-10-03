// Compare the experimental cards from outside the field, where the actual border silhouette is visible.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod4_variants/border_fidelity');
const poses = [
    { name: 'outside_edge', position: [0, .4, 7], target: [0, .1, 5.8] },
    { name: 'outside_corner', position: [7, .5, 7], target: [5.8, .1, 5.8] },
    { name: 'grazing_edge', position: [4, .23, 7], target: [3, .12, 5.8] }
];
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

test('LOD4 border cards retain source ownership and expose their silhouette tradeoff at edges and corners', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [], captures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod4-paired-border-fidelity-1&lod=LOD4&fields=1&canopyBorder=leaves#03_rear');
    await page.waitForFunction(() => !!window.__grassLitterReadiness); await page.evaluate(() => window.__grassLitterReadiness);
    await page.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
    const ownership = await page.evaluate(() => {
        const s = window.__grassLitterScene, c = s.canopy.getSnapshot();
        const root = s.scene.getObjectByName('GrassFieldTile_1'), edges = root.getObjectByName('GrassField-LOD4-Edges');
        const cardGroup = root.getObjectByName('GrassField-LOD4-CardEdges');
        const fallback = cardGroup.getObjectByName('GrassField-LOD4-CardEdgeRemainder'), cards = cardGroup.getObjectByName('GrassField-LOD4-BorderCards');
        const ids = s.canopy.edgeIds;
        return { edgeLeaves: ids.length, uniqueEdgeLeaves: new Set(ids).size,
            geometricLeafIndices: edges.geometry.index.count, fallbackTriangles: fallback.geometry.index.count / 3,
            cardTriangles: cards.geometry.index.count / 3, groupLeaves: cards.userData.grassLeafCount + fallback.userData.grassLeafCount,
            snapshot: c.borderCards, cardsCastShadows: cards.castShadow, cardsReceiveShadows: cards.receiveShadow };
    });
    expect(ownership.uniqueEdgeLeaves).toBe(ownership.edgeLeaves);
    expect(ownership.geometricLeafIndices).toBe(ownership.edgeLeaves * 6);
    expect(ownership.groupLeaves).toBe(ownership.edgeLeaves);
    expect(ownership.snapshot.cardLeaves + ownership.snapshot.liveLeaves).toBe(ownership.edgeLeaves);
    expect(ownership.cardTriangles).toBe(ownership.snapshot.cards * 4);
    expect(ownership.fallbackTriangles).toBe(ownership.snapshot.liveLeaves * 2);
    expect(ownership.cardsCastShadows).toBe(false); expect(ownership.cardsReceiveShadows).toBe(true);
    for (const pose of poses) {
        await page.evaluate(pose => {
            const s = window.__grassLitterScene;
            s.camera.position.fromArray(pose.position); s.camera.up.set(0, 1, 0); s.camera.lookAt(...pose.target);
            s.camera.fov = 42; s.camera.near = .002; s.camera.updateProjectionMatrix(); s.camera.updateMatrixWorld();
        }, pose);
        for (const [lod, border, name] of [['LOD2', 'leaves', 'LOD2'], ['LOD4', 'leaves', 'LOD4_leaves'], ['LOD4', 'cards', 'LOD4_cards']]) {
            const state = await page.evaluate(async ({ lod, border }) => {
                const s = window.__grassLitterScene; s.setLod(lod); s.setCanopyBorder(border);
                for (let i = 0; i < 3; i++) await new Promise(resolve => requestAnimationFrame(resolve));
                return s.getSnapshot();
            }, { lod, border });
            const file = pose.name + '_' + name + '.png'; await page.screenshot({ path: path.join(output, file) });
            captures.push({ pose: pose.name, lod, border, file, visibleTriangles: state.visibleTriangles, visibleLeaves: state.visibleLeaves });
        }
        const comparison = await page.evaluate(async () => {
            const THREE = await import('three'), s = window.__grassLitterScene, r = s.renderer;
            s.scene.updateMatrixWorld(true);
            const root = s.scene.getObjectByName('GrassFieldTile_1');
            const source = root.getObjectByName('GrassField-LOD4-Edges'), cardSource = root.getObjectByName('GrassField-LOD4-CardEdges');
            const scene = new THREE.Scene(), original = source.clone(false), cards = cardSource.clone(true);
            original.matrix.copy(source.matrixWorld); original.matrixAutoUpdate = false; original.visible = true;
            cards.matrix.copy(cardSource.matrixWorld); cards.matrixAutoUpdate = false; cards.visible = false;
            const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
            original.material = white;
            cards.traverse(mesh => { if (mesh.isMesh) mesh.receiveShadow = false; });
            scene.add(original, cards, new THREE.AmbientLight(0xffffff, 1));
            const target = new THREE.WebGLRenderTarget(1600, 1000, { samples: 4 });
            const previous = { target: r.getRenderTarget(), clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha(),
                viewport: r.getViewport(new THREE.Vector4()), scissor: r.getScissor(new THREE.Vector4()), scissorTest: r.getScissorTest(),
                auto: r.autoClear, shadow: r.shadowMap.enabled };
            const masks = [];
            try {
                r.setClearColor(0, 0); r.setScissorTest(false); r.autoClear = true; r.shadowMap.enabled = false;
                for (const useCards of [false, true]) {
                    original.visible = !useCards; cards.visible = useCards;
                    r.setRenderTarget(target); r.render(scene, s.camera);
                    const pixels = new Uint8Array(1600 * 1000 * 4); r.readRenderTargetPixels(target, 0, 0, 1600, 1000, pixels);
                    masks.push(pixels);
                }
            } finally {
                r.setRenderTarget(previous.target); r.setClearColor(previous.clear, previous.alpha); r.setViewport(previous.viewport);
                r.setScissor(previous.scissor); r.setScissorTest(previous.scissorTest); r.autoClear = previous.auto; r.shadowMap.enabled = previous.shadow;
                target.dispose(); white.dispose();
            }
            let reference = 0, candidate = 0, intersection = 0, union = 0, absolute = 0;
            const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
            const ctx = canvas.getContext('2d'), images = [];
            for (let i = 0; i < masks[0].length; i += 4) {
                const a = masks[0][i + 3] / 255, b = masks[1][i + 3] / 255;
                reference += a; candidate += b; intersection += Math.min(a, b); union += Math.max(a, b); absolute += Math.abs(a - b);
            }
            for (const mask of masks) {
                const image = ctx.createImageData(1600, 1000);
                for (let y = 0; y < 1000; y++) for (let x = 0; x < 1600; x++) {
                    const i = (y * 1600 + x) * 4, j = ((999 - y) * 1600 + x) * 4;
                    image.data[i] = image.data[i + 1] = image.data[i + 2] = mask[j + 3]; image.data[i + 3] = 255;
                }
                ctx.putImageData(image, 0, 0); images.push(canvas.toDataURL('image/png').split(',')[1]);
            }
            return { referenceCoverage: reference, cardCoverage: candidate, coverageRatio: candidate / reference,
                silhouetteIntersectionOverUnion: intersection / union, changedFraction: absolute / (1600 * 1000), images };
        });
        for (const [i, name] of ['original_LOD2_border', 'alpha_card_border'].entries())
            await writeFile(path.join(output, pose.name + '_' + name + '_mask.png'), Buffer.from(comparison.images[i], 'base64'));
        delete comparison.images; captures.push({ pose: pose.name, isolatedBorder: comparison });
        expect(comparison.referenceCoverage).toBeGreaterThan(1000);
        expect(comparison.cardCoverage).toBeGreaterThan(1000);
        expect(comparison.coverageRatio).toBeGreaterThan(.35);
        expect(comparison.coverageRatio).toBeLessThan(2);
    }
    await writeFile(path.join(output, 'border_fidelity.json'), JSON.stringify({ ownership, captures, errors }, null, 2));
    expect(errors).toEqual([]);
});
