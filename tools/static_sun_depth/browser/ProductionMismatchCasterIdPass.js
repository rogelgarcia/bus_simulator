// Artifact-only live-shadow caster localization for one AI 531 production case.
// This renders opaque caster IDs from tightly cropped copies of the live
// directional shadow camera. It never encodes or infers depth in color.
// @ts-check

import {isLitMaterial} from '../../../src/graphics/lighting/SceneShadowMaterials.js';
import {
    resolveThreeR183ShadowAlphaTest,
    resolveThreeR183ShadowSide
} from '../src/ThreeShadowSide.mjs';
import {
    aggregateProductionMismatchCasterSamples,
    selectProductionMismatchSamples
} from './ProductionMismatchLocalization.js';

export const PRODUCTION_MISMATCH_CASTER_ID_METHOD =
    'cropped-live-shadow-camera-rgba8-caster-id-alpha-sampler-v1';
const CROP_TEXELS = 8;

/**
 * @param {{
 *   THREE: any,
 *   city: any,
 *   engine: any,
 *   renderer: any,
 *   validationCase: any,
 *   missingOccluderCandidates: readonly any[],
 *   sampleCount: number
 * }} options
 */
export function localizeProductionMismatchCasters(options) {
    const {THREE, city, engine, renderer, validationCase} = options ?? {};
    if (!THREE || !city?.group?.traverse || !engine?.camera || !renderer?.render) {
        throw new TypeError('caster localization requires the live Three City renderer');
    }
    const light = city.sun;
    const shadow = light?.shadow;
    const sourceCamera = shadow?.camera;
    const sourceTarget = shadow?.map;
    if (!light?.isDirectionalLight || !light.castShadow || !sourceCamera?.isOrthographicCamera
        || !sourceTarget || sourceCamera.view || sourceCamera.zoom !== 1) {
        throw new Error('caster localization requires the unmodified live orthographic shadow camera');
    }
    const mapSize = [Number(sourceTarget.width), Number(sourceTarget.height)];
    if (mapSize[0] !== shadow.mapSize?.x || mapSize[1] !== shadow.mapSize?.y
        || mapSize.some((entry) => !Number.isSafeInteger(entry) || entry < CROP_TEXELS)) {
        throw new Error('caster localization live shadow-map dimensions are inconsistent');
    }
    if (shadow.radius !== 1.5 || !Number.isFinite(shadow.normalBias)
        || !Number.isFinite(shadow.bias)) {
        throw new Error('caster localization live shadow filter or bias drifted');
    }
    engine.camera.updateMatrixWorld(true);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    shadow.updateMatrices(light);
    sourceCamera.updateMatrixWorld(true);
    city.group.updateMatrixWorld(true);

    const samples = selectProductionMismatchSamples(
        options.missingOccluderCandidates,
        {
            width: renderer.getContext().drawingBufferWidth,
            height: renderer.getContext().drawingBufferHeight,
            sampleCount: options.sampleCount
        }
    );
    const framebufferSize = [
        renderer.getContext().drawingBufferWidth,
        renderer.getContext().drawingBufferHeight
    ];
    const liveCasters = collectLiveShadowCasters(city, sourceCamera);
    const idPass = createCasterIdScene(THREE, city, liveCasters);
    const renderTarget = new THREE.WebGLRenderTarget(CROP_TEXELS, CROP_TEXELS, {
        depthBuffer: true,
        format: THREE.RGBAFormat,
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        stencilBuffer: false,
        type: THREE.UnsignedByteType
    });
    renderTarget.texture.colorSpace = THREE.NoColorSpace;
    renderTarget.texture.generateMipmaps = false;
    const pixels = new Uint8Array(CROP_TEXELS * CROP_TEXELS * 4);
    const previous = snapshotRendererState(THREE, renderer);
    const localized = [];
    try {
        renderer.shadowMap.enabled = false;
        renderer.autoClear = true;
        renderer.sortObjects = false;
        renderer.setClearColor(0x000000, 0);
        for (const sample of samples) {
            const receiver = reconstructReceiver(
                THREE,
                city,
                engine.camera,
                sample.pixel,
                framebufferSize
            );
            const biasedWorldPosition = receiver.point.clone().addScaledVector(
                receiver.geometricOffsetWorldNormal,
                shadow.normalBias
            );
            const shadowCoordinate = biasedWorldPosition.clone().applyMatrix4(shadow.matrix);
            const comparisonDepthNormalized = shadowCoordinate.z + shadow.bias;
            if (!(shadowCoordinate.x > 0 && shadowCoordinate.x < 1
                && shadowCoordinate.y > 0 && shadowCoordinate.y < 1
                && comparisonDepthNormalized > 0 && comparisonDepthNormalized < 1)) {
                throw new Error(
                    `caster localization receiver escaped the live shadow map at ${sample.pixel}`
                );
            }
            const sourceCoordinate = [
                shadowCoordinate.x * mapSize[0],
                shadowCoordinate.y * mapSize[1]
            ];
            const footprint = createVogelLinearFootprint(
                sample.pixel,
                sourceCoordinate,
                shadow.radius
            );
            const crop = requireCropWindow(footprint, sourceCoordinate, mapSize);
            const cropCamera = createCropCamera(
                sourceCamera,
                crop,
                mapSize,
                comparisonDepthNormalized
            );
            renderer.setRenderTarget(renderTarget);
            renderer.clear(true, true, true);
            renderer.render(idPass.scene, cropCamera);
            renderer.readRenderTargetPixels(
                renderTarget,
                0,
                0,
                CROP_TEXELS,
                CROP_TEXELS,
                pixels
            );
            const readId = (texel) => decodeIdPixel(
                pixels,
                texel[0] - crop.x,
                texel[1] - crop.y
            );
            const centerTexel = sourceCoordinate.map(Math.floor);
            const centerId = readId(centerTexel);
            const weightedIds = new Map();
            const vogelSamples = footprint.map((vogel) => Object.freeze({
                sampleIndex: vogel.sampleIndex,
                disk: Object.freeze([...vogel.disk]),
                lookupCoordinate: Object.freeze([...vogel.lookupCoordinate]),
                taps: Object.freeze(vogel.taps.map((tap) => {
                    const casterId = readId(tap.texel);
                    if (casterId !== 0) {
                        weightedIds.set(
                            casterId,
                            (weightedIds.get(casterId) ?? 0) + tap.linearWeight / 5
                        );
                    }
                    return Object.freeze({
                        casterId,
                        caster: idPass.metadataById.get(casterId) ?? null,
                        linearWeight: tap.linearWeight,
                        sourceShadowTexel: Object.freeze([...tap.texel])
                    });
                }))
            }));
            const dominant = [...weightedIds]
                .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] ?? null;
            const geometricFirst = findGeometricFirstHit(
                THREE,
                idPass.scene,
                idPass.metadataById,
                sourceCamera,
                shadowCoordinate,
                comparisonDepthNormalized
            );
            localized.push(Object.freeze({
                ...sample,
                receiver: Object.freeze({
                    materialName: String(receiver.material?.name || ''),
                    objectName: String(receiver.object?.name || ''),
                    objectPath: createObjectPath(receiver.object, city.group),
                    surfaceWorldPosition: Object.freeze(receiver.point.toArray()),
                    biasedWorldPosition: Object.freeze(biasedWorldPosition.toArray())
                }),
                liveShadow: Object.freeze({
                    comparisonDepthNormalized,
                    sourceCoordinate: Object.freeze(sourceCoordinate),
                    centerSourceShadowTexel: Object.freeze(centerTexel),
                    cropSourceShadowTexels: Object.freeze([
                        crop.x,
                        crop.y,
                        CROP_TEXELS,
                        CROP_TEXELS
                    ]),
                    centerAlphaEvaluatedCaster:
                        idPass.metadataById.get(centerId) ?? null,
                    centerAlphaEvaluatedCasterId: centerId,
                    vogelSamples: Object.freeze(vogelSamples)
                }),
                geometricFirstCaster: geometricFirst,
                dominantAlphaEvaluatedCaster:
                    dominant ? idPass.metadataById.get(dominant[0]) ?? null : null,
                dominantAlphaEvaluatedCasterId: dominant?.[0] ?? 0,
                dominantAlphaEvaluatedOcclusionWeight: dominant?.[1] ?? 0
            }));
        }
    } finally {
        restoreRendererState(renderer, previous);
        renderTarget.dispose();
        idPass.dispose();
    }
    const indexed = localized.map((sample, sampleIndex) => Object.freeze({
        ...sample,
        sampleIndex
    }));
    return Object.freeze({
        schema: 'ai531-production-live-shadow-caster-id-pass-v1',
        validationCaseId: validationCase?.id,
        productionEligible: false,
        method: PRODUCTION_MISMATCH_CASTER_ID_METHOD,
        colorAttachmentMeaning: 'opaque-caster-id-only-no-depth-encoding-v1',
        geometricFirstMethod:
            'shadow-camera-raycaster-shadow-side-geometric-alpha-ignored-v1',
        alphaEvaluatedFirstMethod:
            'cropped-shadow-camera-depth-test-live-map-alpha-sampler-v1',
        alphaSamplerLevel:
            'implicit-derivative-live-texture-minfilter-mip-anisotropy-v1',
        pcfFootprint:
            'five-screen-rotated-vogel-lookups-four-linear-source-texels-each-v1',
        depthColorInferenceUsed: false,
        cropTexels: Object.freeze([CROP_TEXELS, CROP_TEXELS]),
        liveCasterMeshCount: liveCasters.length,
        casterMaterialSlotCount: idPass.metadataById.size,
        aggregate: aggregateProductionMismatchCasterSamples(indexed),
        samples: Object.freeze(indexed)
    });
}

