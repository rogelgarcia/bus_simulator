// Builds isolated material measurements with the unchanged production landscape shaders and uniforms.
import * as T from 'three';
import { createLandscapeShaderPayload } from '/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js';
import { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots, landscapeMaterialParameterTable, setLandscapeMacroVariationUniforms, setLandscapeMaterialClumpUniforms,
    setLandscapeMaterialSamplingUniforms, setLandscapeSurfaceLayerUniforms } from '/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js';
import { landscapeMacroVariationUniforms } from '/src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { landscapeSurfaceLayerUniforms } from '/src/graphics/engine3d/landscape/LandscapeSurfaceLayers.js';
import { landscapeMaterialClumpUniforms } from '/src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeMaterialSamplingUniforms } from '/src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_SOIL_CATALOG } from '/src/app/landscape/LandscapeCatalog.js';
import { LandscapeMaskPages } from '/src/graphics/engine3d/landscape/LandscapeMaskPages.js';
import { createLandscapeReferenceProbeLightingUniforms } from '/src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { buildLandscapeContourCoverage } from '/src/graphics/engine3d/landscape/LandscapeContourCoverage.js';
import { LandscapeMaterialSlots, LANDSCAPE_MATERIAL_SLOTS } from '/src/graphics/engine3d/landscape/LandscapeMaterialSlots.js';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, LANDSCAPE_MATERIAL_TIERS, landscapeMaterialTierIndex } from '/src/graphics/engine3d/landscape/LandscapeMaterialParameters.js';
import { buildLandscapeMaterialMipChain } from '/src/graphics/engine3d/landscape/LandscapeMaterialMips.js';

const ROW = LANDSCAPE_MATERIAL_PARAMETER_ROW;

// replicates an RGBA8 map of a power-of-two size onto a larger square (block replication keeps nearest-filtered test patterns block-constant)
function replicate(bytes, size, resolution) {
    if (size === resolution) return bytes;
    const factor = resolution / size, out = new Uint8Array(resolution * resolution * 4);
    for (let row = 0; row < resolution; row++) for (let column = 0; column < resolution; column++) {
        const source = ((Math.floor(row / factor) * size) + Math.floor(column / factor)) * 4, target = (row * resolution + column) * 4;
        out[target] = bytes[source]; out[target + 1] = bytes[source + 1]; out[target + 2] = bytes[source + 2]; out[target + 3] = bytes[source + 3];
    }
    return out;
}

/**
 * AI 598 D3a: binds test maps into the material arrays of an appearance uniform set and writes material parameter rows, for probes that render the
 * production terrain program with their own renderer. bindMaterial(index, {baseColor, surface, size, resolution, maps}) uploads an RGBA8 base colour and
 * 2 or 3 surface layers (normal, ORM, micro) of `size` texels per side (default: from the byte length) into the array whose resolution is the smallest
 * holding `size` (128, 512 or 1024; or the one named by `array`), replicating smaller maps, and binds the material there; `resolution` (default the
 * array's) is the bound-resolution state the fades read. transition(index, {...}) binds an arriving slot and sets the transition uniform. linearBaseColor keeps
 * the base colour bytes linear (RGBA8 arrays, like the former NoColorSpace probe textures) for mirrors that expect them exactly.
 */
