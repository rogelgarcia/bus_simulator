// Near and wide inclined cards: four source strips captured once, never during motion.
import * as THREE from 'three';
import { padGrassPlateTiles } from './GrassDebugV2DynamicPlates.js';
import { createGrassDebugV2ViewCardsMaterial } from './GrassDebugV2ViewCardsMaterial.js?v=card-continuity-1';
import { grassPlateSurfaceBakeShader, grassPlateNormalShader } from '../../shaders/materials/grass/GrassPlateShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

const PROFILES = Object.freeze({
    near: { width: .3, depth: .23, span: .35, pitch: 25, density: 12 },
    bridge: { width: .8, depth: .5, span: .56, pitch: 30, density: 3 }
});
const TILE_WIDTH = 512, TILE_HEIGHT = 256, GUTTER = 4, WIDTH = 4096, HEIGHT = 1024;

function patchLeaves(source, { width, depth }) {
    const { position: p, uv } = source.geometry.attributes, index = source.geometry.index;
    const centers = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]];
    const patches = centers.map(([x, z]) => ({ x, z, leaves: Array.from({ length: 8 }, () => []) }));
    for (const range of source.userData.grassLeafRanges) {
        let minimum = Infinity, x = 0, z = 0, count = 0;
        const vertices = new Set();
        for (let i = range.start; i < range.start + range.count; i++) {
            const v = index.getX(i); vertices.add(v); minimum = Math.min(minimum, uv.getY(v));
        }
        for (const v of vertices) if (uv.getY(v) <= minimum + 1e-6) { x += p.getX(v); z += p.getZ(v); count++; }
        x /= count; z /= count;
        // Each profile captures its own strip width and depth. Include lateral neighbours
        // before clipping so the ends do not taper into isolated clumps.
        for (const patch of patches) for (let direction = 0; direction < 8; direction++) {
            const angle = direction * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle);
            if (Math.abs(c * (x - patch.x) - s * (z - patch.z)) < width / 2 + .09
                && Math.abs(s * (x - patch.x) + c * (z - patch.z)) < depth / 2) patch.leaves[direction].push(range);
        }
    }
    if (patches.some(patch => patch.leaves.some(leaves => !leaves.length))) throw new Error('View-card source patches contain no leaves.');
    return patches;
}

function cardTemplates(count, centerHeight, frameHeight, footprint) {
    let seed = 4219;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    return Array.from({ length: 4 }, () => {
        const positions = [], variants = [], uvs = [], indices = [], normals = [], slots = [];
        // Toroidal best-candidate placement avoids rows and leaves no unused grid
        // quadrant for counts such as three. Small, world-stable offsets preserve
        // that separation instead of clustering roots again after placement.
        const roots = [];
        for (let slot = 0; slot < count; slot++) {
            let best, clearance = -1;
            for (let candidate = 0; candidate < 32; candidate++) {
                const point = [random() - .5, random() - .5];
                const distance = roots.reduce((nearest, root) => {
                    const dx = Math.abs(point[0] - root[0]), dz = Math.abs(point[1] - root[1]);
                    return Math.min(nearest, Math.hypot(Math.min(dx, 1 - dx), Math.min(dz, 1 - dz)));
                }, 2);
                if (distance > clearance) { clearance = distance; best = point; }
            }
            roots.push(best);
        }
        for (let slot = 0; slot < count; slot++) {
            const [cx, cz] = roots[slot];
            const first = positions.length / 3, variant = Math.floor(random() * 4);
            for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                positions.push(cx, centerHeight, cz); normals.push(0, 0, 1); uvs.push(u, v); variants.push(variant);
                slots.push(cx, cz, .25 / Math.sqrt(count), .25 / Math.sqrt(count));
            }
            indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('grassCardVariant', new THREE.Float32BufferAttribute(variants, 1));
        geometry.setAttribute('grassCardSlot', new THREE.Float32BufferAttribute(slots, 4));
        geometry.setIndex(indices);
        // Shader-expanded quads need conservative bounds for all camera bearings.
        const extent = .56 + .125 / Math.sqrt(count) + footprint * 1.2 / 2;
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-extent, centerHeight - frameHeight, -extent), new THREE.Vector3(extent, centerHeight + frameHeight, extent));
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        geometry.userData.grassLeafCount = 0; geometry.userData.grassViewCards = count;
        return geometry;
    });
}

