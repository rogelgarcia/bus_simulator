// Cutout-only sparse depth evidence from the live Three r183 shadow target.
// @ts-check

import {resolveThreeR183ShadowAlphaTest} from '../src/ThreeShadowSide.mjs';
import {captureNativeShadowDepthTextureSamples} from './NativeShadowDepthTextureCapture.js';

export const PRODUCTION_ALPHA_CUTOUT_LIVE_DEPTH_CAPTURE_SCHEMA =
    'ai531-production-alpha-cutout-live-depth-capture-v1';
export const PRODUCTION_ALPHA_CUTOUT_LIVE_DEPTH_CAPTURE_METHOD =
    'three-r183-cutout-only-native-shadow-depth-sparse-samples-v1';

/**
 * Temporarily suppress every opaque static caster, refresh the original Three
 * directional shadow target, and read only the requested native depth texels.
 * The original caster references and a full live shadow map are restored before
 * this function returns.
 *
 * @param {{
 *   THREE: any,
 *   city: any,
 *   engine: any,
 *   texels: Array<[number, number]>,
 *   expectedCutoutCasterCount?: number,
 *   label?: string
 * }} options
 */
export function captureProductionAlphaCutoutLiveShadowDepth(options) {
    const {THREE, city, engine} = options ?? {};
    const renderer = engine?.renderer;
    const renderFrame = () => engine.renderFrame();
    if (!THREE?.MeshBasicMaterial || !city?.group?.traverse
        || !renderer?.properties?.get || typeof engine?.renderFrame !== 'function') {
        throw new TypeError(
            'cutout live-depth capture requires Three, City, and the live renderer'
        );
    }
    const light = city.sun;
    const shadow = light?.shadow;
    const camera = shadow?.camera;
    const target = shadow?.map;
    if (!light?.isDirectionalLight || !light.castShadow
        || !camera?.isOrthographicCamera || !target?.isWebGLRenderTarget
        || !target.depthTexture?.isDepthTexture) {
        throw new Error(
            'cutout live-depth capture requires an allocated directional shadow depth texture'
        );
    }
    if (renderer.shadowMap?.enabled !== true) {
        throw new Error('cutout live-depth capture requires enabled Three shadow maps');
    }
    const expectedCutoutCasterCount = options.expectedCutoutCasterCount === undefined
        ? null
        : requirePositiveSafeInteger(
            options.expectedCutoutCasterCount,
            'expectedCutoutCasterCount'
        );
    const label = options.label === undefined
        ? 'production-alpha-cutout-live-depth'
        : requireNonEmptyString(options.label, 'label');
    const casters = collectCasterSnapshots(city.group, camera);
    const cutoutCasterMaterialSlotCount = casters.reduce(
        (sum, caster) => sum + caster.cutoutMaterialSlotCount,
        0
    );
    if (cutoutCasterMaterialSlotCount < 1) {
        throw new Error('cutout live-depth capture found no alpha-tested caster material');
    }
    if (expectedCutoutCasterCount !== null
        && cutoutCasterMaterialSlotCount !== expectedCutoutCasterCount) {
        throw new Error(
            `cutout live-depth capture found ${cutoutCasterMaterialSlotCount} caster slots; `
            + `expected ${expectedCutoutCasterCount}`
        );
    }

    const discardMaterial = new THREE.MeshBasicMaterial();
    discardMaterial.name = 'ai531-cutout-evidence-opaque-discard';
    discardMaterial.visible = false;
    const gl = renderer.getContext();
    const shadowState = {
        globalAutoUpdate: renderer.shadowMap.autoUpdate,
        globalNeedsUpdate: renderer.shadowMap.needsUpdate,
        lightAutoUpdate: shadow.autoUpdate,
        lightNeedsUpdate: shadow.needsUpdate
    };
    let capture = null;
    let primaryError = null;
    let restorationError = null;
    try {
        isolateCutoutCasters(casters, discardMaterial);
        refreshShadowMap(renderer, shadow, renderFrame, gl);
        const handles = resolveNativeShadowTarget(renderer, target);
        capture = captureNativeShadowDepthTextureSamples({
            gl,
            renderer,
            framebuffer: handles.framebuffer,
            depthTexture: handles.depthTexture,
            textureWidth: target.width,
            textureHeight: target.height,
            texels: options.texels,
            maximumTexels: 1_000_000,
            label
        });
    } catch (error) {
        primaryError = error;
    } finally {
        try {
            restoreCasters(casters);
            refreshShadowMap(renderer, shadow, renderFrame, gl);
        } catch (error) {
            restorationError = error;
        } finally {
            renderer.shadowMap.autoUpdate = shadowState.globalAutoUpdate;
            renderer.shadowMap.needsUpdate = shadowState.globalNeedsUpdate;
            shadow.autoUpdate = shadowState.lightAutoUpdate;
            shadow.needsUpdate = shadowState.lightNeedsUpdate;
            discardMaterial.dispose();
        }
    }
    const stateDifferences = compareRestoredCasters(casters);
    if (stateDifferences.length > 0 && restorationError === null) {
        restorationError = new Error(
            `cutout live-depth caster state differs after restoration: ${stateDifferences.join(', ')}`
        );
    }
    if (restorationError) {
        throw new Error(
            'cutout live-depth capture could not restore the live scene and shadow map',
            {cause: primaryError ?? restorationError}
        );
    }
    if (primaryError) throw primaryError;
    if (!capture) throw new Error('cutout live-depth capture produced no native evidence');

    const liveOccupancy = new Uint8Array(capture.depthValues.length);
    const sampleFirstHitDepthMeters = new Float32Array(capture.depthValues.length);
    let liveOccupiedSampleCount = 0;
    const depthRangeMeters = camera.far - camera.near;
    if (!Number.isFinite(camera.near) || camera.near < 0
        || !Number.isFinite(depthRangeMeters) || depthRangeMeters <= 0) {
        throw new Error('cutout live-depth shadow camera range is invalid');
    }
    for (let index = 0; index < capture.depthValues.length; index += 1) {
        const normalizedDepth = capture.depthValues[index];
        if (normalizedDepth < 1) {
            liveOccupancy[index] = 1;
            liveOccupiedSampleCount += 1;
            sampleFirstHitDepthMeters[index] = Math.fround(
                camera.near + normalizedDepth * depthRangeMeters
            );
        }
    }
    return {
        schema: PRODUCTION_ALPHA_CUTOUT_LIVE_DEPTH_CAPTURE_SCHEMA,
        method: PRODUCTION_ALPHA_CUTOUT_LIVE_DEPTH_CAPTURE_METHOD,
        status: 'captured_and_restored',
        cutoutCasterMaterialSlotCount,
        isolatedCasterMeshCount: casters.length,
        liveOccupiedSampleCount,
        sampleCount: capture.plan.texelCount,
        shadowCamera: {
            farMeters: camera.far,
            nearMeters: camera.near,
            projection: 'orthographic-linear-depth-v1'
        },
        shadowMapSizeTexels: [target.width, target.height],
        liveOccupancy,
        sampleFirstHitDepthMeters,
        nativeCapture: capture,
        stateRestoration: 'verified'
    };
}

