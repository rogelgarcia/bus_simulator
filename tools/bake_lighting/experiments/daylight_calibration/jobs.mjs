// Explicit laboratory workflow; deliberately excluded from production lighting children.
import {bakeOption} from '../../../baking/Options.mjs';
import {TARGET,TOOL} from './Plan.mjs';
import {prepare,render,capture,fixtures,analyze,execute} from './Stages.mjs';
import {afternoon} from './Afternoon.mjs';
const common={always:true,codePaths:[TOOL,'tools/bake_lighting/experiments/lighting_configurations/postprocess'],configurationPaths:['executable','pythonExecutable','browserExecutable','renderDevice']};
const mode={mode:bakeOption.choice(['headed','background'])};
const inputs={'source-run':String,'source-scene':String,'calibration-run':String,'legacy-run':String,output:String,samples:bakeOption.samples,device:bakeOption.device,...mode};
export const daylightJobs=[
    {...common,id:TARGET+'/afternoon',blender:true,options:{'source-run':String,output:String,...mode},description:'Compare 55/65 degree physical daylight against an authenticated 35 degree AI567 finalist',run:afternoon},
    {...common,id:TARGET,blender:true,options:inputs,description:'AI 565: coherent physical daylight, native fixtures and all five city poses',run:execute},
    {...common,id:TARGET+'/prepare',blender:true,options:inputs,description:'Authenticate city and AI 564; measure atmosphere and save reusable scenes',run:prepare},
    {...common,id:TARGET+'/render',blender:true,options:{output:String,...mode},description:'Render authenticated raw daylight fixtures and original/neutral city poses',run:render},
    {...common,id:TARGET+'/capture',options:{output:String},description:'Measure the actual game renderer with the derived sun and sky',run:capture},
    {...common,id:TARGET+'/fixtures',blender:true,options:{output:String,...mode},description:'Create a new raw fixture revision without regenerating unchanged city transport',run:fixtures},
    {...common,id:TARGET+'/analyze',options:{output:String,'legacy-run':String},description:'Validate transport and create pose-grouped ACESFilmic/AgX comparisons',run:analyze}
];
