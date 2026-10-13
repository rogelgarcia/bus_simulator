// Project the omitted LOD3 triangles into eight padded, premultiplied ground maps offline.
import * as THREE from 'three';
import { grassLeafFillBakeShader } from '../../../../src/graphics/shaders/materials/grass/GrassLeafFillBakeShaderLoader.js';

function leaves(geometry) {
    const { position, uv } = geometry.attributes, index = geometry.index, count = geometry.userData.grassLeafCount;
    if (index.count !== count * 6) throw new Error('Leaf-fill bake requires the authenticated two-triangle blade layout.');
    return Array.from({ length: count }, (_, i) => {
        const ids = Array.from({ length: 6 }, (_, j) => index.getX(i * 6 + j));
        const tip = ids.reduce((a, b) => uv.getY(b) > uv.getY(a) ? b : a);
        return { ids, key: [position.getX(tip), position.getY(tip), position.getZ(tip)].map(v => v.toFixed(5)).join(':') };
    });
}

/** @param {object} asset @param {THREE.WebGLRenderer} renderer */
export function captureGrassLeafFill(asset, renderer) {
    const positions = [], colors = [], missing = [], counts = [];
    const colorGain = asset.manifest.leafColor.map((v, i) => v / asset.manifest.canopyColor[i]);
    for (let q = 0; q < 4; q++) {
        const source = asset.lod3.templates[q], reference = leaves(source), retained = leaves(asset.bridge.templates[q]);
        const keys = new Set(retained.map(leaf => leaf.key));
        if (retained.some(leaf => !reference.some(item => item.key === leaf.key))) throw new Error('LOD4 is not a subset of LOD3 tips.');
        const { position, color } = source.attributes; let omitted = 0;
        for (const leaf of reference) {
            const fill = Number(!keys.has(leaf.key)); omitted += fill;
            for (const id of leaf.ids) {
                positions.push(position.getX(id) + (q % 2 ? .5 : -.5), position.getY(id), position.getZ(id) + (q >= 2 ? .5 : -.5));
                colors.push(color.getX(id) * colorGain[0], color.getY(id) * colorGain[1], color.getZ(id) * colorGain[2]); missing.push(fill);
            }
        }
        counts.push({ lod3: reference.length, lod4: retained.length, omitted });
    }
    const size = 512, views = 8, elevation = 20, slope = 1 / Math.tan(elevation * Math.PI / 180);
    let extent = 1;
    for (let i = 0; i < positions.length; i += 3) extent = Math.max(extent, Math.abs(positions[i]) + positions[i + 1] * slope, Math.abs(positions[i + 2]) + positions[i + 1] * slope);
    extent = Math.ceil((extent + 2 / size) * 16) / 16;
    if (extent >= 2) throw new Error('Leaf projection exceeds the four-neighbor runtime footprint.');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('missingLeaf', new THREE.Float32BufferAttribute(missing, 1));
    const material = new THREE.ShaderMaterial({ vertexShader: grassLeafFillBakeShader.vertexSource, fragmentShader: grassLeafFillBakeShader.fragmentSource,
        vertexColors: true, side: THREE.DoubleSide, blending: THREE.NoBlending, toneMapped: false, uniforms: { cameraSlope: { value: new THREE.Vector2() } } });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, .1, 20);
    camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
    const target = new THREE.WebGLRenderTarget(size * 2, size * 2, { samples: 4, depthBuffer: true });
    const pixels = new Uint8Array(size * size * 16), binary = new Uint8Array(size * size * 4 * views), coverage = [], previews = [];
    const previousTarget = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    try {
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0);
        for (let view = 0; view < views; view++) {
            const angle = view * Math.PI * 2 / views;
            material.uniforms.cameraSlope.value.set(Math.cos(angle) * slope, Math.sin(angle) * slope);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, size * 2, size * 2, pixels);
            const layer = binary.subarray(view * size * size * 4, (view + 1) * size * size * 4); let occupied = 0;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let c = 0; c < 4; c++) {
                const i = (y * size + x) * 4 + c, j = (y * 2 * size * 2 + x * 2) * 4 + c;
                layer[i] = Math.round((pixels[j] + pixels[j + 4] + pixels[j + size * 8] + pixels[j + size * 8 + 4]) / 4);
                if (c === 3 && layer[i] > 0) occupied++;
            }
            coverage.push(occupied / (size * size));
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const from = (y * size + x) * 4, to = ((size - 1 - y) * size + x) * 4, a = layer[from + 3] / 255;
                for (let c = 0; c < 3; c++) image.data[to + c] = a ? Math.round(255 * Math.pow(layer[from + c] / 255 / a, 1 / 2.2)) : 0;
                image.data[to + 3] = layer[from + 3];
            }
            ctx.putImageData(image, 0, 0); previews.push(canvas.toDataURL('image/png').split(',')[1]);
        }
    } finally { renderer.setRenderTarget(previousTarget); renderer.setClearColor(clear, alpha); target.dispose(); geometry.dispose(); material.dispose(); }
    return { binary, previews, manifest: { schema: 'bus-simulator.grass-leaf-fill', version: 1, size, views, elevation, extent, tileSize: 2,
        sourceHash: asset.manifest.sha256, counts, coverage, encoding: 'linear-premultiplied-rgba8', coordinateSystem: 'tile-local-x-negative-z' } };
}
