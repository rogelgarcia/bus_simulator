// Offline ratio experiments are explicit diagnostic leaves, excluded from production defaults.
import path from 'node:path';
import {bakeOption} from '../../../baking/Options.mjs';
import {executeExperiment,buildReview} from './Experiment.mjs';
import {TARGET,TOOL} from './Plan.mjs';

export const sunSkyJobs=[{
    id:TARGET,always:true,blender:true,configurationPaths:['executable','pythonExecutable','browserExecutable'],
    codePaths:[TOOL,'tools/bake_lighting/experiments/lighting_configurations/render','tools/bake_lighting/experiments/lighting_configurations/postprocess'],
    description:'AI 563: saved-city Cycles sun/sky ratios, calibrated exposure, ACESFilmic and AgX comparisons',
    options:{'source-run':String,output:String,poses:String,samples:bakeOption.samples,device:bakeOption.device},
    inputs:ctx=>[path.join(ctx.root,TOOL,'defaults.json')],run:executeExperiment
},{
    id:`${TARGET}/review`,always:true,configurationPaths:['pythonExecutable','browserExecutable'],
    codePaths:[TOOL,'tools/bake_lighting/experiments/lighting_configurations/postprocess'],
    description:'Rebuild AI 563 displays, measurements and pose gallery from completed EXRs without Blender',
    options:{output:String},run:buildReview
}];
