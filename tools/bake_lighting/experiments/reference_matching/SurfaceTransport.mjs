// Authenticated offline transport and map-processing isolation; never publishes.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {outputPath,TOOL} from './Baseline.mjs';
const read=async f=>JSON.parse(await readFile(f,'utf8'));

export async function surfaceTransport(ctx) {
    if(ctx.publish||!ctx.options.input||!ctx.options.output)throw new Error('input and new output required; no publication');
    const input=outputPath(ctx.root,ctx.options.input),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'primary_surface_analysis_receipt.json'));
    const prior=await read(path.join(input,'request.json'));
    await authenticated(path.join(prior.capture,'material_parity_capture_receipt.json'));
    await authenticated(path.join(prior.nativeReference,'reference_receipt.json'));
    await authenticated(path.join(prior.reference,'primary_surface_reference_receipt.json'));
    await authenticated(path.join(prior.control,'bake_progress_receipt.json'));
    const source=await read(path.join(prior.nativeReference,'request.json'));
    let geometryCapture,processing,transportReference,geometryReference;
    if(ctx.options.phase==='geometry-analysis') {
        if(!ctx.options.geometry)throw new Error('geometry-analysis requires geometry');
        geometryReference=outputPath(ctx.root,ctx.options.geometry);
        const previous=await authenticated(path.join(geometryReference,'surface_transport_receipt.json'));
        if(previous.input!==input||previous.phase!=='geometry')throw new Error('Geometry control differs');
    }
    if(ctx.options.phase==='geometry') {
        if(!ctx.options.capture)throw new Error('geometry phase requires capture');
        geometryCapture=outputPath(ctx.root,ctx.options.capture);
        await authenticated(path.join(geometryCapture,'material_parity_capture_receipt.json'));
    }
    if(['spatial','refined'].includes(ctx.options.phase)) {
        if(!ctx.options.processing||!ctx.options.transport)throw new Error('spatial phase requires processing and transport');
        processing=outputPath(ctx.root,ctx.options.processing);
        const previous=await authenticated(path.join(processing,'surface_transport_receipt.json'));
        if(previous.input!==input||previous.phase!=='processing')throw new Error('Processing control differs');
        transportReference=outputPath(ctx.root,ctx.options.transport);
        const other=await authenticated(path.join(transportReference,'surface_transport_receipt.json'));
        if(other.input!==input||other.phase!=='transport')throw new Error('Transport control differs');
    }
    await mkdir(output);
    await writeJson(path.join(output,'request.json'),{...source,...prior,input,output,geometryCapture,processing,transportReference,geometryReference,phase:ctx.options.phase,device:ctx.config.renderDevice,root:ctx.root});
    const started=Date.now();
    if(ctx.options.phase==='geometry-analysis') {
        await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'surface_geometry_summary.py'),output]);
    } else if(ctx.options.phase==='processing') {
        await ctx.process(process.execPath,['--max-old-space-size=8192',path.join(ctx.root,TOOL,'SurfaceProcessing.mjs'),output]);
        await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'surface_processing_analysis.py'),output]);
    } else {
        const script={geometry:'surface_geometry.py',spatial:'surface_spatial.py',refined:'surface_spatial.py',transport:'surface_transport.py'}[ctx.options.phase];
        if(!script)throw new Error('Unknown phase');
        await runBlenderStage(ctx,TOOL+'/'+script,[output],{background:true});
        if(['spatial','refined'].includes(ctx.options.phase)) {
            await ctx.process(process.execPath,[path.join(ctx.root,TOOL,'SurfaceSpatialPost.mjs'),output]);
            await ctx.process(ctx.config.pythonExecutable,[path.join(ctx.root,TOOL,'surface_spatial_analysis.py'),output]);
        }
    }
    const file=path.join(output,'surface_transport_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{input,output,phase:ctx.options.phase,seconds:(Date.now()-started)/1000,diagnosticOnly:true},await listFiles(output)),file);
}
