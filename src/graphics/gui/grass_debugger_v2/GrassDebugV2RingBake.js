// Project separate reference root strips onto upright and outward-inclined silhouette rings.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PatchBakeMaterial } from './GrassDebugV2PatchBakeMaterial.js';
import { extendGrassBakeColors } from './GrassDebugV2BakePadding.js';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';
import { GRASS_V2_SIDE_ALPHA_TEST } from './GrassDebugV2SideBake.js';

const VIEWS = Object.freeze([
    { id: 'front', outward: [0, 0, 1] }, { id: 'right', outward: [1, 0, 0] },
    { id: 'back', outward: [0, 0, -1] }, { id: 'left', outward: [-1, 0, 0] }
]);

/** @param {{renderer:THREE.WebGLRenderer,source:THREE.Group,bottomHeight:number,sourceHeight:number,inset:number,outset:number,stripDepth:number,capturePadding?:number,leafFraction?:number}} options */
export async function createGrassDebugV2RingBake({ renderer, source, bottomHeight, sourceHeight, inset, outset, stripDepth, capturePadding = 0, leafFraction = 1 }) {
    if (![sourceHeight, bottomHeight, inset, outset, stripDepth, capturePadding].every(Number.isFinite)
        || !(sourceHeight > bottomHeight && bottomHeight >= 0) || !(inset >= 0 && inset < 0.5) || !(outset >= 0)
        || !(stripDepth > 0 && stripDepth + inset < 0.5) || !(capturePadding >= 0)) throw new Error('Invalid grass ring dimensions.');
    if (!(leafFraction > 0 && leafFraction <= 1)) throw new Error('Ring leaf fraction must be greater than zero and at most one.');
    const width = 2048, height = 128;
    const verticalHeight = sourceHeight - bottomHeight, slantHeight = Math.hypot(verticalHeight, outset);
    const halfBottom = 0.5 - inset, halfTop = halfBottom + outset, captureHalfWidth = halfTop + capturePadding, span = captureHalfWidth * 2;
    const sources = source.children.filter(mesh => mesh.isInstancedMesh), matrix = new THREE.Matrix4();
    if (!sources.length || sources.some(mesh => !mesh.geometry.index || mesh.geometry.index.count % 6 !== 0))
        throw new Error('Grass ring bake requires indexed, instanced leaf cards.');
    const sourceLeaves = sources.reduce((sum, mesh) => sum + mesh.count, 0);
    const sourceLod = [...new Set(sources.map(mesh => 'LOD3 · ' + mesh.geometry.index.count / 6))].join(' + ');
    const sourceBounds = new THREE.Box3().setFromObject(source);
    const sourceRadius = Math.max(Math.abs(sourceBounds.min.x), Math.abs(sourceBounds.max.x), Math.abs(sourceBounds.min.z), Math.abs(sourceBounds.max.z));
    const cameraDistance = Math.max(2, sourceRadius + captureHalfWidth + 0.1);
    const cameraFar = Math.max(5, cameraDistance + sourceRadius + sourceHeight + captureHalfWidth);
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, colorSpace: THREE.NoColorSpace });
    const channels = Object.fromEntries(['albedo', 'normal', 'roughness'].map(channel => [channel,
        new Map(sources.map(mesh => [mesh.material, createGrassDebugV2PatchBakeMaterial(mesh.material, channel, false)]))]));
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(), shadows: renderer.shadowMap.enabled };
    const views = [], textures = [];
    try {
        renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false; renderer.setScissorTest(false);
        for (const view of VIEWS) {
            const outward = new THREE.Vector3(...view.outward), scene = new THREE.Scene(), copies = [], candidates = [];
            for (const original of sources) {
                for (let i = 0; i < original.count; i++) {
                    original.getMatrixAt(i, matrix);
                    const radial = matrix.elements[12] * outward.x + matrix.elements[14] * outward.z;
                    const along = matrix.elements[12] * outward.z - matrix.elements[14] * outward.x;
                    if (radial > halfBottom - stripDepth && radial <= halfBottom && Math.abs(along) <= halfBottom)
                        candidates.push({ original, transform: matrix.clone() });
                }
            }
            const selected = new Map(sources.map(original => [original, []]));
            const retainedCount = Math.round(candidates.length * leafFraction);
            for (let i = 0; i < retainedCount; i++) {
                const candidate = candidates[Math.floor((i + 0.5) * candidates.length / retainedCount)];
                selected.get(candidate.original).push(candidate.transform);
            }
            for (const [original, transforms] of selected) {
                if (!transforms.length) continue;
                const copy = new THREE.InstancedMesh(original.geometry, original.material, transforms.length);
                transforms.forEach((transform, i) => copy.setMatrixAt(i, transform));
                copy.instanceMatrix.needsUpdate = true; copy.computeBoundingBox(); copy.computeBoundingSphere();
                scene.add(copy); copies.push({ mesh: copy, original: original.material });
            }
            const position = outward.clone().multiplyScalar(halfBottom + outset / 2).setY(bottomHeight + verticalHeight / 2);
            const normal = outward.clone().multiplyScalar(verticalHeight / slantHeight).add(new THREE.Vector3(0, -outset / slantHeight, 0));
            const camera = new THREE.OrthographicCamera(-span / 2, span / 2, slantHeight / 2, -slantHeight / 2, 0.01, cameraFar);
            camera.position.copy(position).addScaledVector(normal, cameraDistance); camera.lookAt(position); camera.updateMatrixWorld(true);
            const maps = {};
            try {
                for (const [channel, materials] of Object.entries(channels)) {
                    copies.forEach(({ mesh, original }) => { mesh.material = materials.get(original); });
                    renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
                    renderer.setRenderTarget(null);
                    const pixels = new Uint8Array(width * height * 4);
                    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                    extendGrassBakeColors(pixels, width, height, channel === 'normal');
                    const texture = new THREE.DataTexture(pixels, width, height);
                    texture.name = 'GrassV2Ring-' + inset + '-' + view.id + '-' + channel;
                    texture.colorSpace = THREE.NoColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
                    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                    texture.generateMipmaps = channel !== 'albedo';
                    if (channel === 'albedo') texture.mipmaps = createGrassAlphaCoverageMipmaps(pixels, width, height, { alphaTest: GRASS_V2_SIDE_ALPHA_TEST });
                    texture.needsUpdate = true; textures.push(texture); maps[channel] = texture;
                }
                views.push(Object.freeze({ id: view.id, outward, position, quaternion: camera.quaternion.clone(),
                    eligibleLeaves: candidates.length, sourceLeaves: retainedCount, textures: Object.freeze(maps) }));
            } finally { copies.forEach(({ mesh }) => mesh.dispose()); }
        }
    } catch (error) { textures.forEach(texture => texture.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.shadowMap.enabled = previous.shadows;
        Object.values(channels).forEach(materials => materials.forEach(material => material.dispose())); target.dispose();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    return Object.freeze({ views: Object.freeze(views), halfBottom, halfTop, captureHalfWidth, slantHeight,
        getSnapshot: () => ({ width, height, inset, outset, stripDepth, bottomHeight, sourceHeight, capturePadding, captureHalfWidth, leafFraction,
            leanDegrees: THREE.MathUtils.radToDeg(Math.atan2(outset, verticalHeight)), sourceLod, sourceLeaves,
            selection: 'deterministic subset across the full reference root strip', stripRadialRange: [halfBottom - stripDepth, halfBottom],
            views: views.map(view => ({ id: view.id, eligibleLeaves: view.eligibleLeaves, sourceLeaves: view.sourceLeaves })) }),
        dispose: () => textures.forEach(texture => texture.dispose())
    });
}
