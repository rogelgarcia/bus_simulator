// Verifies imported botanical PBR metadata, filtering and front/back data-map URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
const startupFetch=globalThis.fetch;
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
const {getPbrMaterialMeta,getPbrMaterialOptions,getPbrMaterialOptionsForBuildings,getPbrMaterialOptionsForGround,resolvePbrMaterialUrls}=await import('../../../src/graphics/content3d/catalogs/PbrMaterialCatalog.js');
const {primePbrAssetsAvailability}=await import('../../../src/graphics/content3d/materials/PbrAssetsRuntime.js');
await primePbrAssetsAvailability();globalThis.fetch=startupFetch;

const species=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
test('Botanical PBR: all fifteen source-authenticated sets have correct classes and eligibility',()=>{
    const options=getPbrMaterialOptions().filter(r=>r.id.startsWith('pbr.tree_ai_'));
    assert.equal(options.length,15);
    const forbidden=new Set([...getPbrMaterialOptionsForBuildings(),...getPbrMaterialOptionsForGround()].map(r=>r.id));
    for(const s of species)for(const role of ['bark','leaf_front','leaf_back']){
        const id=`pbr.tree_ai_${s}_${role}`,row=options.find(r=>r.id===id),meta=getPbrMaterialMeta(id);
        assert.equal(row.classId,role==='bark'?'bark':'foliage');assert.equal(forbidden.has(id),false);
        assert.equal(meta.provenance.source.type,'AI generated');assert.equal(meta.provenance.physicalMeasurement,false);
        assert.ok(meta.provenance.sourceFiles.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
        if(role!=='bark')assert.equal(meta.provenance.leafUv.front_back_share_identical_opacity,true);
    }
});

test('Botanical PBR: registered leaf faces resolve separate colors and auxiliary masks',async()=>{
    const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
    globalThis.window={localStorage:{getItem:()=> '1'}};
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
    try{
        assert.equal(await primePbrAssetsAvailability(),true);
        for(const s of species){
            const a=resolvePbrMaterialUrls(`pbr.tree_ai_${s}_leaf_front`),b=resolvePbrMaterialUrls(`pbr.tree_ai_${s}_leaf_back`);
            assert.ok(a.baseColorUrl.endsWith(`/tree_ai_${s}_leaf_front/basecolor.png`));
            assert.ok(b.baseColorUrl.endsWith(`/tree_ai_${s}_leaf_back/basecolor.png`));
            assert.notEqual(a.baseColorUrl,b.baseColorUrl);
            assert.ok(a.normalUrl.endsWith('/normal_opengl.png'));assert.ok(b.auxiliaryUrls.opacity.endsWith('/opacity.png'));
            assert.ok(b.auxiliaryUrls.translucency.endsWith('/translucency.png'));assert.ok(b.displacementUrl.endsWith('/height_16bit.png'));
        }
    }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
