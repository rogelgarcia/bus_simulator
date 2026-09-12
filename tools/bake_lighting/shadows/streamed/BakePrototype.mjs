// Registered one-profile prototype; production indexes stay unchanged.
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {canonicalJsonBytes} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {validateStaticSunDepthTileArrayIntegrity,validateStaticSunDepthTileSetDescriptor} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {STREAMED_SHADOW_SCHEMA,validateStreamedShadowManifest} from '../../../../src/app/illumination/static_sun_depth/StreamedShadowPages.js';
import {withGameBrowser} from '../../experiments/lighting_configurations/capture_baselines/GameBrowser.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {validateShadowPageGuards} from './ValidatePages.mjs';
import {reconcileShadowPageGuards} from './ReconcileGuards.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function bakeStreamedPrototype(ctx) {
    if(ctx.publish)throw new Error('Prototype generation cannot publish; image and route validation required');
    if(!ctx.options.output||!ctx.options.pose)throw new Error('output and pose required');
    const output=path.resolve(ctx.root,ctx.options.output);
    if(!output.startsWith(path.join(ctx.root,'tests/artifacts/screens/illumination_547')+path.sep))throw new Error('Output must be under tests/artifacts/screens/illumination_547/');
    await mkdir(path.dirname(output),{recursive:true});await mkdir(output);await mkdir(path.join(output,'pages'));
    const pose=JSON.parse(await readFile(path.resolve(ctx.root,ctx.options.pose),'utf8'));
    const index=JSON.parse(await readFile(path.join(ctx.root,'assets/baked_lighting/shadows/package_index.json'),'utf8'));
    const profile=index.profiles['ai527.sun.az045.el55'];
    const parent=path.dirname(path.resolve(ctx.root,profile.packagePath));
    const descriptor=validateStaticSunDepthTileSetDescriptor(JSON.parse(await readFile(path.join(parent,'descriptor.json'),'utf8')));
    await validateStaticSunDepthTileArrayIntegrity(descriptor,new Uint8Array(await readFile(path.join(parent,'static_sun_depth.rg8'))));
    const layout=descriptor.identity.layout,pitch=layout.texelSizeMeters/3;
    const manifest={schema:STREAMED_SHADOW_SCHEMA,parentDescriptorSha256:hash(canonicalJsonBytes(descriptor)),ratio:3,interiorTexels:1020,
        texelSizeMeters:pitch,angularDiameterDegrees:.53,guardTexels:Math.ceil((descriptor.identity.encoding.maxDepthMeters-descriptor.identity.encoding.minDepthMeters)*Math.tan(.53*Math.PI/360)/pitch)+2,
        origin:[...layout.boundsLightMeters.min],tileCount:layout.tileCount.map((v,i)=>Math.ceil(v*layout.interiorTexels[i]*3/1020)),
        encoding:'rg8-packed-linear-depth-v1',coverage:'explicit prototype pages; all other coordinates use authenticated parent',pages:[]};
    const fullCity = ctx.options['full-city'] === true;
    if (fullCity) manifest.coverage = 'complete parent grid';
    const basis=descriptor.identity.basis,bus=pose.bus.transform.position,radius=55;
    const center=[basis.rightAxisWorld,basis.upAxisWorld].map(axis=>axis.reduce((sum,v,i)=>sum+v*([bus.x,bus.y,bus.z][i]-basis.originWorld[i]),0));
    const ids=[],edge=manifest.interiorTexels*pitch;
    for(let y=0;y<manifest.tileCount[1];y++)for(let x=0;x<manifest.tileCount[0];x++)if(
        fullCity || Math.abs(manifest.origin[0]+(x+.5)*edge-center[0])<radius+edge/2&&Math.abs(manifest.origin[1]+(y+.5)*edge-center[1])<radius+edge/2)ids.push(y*manifest.tileCount[0]+x);
    const started=Date.now();
    await withGameBrowser(ctx,{width:1280,height:720},async(page,url)=>{
        await page.addInitScript(()=>localStorage.setItem('bus_sim.bakedLighting.v1',JSON.stringify({mode:'current',shadows:{enabled:false}})));
        await page.goto(`${url}/?pose=civic_center_curve_front&coreTests=0&visibilityMap=0`);
        await page.waitForFunction(()=>!!window.__busSim?.sm?.current?.city);
        const evidence=await page.evaluate(async({descriptor,manifest})=>{
            const adapter=await import('/src/graphics/illumination/bake_source/index.js');
            const {createResolvedIlluminationExportProfile}=await import('/tools/illumination_bake_exporter/profile.mjs');
            const {createNativeShadowPageCapture}=await import('/tools/bake_lighting/shadows/streamed/NativePageCapture.js');
            const {engine,sm}=window.__busSim;engine.stop();sm.current.gameLoop.paused=true;await engine.waitForLightingReady();
            const fresh=await adapter.createFreshResolvedGameplayCityForBake({currentCity:sm.current.city,engine,gameplayPose:sm.current._gameplayPose});
            const profile=createResolvedIlluminationExportProfile({city:sm.current.city,engine});
            const exported=await adapter.exportResolvedCityBakeIdentity({city:fresh.city,profile,readiness:{...fresh.readiness,lightingProfileSourcesReady:true},sourceEqualityVerified:fresh.sourceEqualityVerified});
            window.__shadowPageCapture=createNativeShadowPageCapture(engine.renderer,fresh.city,descriptor,manifest);
            return {sourceIdentity:exported.sourceIdentity,casterMeshes:window.__shadowPageCapture.casterMeshes};
        },{descriptor,manifest});
        await writeJson(path.join(output,'source_evidence.json'),evidence);
        if(evidence.sourceIdentity.resolvedSource!==profile.liveIdentity.resolvedSourceSha256
            || evidence.sourceIdentity.channelSources.find(v=>v.id==='static_sun_depth')?.sha256!==profile.liveIdentity.staticSunDepthSourceSha256)throw new Error('Fresh detail source differs from installed parent');
        for(const id of ids){
            ctx.signal.throwIfAborted();
            const result=await page.evaluate(id=>{
                const {raw,occupied,proof}=window.__shadowPageCapture.capture(id);let text='';
                for(let i=0;i<raw.length;i+=32768)text+=String.fromCharCode(...raw.subarray(i,i+32768));
                return {base64:btoa(text),occupied,proof};
            },id);
            const raw=Buffer.from(result.base64,'base64'),compressed=gzipSync(raw,{level:6});
            const file=`pages/${id}.rg8.gz`,empty=result.occupied===0;
            if(!empty)await writeFile(path.join(output,file),compressed);
            manifest.pages.push({id,empty,path:empty?null:file,byteLength:raw.length,sha256:hash(raw),...(empty?{}:{compressedBytes:compressed.length,compressedSha256:hash(compressed)})});
            ctx.log.line(ctx.id,`Detail page ${manifest.pages.length}/${ids.length}; ${result.occupied} occupied texels`);
        }
        await page.evaluate(()=>window.__shadowPageCapture.dispose());
    });
    await writeJson(path.join(output,'native_guard_validation.json'),await validateShadowPageGuards(output,manifest));
    const reconciliation=await reconcileShadowPageGuards(output,manifest);
    await writeJson(path.join(output,'guard_reconciliation.json'),reconciliation);
    await validateStreamedShadowManifest(manifest,descriptor);
    const file=path.join(output,'manifest.json');await writeJson(file,manifest);
    const guards=await validateShadowPageGuards(output,manifest);await writeJson(path.join(output,'guard_validation.json'),guards);
    if(!guards.passed)throw new Error(`Native page guard disagreement: ${JSON.stringify(guards)}`);
    await writeJson(path.join(output,'streaming_index.json'),{schema:'bus-sim-static-shadow-streaming-index-v1',profiles:[{parentDescriptorSha256:manifest.parentDescriptorSha256,sha256:hash(await readFile(file)),url:'/'+path.relative(ctx.root,file).replaceAll('\\','/')}]});
    await writeJson(path.join(output,'receipt.json'),{state:fullCity?'city candidate':'prototype',productionEligible:false,fullCity,casterPolicy:'three-r183-effective-shadow-side-v1',seconds:(Date.now()-started)/1000,parent:profile.packagePath,
        manifestSha256:hash(await readFile(file)),pages:manifest.pages.length,guards,reconciliation,pending:['image review','cold/warm route benchmark','full-city publication']});
    return {state:'validated',output,files:await listFiles(output)};
}