function collectLiveShadowCasters(city, sourceCamera) {
    const casters = [];
    city.group.traverse((object) => {
        if (!object?.isMesh || object.castShadow !== true || !object.geometry
            || !isWorldVisible(object) || !object.layers.test(sourceCamera.layers)) return;
        if (object.isSkinnedMesh || object.isBatchedMesh
            || object.customDepthMaterial || object.customDistanceMaterial) {
            throw new Error(`unsupported custom/skinned live caster '${object.name || object.type}'`);
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material || material.alphaHash === true || material.displacementMap) {
                throw new Error(
                    `unsupported alpha-hash/displaced live caster '${object.name || object.type}'`
                );
            }
        }
        casters.push(object);
    });
    if (casters.length < 1) throw new Error('live shadow caster inventory is empty');
    return casters;
}

function createCasterIdScene(THREE, city, casters) {
    const scene = new THREE.Scene();
    const metadataById = new Map();
    const materials = [];
    const clones = [];
    let nextId = 1;
    for (const source of casters) {
        const sourceMaterials = Array.isArray(source.material)
            ? source.material : [source.material];
        const ids = [];
        const idMaterials = sourceMaterials.map((material, materialIndex) => {
            if (nextId > 0xffffff) throw new Error('caster-ID space exhausted');
            const id = nextId++;
            ids.push(id);
            const idMaterial = createIdMaterial(THREE, source, material, id);
            materials.push(idMaterial);
            metadataById.set(id, Object.freeze(describeCaster(
                THREE,
                city,
                source,
                material,
                materialIndex,
                id
            )));
            return idMaterial;
        });
        const cloneMaterial = Array.isArray(source.material) ? idMaterials : idMaterials[0];
        const clone = source.isInstancedMesh
            ? new THREE.InstancedMesh(source.geometry, cloneMaterial, source.count)
            : new THREE.Mesh(source.geometry, cloneMaterial);
        if (source.isInstancedMesh) {
            clone.instanceMatrix = source.instanceMatrix;
            clone.instanceColor = source.instanceColor;
            clone.morphTexture = source.morphTexture;
            clone.count = source.count;
        }
        if (source.morphTargetInfluences) {
            clone.morphTargetInfluences = [...source.morphTargetInfluences];
            clone.morphTargetDictionary = {...source.morphTargetDictionary};
        }
        clone.matrixAutoUpdate = false;
        clone.matrix.copy(source.matrixWorld);
        clone.matrixWorld.copy(source.matrixWorld);
        clone.castShadow = false;
        clone.receiveShadow = false;
        clone.visible = true;
        clone.userData = {ai531CasterIds: ids};
        scene.add(clone);
        clones.push(clone);
    }
    scene.updateMatrixWorld(true);
    return {
        scene,
        metadataById,
        dispose() {
            for (const clone of clones) clone.removeFromParent();
            for (const material of materials) material.dispose();
        }
    };
}

