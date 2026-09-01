// Three r183 GPU fixture for cutout-only native shadow-depth evidence.
// @ts-check

import * as THREE from 'three';
import {captureNativeShadowDepthTextureSamples} from
    '/tools/static_sun_depth/browser/NativeShadowDepthTextureCapture.js';
import {captureProductionAlphaCutoutLiveShadowDepth} from
    '/tools/static_sun_depth/browser/ProductionAlphaCutoutLiveDepthCapture.js';

const MAP_SIZE = 32;

export function runProductionAlphaCutoutLiveDepthFixture() {
    const canvas = document.querySelector('#fixture');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('fixture canvas is missing');
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        depth: true,
        stencil: false
    });
    renderer.setPixelRatio(1);
    renderer.setSize(64, 64, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
    camera.position.set(0, 6, 8);
    camera.lookAt(0, 0, 0);
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0, 6, 2);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
    Object.assign(light.shadow.camera, {
        left: -3,
        right: 3,
        top: 3,
        bottom: -3,
        near: 0.1,
        far: 12
    });
    scene.add(light, light.target);

    const opaqueMaterial = new THREE.MeshStandardMaterial({color: 0x808080});
    const opaque = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), opaqueMaterial);
    opaque.position.set(-1.2, 0, 0);
    opaque.castShadow = true;
    scene.add(opaque);

    const alphaPixels = new Uint8Array([
        255, 255, 255, 255,
        255, 255, 255, 0,
        255, 255, 255, 0,
        255, 255, 255, 255
    ]);
    const alphaTexture = new THREE.DataTexture(alphaPixels, 2, 2, THREE.RGBAFormat);
    alphaTexture.colorSpace = THREE.SRGBColorSpace;
    alphaTexture.generateMipmaps = true;
    alphaTexture.magFilter = THREE.LinearFilter;
    alphaTexture.minFilter = THREE.LinearMipmapLinearFilter;
    alphaTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    alphaTexture.needsUpdate = true;
    const cutoutMaterial = new THREE.MeshStandardMaterial({
        alphaTest: 0.5,
        color: 0x208040,
        map: alphaTexture,
        side: THREE.DoubleSide
    });
    const cutout = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cutoutMaterial);
    cutout.position.set(1.2, 0, 0);
    cutout.castShadow = true;
    scene.add(cutout);

    const texels = [];
    for (let y = 0; y < MAP_SIZE; y += 1) {
        for (let x = 0; x < MAP_SIZE; x += 1) texels.push([x, y]);
    }
    const engine = {renderer, renderFrame: () => renderer.render(scene, camera)};
    try {
        forceShadowRender(renderer, light, engine.renderFrame);
        const initial = captureTarget(renderer, light.shadow.map, texels, 'initial-full');
        const cutoutEvidence = captureProductionAlphaCutoutLiveShadowDepth({
            THREE,
            city: {group: scene, sun: light},
            engine,
            expectedCutoutCasterCount: 1,
            texels
        });
        const restored = captureTarget(renderer, light.shadow.map, texels, 'restored-full');
        const occupied = (values) => [...values].filter((value) => value < 1).length;
        return {
            schema: 'ai531-production-alpha-cutout-live-depth-gpu-fixture-v1',
            counts: {
                fullOccupied: occupied(initial.depthValues),
                cutoutOccupied: cutoutEvidence.liveOccupiedSampleCount,
                restoredOccupied: occupied(restored.depthValues)
            },
            exactRestoration: float32Bits(initial.depthValues)
                .every((value, index) => value === float32Bits(restored.depthValues)[index]),
            evidence: {
                schema: cutoutEvidence.schema,
                method: cutoutEvidence.method,
                cutoutCasterMaterialSlotCount:
                    cutoutEvidence.cutoutCasterMaterialSlotCount,
                liveOccupiedSampleCount: cutoutEvidence.liveOccupiedSampleCount,
                sampleCount: cutoutEvidence.sampleCount,
                stateRestoration: cutoutEvidence.stateRestoration,
                transfer: cutoutEvidence.nativeCapture.transfer
            },
            sourceState: {
                opaqueCastShadow: opaque.castShadow,
                opaqueMaterialIdentity: opaque.material === opaqueMaterial,
                cutoutCastShadow: cutout.castShadow,
                cutoutMaterialIdentity: cutout.material === cutoutMaterial
            }
        };
    } finally {
        opaque.geometry.dispose();
        opaqueMaterial.dispose();
        cutout.geometry.dispose();
        cutoutMaterial.dispose();
        alphaTexture.dispose();
        light.dispose();
        renderer.dispose();
    }
}

function forceShadowRender(renderer, light, renderFrame) {
    renderer.shadowMap.needsUpdate = true;
    light.shadow.needsUpdate = true;
    renderFrame();
    renderer.getContext().finish();
}

function captureTarget(renderer, target, texels, label) {
    const framebuffer = renderer.properties.get(target)?.__webglFramebuffer;
    const depthTexture = target?.depthTexture;
    const nativeTexture = renderer.properties.get(depthTexture)?.__webglTexture;
    if (!framebuffer || !nativeTexture) throw new Error('fixture shadow target is unresolved');
    return captureNativeShadowDepthTextureSamples({
        gl: renderer.getContext(),
        renderer,
        framebuffer,
        depthTexture: nativeTexture,
        textureWidth: target.width,
        textureHeight: target.height,
        texels,
        label
    });
}

function float32Bits(values) {
    const copy = new Float32Array(values);
    return [...new Uint32Array(copy.buffer)];
}
