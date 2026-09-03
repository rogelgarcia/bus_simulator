// Full production-lattice native cutout depth capture for AI 531.
// @ts-check

import {resolveThreeR183ShadowAlphaTest, resolveThreeR183ShadowSide} from
    '../src/ThreeShadowSide.mjs';
import {captureNativeShadowDepthTexture} from './NativeShadowDepthTextureCapture.js';
import {createRuntimeTreeCasterId} from './ProductionAlphaCutoutSamplePlan.js';

export const PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_SCHEMA =
    'ai531-production-alpha-cutout-native-field-session-v2';
export const PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD =
    'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2';
const NATIVE_FOLIAGE_COVERAGE =
    'all-visible-material-groups-of-authenticated-cutout-meshes-v1';
const MAXIMUM_TILE_TEXELS = 4_000_000;

let activeSession = null;

/**
 * Build an isolated scene containing every visible group of authenticated
 * cutout meshes. Cycles also retains opaque groups; the final nearest-depth
 * merge therefore has redundant opaque evidence instead of an ownership gap.
 * Original City objects and the current shadow map are never mutated.
 *
 * @param {{
 *   THREE: any,
 *   city: any,
 *   engine: any,
 *   layout: any,
 *   expectedCasterIds: string[],
 *   expectedNativeOwnedMeshCount: number,
 *   cameraOriginDepthMeters: number,
 *   cameraNearMeters: number,
 *   cameraFarMeters: number,
 *   lightingProfileId: string
 * }} options
 */
