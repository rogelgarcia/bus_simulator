// Standalone native shadow parity proof; resolves its authenticated prerequisites.
import { runBakeCli } from '../../../baking/cli.mjs';
await runBakeCli('lighting/shadows/parity');
