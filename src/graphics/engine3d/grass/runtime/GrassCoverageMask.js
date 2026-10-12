// Rasterize the city's authored hardscape footprints once for every grass representation.
// @ts-check
import * as THREE from 'three';

/** @param {{size:number,roadPolygons:object[][],roadMargin:number,buildingFootprints:object[][][],slabFootprints?:object[][]}} options */
export function createGrassCoverageMask({ size, roadPolygons, roadMargin, buildingFootprints, slabFootprints = [] }) {
    if (!(size > 0) || !Number.isFinite(size)) throw new Error('[Grass] Invalid city ground size.');
    const resolution = Math.min(4096, 2 ** Math.ceil(Math.log2(size * 8))), scale = resolution / size;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = resolution;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, resolution, resolution);
    context.fillStyle = context.strokeStyle = '#000000'; context.lineJoin = 'round';
    const draw = (loops, margin) => {
        context.beginPath();
        for (const loop of loops) {
            loop.forEach((p, i) => context[i ? 'lineTo' : 'moveTo']((p.x + size / 2) * scale, (p.z + size / 2) * scale)); context.closePath();
        }
        context.fill('evenodd'); context.lineWidth = 2 * (margin + size / resolution) * scale; context.stroke();
    };
    roadPolygons.forEach(loop => draw([loop], roadMargin));
    buildingFootprints.forEach(loops => draw(loops, .1));
    slabFootprints.forEach(loop => draw([loop], 0));
    const rgba = context.getImageData(0, 0, resolution, resolution).data, pixels = new Uint8Array(resolution * resolution);
    for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4] >= 254 ? 255 : 0;
    const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RedFormat);
    texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
    const sample = (x, z) => {
        const u = Math.floor((x + size / 2) * scale), v = Math.floor((z + size / 2) * scale);
        return u >= 0 && v >= 0 && u < resolution && v < resolution && pixels[v * resolution + u] !== 0;
    };
    return Object.freeze({ texture, size, resolution, sample,
        intersectsCell: (x, z) => sample(x, z) || sample(x - .49, z - .49) || sample(x + .49, z - .49) || sample(x - .49, z + .49) || sample(x + .49, z + .49),
        dispose: () => texture.dispose() });
}
