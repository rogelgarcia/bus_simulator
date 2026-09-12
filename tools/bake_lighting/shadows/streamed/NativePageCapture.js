// Offline native depth from a fresh complete city; no gameplay casters or culling.
import * as THREE from 'three';
import {captureNativeShadowDepthTexture} from '../../../static_sun_depth/browser/NativeShadowDepthTextureCapture.js';
import {resolveStaticSunDepthEffectiveShadowSide, resolveThreeR183ShadowAlphaTest} from '../../../static_sun_depth/src/ThreeShadowSide.mjs';
import {getAuthoredMaterialShadowSide} from '../../../../src/graphics/lighting/MaterialShadowSideState.js';

export function createNativeShadowPageCapture(renderer, city, descriptor, manifest) {
    const scene = new THREE.Scene(), materials = new Map(), clones = [];
    city.group.updateMatrixWorld(true);
    city.group.traverse(source => {
        if (!source.isMesh || !source.castShadow) return;
        for (let p = source; p; p = p.parent) if (!p.visible) return;
        if (source.isSkinnedMesh || source.isBatchedMesh || source.customDepthMaterial || source.customDistanceMaterial) throw new Error(`Unsupported detail caster ${source.name}`);
        const convert = source => {
            if (materials.has(source)) return materials.get(source);
            if (source.alphaHash || source.displacementMap || source.clippingPlanes?.length) throw new Error('Unsupported detail coverage');
            const cutout = source.alphaTest > 0 || source.alphaToCoverage;
            const material = new THREE.MeshBasicMaterial({color:0,colorWrite:false,blending:THREE.NoBlending,
                depthWrite:true,depthTest:true,side:resolveStaticSunDepthEffectiveShadowSide({
                    side:source.side,shadowSide:getAuthoredMaterialShadowSide(source),
                    preserveShadowSide:source.userData?.preserveShadowSide===true,isFoliage:source.userData?.isFoliage===true}),
                map:cutout?source.map:null,alphaMap:cutout?source.alphaMap:null,
                alphaTest:cutout?resolveThreeR183ShadowAlphaTest(source.alphaTest,source.alphaToCoverage):0,
                opacity:cutout?source.opacity:1,vertexColors:source.vertexColors,visible:source.visible,wireframe:source.wireframe,toneMapped:false});
            materials.set(source,material);return material;
        };
        const material = Array.isArray(source.material)?source.material.map(convert):convert(source.material);
        const clone = source.isInstancedMesh?new THREE.InstancedMesh(source.geometry,material,source.count):new THREE.Mesh(source.geometry,material);
        if (source.isInstancedMesh) {clone.instanceMatrix.copy(source.instanceMatrix);if(source.instanceColor)clone.instanceColor=source.instanceColor.clone();}
        if (source.morphTargetInfluences) clone.morphTargetInfluences=[...source.morphTargetInfluences];
        clone.matrixAutoUpdate=false;clone.matrix.copy(source.matrixWorld);clone.frustumCulled=true;scene.add(clone);clones.push(clone);
    });
    if (!clones.length) throw new Error('Empty static caster inventory');
    scene.updateMatrixWorld(true);
    const size=manifest.interiorTexels+manifest.guardTexels*2;
    const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true,stencilBuffer:false});
    target.depthTexture=new THREE.DepthTexture(size,size,THREE.UnsignedIntType);target.depthTexture.format=THREE.DepthFormat;
    const {basis,encoding}=descriptor.identity,span=encoding.maxDepthMeters-encoding.minDepthMeters;
    const half=size*manifest.texelSizeMeters/2;
    const camera=new THREE.OrthographicCamera(-half,half,half,-half,1,span+1);camera.matrixAutoUpdate=false;
    return {casterMeshes:clones.length,capture(id) {
        const edge=manifest.interiorTexels*manifest.texelSizeMeters;
        const x=manifest.origin[0]+(id%manifest.tileCount[0]+.5)*edge;
        const y=manifest.origin[1]+(Math.floor(id/manifest.tileCount[0])+.5)*edge;
        const {rightAxisWorld:r,upAxisWorld:u,depthAxisWorld:d,originWorld:origin}=basis;
        const position=origin.map((v,i)=>v+r[i]*x+u[i]*y+d[i]*(encoding.minDepthMeters-1));
        camera.matrix.set(-r[0],u[0],-d[0],position[0],-r[1],u[1],-d[1],position[1],-r[2],u[2],-d[2],position[2],0,0,0,1);
        camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
        const previous=renderer.getRenderTarget(),shadow=renderer.shadowMap.enabled,auto=renderer.autoClear;
        let capture;
        try {
            renderer.shadowMap.enabled=false;renderer.autoClear=true;renderer.setRenderTarget(target);
            renderer.clear(true,true,true);renderer.render(scene,camera);
            capture=captureNativeShadowDepthTexture({renderer,gl:renderer.getContext(),textureWidth:size,textureHeight:size,maximumTexels:size*size,
                depthTexture:renderer.properties.get(target.depthTexture).__webglTexture,framebuffer:renderer.properties.get(target).__webglFramebuffer});
        } finally {renderer.setRenderTarget(previous);renderer.shadowMap.enabled=shadow;renderer.autoClear=auto;}
        const raw=new Uint8Array(size*size*2);let occupied=0;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
            // Native camera-right is opposite to the cache right axis.
            const depth=capture.depthValues[y*size+size-1-x];
            const code=depth>=1?65535:Math.round(Math.max(0,depth)*65534);
            if(code!==65535)occupied++;
            const i=(y*size+x)*2;raw[i]=code>>8;raw[i+1]=code&255;
        }
        return {raw,occupied,proof:{method:capture.implementation,restoration:capture.stateRestoration}};
    },dispose(){target.dispose();for(const material of materials.values())material.dispose();scene.clear();}};
}
