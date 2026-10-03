// Compile the LOD4 source layout through the shared bake lifecycle.
import { runBakeCli } from '../../../baking/cli.mjs';
await runBakeCli('materials/grass/lod4-layout');
