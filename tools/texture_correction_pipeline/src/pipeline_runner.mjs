// Orchestrates deterministic plugin execution and per-texture config generation.
import { loadPbrMaterialCatalog } from './material_catalog_loader.mjs';
import { loadTextureCorrectionProfile, resolvePresetProfile } from './profile_loader.mjs';
import { TEXTURE_CORRECTION_PLUGINS, getTextureCorrectionPluginIds } from './plugins/index.mjs';
import { deepMerge, isPlainObject, normalizeStringList } from './utils.mjs';
import { writeCorrectionConfig } from './config_writer.mjs';
import { writeRunArtifact } from './report_writer.mjs';
import { createHeadlessRuntime } from './headless/headless_runtime.mjs';
import { runMaterialAnalysis } from './analysis/analysis_runner.mjs';

function toSet(list) {
    return new Set(normalizeStringList(list));
}

function resolveEnabledPluginIds({
    availablePluginIds,
    presetProfile,
    classProfile,
    runPluginAllowSet,
    runPluginSkipSet
}) {
    const presetEnabled = normalizeStringList(presetProfile?.enabledPlugins);
    const classEnabled = normalizeStringList(classProfile?.enabledPlugins);
    const classDisabledSet = toSet(classProfile?.disabledPlugins);

    const baseEnabledSet = new Set(classEnabled.length ? classEnabled : (presetEnabled.length ? presetEnabled : availablePluginIds));
    const output = [];
    for (const id of availablePluginIds) {
        if (!baseEnabledSet.has(id)) continue;
        if (classDisabledSet.has(id)) continue;
        if (runPluginAllowSet.size && !runPluginAllowSet.has(id)) continue;
        if (runPluginSkipSet.has(id)) continue;
        output.push(id);
    }
    return output;
}

function normalizeWarningList(value) {
    const src = Array.isArray(value) ? value : [];
    const out = [];
    for (const item of src) {
        const warning = String(item ?? '').trim();
        if (!warning || out.includes(warning)) continue;
        out.push(warning);
    }
    return out;
}

function resolvePluginOptions({ presetProfile, classProfile, pluginId }) {
    const presetOptions = isPlainObject(presetProfile?.pluginOptions?.[pluginId]) ? presetProfile.pluginOptions[pluginId] : {};
    const classOptions = isPlainObject(classProfile?.pluginOptions?.[pluginId]) ? classProfile.pluginOptions[pluginId] : {};
    return deepMerge(presetOptions, classOptions);
}

function resolveBasePluginOptionsById({
    presetProfile,
    classProfile,
    enabledPluginIds
}) {
    const optionsById = {};
    for (const pluginId of enabledPluginIds) {
        optionsById[pluginId] = resolvePluginOptions({ presetProfile, classProfile, pluginId });
    }
    return optionsById;
}

function mergeRecommendedPluginOptions(basePluginOptionsById, recommendedPluginOptions) {
    const base = isPlainObject(basePluginOptionsById) ? basePluginOptionsById : {};
    const recommended = isPlainObject(recommendedPluginOptions) ? recommendedPluginOptions : {};
    const merged = {};
    for (const key of Object.keys(base)) merged[key] = base[key];
    for (const key of Object.keys(recommended)) {
        const lhs = isPlainObject(merged[key]) ? merged[key] : {};
        const rhs = isPlainObject(recommended[key]) ? recommended[key] : {};
        merged[key] = deepMerge(lhs, rhs);
    }
    return merged;
}

function createPresetProfileSummary({ presetId, profileId, presetProfile }) {
    const preset = isPlainObject(presetProfile) ? presetProfile : {};
    const classProfiles = isPlainObject(preset.classProfiles) ? preset.classProfiles : {};
    const categoryDefaults = {};

    const classIds = Object.keys(classProfiles).sort((a, b) => a.localeCompare(b));
    for (const classId of classIds) {
        const classProfile = isPlainObject(classProfiles[classId]) ? classProfiles[classId] : {};
        categoryDefaults[classId] = Object.freeze({
            enabledPlugins: normalizeStringList(classProfile.enabledPlugins),
            disabledPlugins: normalizeStringList(classProfile.disabledPlugins),
            pluginOptions: isPlainObject(classProfile.pluginOptions) ? classProfile.pluginOptions : {},
            targets: isPlainObject(classProfile.targets) ? classProfile.targets : {},
            notes: typeof classProfile.notes === 'string' ? classProfile.notes : ''
        });
    }

    return Object.freeze({
        profileId,
        presetId,
        activePlugins: normalizeStringList(preset.enabledPlugins),
        pluginDefaults: isPlainObject(preset.pluginOptions) ? preset.pluginOptions : {},
        categoryDefaults
    });
}

