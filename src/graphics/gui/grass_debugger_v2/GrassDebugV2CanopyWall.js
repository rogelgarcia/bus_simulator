// Side captures show several rows of leaves through the perimeter instead of stretching an overhead image.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2PeriodicSource } from './GrassDebugV2PeriodicSource.js';
import { createGrassDebugV2PatchBakeMaterial } from './GrassDebugV2PatchBakeMaterial.js';
import { createGrassDebugV2FloorMaterial } from './GrassDebugV2FloorMaterial.js';
import { GRASS_V2_LITTER_SUBSTRATE } from './GrassDebugV2LitterSubstrate.js';
import { grassPatchCaptureShader } from '../../shaders/materials/grass/GrassFloorBakeShaderLoader.js';
import { grassFloorLightingShader } from '../../shaders/materials/grass/GrassFloorFacingShaderLoader.js';
import { grassFieldCanopyCaptureShader, grassFieldCanopyNormalShader, grassFieldCanopyLightingShader, grassFieldCanopyWallShader, grassFieldCanopyWallBlendShader, grassFieldCanopyWallSurfaceShader } from '../../shaders/materials/grass/GrassFieldCanopyShaderLoader.js?v=lod4-wall-detail-1';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';

const DIRECTIONS = [[0,1],[1,0],[0,-1],[-1,0]];
const TILE_WIDTH=1024, TILE_HEIGHT=128, GUTTER=8;
const ELEVATIONS=[0,15,30,60];
const LITTER_BLEND = Object.freeze({ start: .65, end: 1, strength: .12 });
const SELF_SHADOW_STRENGTH = .2;
const BASE_TINT = Object.freeze({ leaves: .92, litter: .94 });
// The narrow lower rise preserves the silhouette; the upper slope softens its join to the canopy.
const BEVEL = Object.freeze({ insetFraction: .25, heightFraction: .65 });

function groundColor(bake, layer) {
    const normal=bake.readPixels(layer,'normal'),roughness=bake.readPixels(layer,'roughness');
    let weight=0;const rgb=[0,0,0];
    for(let i=0;i<normal.length;i+=4)weight+=1-normal[i+3]/255;
    for(let i=0;i<roughness.length;i+=4){rgb[0]+=roughness[i]/255;rgb[1]+=roughness[i+2]/255;rgb[2]+=roughness[i+3]/255;}
    const fraction=weight/(normal.length/4);
    return new THREE.Vector3(...rgb.map(v=>v/(roughness.length/4)/Math.max(fraction,.0001)));
}

