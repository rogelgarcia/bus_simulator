// Pure Building v2 per-floor silhouette authoring and placement contract.
// @ts-check

import {
    normalizeFootprintArcMetadata,
    resolveFootprintArcRun,
    sampleResolvedFootprintArc
} from '../footprint_curves/BuildingFootprintCurves.js';
import {
    createFootprintPlan,
    stretchFootprint
} from '../footprint_edits/BuildingFootprintEdits.js';
import { fitBuildingFootprintToLot } from '../footprint_fitting/BuildingFootprintLotFitter.js';

const EPSILON = 1e-7;
const MIN_RUN_LENGTH_METERS = 0.01;
const CORNER_ID_PREFIX = 'corner_';

export const MAX_SILHOUETTE_RUNS = 26;

export const LAYER_SILHOUETTE_MODE = Object.freeze({
    INHERIT_DEFAULT: 'inherit_default',
    INHERIT_PREVIOUS: 'inherit_previous',
    DETACHED: 'detached'
});

export const SILHOUETTE_REMAP_DECISION = Object.freeze({
    RETAIN: 'retain',
    KEEP: 'retain',
    REMAP: 'remap',
    ORPHAN: 'orphan',
    REMOVE: 'remove',
    DISCARD: 'remove'
});

/** @typedef {'inherit_default'|'inherit_previous'|'detached'} LayerSilhouetteMode */
/** @typedef {{bulge:number, segments?:number}} SilhouetteArc */
/** @typedef {{x:number,z:number,cornerId:string,runId:string,runForward?:boolean,split?:boolean,arc?:SilhouetteArc}} SilhouettePoint */
/** @typedef {{nextCornerSerial:number,retiredCornerIds:string[],retiredRunIds:string[]}} SilhouetteIdState */

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
    if (isObject(value)) {
        const out = {};
        for (const [key, entry] of Object.entries(value)) out[key] = deepClone(entry);
        return out;
    }
    return value;
}

function uniqueStrings(value) {
    return [...new Set((Array.isArray(value) ? value : [])
        .filter((entry) => typeof entry === 'string' && entry))].sort();
}

function isRunId(value) {
    return typeof value === 'string'
        && value.length === 1
        && value >= 'A'
        && value <= 'Z';
}

function runIdAt(index) {
    return index >= 0 && index < MAX_SILHOUETTE_RUNS
        ? String.fromCharCode(65 + index)
        : null;
}

/**
 * Samples authored circular runs for runtime geometry without changing their
 * one-run authoring identity. The returned points are display/build data only.
 */
export function tessellateLayerSilhouetteLoopForGeometry(loop) {
    const points = Array.isArray(loop) ? loop : [];
    if (points.length < 2) return points.map((point) => ({ x: Number(point?.x) || 0, z: Number(point?.z) || 0 }));
    const out = [];
    const append = (point) => {
        if (!point) return;
        const next = { x: Number(point.x) || 0, z: Number(point.z) || 0 };
        const previous = out[out.length - 1];
        if (previous && Math.hypot(previous.x - next.x, previous.z - next.z) <= EPSILON) return;
        out.push(next);
    };
    for (let i = 0; i < points.length; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        const curve = resolveFootprintArcRun(start, end, start?.arc);
        if (!curve) {
            append(start);
            continue;
        }
        const segmentCount = Math.max(3, Math.min(96, Math.round(Number(curve.segments) || 3)));
        for (let segment = 0; segment < segmentCount; segment++) {
            append(sampleResolvedFootprintArc(curve, curve.length * (segment / segmentCount)));
        }
    }
    if (out.length > 2 && Math.hypot(out[0].x - out.at(-1).x, out[0].z - out.at(-1).z) <= EPSILON) out.pop();
    return out;
}

function geometryLoopsEqual(a, b, tolerance = 1e-5) {
    const left = tessellateLayerSilhouetteLoopForGeometry(a);
    const right = tessellateLayerSilhouetteLoopForGeometry(b);
    if (left.length !== right.length || left.length < 3) return false;
    const same = (p, q) => Math.abs(p.x - q.x) <= tolerance && Math.abs(p.z - q.z) <= tolerance;
    const n = left.length;
    for (let start = 0; start < n; start++) {
        if (!same(left[0], right[start])) continue;
        for (const direction of [1, -1]) {
            let equal = true;
            for (let i = 1; i < n; i++) {
                const rightIndex = (start + direction * i + n * i) % n;
                if (!same(left[i], right[rightIndex])) {
                    equal = false;
                    break;
                }
            }
            if (equal) return true;
        }
    }
    return false;
}

function geometryLoopSetsEqual(a, b, tolerance = 1e-5) {
    const left = (Array.isArray(a) ? a : []).filter((loop) => Array.isArray(loop) && loop.length >= 3);
    const right = (Array.isArray(b) ? b : []).filter((loop) => Array.isArray(loop) && loop.length >= 3);
    if (left.length !== right.length) return false;
    const used = new Set();
    for (const loop of left) {
        let match = -1;
        for (let i = 0; i < right.length; i++) {
            if (used.has(i) || !geometryLoopsEqual(loop, right[i], tolerance)) continue;
            match = i;
            break;
        }
        if (match < 0) return false;
        used.add(match);
    }
    return true;
}

/** Returns changed adjacent floor boundaries that need an upper-shell soffit. */
export function planLayerSilhouetteTransitionSurfaces({ layers, layerPlanLoopsById } = {}) {
    const floorLayers = (Array.isArray(layers) ? layers : []).filter((layer) => (
        layer?.type === 'floor' && typeof layer?.id === 'string' && layer.id
    ));
    const getLoops = (layerId) => (layerPlanLoopsById instanceof Map
        ? layerPlanLoopsById.get(layerId)
        : layerPlanLoopsById?.[layerId]);
    const transitions = [];
    for (let i = 1; i < floorLayers.length; i++) {
        const lower = floorLayers[i - 1];
        const upper = floorLayers[i];
        const lowerLoops = getLoops(lower.id);
        const upperLoops = getLoops(upper.id);
        if (!Array.isArray(lowerLoops) || !Array.isArray(upperLoops)) continue;
        if (geometryLoopSetsEqual(lowerLoops, upperLoops)) continue;
        transitions.push({ lowerLayerId: lower.id, upperLayerId: upper.id });
    }
    return transitions;
}

/** Stable capital/base continuity key for one solved facade bay. */
export function createFacadeRunContinuityKey({
    lineageId,
    runId,
    runForward = true,
    bayId,
    designKey = ''
} = {}) {
    const lineage = typeof lineageId === 'string' ? lineageId : '';
    const run = isRunId(runId) ? runId : null;
    const bay = typeof bayId === 'string' ? bayId : '';
    if (!lineage || !run || !bay) return null;
    return JSON.stringify([
        lineage,
        run,
        runForward !== false,
        bay,
        typeof designKey === 'string' ? designKey : ''
    ]);
}

/**
 * Describes the physical polygon chain separately from every stable run's
 * authored local-u direction. Mixed `runForward` values never reorder runs.
 */
export function createSilhouetteRunTraversal(loop) {
    const points = Array.isArray(loop) ? loop : [];
    const entries = points.map((point, loopIndex) => {
        const loopEndPointIndex = points.length ? (loopIndex + 1) % points.length : loopIndex;
        const runForward = point?.runForward !== false;
        return {
            runId: typeof point?.runId === 'string' ? point.runId : '',
            runForward,
            loopIndex,
            loopStartPointIndex: loopIndex,
            loopEndPointIndex,
            localStartPointIndex: runForward ? loopIndex : loopEndPointIndex,
            localEndPointIndex: runForward ? loopEndPointIndex : loopIndex
        };
    });
    const aPosition = entries.findIndex((entry) => entry.runId === 'A');
    return aPosition > 0
        ? [...entries.slice(aPosition), ...entries.slice(0, aPosition)]
        : entries;
}

function normalizeMode(value) {
    if (value === LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS) return value;
    if (value === LAYER_SILHOUETTE_MODE.DETACHED) return value;
    return LAYER_SILHOUETTE_MODE.INHERIT_DEFAULT;
}

function normalizePreferredSize(value) {
    if (!isObject(value)) return null;
    const width = Number(value.widthMeters ?? value.width);
    const depth = Number(value.depthMeters ?? value.depth);
    const out = {};
    if (Number.isFinite(width) && width > EPSILON) out.widthMeters = width;
    if (Number.isFinite(depth) && depth > EPSILON) out.depthMeters = depth;
    return Object.keys(out).length ? out : null;
}

function cornerSerialOf(value) {
    if (typeof value !== 'string' || !value.startsWith(CORNER_ID_PREFIX)) return 0;
    const serial = Number(value.slice(CORNER_ID_PREFIX.length));
    return Number.isSafeInteger(serial) && serial > 0 ? serial : 0;
}

