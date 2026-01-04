// src/graphics/assets3d/models/environment/ProceduralTextures.js
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
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
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

// Asphalt + wall textures (implementation unchanged from src/environment/ProceduralTextures.js)

function generateAsphalt({ size = 512, repeat = 7 } = {}) {
    const seedObj = { v: 123456789 };
    const { c, ctx } = makeCanvas(size);

    ctx.fillStyle = '#1b222b';
    ctx.fillRect(0, 0, size, size);

    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        const n = rand(seedObj);
        const n2 = rand(seedObj);
        const base = 28 + n * 34;
        const speck = (n2 - 0.5) * 26;
        const v = clamp255(base + speck);

        d[i + 0] = v;
        d[i + 1] = v + 2;
        d[i + 2] = v + 6;
        d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    for (let i = 0; i < 2200; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const r = 0.4 + rand(seedObj) * 1.3;
        const bright = 40 + rand(seedObj) * 70;
        const alpha = 0.08 + rand(seedObj) * 0.12;
        ctx.fillStyle = `rgba(${bright},${bright + 2},${bright + 8},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 14; i++) {
        const x = rand(seedObj) * size;
        const y = rand(seedObj) * size;
        const rx = 30 + rand(seedObj) * 120;
        const ry = 20 + rand(seedObj) * 90;
        const a = 0.035 + rand(seedObj) * 0.04;
        ctx.fillStyle = `rgba(10,12,16,${a})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rand(seedObj) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(10,12,16,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
        let x = rand(seedObj) * size;
        let y = rand(seedObj) * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segs = 10 + Math.floor(rand(seedObj) * 18);
        for (let s = 0; s < segs; s++) {
            x += (rand(seedObj) - 0.5) * 40;
            y += (rand(seedObj) - 0.5) * 40;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    const { c: bumpC, ctx: bumpCtx } = makeCanvas(size);
    bumpCtx.drawImage(c, 0, 0);
    const bImg = bumpCtx.getImageData(0, 0, size, size);
    const bd = bImg.data;
    for (let i = 0; i < bd.length; i += 4) {
        const g = bd[i];
        bd[i] = g; bd[i + 1] = g; bd[i + 2] = g; bd[i + 3] = 255;
    }
    bumpCtx.putImageData(bImg, 0, 0);

    const map = canvasToTexture(c, { repeatX: repeat, repeatY: repeat, srgb: true });
    const bumpMap = canvasToTexture(bumpC, { repeatX: repeat, repeatY: repeat, srgb: false });

    return { map, bumpMap };
}

function generateGarageWall({ size = 512 } = {}) {
    const seedObj = { v: 987654321 };
    const { c, ctx } = makeCanvas(size);

    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0.0, '#3a5274');
    g.addColorStop(0.60, '#2f4666');
    g.addColorStop(1.0, '#263955');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const nSize = 96;
    const { c: nC, ctx: nCtx } = makeCanvas(nSize);
    const nImg = nCtx.getImageData(0, 0, nSize, nSize);
    const nd = nImg.data;
    for (let i = 0; i < nd.length; i += 4) {
        const v = 120 + rand(seedObj) * 40;
        nd[i] = v; nd[i + 1] = v; nd[i + 2] = v; nd[i + 3] = 255;
    }
    nCtx.putImageData(nImg, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(nC, 0, 0, size, size);
    ctx.restore();

    const ridgeStep = 14;
    for (let x = 0; x < size; x += ridgeStep) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 2, 0, 1, size);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(x + 6, 0, 1, size);
    }

    const panelW = 128;
    for (let x = 0; x <= size; x += panelW) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, 0, 3, size);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 3, 0, 1, size);
    }

    for (let x = 0; x <= size; x += panelW) {
        for (let y = 48; y < size; y += 80) {
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            ctx.arc(x + 6, y + 2, 2.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(210,225,245,0.18)';
            ctx.beginPath();
            ctx.arc(x + 5, y, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const grime = ctx.createLinearGradient(0, size * 0.60, 0, size);
    grime.addColorStop(0, 'rgba(0,0,0,0.00)');
    grime.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, size, size);

    const { c: bumpC, ctx: bumpCtx } = makeCanvas(size);
    const bImg2 = bumpCtx.getImageData(0, 0, size, size);
    const bd2 = bImg2.data;

    const freq = (Math.PI * 2) / 18;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let v = 128;
            v += Math.sin(x * freq) * 26;
            if (x % panelW < 4) v -= 26;
            v += (rand(seedObj) - 0.5) * 6;
            const grimeAmt = Math.max(0, (y - size * 0.65) / (size * 0.35));
            v -= grimeAmt * 12;
            const idx = (y * size + x) * 4;
            const gg = clamp255(v);
            bd2[idx] = gg; bd2[idx + 1] = gg; bd2[idx + 2] = gg; bd2[idx + 3] = 255;
        }
    }
    bumpCtx.putImageData(bImg2, 0, 0);

    const { c: rC, ctx: rCtx } = makeCanvas(size);
    const rImg = rCtx.getImageData(0, 0, size, size);
    const rd = rImg.data;

    const seedObj2 = { v: 246813579 };
    for (let i = 0; i < rd.length; i += 4) {
        let v = 235 + (rand(seedObj2) - 0.5) * 14;
        v = clamp255(v);
        rd[i] = v; rd[i + 1] = v; rd[i + 2] = v; rd[i + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    rCtx.save();
    rCtx.globalAlpha = 0.12;
    rCtx.fillStyle = 'rgba(165,165,165,1)';
    for (let x = 0; x <= size; x += panelW) rCtx.fillRect(x, 0, 3, size);
    rCtx.restore();

    const map = canvasToTexture(c, { repeatX: 1, repeatY: 1, srgb: true });
    const bumpMap = canvasToTexture(bumpC, { repeatX: 1, repeatY: 1, srgb: false });
    const roughnessMap = canvasToTexture(rC, { repeatX: 1, repeatY: 1, srgb: false });

    return { map, bumpMap, roughnessMap };
}

export function getGarageTextures() {
    if (_cached) return _cached;

    const asphalt = generateAsphalt({ size: 512, repeat: 7 });
    const wall = generateGarageWall({ size: 512 });

    _cached = { asphalt, wall };
    return _cached;
}