export function beginProductionAlphaCutoutNativeFieldCapture(options) {
    if (activeSession !== null) {
        throw new Error('a production native cutout field session is already active');
    }
    const {THREE, city, engine} = options ?? {};
    const renderer = engine?.renderer;
    if (!THREE?.WebGLRenderTarget || !THREE?.DepthTexture
        || !city?.group?.traverse || !renderer?.properties?.get) {
        throw new TypeError(
            'native cutout field capture requires Three, City, and the live renderer'
        );
    }
    const layout = validateLayout(options.layout);
    const expectedCasterIds = canonicalStrings(
        options.expectedCasterIds,
        'expectedCasterIds'
    );
    const expectedNativeOwnedMeshCount = positiveInteger(
        options.expectedNativeOwnedMeshCount,
        'expectedNativeOwnedMeshCount'
    );
    const cameraOriginDepthMeters = finite(
        options.cameraOriginDepthMeters,
        'cameraOriginDepthMeters'
    );
    const cameraNearMeters = positiveFinite(
        options.cameraNearMeters,
        'cameraNearMeters'
    );
    const cameraFarMeters = positiveFinite(
        options.cameraFarMeters,
        'cameraFarMeters'
    );
    if (!(cameraFarMeters > cameraNearMeters)) {
        throw new RangeError('native cutout field camera range is not increasing');
    }
    const lightingProfileId = nonEmpty(
        options.lightingProfileId,
        'lightingProfileId'
    );
    city.group.updateMatrixWorld(true);
    const cutoutScene = createCutoutScene(THREE, city);
    if (!arraysEqual(cutoutScene.casterIds, expectedCasterIds)) {
        cutoutScene.dispose();
        throw new Error(
            'native cutout field live caster IDs differ from authenticated BSIB IDs'
        );
    }
    if (cutoutScene.meshCount !== expectedNativeOwnedMeshCount) {
        cutoutScene.dispose();
        throw new Error(
            'native foliage field live mesh ownership differs from authenticated BSIB instances'
        );
    }
    const tileWidth = layout.layout.interiorPixels[0];
    const tileHeight = layout.layout.interiorPixels[1];
    const texelCount = tileWidth * tileHeight;
    if (!Number.isSafeInteger(texelCount) || texelCount > MAXIMUM_TILE_TEXELS) {
        cutoutScene.dispose();
        throw new Error('native cutout field tile exceeds the fixed capture bound');
    }
    const gl = renderer.getContext();
    const target = new THREE.WebGLRenderTarget(tileWidth, tileHeight, {
        depthBuffer: true,
        format: THREE.RGBAFormat,
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        stencilBuffer: false,
        type: THREE.UnsignedByteType
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    target.texture.generateMipmaps = false;
    target.depthTexture = new THREE.DepthTexture(
        tileWidth,
        tileHeight,
        THREE.UnsignedIntType
    );
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.magFilter = THREE.NearestFilter;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.generateMipmaps = false;
    const halfWidthMeters = layout.layout.tileSizeMeters[0] * 0.5;
    const halfHeightMeters = layout.layout.tileSizeMeters[1] * 0.5;
    const camera = new THREE.OrthographicCamera(
        -halfWidthMeters,
        halfWidthMeters,
        halfHeightMeters,
        -halfHeightMeters,
        cameraNearMeters,
        cameraFarMeters
    );
    camera.matrixAutoUpdate = false;
    camera.updateProjectionMatrix();
    const preexistingErrors = drainGlErrors(gl);
    if (preexistingErrors.length > 0) {
        target.dispose();
        cutoutScene.dispose();
        throw new Error(
            `native cutout field requires a clean GL error state: ${preexistingErrors.join(',')}`
        );
    }
    activeSession = {
        THREE,
        camera,
        cameraOriginDepthMeters,
        capturedTileIndices: new Set(),
        cutoutScene,
        engine,
        gl,
        layout,
        lightingProfileId,
        renderer,
        target
    };
    return {
        schema: PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_SCHEMA,
        method: PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD,
        status: 'ready',
        lightingProfileId,
        camera: {
            farMeters: cameraFarMeters,
            nearMeters: cameraNearMeters,
            originDepthMetersInCacheBasis: cameraOriginDepthMeters,
            projection: 'orthographic-linear-depth-v1'
        },
        casterIds: cutoutScene.casterIds,
        casterCount: cutoutScene.casterIds.length,
        casterMeshCount: cutoutScene.meshCount,
        nativeFoliageCoverage: NATIVE_FOLIAGE_COVERAGE,
        nativeOwnedMeshCount: cutoutScene.meshCount,
        graphics: graphicsIdentity(gl),
        layout: {
            layerCount: layout.layout.layerCount,
            tileCount: [...layout.layout.tileCount],
            tileSizeMeters: [...layout.layout.tileSizeMeters],
            interiorPixels: [...layout.layout.interiorPixels]
        },
        texture: cutoutScene.textureIdentity
    };
}

/**
 * @param {{tileIndex: number}} options
 */
export function captureProductionAlphaCutoutNativeFieldTile(options) {
    const session = requireSession();
    const tileIndex = nonNegativeInteger(options?.tileIndex, 'tileIndex');
    if (tileIndex >= session.layout.tiles.length) {
        throw new RangeError('native cutout field tile index is outside the layout');
    }
    if (session.capturedTileIndices.has(tileIndex)) {
        throw new Error('native cutout field refuses a duplicate tile capture');
    }
    const tile = session.layout.tiles[tileIndex];
    const prior = snapshotRendererState(session.THREE, session.renderer);
    let capture = null;
    let primaryError = null;
    let restorationError = null;
    try {
        configureCameraForTile(session, tile);
        session.renderer.xr.enabled = false;
        session.renderer.shadowMap.enabled = false;
        session.renderer.autoClear = true;
        session.renderer.sortObjects = false;
        session.renderer.setRenderTarget(session.target);
        session.renderer.setViewport(
            0,
            0,
            session.target.width,
            session.target.height
        );
        session.renderer.setScissorTest(false);
        session.renderer.setClearColor(0x000000, 0);
        session.renderer.clear(true, true, false);
        session.renderer.render(session.cutoutScene.scene, session.camera);
        session.gl.finish();
        const handles = resolveNativeTarget(session.renderer, session.target);
        capture = captureNativeShadowDepthTexture({
            depthTexture: handles.depthTexture,
            framebuffer: handles.framebuffer,
            gl: session.gl,
            label: `${session.lightingProfileId}-${tile.id}`,
            maximumTexels: MAXIMUM_TILE_TEXELS,
            renderer: session.renderer,
            textureHeight: session.target.height,
            textureWidth: session.target.width
        });
        session.capturedTileIndices.add(tileIndex);
    } catch (error) {
        primaryError = error;
    } finally {
        try {
            restoreRendererState(session.renderer, prior);
            const differences = compareRendererState(
                prior,
                snapshotRendererState(session.THREE, session.renderer)
            );
            if (differences.length > 0) {
                throw new Error(
                    `native cutout renderer state differs after tile: ${differences.join(', ')}`
                );
            }
        } catch (error) {
            restorationError = error;
        }
    }
    if (restorationError) {
        throw new Error(
            'native cutout field tile could not restore renderer state',
            {cause: primaryError ?? restorationError}
        );
    }
    if (primaryError) throw primaryError;
    if (!capture) throw new Error('native cutout field tile produced no capture');
    let occupiedTexelCount = 0;
    for (const value of capture.depthValues) {
        if (value < 1) occupiedTexelCount += 1;
    }
    return {
        schema: 'ai531-production-alpha-cutout-native-field-tile-v2',
        method: PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD,
        status: 'captured_and_restored',
        coordinates: [...tile.coordinates],
        tileId: tile.id,
        tileIndex,
        occupiedTexelCount,
        transparentTexelCount: capture.depthValues.length - occupiedTexelCount,
        depthValues: capture.depthValues,
        nativeCapture: {
            implementation: capture.implementation,
            plan: capture.plan,
            sourceProof: capture.sourceProof,
            stateRestoration: capture.stateRestoration,
            transfer: capture.transfer
        },
        stateRestoration: 'verified'
    };
}

export function endProductionAlphaCutoutNativeFieldCapture() {
    const session = requireSession();
    activeSession = null;
    const capturedTileCount = session.capturedTileIndices.size;
    try {
        session.target.dispose();
        session.cutoutScene.dispose();
    } finally {
        session.renderer.renderLists?.dispose?.();
    }
    return {
        schema: PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_SCHEMA,
        method: PRODUCTION_ALPHA_CUTOUT_NATIVE_FIELD_METHOD,
        status: 'disposed',
        capturedTileCount,
        stateRestoration: 'isolated-scene-disposed-v1'
    };
}

function createCutoutScene(THREE, city) {
    const scene = new THREE.Scene();
    const casterIds = [];
    const materials = new Map();
    const clones = [];
    const textures = new Set();
    const discard = new THREE.MeshBasicMaterial();
    discard.visible = false;
    let meshCount = 0;
    city.group.traverse((source) => {
        if (!source?.isMesh || source.castShadow !== true || !source.geometry
            || !isWorldVisible(source)) return;
        if (source.isSkinnedMesh || source.isBatchedMesh
            || source.customDepthMaterial || source.customDistanceMaterial) {
            throw new Error(
                `native cutout field does not support custom/skinned/batched caster '${source.name || source.type}'`
            );
        }
        const sourceMaterials = Array.isArray(source.material)
            ? source.material : [source.material];
        const groups = source.geometry.groups?.length > 0
            ? source.geometry.groups
            : [{materialIndex: 0}];
        let hasCutout = false;
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
            const materialIndex = groups[groupIndex].materialIndex ?? 0;
            const material = sourceMaterials[materialIndex];
            if (!isCutoutMaterial(material)) continue;
            hasCutout = true;
            casterIds.push(createRuntimeTreeCasterId(
                city.group,
                source,
                groupIndex
            ));
        }
        if (!hasCutout) return;
        const passMaterials = sourceMaterials.map((sourceMaterial) => {
            if (!sourceMaterial || sourceMaterial.visible === false) return discard;
            let material = materials.get(sourceMaterial);
            if (!material) {
                const usesCutoutCoverage = isCutoutMaterial(sourceMaterial);
                material = createNativeFoliageDepthMaterial(
                    THREE, sourceMaterial, usesCutoutCoverage
                );
                materials.set(sourceMaterial, material);
                if (usesCutoutCoverage) {
                    if (sourceMaterial.map) textures.add(sourceMaterial.map);
                    if (sourceMaterial.alphaMap) textures.add(sourceMaterial.alphaMap);
                }
            }
            return material;
        });
        const cloneMaterial = Array.isArray(source.material)
            ? passMaterials : passMaterials[0];
        const clone = source.isInstancedMesh
            ? new THREE.InstancedMesh(
                source.geometry,
                cloneMaterial,
                source.count
            )
            : new THREE.Mesh(source.geometry, cloneMaterial);
        if (source.isInstancedMesh) {
            clone.instanceMatrix.copy(source.instanceMatrix);
            if (source.instanceColor) {
                clone.instanceColor = source.instanceColor.clone();
            }
            clone.count = source.count;
        }
        if (source.morphTargetInfluences) {
            clone.morphTargetInfluences = [...source.morphTargetInfluences];
        }
        if (source.morphTargetDictionary) {
            clone.morphTargetDictionary = {...source.morphTargetDictionary};
        }
        clone.matrixAutoUpdate = false;
        clone.matrix.copy(source.matrixWorld);
        clone.matrixWorld.copy(source.matrixWorld);
        clone.frustumCulled = false;
        clone.castShadow = false;
        clone.receiveShadow = false;
        scene.add(clone);
        clones.push(clone);
        meshCount += 1;
    });
    casterIds.sort(compareStrings);
    canonicalStrings(casterIds, 'live cutout caster IDs');
    if (textures.size !== 1) {
        throw new Error('native cutout field requires one shared coverage texture');
    }
    scene.updateMatrixWorld(true);
    return {
        casterIds,
        meshCount,
        scene,
        textureIdentity: describeTexture([...textures][0]),
        materials: [...materials.values()],
        dispose() {
            for (const clone of clones) clone.removeFromParent();
            for (const material of materials.values()) material.dispose();
            discard.dispose();
        }
    };
}

function createNativeFoliageDepthMaterial(THREE, source, usesCutoutCoverage) {
    if (source.alphaHash === true || source.displacementMap) {
        throw new Error('native foliage field does not support alpha hash or displacement');
    }
    if ((source.map && source.map.channel !== 0)
        || (source.alphaMap && source.alphaMap.channel !== 0)) {
        throw new Error('native foliage field supports only the authenticated uv0 coverage channel');
    }
    const material = new THREE.MeshBasicMaterial({
        alphaMap: usesCutoutCoverage ? source.alphaMap ?? null : null,
        alphaTest: usesCutoutCoverage
            ? resolveThreeR183ShadowAlphaTest(
                source.alphaTest,
                source.alphaToCoverage
            ) : 0,
        blending: THREE.NoBlending,
        color: 0x000000,
        depthFunc: THREE.LessEqualDepth,
        depthTest: true,
        depthWrite: true,
        map: usesCutoutCoverage ? source.map ?? null : null,
        opacity: usesCutoutCoverage && Number.isFinite(source.opacity)
            ? source.opacity : 1,
        side: resolveThreeR183ShadowSide(source.side, source.shadowSide),
        toneMapped: false,
        transparent: false,
        vertexColors: source.vertexColors === true,
        wireframe: source.wireframe === true
    });
    material.alphaToCoverage = false;
    material.colorWrite = false;
    material.clipIntersection = source.clipIntersection === true;
    material.clipShadows = source.clipShadows === true;
    material.clippingPlanes = source.clippingPlanes ?? null;
    material.customProgramCacheKey = () => (
        usesCutoutCoverage
            ? 'ai531-production-native-cutout-depth-material-v2'
            : 'ai531-production-native-opaque-depth-material-v2'
    );
    return material;
}

function configureCameraForTile(session, tile) {
    const bounds = tile.interiorBoundsLightMeters;
    const centerRight = (bounds.min[0] + bounds.max[0]) * 0.5;
    const centerUp = (bounds.min[1] + bounds.max[1]) * 0.5;
    const origin = session.layout.basis.originWorld;
    const right = session.layout.basis.rightAxisWorld;
    const up = session.layout.basis.upAxisWorld;
    const depth = session.layout.basis.depthAxisWorld;
    const centerDepth = session.cameraOriginDepthMeters;
    const position = [
        origin[0] + right[0] * centerRight + up[0] * centerUp
            + depth[0] * centerDepth,
        origin[1] + right[1] * centerRight + up[1] * centerUp
            + depth[1] * centerDepth,
        origin[2] + right[2] * centerRight + up[2] * centerUp
            + depth[2] * centerDepth
    ];
    session.camera.matrixWorld.set(
        -right[0], up[0], -depth[0], position[0],
        -right[1], up[1], -depth[1], position[1],
        -right[2], up[2], -depth[2], position[2],
        0, 0, 0, 1
    );
    if (!(session.camera.matrixWorld.determinant() > 0)) {
        throw new Error('native cutout field camera basis is not right handed');
    }
    session.camera.matrixWorldInverse.copy(session.camera.matrixWorld).invert();
}

function resolveNativeTarget(renderer, target) {
    const targetProperties = renderer.properties.get(target);
    const depthProperties = renderer.properties.get(target.depthTexture);
    const framebuffer = targetProperties?.__webglFramebuffer;
    const depthTexture = depthProperties?.__webglTexture;
    if (!framebuffer || Array.isArray(framebuffer) || !depthTexture) {
        throw new Error('native cutout field could not resolve target handles');
    }
    return {depthTexture, framebuffer};
}

function snapshotRendererState(THREE, renderer) {
    return {
        activeCubeFace: renderer.getActiveCubeFace(),
        activeMipmapLevel: renderer.getActiveMipmapLevel(),
        autoClear: renderer.autoClear,
        clearAlpha: renderer.getClearAlpha(),
        clearColor: renderer.getClearColor(new THREE.Color()).clone(),
        renderTarget: renderer.getRenderTarget(),
        scissor: renderer.getScissor(new THREE.Vector4()).clone(),
        scissorTest: renderer.getScissorTest(),
        shadowEnabled: renderer.shadowMap.enabled,
        sortObjects: renderer.sortObjects,
        viewport: renderer.getViewport(new THREE.Vector4()).clone(),
        xrEnabled: renderer.xr.enabled
    };
}

function restoreRendererState(renderer, state) {
    renderer.setRenderTarget(
        state.renderTarget,
        state.activeCubeFace,
        state.activeMipmapLevel
    );
    renderer.autoClear = state.autoClear;
    renderer.shadowMap.enabled = state.shadowEnabled;
    renderer.sortObjects = state.sortObjects;
    renderer.xr.enabled = state.xrEnabled;
    renderer.setClearColor(state.clearColor, state.clearAlpha);
    renderer.setViewport(state.viewport);
    renderer.setScissor(state.scissor);
    renderer.setScissorTest(state.scissorTest);
}

function compareRendererState(left, right) {
    const differences = [];
    for (const key of Object.keys(left)) {
        const a = left[key];
        const b = right[key];
        const equal = a?.equals && b?.equals ? a.equals(b) : Object.is(a, b);
        if (!equal) differences.push(key);
    }
    return differences;
}

function validateLayout(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !value.basis || !value.depth || !value.layout
        || !Array.isArray(value.tiles)) {
        throw new TypeError('native cutout field layout is invalid');
    }
    const dimensions = value.layout.interiorPixels;
    const tileCount = value.layout.tileCount;
    const tileSize = value.layout.tileSizeMeters;
    if (![dimensions, tileCount].every((entry) => (
        Array.isArray(entry) && entry.length === 2
        && entry.every((component) => Number.isSafeInteger(component) && component > 0)
    )) || !Array.isArray(tileSize) || tileSize.length !== 2
        || tileSize.some((entry) => !Number.isFinite(entry) || entry <= 0)
        || value.layout.layerCount !== tileCount[0] * tileCount[1]
        || value.tiles.length !== value.layout.layerCount) {
        throw new TypeError('native cutout field layout dimensions are invalid');
    }
    return value;
}