async function executePlugins({
    presetId,
    profileId,
    material,
    enabledPluginIds,
    pluginOptionsById,
    analysis
}) {
    const pluginOutputs = {};
    let adjustments = {};
    const pluginWarnings = [];
    const appliedPluginIds = [];

    for (const plugin of TEXTURE_CORRECTION_PLUGINS) {
        if (!enabledPluginIds.includes(plugin.id)) continue;
        const pluginOptions = isPlainObject(pluginOptionsById?.[plugin.id]) ? pluginOptionsById[plugin.id] : {};

        let result = null;
        try {
            result = await plugin.run(Object.freeze({
                presetId,
                profileId,
                material,
                classId: material.classId,
                pluginOptions,
                analysis: analysis ?? null
            }));
        } catch (err) {
            return Object.freeze({
                type: 'error',
                item: Object.freeze({
                    materialId: material.materialId,
                    classId: material.classId,
                    pluginId: plugin.id,
                    message: err instanceof Error ? err.message : String(err)
                })
            });
        }

        const applied = !!result?.applied;
        for (const warning of normalizeWarningList(result?.warnings)) {
            pluginWarnings.push(warning);
        }
        if (!applied) {
            const reason = String(result?.skippedReason ?? '').trim();
            if (reason) pluginWarnings.push(`${plugin.id}:${reason}`);
            continue;
        }

        appliedPluginIds.push(plugin.id);
        pluginOutputs[plugin.id] = isPlainObject(result?.pluginData) ? result.pluginData : {};
        adjustments = deepMerge(adjustments, isPlainObject(result?.adjustments) ? result.adjustments : {});
    }

    return Object.freeze({
        type: 'ok',
        pluginOutputs,
        adjustments,
        pluginWarnings,
        appliedPluginIds
    });
}

function createProcessedEntry({
    material,
    enabledPluginIds,
    appliedPluginIds,
    pluginWarnings,
    recommendedPluginOptions,
    resolvedPluginOptions,
    emittedAdjustments,
    emittedPluginOutputs,
    analysis,
    outputFile,
    status
}) {
    return Object.freeze({
        materialId: material.materialId,
        classId: material.classId,
        outputFile,
        status,
        enabledPlugins: [...enabledPluginIds],
        appliedPlugins: [...appliedPluginIds],
        warnings: [...pluginWarnings],
        recommendedPluginOptions: recommendedPluginOptions ?? {},
        resolvedPluginOptions: resolvedPluginOptions ?? {},
        emittedAdjustments: emittedAdjustments ?? {},
        emittedPluginOutputs: emittedPluginOutputs ?? {},
        analysis: analysis ?? {}
    });
}

