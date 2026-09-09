// Physical calibration is an explicit experiment and cannot publish production assets.
import path from 'node:path';
import {bakeOption} from '../../../baking/Options.mjs';
import {listFiles} from '../../../baking/Files.mjs';
import {TARGET,TOOL} from './Plan.mjs';
import {references,prepare,capture,render,analyze,complete} from './Stages.mjs';

const common={codePaths:[TOOL,'tools/bake_lighting/experiments/lighting_configurations/capture_baselines','tools/bake_lighting/experiments/lighting_configurations/postprocess'],
    inputs:ctx=>['defaults.json','reference_manifest.json','fixtures.schema.json','report.css'].map(f=>path.join(ctx.root,TOOL,f)).concat(['tests/headless/harness/scenarios/scenario_physical_lighting_calibration.js','tests/headless/harness/index.html','src/app/core/GameEngine.js',
        'src/graphics/lighting/FiniteSunShadow.js','src/graphics/shaders/lighting/FiniteSunShadowShader.js',
        'src/graphics/shaders/lighting/finite_sun_shadow.vert.glsl','src/graphics/shaders/lighting/finite_sun_shadow.frag.glsl',
        'src/graphics/shaders/core/MaterialShaderHookRegistry.js','src/graphics/shaders/core/ShaderLoader.js'].map(f=>path.join(ctx.root,f)))};
const mode={mode:bakeOption.choice(['headed','background'])};
export const physicalCalibrationJobs=[
    {...common,id:TARGET+'/references',configurationPaths:['renderDevice'],options:{output:String,samples:bakeOption.samples,device:bakeOption.device},description:'Acquire Cornell source/measurements and freeze analytical inputs',run:references},
    {...common,id:TARGET+'/prepare',blender:true,configurationPaths:['executable'],options:mode,dependencies:[TARGET+'/references'],description:'Generate reusable analytical and Cornell Blender scenes',run:prepare},
    {...common,id:TARGET+'/capture',configurationPaths:['browserExecutable'],dependencies:[TARGET+'/references'],description:'Capture linear native game fixtures and ACES vectors',run:capture},
    {...common,id:TARGET+'/render',blender:true,configurationPaths:['executable'],inputs:async ctx=>[...common.inputs(ctx),...await listFiles(path.join(path.dirname(ctx.config.executable),'5.2/datafiles/colormanagement'))],options:mode,dependencies:[TARGET+'/prepare'],description:'Render independently seeded Cycles fixtures and monochromatic Cornell scenes',run:render},
    {...common,id:TARGET+'/analyze',configurationPaths:['pythonExecutable'],dependencies:[TARGET+'/capture',TARGET+'/render'],description:'Compare equations, raw pixels and display operators; report unavailable coverage',run:analyze},
    {...common,id:TARGET,configurationPaths:[],children:[TARGET+'/analyze'],description:'AI 564: execute physical calibration harness and retain measured evidence',run:complete}
];
