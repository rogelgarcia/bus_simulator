// Standalone visibility bake entry; prerequisites use the shared framework.
import { runBakeCli } from '../baking/cli.mjs';
await runBakeCli('visibility');
