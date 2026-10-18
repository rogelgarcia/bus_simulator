// Draws the animated ocean surface (AI 597): a camera-snapped clipmap of rings displaced by the cascade sum, lit by the view lighting with the AI577 water optics.
// @ts-check
// Design. Two shared grid geometries (integer indices, quads split along one diagonal so the CDLOD morph of odd vertices is exact): the full grid
// for ring 0 and, for every other ring, the annulus outside the square that always lies inside its hole (landscapeOceanRingHoleCells), each
// drawn once per ring with its own material: the ring uniform places it at the camera snapped to twice its cell (stable vertex parity, no
// swimming), the hole uniform discards the fragments over the previous ring's extent (the annulus overlaps it by one or two cells, since the two
// lattices snap one cell apart), the morph fractions blend each ring into the next lattice at its outer edge. The outermost ring
// reaches the camera far plane, where the atmosphere backdrop takes over. The materials share the lighting cells, the cascade textures, the
// bathymetry fields and the optics uniform; the program is linked once through KHR_parallel_shader_compile before the rings become visible, so
// the page keeps drawing the flat reference meanwhile. The rings are transparent (premultiplied Fresnel blend), never write depth, and are never
// returned to picking. The AI 597 D2 shore wave reads the extent field's shore channels and the coast classes with the simulation time the owner
// passes each frame (setShore switches the train's period with the sea state; inactive, the programs skip it).
import * as THREE from 'three';
import { createLandscapeOceanShaderPayload } from '../../../shaders/materials/landscape/LandscapeOceanShaderLoader.js';
import { LANDSCAPE_FRAME_PIPELINE } from '../LandscapeFramePipelineModel.js';
import { attachShaderMetadata } from '../../../shaders/core/ShaderLoader.js';

/**
 * Switches an ocean material between its premultiplied shading blend and the opaque overwrite of a verification view (alpha 0 reaches the
 * frame target as the final pass's sentinel). @param {any} material @param {boolean} debug
 */
export function landscapeOceanDebugBlending(material, debug) {
    if (debug) {
        material.blending = THREE.CustomBlending;
        material.blendEquation = THREE.AddEquation; material.blendSrc = THREE.OneFactor; material.blendDst = THREE.ZeroFactor;
        material.blendEquationAlpha = THREE.AddEquation; material.blendSrcAlpha = THREE.OneFactor; material.blendDstAlpha = THREE.ZeroFactor;
    } else {
        material.blending = THREE.NormalBlending;
        material.blendEquationAlpha = null; material.blendSrcAlpha = null; material.blendDstAlpha = null;
    }
    material.needsUpdate = true;
}
import { landscapeWaterSurfaceRoughness } from '../LandscapeLightingModel.js';
import { LANDSCAPE_SKY_REFLECTION } from '../LandscapeSkyReflection.js';
import { LANDSCAPE_OCEAN, LANDSCAPE_OCEAN_QUALITIES, landscapeOceanWaterType, landscapeOceanCascadeFade, landscapeOceanCascades, landscapeOceanRingHoleCells, landscapeOceanRingIndices, landscapeOceanRingOrigin, landscapeOceanRings } from './LandscapeOceanModel.js';

const PROGRAM_COMPILE_WAIT_MS = 30000;
// the unresolved part of the Cox-Munk slope variance (below the finest cascade), as a share of the AI577 reference wind's mean square slope
const BASE_SLOPE_SHARE = .5;
// reflections that dip below the horizon resolve to the sea's own upwelling colour over this band of the reflection elevation (sine)
const REFLECTION_HORIZON_BAND = .12;
const DEBUG_VIEWS = 14;

/**
 * Builds a shared ring grid: vertices at integer indices -cells/2..cells/2 (x in position.x, z in position.y), quads split along the
 * (i, j) -> (i + 1, j + 1) diagonal (landscapeOceanRingIndices), without the quads inside the square of half-size holeCells (the annulus of a
 * ring with a hole; 0 is the full grid of ring 0).
 * @param {number} cells @param {number} [holeCells]
 */
