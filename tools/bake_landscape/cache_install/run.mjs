// Enters landscape cache-bundle verification and installation through the registered bake planner.
import { runBakeCli } from '../../baking/cli.mjs';
await runBakeCli('landscape/cache-install');