function normalizeIdState(value, points = []) {
    const source = isObject(value) ? value : {};
    const retiredCornerIds = uniqueStrings(source.retiredCornerIds);
    const retiredRunIds = uniqueStrings(source.retiredRunIds).filter(isRunId);
    let nextCornerSerial = Number(source.nextCornerSerial);
    if (!Number.isSafeInteger(nextCornerSerial) || nextCornerSerial < 1) nextCornerSerial = 1;
    for (const id of [...retiredCornerIds, ...points.map((point) => point?.cornerId)]) {
        nextCornerSerial = Math.max(nextCornerSerial, cornerSerialOf(id) + 1);
    }
    return { nextCornerSerial, retiredCornerIds, retiredRunIds };
}

function allocateCornerId(state, used) {
    let serial = state.nextCornerSerial;
    let id = `${CORNER_ID_PREFIX}${serial}`;
    const retired = new Set(state.retiredCornerIds);
    while (used.has(id) || retired.has(id)) {
        serial += 1;
        id = `${CORNER_ID_PREFIX}${serial}`;
    }
    state.nextCornerSerial = serial + 1;
    used.add(id);
    return id;
}

function allocateRunId(state, used) {
    const retired = new Set(state.retiredRunIds);
    for (let i = 0; i < MAX_SILHOUETTE_RUNS; i++) {
        const id = runIdAt(i);
        if (id && !used.has(id) && !retired.has(id)) {
            used.add(id);
            return id;
        }
    }
    throw new RangeError('BuildingLayerSilhouetteModel: all A-Z logical run ids have been used or retired.');
}

function allocateRunIdForNormalization(state, used, index) {
    try {
        return allocateRunId(state, used);
    } catch {
        // Keep over-limit/exhausted documents inspectable so live validation
        // can surface the A-Z error instead of crashing config normalization.
        let suffix = index + 1;
        let id = `invalid_run_${suffix}`;
        while (used.has(id)) {
            suffix += 1;
            id = `invalid_run_${suffix}`;
        }
        used.add(id);
        return id;
    }
}

function clonePointMetadata(raw, x, z, cornerId, runId) {
    const out = {
        x,
        z,
        cornerId,
        runId,
        runForward: raw?.runForward === undefined || typeof raw?.runForward === 'boolean'
            ? raw?.runForward !== false
            : deepClone(raw.runForward)
    };
    if (raw?.split === true) out.split = true;
    if (raw?.arc !== undefined) {
        const arc = normalizeFootprintArcMetadata(raw.arc);
        // Preserve malformed authored metadata so validation can block Apply
        // instead of normalization silently turning a curved run straight.
        out.arc = arc ? { ...arc } : deepClone(raw.arc);
    }
    return out;
}

function sourceLoopOf(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.loop)) return value.loop;
    if (Array.isArray(value?.points)) return value.points;
    return [];
}

function withoutClosingDuplicate(points) {
    if (points.length <= 3) return points;
    const first = points[0];
    const last = points[points.length - 1];
    const sameCoordinates = Number(first?.x) === Number(last?.x)
        && Number(first?.z) === Number(last?.z);
    return sameCoordinates ? points.slice(0, -1) : points;
}

/**
 * Canonicalizes point-owned corner/run identity without changing point order or
 * winding. The result includes the allocator state needed to avoid recycling
 * deleted ids across undo/redo and future topology edits.
 * @param {unknown} value
 * @param {{idState?:unknown}} [options]
 * @returns {{loop:SilhouettePoint[],idState:SilhouetteIdState}}
 */
export function normalizeSilhouetteLoop(value, { idState = null } = {}) {
    const source = withoutClosingDuplicate(sourceLoopOf(value));
    const state = normalizeIdState(idState ?? value?.idState, source);
    const hasExplicitCornerIdentity = source.some((point) => Object.hasOwn(point ?? {}, 'cornerId'));
    const hasExplicitRunIdentity = source.some((point) => Object.hasOwn(point ?? {}, 'runId'));
    const usedCornerIds = new Set();
    const usedRunIds = new Set();
    const loop = [];

    for (let index = 0; index < source.length; index++) {
        const raw = source[index];
        const x = Number(raw?.x ?? raw?.[0]);
        const z = Number(raw?.z ?? raw?.[1]);
        let cornerId = hasExplicitCornerIdentity && typeof raw?.cornerId === 'string' && raw.cornerId
            ? raw.cornerId
            : null;
        if (cornerId) usedCornerIds.add(cornerId);
        else cornerId = allocateCornerId(state, usedCornerIds);

        let runId = hasExplicitRunIdentity && typeof raw?.runId === 'string' && raw.runId
            ? raw.runId
            : null;
        if (runId) usedRunIds.add(runId);
        else runId = allocateRunIdForNormalization(state, usedRunIds, index);
        loop.push(clonePointMetadata(raw, x, z, cornerId, runId));
    }
    return { loop, idState: state };
}

function normalizeStretchBand(value, index) {
    const source = isObject(value) ? value : {};
    const id = typeof source.id === 'string' && source.id
        ? source.id
        : `band_${index + 1}`;
    const aliasParts = id.split(':');
    const runCandidate = source.runId ?? source.faceId ?? aliasParts[0];
    const endCandidate = source.end ?? aliasParts[1];
    const runId = isRunId(runCandidate) ? runCandidate : null;
    const end = endCandidate === 'start' || endCandidate === 'end' ? endCandidate : null;
    const preference = source.preference === 'prefer_expand' || source.preference === 'never'
        ? source.preference
        : 'allow';
    return {
        ...deepClone(source),
        id,
        ...(runId ? { runId } : {}),
        ...(end ? { end } : {}),
        preference,
        stretchable: source.stretchable !== false && preference !== 'never',
        curveRule: source.curveRule === 'preserve_bulge' ? 'preserve_bulge' : 'pinned'
    };
}

function normalizeStretchBands(value) {
    if (Array.isArray(value)) return value.map((band, index) => normalizeStretchBand(band, index));
    if (!isObject(value)) return [];
    return Object.entries(value).map(([id, band], index) => normalizeStretchBand(
        typeof band === 'string' ? { id, preference: band } : { ...(isObject(band) ? band : {}), id },
        index
    ));
}

/** Returns an exact deep clone suitable for a popup working copy. */
export function cloneLayerSilhouette(value) {
    return value == null ? null : deepClone(value);
}

/**
 * Normalizes only an explicitly present layer silhouette. `null` is returned
 * for absent/null input so legacy layers do not gain a serialized field.
 */
export function normalizeLayerSilhouette(value, { defaultLoop = null } = {}) {
    if (!isObject(value)) return null;
    const mode = normalizeMode(value.mode);
    const out = { version: 1, mode };
    if (typeof value.sourceLayerId === 'string' && value.sourceLayerId) out.sourceLayerId = value.sourceLayerId;

    const preferredSize = normalizePreferredSize(value.preferredSize ?? value.designSize);
    if (preferredSize) out.preferredSize = preferredSize;
    if (value.stretchBands !== undefined) out.stretchBands = normalizeStretchBands(value.stretchBands);
    if (isObject(value.stretchProvenance)) out.stretchProvenance = deepClone(value.stretchProvenance);
    if (isObject(value.targetRemap)) out.targetRemap = { ...deepClone(value.targetRemap), version: 1 };

    if (mode === LAYER_SILHOUETTE_MODE.DETACHED) {
        const normalized = normalizeSilhouetteLoop(value.loop ?? defaultLoop ?? [], { idState: value.idState });
        out.loop = normalized.loop;
        out.idState = normalized.idState;
    }
    return out;
}

/** Creates a detached authoring document with stable point-owned identities. */
export function createDetachedLayerSilhouette(loop, {
    preferredSize = null,
    stretchBands = undefined,
    stretchProvenance = null,
    targetRemap = null,
    sourceLayerId = null,
    idState = null
} = {}) {
    return normalizeLayerSilhouette({
        version: 1,
        mode: LAYER_SILHOUETTE_MODE.DETACHED,
        loop,
        idState,
        ...(preferredSize ? { preferredSize } : {}),
        ...(stretchBands !== undefined ? { stretchBands } : {}),
        ...(stretchProvenance ? { stretchProvenance } : {}),
        ...(targetRemap ? { targetRemap } : {}),
        ...(typeof sourceLayerId === 'string' && sourceLayerId ? { sourceLayerId } : {})
    });
}

function boundsOf(loop) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of loop) {
        minX = Math.min(minX, Number(point.x));
        maxX = Math.max(maxX, Number(point.x));
        minZ = Math.min(minZ, Number(point.z));
        maxZ = Math.max(maxZ, Number(point.z));
    }
    return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

