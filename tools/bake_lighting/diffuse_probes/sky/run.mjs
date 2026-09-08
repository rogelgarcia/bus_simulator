// Bakes sun-free sky irradiance at the shared spatial probes.
import { runBakeCli } from '../../../baking/cli.mjs';
await runBakeCli('lighting/diffuse-probes/sky');