export function createLandscapeOceanRingGeometry(cells, holeCells = 0) {
    const side = cells + 1, positions = new Float32Array(side * side * 3), { index, triangles } = landscapeOceanRingIndices(cells, holeCells);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const o = (j * side + i) * 3; positions[o] = i - cells / 2; positions[o + 1] = j - cells / 2; positions[o + 2] = 0; }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    return { geometry, bytes: positions.byteLength + index.byteLength, triangles, holeCells };
}

/**
 * @param {{renderer:any,scene:any,ledger:any,quality:string,lighting:any,lightingTier:string,simulation:any,fields:{extent:any,surround:any},seaLevel:number}} options
 *   fields hold the extent texture (depth, shore distance, wave height, exposure), its shore texture (travel time, rock) and bounds and, optionally later (setSurroundField), the surround's;
 *   simulation is createLandscapeOceanSimulation's handle
 */
export function createLandscapeOceanSurface({ renderer, scene, ledger, quality, lighting, lightingTier, simulation, fields, seaLevel, pipeline = null }) {
    if (!lighting?.uniforms) throw new Error('[LandscapeOcean] The surface needs the view lighting');
    const preset = LANDSCAPE_OCEAN_QUALITIES[quality], cascades = landscapeOceanCascades(quality), count = cascades.length;
    const rings = landscapeOceanRings({ cells: preset.ringCells, baseCellMeters: preset.baseCellMeters });
    const key = `ocean/surface/${crypto.randomUUID()}`;
    const grid = createLandscapeOceanRingGeometry(preset.ringCells), annulus = createLandscapeOceanRingGeometry(preset.ringCells, landscapeOceanRingHoleCells(preset.ringCells));
    const geometryBytes = grid.bytes + annulus.bytes;
    const admission = ledger.reserve(key, { cpuBytes: geometryBytes, gpuBytes: geometryBytes });
    if (!admission.admitted) { grid.geometry.dispose(); annulus.geometry.dispose(); throw new Error(`[LandscapeOcean] The surface geometry cannot fit: ${admission.reason}`); }
    const environment = lighting.reflectionEnvironment();
    const reference = landscapeWaterSurfaceRoughness();
    const cascadeInfo = cascades.map(cascade => { const fade = landscapeOceanCascadeFade(cascade); return new THREE.Vector4(1 / cascade.lengthMeters, cascade.texelMeters, fade.zeroMeters, fade.fullMeters); });
    const handover = landscapeOceanCascadeFade(cascades[0]), shore = LANDSCAPE_OCEAN.shore, foam = LANDSCAPE_OCEAN.foam;
    const shared = { ...lighting.uniforms, uOceanScene: { value: pipeline ? pipeline.sceneTexture : null }, uOceanViewProjection: { value: new THREE.Matrix4() }, ...(environment ? { uLandscapeSkyReflection: { value: environment.texture }, uLandscapeSkyReflectionRotation: { value: environment.rotation } } : {}),
        uOceanCascadeInfo: { value: cascadeInfo }, uOceanField: { value: fields.extent.texture }, uOceanFieldBounds: { value: fields.extent.bounds },
        uOceanFarField: { value: fields.surround?.texture ?? fields.extent.texture }, uOceanFarFieldBounds: { value: fields.surround?.bounds ?? new THREE.Vector4(0, 0, 0, 0) }, uOceanFarFieldActive: { value: fields.surround ? 1 : 0 },
        uOceanEnvelope: { value: new THREE.Vector2(LANDSCAPE_OCEAN.envelope.amplitude, 1 / LANDSCAPE_OCEAN.envelope.wavelengthMeters) },
        uOceanShoreField: { value: fields.extent.shore }, uOceanShoreWave: { value: new THREE.Vector4(1, 1, shore.gamma, shore.longshoreWavelengthMeters) },
        uOceanShoreMix: { value: new THREE.Vector4(handover.zeroMeters, handover.fullMeters, shore.orbital, shore.rockReflection) },
        uOceanShoreShape: { value: new THREE.Vector4(shore.groupAmplitude, shore.longshoreAmplitude, 0, shore.sharpening) },
        uOceanShoreExposure: { value: new THREE.Vector4(shore.exposureFloor, shore.exposureRamp.fullMeters, shore.exposureRamp.zeroMeters, LANDSCAPE_OCEAN.texelsPerWavelength) }, uOceanTime: { value: 0 },
        uOceanFoam: { value: fields.extent.texture }, uOceanFoamLook: { value: new THREE.Vector4(0, foam.coverage.threshold, foam.coverage.softness, foam.albedo) },
        uOceanFoamPattern: { value: new THREE.Vector4(foam.patternMeters[0], foam.patternMeters[1], foam.patternMeters[2], foam.patternMeters[3]) }, uOceanFoamFold: { value: new THREE.Vector2(foam.folding.threshold, foam.folding.span) },
        // AI 597 D5: the local water types, the caustics and the crest scattering (ocean_light.glsl)
        uOceanWater: { value: new THREE.Vector4(LANDSCAPE_OCEAN.water.oceanic.depthMeters[0], LANDSCAPE_OCEAN.water.oceanic.depthMeters[1], LANDSCAPE_OCEAN.water.surf.weight, LANDSCAPE_OCEAN.light.terrainReflection && preset.light ? 1 : 0) },
        uOceanOceanicAttenuation: { value: new THREE.Vector3(...landscapeOceanWaterType('oceanic').attenuation) }, uOceanOceanicBackscatter: { value: new THREE.Vector3(...landscapeOceanWaterType('oceanic').backscatter) },
        uOceanSurfAttenuation: { value: new THREE.Vector3(...landscapeOceanWaterType('surf').attenuation) }, uOceanSurfBackscatter: { value: new THREE.Vector3(...landscapeOceanWaterType('surf').backscatter) },
        uOceanLight: { value: new THREE.Vector4(preset.light ? LANDSCAPE_OCEAN.light.caustics.contrast : 0, LANDSCAPE_OCEAN.light.caustics.fadeMeters[0], LANDSCAPE_OCEAN.light.caustics.fadeMeters[1], LANDSCAPE_OCEAN.light.crest.strength) },
        uOceanOptics: { value: new THREE.Vector4(reference.meanSquareSlope * BASE_SLOPE_SHARE, preset.lean ? 1 : 0, REFLECTION_HORIZON_BAND, LANDSCAPE_SKY_REFLECTION.width / (2 * Math.PI)) },
        uOceanMorph: { value: new THREE.Vector2(LANDSCAPE_OCEAN.morph.start, LANDSCAPE_OCEAN.morph.end) }, uOceanLevel: { value: seaLevel }, uOceanDebug: { value: 0 } };
    simulation.displacement.forEach((texture, index) => { shared[`uOceanDisplacement${index}`] = { value: texture }; });
    simulation.derivatives.forEach((texture, index) => { shared[`uOceanDerivatives${index}`] = { value: texture }; });
    let tier = lightingTier;
    const payloadFor = value => createLandscapeOceanShaderPayload('surface', { cascades: count, lightingTier: value, reflection: !!environment, scene: pipeline !== null });
    let payload = payloadFor(tier);
    const meshes = rings.map(ring => {
        const material = new THREE.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource,
            uniforms: { ...shared, uOceanRing: { value: new THREE.Vector4(0, 0, ring.cellMeters, ring.halfExtentMeters) }, uOceanHole: { value: new THREE.Vector4(0, 0, -1, -1) } },
            transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide });
        attachShaderMetadata(material, payload);
        const mesh = new THREE.Mesh(ring.hole ? annulus.geometry : grid.geometry, material);
        mesh.name = `Landscape ocean ring ${ring.index}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = 2 + ring.index;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        return mesh;
    });
    let renderInfo = null, drawnFrame = -1;
    const framePasses = pipeline ? LANDSCAPE_FRAME_PIPELINE.passes : 1;
    meshes[0].onBeforeRender = (currentRenderer, currentScene, currentCamera) => {
        renderInfo = currentRenderer.info.render; drawnFrame = renderInfo.frame;
        // AI 597 D5: the opaque frame is copied as the sea starts drawing (the seabed lit under water, the sheet), with the frame camera that
        // places the refracted seabed samples
        if (pipeline) { shared.uOceanViewProjection.value.multiplyMatrices(currentCamera.projectionMatrix, currentCamera.matrixWorldInverse); shared.uOceanScene.value = pipeline.sceneTexture; pipeline.copyScene(currentRenderer); }
    };
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
        /** The shared uniform set (fields, train, cascades, time): the D3 foam pass reads the same inputs through it. */
        uniforms: shared,
        /** @param {any} texture the foam state to draw (the current ping-pong target each frame), or null to draw none */
        setFoam(texture) { shared.uOceanFoam.value = texture ?? fields.extent.texture; shared.uOceanFoamLook.value.x = texture ? 1 : 0; },
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
        setDebug(mode) {
            if (!Number.isInteger(mode) || mode < 0 || mode > DEBUG_VIEWS) throw new Error(`[LandscapeOcean] Debug view must be an integer from 0 to ${DEBUG_VIEWS}; received ${mode}`);
            shared.uOceanDebug.value = mode;
            // a verification view draws opaque with alpha 0 (the frame pipeline's sentinel); the shading blends premultiplied
            for (const mesh of meshes) landscapeOceanDebugBlending(mesh.material, mode > 0);
        },
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
            return { material: 'landscape-ocean-surface-v1', rings: rings.length, cells: preset.ringCells, baseCellMeters: preset.baseCellMeters, farMeters: rings[rings.length - 1].halfExtentMeters, trianglesPerRing: grid.triangles, trianglesPerHoleRing: annulus.triangles, holeCells: annulus.holeCells,
                triangles: grid.triangles + annulus.triangles * (rings.length - 1), drawCalls: ready && visible ? rings.length : 0, geometryBytes, lean: preset.lean, baseMeanSquareSlope: shared.uOceanOptics.value.x, lightingTier: tier,
                reflection: environment ? environment.model : 'sky-harmonics', programCompile: { ...programCompile }, ready, visible, drawnLastFrame: renderInfo !== null && renderInfo.frame - drawnFrame < framePasses, morph: { ...LANDSCAPE_OCEAN.morph },
                // D5: the frame pipeline's scene copy read through the refraction, the local water types and the light terms
                scene: pipeline !== null, water: { oceanicDepthMeters: [...LANDSCAPE_OCEAN.water.oceanic.depthMeters], surfWeight: LANDSCAPE_OCEAN.water.surf.weight, oceanic: landscapeOceanWaterType('oceanic'), surf: landscapeOceanWaterType('surf') },
                light: { enabled: preset.light, caustics: { contrast: shared.uOceanLight.value.x, fadeMeters: [...LANDSCAPE_OCEAN.light.caustics.fadeMeters] }, crest: { strength: LANDSCAPE_OCEAN.light.crest.strength }, terrainReflection: shared.uOceanWater.value.w > 0 },
                foam: { active: shared.uOceanFoamLook.value.x > 0, coverageThreshold: shared.uOceanFoamLook.value.y, softness: shared.uOceanFoamLook.value.z, albedo: shared.uOceanFoamLook.value.w },
                cascadeFades: cascadeInfo.map(info => ({ zeroMeters: info.z, fullMeters: info.w })), shore: shoreState ? { active: true, ...shoreState, handover: { ...handover }, time: shared.uOceanTime.value } : { active: false, handover: { ...handover }, time: shared.uOceanTime.value } };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const mesh of meshes) { mesh.removeFromParent(); mesh.material.dispose(); }
            grid.geometry.dispose();
            annulus.geometry.dispose();
            ledger.release(key);
        }
    });
}
