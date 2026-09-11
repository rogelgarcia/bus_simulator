// Explicit material calibration leaves never run as production bake children.
import {TARGET,TOOL} from './Plan.mjs';
import {audit,prepare,capture,render,analyze,execute} from './Stages.mjs';
import {bakeOption} from '../../../baking/Options.mjs';
const common={always:true,codePaths:[TOOL,'tests/headless/harness/material_runtime_probes.js','tests/headless/harness/material_neutral_fixtures.js'],configurationPaths:['executable','pythonExecutable','browserExecutable','renderDevice']};
const mode={mode:bakeOption.choice(['headed','background'])},inputs={'daylight-run':String,'audit-run':String,output:String,...mode};
export const materialCalibrationJobs=[
    {...common,id:TARGET,blender:true,options:inputs,description:'AI566: audit, neutral fixtures, daylight city candidates and correction report',run:execute},
    {...common,id:TARGET+'/audit',options:inputs,description:'Audit effective runtime materials against the authenticated AI565 city source',run:audit},
    {...common,id:TARGET+'/prepare',blender:true,options:{output:String,...mode},description:'Resolve reversible profiles and save matched material scenes',run:prepare},
    {...common,id:TARGET+'/capture',options:{output:String},description:'Capture actual shader inputs, stable bus toggles and native neutral lobes',run:capture},
    {...common,id:TARGET+'/render',blender:true,options:{output:String,...mode},description:'Render neutral materials and both candidate profiles across every daylight pose',run:render},
    {...common,id:TARGET+'/analyze',options:{output:String},description:'Compare material lobes and all five poses; report corrections and limitations',run:analyze}
];
