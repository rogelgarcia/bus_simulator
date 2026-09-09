// Captures isolated physical fixtures using the actual GameEngine WebGLRenderer.
import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {FiniteSunShadow} from '../../../../src/graphics/lighting/FiniteSunShadow.js';

function encodeFloat(pixels) {
    const bytes = new Uint8Array(pixels.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}

export const scenarioPhysicalLightingCalibration = {
    id: 'physical_lighting_calibration',
    async create({engine, options}) {
        const {fixture, width, orthoScale, vectors} = options;
        if (!Number.isInteger(width) || width < 64 || width > 1024 || (!fixture && !vectors)) throw new Error('Invalid calibration request');
        engine.clearScene();
        const renderer = engine.renderer;
        const previous = {tone:renderer.toneMapping, exposure:renderer.toneMappingExposure, color:renderer.outputColorSpace,
            size:renderer.getSize(new THREE.Vector2()), shadows:renderer.shadowMap.enabled, shadowType:renderer.shadowMap.type};
        const scene = engine.scene;
        scene.background = new THREE.Color(0,0,0);
        scene.environment = null;
        const camera = new THREE.OrthographicCamera(-orthoScale/2,orthoScale/2,orthoScale/2,-orthoScale/2,0.01,20);
        camera.position.set(0,0,4);
        camera.lookAt(0,0,0);
        const resources = [];
        let hdrDecode = null;
        let finiteSun = null;
        const color = values => new THREE.Color().setRGB(...values,THREE.LinearSRGBColorSpace);
        const plane = (material,w=4,h=4) => {
            const geometry = new THREE.PlaneGeometry(w,h);
            const mesh = new THREE.Mesh(geometry,material);
            resources.push(geometry,material);
            scene.add(mesh);
            return mesh;
        };
        if (vectors) {
            const header = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n');
            const bytes = new Uint8Array(header.length+4);
            bytes.set(header);bytes.set([128,64,32,131],header.length);
            hdrDecode = Array.from(new HDRLoader().setDataType(THREE.FloatType).parse(bytes.buffer).data.slice(0,3));
            vectors.forEach((rgb,i) => {
                const size = orthoScale/3;
                const mesh = plane(new THREE.MeshBasicMaterial({color:color(rgb)}),size,size);
                mesh.position.set((i%3-1)*size,(1-Math.floor(i/3))*size,0);
            });
        } else {
            const material = fixture.source === 'environment'
                ? new THREE.MeshPhysicalMaterial({color:color(fixture.color),roughness:1,metalness:0,specularIntensity:0})
                : new THREE.MeshLambertMaterial({color:color(fixture.color)});
            if (fixture.textureBytes) {
                const texture = new THREE.DataTexture(new Uint8Array([...fixture.textureBytes,255]),1,1);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                material.map = texture;
                resources.push(texture);
            }
            const receiver = plane(material);
            receiver.receiveShadow = true;
            if (fixture.source === 'environment') {
                const data = new Float32Array(256*128*4);
                for (let i=0;i<data.length;i+=4) data.set([fixture.radiance,fixture.radiance,fixture.radiance,1],i);
                const map = new THREE.DataTexture(data,256,128,THREE.RGBAFormat,THREE.FloatType);
                map.colorSpace = THREE.LinearSRGBColorSpace;
                map.mapping = THREE.EquirectangularReflectionMapping;
                map.needsUpdate = true;
                const pmrem = new THREE.PMREMGenerator(renderer);
                const target = pmrem.fromEquirectangular(map);
                scene.environment = target.texture;
                scene.environmentIntensity = 1;
                material.envMapIntensity = 1;
                resources.push(map,target,pmrem);
            } else if (fixture.source === 'point') {
                const light = new THREE.PointLight(0xffffff,fixture.intensity,0,2);
                light.position.set(0,0,fixture.height);
                scene.add(light);
            } else {
                const light = new THREE.DirectionalLight(0xffffff,fixture.irradiance);
                const a = THREE.MathUtils.degToRad(fixture.angleDeg ?? 0);
                light.position.copy(fixture.source === 'shadow' ? new THREE.Vector3(-0.5,0,1).normalize().multiplyScalar(5) : new THREE.Vector3(Math.sin(a),0,Math.cos(a)).multiplyScalar(5));
                scene.add(light,light.target);
                if (fixture.source === 'shadow') {
                    renderer.shadowMap.enabled = true;
                    light.castShadow = true;
                    light.shadow.mapSize.set(2048,2048);
                    Object.assign(light.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:0.1,far:12});
                    light.shadow.bias = -0.00001;
                    if (fixture.angularDiameter > 0) {
                        renderer.shadowMap.type = THREE.BasicShadowMap;
                        finiteSun = new FiniteSunShadow({renderer,scene,light,angularDiameter:fixture.angularDiameter});
                        finiteSun.attach(material);
                        resources.push(finiteSun);
                    }
                    const blocker = plane(new THREE.MeshLambertMaterial({color:0,side:THREE.DoubleSide}),3,6);
                    blocker.position.set(-1.5,0,fixture.occluderHeight);
                    blocker.castShadow = true;
                    resources.push({dispose:()=>light.shadow.dispose()});
                }
            }
        }
        renderer.setSize(width,width,false);
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        const target = new THREE.WebGLRenderTarget(width,width,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:true});
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
        renderer.setRenderTarget(target);
        renderer.render(scene,camera);
        const pixels = new Float32Array(width*width*4);
        renderer.readRenderTargetPixels(target,0,0,width,width,pixels);
        renderer.setRenderTarget(null);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.render(scene,camera);
        const png = renderer.domElement.toDataURL('image/png');
        const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        const metrics = {id:fixture?.id ?? 'display_vectors',width,height:width,linearRgbaFloat32:encodeFloat(pixels),png,
            threeRevision:THREE.REVISION,gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
            shaderToneSource:THREE.ShaderChunk.tonemapping_pars_fragment,hdrDecode,
            scope:'GameEngine renderer, native material/light/shadow/PMREM shaders; engine compositor, AO, baked city packages and grading deliberately isolated.',
            material:fixture?.source === 'environment'?'MeshPhysicalMaterial roughness=1, specularIntensity=0':'MeshLambertMaterial / MeshBasicMaterial vectors',
            finiteSunSupported:Boolean(finiteSun),shadowFilter:renderer.shadowMap.type,
            finiteSunFilter:finiteSun?{model:'directional-pcss-v1',angularDiameter:fixture.angularDiameter,blockerSamples:32,filterSamples:64}:null};
        target.dispose();
        return {getMetrics:()=>metrics,dispose(){scene.environment=null;resources.forEach(item=>item.dispose());renderer.setRenderTarget(null);renderer.toneMapping=previous.tone;renderer.toneMappingExposure=previous.exposure;renderer.outputColorSpace=previous.color;renderer.shadowMap.enabled=previous.shadows;renderer.shadowMap.type=previous.shadowType;renderer.setSize(previous.size.x,previous.size.y,false);}};
    }
};
