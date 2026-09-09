// Standalone city export; no baseline capture or comparison render dependency.
import {runBakeCli} from '../../../../baking/cli.mjs';
await runBakeCli('lighting/experiments/configurations/export-city');
