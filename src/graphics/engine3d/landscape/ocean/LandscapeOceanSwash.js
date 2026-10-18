// Builds and draws the swash sheet of the animated ocean (AI 597 D4): the native beach samples of the swash band as a thin sheet over the sand, where the run-up, the backwash and the wet beach are shaded in time.
// @ts-check
// Design. The sheet must sit on the sand the terrain draws, and the hierarchy's coarser levels differ from the native samples by decimetres,
// so the band is read from the native chunks (the hierarchy's finest level) that touch it (the bounded loader, like the fields): every native sample whose shore distance
// (bilinear from the extent raster) and height lie within LANDSCAPE_OCEAN.swash's band becomes a vertex (grid column, height in millimetres,
// grid row as 16-bit integers), every cell with four band corners two triangles, one mesh per chunk (16-bit indices, a bounding sphere, so
// the sheet frustum-culls like terrain). The material shares the surface's uniform set (fields, train, foam, clock) and adds the run-up inputs
// of the sea state; the programs are the swash shaders (ocean_swash.vert/frag.glsl, chunk ocean_swash.glsl). The sheet is premultiplied,
// never writes depth, draws before the rings and is never returned to picking (picking reads the terrain meshes only). Pure geometry
// building is exported for the unit tests.
import * as THREE from 'three';
import { createLandscapeOceanShaderPayload } from '../../../shaders/materials/landscape/LandscapeOceanShaderLoader.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { LANDSCAPE_TERRAIN_APPEARANCE } from '../LandscapeTerrainAppearance.js';
import { LANDSCAPE_OCEAN } from './LandscapeOceanModel.js';
import { LANDSCAPE_OCEAN_SWASH, landscapeOceanSwashInputs } from './LandscapeOceanSwashBand.js';
import { landscapeOceanDebugBlending } from './LandscapeOceanSurface.js';
export { LANDSCAPE_OCEAN_SWASH, landscapeOceanSwashChunkGeometry, landscapeOceanSwashInputs, loadLandscapeOceanSwashBand } from './LandscapeOceanSwashBand.js';

const PROGRAM_COMPILE_WAIT_MS = 30000;

/**
 * @param {{renderer:any,scene:any,ledger:any,uniforms:Record<string,{value:any}>,cascades:number,lightingTier:string,reflection:boolean,band:Awaited<ReturnType<typeof loadLandscapeOceanSwashBand>>,seaState:string,quality:string}} options
 */
