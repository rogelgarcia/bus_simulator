// @ts-check
// Frozen search boundaries and promotion gates for the calibration handoff.
import path from 'node:path';
export const TOOL='tools/bake_lighting/experiments/automated_calibration';
export const TARGET='lighting/experiments/automated-calibration';
export const ARTIFACTS='tests/artifacts/screens/ai567_automated_calibration';
export function outputPath(root,value){
    const base=path.resolve(root,ARTIFACTS),out=path.resolve(root,value),relative=path.relative(base,out);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Use a named run below '+ARTIFACTS);
    return out;
}
export function validateRecipe(recipe){
    if(recipe.schemaVersion!==1||recipe.publication!=='experiment-only'||recipe.grade!=='off')throw new Error('Invalid calibration contract');
    if(recipe.concurrency!==1||recipe.threads<1||recipe.threads>4||!Number.isInteger(recipe.threads)||!Number.isInteger(recipe.samples)||recipe.samples<64||recipe.samples>256)throw new Error('Unbounded workload');
    if(JSON.stringify(recipe.training)!==JSON.stringify(['pose_01','pose_04','pose_05'])||JSON.stringify(recipe.heldOut)!==JSON.stringify(['pose_02','pose_03']))throw new Error('Frozen train/validation split changed');
    if(recipe.exposureOffsets.length!==3||recipe.exposureOffsets.some((v,i)=>!Number.isFinite(v)||v!==[-.5,0,.5][i]))throw new Error('Exposure must use the declared global half-stop grid');
    if(JSON.stringify(recipe.materials)!=='["conversion","plausible"]'||JSON.stringify(recipe.daylights)!=='["D01","D02","D03"]')throw new Error('Unknown authenticated candidate');
}
export function assertPromotion(evidence){
    if(!evidence.referenceValid||!evidence.identitiesMatch||!evidence.fullRenderVerified||!evidence.heldOutPassed)throw new Error('Candidate promotion blocked by reference, identity, full render or held-out validation');
}
