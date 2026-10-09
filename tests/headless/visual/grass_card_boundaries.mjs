// Orthographic top-down masks distinguish true field spill from perspective/parallax.
export async function captureGrassCardBoundaries(page, output) {
    const results = [];
    for (const mode of ['LOD3', 'LOD4']) for (const corner of [0, 1, 2, 3]) {
        const result = await page.evaluate(async ({ mode, corner }) => {
            const THREE = await import('three'), view = window.__grassCoverageView;
            const fields = view.grass.getSnapshot().placements, field = fields[0];
            const x = corner & 1 ? field.maxX : field.minX, z = corner & 2 ? field.maxZ : field.minZ;
            const target = new THREE.WebGLRenderTarget(512, 512);
            const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
            camera.position.set(x, 10, z); camera.up.set(0, 0, -1); camera.lookAt(x, 0, z); camera.updateMatrixWorld(true);
            view.grass.setMode(mode); window.__grassCoverageMask(true);
            await view.renderer.compileAsync(view.scene, camera);
            const previous = view.renderer.getRenderTarget(); view.renderer.setRenderTarget(target); view.renderer.render(view.scene, camera);
            const pixels = new Uint8Array(512 * 512 * 4); view.renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels);
            view.renderer.setRenderTarget(previous); target.dispose(); window.__grassCoverageMask(false);
            let outsidePixels = 0, leafPixels = 0;
            const point = new THREE.Vector3();
            for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
                if (pixels[(py * 512 + px) * 4] < 16) continue;
                leafPixels++;
                point.set((px + .5) / 256 - 1, (py + .5) / 256 - 1, 0).unproject(camera);
                if (!fields.some(p => point.x >= p.minX - .01 && point.x <= p.maxX + .01 && point.z >= p.minZ - .01 && point.z <= p.maxZ + .01)) outsidePixels++;
            }
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
            const context = canvas.getContext('2d'), image = context.createImageData(512, 512);
            for (let y = 0; y < 512; y++) image.data.set(pixels.subarray(y * 2048, (y + 1) * 2048), (511 - y) * 2048);
            context.putImageData(image, 0, 0);
            return { mode, corner, outsidePixels, leafPixels, png: canvas.toDataURL('image/png').split(',')[1] };
        }, { mode, corner });
        const { writeFile } = await import('node:fs/promises');
        await writeFile(`${output}/boundary-${mode}-${corner}.png`, Buffer.from(result.png, 'base64'));
        delete result.png; results.push(result);
    }
    return results;
}