function collectCasterSnapshots(root, camera) {
    const snapshots = [];
    root.updateMatrixWorld?.(true);
    root.traverse((object) => {
        if (!object?.isMesh || object.castShadow !== true || !object.geometry
            || !isWorldVisible(object) || !object.layers?.test?.(camera.layers)) return;
        if (object.isSkinnedMesh || object.isBatchedMesh
            || object.customDepthMaterial || object.customDistanceMaterial) {
            throw new Error(
                `cutout live-depth capture does not support custom/skinned caster '${object.name || object.type}'`
            );
        }
        const materials = Array.isArray(object.material)
            ? object.material : [object.material];
        const cutoutMask = materials.map(isCutoutMaterial);
        snapshots.push({
            object,
            originalCastShadow: object.castShadow,
            originalMaterial: object.material,
            materials,
            cutoutMask,
            cutoutMaterialSlotCount: cutoutMask.filter(Boolean).length
        });
    });
    if (snapshots.length < 1) {
        throw new Error('cutout live-depth capture found no live static caster mesh');
    }
    return snapshots;
}

function isCutoutMaterial(material) {
    return !!material && material.visible !== false
        && resolveThreeR183ShadowAlphaTest(
            material.alphaTest,
            material.alphaToCoverage
        ) > 0;
}

function isolateCutoutCasters(casters, discardMaterial) {
    for (const caster of casters) {
        if (caster.cutoutMaterialSlotCount === 0) {
            caster.object.castShadow = false;
        } else if (Array.isArray(caster.originalMaterial)) {
            caster.object.material = caster.materials.map((material, index) => (
                caster.cutoutMask[index] ? material : discardMaterial
            ));
        }
    }
}

function restoreCasters(casters) {
    for (const caster of casters) {
        caster.object.castShadow = caster.originalCastShadow;
        caster.object.material = caster.originalMaterial;
    }
}

function compareRestoredCasters(casters) {
    const differences = [];
    for (let index = 0; index < casters.length; index += 1) {
        const caster = casters[index];
        if (caster.object.castShadow !== caster.originalCastShadow) {
            differences.push(`casters[${index}].castShadow`);
        }
        if (caster.object.material !== caster.originalMaterial) {
            differences.push(`casters[${index}].material`);
        }
    }
    return differences;
}

function refreshShadowMap(renderer, shadow, renderFrame, gl) {
    renderer.shadowMap.needsUpdate = true;
    shadow.needsUpdate = true;
    renderFrame();
    gl.finish();
}

function resolveNativeShadowTarget(renderer, target) {
    const targetProperties = renderer.properties.get(target);
    const depthProperties = renderer.properties.get(target.depthTexture);
    const framebuffer = targetProperties?.__webglFramebuffer;
    const depthTexture = depthProperties?.__webglTexture;
    if (!framebuffer || Array.isArray(framebuffer) || !depthTexture) {
        throw new Error(
            'cutout live-depth capture could not resolve Three native shadow attachment handles'
        );
    }
    return {framebuffer, depthTexture};
}

function isWorldVisible(object) {
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}

function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return Number(value);
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}
