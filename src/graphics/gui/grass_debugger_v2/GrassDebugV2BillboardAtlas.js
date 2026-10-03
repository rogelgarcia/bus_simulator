// Capture ten reusable 20 cm source strips with unlit color, source normals and surface properties.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2TriadLayout, GRASS_TRIAD_LAYOUT } from './GrassDebugV2TriadLayout.js?v=lod3-triads-1';
import { padGrassPlateTiles } from './GrassDebugV2DynamicPlates.js?v=lod3-plates-2';
import { grassPlateSurfaceBakeShader, grassPlateNormalShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js?v=lod3-plates-2';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

/** @param {{renderer:THREE.WebGLRenderer,source:any,bounds:any,material:THREE.MeshStandardMaterial,study:boolean}} options */
export async function createGrassDebugV2BillboardAtlas({ renderer, source, bounds, material, study }) {
    const plan = createGrassDebugV2TriadLayout({ bounds, roots: source.roots });
    const candidates = plan.plates.filter(plate => !plate.small).sort((a, b) => a.leafIds.length - b.leafIds.length || a.id - b.id);
    if (!candidates.length) throw new Error('Billboard source has no populated 30 cm strip to capture.');
    const tileWidth = study ? 1024 : 256, tileHeight = study ? 256 : 128, gutter = 2, columns = 4;
    const size = columns * tileWidth, height = 4 * tileHeight;
    const p = source.source.geometry.attributes.position, n = source.source.geometry.attributes.normal;
    const color = source.source.geometry.attributes.color, uv = source.source.geometry.attributes.uv, index = source.source.geometry.index;
    const positions = [], sourcePositions = [], normals = [], colors = [], uvs = [], variants = [];
    for (let tile = 0; tile < GRASS_TRIAD_LAYOUT.textureVariants; tile++) {
        const q = (tile + .5) / GRASS_TRIAD_LAYOUT.textureVariants;
        const plate = { ...candidates[Math.min(candidates.length - 1, Math.floor(q * candidates.length))] };
        const x0 = (tile % columns) * tileWidth + gutter, y0 = Math.floor(tile / columns) * tileHeight + gutter;
        const sine = Math.sin(plate.angle), cosine = Math.cos(plate.angle);
        const roots = plate.leafIds.map(id => cosine * (source.roots[id].x - plate.x) - sine * (source.roots[id].z - plate.z) + .1);
        variants.push({ tile, leafCount: roots.length, smallLeaves: roots.filter(x => x >= .05 && x < .15).length,
            start: positions.length / 3, count: 0,
            rootMean: roots.reduce((sum, x) => sum + x, 0) / roots.length,
            uv: [x0 / size, y0 / height, (tileWidth - 2 * gutter) / size, (tileHeight - 2 * gutter) / height] });
        for (const id of plate.leafIds) {
            const range = source.source.ranges[id];
            for (let i = range.start; i < range.start + range.count; i++) {
                const v = index.getX(i), dx = p.getX(v) - plate.x, dz = p.getZ(v) - plate.z;
                const x = cosine * dx - sine * dz + .1, y = p.getY(v), z = sine * dx + cosine * dz;
                positions.push(x0 + x / .2 * (tileWidth - 2 * gutter), y0 + y / source.height * (tileHeight - 2 * gutter), z);
                sourcePositions.push(x, y, z); normals.push(cosine * n.getX(v) - sine * n.getZ(v), n.getY(v), sine * n.getX(v) + cosine * n.getZ(v));
                colors.push(color.getX(v), color.getY(v), color.getZ(v)); uvs.push(uv.getX(v), uv.getY(v));
            }
        }
        variants.at(-1).count = positions.length / 3 - variants.at(-1).start;
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, array, components] of [['position', positions, 3], ['grassPlatePosition', sourcePositions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uvs, 2]])
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(array, components));
    const albedo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: material.normalMap, normalScale: material.normalScale, side: THREE.DoubleSide, toneMapped: false });
    attachShaderMetadata(normal, grassPlateNormalShader);
    registerMaterialShaderHook(normal, { id: 'grass.billboard.capture.normal', variantKey: grassPlateNormalShader.variantKey,
        apply: shader => { shader.vertexShader = grassPlateNormalShader.vertexSource; } });
    const surface = new THREE.ShaderMaterial({ vertexShader: grassPlateSurfaceBakeShader.vertexSource, fragmentShader: grassPlateSurfaceBakeShader.fragmentSource,
        side: THREE.DoubleSide, toneMapped: false, uniforms: { roughnessMap: { value: material.roughnessMap }, roughness: { value: material.roughness } } });
    attachShaderMetadata(surface, grassPlateSurfaceBakeShader);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, size, height, 0, .01, 2);
    camera.position.z = 1; const mesh = new THREE.Mesh(geometry, albedo); mesh.frustumCulled = false; scene.add(mesh);
    const target = new THREE.WebGLRenderTarget(size, height, { samples: 4, colorSpace: THREE.NoColorSpace }), maps = {};
    const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        toneMapping: renderer.toneMapping, autoClear: renderer.autoClear, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(), xr: renderer.xr.enabled };
    try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.setScissorTest(false);
        for (const [name, mat] of [['albedo', albedo], ['normal', normal], ['roughness', surface]]) {
            mesh.material = mat; target.scissorTest = false;
            renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear();
            for (const variant of variants) {
                geometry.setDrawRange(variant.start, variant.count);
                target.scissor.set((variant.tile % columns) * tileWidth + gutter, Math.floor(variant.tile / columns) * tileHeight + gutter,
                    tileWidth - 2 * gutter, tileHeight - 2 * gutter);
                target.scissorTest = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
            }
            const pixels = new Uint8Array(size * height * 4); renderer.readRenderTargetPixels(target, 0, 0, size, height, pixels);
            padGrassPlateTiles(pixels, size, tileWidth, tileHeight, name === 'normal');
            const texture = new THREE.DataTexture(pixels, size, height, THREE.RGBAFormat);
            texture.name = 'GrassBillboard-' + name; texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true; maps[name] = texture;
        }
    } catch (error) {
        Object.values(maps).forEach(map => map.dispose()); throw error;
    } finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
        renderer.toneMapping = previous.toneMapping; renderer.autoClear = previous.autoClear; renderer.xr.enabled = previous.xr;
        geometry.dispose(); albedo.dispose(); normal.dispose(); surface.dispose(); target.dispose();
    }
    return Object.freeze({ maps, variants, width: size, height, tileWidth, tileHeight, estimatedTextureBytes: size * height * 4 * 3 * 4 / 3,
        dispose: () => Object.values(maps).forEach(map => map.dispose()) });
}
