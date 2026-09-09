// Verify saved camera and bus poses without rendering or changing the project.
import {runBakeCli} from '../../../../baking/cli.mjs';
await runBakeCli('lighting/experiments/configurations/verify-scene');
