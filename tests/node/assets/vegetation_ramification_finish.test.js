// Inspects saved finish exports independently of Blender receipts, including every tangent and packed image.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {glbDocument} from '../../../tools/bake_vegetation/Validate.mjs';
import {readAccessor} from '../../../tools/bake_vegetation/Accessors.mjs';
const directory=process.env.VEGETATION_FINISH_REVIEW??'tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r36_integrated_roots';
const file=path.join(directory,'manifest.json');
const manifest=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('root/PBR finish preserves its source graphs and authentic material copies',t=>{
    if(!manifest){t.skip('Generate the staged finish collection or set VEGETATION_FINISH_REVIEW');return;}
    assert.equal(manifest.surfaceFinish,true);
    for(const row of manifest.materials){
        const copy=fs.readFileSync(path.join(directory,row.file));assert.equal(hash(copy),row.sha256);assert.equal(hash(fs.readFileSync(row.source)),row.sha256);
    }
    for(const model of manifest.models){
        const folder=path.join(directory,model.directory),source=path.join(manifest.sourceReview.directory,model.directory);
        assert.equal(hash(fs.readFileSync(path.join(folder,'graph.json'))),hash(fs.readFileSync(path.join(source,'graph.json'))));
        assert.equal(model.surfaceFinish.shootGeometryUnchanged,true);assert.equal(model.meshAudit.roots.passed,true);
        assert.equal(model.meshAudit.roots.coarseRootsConnected,true);
        if(manifest.exportSourceReview){
            assert.equal(model.exportRepair.onlyTangentDirectionsChanged,true);
            assert.equal(model.surfaceFinish.exportTangents.frames.passed,true);
            assert.ok(model.surfaceFinish.exportTangents.frames.vertices>0);
        }
        if(model.species==='arrowwood_viburnum')assert.ok(model.surfaceFinish.rootSurfaces.crownMaximumSurfaceHeight<0);
        for(const pocket of model.surfaceFinish.rootSurfaces.sealedVoxelPockets){assert.ok(pocket.negativeVolume<0);assert.ok(pocket.maximumExtent<=model.surfaceFinish.rootSurfaces.voxelMetres*4);}
        for(const sliver of model.surfaceFinish.rootSurfaces.removedRemeshSlivers??[]){
            const voxel=model.surfaceFinish.rootSurfaces.voxelMetres;
            assert.equal(sliver.vertices,8);assert.deepEqual(sliver.faceSizes,[4,4,4,4,4,4]);
            assert.ok(sliver.positiveVolume>0&&sliver.positiveVolume<voxel**3*.001);assert.ok(sliver.maximumExtent<voxel*.1);
            assert.ok(sliver.maximumExtent<model.surfaceFinish.rootSurfaces.minimumCoarseSourceDiameter*.05);
        }
        assert.equal(model.meshAudit.roots.retainedTips,JSON.parse(fs.readFileSync(path.join(folder,'graph.json'))).roots.paths.length);
        if(model.metadata.stemReview){
            const views=model.views.filter(v=>v.view.startsWith('trunk_'));
            assert.deepEqual(views.map(v=>v.view),['trunk_front','trunk_side','trunk_oblique']);
            assert.ok(views.every(v=>v.neutralStem&&v.engine==='BLENDER_EEVEE'));
        }
        if(model.metadata.rootIntegrationReview){
            const views=model.views.filter(v=>v.view.startsWith('collar_neutral_'));
            assert.deepEqual(views.map(v=>v.view),['collar_neutral_front','collar_neutral_side','collar_neutral_oblique']);
            assert.ok(views.every(v=>v.neutralCollar&&v.engine==='BLENDER_EEVEE'));
            assert.ok(model.views.some(v=>v.view==='collar_front')&&model.views.some(v=>v.view==='collar_side'));
            assert.equal(model.metadata.surfaceFinish.basalBarkFlow.method,'shared cylindrical-to-radial growth field');
            assert.ok(model.metadata.surfaceFinish.basalBarkFlow.objects.every(o=>o.finite&&o.mappedLoops>0));
            const roots=model.surfaceFinish.rootSurfaces;
            assert.ok(roots.collarBlend.weightedVertices>0);
            assert.equal(roots.neckFit.length,roots.collars);
            assert.ok(roots.neckFit.every(row=>row.fittedVertices>0&&row.maximumHeightInRadii<=2.15));
        }
    }
});
for(const model of manifest?.models??[])test(`${model.species}/${model.seed}: GLB carries valid tangent frames and original embedded PBR maps`,()=>{
    const document=glbDocument(fs.readFileSync(path.join(directory,model.directory,'tree.glb'))),d=document.json;
    assert.equal(d.meshes.length,3);
    for(const mesh of d.meshes)for(const primitive of mesh.primitives){
        const uv=readAccessor(document,primitive.attributes.TEXCOORD_0),normal=readAccessor(document,primitive.attributes.NORMAL),tangent=readAccessor(document,primitive.attributes.TANGENT);
        assert.equal(uv.count,normal.count);assert.equal(tangent.count,normal.count);
        for(let i=0;i<normal.count;i++){
            assert.ok(Number.isFinite(uv.get(i,0))&&Number.isFinite(uv.get(i,1)));
            const n=[0,1,2].map(k=>normal.get(i,k)),v=[0,1,2].map(k=>tangent.get(i,k));
            assert.ok(Math.abs(Math.hypot(...v)-1)<.002,'Non-unit tangent');assert.ok(Math.abs(n.reduce((s,x,k)=>s+x*v[k],0))<.003,'Tangent is not normal-orthogonal');
            assert.equal(Math.abs(tangent.get(i,3)),1);
        }
    }
    for(const material of d.materials){
        const textures={basecolor:material.pbrMetallicRoughness.baseColorTexture,normal_opengl:material.normalTexture,orm:material.pbrMetallicRoughness.metallicRoughnessTexture};
        assert.equal(material.occlusionTexture.index,textures.orm.index);
        for(const [name,texture] of Object.entries(textures)){
            const image=d.images[d.textures[texture.index].source];assert.equal(image.uri,undefined);assert.equal(image.mimeType,'image/png');
            const view=d.bufferViews[image.bufferView],bytes=document.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
            assert.equal(hash(bytes),hash(fs.readFileSync(path.join(directory,'materials',model.species,name+'.png'))),'Export changed material pixels');
        }
    }
});