function wallMaterial(maps, ground, shadowUniforms, litterMaterial, height) {
    const material=createGrassDebugV2FloorMaterial(maps,{canopyContrast:0,canopyOcclusionStrength:0});
    material.name='GrassFieldCanopy-Wall';material.side=THREE.FrontSide;
    material.defines.GRASS_FIELD_CANOPY_WALL=1;
    if(litterMaterial)material.defines.GRASS_CANOPY_WALL_LITTER=1;
    const payloads=[grassFieldCanopyNormalShader,grassFieldCanopyLightingShader,grassFieldCanopyWallShader,grassFieldCanopyWallBlendShader,grassFieldCanopyWallSurfaceShader];
    payloads.forEach(p=>attachShaderMetadata(material,p));
    const uniforms={grassWallGroundColor:{value:ground},grassWallVisibility:{value:maps.visibility},
        grassWallLitterBlend:{value:new THREE.Vector3(LITTER_BLEND.start,LITTER_BLEND.end,LITTER_BLEND.strength)},
        grassWallBaseTint:{value:new THREE.Vector2(BASE_TINT.leaves,BASE_TINT.litter)},
        grassWallSelfShadowStrength:{value:SELF_SHADOW_STRENGTH},...shadowUniforms};
    if(litterMaterial)Object.assign(uniforms,{grassWallLitterMap:{value:litterMaterial.map},grassWallLitterColor:{value:litterMaterial.color},
        grassWallLitterUvScale:{value:1/GRASS_V2_LITTER_SUBSTRATE.tileMeters},grassWallLitterHeight:{value:height}});
    material.userData.grassWallSelfShadowStrength=uniforms.grassWallSelfShadowStrength;
    material.userData.grassWallBaseTint=uniforms.grassWallBaseTint;
    registerMaterialShaderHook(material,{id:'grass.canopy-wall',priority:20,variantKey:payloads.map(p=>p.variantKey).join('|'),
        uniforms,apply:shader=>{
            Object.assign(shader.uniforms,uniforms);
            const anchor='diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor';
            if(!shader.fragmentShader.includes(anchor)||!shader.fragmentShader.includes('normal = normalize( tbn * mapN );'))throw new Error('Canopy wall shading contract changed.');
            shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+grassFieldCanopyWallShader.fragmentSource)
                .replace('normal = normalize( tbn * mapN );',grassFieldCanopyNormalShader.fragmentSource)
                .replace(grassFloorLightingShader.fragmentSource,grassFieldCanopyLightingShader.fragmentSource)
                .replace(anchor,grassFieldCanopyWallSurfaceShader.fragmentSource+'\n'+anchor)
                .replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(grassCanopyShadowPass==1)gl_FragColor=vec4(vec3(grassWallCapturedVisibility),1.0);');
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+grassFieldCanopyWallShader.vertexSource)
                .replace('#include <project_vertex>','#include <project_vertex>\n'+grassFieldCanopyWallSurfaceShader.vertexSource);
            shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin.replaceAll('getShadow( directionalShadowMap','grassWallShadow( directionalShadowMap'));
            shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment)
                .replace('#include <roughnessmap_fragment>',THREE.ShaderChunk.roughnessmap_fragment);
            for(const [map,uv] of [['map','vMapUv'],['normalMap','vNormalMapUv'],['roughnessMap','vRoughnessMapUv']])
                shader.fragmentShader=shader.fragmentShader.replace(new RegExp('texture2D\\(\\s*'+map+',\\s*'+uv+'\\s*\\)','g'),'grassWallSample('+map+', '+uv+')');
            for(const chunk of ['tonemapping_fragment','colorspace_fragment','fog_fragment','premultiplied_alpha_fragment','dithering_fragment'])
                shader.fragmentShader=shader.fragmentShader.replace('#include <'+chunk+'>','');
            shader.fragmentShader+='\n'+grassFieldCanopyWallBlendShader.fragmentSource;
        }});
    return material;
}