function createIdMaterial(THREE, object, source, id) {
    const alphaTest = resolveThreeR183ShadowAlphaTest(
        source.alphaTest,
        source.alphaToCoverage
    );
    const material = new THREE.MeshBasicMaterial({
        alphaMap: source.alphaMap ?? null,
        alphaTest,
        blending: THREE.NoBlending,
        color: new THREE.Color(
            ((id >>> 16) & 0xff) / 255,
            ((id >>> 8) & 0xff) / 255,
            (id & 0xff) / 255
        ),
        depthFunc: THREE.LessEqualDepth,
        depthTest: true,
        depthWrite: true,
        map: source.map ?? null,
        opacity: Number.isFinite(source.opacity) ? source.opacity : 1,
        side: resolveThreeR183ShadowSide(source.side, source.shadowSide),
        toneMapped: false,
        transparent: false,
        vertexColors: source.vertexColors === true,
        wireframe: source.wireframe === true
    });
    material.alphaToCoverage = false;
    material.clippingPlanes = source.clipShadows === true ? source.clippingPlanes : null;
    material.clipIntersection = source.clipIntersection === true;
    material.clipShadows = source.clipShadows === true;
    material.onBeforeCompile = (shader) => {
        const token = '#include <opaque_fragment>';
        if (!shader.fragmentShader.includes(token)) {
            throw new Error('Three MeshBasic opaque fragment contract drifted');
        }
        shader.fragmentShader = shader.fragmentShader.replace(token, `
            diffuseColor = vec4( diffuse, 1.0 );
            outgoingLight = diffuse;
            ${token}
        `);
    };
    material.customProgramCacheKey = () => 'ai531-caster-id-alpha-sampler-v1';
    material.name = `ai531-caster-id:${id}:${object.name || object.type}`;
    return material;
}

