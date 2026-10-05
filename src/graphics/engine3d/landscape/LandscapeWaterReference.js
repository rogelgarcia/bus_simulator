// Owns a sea-level reference surface that never participates in authoritative terrain sampling or picking.
// @ts-check
// Since AI577 D5 the surface is a custom water material lit like the terrain (landscape-water-surface-v1, water.frag.glsl): it reflects the
// calibrated environment and the sun and blends over the terrain, whose submerged fragments carry the water column. Its visibility is also the
// optical water body: hiding the reference shades submerged terrain as dry ground.
import * as THREE from 'three';
import { createLandscapeShaderPayload } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { landscapeWaterSurfaceRoughness, LANDSCAPE_WATER_OPTICS } from './LandscapeLightingModel.js';

/** @param {{manifest:any,budget:any,scene:any,lighting:import('./LandscapeLighting.js').LandscapeLighting,visible?:boolean}} options @returns {any} */
export function createLandscapeWaterReference({ manifest, budget, scene, lighting, visible = true }) {
    if (!lighting?.uniforms) throw new Error('[Landscape] The water reference needs the view lighting');
    const key = `water/${crypto.randomUUID()}`;
    const bytes = 140;
    const admission = budget.reserve(key, { cpuBytes: bytes, gpuBytes: bytes, kind: 'landscape-water-reference' });
    if (!admission.admitted) throw new Error(`Water reference cannot fit: ${admission.reason}`);
    const { bounds, coordinates } = manifest;
    const geometry = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    geometry.rotateX(-Math.PI / 2);
    const environment = lighting.reflectionEnvironment();
    const uniforms = { ...lighting.uniforms, ...(environment ? { uLandscapeSkyReflection: { value: environment.texture }, uLandscapeSkyReflectionRotation: { value: environment.rotation } } : {}) };
    let tier = lighting.tier;
    const payloadFor = value => createLandscapeShaderPayload('water', { lightingTier: value, reflection: !!environment });
    const payload = payloadFor(tier);
    const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, uniforms, transparent: true, premultipliedAlpha: true,
        depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    attachShaderMetadata(material, payload);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Landscape sea-level reference';
    mesh.position.set((bounds.minX + bounds.maxX) / 2, coordinates.seaLevel, (bounds.minZ + bounds.maxZ) / 2);
    mesh.visible = visible;
    // a ShaderMaterial draws both faces in one pass (three.js forceSinglePass), unlike the pre-D5 two-pass transparent MeshStandardMaterial
    let renderInfo = null, drawnFrame = -1;
    mesh.onBeforeRender = renderer => { renderInfo = renderer.info.render; drawnFrame = renderInfo.frame; };
    scene.add(mesh);
    lighting.setWaterVisible(visible);
    return Object.freeze({
        setVisible(value) { mesh.visible = value; lighting.setWaterVisible(value); },
        /** @param {string} value recompiles the surface for a lighting tier on its next draw */
        setLightingTier(value) {
            const next = payloadFor(value);
            material.vertexShader = next.vertexSource; material.fragmentShader = next.fragmentSource; material.needsUpdate = true;
            attachShaderMetadata(material, next);
            tier = value;
        },
        snapshot() {
            return { visible: mesh.visible, seaLevel: coordinates.seaLevel, cpuBytes: bytes, gpuBytes: bytes, separateFromTerrain: true,
                material: 'landscape-water-surface-v1', lightingTier: tier, reflection: environment ? environment.model : 'sky-harmonics', transparency: 'fresnel-premultiplied',
                ior: LANDSCAPE_WATER_OPTICS.ior, surface: landscapeWaterSurfaceRoughness(), opticalBody: mesh.visible,
                drawPasses: material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1, trianglesPerPass: geometry.index.count / 3,
                drawnLastFrame: renderInfo !== null && drawnFrame === renderInfo.frame };
        },
        dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); budget.release(key); lighting.setWaterVisible(false); }
    });
}
