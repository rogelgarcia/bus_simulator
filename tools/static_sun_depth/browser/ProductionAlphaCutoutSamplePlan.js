// Deterministic all-caster light-texel candidates and authenticated selection.
// @ts-check

import {resolveThreeR183ShadowAlphaTest} from '../src/ThreeShadowSide.mjs';
import {createProductionLiveTexelPhaseEvidence} from './ProductionTexelPhase.js';

export const PRODUCTION_ALPHA_CUTOUT_CANDIDATE_PLAN_SCHEMA =
    'ai531-production-alpha-cutout-candidate-plan-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_SCHEMA =
    'ai531-production-alpha-cutout-sample-plan-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD =
    'all-cutout-casters-projected-light-texel-coverage-v1';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_SCHEMA =
    'ai531-production-alpha-cutout-sample-plan-v2';
export const PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD =
    'per-profile-in-out-cutout-casters-projected-light-texel-coverage-v2';
export const PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_TOLERANCE_METERS = 5e-3;
export const PRODUCTION_ALPHA_CUTOUT_DIAGNOSTIC_SAMPLE_PLAN_SCHEMA =
    'ai531-production-alpha-cutout-in-coverage-diagnostic-plan-v1';
export const PRODUCTION_ALPHA_CUTOUT_BAKE_SAMPLE_REQUEST_SCHEMA =
    'ai531-production-alpha-cutout-bake-sample-request-v1';
export const PRODUCTION_ALPHA_CUTOUT_BAKE_SAMPLE_REQUEST_V2_SCHEMA =
    'ai531-production-alpha-cutout-bake-sample-request-v2';
export const PRODUCTION_ALPHA_CUTOUT_DIAGNOSTIC_BAKE_SAMPLE_REQUEST_SCHEMA =
    'ai531-production-alpha-cutout-in-coverage-bake-diagnostic-request-v1';
export const PRODUCTION_ALPHA_CUTOUT_DEPTH_REFERENCE =
    'source-shadow-camera-distance-meters-v1';

/**
 * Project every cutout geometry-group triangle centroid into the allocated
 * Three shadow map. One candidate is retained per caster/texel, with the
 * closest geometric depth retained when projected triangles overlap.
 *
 * @param {{
 *   THREE: any,
 *   city: any,
 *   descriptor: any,
 *   lightingProfileId: string,
 *   expectedCasterIds?: readonly string[]
 * }} options
 */
