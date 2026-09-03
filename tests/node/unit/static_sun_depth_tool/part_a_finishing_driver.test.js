// Verifies AI 531 Part A readiness, failure inventory, and isolation contracts.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildDeterminismIsolationReport,
    buildPartAFailureInventory,
    evaluatePartAReadiness
} from '../../../../tools/static_sun_depth/src/PartAFinishingDriver.mjs';
import {
    assertCleanProductionNativeFieldReceipt,
    assertCleanProductionRenderReceipt
} from '../../../../tools/static_sun_depth/src/ProductionProvenance.mjs';

const HASH = 'a'.repeat(64);

test('production provenance accepts clean source fields and rejects calibration lineage', () => {
    const direct = {
        method: 'three-r183-production-lattice-mixed-foliage-depth24-native-readback-v2',
        productionEligible: true,
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v2',
        source: {bsib: {sha256: HASH}},
        status: 'complete'
    };
    assert.equal(assertCleanProductionNativeFieldReceipt(direct).status, 'passed');
    assert.equal(assertCleanProductionRenderReceipt({
        alphaCertification: {
            nativeCutoutField: {
                method: direct.method,
                receiptSha256: HASH,
                schema: direct.schema,
                status: 'authenticated_complete_native_field'
            }
        }
    }).status, 'passed');
    assert.throws(() => assertCleanProductionNativeFieldReceipt({
        ...direct,
        method: 'authenticated-static-shadow-residual-live-depth-corrections-v11',
        schema: 'ai531-production-alpha-cutout-native-field-receipt-v11',
        source: {residualCalibration: {correctedTexels: []}}
    }), /rejects calibrated, residual, diagnostic/u);
    assert.throws(() => assertCleanProductionNativeFieldReceipt({
        ...direct,
        source: {calibration: {diagnosticReport: 'validation.json'}}
    }), /validation-derived production lineage/u);
});

test('Part A inventory retains visual failures without creating action items', () => {
    const report = makeReport(69);
    const inventory = buildPartAFailureInventory(report, {
        reportPath: 'tests/artifacts/screens/illumination_531/report.json',
        reportSha256: HASH
    });
    assert.equal(inventory.cases.length, 69);
    assert.deepEqual(inventory.actionItems, []);
    assert.deepEqual(inventory.cases[0].actionItems, []);
    assert.equal(inventory.nonvisualFailures.length, 0);
    assert.deepEqual(evaluatePartAReadiness(report, inventory), {
        complete: true,
        deferredVisualCaseCount: 69,
        maximumDeferredVisualCaseCount: 69,
        minimumPassingCaseCount: 128,
        nonvisualFailureCount: 0,
        policy: 'accepted-2026-09-03-complete-report-zero-nonvisual-v2',
        passed: true,
        passedCaseCount: 128,
        strictStatus: 'failed'
    });
});

test('Part A readiness rejects visual regression beyond the accepted baseline or any nonvisual gate', () => {
    const regressedReport = makeReport(70);
    const regressedInventory = buildPartAFailureInventory(regressedReport, {
        reportPath: 'tests/artifacts/screens/illumination_531/report.json',
        reportSha256: HASH
    });
    assert.equal(
        evaluatePartAReadiness(regressedReport, regressedInventory).passed,
        false
    );
    const nonvisualReport = makeReport(1);
    nonvisualReport.failures[0].failures = ['browser_diagnostics'];
    const nonvisualInventory = buildPartAFailureInventory(nonvisualReport, {
        reportPath: 'tests/artifacts/screens/illumination_531/report.json',
        reportSha256: HASH
    });
    assert.equal(nonvisualInventory.cases.length, 0);
    assert.equal(nonvisualInventory.nonvisualFailures.length, 1);
    assert.equal(evaluatePartAReadiness(nonvisualReport, nonvisualInventory).passed, false);
});

test('determinism isolation requires byte-identical authority and authenticated reuse', () => {
    const authority = {
        packageIndex: {sha256: HASH},
        publications: [{sha256: 'b'.repeat(64)}]
    };
    const passed = buildDeterminismIsolationReport({
        absent: authority,
        changed: structuredClone(authority),
        changedProfiles: [{resumed: true}],
        configurationSha256: 'c'.repeat(64),
        present: structuredClone(authority),
        presentProfiles: [{resumed: true}]
    });
    assert.equal(passed.productionRunsByteIdentical, true);
    assert.throws(() => buildDeterminismIsolationReport({
        absent: authority,
        changed: {packageIndex: {sha256: 'd'.repeat(64)}, publications: []},
        changedProfiles: [{resumed: true}],
        configurationSha256: 'c'.repeat(64),
        present: structuredClone(authority),
        presentProfiles: [{resumed: true}]
    }), /Production authority changed/u);
});

function makeReport(failureCount) {
    const cases = Array.from({length: 197}, (_, index) => ({
        captures: {
            cache: capture(`case-${index}/cache.png`),
            comparison: capture(`case-${index}/comparison.png`),
            current: capture(`case-${index}/current.png`)
        },
        caseId: `case-${String(index).padStart(3, '0')}`,
        lightingProfileId: 'ai527.sun.az045.el08',
        metrics: {maximumRgbError: index},
        passed: index >= failureCount
    }));
    return {
        caseCount: 197,
        cases,
        expectedCaseCount: 197,
        failures: cases.slice(0, failureCount).map((entry) => ({
            caseId: entry.caseId,
            failures: ['maximum_rgb_error']
        })),
        status: failureCount === 0 ? 'passed' : 'failed'
    };
}

function capture(relativePath) {
    return {
        byteLength: 100,
        path: `tests/artifacts/screens/illumination_531/${relativePath}`,
        sha256: HASH
    };
}
