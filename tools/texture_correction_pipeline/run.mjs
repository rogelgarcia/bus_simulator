// Batch CLI entrypoint for deterministic texture correction generation.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createUsageText, parseCliArgs } from './src/cli.mjs';
import { runTextureCorrectionPipeline } from './src/pipeline_runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function printSummary(result) {
    const report = result.report;
    const totals = report?.totals ?? {};
    console.log(`[TextureCorrectionPipeline] preset=${report.presetId} profile=${report.profileId} mode=${report.mode} analysis=${report.analysisMode ?? 'none'}`);
    console.log(`[TextureCorrectionPipeline] discovered=${totals.discovered} processed=${totals.processed} created=${totals.created} updated=${totals.updated} unchanged=${totals.unchanged} skipped=${totals.skipped} errors=${totals.errors}`);
    console.log(`[TextureCorrectionPipeline] artifact=${result.reportPath}`);
}

async function main() {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) {
        console.log(createUsageText());
        return;
    }

    const result = await runTextureCorrectionPipeline({
        repoRoot: REPO_ROOT,
        presetId: cli.presetId,
        profilePath: cli.profilePath,
        includeMaterialIds: cli.includeMaterialIds,
        includeClassIds: cli.includeClassIds,
        runEnabledPlugins: cli.runEnabledPlugins,
        runSkippedPlugins: cli.runSkippedPlugins,
        analysisMode: cli.analysisMode,
        captureOutputRoot: cli.captureOutputRoot,
        write: cli.write,
        reportPath: cli.reportPath
    });
    printSummary(result);

    const hasErrors = Number(result?.report?.totals?.errors) > 0;
    if (cli.failOnError && hasErrors) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(`[TextureCorrectionPipeline] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exitCode = 1;
});