export function createProductionAlphaCutoutCandidatePlan(options) {
    const {THREE, city} = options ?? {};
    const light = city?.sun;
    const shadow = light?.shadow;
    const camera = shadow?.camera;
    const target = shadow?.map;
    if (!THREE?.Vector3 || !city?.group?.traverse || !light?.isDirectionalLight
        || !camera?.isOrthographicCamera || !target?.isWebGLRenderTarget) {
        throw new TypeError(
            'alpha-cutout candidate projection requires the live Three City shadow map'
        );
    }
    const lightingProfileId = requireNonEmptyString(
        options.lightingProfileId,
        'lightingProfileId'
    );
    city.group.updateMatrixWorld(true);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    shadow.updateMatrices(light);
    camera.updateMatrixWorld(true);
    const matrix = camera.matrixWorld.elements;
    const cacheDepthAxisWorld = requireVector3(
        options.descriptor?.identity?.basis?.depthAxisWorld,
        'descriptor.identity.basis.depthAxisWorld'
    );
    const cacheOriginWorld = requireVector3(
        options.descriptor?.identity?.basis?.originWorld,
        'descriptor.identity.basis.originWorld'
    );
    const sourceCameraCenterWorld = [matrix[12], matrix[13], matrix[14]];
    const sourceCameraViewDirectionWorld = [-matrix[8], -matrix[9], -matrix[10]];
    const sourceCameraDepthAxisMaximumError = Math.max(...cacheDepthAxisWorld.map(
        (component, index) => Math.abs(
            component - sourceCameraViewDirectionWorld[index]
        )
    ));
    if (sourceCameraDepthAxisMaximumError > 1e-9) {
        throw new Error(
            'Prepared live source shadow depth axis differs from the active descriptor depth axis'
        );
    }
    const sourceCameraOriginDepthMetersInCacheBasis = dot3(
        subtract3(sourceCameraCenterWorld, cacheOriginWorld),
        cacheDepthAxisWorld
    );
    const phaseEvidence = createProductionLiveTexelPhaseEvidence({
        descriptor: options.descriptor,
        sourceCameraBoundsMeters: {
            bottom: camera.bottom,
            left: camera.left,
            right: camera.right,
            top: camera.top
        },
        sourceCameraCenterWorld,
        sourceMapRightAxisWorld: [matrix[0], matrix[1], matrix[2]],
        sourceMapUpAxisWorld: [matrix[4], matrix[5], matrix[6]]
    });
    const layout = options.descriptor.identity.layout;
    const cacheMapSizeTexels = [
        layout.tileCount[0] * layout.interiorTexels[0],
        layout.tileCount[1] * layout.interiorTexels[1]
    ];

    const casterCandidates = [];
    city.group.traverse((object) => {
        if (!object?.isMesh || object.castShadow !== true || !object.geometry
            || !isWorldVisible(object) || !object.layers?.test?.(camera.layers)) return;
        const materials = Array.isArray(object.material)
            ? object.material : [object.material];
        const groups = object.geometry.groups?.length > 0
            ? object.geometry.groups
            : [{start: 0, count: drawRangeCount(object.geometry), materialIndex: 0}];
        groups.forEach((group, groupIndex) => {
            const material = materials[group.materialIndex ?? 0];
            if (!isCutoutMaterial(material)) return;
            const casterId = createRuntimeTreeCasterId(
                city.group,
                object,
                groupIndex
            );
            const candidates = projectGeometryGroupCandidates(
                THREE,
                object,
                group,
                shadow.matrix,
                [target.width, target.height]
            );
            casterCandidates.push({casterId, candidates});
        });
    });
    casterCandidates.sort((left, right) => compareStrings(left.casterId, right.casterId));
    const casterIds = casterCandidates.map((entry) => entry.casterId);
    requireCanonicalUniqueStrings(casterIds, 'projected cutout caster IDs');
    if (options.expectedCasterIds !== undefined) {
        const expected = requireCanonicalUniqueStrings(
            [...options.expectedCasterIds],
            'expectedCasterIds'
        );
        if (!arraysEqual(casterIds, expected)) {
            throw new Error('runtime projected cutout caster IDs differ from authenticated source IDs');
        }
    }
    const candidates = casterCandidates.flatMap((entry) => (
        entry.candidates.map((candidate) => ({
            casterId: entry.casterId,
            expectedDepthNormalized: candidate.expectedDepthNormalized,
            globalTexel: translateLiveTexelToCacheGlobal(
                candidate.liveTexel,
                phaseEvidence,
                cacheMapSizeTexels
            ),
            liveTexel: candidate.liveTexel
        }))
    ));
    const outOfCoverageCasterIds = casterCandidates
        .filter((entry) => entry.candidates.length === 0)
        .map((entry) => entry.casterId);
    return {
        schema: PRODUCTION_ALPHA_CUTOUT_CANDIDATE_PLAN_SCHEMA,
        lightingProfileId,
        casterIds,
        cacheMapSizeTexels,
        candidates,
        outOfCoverageCasterIds,
        shadowCamera: {
            cacheDepthAxisWorld,
            farMeters: camera.far,
            nearMeters: camera.near,
            sourceCameraDepthAxisMaximumError,
            sourceCameraOriginDepthMetersInCacheBasis
        },
        shadowMapSizeTexels: [target.width, target.height]
    };
}

/**
 * Select independently authenticated first-hit texels and transparent coverage
 * texels for every caster. A geometric candidate is only labelled as an
 * occupied sample when its native depth agrees within the release 5 mm gate.
 *
 * @param {any} candidatePlan
 * @param {any} liveCapture
 * @param {{
 *   occupiedSamplesPerCaster?: number,
 *   emptySamplesPerCaster?: number,
 *   allowOutOfCoverageDiagnostic?: boolean,
 *   allowReleaseUnionCoverage?: boolean
 * }} [options]
 */
