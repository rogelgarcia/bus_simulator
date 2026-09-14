// Analytic material grid separates BRDF response from city geometry and texture inputs.
import path from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {authenticated,receipt,resultFiles} from '../lighting_configurations/StageInputs.mjs';
import {writeJson,listFiles} from '../../../baking/Files.mjs';
import {runBlenderStage} from '../../../baking/Blender.mjs';
import {withGameBrowser} from '../lighting_configurations/capture_baselines/GameBrowser.mjs';
import {outputPath,TOOL} from './Baseline.mjs';

export async function specularFixture(ctx){
    if(ctx.publish||!ctx.options.input||!ctx.options.capture||!ctx.options.output)throw new Error('Authenticated reference, capture and new output required');
    const input=outputPath(ctx.root,ctx.options.input),capture=outputPath(ctx.root,ctx.options.capture),output=outputPath(ctx.root,ctx.options.output);
    await authenticated(path.join(input,'reference_receipt.json'));await authenticated(path.join(capture,'material_parity_capture_receipt.json'));
    const request=JSON.parse(await readFile(path.join(input,'request.json'),'utf8'));
    const evidence=JSON.parse(await readFile(path.join(capture,'pose_05','evidence.json'),'utf8')).before;
    const hdr=new URL(evidence.lighting.ibl.hdrUrl).pathname;
    const recipe={roughness:[.05,.2,.4,.6,.78,.85,1],noV:[1,.9,.75,.6,.45,.3,.15,.05],cellSize:64,worlds:['white','sky'],hdr,hdrFile:path.join(ctx.root,hdr.slice(1)),
        defaults:request.defaults,device:ctx.config.renderDevice,samples:2048,seed:568,
        policy:'Black dielectric Base Color, metalness 0, F0=.04 / IOR1.5. Orthographic actual tilted planes, no normal maps or AO, no other glossy/shadow geometry, linear output. Sky is disc-free.'};
    await mkdir(output);await writeJson(path.join(output,'request.json'),recipe);
    const html=await readFile(path.join(ctx.root,'index.html'),'utf8');
    const importMap=html.match(/<script\b[^>]*type=["']importmap["'][^>]*>[\s\S]*?<\/script>/i)?.[0];
    if(!importMap)throw new Error('Game import map missing');
    await withGameBrowser(ctx,{width:448,height:512},async(page,url)=>{
        await page.route(url+'/ai568-specular-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'+importMap}));
        await page.goto(url+'/ai568-specular-fixture');
        const measured=await page.evaluate(async recipe=>{
            const THREE=await import('three');const {loadIBLTexture}=await import('/src/graphics/engine3d/lighting/IBL.js');
            const cols=recipe.roughness.length,rows=recipe.noV.length,size=recipe.cellSize,width=cols*size,height=rows*size;
            const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(width,height);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
            const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,format:THREE.RGBAFormat});
            const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-cols,cols,rows,-rows,.1,300);camera.position.z=100;camera.lookAt(0,0,0);
            for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
                const n=recipe.noV[row],s=Math.sqrt(1-n*n),x=(col-(cols-1)/2)*2,y=((rows-1)/2-row)*2;
                const positions=[];
                for(const [u,v]of [[-.7,-.7],[.7,-.7],[.7,.7],[-.7,-.7],[.7,.7],[-.7,.7]])positions.push(x+u,y+v,-u*s/n);
                const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
                scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0,metalness:0,roughness:recipe.roughness[col],envMapIntensity:1})));
            }
            const white=new THREE.Scene();white.background=new THREE.Color(1,1,1);const pmrem=new THREE.PMREMGenerator(renderer),whiteTarget=pmrem.fromScene(white);pmrem.dispose();
            scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
            const geometryChecks=scene.children.map(mesh=>{
                const n=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,0);
                mesh.geometry.computeBoundingBox();const p=mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
                return {normal:n.toArray(),noV:n.z,projectedCenter:p.project(camera).toArray()};
            });
            const results=[];
            for(const world of recipe.worlds){
                scene.environment=world==='white'?whiteTarget.texture:await loadIBLTexture(renderer,{enabled:true,hdrUrl:recipe.hdr});
                renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
                const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
                const cells=[];
                for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
                    const rgb=[0,0,0];let count=0;
                    for(let y=row*size+24;y<row*size+40;y++)for(let x=col*size+24;x<col*size+40;x++){
                        const offset=((height-1-y)*width+x)*4;for(let c=0;c<3;c++)rgb[c]+=pixels[offset+c];count++;
                    }
                    cells.push({roughness:recipe.roughness[col],noV:recipe.noV[row],rgb:rgb.map(x=>x/count)});
                }
                results.push({world,cells});
            }
            renderer.setRenderTarget(null);target.dispose();whiteTarget.dispose();renderer.dispose();
            return {threeRevision:THREE.REVISION,results,geometryChecks,shader:THREE.ShaderChunk.lights_physical_pars_fragment,environmentShader:THREE.ShaderChunk.envmap_physical_pars_fragment};
        },recipe);
        await writeJson(path.join(output,'game.json'),measured);
    });
    await runBlenderStage(ctx,TOOL+'/specular_fixture.py',[output],{background:true});
    const file=path.join(output,'specular_fixture_receipt.json');
    return resultFiles(await receipt(file,ctx.key,{output,input,capture},await listFiles(output)),file);
}