export function createLandscapeMaterialBinder({ renderer, uniforms, materialCapacity = 6, fineSlots = 2, midSlots = 6, linearBaseColor = false }) {
    const slots = new LandscapeMaterialSlots({ renderer, budget: null, uniforms, prefix: 'probe', capacity: { fineSlots, midSlots, materialCapacity, fine: Math.max(0, fineSlots - 1), mid: Math.max(0, midSlots - 1) }, linearBaseColor });
    const table = landscapeMaterialParameterTable(uniforms), held = new Map(), arriving = new Map();
    const arrayFor = size => { const tier = LANDSCAPE_MATERIAL_TIERS.findIndex(resolution => resolution >= size); if (tier < 0) throw new Error(`Probe maps of ${size} texels exceed the finest material array`); return tier; };
    const acquire = (tier, index, map) => {
        const current = map.get(index);
        if (current && current.tier === tier) return current.slot;
        if (current) release(current);
        if (tier === 0) { slots.acquire(0, index); return index; }
        let slot = slots.acquire(tier, index);
        if (slot < 0) {
            // recycle the oldest slot of this array held by another material of the same map
            const victim = [...map.entries()].find(([other, value]) => other !== index && value.tier === tier);
            if (!victim) throw new Error(`The probe's ${LANDSCAPE_MATERIAL_SLOTS.tierNames[tier]} array has no free slot`);
            release(victim[1]); map.delete(victim[0]); slot = slots.acquire(tier, index);
        }
        return slot;
    };
    const release = ({ tier, slot }) => { if (tier > 0) slots.release(tier, slot); };
    const upload = (tier, slot, maps, size) => {
        const resolution = LANDSCAPE_MATERIAL_TIERS[tier];
        maps.forEach((bytes, map) => slots.upload(tier, slot, map, buildLandscapeMaterialMipChain(replicate(bytes, size, resolution), resolution, { srgb: map === 0 && !linearBaseColor })));
    };
    const mapsOf = (baseColor, surface, size) => {
        const texels = size * size * 4, layers = surface.length / texels;
        if (!Number.isInteger(layers) || layers < 2 || layers > 3 || baseColor.length !== texels) throw new Error(`Probe maps need a ${size}x${size} base colour and 2 or 3 surface layers; received ${baseColor.length} and ${surface.length} bytes`);
        return [baseColor, ...Array.from({ length: layers }, (_, layer) => surface.subarray(layer * texels, (layer + 1) * texels))];
    };
    return {
        slots, table,
        /** @param {number} index @param {{baseColor:Uint8Array,surface:Uint8Array,size?:number,array?:number,resolution?:number}} maps */
        bindMaterial(index, { baseColor, surface, size = Math.round(Math.sqrt(baseColor.length / 4)), array = arrayFor(size), resolution = LANDSCAPE_MATERIAL_TIERS[array] }) {
            const maps = mapsOf(baseColor, surface, size), slot = acquire(array, index, held);
            upload(array, slot, maps, size);
            held.set(index, { tier: array, slot });
            slots.setResidency(index, array, slot, -1, 0);
            table.setComponent(index, ROW.state, 1, resolution);
            if (arriving.has(index)) { release(arriving.get(index)); arriving.delete(index); if (slots.transition?.material === index) slots.setTransition(-1, 1, 0, 0); }
            return { tier: array, slot };
        },
        /** An arriving slot mixed by progress over the bound one (the former blend pair). @param {number} index @param {{baseColor:Uint8Array,surface:Uint8Array,size?:number,array?:number,progress:number}} target */
        transition(index, { baseColor, surface, size = Math.round(Math.sqrt(baseColor.length / 4)), array = arrayFor(size), progress }) {
            const current = held.get(index);
            if (!current) throw new Error(`Material ${index} has no bound maps to transition from`);
            const maps = mapsOf(baseColor, surface, size), slot = acquire(array, index, arriving);
            upload(array, slot, maps, size);
            arriving.set(index, { tier: array, slot });
            slots.setResidency(index, current.tier, current.slot, array, slot);
            slots.setTransition(index, progress, current.tier, current.slot);
        },
        clearTransition(index) {
            const current = held.get(index);
            if (arriving.has(index)) { release(arriving.get(index)); arriving.delete(index); }
            if (current) slots.setResidency(index, current.tier, current.slot, -1, 0);
            slots.setTransition(-1, 1, 0, 0);
        },
        /** Writes parameter rows of a material: any of scale, tiling, albedo, roughness, range, state, response, clumps, stochastic, macro (four numbers each). */
        setParameters(index, rows) { for (const [name, values] of Object.entries(rows)) table.setRow(index, ROW[name], values); },
        setComponent(index, row, component, value) { table.setComponent(index, ROW[row], component, value); },
        row(index, row) { return Array.from(table.row(index, ROW[row])); },
        dispose() { slots.dispose(); }
    };
}