function reattachPointMetadata(sourceLoop, plan) {
    return sourceLoop.map((point, index) => ({
        ...deepClone(point),
        x: Number(plan.points[index]?.x),
        z: Number(plan.points[index]?.z)
    }));
}

function stretchMetadataForBands(loop, bands) {
    const metadata = { bands: {} };
    for (const point of loop) {
        metadata.bands[`${point.runId}:start`] = 'never';
        metadata.bands[`${point.runId}:end`] = 'never';
    }
    for (const band of bands) {
        if (!band.runId || !band.end) continue;
        metadata.bands[`${band.runId}:${band.end}`] = band.stretchable
            ? band.preference
            : 'never';
    }
    return metadata;
}

/**
 * Compiles optional design-space width/depth through explicitly named valid
 * stretch bands. No uniform scaling is ever used.
 */
export function solveSilhouettePreferredSize({
    loop,
    preferredSize,
    stretchBands,
    minRunLengths = null,
    quantumMeters = 0.01,
    seed = 'silhouette-preferred-size'
} = {}) {
    const normalized = normalizeSilhouetteLoop(loop);
    const sourceLoop = normalized.loop;
    const requested = normalizePreferredSize(preferredSize);
    const bands = normalizeStretchBands(stretchBands);
    const issues = [];
    if (!requested || sourceLoop.length < 3) {
        return { loop: sourceLoop, exact: !requested, applications: [], warnings: [], issues };
    }
    if (!bands.some((band) => band.stretchable && band.runId && band.end)) {
        issues.push({
            severity: 'warning',
            code: 'preferred_size_has_no_stretch_bands',
            message: 'Preferred size was not applied because the silhouette has no valid named stretch bands.'
        });
        return { loop: sourceLoop, exact: false, applications: [], warnings: issues.map((issue) => issue.message), issues };
    }
    const bounds = boundsOf(sourceLoop);
    const width = requested.widthMeters ?? bounds.width;
    const depth = requested.depthMeters ?? bounds.depth;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    const buildAreaLoops = [[
        { x: centerX - width * 0.5, z: centerZ + depth * 0.5 },
        { x: centerX + width * 0.5, z: centerZ + depth * 0.5 },
        { x: centerX + width * 0.5, z: centerZ - depth * 0.5 },
        { x: centerX - width * 0.5, z: centerZ - depth * 0.5 }
    ]];
    try {
        const result = fitBuildingFootprintToLot({
            // The existing fitter discovers straight cut bands. Arc metadata is
            // reattached and protected during provenance replay below.
            footprint: sourceLoop.map((point) => ({
                x: point.x,
                z: point.z,
                runId: point.runId,
                runForward: point.runForward !== false,
                ...(point.split === true ? { split: true } : {})
            })),
            buildAreaLoops,
            stretchMetadata: stretchMetadataForBands(sourceLoop, bands),
            seed,
            minLengthByRunId: minRunLengths,
            quantumMeters
        });
        for (const warning of result.warnings) {
            issues.push({ severity: 'warning', code: 'preferred_size_nearest_valid', message: warning });
        }
        let compiledLoop = reattachPointMetadata(sourceLoop, result.footprint);
        let applications = result.applications.map((entry) => ({ ...entry }));
        if (sourceLoop.some((point) => point.arc !== undefined)) {
            const provenance = createSilhouetteStretchProvenance({
                sourceLoop,
                stretchBands: bands,
                applications
            });
            const replay = replaySilhouetteLotFitApplications({
                loop: sourceLoop,
                provenance,
                minRunLengths
            });
            compiledLoop = replay.loop;
            applications = replay.applied;
            issues.push(...replay.issues);
        }
        const compiledBounds = boundsOf(compiledLoop);
        const tolerance = Math.max(EPSILON, Number(quantumMeters) || 0.01) + EPSILON;
        const exactSize = Math.abs(compiledBounds.width - width) <= tolerance
            && Math.abs(compiledBounds.depth - depth) <= tolerance;
        return {
            loop: compiledLoop,
            exact: result.exact && exactSize && !issues.some((entry) => entry.code.startsWith('lot_fit_')),
            applications,
            warnings: [...new Set([...result.warnings, ...issues.map((entry) => entry.message)])],
            issues
        };
    } catch (error) {
        const message = `Preferred size kept the authored dimensions: ${error instanceof Error ? error.message : String(error)}`;
        issues.push({ severity: 'warning', code: 'preferred_size_unreachable', message });
        return { loop: sourceLoop, exact: false, applications: [], warnings: [message], issues };
    }
}

/** Resolves one layer without mutating or materializing inherited persistence. */
export function resolveLayerSilhouette({
    layer,
    defaultLoop,
    previousResolved = null,
    minRunLengths = null
} = {}) {
    const explicit = normalizeLayerSilhouette(layer?.silhouette, { defaultLoop });
    const mode = explicit?.mode ?? LAYER_SILHOUETTE_MODE.INHERIT_DEFAULT;
    const issues = [];
    let sourceLayerId = 'building_default';
    let loopSource = defaultLoop;
    if (mode === LAYER_SILHOUETTE_MODE.INHERIT_PREVIOUS) {
        if (previousResolved?.loop?.length) {
            loopSource = previousResolved.loop;
            sourceLayerId = previousResolved.layerId ?? previousResolved.sourceLayerId ?? 'previous';
        } else {
            issues.push({
                severity: 'error',
                code: 'previous_silhouette_missing',
                layerId: layer?.id ?? null,
                message: 'Previous-layer inheritance fell back to the building default because no previous floor layer exists.'
            });
        }
    } else if (mode === LAYER_SILHOUETTE_MODE.DETACHED) {
        loopSource = explicit?.loop ?? [];
        sourceLayerId = explicit?.sourceLayerId ?? layer?.id ?? 'detached';
    }

    const normalized = normalizeSilhouetteLoop(loopSource, { idState: explicit?.idState });
    let resolvedLoop = normalized.loop;
    let sizeResult = null;
    if (explicit?.preferredSize) {
        sizeResult = solveSilhouettePreferredSize({
            loop: resolvedLoop,
            preferredSize: explicit.preferredSize,
            stretchBands: explicit.stretchBands ?? [],
            minRunLengths
        });
        resolvedLoop = sizeResult.loop;
        issues.push(...sizeResult.issues.map((issue) => ({ ...issue, layerId: layer?.id ?? null })));
    }
    return {
        layerId: typeof layer?.id === 'string' ? layer.id : '',
        mode,
        sourceLayerId,
        loop: resolvedLoop,
        silhouette: explicit,
        minRunLengths: isObject(minRunLengths) ? deepClone(minRunLengths) : null,
        preferredSizeResult: sizeResult,
        issues
    };
}

/** Resolves floor layers in order; roof layers intentionally do not own loops. */
export function resolveBuildingLayerSilhouettes({
    layers,
    footprintLoops,
    minRunLengthsByLayerId = null
} = {}) {
    const defaultLoop = Array.isArray(footprintLoops?.[0]) ? footprintLoops[0] : [];
    const ordered = [];
    const byLayerId = {};
    const issues = [];
    let previousResolved = null;
    for (const layer of Array.isArray(layers) ? layers : []) {
        if (layer?.type !== 'floor') continue;
        const layerMinRunLengths = typeof layer?.id === 'string' && isObject(minRunLengthsByLayerId)
            ? minRunLengthsByLayerId[layer.id] ?? null
            : null;
        const resolved = resolveLayerSilhouette({
            layer,
            defaultLoop,
            previousResolved,
            minRunLengths: layerMinRunLengths
        });
        ordered.push(resolved);
        if (resolved.layerId) byLayerId[resolved.layerId] = resolved;
        issues.push(...resolved.issues);
        previousResolved = resolved;
    }
    return { ordered, byLayerId, issues };
}

function detachedDocument(value) {
    const document = normalizeLayerSilhouette(value);
    if (!document || document.mode !== LAYER_SILHOUETTE_MODE.DETACHED) {
        throw new RangeError('BuildingLayerSilhouetteModel: geometry edits require a detached layer silhouette.');
    }
    return document;
}

function runIndexOf(loop, runId) {
    const index = loop.findIndex((point) => point.runId === runId);
    if (index < 0) throw new RangeError(`BuildingLayerSilhouetteModel: unknown run id "${runId}".`);
    return index;
}

function cornerIndexOf(loop, cornerId) {
    const index = loop.findIndex((point) => point.cornerId === cornerId);
    if (index < 0) throw new RangeError(`BuildingLayerSilhouetteModel: unknown corner id "${cornerId}".`);
    return index;
}

function withDetachedGeometry(document, loop, idState = document.idState) {
    return normalizeLayerSilhouette({ ...document, loop, idState });
}

