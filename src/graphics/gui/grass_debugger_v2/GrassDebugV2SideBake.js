// Bake relightable LOD3 side projections with lower-canopy occlusion and the original leaf silhouette.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { createGrassDebugV2PatchBakeMaterial } from './GrassDebugV2PatchBakeMaterial.js';
import { extendGrassBakeColors } from './GrassDebugV2BakePadding.js';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';

const VIEWS = Object.freeze([
    { id: 'front', outward: [0, 0, 1] }, { id: 'right', outward: [1, 0, 0] },
    { id: 'back', outward: [0, 0, -1] }, { id: 'left', outward: [-1, 0, 0] }
]);
export const GRASS_V2_SIDE_ALPHA_TEST = 0.15;

/** @param {{renderer:THREE.WebGLRenderer,source:THREE.Group,edgeDepth?:number,minHeightFraction?:number,maxHeightFraction?:number}} options */
export async function createGrassDebugV2SideBake({ renderer, source, edgeDepth = 1, minHeightFraction = 0, maxHeightFraction = 1 }) {
    if (!(edgeDepth > 0 && edgeDepth <= 1) || !(minHeightFraction >= 0 && minHeightFraction < maxHeightFraction && maxHeightFraction <= 1))
        throw new Error('Side bake requires a positive depth up to one metre and an increasing height range within zero to one.');
    const width = 2048, height = minHeightFraction ? 128 : 256;
    const sourceBounds = new THREE.Box3().setFromObject(source), sourceHeight = sourceBounds.max.y;
    if (!(sourceHeight > 0)) throw new Error('Grass side bake requires above-ground geometry.');
    const minHeight = sourceHeight * minHeightFraction, captureHeight = sourceHeight * maxHeightFraction - minHeight;
    const periodic = createGrassDebugV2PeriodicSource(source);
    const copies = periodic.group, scene = new THREE.Scene(); copies.visible = true; scene.add(copies);
    const meshes = []; copies.traverse(mesh => { if (mesh.isMesh) meshes.push({ mesh, original: mesh.material }); });
    const channels = Object.fromEntries(['albedo', 'normal', 'roughness'].map(channel => {
        const materials = new Map();
        for (const { original } of meshes) if (!materials.has(original)) {
            const material = createGrassDebugV2PatchBakeMaterial(original, channel, false);
            materials.set(original, material);
        }
        return [channel, materials];
    }));
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.NoColorSpace });
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(), shadows: renderer.shadowMap.enabled };
    const views = [], textures = [];
    try {
        renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false; renderer.setScissorTest(false);
        for (const view of VIEWS) {
            const camera = new THREE.OrthographicCamera(-0.5, 0.5, captureHeight / 2, -captureHeight / 2, 1.5, 1.5 + edgeDepth);
            const center = new THREE.Vector3(0, minHeight + captureHeight / 2, 0), outward = new THREE.Vector3(...view.outward);
            camera.position.copy(center).addScaledVector(outward, 2); camera.lookAt(center); camera.updateMatrixWorld(true);
            const maps = {};
            for (const [channel, materials] of Object.entries(channels)) {
                for (const { mesh, original } of meshes) mesh.material = materials.get(original);
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
                renderer.setRenderTarget(null);
                const pixels = new Uint8Array(width * height * 4);
                renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                // Camera right/up/outward is also the receiving wall's tangent frame.
                extendGrassBakeColors(pixels, width, height, channel === 'normal');
                const texture = new THREE.DataTexture(pixels, width, height);
                texture.name = 'GrassV2Side-' + view.id + '-' + channel; texture.colorSpace = THREE.NoColorSpace;
                texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
                texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                texture.generateMipmaps = channel !== 'albedo';
                texture.needsUpdate = true; textures.push(texture); maps[channel] = texture;
            }
            const albedo = maps.albedo.image.data, coverage = { retained: 0, shaded: 0 };
            for (let y = 0; y < height; y++) {
                const visibility = THREE.MathUtils.lerp(0.26, 1, THREE.MathUtils.smoothstep(minHeightFraction + (maxHeightFraction - minHeightFraction) * y / (height - 1), 0.03, 0.65));
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) albedo[i + c] = Math.round(albedo[i + c] * visibility);
                    if (albedo[i + 3]) { coverage.retained++; if (visibility < 1) coverage.shaded++; }
                }
            }
            maps.albedo.mipmaps = createGrassAlphaCoverageMipmaps(albedo, width, height, { alphaTest: GRASS_V2_SIDE_ALPHA_TEST });
            maps.albedo.needsUpdate = true;
            views.push(Object.freeze({ id: view.id, outward, quaternion: camera.quaternion.clone(), textures: Object.freeze(maps), coverage: Object.freeze(coverage) }));
        }
    } catch (error) { textures.forEach(texture => texture.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.shadowMap.enabled = previous.shadows;
        periodic.dispose();
        Object.values(channels).forEach(materials => materials.forEach(material => material.dispose())); target.dispose();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    return Object.freeze({ views: Object.freeze(views), sourceHeight, minHeight, captureHeight,
        getSnapshot: () => ({ width, height, sourceHeight, minHeight, captureHeight, edgeDepth, minHeightFraction, maxHeightFraction, source: '4K LOD3 · 10', sourceLeaves: 4000,
            views: views.map(view => view.id), channels: ['albedo', 'normal', 'roughness', 'alpha'],
            normalSpace: 'wall-tangent-right-up-outward', sunBaked: false, shadowsBaked: false,
            periodic: periodic.getSnapshot(), clipFootprintMeters: 1,
            canopyShadeBaked: true, baseVisibility: 0.26, shadeHeightRange: [0.03, 0.65],
            coverage: views.map(view => ({ view: view.id, ...view.coverage })) }),
        dispose: () => textures.forEach(texture => texture.dispose())
    });
}
