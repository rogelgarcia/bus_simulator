// Use the shared configuration, input checks, staging and publication policy.
import { runBakeCli } from '../../baking/cli.mjs';
await runBakeCli('materials/dry_litter');