function pointOnRun(loop, index, fraction) {
    const start = loop[index];
    const end = loop[(index + 1) % loop.length];
    const curve = resolveFootprintArcRun(start, end, start.arc);
    if (curve) return sampleResolvedFootprintArc(curve, curve.length * fraction);
    return {
        x: start.x + (end.x - start.x) * fraction,
        z: start.z + (end.z - start.z) * fraction
    };
}

/** Inserts a corner and splits the selected logical run, retaining its old id. */
export function insertSilhouetteCorner(document, { runId, point = null, fraction = 0.5 } = {}) {
    const current = detachedDocument(document);
    if (current.loop.length >= MAX_SILHOUETTE_RUNS) {
        throw new RangeError('BuildingLayerSilhouetteModel: a silhouette cannot exceed 26 logical runs.');
    }
    const index = runIndexOf(current.loop, runId);
    const t = Math.max(EPSILON, Math.min(1 - EPSILON, Number(fraction) || 0.5));
    const sampled = pointOnRun(current.loop, index, t);
    const x = Number(point?.x ?? sampled?.x);
    const z = Number(point?.z ?? sampled?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new TypeError('BuildingLayerSilhouetteModel: inserted corner coordinates must be finite.');
    }
    const idState = deepClone(current.idState);
    const usedCornerIds = new Set(current.loop.map((entry) => entry.cornerId));
    const usedRunIds = new Set(current.loop.map((entry) => entry.runId));
    const cornerId = allocateCornerId(idState, usedCornerIds);
    const newRunId = allocateRunId(idState, usedRunIds);
    const loop = current.loop.map((entry) => deepClone(entry));
    const start = loop[index];
    const sourceArc = resolveFootprintArcRun(start, loop[(index + 1) % loop.length], start.arc);
    const sourceArcSegments = normalizeFootprintArcMetadata(start.arc)?.segments ?? null;
    const suppliedOffCurvePoint = !!point
        && Math.hypot(x - Number(sampled?.x), z - Number(sampled?.z)) > 1e-5;
    let secondArc = null;
    if (sourceArc && !suppliedOffCurvePoint) {
        start.arc = {
            bulge: Math.tan(sourceArc.sweep * t / 4),
            ...(sourceArcSegments ? { segments: Math.max(3, Math.round(sourceArcSegments * t)) } : {})
        };
        secondArc = {
            bulge: Math.tan(sourceArc.sweep * (1 - t) / 4),
            ...(sourceArcSegments ? { segments: Math.max(3, Math.round(sourceArcSegments * (1 - t))) } : {})
        };
    } else if (start.arc !== undefined) {
        delete start.arc;
    }
    const inserted = {
        x,
        z,
        cornerId,
        runId: newRunId,
        runForward: start.runForward !== false,
        split: true,
        ...(secondArc ? { arc: secondArc } : {})
    };
    loop.splice(index + 1, 0, inserted);
    return withDetachedGeometry(current, loop, idState);
}

/** Semantic alias used by popup commands. */
export function splitSilhouetteRun(document, options = {}) {
    return insertSilhouetteCorner(document, options);
}

function cross(a, b) {
    return a.x * b.z - a.z * b.x;
}

function sub(a, b) {
    return { x: a.x - b.x, z: a.z - b.z };
}

function normalizedDirection(a, b) {
    const value = sub(b, a);
    const length = Math.hypot(value.x, value.z);
    return length > EPSILON ? { x: value.x / length, z: value.z / length } : null;
}

function mergeableStraightRuns(loop, index) {
    const previousIndex = (index - 1 + loop.length) % loop.length;
    const before = loop[previousIndex];
    const corner = loop[index];
    const after = loop[(index + 1) % loop.length];
    if (before.arc !== undefined || corner.arc !== undefined) return false;
    const a = normalizedDirection(before, corner);
    const b = normalizedDirection(corner, after);
    return !!a && !!b && Math.abs(cross(a, b)) <= 1e-5 && a.x * b.x + a.z * b.z > 0;
}

function mergeableArcMetadata(loop, index) {
    const previousIndex = (index - 1 + loop.length) % loop.length;
    const first = resolveFootprintArcRun(loop[previousIndex], loop[index], loop[previousIndex].arc);
    const second = resolveFootprintArcRun(loop[index], loop[(index + 1) % loop.length], loop[index].arc);
    if (!first || !second || Math.sign(first.sweep) !== Math.sign(second.sweep)) return null;
    const centerDelta = Math.hypot(first.center.x - second.center.x, first.center.z - second.center.z);
    if (centerDelta > 1e-5 || Math.abs(first.radius - second.radius) > 1e-5) return null;
    return {
        bulge: Math.tan((first.sweep + second.sweep) / 4),
        segments: Math.min(96, first.segments + second.segments)
    };
}

function removeCorner(document, cornerId, { requireMergeable }) {
    const current = detachedDocument(document);
    if (current.loop.length <= 3) {
        throw new RangeError('BuildingLayerSilhouetteModel: a silhouette must retain at least three runs.');
    }
    const index = cornerIndexOf(current.loop, cornerId);
    const previousIndex = (index - 1 + current.loop.length) % current.loop.length;
    const mergedArc = mergeableArcMetadata(current.loop, index);
    if (requireMergeable && !mergedArc && !mergeableStraightRuns(current.loop, index)) {
        throw new RangeError('BuildingLayerSilhouetteModel: only collinear straight runs or tangent-compatible circular arcs can merge.');
    }
    const removed = current.loop[index];
    const loop = current.loop.map((entry) => deepClone(entry));
    if (mergedArc) loop[previousIndex].arc = mergedArc;
    else delete loop[previousIndex].arc;
    loop.splice(index, 1);
    const idState = deepClone(current.idState);
    idState.retiredCornerIds = uniqueStrings([...idState.retiredCornerIds, removed.cornerId]);
    idState.retiredRunIds = uniqueStrings([...idState.retiredRunIds, removed.runId]).filter(isRunId);
    return withDetachedGeometry(current, loop, idState);
}

/** Merges two collinear/tangent-compatible logical runs around one corner. */
export function mergeSilhouetteRuns(document, { cornerId } = {}) {
    return removeCorner(document, cornerId, { requireMergeable: true });
}

/** Deletes one corner, retaining the preceding run id and retiring the next. */
export function deleteSilhouetteCorner(document, { cornerId } = {}) {
    return removeCorner(document, cornerId, { requireMergeable: false });
}

export function moveSilhouetteCorner(document, { cornerId, x, z, dx = 0, dz = 0 } = {}) {
    const current = detachedDocument(document);
    const index = cornerIndexOf(current.loop, cornerId);
    const loop = current.loop.map((entry) => deepClone(entry));
    const nextX = x === undefined ? loop[index].x + Number(dx || 0) : Number(x);
    const nextZ = z === undefined ? loop[index].z + Number(dz || 0) : Number(z);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextZ)) {
        throw new TypeError('BuildingLayerSilhouetteModel: moved corner coordinates must be finite.');
    }
    loop[index].x = nextX;
    loop[index].z = nextZ;
    return withDetachedGeometry(current, loop);
}

/** Moves both endpoints of a logical run; adjacent runs retain their ids. */
export function moveSilhouetteRun(document, { runId, dx = 0, dz = 0 } = {}) {
    const current = detachedDocument(document);
    const index = runIndexOf(current.loop, runId);
    const deltaX = Number(dx);
    const deltaZ = Number(dz);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaZ)) {
        throw new TypeError('BuildingLayerSilhouetteModel: run movement must be finite.');
    }
    const loop = current.loop.map((entry) => deepClone(entry));
    for (const pointIndex of [index, (index + 1) % loop.length]) {
        loop[pointIndex].x += deltaX;
        loop[pointIndex].z += deltaZ;
    }
    return withDetachedGeometry(current, loop);
}

export function translateSilhouetteLoop(document, { dx = 0, dz = 0 } = {}) {
    const current = detachedDocument(document);
    const deltaX = Number(dx);
    const deltaZ = Number(dz);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaZ)) {
        throw new TypeError('BuildingLayerSilhouetteModel: silhouette translation must be finite.');
    }
    const loop = current.loop.map((point) => ({ ...deepClone(point), x: point.x + deltaX, z: point.z + deltaZ }));
    return withDetachedGeometry(current, loop);
}