function describeCaster(THREE, city, object, material, materialIndex, casterId) {
    const alphaTest = resolveThreeR183ShadowAlphaTest(
        material.alphaTest,
        material.alphaToCoverage
    );
    const isFoliage = object.userData?.isFoliage === true
        || material.userData?.isFoliage === true
        || /(?:foliage|leaves?|tree)/i.test(`${object.name} ${material.name}`);
    const forcedOpaque = object.userData?.mergeShadowAsOpaque === true
        || object.userData?.isShadowCasterMerge === true
        || material.userData?.isShadowCasterMerge === true;
    const coverageMode = forcedOpaque
        ? 'forced_opaque'
        : alphaTest > 0 ? 'cutout' : 'opaque';
    return {
        casterId,
        objectName: String(object.name || object.type || ''),
        objectPath: createObjectPath(object, city.group),
        objectType: String(object.type || ''),
        objectUuid: String(object.uuid || ''),
        instanced: object.isInstancedMesh === true,
        instanceCount: object.isInstancedMesh ? object.count : 1,
        materialIndex,
        materialName: String(material.name || material.type || ''),
        materialType: String(material.type || ''),
        materialUuid: String(material.uuid || ''),
        coverageMode,
        isFoliage,
        foliageEvidence: Object.freeze({
            materialFlag: material.userData?.isFoliage === true,
            nameHeuristic: /(?:foliage|leaves?|tree)/i.test(
                `${object.name} ${material.name}`
            ),
            objectFlag: object.userData?.isFoliage === true
        }),
        alpha: Object.freeze({
            authoredAlphaTest: Number(material.alphaTest) || 0,
            alphaToCoverage: material.alphaToCoverage === true,
            effectiveShadowAlphaTest: alphaTest,
            hasAlphaMap: Boolean(material.alphaMap),
            hasMap: Boolean(material.map),
            opacity: Number.isFinite(material.opacity) ? material.opacity : 1
        }),
        sampler: Object.freeze({
            alphaMap: describeTexture(THREE, material.alphaMap),
            map: describeTexture(THREE, material.map)
        }),
        shadowSide: Object.freeze({
            authoredMaterialSide: material.side,
            authoredShadowSide: material.shadowSide ?? null,
            effectiveLiveShadowSide:
                resolveThreeR183ShadowSide(material.side, material.shadowSide)
        })
    };
}