export function createLandscapeOceanSwash({ renderer, scene, ledger, uniforms, cascades, lightingTier, reflection, band, seaState, quality, framePasses = 1 }) {
    if (!uniforms?.uOceanField || !uniforms.uOceanShoreField || !uniforms.uOceanTime) throw new Error('[LandscapeOceanSwash] The sheet needs the surface uniforms');
    if (!band.chunks.length) throw new Error('[LandscapeOceanSwash] The band holds no beach sample');
    const swash = LANDSCAPE_OCEAN.swash, coastal = LANDSCAPE_TERRAIN_APPEARANCE.coastal, key = `ocean/swash/${crypto.randomUUID()}`;
    const admission = ledger.reserve(key, { cpuBytes: band.bytes, gpuBytes: band.bytes });
    if (!admission.admitted) throw new Error(`[LandscapeOceanSwash] The sheet cannot fit: ${admission.reason}`);
    let inputs = landscapeOceanSwashInputs(seaState, quality), tier = lightingTier;
    const payloadFor = value => createLandscapeOceanShaderPayload('swash', { cascades, lightingTier: value, reflection });
    let payload = payloadFor(tier);
    const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { ...uniforms, uOceanSwash: { value: new THREE.Vector4(inputs.sqrtHeightLength, inputs.periodSeconds, swash.dryingSeconds, swash.sheetFoamShare) },
            uOceanSwashBand: { value: new THREE.Vector4(coastal.tidalMeters + coastal.capillaryMeters, swash.maxSlopeDegrees, swash.cyclesRemembered, swash.frontFoamMeters) },
            uOceanSwashGrid: { value: new THREE.Vector4(band.grid.minX, band.grid.minZ, band.grid.spacingX, band.grid.spacingZ) }, uOceanSwashLift: { value: swash.liftMeters },
            uOceanSwashFoam: { value: new THREE.Vector4(swash.depositShare, swash.depositSeconds, swash.filmMeanSquareSlope, swash.rippleShare) } } });
    attachShaderMetadata(material, payload);
    const meshes = band.chunks.map(({ id, geometry }) => {
        const buffer = new THREE.BufferGeometry();
        buffer.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
        buffer.setIndex(new THREE.BufferAttribute(geometry.indices, 1));
        const bb = geometry.bounds, center = new THREE.Vector3((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2, (bb.minZ + bb.maxZ) / 2);
        buffer.boundingSphere = new THREE.Sphere(center, Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY + 2, bb.maxZ - bb.minZ) / 2 + 2);
        const mesh = new THREE.Mesh(buffer, material);
        mesh.name = `Landscape ocean swash ${id}`;
        mesh.renderOrder = 1;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        return mesh;
    });
    for (const mesh of meshes) scene.add(mesh);
    let renderInfo = null, drawnFrame = -1;
    meshes[0].onBeforeRender = currentRenderer => { renderInfo = currentRenderer.info.render; drawnFrame = renderInfo.frame; };
    let visible = true, ready = false, disposed = false, programCompile = { parallel: renderer.extensions.has('KHR_parallel_shader_compile'), pending: true, milliseconds: null, timedOut: false };
    const link = async (camera, signal) => {
        const started = performance.now(), gl = renderer.getContext();
        renderer.compile(meshes[0], camera, scene);
        const current = () => renderer.properties.get(material).currentProgram;
        let program = current();
        if (typeof program?.isReady !== 'function') throw new Error('[LandscapeOceanSwash] The renderer did not create the swash program');
        gl.flush();
        const linked = () => { const latest = current(); if (latest && latest !== program) program = latest; return typeof program?.isReady === 'function' && program.program !== undefined && program.isReady(); };
        while (!disposed && !linked()) {
            if (signal?.aborted) throw new DOMException('Swash sheet load aborted while its program compiled', 'AbortError');
            if (gl.isContextLost()) throw new Error('[LandscapeOceanSwash] The WebGL context was lost while the swash program compiled');
            if (performance.now() - started > PROGRAM_COMPILE_WAIT_MS) break;
            await new Promise(resolve => setTimeout(resolve, 16));
        }
        if (disposed) throw new DOMException('Swash sheet disposed while its program compiled', 'AbortError');
        programCompile = { parallel: programCompile.parallel, pending: false, milliseconds: performance.now() - started, timedOut: !linked() };
        ready = true;
        for (const mesh of meshes) mesh.visible = visible;
    };
    return Object.freeze({
        /** Links the sheet program and shows the meshes. @param {any} camera @param {AbortSignal} [signal] */
        ready: (camera, signal) => link(camera, signal),
        setVisible(value) { visible = value; for (const mesh of meshes) mesh.visible = ready && value; },
        /** The sheet draws opaque with alpha 0 in a verification view (the frame pipeline's sentinel). @param {number} mode */
        setDebug(mode) { landscapeOceanDebugBlending(material, mode > 0); },
        /** @param {string} id the sea state whose swell drives the run-up */
        setSeaState(id) { inputs = landscapeOceanSwashInputs(id, quality); material.uniforms.uOceanSwash.value.x = inputs.sqrtHeightLength; material.uniforms.uOceanSwash.value.y = inputs.periodSeconds; },
        /** @param {string} value recompiles the sheet for a lighting tier on its next draw */
        setLightingTier(value) { payload = payloadFor(value); material.vertexShader = payload.vertexSource; material.fragmentShader = payload.fragmentSource; material.needsUpdate = true; attachShaderMetadata(material, payload); tier = value; },
        snapshot() {
            return { recipe: LANDSCAPE_OCEAN_SWASH.recipe, status: 'active', chunks: band.chunks.length, candidates: band.candidates, vertices: band.vertices, triangles: band.triangles, bytes: band.bytes, loadMs: band.milliseconds,
                band: { landMeters: swash.landMeters, seaMeters: swash.seaMeters, maxHeightMeters: swash.maxHeightMeters, minHeightMeters: swash.minHeightMeters }, liftMeters: swash.liftMeters,
                runup: { ...inputs, dryingSeconds: swash.dryingSeconds, cyclesRemembered: swash.cyclesRemembered, staticReachMeters: coastal.tidalMeters + coastal.capillaryMeters, maxSlopeDegrees: swash.maxSlopeDegrees },
                drawCalls: ready && visible ? meshes.length : 0, programCompile: { ...programCompile }, ready, visible, lightingTier: tier, drawnLastFrame: renderInfo !== null && renderInfo.frame - drawnFrame < framePasses };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
            material.dispose();
            ledger.release(key);
        }
    });
}