/** Sets/clears one circular run using bulge, sweep, or radius input. */
export function setSilhouetteRunArc(document, {
    runId,
    bulge = undefined,
    sweepRadians = undefined,
    radius = undefined,
    segments = undefined
} = {}) {
    const current = detachedDocument(document);
    const index = runIndexOf(current.loop, runId);
    const loop = current.loop.map((entry) => deepClone(entry));
    if (bulge === null || sweepRadians === null || radius === null
        || bulge === 0 || sweepRadians === 0) {
        delete loop[index].arc;
        return withDetachedGeometry(current, loop);
    }
    const currentArc = normalizeFootprintArcMetadata(loop[index].arc);
    let nextBulge = Number(bulge);
    if (!Number.isFinite(nextBulge) && Number.isFinite(Number(sweepRadians))) {
        nextBulge = Math.tan(Number(sweepRadians) / 4);
    }
    if (!Number.isFinite(nextBulge) && Number.isFinite(Number(radius))) {
        const end = loop[(index + 1) % loop.length];
        const chord = Math.hypot(end.x - loop[index].x, end.z - loop[index].z);
        const magnitude = Math.abs(Number(radius));
        if (!(magnitude + EPSILON >= chord * 0.5) || !(chord > EPSILON)) {
            throw new RangeError('BuildingLayerSilhouetteModel: arc radius must be at least half the run chord.');
        }
        const sweepMagnitude = 2 * Math.asin(Math.min(1, chord / (2 * magnitude)));
        const sign = Number(radius) < 0 ? -1 : (Math.sign(currentArc?.bulge ?? 1) || 1);
        nextBulge = Math.tan(sign * sweepMagnitude / 4);
    }
    const nextSegments = segments !== undefined ? segments : currentArc?.segments;
    const arc = normalizeFootprintArcMetadata({ bulge: nextBulge, ...(nextSegments !== undefined ? { segments: nextSegments } : {}) });
    if (!arc) throw new RangeError('BuildingLayerSilhouetteModel: arc bulge/sweep is invalid.');
    loop[index].arc = { ...arc };
    return withDetachedGeometry(current, loop);
}

/** Returns authored-direction straight/arc length, radius, sweep, and tangents. */
export function getSilhouetteRunMetrics(document, runId) {
    const loop = Array.isArray(document) ? normalizeSilhouetteLoop(document).loop : detachedDocument(document).loop;
    const index = runIndexOf(loop, runId);
    const rawStart = loop[index];
    const rawEnd = loop[(index + 1) % loop.length];
    const forward = rawStart.runForward !== false;
    const start = forward ? rawStart : rawEnd;
    const end = forward ? rawEnd : rawStart;
    const arcMeta = forward
        ? rawStart.arc
        : (normalizeFootprintArcMetadata(rawStart.arc)
            ? { ...normalizeFootprintArcMetadata(rawStart.arc), bulge: -normalizeFootprintArcMetadata(rawStart.arc).bulge }
            : rawStart.arc);
    const curve = resolveFootprintArcRun(start, end, arcMeta);
    const chordLength = Math.hypot(end.x - start.x, end.z - start.z);
    if (curve) {
        const startSample = sampleResolvedFootprintArc(curve, 0);
        const endSample = sampleResolvedFootprintArc(curve, curve.length);
        return {
            runId,
            curved: true,
            runForward: forward,
            start: { x: start.x, z: start.z },
            end: { x: end.x, z: end.z },
            chordLength,
            length: curve.length,
            radius: curve.radius,
            sweepRadians: curve.sweep,
            sweepDegrees: curve.sweep * 180 / Math.PI,
            center: { ...curve.center },
            startTangent: { ...startSample.tangent },
            endTangent: { ...endSample.tangent },
            tangentStart: { ...startSample.tangent },
            tangentEnd: { ...endSample.tangent }
        };
    }
    const tangent = chordLength > EPSILON
        ? { x: (end.x - start.x) / chordLength, z: (end.z - start.z) / chordLength }
        : { x: 0, z: 0 };
    return {
        runId,
        curved: false,
        runForward: forward,
        start: { x: start.x, z: start.z },
        end: { x: end.x, z: end.z },
        chordLength,
        length: chordLength,
        radius: null,
        sweepRadians: 0,
        sweepDegrees: 0,
        center: null,
        startTangent: tangent,
        endTangent: tangent,
        tangentStart: tangent,
        tangentEnd: tangent
    };
}

function signedArea(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index++) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        sum += a.x * b.z - b.x * a.z;
    }
    return sum * 0.5;
}

function orientation(a, b, c) {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function pointOnSegment(point, a, b) {
    return Math.abs(orientation(a, b, point)) <= EPSILON
        && point.x >= Math.min(a.x, b.x) - EPSILON
        && point.x <= Math.max(a.x, b.x) + EPSILON
        && point.z >= Math.min(a.z, b.z) - EPSILON
        && point.z <= Math.max(a.z, b.z) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (((o1 > EPSILON && o2 < -EPSILON) || (o1 < -EPSILON && o2 > EPSILON))
        && ((o3 > EPSILON && o4 < -EPSILON) || (o3 < -EPSILON && o4 > EPSILON))) return true;
    if (Math.abs(o1) <= EPSILON && pointOnSegment(c, a, b)) return true;
    if (Math.abs(o2) <= EPSILON && pointOnSegment(d, a, b)) return true;
    if (Math.abs(o3) <= EPSILON && pointOnSegment(a, c, d)) return true;
    return Math.abs(o4) <= EPSILON && pointOnSegment(b, c, d);
}

function sampledOutline(loop) {
    const samples = [];
    for (let index = 0; index < loop.length; index++) {
        const start = loop[index];
        const end = loop[(index + 1) % loop.length];
        const curve = resolveFootprintArcRun(start, end, start.arc);
        if (!curve) {
            samples.push({ x: start.x, z: start.z, runId: start.runId });
            continue;
        }
        for (let segment = 0; segment < curve.segments; segment++) {
            const sample = sampleResolvedFootprintArc(curve, curve.length * segment / curve.segments);
            samples.push({ x: sample.x, z: sample.z, runId: start.runId });
        }
    }
    return samples;
}

function hasSelfIntersection(points) {
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        for (let j = i + 1; j < points.length; j++) {
            if (j === i || j === (i + 1) % points.length || i === (j + 1) % points.length) continue;
            const c = points[j];
            const d = points[(j + 1) % points.length];
            if (segmentsIntersect(a, b, c, d)) return { firstRunId: a.runId, secondRunId: c.runId };
        }
    }
    return null;
}

function issue(severity, code, message, extra = {}) {
    return { severity, code, message, ...extra };
}

