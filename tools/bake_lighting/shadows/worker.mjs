// Runs the existing shadow orchestrator in an owned cancellable child process.
// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import { PRODUCTION_STATIC_SUN_DEFAULTS } from '../../static_sun_depth/production.mjs';
import { orchestrateProductionStaticSunDepth } from '../../static_sun_depth/src/ProductionOrchestrator.mjs';
const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const result = await orchestrateProductionStaticSunDepth({ ...PRODUCTION_STATIC_SUN_DEFAULTS, ...request });
await writeFile(request.resultPath, JSON.stringify(result));
