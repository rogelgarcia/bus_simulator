// Draws the animated ocean surface (AI 597): a camera-snapped clipmap of rings displaced by the cascade sum, lit by the view lighting with the AI577 water optics.
// @ts-check
// Design. One shared grid geometry (integer indices, quads split along one diagonal so the CDLOD morph of odd vertices is exact) is drawn once per
// ring with its own material: the ring uniform places it at the camera snapped to twice its cell (stable vertex parity, no swimming), the hole
// uniform collapses the previous ring's extent, the morph fractions blend each ring into the next lattice at its outer edge. The outermost ring
// reaches the camera far plane, where the atmosphere backdrop takes over. The materials share the lighting cells, the cascade textures, the
// bathymetry fields and the optics uniform; the program is linked once through KHR_parallel_shader_compile before the rings become visible, so
// the page keeps drawing the flat reference meanwhile. The rings are transparent (premultiplied Fresnel blend), never write depth, and are never
// returned to picking. The AI 597 D2 shore wave reads the extent field's shore channels and the coast classes with the simulation time the owner
// passes each frame (setShore switches the train's period with the sea state; inactive, the programs skip it).
import * as THREE from 'three';
import { createLandscapeOceanShaderPayload } from '../../../shaders/materials/landscape/LandscapeOceanShaderLoader.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';
import { landscapeWaterSurfaceRoughness } from '../LandscapeLightingModel.js';
import { LANDSCAPE_SKY_REFLECTION } from '../LandscapeSkyReflection.js';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_QUALITIES, landscapeOceanCascadeFade, landscapeOceanCascades, landscapeOceanRingOrigin, landscapeOceanRings } from './LandscapeOceanModel.js';

const PROGRAM_COMPILE_WAIT_MS = 30000;
// the unresolved part of the Cox-Munk slope variance (below the finest cascade), as a share of the AI577 reference wind's mean square slope
const BASE_SLOPE_SHARE = .5;
// reflections that dip below the horizon resolve to the sea's own upwelling colour over this band of the reflection elevation (sine)
const REFLECTION_HORIZON_BAND = .12;
const DEBUG_VIEWS = 8;

/**
 * Builds the shared ring grid: vertices at integer indices -cells/2..cells/2 (x in position.x, z in position.y), quads split along the
 * (i, j) -> (i + 1, j + 1) diagonal.
 * @param {number} cells
 */
export function createLandscapeOceanRingGeometry(cells) {
    const side = cells + 1, positions = new Float32Array(side * side * 3), index = new (side * side > 65535 ? Uint32Array : Uint16Array)(cells * cells * 6);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const o = (j * side + i) * 3; positions[o] = i - cells / 2; positions[o + 1] = j - cells / 2; positions[o + 2] = 0; }
    let o = 0;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
        index[o++] = a; index[o++] = d; index[o++] = b;
        index[o++] = a; index[o++] = c; index[o++] = d;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    return { geometry, bytes: positions.byteLength + index.byteLength, triangles: cells * cells * 2 };
}

/**
 * @param {{renderer:any,scene:any,ledger:any,quality:string,lighting:any,lightingTier:string,simulation:any,fields:{extent:any,surround:any},seaLevel:number}} options
 *   fields hold the extent texture (depth, shore distance, wave height, exposure), its shore texture (travel time, rock) and bounds and, optionally later (setSurroundField), the surround's;
 *   simulation is createLandscapeOceanSimulation's handle
 */