export function selectProductionAlphaCutoutSamplePlan(
    candidatePlan,
    liveCapture,
    options = {}
) {
    validateCandidatePlan(candidatePlan);
    const outOfCoverageCasterIds = candidatePlan.outOfCoverageCasterIds ?? [];
    const diagnosticOnly = outOfCoverageCasterIds.length > 0
        && options.allowOutOfCoverageDiagnostic === true;
    const releaseUnionCoverage = outOfCoverageCasterIds.length > 0
        && options.allowReleaseUnionCoverage === true;
    if (diagnosticOnly && releaseUnionCoverage) {
        throw new TypeError(
            'partial alpha-cutout coverage cannot be diagnostic and release-union evidence'
        );
    }
    if (outOfCoverageCasterIds.length > 0
        && !diagnosticOnly && !releaseUnionCoverage) {
        throw new Error(
            `alpha-cutout candidate plan contains ${candidatePlan.outOfCoverageCasterIds.length} `
            + 'casters outside the live shadow map; the release sample-plan schema cannot '
            + 'represent them as native texel samples'
        );
    }
    const occupiedSamplesPerCaster = requirePositiveSafeInteger(
        options.occupiedSamplesPerCaster ?? 1,
        'occupiedSamplesPerCaster'
    );
    const emptySamplesPerCaster = requirePositiveSafeInteger(
        options.emptySamplesPerCaster ?? 1,
        'emptySamplesPerCaster'
    );
    if (!liveCapture || typeof liveCapture !== 'object'
        || liveCapture.sampleCount !== candidatePlan.candidates.length
        || liveCapture.liveOccupancy?.length !== candidatePlan.candidates.length
        || liveCapture.sampleFirstHitDepthMeters?.length
            !== candidatePlan.candidates.length) {
        throw new TypeError('live candidate capture does not align with the candidate plan');
    }
    if (!arraysEqual(
        liveCapture.shadowMapSizeTexels,
        candidatePlan.shadowMapSizeTexels
    )) {
        throw new Error('candidate and live capture shadow-map dimensions differ');
    }
    const nearMeters = candidatePlan.shadowCamera.nearMeters;
    const farMeters = candidatePlan.shadowCamera.farMeters;
    if (liveCapture.shadowCamera?.nearMeters !== nearMeters
        || liveCapture.shadowCamera?.farMeters !== farMeters) {
        throw new Error('candidate and live capture shadow-camera ranges differ');
    }
    const depthRangeMeters = farMeters - nearMeters;
    const indicesByCaster = new Map(
        candidatePlan.casterIds
            .filter((casterId) => !outOfCoverageCasterIds.includes(casterId))
            .map((casterId) => [casterId, []])
    );
    candidatePlan.candidates.forEach((candidate, index) => {
        indicesByCaster.get(candidate.casterId).push(index);
    });
    const selectedCandidateIndices = [];
    let authenticatedFirstHitSampleCount = 0;
    let emptyCoverageSampleCount = 0;
    let maximumSelectedFirstHitDepthErrorMeters = 0;
    for (const casterId of indicesByCaster.keys()) {
        const authenticated = [];
        const empty = [];
        for (const index of indicesByCaster.get(casterId)) {
            const candidate = candidatePlan.candidates[index];
            if (liveCapture.liveOccupancy[index] === 0) {
                empty.push(index);
                continue;
            }
            if (liveCapture.liveOccupancy[index] !== 1) {
                throw new Error(`live occupancy[${index}] must be zero or one`);
            }
            const expectedDepthMeters = nearMeters
                + candidate.expectedDepthNormalized * depthRangeMeters;
            const errorMeters = Math.abs(
                liveCapture.sampleFirstHitDepthMeters[index] - expectedDepthMeters
            );
            if (errorMeters <= PRODUCTION_ALPHA_CUTOUT_FIRST_HIT_TOLERANCE_METERS) {
                authenticated.push({index, errorMeters});
            }
        }
        if (authenticated.length < occupiedSamplesPerCaster) {
            throw new Error(
                `cutout caster '${casterId}' has no authenticated first-hit candidate`
            );
        }
        if (empty.length < emptySamplesPerCaster) {
            throw new Error(
                `cutout caster '${casterId}' has no transparent coverage candidate`
            );
        }
        for (const selected of authenticated.slice(0, occupiedSamplesPerCaster)) {
            selectedCandidateIndices.push(selected.index);
            authenticatedFirstHitSampleCount += 1;
            maximumSelectedFirstHitDepthErrorMeters = Math.max(
                maximumSelectedFirstHitDepthErrorMeters,
                selected.errorMeters
            );
        }
        for (const index of empty.slice(0, emptySamplesPerCaster)) {
            selectedCandidateIndices.push(index);
            emptyCoverageSampleCount += 1;
        }
    }
    const samples = selectedCandidateIndices.map((candidateIndex, index) => ({
        casterId: candidatePlan.candidates[candidateIndex].casterId,
        globalTexel: [...candidatePlan.candidates[candidateIndex].globalTexel],
        index
    }));
    const inCoverageCasterIds = candidatePlan.casterIds.filter(
        (casterId) => !outOfCoverageCasterIds.includes(casterId)
    );
    const samplePlanMethod = releaseUnionCoverage
        ? PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_METHOD
        : PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_METHOD;
    const coveragePartition = releaseUnionCoverage ? {
        inCoverageCasterIds,
        outOfCoverageCasterIds: [...outOfCoverageCasterIds]
    } : {};
    const bakeSampleRequest = {
        depthReference: {
            cacheDepthAxisWorld: [...candidatePlan.shadowCamera.cacheDepthAxisWorld],
            encoding: PRODUCTION_ALPHA_CUTOUT_DEPTH_REFERENCE,
            sourceCameraFarMeters: farMeters,
            sourceCameraNearMeters: nearMeters,
            sourceCameraOriginDepthMetersInCacheBasis:
                candidatePlan.shadowCamera.sourceCameraOriginDepthMetersInCacheBasis
        },
        ...coveragePartition,
        lightingProfileId: candidatePlan.lightingProfileId,
        method: samplePlanMethod,
        productionEligible: !diagnosticOnly,
        samples,
        schema: releaseUnionCoverage
            ? PRODUCTION_ALPHA_CUTOUT_BAKE_SAMPLE_REQUEST_V2_SCHEMA
            : diagnosticOnly
                ? PRODUCTION_ALPHA_CUTOUT_DIAGNOSTIC_BAKE_SAMPLE_REQUEST_SCHEMA
                : PRODUCTION_ALPHA_CUTOUT_BAKE_SAMPLE_REQUEST_SCHEMA
    };
    return {
        bakeSampleRequest,
        samplePlan: {
            ...coveragePartition,
            lightingProfileId: candidatePlan.lightingProfileId,
            method: samplePlanMethod,
            samples,
            schema: releaseUnionCoverage
                ? PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_V2_SCHEMA
                : diagnosticOnly
                    ? PRODUCTION_ALPHA_CUTOUT_DIAGNOSTIC_SAMPLE_PLAN_SCHEMA
                    : PRODUCTION_ALPHA_CUTOUT_SAMPLE_PLAN_SCHEMA
        },
        selectedCandidateIndices,
        outOfCoverageCasterIds: [...outOfCoverageCasterIds],
        productionEligible: !diagnosticOnly,
        diagnostics: {
            authenticatedFirstHitSampleCount,
            candidateCount: candidatePlan.candidates.length,
            casterCount: candidatePlan.casterIds.length,
            emptyCoverageSampleCount,
            maximumSelectedFirstHitDepthErrorMeters,
            sampleCount: samples.length
        }
    };
}

