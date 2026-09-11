// Preserve failed shadow parity evidence without publishing or loosening production checks.
import path from 'node:path';
import {listFiles} from '../../../baking/Files.mjs';

export async function shadowDiagnostic(ctx) {
    if(ctx.publish)throw new Error('Shadow diagnostics cannot publish');
    const output=path.join(ctx.root,'tests/artifacts/illumination_531/ai556','diagnostic-'+Date.now());
    const args=['--profile-id','ai527.sun.az045.el55','--diagnostic','--output-root',output,
        '--blender',ctx.config.executable,'--archive',ctx.config.archive];
    for(const name of ['input','production-root','native-cutout-root']){
        if(!ctx.options[name])throw new Error('Missing '+name);
        args.push('--'+name,path.resolve(ctx.root,ctx.options[name]));
    }
    await ctx.node('tools/static_sun_depth/build_alpha_cutout_native_field_parity.mjs',args);
    return {state:'validated',output,files:await listFiles(output),policy:'Diagnostic evidence only; productionEligible=false'};
}

export async function cutoutDiagnostic(ctx) {
    if(ctx.publish || !ctx.options.input || !ctx.options['candidate-root'])throw new Error('Source and candidate required; no publication');
    const output=path.join(ctx.root,'tests/artifacts/illumination_531/ai556','field-diagnostic-'+Date.now());
    await ctx.node('tools/static_sun_depth/capture_alpha_cutout_native_field.mjs',[
        '--input',path.resolve(ctx.root,ctx.options.input),'--candidate-root',path.resolve(ctx.root,ctx.options['candidate-root']),
        '--output-root',output,'--profile-id','ai527.sun.az045.el55','--tiles','36',
        '--blender',ctx.config.executable,'--archive',ctx.config.archive]);
    return {state:'validated',output,files:await listFiles(output),policy:'Partial tile diagnostic, not production data'};
}
