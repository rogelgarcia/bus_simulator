// Side-view baking preserves every root's ground height; leaned cards preserve the source height envelope.
// Transparent texels retain RGB for mip filtering; clearing attachments directly avoids premultiplied clear colors.
// Multisampled slices retain subpixel tips; two transparent top rows keep the card edge above the visible blade.
// Atlas viewports use render-target pixels, independently of the display pixel ratio.
// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grassCardNormalsShader } from '../../shaders/materials/grass/GrassCardNormalsShaderLoader.js';
import { grassCardNormalBakeShader } from '../../shaders/materials/grass/GrassCardNormalBakeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { createGrassDebugV2Material } from './GrassDebugV2Material.js';

const TILE = 256;
const GUTTER = 4;

function createProfileCard(slice, right, width, midX, height) {
    const profile = slice.profile.map(point => point.clone());
    const top = profile.at(-1), previous = profile.at(-2);
    top.addScaledVector(top.clone().sub(previous), (height - top.y) / (top.y - previous.y));
    const geometry = new THREE.PlaneGeometry(width, 1, 1, profile.length - 1);
    const positions = geometry.attributes.position, uv = geometry.attributes.uv;
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        const station = profile[profile.length - 1 - Math.floor(i / 2)];
        point.copy(slice.rootCenter).add(station).addScaledVector(right, positions.getX(i) + midX);
        positions.setXYZ(i, point.x, point.y, point.z);
        uv.setY(i, station.y / height);
    }
    geometry.computeVertexNormals();
    return geometry;
}

function createFrame(slice) {
    const angle = slice.facing * Math.PI / 2;
    const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const center = slice.rootCenter.clone();
    const height = (slice.geometry.boundingBox.max.y - center.y) * (TILE - GUTTER * 2) / (TILE - GUTTER * 2 - 2);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);
    camera.position.copy(center).addScaledVector(forward, -1);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const positions = slice.geometry.attributes.position;
    const point = new THREE.Vector3();
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).sub(center);
        const x = point.dot(right);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    const width = (maxX - minX) * 1.02;
    const midX = (minX + maxX) / 2;
    Object.assign(camera, { left: midX - width / 2, right: midX + width / 2, bottom: 0, top: height });
    camera.updateProjectionMatrix();
    const up = forward.clone().multiplyScalar(Math.cos(slice.incline));
    up.y = Math.sin(slice.incline);
    const normal = new THREE.Vector3().crossVectors(right, up);
    const length = height / up.y;
    const geometry = slice.profile ? createProfileCard(slice, right, width, midX, height) : new THREE.PlaneGeometry(width, length);
    if (!slice.profile) {
        geometry.applyMatrix4(new THREE.Matrix4().makeBasis(right, up, normal));
        center.addScaledVector(right, midX).addScaledVector(up, length / 2);
        geometry.translate(center.x, center.y, center.z);
    }
    geometry.computeBoundingBox();
    return { camera, geometry };
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {ReturnType<import('./GrassDebugV2Tuft.js').createGrassDebugV2Tuft>['slices']} slices
 * @param {import('./GrassDebugV2Material.js').GrassDebugV2CanopyUniforms|null} canopy
 */
export function createGrassDebugV2Cards(renderer, slices, canopy = null) {
    const grid = Math.ceil(Math.sqrt(slices.length));
    const createTarget = () => new THREE.WebGLRenderTarget(TILE * grid, TILE * grid, {
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        samples: 4, generateMipmaps: true, colorSpace: THREE.NoColorSpace, depthBuffer: true
    });
    const albedo = createTarget();
    const normals = createTarget();
    albedo.texture.name = 'GrassV2CardAlbedo';
    normals.texture.name = 'GrassV2CardNormals';
    for (const target of [albedo, normals]) target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const colorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    attachShaderMetadata(normalMaterial, grassCardNormalBakeShader);
    registerMaterialShaderHook(normalMaterial, {
        id: 'grass.card_normal_bake', variantKey: grassCardNormalBakeShader.variantKey,
        apply: shader => {
            const anchor = '#include <normal_fragment_maps>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Grass normal bake shader contract changed');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, grassCardNormalBakeShader.fragmentSource);
        }
    });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(slices[0].geometry, colorMaterial);
    scene.add(mesh);
    const frames = slices.map(createFrame);
    const previous = {
        target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest()
    };
    try {
        renderer.autoClear = false;
        renderer.toneMapping = THREE.NoToneMapping;
        for (const [target, material] of [[albedo, colorMaterial], [normals, normalMaterial]]) {
            target.texture.generateMipmaps = false;
            renderer.setRenderTarget(target);
            renderer.setScissorTest(false);
            renderer.setClearColor(0, 0);
            renderer.clear();
            const gl = renderer.getContext();
            gl.clearBufferfv(gl.COLOR, 0, new Float32Array(material === colorMaterial ? [0.07, 0.18, 0.025, 0] : [0.5, 1, 0.5, 0]));
            mesh.material = material;
            slices.forEach((slice, index) => {
                mesh.geometry = slice.geometry;
                target.viewport.set(index % grid * TILE + GUTTER, Math.floor(index / grid) * TILE + GUTTER, TILE - GUTTER * 2, TILE - GUTTER * 2);
                renderer.setRenderTarget(target);
                target.texture.generateMipmaps = index === slices.length - 1;
                renderer.render(scene, frames[index].camera);
            });
        }
    } catch (error) {
        albedo.dispose(); normals.dispose();
        throw error;
    } finally {
        renderer.setRenderTarget(previous.target);
        renderer.setViewport(previous.viewport);
        renderer.setScissor(previous.scissor);
        renderer.setScissorTest(previous.scissorTest);
        renderer.setClearColor(previous.color, previous.alpha);
        renderer.autoClear = previous.autoClear;
        renderer.toneMapping = previous.toneMapping;
        colorMaterial.dispose(); normalMaterial.dispose();
    }
    frames.forEach(({ geometry }, index) => {
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i,
            (index % grid * TILE + GUTTER + uv.getX(i) * (TILE - GUTTER * 2)) / (TILE * grid),
            (Math.floor(index / grid) * TILE + GUTTER + uv.getY(i) * (TILE - GUTTER * 2)) / (TILE * grid)
        );
    });
    const geometry = mergeGeometries(frames.map(frame => frame.geometry));
    frames.forEach(frame => frame.geometry.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = createGrassDebugV2Material({
        map: albedo.texture, normalMap: normals.texture, normalMapType: THREE.ObjectSpaceNormalMap,
        defines: slices.every(slice => slice.profile) ? { GRASS_CARD_SOURCE_FACING: 1 } : {},
        alphaTest: 0.15, alphaToCoverage: true
    }, canopy);
    attachShaderMetadata(material, grassCardNormalsShader);
    registerMaterialShaderHook(material, {
        id: 'grass.card_normals', variantKey: grassCardNormalsShader.variantKey,
        apply: shader => {
            const anchor = '#include <normal_fragment_maps>';
            if (!shader.fragmentShader.includes(anchor)) throw new Error('Grass card normal shader contract changed');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, grassCardNormalsShader.fragmentSource);
        }
    });
    return { geometry, material, dispose: () => { albedo.dispose(); normals.dispose(); } };
}
