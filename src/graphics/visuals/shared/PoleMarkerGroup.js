// src/graphics/visuals/shared/PoleMarkerGroup.js
// Builds reusable pole marker groups with radial fill, ring, and dot parts.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function rgbaFromColor(color, alpha) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createRadialTexture(size, colors) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const c = size * 0.5;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, colors.center);
    grad.addColorStop(0.5, colors.mid);
    grad.addColorStop(1, colors.edge);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, TAU);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

export function createPoleMarkerAssets({
    radius = 0.35,
    colorHex = 0x1d4d8f,
    textureColorHex = null,
    textureColors = null,
    textureSize = 128,
    ringInnerScale = 0.9,
    ringOuterScale = 1.06,
    dotScale = 0.16,
    discOpacity = 1,
    ringOpacity = 0.9,
    dotOpacity = 0.95,
    depthTest = true,
    depthWrite = false
} = {}) {
    const base = new THREE.Color(textureColorHex ?? colorHex);
    const texture = createRadialTexture(textureSize, textureColors ?? {
        center: rgbaFromColor(base, 0.95),
        mid: rgbaFromColor(base, 0.7),
        edge: rgbaFromColor(base, 0)
    });
    const discMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: discOpacity,
        side: THREE.DoubleSide,
        depthWrite,
        depthTest
    });
    const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: ringOpacity,
        side: THREE.DoubleSide,
        depthWrite,
        depthTest
    });
    const dotMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: dotOpacity,
        side: THREE.DoubleSide,
        depthWrite,
        depthTest
    });
    const discGeo = new THREE.CircleGeometry(radius, 40);
    const ringGeo = new THREE.RingGeometry(radius * ringInnerScale, radius * ringOuterScale, 48);
    const dotGeo = new THREE.CircleGeometry(radius * dotScale, 24);

    return {
        discGeo,
        ringGeo,
        dotGeo,
        discMat,
        ringMat,
        dotMat,
        texture,
        dispose() {
            discGeo.dispose();
            ringGeo.dispose();
            dotGeo.dispose();
            discMat.dispose();
            ringMat.dispose();
            dotMat.dispose();
            texture?.dispose?.();
        }
    };
}

export function createPoleMarkerGroup({ assets = null, renderOrder = null } = {}) {
    const markerAssets = assets ?? createPoleMarkerAssets();
    const orders = {
        disc: renderOrder?.disc ?? 3,
        ring: renderOrder?.ring ?? 4,
        dot: renderOrder?.dot ?? 5
    };

    const g = new THREE.Group();
    const disc = new THREE.Mesh(markerAssets.discGeo, markerAssets.discMat);
    const ring = new THREE.Mesh(markerAssets.ringGeo, markerAssets.ringMat);
    const dot = new THREE.Mesh(markerAssets.dotGeo, markerAssets.dotMat);
    disc.rotation.x = -Math.PI / 2;
    ring.rotation.x = -Math.PI / 2;
    dot.rotation.x = -Math.PI / 2;
    disc.renderOrder = orders.disc;
    ring.renderOrder = orders.ring;
    dot.renderOrder = orders.dot;
    g.add(disc);
    g.add(ring);
    g.add(dot);
    g.userData.markerParts = { disc, ring, dot };
    g.userData.markerAssets = markerAssets;
    return { group: g, assets: markerAssets };
}