export async function createGrassDebugV2ViewCards({ renderer, source, profile = 'near', onProgress = () => {} }) {
    if (!Object.hasOwn(PROFILES, profile)) throw new Error('Unknown grass card capture profile: ' + profile);
    const shape = PROFILES[profile];
    const { width: CARD_WIDTH, depth: SOURCE_DEPTH, span: GROUND_SPAN, pitch: CAPTURE_PITCH } = shape;
    if (!source?.geometry?.index || !source.userData.grassLeafRanges?.length || Array.isArray(source.material)
        || !source.material?.normalMap || !source.material?.roughnessMap || !source.material?.userData.grassFieldDistance
        || ['position', 'normal', 'color', 'uv'].some(name => !source.geometry.attributes[name]))
        throw new Error('View cards require indexed LOD2 leaves, source maps and the field lighting contract.');
    if (renderer.capabilities.maxTextureSize < WIDTH) throw new Error('View-card captures require 4096-pixel texture support.');
    const started = performance.now(), patches = patchLeaves(source, shape), material = source.material;
    const pitch = THREE.MathUtils.degToRad(CAPTURE_PITCH), sine = Math.sin(pitch), cosine = Math.cos(pitch);
    source.geometry.computeBoundingBox();
    const centerHeight = (source.geometry.boundingBox.min.y + source.geometry.boundingBox.max.y) / 2;
    const height = source.geometry.boundingBox.max.y - source.geometry.boundingBox.min.y;
    const frameHeight = height * cosine + GROUND_SPAN * sine + .02;
    const { position: p, normal: n, color, uv } = source.geometry.attributes, index = source.geometry.index;
    const positions = [], sourcePositions = [], normals = [], colors = [], uvs = [], captures = [];
    for (const [variant, patch] of patches.entries()) for (let direction = 0; direction < 8; direction++) {
        const angle = direction * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle);
        const x0 = direction * TILE_WIDTH + GUTTER, y0 = variant * TILE_HEIGHT + GUTTER, start = positions.length / 3;
        for (const range of patch.leaves[direction]) for (let i = range.start; i < range.start + range.count; i++) {
            const v = index.getX(i), x = p.getX(v) - patch.x, y = p.getY(v) - centerHeight, z = p.getZ(v) - patch.z;
            const horizontal = s * x + c * z, px = c * x - s * z, py = cosine * y - sine * horizontal, pz = sine * y + cosine * horizontal;
            positions.push(x0 + (px / CARD_WIDTH + .5) * (TILE_WIDTH - 2 * GUTTER), y0 + (py / frameHeight + .5) * (TILE_HEIGHT - 2 * GUTTER), pz);
            sourcePositions.push(px, py, pz);
            const nh = s * n.getX(v) + c * n.getZ(v);
            normals.push(c * n.getX(v) - s * n.getZ(v), cosine * n.getY(v) - sine * nh, sine * n.getY(v) + cosine * nh);
            colors.push(color.getX(v), color.getY(v), color.getZ(v)); uvs.push(uv.getX(v), uv.getY(v));
        }
        captures.push({ x0, y0, start, count: positions.length / 3 - start });
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, data, size] of [['position', positions, 3], ['grassPlatePosition', sourcePositions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uvs, 2]])
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
    const albedo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const normal = new THREE.MeshNormalMaterial({ normalMap: material.normalMap, normalScale: material.normalScale, side: THREE.DoubleSide, toneMapped: false });
    attachShaderMetadata(normal, grassPlateNormalShader);
    registerMaterialShaderHook(normal, { id: 'grass.view_cards.capture', variantKey: grassPlateNormalShader.variantKey,
        apply(shader) { shader.vertexShader = grassPlateNormalShader.vertexSource; } });
    const surface = new THREE.ShaderMaterial({ vertexShader: grassPlateSurfaceBakeShader.vertexSource, fragmentShader: grassPlateSurfaceBakeShader.fragmentSource,
        side: THREE.DoubleSide, toneMapped: false, uniforms: { roughnessMap: { value: material.roughnessMap }, roughness: { value: material.roughness } } });
    attachShaderMetadata(surface, grassPlateSurfaceBakeShader);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, WIDTH, HEIGHT, 0, .01, 4);
    camera.position.z = 2;
    const mesh = new THREE.Mesh(geometry, albedo); mesh.frustumCulled = false; scene.add(mesh);
    const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { samples: 4, colorSpace: THREE.NoColorSpace });
    const maps = {}, previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping, xr: renderer.xr.enabled,
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest() };
    try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping;
        for (const [name, captureMaterial] of [['albedo', albedo], ['normal', normal], ['roughness', surface]]) {
            onProgress(`Preparing ${CARD_WIDTH * 100} cm cards · ${name} · 32 captures`);
            mesh.material = captureMaterial; target.scissorTest = false; renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear();
            for (const capture of captures) {
                geometry.setDrawRange(capture.start, capture.count);
                target.scissor.set(capture.x0, capture.y0, TILE_WIDTH - 2 * GUTTER, TILE_HEIGHT - 2 * GUTTER);
                target.scissorTest = true; renderer.setRenderTarget(target); renderer.render(scene, camera);
            }
            const pixels = new Uint8Array(WIDTH * HEIGHT * 4); renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
            padGrassPlateTiles(pixels, WIDTH, TILE_WIDTH, TILE_HEIGHT, name === 'normal');
            const texture = new THREE.DataTexture(pixels, WIDTH, HEIGHT, THREE.RGBAFormat);
            texture.name = 'GrassViewCards-' + name; texture.colorSpace = THREE.NoColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true;
            texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true; maps[name] = texture;
            // Renderer state is restored before yielding to the interactive scene.
        }
    } catch (error) { Object.values(maps).forEach(map => map.dispose()); throw error; }
    finally {
        renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
        renderer.setClearColor(previous.color, previous.alpha); renderer.autoClear = previous.autoClear; renderer.toneMapping = previous.toneMapping; renderer.xr.enabled = previous.xr;
        target.dispose(); geometry.dispose(); albedo.dispose(); normal.dispose(); surface.dispose();
    }
    const cardMaterial = createGrassDebugV2ViewCardsMaterial(maps, material, new THREE.Vector4(CARD_WIDTH, frameHeight, sine, cosine), new THREE.Vector2(GROUND_SPAN, height + .02 / cosine));
    if (profile === 'bridge') {
        // Wider captures overlap more source leaves. Match leaf-only RGB to the
        // near cards; the litter and its lighting remain independent.
        cardMaterial.color.copy(material.color).multiply(new THREE.Color(.9, .94, .57));
        cardMaterial.name = 'GrassLOD4WideCards';
    }
    const footprint = Math.hypot(CARD_WIDTH, GROUND_SPAN);
    const dense = cardTemplates(shape.density, centerHeight, frameHeight, footprint);
    const sparse = cardTemplates(profile === 'near' ? 10 : 2, centerHeight, frameHeight, footprint);
    const full = cardTemplates(profile === 'near' ? 32 : 6, centerHeight, frameHeight, footprint);
    const snapshot = { profile, cardWidthMeters: CARD_WIDTH, cardsPerSquareMeter: shape.density, captures: 32, directions: 8, variants: 4, tilePixels: [TILE_WIDTH, TILE_HEIGHT],
        atlasPixels: [WIDTH, HEIGHT], textureBytes: WIDTH * HEIGHT * 4 * 3 * 4 / 3, captureMilliseconds: performance.now() - started,
        sourceLeaves: patches.map(patch => patch.leaves.map(leaves => leaves.length)), sourceFootprintMeters: [CARD_WIDTH, SOURCE_DEPTH], pitchDegrees: CAPTURE_PITCH, sourceHeightMeters: height, frameHeightMeters: frameHeight,
        layout: `toroidal best-candidate roots with quarter-spacing world jitter; ${shape.density} cards per square metre`, groundSpanMeters: GROUND_SPAN,
        updatePolicy: 'Continuous GPU bearing with fixed incline and stable source image; no runtime recaptures or per-card CPU updates' };
    return Object.freeze({ material: cardMaterial, templates: { cards: dense, 'cards-sparse': sparse, 'cards-full': full }, maps,
        getSnapshot: () => snapshot,
        dispose() { [...dense, ...sparse, ...full].forEach(item => item.dispose()); cardMaterial.dispose(); Object.values(maps).forEach(map => map.dispose()); } });
}