async function processMaterial({
    repoRoot,
    profileId,
    presetId,
    presetProfile,
    material,
    runPluginAllowSet,
    runPluginSkipSet,
    analysisMode,
    captureOutputRoot,
    runtime,
    write
}) {
    const classProfiles = presetProfile?.classProfiles && typeof presetProfile.classProfiles === 'object'
        ? presetProfile.classProfiles
        : {};
    const classProfile = classProfiles[material.classId] ?? {};
    const availablePluginIds = getTextureCorrectionPluginIds();
    const enabledPluginIds = resolveEnabledPluginIds({
        availablePluginIds,
        presetProfile,
        classProfile,
        runPluginAllowSet,
        runPluginSkipSet
    });

    if (!enabledPluginIds.length) {
        return Object.freeze({
            type: 'skipped',
            item: Object.freeze({
                materialId: material.materialId,
                classId: material.classId,
                reason: 'no_enabled_plugins'
            })
        });
    }

    const basePluginOptionsById = resolveBasePluginOptionsById({
        presetProfile,
        classProfile,
        enabledPluginIds
    });

    const preliminaryRun = await executePlugins({
        presetId,
        profileId,
        material,
        enabledPluginIds,
        pluginOptionsById: basePluginOptionsById,
        analysis: null
    });
    if (preliminaryRun.type === 'error') return preliminaryRun;

    const pluginWarnings = [...(preliminaryRun.pluginWarnings ?? [])];
    let analysisPayload = Object.freeze({
        mode: 'none',
        fileSanity: {},
        mapMetrics: {},
        renderSummary: {},
        qaSummary: {},
        discrepancyFlags: [],
        captures: [],
        recommendedPluginOptions: {},
        recommendationNotes: []
    });

    const wantsAnalysis = analysisMode === 'map' || analysisMode === 'full';
    if (wantsAnalysis && runtime?.probePage) {
        try {
            analysisPayload = await runMaterialAnalysis({
                repoRoot,
                runtime,
                material,
                presetId,
                analysisMode,
                basePluginOptions: basePluginOptionsById,
                initialAdjustments: preliminaryRun.adjustments,
                captureOutputRoot
            });
        } catch (err) {
            pluginWarnings.push(`analysis_error:${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const mergedPluginOptionsById = mergeRecommendedPluginOptions(
        basePluginOptionsById,
        analysisPayload.recommendedPluginOptions
    );

    const finalRun = await executePlugins({
        presetId,
        profileId,
        material,
        enabledPluginIds,
        pluginOptionsById: mergedPluginOptionsById,
        analysis: analysisPayload
    });
    if (finalRun.type === 'error') return finalRun;

    for (const warning of finalRun.pluginWarnings ?? []) pluginWarnings.push(warning);
    const dedupWarnings = Array.from(new Set(pluginWarnings));

    const analysisForConfig = {
        mode: analysisPayload.mode ?? 'none',
        qaSummary: analysisPayload.qaSummary ?? {},
        discrepancyFlags: Array.isArray(analysisPayload.discrepancyFlags) ? analysisPayload.discrepancyFlags : [],
        map: {
            fileSanity: analysisPayload.fileSanity ?? {},
            metrics: analysisPayload.mapMetrics ?? {}
        },
        render: analysisPayload.renderSummary ?? {},
        recommendations: {
            pluginOptions: analysisPayload.recommendedPluginOptions ?? {},
            notes: Array.isArray(analysisPayload.recommendationNotes) ? analysisPayload.recommendationNotes : []
        },
        captures: Array.isArray(analysisPayload.captures)
            ? analysisPayload.captures.map((entry) => ({
                captureId: entry.captureId,
                mode: entry.mode,
                recipeId: entry.recipeId,
                presetId: entry.presetId,
                layoutMode: entry.layoutMode,
                viewId: entry.viewId,
                file: entry.file,
                meanLuminance: entry.meanLuminance,
                rmsContrast: entry.rmsContrast,
                localContrast: entry.localContrast,
                gradientEnergy: entry.gradientEnergy,
                laplacianVariance: entry.laplacianVariance,
                clippingBlackPct: entry.clippingBlackPct,
                clippingWhitePct: entry.clippingWhitePct
            }))
            : []
    };

    const writeResult = await writeCorrectionConfig({
        repoRoot,
        material,
        presetId,
        profileId,
        enabledPlugins: enabledPluginIds,
        pluginOutputs: finalRun.pluginOutputs,
        adjustments: finalRun.adjustments,
        warnings: dedupWarnings,
        analysis: analysisForConfig,
        write
    });

    return Object.freeze({
        type: 'processed',
        item: createProcessedEntry({
            material,
            enabledPluginIds,
            appliedPluginIds: finalRun.appliedPluginIds,
            pluginWarnings: dedupWarnings,
            recommendedPluginOptions: analysisPayload.recommendedPluginOptions ?? {},
            resolvedPluginOptions: mergedPluginOptionsById,
            emittedAdjustments: finalRun.adjustments ?? {},
            emittedPluginOutputs: finalRun.pluginOutputs ?? {},
            analysis: {
                qaSummary: analysisPayload.qaSummary ?? {},
                discrepancyFlags: analysisPayload.discrepancyFlags ?? [],
                recommendationNotes: analysisPayload.recommendationNotes ?? [],
                mapMetrics: analysisPayload.mapMetrics ?? {},
                renderSummary: analysisPayload.renderSummary ?? {},
                captures: Array.isArray(analysisPayload.captures)
                    ? analysisPayload.captures.map((entry) => ({
                        captureId: entry.captureId,
                        mode: entry.mode,
                        recipeId: entry.recipeId,
                        presetId: entry.presetId,
                        layoutMode: entry.layoutMode,
                        viewId: entry.viewId,
                        file: entry.file,
                        anomalyScore: entry.anomalyScore ?? null
                    }))
                    : []
            },
            outputFile: writeResult.outputFile,
            status: writeResult.status
        })
    });
}

export async function runTextureCorrectionPipeline({
    repoRoot,
    presetId,
    profilePath,
    includeMaterialIds,
    includeClassIds,
    runEnabledPlugins,
    runSkippedPlugins,
    analysisMode = 'none',
    captureOutputRoot = 'tools/texture_correction_pipeline/artifacts/captures',
    write = true,
    reportPath
}) {
    const runPluginAllowSet = toSet(runEnabledPlugins);
    const runPluginSkipSet = toSet(runSkippedPlugins);

    const profile = await loadTextureCorrectionProfile({ repoRoot, profilePath });
    const presetResolution = resolvePresetProfile({ profile, presetId });
    const resolvedPresetId = presetResolution.presetId;
    const presetProfile = presetResolution.preset;
    const profileSummary = createPresetProfileSummary({
        presetId: resolvedPresetId,
        profileId: profile.profileId,
        presetProfile
    });

    const catalog = await loadPbrMaterialCatalog({
        repoRoot,
        includeMaterialIds,
        includeClassIds
    });

    const processed = [];
    const skipped = [...catalog.skipped];
    const errors = [...catalog.errors];

    const requestedAnalysisMode = String(analysisMode ?? 'none').trim();
    let effectiveAnalysisMode = requestedAnalysisMode === 'full' || requestedAnalysisMode === 'map'
        ? requestedAnalysisMode
        : 'none';

    let runtime = null;
    if (effectiveAnalysisMode !== 'none') {
        try {
            runtime = await createHeadlessRuntime({
                repoRoot,
                needHarness: effectiveAnalysisMode === 'full'
            });
        } catch (err) {
            errors.push(Object.freeze({
                materialId: '*',
                classId: '*',
                pluginId: 'analysis_runtime',
                message: err instanceof Error ? err.message : String(err)
            }));
            effectiveAnalysisMode = 'none';
        }
    }

    try {
        for (const material of catalog.materials) {
            const result = await processMaterial({
                repoRoot,
                profileId: profile.profileId,
                presetId: resolvedPresetId,
                presetProfile,
                material,
                runPluginAllowSet,
                runPluginSkipSet,
                analysisMode: effectiveAnalysisMode,
                captureOutputRoot,
                runtime,
                write
            });

            if (result.type === 'processed') {
                processed.push(result.item);
                continue;
            }
            if (result.type === 'skipped') {
                skipped.push(result.item);
                continue;
            }
            errors.push(result.item);
        }
    } finally {
        await runtime?.close?.();
    }

    processed.sort((a, b) => a.materialId.localeCompare(b.materialId));
    skipped.sort((a, b) => a.materialId.localeCompare(b.materialId));
    errors.sort((a, b) => {
        const left = `${a.materialId ?? ''}|${a.pluginId ?? ''}`;
        const right = `${b.materialId ?? ''}|${b.pluginId ?? ''}`;
        return left.localeCompare(right);
    });

    const artifact = await writeRunArtifact({
        repoRoot,
        presetId: resolvedPresetId,
        profileId: profile.profileId,
        write,
        analysisMode: effectiveAnalysisMode,
        profileSummary,
        enabledRunPlugins: [...runPluginAllowSet],
        skippedRunPlugins: [...runPluginSkipSet],
        discoveredCount: catalog.materials.length,
        processed,
        skipped,
        errors,
        reportPath
    });

    return Object.freeze({
        reportPath: artifact.reportPath,
        report: artifact.report
    });
}
