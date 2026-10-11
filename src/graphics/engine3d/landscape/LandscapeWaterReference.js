// Owns a sea-level reference surface that never participates in authoritative terrain sampling or picking.
// @ts-check
// Since AI577 D5 the surface is a custom water material lit like the terrain (landscape-water-surface-v1, water.frag.glsl): it reflects the
// calibrated environment and the sun and blends over the terrain, whose submerged fragments carry the water column. Its visibility is also the
// optical water body: hiding the reference shades submerged terrain as dry ground.
import * as THREE from 'three';
import { createLandscapeShaderPayload } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { landscapeWaterSurfaceRoughness, LANDSCAPE_WATER_OPTICS } from './LandscapeLightingModel.js';

const sameBounds = (a, b) => ['minX', 'maxX', 'minZ', 'maxZ'].every(key => a[key] === b[key]);

function waterBounds(bounds, landscape) {
    if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) || !(bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ)) throw new Error('[Landscape] The water reference needs finite bounds with positive area');
    if (bounds.minX > landscape.minX || bounds.maxX < landscape.maxX || bounds.minZ > landscape.minZ || bounds.maxZ < landscape.maxZ) throw new Error('[Landscape] The water reference must cover the landscape bounds');
    return Object.freeze({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
}

function waterGeometry(bounds) {
    const geometry = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

/**
 * @param {{manifest:any,budget:any,scene:any,lighting:import('./LandscapeLighting.js').LandscapeLighting,visible?:boolean,bounds?:any}} options bounds (AI 596 D5) is the
 *   plane's extent, the landscape bounds by default; a view with a render-only surround passes the surround bounds so the sea continues to its edge
 *   (setBounds changes it later); the plane never enters picking or queries whatever its extent
 * @returns {any}
 */
export function createLandscapeWaterReference({ manifest, budget, scene, lighting, visible = true, bounds = manifest.bounds }) {
    if (!lighting?.uniforms) throw new Error('[Landscape] The water reference needs the view lighting');
    const key = `water/${crypto.randomUUID()}`;
    const bytes = 140;
    const admission = budget.reserve(key, { cpuBytes: bytes, gpuBytes: bytes, kind: 'landscape-water-reference' });
    if (!admission.admitted) throw new Error(`Water reference cannot fit: ${admission.reason}`);
    const { coordinates } = manifest;
    let current = waterBounds(bounds, manifest.bounds);
    let geometry = waterGeometry(current);
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
    const place = () => mesh.position.set((current.minX + current.maxX) / 2, coordinates.seaLevel, (current.minZ + current.maxZ) / 2);
    place();
    mesh.visible = visible;
    // a ShaderMaterial draws both faces in one pass (three.js forceSinglePass), unlike the pre-D5 two-pass transparent MeshStandardMaterial
    let renderInfo = null, drawnFrame = -1;
    mesh.onBeforeRender = renderer => { renderInfo = renderer.info.render; drawnFrame = renderInfo.frame; };
    scene.add(mesh);
    lighting.setWaterVisible(visible);
    return Object.freeze({
        setVisible(value) { mesh.visible = value; lighting.setWaterVisible(value); },
        /** Replaces the plane's extent (the landscape bounds, or the surround bounds while a surround is active). @param {any} value */
        setBounds(value) {
            const next = waterBounds(value, manifest.bounds);
            if (sameBounds(next, current)) return;
            current = next;
            geometry.dispose();
            geometry = waterGeometry(current);
            mesh.geometry = geometry;
            place();
        },
        /** @param {string} value recompiles the surface for a lighting tier on its next draw */
        setLightingTier(value) {
            const next = payloadFor(value);
            material.vertexShader = next.vertexSource; material.fragmentShader = next.fragmentSource; material.needsUpdate = true;
            attachShaderMetadata(material, next);
            tier = value;
        },
        snapshot() {
            return { visible: mesh.visible, seaLevel: coordinates.seaLevel, cpuBytes: bytes, gpuBytes: bytes, separateFromTerrain: true,
                bounds: { ...current }, extent: sameBounds(current, manifest.bounds) ? 'landscape' : 'surround',
                material: 'landscape-water-surface-v1', lightingTier: tier, reflection: environment ? environment.model : 'sky-harmonics', transparency: 'fresnel-premultiplied',
                ior: LANDSCAPE_WATER_OPTICS.ior, surface: landscapeWaterSurfaceRoughness(), opticalBody: mesh.visible,
                drawPasses: material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1, trianglesPerPass: geometry.index.count / 3,
                drawnLastFrame: renderInfo !== null && drawnFrame === renderInfo.frame };
        },
        dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); budget.release(key); lighting.setWaterVisible(false); }
    });
}
