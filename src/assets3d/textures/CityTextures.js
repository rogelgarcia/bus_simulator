// src/assets3d/textures/CityTextures.js
import * as THREE from 'three';

let _cached = null;

function makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return { c, ctx };
}

function rand(seedObj) {
    seedObj.v = (seedObj.v * 1664525 + 1013904223) >>> 0;
    return seedObj.v / 4294967295;
}

function clamp255(v) {
    return Math.max(0, Math.min(255, v));
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if ('colorSpace' in tex) tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function canvasToTexture(canvas, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 16;
    applyTextureColorSpace(tex, { srgb });
    tex.needsUpdate = true;
    return tex;
}

function generateGrass({ size = 512, repeat = 200 } = {}) {
    const seedObj = { v: 13371337 };
    const { c, ctx } = makeCanvas(size);

    // Base fill
    ctx.fillStyle = '#2f6f33';
    ctx.fillRect(0, 0, size, size);

    // Pixel noise (tile-friendly)
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        const n1 = rand(seedObj);
        const n2 = rand(seedObj);

        // slightly yellow/blue variation
        const baseG = 105 + n1 * 70;
        const baseR = 35 + n2 * 35;
        const baseB = 30 + (rand(seedObj)) * 25;

        d[i + 0] = clamp255(baseR);
        d[i + 1] = clamp255(baseG);
        d[i + 2] = clamp255(baseB);
        d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Soft patches (darker + lighter)
    for (let i = 0; i < 60; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const rx = 18 + rand(seedObj) * 70;
        const ry = 18 + rand(seedObj) * 70;
        const alpha = 0.04 + rand(seedObj) * 0.05;
        const dark = rand(seedObj) < 0.6;

        ctx.fillStyle = dark
            ? `rgba(10,20,10,${alpha})`
            : `rgba(255,255,255,${alpha * 0.6})`;

        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rand(seedObj) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    // Tiny specks (flowers-ish noise without being flowers yet)
    for (let i = 0; i < 1800; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const r = 0.3 + rand(seedObj) * 0.9;
        const a = 0.05 + rand(seedObj) * 0.10;
        const bright = 160 + rand(seedObj) * 80;
        ctx.fillStyle = `rgba(${bright * 0.6},${bright},${bright * 0.6},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Roughness (mostly rough, slight variation)
    const { c: rC, ctx: rCtx } = makeCanvas(size);
    const rImg = rCtx.getImageData(0, 0, size, size);
    const rd = rImg.data;
    const seedObj2 = { v: 42424242 };

    for (let i = 0; i < rd.length; i += 4) {
        const v = clamp255(220 + (rand(seedObj2) - 0.5) * 30);
        rd[i] = v; rd[i + 1] = v; rd[i + 2] = v; rd[i + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    const map = canvasToTexture(c, { repeatX: repeat, repeatY: repeat, srgb: true });
    const roughnessMap = canvasToTexture(rC, { repeatX: repeat, repeatY: repeat, srgb: false });

    return { map, roughnessMap };
}

export function getCityTextures() {
    if (_cached) return _cached;

    const grass = generateGrass({ size: 512, repeat: 200 });
    _cached = { grass };
    return _cached;
}
// src/city/materials/CityTextures.js
