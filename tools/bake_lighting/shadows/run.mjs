// Standalone lighting/shadows bake entry; prerequisites use the shared framework.
import { runBakeCli } from '../../baking/cli.mjs';
await runBakeCli('lighting/shadows');
