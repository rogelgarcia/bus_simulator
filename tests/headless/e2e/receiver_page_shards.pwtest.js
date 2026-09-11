// Exercises authenticated page shards through the actual enhanced loader and GPU allocation lifecycle.
import test, { expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { buildIlluminationBinaryPackage } from '../../../src/app/illumination/package/index.js';
import { encodeReceiverRgb9e5 } from '../../../src/app/illumination/receiver_lightmaps/ReceiverHdrEncoding.js';

test.use({launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11']}});

async function fixture({wrongSource=false,transportPolicy='declared-alpha-coverage-v1'}={}) {
    const hash='1'.repeat(64),profileHash='2'.repeat(64),mappingHash='3'.repeat(64);
    const mapping={schema:'bus-sim-receiver-atlas-v1',pageCount:2,tableWidth:1,tableHeight:1,objects:[],
        profile:{id:'fixture.complete.v1',coverage:'complete-eligible-v1',irradianceRepresentation:'surface-diffuse-v1',
            transportPolicy,directRepresentation:'hybrid-sun-visibility-v1',
            pageTransport:'bounded-page-shards-v1',indirectEncoding:'rgb9e5_le',pageSize:1,mipLevels:1,maxPages:2},
        statistics:{triangles:2,charts:2},coverage:{schema:'bus-sim-receiver-coverage-v1',policy:'complete-eligible-v1',complete:true,
            eligibleTriangles:2,mappedTriangles:2,requiredPages:2,transport:{complete:true,excludedParticipantMappings:0},missingReceivers:[],failures:[]}};
    const coordinate={id:'mapping.coordinates',channelId:'receiver_mapping',data:new Float32Array([.5,.5,0,1]),
        resourceType:'texture_2d',encoding:'rgba32f_le',precision:'float32',dimensions:{width:1,height:1,depth:1,components:4},
        rowOrigin:'lower_left',coordinateTransform:{schema:'bus-sim-receiver-mapping-coordinates-v1',mapping},mipLevel:0,requiredRuntimeCapabilities:[]};
    const page=number=>({id:`indirect_irradiance.page${number}.mip0`,channelId:'indirect_irradiance',
        data:encodeReceiverRgb9e5(new Float32Array([number+1,.5,.25,1])),resourceType:'texture_2d',encoding:'rgb9e5_le',precision:'shared_exponent_rgb9',
        dimensions:{width:1,height:1,depth:1,components:1},rowOrigin:'lower_left',mipLevel:0,
        coordinateTransform:{schema:'bus-sim-rgb9e5-lightmap-page-v1',page:number},requiredRuntimeCapabilities:['receiver_rgb9e5_sampling_v1']});
    mapping.coverage.raster = { schema:'bus-sim-receiver-raster-coverage-v1',policy:'chart-isolated-nearest-sample-v1',
        triangles:2,charts:2,emptyCharts:0,missingReceiverSamples:0,pages:[0,1].map(number=>({page:number,triangles:1,charts:1,
            mips:[{mip:0,bytes:4,sha256:createHash('sha256').update(Buffer.from(page(number).data.buffer)).digest('hex')}]})) };
    const build=(chunks,source)=>buildIlluminationBinaryPackage({cityId:'fixture.city',lightingProfileId:mapping.profile.id,
        selectedCapabilityProfileId:'development.receiver_indirect_v1',source,compilerDescriptor:{fixture:true},
        channels:[{id:'indirect_irradiance',required:true,sourceSha256:hash,profileSha256:profileHash},
            {id:'receiver_mapping',required:true,sourceSha256:mappingHash,profileSha256:profileHash}],chunks});
    const child=await build([coordinate,page(1)],{resolvedSourceSha256:wrongSource?'4'.repeat(64):hash});
    const childBytes=gzipSync(child.bytes);
    const shards=[{url:'indirect_irradiance.part1.ilpkg.gz',bytes:child.bytes.length,compressedBytes:childBytes.length,aggregateSha256:child.aggregateSha256}];
    const root=await build([coordinate,page(0)],{resolvedSourceSha256:hash,receiverPageShards:shards}),rootBytes=gzipSync(root.bytes);
    return {rootBytes,childBytes,request:{descriptor:{compressedBytes:rootBytes.length,bytes:root.bytes.length,aggregateSha256:root.aggregateSha256,profileSha256:profileHash},
        channel:'indirect_irradiance',sourceHash:hash,resolvedSourceHash:hash,cityId:'fixture.city',profileId:mapping.profile.id}};
}

for(const transportPolicy of ['declared-alpha-coverage-v1','declared-alpha-coverage-uv-v2','declared-alpha-coverage-uv-raw-v3'])
test('Page packages authenticate source and release GPU allocation: '+transportPolicy,async({page})=>{
    const good=await fixture({transportPolicy}),bad=await fixture({wrongSource:true,transportPolicy});
    for(const [name,data] of [['good',good],['bad',bad]])await page.route(`**/shards/${name}/*.ilpkg.gz`,route=>route.fulfill({
        body:route.request().url().includes('.part1.')?data.childBytes:data.rootBytes,contentType:'application/octet-stream'}));
    await page.goto('/tests/headless/harness/index.html');
    const result=await page.evaluate(async ({good,bad})=>{
        const T=await import('three'),{createEnhancedReceiverLoader}=await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverResources.js');
        const renderer=new T.WebGLRenderer(),loader=createEnhancedReceiverLoader(renderer),signal=new AbortController().signal;
        const resource=await loader({...good,url:new URL('/shards/good/indirect_irradiance.ilpkg.gz',location.href).href,signal});
        const levels=[...resource.texture.image.data],memory={...renderer.info.memory};
        resource.dispose();const after={...renderer.info.memory};let failure='';
        try{await loader({...bad,url:new URL('/shards/bad/indirect_irradiance.ilpkg.gz',location.href).href,signal});}catch(error){failure=error.message;}
        const failedMemory={...renderer.info.memory},glError=renderer.getContext().getError();renderer.dispose();
        return {levels,memory,after,failedMemory,failure,glError};
    },{good:good.request,bad:bad.request});
    expect(result.levels).toHaveLength(2);expect(result.levels[0]).not.toBe(result.levels[1]);
    expect(result.memory.textures).toBe(2);expect(result.after.textures).toBe(0);
    expect(result.failedMemory.textures).toBe(0);expect(result.failure).toBe('Receiver page package source mismatch');expect(result.glError).toBe(0);
});