function projectGeometryGroupCandidates(THREE, object, group, shadowMatrix, mapSize) {
    const geometry = object.geometry;
    const position = geometry.getAttribute?.('position');
    if (!position || position.itemSize < 3) {
        throw new Error(`cutout caster '${object.name || object.type}' has no position attribute`);
    }
    const index = geometry.getIndex?.() ?? geometry.index ?? null;
    const start = requireNonNegativeSafeInteger(group.start, 'geometry group.start');
    const available = index ? index.count : position.count;
    const count = group.count === Infinity
        ? available - start
        : requirePositiveSafeInteger(group.count, 'geometry group.count');
    const end = Math.min(start + count, available);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const byTexel = new Map();
    for (let offset = start; offset + 2 < end; offset += 3) {
        readProjectedVertex(a, position, index, offset, object.matrixWorld, shadowMatrix);
        readProjectedVertex(b, position, index, offset + 1, object.matrixWorld, shadowMatrix);
        readProjectedVertex(c, position, index, offset + 2, object.matrixWorld, shadowMatrix);
        const x = (a.x + b.x + c.x) / 3;
        const y = (a.y + b.y + c.y) / 3;
        const expectedDepthNormalized = (a.z + b.z + c.z) / 3;
        if (![x, y, expectedDepthNormalized].every(Number.isFinite)
            || x < 0 || x >= 1 || y < 0 || y >= 1
            || expectedDepthNormalized < 0 || expectedDepthNormalized >= 1) continue;
        const liveTexel = [
            Math.min(mapSize[0] - 1, Math.floor(x * mapSize[0])),
            Math.min(mapSize[1] - 1, Math.floor(y * mapSize[1]))
        ];
        const key = `${liveTexel[0]},${liveTexel[1]}`;
        const prior = byTexel.get(key);
        if (!prior || expectedDepthNormalized < prior.expectedDepthNormalized) {
            byTexel.set(key, {expectedDepthNormalized, liveTexel});
        }
    }
    return [...byTexel.values()].sort((left, right) => (
        left.liveTexel[1] - right.liveTexel[1]
        || left.liveTexel[0] - right.liveTexel[0]
        || left.expectedDepthNormalized - right.expectedDepthNormalized
    ));
}