function describeTexture(THREE, texture) {
    if (!texture) return null;
    const image = texture.image ?? texture.source?.data ?? null;
    return Object.freeze({
        anisotropy: texture.anisotropy,
        flipY: texture.flipY,
        generateMipmaps: texture.generateMipmaps,
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
        minFilterName: texture.minFilter === THREE.LinearMipmapLinearFilter
            ? 'LinearMipmapLinearFilter'
            : texture.minFilter === THREE.LinearFilter ? 'LinearFilter'
                : String(texture.minFilter),
        name: String(texture.name || ''),
        source: String(texture.userData?.sourcePath ?? texture.userData?.url ?? ''),
        size: Object.freeze([
            Number(image?.width) || 0,
            Number(image?.height) || 0
        ]),
        uuid: String(texture.uuid || ''),
        wrapS: texture.wrapS,
        wrapT: texture.wrapT
    });
}

function reconstructReceiver(THREE, city, camera, pixel, framebufferSize) {
    const [width, height] = framebufferSize;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
        (pixel[0] + 0.5) / width * 2 - 1,
        (pixel[1] + 0.5) / height * 2 - 1
    ), camera);
    const hit = raycaster.intersectObject(city.group, true).find((candidate) => {
        if (candidate.object?.receiveShadow !== true || !candidate.face) return false;
        const materials = Array.isArray(candidate.object.material)
            ? candidate.object.material : [candidate.object.material];
        return isLitMaterial(materials[candidate.face.materialIndex] ?? materials[0]);
    });
    if (!hit?.face || !hit.object?.geometry?.attributes?.normal) {
        throw new Error(`caster localization found no supported receiver at ${pixel}`);
    }
    const object = hit.object;
    const geometry = object.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const worldMatrix = object.matrixWorld.clone();
    if (object.isInstancedMesh && Number.isSafeInteger(hit.instanceId)) {
        const instance = new THREE.Matrix4();
        object.getMatrixAt(hit.instanceId, instance);
        worldMatrix.multiply(instance);
    }
    const inverseWorld = worldMatrix.clone().invert();
    const localPoint = hit.point.clone().applyMatrix4(inverseWorld);
    const readVector = (attribute, index) => new THREE.Vector3(
        attribute.getX(index),
        attribute.getY(index),
        attribute.getZ(index)
    );
    const localA = readVector(position, hit.face.a);
    const localB = readVector(position, hit.face.b);
    const localC = readVector(position, hit.face.c);
    const barycentric = new THREE.Vector3();
    THREE.Triangle.getBarycoord(localPoint, localA, localB, localC, barycentric);
    if (![barycentric.x, barycentric.y, barycentric.z].every(Number.isFinite)) {
        throw new Error('caster localization receiver barycentric reconstruction failed');
    }
    const materialList = Array.isArray(object.material) ? object.material : [object.material];
    const material = materialList[hit.face.materialIndex] ?? materialList[0];
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
    const sideSign = material?.side === THREE.BackSide ? -1 : 1;
    const normals = [hit.face.a, hit.face.b, hit.face.c].map((index) => (
        readVector(normal, index).applyNormalMatrix(normalMatrix).normalize()
            .multiplyScalar(sideSign)
    ));
    const geometricOffsetWorldNormal = new THREE.Vector3()
        .addScaledVector(normals[0], barycentric.x)
        .addScaledVector(normals[1], barycentric.y)
        .addScaledVector(normals[2], barycentric.z);
    return {object, material, point: hit.point, geometricOffsetWorldNormal};
}

