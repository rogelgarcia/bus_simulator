// Screen-space proxies, evaluated in the page, excluding paths, field edges and sky.
// Green classification is intentionally fixed across LODs; this is not a semantic ID mask.
export async function measureGrassCardCoverage(input) {
    const png = typeof input === 'string' ? input : input.png;
    const ranges = typeof input === 'string' ? [[6, 10], [10, 14], [14, 18], [18, 24]] : input.ranges;
    const scene = window.__grassTransitionScene;
    // Measure the browser-composited capture, not an unpremultiplied WebGL canvas
    // readback: alpha-to-coverage pixels otherwise report artificially bright RGB.
    const source = new Image(); source.src = 'data:image/png;base64,' + png; await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const camera = scene.camera, matrix = camera.matrixWorld.elements, tangent = Math.tan(camera.fov * Math.PI / 360);
    const bands = ranges.map(([near, far]) => ({ near, far, samples: 0, green: 0, rgb: [0, 0, 0], blocks: new Map() }));
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
        const vx = (2 * (x + .5) / canvas.width - 1) * tangent * camera.aspect, vy = (1 - 2 * (y + .5) / canvas.height) * tangent;
        const dx = matrix[0] * vx + matrix[4] * vy - matrix[8], dy = matrix[1] * vx + matrix[5] * vy - matrix[9];
        const dz = matrix[2] * vx + matrix[6] * vy - matrix[10], length = (.07 - camera.position.y) / dy;
        if (!(length > 0)) continue;
        const wx = camera.position.x + dx * length, wz = camera.position.z + dz * length, distance = Math.hypot(dx, dz) * length;
        const band = bands.find(band => distance >= band.near && distance < band.far);
        if (!band || !scene.fields.bounds.some(b => wx > b.minX + .3 && wx < b.maxX - .3 && wz > b.minZ + .3 && wz < b.maxZ - .3)) continue;
        const offset = (y * canvas.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        const green = g > r + 3 && g > b + 8;
        band.samples++; band.green += Number(green);
        if (green) { band.rgb[0] += r; band.rgb[1] += g; band.rgb[2] += b; }
        const key = Math.floor(y / 32) * Math.ceil(canvas.width / 32) + Math.floor(x / 32);
        let block = band.blocks.get(key);
        if (!block) { block = [0, 0]; band.blocks.set(key, block); }
        block[0]++; block[1] += Number(green);
    }
    return bands.filter(band => band.samples > 100).map(band => {
        const coverage = band.green / band.samples, blocks = [...band.blocks.values()].filter(b => b[0] >= 128).map(b => b[1] / b[0]);
        return { near: band.near, far: band.far, samples: band.samples, coverage, leafRgb: band.rgb.map(v => v / band.green),
            coverageDeviation: Math.sqrt(blocks.reduce((sum, v) => sum + (v - coverage) ** 2, 0) / blocks.length),
            lowCoverageBlockFraction: blocks.filter(v => v < coverage * .7).length / blocks.length };
    });
}
