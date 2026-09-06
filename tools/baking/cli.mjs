// Shared CLI bootstrap for every master, domain and leaf bake entry point.
// @ts-check
import path from 'node:path';
import { loadBakeConfiguration, REPO_ROOT } from './Configuration.mjs';
import { parseBakeOptions, resolveBakeOptions } from './Options.mjs';
import { planBakes } from './Graph.mjs';
import { createBakeLog } from './Log.mjs';
import { executeBakes } from './Runner.mjs';
import { verifyBakeToolchain } from './Blender.mjs';
import { writeJson } from './Files.mjs';
import { bakeJobs } from './registry.mjs';

export const BAKE_HELP = `Hierarchical bake framework
  node tools/bake.mjs
  node tools/bake.mjs --dry-run
  node tools/bake_lighting/illumination/indirect/run.mjs --samples 64 --device OPTIX

First run creates tools/baking/blender.local.json and stops for configuration.
Default: bake + validate all configured outputs. --publish installs only outputs
whose existing release policy permits it; shadow candidates and grass V2 retain
their existing separate review/certification gate.

Options (also accepted by every domain/leaf entry):
  --target <job/id>             Select one subtree and its prerequisites
  --samples <1..4096>           Inherit Cycles samples; does not alter sun-depth resolution
  --device <CPU|OPTIX>          Enhanced illumination backend only
  --profile <all|sun-profile>   Select certified sun-depth profiles
  --set <job/id:option=value>   Scoped override; narrower scope wins
  --timeout-seconds <seconds>   Hard timeout for the entire requested run, including children
  --rebuild                    Ignore framework checkpoints
  --publish                    Install validated outputs where release policy permits
  --dry-run                    Show dependencies, settings and outputs; do not run Blender
  --help                       Show this help

Settings: tracked job defaults < common options < scoped options (outer to inner).
Cycles settings belong to illumination/prepare because the atlas and passes must
share one authenticated job identity. Scope enhanced settings to lighting/illumination
and original-preview settings to lighting/illumination/preview.
Durations depend on scene, resolution and hardware; samples are not a timer.
Ctrl+C cancels the owned process tree. Validated checkpoints survive cancellation.
NO_COLOR and redirected output use plain logs. Progress counts validated jobs;
unknown active-job progress is explicitly indeterminate.
`;

/** @param {string} [target] @param {string[]} [argv] */
export async function runBakeCli(target = 'all', argv = process.argv.slice(2)) {
    const log = createBakeLog();
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('Bake cancelled'));
    let timer;
    try {
        const options = parseBakeOptions(argv);
        if (options.flags.help) { process.stdout.write(BAKE_HELP); return; }
        const plan = planBakes(bakeJobs, options.values.target ?? target);
        const settings = resolveBakeOptions(plan, options);
        const config = await loadBakeConfiguration();
        log.line('all', `Blender configuration: ${config.path}`);
        for (const job of plan) log.line(job.id, `${job.description ?? ''}; settings ${JSON.stringify(settings.get(job.id))}; dependencies ${[...job.dependencies ?? [], ...job.children ?? []].join(', ') || 'none'}; outputs ${(job.outputs ?? []).join(', ') || 'child results'}`);
        const planPath = path.join(REPO_ROOT, 'tests/artifacts/screens/ai556_bake_framework/last-plan.json');
        await writeJson(planPath, { target: options.values.target ?? target, publish: !!options.flags.publish,
            configPath: config.path, jobs: plan.map(job => ({ id: job.id, settings: settings.get(job.id), children: job.children,
                dependencies: job.dependencies, outputs: job.outputs, description: job.description })) });
        if (options.flags['dry-run']) { log.line('all', `Dry run only. Plan: ${planPath}`); return; }
        process.once('SIGINT', abort); process.once('SIGTERM', abort);
        if (options.values['timeout-seconds']) timer = setTimeout(() => controller.abort(new Error('Whole-run hard timeout exceeded')), Number(options.values['timeout-seconds']) * 1000);
        const toolchain = plan.some(job => job.blender) ? await verifyBakeToolchain(config, REPO_ROOT, plan.some(job => job.archive)) : null;
        await executeBakes(plan, settings, { root: REPO_ROOT, config, toolchain, log, signal: controller.signal,
            rebuild: !!options.flags.rebuild, publish: !!options.flags.publish,
            env: config.browserExecutable ? { PLAYWRIGHT_EXECUTABLE_PATH: config.browserExecutable } : {} });
    } catch (error) {
        log.line('all', error.message, 'failed');
        process.exitCode = controller.signal.aborted ? 130 : error.exitCode ?? 1;
    } finally {
        clearTimeout(timer); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    }
}
