// Collects every synthesis operator implementation keyed by its catalog `op` and checks the set matches the catalog.
// @ts-check
import { LANDSCAPE_SYNTHESIS_OPERATORS } from '../../../../src/app/landscape/LandscapeSynthesisRecipe.js';
import { INPUT_OPERATORS } from './Inputs.mjs';
import { LANDFORM_OPERATORS } from './Landforms.mjs';
import { WARP_OPERATORS } from './Warps.mjs';
import { CONSTRAINT_OPERATORS } from './Constraints.mjs';

// resample is executed by the graph after the operator loop with the filter this entry resolves (a no-op on the output grid)
async function resample(context) { return { filter: context.operator.params.filter, resampled: context.working.coarse }; }

/** @type {Readonly<Record<string, (context:any)=>Promise<any>>>} */
export const SYNTHESIS_OPERATORS = Object.freeze({ ...INPUT_OPERATORS, ...LANDFORM_OPERATORS, ...WARP_OPERATORS, ...CONSTRAINT_OPERATORS, resample });

for (const op of Object.keys(LANDSCAPE_SYNTHESIS_OPERATORS)) if (!SYNTHESIS_OPERATORS[op]) throw new Error(`[Synthesis] operator ${op} is declared in the catalog but not implemented`);
for (const op of Object.keys(SYNTHESIS_OPERATORS)) if (!LANDSCAPE_SYNTHESIS_OPERATORS[op]) throw new Error(`[Synthesis] operator ${op} is implemented but not declared in the catalog`);
