// Writes deterministic machine-readable run artifacts for correction passes.
import fs from 'node:fs/promises';
import path from 'node:path';

import { RUN_REPORT_SCHEMA, RUN_REPORT_VERSION } from './constants.mjs';
import { sortObjectKeysDeep, toPosixPath } from './utils.mjs';

const DEFAULT_REPORT_PATH = 'tools/texture_correction_pipeline/artifacts/last_run.json';

function computeTotals({ discovered, processed, skipped, errors, created, updated, unchanged }) {
    return Object.freeze({
        discovered,
        processed,
        skipped,
        errors,
        created,
        updated,
        unchanged
    });
}

function buildRunReport({
    presetId,
    profileId,
    write,
    analysisMode,
    profileSummary,
    enabledRunPlugins,
    skippedRunPlugins,
    discoveredCount,
    processed,
    skipped,
    errors
}) {
    const created = processed.filter((item) => item.status === 'created' || item.status === 'would_create').length;
    const updated = processed.filter((item) => item.status === 'updated' || item.status === 'would_update').length;
    const unchanged = processed.filter((item) => item.status === 'unchanged').length;
    const guardedCases = [];
    for (const item of processed) {
        const warnings = Array.isArray(item?.warnings) ? item.warnings : [];
        const guardWarnings = warnings.filter((warning) => String(warning).includes('_guard:'));
        if (!guardWarnings.length) continue;
        guardedCases.push({
            materialId: item.materialId,
            classId: item.classId,
            warnings: guardWarnings
        });
    }
    guardedCases.sort((a, b) => String(a.materialId).localeCompare(String(b.materialId)));

    const materialQaSummary = processed.map((item) => ({
        materialId: item.materialId,
        classId: item.classId,
        qaScore: Number.isFinite(Number(item.analysis?.qaSummary?.qaScore))
            ? Number(item.analysis.qaSummary.qaScore)
            : null,
        anomalyScore: Number.isFinite(Number(item.analysis?.qaSummary?.anomalyScore))
            ? Number(item.analysis.qaSummary.anomalyScore)
            : null,
        requiresReview: item.analysis?.qaSummary?.requiresReview === true,
        heuristicWarning: item.analysis?.qaSummary?.heuristicWarning === true
    }));
    materialQaSummary.sort((a, b) => String(a.materialId).localeCompare(String(b.materialId)));

    return Object.freeze({
        schema: RUN_REPORT_SCHEMA,
        version: RUN_REPORT_VERSION,
        presetId,
        profileId,
        mode: write ? 'write' : 'dry_run',
        analysisMode: String(analysisMode ?? 'none'),
        profileSummary: sortObjectKeysDeep(profileSummary ?? {}),
        runPluginAllowList: [...enabledRunPlugins],
        runPluginSkipList: [...skippedRunPlugins],
        totals: computeTotals({
            discovered: discoveredCount,
            processed: processed.length,
            skipped: skipped.length,
            errors: errors.length,
            created,
            updated,
            unchanged
        }),
        guardedCases,
        materialQaSummary,
        processed: [...processed],
        skipped: [...skipped],
        errors: [...errors]
    });
}

export async function writeRunArtifact({
    repoRoot,
    presetId,
    profileId,
    write,
    analysisMode,
    profileSummary,
    enabledRunPlugins,
    skippedRunPlugins,
    discoveredCount,
    processed,
    skipped,
    errors,
    reportPath
}) {
    const outPathRel = toPosixPath(reportPath || DEFAULT_REPORT_PATH);
    const outPathAbs = path.resolve(repoRoot, outPathRel);
    const report = buildRunReport({
        presetId,
        profileId,
        write,
        analysisMode,
        profileSummary,
        enabledRunPlugins,
        skippedRunPlugins,
        discoveredCount,
        processed,
        skipped,
        errors
    });
    await fs.mkdir(path.dirname(outPathAbs), { recursive: true });
    await fs.writeFile(outPathAbs, `${JSON.stringify(sortObjectKeysDeep(report), null, 4)}\n`, 'utf8');
    return Object.freeze({
        reportPath: outPathRel,
        report
    });
}