/** Live validation used by popup Apply and runtime boundary checks. */
export function validateLayerSilhouette(document, {
    layerId = null,
    minRunLengths = null,
    targetIssues = [],
    neighboringLoops = [],
    tangentConstraints = [],
    requireClockwise = true
} = {}) {
    const issues = [];
    const rawLoop = sourceLoopOf(document);
    if (!Array.isArray(rawLoop) || rawLoop.length < 3) {
        issues.push(issue('error', 'too_few_runs', 'A silhouette must contain at least three logical runs.', { layerId }));
    }
    if (rawLoop.length > MAX_SILHOUETTE_RUNS) {
        issues.push(issue('error', 'too_many_runs', 'A silhouette cannot exceed the A-Z logical-face limit.', { layerId }));
    }
    const runIds = new Set();
    const cornerIds = new Set();
    const idState = normalizeIdState(document?.idState, rawLoop);
    for (let index = 0; index < rawLoop.length; index++) {
        const point = rawLoop[index];
        const next = rawLoop[(index + 1) % rawLoop.length];
        const runId = point?.runId;
        const cornerId = point?.cornerId;
        if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.z))) {
            issues.push(issue('error', 'invalid_coordinate', 'Corner coordinates must be finite.', { layerId, runId, cornerId }));
        }
        if (!isRunId(runId)) issues.push(issue('error', 'invalid_run_id', 'Every logical run needs one A-Z id.', { layerId, runId }));
        else if (runIds.has(runId)) issues.push(issue('error', 'duplicate_run_id', `Run id ${runId} is duplicated.`, { layerId, runId }));
        else runIds.add(runId);
        if (typeof runId === 'string' && idState.retiredRunIds.includes(runId)) {
            issues.push(issue('error', 'recycled_run_id', `Run id ${runId} was retired in this authoring session and cannot be reused.`, { layerId, runId }));
        }
        if (document?.mode === LAYER_SILHOUETTE_MODE.DETACHED && typeof point?.runForward !== 'boolean') {
            issues.push(issue('error', 'invalid_run_orientation', `Run ${runId ?? index + 1} needs an explicit boolean runForward orientation.`, { layerId, runId }));
        }
        if (typeof cornerId !== 'string' || !cornerId) {
            issues.push(issue('error', 'missing_corner_id', 'Every corner needs a stable id.', { layerId, runId }));
        } else if (cornerIds.has(cornerId)) {
            issues.push(issue('error', 'duplicate_corner_id', `Corner id ${cornerId} is duplicated.`, { layerId, runId, cornerId }));
        } else cornerIds.add(cornerId);
        if (typeof cornerId === 'string' && idState.retiredCornerIds.includes(cornerId)) {
            issues.push(issue('error', 'recycled_corner_id', `Corner id ${cornerId} was retired in this authoring session and cannot be reused.`, { layerId, runId, cornerId }));
        }
        const chord = Math.hypot(Number(next?.x) - Number(point?.x), Number(next?.z) - Number(point?.z));
        if (!(chord > EPSILON)) {
            issues.push(issue('error', 'collapsed_run', `Run ${runId ?? index + 1} is collapsed or duplicates a neighboring corner.`, { layerId, runId, cornerId }));
        }
        if (point?.arc !== undefined && !normalizeFootprintArcMetadata(point.arc)) {
            issues.push(issue('error', 'invalid_arc', `Run ${runId ?? index + 1} has invalid circular-arc metadata.`, { layerId, runId }));
        } else if (point?.arc !== undefined && !resolveFootprintArcRun(point, next, point.arc)) {
            issues.push(issue('error', 'invalid_arc_geometry', `Run ${runId ?? index + 1} cannot resolve a radius/tangent from its endpoints.`, { layerId, runId }));
        }
    }

    if (!issues.some((entry) => entry.code === 'invalid_coordinate') && rawLoop.length >= 3) {
        const normalized = normalizeSilhouetteLoop(rawLoop).loop;
        const outline = sampledOutline(normalized);
        // BF2's XZ convention treats a positive shoelace area as clockwise:
        // generator normalization keeps positive outer loops and derives their
        // outward facade normals from the right side of each directed run.
        if (requireClockwise && signedArea(outline) <= EPSILON) {
            issues.push(issue('error', 'counter_clockwise', 'The outer silhouette must be authored clockwise.', { layerId }));
        }
        const intersection = hasSelfIntersection(outline);
        if (intersection) {
            issues.push(issue('error', 'self_intersection', `Runs ${intersection.firstRunId} and ${intersection.secondRunId} intersect.`, {
                layerId,
                runId: intersection.firstRunId,
                otherRunId: intersection.secondRunId
            }));
        }
        for (const point of normalized) {
            const metrics = getSilhouetteRunMetrics(normalized, point.runId);
            const configured = Number(minRunLengths?.[point.runId]);
            const minimum = Number.isFinite(configured) ? Math.max(MIN_RUN_LENGTH_METERS, configured) : MIN_RUN_LENGTH_METERS;
            if (metrics.length + EPSILON < minimum) {
                issues.push(issue('error', 'run_below_solver_minimum', `Run ${point.runId} is ${metrics.length.toFixed(2)}m but its facade needs at least ${minimum.toFixed(2)}m.`, {
                    layerId,
                    runId: point.runId,
                    minimumMeters: minimum,
                    actualMeters: metrics.length
                }));
            }
        }
    }

    for (const constraint of Array.isArray(tangentConstraints) ? tangentConstraints : []) {
        const runId = constraint?.runId;
        if (!isRunId(runId) || !rawLoop.some((point) => point?.runId === runId)) continue;
        const targetX = Number(constraint?.tangent?.x);
        const targetZ = Number(constraint?.tangent?.z);
        const targetLength = Math.hypot(targetX, targetZ);
        const toleranceDegrees = Math.max(0, Number(constraint?.toleranceDegrees) || 0.5);
        if (!(targetLength > EPSILON)) {
            issues.push(issue('error', 'invalid_tangent_constraint', `Run ${runId} has an invalid required tangent.`, { layerId, runId }));
            continue;
        }
        const metrics = getSilhouetteRunMetrics(normalizeSilhouetteLoop(rawLoop).loop, runId);
        const actual = constraint?.end === 'end' ? metrics.endTangent : metrics.startTangent;
        const dot = Math.max(-1, Math.min(1, (actual.x * targetX + actual.z * targetZ) / targetLength));
        const errorDegrees = Math.acos(dot) * 180 / Math.PI;
        if (errorDegrees > toleranceDegrees + 1e-8) {
            issues.push(issue('error', 'invalid_arc_tangency', `Run ${runId} misses its required ${constraint?.end === 'end' ? 'end' : 'start'} tangent by ${errorDegrees.toFixed(2)}°.`, {
                layerId,
                runId,
                end: constraint?.end === 'end' ? 'end' : 'start',
                errorDegrees,
                toleranceDegrees
            }));
        }
    }

    const bands = normalizeStretchBands(document?.stretchBands);
    const availableRuns = new Set(rawLoop.map((point) => point?.runId));
    const seenBandIds = new Set();
    for (const band of bands) {
        if (seenBandIds.has(band.id)) {
            issues.push(issue('error', 'duplicate_stretch_band_id', `Stretch band id ${band.id} is duplicated.`, { layerId, bandId: band.id }));
        }
        seenBandIds.add(band.id);
        if (!band.runId || !availableRuns.has(band.runId) || !band.end) {
            issues.push(issue('error', 'invalid_stretch_band_mapping', `Stretch band ${band.id} does not map to an existing run end.`, {
                layerId,
                bandId: band.id,
                runId: band.runId ?? null
            }));
        }
        const point = rawLoop.find((entry) => entry?.runId === band.runId);
        if (band.stretchable && point?.arc !== undefined && band.curveRule !== 'preserve_bulge') {
            issues.push(issue('warning', 'curved_stretch_band_pinned', `Curved run ${band.runId} remains pinned because no curve-preserving stretch rule is mapped.`, {
                layerId,
                bandId: band.id,
                runId: band.runId
            }));
        }
    }
    for (const external of Array.isArray(targetIssues) ? targetIssues : []) {
        issues.push({ severity: external?.severity === 'warning' ? 'warning' : 'error', ...deepClone(external), layerId: external?.layerId ?? layerId });
    }
    for (const unresolved of Array.isArray(document?.targetRemap?.unresolved) ? document.targetRemap.unresolved : []) {
        issues.push(issue('error', 'unresolved_target_remap', `Authored target ${unresolved?.targetId ?? ''} still needs an explicit remap, orphan, or removal decision.`, {
            layerId,
            targetId: unresolved?.targetId ?? null
        }));
    }
    const sourceRunOrientations = runOrientationsOf(rawLoop);
    for (const neighbor of Array.isArray(neighboringLoops) ? neighboringLoops : []) {
        const neighborLoop = sourceLoopOf(neighbor);
        const neighborRunOrientations = runOrientationsOf(neighborLoop);
        const neighborRuns = new Set(Object.keys(neighborRunOrientations));
        const sharedRunIds = Object.keys(sourceRunOrientations).filter((runId) => neighborRuns.has(runId));
        const incompatibleRunIds = sharedRunIds.filter(
            (runId) => sourceRunOrientations[runId] !== neighborRunOrientations[runId]
        );
        const compatibleRunIds = sharedRunIds.filter((runId) => !incompatibleRunIds.includes(runId));
        const neighborLayerId = typeof neighbor?.layerId === 'string'
            ? neighbor.layerId
            : (typeof neighbor?.id === 'string' ? neighbor.id : null);

        for (const runId of incompatibleRunIds) {
            const sourceLabel = layerId ? `layer ${layerId}` : 'this layer';
            const neighborLabel = neighborLayerId ? `neighboring layer ${neighborLayerId}` : 'the neighboring layer';
            issues.push(issue(
                'warning',
                'transition_run_orientation_mismatch',
                `Run ${runId} cannot continue between ${sourceLabel} and ${neighborLabel} because runForward differs; remap it or start a separate facade group.`,
                {
                    layerId,
                    neighborLayerId,
                    runId,
                    sourceRunForward: sourceRunOrientations[runId],
                    neighborRunForward: neighborRunOrientations[runId]
                }
            ));
        }

        if (!compatibleRunIds.length) {
            const message = sharedRunIds.length
                ? `All shared stable run ids (${sharedRunIds.join(', ')}) have incompatible orientation; facade continuity must stop or be explicitly remapped.`
                : 'The neighboring layer has no compatible stable run ids; facade continuity must stop or be explicitly remapped.';
            issues.push(issue('warning', 'transition_has_no_compatible_runs', message, {
                layerId,
                neighborLayerId,
                sharedRunIds,
                incompatibleRunIds
            }));
        }
    }
    const errors = issues.filter((entry) => entry.severity === 'error');
    const warnings = issues.filter((entry) => entry.severity === 'warning');
    return { valid: errors.length === 0, errors, warnings, issues };
}

function idsOf(loop, key) {
    return [...new Set(sourceLoopOf(loop).map((point) => point?.[key]).filter((id) => typeof id === 'string' && id))];
}

