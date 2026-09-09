// Capture native tone-mapping and grading combinations with installed baked data.
import {runBakeCli} from '../../../../baking/cli.mjs';
await runBakeCli('lighting/experiments/configurations/capture-display-variants');