function createVogelLinearFootprint(pixel, sourceCoordinate, radiusTexels) {
    const noise = interleavedGradientNoise([pixel[0] + 0.5, pixel[1] + 0.5]);
    const phi = noise * Math.PI * 2;
    const samples = [];
    for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
        const disk = vogelDiskSample(sampleIndex, 5, phi);
        const lookupCoordinate = [
            sourceCoordinate[0] + disk[0] * radiusTexels,
            sourceCoordinate[1] + disk[1] * radiusTexels
        ];
        const linear = [lookupCoordinate[0] - 0.5, lookupCoordinate[1] - 0.5];
        const base = [Math.floor(linear[0]), Math.floor(linear[1])];
        const fraction = [linear[0] - base[0], linear[1] - base[1]];
        samples.push({
            sampleIndex,
            disk,
            lookupCoordinate,
            taps: [
                {texel: [base[0], base[1]], linearWeight: (1 - fraction[0]) * (1 - fraction[1])},
                {texel: [base[0] + 1, base[1]], linearWeight: fraction[0] * (1 - fraction[1])},
                {texel: [base[0], base[1] + 1], linearWeight: (1 - fraction[0]) * fraction[1]},
                {texel: [base[0] + 1, base[1] + 1], linearWeight: fraction[0] * fraction[1]}
            ]
        });
    }
    return samples;
}

function requireCropWindow(footprint, sourceCoordinate, mapSize) {
    const coordinates = [sourceCoordinate.map(Math.floor)];
    for (const sample of footprint) {
        for (const tap of sample.taps) coordinates.push(tap.texel);
    }
    const minimum = [
        Math.min(...coordinates.map((entry) => entry[0])),
        Math.min(...coordinates.map((entry) => entry[1]))
    ];
    const maximum = [
        Math.max(...coordinates.map((entry) => entry[0])),
        Math.max(...coordinates.map((entry) => entry[1]))
    ];
    if (maximum[0] - minimum[0] + 1 > CROP_TEXELS
        || maximum[1] - minimum[1] + 1 > CROP_TEXELS) {
        throw new Error('live Vogel footprint exceeds bounded caster-ID crop');
    }
    const origin = [0, 1].map((axis) => Math.max(0, Math.min(
        mapSize[axis] - CROP_TEXELS,
        Math.floor((minimum[axis] + maximum[axis] + 1 - CROP_TEXELS) / 2)
    )));
    if (coordinates.some((entry) => entry[0] < origin[0]
        || entry[0] >= origin[0] + CROP_TEXELS
        || entry[1] < origin[1]
        || entry[1] >= origin[1] + CROP_TEXELS)) {
        throw new Error('live Vogel footprint escaped the caster-ID crop');
    }
    return {x: origin[0], y: origin[1]};
}