function translateLiveTexelToCacheGlobal(liveTexel, phaseEvidence, cacheMapSize) {
    const transform = phaseEvidence.liveSourceToCacheLightAxisTransform;
    const phase = phaseEvidence.cacheToLivePhaseIndices;
    const value = [0, 1].map((cacheAxis) => (
        transform[cacheAxis][0] * liveTexel[0]
        + transform[cacheAxis][1] * liveTexel[1]
        - phase[cacheAxis]
    ));
    const rounded = value.map(Math.round);
    const maximumError = Math.max(
        Math.abs(value[0] - rounded[0]),
        Math.abs(value[1] - rounded[1])
    );
    if (maximumError > 1e-8) {
        throw new Error('live cutout texel did not translate to an exact cache lattice texel');
    }
    if (rounded.some((entry, axis) => entry < 0 || entry >= cacheMapSize[axis])) {
        throw new Error('live cutout texel translated outside the production cache layout');
    }
    return rounded;
}

function readProjectedVertex(target, position, index, offset, matrixWorld, shadowMatrix) {
    const vertexIndex = index ? index.getX(offset) : offset;
    target.fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(matrixWorld)
        .applyMatrix4(shadowMatrix);
}

export function createRuntimeTreeCasterId(cityRoot, object, groupIndex) {
    let treeRoot = object;
    while (treeRoot && treeRoot !== cityRoot
        && !/^trees:\d{3}$/u.test(String(treeRoot.name))) {
        treeRoot = treeRoot.parent;
    }
    if (!treeRoot || treeRoot === cityRoot) {
        throw new Error(
            `cutout runtime object '${object.name || object.type}' is not under a canonical tree root`
        );
    }
    const descendants = [];
    for (let current = object; current && current !== treeRoot; current = current.parent) {
        descendants.push(current);
    }
    descendants.reverse();
    const semanticPath = descendants.map((current) => {
        const childIndex = current.parent.children.indexOf(current);
        if (childIndex < 0) throw new Error('runtime tree child index is inconsistent');
        const sourceName = String(current.userData?.originalName || current.name || current.type);
        return `${String(childIndex).padStart(8, '0')}-${sourceName}`;
    }).join('/');
    return `caster/object/${encodeURIComponent(treeRoot.name)}/${semanticPath}`
        + `/instance/base/group/${String(groupIndex).padStart(4, '0')}`;
}