// materialSampling selects the compiled production mode (recipe default when omitted); stochastic uniforms and the AI577 D4 layers
// (macro variation, slope projection, normal filtering, micro detail) start disabled. AI577 D5: material measurements use the fixed reference
// probe illumination (pre-D5 magnitudes) and the low lighting tier, so no aerial perspective or water column enters a material probe. AI577 D6:
// the reference illumination is the D5b response (uLandscapeResponse.w 0), whose compiled form is the program without the terrain-driven
// appearance (terrainAppearance: false), so no catena, rock exposure or coastal wetting enters a material probe either. AI 598 D3a: the probe's
// maps live in the material arrays (createLandscapeMaterialBinder) and its per-soil values in the parameter table; the probe's own maps are linear bytes
// (linearBaseColor, the former NoColorSpace textures), audits of real sRGB pages pass linearBaseColor false for the production sRGB arrays.
export function createLandscapeMaterialProbe({ size = 512, toneMapping = false, materialSampling, linearBaseColor = true } = {}) {
    const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setSize(size, size, false); renderer.setPixelRatio(1);
    renderer.toneMapping = toneMapping ? T.ACESFilmicToneMapping : T.NoToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = toneMapping ? T.SRGBColorSpace : T.LinearSRGBColorSpace;
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const coverageSlots = chooseLandscapeCoverageSlots(renderer).total;
    const uniforms = createLandscapeAppearanceUniforms(coverageSlots), payload = createLandscapeShaderPayload('terrain', { coverageSlots, lightingTier: 'low', terrainAppearance: false, ...(materialSampling ? { materialSampling } : {}) });
    const binder = createLandscapeMaterialBinder({ renderer, uniforms, linearBaseColor });
    // bytes arrive linear or sRGB-encoded and leave in the encoding of the probe's base colour arrays
    const toArrayEncoding = (bytes, srgb) => linearBaseColor ? (srgb ? decodeSrgb(bytes) : bytes) : (srgb ? bytes : encodeLinear(bytes));
    // terrain vertex normals are world normals (identity model matrix), so tilted probe planes rotate their geometry
    const plane = (normal = new T.Vector3(0, 1, 0), pivot = [1024, 1024]) => {
        const value = new T.PlaneGeometry(4096, 4096).rotateX(-Math.PI / 2).applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), normal)).translate(pivot[0], 0, pivot[1]);
        value.setAttribute('parentHeight', new T.BufferAttribute(Float32Array.from({ length: 4 }, (_, index) => value.attributes.position.getY(index)), 1));
        value.setAttribute('parentNormal', value.attributes.normal.clone());
        value.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
        return value;
    };
    let geometry = plane();
    const material = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
        uniforms: { ...uniforms, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
            uBounds: { value: new T.Vector4(0, 2048, 0, 2048) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
            uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) }, ...createLandscapeReferenceProbeLightingUniforms() } });
    const scene = new T.Scene(), mesh = new T.Mesh(geometry, material), camera = new T.OrthographicCamera(-2, 2, 2, -2, .1, 5000);
    mesh.frustumCulled = false; scene.add(mesh); camera.up.set(0, 0, -1);
    const columns = 65, halo = 2, width = columns + 2 * halo, capacity = 17, resources = [];
    const pixels = new Uint8Array(width * width * 4 * capacity), buffer = new Uint8Array(size * size * 4);
    const masks = new T.DataArrayTexture(pixels, width, width, capacity);
    masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false;
    uniforms.uMaskPages.value = masks; uniforms.uMaskDimensions.value.set(columns, columns); uniforms.uAppearanceReady.value = 1;
    resources.push(masks);
    let center = [1024, 1024], planeNormal = new T.Vector3(0, 1, 0);

    // the probe's own maps: a constant base colour per soil and a two-layer surface (normal, ORM with the relief height in alpha); a third layer carries micro detail
    const bases = Array.from({ length: 6 }, () => new Uint8Array([80, 80, 80, 255]));
    const surface = height => new Uint8Array([128, 128, 255, 255, 255, 255, 0, height]);
    const surfaces = Array.from({ length: 6 }, () => surface(128)), micro = Array.from({ length: 6 }, () => null);
    // the maps bound per soil, each with its own size (the base colour and the surface layers are replicated to the larger of the two); the two-layer surface gains the micro layer while one is set
    const bound = Array.from({ length: 6 }, () => ({ baseColor: null, size: 1 })), surfaceSizes = Array(6).fill(1);
    let transitionState = null;
    const replicateLayers = (bytes, size, resolution) => {
        if (size === resolution) return bytes;
        const texels = size * size * 4, layers = bytes.length / texels, out = new Uint8Array(resolution * resolution * 4 * layers);
        for (let layer = 0; layer < layers; layer++) out.set(replicate(bytes.subarray(layer * texels, (layer + 1) * texels), size, resolution), layer * resolution * resolution * 4);
        return out;
    };
    const rebind = soil => {
        const baseSize = bound[soil].baseColor ? bound[soil].size : 1, layerSize = micro[soil] ? micro[soil].size : surfaceSizes[soil], size = Math.max(baseSize, layerSize), resolution = bound[soil].resolution;
        const baseColor = replicate(bound[soil].baseColor ?? bases[soil], baseSize, size), surface = replicateLayers(micro[soil] ? micro[soil].layers : surfaces[soil], layerSize, size);
        binder.bindMaterial(soil, { baseColor, surface, size, ...(bound[soil].array !== undefined ? { array: bound[soil].array } : {}), ...(resolution !== undefined ? { resolution } : {}) });
        if (transitionState?.soil === soil) applyTransition();
    };
    // the arriving slot of the one synthetic transition follows the soil's current base colour (rebinding the bound maps drops the arriving slot)
    const applyTransition = () => {
        if (!transitionState) return;
        const { soil, height, array, progress } = transitionState;
        binder.transition(soil, { baseColor: bases[soil], surface: surface(height), size: 1, array, progress });
    };
    const descriptor = level => {
        const extent = 2048 / 2 ** level, row = 2 ** level - 1;
        return { id: `l${level}/c0/r${row}`, level, column: 0, row, parentId: level ? `l${level - 1}/c0/r${2 ** (level - 1) - 1}` : null,
            bounds: { minX: 0, maxX: extent, minZ: 0, maxZ: extent } };
    };
    const syncRecords = records => LandscapeMaskPages.prototype.updateUniforms.call({ records, capacity, uniforms });

    function setCoverage(weights) {
        const records = new Map(), present = weights.map((weight, soil) => ({ weight, soil })).filter(entry => entry.weight > 0);
        let cumulative = 0;
        present.forEach(({ weight, soil }, slot) => {
            cumulative += weight;
            const current = descriptor(slot), progress = slot ? weight / cumulative : 1;
            records.set(current.id, { id: current.id, descriptor: current, slot, progress, status: 'resident' });
            for (let index = 0; index < width * width; index++) pixels.set([soil * 17, soil, 1, 240], (slot * width * width + index) * 4);
        });
        masks.needsUpdate = true; syncRecords(records);
        const coordinate = 1024 / 2 ** (present.length - 1); center = [coordinate, coordinate];
    }

    // clumps: null keeps the relief competition alone; { seed } enables catalog clump relief for soils with relief flags. The state row's bound resolution is the
    // value the fades read (the maps themselves live in the coarse array); a transition binds a 512-array slot of the target height as the arriving tier
    function setSynthetic({ heights = Array(6).fill(128), enabled = true, flags = Array(6).fill(1), resolution = 512,
        period = 4, transition = null, clumps = null } = {}) {
        uniforms.uSurfaceBlendEnabled.value = enabled ? 1 : 0;
        for (let soil = 0; soil < 6; soil++) {
            surfaces[soil] = surface(heights[soil]); surfaceSizes[soil] = 1;
            micro[soil] = null;
            bound[soil] = { baseColor: null, size: 1, resolution };
            rebind(soil);
            binder.setParameters(soil, { scale: [period, 0, 1, 0], tiling: [period, 0, 0, 0], state: [flags[soil], resolution, 0, 0] });
        }
        for (let soil = 0; soil < 6; soil++) binder.clearTransition(soil);
        transitionState = transition ? { soil: transition.soil, height: transition.height ?? 128, array: landscapeMaterialTierIndex(transition.resolution ?? 512), progress: transition.progress ?? 1 } : null;
        applyTransition();
        setClumps(clumps, flags);
    }

    function setClumps(clumps, flags = Array(6).fill(1)) {
        if (clumps !== null && !Number.isSafeInteger(clumps?.seed)) throw new Error('Probe clumps need an integer seed');
        const clumpUniforms = landscapeMaterialClumpUniforms({ seed: clumps?.seed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map((soil, index) => ({ soilId: soil.id, enabled: !!flags[index] })) });
        setLandscapeMaterialClumpUniforms(uniforms, clumpUniforms, clumps !== null);
    }

    function setColors(colors) {
        colors.forEach((rgb, soil) => { bases[soil] = new Uint8Array([...rgb, 255]); if (!bound[soil].baseColor) rebind(soil); });
    }

    // a base colour map of its own size for one soil (null restores the constant colour); bytes are linear unless srgb, in either case converted to the arrays' encoding
    function setBaseMap(soil, bytes, size, { srgb = false, array } = {}) {
        bound[soil] = { ...bound[soil], baseColor: bytes ? toArrayEncoding(bytes, srgb) : null, size: bytes ? size : 1, ...(array !== undefined ? { array } : {}) };
        rebind(soil);
    }

    // seed null disables stochastic tiling (single unrotated lattice sample); otherwise the catalog parameters of enabled soils apply
    function setStochastic(seed, enabled = Array(6).fill(true)) {
        const sampling = landscapeMaterialSamplingUniforms({ seed: seed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map((soil, index) => ({ soilId: soil.id, enabled: !!enabled[index] })) });
        setLandscapeMaterialSamplingUniforms(uniforms, sampling, seed !== null);
    }

    function setMaterialSampling(mode) {
        const next = createLandscapeShaderPayload('terrain', { coverageSlots, materialSampling: mode, lightingTier: 'low', terrainAppearance: false });
        material.vertexShader = next.vertexSource; material.fragmentShader = next.fragmentSource; material.needsUpdate = true;
    }

    // a tilted plane (setPlane) is viewed along its normal with screen up pointing uphill, so screen columns follow the fall line
    function draw({ span = 4, offsetX = 0, offsetZ = 0, tilt = 0 } = {}) {
        camera.left = camera.bottom = -span / 2; camera.right = camera.top = span / 2;
        if (planeNormal.y < 1) {
            const target = new T.Vector3(center[0], 0, center[1]), uphill = new T.Vector3(0, 1, 0).addScaledVector(planeNormal, -planeNormal.y).normalize();
            camera.up.copy(uphill); camera.position.copy(target).addScaledVector(planeNormal, 1000); camera.lookAt(target);
        } else {
            camera.up.set(0, 0, -1);
            camera.position.set(center[0] + offsetX, 1000, center[1] + offsetZ - tilt * 1000);
            camera.lookAt(center[0] + offsetX, 0, center[1] + offsetZ);
        }
        camera.updateProjectionMatrix();
        material.uniformsNeedUpdate = true; renderer.render(scene, camera);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
        const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`Landscape material probe WebGL error ${error}`);
        return buffer;
    }

    function measureWeights(options = {}) {
        const sample = () => Array.from(draw(options).slice(((size / 2) * size + size / 2) * 4, ((size / 2) * size + size / 2) * 4 + 3));
        setColors(Array.from({ length: 6 }, () => [0, 0, 0])); const black = sample();
        setColors(Array.from({ length: 6 }, () => [80, 80, 80])); const white = sample();
        const denominator = white.reduce((sum, value, channel) => sum + value - black[channel], 0);
        const rendered = [];
        for (let soil = 0; soil < 6; soil++) {
            setColors(Array.from({ length: 6 }, (_, index) => index === soil ? [80, 80, 80] : [0, 0, 0]));
            const rgb = sample();
            rendered.push({ rgb, weight: rgb.reduce((sum, value, channel) => sum + value - black[channel], 0) / denominator });
        }
        return { weights: rendered.map(value => value.weight), rendered, black, white, denominator };
    }

    function setBoundary() {
        const sourceHalo = 6, sourceWidth = columns + sourceHalo * 2, sourcePixels = new Uint8Array(sourceWidth * sourceWidth * 2);
        for (let row = 0; row < sourceWidth; row++) for (let column = 0; column < sourceWidth; column++) {
            const soil = column - sourceHalo < 32 ? 2 : 3;
            sourcePixels.set([soil * 17, soil], (row * sourceWidth + column) * 2);
        }
        pixels.set(buildLandscapeContourCoverage({ sourcePixels, sourceWidth, sourceHeight: sourceWidth, sourceHalo, columns, rows: columns, spacingX: 32, spacingZ: 32 }));
        masks.needsUpdate = true;
        const current = descriptor(0); syncRecords(new Map([[current.id, { id: current.id, descriptor: current, slot: 0, progress: 1, status: 'resident' }]]));
        center = [1008, 1024];
    }

    function setPatternedHeights() {
        const resolution = 64;
        for (const soil of [2, 3]) {
            const data = new Uint8Array(resolution * resolution * 8);
            for (let row = 0; row < resolution; row++) for (let column = 0; column < resolution; column++) {
                const index = row * resolution + column, wave = Math.sin(4 * Math.PI * (row + .5) / resolution);
                data.set([128, 128, 255, 255], index * 4);
                data.set([255, 255, 0, Math.round((.5 + (soil === 2 ? .45 : -.45) * wave) * 255)], (resolution * resolution + index) * 4);
            }
            surfaces[soil] = data; surfaceSizes[soil] = resolution; micro[soil] = null;
            bound[soil] = { ...bound[soil], baseColor: null, size: 1, resolution };
            rebind(soil);
        }
    }

    // AI577 D4 layers: macroSeed null disables the landscape-scale field; projection and normalFiltering toggle their production settings
    function setLayers({ macroSeed = null, projection = false, normalFiltering = false } = {}) {
        setLandscapeMacroVariationUniforms(uniforms, landscapeMacroVariationUniforms({ seed: macroSeed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id })) }), macroSeed !== null);
        setLandscapeSurfaceLayerUniforms(uniforms, landscapeSurfaceLayerUniforms({ projection, normalFiltering }));
    }

    // a paired micro layer (array layer 2) for one soil from RGBA bytes at its resolution; setSynthetic restores the plain two-layer surface
    function setMicro(soil, { data = new Uint8Array([128, 128, 128, 128]), resolution = 1, tileMeters = 1.5, normalStrength = 1, luminanceScale = .4, heightStrength = .3,
        normal = [128, 128, 255, 255], orm = [255, 255, 0, 128] } = {}) {
        const texels = resolution * resolution, layers = new Uint8Array(texels * 12);
        for (let index = 0; index < texels; index++) { layers.set(normal, index * 4); layers.set(orm, (texels + index) * 4); }
        layers.set(data, texels * 8);
        micro[soil] = { layers, size: resolution };
        rebind(soil);
        const tiling = binder.row(soil, 'tiling');
        binder.setParameters(soil, { tiling: [tiling[0], tileMeters, normalStrength, luminanceScale] });
        binder.setComponent(soil, 'state', 2, heightStrength);
    }

    // a surface of one texel (normal, ORM with the relief height in alpha) for one soil; null restores the flat relief-128 surface
    function setSurface(soil, layers) {
        surfaces[soil] = layers ?? surface(128); surfaceSizes[soil] = 1; micro[soil] = null;
        rebind(soil);
    }

    function setPlane({ tiltDegrees = 0, azimuthDegrees = 0 } = {}) {
        const theta = tiltDegrees * Math.PI / 180, phi = azimuthDegrees * Math.PI / 180;
        planeNormal = new T.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        const next = plane(planeNormal, center);
        mesh.geometry = next; geometry.dispose(); geometry = next;
    }

    setCoverage([0, 0, 1, 0, 0, 0]); setSynthetic(); setLayers();
    return { size, renderer, uniforms, material, binder, setCoverage, setSynthetic, setClumps, setColors, setBaseMap, setStochastic, setMaterialSampling, draw, measureWeights, setBoundary, setPatternedHeights,
        setLayers, setMicro, setPlane, setSurface,
        setCenter(value) { center = value; },
        /** Parameter rows of a soil as the probe sees them. */
        parameters: (soil, row) => binder.row(soil, row),
        setParameters: (soil, rows) => binder.setParameters(soil, rows),
        setParameter: (soil, row, component, value) => binder.setComponent(soil, row, component, value),
        /** Binds real material pages (RGBA8 base colour, sRGB-encoded unless srgb false, and 2-3 surface layers of `size` texels) for a soil and records the bound resolution. */
        bindMaterial(soil, { baseColor, surface: layers, size, resolution, srgb = true }) {
            micro[soil] = null; surfaces[soil] = layers; surfaceSizes[soil] = size;
            bound[soil] = { baseColor: toArrayEncoding(baseColor, srgb), size, resolution };
            rebind(soil);
        },
        snapshot: () => renderer.domElement.toDataURL('image/png'),
        rendererName: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        dispose() { binder.dispose(); resources.forEach(resource => resource.dispose()); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); } };
}

// decodes sRGB-encoded RGBA8 bytes to linear bytes for a linear base-colour array (lossy in the darks; alpha untouched)
export function decodeSrgb(bytes) {
    const out = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) { const encoded = bytes[index + channel] / 255; out[index + channel] = Math.round((encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4) * 255); }
        out[index + 3] = bytes[index + 3];
    }
    return out;
}

// sRGB-encodes RGBA8 bytes meant as linear values, so the sRGB base-colour array decodes them back (alpha untouched)
export function encodeLinear(bytes) {
    const out = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) { const linear = bytes[index + channel] / 255; out[index + channel] = Math.round((linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055) * 255); }
        out[index + 3] = bytes[index + 3];
    }
    return out;
}