function createCropCamera(source, crop, mapSize, comparisonDepthNormalized) {
    const camera = source.clone();
    const width = source.right - source.left;
    const height = source.top - source.bottom;
    camera.left = source.left + crop.x / mapSize[0] * width;
    camera.right = source.left + (crop.x + CROP_TEXELS) / mapSize[0] * width;
    camera.bottom = source.bottom + crop.y / mapSize[1] * height;
    camera.top = source.bottom + (crop.y + CROP_TEXELS) / mapSize[1] * height;
    camera.near = source.near;
    camera.far = source.near
        + comparisonDepthNormalized * (source.far - source.near);
    if (!(camera.far > camera.near + 1e-6 && camera.far < source.far)) {
        throw new Error('caster-ID occluder clip plane is invalid');
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
}

function findGeometricFirstHit(
    THREE,
    scene,
    metadataById,
    sourceCamera,
    shadowCoordinate,
    comparisonDepthNormalized
) {
    const ndc = [shadowCoordinate.x * 2 - 1, shadowCoordinate.y * 2 - 1];
    const near = new THREE.Vector3(ndc[0], ndc[1], -1).unproject(sourceCamera);
    const end = new THREE.Vector3(
        ndc[0],
        ndc[1],
        comparisonDepthNormalized * 2 - 1
    ).unproject(sourceCamera);
    const raycaster = new THREE.Raycaster(
        near,
        end.clone().sub(near).normalize(),
        0,
        near.distanceTo(end)
    );
    const hit = raycaster.intersectObjects(scene.children, false)[0];
    if (!hit?.object) return null;
    const ids = hit.object.userData?.ai531CasterIds;
    const materialIndex = hit.face?.materialIndex ?? 0;
    return metadataById.get(ids?.[materialIndex] ?? ids?.[0] ?? 0) ?? null;
}

function snapshotRendererState(THREE, renderer) {
    return {
        activeCubeFace: renderer.getActiveCubeFace(),
        activeMipmapLevel: renderer.getActiveMipmapLevel(),
        autoClear: renderer.autoClear,
        clearAlpha: renderer.getClearAlpha(),
        clearColor: renderer.getClearColor(new THREE.Color()).clone(),
        renderTarget: renderer.getRenderTarget(),
        shadowEnabled: renderer.shadowMap.enabled,
        sortObjects: renderer.sortObjects
    };
}

function restoreRendererState(renderer, previous) {
    renderer.setRenderTarget(
        previous.renderTarget,
        previous.activeCubeFace,
        previous.activeMipmapLevel
    );
    renderer.autoClear = previous.autoClear;
    renderer.shadowMap.enabled = previous.shadowEnabled;
    renderer.sortObjects = previous.sortObjects;
    renderer.setClearColor(previous.clearColor, previous.clearAlpha);
}

function decodeIdPixel(pixels, x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
        || x < 0 || x >= CROP_TEXELS || y < 0 || y >= CROP_TEXELS) {
        throw new Error('caster-ID read escaped its bounded crop');
    }
    const offset = (y * CROP_TEXELS + x) * 4;
    return pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2];
}

function createObjectPath(object, root) {
    const segments = [];
    let current = object;
    while (current && current !== root) {
        const siblingIndex = current.parent?.children?.indexOf(current) ?? -1;
        segments.push(`${current.name || current.type || 'Object3D'}[${siblingIndex}]`);
        current = current.parent;
    }
    if (current !== root) return `detached/${segments.reverse().join('/')}`;
    return `${root.name || 'city'}/${segments.reverse().join('/')}`;
}

function isWorldVisible(object) {
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}

function interleavedGradientNoise(position) {
    const value = 52.9829189 * ((position[0] * 0.06711056 + position[1] * 0.00583715) % 1);
    return ((value % 1) + 1) % 1;
}

function vogelDiskSample(sampleIndex, sampleCount, phi) {
    const radius = Math.sqrt((sampleIndex + 0.5) / sampleCount);
    const theta = sampleIndex * 2.399963229728653 + phi;
    return [Math.cos(theta) * radius, Math.sin(theta) * radius];
}