function validateCandidatePlan(value) {
    if (!value || typeof value !== 'object'
        || value.schema !== PRODUCTION_ALPHA_CUTOUT_CANDIDATE_PLAN_SCHEMA
        || !Array.isArray(value.candidates) || value.candidates.length === 0
        || !Array.isArray(value.casterIds) || value.casterIds.length === 0) {
        throw new TypeError('alpha-cutout candidate plan is invalid');
    }
    requireNonEmptyString(value.lightingProfileId, 'candidate lightingProfileId');
    requireCanonicalUniqueStrings(value.casterIds, 'candidate casterIds');
    const size = value.shadowMapSizeTexels;
    if (!Array.isArray(size) || size.length !== 2
        || size.some((entry) => !Number.isSafeInteger(entry) || entry <= 0)) {
        throw new TypeError('candidate shadowMapSizeTexels is invalid');
    }
    const cacheSize = value.cacheMapSizeTexels;
    if (!Array.isArray(cacheSize) || cacheSize.length !== 2
        || cacheSize.some((entry) => !Number.isSafeInteger(entry) || entry <= 0)) {
        throw new TypeError('candidate cacheMapSizeTexels is invalid');
    }
    const seen = new Set();
    for (let index = 0; index < value.candidates.length; index += 1) {
        const candidate = value.candidates[index];
        if (!value.casterIds.includes(candidate?.casterId)
            || !Number.isFinite(candidate?.expectedDepthNormalized)
            || candidate.expectedDepthNormalized < 0
            || candidate.expectedDepthNormalized >= 1
            || !Array.isArray(candidate.globalTexel)
            || candidate.globalTexel.length !== 2
            || candidate.globalTexel.some((entry, axis) => (
                !Number.isSafeInteger(entry) || entry < 0 || entry >= cacheSize[axis]
            ))
            || !Array.isArray(candidate.liveTexel)
            || candidate.liveTexel.length !== 2
            || candidate.liveTexel.some((entry, axis) => (
                !Number.isSafeInteger(entry) || entry < 0 || entry >= size[axis]
            ))) {
            throw new TypeError(`alpha-cutout candidate[${index}] is invalid`);
        }
        const identity = `${candidate.casterId}\u0000${candidate.globalTexel.join(',')}`;
        if (seen.has(identity)) {
            throw new Error('alpha-cutout candidates must not duplicate caster texels');
        }
        seen.add(identity);
    }
    const candidateCasterIds = [...new Set(
        value.candidates.map((candidate) => candidate.casterId)
    )].sort(compareStrings);
    const outOfCoverageCasterIds = value.outOfCoverageCasterIds === undefined
        ? []
        : requireCanonicalUniqueStrings(
            value.outOfCoverageCasterIds,
            'candidate outOfCoverageCasterIds',
            true
        );
    if (candidateCasterIds.some((casterId) => outOfCoverageCasterIds.includes(casterId))) {
        throw new Error('alpha-cutout candidate coverage classifications overlap');
    }
    const classifiedCasterIds = [
        ...candidateCasterIds,
        ...outOfCoverageCasterIds
    ].sort(compareStrings);
    if (!arraysEqual(classifiedCasterIds, value.casterIds)) {
        throw new Error('alpha-cutout candidate caster inventory is incomplete');
    }
    const near = value.shadowCamera?.nearMeters;
    const far = value.shadowCamera?.farMeters;
    if (!Number.isFinite(near) || near < 0 || !Number.isFinite(far) || far <= near) {
        throw new TypeError('candidate shadowCamera range is invalid');
    }
    requireVector3(
        value.shadowCamera.cacheDepthAxisWorld,
        'candidate shadowCamera.cacheDepthAxisWorld'
    );
    const sourceOrigin = value.shadowCamera.sourceCameraOriginDepthMetersInCacheBasis;
    const axisError = value.shadowCamera.sourceCameraDepthAxisMaximumError;
    if (!Number.isFinite(sourceOrigin) || !Number.isFinite(axisError)
        || axisError < 0 || axisError > 1e-9) {
        throw new TypeError('candidate shadowCamera depth reference is invalid');
    }
}

function isCutoutMaterial(material) {
    return !!material && material.visible !== false
        && resolveThreeR183ShadowAlphaTest(
            material.alphaTest,
            material.alphaToCoverage
        ) > 0;
}

function drawRangeCount(geometry) {
    const available = geometry.index?.count ?? geometry.attributes?.position?.count;
    if (!Number.isSafeInteger(available) || available <= 0) {
        throw new Error('ungrouped cutout geometry has no finite draw range');
    }
    const start = geometry.drawRange?.start ?? 0;
    const count = geometry.drawRange?.count ?? available;
    return count === Infinity ? available - start : count;
}

function isWorldVisible(object) {
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}

function requireCanonicalUniqueStrings(value, label, allowEmpty = false) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
        || value.some((entry) => typeof entry !== 'string' || entry === '')) {
        throw new TypeError(`${label} must be a non-empty string array`);
    }
    const canonical = [...new Set(value)].sort(compareStrings);
    if (!arraysEqual(value, canonical)) {
        throw new TypeError(`${label} must be unique and canonically sorted`);
    }
    return value;
}

function requirePositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) {
        throw new TypeError(`${label} must be a positive safe integer`);
    }
    return Number(value);
}

function requireNonNegativeSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
    return Number(value);
}

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
}

function arraysEqual(left, right) {
    return Array.isArray(left) && Array.isArray(right)
        && left.length === right.length
        && left.every((entry, index) => entry === right[index]);
}

function requireVector3(value, label) {
    if (!Array.isArray(value) || value.length !== 3
        || value.some((entry) => !Number.isFinite(entry))) {
        throw new TypeError(`${label} must be a finite three-number array`);
    }
    return value;
}

function dot3(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function subtract3(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