/** @param {{renderer:THREE.WebGLRenderer,sources:THREE.Mesh[],bake:object,litter:THREE.Object3D,width:number,depth:number,config:object,sourceHeight:number,shadowDirection:THREE.Vector3,shadowUniforms:object,onProgress?:(text:string)=>void}} options */
export async function createGrassDebugV2CanopyWall({renderer,sources,bake,litter,width,depth,config,sourceHeight,shadowDirection,shadowUniforms,onProgress}) {
    if(sources.length!==2||!(sourceHeight>config.height&&config.ramp>0&&config.tileMeters>0))throw new Error('Canopy walls require two periodic sources and a ramp below the source tips.');
    const group=new THREE.Group();group.name='GrassField-LOD4-Wall';
    const litterMaterial=litter.getObjectByName('DryLitterInterior')?.material;
    if(!litterMaterial?.map)throw new Error('Canopy wall requires the existing litter background texture.');
    const textures=[],materials=[],geometries=[],profiles={all:[],grass:[]};
    const backgrounds=Object.fromEntries(['all','grass'].map(layer=>[layer,groundColor(bake,layer)]));
    const roughness=new THREE.DataTexture(new Uint8Array([0,255,0,0]),1,1,THREE.RGBAFormat);
    roughness.userData.grassSoilContributions=true;roughness.needsUpdate=true;textures.push(roughness);
    const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),
        scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),tone:renderer.toneMapping,
        autoClear:renderer.autoClear,shadows:renderer.shadowMap.enabled,shadowAuto:renderer.shadowMap.autoUpdate,shadowUpdate:renderer.shadowMap.needsUpdate,xr:renderer.xr.enabled};
    const target=new THREE.WebGLRenderTarget(TILE_WIDTH,TILE_HEIGHT*4*ELEVATIONS.length,{samples:4,colorSpace:THREE.NoColorSpace});
    const captures=[],captureMaterials=[],lights=[];
    try {
        renderer.toneMapping=THREE.NoToneMapping;renderer.autoClear=false;renderer.shadowMap.enabled=false;renderer.xr.enabled=false;renderer.setScissorTest(false);
        for(const [variant,source] of sources.entries()) {
            onProgress?.('Capturing LOD4 side walls · variant '+(variant+1));
            const periodic=createGrassDebugV2PeriodicSource(source,0,config.tileMeters);captures.push(periodic);
            const scene=new THREE.Scene();scene.add(periodic.group);
            const sun=new THREE.DirectionalLight(0xffffff,1);lights.push(sun);sun.position.copy(shadowDirection).normalize().multiplyScalar(10);sun.castShadow=true;
            sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-3,right:3,bottom:-3,top:3,near:.01,far:20});sun.shadow.camera.updateProjectionMatrix();
            sun.shadow.bias=-.00001;sun.shadow.normalBias=.0001;scene.add(sun,sun.target);
            const maps={roughness};
            for(const [channel,name] of ['albedo','normal','roughness','visibility'].entries()) {
                if(name==='roughness')continue;
                renderer.shadowMap.enabled=name==='visibility';renderer.shadowMap.autoUpdate=false;
                const material=createGrassDebugV2PatchBakeMaterial(source.material,name==='visibility'?'visibility':'albedo',true);
                material.alphaToCoverage=false;material.defines={...material.defines,GRASS_FIELD_CANOPY_SOURCE_HEIGHT:sourceHeight.toFixed(9),
                    GRASS_FIELD_CANOPY_CHANNEL:channel,GRASS_FIELD_CANOPY_LEAF:'1.0'};
                attachShaderMetadata(material,grassFieldCanopyCaptureShader);
                registerMaterialShaderHook(material,{id:'grass.canopy-wall.capture',variantKey:grassFieldCanopyCaptureShader.variantKey,apply:shader=>{
                    shader.fragmentShader=shader.fragmentShader.replace(grassPatchCaptureShader.fragmentSource,grassFieldCanopyCaptureShader.fragmentSource);
                }});captureMaterials.push(material);
                scene.traverse(o=>{if(o.isMesh){o.material=material;o.castShadow=o.receiveShadow=true;}});
                target.scissorTest=false;target.viewport.set(0,0,target.width,target.height);renderer.setRenderTarget(target);
                const clear=channel===1?new THREE.Color(.5,.5,1):channel===2?new THREE.Color(0,1,0):new THREE.Color(channel===3?0xffffff:0);
                renderer.setClearColor(clear,0);renderer.clear();
                for(const [angleIndex,angle] of ELEVATIONS.entries())for(const [direction,[nx,nz]] of DIRECTIONS.entries()) {
                    const marginX=config.tileMeters*GUTTER/(TILE_WIDTH-2*GUTTER),marginY=sourceHeight*GUTTER/(TILE_HEIGHT-2*GUTTER);
                    const elevation=angle*Math.PI/180,cosine=Math.cos(elevation);
                    const camera=new THREE.OrthographicCamera(-config.tileMeters/2-marginX,config.tileMeters/2+marginX,(sourceHeight+marginY)*cosine,-marginY*cosine,.01,6);
                    camera.position.set(nx*2,2*Math.tan(elevation),nz*2);camera.lookAt(0,0,0);camera.updateMatrixWorld();
                    // The carrier sits inside the original perimeter, so its view must include that foreground strip too.
                    periodic.group.position.set(nx*(-config.tileMeters/2+config.inset),0,nz*(-config.tileMeters/2+config.inset));
                    if(name==='visibility'){renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;}
                    target.viewport.set(0,(angleIndex*4+direction)*TILE_HEIGHT,TILE_WIDTH,TILE_HEIGHT);target.scissor.copy(target.viewport);target.scissorTest=true;
                    renderer.setRenderTarget(target);renderer.render(scene,camera);
                }
                const pixels=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
                const data=name==='visibility'?new Uint8Array(target.width*target.height):pixels;
                if(name==='visibility')for(let i=0;i<data.length;i++)data[i]=pixels[i*4];
                const texture=new THREE.DataTexture(data,target.width,target.height,name==='visibility'?THREE.RedFormat:THREE.RGBAFormat);textures.push(texture);maps[name]=texture;
                texture.name='GrassCanopyWall-'+variant+'-'+name;texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=true;
                texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
                texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
                texture.userData.grassSoilContributions=name==='roughness';
            }
            for(const layer of ['all','grass']){const material=wallMaterial(maps,backgrounds[layer],shadowUniforms,layer==='all'?litterMaterial:null,config.height);profiles[layer].push(material);materials.push(material);}
        }
        // Each two-metre segment samples a real side view. Shared vertices never blend a top UV into a wall UV.
        for(let variant=0;variant<2;variant++) {
            const positions=[],uv=[],indices=[],heights=[];
            for(const [direction,[nx,nz]] of DIRECTIONS.entries()) {
                const tx=nz,tz=-nx,half=(nx?depth:width)/2-config.inset,outer=(nx?width:depth)/2-config.inset;
                // Match the top's edge vertices exactly, including its slight height variation.
                const cuts=[-half,-half+config.ramp];
                for(let t=Math.ceil((-half+config.ramp)/config.step)*config.step;t<half-config.ramp;t+=config.step)if(t>-half+config.ramp)cuts.push(t);
                cuts.push(half-config.ramp,half);
                for(let i=0;i<cuts.length-1;i++) {
                    const start=cuts[i],end=cuts[i+1],tile=Math.floor((start+end)*.5/config.tileMeters+.5);
                    if(((tile%2)+2)%2!==variant)continue;
                    const base=positions.length/3;
                    for(const [insetFraction,heightFraction] of [[0,0],[BEVEL.insetFraction,BEVEL.heightFraction],[1,1]])for(const t of [start,end]) {
                        const inset=insetFraction*config.ramp,along=THREE.MathUtils.clamp(t,-half+inset,half-inset);
                        const perpendicular=outer-inset,x=nx*perpendicular+tx*along,z=nz*perpendicular+tz*along;
                        const y=heightFraction*(config.height+config.variation*Math.sin(x*1.7)*Math.sin(z*1.3));
                        positions.push(x,y,z);
                        heights.push(heightFraction);
                        uv.push((GUTTER+(t/config.tileMeters+.5-tile)*(TILE_WIDTH-2*GUTTER))/TILE_WIDTH,
                            (direction*TILE_HEIGHT+GUTTER+y/sourceHeight*(TILE_HEIGHT-2*GUTTER))/(TILE_HEIGHT*4*ELEVATIONS.length));
                    }
                    for(const offset of [0,2])indices.push(base+offset,base+offset+1,base+offset+2,base+offset+1,base+offset+3,base+offset+2);
                }
            }
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
            geometry.setAttribute('grassWallHeight',new THREE.Float32BufferAttribute(heights,1));
            geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.push(geometry);
            const mesh=new THREE.Mesh(geometry,profiles.all[variant]);mesh.name='GrassField-LOD4-Wall-'+variant;
            mesh.userData.grassCanopyWall=variant+1;mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
        }
    } catch(error) { textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());throw error; }
    finally {
        captureMaterials.forEach(m=>m.dispose());captures.forEach(c=>c.dispose());lights.forEach(l=>l.shadow.dispose());target.dispose();
        renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);
        renderer.setClearColor(previous.color,previous.alpha);renderer.toneMapping=previous.tone;renderer.autoClear=previous.autoClear;renderer.shadowMap.enabled=previous.shadows;renderer.xr.enabled=previous.xr;
        renderer.shadowMap.autoUpdate=previous.shadowAuto;renderer.shadowMap.needsUpdate=previous.shadowUpdate;
    }
    return Object.freeze({group,materials:profiles,getSnapshot:()=>({directions:4,elevations:ELEVATIONS,variants:2,captureDepthMeters:config.tileMeters,
        textureSize:[TILE_WIDTH,TILE_HEIGHT*4*ELEVATIONS.length],textureBytes:textures.reduce((n,t)=>{
            let bytes=0,w=t.image.width,h=t.image.height;do{bytes+=w*h*(t.format===THREE.RedFormat?1:4);if(!t.generateMipmaps||w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}while(true);return n+bytes;
        },0),
        triangles:geometries.reduce((n,g)=>n+g.index.count/3,0),lightingBaked:false,shadows:'baked-self-and-cached-scene',captureShadowResolution:2048,
        litterBlend:LITTER_BLEND,litterTexture:'shared-substrate-albedo-full-wall',baseTint:BASE_TINT,
        selfShadowStrength:SELF_SHADOW_STRENGTH,bevel:BEVEL}),
        dispose(){textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}});
}
