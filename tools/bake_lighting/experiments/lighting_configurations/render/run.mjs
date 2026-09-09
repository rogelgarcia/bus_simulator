// Standalone rendering from an authenticated saved scene; no game launch.
import {runBakeCli} from '../../../../baking/cli.mjs';
await runBakeCli('lighting/experiments/configurations/render');
