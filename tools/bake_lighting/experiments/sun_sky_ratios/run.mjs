// Execute the source-preserving sun/sky experiment through the shared bake lifecycle.
import {runBakeCli} from '../../../baking/cli.mjs';
import {TARGET} from './Plan.mjs';
await runBakeCli(TARGET);
