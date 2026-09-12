// Explicit AI547 experiment; outside the default production tree.
import {bakeStreamedPrototype} from './BakePrototype.mjs';
import {reviewStreamedPrototype} from './ReviewPrototype.mjs';
import {benchmarkUnextendedParent} from './BenchmarkParent.mjs';
import {reviewShadowFilter} from './FilterReview.mjs';
import {reviewShadowToggle} from './ToggleReview.mjs';
import {publishCityShadowDetail} from './PublishCity.mjs';
import {reviewFiveShadowPoses, FIVE_POSE_INPUT} from './FivePoseReview.mjs';
const codePaths=['tools/bake_lighting/shadows/streamed','src',
    'tools/bake_lighting/experiments/lighting_configurations/capture_baselines',
    'tools/bake_lighting/experiments/reference_matching/Performance.mjs'];
export const streamedShadowJobs=[{id:'lighting/shadows/streamed/prototype',always:true,
    description:'Bake true 3x native static depth pages around one pose; authenticated parent retained; no publication',
    codePaths,
    configurationPaths:['browserExecutable'],options:{output:String,pose:String},run:bakeStreamedPrototype},
    {id:'lighting/shadows/streamed/city',always:true, description:'Generate complete native 3x detail coverage with bounded guard reconciliation; stage only',
        codePaths,configurationPaths:['browserExecutable'],options:{output:String,pose:String},
        run:ctx=>bakeStreamedPrototype({...ctx,options:{...ctx.options,'full-city':true}})},
    {id:'lighting/shadows/streamed/publish',always:true, description:'Authenticate full-city pages and completed cold/warm review; atomically publish optional detail index',
        codePaths,options:{input:String,review:String},run:publishCityShadowDetail},
    {id:'lighting/shadows/streamed/review',always:true,description:'Compare parent/detail in two fresh browsers; repeat timing and corrupt-page fallback checks',
        codePaths,configurationPaths:['browserExecutable'],options:{input:String,output:String,pose:String,recording:String,'capture-only':Boolean},run:reviewStreamedPrototype},
    {id:'lighting/shadows/streamed/parent-control',always:true,description:'Measure original unextended parent GLSL in isolated browsers with identical maps/settings',
        codePaths,configurationPaths:['browserExecutable'],options:{output:String,pose:String},run:benchmarkUnextendedParent},
    {id:'lighting/shadows/streamed/filter-review',always:true,description:'Compare archived and corrected filtering with installed maps in isolated game sessions',
        codePaths,configurationPaths:['browserExecutable'],options:{output:String,pose:String,before:String,'diagnostics-only':Boolean},run:reviewShadowFilter},
    {id:'lighting/shadows/streamed/toggle-review',always:true,description:'Capture baked on/off/on with unchanged pose and indirect lighting; validate shader ownership',
        codePaths,configurationPaths:['browserExecutable'],options:{output:String,pose:String,benchmark:Boolean,'compare-live':Boolean},run:reviewShadowToggle},
    {id:'lighting/shadows/streamed/five-pose-review',always:true,description:'Capture five authored poses and repeat Single/High, parent and fine shadows with matched GPU percentiles and allocation estimates',
        codePaths:[...codePaths,FIVE_POSE_INPUT,'tools/bake_lighting/experiments/lighting_configurations/Inputs.mjs'],
        configurationPaths:['browserExecutable'],options:{output:String,resume:String},run:reviewFiveShadowPoses}];
