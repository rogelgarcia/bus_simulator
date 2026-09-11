// Isolated daylight fixtures using GameEngine's renderer and a measured atmospheric environment.
import * as THREE from 'three';
import {FiniteSunShadow} from '../../../../src/graphics/lighting/FiniteSunShadow.js';

const normals={horizontal:[0,0,1],east:[1,0,0],north:[0,1,0]};
const convert=v=>new THREE.Vector3(v[0],v[2],-v[1]);
function encode(pixels){
    const bytes=new Uint8Array(pixels.buffer);let text='';
    for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(text);
}
export const scenarioDaylightCalibration={
    id:'daylight_calibration',
    async create({engine,options}){
        const {profile,mode,kind,exposure}=options;
        if(!profile||!['sun','sky','combined','legacy_hemi'].includes(mode)||!Object.hasOwn(normals,kind)&&!['spheres','shadow_near','shadow_far'].includes(kind))throw new Error('Invalid daylight fixture');
        engine.clearScene();const scene=engine.scene,renderer=engine.renderer,resources=[];
        const previous={tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,color:renderer.outputColorSpace,size:renderer.getSize(new THREE.Vector2()),shadows:renderer.shadowMap.enabled,shadowType:renderer.shadowMap.type};
        let finiteSun;
        try{
            const width=Object.hasOwn(normals,kind)?128:512;
            const response=await fetch(options.skyUrl);if(!response.ok)throw new Error('Missing measured sky');
            const data=new Float32Array(await response.arrayBuffer());
            if(data.length!==profile.skyWidth*profile.skyHeight*4)throw new Error('Sky dimensions mismatch');
            const texture=new THREE.DataTexture(data,profile.skyWidth,profile.skyHeight,THREE.RGBAFormat,THREE.FloatType);
            texture.colorSpace=THREE.LinearSRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;resources.push(texture);
            const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(texture);resources.push(env,pmrem);
            scene.environment=mode==='sky'||mode==='combined'?env.texture:null;scene.environmentIntensity=1;
            scene.background=mode==='sky'||mode==='combined'?texture:new THREE.Color(0,0,0);
            const color=rgb=>new THREE.Color().setRGB(...rgb,THREE.LinearSRGBColorSpace);
            const mat=(mirror=false)=>{const m=new THREE.MeshPhysicalMaterial({color:color(mirror?[.95,.95,.95]:[.18,.18,.18]),metalness:mirror?1:0,roughness:mirror?.04:1,specularIntensity:mirror?1:0});resources.push(m);return m;};
            const plane=(name,n=[0,0,1],size=4,pos=[0,0,0])=>{
                const geometry=new THREE.PlaneGeometry(size,size);resources.push(geometry);const obj=new THREE.Mesh(geometry,mat());obj.name=name;
                obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),convert(n));obj.position.copy(convert(pos));obj.receiveShadow=true;scene.add(obj);return obj;
            };
            const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);camera.up.set(0,1,0);
            const sun=new THREE.DirectionalLight(color(profile.sunNormalRgb),1);sun.position.copy(new THREE.Vector3(...profile.sunDirectionThree).multiplyScalar(12));
            if(mode==='sun'||mode==='combined')scene.add(sun,sun.target);
            if(mode==='legacy_hemi')scene.add(new THREE.HemisphereLight(0xffffff,color([.023153366,.043735029,.013702083]),1.22));
            if(Object.hasOwn(normals,kind)){
                plane('card',normals[kind]);camera.position.copy(convert(normals[kind]).multiplyScalar(3));
                if(kind==='horizontal')camera.up.set(0,0,-1);camera.lookAt(0,0,0);
            }else if(kind==='spheres'){
                plane('floor',[0,0,1],200);
                for(const [x,mirror] of [[-1,false],[1,true]]){
                    const g=new THREE.SphereGeometry(.7,64,32);resources.push(g);const o=new THREE.Mesh(g,mat(mirror));o.position.copy(convert([x,0,.7]));scene.add(o);
                }
                camera.left=-2.5;camera.right=2.5;camera.top=2.5;camera.bottom=-2.5;camera.position.copy(convert([0,-7,3]));camera.lookAt(convert([0,0,.7]));
            }else{
                const gap=kind==='shadow_near'?.2:2;const receiver=plane('receiver',[0,0,1],30);const blocker=plane('blocker',[0,0,1],4,[2,0,gap]);
                blocker.material.color.setRGB(0,0,0);blocker.material.side=THREE.DoubleSide;blocker.castShadow=true;
                const cx=-gap*profile.sunDirectionBlender[0]/profile.sunDirectionBlender[2],cy=-gap*profile.sunDirectionBlender[1]/profile.sunDirectionBlender[2];camera.position.set(cx,8,-cy);camera.up.set(0,0,-1);camera.lookAt(cx,0,-cy);
                camera.left=-.08;camera.right=.08;camera.top=.08;camera.bottom=-.08;
                renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.BasicShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
                Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:30});sun.shadow.bias=-.000001;
                finiteSun=new FiniteSunShadow({renderer,scene,light:sun,angularDiameter:THREE.MathUtils.degToRad(profile.angularDiameterDeg)});finiteSun.attach(receiver.material);finiteSun.update();resources.push(finiteSun,{dispose:()=>sun.shadow.dispose()});
            }
            camera.updateProjectionMatrix();renderer.setSize(width,width,false);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
            const target=new THREE.WebGLRenderTarget(width,width,{type:THREE.FloatType,format:THREE.RGBAFormat});resources.push(target);
            renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Float32Array(width*width*4);renderer.readRenderTargetPixels(target,0,0,width,width,pixels);renderer.setRenderTarget(null);
            renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.render(scene,camera);
            const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
            const metrics={id:profile.id+'_'+mode+'_'+kind,width,height:width,linearRgbaFloat32:encode(pixels),png:renderer.domElement.toDataURL('image/png'),gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',threeRevision:THREE.REVISION,reflectionPolicy:'Disc-free atmospheric PMREM + analytic direct-sun specular; background disc is absent in this isolated fixture.',counts:renderer.info.render.calls};
            return {update(){},getMetrics:()=>metrics,dispose(){}};
        }finally{
            renderer.setRenderTarget(null);scene.environment=null;scene.background=null;
            for(const resource of resources.reverse())resource.dispose();engine.clearScene();
            renderer.toneMapping=previous.tone;renderer.toneMappingExposure=previous.exposure;renderer.outputColorSpace=previous.color;renderer.shadowMap.enabled=previous.shadows;renderer.shadowMap.type=previous.shadowType;renderer.setSize(previous.size.x,previous.size.y,false);
        }
    }
};
