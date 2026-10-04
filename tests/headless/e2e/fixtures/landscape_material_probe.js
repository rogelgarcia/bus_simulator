// Builds isolated material measurements with the unchanged production landscape shaders and uniforms.
import * as T from 'three';
import { createLandscapeShaderPayload } from '/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js';
import { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots, setLandscapeMacroVariationUniforms, setLandscapeMaterialClumpUniforms, setLandscapeMaterialSamplingUniforms,
    setLandscapeSurfaceLayerUniforms } from '/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js';
import { landscapeMacroVariationUniforms } from '/src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { landscapeSurfaceLayerUniforms } from '/src/graphics/engine3d/landscape/LandscapeSurfaceLayers.js';
import { landscapeMaterialClumpUniforms } from '/src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeMaterialSamplingUniforms } from '/src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_SOIL_CATALOG } from '/src/app/landscape/LandscapeCatalog.js';
import { LandscapeMaskPages } from '/src/graphics/engine3d/landscape/LandscapeMaskPages.js';
import { buildLandscapeContourCoverage } from '/src/graphics/engine3d/landscape/LandscapeContourCoverage.js';

// materialSampling selects the compiled production mode (recipe default when omitted); stochastic uniforms and the AI577 D4 layers
// (macro variation, slope projection, normal filtering, micro detail) start disabled
export function createLandscapeMaterialProbe({ size = 512, toneMapping = false, materialSampling } = {}) {
    const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setSize(size, size, false); renderer.setPixelRatio(1);
    renderer.toneMapping = toneMapping ? T.ACESFilmicToneMapping : T.NoToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = toneMapping ? T.SRGBColorSpace : T.LinearSRGBColorSpace;
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const coverageSlots = chooseLandscapeCoverageSlots(renderer).total;
    const uniforms = createLandscapeAppearanceUniforms(coverageSlots), payload = createLandscapeShaderPayload('terrain', { coverageSlots, ...(materialSampling ? { materialSampling } : {}) });
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
            uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) } } });
    const scene = new T.Scene(), mesh = new T.Mesh(geometry, material), camera = new T.OrthographicCamera(-2, 2, 2, -2, .1, 5000);
    mesh.frustumCulled = false; scene.add(mesh); camera.up.set(0, 0, -1);
    const columns = 65, halo = 2, width = columns + 2 * halo, capacity = 17, resources = [];
    const pixels = new Uint8Array(width * width * 4 * capacity), buffer = new Uint8Array(size * size * 4);
    const masks = new T.DataArrayTexture(pixels, width, width, capacity);
    masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false;
    uniforms.uMaskPages.value = masks; uniforms.uMaskDimensions.value.set(columns, columns); uniforms.uAppearanceReady.value = 1;
    resources.push(masks);
    let center = [1024, 1024], planeNormal = new T.Vector3(0, 1, 0);

    const texture = (data, resolution, layers = 1, srgb = false, nearest = false) => {
        const value = layers === 1 ? new T.DataTexture(data, resolution, resolution, T.RGBAFormat) : new T.DataArrayTexture(data, resolution, resolution, layers);
        value.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
        value.magFilter = nearest ? T.NearestFilter : T.LinearFilter; value.minFilter = nearest ? T.NearestFilter : T.LinearMipmapLinearFilter; value.generateMipmaps = !nearest;
        value.wrapS = value.wrapT = T.RepeatWrapping; value.flipY = false; value.needsUpdate = true; resources.push(value); return value;
    };
    const bases = Array.from({ length: 6 }, () => texture(new Uint8Array([80, 80, 80, 255]), 1));
    const surface = height => texture(new Uint8Array([128, 128, 255, 255, 255, 255, 0, height]), 1, 2);
    const surfaces = Array.from({ length: 6 }, () => surface(128)), targetSurface = surface(128);
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

    // clumps: null keeps the relief competition alone; { seed } enables catalog clump relief for soils with relief flags
    function setSynthetic({ heights = Array(6).fill(128), enabled = true, flags = Array(6).fill(1), resolution = 512,
        period = 4, transition = null, clumps = null } = {}) {
        uniforms.uSurfaceBlendEnabled.value = enabled ? 1 : 0;
        for (let soil = 0; soil < 6; soil++) {
            surfaces[soil].image.data[7] = heights[soil]; surfaces[soil].needsUpdate = true;
            uniforms[`uSoilBase${soil}`].value = bases[soil]; uniforms[`uSoilSurface${soil}`].value = surfaces[soil];
            uniforms.uSoilScale.value[soil].set(period, 0, 1, 0);
            uniforms.uSoilTiling.value[soil].set(period, 0, 0, 0);
            uniforms.uSoilState.value[soil].set(flags[soil], resolution, 0, 0);
        }
        uniforms.uMaterialBlendIndex.value = transition?.soil ?? -1;
        uniforms.uMaterialBlend.value = transition?.progress ?? 1;
        uniforms.uBlendResolution.value = transition?.resolution ?? resolution;
        targetSurface.image.data[7] = transition?.height ?? 128; targetSurface.needsUpdate = true;
        uniforms.uBlendBase.value = bases[transition?.soil ?? 0]; uniforms.uBlendSurface.value = targetSurface;
        setClumps(clumps, flags);
    }

    function setClumps(clumps, flags = Array(6).fill(1)) {
        if (clumps !== null && !Number.isSafeInteger(clumps?.seed)) throw new Error('Probe clumps need an integer seed');
        const clumpUniforms = landscapeMaterialClumpUniforms({ seed: clumps?.seed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map((soil, index) => ({ soilId: soil.id, enabled: !!flags[index] })) });
        setLandscapeMaterialClumpUniforms(uniforms, clumpUniforms, clumps !== null);
    }

    function setColors(colors) {
        bases.forEach((base, soil) => { base.image.data.set(colors[soil], 0); base.needsUpdate = true; });
    }

    // seed null disables stochastic tiling (single unrotated lattice sample); otherwise the catalog parameters of enabled soils apply
    function setStochastic(seed, enabled = Array(6).fill(true)) {
        const sampling = landscapeMaterialSamplingUniforms({ seed: seed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map((soil, index) => ({ soilId: soil.id, enabled: !!enabled[index] })) });
        setLandscapeMaterialSamplingUniforms(uniforms, sampling, seed !== null);
    }

    function setMaterialSampling(mode) {
        const next = createLandscapeShaderPayload('terrain', { coverageSlots, materialSampling: mode });
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
            uniforms[`uSoilSurface${soil}`].value = texture(data, resolution, 2); uniforms.uSoilState.value[soil].y = resolution;
        }
    }

    // AI577 D4 layers: macroSeed null disables the landscape-scale field; projection and normalFiltering toggle their production settings
    function setLayers({ macroSeed = null, projection = false, normalFiltering = false } = {}) {
        setLandscapeMacroVariationUniforms(uniforms, landscapeMacroVariationUniforms({ seed: macroSeed ?? 0, soils: LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id })) }), macroSeed !== null);
        setLandscapeSurfaceLayerUniforms(uniforms, landscapeSurfaceLayerUniforms({ projection, normalFiltering }));
    }

    // a paired micro layer (array layer 2) for one soil from RGBA bytes at its resolution; setSynthetic restores the plain two-layer surface
    function setMicro(soil, { data = new Uint8Array([128, 128, 128, 128]), resolution = 1, tileMeters = 1.5, normalStrength = 1, luminanceScale = .4, heightStrength = .3,
        normal = [128, 128, 255, 255], orm = [255, 255, 0, 128], nearest = false } = {}) {
        const texels = resolution * resolution, layers = new Uint8Array(texels * 12);
        for (let index = 0; index < texels; index++) { layers.set(normal, index * 4); layers.set(orm, (texels + index) * 4); }
        layers.set(data, texels * 8);
        uniforms[`uSoilSurface${soil}`].value = texture(layers, resolution, 3, false, nearest);
        uniforms.uSoilTiling.value[soil].set(uniforms.uSoilTiling.value[soil].x, tileMeters, normalStrength, luminanceScale);
        uniforms.uSoilState.value[soil].z = heightStrength;
    }

    function setPlane({ tiltDegrees = 0, azimuthDegrees = 0 } = {}) {
        const theta = tiltDegrees * Math.PI / 180, phi = azimuthDegrees * Math.PI / 180;
        planeNormal = new T.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        const next = plane(planeNormal, center);
        mesh.geometry = next; geometry.dispose(); geometry = next;
    }

    setCoverage([0, 0, 1, 0, 0, 0]); setSynthetic(); setLayers();
    return { size, renderer, uniforms, material, texture, setCoverage, setSynthetic, setClumps, setColors, setStochastic, setMaterialSampling, draw, measureWeights, setBoundary, setPatternedHeights,
        setLayers, setMicro, setPlane,
        setCenter(value) { center = value; },
        snapshot: () => renderer.domElement.toDataURL('image/png'),
        rendererName: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        dispose() { resources.forEach(resource => resource.dispose()); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); } };
}