export function createLandscapeOceanSurface({ renderer, scene, ledger, quality, lighting, lightingTier, simulation, fields, seaLevel }) {
    if (!lighting?.uniforms) throw new Error('[LandscapeOcean] The surface needs the view lighting');
    const preset = LANDSCAPE_OCEAN_QUALITIES[quality], cascades = landscapeOceanCascades(quality), count = cascades.length;
    const rings = landscapeOceanRings({ cells: preset.ringCells, baseCellMeters: preset.baseCellMeters });
    const key = `ocean/surface/${crypto.randomUUID()}`;
    const grid = createLandscapeOceanRingGeometry(preset.ringCells);
    const admission = ledger.reserve(key, { cpuBytes: grid.bytes, gpuBytes: grid.bytes });
    if (!admission.admitted) { grid.geometry.dispose(); throw new Error(`[LandscapeOcean] The surface geometry cannot fit: ${admission.reason}`); }
    const environment = lighting.reflectionEnvironment();
    const reference = landscapeWaterSurfaceRoughness();
    const cascadeInfo = cascades.map(cascade => { const fade = landscapeOceanCascadeFade(cascade); return new THREE.Vector4(1 / cascade.lengthMeters, cascade.texelMeters, fade.zeroMeters, fade.fullMeters); });
    const handover = landscapeOceanCascadeFade(cascades[0]), shore = LANDSCAPE_OCEAN.shore;
    const shared = { ...lighting.uniforms, ...(environment ? { uLandscapeSkyReflection: { value: environment.texture }, uLandscapeSkyReflectionRotation: { value: environment.rotation } } : {}),
        uOceanCascadeInfo: { value: cascadeInfo }, uOceanField: { value: fields.extent.texture }, uOceanFieldBounds: { value: fields.extent.bounds },
        uOceanFarField: { value: fields.surround?.texture ?? fields.extent.texture }, uOceanFarFieldBounds: { value: fields.surround?.bounds ?? new THREE.Vector4(0, 0, 0, 0) }, uOceanFarFieldActive: { value: fields.surround ? 1 : 0 },
        uOceanEnvelope: { value: new THREE.Vector2(LANDSCAPE_OCEAN.envelope.amplitude, 1 / LANDSCAPE_OCEAN.envelope.wavelengthMeters) },
        uOceanShoreField: { value: fields.extent.shore }, uOceanShoreWave: { value: new THREE.Vector4(1, 1, shore.gamma, shore.longshoreWavelengthMeters) },
        uOceanShoreMix: { value: new THREE.Vector4(handover.zeroMeters, handover.fullMeters, shore.orbital, shore.rockReflection) },
        uOceanShoreShape: { value: new THREE.Vector4(shore.groupAmplitude, shore.longshoreAmplitude, 0, shore.sharpening) },
        uOceanShoreExposure: { value: new THREE.Vector4(shore.exposureFloor, shore.exposureRamp.fullMeters, shore.exposureRamp.zeroMeters, LANDSCAPE_OCEAN.texelsPerWavelength) }, uOceanTime: { value: 0 },
        uOceanOptics: { value: new THREE.Vector4(reference.meanSquareSlope * BASE_SLOPE_SHARE, preset.lean ? 1 : 0, REFLECTION_HORIZON_BAND, LANDSCAPE_SKY_REFLECTION.width / (2 * Math.PI)) },
        uOceanMorph: { value: new THREE.Vector2(LANDSCAPE_OCEAN.morph.start, LANDSCAPE_OCEAN.morph.end) }, uOceanLevel: { value: seaLevel }, uOceanDebug: { value: 0 } };
    simulation.displacement.forEach((texture, index) => { shared[`uOceanDisplacement${index}`] = { value: texture }; });
    simulation.derivatives.forEach((texture, index) => { shared[`uOceanDerivatives${index}`] = { value: texture }; });
    let tier = lightingTier;
    const payloadFor = value => createLandscapeOceanShaderPayload('surface', { cascades: count, lightingTier: value, reflection: !!environment });
    let payload = payloadFor(tier);
    const meshes = rings.map(ring => {
        const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource,
            uniforms: { ...shared, uOceanRing: { value: new THREE.Vector4(0, 0, ring.cellMeters, ring.halfExtentMeters) }, uOceanHole: { value: new THREE.Vector4(0, 0, -1, -1) } },
            transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide });
        attachShaderMetadata(material, payload);
        const mesh = new THREE.Mesh(grid.geometry, material);
        mesh.name = `Landscape ocean ring ${ring.index}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2 + ring.index;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        return mesh;
    });
    let renderInfo = null, drawnFrame = -1;
    meshes[0].onBeforeRender = currentRenderer => { renderInfo = currentRenderer.info.render; drawnFrame = renderInfo.frame; };
    for (const mesh of meshes) scene.add(mesh);
    let visible = true, ready = false, disposed = false, shoreState = null, programCompile = { parallel: renderer.extensions.has('KHR_parallel_shader_compile'), pending: true, milliseconds: null, timedOut: false };
    const link = async (camera, signal) => {
        const started = performance.now(), gl = renderer.getContext();
        renderer.compile(meshes[0], camera, scene);
        const current = () => renderer.properties.get(meshes[0].material).currentProgram;
        let program = current();
        if (typeof program?.isReady !== 'function') throw new Error('[LandscapeOcean] The renderer did not create the ocean surface program');
        gl.flush();
        // a lighting tier switch while linking replaces the material's program and deletes the old one: poll the current program, never a deleted one
        const linked = () => { const latest = current(); if (latest && latest !== program) program = latest; return typeof program?.isReady === 'function' && program.program !== undefined && program.isReady(); };
        while (!disposed && !linked()) {
            if (signal?.aborted) throw new DOMException('Ocean surface load aborted while its program compiled', 'AbortError');
            if (gl.isContextLost()) throw new Error('[LandscapeOcean] The WebGL context was lost while the ocean program compiled');
            if (performance.now() - started > PROGRAM_COMPILE_WAIT_MS) break;
            await new Promise(resolve => setTimeout(resolve, 16));
        }
        if (disposed) throw new DOMException('Ocean surface disposed while its program compiled', 'AbortError');
        programCompile = { parallel: programCompile.parallel, pending: false, milliseconds: performance.now() - started, timedOut: !linked() };
        ready = true;
        for (const mesh of meshes) mesh.visible = visible;
    };
    const place = camera => {
        let previous = null;
        rings.forEach((ring, index) => {
            const origin = landscapeOceanRingOrigin(ring, camera.position.x, camera.position.z), mesh = meshes[index], uniforms = mesh.material.uniforms;
            uniforms.uOceanRing.value.set(origin.x, origin.z, ring.cellMeters, ring.halfExtentMeters);
            if (previous) uniforms.uOceanHole.value.set(previous.origin.x - previous.ring.halfExtentMeters, previous.origin.z - previous.ring.halfExtentMeters, previous.origin.x + previous.ring.halfExtentMeters, previous.origin.z + previous.ring.halfExtentMeters);
            previous = { origin, ring };
        });
    };
    return Object.freeze({
        rings, cascades,
        /** Links the surface program (in parallel where supported) and shows the rings; resolves once linked, rejects with AbortError on the signal. @param {any} camera @param {AbortSignal} [signal] */
        ready: (camera, signal) => link(camera, signal),
        /** Positions the rings under the camera for this frame and passes the simulation time to the shore wave. @param {any} camera @param {number} [time] */
        update(camera, time = shared.uOceanTime.value) { if (disposed) return; shared.uOceanTime.value = time; place(camera); },
        /**
         * Activates the shore wave train of a sea state (or deactivates it with null): its angular frequency and group period; the amplitude and the
         * refraction come from the extent field's channels, the coast from the classes texture.
         * @param {{omega:number,groupPeriodSeconds:number}|null} wave
         */
        setShore(wave) {
            shoreState = wave ? { omega: wave.omega, groupPeriodSeconds: wave.groupPeriodSeconds } : null;
            shared.uOceanShoreWave.value.x = wave ? wave.omega : 1;
            shared.uOceanShoreWave.value.y = wave ? wave.groupPeriodSeconds : 1;
            shared.uOceanShoreShape.value.z = wave ? 1 : 0;
        },
        setVisible(value) { visible = value; for (const mesh of meshes) mesh.visible = ready && value; },
        /** @param {number} mode verification view of the fragment program (0 shaded; see ocean_surface.frag.glsl) */
        setDebug(mode) { if (!Number.isInteger(mode) || mode < 0 || mode > DEBUG_VIEWS) throw new Error(`[LandscapeOcean] Debug view must be an integer from 0 to ${DEBUG_VIEWS}; received ${mode}`); shared.uOceanDebug.value = mode; },
        /** @param {any} surround {texture, bounds} of the surround field, or null to drop it */
        setSurroundField(surround) {
            shared.uOceanFarField.value = surround?.texture ?? fields.extent.texture;
            shared.uOceanFarFieldBounds.value = surround?.bounds ?? new THREE.Vector4(0, 0, 0, 0);
            shared.uOceanFarFieldActive.value = surround ? 1 : 0;
            for (const mesh of meshes) { Object.assign(mesh.material.uniforms, { uOceanFarField: shared.uOceanFarField, uOceanFarFieldBounds: shared.uOceanFarFieldBounds, uOceanFarFieldActive: shared.uOceanFarFieldActive }); mesh.material.uniformsNeedUpdate = true; }
        },
        /** @param {string} value recompiles the surface for a lighting tier on its next draw */
        setLightingTier(value) {
            payload = payloadFor(value);
            for (const mesh of meshes) { mesh.material.vertexShader = payload.vertexSource; mesh.material.fragmentShader = payload.fragmentSource; mesh.material.needsUpdate = true; attachShaderMetadata(mesh.material, payload); }
            tier = value;
        },
        snapshot() {
            return { material: 'landscape-ocean-surface-v1', rings: rings.length, cells: preset.ringCells, baseCellMeters: preset.baseCellMeters, farMeters: rings[rings.length - 1].halfExtentMeters, trianglesPerRing: grid.triangles,
                triangles: grid.triangles * rings.length, drawCalls: ready && visible ? rings.length : 0, geometryBytes: grid.bytes, lean: preset.lean, baseMeanSquareSlope: shared.uOceanOptics.value.x, lightingTier: tier,
                reflection: environment ? environment.model : 'sky-harmonics', programCompile: { ...programCompile }, ready, visible, drawnLastFrame: renderInfo !== null && drawnFrame === renderInfo.frame, morph: { ...LANDSCAPE_OCEAN.morph },
                cascadeFades: cascadeInfo.map(info => ({ zeroMeters: info.z, fullMeters: info.w })), shore: shoreState ? { active: true, ...shoreState, handover: { ...handover }, time: shared.uOceanTime.value } : { active: false, handover: { ...handover }, time: shared.uOceanTime.value } };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const mesh of meshes) { mesh.removeFromParent(); mesh.material.dispose(); }
            grid.geometry.dispose();
            ledger.release(key);
        }
    });
}
