// Enter the shared bake lifecycle for final compressed LOD4 canopy maps.
import { runBakeCli } from '../../../baking/cli.mjs';
await runBakeCli('materials/grass/lod4-maps');