function describeTexture(texture) {
    const image = texture.image ?? texture.source?.data ?? null;
    return {
        anisotropy: texture.anisotropy,
        flipY: texture.flipY,
        generateMipmaps: texture.generateMipmaps,
        height: Number(image?.height),
        magFilter: texture.magFilter,
        matrix: texture.matrix?.toArray?.() ?? null,
        minFilter: texture.minFilter,
        premultiplyAlpha: texture.premultiplyAlpha,
        type: texture.type,
        width: Number(image?.width),
        wrapS: texture.wrapS,
        wrapT: texture.wrapT
    };
}

function graphicsIdentity(gl) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        renderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedRenderer: debug
            ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
        unmaskedVendor: debug
            ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
        vendor: String(gl.getParameter(gl.VENDOR)),
        version: String(gl.getParameter(gl.VERSION))
    };
}

function isCutoutMaterial(material) {
    return !!material && material.visible !== false
        && resolveThreeR183ShadowAlphaTest(
            material.alphaTest,
            material.alphaToCoverage
        ) > 0;
}

function isWorldVisible(object) {
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}

function requireSession() {
    if (activeSession === null) {
        throw new Error('no production native cutout field session is active');
    }
    return activeSession;
}

function canonicalStrings(value, label) {
    if (!Array.isArray(value) || value.length < 1
        || value.some((entry) => typeof entry !== 'string' || entry === '')) {
        throw new TypeError(`${label} must be non-empty strings`);
    }
    const sorted = [...value].sort(compareStrings);
    if (!arraysEqual(value, sorted) || new Set(value).size !== value.length) {
        throw new Error(`${label} must be canonical and unique`);
    }
    return value;
}

function nonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative integer`);
    }
    return value;
}

function positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive integer`);
    }
    return value;
}

function positiveFinite(value, label) {
    const result = finite(value, label);
    if (result <= 0) throw new RangeError(`${label} must be positive`);
    return result;
}

function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be finite`);
    }
    return value;
}

function nonEmpty(value, label) {
    if (typeof value !== 'string' || value === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}

function drainGlErrors(gl) {
    const errors = [];
    for (let index = 0; index < 32; index += 1) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        errors.push(error);
    }
    return errors;
}

function arraysEqual(left, right) {
    return left.length === right.length
        && left.every((entry, index) => entry === right[index]);
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