function referencedRunIds(target) {
    const ids = [];
    const visited = new Set();
    const visit = (value, key = '', depth = 0) => {
        if (depth > 12 || value == null) return;
        if (typeof value === 'string') {
            if (/(^|_)(run|face)id$/i.test(key) || /^(master|target|source|from|to)(Run|Face)Id$/.test(key)) {
                if (isRunId(value)) ids.push(value);
            } else if (/(bayref|bandid)$/i.test(key)) {
                const runId = value.split(':')[0];
                if (isRunId(runId)) ids.push(runId);
            }
            return;
        }
        if (typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (typeof entry === 'string' && /(runids|faceids|bayrefs)$/i.test(key)) {
                    const runId = entry.split(':')[0];
                    if (isRunId(runId)) ids.push(runId);
                } else visit(entry, key, depth + 1);
            }
            return;
        }
        for (const [childKey, entry] of Object.entries(value)) {
            if (/bybayref/i.test(key)) {
                const runId = childKey.split(':')[0];
                if (isRunId(runId)) ids.push(runId);
            }
            visit(entry, childKey, depth + 1);
        }
    };
    visit(target);
    return [...new Set(ids)].sort();
}

function targetList(value) {
    if (Array.isArray(value)) return value;
    if (!isObject(value)) return [];
    const out = [];
    for (const [kind, entries] of Object.entries(value)) {
        if (Array.isArray(entries)) {
            entries.forEach((entry, index) => out.push({ kind, targetId: entry?.targetId ?? `${kind}:${index}`, ...deepClone(entry) }));
        } else if (isObject(entries)) {
            for (const [id, entry] of Object.entries(entries)) out.push({ kind, targetId: entry?.targetId ?? `${kind}:${id}`, ...deepClone(entry) });
        }
    }
    return out;
}

function runOrientationsOf(loop) {
    const out = {};
    for (const point of sourceLoopOf(loop)) {
        const runId = point?.runId;
        if (!isRunId(runId) || Object.hasOwn(out, runId)) continue;
        out[runId] = point?.runForward !== false;
    }
    return out;
}

/** Creates a deterministic, non-mutating topology/target review. */
export function createSilhouetteRemapReport({ beforeLoop, afterLoop, targets = [] } = {}) {
    const beforeRunIds = idsOf(beforeLoop, 'runId');
    const afterRunIds = idsOf(afterLoop, 'runId');
    const beforeCornerIds = idsOf(beforeLoop, 'cornerId');
    const afterCornerIds = idsOf(afterLoop, 'cornerId');
    const afterRunSet = new Set(afterRunIds);
    const afterCornerSet = new Set(afterCornerIds);
    const retainedRunIds = beforeRunIds.filter((id) => afterRunSet.has(id));
    const addedRunIds = afterRunIds.filter((id) => !beforeRunIds.includes(id));
    const removedRunIds = beforeRunIds.filter((id) => !afterRunSet.has(id));
    const beforeRunForwardById = runOrientationsOf(beforeLoop);
    const afterRunForwardById = runOrientationsOf(afterLoop);
    const orientationChangedRunIds = retainedRunIds.filter((id) => (
        beforeRunForwardById[id] !== afterRunForwardById[id]
    ));
    const orientationChangedSet = new Set(orientationChangedRunIds);
    const retainedCornerIds = beforeCornerIds.filter((id) => afterCornerSet.has(id));
    const addedCornerIds = afterCornerIds.filter((id) => !beforeCornerIds.includes(id));
    const removedCornerIds = beforeCornerIds.filter((id) => !afterCornerSet.has(id));
    const targetReports = targetList(targets).map((target, index) => {
        const runIds = referencedRunIds(target);
        const missingRunIds = runIds.filter((id) => !afterRunSet.has(id));
        const incompatibleRunIds = runIds.filter((id) => orientationChangedSet.has(id));
        const needsDecision = missingRunIds.length > 0 || incompatibleRunIds.length > 0;
        const targetId = typeof target?.targetId === 'string' && target.targetId
            ? target.targetId
            : `target:${index}`;
        return {
            targetId,
            kind: typeof target?.kind === 'string' ? target.kind : 'target',
            runIds,
            missingRunIds,
            incompatibleRunIds,
            status: needsDecision ? 'needs_decision' : 'retained',
            message: incompatibleRunIds.length
                ? `Run orientation changed for ${incompatibleRunIds.join(', ')}; choose an explicit remap, orphan, or removal policy.`
                : (missingRunIds.length ? `Run ${missingRunIds.join(', ')} no longer exists.` : ''),
            target: deepClone(target),
            candidateRunIds: needsDecision ? [...afterRunIds] : []
        };
    });
    return {
        retainedRunIds,
        addedRunIds,
        removedRunIds,
        orientationChangedRunIds,
        beforeRunForwardById,
        afterRunForwardById,
        retainedCornerIds,
        addedCornerIds,
        removedCornerIds,
        targets: targetReports,
        requiresDecisions: targetReports.some((target) => target.status === 'needs_decision')
    };
}

function orientationMappingsForTarget(report, target, targetRunId) {
    const affectedRunIds = new Set([
        ...(Array.isArray(target?.missingRunIds) ? target.missingRunIds : []),
        ...(Array.isArray(target?.incompatibleRunIds) ? target.incompatibleRunIds : [])
    ]);
    return (Array.isArray(target?.runIds) ? target.runIds : []).map((sourceRunId) => {
        const affected = affectedRunIds.has(sourceRunId);
        const resolvedTargetRunId = affected ? targetRunId : sourceRunId;
        const sourceRunForward = report?.beforeRunForwardById?.[sourceRunId] !== false;
        const targetRunForward = report?.afterRunForwardById?.[resolvedTargetRunId] !== false;
        return {
            sourceRunId,
            targetRunId: resolvedTargetRunId,
            affected,
            sourceRunForward,
            targetRunForward,
            reverseLocalU: sourceRunForward !== targetRunForward
        };
    });
}

/** Validates explicit retain/remap/orphan/discard choices without mutating config. */
export function applySilhouetteRemapDecisions(report, decisions = {}) {
    const availableRunIds = new Set([...(report?.retainedRunIds ?? []), ...(report?.addedRunIds ?? [])]);
    const resolved = [];
    const unresolved = [];
    for (const target of Array.isArray(report?.targets) ? report.targets : []) {
        if (target.status === 'retained') {
            resolved.push({
                ...deepClone(target),
                decision: SILHOUETTE_REMAP_DECISION.KEEP,
                resolvedRunIds: [...target.runIds],
                reverseLocalU: false,
                orientationMappings: target.runIds.map((runId) => ({
                    sourceRunId: runId,
                    targetRunId: runId,
                    affected: false,
                    sourceRunForward: report?.beforeRunForwardById?.[runId] !== false,
                    targetRunForward: report?.afterRunForwardById?.[runId] !== false,
                    reverseLocalU: false
                }))
            });
            continue;
        }
        const rawDecision = decisions?.[target.targetId];
        const decision = typeof rawDecision === 'string' ? { action: rawDecision } : rawDecision;
        const action = decision?.action;
        if (action === SILHOUETTE_REMAP_DECISION.REMAP) {
            const runId = decision?.runId;
            if (isRunId(runId) && availableRunIds.has(runId)) {
                const orientationMappings = orientationMappingsForTarget(report, target, runId);
                const resolvedRunIds = [...new Set(orientationMappings.map((mapping) => mapping.targetRunId))];
                resolved.push({
                    ...deepClone(target),
                    decision: action,
                    resolvedRunIds,
                    reverseLocalU: orientationMappings.some((mapping) => mapping.affected && mapping.reverseLocalU),
                    orientationMappings
                });
            } else {
                unresolved.push({ ...deepClone(target), reason: 'invalid_remap_target' });
            }
            continue;
        }
        if (action === SILHOUETTE_REMAP_DECISION.ORPHAN
            || action === SILHOUETTE_REMAP_DECISION.REMOVE
            || action === 'discard') {
            resolved.push({ ...deepClone(target), decision: action, resolvedRunIds: [] });
            continue;
        }
        unresolved.push({ ...deepClone(target), reason: 'explicit_decision_required' });
    }
    return {
        valid: unresolved.length === 0,
        resolved,
        unresolved,
        targetRemap: {
            version: 1,
            decisions: deepClone(decisions),
            resolved: deepClone(resolved),
            unresolved: deepClone(unresolved)
        }
    };
}

function loopFingerprint(loop) {
    return sourceLoopOf(loop).map((point) => `${point?.runId}:${point?.runForward !== false ? 'f' : 'r'}`).join('|');
}

