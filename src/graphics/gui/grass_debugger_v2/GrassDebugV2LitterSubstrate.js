// Tiles authored dry litter below grass and follows its contours only around exposed patch edges.
// @ts-check
import * as THREE from 'three';
import { primePbrAssetsAvailability } from '../../content3d/materials/PbrAssetsRuntime.js';
import { applyTextureColorSpace, applyResolvedPbrToStandardMaterial, resolvePbrMaterialPipeline } from '../../content3d/materials/PbrTexturePipeline.js';

export const GRASS_V2_LITTER_SUBSTRATE = Object.freeze({
    materialId: 'pbr.dry_litter', tileMeters: 0.4, elevationMeters: 0.005, rampWidthMeters: 0.02,
    contourReachMeters: 0.025, edgeInsetMeters: 0.05, albedoMultiplier: 0.3, alphaTest: 0.5
});

function readPixels(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

function createEdgeMask(alpha, height, xSide, zSide) {
    const canvas = document.createElement('canvas');
    canvas.width = alpha.width; canvas.height = alpha.height;
    const context = canvas.getContext('2d'), pixels = context.createImageData(canvas.width, canvas.height);
    const { tileMeters, contourReachMeters, edgeInsetMeters } = GRASS_V2_LITTER_SUBSTRATE;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const u = (x + 0.5) / canvas.width, v = (y + 0.5) / canvas.height;
        const distance = Math.min(xSide ? xSide * (0.5 - u) * tileMeters : Infinity,
            zSide ? zSide * (0.5 - v) * tileMeters : Infinity) - edgeInsetMeters;
        const offset = (y * canvas.width + x) * 4;
        const contour = distance + (height.data[offset] / 255 - 0.5) * contourReachMeters * 2;
        const outline = THREE.MathUtils.smoothstep(contour, -0.001, 0.001);
        const interior = THREE.MathUtils.smoothstep(distance, 0.035, 0.1);
        const opacity = outline * THREE.MathUtils.lerp(alpha.data[offset] / 255, 1, interior);
        pixels.data.fill(Math.round(opacity * 255), offset, offset + 3);
        pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'DryLitterContour_' + xSide + '_' + zSide;
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
}

function createRampedPatch(x, z, widthMeters, depthMeters) {
    const { elevationMeters, rampWidthMeters, edgeInsetMeters, contourReachMeters } = GRASS_V2_LITTER_SUBSTRATE;
    const contactInset = edgeInsetMeters + contourReachMeters;
    const axis = segment => segment.side
        ? [-segment.size / 2, -segment.side * (contactInset + rampWidthMeters), -segment.side * contactInset, segment.size / 2].sort((a, b) => a - b)
        : [-segment.size / 2, segment.size / 2];
    const xs = axis(x), zs = axis(z), positions = [], uvs = [], indices = [];
    for (const localZ of zs) for (const localX of xs) {
        const inward = Math.min(widthMeters / 2 - Math.abs(x.center + localX),
            depthMeters / 2 - Math.abs(z.center + localZ)) - contactInset;
        const height = elevationMeters * THREE.MathUtils.clamp(inward / rampWidthMeters, 0, 1);
        positions.push(localX, height - elevationMeters, localZ);
        uvs.push(localX / x.size + 0.5, 0.5 - localZ / z.size);
    }
    for (let row = 0; row < zs.length - 1; row++) for (let column = 0; column < xs.length - 1; column++) {
        const a = row * xs.length + column, b = a + 1, c = a + xs.length, d = c + 1;
        if (x.side * z.side >= 0) indices.push(a, d, b, a, c, d);
        else indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
}

/** @param {{renderer: THREE.WebGLRenderer, widthMeters: number, depthMeters: number}} options */
export async function createGrassDebugV2LitterSubstrate({ renderer, widthMeters, depthMeters }) {
    const { materialId, tileMeters, elevationMeters, alphaTest, albedoMultiplier, edgeInsetMeters } = GRASS_V2_LITTER_SUBSTRATE;
    if (![widthMeters, depthMeters].every(value => Number.isFinite(value) && value >= 2 * tileMeters
        && Math.abs(value / tileMeters - Math.round(value / tileMeters)) < 1e-6))
        throw new Error('Litter footprints require at least two whole 0.4 m tiles per axis.');
    await primePbrAssetsAvailability();
    const resolved = resolvePbrMaterialPipeline(materialId, { localOverrides: { roughness: 1, normalStrength: 1, aoIntensity: 1 } });
    const urls = {
        baseColor: resolved.urls.baseColorUrl, normal: resolved.urls.normalUrl, orm: resolved.urls.ormUrl,
        coverage: resolved.urls.auxiliaryUrls.coverage, height: resolved.urls.auxiliaryUrls.height
    };
    const loader = new THREE.TextureLoader();
    const textures = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([slot, url]) => {
        if (!url) throw new Error('Missing litter map: ' + slot);
        const texture = await loader.loadAsync(url);
        applyTextureColorSpace(texture, { srgb: slot === 'baseColor' });
        return [slot, texture];
    })));
    const alpha = readPixels(textures.coverage.image), height = readPixels(textures.height.image);
    if (alpha.width !== height.width || alpha.height !== height.height) throw new Error('Litter contour maps must share dimensions.');
    const group = new THREE.Group(); group.name = 'GrassV2DryLitterSubstrate';
    group.position.y = elevationMeters;
    const resources = new Set(Object.values(textures)), masks = [];
    const interiorWidth = widthMeters - tileMeters, interiorDepth = depthMeters - tileMeters;
    const segmentsX = [{ size: tileMeters, center: -widthMeters / 2, side: -1 },
        { size: interiorWidth, center: 0, side: 0 }, { size: tileMeters, center: widthMeters / 2, side: 1 }];
    const segmentsZ = [{ size: tileMeters, center: -depthMeters / 2, side: -1 },
        { size: interiorDepth, center: 0, side: 0 }, { size: tileMeters, center: depthMeters / 2, side: 1 }];
    for (const z of segmentsZ) for (const x of segmentsX) {
        const tileTextures = {};
        const configure = texture => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(x.size / tileMeters, z.size / tileMeters);
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            resources.add(texture); return texture;
        };
        for (const slot of ['baseColor', 'normal', 'orm']) tileTextures[slot] = configure(textures[slot].clone());
        const mask = x.side || z.side ? configure(createEdgeMask(alpha, height, x.side, z.side)) : null;
        if (mask) masks.push(mask);
        const material = new THREE.MeshStandardMaterial({ alphaTest, alphaToCoverage: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        applyResolvedPbrToStandardMaterial(material, { ...resolved, textures: tileTextures });
        material.color.multiplyScalar(albedoMultiplier);
        material.alphaMap = mask;
        material.name = mask ? mask.name : 'DryLitterInterior';
        const geometry = createRampedPatch(x, z, widthMeters, depthMeters);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x.center, 0, z.center);
        mesh.name = material.name; mesh.receiveShadow = true; mesh.renderOrder = 1;
        group.add(mesh);
    }
    return Object.freeze({
        group, masks: Object.freeze(masks),
        getSnapshot: () => ({ materialId, widthMeters, depthMeters, elevationMeters, tileMeters, edgeInsetMeters, albedoMultiplier,
            contourReachMeters: GRASS_V2_LITTER_SUBSTRATE.contourReachMeters,
            rampWidthMeters: GRASS_V2_LITTER_SUBSTRATE.rampWidthMeters,
            contactInsetMeters: edgeInsetMeters + GRASS_V2_LITTER_SUBSTRATE.contourReachMeters,
            interiorTiles: [interiorWidth / tileMeters, interiorDepth / tileMeters],
            perimeterMasks: masks.length, meshes: group.children.length, triangles: group.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0),
            maps: Object.fromEntries(Object.entries(textures).map(([slot, texture]) => [slot, [texture.image.width, texture.image.height]])) }),
        dispose() {
            group.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
            resources.forEach(texture => texture.dispose());
        }
    });
}
