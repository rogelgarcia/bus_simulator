// Loads real compressed assets and checks billboard facing, directional frames and two-triangle cluster cost.
import test,{expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const species=['london_plane','silver_linden','northern_red_oak','american_elm','arrowwood_viburnum'];
for(const kind of species)test(`Distant vegetation loads and faces the camera: ${kind}`,async({page})=>{
    test.setTimeout(180000);
    const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,2000));});
    await page.goto('/tests/headless/harness/index.html?ibl=0&bloom=0');
    const result=await page.evaluate(async species=>{
        const THREE=await import('three');
        const {loadDistantVegetation,disposeDistantVegetationDecoder}=await import('/src/graphics/engine3d/vegetation/DistantVegetationLoader.js');
        const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(320,320);
        const scene=new THREE.Scene();scene.background=new THREE.Color('#b5c7d0');scene.add(new THREE.HemisphereLight(0xffffff,0x777750,2));
        const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(20,30,10);scene.add(sun);
        const camera=new THREE.PerspectiveCamera(45,1,.1,1000);const rows=[];
        for(const level of [3,4,5,6])for(const index of [1,2,3]){
            const handle=await loadDistantVegetation({species,variant:`${level===6?'cluster':'mature'}_0${index}`,level,renderer});
            let sharedReleaseCheck=null;
            if(level===3&&index===1){
                const peer=await loadDistantVegetation({species,variant:'mature_03',level:4,renderer});
                const leafMaterial=root=>{let result;root.traverse(m=>{if(m.isMesh&&m.material.name.startsWith('Distant leaves'))result=m.material;});return result;};
                const a=leafMaterial(handle.root),b=leafMaterial(peer.root),maps=new Set();let released=0;
                for(const property of ['map','normalMap','roughnessMap']){
                    if(a[property]!==b[property])throw new Error('Mature forms and LODs did not reuse the same GPU leaf texture');
                    maps.add(a[property]);
                }
                for(const texture of maps)texture.addEventListener('dispose',()=>released++);
                peer.dispose();peer.dispose();
                if(released)throw new Error('Disposing one tree freed another tree’s shared canopy');
                sharedReleaseCheck=()=>{if(released!==maps.size)throw new Error('Last shared canopy user leaked textures');};
            }
            scene.add(handle.root);const record=handle.record;
            const center=new THREE.Vector3((record.bounds[0][0]+record.bounds[1][0])/2,(record.bounds[0][2]+record.bounds[1][2])/2,-(record.bounds[0][1]+record.bounds[1][1])/2);
            const distance=Math.max(...record.bounds[0].map((v,i)=>record.bounds[1][i]-v))*3;
            let count=0,compressed=true,facing=true,finite=true;const views=[];
            for(const angle of [0,Math.PI*.5,Math.PI,Math.PI*1.5]){
                camera.position.copy(center).add(new THREE.Vector3(Math.cos(angle)*distance,2.2-center.y,Math.sin(angle)*distance));camera.lookAt(center);camera.updateMatrixWorld();
                handle.update(camera);renderer.render(scene,camera);
                if(level>=5){
                    views.push(handle.root.userData.distantView.azimuthDegrees);
                    handle.root.traverse(mesh=>{if(!mesh.isMesh)return;const normal=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,0);
                        facing&&=normal.dot(camera.position.clone().sub(center).normalize())>.999;
                    });
                }
            }
            if(level>=5){
                camera.position.y=center.y-distance*.35;camera.lookAt(center);camera.updateMatrixWorld();handle.update(camera);
                const lower=handle.root.userData.distantView.elevationDegrees;
                camera.position.y=center.y+distance*.35;camera.lookAt(center);camera.updateMatrixWorld();handle.update(camera);renderer.render(scene,camera);
                if(handle.root.userData.distantView.elevationDegrees===lower)throw new Error('Hill view did not select the elevated capture');
                camera.position.y=2.2;camera.lookAt(center);camera.updateMatrixWorld();handle.update(camera);renderer.render(scene,camera);
            }
            handle.root.traverse(mesh=>{if(!mesh.isMesh)return;count+=mesh.geometry.index.count/3;
                for(const map of [mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap])compressed&&=map?.isCompressedTexture===true;
                finite&&=Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite);
            });
            const pixels=new Uint8Array(320*320*4),gl=renderer.getContext();gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let visiblePixels=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>30)visiblePixels++;
            rows.push({level,index,count,compressed,facing,finite,visiblePixels,viewCount:new Set(views).size,treeCount:record.treeCount,image:renderer.domElement.toDataURL('image/png')});
            scene.remove(handle.root);handle.dispose();
            if(sharedReleaseCheck)sharedReleaseCheck();
        }
        disposeDistantVegetationDecoder(renderer);renderer.dispose();return rows;
    },kind);
    const folder=path.resolve('tests/artifacts/screens/distant_lods/runtime');await fs.mkdir(folder,{recursive:true});
    for(const row of result){await fs.writeFile(path.join(folder,`${kind}_${row.index}_lod${row.level}.png`),Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
    await fs.writeFile(path.join(folder,kind+'.json'),JSON.stringify({rows:result,errors},null,2));
    expect(errors).toEqual([]);
    for(const row of result){expect(row.compressed).toBe(true);expect(row.finite).toBe(true);expect(row.facing).toBe(true);expect(row.visiblePixels,`LOD${row.level} mature ${row.index}`).toBeGreaterThan(100);
        if(row.level>=5){expect(row.count).toBe(2);expect(row.viewCount).toBe(4);}
        if(row.level===6)expect(row.treeCount).toBe(10);
        if(row.level===3)expect(row.count).toBeLessThanOrEqual(60);
        if(row.level===4)expect(row.count).toBeLessThanOrEqual(12);
    }
});
