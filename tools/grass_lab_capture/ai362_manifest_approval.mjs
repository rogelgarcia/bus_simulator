// Converts raw AI 362 Grass Lab capture evidence into a fail-closed V2 approval record.

// @ts-check

import {
    createGrassLabV2ApprovalRecord,
    GRASS_LAB_V2_REQUIRED_CAMERA_IDS,
    GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS,
    GRASS_LAB_V2_REQUIRED_LIGHTING_IDS,
    GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS,
    GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS,
    GRASS_LAB_V2_REQUIRED_REGRESSIONS
} from '../../src/app/grass/GrassLabValidationContract.js';

const MANIFEST_SCHEMA = 'grass-lab-capture-manifest-v2';
const MATRIX = 'ai362-validation';
const APPROVAL_PHASE = 'after';
const WIDTH = 3840;
const HEIGHT = 2160;
const PIXEL_RATIO = 1;
const REQUIRED_TIER_IDS = Object.freeze(['boundary', 'near', 'billboard', 'middle', 'accent']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => Number.isFinite(Number(value));
const isNonNegativeInteger = (value) => Number.isInteger(Number(value)) && Number(value) >= 0;
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const sortedStrings = (values) => [...new Set(values.map(String))].sort();

function addGap(gaps, path, reason) {
    gaps.push({ path, reason });
}

function requireRecord(value, path, gaps) {
    if (!isRecord(value)) {
        addGap(gaps, path, 'must be a recorded object');
        return {};
    }
    return value;
}

function requireExactIds(actualIds, requiredIds, path, gaps) {
    const actual = new Set(actualIds.map(String));
    for (const id of requiredIds) {
        if (!actual.has(id)) addGap(gaps, `${path}.${id}`, 'required raw evidence is absent');
    }
}

function hasVector3(value) {
    return isRecord(value)
        && isFiniteNumber(value.x)
        && isFiniteNumber(value.y)
        && isFiniteNumber(value.z);
}

function hasExplicitDisabledLowQualityHierarchy(entry) {
    const field = entry?.hierarchyDiagnostics;
    return entry?.fallbackMode === 'low_quality'
        && entry?.qualityPreset === 'low'
        && field?.enabled === false
        && field?.boundarySignature === null
        && field?.placementSignature === null
        && [field, field?.billboard, field?.middle].every((stats) => (
            Number(stats?.instances) === 0
            && Number(stats?.triangles) === 0
            && Number(stats?.drawCalls) === 0
        ));
}

function captureStateMetadataComplete(entry) {
    const cost = entry?.cost;
    const lod = entry?.lodDiagnostics;
    return isNonEmptyString(entry?.file)
        && SHA256_PATTERN.test(String(entry?.contentSha256 ?? ''))
        && hasVector3(entry?.camera?.position)
        && hasVector3(entry?.camera?.target)
        && isFiniteNumber(entry?.camera?.heightMeters)
        && isNonEmptyString(entry?.focus?.id)
        && isNonEmptyString(entry?.lightingPreset)
        && isFiniteNumber(entry?.exposure)
        && isNonEmptyString(entry?.qualityPreset)
        && isNonEmptyString(entry?.activeLodTier)
        && isRecord(entry?.materialDiagnostics)
        && isNonEmptyString(entry.materialDiagnostics.midCompiledShaderSignature)
        && isNonEmptyString(entry.materialDiagnostics.midMaterialId)
        && isNonEmptyString(entry.materialDiagnostics.accentMaterialId)
        && isRecord(entry?.coverageDiagnostics)
        && isNonEmptyString(entry.coverageDiagnostics.boundarySignature)
        && isRecord(entry?.nearDiagnostics)
        && isNonEmptyString(entry.nearDiagnostics.placementSignature)
        && isRecord(entry?.hierarchyDiagnostics)
        && (isNonEmptyString(entry.hierarchyDiagnostics.placementSignature)
            || hasExplicitDisabledLowQualityHierarchy(entry))
        && isRecord(entry?.accentDiagnostics)
        && isNonEmptyString(entry.accentDiagnostics.placementSignature)
        && isRecord(lod)
        && isRecord(lod.weights)
        && isFiniteNumber(lod.transitionProgress)
        && isRecord(cost)
        && isNonNegativeInteger(cost.combinedVisibleGrassTriangles)
        && isNonNegativeInteger(cost.combinedVisibleGrassLogicalDrawCalls)
        && isNonNegativeInteger(cost.totalRendererDrawCalls);
}

function inspectCaptureEvidence(manifest, phaseDiagnostics, gaps) {
    const allCaptures = Array.isArray(manifest.captures) ? manifest.captures : [];
    if (!Array.isArray(manifest.captures)) addGap(gaps, 'captures', 'must be a recorded array');
    const after = allCaptures.filter((entry) => entry?.matrix === MATRIX && entry?.phase === APPROVAL_PHASE);
    if (!after.length) addGap(gaps, 'captures.after', 'AI 362 AFTER captures are absent');

    const requiredBuffer = requireRecord(manifest.requiredDrawingBuffer, 'requiredDrawingBuffer', gaps);
    if (
        Number(requiredBuffer.width) !== WIDTH
        || Number(requiredBuffer.height) !== HEIGHT
        || Number(requiredBuffer.pixelRatio) !== PIXEL_RATIO
    ) addGap(gaps, 'requiredDrawingBuffer', 'must record an actual 3840x2160 drawing buffer at pixel ratio 1');

    for (const [index, entry] of after.entries()) {
        const path = `captures.after[${index}]`;
        if (
            Number(entry?.png?.width) !== WIDTH
            || Number(entry?.png?.height) !== HEIGHT
            || entry?.png?.format !== 'png'
            || entry?.png?.lossless !== true
        ) addGap(gaps, `${path}.png`, 'must explicitly record a verified lossless 3840x2160 PNG');
        if (
            Number(entry?.canvas?.drawingBufferWidth) !== WIDTH
            || Number(entry?.canvas?.drawingBufferHeight) !== HEIGHT
            || Number(entry?.canvas?.rendererPixelRatio) !== PIXEL_RATIO
        ) addGap(gaps, `${path}.canvas`, 'must record the exact native drawing buffer');
        if (!captureStateMetadataComplete(entry)) {
            addGap(gaps, `${path}.state`, 'camera, material, exact-placement, LOD, or cost metadata is incomplete');
        }
        if (entry?.captureVariant !== 'diagnostic_overlay' && (entry?.uiFree !== true || entry?.diagnosticOverlayAttached !== false)) {
            addGap(gaps, `${path}.uiFree`, 'clean approval frames must explicitly record UI-free capture');
        }
        if (entry?.captureVariant === 'diagnostic_overlay' && entry?.diagnosticOverlayAttached !== true) {
            addGap(gaps, `${path}.diagnosticOverlayAttached`, 'diagnostic frames must explicitly record the overlay');
        }
    }

    const sourceCaptures = after.filter((entry) => entry?.approvalDiagnosticSource === true);
    if (sourceCaptures.length !== 1) {
        addGap(gaps, 'captures.approvalDiagnosticSource', 'exactly one raw approval-diagnostic source capture is required');
    }
    const source = sourceCaptures[0] ?? {};
    if (Number(source.snapshotContractVersion) !== 10) {
        addGap(gaps, 'captures.approvalDiagnosticSource.snapshotContractVersion', 'must explicitly record Grass Lab snapshot contract version 10');
    }

    const reviewCoverage = requireRecord(phaseDiagnostics.ai362Gate?.reviewCoverage, 'diagnosticsByPhase.after.ai362Gate.reviewCoverage', gaps);
    const reviewedCameraIds = sortedStrings(Array.isArray(reviewCoverage.cameraIds) ? reviewCoverage.cameraIds : []);
    const reviewedLightingIds = sortedStrings(Array.isArray(reviewCoverage.lightingIds) ? reviewCoverage.lightingIds : []);
    const reviewedMotionPathIds = sortedStrings(Array.isArray(reviewCoverage.motionPathIds) ? reviewCoverage.motionPathIds : []);
    const reviewedEvidenceIds = sortedStrings(Array.isArray(reviewCoverage.evidenceIds) ? reviewCoverage.evidenceIds : []);
    const captureEvidenceIds = sortedStrings(after.flatMap((entry) => (
        Array.isArray(entry?.evidenceIds) ? entry.evidenceIds : []
    )));
    requireExactIds(reviewedCameraIds, GRASS_LAB_V2_REQUIRED_CAMERA_IDS, 'reviewedCameraIds', gaps);
    requireExactIds(reviewedLightingIds, GRASS_LAB_V2_REQUIRED_LIGHTING_IDS, 'reviewedLightingIds', gaps);
    requireExactIds(reviewedMotionPathIds, GRASS_LAB_V2_REQUIRED_MOTION_PATH_IDS, 'reviewedMotionPathIds', gaps);
    requireExactIds(reviewedEvidenceIds, GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS, 'reviewedEvidenceIds', gaps);
    requireExactIds(captureEvidenceIds, GRASS_LAB_V2_REQUIRED_EVIDENCE_IDS, 'captures.evidenceIds', gaps);

    const baselineReference = requireRecord(phaseDiagnostics.ai362BaselineReference, 'diagnosticsByPhase.after.ai362BaselineReference', gaps);
    const matchedPairs = Array.isArray(phaseDiagnostics.ai362Gate?.baselinePairChecks)
        ? phaseDiagnostics.ai362Gate.baselinePairChecks
        : [];
    if (
        baselineReference.pass !== true
        || phaseDiagnostics.ai362Gate?.baselineReferencePass !== true
        || !SHA256_PATTERN.test(String(baselineReference.sourceManifestSha256 ?? ''))
        || matchedPairs.length === 0
        || matchedPairs.some((pair) => pair?.pass !== true || pair?.baselineFileVerified !== true)
    ) addGap(gaps, 'captures.beforeAfterPairs', 'immutable AI 361 baseline mappings and verified matched pairs must pass');

    const diagnosticFrames = after.filter((entry) => entry?.captureVariant === 'diagnostic_overlay');
    if (!diagnosticFrames.length) addGap(gaps, 'captures.diagnosticOverlays', 'separate diagnostic-overlay frames are absent');
    const stateMetadataComplete = after.length > 0 && after.every(captureStateMetadataComplete);
    const imageDimensionsVerified = after.length > 0 && after.every((entry) => (
        Number(entry?.png?.width) === WIDTH && Number(entry?.png?.height) === HEIGHT
    ));
    const lossless = after.length > 0 && after.every((entry) => (
        entry?.png?.format === 'png' && entry?.png?.lossless === true
    ));
    const actualDrawingBuffer = after.length > 0 && after.every((entry) => (
        Number(entry?.canvas?.drawingBufferWidth) === WIDTH
        && Number(entry?.canvas?.drawingBufferHeight) === HEIGHT
        && Number(entry?.canvas?.rendererPixelRatio) === PIXEL_RATIO
    ));
    const cleanFrames = after.filter((entry) => entry?.captureVariant !== 'diagnostic_overlay');
    const uiFreeVisuals = cleanFrames.length > 0
        && cleanFrames.every((entry) => entry?.uiFree === true && entry?.diagnosticOverlayAttached === false);
    const separateDiagnosticOverlays = diagnosticFrames.length > 0
        && diagnosticFrames.every((entry) => entry?.diagnosticOverlayAttached === true);
    const matchedBeforeAfter = baselineReference.pass === true
        && phaseDiagnostics.ai362Gate?.baselineReferencePass === true
        && matchedPairs.length > 0
        && matchedPairs.every((pair) => pair?.pass === true && pair?.baselineFileVerified === true);
    const screenshotManifest = after.map((entry) => ({
        phase: entry.phase,
        recipeId: entry.recipeId,
        pairId: entry.pairId ?? null,
        captureVariant: entry.captureVariant ?? null,
        file: entry.file,
        contentSha256: entry.contentSha256,
        png: cloneJson(entry.png),
        canvas: cloneJson(entry.canvas),
        camera: cloneJson(entry.camera),
        focus: cloneJson(entry.focus),
        lightingPreset: entry.lightingPreset,
        exposure: entry.exposure,
        qualityPreset: entry.qualityPreset,
        activeLodTier: entry.activeLodTier,
        lod: cloneJson(entry.lodDiagnostics),
        coverage: cloneJson(entry.coverageDiagnostics),
        nearCarpet: cloneJson(entry.nearDiagnostics),
        field: cloneJson(entry.hierarchyDiagnostics),
        accent: cloneJson(entry.accentDiagnostics),
        material: cloneJson(entry.materialDiagnostics),
        cost: cloneJson(entry.cost),
        uiFree: entry.uiFree === true,
        diagnosticOverlayAttached: entry.diagnosticOverlayAttached === true
    }));

    return {
        source,
        recipeIds: new Set(after.map((entry) => String(entry?.recipeId ?? ''))),
        reviewedCameraIds,
        reviewedLightingIds,
        reviewedMotionPathIds,
        reviewedEvidenceIds,
        captureEvidence: {
            manifestSchema: manifest.schema,
            drawingBuffer: { width: WIDTH, height: HEIGHT },
            pixelRatio: PIXEL_RATIO,
            actualDrawingBuffer,
            format: 'png',
            lossless,
            imageDimensionsVerified,
            imageCount: after.length,
            stateMetadataComplete,
            uiFreeVisuals,
            separateDiagnosticOverlays,
            matchedBeforeAfter,
            matchedPairs,
            baselineReference: cloneJson(baselineReference),
            screenshotManifest,
            captureGate: cloneJson(phaseDiagnostics.ai362Gate ?? null)
        }
    };
}

function inspectRegressionEvidence(phaseDiagnostics, recipeIds, gaps) {
    const gate = requireRecord(phaseDiagnostics.ai362RegressionGate, 'diagnosticsByPhase.after.ai362RegressionGate', gaps);
    const results = Array.isArray(gate.results) ? gate.results : [];
    if (!Array.isArray(gate.results)) addGap(gaps, 'diagnosticsByPhase.after.ai362RegressionGate.results', 'must be a recorded array');
    const counts = new Map();
    const regressions = {};
    for (const result of results) {
        const id = String(result?.id ?? '');
        counts.set(id, (counts.get(id) ?? 0) + 1);
        const evidenceRecipeIds = Array.isArray(result?.evidenceRecipeIds) ? result.evidenceRecipeIds.map(String) : [];
        const rawChecks = isRecord(result?.checks) ? result.checks : {};
        const measurements = isRecord(result?.measurements) ? result.measurements : {};
        const hasRawEvidence = evidenceRecipeIds.length > 0
            && (Object.keys(rawChecks).length > 0 || Object.keys(measurements).length > 0);
        const referencesExist = evidenceRecipeIds.every((recipeId) => recipeIds.has(recipeId));
        const checksPass = Object.values(rawChecks).every((value) => value === true);
        const pass = result?.pass === true && hasRawEvidence && referencesExist && checksPass;
        regressions[id] = pass;
        if (!pass) addGap(gaps, `regressions.${id || '<missing>'}`, 'must pass with raw checks/measurements and references to recorded captures');
        if (!GRASS_LAB_V2_REQUIRED_REGRESSIONS.includes(id)) {
            addGap(gaps, `regressions.${id || '<missing>'}`, 'is not part of the exact V2 regression catalog');
        }
    }
    for (const id of GRASS_LAB_V2_REQUIRED_REGRESSIONS) {
        if (counts.get(id) !== 1) addGap(gaps, `regressions.${id}`, 'requires exactly one raw regression result');
    }
    if (gate.pass !== true) addGap(gaps, 'diagnosticsByPhase.after.ai362RegressionGate.pass', 'aggregate regression gate did not pass');
    return { regressions, regressionResults: cloneJson(results) };
}

function validatePerformanceRow(row, path, gaps) {
    const gate = requireRecord(row?.performanceGate, `${path}.performanceGate`, gaps);
    if (row?.matrix !== MATRIX || row?.phase !== APPROVAL_PHASE) {
        addGap(gaps, path, 'must be an AI 362 AFTER performance row');
    }
    if (
        gate.schema !== 'grass-lab-performance-gate-v1'
        || gate.statistic !== 'arithmetic_mean'
        || typeof gate.pass !== 'boolean'
        || !isRecord(gate.measurements)
    ) addGap(gaps, `${path}.performanceGate`, 'must retain the complete measured performance gate and verdict');
    if (row?.statistic !== 'arithmetic_mean') addGap(gaps, `${path}.statistic`, 'must record arithmetic_mean');
    const warmup = requireRecord(row?.warmup, `${path}.warmup`, gaps);
    const budget = requireRecord(gate.budget, `${path}.performanceGate.budget`, gaps);
    if (
        Number(warmup.frames) < Number(budget.minimumWarmupFrames)
        || Number(warmup.durationMs) < Number(budget.minimumWarmupMs)
        || Number(warmup.stableZeroUploadFrames) < Number(budget.minimumStableUploadFrames)
    ) addGap(gaps, `${path}.warmup`, 'warm-up evidence does not meet the recorded gate');
    const host = requireRecord(row?.hardware?.host, `${path}.hardware.host`, gaps);
    const browser = requireRecord(row?.hardware?.browser, `${path}.hardware.browser`, gaps);
    if (!isNonEmptyString(host.cpuModel) || !isFiniteNumber(host.totalMemoryBytes) || !isFiniteNumber(host.freeMemoryBytesAtCapture)) {
        addGap(gaps, `${path}.hardware.host`, 'CPU and host-memory evidence is incomplete');
    }
    if (!isRecord(browser.graphics) || !isRecord(browser.memory)) {
        addGap(gaps, `${path}.hardware.browser`, 'graphics and browser-memory evidence is incomplete');
    }
    const sampleCount = requireRecord(row?.sampleCount, `${path}.sampleCount`, gaps);
    if (!isNonNegativeInteger(sampleCount.cpu) || !isNonNegativeInteger(sampleCount.gpu) || !isNonNegativeInteger(sampleCount.frame)) {
        addGap(gaps, `${path}.sampleCount`, 'CPU, GPU, and frame sample counts must be retained');
    }
    for (const key of [
        'boundaryTriangles',
        'nearTriangles',
        'billboardTriangles',
        'middleTriangles',
        'accentTriangles',
        'coverageLogicalDrawCalls',
        'nearLogicalDrawCalls',
        'billboardLogicalDrawCalls',
        'middleLogicalDrawCalls',
        'accentLogicalDrawCalls',
        'combinedVisibleGrassTriangles',
        'combinedVisibleGrassLogicalDrawCalls',
        'totalRendererDrawCalls',
        'geometryBeyondCutoff'
    ]) {
        if (!isNonNegativeInteger(row?.[key])) addGap(gaps, `${path}.${key}`, 'must be a recorded non-negative integer');
    }
    if (!isNonNegativeInteger(row?.stationaryBufferUpdates?.maximum)) {
        addGap(gaps, `${path}.stationaryBufferUpdates.maximum`, 'must retain the measured stationary upload maximum');
    }
}

function inspectPerformanceEvidence(phaseDiagnostics, gaps) {
    const recordedRows = Array.isArray(phaseDiagnostics.costSamples) ? phaseDiagnostics.costSamples : [];
    if (!Array.isArray(phaseDiagnostics.costSamples)) addGap(gaps, 'diagnosticsByPhase.after.costSamples', 'must be a recorded array');
    const rows = recordedRows.filter((row) => GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS.includes(row?.sampleId));
    const embeddedNative4kRows = recordedRows.filter((row) => row?.sampleId === 'native4k_default_billboard_middle');
    const unexpectedRows = recordedRows.filter((row) => (
        !GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS.includes(row?.sampleId)
        && row?.sampleId !== 'native4k_default_billboard_middle'
    ));
    if (unexpectedRows.length) addGap(gaps, 'diagnosticsByPhase.after.costSamples', 'contains an unexpected performance row');
    rows.forEach((row, index) => validatePerformanceRow(row, `performanceMeasurements[${index}]`, gaps));
    const counts = new Map();
    for (const row of rows) counts.set(String(row?.sampleId ?? ''), (counts.get(String(row?.sampleId ?? '')) ?? 0) + 1);
    for (const id of GRASS_LAB_V2_REQUIRED_PERFORMANCE_SAMPLE_IDS) {
        const matches = rows.filter((row) => row?.sampleId === id);
        if (counts.get(id) !== 1) addGap(gaps, `performanceMeasurements.${id}`, 'requires exactly one 1920x1080 row');
        else {
            if (matches[0].resolution !== '1920x1080') addGap(gaps, `performanceMeasurements.${id}.resolution`, 'must be measured at 1920x1080');
            const expectedQuality = id === 'quality_low' ? 'low' : (id === 'quality_high' ? 'high' : 'default');
            if (matches[0].qualityPreset !== expectedQuality) addGap(gaps, `performanceMeasurements.${id}.qualityPreset`, `must be ${expectedQuality}`);
        }
    }
    if (embeddedNative4kRows.length !== 1) {
        addGap(gaps, 'diagnosticsByPhase.after.costSamples.native4k_default_billboard_middle', 'requires exactly one separately classified native-4K row');
    }
    const defaultRow = rows.find((row) => row?.sampleId === 'quality_default' && row?.resolution === '1920x1080') ?? {};
    const structural = {
        trianglesByTier: {
            boundary: defaultRow.boundaryTriangles,
            near: defaultRow.nearTriangles,
            billboard: defaultRow.billboardTriangles,
            middle: defaultRow.middleTriangles,
            accent: defaultRow.accentTriangles
        },
        drawCallsByTier: {
            boundary: defaultRow.coverageLogicalDrawCalls,
            near: defaultRow.nearLogicalDrawCalls,
            billboard: defaultRow.billboardLogicalDrawCalls,
            middle: defaultRow.middleLogicalDrawCalls,
            accent: defaultRow.accentLogicalDrawCalls
        },
        combinedVisibleGrassTriangles: defaultRow.combinedVisibleGrassTriangles,
        combinedVisibleGrassLogicalDrawCalls: defaultRow.combinedVisibleGrassLogicalDrawCalls,
        totalRendererDrawCalls: defaultRow.totalRendererDrawCalls,
        geometryBeyondCutoff: defaultRow.geometryBeyondCutoff,
        stationaryBufferUpdates: defaultRow.stationaryBufferUpdates?.maximum
    };
    const triangleSum = REQUIRED_TIER_IDS.reduce((sum, id) => sum + Number(structural.trianglesByTier[id]), 0);
    const drawSum = REQUIRED_TIER_IDS.reduce((sum, id) => sum + Number(structural.drawCallsByTier[id]), 0);
    if (!REQUIRED_TIER_IDS.every((id) => isNonNegativeInteger(structural.trianglesByTier[id])) || triangleSum !== Number(structural.combinedVisibleGrassTriangles)) {
        addGap(gaps, 'diagnostics.structural.trianglesByTier', 'default-row tier triangles must exactly sum to the combined total');
    }
    if (!REQUIRED_TIER_IDS.every((id) => isNonNegativeInteger(structural.drawCallsByTier[id])) || drawSum !== Number(structural.combinedVisibleGrassLogicalDrawCalls)) {
        addGap(gaps, 'diagnostics.structural.drawCallsByTier', 'default-row tier draws must exactly sum to the combined total');
    }
    return {
        performanceMeasurements: cloneJson(rows),
        embeddedNative4k: cloneJson(embeddedNative4kRows[0] ?? null),
        structural,
        environment: { performance1080: cloneJson(defaultRow.hardware ?? {}) }
    };
}

function inspectNative4kTiming(phaseDiagnostics, gaps) {
    const row = requireRecord(phaseDiagnostics.ai362Native4kTiming, 'diagnosticsByPhase.after.ai362Native4kTiming', gaps);
    const gate = requireRecord(row.performanceGate, 'diagnosticsByPhase.after.ai362Native4kTiming.performanceGate', gaps);
    if (
        row.phase !== APPROVAL_PHASE
        || row.matrix !== MATRIX
        || row.resolution !== `${WIDTH}x${HEIGHT}`
        || row.informationalOnly !== true
        || row.recorded !== true
        || row.statistic !== 'arithmetic_mean'
    ) addGap(gaps, 'diagnosticsByPhase.after.ai362Native4kTiming', 'must retain the recorded informational native-4K timing row');
    if (
        gate.schema !== 'grass-lab-performance-gate-v1'
        || gate.statistic !== 'arithmetic_mean'
        || typeof gate.pass !== 'boolean'
        || !isRecord(gate.measurements)
    ) addGap(gaps, 'diagnosticsByPhase.after.ai362Native4kTiming.performanceGate', 'must retain the measured native-4K gate payload and verdict');
    if (!isRecord(row.performanceMeasurement) || !isRecord(row.performanceMeasurement.graphics)) {
        addGap(gaps, 'diagnosticsByPhase.after.ai362Native4kTiming.performanceMeasurement.graphics', 'native-4K graphics evidence is absent');
    }
    if (
        !isNonNegativeInteger(row?.sampleCount?.cpu)
        || !isNonNegativeInteger(row?.sampleCount?.gpu)
        || !isNonNegativeInteger(row?.sampleCount?.frame)
    ) addGap(gaps, 'diagnosticsByPhase.after.ai362Native4kTiming.sampleCount', 'native-4K sample counts are absent');
    return cloneJson(row);
}

function buildInspection(manifest) {
    const gaps = [];
    const sourceManifest = requireRecord(manifest, 'manifest', gaps);
    if (sourceManifest.schema !== MANIFEST_SCHEMA) addGap(gaps, 'schema', `must be ${MANIFEST_SCHEMA}`);
    if (!isNonEmptyString(sourceManifest.generatedAt)) addGap(gaps, 'generatedAt', 'must be recorded by the capture run');
    const phaseDiagnostics = requireRecord(sourceManifest.diagnosticsByPhase?.after, 'diagnosticsByPhase.after', gaps);
    if (phaseDiagnostics.matrix !== MATRIX) addGap(gaps, 'diagnosticsByPhase.after.matrix', `must be ${MATRIX}`);
    const captureGate = requireRecord(phaseDiagnostics.ai362Gate, 'diagnosticsByPhase.after.ai362Gate', gaps);
    if (captureGate.pass !== true || captureGate.visualFunctionalPass !== true) {
        addGap(gaps, 'diagnosticsByPhase.after.ai362Gate', 'raw visual-functional capture gate did not pass');
    }
    if (captureGate.performanceOwnership !== 'deferred_to_ai537' || captureGate.performanceEvidenceComplete !== true) {
        addGap(gaps, 'diagnosticsByPhase.after.ai362Gate.performanceOwnership', 'performance measurements must be complete and explicitly deferred to AI537');
    }
    if (phaseDiagnostics.gameplayTouched !== false) {
        addGap(gaps, 'diagnosticsByPhase.after.gameplayTouched', 'must explicitly record that gameplay was untouched');
    }

    const captures = inspectCaptureEvidence(sourceManifest, phaseDiagnostics, gaps);
    const regression = inspectRegressionEvidence(phaseDiagnostics, captures.recipeIds, gaps);
    const performance = inspectPerformanceEvidence(phaseDiagnostics, gaps);
    const native4kTiming = inspectNative4kTiming(phaseDiagnostics, gaps);
    if (JSON.stringify(performance.embeddedNative4k) !== JSON.stringify(native4kTiming)) {
        addGap(gaps, 'diagnosticsByPhase.after.ai362Native4kTiming', 'must exactly match the native-4K row retained in costSamples');
    }
    const source = captures.source;
    const diagnostics = {
        autoLod: cloneJson(source.lodDiagnostics ?? {}),
        nearCarpet: cloneJson(source.nearDiagnostics ?? {}),
        field: cloneJson(source.hierarchyDiagnostics ?? {}),
        accent: cloneJson(source.accentDiagnostics ?? {}),
        coverage: cloneJson(source.coverageDiagnostics ?? {}),
        structural: cloneJson(performance.structural)
    };
    const input = {
        generatedAt: sourceManifest.generatedAt,
        approvedBy: 'AI 362 scoped visual-functional validation',
        qualityPreset: source.qualityPreset,
        snapshotContractVersion: source.snapshotContractVersion,
        reviewedCameraIds: captures.reviewedCameraIds,
        reviewedLightingIds: captures.reviewedLightingIds,
        reviewedMotionPathIds: captures.reviewedMotionPathIds,
        reviewedEvidenceIds: captures.reviewedEvidenceIds,
        regressions: regression.regressions,
        diagnostics,
        captureEvidence: {
            ...captures.captureEvidence,
            regressionResults: regression.regressionResults,
            native4kPerformanceMeasurements: [native4kTiming]
        },
        performanceMeasurements: performance.performanceMeasurements,
        environment: {
            ...performance.environment,
            native4k: { graphics: cloneJson(native4kTiming?.performanceMeasurement?.graphics ?? {}) }
        },
        gameplayTouched: phaseDiagnostics.gameplayTouched
    };
    const record = createGrassLabV2ApprovalRecord(input);
    for (const failedCheck of record.visualFunctionalEvaluation?.failedChecks ?? []) {
        addGap(gaps, `approval.${failedCheck}`, 'V2 approval contract rejected the raw manifest evidence');
    }
    if (record.status !== 'approved') addGap(gaps, 'approval.status', 'raw manifest does not support scoped approval');
    return {
        ready: gaps.length === 0,
        gaps,
        input,
        record
    };
}

export class Ai362ManifestApprovalError extends Error {
    constructor(gaps) {
        const details = gaps.map((gap) => `${gap.path}: ${gap.reason}`).join('; ');
        super(`[GrassLabAi362Approval] Manifest is not approval-ready: ${details}`);
        this.name = 'Ai362ManifestApprovalError';
        this.gaps = cloneJson(gaps);
    }
}

/**
 * Inspects a parsed AI 362 capture manifest without reading or writing files.
 * @param {unknown} manifest
 * @returns {{ready: boolean, gaps: Array<{path: string, reason: string}>, input: object, record: object}}
 */
export function inspectAi362ManifestApproval(manifest) {
    return buildInspection(manifest);
}

/**
 * Builds the exact V2 approval input or throws when any raw evidence is absent.
 * @param {unknown} manifest
 * @returns {object}
 */
export function createAi362ApprovalInputFromManifest(manifest) {
    const inspection = buildInspection(manifest);
    if (!inspection.ready) throw new Ai362ManifestApprovalError(inspection.gaps);
    return cloneJson(inspection.input);
}

/**
 * Builds the scoped V2 approval record or throws instead of returning a pending record.
 * @param {unknown} manifest
 * @returns {object}
 */
export function createAi362ApprovalRecordFromManifest(manifest) {
    const inspection = buildInspection(manifest);
    if (!inspection.ready) throw new Ai362ManifestApprovalError(inspection.gaps);
    return cloneJson(inspection.record);
}
