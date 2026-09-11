// Parameter-matched laboratory materials, using the game's renderer and shader chunks.
import * as THREE from 'three';
const vector=v=>new THREE.Vector3(v[0],v[2],-v[1]);
const rgb=v=>new THREE.Color().setRGB(...v,THREE.LinearSRGBColorSpace);
function encode(p){let s='';const b=new Uint8Array(p.buffer);for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);}
export async function neutralFixtures(engine,options){
    const r=engine.renderer,scene=new THREE.Scene(),owned=[],records=[];
    const previous={tone:r.toneMapping,color:r.outputColorSpace,shadow:r.shadowMap.enabled,type:r.shadowMap.type};
    const width=options.materials.length*128,height=160;
    const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType});owned.push(target);
    try{
        r.toneMapping=THREE.NoToneMapping;r.outputColorSpace=THREE.LinearSRGBColorSpace;r.shadowMap.enabled=true;r.shadowMap.type=THREE.BasicShadowMap;
        // CubeUV's minimum mip is 16 texels; a 32-pixel panorama produces an invalid 8-texel cube.
        const data=new Float32Array(512*256*4).fill(1),texture=new THREE.DataTexture(data,512,256,THREE.RGBAFormat,THREE.FloatType);
        texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;
        const pmrem=new THREE.PMREMGenerator(r),env=pmrem.fromEquirectangular(texture);owned.push(texture,pmrem,env);
        const sun=new THREE.DirectionalLight(0xffffff,Math.PI);sun.position.copy(vector([0,Math.sin(Math.PI*35/180)*30,Math.cos(Math.PI*35/180)*30]));scene.add(sun,sun.target);
        sun.castShadow=true;sun.shadow.mapSize.set(4096,2048);Object.assign(sun.shadow.camera,{left:-width/128*1.2,right:width/128*1.2,top:5,bottom:-5,near:.1,far:60});sun.shadow.bias=-.00001;owned.push({dispose:()=>sun.shadow.dispose()});
        const camera=new THREE.OrthographicCamera(-options.materials.length*1.1,options.materials.length*1.1,1.375,-1.375,.01,100);
        for(const kind of ['plane','sphere']){
            const objects=[];
            for(const [i,item] of options.materials.entries()){
                const p=item.fixture,m=new THREE.MeshPhysicalMaterial({color:rgb(p.color),roughness:p.roughness,metalness:p.metalness,ior:p.ior,specularIntensity:p.specularIntensity,specularColor:rgb(p.specularColor??[1,1,1])});owned.push(m);
                const geometry=kind==='plane'?new THREE.PlaneGeometry(1.7,1.7):new THREE.SphereGeometry(.72,64,32);owned.push(geometry);
                const o=new THREE.Mesh(geometry,m);o.position.copy(vector([(i-(options.materials.length-1)/2)*2.2,0,0]));if(kind==='plane')o.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),vector([0,0,1]));o.receiveShadow=true;scene.add(o);objects.push(o);
            }
            const blockerGeometry=new THREE.PlaneGeometry(options.materials.length*2.2+2,3),blockerMaterial=new THREE.MeshBasicMaterial({color:0,side:THREE.DoubleSide}),blocker=new THREE.Mesh(blockerGeometry,blockerMaterial);
            blocker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),vector([0,0,1]));blocker.position.copy(vector([0,1.5,1]));blocker.castShadow=true;scene.add(blocker);owned.push(blockerGeometry,blockerMaterial);
            for(const angle of options.angles){
                const theta=angle*Math.PI/180;camera.position.copy(vector([0,-30*Math.sin(theta),30*Math.cos(theta)]));camera.lookAt(0,0,0);camera.updateProjectionMatrix();
                for(const mode of kind==='plane'?['sun','sky','combined','sun_shadow']:['combined']){
                    scene.environment=mode==='sky'||mode==='combined'?env.texture:null;sun.visible=mode!=='sky';blocker.visible=mode==='sun_shadow';
                    for(const lobe of ['combined','diffuse','specular']){
                        for(const o of objects){o.material.onBeforeCompile=shader=>{if(lobe!=='combined')shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`gl_FragColor=vec4(reflectedLight.${lobe==='diffuse'?'directDiffuse + reflectedLight.indirectDiffuse':'directSpecular + reflectedLight.indirectSpecular'},1.0);return;`);};o.material.customProgramCacheKey=()=>lobe;o.material.needsUpdate=true;}
                        r.setRenderTarget(target);r.setClearColor(0,0);r.clear();r.render(scene,camera);const pixels=new Float32Array(width*height*4);r.readRenderTargetPixels(target,0,0,width,height,pixels);
                        const record={id:kind+'_'+angle+'_'+mode+'_'+lobe,kind,angle,mode,lobe,width,height,raw:encode(pixels)};
                        records.push(window.__writeMaterialFixture?await window.__writeMaterialFixture(record):record);
                    }
                }
            }
            scene.remove(...objects,blocker);
        }
        return {records,threeRevision:THREE.REVISION,semantics:'Sun-only and sky-only rerenders separate sources. Diffuse/specular outputs sum corresponding direct and indirect Three.js lobes. Constant neutral sky radiance=1; directional irradiance=pi; incidence=35 degrees.'};
    }finally{r.setRenderTarget(null);for(const x of owned.reverse())x.dispose();r.toneMapping=previous.tone;r.outputColorSpace=previous.color;r.shadowMap.enabled=previous.shadow;r.shadowMap.type=previous.type;}
}
