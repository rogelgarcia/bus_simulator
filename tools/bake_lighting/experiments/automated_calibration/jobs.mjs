// @ts-check
// Explicit offline calibration branch, excluded from routine production jobs.
import {TARGET,TOOL} from './Plan.mjs';
import {stage,execute} from './Stages.mjs';
import {reviewRevision} from './ReviewRevision.mjs';
import {bakeOption} from '../../../baking/Options.mjs';
const common={always:true,codePaths:[TOOL,'tools/bake_lighting/experiments/physical_calibration','tools/bake_lighting/experiments/material_calibration','tools/bake_lighting/experiments/lighting_configurations'],configurationPaths:['executable','pythonExecutable','browserExecutable','renderDevice'],options:{output:String,'material-run':String,mode:bakeOption.choice(['headed','background'])}};
export const automatedCalibrationJobs=[{...common,id:TARGET,blender:true,description:'AI567: validate, capture, calibrate, search, verify and review',run:execute},{...common,id:TARGET+'/review-revision',options:{'source-run':String,output:String},description:'New presentation of authenticated completed calibration, preserving its original report',run:reviewRevision},...['validate','baseline','prepare','calibrate','search','render','analyze','review'].map(name=>({...common,id:TARGET+'/'+name,blender:['prepare','render'].includes(name),description:'AI567 '+name,run:ctx=>stage(ctx,name)}))];