/** Captures stable named-band provenance for one authoritative fit solution. */
export function createSilhouetteStretchProvenance({
    sourceLoop,
    stretchBands,
    applications = [],
    sourceLayerId = null,
    lineageId = sourceLayerId
} = {}) {
    const normalized = normalizeSilhouetteLoop(sourceLoop).loop;
    const bands = normalizeStretchBands(stretchBands).map((band) => {
        const point = normalized.find((entry) => entry.runId === band.runId);
        return {
            id: band.id,
            runId: band.runId ?? null,
            end: band.end ?? null,
            runForward: point?.runForward !== false,
            curveRule: band.curveRule,
            stretchable: band.stretchable
        };
    });
    const byAlias = new Map(bands.map((band) => [`${band.runId}:${band.end}`, band.id]));
    return {
        version: 1,
        ...(typeof sourceLayerId === 'string' && sourceLayerId ? { sourceLayerId } : {}),
        ...(typeof lineageId === 'string' && lineageId ? { lineageId } : {}),
        sourceFingerprint: loopFingerprint(normalized),
        sourceRunIds: normalized.map((point) => point.runId),
        bands,
        applications: (Array.isArray(applications) ? applications : []).map((application) => ({
            ...deepClone(application),
            bandId: application?.bandId ?? byAlias.get(`${application?.faceId ?? application?.runId}:${application?.end}`)
                ?? `${application?.faceId ?? application?.runId}:${application?.end}`
        }))
    };
}

function mappedBand(sourceBand, bandMap, { requireExplicit = false } = {}) {
    if (requireExplicit && (!isObject(bandMap) || !Object.hasOwn(bandMap, sourceBand.id))) return null;
    const mapping = isObject(bandMap) ? bandMap[sourceBand.id] : null;
    if (typeof mapping === 'string') return { id: mapping, runId: mapping.split(':')[0], end: mapping.split(':')[1] };
    if (isObject(mapping)) return { ...sourceBand, ...mapping };
    return sourceBand;
}

function curvedEndpointMoved(before, after, index) {
    const next = (index + 1) % before.length;
    return Math.hypot(before[index].x - after.points[index].x, before[index].z - after.points[index].z) > EPSILON
        || Math.hypot(before[next].x - after.points[next].x, before[next].z - after.points[next].z) > EPSILON;
}

/**
 * Replays one authoritative lot-fit solution on a compatible layer. Missing,
 * reversed, curved, or unmapped bands are pinned and reported; nothing guesses.
 */
export function replaySilhouetteLotFitApplications({
    loop,
    provenance,
    applications = null,
    bandMap = null,
    minRunLengths = null,
    targetSourceLayerId = null,
    targetLineageId = targetSourceLayerId
} = {}) {
    const normalized = normalizeSilhouetteLoop(loop).loop;
    let current = normalized.map((point) => deepClone(point));
    const sourceApplications = Array.isArray(applications) ? applications : (Array.isArray(provenance?.applications) ? provenance.applications : []);
    const applied = [];
    const issues = [];
    if (!sourceApplications.length) {
        return { loop: current, applied, issues, reachable: true };
    }
    if (!isObject(provenance)
        || typeof provenance.sourceFingerprint !== 'string'
        || !provenance.sourceFingerprint
        || !Array.isArray(provenance.bands)) {
        issues.push(issue(
            'warning',
            'lot_fit_provenance_required',
            'Lot-fit applications were pinned because their authoritative silhouette provenance is missing or incomplete.'
        ));
        return { loop: current, applied, issues, reachable: false };
    }
    const sourceBands = new Map(provenance.bands
        .filter((band) => isObject(band) && typeof band.id === 'string' && band.id)
        .map((band) => [band.id, band]));
    const sourceLineageId = typeof provenance?.lineageId === 'string' && provenance.lineageId
        ? provenance.lineageId
        : (typeof provenance?.sourceLayerId === 'string' ? provenance.sourceLayerId : null);
    const targetLineage = typeof targetLineageId === 'string' && targetLineageId
        ? targetLineageId
        : null;
    const targetFingerprint = loopFingerprint(normalized);
    const provenanceIsCompatible = sourceLineageId
        ? sourceLineageId === targetLineage
        : provenance.sourceFingerprint === targetFingerprint;
    const requiresExplicitLineageMap = !provenanceIsCompatible;
    for (let index = 0; index < sourceApplications.length; index++) {
        const application = sourceApplications[index];
        const sourceBandId = application?.bandId ?? `${application?.faceId ?? application?.runId}:${application?.end}`;
        const sourceBand = sourceBands.get(sourceBandId) ?? null;
        if (!sourceBand) {
            issues.push(issue('warning', 'lot_fit_provenance_band_missing', `Lot-fit band ${sourceBandId} was pinned because it is absent from the authoritative provenance.`, { bandId: sourceBandId }));
            continue;
        }
        if (!isRunId(sourceBand.runId)
            || (sourceBand.end !== 'start' && sourceBand.end !== 'end')
            || typeof sourceBand.runForward !== 'boolean'
            || sourceBand.stretchable === false) {
            issues.push(issue('warning', 'lot_fit_provenance_band_invalid', `Lot-fit band ${sourceBandId} was pinned because its authoritative run, end, orientation, or stretch policy is invalid.`, { bandId: sourceBandId }));
            continue;
        }
        const targetBand = mappedBand(sourceBand, bandMap, { requireExplicit: requiresExplicitLineageMap });
        if (!targetBand) {
            issues.push(issue('warning', 'lot_fit_lineage_mapping_required', `Lot-fit band ${sourceBandId} was pinned because its source provenance is not compatible with the target silhouette and no explicit band mapping was supplied.`, {
                bandId: sourceBandId,
                sourceLineageId,
                targetLineageId: targetLineage,
                sourceFingerprint: provenance.sourceFingerprint,
                targetFingerprint
            }));
            continue;
        }
        const targetIndex = current.findIndex((point) => point.runId === targetBand.runId);
        if (targetIndex < 0 || (targetBand.end !== 'start' && targetBand.end !== 'end')) {
            issues.push(issue('warning', 'lot_fit_band_unmapped', `Lot-fit band ${sourceBandId} was pinned because its stable run/end mapping is unavailable.`, { bandId: sourceBandId }));
            continue;
        }
        if ((current[targetIndex].runForward !== false) !== (sourceBand.runForward !== false) && targetBand.allowReverse !== true) {
            issues.push(issue('warning', 'lot_fit_orientation_mismatch', `Lot-fit band ${sourceBandId} was pinned because run orientation differs.`, { bandId: sourceBandId, runId: targetBand.runId }));
            continue;
        }
        if (current[targetIndex].arc !== undefined && targetBand.curveRule !== 'preserve_bulge') {
            issues.push(issue('warning', 'lot_fit_curved_band_pinned', `Curved run ${targetBand.runId} was pinned because no curve-preserving stretch rule is compatible.`, { bandId: sourceBandId, runId: targetBand.runId }));
            continue;
        }
        let transformed;
        try {
            const straightPlan = createFootprintPlan(current.map((point) => ({
                x: point.x,
                z: point.z,
                runId: point.runId,
                runForward: point.runForward !== false,
                ...(point.split === true ? { split: true } : {})
            })));
            transformed = stretchFootprint(straightPlan, {
                faceId: targetBand.runId,
                end: targetBand.end,
                delta: Number(application?.appliedDelta),
                minLengthByRunId: minRunLengths
            });
        } catch (error) {
            issues.push(issue('warning', 'lot_fit_replay_invalid', `Lot-fit band ${sourceBandId} was pinned: ${error instanceof Error ? error.message : String(error)}`, { bandId: sourceBandId, runId: targetBand.runId }));
            continue;
        }
        const requestedDelta = Number(application?.appliedDelta);
        if (!Number.isFinite(requestedDelta)
            || Math.abs(transformed.appliedDelta - requestedDelta) > EPSILON) {
            issues.push(issue('warning', 'lot_fit_replay_clamped', `Lot-fit band ${sourceBandId} stopped at a layer-specific minimum instead of replaying the full authoritative delta.`, {
                bandId: sourceBandId,
                runId: targetBand.runId,
                requestedDelta,
                appliedDelta: transformed.appliedDelta
            }));
        }
        const movedCurveIndices = current
            .map((point, pointIndex) => point.arc !== undefined && curvedEndpointMoved(current, transformed.footprint, pointIndex) ? pointIndex : -1)
            .filter((pointIndex) => pointIndex >= 0);
        const incompatibleCurveIndex = movedCurveIndices.find((pointIndex) => (
            current[pointIndex].runId !== targetBand.runId || targetBand.curveRule !== 'preserve_bulge'
        ));
        if (incompatibleCurveIndex !== undefined) {
            issues.push(issue('warning', 'lot_fit_curve_provenance_incompatible', `Lot-fit band ${sourceBandId} was pinned because it would move curved run ${current[incompatibleCurveIndex].runId}.`, {
                bandId: sourceBandId,
                runId: current[incompatibleCurveIndex].runId
            }));
            continue;
        }
        current = reattachPointMetadata(current, transformed.footprint);
        applied.push({
            ...deepClone(application),
            sourceBandId,
            targetBandId: targetBand.id,
            targetRunId: targetBand.runId,
            targetEnd: targetBand.end,
            appliedDelta: transformed.appliedDelta
        });
    }
    return {
        loop: current,
        applied,
        issues,
        reachable: issues.length === 0 && applied.length === sourceApplications.length
    };
}
