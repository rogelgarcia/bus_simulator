// Runs in the game page, collecting real transforms, material state and bake status.
export async function readGameEvidence() {
    const THREE=await import('three');
    const {OBB}=await import('three/addons/math/OBB.js');
    const {engine:e,sm}=window.__busSim,s=sm.current,root=s.busAnchor;
    root.updateMatrixWorld(true);e.camera.updateMatrixWorld(true);
    const localBounds=new THREE.Box3(),worldBounds=new THREE.Box3(),projected=new THREE.Box3(),v=new THREE.Vector3();
    const inverse=root.matrixWorld.clone().invert(),materials=new Map();
    let vertexCount=0;
    root.traverseVisible(mesh=>{
        if(!mesh.isMesh||!mesh.geometry?.attributes.position||!mesh.layers.test(e.camera.layers))return;
        const visibleMaterials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).filter(m=>m.visible&&m.colorWrite);
        if(!visibleMaterials.length)return;
        const position=mesh.geometry.attributes.position;
        for(let i=0;i<position.count;i++) {
            v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
            worldBounds.expandByPoint(v);
            projected.expandByPoint(v.clone().project(e.camera));
            localBounds.expandByPoint(v.applyMatrix4(inverse));vertexCount++;
        }
        for(const m of visibleMaterials) materials.set(m.uuid,{
            name:m.name,type:m.type,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,
            opacity:m.opacity,transparent:m.transparent,environment:!!m.envMap,
            textures:Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap','alphaMap'].filter(k=>m[k]).map(k=>[k,{name:m[k].name,colorSpace:m[k].colorSpace}]))});
    });
    const busObb=new OBB().fromBox3(localBounds).applyMatrix4(root.matrixWorld);
    const intersections=[];
    const buildings=s.city.buildings.group.children.filter(building=>building.userData.staticVisibility);
    for(const building of buildings) {
        const bounds=new THREE.Box3().setFromObject(building);
        if(!bounds.isEmpty()&&busObb.intersectsOBB(new OBB().fromBox3(bounds)))intersections.push(building.name);
    }
    const d=e.getBakedLightingDebugInfo(),shadow=e._bakedLighting.shadows.getDiagnostics().status;
    const json=value=>JSON.parse(JSON.stringify(value, (key,v)=>key==='registries'?undefined:v));
    return {
        actualPose:s._captureGameplayPose(),busWorldMatrix:root.matrixWorld.toArray(),cameraWorldMatrix:e.camera.matrixWorld.toArray(),projectionMatrix:e.camera.projectionMatrix.toArray(),
        viewport:{width:e.canvas.width,height:e.canvas.height,pixelRatio:e.renderer.getPixelRatio(),fovConvention:'vertical'},
        placement:{vertexCount,localBounds:json(localBounds),worldBounds:json(worldBounds),projectedBounds:json(projected),
            completelyInFrame:projected.min.x>=-1&&projected.max.x<=1&&projected.min.y>=-1&&projected.max.y<=1&&projected.min.z>=-1&&projected.max.z<=1,
            roadClearance:worldBounds.min.y-(s.city.generatorConfig?.ground?.surfaceY??s.city.generatorConfig?.road?.surfaceY??0),
            buildingsChecked:buildings.length,buildingBoundsIntersections:intersections,collisionMethod:'Conservative visible bus OBB versus building world bounds; no physics simulation or ground snapping'},
        lighting:e.lightingSettings,atmosphere:e.atmosphereSettings,
        graphics:{shadows:e.shadowSettings,ao:e.ambientOcclusionSettings,aa:e.antiAliasingSettings,bloom:e.bloomSettings,
            sunBloom:e.sunBloomSettings,colorGrading:e.colorGradingSettings},
        baked:{status:d.status,settings:d.settings,receiverLightmaps:d.receiverLightmaps,busLighting:d.busLighting},shadow,
        sourceHashes:e._bakedLighting.receivers.source?.hashes??null,
        visibility:{status:s.city.getStaticVisibilityStatus?.(),diagnostics:s.city.getStaticVisibilityDiagnostics?.()},
        materials:[...materials.values()],savedSettings:Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('bus_sim.'))),
        renderer:{threeRevision:THREE.REVISION,outputColorSpace:e.renderer.outputColorSpace,toneMapping:e.renderer.toneMapping,
            exposure:e.renderer.toneMappingExposure,programs:e.renderer.info.programs.length,render:{...e.renderer.info.render}}
    };
}

export function setGamePose(pose) {
    const s=window.__busSim.sm.current;
    s._gameplayPose=pose;s._applyGameplayPoseVehicleTransform();s._configureGameplayPoseCamera();s._applyGameplayPoseSettings();
}

export async function settleGameFrames(count) {
    await new Promise(resolve=>{const frame=()=>{if(--count<=0)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
}
